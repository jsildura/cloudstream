#!/usr/bin/env node
/**
 * GlobalChat Operator Admin Claims CLI
 * 
 * Operator-only tool to inspect, grant, and revoke `globalChatAdmin` custom claims
 * using Firebase Admin SDK and Application Default Credentials.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Parses CLI arguments.
 * 
 * @param {string[]} argv
 * @returns {{ action: 'inspect'|'grant'|'revoke', uid: string, confirm: string|null }}
 */
export function parseArgs(argv = []) {
    if (!argv || argv.length === 0) {
        throw new Error('Missing action: specify inspect, grant, or revoke');
    }

    const action = argv[0];
    if (!['inspect', 'grant', 'revoke'].includes(action)) {
        throw new Error(`Unknown action: "${action}". Must be inspect, grant, or revoke`);
    }

    let uid = null;
    let confirm = null;
    const seenFlags = new Set();

    for (let i = 1; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--uid') {
            if (seenFlags.has('--uid')) {
                throw new Error('Duplicate flag: --uid');
            }
            seenFlags.add('--uid');
            i++;
            if (i >= argv.length || argv[i].startsWith('--')) {
                throw new Error('Missing value for --uid');
            }
            uid = argv[i];
        } else if (arg === '--confirm') {
            if (seenFlags.has('--confirm')) {
                throw new Error('Duplicate flag: --confirm');
            }
            seenFlags.add('--confirm');
            i++;
            if (i >= argv.length || argv[i].startsWith('--')) {
                throw new Error('Missing value for --confirm');
            }
            confirm = argv[i];
        } else {
            throw new Error(`Unknown flag: ${arg}`);
        }
    }

    if (!uid) {
        throw new Error('Missing --uid');
    }

    if (action === 'grant' || action === 'revoke') {
        if (!confirm) {
            throw new Error('Missing --confirm');
        }
        if (confirm !== uid) {
            throw new Error('Confirmation must match UID');
        }
    } else {
        confirm = null;
    }

    return { action, uid, confirm };
}

/**
 * Computes next custom claims preserving unrelated claims.
 * 
 * @param {Object} currentClaims
 * @param {'grant'|'revoke'} action
 * @returns {Object}
 */
export function nextClaims(currentClaims, action) {
    const claims = currentClaims && typeof currentClaims === 'object' ? { ...currentClaims } : {};
    if (action === 'grant') {
        claims.globalChatAdmin = true;
    } else if (action === 'revoke') {
        delete claims.globalChatAdmin;
    }
    return claims;
}

/**
 * Masks an email address for privacy in console logs.
 * 
 * @param {string} email
 * @returns {string}
 */
export function maskEmail(email) {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return '[no email]';
    }
    const [user, domain] = email.split('@');
    if (user.length <= 1) {
        return `${user}***@${domain}`;
    }
    return `${user[0]}***${user[user.length - 1]}@${domain}`;
}

import fs from 'node:fs';

/**
 * Resolves Firebase Admin credentials from local service account JSON or Application Default Credentials.
 */
function resolveCredential(applicationDefault, cert) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        return applicationDefault();
    }

    const standardFiles = ['service-account.json', 'serviceAccountKey.json', 'firebase-service-account.json'];
    for (const name of standardFiles) {
        const fullPath = path.resolve(process.cwd(), name);
        if (fs.existsSync(fullPath)) {
            const key = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            return cert(key);
        }
    }

    try {
        const files = fs.readdirSync(process.cwd());
        const adminKeyFile = files.find((f) => f.includes('adminsdk') && f.endsWith('.json'));
        if (adminKeyFile) {
            const fullPath = path.resolve(process.cwd(), adminKeyFile);
            const key = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            return cert(key);
        }
    } catch {
        // Fall back to applicationDefault()
    }

    return applicationDefault();
}

/**
 * Main execution function for operator CLI.
 */
export async function main(argv = process.argv.slice(2)) {
    const { action, uid } = parseArgs(argv);

    const { initializeApp, applicationDefault, cert, getApps } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');

    const app = getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: resolveCredential(applicationDefault, cert),
            projectId: 'streamflix-chat'
        });

    const auth = getAuth(app);
    const userRecord = await auth.getUser(uid);
    const isGoogle = Array.isArray(userRecord.providerData) &&
        userRecord.providerData.some((p) => p.providerId === 'google.com');
    const currentClaims = userRecord.customClaims || {};
    const isCurrentlyAdmin = currentClaims.globalChatAdmin === true;

    if (action === 'inspect') {
        console.log('\n--- Firebase User Record ---');
        console.log(`UID:                 ${userRecord.uid}`);
        console.log(`Email (masked):      ${maskEmail(userRecord.email)}`);
        console.log(`Google Provider:     ${isGoogle ? 'YES' : 'NO'}`);
        console.log(`globalChatAdmin:     ${isCurrentlyAdmin ? 'true' : 'false'}`);
        console.log(`All Custom Claims:   ${JSON.stringify(currentClaims, null, 2)}\n`);
        return;
    }

    if (!isGoogle) {
        throw new Error(`Cannot ${action} admin claims for non-Google user (${userRecord.uid})`);
    }

    const updatedClaims = nextClaims(currentClaims, action);
    await auth.setCustomUserClaims(uid, updatedClaims);

    console.log(`\n[chat:admin] Successfully ${action === 'grant' ? 'granted' : 'revoked'} globalChatAdmin for UID: ${uid}`);
    console.log(`[chat:admin] New Custom Claims: ${JSON.stringify(updatedClaims)}`);
    console.log(`[IMPORTANT] The affected user must refresh their ID token or sign out and sign back in for changes to take effect.\n`);
}

// Direct-execution guard
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main().catch((err) => {
        console.error(`\n[chat:admin error] ${err.message || err}\n`);
        process.exit(1);
    });
}
