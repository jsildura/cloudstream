import { describe, it, expect } from 'vitest';
import { normalizeRawKey, generateRawKey, computeKeyHash } from './adfreeKeys.js';

describe('functions/lib/adfreeKeys', () => {
  const sampleKey = 'SFXAD-A2B3C-D4E5F-G6H7J';
  const hmacSecret = 'test-hmac-secret-123456789';

  describe('normalizeRawKey', () => {
    it('normalizes lowercase and whitespace', () => {
      expect(normalizeRawKey('  sfxad-a2b3c-d4e5f-g6h7j  ')).toBe(sampleKey);
    });

    it('rejects non-strings', () => {
      expect(() => normalizeRawKey(123)).toThrow();
      expect(() => normalizeRawKey(null)).toThrow();
    });

    it('rejects malformed key shapes', () => {
      expect(() => normalizeRawKey('INVALID-KEY')).toThrow();
      expect(() => normalizeRawKey('SFXAD-1234-12345-12345')).toThrow();
      expect(() => normalizeRawKey('SFXAD-12345-12345')).toThrow();
      expect(() => normalizeRawKey('SFXAD-12345-12345-12345-EXTRA')).toThrow();
    });
  });

  describe('generateRawKey', () => {
    it('generates valid key shape', () => {
      const key = generateRawKey();
      expect(key).toMatch(/^SFXAD-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
      expect(() => normalizeRawKey(key)).not.toThrow();
    });

    it('generates unique keys', () => {
      const set = new Set();
      for (let i = 0; i < 50; i++) {
        set.add(generateRawKey());
      }
      expect(set.size).toBe(50);
    });
  });

  describe('computeKeyHash', () => {
    it('computes deterministic HMAC hex string', async () => {
      const hash1 = await computeKeyHash(sampleKey, hmacSecret);
      const hash2 = await computeKeyHash('  sfxad-a2b3c-d4e5f-g6h7j  ', hmacSecret);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes with different secrets', async () => {
      const hash1 = await computeKeyHash(sampleKey, hmacSecret);
      const hash2 = await computeKeyHash(sampleKey, 'another-secret');
      expect(hash1).not.toBe(hash2);
    });

    it('throws when secret is missing', async () => {
      await expect(computeKeyHash(sampleKey, '')).rejects.toThrow();
    });
  });
});
