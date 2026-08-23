#!/usr/bin/env node
/**
 * Streamflix Ad-Free Keys Generator CLI
 *
 * Operator CLI tool to generate and register ad-free entitlement keys
 * in Firebase Realtime Database.
 */

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const KEY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const KEY_REGEX = /^SFXAD-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;

/**
 * Parses CLI arguments.
 *
 * @param {string[]} argv
 * @returns {{ count: number, hmacSecret: string|null }}
 */
export function parseArgs(argv = []) {
  let count = 1;
  let hmacSecret = null;
  const seenFlags = new Set();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--count') {
      if (seenFlags.has('--count')) {
        throw new Error('Duplicate flag: --count');
      }
      seenFlags.add('--count');
      i++;
      if (i >= argv.length || argv[i].startsWith('--')) {
        throw new Error('Missing value for --count');
      }
      const parsed = Number(argv[i]);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 25) {
        throw new Error('Count must be an integer between 1 and 25');
      }
      count = parsed;
    } else if (arg === '--hmac-secret') {
      if (seenFlags.has('--hmac-secret')) {
        throw new Error('Duplicate flag: --hmac-secret');
      }
      seenFlags.add('--hmac-secret');
      i++;
      if (i >= argv.length || argv[i].startsWith('--')) {
        throw new Error('Missing value for --hmac-secret');
      }
      hmacSecret = argv[i];
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  return { count, hmacSecret };
}

export function normalizeRawKey(value) {
  if (typeof value !== 'string') {
    throw new Error('Key must be a string');
  }

  const trimmed = value.trim().toUpperCase();
  if (!KEY_REGEX.test(trimmed)) {
    throw new Error('Invalid key format. Expected SFXAD-XXXXX-XXXXX-XXXXX');
  }

  return trimmed;
}

export function generateRawKey() {
  const bytes = crypto.randomBytes(15);
  let keyChars = '';
  for (let i = 0; i < 15; i++) {
    const idx = bytes[i] % KEY_ALPHABET.length;
    keyChars += KEY_ALPHABET[idx];
  }

  const p1 = keyChars.slice(0, 5);
  const p2 = keyChars.slice(5, 10);
  const p3 = keyChars.slice(10, 15);

  return `SFXAD-${p1}-${p2}-${p3}`;
}

export function computeKeyHash(rawKey, hmacSecret) {
  if (!hmacSecret || typeof hmacSecret !== 'string') {
    throw new Error('HMAC secret is required');
  }

  const normalized = normalizeRawKey(rawKey);
  return crypto.createHmac('sha256', hmacSecret).update(normalized, 'utf8').digest('hex');
}

/**
 * Resolves Firebase Admin credentials from local service account JSON or Application Default Credentials.
 */
function resolveCredential(applicationDefault, cert) {
  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  ) {
    return applicationDefault();
  }

  const standardFiles = [
    'service-account.json',
    'serviceAccountKey.json',
    'firebase-service-account.json'
  ];
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

async function main() {
  const argv = process.argv.slice(2);
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error('\nUsage: node scripts/generate-adfree-keys.mjs [--count <1-25>] [--hmac-secret <secret>]');
    process.exit(1);
  }

  const hmacSecret = parsed.hmacSecret || process.env.AD_KEY_HMAC_SECRET;
  if (!hmacSecret) {
    console.error('Error: HMAC secret must be provided via --hmac-secret or AD_KEY_HMAC_SECRET env variable');
    process.exit(1);
  }

  let admin;
  try {
    admin = await import('firebase-admin');
  } catch (_e) {
    console.error('Error: firebase-admin package is required to execute this CLI script directly');
    process.exit(1);
  }

  if (!admin.default.apps.length) {
    const databaseURL =
      process.env.FIREBASE_DATABASE_URL || 'https://streamflix-chat-default-rtdb.firebaseio.com';
    admin.default.initializeApp({
      credential: resolveCredential(admin.default.credential.applicationDefault, admin.default.credential.cert),
      databaseURL
    });
  }

  const db = admin.default.database();
  const keysNode = db.ref('adFreeKeys');
  const now = Date.now();
  const generatedKeys = [];

  console.log(`Generating ${parsed.count} ad-free key(s)...`);

  for (let i = 0; i < parsed.count; i++) {
    const rawKey = generateRawKey();
    const hash = computeKeyHash(rawKey, hmacSecret);

    await keysNode.child(hash).set({
      status: 'available',
      createdAt: now,
      createdBy: 'cli-operator'
    });

    generatedKeys.push(rawKey);
  }

  console.log('\n--- Generated Keys ---');
  generatedKeys.forEach((k) => console.log(k));
  console.log('----------------------\n');
  console.log(`Successfully registered ${generatedKeys.length} key(s) in /adFreeKeys.`);
  process.exit(0);
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();

if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}
