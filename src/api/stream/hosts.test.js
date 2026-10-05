import { describe, it, expect } from 'vitest';
import {
  ALLOWED_MEDIA_HOSTS,
  ALLOWED_MEDIA_HOST_SET,
  DIRECT_PLAYABLE_HOSTS,
  signMediaToken,
  verifyMediaToken,
} from './hosts.js';

describe('ALLOWED_MEDIA_HOSTS security boundary', () => {
  it('allows exact trusted zxcstream and devcorp hosts', () => {
    expect(ALLOWED_MEDIA_HOSTS('proxy.zxcstream.xyz')).toBe(true);
    expect(ALLOWED_MEDIA_HOSTS('player.zxcstream.xyz')).toBe(true);
    expect(ALLOWED_MEDIA_HOSTS('aapanel.devcorp.me')).toBe(true);
    expect(ALLOWED_MEDIA_HOSTS('s1.devcorp.me')).toBe(true);
  });

  it('rejects arbitrary *.workers.dev hosts (Finding 7 fix)', () => {
    expect(ALLOWED_MEDIA_HOSTS('attacker.workers.dev')).toBe(false);
    expect(ALLOWED_MEDIA_HOSTS('free-relay.workers.dev')).toBe(false);
    expect(ALLOWED_MEDIA_HOSTS('my-worker.workers.dev')).toBe(false);
    expect(ALLOWED_MEDIA_HOSTS('workers.dev')).toBe(false);
  });

  it('rejects arbitrary *.devcorp.me subdomains outside the allowlist', () => {
    expect(ALLOWED_MEDIA_HOSTS('malicious.devcorp.me')).toBe(false);
    expect(ALLOWED_MEDIA_HOSTS('untrusted.devcorp.me')).toBe(false);
  });

  it('rejects arbitrary external domains and invalid inputs', () => {
    expect(ALLOWED_MEDIA_HOSTS('evil.com')).toBe(false);
    expect(ALLOWED_MEDIA_HOSTS('google.com')).toBe(false);
    expect(ALLOWED_MEDIA_HOSTS('169.254.169.254')).toBe(false);
    expect(ALLOWED_MEDIA_HOSTS('')).toBe(false);
    expect(ALLOWED_MEDIA_HOSTS(null)).toBe(false);
    expect(ALLOWED_MEDIA_HOSTS(undefined)).toBe(false);
  });

  it('verifies DIRECT_PLAYABLE_HOSTS contains proven open CORS hosts', () => {
    expect(DIRECT_PLAYABLE_HOSTS.has('aapanel.devcorp.me')).toBe(true);
  });
});

describe('signMediaToken and verifyMediaToken HMAC verification', () => {
  const secret = 'super-secret-key-12345';
  const targetUrl = 'https://rotating-relay.workers.dev/hls/stream.m3u8';

  it('successfully signs and verifies a valid token', async () => {
    const { exp, sig } = await signMediaToken(targetUrl, secret, 60000);
    expect(typeof exp).toBe('number');
    expect(typeof sig).toBe('string');
    expect(sig).toHaveLength(64); // SHA-256 hex string

    const isValid = await verifyMediaToken(targetUrl, exp, sig, secret);
    expect(isValid).toBe(true);
  });

  it('rejects verification if secret is incorrect', async () => {
    const { exp, sig } = await signMediaToken(targetUrl, secret, 60000);
    const isValid = await verifyMediaToken(targetUrl, exp, sig, 'wrong-secret');
    expect(isValid).toBe(false);
  });

  it('rejects verification if token is expired', async () => {
    // Generate token with negative TTL
    const { exp, sig } = await signMediaToken(targetUrl, secret, -1000);
    const isValid = await verifyMediaToken(targetUrl, exp, sig, secret);
    expect(isValid).toBe(false);
  });

  it('rejects verification if URL was tampered with', async () => {
    const { exp, sig } = await signMediaToken(targetUrl, secret, 60000);
    const tamperedUrl = 'https://rotating-relay.workers.dev/hls/other-stream.m3u8';
    const isValid = await verifyMediaToken(tamperedUrl, exp, sig, secret);
    expect(isValid).toBe(false);
  });

  it('rejects verification if signature was tampered with', async () => {
    const { exp, sig } = await signMediaToken(targetUrl, secret, 60000);
    const tamperedSig = sig.slice(0, -2) + 'aa';
    const isValid = await verifyMediaToken(targetUrl, exp, tamperedSig, secret);
    expect(isValid).toBe(false);
  });

  it('returns false for missing or invalid parameters', async () => {
    expect(await verifyMediaToken('', 12345, 'sig', secret)).toBe(false);
    expect(await verifyMediaToken(targetUrl, null, 'sig', secret)).toBe(false);
    expect(await verifyMediaToken(targetUrl, 12345, '', secret)).toBe(false);
    expect(await verifyMediaToken(targetUrl, 12345, 'sig', '')).toBe(false);
    expect(await verifyMediaToken(targetUrl, 'not-a-number', 'sig', secret)).toBe(false);
  });
});
