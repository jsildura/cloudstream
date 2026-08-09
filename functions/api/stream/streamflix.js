import { resolveStream, isSourceAlive } from '../../../src/api/stream/zxcstream.js';
import { routeSources } from '../../../src/api/stream/routing.js';

// Best-effort resolve cache: repeat plays of the same title re-serve the last
// result instead of re-hitting zxcstream's backend (fewer traces, faster load).
// Successes live 1 hour BUT the CDN tokens inside source URLs expire in
// minutes, so a cached success is re-verified (isSourceAlive) before serving —
// dead cached links are re-resolved fresh instead of failing in the player
// (the "direct play missing a title the iframe plays" bug). Failures live
// 5 min so dead probes (e.g. S0 specials) don't hammer all upstream servers on
// every attempt.
const CACHE_TTL_MS = 60 * 60 * 1000;
const FAIL_TTL_MS = 5 * 60 * 1000;

function cacheKey(meta) {
  return `https://streamflix.internal/resolve/${meta.tmdbId}/${meta.mediaType}/${meta.season ?? 0}/${meta.episode ?? 0}`;
}

async function cacheGet(key) {
  try {
    const cached = await caches.default.match(key);
    if (!cached) return null;
    const payload = await cached.json();
    if (!payload || Date.now() - payload.cachedAt > payload.ttl) return null;
    return payload.data;
  } catch {
    return null;
  }
}

async function cachePut(key, data, ttlMs) {
  try {
    await caches.default.put(
      key,
      new Response(JSON.stringify({ data, cachedAt: Date.now(), ttl: ttlMs }), {
        // NOT no-store: Cloudflare's Cache API silently rejects cache.put()
        // (413) when the response instructs not to cache, which made the whole
        // resolve cache a silent no-op in production. Our own cachedAt/ttl
        // check enforces freshness, so a cacheable header is safe here.
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' },
      })
    );
  } catch {
    // caching is best-effort
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

// Handle POST requests
export async function onRequestPost(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  try {
    const meta = await context.request.json();
    if (!meta.tmdbId || !['movie', 'tv'].includes(meta.mediaType)) {
      return Response.json({ success: false, reason: 'bad_request' }, { status: 400, headers: cors });
    }

    const key = cacheKey(meta);
    const hit = await cacheGet(key);
    if (hit) {
      // Success cache: only serve while the top source still answers — a stale
      // data token makes every cached URL dead (403/427) even though the
      // resolve itself succeeded. Failures have no URLs, so serve those as-is.
      if (!hit.success || !hit.sources?.[0]?.url || await isSourceAlive(hit.sources[0].url)) {
        return Response.json(hit, { headers: cors });
      }
      // else: cached sources are dead — fall through to a fresh resolve.
    }

    const result = await resolveStream(meta, context.env.ZXC_STREAM_SECRET);
    const body = routeSources(result);
    await cachePut(key, body, result.success ? CACHE_TTL_MS : FAIL_TTL_MS);
    return Response.json(body, { headers: cors });
  } catch {
    return Response.json({ success: false, reason: 'exception' }, { status: 500, headers: cors });
  }
}
