# GlobalChat Reactions and Seen Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track every checkbox.

**Goal:** Replace parent-message status/reaction mutations with narrow per-user child writes matching v2 rules.

**Architecture:** Reactions are `{ uid: emoji }`; seen receipts are `{ uid: true }`. Rendering groups reaction values and resolves reactor names from the v2 profile cache.

**Tech Stack:** React 19, Firebase RTDB v8, Vitest, Firebase Emulator Suite.

## Global Constraints

- Depends on plans 06, 10, and 11.
- Never write another user's reaction or seen child.
- Remove mutable parent `status` behavior.

---

### Task 1: Convert Reaction Writes

**Files:**
- Modify: `src/components/GlobalChat.jsx`
- Modify: `src/components/GlobalChat.test.js`

- [x] Add failing tests for add, replace, toggle-off, invalid emoji rejection, and exact child path.
- [x] Use exactly `❤️`, `😂`, `😮`, `😢`, `😡`, and `👍` so the client and rules allowlists match.
- [x] Write/delete only `chatPath('messages/{id}/reactions/{chatIdentity.uid}')`.
- [x] Remove the parent reaction transaction and old `{ emoji: { uid: nickname } }` assumptions.

### Task 2: Convert Reaction Rendering

- [x] Rewrite `getReactionData()` for `{ uid: emoji }`, grouping counts by emoji.
- [x] Resolve reactor names through v2 profiles, with “Google User” for a missing profile.
- [x] Add tests for grouped count, selected-current-user state, duplicate display names, and missing profile.
- [x] Update reaction detail UI/CSS only where the new shape requires it.

### Task 3: Convert Seen Receipts

- [x] Add failing tests for broadcast/open-chat seen writes at `seenBy/{uid} = true`.
- [x] Remove writes to another author's parent `status` field.
- [x] Derive own-message seen indicator when `seenBy` contains at least one UID different from author UID.
- [x] Keep unread broadcast calculation based on caller UID presence.

### Task 4: Verify and Commit

- [x] Run:

```powershell
npx vitest run src/components/GlobalChat.test.js
npm run test:rules
npm run build
rg -n "status.*seen|reactionsRef.*transaction|reactions\]\[" src/components/GlobalChat.jsx
git diff --check
```

- [ ] Commit:

```powershell
git add src/components/GlobalChat.jsx src/components/GlobalChat.test.js src/components/GlobalChat.css
git commit -m "feat: secure chat reactions and seen receipts"
```

**Checkpoint:** Reaction and read-receipt behavior works through caller-owned child paths and complies with emulator rules.
