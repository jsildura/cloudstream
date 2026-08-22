# Task 08: Integration Verification And Deployment

## Purpose

Verify the whole feature in the correct order, then document deployment and rollback. This task is not complete when only the React unit tests pass.

## Read First

- Every prior task file in this directory.
- `firebase.json`
- `package.json`
- `database.rules.json`
- `.env.example`
- Existing `tests/database/README.md`

## Automated Verification

Run from the repository root:

```bash
npm run lint
npm run test -- --run
npm run test:rules
npm run build
```

If a focused test command is useful during debugging, run it too, but do not substitute focused tests for the full commands above.

## Database Verification

Using Firebase emulators or a dedicated development project:

1. Verify a Google owner can still create/update/delete profiles.
2. Verify a Google owner can read only their own `adFree` node.
3. Verify direct and parent client writes to `adFree` fail.
4. Verify `adFreeKeys` and `adFreeOrders` are unreadable and unwritable to clients.
5. Verify backend service-account REST writes succeed.
6. Verify listener cleanup when changing accounts.

## Backend Verification

Using PayPal sandbox and a non-production Firebase environment:

1. Generate test keys as an admin.
2. Confirm raw keys are printed only to the intended terminal/UI.
3. Redeem one key successfully.
4. Redeem it again and confirm `key-already-redeemed`.
5. Try the key with a second account.
6. Attempt two concurrent redemptions and confirm only one entitlement.
7. Create a PayPal sandbox order through the server endpoint.
8. Attempt to alter price/currency from the browser request and confirm rejection or that the server ignores the alteration.
9. Complete/capture the sandbox order.
10. Retry the purchase request and confirm no duplicate entitlement.
11. Test an already-ad-free account.
12. Test a PayPal order with wrong amount/currency/product using mocked or sandbox-safe fixtures.

## Browser Verification

Use desktop and mobile widths. Verify:

1. Anonymous user has no Ad-Free settings tab.
2. Signed-in non-entitled user sees the tab and normal ads.
3. Invalid key shows a clear error.
4. Valid key changes the status after RTDB updates.
5. New device with the same Google account becomes ad-free without localStorage.
6. Ad-free user sees no smartlink popup, native ad, adblock modal, or popunder.
7. Sign-out resets the gate and a later anonymous/non-entitled load receives ads.
8. Admin can generate, copy, and redeem a key.
9. PayPal loading, approval, failure, and retry states are understandable.
10. Long keys and errors do not overflow the settings panel.

## Deployment Order

Deploy in this order:

1. Deploy and test Firebase rules in the development project.
2. Configure Cloudflare secrets and PayPal sandbox values.
3. Deploy Pages Functions and run endpoint smoke tests.
4. Build and deploy the frontend.
5. Run the browser verification again against the deployed environment.
6. Switch to PayPal live credentials only after sandbox verification is recorded.

Commands should be run only with the project owner’s deployment approval:

```bash
npm run deploy:firebase-rules
npm run build
npm run deploy
```

Do not paste secrets into shell history if the environment has a safer secret-management method.

## Rollback Notes

Document:

- The previous frontend deployment identifier.
- The previous Firebase rules version.
- The previous Cloudflare Functions deployment.
- How to disable PayPal purchase creation without deleting existing entitlements.
- How to stop new key redemption while preserving already active accounts.

Do not delete existing `/accounts/<uid>/adFree` records as part of a frontend rollback.

## Completion Checklist

- [ ] Lint passes.
- [ ] Full unit tests pass.
- [ ] Full rules tests pass.
- [ ] Production build passes.
- [ ] Sandbox purchase and key redemption work.
- [ ] Concurrency/replay tests pass.
- [ ] Desktop and mobile manual verification is recorded.
- [ ] Deployment and rollback notes are written.
