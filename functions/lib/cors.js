/**
 * Cloudflare Pages Functions CORS and JSON response helper
 */

export function corsHeaders(request, env = {}) {
  const allowedOriginConfig = env?.ALLOWED_ORIGIN || env?.APP_URL;
  let requestOrigin = null;
  if (request?.headers) {
    if (typeof request.headers.get === 'function') {
      requestOrigin = request.headers.get('origin') || request.headers.get('Origin');
    } else if (typeof request.headers === 'object') {
      requestOrigin = request.headers.origin || request.headers.Origin;
    }
  }
  
  let allowOrigin = requestOrigin || '*';
  if (allowedOriginConfig) {
    const allowedList = allowedOriginConfig.split(',').map((s) => s.trim());
    if (requestOrigin && (allowedList.includes(requestOrigin) || allowedList.includes('*'))) {
      allowOrigin = requestOrigin;
    } else {
      allowOrigin = allowedList[0];
    }
  }

  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', allowOrigin);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

export function jsonResponse(body, status = 200, request = null, env = {}, extraHeaders = {}) {
  const headers = corsHeaders(request, env);
  headers.set('Content-Type', 'application/json');
  
  if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([k, v]) => {
      headers.set(k, v);
    });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers
  });
}

export function handleOptions(request, env = {}) {
  if (request?.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request, env)
    });
  }
  return null;
}
