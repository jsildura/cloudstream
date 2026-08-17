# GlobalChat Passive Participation Wall and Session Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track every checkbox.

**Goal:** Replace nickname setup with a passive participation wall and make profile bootstrap/listener cleanup safe across sign-in, sign-out, and account switching.

**Architecture:** GlobalChat has explicit `signed-out`, `bootstrapping`, `ready`, and `error` session states. The signed-out panel is a non-interactive wall that directs users to the navbar Settings panel's `.navbar-settings-signin` section; it neither displays nor invokes Google authentication. No chat ref is touched without `chatIdentity`; profile bootstrap precedes all feed/profile/pin subscriptions.

**Tech Stack:** React 19, Firebase Auth/RTDB v8, Testing Library, Vitest.

## Global Constraints

- Depends on plans 02, 04, and 08.
- Signed-out users may open the panel but perform zero chat DB operations.
- The signed-out wall has no Google button, `signInWithGoogle` dependency, or authentication side effect. Google sign-in is handled only by `.navbar-settings-signin`.
- This plan owns session lifecycle, not message field conversion.

---

### Task 1: Build the Passive Participation Wall

**Files:**
- Create: `src/components/GlobalChatSignInWall.jsx`
- Create: `src/components/GlobalChatSignInWall.test.jsx`
- Modify: `src/components/GlobalChat.css`

**Interfaces:**
- Consumes: signed-out session state.
- Produces: a passive signed-out participation wall.

- [x] Write failing tests for a sign-in-first participation message, retained header/close control, no Google sign-in button, no `signInWithGoogle` call, and no chat database operations.
- [x] Render “Sign in in Settings to participate in GlobalChat” with no button, link, Google icon, popup state, TV-specific sign-in notice, or authentication error handling.
- [x] Confirm Google sign-in remains handled by `AccountSettings` in the navbar Settings panel's `.navbar-settings-signin` section.
- [x] Keep the chat panel header/close control visible.
- [x] Run `npx vitest run src/components/GlobalChatSignInWall.test.jsx`.

### Task 2: Gate Every Chat Database Operation

**Files:**
- Modify: `src/components/GlobalChat.jsx`
- Modify: `src/components/GlobalChat.test.js`

- [x] Add a failing test opening GlobalChat with anonymous `firebaseUser`/null `chatIdentity`; assert the passive wall renders and no `globalChat/v2` ref/read/listener call occurs.
- [x] Consume `chatIdentity`, `isSignedIn`, and `isAuthLoading` from `useAuth()` instead of treating `firebaseUser` as a chat principal, but do not consume or invoke `signInWithGoogle` in GlobalChat or its wall.
- [x] Replace `isSetup` with explicit session state.
- [x] Force unread count to zero while not ready.

### Task 3: Bootstrap v2 Google Profile

- [x] Add a failing test proving profile write completes before messages/profiles/pin listeners attach.
- [x] Use `chatPath('profiles/{uid}')` and `buildChatProfile()`.
- [x] Preserve existing `joinedAt`, refresh display name/photo/updated time, and omit absent photo.
- [x] Store `{ uid, displayName, photoURL }` in the user ref; do not store nickname/admin state.
- [x] Route session-level profile/message/pin refs through `chatPath()`.

### Task 4: Remove Join Setup and Clean Listeners

- [x] Delete nickname state, suggestions, registry transactions, avatar styles/seeds, profile upload input, join handler, picker UI, and setup CSS.
- [x] Add a failing account A-to-B test proving A messages/drafts/unreads/listeners disappear and only one B listener set remains.
- [x] Execute and clear all `listenersRef` callbacks before new principal setup and on unmount.
- [x] Reset messages, reports, pin, drafts, recommendations, reactions, unread IDs, deleted IDs, pagination keys, and identity refs on UID change/sign-out.
- [x] Leave legacy admin-login code isolated for plan 14; never route it into v2.

### Task 5: Verify and Commit

- [x] Run:

```powershell
npx vitest run src/components/GlobalChatSignInWall.test.jsx src/components/GlobalChat.test.js
npm run build
git diff --check
```

- [x] Commit:

```powershell
git add src/components/GlobalChatSignInWall.jsx src/components/GlobalChatSignInWall.test.jsx src/components/GlobalChat.jsx src/components/GlobalChat.css src/components/GlobalChat.test.js
git commit -m "feat: add global chat participation wall"
```

**Checkpoint:** Signed-out chat has a passive wall with no authentication action and zero DB listeners; Google account changes produce one clean v2 session.
