# Disable Ads Feature: Task Plan Index

> This directory breaks `Disable Ads Feature — Key-Gated, Account-Bound (Final).md` into small implementation tasks. Read this file first. Do not skip ahead unless a task explicitly says it is independent.

## Goal

Allow a signed-in Google account to become permanently ad-free after either redeeming a one-time key or completing a `$2.99 USD` PayPal purchase. The entitlement is stored in Firebase Realtime Database and follows the account across devices.

## Important Existing Code Facts

- Firebase is loaded in [index.html](../../../index.html) as Firebase `8.10.1` compat scripts.
- Browser database access uses `initFirebase().db.ref(...)` from [src/lib/firebase.js](../../../src/lib/firebase.js).
- Google account state comes from `useAuth()` in [src/contexts/AuthContext.jsx](../../../src/contexts/AuthContext.jsx).
- The existing `accounts/$uid` rule grants owner-level writes. A child `.write: false` does not cancel a parent grant. Task 01 handles this explicitly.
- Cloudflare Pages Functions run in a Workers-like runtime. Do not import `firebase-admin` into `functions/api/*.js`.
- Music routes are commented out in `src/App.jsx`; music download ads are not part of this release.

## Execution Order

1. [Task 00](00-repository-baseline.md): establish a baseline and write down environment assumptions.
2. [Task 01](01-rtdb-schema-and-rules.md): add the entitlement/key/order schema and secure the rules.
3. [Task 02](02-worker-shared-helpers.md): create and test Workers-compatible shared backend helpers.
4. [Task 03](03-key-generation-and-redeem-api.md): implement key generation and redemption.
5. [Task 04](04-paypal-api.md): implement server-created PayPal orders and purchase activation.
6. [Task 05](05-adfree-context-and-gating.md): add the client entitlement context and fail-closed gate.
7. [Task 06](06-settings-ui-and-navbar.md): add the settings tab, key redemption UI, and PayPal buttons.
8. [Task 07](07-ad-suppression-and-popunder.md): suppress every active ad surface and defer the popunder.
9. [Task 08](08-integration-verification.md): run the full test/build/manual verification matrix and document deployment.

## Rules For The Developer

- Work on one task file at a time.
- Read the entire task before editing code.
- Do not replace unrelated user changes in the worktree.
- Use existing project patterns before introducing new abstractions.
- Run every verification command listed in the task before moving on.
- Keep raw generated keys out of source control, logs, screenshots, and test fixtures unless a test uses an obviously fake value.
- Do not put PayPal secrets, Firebase service-account JSON, or HMAC secrets in `.env.example`, frontend code, or Git.
- A task is complete only when its tests pass and its exit checklist is satisfied.

## Release Scope

Included: popunder, smartlink popups, native ad, adblock modal, Google-account entitlement, key generation/redemption, PayPal purchase, admin key generation.

Excluded for this release: `DownloadAdModal` and `AdInterstitial` under `src/components/ads/`, because music routes are currently commented out. If music routes are restored later, create a separate follow-up task before enabling them.
