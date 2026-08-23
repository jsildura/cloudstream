import { describe, it, expect, beforeAll } from 'vitest';
import { verifyFirebaseIdToken, _resetCertCacheForTesting } from './firebaseAuth.js';

describe('functions/lib/firebaseAuth', () => {
  let testKeyPair;
  let testSpkiPem;

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

  function spkiToPem(spkiBuffer) {
    let binary = '';
    const bytes = new Uint8Array(spkiBuffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary);
    return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----`;
  }

  async function createSignedToken(headerOverrides = {}, payloadOverrides = {}) {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = {
      alg: 'RS256',
      kid: 'test-kid-1',
      typ: 'JWT',
      ...headerOverrides
    };
    const payload = {
      iss: 'https://securetoken.google.com/streamflix-chat',
      aud: 'streamflix-chat',
      sub: 'google-user-123',
      exp: nowSec + 3600,
      iat: nowSec,
      auth_time: nowSec,
      firebase: {
        sign_in_provider: 'google.com'
      },
      name: 'Alice',
      email: 'alice@example.com',
      globalChatAdmin: true,
      ...payloadOverrides
    };

    const headerB64 = base64UrlEncodeString(JSON.stringify(header));
    const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
    const dataToSign = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      testKeyPair.privateKey,
      dataToSign
    );
    const sigB64 = base64UrlEncode(new Uint8Array(signature));
    return `${headerB64}.${payloadB64}.${sigB64}`;
  }

  beforeAll(async () => {
    testKeyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['sign', 'verify']
    );

    const spkiBuffer = await crypto.subtle.exportKey('spki', testKeyPair.publicKey);
    testSpkiPem = spkiToPem(spkiBuffer);
  });

  it('verifies valid Google Firebase ID token and extracts claims', async () => {
    const token = await createSignedToken();
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const env = {
      FIREBASE_PROJECT_ID: 'streamflix-chat',
      _TEST_CERTS: { 'test-kid-1': testSpkiPem }
    };

    const result = await verifyFirebaseIdToken(req, env);
    expect(result.uid).toBe('google-user-123');
    expect(result.provider).toBe('google.com');
    expect(result.claims.globalChatAdmin).toBe(true);
    expect(result.claims.name).toBe('Alice');
  });

  it('rejects missing Authorization header', async () => {
    const req = new Request('http://localhost/api/test');
    await expect(verifyFirebaseIdToken(req)).rejects.toThrow(/missing or invalid/i);
  });

  it('rejects malformed token structure', async () => {
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer not.a.valid.jwt.token' }
    });
    await expect(verifyFirebaseIdToken(req)).rejects.toThrow();
  });

  it('rejects expired token', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await createSignedToken({}, { exp: nowSec - 100 });
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const env = { _TEST_CERTS: { 'test-kid-1': testSpkiPem } };
    await expect(verifyFirebaseIdToken(req, env)).rejects.toThrow(/expired/i);
  });

  it('rejects audience mismatch', async () => {
    const token = await createSignedToken({}, { aud: 'wrong-project' });
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const env = { _TEST_CERTS: { 'test-kid-1': testSpkiPem } };
    await expect(verifyFirebaseIdToken(req, env)).rejects.toThrow(/audience/i);
  });

  it('rejects issuer mismatch', async () => {
    const token = await createSignedToken({}, { iss: 'https://securetoken.google.com/other-project' });
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const env = { _TEST_CERTS: { 'test-kid-1': testSpkiPem } };
    await expect(verifyFirebaseIdToken(req, env)).rejects.toThrow(/issuer/i);
  });

  it('rejects unknown kid', async () => {
    const token = await createSignedToken({ kid: 'unknown-kid' });
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const env = { _TEST_CERTS: { 'test-kid-1': testSpkiPem } };
    await expect(verifyFirebaseIdToken(req, env)).rejects.toThrow(/unknown key/i);
  });
});
