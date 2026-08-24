import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  paypalBaseUrl,
  paypalCheckoutUrl,
  getPayPalAccessToken,
  createPayPalOrder,
  capturePayPalOrder,
  fetchPayPalOrder,
  extractCaptureId,
  validateAdFreePayPalOrder,
  resolveAppOrigin,
  _resetPayPalTokenCacheForTesting
} from './paypal.js';

describe('functions/lib/paypal', () => {
  beforeEach(() => {
    _resetPayPalTokenCacheForTesting();
    vi.restoreAllMocks();
  });

  const mockEnv = {
    PAYPAL_CLIENT_ID: 'mock-client-id',
    PAYPAL_CLIENT_SECRET: 'mock-client-secret',
    PAYPAL_ENV: 'sandbox'
  };

  describe('paypalBaseUrl', () => {
    it('returns sandbox url for non-live env', () => {
      expect(paypalBaseUrl({ PAYPAL_ENV: 'sandbox' })).toBe('https://api-m.sandbox.paypal.com');
      expect(paypalBaseUrl({})).toBe('https://api-m.sandbox.paypal.com');
    });

    it('returns live url for live env', () => {
      expect(paypalBaseUrl({ PAYPAL_ENV: 'live' })).toBe('https://api-m.paypal.com');
    });
  });

  describe('getPayPalAccessToken', () => {
    it('fetches and caches access token', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ access_token: 'token-abc', expires_in: 3600 })
        })
      );

      const token1 = await getPayPalAccessToken(mockEnv);
      const token2 = await getPayPalAccessToken(mockEnv);

      expect(token1).toBe('token-abc');
      expect(token2).toBe('token-abc');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('throws when credentials missing', async () => {
      await expect(getPayPalAccessToken({})).rejects.toThrow(/missing/i);
    });
  });

  describe('createPayPalOrder', () => {
    it('creates server order with USD 2.99 and streamflix-adfree-v1', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'token-abc' })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'ORDER-12345' })
          })
      );

      const result = await createPayPalOrder(mockEnv, 'user-uid-1');
      expect(result).toEqual({
        orderId: 'ORDER-12345',
        checkoutUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-12345'
      });

      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://api-m.sandbox.paypal.com/v2/checkout/orders',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"value":"2.99"')
        })
      );
    });

    it('suppresses shipping so checkout cannot loop on the review step', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'token-abc' })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'ORDER-12345' })
          })
      );

      await createPayPalOrder(mockEnv, 'user-uid-1');
      const body = JSON.parse(fetch.mock.calls[1][1].body);

      // Omitting these lets PayPal default to GET_FROM_FILE, which renders a
      // shipping address for a digital entitlement and traps the buyer in
      // "Continue to Review Order" forever.
      expect(body.application_context).toMatchObject({
        brand_name: 'Streamflix',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW'
      });
    });

    it('sends a return_url derived from the routed host, not the Origin header', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token-abc' }) })
          .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'ORDER-12345' }) })
      );

      // A caller-supplied Origin pointing at an attacker domain must be ignored.
      const request = {
        url: 'https://streamflix.stream/api/create-adfree-order',
        headers: { get: () => 'https://evil.example' }
      };

      await createPayPalOrder(mockEnv, 'user-uid-1', request);
      const ctx = JSON.parse(fetch.mock.calls[1][1].body).application_context;

      // Without a return_url PayPal has nowhere to send the buyer after
      // approval, so it re-renders checkout and nothing is ever captured.
      // Extensionless: Cloudflare Pages 308s `/x.html` to `/x`.
      expect(ctx.return_url).toBe('https://streamflix.stream/paypal-return');
      expect(ctx.cancel_url).toBe('https://streamflix.stream/paypal-return?cancelled=1');
    });

    it('omits return_url when no https origin can be resolved', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token-abc' }) })
          .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'ORDER-12345' }) })
      );

      // Local wrangler is plain http; PayPal rejects non-HTTPS return URLs, so
      // the order must go out without one rather than with an invalid value.
      await createPayPalOrder(mockEnv, 'user-uid-1', {
        url: 'http://localhost:8788/api/create-adfree-order'
      });
      const ctx = JSON.parse(fetch.mock.calls[1][1].body).application_context;

      expect(ctx.return_url).toBeUndefined();
      expect(ctx.shipping_preference).toBe('NO_SHIPPING');
    });
  });

  describe('resolveAppOrigin', () => {
    it('prefers configured APP_URL over the request host', () => {
      expect(
        resolveAppOrigin({ APP_URL: 'https://streamflix.stream' }, {
          url: 'https://6b5ad01e.streamflix-stream.pages.dev/api/create-adfree-order'
        })
      ).toBe('https://streamflix.stream');
    });

    it('takes the first entry of a comma-separated ALLOWED_ORIGIN', () => {
      expect(
        resolveAppOrigin({ ALLOWED_ORIGIN: 'https://streamflix.stream, https://a.pages.dev' })
      ).toBe('https://streamflix.stream');
    });

    it('ignores a non-https or malformed configured value', () => {
      expect(resolveAppOrigin({ APP_URL: 'http://streamflix.stream' })).toBeNull();
      expect(resolveAppOrigin({ APP_URL: 'not a url' })).toBeNull();
    });

    it('falls back to the https request origin', () => {
      expect(resolveAppOrigin({}, { url: 'https://streamflix.stream/api/x' })).toBe(
        'https://streamflix.stream'
      );
    });

    it('returns null for http requests and when nothing is available', () => {
      expect(resolveAppOrigin({}, { url: 'http://localhost:8788/api/x' })).toBeNull();
      expect(resolveAppOrigin({}, null)).toBeNull();
    });
  });

  describe('capturePayPalOrder', () => {
    it('captures order with OAuth authorization', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'token-abc' })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'ORDER-12345', status: 'COMPLETED' })
          })
      );

      const result = await capturePayPalOrder(mockEnv, 'ORDER-12345');
      expect(result).toEqual({ id: 'ORDER-12345', status: 'COMPLETED' });
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-12345/capture',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('fetchPayPalOrder', () => {
    it('fetches order status with OAuth authorization', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'token-abc' })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'ORDER-12345', status: 'COMPLETED' })
          })
      );

      const result = await fetchPayPalOrder(mockEnv, 'ORDER-12345');
      expect(result).toEqual({ id: 'ORDER-12345', status: 'COMPLETED' });
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-12345',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('paypalCheckoutUrl', () => {
    it('points at the live checkout host only when PAYPAL_ENV is exactly live', () => {
      expect(paypalCheckoutUrl({ PAYPAL_ENV: 'live' }, 'ORDER-1')).toBe(
        'https://www.paypal.com/checkoutnow?token=ORDER-1'
      );
      expect(paypalCheckoutUrl({ PAYPAL_ENV: 'sandbox' }, 'ORDER-1')).toBe(
        'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1'
      );
      // Anything other than the exact string must not reach live money.
      expect(paypalCheckoutUrl({ PAYPAL_ENV: 'LIVE' }, 'ORDER-1')).toContain('sandbox');
      expect(paypalCheckoutUrl({}, 'ORDER-1')).toContain('sandbox');
    });

    it('agrees with paypalBaseUrl for the same env', () => {
      // The bug this pairing prevents: an order created against the live API and
      // approved on the sandbox host, which fails with no error and no charge.
      for (const env of [{ PAYPAL_ENV: 'live' }, { PAYPAL_ENV: 'sandbox' }, {}]) {
        const apiIsLive = paypalBaseUrl(env) === 'https://api-m.paypal.com';
        const checkoutIsLive = paypalCheckoutUrl(env, 'X') === 'https://www.paypal.com/checkoutnow?token=X';
        expect(checkoutIsLive).toBe(apiIsLive);
      }
    });

    it('encodes the order id', () => {
      expect(paypalCheckoutUrl({}, 'a b&c')).toBe(
        'https://www.sandbox.paypal.com/checkoutnow?token=a%20b%26c'
      );
    });
  });

  describe('extractCaptureId', () => {
    const withCaptures = (captures) => ({
      id: 'ORDER-12345',
      status: 'COMPLETED',
      purchase_units: [{ payments: { captures } }]
    });

    it('returns the capture id, which is never the order id', () => {
      const order = withCaptures([{ id: '58J176263B618532M', status: 'COMPLETED' }]);
      // The buyer's transaction history shows this, not order.id — the two are
      // different identifiers and confusing them looks like a payment bug.
      expect(extractCaptureId(order)).toBe('58J176263B618532M');
      expect(extractCaptureId(order)).not.toBe(order.id);
    });

    it('prefers the COMPLETED capture over earlier attempts', () => {
      expect(
        extractCaptureId(
          withCaptures([
            { id: 'PENDING-1', status: 'PENDING' },
            { id: 'DONE-1', status: 'COMPLETED' }
          ])
        )
      ).toBe('DONE-1');
    });

    it('falls back to the first capture when none is marked COMPLETED', () => {
      expect(extractCaptureId(withCaptures([{ id: 'PENDING-1', status: 'PENDING' }]))).toBe(
        'PENDING-1'
      );
    });

    it('returns null for an order with no capture rather than inventing one', () => {
      // An APPROVED-but-uncaptured order has no transaction id yet, and a
      // caller must be able to tell that apart from a real value.
      expect(extractCaptureId({ purchase_units: [{ amount: { value: '2.99' } }] })).toBeNull();
      expect(extractCaptureId(withCaptures([]))).toBeNull();
      expect(extractCaptureId(withCaptures([{ status: 'COMPLETED' }]))).toBeNull();
    });

    it('survives malformed and missing payloads', () => {
      expect(extractCaptureId(null)).toBeNull();
      expect(extractCaptureId(undefined)).toBeNull();
      expect(extractCaptureId({})).toBeNull();
      expect(extractCaptureId({ purchase_units: [] })).toBeNull();
      expect(extractCaptureId({ purchase_units: [{ payments: { captures: 'nope' } }] })).toBeNull();
    });
  });

  describe('validateAdFreePayPalOrder', () => {
    const validOrder = {
      id: 'ORDER-12345',
      status: 'COMPLETED',
      purchase_units: [
        {
          description: 'Streamflix Ad-Free',
          custom_id: 'streamflix-adfree-v1',
          amount: {
            currency_code: 'USD',
            value: '2.99'
          }
        }
      ]
    };

    it('passes for valid order', () => {
      expect(() => validateAdFreePayPalOrder(validOrder)).not.toThrow();
    });

    it('throws for non-completed order', () => {
      expect(() =>
        validateAdFreePayPalOrder({ ...validOrder, status: 'APPROVED' })
      ).toThrow(/status/i);
    });

    it('throws for amount mismatch', () => {
      const wrongAmount = JSON.parse(JSON.stringify(validOrder));
      wrongAmount.purchase_units[0].amount.value = '1.99';
      expect(() => validateAdFreePayPalOrder(wrongAmount)).toThrow(/amount mismatch/i);
    });

    it('throws for currency mismatch', () => {
      const wrongCurrency = JSON.parse(JSON.stringify(validOrder));
      wrongCurrency.purchase_units[0].amount.currency_code = 'EUR';
      expect(() => validateAdFreePayPalOrder(wrongCurrency)).toThrow(/amount mismatch/i);
    });

    it('throws for multiple purchase units', () => {
      expect(() =>
        validateAdFreePayPalOrder({
          ...validOrder,
          purchase_units: [validOrder.purchase_units[0], validOrder.purchase_units[0]]
        })
      ).toThrow(/purchase unit/i);
    });
  });
});
