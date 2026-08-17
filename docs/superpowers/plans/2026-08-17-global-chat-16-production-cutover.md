# GlobalChat Production Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Stop at each production checkpoint for operator review.

**Goal:** Cut production from legacy anonymous chat to an empty Google-only v2 namespace with claims admins and a bounded rollback window.

**Architecture:** Back up legacy roots, verify claims and an empty v2 root, deploy transitional rules, deploy the v2 client, then deploy final deny-legacy rules. Rollback never restores the insecure password/secret authorization design.

**Tech Stack:** Firebase Console/CLI, Cloudflare Pages/Wrangler, browser developer tools, desktop/mobile smoke testing.

## Global Constraints

- Depends on plans 01, 03, 08, and 15, plus all client plans transitively.
- No legacy chat record is imported into v2.
- Keep backups outside the repository with a recorded deletion date.
- Never reopen `/secrets` or RTDB `isAdmin` as a long-term rollback.

---

### Task 1: Preflight Evidence

**Files:**
- Modify: `docs/firebase-auth-profiles-setup.md`

- [x] Run fresh local verification:

```powershell
npm run verify:chat
npm run lint
```

- [x] Record commit SHA, rule artifact hashes, test counts, build result, and deployment operator.
- [x] Inspect every approved admin UID:

```powershell
npm run chat:admin -- inspect --uid <uid>
```

- [x] Confirm each is Google-backed and has `globalChatAdmin: true`.

### Task 2: Back Up Legacy Data and Confirm Empty v2

- [x] Export `/messages`, `/users`, `/nicknames`, `/reports`, and `/pinnedMessage` through an approved operator environment.
- [x] Store the encrypted/restricted export outside Git with owner and deletion date.
- [x] Inspect `/globalChat/v2`; expected value is `null` before first production join.
- [x] If v2 contains test data, export it for investigation and remove only verified test records before proceeding.

### Task 3: Deploy Transitional Rules

- [x] Run:

```powershell
npm run test:rules:transitional
npm run deploy:firebase-rules:transitional
```

- [x] Verify a regular Google test user can create/read only v2 records.
- [x] Verify the currently deployed v1 client still accesses legacy chat during this short interval.
- [x] If this checkpoint fails, redeploy the exact pre-cutover rules revision and stop.

### Task 4: Deploy and Smoke-Test the v2 Client

- [x] Run:

```powershell
npm run verify:chat
npm run deploy
```

- [x] Verify deployed asset/version hash and no `/api/admin-login` request.
- [x] With a regular Google user: bootstrap, empty feed, send, edit, reply, react, recommend, report, and soft delete.
- [x] With a claims admin: broadcast, pin/unpin, read/resolve report, resolve ticket, and hard delete.
- [x] Verify signed-out browsing still works and opening chat shows the wall with no chat reads.

### Task 5: Deploy Final Rules and Establish Fresh-History Boundary

- [x] Run:

```powershell
npm run test:rules
npm run deploy:firebase-rules
```

- [x] Directly verify every legacy root denies read/write for anonymous, regular Google, and admin Google users.
- [x] Explicitly verify `/secrets/admin_key` and `/secrets/admin_profile` deny both reads and writes after final deployment.
- [x] Confirm v2 remains functional and contains only post-cutover Google-identity records.
- [x] Record this timestamp as the official fresh-history boundary.

### Task 6: Verify Desktop, Mobile, Switching, and Claims Refresh

- [x] Test desktop and mobile panel layout, identity photo/name fit, composer, menus, reports, and pin banner.
- [x] Switch Google account A to B and verify no A messages/drafts/unreads/listeners remain locally.
- [x] Sign out and verify listener detachment and sign-in wall.
- [x] Grant a test claim, force `refreshAuthClaims()`, and verify admin UI/rules access.
- [x] Revoke it, force refresh, and verify immediate UI closure and rules denial.

### Task 7: Document Rollback and Retention

- [x] Add exact deployed revisions and these rollback cases to `docs/firebase-auth-profiles-setup.md`:

- Before final denial: redeploy previous client and transitional rules.
- Client defect after final denial: keep legacy denied and redeploy the last v2-capable client.
- Transitional rule defect: redeploy exact pre-cutover rules and pause.
- Final rule defect: prefer previous passing final rules; use transitional rules only for a time-bounded v1 rollback.
- Claim error: revoke claim, force refresh, and audit moderation actions.
- v2 data error: export v2 before repair; never import anonymous v1 identities/history.

### Task 8: Close the Rollback Window and Commit Runbook

- [x] After the approved retention period, verify production stability and operator approval.
- [x] Delete legacy roots and restricted backup according to the retention record.
- [x] Run final smoke checks and record deletion completion.
- [x] Commit documentation:

```powershell
git add docs/firebase-auth-profiles-setup.md
git commit -m "docs: add global chat v2 cutover runbook"
```

**Checkpoint:** Production uses empty-start v2 history, Google identity, and claims-only moderation; legacy data and credentials are retired under an auditable rollback/retention process.
