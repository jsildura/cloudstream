import { describe, it, expect } from 'vitest';
import {
  ALLOWED_AVATARS,
  MAX_PROFILES,
  MIN_PROFILES,
  SCHEMA_VERSION,
  PROFILE_ID_REGEX,
  PIN_REGEX,
  isValidProfileId,
  normalizeProfile,
  validateProfile,
  hashPin,
  verifyPin
} from './profileModel.js';

describe('profileModel', () => {
  describe('Constants and Regexes', () => {
    it('defines expected limits and schemas', () => {
      expect(MAX_PROFILES).toBe(5);
      expect(MIN_PROFILES).toBe(1);
      expect(SCHEMA_VERSION).toBe(1);
      expect(ALLOWED_AVATARS).toHaveLength(12);
      expect(ALLOWED_AVATARS).toContain('avatar_01');
      expect(ALLOWED_AVATARS).toContain('avatar_12');
    });

    it('validates profile push IDs', () => {
      const validPushId = '-NxABCD1234567890xyz';
      expect(validPushId).toHaveLength(20);
      expect(isValidProfileId(validPushId)).toBe(true);

      expect(isValidProfileId('')).toBe(false);
      expect(isValidProfileId('invalid-id')).toBe(false);
      expect(isValidProfileId('-shortId')).toBe(false);
      expect(isValidProfileId('NxABCD1234567890xyz-')).toBe(false); // does not start with -
      expect(isValidProfileId('-NxABCD1234567890xyz!@')).toBe(false); // invalid characters
      expect(isValidProfileId(null)).toBe(false);
      expect(isValidProfileId(12345)).toBe(false);
    });
  });

  describe('normalizeProfile', () => {
    it('normalizes a standard profile with defaults', () => {
      const input = {
        name: '  Alice  ',
        avatar: 'avatar_03',
        isKids: false,
        createdAt: 1700000000000
      };
      const normalized = normalizeProfile(input);
      expect(normalized).toEqual({
        name: 'Alice',
        avatar: 'avatar_03',
        isKids: false,
        createdAt: 1700000000000
      });
    });

    it('falls back to safe defaults on empty or invalid inputs', () => {
      const normalized = normalizeProfile({});
      expect(normalized.name).toBe('Profile');
      expect(normalized.avatar).toBe('avatar_01');
      expect(normalized.isKids).toBe(false);
      expect(typeof normalized.createdAt).toBe('number');
      expect(normalized.createdAt).toBeGreaterThan(0);
      expect(normalized.pinHash).toBeUndefined();
    });

    it('handles Kids profiles and preserves pinHash when isKids is true', () => {
      const input = {
        name: 'Kiddo',
        avatar: 'avatar_09',
        isKids: true,
        pinHash: 'salt123:digest456',
        createdAt: 1700000000000
      };
      const normalized = normalizeProfile(input);
      expect(normalized).toEqual({
        name: 'Kiddo',
        avatar: 'avatar_09',
        isKids: true,
        pinHash: 'salt123:digest456',
        createdAt: 1700000000000
      });
    });

    it('strips pinHash when isKids is false', () => {
      const input = {
        name: 'Adult',
        avatar: 'avatar_01',
        isKids: false,
        pinHash: 'salt123:digest456',
        createdAt: 1700000000000
      };
      const normalized = normalizeProfile(input);
      expect(normalized.pinHash).toBeUndefined();
    });

    it('truncates name to 20 characters', () => {
      const longName = 'ThisNameIsWayTooLongAndExceedsTwentyChars';
      const normalized = normalizeProfile({ name: longName });
      expect(normalized.name).toBe(longName.slice(0, 20));
      expect(normalized.name.length).toBe(20);
    });

    it('replaces non-allowlisted avatar with avatar_01', () => {
      const normalized = normalizeProfile({ avatar: 'https://evil.com/pic.png' });
      expect(normalized.avatar).toBe('avatar_01');
    });
  });

  describe('validateProfile (table-driven)', () => {
    const validAdult = {
      name: 'John Doe',
      avatar: 'avatar_02',
      isKids: false,
      createdAt: 1700000000000
    };

    const validKids = {
      name: 'Timmy',
      avatar: 'avatar_10',
      isKids: true,
      pinHash: 'abc123salt:def456digest',
      createdAt: 1700000000000
    };

    const testCases = [
      {
        name: 'valid adult profile passes',
        profile: validAdult,
        options: {},
        expectedValid: true
      },
      {
        name: 'valid kids profile with pinHash passes',
        profile: validKids,
        options: {},
        expectedValid: true
      },
      {
        name: 'valid kids profile without pinHash passes default validation',
        profile: {
          name: 'Timmy',
          avatar: 'avatar_10',
          isKids: true,
          createdAt: 1700000000000
        },
        options: {},
        expectedValid: true
      },
      {
        name: 'kids profile without pinHash fails when requirePinForKids is true',
        profile: {
          name: 'Timmy',
          avatar: 'avatar_10',
          isKids: true,
          createdAt: 1700000000000
        },
        options: { requirePinForKids: true },
        expectedValid: false,
        errorMatch: 'pinHash is required'
      },
      {
        name: 'non-object profile fails',
        profile: null,
        options: {},
        expectedValid: false
      },
      {
        name: 'array profile fails',
        profile: [],
        options: {},
        expectedValid: false
      },
      {
        name: 'empty name fails',
        profile: { ...validAdult, name: '' },
        options: {},
        expectedValid: false,
        errorMatch: 'Name length'
      },
      {
        name: 'name exceeding 20 characters fails',
        profile: { ...validAdult, name: 'A'.repeat(21) },
        options: {},
        expectedValid: false,
        errorMatch: 'Name length'
      },
      {
        name: 'untrimmed name with leading/trailing spaces fails',
        profile: { ...validAdult, name: ' Alice ' },
        options: {},
        expectedValid: false,
        errorMatch: 'whitespace'
      },
      {
        name: 'disallowed avatar fails',
        profile: { ...validAdult, avatar: 'avatar_99' },
        options: {},
        expectedValid: false,
        errorMatch: 'Avatar must be one of'
      },
      {
        name: 'non-boolean isKids fails',
        profile: { ...validAdult, isKids: 'false' },
        options: {},
        expectedValid: false,
        errorMatch: 'isKids must be a boolean'
      },
      {
        name: 'non-numeric createdAt fails',
        profile: { ...validAdult, createdAt: '2026-08-16' },
        options: {},
        expectedValid: false,
        errorMatch: 'createdAt'
      },
      {
        name: 'negative or zero createdAt fails',
        profile: { ...validAdult, createdAt: -1 },
        options: {},
        expectedValid: false,
        errorMatch: 'createdAt'
      },
      {
        name: 'pinHash on adult profile fails',
        profile: { ...validAdult, pinHash: 'salt:hash' },
        options: {},
        expectedValid: false,
        errorMatch: 'pinHash is only allowed for Kids profiles'
      },
      {
        name: 'unknown extra field fails',
        profile: { ...validAdult, role: 'admin' },
        options: {},
        expectedValid: false,
        errorMatch: "Unknown field 'role'"
      },
      {
        name: 'undefined property value fails',
        profile: { name: 'Alice', avatar: 'avatar_01', isKids: false, createdAt: 1700000000000, extra: undefined },
        options: {},
        expectedValid: false
      }
    ];

    testCases.forEach(({ name, profile, options, expectedValid, errorMatch }) => {
      it(name, () => {
        const result = validateProfile(profile, options);
        expect(result.valid).toBe(expectedValid);
        if (!expectedValid && errorMatch) {
          expect(result.errors.some(e => e.includes(errorMatch))).toBe(true);
        }
      });
    });
  });

  describe('hashPin and verifyPin', () => {
    it('hashes a valid 4-digit PIN into salt:digest format', async () => {
      const pin = '1234';
      const hash = await hashPin(pin);
      expect(typeof hash).toBe('string');
      expect(hash).toContain(':');

      const [salt, digest] = hash.split(':');
      expect(salt).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(digest).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex chars
    });

    it('uses provided salt if given', async () => {
      const customSalt = '1234567890abcdef1234567890abcdef';
      const hash = await hashPin('4321', customSalt);
      expect(hash.startsWith(customSalt + ':')).toBe(true);
    });

    it('rejects invalid PIN formats', async () => {
      await expect(hashPin('123')).rejects.toThrow('PIN must be exactly 4 digits');
      await expect(hashPin('12345')).rejects.toThrow('PIN must be exactly 4 digits');
      await expect(hashPin('abcd')).rejects.toThrow('PIN must be exactly 4 digits');
      await expect(hashPin('')).rejects.toThrow('PIN must be exactly 4 digits');
      await expect(hashPin(null)).rejects.toThrow('PIN must be exactly 4 digits');
    });

    it('verifies matching PIN successfully', async () => {
      const pin = '9876';
      const hash = await hashPin(pin);
      const isMatch = await verifyPin(pin, hash);
      expect(isMatch).toBe(true);
    });

    it('rejects non-matching PIN', async () => {
      const hash = await hashPin('9876');
      const isMatch = await verifyPin('1111', hash);
      expect(isMatch).toBe(false);
    });

    it('handles verifyPin with invalid inputs gracefully returning false', async () => {
      const hash = await hashPin('9876');
      expect(await verifyPin('abc', hash)).toBe(false);
      expect(await verifyPin('12345', hash)).toBe(false);
      expect(await verifyPin('9876', 'malformed-hash')).toBe(false);
      expect(await verifyPin('9876', null)).toBe(false);
      expect(await verifyPin('9876', '')).toBe(false);
    });

    it('throws when Web Crypto API is unavailable', async () => {
      const originalCrypto = globalThis.crypto;
      try {
        // Temporarily remove subtle
        Object.defineProperty(globalThis, 'crypto', {
          value: {},
          configurable: true,
          writable: true
        });

        await expect(hashPin('1234')).rejects.toThrow('Web Crypto API is not available');
      } finally {
        Object.defineProperty(globalThis, 'crypto', {
          value: originalCrypto,
          configurable: true,
          writable: true
        });
      }
    });
  });
});
