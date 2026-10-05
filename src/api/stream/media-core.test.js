import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleMediaRequest,
  getMediaCors,
  readBoundedText,
  rewritePlaylist,
  sanitizeMediaContentType,
  MAX_PLAYLIST_BYTES,
} from './media-core.js';
import { signMediaToken } from './hosts.js';

describe('media-core.js security & reliability', () => {
  const secret = 'test-secret-key-999';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Host Allowlist & SSRF Protections', () => {
    it('rejects unallowed hosts with HTTP 403', async () => {
      const resp = await handleMediaRequest('https://evil.com/video.mp4');
      expect(resp.status).toBe(403);
      expect(await resp.text()).toBe('host not allowed');
    });

    it('rejects arbitrary workers.dev subdomains without token', async () => {
      const resp = await handleMediaRequest('https://attacker.workers.dev/video.mp4');
      expect(resp.status).toBe(403);
      expect(await resp.text()).toBe('host not allowed');
    });

    it('rejects non-HTTPS URLs with HTTP 400', async () => {
      const resp = await handleMediaRequest('http://s1.devcorp.me/video.mp4');
      expect(resp.status).toBe(400);
      expect(await resp.text()).toBe('only https protocol allowed');
    });

    it('rejects invalid or missing URL with HTTP 400', async () => {
      const resp = await handleMediaRequest('');
      expect(resp.status).toBe(400);
      expect(await resp.text()).toBe('bad url');
    });

    it('allows verified host from exact allowlist', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('video content', {
        status: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': '13' },
      })));

      const resp = await handleMediaRequest('https://s1.devcorp.me/stream.mp4');
      expect(resp.status).toBe(200);
      expect(await resp.text()).toBe('video content');
    });

    it('allows rotating unlisted host when signed with valid HMAC token', async () => {
      const targetUrl = 'https://custom-relay.workers.dev/hls/master.m3u8';
      const { exp, sig } = await signMediaToken(targetUrl, secret, 60000);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('#EXTM3U\n#EXTINF:10,\nsegment1.ts', {
        status: 200,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      })));

      const resp = await handleMediaRequest(targetUrl, '', { exp, sig, secret });
      expect(resp.status).toBe(200);
      const manifest = await resp.text();
      expect(manifest).toContain('/api/stream/media?u=');
    });

    it('rejects rotating host if HMAC token is forged or expired', async () => {
      const targetUrl = 'https://custom-relay.workers.dev/hls/master.m3u8';
      const { exp, sig } = await signMediaToken(targetUrl, secret, -5000); // expired

      const resp = await handleMediaRequest(targetUrl, '', { exp, sig, secret });
      expect(resp.status).toBe(403);
      expect(await resp.text()).toBe('host not allowed');
    });
  });

  describe('CORS Scoping & Origin Protection', () => {
    it('scopes Access-Control-Allow-Origin to own origin', () => {
      const fakeReq = {
        url: 'https://streamflix.me/api/stream/media',
        headers: new Headers({ origin: 'https://streamflix.me' }),
      };
      const { headers, isOriginAllowed } = getMediaCors(fakeReq);
      expect(isOriginAllowed).toBe(true);
      expect(headers['Access-Control-Allow-Origin']).toBe('https://streamflix.me');
      expect(headers['Vary']).toBe('Origin');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('blocks untrusted cross-origin requests with HTTP 403', async () => {
      const fakeReq = {
        url: 'https://streamflix.me/api/stream/media',
        headers: new Headers({ origin: 'https://evil-third-party.com' }),
      };

      const resp = await handleMediaRequest('https://s1.devcorp.me/stream.mp4', '', {
        request: fakeReq,
      });

      expect(resp.status).toBe(403);
      expect(await resp.text()).toBe('Forbidden origin');
    });
  });

  describe('Manual Redirect Handling & Allowlist Re-check', () => {
    it('follows safe redirect to another allowlisted host', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(null, {
          status: 302,
          headers: { location: 'https://aapanel.devcorp.me/stream.mp4' },
        }))
        .mockResolvedValueOnce(new Response('redirected content', {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        }));

      vi.stubGlobal('fetch', fetchMock);

      const resp = await handleMediaRequest('https://s1.devcorp.me/redirect-me');
      expect(resp.status).toBe(200);
      expect(await resp.text()).toBe('redirected content');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
    });

    it('aborts redirect to untrusted host with HTTP 403', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://evil.com/malicious.mp4' },
      }));

      vi.stubGlobal('fetch', fetchMock);

      const resp = await handleMediaRequest('https://s1.devcorp.me/redirect-to-evil');
      expect(resp.status).toBe(403);
      expect(await resp.text()).toBe('redirected host not allowed');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('aborts redirect to non-HTTPS URL with HTTP 400', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'http://s1.devcorp.me/insecure.mp4' },
      }));

      vi.stubGlobal('fetch', fetchMock);

      const resp = await handleMediaRequest('https://s1.devcorp.me/insecure-redirect');
      expect(resp.status).toBe(400);
      expect(await resp.text()).toBe('redirect to non-https forbidden');
    });

    it('aborts redirect loop exceeding MAX_REDIRECTS with HTTP 502', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
        status: 302,
        headers: { location: 'https://s1.devcorp.me/loop' },
      }));

      vi.stubGlobal('fetch', fetchMock);

      const resp = await handleMediaRequest('https://s1.devcorp.me/loop');
      expect(resp.status).toBe(502);
      expect(await resp.text()).toBe('too many redirects');
    });
  });

  describe('Playlist Memory Ceiling Enforcement', () => {
    it('rejects playlist when Content-Length exceeds MAX_PLAYLIST_BYTES', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('fake playlist', {
        status: 200,
        headers: {
          'content-type': 'application/vnd.apple.mpegurl',
          'content-length': String(MAX_PLAYLIST_BYTES + 1024),
        },
      })));

      const resp = await handleMediaRequest('https://s1.devcorp.me/huge.m3u8');
      expect(resp.status).toBe(413);
      expect(await resp.text()).toBe('playlist too large');
    });

    it('aborts chunked stream that exceeds MAX_PLAYLIST_BYTES during read', async () => {
      // Create a chunk that is larger than 2MB
      const bigChunk = new Uint8Array(MAX_PLAYLIST_BYTES + 1024);
      let cancelled = false;

      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(bigChunk);
        },
        cancel() {
          cancelled = true;
        },
      });

      const fakeResponse = new Response(readable, {
        status: 200,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      });

      await expect(readBoundedText(fakeResponse, MAX_PLAYLIST_BYTES)).rejects.toThrow('payload_too_large');
      expect(cancelled).toBe(true);
    });

    it('successfully rewrites valid playlist and signs child segments when secret is present', async () => {
      const rawPlaylist = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXTINF:10.0,',
        'segment-001.ts',
        '#EXTINF:10.0,',
        'segment-002.ts',
      ].join('\n');

      const exp = Date.now() + 3600000;
      const rewritten = await rewritePlaylist(rawPlaylist, 'https://s1.devcorp.me/stream/index.m3u8', {
        secret,
        exp,
      });

      expect(rewritten).toContain('/api/stream/media?u=https%3A%2F%2Fs1.devcorp.me%2Fstream%2Fsegment-001.ts&exp=');
      expect(rewritten).toContain('&sig=');
    });
  });

  describe('Binary Segment & Content-Type Sanitization', () => {
    it('sanitizes text/html to application/octet-stream to prevent XSS', () => {
      expect(sanitizeMediaContentType('text/html')).toBe('application/octet-stream');
      expect(sanitizeMediaContentType('text/xml')).toBe('application/octet-stream');
      expect(sanitizeMediaContentType('application/javascript')).toBe('application/octet-stream');
      expect(sanitizeMediaContentType('video/mp2t')).toBe('video/mp2t');
      expect(sanitizeMediaContentType('video/mp4')).toBe('video/mp4');
    });

    it('streams binary segment with Range headers and 206 Partial Content', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('partial byte chunk', {
        status: 206,
        headers: {
          'content-type': 'video/mp2t',
          'content-range': 'bytes 0-17/1000',
          'content-length': '18',
        },
      })));

      const resp = await handleMediaRequest('https://s1.devcorp.me/segment.ts', 'bytes=0-17');
      expect(resp.status).toBe(206);
      expect(resp.headers.get('Content-Range')).toBe('bytes 0-17/1000');
      expect(resp.headers.get('Accept-Ranges')).toBe('bytes');
      expect(await resp.text()).toBe('partial byte chunk');
    });
  });
});
