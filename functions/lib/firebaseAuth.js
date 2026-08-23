/**
 * Firebase ID Token verification using Web Crypto APIs (Worker compatible)
 */

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts = null;
let certsExpiryTime = 0;

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeToString(str) {
  const bytes = base64UrlDecode(str);
  return new TextDecoder().decode(bytes);
}

function pemToDer(pem) {
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

/**
 * Parses ASN.1 TLV from DER buffer
 */
function parseAsn1Length(bytes, offset) {
  const initial = bytes[offset];
  if ((initial & 0x80) === 0) {
    return { length: initial, headerLength: 1 };
  }
  const numOctets = initial & 0x7f;
  let length = 0;
  for (let i = 0; i < numOctets; i++) {
    length = (length << 8) | bytes[offset + 1 + i];
  }
  return { length, headerLength: 1 + numOctets };
}

/**
 * Extracts SubjectPublicKeyInfo (SPKI) DER from X.509 Certificate DER
 */
function extractSpkiFromCertDer(certDer) {
  let offset = 0;
  if (certDer[offset++] !== 0x30) throw new Error('Invalid X.509 cert: missing outer SEQUENCE');
  const outerSeq = parseAsn1Length(certDer, offset);
  offset += outerSeq.headerLength;

  if (certDer[offset++] !== 0x30) throw new Error('Invalid X.509 cert: missing tbsCertificate');
  const tbsSeq = parseAsn1Length(certDer, offset);
  offset += tbsSeq.headerLength;

  // 1. version [0] EXPLICIT (optional)
  if (certDer[offset] === 0xa0) {
    offset++;
    const vLen = parseAsn1Length(certDer, offset);
    offset += vLen.headerLength + vLen.length;
  }

  // 2. serialNumber (INTEGER 0x02)
  if (certDer[offset++] !== 0x02) throw new Error('Invalid X.509: missing serialNumber');
  const snLen = parseAsn1Length(certDer, offset);
  offset += snLen.headerLength + snLen.length;

  // 3. signature (AlgorithmIdentifier SEQUENCE 0x30)
  if (certDer[offset++] !== 0x30) throw new Error('Invalid X.509: missing signature algo');
  const sigLen = parseAsn1Length(certDer, offset);
  offset += sigLen.headerLength + sigLen.length;

  // 4. issuer (Name SEQUENCE/SET 0x30)
  if (certDer[offset++] !== 0x30) throw new Error('Invalid X.509: missing issuer');
  const issLen = parseAsn1Length(certDer, offset);
  offset += issLen.headerLength + issLen.length;

  // 5. validity (Validity SEQUENCE 0x30)
  if (certDer[offset++] !== 0x30) throw new Error('Invalid X.509: missing validity');
  const valLen = parseAsn1Length(certDer, offset);
  offset += valLen.headerLength + valLen.length;

  // 6. subject (Name SEQUENCE 0x30)
  if (certDer[offset++] !== 0x30) throw new Error('Invalid X.509: missing subject');
  const subLen = parseAsn1Length(certDer, offset);
  offset += subLen.headerLength + subLen.length;

  // 7. subjectPublicKeyInfo (SubjectPublicKeyInfo SEQUENCE 0x30)
  const spkiStart = offset;
  if (certDer[offset++] !== 0x30) throw new Error('Invalid X.509: missing subjectPublicKeyInfo');
  const spkiLen = parseAsn1Length(certDer, offset);
  const totalSpkiLength = 1 + spkiLen.headerLength + spkiLen.length;

  return certDer.slice(spkiStart, spkiStart + totalSpkiLength);
}

async function getGooglePublicCerts() {
  const now = Date.now();
  if (cachedCerts && now < certsExpiryTime) {
    return cachedCerts;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Google certs: HTTP ${res.status}`);
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;

  cachedCerts = await res.json();
  certsExpiryTime = now + maxAgeSec * 1000;
  return cachedCerts;
}

export function _resetCertCacheForTesting() {
  cachedCerts = null;
  certsExpiryTime = 0;
}

/**
 * Verifies a Firebase ID token from request Authorization header
 */
export async function verifyFirebaseIdToken(request, env = {}) {
  const authHeader = request?.headers?.get('Authorization') || request?.headers?.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: missing or invalid authorization header');
  }

  const idToken = authHeader.slice(7).trim();
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Unauthorized: malformed token');
  }

  let header, payload;
  try {
    header = JSON.parse(base64UrlDecodeToString(parts[0]));
    payload = JSON.parse(base64UrlDecodeToString(parts[1]));
  } catch {
    throw new Error('Unauthorized: invalid token format');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unauthorized: unsupported algorithm or missing kid');
  }

  const projectId = env?.FIREBASE_PROJECT_ID || 'streamflix-chat';
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const nowInSeconds = Math.floor(Date.now() / 1000);

  if (payload.aud !== projectId) {
    throw new Error('Unauthorized: audience mismatch');
  }
  if (payload.iss !== expectedIssuer) {
    throw new Error('Unauthorized: issuer mismatch');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Unauthorized: empty subject');
  }
  if (typeof payload.exp !== 'number' || payload.exp < nowInSeconds) {
    throw new Error('Unauthorized: token expired');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowInSeconds + 300) {
    throw new Error('Unauthorized: token issued in the future');
  }

  // Fetch certificate for kid. An injected `_TEST_CERTS` map is the complete
  // cert set for that call, so an unknown kid must not fall through to the
  // network — otherwise tests for the unknown-kid branch hit Google for real.
  let certPem;
  if (env?._TEST_CERTS) {
    certPem = env._TEST_CERTS[header.kid];
  } else {
    const certs = await getGooglePublicCerts();
    certPem = certs[header.kid];
  }

  if (!certPem) {
    throw new Error('Unauthorized: unknown key identifier');
  }

  // Import public key into SubtleCrypto
  let spkiDer;
  if (certPem.includes('BEGIN CERTIFICATE')) {
    const certDer = pemToDer(certPem);
    spkiDer = extractSpkiFromCertDer(certDer);
  } else if (certPem.includes('BEGIN PUBLIC KEY')) {
    spkiDer = pemToDer(certPem);
  } else {
    throw new Error('Unauthorized: invalid certificate format');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    spkiDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // Verify signature
  const dataToVerify = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signatureBytes = base64UrlDecode(parts[2]);

  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes,
    dataToVerify
  );

  if (!isValid) {
    throw new Error('Unauthorized: signature verification failed');
  }

  return {
    uid: payload.sub,
    provider: payload.firebase?.sign_in_provider || '',
    claims: {
      globalChatAdmin: payload.globalChatAdmin === true,
      name: payload.name,
      picture: payload.picture,
      email: payload.email,
      email_verified: payload.email_verified,
      ...payload
    }
  };
}
