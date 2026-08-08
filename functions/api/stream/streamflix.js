import { resolveStream } from '../../../src/api/stream/zxcstream.js';
import { routeSources } from '../../../src/api/stream/routing.js';

// Best-effort resolve cache: repeat plays of the same title re-serve the last
// result instead of re-hitting zxcstream's backend (fewer traces, faster load).
// Successes live 1 hour — sources rarely change that often, and the longer TTL
// cuts repeat upstream hits (and detection surface) for back-and-forth
// watchers; failures 5 min so dead probes (e.g. S0 specials) don't hammer all
// upstream servers on every attempt.
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
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
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
      return Response.json(hit, { headers: cors });
    }

    const result = await resolveStream(meta, context.env.ZXC_STREAM_SECRET);
    const body = routeSources(result);
    await cachePut(key, body, result.success ? CACHE_TTL_MS : FAIL_TTL_MS);
    return Response.json(body, { headers: cors });
  } catch {
    return Response.json({ success: false, reason: 'exception' }, { status: 500, headers: cors });
  }
}
