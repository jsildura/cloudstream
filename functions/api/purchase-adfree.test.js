import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest } from './purchase-adfree.js';
import * as firebaseAuth from '../lib/firebaseAuth.js';
import * as firebaseAdminRest from '../lib/firebaseAdminRest.js';
import * as paypal from '../lib/paypal.js';

const HEX64 = /^[0-9a-f]{64}$/;

// An amount that is deliberately never the configured price, so the mismatch
// fixtures below stay mismatches whatever the price is set to. A literal that
// happens to equal the current price would silently turn a rejection test into a
// success test — which is exactly what a $2.99 → $0.01 change did once.
const WRONG_AMOUNT = '13.37';

describe('functions/api/purchase-adfree', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockEnv = {
    FIREBASE_DATABASE_URL: 'https://demo-rtdb.firebaseio.com',
    PAYPAL_CLIENT_ID: 'mock-client',
    PAYPAL_CLIENT_SECRET: 'mock-secret',
    AD_KEY_HMAC_SECRET: 'test-hmac-secret'
  };

  const uid = 'google-user-1';
  const validOrderId = 'ORDER-12345678';
  const requestId = 'req-abcdef123456';
  // PayPal mints this separately from the order id, and it is the only one of
  // the two that appears in the buyer's transaction history.
  const captureId = '58J176263B618532M';

  const payPalOrder = (overrides = {}) => ({
    id: validOrderId,
    status: 'COMPLETED',
    purchase_units: [
      {
        description: 'Streamflix Ad-Free',
        custom_id: 'streamflix-adfree-v1',
        amount: { currency_code: 'USD', value: '2.99' },
        payments: { captures: [{ id: captureId, status: 'COMPLETED' }] }
      }
    ],
    ...overrides
  });

  /** Minimal in-memory RTDB so reserve/finalize/reconcile can be exercised end to end. */
  function mockDb(initial = {}) {
    const data = { ...initial };
    const putCalls = [];
    let etagSeq = 0;

    const get = vi.spyOn(firebaseAdminRest, 'firebaseRestGet').mockImplementation(async (path) => {
      etagSeq += 1;
      return {
        value: Object.prototype.hasOwnProperty.call(data, path) ? data[path] : null,
        etag: `etag-${etagSeq}`
      };
    });

    const put = vi
      .spyOn(firebaseAdminRest, 'firebaseRestPut')
      .mockImplementation(async (path, value, env, options) => {
        putCalls.push({ path, value, options });
        if (value === null) delete data[path];
        else data[path] = value;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

    return { data, putCalls, get, put };
  }

  function signInGoogle(userId = uid) {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: userId,
      provider: 'google.com'
    });
  }

  function post(body) {
    return new Request('http://localhost/api/purchase-adfree', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  const call = (body) => onRequest({ request: post(body), env: mockEnv });

  it('handles OPTIONS preflight', async () => {
    const req = new Request('http://localhost/api/purchase-adfree', { method: 'OPTIONS' });
    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(204);
  });

  it('rejects unauthenticated caller', async () => {
    const req = new Request('http://localhost/api/purchase-adfree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: validOrderId })
    });
    const res = await onRequest({ request: req, env: mockEnv });
    expect(res.status).toBe(401);
  });

  it('rejects anonymous caller', async () => {
    vi.spyOn(firebaseAuth, 'verifyFirebaseIdToken').mockResolvedValue({
      uid: 'anon-1',
      provider: 'anonymous'
    });

    const res = await call({ orderId: validOrderId });
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe('auth-required');
  });

  it('rejects a missing HMAC secret before touching the database', async () => {
    signInGoogle();
    const { get } = mockDb();

    const res = await onRequest({
      request: post({ orderId: validOrderId }),
      env: { ...mockEnv, AD_KEY_HMAC_SECRET: undefined }
    });

    expect(res.status).toBe(500);
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects missing or invalid orderId format', async () => {
    signInGoogle();
    const res = await call({ orderId: 'bad order id with spaces!' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('order-invalid');
  });

  it('rejects a malformed requestId', async () => {
    signInGoogle();
    const res = await call({ orderId: validOrderId, requestId: 'short' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('request-invalid');
  });

  it('rejects an order already linked to another account', async () => {
    signInGoogle('google-user-2');
    mockDb({
      [`adFreeOrders/${validOrderId}`]: { uid, status: 'completed', completedAt: 1000 }
    });

    const res = await call({ orderId: validOrderId });
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe('order-already-used');
  });

  it('reserves the order with a conditional write, captures once, and writes all three records', async () => {
    signInGoogle();
    const { putCalls, data } = mockDb();
    const fetchOrder = vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());
    const capture = vi.spyOn(paypal, 'capturePayPalOrder').mockResolvedValue(payPalOrder());

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.activatedAt).toBeTypeOf('number');

    // The order is already COMPLETED at PayPal, so capture must not run again.
    expect(fetchOrder).toHaveBeenCalledTimes(1);
    expect(capture).not.toHaveBeenCalled();

    // 1. Conditional reservation, carrying the key hash that every retry reuses.
    expect(putCalls[0].path).toBe(`adFreeOrders/${validOrderId}`);
    expect(putCalls[0].value.status).toBe('reserved');
    expect(putCalls[0].value.requestId).toBe(requestId);
    expect(putCalls[0].value.keyHash).toMatch(HEX64);
    expect(putCalls[0].options.ifMatch).toBeTruthy();

    const { keyHash } = putCalls[0].value;

    // 2. Payment marked as taken before the entitlement is granted.
    expect(putCalls[1].path).toBe(`adFreeOrders/${validOrderId}`);
    expect(putCalls[1].value.status).toBe('captured');
    expect(putCalls[1].value.amount).toBe(2.99);
    expect(putCalls[1].value.currency).toBe('USD');
    // Recorded before the grant so a half-finished activation is still
    // traceable to the PayPal transaction the buyer can see.
    expect(putCalls[1].value.captureId).toBe(captureId);

    // 3. Account entitlement, shaped for the adFree .validate rule.
    expect(putCalls[2].path).toBe(`accounts/${uid}/adFree`);
    expect(putCalls[2].value).toEqual({
      keyHash,
      activatedAt: putCalls[1].value.capturedAt,
      method: 'purchase',
      orderId: validOrderId
    });

    // 4. Purchase key record.
    expect(putCalls[3].path).toBe(`adFreeKeys/${keyHash}`);
    expect(putCalls[3].value.status).toBe('redeemed');
    expect(putCalls[3].value.source).toBe('purchase');
    expect(putCalls[3].value.redeemedBy).toBe(uid);
    expect(putCalls[3].value.orderId).toBe(validOrderId);

    // 5. Order finalized last, once the other two records are consistent.
    expect(putCalls[4].path).toBe(`adFreeOrders/${validOrderId}`);
    expect(putCalls[4].value.status).toBe('completed');
    expect(putCalls[4].value.keyHash).toBe(keyHash);
    expect(putCalls[4].value.captureId).toBe(captureId);
    expect(data[`adFreeOrders/${validOrderId}`].status).toBe('completed');
  });

  describe('PayPal capture id', () => {
    it('persists the capture id so an order can be found from a PayPal transaction id', async () => {
      // An order id and a capture id are different values. Support only ever
      // gets told the capture id, because that is what PayPal shows the buyer,
      // so without it stored there is no route back to the uid or entitlement.
      signInGoogle();
      const { data } = mockDb();
      vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());

      const res = await call({ orderId: validOrderId, requestId });
      expect(res.status).toBe(200);

      const record = data[`adFreeOrders/${validOrderId}`];
      expect(record.captureId).toBe(captureId);
      expect(record.captureId).not.toBe(validOrderId);
    });

    it('reads the capture id after capturing an order that was only approved', async () => {
      // The capture response is discarded; the id comes from the re-read order,
      // so both the already-completed and just-captured paths behave the same.
      signInGoogle();
      const { data } = mockDb();
      vi.spyOn(paypal, 'fetchPayPalOrder')
        .mockResolvedValueOnce(payPalOrder({ status: 'APPROVED', purchase_units: [{}] }))
        .mockResolvedValueOnce(payPalOrder());
      const capture = vi.spyOn(paypal, 'capturePayPalOrder').mockResolvedValue({});

      const res = await call({ orderId: validOrderId, requestId });
      expect(res.status).toBe(200);
      expect(capture).toHaveBeenCalledTimes(1);
      expect(data[`adFreeOrders/${validOrderId}`].captureId).toBe(captureId);
    });

    it('records the capture id on a rejected order, where support needs it most', async () => {
      // Money moved but the product did not match, so this record is the only
      // thing tying a real charge to an account that was never granted access.
      signInGoogle();
      const { data } = mockDb();
      vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(
        payPalOrder({
          purchase_units: [
            {
              description: 'Streamflix Ad-Free',
              custom_id: 'streamflix-adfree-v1',
              amount: { currency_code: 'USD', value: WRONG_AMOUNT },
              payments: { captures: [{ id: captureId, status: 'COMPLETED' }] }
            }
          ]
        })
      );

      const res = await call({ orderId: validOrderId, requestId });
      expect(res.status).toBe(400);
      expect(data[`adFreeOrders/${validOrderId}`].status).toBe('rejected');
      expect(data[`adFreeOrders/${validOrderId}`].captureId).toBe(captureId);
    });

    it('prefers the completed capture when PayPal reports more than one', async () => {
      signInGoogle();
      const { data } = mockDb();
      vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(
        payPalOrder({
          purchase_units: [
            {
              description: 'Streamflix Ad-Free',
              custom_id: 'streamflix-adfree-v1',
              amount: { currency_code: 'USD', value: '2.99' },
              payments: {
                captures: [
                  { id: 'DECLINED-CAPTURE-1', status: 'DECLINED' },
                  { id: captureId, status: 'COMPLETED' }
                ]
              }
            }
          ]
        })
      );

      const res = await call({ orderId: validOrderId, requestId });
      expect(res.status).toBe(200);
      // The declined attempt is not the money that moved.
      expect(data[`adFreeOrders/${validOrderId}`].captureId).toBe(captureId);
    });

    it('omits captureId rather than writing null when PayPal reports no capture', async () => {
      // A null child deletes the key in RTDB, and a record with an explicit
      // null reads as "we checked and there is none" instead of "not recorded".
      signInGoogle();
      const { putCalls, data } = mockDb();
      vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(
        payPalOrder({
          purchase_units: [
            {
              description: 'Streamflix Ad-Free',
              custom_id: 'streamflix-adfree-v1',
              amount: { currency_code: 'USD', value: '2.99' }
            }
          ]
        })
      );

      const res = await call({ orderId: validOrderId, requestId });
      expect(res.status).toBe(200);
      expect(data[`adFreeOrders/${validOrderId}`]).not.toHaveProperty('captureId');
      const orderWrites = putCalls.filter((c) => c.path === `adFreeOrders/${validOrderId}`);
      for (const write of orderWrites) {
        expect(write.value).not.toHaveProperty('captureId');
      }
    });

    it('keeps the capture id when resuming an already-captured order', async () => {
      // The resume path never calls PayPal again, so the id has to survive on
      // the record rather than being re-fetched.
      signInGoogle();
      const keyHash = 'c'.repeat(64);
      const { data } = mockDb({
        [`adFreeOrders/${validOrderId}`]: {
          uid,
          status: 'captured',
          requestId,
          keyHash,
          reservedAt: 4000,
          capturedAt: 5000,
          captureId
        }
      });
      const fetchOrder = vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());

      const res = await call({ orderId: validOrderId, requestId });
      expect(res.status).toBe(200);
      expect(fetchOrder).not.toHaveBeenCalled();
      expect(data[`adFreeOrders/${validOrderId}`].status).toBe('completed');
      expect(data[`adFreeOrders/${validOrderId}`].captureId).toBe(captureId);
    });

    it('leaves the account entitlement shape untouched', async () => {
      // accounts/$uid/adFree is client-readable and its .write rule enumerates
      // exactly these four fields for immutability. A fifth field would sit
      // outside that comparison and be rewritable by the account owner, so the
      // capture id stays on the server-only order record.
      signInGoogle();
      const { putCalls } = mockDb();
      vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());

      await call({ orderId: validOrderId, requestId });

      const accountWrite = putCalls.find((c) => c.path === `accounts/${uid}/adFree`);
      expect(Object.keys(accountWrite.value).sort()).toEqual([
        'activatedAt',
        'keyHash',
        'method',
        'orderId'
      ]);
    });
  });

  it('never returns or stores the raw purchase key', async () => {
    signInGoogle();
    const { putCalls } = mockDb();
    vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());

    const res = await call({ orderId: validOrderId, requestId });
    const raw = await res.text();

    expect(raw).not.toMatch(/SFXAD/);
    expect(JSON.stringify(putCalls)).not.toMatch(/SFXAD/);
  });

  it('captures an approved order exactly once and re-reads it before validating', async () => {
    signInGoogle();
    mockDb();
    const fetchOrder = vi
      .spyOn(paypal, 'fetchPayPalOrder')
      .mockResolvedValueOnce(payPalOrder({ status: 'APPROVED', purchase_units: [{}] }))
      .mockResolvedValueOnce(payPalOrder());
    const capture = vi.spyOn(paypal, 'capturePayPalOrder').mockResolvedValue({ status: 'COMPLETED' });

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(200);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(fetchOrder).toHaveBeenCalledTimes(2);
  });

  it('rejects a reservation lost to a concurrent request', async () => {
    signInGoogle();
    mockDb();
    vi.spyOn(firebaseAdminRest, 'firebaseRestPut').mockResolvedValue(
      new Response(null, { status: 412 })
    );
    const fetchOrder = vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe('order-already-used');
    expect(fetchOrder).not.toHaveBeenCalled();
  });

  it('rejects an order another request reserved moments ago', async () => {
    signInGoogle();
    mockDb({
      [`adFreeOrders/${validOrderId}`]: {
        uid,
        status: 'reserved',
        requestId: 'other-request-id-1',
        reservedAt: Date.now()
      }
    });
    const fetchOrder = vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe('order-already-used');
    expect(fetchOrder).not.toHaveBeenCalled();
  });

  it('takes over a stale reservation and reuses its key hash', async () => {
    signInGoogle();
    const staleKeyHash = 'a'.repeat(64);
    const { putCalls } = mockDb({
      [`adFreeOrders/${validOrderId}`]: {
        uid,
        status: 'reserved',
        requestId: 'abandoned-request-1',
        keyHash: staleKeyHash,
        reservedAt: Date.now() - 20 * 60 * 1000
      }
    });
    vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(200);

    expect(putCalls[0].value.status).toBe('reserved');
    expect(putCalls[0].value.requestId).toBe(requestId);
    expect(putCalls[0].value.keyHash).toBe(staleKeyHash);
    expect(putCalls[0].options.ifMatch).toBeTruthy();
    expect(putCalls.some((c) => c.path === `adFreeKeys/${staleKeyHash}`)).toBe(true);
  });

  it('resumes a captured order without contacting PayPal again', async () => {
    signInGoogle();
    const keyHash = 'b'.repeat(64);
    const { putCalls } = mockDb({
      [`adFreeOrders/${validOrderId}`]: {
        uid,
        status: 'captured',
        requestId,
        keyHash,
        reservedAt: 1000,
        capturedAt: 2000
      }
    });
    const fetchOrder = vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());
    const capture = vi.spyOn(paypal, 'capturePayPalOrder').mockResolvedValue(payPalOrder());

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(fetchOrder).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();

    expect(putCalls.map((c) => c.path)).toEqual([
      `accounts/${uid}/adFree`,
      `adFreeKeys/${keyHash}`,
      `adFreeOrders/${validOrderId}`
    ]);
    expect(putCalls[2].value.status).toBe('completed');
  });

  it('returns idempotent success when the completed order already has a matching entitlement', async () => {
    signInGoogle();
    const keyHash = 'c'.repeat(64);
    const { putCalls } = mockDb({
      [`adFreeOrders/${validOrderId}`]: { uid, status: 'completed', keyHash, completedAt: 5000 },
      [`accounts/${uid}/adFree`]: {
        keyHash,
        activatedAt: 5000,
        method: 'purchase',
        orderId: validOrderId
      }
    });

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, idempotent: true, activatedAt: 5000 });
    expect(putCalls).toHaveLength(0);
  });

  it('repairs a completed order whose entitlement never landed', async () => {
    signInGoogle();
    const keyHash = 'd'.repeat(64);
    const { putCalls } = mockDb({
      [`adFreeOrders/${validOrderId}`]: {
        uid,
        status: 'completed',
        keyHash,
        reservedAt: 4000,
        completedAt: 5000
      }
    });
    const capture = vi.spyOn(paypal, 'capturePayPalOrder').mockResolvedValue(payPalOrder());

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, idempotent: true, activatedAt: 5000 });
    expect(capture).not.toHaveBeenCalled();

    expect(putCalls.map((c) => c.path)).toEqual([
      `accounts/${uid}/adFree`,
      `adFreeKeys/${keyHash}`,
      `adFreeOrders/${validOrderId}`
    ]);
    expect(putCalls[0].value.keyHash).toBe(keyHash);
  });

  it('refuses to overwrite an entitlement that belongs to a different activation', async () => {
    signInGoogle();
    mockDb({
      [`adFreeOrders/${validOrderId}`]: { uid, status: 'completed', completedAt: 5000 },
      [`accounts/${uid}/adFree`]: {
        keyHash: 'e'.repeat(64),
        activatedAt: 1,
        method: 'key'
      }
    });

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe('already-ad-free');
  });

  it('does not take payment from an account that is already ad-free', async () => {
    signInGoogle();
    mockDb({
      [`accounts/${uid}/adFree`]: { keyHash: 'f'.repeat(64), activatedAt: 1, method: 'key' }
    });
    const fetchOrder = vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());
    const capture = vi.spyOn(paypal, 'capturePayPalOrder').mockResolvedValue(payPalOrder());

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe('already-ad-free');
    expect(fetchOrder).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it('fails closed when the entitlement read is unavailable', async () => {
    signInGoogle();
    let seq = 0;
    vi.spyOn(firebaseAdminRest, 'firebaseRestGet').mockImplementation(async (path) => {
      seq += 1;
      if (path.startsWith('accounts/')) throw new Error('Firebase REST GET failed: HTTP 503');
      return { value: null, etag: `etag-${seq}` };
    });
    vi.spyOn(firebaseAdminRest, 'firebaseRestPut').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const fetchOrder = vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());

    const res = await onRequest({ request: post({ orderId: validOrderId, requestId }), env: mockEnv });
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe('activation-pending');
    expect(fetchOrder).not.toHaveBeenCalled();
  });

  it('releases the reservation when PayPal does not know the order', async () => {
    signInGoogle();
    const { putCalls } = mockDb();
    vi.spyOn(paypal, 'fetchPayPalOrder').mockRejectedValue(
      new Error('PayPal order fetch failed: HTTP 404')
    );

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('order-invalid');

    // The reservation is deleted so a valid order id can be retried later.
    const last = putCalls[putCalls.length - 1];
    expect(last.path).toBe(`adFreeOrders/${validOrderId}`);
    expect(last.value).toBeNull();
    expect(last.options.ifMatch).toBeTruthy();
  });

  it('reports a provider outage without leaking PayPal internals', async () => {
    signInGoogle();
    mockDb();
    vi.spyOn(paypal, 'fetchPayPalOrder').mockRejectedValue(
      new Error('PayPal token exchange failed: HTTP 500 client_secret invalid')
    );

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(503);
    const raw = await res.text();
    expect(JSON.parse(raw).reason).toBe('payment-provider-unavailable');
    expect(raw).not.toMatch(/client_secret/);
  });

  it('rejects an order that has not been approved', async () => {
    signInGoogle();
    mockDb();
    vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder({ status: 'CREATED' }));
    const capture = vi.spyOn(paypal, 'capturePayPalOrder').mockResolvedValue(payPalOrder());

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('payment-not-completed');
    expect(capture).not.toHaveBeenCalled();
  });

  it('marks a captured but mismatched order as rejected instead of granting access', async () => {
    signInGoogle();
    const { putCalls, data } = mockDb();
    vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(
      payPalOrder({
        purchase_units: [
          {
            description: 'Streamflix Ad-Free',
            custom_id: 'streamflix-adfree-v1',
            amount: { currency_code: 'USD', value: WRONG_AMOUNT }
          }
        ]
      })
    );

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('payment-mismatch');

    expect(data[`adFreeOrders/${validOrderId}`].status).toBe('rejected');
    expect(putCalls.some((c) => c.path === `accounts/${uid}/adFree`)).toBe(false);
    expect(putCalls.some((c) => c.path.startsWith('adFreeKeys/'))).toBe(false);
  });

  it('never replays a previously rejected order', async () => {
    signInGoogle();
    mockDb({
      [`adFreeOrders/${validOrderId}`]: {
        uid,
        status: 'rejected',
        reason: 'payment-mismatch',
        capturedAt: 9000
      }
    });
    const fetchOrder = vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe('payment-mismatch');
    expect(fetchOrder).not.toHaveBeenCalled();
  });

  it('reports activation-pending when the entitlement write fails after capture', async () => {
    signInGoogle();
    mockDb();
    vi.spyOn(paypal, 'fetchPayPalOrder').mockResolvedValue(payPalOrder());
    vi.spyOn(firebaseAdminRest, 'firebaseRestPut').mockImplementation(async (path) => {
      if (path.startsWith('accounts/')) return new Response(null, { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const res = await call({ orderId: validOrderId, requestId });
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe('activation-pending');
  });
});
