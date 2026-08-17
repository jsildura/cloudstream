/**
 * Streamflix Profile Model & PIN Hashing
 * 
 * Provides pure validation, normalization, and cryptographic PIN utilities
 * for Google-authenticated user profiles.
 */

export const ALLOWED_AVATARS = Object.freeze([
  'avatar_01',
  'avatar_02',
  'avatar_03',
  'avatar_04',
  'avatar_05',
  'avatar_06',
  'avatar_07',
  'avatar_08',
  'avatar_09',
  'avatar_10',
  'avatar_11',
  'avatar_12'
]);

export const KIDS_AVATARS = Object.freeze(['avatar_09', 'avatar_10', 'avatar_11', 'avatar_12']);
export const ADULT_AVATARS = Object.freeze([
  'avatar_01',
  'avatar_02',
  'avatar_03',
  'avatar_04',
  'avatar_05',
  'avatar_06',
  'avatar_07',
  'avatar_08'
]);

export const DEFAULT_KIDS_AVATAR = 'avatar_09';
export const DEFAULT_ADULT_AVATAR = 'avatar_01';

export function isKidAvatar(avatar) {
  return KIDS_AVATARS.includes(avatar);
}

export const MAX_PROFILES = 5;
export const MIN_PROFILES = 1;
export const SCHEMA_VERSION = 1;
export const PROFILE_ID_REGEX = /^-[A-Za-z0-9_-]{19}$/;
export const PIN_REGEX = /^[0-9]{4}$/;

const ALLOWED_PROFILE_KEYS = new Set(['name', 'avatar', 'isKids', 'createdAt', 'pinHash']);

/**
 * Validates a profile ID against Firebase push ID format.
 * @param {string} id
 * @returns {boolean}
 */
export function isValidProfileId(id) {
  return typeof id === 'string' && PROFILE_ID_REGEX.test(id);
}

/**
 * Normalizes a raw profile into a clean, schema-conforming object.
 * @param {Object} raw
 * @returns {Object}
 */
export function normalizeProfile(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    raw = {};
  }

  const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
  const name = rawName.length > 0 ? rawName.slice(0, 20) : 'Profile';
  const avatar = ALLOWED_AVATARS.includes(raw.avatar) ? raw.avatar : ALLOWED_AVATARS[0];
  const isKids = Boolean(raw.isKids);

  const createdAt = (typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) && raw.createdAt > 0)
    ? raw.createdAt
    : Date.now();

  const profile = {
    name,
    avatar,
    isKids,
    createdAt
  };

  if (isKids && typeof raw.pinHash === 'string' && raw.pinHash.trim().length > 0) {
    profile.pinHash = raw.pinHash.trim();
  }

  return profile;
}

/**
 * Validates a profile object against strict schema rules.
 * @param {Object} profile
 * @param {Object} [options]
 * @param {boolean} [options.requirePinForKids=false]
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateProfile(profile, options = {}) {
  const errors = [];

  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return { valid: false, errors: ['Profile must be a non-null object'] };
  }

  // Check for unknown keys and undefined values
  for (const key of Object.keys(profile)) {
    if (!ALLOWED_PROFILE_KEYS.has(key)) {
      errors.push(`Unknown field '${key}'`);
    }
    if (profile[key] === undefined) {
      errors.push(`Field '${key}' cannot be undefined`);
    }
  }

  // Name validation: 1-20 characters, trimmed
  if (typeof profile.name !== 'string') {
    errors.push('Name must be a string');
  } else if (profile.name !== profile.name.trim()) {
    errors.push('Name must not contain leading or trailing whitespace');
  } else if (profile.name.length < 1 || profile.name.length > 20) {
    errors.push('Name length must be between 1 and 20 characters');
  }

  // Avatar validation
  if (!ALLOWED_AVATARS.includes(profile.avatar)) {
    errors.push(`Avatar must be one of: ${ALLOWED_AVATARS.join(', ')}`);
  }

  // isKids validation
  if (typeof profile.isKids !== 'boolean') {
    errors.push('isKids must be a boolean');
  }

  // createdAt validation
  if (typeof profile.createdAt !== 'number' || !Number.isFinite(profile.createdAt) || profile.createdAt <= 0) {
    errors.push('createdAt must be a positive number');
  }

  // pinHash consistency
  if (profile.isKids === false && profile.pinHash !== undefined) {
    errors.push('pinHash is only allowed for Kids profiles');
  } else if (profile.isKids === true) {
    if (options.requirePinForKids && (typeof profile.pinHash !== 'string' || profile.pinHash.trim().length === 0)) {
      errors.push('pinHash is required for Kids profile');
    } else if (profile.pinHash !== undefined) {
      if (typeof profile.pinHash !== 'string' || profile.pinHash.trim().length === 0) {
        errors.push('pinHash must be a non-empty string when present');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Returns the SubtleCrypto instance or throws if unavailable.
 * @returns {SubtleCrypto}
 */
function getSubtleCrypto() {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto API is not available in this environment');
  }
  return cryptoObj.subtle;
}

/**
 * Converts an ArrayBuffer to a hex string.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Generates a cryptographically random hex salt (16 bytes = 32 hex chars).
 * @returns {string}
 */
function generateSalt() {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (!cryptoObj || !cryptoObj.getRandomValues) {
    throw new Error('Web Crypto API is not available in this environment');
  }
  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  return bufferToHex(bytes.buffer);
}

/**
 * Hashes a 4-digit PIN using SHA-256 with a salt.
 * @param {string} pin
 * @param {string} [salt]
 * @returns {Promise<string>} Format: `${salt}:${digestHex}`
 */
export async function hashPin(pin, salt) {
  if (typeof pin !== 'string' || !PIN_REGEX.test(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }

  const subtle = getSubtleCrypto();
  const resolvedSalt = salt || generateSalt();
  const encoder = new TextEncoder();
  const data = encoder.encode(`${resolvedSalt}:${pin}`);

  const digestBuffer = await subtle.digest('SHA-256', data);
  const digestHex = bufferToHex(digestBuffer);

  return `${resolvedSalt}:${digestHex}`;
}

/**
 * Verifies a 4-digit PIN against a stored pinHash (`${salt}:${digestHex}`).
 * @param {string} pin
 * @param {string} storedPinHash
 * @returns {Promise<boolean>}
 */
export async function verifyPin(pin, storedPinHash) {
  if (typeof pin !== 'string' || !PIN_REGEX.test(pin)) {
    return false;
  }
  if (typeof storedPinHash !== 'string' || !storedPinHash.includes(':')) {
    return false;
  }

  const subtle = getSubtleCrypto();
  const [salt, expectedDigest] = storedPinHash.split(':');
  if (!salt || !expectedDigest) {
    return false;
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${pin}`);
  const digestBuffer = await subtle.digest('SHA-256', data);
  const actualDigest = bufferToHex(digestBuffer);

  // Constant-time string comparison
  if (actualDigest.length !== expectedDigest.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < actualDigest.length; i++) {
    diff |= actualDigest.charCodeAt(i) ^ expectedDigest.charCodeAt(i);
  }
  return diff === 0;
}
