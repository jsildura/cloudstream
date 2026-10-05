// src/api/stream/hosts.js — the one and only host allowlist.
// Do NOT widen these casually: they are a security boundary.

// Exact allowlist of hosts the media proxy may fetch from (SSRF guard).
// Wildcard *.workers.dev and *.devcorp.me are strictly removed.
export const ALLOWED_MEDIA_HOST_SET = new Set([
  'proxy.zxcstream.xyz',
  'player.zxcstream.xyz',
  'aapanel.devcorp.me',
  's1.devcorp.me',
]);

// Hosts the media proxy may fetch from (SSRF guard). Everything else requires a valid signed token or returns 403.
export function ALLOWED_MEDIA_HOSTS(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  const h = hostname.toLowerCase();
  if (ALLOWED_MEDIA_HOST_SET.has(h)) return true;

  // Single-level subdomains of zxcstream.xyz (the primary upstream streaming provider)
  if (h.endsWith('.zxcstream.xyz')) {
    const parts = h.split('.');
    if (parts.length === 3 && parts[1] === 'zxcstream' && parts[2] === 'xyz') {
      return true;
    }
  }
  return false;
}

// Hosts whose HLS the browser can load DIRECTLY (CORS is open — proven in the
// trial). Everything not here goes through the proxy.
export const DIRECT_PLAYABLE_HOSTS = new Set(['aapanel.devcorp.me']);

/**
 * Sign a media URL with HMAC-SHA256 for rotating or unlisted hosts.
 *
 * @param {string} url - Target URL to sign
 * @param {string} secret - Shared secret key
 * @param {number} [ttlMs=14400000] - Validity duration (default: 4 hours)
 * @returns {Promise<{ exp: number, sig: string }>}
 */
export async function signMediaToken(url, secret, ttlMs = 4 * 60 * 60 * 1000) {
  if (!url || !secret) throw new Error('url and secret are required to sign');
  const exp = Date.now() + ttlMs;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = new TextEncoder().encode(`${url}:${exp}`);
  const sigBuf = await crypto.subtle.sign('HMAC', key, data);
  const sig = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { exp, sig };
}

/**
 * Verify a media URL HMAC-SHA256 token.
 *
 * @param {string} url - Target URL to verify
 * @param {string|number} exp - Expiration timestamp
 * @param {string} sig - Hex-encoded HMAC signature
 * @param {string} secret - Shared secret key
 * @returns {Promise<boolean>}
 */
export async function verifyMediaToken(url, exp, sig, secret) {
  if (!url || !exp || !sig || !secret) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || Date.now() > expNum) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const data = new TextEncoder().encode(`${url}:${expNum}`);
    const sigBytes = new Uint8Array(sig.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
    if (sigBytes.length !== 32) return false;
    return await crypto.subtle.verify('HMAC', key, sigBytes, data);
  } catch {
    return false;
  }
}
