# Repository Baseline Notes

## Worktree & Commit Status
- Git status: Clean (no modified or untracked files).
- Git log (recent 5 commits):
  - `4f005e7` globalchat issue fix
  - `b4b05b1` feat:Slash Command & Autocomplete System for GlobalChat
  - `de48d3b` fix(lint): move U+FE0F out of the emoji character class
  - `d876c26` fix(auth): re-auth linked sessions so first-time Google users pass DB rules and disable live viewer counter
  - `60bb2b7` temp disable directplay

## Tool Versions
- Node: `v24.19.0`
- NPM: `11.17.0`

## Initial Checks
- `npm run lint`: Passed (0 errors, 21 react-hooks warnings).
- `npm run test`: Passed (41 test files, 433 tests passed).
- `npm run test:rules`: Passed (1 test file, 86 tests passed against Firebase emulator).
- `npm run build`: Passed (Vite build and PWA generation succeeded).

## Environment Requirements
- Firebase Project: `streamflix-chat`
- RTDB URL: `https://streamflix-chat-default-rtdb.firebaseio.com`
- Local Firebase Emulator switch: `VITE_USE_FIREBASE_EMULATORS=true`
- Auth Emulator Port: `9099`
- RTDB Emulator Port: `9000`
- PayPal Environment: `sandbox` during development / testing.
