import { jsonResponse, handleOptions } from '../lib/cors.js';
import { verifyFirebaseIdToken } from '../lib/firebaseAuth.js';
import { generateRawKey, computeKeyHash } from '../lib/adfreeKeys.js';
import { firebaseRestGet, firebaseRestPut } from '../lib/firebaseAdminRest.js';

export async function onRequest(context) {
  const { request, env } = context;

  const preflight = handleOptions(request, env);
  if (preflight) return preflight;

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, request, env);
  }

  // 1. Authenticate caller
  let auth;
  try {
    auth = await verifyFirebaseIdToken(request, env);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Unauthorized', message: err.message }, 401, request, env);
  }

  // 2. Authorize admin
  if (auth.provider !== 'google.com' || auth.claims?.globalChatAdmin !== true) {
    return jsonResponse({ ok: false, error: 'Forbidden', message: 'Admin access required' }, 403, request, env);
  }

  // 3. Verify server environment
  const hmacSecret = env?.AD_KEY_HMAC_SECRET;
  if (!hmacSecret) {
    return jsonResponse(
      { ok: false, error: 'Server misconfigured: missing AD_KEY_HMAC_SECRET' },
      500,
      request,
      env
    );
  }

  // 4. Parse request body
  let count = 1;
  try {
    const body = await request.json();
    if (body && typeof body.count !== 'undefined') {
      count = body.count;
    }
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, request, env);
  }

  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 25) {
    return jsonResponse(
      { ok: false, error: 'Invalid count. Must be integer between 1 and 25' },
      400,
      request,
      env
    );
  }

  // 5. Generate and store keys
  const generatedKeys = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    let rawKey = '';
    let keyHash = '';
    let attempts = 0;

    while (attempts < 5) {
      rawKey = generateRawKey();
      keyHash = await computeKeyHash(rawKey, hmacSecret);

      const existing = await firebaseRestGet(`adFreeKeys/${keyHash}`, env).catch(() => ({
        value: null
      }));
      if (!existing || !existing.value) {
        break;
      }
      attempts++;
    }

    if (attempts >= 5) {
      return jsonResponse(
        { ok: false, error: 'Key generation collision threshold exceeded' },
        500,
        request,
        env
      );
    }

    const record = {
      status: 'available',
      createdAt: now,
      createdBy: auth.uid
    };

    const putRes = await firebaseRestPut(`adFreeKeys/${keyHash}`, record, env);
    if (!putRes.ok) {
      return jsonResponse(
        { ok: false, error: 'Failed to write key to database' },
        500,
        request,
        env
      );
    }

    generatedKeys.push(rawKey);
  }

  return jsonResponse({ ok: true, keys: generatedKeys }, 200, request, env);
}
