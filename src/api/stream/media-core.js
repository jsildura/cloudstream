// src/api/stream/media-core.js — THE media proxy (server-side only).
// Used by BOTH the Vite dev middleware and the Cloudflare Pages function.
// Hardened with exact-host SSRF protection, manual redirect validation,
// capped playlist memory consumption, and origin-scoped CORS.

import { ALLOWED_MEDIA_HOSTS, verifyMediaToken, signMediaToken } from './hosts.js';

// Present ourselves to the CDN as zxcstream's own player.
const MEDIA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Origin': 'https://player.zxcstream.xyz',
  'Referer': 'https://player.zxcstream.xyz/',
  'Accept': '*/*',
};

export const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024; // 2 MB manifest memory ceiling
export const MAX_REDIRECTS = 3;

// Resolve an absolute URL, or a relative one against a base.
export const toAbs = (u, base) => {
  try {
    return new URL(u, base || u).toString();
  } catch {
    return null;
  }
};

export const isPlaylist = (url, ct) =>
  /\.m3u8(\?|$)/i.test(url) || /mpegurl|vnd\.apple/i.test(ct || '');

/**
 * Sanitize upstream content-type to prevent origin laundering / XSS injection.
 */
export function sanitizeMediaContentType(upstreamType) {
  if (!upstreamType) return 'application/octet-stream';
  const lower = upstreamType.toLowerCase();
  if (
    lower.includes('text/html') ||
    lower.includes('text/xml') ||
    lower.includes('application/xhtml+xml') ||
    lower.includes('application/javascript')
  ) {
    return 'application/octet-stream';
  }
  return upstreamType;
}

/**
 * Origin-scoped CORS helper for the media proxy.
 */
export function getMediaCors(request = null, env = {}) {
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
      // ignore parsing errors
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
      'Access-Control-Allow-Headers': 'Content-Type, Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store', // media streaming tokens expire quickly — never cache
    },
    isOriginAllowed,
    requestOrigin,
    ownOrigin,
  };
}

/**
 * Safely read upstream text with memory boundary enforcement.
 */
export async function readBoundedText(response, maxBytes = MAX_PLAYLIST_BYTES) {
  const clHeader = response.headers?.get?.('content-length');
  if (clHeader) {
    const cl = Number(clHeader);
    if (Number.isFinite(cl) && cl > maxBytes) {
      throw new Error('payload_too_large');
    }
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    if (typeof response.text === 'function') {
      const txt = await response.text();
      if (new TextEncoder().encode(txt).length > maxBytes) {
        throw new Error('payload_too_large');
      }
      return txt;
    }
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error('payload_too_large');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (err) {
    if (err.message === 'payload_too_large') {
      throw err;
    }
    throw new Error('stream_read_error: ' + (err.message || String(err)));
  }
}

/**
 * Rewrite every URI line in an HLS playlist so hls.js fetches variants +
 * segments from us. When signOpts is provided, child segment URLs are signed.
 */
export async function rewritePlaylist(text, baseUrl, signOpts = null) {
  const lines = text.split(/\r?\n/);
  const rewrittenLines = await Promise.all(
    lines.map(async (line) => {
      if (!line || line.startsWith('#')) return line;
      const abs = toAbs(line, baseUrl);
      if (!abs) return line;
      let targetParam = `/api/stream/media?u=${encodeURIComponent(abs)}`;
      if (signOpts?.secret && signOpts?.exp) {
        try {
          const remainingTtl = Math.max(60 * 1000, Number(signOpts.exp) - Date.now());
          const { exp, sig } = await signMediaToken(abs, signOpts.secret, remainingTtl);
          targetParam += `&exp=${encodeURIComponent(exp)}&sig=${encodeURIComponent(sig)}`;
        } catch {
          // fallback without signing
        }
      }
      return targetParam;
    })
  );
  return rewrittenLines.join('\n');
}

/**
 * Fetch one media URL (or playlists/variants/segments of it) and return a Response.
 *
 * @param {string} url - Target URL to fetch
 * @param {string} [range=''] - Range header for video seeking
 * @param {Object} [options={}] - Request context, env, and auth options
 * @returns {Promise<Response>}
 */
export async function handleMediaRequest(url, range = '', options = {}) {
  const request = options.request || null;
  const env = options.env || {};
  const method = (options.method || request?.method || 'GET').toUpperCase();

  const { headers: corsHeaders, isOriginAllowed } = getMediaCors(request, env);
  if (!isOriginAllowed) {
    return new Response('Forbidden origin', { status: 403, headers: corsHeaders });
  }

  const target = toAbs(url, '');
  if (!target) {
    return new Response('bad url', { status: 400, headers: corsHeaders });
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(target);
  } catch {
    return new Response('bad url', { status: 400, headers: corsHeaders });
  }

  if (parsedTarget.protocol !== 'https:') {
    return new Response('only https protocol allowed', { status: 400, headers: corsHeaders });
  }

  // Check query params for token if not explicitly provided in options
  let exp = options.exp;
  let sig = options.sig;
  if ((!exp || !sig) && request?.url) {
    try {
      const reqUrl = new URL(request.url);
      exp = exp || reqUrl.searchParams.get('exp');
      sig = sig || reqUrl.searchParams.get('sig');
    } catch {
      // ignore
    }
  }
  const secret = options.secret || env.ZXC_STREAM_SECRET || '';

  // Host verification: exact allowlist or valid signed HMAC token
  const isHostAllowed = ALLOWED_MEDIA_HOSTS(parsedTarget.hostname);
  let isTokenValid = false;
  if (!isHostAllowed && exp && sig && secret) {
    isTokenValid = await verifyMediaToken(target, exp, sig, secret);
  }

  if (!isHostAllowed && !isTokenValid) {
    return new Response('host not allowed', { status: 403, headers: corsHeaders });
  }

  // Upstream fetch with manual redirect loop and allowlist re-check
  let currentTarget = target;
  let upstream;
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    try {
      upstream = await fetch(currentTarget, {
        method,
        headers: { ...MEDIA_HEADERS, ...(range ? { Range: range } : {}) },
        redirect: 'manual',
      });
    } catch {
      return new Response('upstream error', { status: 502, headers: corsHeaders });
    }

    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      const location = upstream.headers.get('location');
      if (!location) {
        return new Response('upstream redirect missing location', { status: 502, headers: corsHeaders });
      }

      const nextTarget = toAbs(location, currentTarget);
      if (!nextTarget) {
        return new Response('bad redirect url', { status: 502, headers: corsHeaders });
      }

      let nextParsed;
      try {
        nextParsed = new URL(nextTarget);
      } catch {
        return new Response('bad redirect url', { status: 502, headers: corsHeaders });
      }

      if (nextParsed.protocol !== 'https:') {
        return new Response('redirect to non-https forbidden', { status: 400, headers: corsHeaders });
      }

      const nextAllowed =
        ALLOWED_MEDIA_HOSTS(nextParsed.hostname) ||
        (exp && sig && secret && (await verifyMediaToken(nextTarget, exp, sig, secret)));

      if (!nextAllowed) {
        return new Response('redirected host not allowed', { status: 403, headers: corsHeaders });
      }

      currentTarget = nextTarget;
      redirectCount++;
      continue;
    }
    break;
  }

  if (redirectCount > MAX_REDIRECTS) {
    return new Response('too many redirects', { status: 502, headers: corsHeaders });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`upstream ${upstream.status}`, {
      status: upstream.status,
      headers: corsHeaders,
    });
  }

  const ct = upstream.headers.get('content-type') || '';

  // Playlist: read bounded text, rewrite URIs, serve a fresh manifest.
  if (isPlaylist(currentTarget, ct)) {
    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.apple.mpegurl',
        },
      });
    }

    let rawText;
    try {
      rawText = await readBoundedText(upstream, MAX_PLAYLIST_BYTES);
    } catch (err) {
      if (err.message === 'payload_too_large') {
        return new Response('playlist too large', { status: 413, headers: corsHeaders });
      }
      return new Response('failed to read playlist', { status: 502, headers: corsHeaders });
    }

    const signOpts = exp && secret ? { exp, sig, secret } : null;
    const out = await rewritePlaylist(rawText, currentTarget, signOpts);
    const playlistHeaders = {
      ...corsHeaders,
      'Content-Type': 'application/vnd.apple.mpegurl',
    };
    return new Response(out, { status: 200, headers: playlistHeaders });
  }

  // Binary segment / mp4: stream through with Range support (enables seeking).
  const streamHeaders = {
    ...corsHeaders,
    'Accept-Ranges': 'bytes',
    'Content-Type': sanitizeMediaContentType(ct),
  };
  const cr = upstream.headers.get('content-range');
  const cl = upstream.headers.get('content-length');
  if (cr) streamHeaders['Content-Range'] = cr;
  if (cl) streamHeaders['Content-Length'] = cl;

  if (method === 'HEAD') {
    return new Response(null, {
      status: upstream.status === 206 ? 206 : 200,
      headers: streamHeaders,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers: streamHeaders,
  });
}
