# GlobalChat Google Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Execution breakdown:** Use [GlobalChat Google Identity Plan Index](./2026-08-17-global-chat-google-identity-index.md) and execute its 16 smaller child plans in dependency order. This document remains the source specification.

**Goal:** Let signed-out users open GlobalChat behind a passive participation wall, use Google identity for authenticated participants, start the community on an empty v2 chat history, and replace password/RTDB-flag administration with Firebase custom claims.

**Architecture:** Keep anonymous Firebase sessions for the rest of StreamFlix. Signed-out visitors can open a passive GlobalChat wall but attach no chat listeners; `accountUser` is the only valid principal for chat data and participation. Google authentication is available only from the navbar Settings panel's `.navbar-settings-signin` section. Move all chat data into an additive `/globalChat/v2` namespace, derive public identity from Google token fields, authorize moderation exclusively with a `globalChatAdmin` custom claim, and leave the legacy roots inaccessible after cutover rather than copying anonymous history forward.

**Tech Stack:** React 19, Firebase Auth v8 browser SDK, Firebase Realtime Database, Firebase Admin SDK for an operator-only claims script, Vitest, Testing Library, Firebase Local Emulator Suite, Cloudflare Pages, GitHub Actions.

## Global Constraints

- Sender identity is Google display name plus Google photo.
- Users without a Google account session can open GlobalChat but see a passive sign-in-first participation wall and attach no chat database listeners.
- The GlobalChat wall has no Google button, authentication callback, or other sign-in action. Google sign-in is handled only by the navbar Settings panel's `.navbar-settings-signin` section.
- Existing nickname/anonymous chat history is not migrated into v2.
- StreamFlix browsing may continue to use the current anonymous Firebase session; the passive participation wall applies to GlobalChat, not every route.
- The authoritative admin claim is exactly `globalChatAdmin: true`.
- No browser-readable admin password, password hash, database secret, or client-writable admin authority remains.
- Do not trust legacy `/users/{uid}/isAdmin` values as migration input; approve admin UIDs manually.
- Do not expose Google email addresses in GlobalChat data or UI.
- Use `/globalChat/v2` for every new chat path; do not mix v1 and v2 records.
- Preserve current message, recommendation, reaction, report, ticket, pin, broadcast, edit, delete, and pagination capabilities unless this plan explicitly changes their authorization or identity behavior.
- Old root nodes remain intact during the rollback window but become unreadable/unwritable to clients at final cutover.

---

## Verified Current-State Map

- `src/components/GlobalChat.jsx` is a 3,869-line feature controller containing identity setup, all RTDB listeners/writes, message rendering, reports, tickets, and admin UI.
- `src/contexts/AuthContext.jsx` exposes both `firebaseUser` and Google-only `accountUser`; it automatically creates anonymous Firebase users and currently links those UIDs to Google.
- GlobalChat currently reads `firebaseUser`, creates `/users/{uid}` nickname/DiceBear profiles, reserves `/nicknames`, and reads shared `/messages` history.
- `database.rules.json` currently allows public message reads, anonymous-authenticated message writes, RTDB-field-based admin authorization, authenticated reads of `/secrets/admin_key`, authenticated writes of `/secrets/admin_profile`, and any authenticated write to `/pinnedMessage`.
- `functions/api/admin-login.js` accepts a caller-supplied UID and elevates `/users/{uid}/isAdmin` using a database secret.
- `wrangler.jsonc` contains committed privileged values. The RTDB secret must be revoked before relying on new rules.
- Existing GlobalChat unit coverage only tests report/UA helpers. Emulator tests cover only basic ownership, nickname, and report cases.

## Target Data Model

All records live below `/globalChat/v2`:

```text
globalChat/v2/
  profiles/{uid}
  messages/{messageId}
  reports/{reportId}
  pinnedMessage
```

`profiles/{uid}` is public to Google-authenticated chat users and self-writable only when identity fields match token claims:

```js
{
  uid: 'firebase-uid',
  displayName: 'Google Display Name',
  photoURL: 'https://...', // omitted when Google has no photo
  joinedAt: 1723900000000,
  updatedAt: 1723900000000
}
```

Messages keep an immutable sender snapshot so history does not require a profile join and replies/notifications retain the identity shown at send time. Optional fields are omitted, never written as `null`, because RTDB stores `null` as deletion:

```js
{
  uid: 'firebase-uid',
  senderName: 'Google Display Name',
  senderPhotoURL: 'https://...', // omitted when unavailable
  senderIsAdmin: false,          // presentation only; rules validate against claim
  text: 'Hello',
  broadcast: false,
  createdAt: 1723900000000,
  deletedForAll: false,
  reactions: { uid: 'emoji' },
  seenBy: { uid: true },
  replyTo: {
    id: 'message-id',
    senderName: 'Other Google Name',
    text: 'Preview',
    moviesCount: 0
  }
}
```

Rules treat `senderIsAdmin` as display data only. Every privileged operation checks `auth.token.globalChatAdmin === true` independently.

Reports remain client-created but must bind `reportedBy` to `auth.uid`, validate bounded fields, and allow only claims admins to read/update/delete. Ticket feed entries are authored by the reporting user with `type: 'ticket'`; an admin may update their `ticketStatus` during resolution. This removes the current invalid regular-user attempt to create a message owned by `uid: 'system'`.

### Authoritative Schema Contract

Use these exact shapes when writing builders and rules. Every object rejects unlisted children with `$other: { ".validate": false }`.

| Record | Required fields | Optional fields | Authority and bounds |
|---|---|---|---|
| Profile | `uid`, `displayName`, `joinedAt`, `updatedAt` | `photoURL` | UID/name/photo match canonical token identity; name 1-80; owner creates/refreshes; `uid` and `joinedAt` immutable |
| Normal message | `uid`, `senderName`, `senderIsAdmin`, `text`, `broadcast`, `createdAt`, `deletedForAll` | `senderPhotoURL`, `editedAt`, `movies`, `recTitle`, `recText`, `mediaUrl`, `mediaType`, `replyTo`, `reactions`, `seenBy` | Text 0-2,000 but at least one of text/media/movies; only claims admin may create `broadcast: true` or `senderIsAdmin: true` |
| Ticket message | Normal identity/timestamp fields plus `type: 'ticket'`, `ticketNo`, `ticketAction: 'created'`, `ticketStatus: 'open'`, `category`, `reporterUid` | `senderPhotoURL`, `seenBy`, `reactions` | Reporter creates with `reporterUid === auth.uid`; only claims admin may transition status from `open` to `resolved`; ticket identity/type fields immutable |
| Reply | `id`, `senderName`, `text`, `moviesCount` | `recTitle` | ID/name 1-80, text 0-50, moviesCount integer 0-10, recTitle 1-50 |
| Movie snapshot | `type`, `id`, `title` | `year`, `poster` | Type is `movie` or `tv`; title 1-200; year is four digits; poster is a TMDB path; at most 10 indexed entries |
| Reactions | none | `{uid}: emoji` | Each user writes/deletes only their own UID child; emoji belongs to the existing `REACTIONS` allowlist; one reaction per UID |
| Seen receipts | none | `{uid}: true` | Each user writes only `true` at their own UID child |
| Message report | `kind: 'message'`, `msgId`, `messageText`, `messageSenderName`, `reportedBy`, `reportedByName`, `timestamp` | `messageMedia` | Reporter identity matches auth/token; message text 0-200; media is `image`, `video`, or `file` |
| Issue report | `kind: 'issue'`, `category`, `description`, `reportedBy`, `reportedByName`, `ticketNo`, `ticketMsgId`, `timestamp`, `context` | none | Description 0-1,000; category belongs to the existing issue-category allowlist; reporter identity matches auth/token |
| Issue context | `route`, `ua`, `playback` | `title`, `tmdbId`, `mediaType`, `season`, `episode`, `fromServer`, `toServer` | Route/UA 0-500, title 1-200, IDs/server names 1-100; mediaType is `movie` or `tv`; season/episode are non-negative integers; playback boolean; unavailable optional fields are omitted |
| Pin | `id`, `text`, `senderName`, `pinnedAt`, `pinnedBy` | none | Claims-admin only; message ID 1-80, text 0-200, name 1-80, `pinnedBy === auth.uid` |

Regular-message immutable fields are `uid`, `senderName`, `senderPhotoURL` presence/value, `senderIsAdmin`, `broadcast`, `createdAt`, `type` presence, and all ticket fields. Owner content edits require `now <= data.createdAt + 180000`, set `editedAt` to `now`, and are forbidden after `deletedForAll` becomes true. `deletedForAll` is one-way. Claims admins may hard-delete but do not rewrite sender identity. Reactions and seen receipts remain independently writable through child rules after the edit window.

## Identity Policy

`getGoogleTokenIdentity(uid, claims)` is the canonical identity source and returns:

```js
{
  uid,
  displayName: claims.name || 'Google User',
  photoURL: /^https:\/\//i.test(claims.picture || '')
    ? claims.picture
    : null
}
```

- Never derive the public name from email.
- Store token `name` verbatim after enforcing 1-80 characters; use `Google User` only when absent/empty.
- Omit photo fields when the token has no HTTPS `picture`. Rules require exact equality when a valid token picture exists and omission otherwise.
- Bind UID to `accountUser.uid`, but do not construct public identity from potentially stale `accountUser.displayName`/`photoURL` metadata.
- Render `/logo/streamflix.png` or an initials fallback when `photoURL` is null or image loading fails.
- Refresh `/profiles/{uid}` on each Google-authenticated chat mount so changed Google name/photo values are reflected for future messages.
- Existing v2 messages retain their original sender snapshot; profile changes affect the mention list and future messages only.
- Remove nickname editing, nickname suggestions, avatar selection, admin nickname, and admin avatar customization from GlobalChat.

## Rollout Summary

1. Revoke exposed credentials and remove committed values.
2. Add claims tooling and manually provision approved Google admin UIDs.
3. Deploy tested transitional rules that enable v2 while leaving legacy chat available.
4. Ship the v2 client and verify empty history, Google identity, and claims-based moderation.
5. Deploy tested final rules that deny all legacy roots; the v2 client release removes the old admin endpoint.
6. Retain a restricted backup for a short rollback window, then delete legacy data manually after approval.

---

### Task 1: Contain Exposed Admin Credentials

**Files:**
- Modify: `wrangler.jsonc:9-15`
- Modify: `.gitignore`
- Create: `.dev.vars.example`
- Modify: `docs/firebase-auth-profiles-setup.md`

**Interfaces:**
- Consumes: Cloudflare Pages encrypted secrets and Firebase console credential rotation.
- Produces: source-controlled configuration containing no admin hash or RTDB database secret.

- [x] **Step 1: Revoke the committed RTDB database secret before deploying code**

In Firebase Console, revoke/rotate the legacy Realtime Database secret that is currently present in `wrangler.jsonc`. Record the completion time and affected deployment in the operator change ticket. Do not paste the replacement into the repository.

- [x] **Step 2: Remove privileged values from Wrangler configuration**

Change `wrangler.jsonc` so `vars` contains only non-secret values still needed by unrelated functions. Remove `ADMIN_KEY_HASH` and `FIREBASE_DATABASE_SECRET`; remove `FIREBASE_DATABASE_URL` too after Task 8 deletes `admin-login.js`.

- [x] **Step 3: Add local secret-file protection and a non-secret template**

Add `.dev.vars` to `.gitignore`. Create `.dev.vars.example` with comments only:

```dotenv
# Local Cloudflare Pages secrets belong in .dev.vars, never in source control.
# GlobalChat v2 does not use an admin password or an RTDB database secret.
```

- [x] **Step 4: Document the security incident response**

Add a “GlobalChat privileged credentials” section to `docs/firebase-auth-profiles-setup.md` stating:

```markdown
- Never store Firebase service-account JSON, RTDB database secrets, or admin password hashes in the repository.
- Provision Cloudflare secrets with `wrangler pages secret put <NAME>` when another server feature requires one.
- GlobalChat administrators are provisioned with the operator-only Firebase Admin SDK script and the `globalChatAdmin` custom claim.
- A leaked credential must be revoked first; deleting it from the latest commit is not sufficient because Git history retains it.
```

Also replace the guide's statement that anonymous auth is used for chat: anonymous auth remains for non-chat browsing/session features, while GlobalChat v2 requires a Google provider session.

- [x] **Step 5: Verify the working tree no longer contains the exposed value categories**

Run:

```bash
rg -n "FIREBASE_DATABASE_SECRET|ADMIN_KEY_HASH|database secret" wrangler.jsonc .dev.vars.example docs .gitignore
```

Expected: no secret values; documentation-only mentions are allowed. Separately search for the exact revoked secret and expect zero matches outside Git history.

- [x] **Step 6: Commit**

```bash
git add wrangler.jsonc .gitignore .dev.vars.example docs/firebase-auth-profiles-setup.md
git commit -m "security: remove global chat credentials from source"
```

---

### Task 2: Add Operator-Only Admin Claims Tooling

**Files:**
- Create: `scripts/global-chat-admin.mjs`
- Create: `scripts/global-chat-admin.test.js`
- Modify: `package.json`
- Modify: `docs/firebase-auth-profiles-setup.md`

**Interfaces:**
- Consumes: Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS`; exact CLI `npm run chat:admin -- grant|revoke|inspect --uid <firebase-uid>`.
- Produces: `globalChatAdmin: true` custom claim while preserving unrelated existing custom claims.

- [x] **Step 1: Write failing command-parser and claim-merge tests**

Export pure helpers from `scripts/global-chat-admin.mjs` and test these cases:

```js
expect(parseArgs(['grant', '--uid', 'google-1', '--confirm', 'google-1'])).toEqual({ action: 'grant', uid: 'google-1', confirm: 'google-1' });
expect(() => parseArgs(['grant'])).toThrow('Missing --uid');
expect(() => parseArgs(['grant', '--uid', 'google-1'])).toThrow('Missing --confirm');
expect(() => parseArgs(['grant', '--uid', 'google-1', '--confirm', 'other'])).toThrow('Confirmation must match UID');
expect(parseArgs(['inspect', '--uid', 'google-1'])).toEqual({ action: 'inspect', uid: 'google-1', confirm: null });
expect(nextClaims({ paid: true }, 'grant')).toEqual({ paid: true, globalChatAdmin: true });
expect(nextClaims({ paid: true, globalChatAdmin: true }, 'revoke')).toEqual({ paid: true });
```

- [x] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run scripts/global-chat-admin.test.js`

Expected: FAIL because the script/helpers do not exist.

- [x] **Step 3: Implement the operator script**

Use `firebase-admin/app` and `firebase-admin/auth`. The executable path must:

1. Parse `grant`, `revoke`, or `inspect` and require `--uid`.
2. Initialize with `applicationDefault()` and project ID `streamflix-chat`.
3. Load the user with `getAuth().getUser(uid)`.
4. Reject grant when `providerData` does not contain `providerId === 'google.com'`.
5. Print UID, masked email, Google-provider presence, and current `globalChatAdmin` status.
6. Require an interactive `--confirm <uid>` argument for grant/revoke; do not accept a generic yes flag.
7. Preserve unrelated claims and call `setCustomUserClaims(uid, nextClaims(...))`.
8. Print that the affected user must refresh their ID token or sign in again.
9. Keep Admin SDK initialization inside `main()` and call `main()` only under a direct-execution guard so test imports cannot contact Firebase.

- [x] **Step 4: Add dependency and scripts**

Add `firebase-admin` to `devDependencies` and these scripts:

```json
"chat:admin": "node scripts/global-chat-admin.mjs",
"test:admin-script": "vitest run scripts/global-chat-admin.test.js"
```

Run `npm install --save-dev firebase-admin` and leave the generated `package-lock.json` untracked under the repository's current lockfile policy.

- [x] **Step 5: Run script tests**

Run: `npm run test:admin-script`

Expected: PASS without contacting Firebase because tests import only pure helpers.

- [x] **Step 6: Document admin provisioning**

Document exact operator commands:

```bash
npm run chat:admin -- inspect --uid <uid>
npm run chat:admin -- grant --uid <uid> --confirm <uid>
npm run chat:admin -- revoke --uid <uid> --confirm <uid>
```

State that approved UIDs must be obtained from a manually verified Google account owner, not copied from legacy `/users/*/isAdmin` data.

- [x] **Step 7: Provision and verify approved production admins**

For each manually approved UID, run `inspect`, then `grant`, then `inspect` again. Save the UID list in the private operator record, not the repository.

- [x] **Step 8: Commit**

```bash
git add scripts/global-chat-admin.mjs scripts/global-chat-admin.test.js package.json docs/firebase-auth-profiles-setup.md
git commit -m "feat: add global chat admin claims tooling"
```

---

### Task 3: Expose Google Identity and Claims in AuthContext

**Files:**
- Modify: `src/contexts/AuthContext.jsx:12-442`
- Modify: `src/contexts/AuthContext.test.jsx`
- Create: `src/lib/globalChatIdentity.js`
- Create: `src/lib/globalChatIdentity.test.js`

**Interfaces:**
- Consumes: Firebase Google `accountUser`, token claims from `user.getIdTokenResult(forceRefresh)`.
- Produces: `chatIdentity`, `authClaims`, `isGlobalChatAdmin`, `refreshAuthClaims()` from `useAuth()`.

- [x] **Step 1: Write failing identity-normalization tests**

Test `getGoogleTokenIdentity(uid, claims)` with:

```js
expect(getGoogleTokenIdentity('u1', { name: 'Alice', picture: 'https://img.test/a.jpg' }))
  .toEqual({ uid: 'u1', displayName: 'Alice', photoURL: 'https://img.test/a.jpg' });
expect(getGoogleTokenIdentity('u2', { name: '', picture: 'javascript:alert(1)' }))
  .toEqual({ uid: 'u2', displayName: 'Google User', photoURL: null });
expect(getGoogleTokenIdentity(null, {})).toBeNull();
```

- [x] **Step 2: Write failing AuthContext claim tests**

Extend the existing harness to expose `chatIdentity` and `isGlobalChatAdmin`. Mock `getIdTokenResult()` and prove:

- Anonymous startup yields `chatIdentity === null` and `isGlobalChatAdmin === false`.
- Google startup normalizes display name/photo and reads `globalChatAdmin`.
- `refreshAuthClaims()` calls `getIdTokenResult(true)` and updates the exposed claim.
- Sign-out clears chat identity and admin state before the replacement anonymous session resolves.
- A delayed account A token result cannot overwrite account B identity/claims.
- Token identity wins when user metadata disagrees with `name`/`picture` claims.

- [x] **Step 3: Run focused tests and verify failure**

Run:

```bash
npx vitest run src/lib/globalChatIdentity.test.js src/contexts/AuthContext.test.jsx
```

Expected: FAIL because the identity and claims interfaces are absent.

- [x] **Step 4: Implement identity normalization**

Create `getGoogleTokenIdentity(uid, claims)` exactly as defined in “Identity Policy”.

- [x] **Step 5: Load claims only for Google users**

In `AuthContext`:

- Add `authClaims` state initialized to `{}`.
- Clear `authClaims` and `chatIdentity` immediately when sign-out starts and whenever principal UID changes.
- On Google user changes, increment a request-generation ref, capture the initiating UID, call `getIdTokenResult(false)`, and commit identity/claims only if generation and current UID still match.
- Derive `chatIdentity` from `getGoogleTokenIdentity(accountUser.uid, result.claims)` in that guarded result.
- On anonymous/null state, synchronously reset claims to `{}` and identity to null.
- Implement `refreshAuthClaims()` with `getIdTokenResult(true)` using the same UID/generation guard.
- Derive `isGlobalChatAdmin = authClaims.globalChatAdmin === true`.
- Keep current anonymous-session behavior for non-chat features.

- [x] **Step 6: Run focused tests**

Run the command from Step 3.

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/lib/globalChatIdentity.js src/lib/globalChatIdentity.test.js src/contexts/AuthContext.jsx src/contexts/AuthContext.test.jsx
git commit -m "feat: expose google chat identity and admin claims"
```

---

### Task 4: Define the v2 Model and Centralize Database Paths

**Files:**
- Create: `src/lib/globalChatModel.js`
- Create: `src/lib/globalChatModel.test.js`

**Interfaces:**
- Consumes: `chatIdentity`, `isGlobalChatAdmin`, Firebase ServerValue timestamps.
- Produces: `GLOBAL_CHAT_ROOT`, `chatPath()`, `buildChatProfile()`, `buildChatMessage()`, `buildTicketMessage()`, `resettableChatState` conventions.

- [x] **Step 1: Write failing path and payload tests**

Cover:

```js
expect(GLOBAL_CHAT_ROOT).toBe('globalChat/v2');
expect(chatPath('messages/msg-1')).toBe('globalChat/v2/messages/msg-1');
expect(buildChatMessage({ identity, isAdmin: false, text: ' hi ', timestamp }))
  .toMatchObject({ uid: 'u1', senderName: 'Alice', senderPhotoURL: 'https://img.test/a.jpg', text: 'hi', broadcast: false });
expect(buildChatMessage({ identity, isAdmin: false, text: '@everyone hi', timestamp }).broadcast).toBe(false);
expect(buildChatMessage({ identity, isAdmin: true, text: '@everyone hi', timestamp }).broadcast).toBe(true);
```

Also assert that builders never emit `nickname`, `avatarUrl`, `adminBadge`, email, or an arbitrary caller-supplied UID.

- [x] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run src/lib/globalChatModel.test.js`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement v2 constants and builders**

Use these exports:

```js
export const GLOBAL_CHAT_ROOT = 'globalChat/v2';
export const chatPath = (suffix = '') => suffix ? `${GLOBAL_CHAT_ROOT}/${suffix}` : GLOBAL_CHAT_ROOT;
export function buildChatProfile(identity, timestamp) {}
export function buildChatMessage(input) {}
export function buildTicketMessage(input) {}
```

Preserve current optional recommendation/media/reply fields, but rename reply identity from `nickname` to `senderName`. Enforce client-side caps matching Task 5 rules: name 80 characters, text 2,000, recommendation note 1,000, title 200, maximum 10 movies, reply preview 50.

- [x] **Step 4: Run model tests and build**

Run:

```bash
npx vitest run src/lib/globalChatModel.test.js
npm run build
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/globalChatModel.js src/lib/globalChatModel.test.js
git commit -m "feat: define global chat v2 model"
```

---

### Task 5: Add Google-Only, Claims-Based v2 Database Rules

**Files:**
- Modify: `database.rules.json:139-168`
- Create: `database.rules.transitional.json`
- Create: `firebase.transitional.json`
- Modify: `tests/database/helpers.js`
- Modify: `tests/database/database.rules.test.js:296-397`
- Modify: `package.json`

**Interfaces:**
- Consumes: Google provider token fields `firebase.sign_in_provider`, `name`, `picture`, and custom claim `globalChatAdmin`.
- Produces: complete authorization and validation for `/globalChat/v2`; deny-all legacy chat roots.

- [x] **Step 1: Extend emulator token helpers**

Change `createGoogleContext` to accept options while retaining current defaults:

```js
createGoogleContext(uid, {
  email: 'user@example.com',
  name: 'Alice',
  picture: 'https://img.test/alice.jpg',
  globalChatAdmin: false
})
```

Add `createGoogleAdminContext(uid, options)` that sets `globalChatAdmin: true`. Keep `createAnonymousContext` for denial tests.

- [x] **Step 2: Replace the old chat rules tests with a failing v2 matrix**

Add explicit tests proving:

1. Unauthenticated and anonymous users cannot read or write profiles, messages, reports, or pin data.
2. Google users can read v2 messages/profiles and create only their own profile.
3. Profile `uid`, `displayName`, and `photoURL` must match token claims; Google email is rejected as an extra field.
4. A Google user can create a message only with own UID and token-matching sender identity.
5. All immutable fields and one-way deletion/edit-window transitions from the schema contract are enforced.
6. A regular owner can edit bounded content, soft-delete, and update own reaction entry.
7. A different regular user can write only `reactions/{auth.uid}` and `seenBy/{auth.uid}`; they cannot change message content/status/owner.
8. A regular user cannot set `broadcast`, `senderIsAdmin`, admin ticket status, or pin data.
9. A claims admin can broadcast, hard-delete, pin/unpin, read/update/delete reports, and resolve ticket status.
10. Report creation binds `reportedBy === auth.uid`, validates allowed kinds/categories and bounded strings, and rejects extra fields.
11. Legacy `/messages`, `/users`, `/nicknames`, `/reports`, `/pinnedMessage`, and `/secrets` reads/writes fail after final-rule mode is enabled.

- [x] **Step 3: Run rules tests and verify failure**

Run: `npm run test:rules`

Expected: FAIL against the current anonymous/nickname rules.

- [x] **Step 4: Implement v2 rule predicates and schema validation**

At `/globalChat/v2`, require this principal check for reads and normal writes:

```js
auth != null &&
auth.token.firebase.sign_in_provider === 'google.com'
```

Require this separately for privileged operations:

```js
auth != null &&
auth.token.firebase.sign_in_provider === 'google.com' &&
auth.token.globalChatAdmin === true
```

Implement every field, bound, omission rule, immutable field, and transition in “Authoritative Schema Contract”. Use `$other: { ".validate": false }` at profile, message, nested reply/movie, report/context, and pin object levels. Add `.indexOn: ["broadcast", "ticketNo", "createdAt"]` for v2 messages.

For non-owner reaction/read-receipt writes, place rules on `messages/{id}/reactions/{uid}` and `seenBy/{uid}` so a user can update only their own child without receiving broad write access to the parent message. Remove the shared mutable `status` behavior; derive “seen” from `seenBy` in the UI.

- [x] **Step 5: Create explicit transitional and final rule artifacts**

`database.rules.transitional.json` contains complete v2 rules while retaining current legacy roots for the brief client cutover. `database.rules.json` contains identical v2 rules plus final deny-all legacy roots. `firebase.transitional.json` points its database rules entry at `database.rules.transitional.json`.

Parameterize `tests/database/helpers.js` with `RULES_FILE`. Run the v2 matrix against both artifacts and legacy-denial cases only against the final artifact. Add `cross-env` to dev dependencies and these scripts:

```json
"test:rules:transitional": "cross-env RULES_FILE=database.rules.transitional.json firebase emulators:exec --project demo-streamflix --only auth,database \"vitest run tests/database --config vitest.rules.config.js\"",
"deploy:firebase-rules:transitional": "firebase deploy --only database --project streamflix-chat --config firebase.transitional.json"
```

Run `npm install --save-dev cross-env` and leave the generated `package-lock.json` untracked under the repository's current lockfile policy.

- [x] **Step 6: Add deny-all legacy rules to the final artifact**

The final rules for legacy chat roots are:

```json
"messages": { ".read": false, ".write": false },
"users": { ".read": false, ".write": false },
"nicknames": { ".read": false, ".write": false },
"secrets": { ".read": false, ".write": false },
"reports": { ".read": false, ".write": false },
"pinnedMessage": { ".read": false, ".write": false }
```

- [x] **Step 7: Run both emulator suites**

Run:

```bash
npm run test:rules:transitional
npm run test:rules
```

Expected: all v2 allow/deny tests pass, including ownership takeover and forged identity negatives.

- [x] **Step 8: Commit**

```bash
git add database.rules.json database.rules.transitional.json firebase.transitional.json tests/database/helpers.js tests/database/database.rules.test.js package.json
git commit -m "security: enforce google identity and chat admin claims"
```

---

### Task 6: Replace Nickname Setup with a Passive GlobalChat Participation Wall

**Files:**
- Create: `src/components/GlobalChatSignInWall.jsx`
- Create: `src/components/GlobalChatSignInWall.test.jsx`
- Modify: `src/components/GlobalChat.jsx:250-541,2751-2971`
- Modify: `src/components/GlobalChat.css:303-560`

**Interfaces:**
- Consumes: `isAuthLoading`, `isSignedIn`, and `chatIdentity` from `useAuth()`.
- Produces: a passive signed-out participation wall; signed-in profile bootstrap before chat listeners attach.

- [x] **Step 1: Write failing participation-wall component tests**

Test:

- The signed-out state says “Sign in in Settings to participate in GlobalChat”.
- The wall renders no Google icon/button, form control, authentication callback, or popup/error state.
- The panel header and close control remain available while the wall is shown.
- Neither TV mode nor auth-loading state creates an in-chat authentication control.

- [x] **Step 2: Write a failing listener-gating GlobalChat test**

Mock `useAuth()` as anonymous/signed-out, open the panel, and assert that no ref below `globalChat/v2` is read or subscribed. Repeat with a Google user and assert profile bootstrap occurs before message/profile-list listeners.

- [x] **Step 3: Run focused tests and verify failure**

Run:

```bash
npx vitest run src/components/GlobalChatSignInWall.test.jsx src/components/GlobalChat.test.js
```

Expected: FAIL because signed-out GlobalChat still uses anonymous `firebaseUser` and nickname setup.

- [x] **Step 4: Implement the passive participation wall**

Render a chat-specific, non-interactive message telling guests to sign in in Settings before participating. Do not import, call, or pass `signInWithGoogle`; do not reuse the Google icon, popup handling, TV sign-in notice, or authentication errors from `AccountSettings`. The panel header and close behavior remain available while signed out. The FAB may remain visible, but unread count must be zero and no database query may run.

- [x] **Step 5: Bootstrap the Google profile without a join form**

On a valid `chatIdentity`:

1. Write/update `/globalChat/v2/profiles/{uid}` with `buildChatProfile()`.
2. Preserve existing `joinedAt` with a transaction or a read-then-update; always refresh `displayName`, `photoURL`, and `updatedAt`.
3. Store the normalized profile in `userDataRef` using `displayName`/`photoURL` names.
4. Start message/profile/pin listeners only after profile bootstrap succeeds.
5. On account UID change or sign-out, run every listener cleanup and reset messages, reports, pins, drafts, reactions, unread IDs, pagination keys, and identity refs.
6. In this same atomic client edit, route profile/message/report/pin refs through `chatPath()`; never write legacy nickname/admin shapes below v2.

- [x] **Step 6: Delete nickname/avatar setup code**

Remove `nickname`, nickname suggestions, avatar style/seed picker, profile upload input, `claimNickname`, `suggestNicknameVariants`, `rejectNickname`, `handleJoinChat`, `/nicknames` cleanup, and associated setup CSS. Replace `isSetup` with explicit session states such as `'signed-out' | 'bootstrapping' | 'ready' | 'error'`.

Leave the obsolete admin-login block isolated until Task 8 deletes it; it must continue referencing legacy `/secrets` only and must never be routed below v2.

- [x] **Step 7: Make listener cleanup executable**

Before starting a new session, execute and clear every function in `listenersRef.current`. Return cleanup functions directly from React effects where possible. Add a test that account A to account B produces one active listener set and no account A messages remain.

- [x] **Step 8: Run focused tests and build**

Run:

```bash
npx vitest run src/components/GlobalChatSignInWall.test.jsx src/components/GlobalChat.test.js
npm run build
```

Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add src/components/GlobalChatSignInWall.jsx src/components/GlobalChatSignInWall.test.jsx src/components/GlobalChat.jsx src/components/GlobalChat.css src/components/GlobalChat.test.js
git commit -m "feat: require google sign-in for global chat"
```

---

### Task 7: Render and Send Google Identity Everywhere

**Files:**
- Modify: `src/components/GlobalChat.jsx`
- Modify: `src/components/GlobalChat.test.js`
- Modify: `src/components/GlobalChat.css`

**Interfaces:**
- Consumes: `buildChatMessage()`, v2 `senderName`/`senderPhotoURL`, live profile list.
- Produces: Google name/photo in feed, replies, mentions, notifications, reports, tickets, pins, and own-message checks.

- [x] **Step 1: Add failing mapper/render tests**

Add pure mapper tests or focused component tests proving:

- A v2 message renders `senderName` and `senderPhotoURL`.
- Missing/broken photo uses the approved fallback without hiding the name.
- Reply preview, browser notification text/icon, pinned banner, reports, tickets, and mention options use `senderName` rather than `nickname`.
- Message construction ignores stale `/profiles` data and uses current `chatIdentity`.
- No rendered identity field uses email.

- [x] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run src/components/GlobalChat.test.js src/lib/globalChatModel.test.js`

Expected: FAIL while nickname/avatar fields remain.

- [x] **Step 3: Convert message send/edit/reply paths**

Use `buildChatMessage()` for normal and recommendation messages. Replace:

```text
nickname     -> senderName
avatarUrl    -> senderPhotoURL
isAdmin      -> senderIsAdmin
replyTo.nickname -> replyTo.senderName
```

Keep ownership based only on `msg.uid === chatIdentity.uid`. Remove the current shortcut that treats every admin-authored message as owned by every admin.

- [x] **Step 4: Convert users/mentions/profile cache**

Read `/globalChat/v2/profiles`, display `displayName`, and insert `@${displayName}` on mention selection. Duplicate Google names are allowed; identity uniqueness is UID-based. Use UID as React key and never reintroduce a nickname registry.

- [x] **Step 5: Convert read receipts and reactions to child writes**

Write only:

```text
/globalChat/v2/messages/{id}/seenBy/{auth.uid} = true
/globalChat/v2/messages/{id}/reactions/{auth.uid} = emoji-or-null
```

Remove cross-user parent-message `status` updates. Render own-message “seen” when `seenBy` contains at least one UID other than the author.

Replace `getReactionData` and reaction-detail rendering for exact `{ uid: emoji }` data. Resolve reactor names through the v2 profile cache and test add, replacement, toggle-off, grouped counts, and missing-profile fallback.

- [x] **Step 6: Convert reports and ticket events**

Store `reportedByName` and message snapshots using `senderName`. Create ticket messages with reporter UID/name/photo and `type: 'ticket'`; only claims admins may change `ticketStatus` to `resolved`. Do not write `uid: 'system'` from a regular client.

- [x] **Step 7: Scan for legacy identity names**

Run:

```bash
rg -n "nickname|avatarUrl|adminBadge|msg\.isAdmin|userDataRef\.current\.isAdmin" src/components/GlobalChat.jsx src/lib/globalChatModel.js
```

Expected: zero matches except an intentional compatibility fixture, which should normally be unnecessary because v1 history is not migrated.

- [x] **Step 8: Run focused tests and build**

Run:

```bash
npx vitest run src/components/GlobalChat.test.js src/lib/globalChatModel.test.js
npm run build
```

Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add src/components/GlobalChat.jsx src/components/GlobalChat.test.js src/components/GlobalChat.css
git commit -m "feat: use google identity across global chat"
```

---

### Task 8: Remove Password Admin Login and Enforce Claims in the UI

**Files:**
- Delete: `functions/api/admin-login.js`
- Modify: `src/components/GlobalChat.jsx`
- Modify: `src/components/GlobalChat.test.js`
- Modify: `wrangler.jsonc`
- Modify: `public/_routes.json` only if it contains an explicit admin-login route

**Interfaces:**
- Consumes: `isGlobalChatAdmin` from `useAuth()`.
- Produces: claims-gated moderation UI with no in-app elevation path.

- [x] **Step 1: Write failing claims UI tests**

Prove:

- A regular Google user cannot see report queue, hard delete, pin, unpin, broadcast affordances, or admin settings.
- A `globalChatAdmin` user can see those controls.
- Forged message field `senderIsAdmin: true` does not grant controls.
- Toggling mocked claim from true to false closes admin menus/reports and prevents privileged callbacks.

- [x] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run src/components/GlobalChat.test.js`

Expected: FAIL because UI authority still comes from `userDataRef.current.isAdmin` and password login.

- [x] **Step 3: Remove all admin elevation code**

Delete `verifyAdminViaProxy`, `handleAdminLogin`, prompt-based login, client SHA-256 fallback, `adminLoginGuardRef`, `/secrets` reads, localStorage admin-profile fallbacks, admin nickname claims, and the header Admin Login button.

- [x] **Step 4: Replace every authority branch**

Use `isGlobalChatAdmin` for display gating only. Database rules remain authoritative. Replace all checks for `userDataRef.current.isAdmin` that control broadcasts, reports, delete-for-everyone, pinning, report resolution, and admin menus.

- [x] **Step 5: Remove identity-violating admin profile settings**

Delete admin nickname/avatar/badge editing and `/secrets/admin_profile` writes. Render a fixed “Admin” badge beside Google identity when `senderIsAdmin` is true and rules have validated that field at message creation.

- [x] **Step 6: Delete the endpoint and stale Wrangler vars**

Delete `functions/api/admin-login.js`. Remove `FIREBASE_DATABASE_URL` if no other function uses it. Verify `/api/admin-login` is no longer referenced:

```bash
rg -n "admin-login|ADMIN_KEY_HASH|FIREBASE_DATABASE_SECRET|admin_key|admin_profile" . --glob '!node_modules/**' --glob '!.git/**'
```

Expected: zero production references; historical migration documentation may name removed paths.

- [x] **Step 7: Run tests and build**

Run:

```bash
npx vitest run src/components/GlobalChat.test.js src/contexts/AuthContext.test.jsx
npm run build
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add -A functions/api/admin-login.js src/components/GlobalChat.jsx src/components/GlobalChat.test.js wrangler.jsonc public/_routes.json
git commit -m "security: replace chat admin login with custom claims"
```

---

### Task 9: Add End-to-End Component Coverage and CI Rules Gate

**Files:**
- Create: `src/components/GlobalChat.integration.test.jsx`
- Modify: `src/components/settings/AccountSettings.test.jsx`
- Modify: `.github/workflows/ci.yml:18-40`
- Modify: `package.json`

**Interfaces:**
- Consumes: mocked Firebase v8 RTDB/Auth interfaces and emulator rules suite.
- Produces: regression coverage for sign-in, account switching, identity, fresh history, listener cleanup, and moderation.

- [x] **Step 1: Build a deterministic Firebase v8 chat test harness**

The harness must record refs, reads, writes, subscriptions, and unsubscriptions. It must support profile bootstrap, `once`, `on/off`, `push`, `set`, `update`, `remove`, and transaction outcomes without contacting production.

- [x] **Step 2: Add integration tests for core flows**

Cover:

1. Signed-out open renders “Sign in in Settings to participate in GlobalChat” and makes zero chat DB calls.
2. The wall has no Google button, link, form control, popup/error flow, or call to `signInWithGoogle`.
3. `AccountSettings` retains the Google sign-in control in `.navbar-settings-signin` and calls `signInWithGoogle()` there.
4. Google user profile bootstrap writes token-derived identity, then loads an empty v2 message list.
5. Sending creates a v2 message with Google name/photo and no nickname/email fields.
6. Account A to account B clears A messages/drafts/unreads and detaches all A listeners.
7. Signing out returns to the passive wall and detaches all listeners.
8. Duplicate Google display names coexist because UID is authoritative.
9. Missing photo renders fallback; missing name renders “Google User”.
10. Regular user direct invocation of an admin callback is rejected by mocked permission denial and leaves UI consistent.
11. Claims admin can open reports, pin, broadcast, resolve a ticket, and hard-delete.
12. Initial v2 history never reads legacy `/messages`.

- [x] **Step 3: Add rules tests to CI**

Add a separate `rules` job after unit tests or a named step in the test job:

```yaml
- name: Run Realtime Database rules tests
  run: npm run test:rules:transitional && npm run test:rules
```

Keep it blocking. Firebase emulator downloads may require Java; use the Ubuntu runner's available JDK or add `actions/setup-java@v4` with Temurin 21 if CI proves Java is absent.

- [x] **Step 4: Add a complete chat verification script**

Add:

```json
"test:chat": "vitest run src/components/GlobalChat src/components/settings/AccountSettings.test.jsx src/lib/globalChat src/contexts/AuthContext.test.jsx",
"verify:chat": "npm run test:chat && npm run test:rules:transitional && npm run test:rules && npm run build"
```

Adjust the glob if Vitest requires explicit file names; the final command must include identity, model, passive wall, component, integration, auth, `AccountSettings`, and rules tests.

- [x] **Step 5: Run the full verification locally**

Run:

```bash
npm run verify:chat
npm run lint
```

Expected: all tests and build pass; lint has zero errors.

- [x] **Step 6: Commit**

```bash
git add src/components/GlobalChat.integration.test.jsx src/components/settings/AccountSettings.test.jsx .github/workflows/ci.yml package.json
git commit -m "test: cover google identity global chat flows"
```

---

### Task 10: Production Cutover, Verification, and Rollback

**Files:**
- Modify: `docs/firebase-auth-profiles-setup.md`
- No application code changes unless verification finds a defect.

**Interfaces:**
- Consumes: approved admin claims, passing `verify:chat`, Cloudflare deployment, Firebase rule deployment.
- Produces: empty production v2 chat with legacy roots blocked.

- [x] **Step 1: Capture a restricted pre-cutover backup**

Export only the legacy chat roots through Firebase Console or an approved admin environment:

```text
/messages
/users
/nicknames
/reports
/pinnedMessage
```

Store the export outside the repository with restricted access and a deletion date. Do not import it into `/globalChat/v2`.

- [x] **Step 2: Verify production admin claims before rule cutover**

Run `npm run chat:admin -- inspect --uid <uid>` for every approved admin. Confirm each is a Google provider and has `globalChatAdmin: true`.

- [x] **Step 3: Confirm v2 starts empty**

Inspect `/globalChat/v2`. Remove any emulator/test data accidentally pointed at production. Expected production state before first real join:

```json
null
```

- [x] **Step 4: Deploy transitional v2 rules**

Run:

```bash
npm run test:rules:transitional
npm run deploy:firebase-rules:transitional
```

Verify one approved regular Google test account can create/read only `/globalChat/v2` while the currently deployed v1 client still functions during this short interval.

- [x] **Step 5: Deploy the v2-capable client**

Run:

```bash
npm run verify:chat
npm run deploy
```

Smoke-test the deployed asset version with one regular Google account and one approved admin account before blocking legacy roots. Keep this interval short because cached v1 clients still use old chat.

- [x] **Step 6: Deploy final deny-legacy database rules**

Run:

```bash
npm run deploy:firebase-rules
```

This is the actual “start fresh” boundary. Cached v1 clients lose chat access; v2 clients read only the empty namespace.

- [x] **Step 7: Run production smoke tests on desktop and mobile widths**

Verify:

1. Signed-out user can browse StreamFlix, opens GlobalChat, sees a passive wall directing them to Settings before participating, and generates no chat reads.
2. The GlobalChat wall exposes no Google button or other authentication action; Google sign-in is available from the navbar Settings panel's `.navbar-settings-signin` section.
3. After sign-in through Settings, GlobalChat opens empty v2 history and shows the account's name/photo.
4. Regular user can send, edit within the existing window, react, reply, recommend, report, and soft-delete.
5. Regular user cannot broadcast, pin, hard-delete, or read reports, including direct RTDB attempts.
6. Admin claim user can broadcast, pin/unpin, view/resolve reports, and hard-delete.
7. Sign-out and account switching remove prior messages/drafts from local component state and detach listeners.
8. Legacy roots reject reads/writes.
9. No request is made to `/api/admin-login`.

- [x] **Step 8: Exercise token refresh behavior**

Grant a test admin claim, call `refreshAuthClaims()` or sign out/in, verify admin controls and rules become available. Revoke it, force refresh again, and verify both UI and rules deny moderation.

- [x] **Step 9: Document rollback**

Rollback rules:

- Client defect before legacy deny deployment: redeploy the previous client and keep/redeploy `firebase.transitional.json`; legacy chat remains available.
- Client defect after legacy deny deployment: keep legacy roots denied, redeploy the last v2-capable client, and fix forward. Do not reopen anonymous v1 chat merely to restore UI availability.
- Transitional-rules defect: redeploy the exact pre-cutover rules revision and pause client deployment.
- Final-rules defect: redeploy `firebase.transitional.json` only if the previous v1 client must temporarily function; otherwise deploy the previous passing final `database.rules.json`. Never restore client-readable `/secrets` beyond what existed in the time-bounded transitional artifact.
- Claim mistake: revoke `globalChatAdmin`, force token refresh, and audit affected moderation actions.
- Data defect in v2: export v2 before repair; never import anonymous v1 identity/history into v2.

- [x] **Step 10: Close the rollback window**

After the agreed retention period and successful production verification, manually delete legacy chat roots and the restricted backup according to the operator record. This deletion is intentionally not automated in application code.

- [x] **Step 11: Commit deployment documentation**

```bash
git add docs/firebase-auth-profiles-setup.md
git commit -m "docs: add global chat v2 cutover runbook"
```

---

## Acceptance Criteria

- A user with only an anonymous Firebase session cannot read or write `/globalChat/v2`.
- Opening GlobalChat while signed out shows a passive participation wall, exposes no Google sign-in action, and performs zero chat database subscriptions.
- Every visible sender identity is the Google display name and photo snapshot; no nickname setup or avatar picker remains.
- The first production v2 user sees an empty message feed.
- No v1 message, nickname, avatar, report, pin, or admin flag is copied into v2.
- Duplicate Google display names are supported and distinguished by Firebase UID.
- Admin authorization succeeds only with `auth.token.globalChatAdmin === true`.
- The client contains no admin password prompt, hash comparison, privileged RTDB secret, or admin-login API call.
- Regular users cannot forge sender identity, broadcast/admin presentation, ownership, pins, reports access, or moderation actions under emulator rules.
- Account switch/sign-out removes stale chat state and listeners.
- `npm run verify:chat`, `npm run lint`, and production smoke tests pass.

## Explicit Non-Goals

- Migrating anonymous/nickname identities to Google accounts.
- Preserving or displaying legacy chat history in the v2 client.
- Making all StreamFlix routes Google-authenticated.
- Adding user-selectable GlobalChat display names or photos.
- Building an in-app admin grant/revoke interface.
- Replacing Realtime Database with Firestore or a custom chat backend.
- Refactoring the entire 3,869-line component beyond the focused identity/path/sign-in/security changes required here.
