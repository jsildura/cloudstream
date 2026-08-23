import { describe, it, expect } from 'vitest';
import { corsHeaders, jsonResponse, handleOptions } from './cors.js';

describe('functions/lib/cors', () => {
  it('returns CORS headers with defaults', () => {
    const headers = new Headers({ origin: 'https://streamflix.app' });
    const req = { headers };
    const resHeaders = corsHeaders(req);
    expect(resHeaders.get('Access-Control-Allow-Origin')).toBe('https://streamflix.app');
    expect(resHeaders.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(resHeaders.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(resHeaders.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });

  it('respects configured allowed origin', () => {
    const headers = new Headers({ origin: 'https://custom.app' });
    const req = { headers };
    const resHeaders = corsHeaders(req, { ALLOWED_ORIGIN: 'https://custom.app,https://streamflix.app' });
    expect(resHeaders.get('Access-Control-Allow-Origin')).toBe('https://custom.app');
  });

  it('handles OPTIONS preflight request', () => {
    const headers = new Headers({ origin: 'https://streamflix.app' });
    const req = { method: 'OPTIONS', headers };
    const res = handleOptions(req);
    expect(res).not.toBeNull();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://streamflix.app');
  });

  it('returns null for non-OPTIONS requests in handleOptions', () => {
    const req = { method: 'POST', headers: new Headers() };
    expect(handleOptions(req)).toBeNull();
  });

  it('creates jsonResponse with proper status and headers', async () => {
    const headers = new Headers({ origin: 'https://streamflix.app' });
    const req = { headers };
    const res = jsonResponse({ ok: true, count: 5 }, 201, req);
    expect(res.status).toBe(201);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://streamflix.app');
    const data = await res.json();
    expect(data).toEqual({ ok: true, count: 5 });
  });
});
