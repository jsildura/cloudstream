import { handleMediaRequest, getMediaCors } from '../../../src/api/stream/media-core.js';

// Handles CORS preflight for browser fetches with origin scoping.
export async function onRequestOptions(context) {
  const { headers, isOriginAllowed } = getMediaCors(context.request, context.env);
  if (!isOriginAllowed) {
    return new Response('Forbidden origin', { status: 403, headers });
  }
  return new Response(null, {
    status: 204,
    headers,
  });
}

export async function onRequestGet(context) {
  return handleMediaRequestContext(context, 'GET');
}

export async function onRequestHead(context) {
  return handleMediaRequestContext(context, 'HEAD');
}

async function handleMediaRequestContext(context, method) {
  const urlObj = new URL(context.request.url);
  const u = urlObj.searchParams.get('u') || '';
  const exp = urlObj.searchParams.get('exp') || '';
  const sig = urlObj.searchParams.get('sig') || '';
  const range = context.request.headers.get('range') || '';
  const secret = context.env?.ZXC_STREAM_SECRET || '';

  return handleMediaRequest(u, range, {
    request: context.request,
    env: context.env,
    method,
    exp,
    sig,
    secret,
  });
}
