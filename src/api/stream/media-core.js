// src/api/stream/media-core.js — THE media proxy (server-side only).
// Used by BOTH the Vite dev middleware and the Cloudflare Pages function.
// If you fix a bug here, both environments get it for free.
import { ALLOWED_MEDIA_HOSTS } from './hosts.js';

// Present ourselves to the CDN as zxcstream's own player.
const MEDIA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Origin': 'https://player.zxcstream.xyz',
  'Referer': 'https://player.zxcstream.xyz/',
  'Accept': '*/*',
};

// Resolve an absolute URL, or a relative one against a base.
const toAbs = (u, base) => { try { return new URL(u, base || u).toString(); } catch { return null; } };

const isPlaylist = (url, ct) => /\.m3u8(\?|$)/i.test(url) || /mpegurl|vnd\.apple/i.test(ct || '');

// Rewrite every URI line in an HLS playlist so hls.js fetches variants +
// segments from us, never the CDN. (Relative segments resolve against the
// playlist's own URL first, so they keep working.)
function rewritePlaylist(text, baseUrl) {
  return text.split(/\r?\n/).map((line) => {
    if (!line || line.startsWith('#')) return line;
    const abs = toAbs(line, baseUrl);
    return abs ? `/api/stream/media?u=${encodeURIComponent(abs)}` : line;
  }).join('\n');
}

// Fetch one media URL (or playlists/variants/segments of it) and return a
// Response. 400 = not an allowed host, 502 = upstream unreachable.
export async function handleMediaRequest(url, range = '') {
  const target = toAbs(url, '');
  if (!target || !ALLOWED_MEDIA_HOSTS(new URL(target).hostname)) {
    return new Response('bad url', { status: 400 });
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      headers: { ...MEDIA_HEADERS, ...(range ? { Range: range } : {}) },
    });
  } catch {
    return new Response('upstream error', { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`upstream ${upstream.status}`, { status: upstream.status });
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',   // tokens expire quickly — never cache
  };
  const ct = upstream.headers.get('content-type') || '';

  // Playlist: read text, rewrite URIs, serve a fresh manifest.
  if (isPlaylist(target, ct)) {
    const out = rewritePlaylist(await upstream.text(), target);
    headers['Content-Type'] = 'application/vnd.apple.mpegurl';
    return new Response(out, { status: 200, headers });
  }

  // Binary segment / mp4: stream through with Range support (enables seeking).
  headers['Accept-Ranges'] = 'bytes';
  headers['Content-Type'] = ct || 'application/octet-stream';
  const cr = upstream.headers.get('content-range');
  const cl = upstream.headers.get('content-length');
  if (cr) headers['Content-Range'] = cr;
  if (cl) headers['Content-Length'] = cl;
  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
