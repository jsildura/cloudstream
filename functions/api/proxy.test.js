import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest, ALLOWED_DOMAINS, MAX_CONTENT_LENGTH } from './proxy.js';

describe('functions/api/proxy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const defaultEnv = {
    ALLOWED_ORIGIN: 'https://streamflix.stream'
  };

  const createMockRequest = (url, { method = 'GET', origin = null, headers = {} } = {}) => {
    const h = new Headers(headers);
    if (origin) {
      h.set('origin', origin);
    }
    return {
      url,
      method,
      headers: h
    };
  };

  it('rejects disallowed origin in OPTIONS preflight', async () => {
    const req = createMockRequest('https://streamflix.stream/api/proxy', {
      method: 'OPTIONS',
      origin: 'https://evil.attacker.com'
    });
    const res = await onRequest({ request: req, env: defaultEnv });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Origin not allowed');
  });

  it('accepts allowed origin in OPTIONS preflight', async () => {
    const req = createMockRequest('https://streamflix.stream/api/proxy', {
      method: 'OPTIONS',
      origin: 'https://streamflix.stream'
    });
    const res = await onRequest({ request: req, env: defaultEnv });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://streamflix.stream');
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
  });

  it('rejects disallowed origin in GET request', async () => {
    const req = createMockRequest('https://streamflix.stream/api/proxy?url=https://resources.tidal.com/image.jpg', {
      method: 'GET',
      origin: 'https://evil.attacker.com'
    });
    const res = await onRequest({ request: req, env: defaultEnv });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Origin not allowed');
  });

  it('rejects non-GET methods', async () => {
    const req = createMockRequest('https://streamflix.stream/api/proxy', {
      method: 'POST'
    });
    const res = await onRequest({ request: req, env: defaultEnv });
    expect(res.status).toBe(405);
  });

  it('rejects missing url parameter', async () => {
    const req = createMockRequest('https://streamflix.stream/api/proxy', {
      method: 'GET'
    });
    const res = await onRequest({ request: req, env: defaultEnv });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Missing url parameter');
  });

  it('rejects invalid or non-HTTPS URLs', async () => {
    const req1 = createMockRequest('https://streamflix.stream/api/proxy?url=not-a-url', { method: 'GET' });
    const res1 = await onRequest({ request: req1, env: defaultEnv });
    expect(res1.status).toBe(400);

    const req2 = createMockRequest('https://streamflix.stream/api/proxy?url=http://resources.tidal.com/img.jpg', { method: 'GET' });
    const res2 = await onRequest({ request: req2, env: defaultEnv });
    expect(res2.status).toBe(400);
    const body2 = await res2.json();
    expect(body2.error).toContain('Only HTTPS');
  });

  it('rejects domains not in allowlist (point b: open relay protection)', async () => {
    const blockedUrls = [
      'https://attacker.com/evil.jpg',
      'https://127.0.0.1/secret',
      'https://169.254.169.254/latest/meta-data',
      'https://internal.network/admin'
    ];

    for (const url of blockedUrls) {
      const req = createMockRequest(`https://streamflix.stream/api/proxy?url=${encodeURIComponent(url)}`, {
        method: 'GET'
      });
      const res = await onRequest({ request: req, env: defaultEnv });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Domain not allowed');
    }
  });

  it('blocks upstream redirects (point b: open relay & SSRF protection)', async () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { 'Location': 'https://evil.com/redirected' }
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(redirectResponse));

    const req = createMockRequest('https://streamflix.stream/api/proxy?url=https://resources.tidal.com/cover.jpg', {
      method: 'GET'
    });
    const res = await onRequest({ request: req, env: defaultEnv });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('Upstream redirect not permitted');
    expect(fetch).toHaveBeenCalledWith('https://resources.tidal.com/cover.jpg', expect.objectContaining({
      redirect: 'manual'
    }));
  });

  it('rejects responses exceeding MAX_CONTENT_LENGTH (point c: memory exhaustion)', async () => {
    const largeResponse = new Response('huge content', {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(MAX_CONTENT_LENGTH + 1)
      }
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(largeResponse));

    const req = createMockRequest('https://streamflix.stream/api/proxy?url=https://resources.tidal.com/cover.jpg', {
      method: 'GET'
    });
    const res = await onRequest({ request: req, env: defaultEnv });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toContain('Response exceeds maximum allowed size');
  });

  it('streams valid images and scopes ACAO to own origin (points c & d)', async () => {
    const sampleBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    const mockImageResponse = new Response(sampleBytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': '4'
      }
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockImageResponse));

    const req = createMockRequest('https://streamflix.stream/api/proxy?url=https://resources.tidal.com/cover.jpg', {
      method: 'GET',
      origin: 'https://streamflix.stream'
    });
    const res = await onRequest({ request: req, env: defaultEnv });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://streamflix.stream');
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');

    const arrayBuf = await res.arrayBuffer();
    expect(new Uint8Array(arrayBuf)).toEqual(sampleBytes);
  });

  it('sanitizes HTML/XML Content-Type to prevent origin laundering', async () => {
    const mockHtmlResponse = new Response('<html>evil script</html>', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockHtmlResponse));

    const req = createMockRequest('https://streamflix.stream/api/proxy?url=https://i.scdn.co/image/ab67616d0000b273', {
      method: 'GET'
    });
    const res = await onRequest({ request: req, env: defaultEnv });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
