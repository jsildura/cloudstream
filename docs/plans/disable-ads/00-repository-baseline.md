# Task 00: Repository Baseline And Setup

## Purpose

Create a known starting point before implementing the feature. This task does not implement ad-free behavior. It prevents a beginner developer from confusing existing worktree changes, production secrets, emulator settings, and feature changes.

## Read First

- `docs/plans/disable-ads/00-index.md`
- `Disable Ads Feature — Key-Gated, Account-Bound (Final).md`
- `src/lib/firebase.js`
- `src/contexts/AuthContext.jsx`
- `database.rules.json`
- `package.json`
- `firebase.json`
- `vite.config.js`

## Files

Create:

- `docs/plans/disable-ads/baseline-notes.md`

Do not modify application code in this task.

## Steps

### Step 1: Check the worktree

Run:

```bash
git status --short
git log --oneline -5
```

Record any pre-existing modified or untracked files in `baseline-notes.md`. The current repository already contains unrelated GlobalChat modifications and the original feature plan. Do not revert them.

### Step 2: Confirm tool versions and scripts

Run:

```bash
node --version
npm --version
npm run lint
```

If lint fails before this feature is started, copy the failure summary into `baseline-notes.md`; do not silently attribute it to this feature.

### Step 3: Confirm the existing test commands

Run:

```bash
npm run test -- --run
npm run build
```

Record whether each command passes. If a command cannot run because Firebase emulators or network access are unavailable, record the exact error and continue only after the project owner accepts that limitation.

### Step 4: Record environment requirements

In `baseline-notes.md`, document:

- Firebase project: `streamflix-chat`.
- RTDB URL: `https://streamflix-chat-default-rtdb.firebaseio.com`.
- Local Firebase emulator switch: `VITE_USE_FIREBASE_EMULATORS=true`.
- Auth emulator port: `9099`.
- RTDB emulator port: `9000`.
- PayPal will use sandbox first. No live secret is needed during development.

Never copy values from `.env` into this notes file.

## Verification

The task is complete when:

- `baseline-notes.md` exists.
- It lists the starting worktree changes.
- It records the result of lint, unit tests, and build.
- It contains no secrets.

## Handoff To Task 01

Task 01 may assume the repository baseline is recorded. It must still inspect the live `database.rules.json`; the notes are context, not authority.
