# GlobalChat Reports and Tickets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track every checkbox.

**Goal:** Convert message reports, issue reports, ticket messages, and resolution to v2 Google identity contracts.

**Architecture:** Reports bind reporter UID/name to `chatIdentity`; ticket bubbles are authored by the reporter and carry an admin-controlled status. No regular client writes a synthetic system identity.

**Tech Stack:** React 19, Firebase RTDB v8, Vitest, Firebase Emulator Suite.

## Global Constraints

- Depends on plans 07, 10, and 11.
- Preserve issue context and existing local cooldown UX.
- Report queue reads/resolution require `isGlobalChatAdmin` in UI and claims in rules.

---

### Task 1: Convert Message Report Builder and Submission

**Files:**
- Modify: `src/components/GlobalChat.jsx`
- Modify: `src/components/GlobalChat.test.js`

- [x] Update `buildMessageReport()` tests and fields to `messageSenderName`, `reportedBy`, and `reportedByName`; require text 0-200, optional `messageMedia` only `image`/`video`/`file`, omission of unavailable optional fields, and no extra fields.
- [x] Bind reporter UID/name from `chatIdentity`, never function-call arguments that can spoof identity.
- [x] Push to `chatPath('reports')` and preserve text/media snapshot limits.

### Task 2: Convert Issue Report Submission

- [x] Add tests for category, description, ticket refs, current Google reporter, route/UA/playback context, and omission of unavailable optional context.
- [x] Push issue records under v2 reports.
- [x] Keep the two-minute local cooldown as UX only; treat rules as authority.
- [x] Ensure description/context bounds match rules before writing.

### Task 3: Convert Ticket Creation

- [x] Add failing test proving ticket message UID equals reporter UID and never `system`.
- [x] Allocate ticket message key first, write self-bound report, then call `buildTicketMessage()` at the same key.
- [x] Store `type: 'ticket'`, `ticketAction: 'created'`, `ticketStatus: 'open'`, category, ticket number, and reporter UID.
- [x] Assert the full base shape: sender snapshot, `senderIsAdmin: false`, `text: ''`, `broadcast: false`, created time, and `deletedForAll: false`.
- [x] Preserve failure handling so a partial report/ticket failure is surfaced and retry-safe.

### Task 4: Convert Queue Loading and Resolution

- [x] Load from `chatPath('reports')` only when `isGlobalChatAdmin`.
- [x] Resolve missing message snapshots from v2 message paths.
- [x] Update only `ticketStatus` from `open` to `resolved`; assert ticket action/number/category/reporter UID/UID/identity remain unchanged and no reverse/arbitrary transition is attempted.
- [x] Delete/resolve report records only through admin callbacks; plan 14 controls all visibility and stale-claim closure.

### Task 5: Verify and Commit

- [x] Run:

```powershell
npx vitest run src/components/GlobalChat.test.js
npm run test:rules
npm run build
rg -n "uid:\s*['\"]system['\"]|reportedByNickname|messageNickname|ref\(['\"`]reports" src/components/GlobalChat.jsx
git diff --check
```

Expected: zero production matches for legacy/system report patterns.

- [x] Commit:

```powershell
git add src/components/GlobalChat.jsx src/components/GlobalChat.test.js src/components/GlobalChat.css
git commit -m "feat: move global chat reports and tickets to v2"
```

**Checkpoint:** Reports and tickets are Google-identity-bound, v2-only, rules-compatible, and resolvable only by claims admins.
