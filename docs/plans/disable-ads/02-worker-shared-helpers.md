# Task 02: Cloudflare Worker Shared Helpers

## Purpose

Build the reusable backend security and integration helpers before writing endpoints. The helpers keep token verification, Firebase REST access, CORS, HMAC, key formatting, and PayPal behavior consistent across all endpoints.

## Files

Create under `functions/lib/`:

- `cors.js`
- `firebaseAuth.js`
- `firebaseAdminRest.js`
- `adfreeKeys.js`
- `paypal.js`

Create tests for each helper under `functions/lib/` using the repository's existing test runner conventions. If the current Vitest configuration does not include `functions`, update the test include configuration minimally and document why.

## Runtime Restrictions

- These modules run in Cloudflare Pages Functions.
- Do not import `firebase-admin` here.
- Use Web Crypto APIs such as `crypto.subtle` and `crypto.getRandomValues`.
- Do not use Node-only `fs`, `path`, `Buffer`, or `jsonwebtoken` in Worker code.
- The CLI in Task 03 may use Node and `firebase-admin`; that is separate code.

## Interfaces To Implement

Use named exports. Keep signatures stable because later tasks depend on them.

### `cors.js`

Implement:

```js
export function corsHeaders(request, env): Headers;
export function jsonResponse(body, status, request, env): Response;
export function handleOptions(request, env): Response | null;
```

Requirements:

- Handle `OPTIONS` requests.
- Allow the deployed app origin from configuration, not arbitrary origins for authenticated mutations.
- Include `Content-Type` and `Authorization` in allowed headers.
- Include `POST, OPTIONS` in allowed methods.

### `firebaseAuth.js`

Implement:

```js
export async function verifyFirebaseIdToken(request, env): Promise<{
  uid: string,
  provider: string,
  claims: object
}>;
```

Requirements:

- Read `Authorization: Bearer <token>`.
- Decode the JWT safely.
- Fetch Google secure-token certificates from the documented certificate URL.
- Cache certificates until their `Cache-Control` expiry.
- Verify signature, issuer `https://securetoken.google.com/streamflix-chat`, audience `streamflix-chat`, and expiration.
- Return custom claims, including `globalChatAdmin`.
- Throw errors that endpoint handlers can convert to a generic `401` response. Do not expose cryptographic details to clients.

### `firebaseAdminRest.js`

Implement:

```js
export async function firebaseRestGet(path, env, options = {}): Promise<{ value: any, etag: string | null }>;
export async function firebaseRestPut(path, value, env, options = {}): Promise<Response>;
export async function firebaseRestPatch(updates, env): Promise<Response>;
```

Requirements:

- Build the RTDB URL from the configured database URL.
- Mint a Google OAuth service-account token using Web Crypto JWT signing.
- Cache the OAuth token until shortly before expiration.
- Send `X-Firebase-ETag: true` when requested.
- Support `If-Match` for conditional writes.
- Preserve the response status so callers can detect HTTP `412` conflicts.
- Never log the service account JSON, OAuth token, or Authorization header.

### `adfreeKeys.js`

Implement:

```js
export function normalizeRawKey(value): string;
export function generateRawKey(randomSource = crypto): string;
export async function computeKeyHash(rawKey, hmacSecret): Promise<string>;
```

Requirements:

- Accept only the documented `SFXAD-XXXXX-XXXXX-XXXXX` shape.
- Normalize case and separators consistently before hashing.
- Use a documented cryptographic alphabet and exact segment length.
- Use HMAC-SHA256, not plain SHA-256.
- Return lowercase hexadecimal hash output.
- Reject missing, oversized, or malformed input.

### `paypal.js`

Implement:

```js
export function paypalBaseUrl(env): string;
export function paypalCheckoutUrl(env, orderId): string;
export function resolveAppOrigin(env, request): string | null;
export async function getPayPalAccessToken(env): Promise<string>;
export async function createPayPalOrder(env, uid, request): Promise<{ orderId: string, checkoutUrl: string }>;
export async function capturePayPalOrder(env, orderId): Promise<object>;
export async function fetchPayPalOrder(env, orderId): Promise<object>;
export function extractCaptureId(order): string | null;
export function validateAdFreePayPalOrder(order): void;
```

Requirements:

- Select sandbox or live using `PAYPAL_ENV`, for **both** the API base URL and the
  buyer-facing checkout host. `createPayPalOrder` returns `checkoutUrl` so the browser
  never infers the environment itself — a client-side guess can disagree with the
  server and send an order id to a host where it does not exist.
- Derive `return_url` from `resolveAppOrigin`, which uses the routed host rather than a
  caller-supplied `Origin` header.
- Send `shipping_preference: NO_SHIPPING` and `user_action: PAY_NOW`; the entitlement
  is digital and the default (`GET_FROM_FILE`) traps the buyer on order review.
- Expose the capture id via `extractCaptureId` — it is separate from the order id and
  is the only one of the two the buyer ever sees.

- Keep amount, currency, and product identifier server-owned.
- Cache PayPal OAuth tokens until shortly before expiration.
- Treat non-2xx PayPal responses as errors.
- Validate exactly `$2.99 USD`, completed status, one intended purchase unit, and the expected product identifier.

## Tests

Write tests for:

- Missing, malformed, expired, wrong-audience, wrong-issuer, and wrong-provider Firebase tokens.
- Certificate cache reuse and expiry.
- CORS preflight and Authorization header presence.
- HMAC determinism and raw-key normalization.
- Key rejection for malformed and oversized values.
- PayPal sandbox/live URL selection.
- PayPal amount, currency, status, unit-count, and product validation.
- Firebase REST ETag and `If-Match` request construction.
- OAuth token caching without logging secrets.

Run:

```bash
npm run test -- --run functions/lib
```

## Completion Checklist

- [ ] Every helper is Worker-compatible.
- [ ] Every helper has focused tests.
- [ ] Authenticated CORS includes `Authorization`.
- [ ] No secret appears in source, test output, or fixture files.
- [ ] HTTP `412` is available to endpoint callers.

## Handoff To Task 03

Task 03 uses `verifyFirebaseIdToken`, Firebase REST helpers, and key helpers exactly as defined here. Do not change their exported names in endpoint work without updating all dependent task files.
