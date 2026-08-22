# Task 03: Key Generation And Key Redemption API

## Purpose

Implement the non-PayPal activation path: administrators generate raw keys, and a signed-in Google user redeems one key. Redemption must be account-bound and concurrency-safe.

## Files

Create:

- `functions/api/generate-adfree-keys.js`
- `functions/api/redeem-key.js`
- `scripts/generate-adfree-keys.mjs`
- `scripts/generate-adfree-keys.test.js`

Modify:

- `package.json` to add `adfree:generate`.

## Endpoint Contract

### `POST /api/generate-adfree-keys`

Request:

```json
{ "count": 10 }
```

Requirements:

- Require a valid Firebase ID token.
- Require `firebase.sign_in_provider === "google.com"`.
- Require `globalChatAdmin === true`.
- Accept integer `count` from `1` through `25` only.
- Generate keys with the Task 02 helper.
- HMAC every key before storing it.
- Store only hashes and metadata under `/adFreeKeys/<hash>`.
- Detect hash collisions and regenerate rather than overwriting an existing key.
- Return raw keys once in the response. Never log them or store them raw.

### `POST /api/redeem-key`

Request:

```json
{ "key": "SFXAD-ABCDE-FGHIJ-KLMNO" }
```

Requirements:

- Require a valid Google Firebase ID token.
- Limit body size before parsing JSON.
- Normalize and validate the raw key.
- HMAC the normalized key.
- Reject unknown keys with a stable `key-invalid` reason.
- Reject non-available keys with `key-already-redeemed`.
- Reject accounts that already have `adFree` with `already-ad-free`.
- Return generic errors that do not disclose unnecessary key information.

## Redemption Concurrency Protocol

Do not implement redemption as GET, then PATCH. Two simultaneous requests could both observe `available`.

Use the ETag protocol from Task 02:

1. Generate a `requestId`.
2. Read the key and account entitlement with ETags.
3. Claim the key using conditional `PUT` plus `If-Match`, changing it to `status: "claiming"` with `boundTo`, `requestId`, and `claimedAt`.
4. If the conditional write returns `412`, re-read and return the correct conflict response.
5. Conditionally create the account entitlement only if it was absent.
6. Conditionally finalize the key as `redeemed`.
7. If account creation fails, restore the key only if its current `requestId` still belongs to this request.
8. Support retrying the same request without consuming a second key.
9. Add an operator reconciliation path or a documented script for stale `claiming` records.

## CLI Contract

`scripts/generate-adfree-keys.mjs` must:

- Use Node ESM, matching `scripts/global-chat-admin.mjs`.
- Use `firebase-admin` only in this CLI.
- Resolve credentials using the existing CLI pattern.
- Parse `--count` and `--hmac-secret`.
- Reject missing, non-integer, zero, negative, and over-25 counts.
- Export `parseArgs()` and `computeKeyHash()` for tests.
- Print generated raw keys to stdout only.

Add this package script:

```json
"adfree:generate": "node scripts/generate-adfree-keys.mjs"
```

## Tests

Endpoint tests should mock Firebase REST and token verification. Cover:

- Admin success.
- Missing admin claim.
- Non-Google user.
- Counts `0`, `26`, decimals, strings, and missing count.
- Key output format and collision retry.
- Invalid key.
- Already redeemed key.
- Existing ad-free account.
- Concurrent redemption where one conditional write receives `412`.
- Rollback after entitlement write failure.
- Idempotent retry for the same `requestId`.
- No raw key in console output from the endpoint.

Run:

```bash
npm run test -- --run scripts/generate-adfree-keys.test.js
npm run test -- --run functions/api
```

## Manual Local Smoke Test

Use a Firebase emulator or a dedicated development Firebase project. Never run this against production with test keys.

1. Generate one fake key with the CLI.
2. Confirm only its hash exists in RTDB.
3. Redeem it as a test Google user.
4. Confirm `accounts/<uid>/adFree` exists.
5. Attempt to redeem the same key as a second test user and confirm rejection.

## Completion Checklist

- [ ] Both endpoints reject unauthenticated and non-Google callers.
- [ ] Admin generation is capped at 25.
- [ ] Raw keys are never persisted.
- [ ] Concurrent redemption cannot activate two accounts.
- [ ] CLI tests and endpoint tests pass.
