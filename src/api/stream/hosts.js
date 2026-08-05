// src/api/stream/hosts.js — the one and only host allowlist.
// Do NOT widen these casually: they are a security boundary.

// Hosts the media proxy may fetch from (SSRF guard). Everything else → 400.
export function ALLOWED_MEDIA_HOSTS(hostname) {
  return hostname === 'proxy.zxcstream.xyz' ||
    hostname.endsWith('.zxcstream.xyz') ||
    hostname.endsWith('.workers.dev') ||
    hostname.endsWith('.devcorp.me');
}

// Hosts whose HLS the browser can load DIRECTLY (CORS is open — proven in the
// trial). Everything not here goes through the proxy.
export const DIRECT_PLAYABLE_HOSTS = new Set(['aapanel.devcorp.me']);
