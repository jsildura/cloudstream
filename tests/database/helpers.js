import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ID = 'demo-streamflix';
let testEnv = null;

export async function getTestEnvironment() {
  if (!testEnv) {
    const rulesFilename = process.env.RULES_FILE || 'database.rules.json';
    const rulesPath = path.resolve(process.cwd(), rulesFilename);
    if (!fs.existsSync(rulesPath)) {
      throw new Error(`Firebase rules file not found at: ${rulesPath}`);
    }
    const rules = fs.readFileSync(rulesPath, 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      database: {
        rules,
        host: '127.0.0.1',
        port: 9000
      }
    });
  }
  return testEnv;
}

export async function createUnauthenticatedContext() {
  const env = await getTestEnvironment();
  return env.unauthenticatedContext().database();
}

export async function createAnonymousContext(uid = 'anon-user-1') {
  const env = await getTestEnvironment();
  return env.authenticatedContext(uid, {
    firebase: { sign_in_provider: 'anonymous' }
  }).database();
}

export async function createGoogleContext(uid = 'google-user-1', options = {}) {
  const opts = typeof options === 'string' ? { email: options } : (options || {});
  const {
    email = 'user@example.com',
    name = 'Alice',
    picture = 'https://img.test/alice.jpg',
    globalChatAdmin = false
  } = opts;

  const token = {
    email,
    name,
    picture,
    firebase: { sign_in_provider: 'google.com' }
  };

  if (globalChatAdmin === true) {
    token.globalChatAdmin = true;
  }

  const env = await getTestEnvironment();
  return env.authenticatedContext(uid, token).database();
}

export async function createGoogleAdminContext(uid = 'google-admin-1', options = {}) {
  const opts = typeof options === 'string' ? { email: options } : (options || {});
  return createGoogleContext(uid, {
    ...opts,
    globalChatAdmin: true
  });
}

export async function clearDatabase() {
  const env = await getTestEnvironment();
  await env.clearDatabase();
}

export async function cleanupTestEnvironment() {
  if (testEnv) {
    await testEnv.cleanup();
    testEnv = null;
  }
}
