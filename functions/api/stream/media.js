import { handleMediaRequest } from '../../../src/api/stream/media-core.js';

// Handles CORS preflight for browser fetches.
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

export async function onRequestGet(context) {
  const u = new URL(context.request.url).searchParams.get('u') || '';
  return handleMediaRequest(u, context.request.headers.get('range') || '');
}

export async function onRequestHead(context) {
  const u = new URL(context.request.url).searchParams.get('u') || '';
  return handleMediaRequest(u, context.request.headers.get('range') || '');
}
