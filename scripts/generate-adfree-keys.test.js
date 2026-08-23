import { describe, it, expect } from 'vitest';
import { parseArgs, normalizeRawKey, generateRawKey, computeKeyHash } from './generate-adfree-keys.mjs';

describe('scripts/generate-adfree-keys', () => {
  describe('parseArgs', () => {
    it('defaults to count 1 and null secret', () => {
      const parsed = parseArgs([]);
      expect(parsed.count).toBe(1);
      expect(parsed.hmacSecret).toBeNull();
    });

    it('parses --count and --hmac-secret correctly', () => {
      const parsed = parseArgs(['--count', '10', '--hmac-secret', 'my-secret']);
      expect(parsed.count).toBe(10);
      expect(parsed.hmacSecret).toBe('my-secret');
    });

    it('rejects non-integer count', () => {
      expect(() => parseArgs(['--count', 'abc'])).toThrow(/integer between 1 and 25/i);
      expect(() => parseArgs(['--count', '0'])).toThrow(/integer between 1 and 25/i);
      expect(() => parseArgs(['--count', '30'])).toThrow(/integer between 1 and 25/i);
    });

    it('rejects duplicate flags', () => {
      expect(() => parseArgs(['--count', '5', '--count', '10'])).toThrow(/duplicate/i);
    });

    it('rejects unknown flags', () => {
      expect(() => parseArgs(['--unknown'])).toThrow(/unknown flag/i);
    });
  });

  describe('generateRawKey and computeKeyHash', () => {
    it('generates keys adhering to SFXAD-XXXXX-XXXXX-XXXXX', () => {
      const key = generateRawKey();
      expect(key).toMatch(/^SFXAD-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
      expect(() => normalizeRawKey(key)).not.toThrow();
    });

    it('computes 64-character lowercase hex HMAC hash', () => {
      const hash = computeKeyHash('SFXAD-A2B3C-D4E5F-G6H7J', 'test-secret');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
