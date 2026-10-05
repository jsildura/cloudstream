/**
 * Hardened CORS Proxy for Cloudflare Functions
 * 
 * Restricts fetching to verified music CDN domains with manual redirect handling,
 * response streaming with a 5MB size ceiling, and origin-scoped CORS.
 * Usage: /api/proxy?url=<encoded_url>
 */

export const ALLOWED_DOMAINS = new Set([
  'resources.tidal.com',
  'i.scdn.co'
]);

export const MAX_CONTENT_LENGTH = 5 * 1024 * 1024; // 5 MB

function getAllowedOrigins(request, env = {}) {
  const requestUrl = new URL(request.url);
  const ownOrigin = requestUrl.origin;
  const origins = new Set([ownOrigin]);

  if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1') {
    origins.add('http://localhost:5173');
    origins.add('http://localhost:4173');
    origins.add('http://127.0.0.1:5173');
    origins.add('http://127.0.0.1:4173');
    origins.add('http://localhost:8788');
    origins.add('http://127.0.0.1:8788');
  }

  const extraOrigins = env?.ALLOWED_ORIGIN || env?.APP_URL;
  if (extraOrigins) {
    extraOrigins.split(',').map((s) => s.trim()).filter(Boolean).forEach((o) => origins.add(o));
  }

  return { ownOrigin, origins };
}

function getRequestOrigin(request) {
  if (!request?.headers) return null;
  if (typeof request.headers.get === 'function') {
    return request.headers.get('origin') || request.headers.get('Origin');
  }
  if (typeof request.headers === 'object') {
    return request.headers.origin || request.headers.Origin;
  }
  return null;
}

function getCorsHeaders(request, env = {}, contentType = 'application/json') {
  const { ownOrigin, origins } = getAllowedOrigins(request, env);
  const requestOrigin = getRequestOrigin(request);

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
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=86400'
    },
    isOriginAllowed
  };
}

function createSizeLimitStream(maxBytes) {
  let bytes = 0;
  return new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        controller.error(new Error('Payload too large'));
      } else {
        controller.enqueue(chunk);
      }
    }
  });
}

function sanitizeContentType(upstreamType) {
  if (!upstreamType) return 'application/octet-stream';
  const lower = upstreamType.toLowerCase();
  // Prevent origin laundering / HTML injection
  if (lower.includes('text/html') || lower.includes('text/xml') || lower.includes('application/xhtml+xml')) {
    return 'application/octet-stream';
  }
  return upstreamType;
}

export async function onRequest(context) {
  const { request, env = {} } = context;
  const url = new URL(request.url);
  const method = request.method;
  const { headers: preflightHeaders, isOriginAllowed } = getCorsHeaders(request, env, 'application/json');

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    if (!isOriginAllowed) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: preflightHeaders
      });
    }
    return new Response(null, {
      status: 204,
      headers: preflightHeaders
    });
  }

  // Reject untrusted cross-origin requests
  if (!isOriginAllowed) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: preflightHeaders
    });
  }

  // Only allow GET requests
  if (method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: preflightHeaders
    });
  }

  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: preflightHeaders
    });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid url parameter' }), {
      status: 400,
      headers: preflightHeaders
    });
  }

  // Enforce HTTPS
  if (parsedUrl.protocol !== 'https:') {
    return new Response(JSON.stringify({ error: 'Only HTTPS URLs are allowed' }), {
      status: 400,
      headers: preflightHeaders
    });
  }

  // Enforce domain allowlist (Point b: Open relay and quota abuse)
  if (!ALLOWED_DOMAINS.has(parsedUrl.hostname.toLowerCase())) {
    return new Response(JSON.stringify({ error: 'Domain not allowed' }), {
      status: 403,
      headers: preflightHeaders
    });
  }

  try {
    // Set redirect: 'manual' to prevent redirect laundering / bypass
    const response = await fetch(targetUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8'
      }
    });

    // Check for redirects (3xx)
    if (response.status >= 300 && response.status < 400) {
      return new Response(JSON.stringify({ error: 'Upstream redirect not permitted' }), {
        status: 502,
        headers: preflightHeaders
      });
    }

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Upstream error: ${response.status}` }), {
        status: response.status,
        headers: preflightHeaders
      });
    }

    // Check Content-Length ceiling (Point c: Memory exhaustion)
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_CONTENT_LENGTH) {
      return new Response(JSON.stringify({ error: 'Response exceeds maximum allowed size (5MB)' }), {
        status: 413,
        headers: preflightHeaders
      });
    }

    const contentType = sanitizeContentType(response.headers.get('Content-Type'));
    const { headers: responseHeaders } = getCorsHeaders(request, env, contentType);

    // Stream body with size limit guard
    let body = response.body;
    if (body) {
      body = body.pipeThrough(createSizeLimitStream(MAX_CONTENT_LENGTH));
    }

    return new Response(body, {
      status: 200,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(JSON.stringify({ error: 'Proxy failed: ' + error.message }), {
      status: 500,
      headers: preflightHeaders
    });
  }
}
