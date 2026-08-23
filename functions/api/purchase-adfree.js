import { jsonResponse, handleOptions } from '../lib/cors.js';
import { verifyFirebaseIdToken } from '../lib/firebaseAuth.js';
import {
  capturePayPalOrder,
  extractCaptureId,
  fetchPayPalOrder,
  validateAdFreePayPalOrder
} from '../lib/paypal.js';
import { generateRawKey, computeKeyHash } from '../lib/adfreeKeys.js';
import { firebaseRestGet, firebaseRestPut } from '../lib/firebaseAdminRest.js';

const ORDER_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST_ID_REGEX = /^[A-Za-z0-9_-]{8,64}$/;
const KEY_HASH_REGEX = /^[0-9a-f]{64}$/;
const MAX_BODY_BYTES = 2048;

// How long another request's `reserved` record blocks this one. PayPal capture
// plus three small writes take seconds; ten minutes is generous while still
// preventing a crashed request from locking an order forever.
const RESERVATION_STALE_MS = 10 * 60 * 1000;

const AMOUNT = 2.99;
const CURRENCY = 'USD';

/** Extracts the HTTP status a PayPal helper embedded in its error message. */
function payPalHttpStatus(err) {
  const match = /HTTP (\d{3})/.exec(err?.message || '');
  return match ? Number(match[1]) : 0;
}

/** True when `value` is a purchase entitlement that already matches this order. */
function entitlementMatchesOrder(value, orderId) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.keyHash === 'string' &&
      KEY_HASH_REGEX.test(value.keyHash) &&
      typeof value.activatedAt === 'number' &&
      value.activatedAt > 0 &&
      value.method === 'purchase' &&
      value.orderId === orderId
  );
}

export async function onRequest(context) {
  const { request, env } = context;

  const preflight = handleOptions(request, env);
  if (preflight) return preflight;

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, request, env);
  }

  const fail = (status, reason, message) =>
    jsonResponse({ ok: false, reason, message }, status, request, env);

  // 1. Authenticate caller
  let auth;
  try {
    auth = await verifyFirebaseIdToken(request, env);
  } catch (err) {
    return jsonResponse(
      { ok: false, reason: 'unauthorized', error: 'Unauthorized', message: err.message },
      401,
      request,
      env
    );
  }

  // 2. Enforce Google authentication
  if (auth.provider !== 'google.com') {
    return fail(403, 'auth-required', 'Google account required for ad-free purchase');
  }

  // 3. Verify server environment. The purchase records a key hash just like a
  // redemption does, so the HMAC secret is mandatory here too.
  const hmacSecret = env?.AD_KEY_HMAC_SECRET;
  if (!hmacSecret) {
    return jsonResponse(
      { ok: false, error: 'Server misconfigured: missing AD_KEY_HMAC_SECRET' },
      500,
      request,
      env
    );
  }

  // 4. Parse and validate request body
  let bodyText = '';
  try {
    bodyText = await request.text();
  } catch {
    return jsonResponse({ ok: false, error: 'Failed to read request body' }, 400, request, env);
  }

  if (bodyText.length > MAX_BODY_BYTES) {
    return jsonResponse(
      { ok: false, error: 'Request body exceeds maximum size' },
      400,
      request,
      env
    );
  }

  let body = {};
  try {
    body = JSON.parse(bodyText || '{}');
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, request, env);
  }

  const orderId = body?.orderId;
  if (!orderId || typeof orderId !== 'string' || !ORDER_ID_REGEX.test(orderId)) {
    return jsonResponse(
      { ok: false, reason: 'order-invalid', error: 'Invalid or missing orderId parameter' },
      400,
      request,
      env
    );
  }

  // A client may supply its own request id so a retry resumes the same
  // activation instead of colliding with it.
  let requestId;
  if (typeof body.requestId === 'undefined' || body.requestId === null) {
    requestId = crypto.randomUUID();
  } else if (typeof body.requestId === 'string' && REQUEST_ID_REGEX.test(body.requestId)) {
    requestId = body.requestId;
  } else {
    return fail(400, 'request-invalid', 'Invalid requestId parameter');
  }

  /** Reads `/accounts/<uid>/adFree`. Throws so callers can fail closed. */
  const readEntitlement = async () => {
    const res = await firebaseRestGet(`accounts/${auth.uid}/adFree`, env);
    return res?.value ?? null;
  };

  /** Writes the account entitlement and the matching redeemed key record. */
  const writeActivation = async (keyHash, activatedAt, reservedAt) => {
    const accountPut = await firebaseRestPut(
      `accounts/${auth.uid}/adFree`,
      { keyHash, activatedAt, method: 'purchase', orderId },
      env
    );
    if (!accountPut.ok) return false;

    const keyPut = await firebaseRestPut(
      `adFreeKeys/${keyHash}`,
      {
        status: 'redeemed',
        source: 'purchase',
        createdAt: reservedAt,
        createdBy: auth.uid,
        redeemedBy: auth.uid,
        redeemedAt: activatedAt,
        orderId
      },
      env
    );
    if (!keyPut.ok) return false;

    return true;
  };

  /** Finalizes the order record once the account and key records are written. */
  const finalizeOrder = async (record, keyHash, completedAt) => {
    const put = await firebaseRestPut(
      `adFreeOrders/${orderId}`,
      {
        uid: auth.uid,
        status: 'completed',
        requestId: record.requestId || requestId,
        keyHash,
        reservedAt: record.reservedAt || completedAt,
        capturedAt: record.capturedAt || completedAt,
        completedAt,
        amount: AMOUNT,
        currency: CURRENCY,
        // Carried from the record rather than re-read from PayPal, so the
        // resume and repair paths above keep it without another API call.
        // Omitted, not nulled, for orders captured before it was recorded.
        ...(record.captureId ? { captureId: record.captureId } : {})
      },
      env
    );
    return put.ok;
  };

  /**
   * Drops our own reservation so a later attempt can retry the order. Only ever
   * called before PayPal took the money, and only if the record is still ours.
   */
  const releaseReservation = async () => {
    try {
      const current = await firebaseRestGet(`adFreeOrders/${orderId}`, env, { etag: true });
      const value = current?.value;
      if (
        !value ||
        value.status !== 'reserved' ||
        value.requestId !== requestId ||
        !current.etag
      ) {
        return;
      }
      await firebaseRestPut(`adFreeOrders/${orderId}`, null, env, { ifMatch: current.etag });
    } catch {
      // Best effort: a stale reservation ages out via RESERVATION_STALE_MS
    }
  };

  /** Records a captured-but-not-granted order so it can never be replayed. */
  const markRejected = async (record, reason) => {
    try {
      await firebaseRestPut(
        `adFreeOrders/${orderId}`,
        {
          uid: auth.uid,
          status: 'rejected',
          reason,
          requestId: record.requestId || requestId,
          keyHash: record.keyHash || null,
          reservedAt: record.reservedAt || Date.now(),
          capturedAt: record.capturedAt || Date.now(),
          amount: AMOUNT,
          currency: CURRENCY,
          // Matters most here: the money moved but nothing was granted, so this
          // is the record support has to reconcile against PayPal by hand.
          ...(record.captureId ? { captureId: record.captureId } : {})
        },
        env
      );
    } catch {
      // Non-fatal: the caller already returns a failure
    }
  };

  // 5. Read the order record (with ETag) to decide between reserve and resume
  let orderRes;
  try {
    orderRes = await firebaseRestGet(`adFreeOrders/${orderId}`, env, { etag: true });
  } catch {
    return fail(503, 'activation-pending', 'Could not verify order records. Please retry.');
  }

  const existing =
    orderRes && orderRes.value && typeof orderRes.value === 'object' ? orderRes.value : null;

  // The order is permanently bound to the first account that reserved it.
  if (existing && existing.uid && existing.uid !== auth.uid) {
    return fail(409, 'order-already-used', 'This PayPal order was already linked to another account');
  }

  let record = existing;
  const now = Date.now();

  if (existing) {
    if (existing.status === 'rejected') {
      return fail(
        409,
        existing.reason === 'already-ad-free' ? 'already-ad-free' : 'payment-mismatch',
        'This order was captured but could not be activated. Contact support.'
      );
    }

    if (existing.status === 'completed') {
      // Retry after a successful activation: only report success once the
      // account entitlement is actually present and consistent.
      let entitlement;
      try {
        entitlement = await readEntitlement();
      } catch {
        return fail(503, 'activation-pending', 'Could not verify entitlement. Please retry.');
      }

      if (entitlementMatchesOrder(entitlement, orderId)) {
        return jsonResponse(
          { ok: true, activatedAt: entitlement.activatedAt, idempotent: true },
          200,
          request,
          env
        );
      }

      if (entitlement && typeof entitlement === 'object') {
        // Some other activation owns this account; do not overwrite it.
        return fail(409, 'already-ad-free', 'Account is already ad-free');
      }

      // Entitlement missing (a previous attempt died between writes): repair it.
      const keyHash =
        typeof existing.keyHash === 'string' && KEY_HASH_REGEX.test(existing.keyHash)
          ? existing.keyHash
          : await computeKeyHash(generateRawKey(), hmacSecret);
      const activatedAt = existing.completedAt || existing.capturedAt || now;

      if (!(await writeActivation(keyHash, activatedAt, existing.reservedAt || activatedAt))) {
        return fail(503, 'activation-pending', 'Payment captured. Activation will be retried.');
      }
      if (!(await finalizeOrder(existing, keyHash, activatedAt))) {
        return fail(503, 'activation-pending', 'Payment captured. Activation will be retried.');
      }

      return jsonResponse({ ok: true, activatedAt, idempotent: true }, 200, request, env);
    }

    if (existing.status === 'captured') {
      // Money is already taken; resume without touching PayPal again.
      let entitlement;
      try {
        entitlement = await readEntitlement();
      } catch {
        return fail(503, 'activation-pending', 'Could not verify entitlement. Please retry.');
      }

      if (entitlement && !entitlementMatchesOrder(entitlement, orderId)) {
        await markRejected(existing, 'already-ad-free');
        return fail(409, 'already-ad-free', 'Account is already ad-free');
      }

      const keyHash =
        typeof existing.keyHash === 'string' && KEY_HASH_REGEX.test(existing.keyHash)
          ? existing.keyHash
          : await computeKeyHash(generateRawKey(), hmacSecret);
      const activatedAt = entitlement?.activatedAt || now;

      if (!(await writeActivation(keyHash, activatedAt, existing.reservedAt || activatedAt))) {
        return fail(503, 'activation-pending', 'Payment captured. Activation will be retried.');
      }
      if (!(await finalizeOrder(existing, keyHash, activatedAt))) {
        return fail(503, 'activation-pending', 'Payment captured. Activation will be retried.');
      }

      return jsonResponse({ ok: true, activatedAt }, 200, request, env);
    }

    if (existing.status === 'reserved') {
      const isOurs = existing.requestId === requestId;
      const isStale = now - (existing.reservedAt || 0) > RESERVATION_STALE_MS;

      if (!isOurs && !isStale) {
        return fail(409, 'order-already-used', 'This order is already being processed');
      }

      if (!isOurs) {
        // Take over the abandoned reservation, keeping its key hash so the
        // earlier attempt cannot produce a second key record.
        if (!orderRes.etag) {
          return fail(503, 'activation-pending', 'Could not claim the order. Please retry.');
        }
        const takeover = {
          ...existing,
          requestId,
          reservedAt: now
        };
        const put = await firebaseRestPut(`adFreeOrders/${orderId}`, takeover, env, {
          ifMatch: orderRes.etag
        }).catch(() => null);

        if (!put || put.status === 412) {
          return fail(409, 'order-already-used', 'This order is already being processed');
        }
        if (!put.ok) {
          return fail(503, 'activation-pending', 'Could not claim the order. Please retry.');
        }
        record = takeover;
      }
    } else {
      // Unknown state written by an older build: treat as used rather than
      // guessing whether money changed hands.
      return fail(409, 'order-already-used', 'This PayPal order has already been processed');
    }
  } else {
    // 6. Conditional reservation. The ETag from the GET above is what makes
    // this a create-only write: a concurrent request that already reserved the
    // order invalidates our ETag and RTDB answers 412.
    if (!orderRes?.etag) {
      return fail(503, 'activation-pending', 'Could not reserve the order. Please retry.');
    }

    // The key hash is generated at reservation time so every retry of this
    // order reuses it. The raw key is never stored, logged, or returned.
    const keyHash = await computeKeyHash(generateRawKey(), hmacSecret);

    const reservation = {
      uid: auth.uid,
      status: 'reserved',
      requestId,
      keyHash,
      reservedAt: now
    };

    const reservePut = await firebaseRestPut(`adFreeOrders/${orderId}`, reservation, env, {
      ifMatch: orderRes.etag
    }).catch(() => null);

    if (!reservePut || reservePut.status === 412) {
      return fail(409, 'order-already-used', 'This order is already being processed');
    }
    if (!reservePut.ok) {
      return fail(503, 'activation-pending', 'Could not reserve the order. Please retry.');
    }

    record = reservation;
  }

  // 7. Reject an account that became ad-free before we take any money.
  let priorEntitlement;
  try {
    priorEntitlement = await readEntitlement();
  } catch {
    await releaseReservation();
    return fail(503, 'activation-pending', 'Could not verify entitlement. Please retry.');
  }

  if (priorEntitlement && !entitlementMatchesOrder(priorEntitlement, orderId)) {
    await releaseReservation();
    return fail(409, 'already-ad-free', 'Account is already ad-free');
  }

  // 8. Fetch the PayPal order, and capture it exactly once if it is only approved.
  let payPalOrder;
  try {
    payPalOrder = await fetchPayPalOrder(env, orderId);
  } catch (err) {
    await releaseReservation();
    const status = payPalHttpStatus(err);
    if (status === 404 || status === 422) {
      return fail(400, 'order-invalid', 'PayPal order not found');
    }
    return fail(503, 'payment-provider-unavailable', 'PayPal is unavailable. Please retry.');
  }

  let captured = payPalOrder?.status === 'COMPLETED';

  if (!captured) {
    if (payPalOrder?.status !== 'APPROVED') {
      await releaseReservation();
      return fail(400, 'payment-not-completed', 'PayPal order has not been approved');
    }

    try {
      await capturePayPalOrder(env, orderId);
      captured = true;
    } catch (err) {
      // A 422 here usually means another attempt already captured it, so
      // re-read the order instead of trusting the error.
      const status = payPalHttpStatus(err);
      if (status !== 422 && status !== 400) {
        await releaseReservation();
        return fail(503, 'payment-provider-unavailable', 'PayPal capture failed. Please retry.');
      }
    }

    try {
      payPalOrder = await fetchPayPalOrder(env, orderId);
    } catch {
      // The capture may well have succeeded, so keep the reservation and let a
      // retry reconcile rather than releasing a possibly paid order.
      return fail(503, 'payment-provider-unavailable', 'Could not confirm payment. Please retry.');
    }

    captured = payPalOrder?.status === 'COMPLETED';
    if (!captured) {
      await releaseReservation();
      return fail(400, 'payment-not-completed', 'PayPal payment was not completed');
    }
  }

  // The transaction id the buyer sees in their PayPal history. Read from the
  // order rather than from the capture response, because an order that was
  // already COMPLETED when we fetched it never went through a capture call here.
  const captureId = extractCaptureId(payPalOrder);

  // 9. Validate what PayPal actually reports: status, unit count, price, product.
  try {
    validateAdFreePayPalOrder(payPalOrder);
  } catch {
    // Money has changed hands but the order does not match the product. Keep
    // the record so it can never be replayed, and leave activation to support.
    await markRejected({ ...record, capturedAt: Date.now(), captureId }, 'payment-mismatch');
    return fail(400, 'payment-mismatch', 'PayPal order does not match the ad-free product');
  }

  const capturedAt = Date.now();
  const keyHash =
    typeof record?.keyHash === 'string' && KEY_HASH_REGEX.test(record.keyHash)
      ? record.keyHash
      : await computeKeyHash(generateRawKey(), hmacSecret);

  // 10. Mark the payment as taken before granting, so a failure between here
  // and the finalize step is reconciled instead of re-captured.
  const capturedRecord = {
    uid: auth.uid,
    status: 'captured',
    requestId,
    keyHash,
    reservedAt: record?.reservedAt || capturedAt,
    capturedAt,
    amount: AMOUNT,
    currency: CURRENCY,
    // Written before the grant, so even an activation that dies here leaves a
    // record that can be traced back to the PayPal transaction.
    ...(captureId ? { captureId } : {})
  };

  const capturedPut = await firebaseRestPut(`adFreeOrders/${orderId}`, capturedRecord, env);
  if (!capturedPut.ok) {
    return fail(503, 'activation-pending', 'Payment captured. Activation will be retried.');
  }

  // 11. Grant the entitlement and store the purchase key record.
  if (!(await writeActivation(keyHash, capturedAt, capturedRecord.reservedAt))) {
    return fail(503, 'activation-pending', 'Payment captured. Activation will be retried.');
  }

  // 12. Finalize the order only after account and key records are consistent.
  if (!(await finalizeOrder(capturedRecord, keyHash, capturedAt))) {
    return fail(503, 'activation-pending', 'Payment captured. Activation will be retried.');
  }

  return jsonResponse({ ok: true, activatedAt: capturedAt }, 200, request, env);
}
