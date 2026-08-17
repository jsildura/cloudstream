#!/usr/bin/env node
/**
 * Streamflix Anonymous Users Cleanup Script
 * 
 * Safely removes legacy anonymous Firebase Auth user accounts in bulk
 * while strictly preserving all Google-authenticated accounts.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Determines whether a Firebase Auth UserRecord is an anonymous user.
 * 
 * @param {import('firebase-admin/auth').UserRecord} user
 * @returns {boolean}
 */
export function isAnonymousUser(user) {
    if (!user) return false;
    // Any user with an email or custom provider (e.g. google.com) is NOT anonymous
    if (user.email) return false;
    if (Array.isArray(user.providerData) && user.providerData.length > 0) {
        return false;
    }
    return true;
}

/**
 * Main execution function to list and delete anonymous users in bulk batches.
 */
export async function cleanAnonymousUsers() {
    console.log('=====================================================');
    console.log(' Streamflix: Cleaning Up Legacy Anonymous Accounts');
    console.log('=====================================================\n');

    let app;
    try {
        app = getApps().length > 0
            ? getApps()[0]
            : initializeApp({
                credential: applicationDefault(),
                projectId: 'streamflix-chat'
            });
    } catch (err) {
        console.error('❌ Failed to initialize Firebase Admin SDK.');
        console.error('Please ensure you are logged into Google Cloud / Firebase credentials:');
        console.error('  npx gcloud auth application-default login\n');
        throw err;
    }

    const auth = getAuth(app);
    let nextPageToken;
    let totalDeleted = 0;
    let totalGooglePreserved = 0;

    do {
        process.stdout.write('Fetching next batch of users...');
        const listResult = await auth.listUsers(1000, nextPageToken);
        const anonUids = [];

        for (const user of listResult.users) {
            if (isAnonymousUser(user)) {
                anonUids.push(user.uid);
            } else {
                totalGooglePreserved++;
            }
        }

        console.log(` Found ${anonUids.length} anonymous accounts (${listResult.users.length} total fetched).`);

        if (anonUids.length > 0) {
            // Firebase Admin deleteUsers supports up to 1,000 UIDs at a time
            const deleteResult = await auth.deleteUsers(anonUids);
            totalDeleted += deleteResult.successCount;

            if (deleteResult.failureCount > 0) {
                console.warn(`⚠️ Warning: ${deleteResult.failureCount} accounts could not be deleted.`);
                deleteResult.errors.forEach((err) => {
                    console.warn(`  - Error at index ${err.index}: ${err.error.message}`);
                });
            }
            console.log(`✅ Successfully deleted ${deleteResult.successCount} anonymous users.`);
        }

        nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    console.log('\n=====================================================');
    console.log(' Cleanup Summary');
    console.log('=====================================================');
    console.log(`Total Anonymous Accounts Deleted: ${totalDeleted}`);
    console.log(`Total Google Accounts Preserved:  ${totalGooglePreserved}`);
    console.log('=====================================================\n');
}

// Direct execution guard
const isDirectExecution = process.argv[1] &&
    process.argv[1].replace(/\\/g, '/').endsWith('scripts/cleanup-anonymous-users.mjs');

if (isDirectExecution) {
    cleanAnonymousUsers().catch((err) => {
        console.error('Execution error:', err?.message || err);
        process.exit(1);
    });
}
