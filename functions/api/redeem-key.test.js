import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest } from './redeem-key.js';
import * as firebaseAuth from '../lib/firebaseAuth.js';
import * as firebaseAdminRest from '../lib/firebaseAdminRest.js';
import { computeKeyHash } from '../lib/adfreeKeys.js';

describe('functions/api/redeem-key', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockEnv = {
    AD_KEY_HMAC_SECRET: 'test-hmac-secret-123456789',
    FIREBASE_DATABASE_URL: 'https://demo-rtdb.firebaseio.com'
  };

  const validKey = 'SFXAD-A2B3C-D4E5F-G6H7J';

  it('handles OPTIONS preflight', async () => {
    const req = new Request('http://localhost/api/redeem-key', { method: 'OPTIONS' });
    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(204);
  });

  it('rejects unauthenticated caller', async () => {
    const req = new Request('http://localhost/api/redeem-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: validKey })
    });
    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(401);
  });

  it('rejects anonymous caller', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'anon-user-1',
      provider: 'anonymous'
    });

    const req = new Request('http://localhost/api/redeem-key', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: validKey })
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.reason).toBe('auth-required');
  });

  it('rejects malformed key format', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'google-user-1',
      provider: 'google.com'
    });

    const req = new Request('http://localhost/api/redeem-key', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'INVALID_KEY' })
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.reason).toBe('key-invalid');
  });

  it('rejects if account already has adFree entitlement', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'google-user-1',
      provider: 'google.com'
    });

    vi.spyOn(firebaseAdminRest, 'firebaseRestGet').mockImplementation(async (path) => {
      if (path.includes('accounts/google-user-1/adFree')) {
        return { value: { activatedAt: 123456, method: 'key' }, etag: 'etag-1' };
      }
      return { value: null, etag: null };
    });

    const req = new Request('http://localhost/api/redeem-key', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: validKey })
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.reason).toBe('already-ad-free');
  });

  it('rejects if key does not exist', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'google-user-1',
      provider: 'google.com'
    });

    vi.spyOn(firebaseAdminRest, 'firebaseRestGet').mockResolvedValue({ value: null, etag: null });

    const req = new Request('http://localhost/api/redeem-key', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: validKey })
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.reason).toBe('key-invalid');
  });

  it('rejects if key has already been redeemed', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'google-user-1',
      provider: 'google.com'
    });

    vi.spyOn(firebaseAdminRest, 'firebaseRestGet').mockImplementation(async (path) => {
      if (path.includes('accounts/google-user-1/adFree')) {
        return { value: null, etag: null };
      }
      return { value: { status: 'redeemed', redeemedBy: 'other-user' }, etag: 'etag-key' };
    });

    const req = new Request('http://localhost/api/redeem-key', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: validKey })
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.reason).toBe('key-already-redeemed');
  });

  it('successfully claims key, grants entitlement and finalizes redeemed state', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'google-user-1',
      provider: 'google.com'
    });

    const keyHash = await computeKeyHash(validKey, mockEnv.AD_KEY_HMAC_SECRET);

    vi.spyOn(firebaseAdminRest, 'firebaseRestGet').mockImplementation(async (path) => {
      if (path.includes('accounts/google-user-1/adFree')) {
        return { value: null, etag: 'etag-acc-empty' };
      }
      if (path.includes(`adFreeKeys/${keyHash}`)) {
        return {
          value: { status: 'available', createdAt: 1720000000000, createdBy: 'admin-1' },
          etag: 'etag-key-1'
        };
      }
      return { value: null, etag: null };
    });

    const putCalls = [];
    vi.spyOn(firebaseAdminRest, 'firebaseRestPut').mockImplementation(async (path, value, env, options) => {
      putCalls.push({ path, value, options });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const req = new Request('http://localhost/api/redeem-key', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: validKey })
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.activatedAt).toBeTypeOf('number');

    // 1. Claiming with If-Match
    expect(putCalls[0].path).toBe(`adFreeKeys/${keyHash}`);
    expect(putCalls[0].value.status).toBe('claiming');
    expect(putCalls[0].value.boundTo).toBe('google-user-1');
    expect(putCalls[0].options?.ifMatch).toBe('etag-key-1');

    // 2. Granting to account
    expect(putCalls[1].path).toBe('accounts/google-user-1/adFree');
    expect(putCalls[1].value.method).toBe('key');
    expect(putCalls[1].value.keyHash).toBe(keyHash);

    // 3. Finalizing redeemed
    expect(putCalls[2].path).toBe(`adFreeKeys/${keyHash}`);
    expect(putCalls[2].value.status).toBe('redeemed');
    expect(putCalls[2].value.redeemedBy).toBe('google-user-1');
  });

  it('handles concurrent claim conflict via 412 ETag', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'google-user-1',
      provider: 'google.com'
    });

    const keyHash = await computeKeyHash(validKey, mockEnv.AD_KEY_HMAC_SECRET);

    vi.spyOn(firebaseAdminRest, 'firebaseRestGet').mockImplementation(async (path) => {
      if (path.includes('accounts/google-user-1/adFree')) {
        return { value: null, etag: 'etag-acc' };
      }
      return {
        value: { status: 'available', createdAt: 1720000000000 },
        etag: 'etag-key-old'
      };
    });

    vi.spyOn(firebaseAdminRest, 'firebaseRestPut').mockImplementation(async (path) => {
      if (path.includes(`adFreeKeys/${keyHash}`)) {
        return new Response(JSON.stringify({ error: 'Precondition Failed' }), { status: 412 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const req = new Request('http://localhost/api/redeem-key', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: validKey })
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.reason).toBe('key-already-redeemed');
  });
});
