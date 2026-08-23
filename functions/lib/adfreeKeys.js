/**
 * Ad-Free Key normalization, generation, and HMAC hashing
 */

// Crockford Base32-inspired alphabet (32 chars) avoiding ambiguous I, L, O, 0
const KEY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const KEY_REGEX = /^SFXAD-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;

/**
 * Normalizes and validates a raw key
 * Accepts case-insensitive, trims extra spaces.
 * Returns standard uppercase 'SFXAD-XXXXX-XXXXX-XXXXX' or throws.
 */
export function normalizeRawKey(value) {
  if (typeof value !== 'string') {
    throw new Error('Key must be a string');
  }

  const trimmed = value.trim().toUpperCase();
  if (trimmed.length > 50) {
    throw new Error('Key exceeds maximum length');
  }

  if (!KEY_REGEX.test(trimmed)) {
    throw new Error('Invalid key format. Expected SFXAD-XXXXX-XXXXX-XXXXX');
  }

  return trimmed;
}

/**
 * Generates a cryptographically random raw key
 */
export function generateRawKey(randomSource = crypto) {
  const randomBytes = new Uint8Array(15);
  randomSource.getRandomValues(randomBytes);

  let keyChars = '';
  for (let i = 0; i < 15; i++) {
    const idx = randomBytes[i] % KEY_ALPHABET.length;
    keyChars += KEY_ALPHABET[idx];
  }

  const p1 = keyChars.slice(0, 5);
  const p2 = keyChars.slice(5, 10);
  const p3 = keyChars.slice(10, 15);

  return `SFXAD-${p1}-${p2}-${p3}`;
}

/**
 * Computes the HMAC-SHA256 hash of a normalized key using Web Crypto SubtleCrypto
 */
export async function computeKeyHash(rawKey, hmacSecret) {
  if (!hmacSecret || typeof hmacSecret !== 'string') {
    throw new Error('HMAC secret is required');
  }

  const normalized = normalizeRawKey(rawKey);
  const encoder = new TextEncoder();
  const keyData = encoder.encode(hmacSecret);
  const messageData = encoder.encode(normalized);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
