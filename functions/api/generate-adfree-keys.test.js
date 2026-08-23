import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest } from './generate-adfree-keys.js';
import * as firebaseAuth from '../lib/firebaseAuth.js';
import * as firebaseAdminRest from '../lib/firebaseAdminRest.js';

describe('functions/api/generate-adfree-keys', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockEnv = {
    AD_KEY_HMAC_SECRET: 'test-hmac-secret-123456789',
    FIREBASE_DATABASE_URL: 'https://demo-rtdb.firebaseio.com'
  };

  it('handles OPTIONS preflight', async () => {
    const req = new Request('http://localhost/api/generate-adfree-keys', {
      method: 'OPTIONS'
    });
    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(204);
  });

  it('rejects unauthenticated request', async () => {
    const req = new Request('http://localhost/api/generate-adfree-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 1 })
    });
    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(401);
  });

  it('rejects non-admin authenticated caller', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'user-1',
      provider: 'google.com',
      claims: { globalChatAdmin: false }
    });

    const req = new Request('http://localhost/api/generate-adfree-keys', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 1 })
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(403);
  });

  it('rejects invalid key counts', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'admin-1',
      provider: 'google.com',
      claims: { globalChatAdmin: true }
    });

    const req = new Request('http://localhost/api/generate-adfree-keys', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 50 })
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('between 1 and 25');
  });

  it('generates specified number of keys and stores in RTDB', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'admin-1',
      provider: 'google.com',
      claims: { globalChatAdmin: true }
    });

    vi.spyOn(firebaseAdminRest, 'firebaseRestGet').mockResolvedValue({ value: null });
    const putSpy = vi
      .spyOn(firebaseAdminRest, 'firebaseRestPut')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const req = new Request('http://localhost/api/generate-adfree-keys', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 3 })
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.keys).toHaveLength(3);
    data.keys.forEach((key) => {
      expect(key).toMatch(/^SFXAD-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    });

    expect(putSpy).toHaveBeenCalledTimes(3);
    expect(putSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^adFreeKeys\/[0-9a-f]{64}$/),
      expect.objectContaining({
        status: 'available',
        createdBy: 'admin-1'
      }),
      mockEnv
    );
  });
});
