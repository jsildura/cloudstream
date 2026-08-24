import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest } from './create-adfree-order.js';
import * as firebaseAuth from '../lib/firebaseAuth.js';
import * as firebaseAdminRest from '../lib/firebaseAdminRest.js';
import * as paypal from '../lib/paypal.js';

describe('functions/api/create-adfree-order', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockEnv = {
    FIREBASE_DATABASE_URL: 'https://demo-rtdb.firebaseio.com',
    PAYPAL_CLIENT_ID: 'mock-client',
    PAYPAL_CLIENT_SECRET: 'mock-secret'
  };

  it('handles OPTIONS preflight', async () => {
    const req = new Request('http://localhost/api/create-adfree-order', { method: 'OPTIONS' });
    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(204);
  });

  it('rejects unauthenticated caller', async () => {
    const req = new Request('http://localhost/api/create-adfree-order', { method: 'POST' });
    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(401);
  });

  it('rejects anonymous caller', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'anon-1',
      provider: 'anonymous'
    });

    const req = new Request('http://localhost/api/create-adfree-order', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' }
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.reason).toBe('auth-required');
  });

  it('rejects caller that already has adFree entitlement', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'google-user-1',
      provider: 'google.com'
    });

    vi.spyOn(firebaseAdminRest, 'firebaseRestGet').mockResolvedValue({
      value: { activatedAt: 12345, method: 'purchase' }
    });

    const req = new Request('http://localhost/api/create-adfree-order', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' }
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.reason).toBe('already-ad-free');
  });

  it('fails closed and creates no order when the entitlement check is unavailable', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'google-user-1',
      provider: 'google.com'
    });

    vi.spyOn(firebaseAdminRest, 'firebaseRestGet').mockRejectedValue(
      new Error('Firebase REST GET failed: HTTP 503')
    );
    const createOrder = vi.spyOn(paypal, 'createPayPalOrder').mockResolvedValue({
      orderId: 'ORDER-999888'
    });

    const req = new Request('http://localhost/api/create-adfree-order', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' }
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.reason).toBe('entitlement-check-unavailable');
    // An outage must never be read as "no entitlement": an already-entitled
    // account would otherwise be charged twice.
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('creates PayPal order for eligible user', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'google-user-1',
      provider: 'google.com'
    });

    vi.spyOn(firebaseAdminRest, 'firebaseRestGet').mockResolvedValue({ value: null });
    vi.spyOn(paypal, 'createPayPalOrder').mockResolvedValue({
      orderId: 'ORDER-999888',
      checkoutUrl: 'https://www.paypal.com/checkoutnow?token=ORDER-999888'
    });

    const req = new Request('http://localhost/api/create-adfree-order', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' }
    });

    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.orderId).toBe('ORDER-999888');
    // Passed through so the browser approves the order on the host that minted
    // it. Rebuilding this client-side lets a stale build-time VITE_PAYPAL_ENV
    // send a live order id to sandbox, which fails silently and charges nothing.
    expect(data.checkoutUrl).toBe('https://www.paypal.com/checkoutnow?token=ORDER-999888');
    // The request must be forwarded so the return_url is derived from the host
    // Cloudflare routed rather than from a caller-supplied Origin header.
    expect(paypal.createPayPalOrder).toHaveBeenCalledWith(mockEnv, 'google-user-1', req);
  });
});
