/**
 * PayPal API client and validation helpers for Cloudflare Pages Functions
 */

let cachedPayPalToken = null;
let payPalTokenExpiresAt = 0;

export function _resetPayPalTokenCacheForTesting() {
  cachedPayPalToken = null;
  payPalTokenExpiresAt = 0;
}

export function paypalBaseUrl(env = {}) {
  const isLive = env?.PAYPAL_ENV === 'live';
  return isLive ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

export async function getPayPalAccessToken(env = {}) {
  const now = Date.now();
  if (cachedPayPalToken && now < payPalTokenExpiresAt) {
    return cachedPayPalToken;
  }

  const clientId = env?.PAYPAL_CLIENT_ID;
  const clientSecret = env?.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing PayPal client credentials');
  }

  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const baseUrl = paypalBaseUrl(env);

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!res.ok) {
    throw new Error(`PayPal OAuth failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  cachedPayPalToken = data.access_token;
  payPalTokenExpiresAt = now + ((data.expires_in || 3600) - 300) * 1000;
  return cachedPayPalToken;
}

/**
 * Resolve the origin PayPal should send the buyer back to.
 *
 * Prefers an explicitly configured APP_URL. Otherwise uses the origin this
 * Function was actually reached at — Cloudflare routes by hostname, so that is
 * our own domain. Deliberately NOT the `Origin`/`Referer` header, which the
 * caller controls and could point at a site they own.
 */
export function resolveAppOrigin(env = {}, request = null) {
  const configured = env?.APP_URL || env?.ALLOWED_ORIGIN;
  if (configured) {
    // ALLOWED_ORIGIN may be a comma-separated list; the first entry is canonical.
    const first = String(configured).split(',')[0].trim();
    if (/^https:\/\/[^\s/]+$/.test(first)) return first;
  }

  if (request?.url) {
    try {
      const { origin, protocol } = new URL(request.url);
      // PayPal rejects non-HTTPS return URLs, so localhost cannot use one.
      if (protocol === 'https:') return origin;
    } catch {
      // Fall through to null.
    }
  }

  return null;
}

export async function createPayPalOrder(env = {}, uid = '', request = null) {
  const token = await getPayPalAccessToken(env);
  const baseUrl = paypalBaseUrl(env);

  // Without this block PayPal defaults shipping_preference to GET_FROM_FILE
  // and treats a digital entitlement as a shippable good: checkout renders a
  // "Ship to ..." address, and pressing "Continue to Review Order" enters
  // PayPal's shipping-callback path, which spins and returns the buyer to the
  // same step — an unclearable loop with no error anywhere.
  const applicationContext = {
    brand_name: 'Streamflix',
    // Nothing is shipped, so no address is collected and no shipping
    // callback exists to stall on.
    shipping_preference: 'NO_SHIPPING',
    // Approve-and-done: the button reads "Pay Now" and skips the review
    // step entirely instead of routing through order review.
    user_action: 'PAY_NOW'
  };

  // The redirect flow needs somewhere to land. Without a return_url PayPal has
  // no destination after approval and simply re-renders its own page, so the
  // buyer can press the pay button forever and nothing is ever captured.
  // Extensionless on purpose: Cloudflare Pages 308-redirects `/x.html` to `/x`,
  // and there is no reason to make the returning buyer take that extra hop.
  const appOrigin = resolveAppOrigin(env, request);
  if (appOrigin) {
    applicationContext.return_url = `${appOrigin}/paypal-return`;
    applicationContext.cancel_url = `${appOrigin}/paypal-return?cancelled=1`;
  }

  const payload = {
    intent: 'CAPTURE',
    application_context: applicationContext,
    purchase_units: [
      {
        description: 'Streamflix Ad-Free',
        custom_id: 'streamflix-adfree-v1',
        reference_id: uid ? `user_${uid}` : undefined,
        amount: {
          currency_code: 'USD',
          value: '2.99'
        }
      }
    ]
  };

  const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`PayPal create order failed: HTTP ${res.status} ${errorText}`);
  }

  const data = await res.json();
  if (!data.id) {
    throw new Error('PayPal response missing order id');
  }

  return { orderId: data.id };
}

export async function capturePayPalOrder(env = {}, orderId) {
  if (!orderId || typeof orderId !== 'string') {
    throw new Error('Missing or invalid orderId');
  }

  const token = await getPayPalAccessToken(env);
  const baseUrl = paypalBaseUrl(env);

  const res = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`PayPal capture order failed: HTTP ${res.status} ${errorText}`);
  }

  return res.json();
}

export async function fetchPayPalOrder(env = {}, orderId) {
  if (!orderId || typeof orderId !== 'string') {
    throw new Error('Missing or invalid orderId');
  }

  const token = await getPayPalAccessToken(env);
  const baseUrl = paypalBaseUrl(env);

  const res = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`PayPal fetch order failed: HTTP ${res.status} ${errorText}`);
  }

  return res.json();
}

/**
 * Pulls the capture (transaction) id out of a PayPal order.
 *
 * An order id and a capture id are different things, and buyers only ever see
 * the second one. `POST /v2/checkout/orders` mints the order id — that is the
 * `token=` in the checkout URL and what we key `adFreeOrders` by. The capture
 * call then mints a separate capture id, and that is what shows up in PayPal
 * transaction history and on refunds. Without storing it there is no way to
 * take the id a buyer quotes from their PayPal account and find the order,
 * account, or entitlement it belongs to.
 *
 * Present on any COMPLETED order, whether this request captured it or found it
 * already captured, so a single read covers both paths.
 */
export function extractCaptureId(order) {
  const captures = order?.purchase_units?.[0]?.payments?.captures;
  if (!Array.isArray(captures)) return null;

  const ids = captures.filter((c) => typeof c?.id === 'string' && c.id);

  // A unit can hold more than one capture (partial captures, or a retry that
  // PayPal recorded twice). The COMPLETED one is the money that actually moved.
  const completed = ids.find((c) => c.status === 'COMPLETED');
  return (completed || ids[0])?.id ?? null;
}

export function validateAdFreePayPalOrder(order) {
  if (!order || typeof order !== 'object') {
    throw new Error('Invalid order payload');
  }

  if (order.status !== 'COMPLETED') {
    throw new Error(`Order not completed. Current status: ${order.status}`);
  }

  if (!Array.isArray(order.purchase_units) || order.purchase_units.length !== 1) {
    throw new Error('Order must contain exactly one purchase unit');
  }

  const unit = order.purchase_units[0];
  const amount = unit.amount;
  if (!amount || amount.currency_code !== 'USD' || amount.value !== '2.99') {
    throw new Error(
      `Order amount mismatch. Expected 2.99 USD, got ${amount?.value} ${amount?.currency_code}`
    );
  }

  const customId = unit.custom_id;
  const description = unit.description;
  if (customId !== 'streamflix-adfree-v1' && description !== 'Streamflix Ad-Free') {
    throw new Error('Order custom_id or description mismatch for streamflix-adfree-v1');
  }
}
