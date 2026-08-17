# GlobalChat Integration and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track every checkbox.

**Goal:** Add deterministic end-to-end component coverage and make both rules artifacts blocking CI checks.

**Architecture:** A Firebase v8 in-memory harness records refs, reads, writes, listeners, and cleanup without contacting production. CI runs chat units, both emulator rule suites, build, and lint.

**Tech Stack:** Vitest, Testing Library, Firebase Emulator Suite, GitHub Actions, Vite.

## Global Constraints

- Depends on plans 08-14.
- Tests must not contact production Firebase, Cloudflare, or Google.
- CI rule failures block merges.

---

### Task 1: Build the Firebase v8 Chat Harness

**Files:**
- Create: `src/components/GlobalChat.integration.test.jsx`

**Interfaces:**
- Produces a test double supporting `ref`, `once`, `on`, `off`, `push`, `set`, `update`, `remove`, `transaction`, query chaining, and server timestamps.

- [x] Record every path, operation, callback, and unsubscribe.
- [x] Support deterministic seeded snapshots and emitted child/value events.
- [x] Fail any test that touches a path outside the supplied allowlist.
- [x] Mock AuthContext states independently from Firebase database state.

### Task 2: Cover Session and Identity Flows

- [x] Signed-out panel shows wall and makes zero v2 calls.
- [x] Google bootstrap writes token identity before listeners and loads an empty feed.
- [x] Account A-to-B and sign-out clear messages, drafts, unreads, pagination, and listeners.
- [x] Duplicate display names coexist by UID.
- [x] Missing/broken photo and missing name use approved fallbacks.
- [x] Initial history never reads legacy `/messages`.

### Task 3: Cover Messaging and Moderation Flows

- [x] Send text, reply, recommendation, media, edit, soft delete, react, and seen receipt with exact v2 paths/shapes.
- [x] Submit message/issue reports and create reporter-authored tickets.
- [x] Regular user cannot see/invoke broadcast, pin, hard delete, reports queue, or resolution.
- [x] Claims admin can perform those operations.
- [x] Claim revocation closes privileged UI and a mocked permission denial leaves consistent state.

### Task 4: Add Verification Scripts

**Files:**
- Modify: `package.json`

- [x] Add an explicit `test:chat` command listing identity, model, wall, GlobalChat unit/integration, and AuthContext tests.
- [x] Add:

```json
"verify:chat": "npm run test:chat && npm run test:rules:transitional && npm run test:rules && npm run build"
```

- [x] Run `npm run test:chat` and confirm the integration harness makes no network requests.

### Task 5: Make Rules Blocking in CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [x] In the existing `test` job after `npm install`, add `actions/setup-java@v4` with distribution `temurin` and `java-version: '21'`, then run rules before the production build.
- [x] Add a blocking step/job:

```yaml
- name: Run Realtime Database rules tests
  run: npm run test:rules:transitional && npm run test:rules
```

- [x] Preserve existing unit, build, and lint jobs.

### Task 6: Verify and Commit

- [x] Run:

```powershell
npm run verify:chat
npm run lint
git diff --check
```

- [x] Confirm zero failed tests, build exit zero, lint zero errors, and no external request from integration tests.
- [x] Commit:

```powershell
git add src/components/GlobalChat.integration.test.jsx .github/workflows/ci.yml package.json
git commit -m "test: cover google identity global chat flows"
```

**Checkpoint:** One command verifies all GlobalChat client/rules behavior, and CI blocks regressions in either rule artifact.
