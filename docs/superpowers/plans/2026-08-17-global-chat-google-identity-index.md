# GlobalChat Google Identity Plan Index

> **For agentic workers:** Execute one linked plan at a time. Complete its verification checkpoint before starting a dependent plan.

**Goal:** Migrate GlobalChat to a passive signed-out participation wall, Google name/photo identity for participants, an empty v2 history, and claims-only administration through small independently reviewable plans.

**Architecture:** Keep anonymous Firebase sessions for browsing and allow guests to open a passive GlobalChat participation wall without chat data access. A Google token remains the only GlobalChat data principal, and authentication is available only in the navbar Settings panel's `.navbar-settings-signin` section. All new records live below `/globalChat/v2`; `globalChatAdmin: true` is the only moderation authority. Transitional rules enable v2 before the client cutover, and final rules block all legacy chat roots.

**Tech Stack:** React 19, Firebase Auth v8 browser SDK, Firebase Realtime Database, Firebase Admin SDK, Vitest, Testing Library, Firebase Emulator Suite, Cloudflare Pages, GitHub Actions.

## Global Constraints

- Sender identity is Google display name plus Google photo.
- Signed-out users can open GlobalChat, see a passive wall directing them to Settings before participating, and attach no chat database listeners.
- The GlobalChat wall contains no Google sign-in button or authentication action; Google sign-in is handled only in `.navbar-settings-signin`.
- Existing nickname/anonymous chat history is not migrated.
- Anonymous Firebase sessions remain available for non-chat browsing.
- The authoritative admin claim is exactly `globalChatAdmin: true`.
- Never expose Google email, admin passwords, password hashes, RTDB secrets, or client-writable authority.
- Use `/globalChat/v2` for every new chat path.
- Preserve messages, recommendations, reactions, reports, tickets, pins, broadcasts, edits, deletion, and pagination unless a child plan explicitly changes the implementation contract.
- Execute plans that share `GlobalChat.jsx`, database rules, or `package.json` sequentially.

## Execution Order

1. [Credential containment](./2026-08-17-global-chat-01-credential-containment.md)
2. [Google identity and auth claims](./2026-08-17-global-chat-02-auth-google-identity.md)
3. [Operator admin-claims tooling](./2026-08-17-global-chat-03-admin-claims-tooling.md)
4. [v2 paths and payload model](./2026-08-17-global-chat-04-v2-model.md)
5. [Rules test harness](./2026-08-17-global-chat-05-rules-test-harness.md)
6. [Core profile and message rules](./2026-08-17-global-chat-06-rules-core-schema.md)
7. [Moderation record rules](./2026-08-17-global-chat-07-rules-moderation.md)
8. [Transitional and final rules artifacts](./2026-08-17-global-chat-08-rules-rollout.md)
9. [Passive participation wall and session lifecycle](./2026-08-17-global-chat-09-session-gating.md)
10. [v2 message data paths](./2026-08-17-global-chat-10-message-data-paths.md)
11. [Google identity rendering and mentions](./2026-08-17-global-chat-11-identity-rendering.md)
12. [Reactions and seen receipts](./2026-08-17-global-chat-12-reactions-seen.md)
13. [Reports and tickets](./2026-08-17-global-chat-13-reports-tickets.md)
14. [Claims-gated admin UI](./2026-08-17-global-chat-14-admin-ui.md)
15. [Integration coverage and CI](./2026-08-17-global-chat-15-integration-ci.md)
16. [Production cutover runbook](./2026-08-17-global-chat-16-production-cutover.md)

Plans 01-04 may be prepared independently, but merge in the listed order. Plans 05-08 and 09-14 are strictly sequential because they modify shared rules and component files.

The master numbered admin tooling before AuthContext. This index intentionally executes AuthContext first because neither plan depends on the other and its identity/claim consumer contract is useful to later client plans; production provisioning still occurs only after plan 03.

## Shared Contracts

```js
getGoogleTokenIdentity(uid, claims) => {
  uid,
  displayName: claims.name || 'Google User',
  photoURL: validHttpsPictureOrNull
}

GLOBAL_CHAT_ROOT = 'globalChat/v2'
chatPath(suffix = '')
buildChatProfile(identity, timestamp)
buildChatMessage(input)
buildTicketMessage(input)
```

The v2 roots are `profiles/{uid}`, `messages/{messageId}`, `reports/{reportId}`, and `pinnedMessage`. Optional RTDB fields are omitted rather than written as `null`.

## File Ownership

| File | Sequential owners |
|---|---|
| `src/contexts/AuthContext.jsx` | 02 only |
| `src/lib/globalChatModel.js` | 04 only |
| `tests/database/helpers.js` | 05 only |
| `database.rules.json` | 06, 07, then 08 |
| `database.rules.transitional.json` | 08 writes; 16 deploys/consumes |
| `firebase.transitional.json` | 08 writes; 16 deploys/consumes |
| `tests/database/database.rules.test.js` | 05, 06, 07, then 08 |
| `src/components/GlobalChat.jsx` | 09, 10, 11, 12, 13, then 14 |
| `src/components/GlobalChat.css` | 09, 11, 12, 13, then 14 |
| `src/components/settings/AccountSettings.test.jsx` | 15 only |
| `package.json` | 03, 08, then 15 |
| `docs/firebase-auth-profiles-setup.md` | 01, then 16 |
| `wrangler.jsonc` | 01, then 14 |

`package-lock.json` is intentionally untracked and CI currently uses `npm install`. Preserve that policy unless the user separately approves committing the lockfile and changing CI to `npm ci`.

## Final Acceptance

- [x] Every child-plan checkpoint passes.
- [x] Anonymous and unauthenticated users cannot read or write `/globalChat/v2`.
- [x] Signed-out GlobalChat performs zero chat subscriptions and provides no Google authentication action.
- [x] Every sender identity uses Google token name/photo and never email.
- [x] `/globalChat/v2` starts empty and no legacy records are copied.
- [x] Duplicate Google names coexist using UID identity.
- [x] Admin actions require `auth.token.globalChatAdmin === true` in rules.
- [x] No password-based admin flow, browser-readable secret, or `/api/admin-login` remains.
- [x] Account switching and sign-out clear state and listeners.
- [x] `npm run verify:chat` and `npm run lint` pass before cutover.
