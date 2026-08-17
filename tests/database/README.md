# Firebase Database Rules Testing

This directory contains automated security rules tests for Firebase Realtime Database.

## Safety & Isolation Rules

- **Never test against production:** Emulator rules tests run strictly against the local Firebase Emulator Suite under project alias `demo-streamflix`.
- **Offline testing:** The emulators execute in-memory on localhost ports (`9000` for RTDB, `9099` for Auth, `4000` for UI). No live network requests are made to Firebase servers.
- **Rules parity:** The tests load `database.rules.json` directly from the repository root to verify real production rule constraints before deployment.

## Running Tests

To run the rules unit tests:

```bash
npm run test:rules
```

To start the emulators interactively for manual testing or inspecting data in Emulator UI:

```bash
npm run firebase:emulators
```
