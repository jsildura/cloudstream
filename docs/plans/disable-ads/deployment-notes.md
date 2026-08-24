# Streamflix Disable Ads & Ad-Free System Deployment Notes

> **Price is defined once.** `ADFREE_PRICE` in
> [functions/lib/paypal.js](../../../functions/lib/paypal.js) is what PayPal is asked
> for *and* what the capture is validated against, so the two cannot drift and take
> money the validator then rejects. `ADFREE_PRICE_LABEL` in
> [src/utils/adGating.js](../../../src/utils/adGating.js) only labels it — the browser
> bundle cannot import from a Pages Function, so both must be changed together, along
> with the amount literals in the three test files that pin them. The label lives in
> `adGating.js` rather than beside the checkout UI because two surfaces quote it now:
> the Disable Ads pane and the ad-free offer in the adblock notice.
>
> To rehearse live checkout for a token charge, set both to `0.01` / `$0.01`. **Not
> `0.00`:** PayPal rejects a zero-amount `CAPTURE` order with HTTP 422
> `UNPROCESSABLE_ENTITY` / `CANNOT_BE_ZERO_OR_NEGATIVE` ("Must be greater than zero"),
> so no order id is minted and there is nothing to approve. Fees consume the whole
> cent, so expect $0.00 net — judge success from the transaction record, not the
> balance. Anyone who buys at the reduced price keeps lifetime ad-free.

## 1. Overview
The Streamflix Disable Ads system provides verified, permanent ad suppression backed by:
- **Client Gate (`src/utils/adGating.js`, `src/contexts/AdFreeContext.jsx`)**: Fail-closed entitlement evaluator and real-time Firebase RTDB listener.
- **Server API (`functions/api/*`)**: Cloudflare Pages Functions with Web Crypto token verification, atomic ETag key redemption, and PayPal order capture.
- **Operator CLI (`scripts/generate-adfree-keys.mjs`)**: Secure batch key generation with HMAC-SHA256 hashing.
- **Database Rules (`database.rules.json`)**: Server-locked `/adFreeKeys` and `/adFreeOrders` with client read-only `/accounts/$uid/adFree`.

---

## 2. Environment Variables & Secrets

### Cloudflare Pages Functions Environment
Configure the following secrets in **Cloudflare Dashboard -> Pages -> Settings -> Environment Variables**:

| Variable | Type | Description |
|---|---|---|
| `AD_KEY_HMAC_SECRET` | Secret | High-entropy random hex secret (min 32 chars) for HMAC-SHA256 key hashing |
| `FIREBASE_PROJECT_ID` | Variable | Firebase project ID (e.g. `streamflix-chat`) |
| `FIREBASE_DATABASE_URL` | Variable | Firebase RTDB URL (e.g. `https://streamflix-chat-default-rtdb.firebaseio.com`) |
| `FIREBASE_SERVICE_ACCOUNT` | Secret | Google Service Account JSON (or base64 encoded JSON) with RTDB admin rights |
| `PAYPAL_CLIENT_ID` | Variable | PayPal REST API client ID |
| `PAYPAL_CLIENT_SECRET` | Secret | PayPal REST API client secret |
| `PAYPAL_ENV` | Variable | **`live`** for real payments. Any other value — including unset — means sandbox. |

### ⚠️ `PAYPAL_ENV` must be exactly `live`

`PAYPAL_ENV` is the **single** switch for both halves of the flow, and it does not
accept `production`:

- [functions/lib/paypal.js](../../../functions/lib/paypal.js) — `paypalBaseUrl()` uses
  `env?.PAYPAL_ENV === 'live'` to pick `https://api-m.paypal.com`, else
  `https://api-m.sandbox.paypal.com`.
- [functions/lib/paypal.js](../../../functions/lib/paypal.js) — `paypalCheckoutUrl()`
  uses the same test to pick `https://www.paypal.com`, else
  `https://www.sandbox.paypal.com`, and `createPayPalOrder()` returns that URL as
  `checkoutUrl` alongside the order id.

So `PAYPAL_ENV=production` fails **silently into sandbox**: no error, no warning, and
no real orders. Going live is one variable plus a redeploy:

- `PAYPAL_ENV=live` on the Pages Function environment.

The browser does **not** decide the checkout host. `/api/create-adfree-order` returns
`checkoutUrl`, and [AdFreeSettings.jsx](../../../src/components/settings/AdFreeSettings.jsx)
opens that after checking it against the two real PayPal hosts. The host and the order
id that must match it therefore come from one variable and cannot drift apart.

`VITE_PAYPAL_ENV` is **no longer required** and should be left unset. It survives only
as a fallback for a browser holding a bundle newer than the deployed Function, and is
never consulted when the server supplies `checkoutUrl`.

> **Historical note.** Before `checkoutUrl` existed the browser rebuilt the URL from
> `VITE_PAYPAL_ENV`, a build-time Vite variable. Setting `PAYPAL_ENV=live` without
> also rebuilding with `VITE_PAYPAL_ENV=live` sent a **live** order id to
> **sandbox**'s `checkoutnow`, where the token does not exist — PayPal answered
> "Things don't appear to be working at the moment" with no error code, nothing in
> any log, and no charge. That failure mode is gone.

### Local development

`wrangler pages dev` reads secrets from **`.dev.vars`** (gitignored), not `.env`, and
picks the three non-secret values up from `wrangler.jsonc` `"vars"`. See
[.dev.vars.example](../../../.dev.vars.example) for the names and
[sandbox-test-runbook.md](sandbox-test-runbook.md) for the end-to-end sandbox
procedure.

`npm run dev` (Vite) does **not** execute `functions/` — every `/api/*` call returns
`index.html` instead of JSON. Use `npm run preview:pages` when testing the ad-free
API locally.

---

## 3. Database Rules Deployment

Deploy the standard security rules to Firebase Realtime Database:

```bash
firebase deploy --only database
```

### Transitional Phase (if migrating legacy users)
To test or deploy during multi-phase rollouts, use the transitional rules:
```bash
firebase deploy --only database --rules database.rules.transitional.json
```

---

## 4. Key Management & Operator CLI

### Generating Keys via CLI
Run the secure key generation script using your operator credentials:

```bash
# Generate 5 ad-free keys with a memo
npm run adfree:generate -- --count 5 --memo "Launch promo batch"

# Output format:
# SFXAD-ABCDE-FGHIJ-KLMNO
# SFXAD-PQRST-UVWXY-Z1234
# ...
```

### Generating Keys via Admin API
Authorized Google accounts with `globalChatAdmin: true` claims can call:

```bash
curl -X POST https://streamflix.stream/api/generate-adfree-keys \
  -H "Authorization: Bearer <ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"count": 5, "memo": "Admin generated batch"}'
```

### Generating Keys in the App
Signed-in accounts with `globalChatAdmin: true` also get an **Admin: Generate Keys**
card inside Settings → Disable Ads (visible whether or not the admin is themselves
ad-free). It accepts a count of 1–25 and lists the generated keys with a per-key
Copy button.

Keys are held in component state only — they are never written to `localStorage`,
Firebase, or the server in raw form, and they are gone as soon as the panel closes.
Copy them before dismissing it.

---

## 5. Verification Results

Last re-run: 2026-08-23.

| Test Suite | Tests Run | Result |
|---|---|---|
| Client Unit Tests (`npm run test:unit`) | 492 tests (47 test files) | **PASSED** |
| Functions & API Tests (`npx vitest run functions/`) | 83 tests (9 test files) | **PASSED** |
| Key Generator CLI Tests (`npm run test:generate-keys-script`) | 7 tests (1 test file) | **PASSED** |
| ESLint Check (`npm run lint`) | Full codebase | **0 ERRORS**, 19 pre-existing warnings |
| Production Build (`npm run build`) | Vite + Workbox PWA | **SUCCESS** |
| Standard RTDB Rules Tests (`npm run test:rules`) | 102 tests (2 test files) | **NOT RUN** — emulator unavailable |
| Transitional RTDB Rules Tests (`npm run test:rules:transitional`) | 102 tests (2 test files) | **NOT RUN** — emulator unavailable |

Caveats, so these rows are not over-read:

- `npm run test:unit` is `vitest run src` only. `functions/` and `scripts/` are not
  included in `npm test` and must be run explicitly, as in rows 2 and 3.
- The 19 lint warnings are all pre-existing `react-hooks/exhaustive-deps` warnings in
  unrelated files. No ad-free file produces one.

### ⚠️ Blocker before deploying rules

Both RTDB rules suites failed to start on the verification machine. The Firebase
Database emulator aborts during JVM startup:

```
java.io.IOException: Unable to establish loopback connection
  Caused by: java.net.SocketException: Invalid argument: connect
    at java.base/sun.nio.ch.UnixDomainSockets.connect0(Native Method)
```

That happens while Netty opens its internal selector pipe — before the emulator
binds any port — so it is not a port conflict with a stray emulator, and it
reproduces on OpenJDK 21.0.12 regardless of command sandboxing. It is a host
restriction on `AF_UNIX` loopback sockets, not a repository problem.

**102 rules assertions are therefore unverified**: 92 in
`tests/database/database.rules.test.js` and 10 in
`tests/database/adfree.rules.test.js` (the latter covering `/accounts/$uid/adFree`,
`/adFreeKeys`, and `/adFreeOrders`). The entire server-only write model for this
feature rests on those rules.

Run both suites on a machine with a working Database emulator and confirm they are
green **before** running either of:

```bash
npm run deploy:firebase-rules
```

```bash
npm run deploy:firebase-rules:transitional
```

