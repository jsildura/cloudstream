# Task 04: PayPal Order And Purchase APIs

## Purpose

Implement the PayPal purchase path without trusting browser-supplied prices or order metadata. The browser asks the server to create an order; the server captures and validates it before granting entitlement.

## Files

Create:

- `functions/api/create-adfree-order.js`
- `functions/api/purchase-adfree.js`

Modify if needed:

- `functions/lib/paypal.js` from Task 02.
- `.env.example` for `VITE_PAYPAL_CLIENT_ID` and `PAYPAL_ENV` documentation.

## Required Environment

Server-only Cloudflare secrets:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENV` set to `sandbox` during development and `live` only for production.
- `AD_KEY_HMAC_SECRET`
- `FIREBASE_SERVICE_ACCOUNT`

Public build variable:

- `VITE_PAYPAL_CLIENT_ID`

Never put the client secret in a Vite variable.

## `POST /api/create-adfree-order`

Request body may be empty or contain only a client request identifier. The server owns the price.

Steps:

1. Handle CORS and `OPTIONS`.
2. Verify the Firebase ID token and Google provider.
3. Reject if `/accounts/<uid>/adFree` already exists.
4. Call PayPal `POST /v2/checkout/orders` with exactly one purchase unit:

```json
{
  "intent": "CAPTURE",
  "purchase_units": [
    {
      "description": "Streamflix Ad-Free",
      "custom_id": "streamflix-adfree-v1",
      "amount": { "currency_code": "USD", "value": "2.99" }
    }
  ]
}
```

5. Return only `{ "ok": true, "orderId": "..." }`.

## `POST /api/purchase-adfree`

Request:

```json
{ "orderId": "<PayPal order id>" }
```

Steps:

1. Verify the Firebase ID token and Google provider.
2. Validate the order ID format and body size.
3. Reserve `/adFreeOrders/<orderId>` with an ETag and `requestId`. A different completed request must be rejected; a same-request retry must resume.
4. Get the PayPal access token.
5. Fetch the order. If it is not completed, call the capture endpoint exactly once, then fetch it again.
6. Validate completed status, exactly one purchase unit, `$2.99`, `USD`, and `custom_id: streamflix-adfree-v1`.
7. Reject an account that became ad-free between order creation and approval.
8. Generate a fresh key hash for the purchase. The raw key is not returned.
9. Conditionally create `/accounts/<uid>/adFree`.
10. Finalize `/adFreeOrders/<orderId>` with UID, key hash, completion time, and request ID.
11. Store the generated key record under `/adFreeKeys/<hash>` as redeemed with `source: "purchase"`.
12. Make retries reconcile by `requestId`; never capture twice or create a second entitlement.
13. Return success only after the account, order, and key records are consistent.

## Failure Handling

Use stable client reasons such as:

- `unauthorized`
- `not-google-account`
- `already-ad-free`
- `order-invalid`
- `order-already-used`
- `payment-not-completed`
- `payment-mismatch`
- `payment-provider-unavailable`
- `activation-pending`

Do not expose PayPal access-token errors, service-account details, or internal stack traces.

## Tests

Mock PayPal and Firebase REST calls. Cover:

- Server-created order always uses `$2.99 USD`.
- Client cannot override amount, currency, or product.
- Missing/invalid token.
- Existing entitlement.
- PayPal timeout and non-2xx responses.
- Already completed order.
- Capture flow for an approved order.
- Wrong amount, currency, status, product, or purchase-unit count.
- Two users submitting the same order.
- Same request retry after a partial write.
- No duplicate key or entitlement.

Run:

```bash
npm run test -- --run functions/api/create-adfree-order
npm run test -- --run functions/api/purchase-adfree
npm run build
```

## Completion Checklist

- [ ] The browser cannot choose the price.
- [ ] PayPal capture/validation is server-side.
- [ ] Order replay is rejected.
- [ ] Partial failures are retryable and idempotent.
- [ ] Sandbox configuration is documented.
