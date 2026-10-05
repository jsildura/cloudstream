import { describe, it, expect } from 'vitest';
import { onRequestOptions, onRequestGet, onRequestHead } from './media.js';

describe('functions/api/stream/media.js Cloudflare handler', () => {
  it('rejects CORS preflight OPTIONS from untrusted origin with 403', async () => {
    const context = {
      request: {
        url: 'https://streamflix.me/api/stream/media',
        method: 'OPTIONS',
        headers: new Headers({
          origin: 'https://evil.com',
        }),
      },
      env: {
        APP_URL: 'https://streamflix.me',
      },
    };

    const resp = await onRequestOptions(context);
    expect(resp.status).toBe(403);
    expect(await resp.text()).toBe('Forbidden origin');
  });

  it('allows CORS preflight OPTIONS from trusted own origin', async () => {
    const context = {
      request: {
        url: 'https://streamflix.me/api/stream/media',
        method: 'OPTIONS',
        headers: new Headers({
          origin: 'https://streamflix.me',
        }),
      },
      env: {
        APP_URL: 'https://streamflix.me',
      },
    };

    const resp = await onRequestOptions(context);
    expect(resp.status).toBe(204);
    expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('https://streamflix.me');
  });

  it('rejects GET request to unallowed host with 403', async () => {
    const context = {
      request: {
        url: 'https://streamflix.me/api/stream/media?u=https://malicious.workers.dev/test.m3u8',
        method: 'GET',
        headers: new Headers({
          origin: 'https://streamflix.me',
        }),
      },
      env: {
        APP_URL: 'https://streamflix.me',
      },
    };

    const resp = await onRequestGet(context);
    expect(resp.status).toBe(403);
    expect(await resp.text()).toBe('host not allowed');
  });
});
