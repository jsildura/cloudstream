import { jsonResponse, handleOptions } from '../lib/cors.js';
import { verifyFirebaseIdToken } from '../lib/firebaseAuth.js';
import { createPayPalOrder } from '../lib/paypal.js';
import { firebaseRestGet } from '../lib/firebaseAdminRest.js';

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
    return jsonResponse(
      { ok: false, error: 'Unauthorized', message: err.message },
      401,
      request,
      env
    );
  }

  // 2. Enforce Google authentication
  if (auth.provider !== 'google.com') {
    return jsonResponse(
      {
        ok: false,
        reason: 'auth-required',
        message: 'Google account required for ad-free purchase'
      },
      403,
      request,
      env
    );
  }

  // 3. Check if account already has adFree entitlement.
  // Fails closed: a database outage must not be read as "no entitlement",
  // otherwise an already-entitled account could be charged a second time.
  let existing;
  try {
    existing = await firebaseRestGet(`accounts/${auth.uid}/adFree`, env);
  } catch {
    return jsonResponse(
      {
        ok: false,
        reason: 'entitlement-check-unavailable',
        error: 'Failed to verify account entitlement status'
      },
      503,
      request,
      env
    );
  }

  if (existing && existing.value && typeof existing.value === 'object') {
    return jsonResponse(
      { ok: false, reason: 'already-ad-free', message: 'Account is already ad-free' },
      409,
      request,
      env
    );
  }

  // 4. Create PayPal order.
  // `request` is passed so the return_url is derived from the host Cloudflare
  // actually routed, never from a caller-supplied Origin header.
  try {
    const { orderId } = await createPayPalOrder(env, auth.uid, request);
    return jsonResponse({ ok: true, orderId }, 200, request, env);
  } catch (err) {
    return jsonResponse(
      { ok: false, error: 'Failed to create PayPal order', message: err.message },
      500,
      request,
      env
    );
  }
}
