/**
 * Hardened TMDB API Gateway for Cloudflare Pages Functions
 * 
 * 1. Origin-scoped CORS: rejects untrusted cross-origin browser callers.
 * 2. Method restriction: allows only GET and HEAD (and OPTIONS preflight).
 * 3. Path allowlist: restricts forwarding to known TMDB endpoints used by Streamflix.
 * 4. Edge & browser caching: caches successful responses using caches.default and s-maxage.
 */

export const ALLOWED_TMDB_PREFIXES = [
  'movie/',
  'tv/',
  'trending/',
  'discover/',
  'search/',
  'genre/',
  'person/',
  'collection/',
  'configuration',
];

/**
 * Check if the requested TMDB path matches the allowed endpoint prefixes.
 *
 * @param {string} path - Cleaned path (e.g. "movie/550" or "search/multi")
 * @returns {boolean}
 */
export function isAllowedTmdbPath(path) {
  if (!path || typeof path !== 'string') return false;
  const normalized = path.replace(/^\/+/, '');
  if (normalized.includes('..')) return false;

  return ALLOWED_TMDB_PREFIXES.some((prefix) =>
    prefix.endsWith('/')
      ? normalized.startsWith(prefix)
      : normalized === prefix || normalized.startsWith(prefix + '/')
  );
}

/**
 * Compute scoped CORS headers based on request and environment origins.
 */
export function getTmdbCors(request = null, env = {}) {
  let ownOrigin = 'https://streamflix.me';
  const origins = new Set();

  if (request?.url) {
    try {
      const u = new URL(request.url);
      ownOrigin = u.origin;
      origins.add(ownOrigin);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        origins.add('http://localhost:5173');
        origins.add('http://localhost:4173');
        origins.add('http://127.0.0.1:5173');
        origins.add('http://127.0.0.1:4173');
        origins.add('http://localhost:8788');
        origins.add('http://127.0.0.1:8788');
      }
    } catch {
      // ignore
    }
  }

  const extraOrigins = env?.ALLOWED_ORIGIN || env?.APP_URL;
  if (extraOrigins) {
    extraOrigins
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((o) => origins.add(o));
  }

  let requestOrigin = null;
  if (request?.headers) {
    if (typeof request.headers.get === 'function') {
      requestOrigin = request.headers.get('origin') || request.headers.get('Origin');
    } else if (typeof request.headers === 'object') {
      requestOrigin = request.headers.origin || request.headers.Origin;
    }
  }

  let allowOrigin = ownOrigin;
  let isOriginAllowed = true;

  if (requestOrigin) {
    if (origins.has(requestOrigin)) {
      allowOrigin = requestOrigin;
    } else {
      isOriginAllowed = false;
      allowOrigin = ownOrigin;
    }
  }

  return {
    headers: {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
    },
    isOriginAllowed,
    requestOrigin,
    ownOrigin,
  };
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const method = (context.request.method || 'GET').toUpperCase();
  const path = url.pathname.replace(/^\/api\/?/, '');

  // Skip routes with dedicated handlers if hit directly
  if (
    path === 'visit' || path.startsWith('visit/') ||
    path === 'proxy' || path.startsWith('proxy/') ||
    path === 'stream' || path.startsWith('stream/') ||
    path === 'purchase-adfree' || path.startsWith('purchase-adfree/') ||
    path === 'create-adfree-order' || path.startsWith('create-adfree-order/') ||
    path === 'redeem-key' || path.startsWith('redeem-key/') ||
    path === 'generate-adfree-keys' || path.startsWith('generate-adfree-keys/')
  ) {
    return context.next ? context.next() : new Response('Not found', { status: 404 });
  }

  const { headers: corsHeaders, isOriginAllowed } = getTmdbCors(context.request, context.env);

  // 1. Handle CORS preflight
  if (method === 'OPTIONS') {
    if (!isOriginAllowed) {
      return new Response('Forbidden origin', { status: 403, headers: corsHeaders });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 2. Reject untrusted cross-origin requests
  if (!isOriginAllowed) {
    return new Response(
      JSON.stringify({
        success: false,
        status_code: 403,
        status_message: 'Forbidden origin: unauthorized cross-origin request',
      }),
      {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  // 3. Restrict HTTP method: only GET and HEAD allowed
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response(
      JSON.stringify({
        success: false,
        status_code: 405,
        status_message: `Method ${method} not allowed. Only GET is permitted.`,
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Allow': 'GET, HEAD, OPTIONS',
        },
      }
    );
  }

  // 4. Restrict path: must match allowed TMDB prefixes
  if (!isAllowedTmdbPath(path)) {
    return new Response(
      JSON.stringify({
        success: false,
        status_code: 403,
        status_message: `Path '/${path}' is not in the allowed TMDB API endpoints`,
      }),
      {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  // 5. Check Cloudflare Edge Cache for GET requests
  let cache = null;
  let cacheKey = null;
  try {
    if (typeof caches !== 'undefined' && caches.default && method === 'GET') {
      cache = caches.default;
      cacheKey = new Request(url.toString(), { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) {
        const cachedBody = await cached.text();
        return new Response(cachedBody, {
          status: cached.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600, s-maxage=14400, stale-while-revalidate=86400',
            'X-Cache': 'HIT',
          },
        });
      }
    }
  } catch {
    // Edge cache lookup is best-effort
  }

  try {
    const queryString = url.search;
    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
    const TMDB_ACCESS_TOKEN =
      context.env?.VITE_TMDB_READ_ACCESS_TOKEN || context.env?.TMDB_READ_ACCESS_TOKEN;

    if (!TMDB_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({
          success: false,
          status_code: 401,
          status_message: 'TMDB Access Token not configured in environment variables',
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const fullURL = `${TMDB_BASE_URL}/${path}${queryString}`;

    const response = await fetch(fullURL, {
      method,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        success: false,
        status_code: response.status,
        status_message: response.statusText,
      }));
      return new Response(JSON.stringify(errorData), {
        status: response.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600, s-maxage=14400, stale-while-revalidate=86400',
        },
      });
    }

    const data = await response.json();
    const dataString = JSON.stringify(data);

    const responseHeaders = {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=14400, stale-while-revalidate=86400',
      'X-Cache': 'MISS',
    };

    if (cache && cacheKey) {
      try {
        const cacheResponse = new Response(dataString, {
          status: 200,
          headers: responseHeaders,
        });
        if (context.waitUntil) {
          context.waitUntil(cache.put(cacheKey, cacheResponse));
        } else {
          await cache.put(cacheKey, cacheResponse);
        }
      } catch {
        // Cache write is best effort
      }
    }

    return new Response(dataString, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        status_code: 500,
        status_message: 'Internal server error: ' + error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
}