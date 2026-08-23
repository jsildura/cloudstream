import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  firebaseRestGet,
  firebaseRestPut,
  firebaseRestPatch,
  _resetTokenCacheForTesting
} from './firebaseAdminRest.js';

describe('functions/lib/firebaseAdminRest', () => {
  beforeEach(() => {
    _resetTokenCacheForTesting();
    vi.restoreAllMocks();
  });

  const mockEnv = {
    FIREBASE_DATABASE_URL: 'https://demo-rtdb.firebaseio.com',
    _TEST_OAUTH_TOKEN: 'mock-access-token-12345'
  };

  it('performs GET and parses ETag header', async () => {
    const mockData = { status: 'available', createdAt: 1720000000000 };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ ETag: 'etag-xyz-123' }),
        json: async () => mockData
      })
    );

    const result = await firebaseRestGet('adFreeKeys/test-hash', mockEnv, { etag: true });
    expect(result.value).toEqual(mockData);
    expect(result.etag).toBe('etag-xyz-123');

    expect(fetch).toHaveBeenCalledWith(
      'https://demo-rtdb.firebaseio.com/adFreeKeys/test-hash.json',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers)
      })
    );
  });

  it('performs PUT with If-Match and body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );

    const payload = { status: 'claiming', boundTo: 'user-1' };
    const res = await firebaseRestPut('adFreeKeys/test-hash', payload, mockEnv, {
      ifMatch: 'etag-xyz-123'
    });

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      'https://demo-rtdb.firebaseio.com/adFreeKeys/test-hash.json',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(payload)
      })
    );

    const [, init] = fetch.mock.calls[0];
    expect(init.headers.get('if-match')).toBe('etag-xyz-123');
  });

  it('sends no If-Match header for an unconditional PUT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );

    await firebaseRestPut('accounts/user-1/adFree', { activatedAt: 1 }, mockEnv);

    const [, init] = fetch.mock.calls[0];
    expect(init.headers.get('if-match')).toBeNull();
  });

  it('refuses a conditional PUT without a usable ETag instead of overwriting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );

    for (const ifMatch of [null, undefined, '']) {
      await expect(
        firebaseRestPut('adFreeKeys/test-hash', { status: 'claiming' }, mockEnv, { ifMatch })
      ).rejects.toThrow(/conditional write requested without a usable ETag/);
    }

    expect(fetch).not.toHaveBeenCalled();
  });

  it('performs PATCH on root updates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );

    const updates = { 'accounts/user-1/adFree': { activatedAt: 123 } };
    const res = await firebaseRestPatch(updates, mockEnv);

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      'https://demo-rtdb.firebaseio.com/.json',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(updates)
      })
    );
  });
});
