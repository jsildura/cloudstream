# GlobalChat Claims Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track every checkbox.

**Goal:** Delete password-based elevation and gate all GlobalChat moderation controls with `isGlobalChatAdmin`.

**Architecture:** The token claim controls presentation and callback availability; database rules independently enforce every operation. Admin identity remains the Google sender snapshot with a fixed presentation badge.

**Tech Stack:** React 19, Firebase Auth/RTDB v8, Cloudflare Pages, Vitest.

## Global Constraints

- Depends on plans 02, 09, 11, and 13.
- Never restore RTDB `isAdmin` fallback authorization.
- Remove, do not replace, in-chat admin elevation.

---

### Task 1: Add Claims UI Tests

**Files:**
- Modify: `src/components/GlobalChat.test.js`

- [x] Add failing regular-user tests for no reports queue, hard delete, pin/unpin, broadcast affordance, or admin settings.
- [x] Add admin tests for the same controls being available.
- [x] Add forged `senderIsAdmin: true` test proving no authority.
- [x] Add claim-revocation rerender test that closes admin menus/reports and blocks callbacks.

### Task 2: Remove Elevation and Admin Profile Customization

**Files:**
- Modify: `src/components/GlobalChat.jsx`
- Modify: `src/components/GlobalChat.css`

- [x] Delete proxy verification, password prompt, SHA-256 fallback, admin-login guard, `/secrets` reads, localStorage admin profile, nickname claims, and Admin Login button.
- [x] Delete admin nickname/avatar/badge settings and writes.
- [x] Render a fixed “Admin” badge beside Google identity when a message's validated `senderIsAdmin` snapshot is true.

### Task 3: Replace Every Authority Branch

- [x] Use `isGlobalChatAdmin` for report queue, broadcasts, hard delete, pin/unpin, resolution, and admin menus.
- [x] Keep own-message edit/soft-delete based only on UID.
- [x] Close privileged UI in an effect when `isGlobalChatAdmin` becomes false.
- [x] Handle permission-denied callbacks by closing stale UI and showing the existing error mechanism.

### Task 4: Delete the Server Endpoint

**Files:**
- Delete: `functions/api/admin-login.js`
- Modify: `wrangler.jsonc`
- Modify: `public/_routes.json` only if an explicit route exists

- [x] Search repository use of `FIREBASE_DATABASE_URL`; remove it from Wrangler only if no unrelated function uses it.
- [x] Delete the endpoint and any explicit route.
- [x] Confirm no production reference to admin password/hash/secret/profile remains.

### Task 5: Verify and Commit

- [x] Run:

```powershell
npx vitest run src/components/GlobalChat.test.js src/contexts/AuthContext.test.jsx
npm run build
rg -n "admin-login|ADMIN_KEY_HASH|FIREBASE_DATABASE_SECRET|admin_key|admin_profile|userDataRef\.current\.isAdmin" src functions wrangler.jsonc public --glob '!node_modules/**'
git diff --check
```

Expected search result: zero production references.

- [x] Commit:

```powershell
git add -A functions/api/admin-login.js src/components/GlobalChat.jsx src/components/GlobalChat.test.js src/components/GlobalChat.css wrangler.jsonc public/_routes.json
git commit -m "security: replace chat admin login with custom claims"
```

**Checkpoint:** No browser admin elevation exists, every moderation control uses the token claim, and rules remain the security boundary.
