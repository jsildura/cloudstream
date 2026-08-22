#!/usr/bin/env node
/**
 * GlobalChat FAQ Seed CLI
 *
 * Writes the default `/faq` entries to `globalChat/v2/commands/faq` so the chat
 * command has content before an admin ever opens the dashboard. Entries are
 * validated against the same caps the RTDB rules enforce, so a seeded node stays
 * editable from the admin dashboard's Commands tab.
 *
 * Dry run (default):  npm run chat:seed-faq
 * Write:              npm run chat:seed-faq -- --confirm seed
 * Replace existing:   npm run chat:seed-faq -- --confirm seed --force
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    chatPath,
    MAX_FAQ_QUESTION_LENGTH,
    MAX_FAQ_ANSWER_LENGTH,
    MAX_FAQ_ITEMS
} from '../src/lib/globalChatModel.js';

const DATABASE_URL = 'https://streamflix-chat-default-rtdb.firebaseio.com';
const CONFIRM_TOKEN = 'seed';

/**
 * Default FAQ content. `order` drives the display sequence in both the chat
 * card and the admin dashboard list.
 */
export const DEFAULT_FAQ = [
    {
        question: 'How do I watch a movie or TV show?',
        answer: 'Search for the title using the search bar, select it, pick a server, and click Play.',
        order: 0
    },
    {
        question: "Why isn't the video loading or buffering?",
        answer: 'Try switching to a different server using the server selector below the player. If the issue persists, refresh the page.',
        order: 1
    },
    {
        question: 'How do I report a broken link or video?',
        answer: 'Open the chat menu (+), select "Report Issue", choose a category, and submit. The team will be notified.',
        order: 2
    },
    {
        question: 'Can I request a movie or TV show?',
        answer: 'Yes! Send your request in the community chat and an admin will review it.',
        order: 3
    },
    {
        question: 'How do I continue watching where I left off?',
        answer: 'Sign in with your Google account. Your watch progress syncs automatically across devices via the "Continue Watching" row on the homepage.',
        order: 4
    },
    {
        question: 'Why are some servers not working?',
        answer: 'Servers are maintained by third parties. If one is down, try another. The app will auto-fallback if a server fails during playback.',
        order: 5
    },
    {
        question: 'How do I cast to my TV?',
        answer: "Use your browser's built-in cast feature (Chromecast) or screen mirroring. Some servers support native casting via the player controls.",
        order: 6
    },
    {
        question: 'Is StreamFlix free?',
        answer: 'Yes, StreamFlix is completely free. We are supported by non-intrusive ads.',
        order: 7
    }
];

/**
 * Parses CLI arguments.
 *
 * @param {string[]} argv
 * @returns {{ confirm: string|null, force: boolean }}
 */
export function parseArgs(argv = []) {
    let confirm = null;
    let force = false;
    const seenFlags = new Set();

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--confirm') {
            if (seenFlags.has('--confirm')) {
                throw new Error('Duplicate flag: --confirm');
            }
            seenFlags.add('--confirm');
            i++;
            if (i >= argv.length || argv[i].startsWith('--')) {
                throw new Error('Missing value for --confirm');
            }
            confirm = argv[i];
        } else if (arg === '--force') {
            if (seenFlags.has('--force')) {
                throw new Error('Duplicate flag: --force');
            }
            seenFlags.add('--force');
            force = true;
        } else {
            throw new Error(`Unknown flag: ${arg}`);
        }
    }

    if (confirm !== null && confirm !== CONFIRM_TOKEN) {
        throw new Error(`Confirmation must be "${CONFIRM_TOKEN}"`);
    }

    return { confirm, force };
}

/**
 * Validates entries against the caps the RTDB rules enforce. Throws on the
 * first violation so a bad seed never reaches the database.
 *
 * @param {Array<{question: string, answer: string, order: number}>} entries
 * @returns {Array} the same entries, for chaining
 */
export function validateFaqEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error('FAQ entries must be a non-empty array');
    }
    if (entries.length > MAX_FAQ_ITEMS) {
        throw new Error(`Too many FAQ entries: ${entries.length} (max ${MAX_FAQ_ITEMS})`);
    }

    const seenOrders = new Set();
    entries.forEach((entry, idx) => {
        const label = `entry ${idx + 1}`;
        if (!entry || typeof entry !== 'object') {
            throw new Error(`${label}: must be an object`);
        }
        if (typeof entry.question !== 'string' || entry.question.trim().length === 0) {
            throw new Error(`${label}: question is required`);
        }
        if (entry.question.length > MAX_FAQ_QUESTION_LENGTH) {
            throw new Error(`${label}: question is ${entry.question.length} chars (max ${MAX_FAQ_QUESTION_LENGTH})`);
        }
        if (typeof entry.answer !== 'string' || entry.answer.trim().length === 0) {
            throw new Error(`${label}: answer is required`);
        }
        if (entry.answer.length > MAX_FAQ_ANSWER_LENGTH) {
            throw new Error(`${label}: answer is ${entry.answer.length} chars (max ${MAX_FAQ_ANSWER_LENGTH})`);
        }
        if (typeof entry.order !== 'number' || !Number.isFinite(entry.order) || entry.order < 0) {
            throw new Error(`${label}: order must be a number >= 0`);
        }
        if (seenOrders.has(entry.order)) {
            throw new Error(`${label}: duplicate order ${entry.order}`);
        }
        seenOrders.add(entry.order);

        const extras = Object.keys(entry).filter(k => !['question', 'answer', 'order'].includes(k));
        if (extras.length > 0) {
            throw new Error(`${label}: unexpected keys (${extras.join(', ')}) — rules reject them`);
        }
    });

    return entries;
}

/**
 * Builds the push-keyed write payload. The key factory is injected so this stays
 * testable without a live database.
 *
 * @param {Array<{question: string, answer: string, order: number}>} entries
 * @param {() => string} nextKey
 * @returns {Object} map of push key → entry
 */
export function buildFaqUpdates(entries, nextKey) {
    validateFaqEntries(entries);

    const updates = {};
    for (const entry of entries) {
        const key = nextKey();
        if (!key || typeof key !== 'string') {
            throw new Error('Key factory returned an invalid key');
        }
        if (updates[key]) {
            throw new Error(`Key factory returned a duplicate key: ${key}`);
        }
        updates[key] = { question: entry.question, answer: entry.answer, order: entry.order };
    }
    return updates;
}

/**
 * Resolves Firebase Admin credentials from local service account JSON or
 * Application Default Credentials.
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
 * Connects to the production RTDB and returns a ref to the FAQ node.
 * Injected into `main` so the write path stays testable without a live database.
 */
async function connectFaqRef() {
    const { initializeApp, applicationDefault, cert, getApps } = await import('firebase-admin/app');
    const { getDatabase } = await import('firebase-admin/database');

    const app = getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: resolveCredential(applicationDefault, cert),
            projectId: 'streamflix-chat',
            databaseURL: DATABASE_URL
        });

    return getDatabase(app).ref(chatPath('commands', 'faq'));
}

/**
 * Main execution function for the seed CLI.
 *
 * @param {string[]} argv
 * @param {{ connect?: () => Promise<Object> }} deps
 */
export async function main(argv = process.argv.slice(2), { connect = connectFaqRef } = {}) {
    const { confirm, force } = parseArgs(argv);
    const targetPath = chatPath('commands', 'faq');
    validateFaqEntries(DEFAULT_FAQ);

    console.log('\n=====================================================');
    console.log(' StreamFlix: Seed GlobalChat /faq Entries');
    console.log('=====================================================');
    console.log(`Target path: ${targetPath}`);
    console.log(`Entries:     ${DEFAULT_FAQ.length}`);
    console.log(`Mode:        ${confirm ? (force ? 'WRITE (replace existing)' : 'WRITE (append to empty node)') : 'DRY RUN'}\n`);

    DEFAULT_FAQ.forEach((entry, idx) => {
        console.log(`  ${idx + 1}. ${entry.question}`);
        console.log(`     → ${entry.answer}`);
    });

    if (!confirm) {
        console.log(`\n[chat:seed-faq] Dry run only — nothing written.`);
        console.log(`[chat:seed-faq] Re-run with --confirm ${CONFIRM_TOKEN} to write.\n`);
        return { written: 0, replaced: 0, dryRun: true };
    }

    const faqRef = await connect();
    const existing = await faqRef.once('value');
    const existingCount = existing.exists() ? existing.numChildren() : 0;

    if (existingCount > 0 && !force) {
        throw new Error(
            `${targetPath} already has ${existingCount} entr${existingCount === 1 ? 'y' : 'ies'}. ` +
            `Re-run with --force to replace them, or edit them from the admin dashboard's Commands tab.`
        );
    }

    const updates = buildFaqUpdates(DEFAULT_FAQ, () => faqRef.push().key);

    if (force) {
        // set() replaces the whole node so a re-seed can't leave stale entries
        // behind or duplicate the defaults.
        await faqRef.set(updates);
        console.log(`\n[chat:seed-faq] Replaced ${existingCount} existing entr${existingCount === 1 ? 'y' : 'ies'}.`);
    } else {
        await faqRef.update(updates);
    }

    console.log(`[chat:seed-faq] Wrote ${DEFAULT_FAQ.length} FAQ entries to ${targetPath}.`);
    console.log(`[chat:seed-faq] Type /faq in the chat to verify, or open the admin dashboard's Commands tab to edit.\n`);

    return { written: DEFAULT_FAQ.length, replaced: force ? existingCount : 0, dryRun: false };
}

// Direct-execution guard
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(`\n[chat:seed-faq error] ${err.message || err}\n`);
            process.exit(1);
        });
}
