import { jsonResponse, handleOptions } from '../lib/cors.js';
import { verifyFirebaseIdToken } from '../lib/firebaseAuth.js';
import { normalizeRawKey, computeKeyHash } from '../lib/adfreeKeys.js';
import { firebaseRestGet, firebaseRestPut } from '../lib/firebaseAdminRest.js';

export async function onRequest(context) {
  const { request, env } = context;

  const preflight = handleOptions(request, env);
  if (preflight) return preflight;

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, request, env);
  }

  // 1. Authenticate user
  let auth;
  try {
    auth = await verifyFirebaseIdToken(request, env);
  } catch (err) {
    return jsonResponse(
      { ok: false, error: 'Unauthorized', message: err.message },
      401,
      request,
      env
    );
  }

  // 2. Enforce Google authentication (anonymous users cannot hold permanent entitlements)
  if (auth.provider !== 'google.com') {
    return jsonResponse(
      {
        ok: false,
        reason: 'auth-required',
        message: 'Google account required to redeem ad-free access'
      },
      403,
      request,
      env
    );
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

  // 4. Parse request body and key
  let bodyText = '';
  try {
    bodyText = await request.text();
  } catch {
    return jsonResponse({ ok: false, error: 'Failed to read request body' }, 400, request, env);
  }

  if (bodyText.length > 2048) {
    return jsonResponse({ ok: false, error: 'Request body exceeds maximum size' }, 400, request, env);
  }

  let body = {};
  try {
    body = JSON.parse(bodyText || '{}');
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, request, env);
  }

  if (!body.key || typeof body.key !== 'string') {
    return jsonResponse(
      { ok: false, reason: 'key-invalid', message: 'Missing key field' },
      400,
      request,
      env
    );
  }

  let normalizedKey = '';
  try {
    normalizedKey = normalizeRawKey(body.key);
  } catch {
    return jsonResponse(
      {
        ok: false,
        reason: 'key-invalid',
        message: 'Invalid key format. Expected SFXAD-XXXXX-XXXXX-XXXXX'
      },
      400,
      request,
      env
    );
  }

  const keyHash = await computeKeyHash(normalizedKey, hmacSecret);
  const requestId = crypto.randomUUID();
  const now = Date.now();

  // 5. Check if user already has an entitlement
  try {
    const accountRes = await firebaseRestGet(`accounts/${auth.uid}/adFree`, env, { etag: true });
    if (accountRes && accountRes.value && typeof accountRes.value === 'object') {
      return jsonResponse(
        { ok: false, reason: 'already-ad-free', message: 'Account is already ad-free' },
        409,
        request,
        env
      );
    }
  } catch {
    return jsonResponse(
      { ok: false, reason: 'redemption-failed', message: 'Failed to query account status' },
      500,
      request,
      env
    );
  }

  // 6. Fetch key record with ETag
  let keyRes;
  try {
    keyRes = await firebaseRestGet(`adFreeKeys/${keyHash}`, env, { etag: true });
  } catch {
    return jsonResponse(
      { ok: false, reason: 'redemption-failed', message: 'Failed to query key record' },
      500,
      request,
      env
    );
  }

  if (!keyRes || !keyRes.value) {
    return jsonResponse(
      { ok: false, reason: 'key-invalid', message: 'Key does not exist' },
      404,
      request,
      env
    );
  }

  const keyRecord = keyRes.value;
  if (keyRecord.status === 'redeemed') {
    return jsonResponse(
      { ok: false, reason: 'key-already-redeemed', message: 'Key has already been redeemed' },
      409,
      request,
      env
    );
  }

  if (keyRecord.status === 'claiming') {
    return jsonResponse(
      { ok: false, reason: 'key-already-redeemed', message: 'Key is currently being claimed' },
      409,
      request,
      env
    );
  }

  if (keyRecord.status !== 'available') {
    return jsonResponse(
      { ok: false, reason: 'key-already-redeemed', message: 'Key is not available' },
      409,
      request,
      env
    );
  }

  // 7. Atomic claim with If-Match ETag
  const claimingRecord = {
    ...keyRecord,
    status: 'claiming',
    boundTo: auth.uid,
    requestId,
    claimedAt: now
  };

  const claimPut = await firebaseRestPut(`adFreeKeys/${keyHash}`, claimingRecord, env, {
    ifMatch: keyRes.etag
  }).catch(() => null);

  if (!claimPut) {
    // No usable ETag: refuse rather than overwrite another request's claim
    return jsonResponse(
      { ok: false, reason: 'redemption-failed', message: 'Failed to lock key' },
      500,
      request,
      env
    );
  }

  if (claimPut.status === 412) {
    return jsonResponse(
      {
        ok: false,
        reason: 'key-already-redeemed',
        message: 'Key was claimed by another request'
      },
      409,
      request,
      env
    );
  }

  if (!claimPut.ok) {
    return jsonResponse(
      { ok: false, reason: 'redemption-failed', message: 'Failed to lock key' },
      500,
      request,
      env
    );
  }

  // 8. Grant entitlement to user account
  const entitlement = {
    keyHash,
    activatedAt: now,
    method: 'key'
  };

  const accountPut = await firebaseRestPut(`accounts/${auth.uid}/adFree`, entitlement, env);
  if (!accountPut.ok) {
    // Rollback key state to available
    const rollbackRecord = {
      ...keyRecord,
      status: 'available',
      boundTo: null,
      requestId: null
    };
    await firebaseRestPut(`adFreeKeys/${keyHash}`, rollbackRecord, env).catch(() => {});

    return jsonResponse(
      { ok: false, reason: 'redemption-failed', message: 'Failed to activate account entitlement' },
      500,
      request,
      env
    );
  }

  // 9. Finalize key as redeemed
  const redeemedRecord = {
    status: 'redeemed',
    redeemedBy: auth.uid,
    redeemedAt: now,
    createdAt: keyRecord.createdAt || now,
    createdBy: keyRecord.createdBy || null
  };

  await firebaseRestPut(`adFreeKeys/${keyHash}`, redeemedRecord, env).catch(() => {});

  return jsonResponse({ ok: true, activatedAt: now }, 200, request, env);
}
