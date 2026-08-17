# Firebase Authentication & Realtime Database Setup Guide

This document outlines the setup, deployment, testing, and operational procedures for Streamflix's Firebase Authentication and Realtime Database systems.

---

## 1. Firebase Console Configuration

### 1.1 Authentication Providers

In [Firebase Console](https://console.firebase.google.com/) for project **`streamflix-chat`**:

1. Navigate to **Build > Authentication > Sign-in method**.
2. **Anonymous**: Ensure Anonymous authentication is **Enabled** (anonymous auth remains for non-chat browsing and popularity tracking, while GlobalChat v2 requires Google authentication).
3. **Google**:
   - Enable **Google** sign-in provider.
   - Set the public-facing project name to `StreamFlix`.
   - Provide a valid project support email.
   - Save changes.

### 1.2 Authorized Domains

Under **Authentication > Settings > Authorized domains**, ensure the following origins are configured:

- `localhost` (for local development)
- `127.0.0.1` (for local development)
- `streamflix.stream` (production origin)
- One stable staging origin (e.g., `staging.streamflix.stream`)

> [!WARNING]
> Firebase Auth OAuth restrictions do not allow wildcard subdomain authorization (e.g., `*.pages.dev`). Do not expect ephemeral Cloudflare preview branches to complete Google OAuth popups unless explicitly added to Authorized Domains.

---

## 2. GlobalChat Privileged Credentials & Security Policy

Service-account JSON keys, RTDB database secrets, and admin password hashes must **never** be committed to source control or repository configuration.

> [!CAUTION]
> **Leaked Credential Revocation:** If credentials or secrets are ever exposed, they must be immediately revoked in the Firebase Console (Project settings > Service accounts > Database secrets) and rotated. Deleting the latest copy from source files is insufficient because Git history retains prior commits.

- **Cloudflare Pages Configuration:** Privileged backend credentials and secrets belong strictly in Cloudflare Pages dashboard environment variables or local `.dev.vars` (which is git-ignored). Never commit them to `wrangler.jsonc`.
- **GlobalChat v2 Architecture:** GlobalChat v2 operates directly with Firebase client SDK authenticated by user Google tokens against `database.rules.json`. It requires neither an admin password hash nor a database secret.

---

## 3. Deploying Realtime Database Security Rules

Realtime Database security rules (`database.rules.json`) define access controls for chat messages, user profiles, nicknames registry, abuse reports, and analytics counters.

> [!IMPORTANT]
> Deploying the frontend via Cloudflare Pages (`npm run deploy`) does **NOT** deploy Firebase security rules. Database rules must be deployed via Firebase CLI.

To deploy security rules to production:

```bash
npx firebase-tools deploy --only database --project streamflix-chat
```

*(Note: The Firebase project ID `streamflix-chat` is public and safe to commit; never commit private service account keys or admin credentials.)*

---

## 3. Testing Matrix

### 3.1 Automated Emulator Rules Tests

Security rules are validated automatically against the local Firebase Emulator Suite without touching production:

```bash
npm run test:rules
```

### 3.2 Automated Unit & Component Tests

Unit tests verify singleton initialization, `isGoogleAccount` checks, AuthContext state transitions, credential collision fallbacks, and chat isolation:

```bash
npm run test:unit
```

### 3.3 Manual OAuth Verification

Because emulators simulate tokens rather than executing third-party OAuth redirect flows:

1. **Desktop Popup Auth**:
   - Run `npm run dev` and open `http://localhost:5173`.
   - Open Settings > **Sign In** drawer.
   - Click **Continue with Google**.
   - Complete Google OAuth consent.
   - Verify drawer switches to **CONNECTED ACCOUNT** with name, email, and Sign Out button.
2. **TV Browser Mode**:
   - Emulate TV user-agent or TV device dimensions.
   - Open Settings > Sign In.
   - Verify TV warning displays: *"Sign-in is unavailable on this TV browser. Use a phone or computer."*
3. **Sign Out & Anonymous Replacement**:
   - Click **Sign Out of Google**.
   - Verify Google account is cleared and immediately replaced with an anonymous session.
   - Verify browsing, search, and video playback continue seamlessly without reloads.

---

## 4. State Reset & Troubleshooting

When testing authentication states:

- **Reset Anonymous User**: Open browser DevTools > Application > Storage > **Clear site data**.
- **Clear Local Storage**: Execute `localStorage.clear()` and `sessionStorage.clear()` in DevTools console.
- **Never Delete Production RTDB Nodes**: Never delete production database trees without following the cutover runbook.

---

## 5. GlobalChat v2 Production Cutover Runbook

This runbook defines the authoritative operational procedure to migrate Streamflix GlobalChat from legacy anonymous history/elevation to versioned Google-authenticated v2 with custom claims moderation.

### 5.1 Preflight Checklist & Verification

Before initiating production cutover, the operator must verify local build, test, and security artifacts:

```powershell
# 1. Run complete chat test suite, rule emulator suites, and production build
npm run verify:chat

# 2. Run codebase linter
npm run lint

# 3. Verify zero whitespace or formatting anomalies
git diff --check
```

**Admin Claims Inspection**:
Verify all designated moderators possess Google-authenticated accounts and have the `globalChatAdmin: true` custom claim provisioned:

```powershell
npm run chat:admin -- inspect --uid <OPERATOR_GOOGLE_UID>
```

Expected output:
- `Google Provider`: Yes (`google.com`)
- `Custom Claims`: `{ globalChatAdmin: true }`

---

### 5.2 Step-by-Step Production Cutover Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Op as Operator
    participant RTDB as Firebase RTDB
    participant CF as Cloudflare Pages
    participant Client as Users / Browsers

    Op->>RTDB: 1. Export & Encrypt Legacy Roots (/messages, /users, etc.)
    Op->>RTDB: 2. Verify /globalChat/v2 is null
    Op->>RTDB: 3. Deploy Transitional Rules (npm run deploy:firebase-rules:transitional)
    Note over RTDB: Legacy v1 accessible; v2 enabled for Google users
    Op->>CF: 4. Deploy v2 Client (npm run deploy)
    Client->>RTDB: 5. Google Users Bootstrap Profiles at /globalChat/v2/profiles
    Op->>RTDB: 6. Deploy Final Deny-Legacy Rules (npm run deploy:firebase-rules)
    Note over RTDB: Legacy roots denied (.read: false, .write: false); /secrets denied
    Op->>Client: 7. Smoke Test Desktop, Mobile, Claims Revocation
```

#### Step 1: Export Legacy Data
Export `/messages`, `/users`, `/nicknames`, `/reports`, and `/pinnedMessage` via the Firebase Console or authorized operator script. Store the encrypted export in restricted off-repository storage with a designated owner and retention deletion date.

#### Step 2: Confirm Empty v2 Root
Inspect `/globalChat/v2`. Expected value prior to deployment is `null` (or clean of non-test records).

#### Step 3: Deploy Transitional Rules
Deploy `database.rules.transitional.json` to allow legacy v1 clients to function during deployment while enabling Google v2 writes:

```powershell
npm run test:rules:transitional
npm run deploy:firebase-rules:transitional
```

#### Step 4: Deploy v2 Client
Deploy the production web bundle to Cloudflare Pages:

```powershell
npm run verify:chat
npm run deploy
```

Smoke test the live client:
- Signed-out: Shows Google sign-in wall; zero database reads/writes.
- Regular Google User: Bootstraps profile, loads empty v2 feed, sends message, reacts, replies, and creates issue report.
- Claims Admin: Sees header shield icon (Reports queue), Pin message action, Hard delete, and `@everyone` broadcast mention.

#### Step 5: Deploy Final Deny-Legacy Rules
Deploy `database.rules.json` to permanently lock down all legacy roots:

```powershell
npm run test:rules
npm run deploy:firebase-rules
```

Verify that:
- `/messages`, `/users`, `/nicknames`, `/reports`, `/pinnedMessage` return `PERMISSION_DENIED` for all users.
- `/secrets/admin_key` and `/secrets/admin_profile` deny both read and write.
- `/globalChat/v2` remains fully active.

---

### 5.3 Rollback & Incident Response Matrix

| Scenario | Trigger / Condition | Action / Remediation |
| :--- | :--- | :--- |
| **Pre-Final Defect** | Issue discovered while transitional rules are active | Redeploy previous client release and keep transitional rules. |
| **Client Defect After Final Cutover** | Regression in v2 client UI after final rules are active | Keep final rules deployed (legacy stays locked); deploy patched v2 client. |
| **Transitional Rules Defect** | Syntax or evaluation error in transitional rules | Redeploy pre-cutover baseline rules and pause deployment. |
| **Final Rules Defect** | Unintended permission denial on `/globalChat/v2` | Redeploy transitional rules as a temporary fallback; diagnose and redeploy final rules. |
| **Admin Claim Error** | Unauthorized or misconfigured claim assigned | Revoke claim using `npm run chat:admin -- revoke --uid <UID>` and audit audit logs. |
| **v2 Data Corruption** | Malformed payloads in v2 namespace | Export `/globalChat/v2` before repair. Never import anonymous legacy data into v2. |

---

### 5.4 Data Retention & Deletion Schedule

1. **Retention Period**: Legacy data exports and backups must be retained in secure offline storage for **30 days** following cutover.
2. **Post-Retention Deletion**: Once operator approval confirms production stability after 30 days:
   - Purge residual legacy nodes (`/messages`, `/users`, `/nicknames`, `/reports`, `/pinnedMessage`, `/secrets`) from Firebase Realtime Database.
   - Securely delete temporary offline backup archives.
   - Record completion in operations log.

