/**
 * Firebase Realtime Database Admin REST client using Google Service Account and Web Crypto
 */

let cachedAccessToken = null;
let tokenExpiresAt = 0;

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(str) {
  return base64UrlEncode(new TextEncoder().encode(str));
}

function pemToPkcs8Der(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function _resetTokenCacheForTesting() {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}

function parseServiceAccount(env) {
  if (env?._TEST_OAUTH_TOKEN) {
    return null;
  }

  const raw = env?.FIREBASE_SERVICE_ACCOUNT || env?.SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('Missing Firebase service account credentials in environment');
  }

  if (typeof raw === 'object') {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch {
    // If base64 encoded
    try {
      return JSON.parse(atob(raw));
    } catch {
      throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON');
    }
  }
}

export async function getGoogleServiceAccountToken(env) {
  if (env?._TEST_OAUTH_TOKEN) {
    return env._TEST_OAUTH_TOKEN;
  }

  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const sa = parseServiceAccount(env);
  if (!sa.client_email || !sa.private_key) {
    throw new Error('Service account must contain client_email and private_key');
  }

  const nowSec = Math.floor(now / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope:
      'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database',
    aud: 'https://oauth2.googleapis.com/token',
    exp: nowSec + 3600,
    iat: nowSec
  };

  const headerB64 = base64UrlEncodeString(JSON.stringify(header));
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const dataToSign = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  const pkcs8Der = pemToPkcs8Der(sa.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, dataToSign);
  const sigB64 = base64UrlEncode(new Uint8Array(signature));
  const assertion = `${headerB64}.${payloadB64}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`
  });

  if (!tokenRes.ok) {
    throw new Error(`OAuth token exchange failed: HTTP ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  cachedAccessToken = tokenData.access_token;
  tokenExpiresAt = now + ((tokenData.expires_in || 3600) - 300) * 1000;
  return cachedAccessToken;
}

function getDatabaseBaseUrl(env) {
  let dbUrl = env?.FIREBASE_DATABASE_URL || 'https://streamflix-chat-default-rtdb.firebaseio.com';
  return dbUrl.replace(/\/+$/, '');
}

/**
 * Performs authenticated GET on Firebase Realtime Database
 */
export async function firebaseRestGet(path, env, options = {}) {
  const token = await getGoogleServiceAccountToken(env);
  const baseUrl = getDatabaseBaseUrl(env);
  const cleanPath = path.replace(/^\/+/, '');
  const url = `${baseUrl}/${cleanPath}.json`;

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  if (options.etag) {
    headers.set('X-Firebase-ETag', 'true');
  }

  const res = await fetch(url, {
    method: 'GET',
    headers
  });

  if (!res.ok) {
    throw new Error(`Firebase REST GET failed: HTTP ${res.status}`);
  }

  const etag = res.headers.get('ETag') || res.headers.get('etag') || null;
  const value = await res.json();
  return { value, etag };
}

/**
 * Performs authenticated PUT on Firebase Realtime Database.
 *
 * Pass `options.ifMatch` to make the write conditional. The ETag must come from
 * a prior `firebaseRestGet(..., { etag: true })` on the same path; RTDB answers
 * a mismatch with HTTP 412, which is how callers detect a lost race. A GET of an
 * empty location still yields an ETag, so a conditional write using it is a
 * create-only write.
 *
 * Requesting a conditional write without a usable ETag throws instead of
 * silently degrading to an unconditional overwrite.
 */
export async function firebaseRestPut(path, value, env, options = {}) {
  const wantsCondition = Object.prototype.hasOwnProperty.call(options, 'ifMatch');
  if (wantsCondition && (typeof options.ifMatch !== 'string' || options.ifMatch.length === 0)) {
    throw new Error('Firebase REST PUT: conditional write requested without a usable ETag');
  }

  const token = await getGoogleServiceAccountToken(env);
  const baseUrl = getDatabaseBaseUrl(env);
  const cleanPath = path.replace(/^\/+/, '');
  const url = `${baseUrl}/${cleanPath}.json`;

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  if (wantsCondition) {
    headers.set('if-match', options.ifMatch);
  }

  return fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(value)
  });
}

/**
 * Performs authenticated PATCH on Firebase Realtime Database
 */
export async function firebaseRestPatch(updates, env) {
  const token = await getGoogleServiceAccountToken(env);
  const baseUrl = getDatabaseBaseUrl(env);
  const url = `${baseUrl}/.json`;

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  return fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates)
  });
}
