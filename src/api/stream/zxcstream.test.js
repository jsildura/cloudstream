import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { resolveStream } from './zxcstream.js';

// The resolver needs WebCrypto for its token signature. happy-dom's window may
// not expose crypto.subtle, so fall back to Node's implementation.
beforeEach(() => {
  if (!globalThis.crypto?.subtle) {
    globalThis.crypto = webcrypto;
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Duck-typed Response: the resolver only touches ok/status/headers.get/json/
// text, so a plain object avoids depending on happy-dom's fetch/Response.
const fakeRes = ({ ok = true, status = 200, json, text, acao = '*' } = {}) => ({
  ok,
  status,
  headers: {
    get: (name) => (name.toLowerCase() === 'access-control-allow-origin' ? acao : null),
  },
  json: async () => json,
  text: async () => text ?? '',
});

// Routes by URL prefix; anything unmatched hangs until the request's abort
// signal fires — mirroring a throttled CDN that swallows connections.
const makeFetch = (routes) => vi.fn((url, init = {}) => {
  const match = routes.find(([prefix]) => String(url).startsWith(prefix));
  if (match) return Promise.resolve(match[1]);
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    });
  });
});

// Obfuscated field keys, copied from zxcstream.js's FIELD_MAP.
const TOKEN_KEY = 'b7f18e4c2d963a50ef81c4a9';
const TS_KEY = '54d8b21fc9a37e60b1fd';

const tokenRoute = () => [
  'https://player.zxcstream.xyz/backend/token__',
  fakeRes({ json: { [TOKEN_KEY]: 'tok', [TS_KEY]: '12345' } }),
];

describe('resolveStream global deadline', () => {
  it('returns no_sources within the budget when every upstream call hangs', async () => {
    vi.stubGlobal('fetch', makeFetch([])); // nothing answers
    const t0 = Date.now();

    const result = await resolveStream({ tmdbId: 1, mediaType: 'movie' }, 'test-secret', { timeoutMs: 300 });

    const elapsed = Date.now() - t0;
    // Resolves (never rejects) with a graceful no_sources, well inside the budget.
    expect(result).toMatchObject({ success: false, reason: 'no_sources' });
    expect(elapsed).toBeLessThan(3000);
  });

  it('keeps sources verified before the deadline even when later servers hang', async () => {
    const routes = [
      tokenRoute(),
      ['https://player.zxcstream.xyz/backend_/servers/sentinel__', fakeRes({
        json: { links: [{ link: 'https://cdn.example/stream.m3u8', type: 'HLS', resolution: '1080' }] },
      })],
      ['https://cdn.example/stream.m3u8', fakeRes({ text: '#EXTINF:5000,\nseg0.ts\n#EXTINF:5000,\nseg1.ts\n' })],
    ];
    vi.stubGlobal('fetch', makeFetch(routes));

    // runtime 100 → 6000s expected; EXTINF total 10000 ≥ 4800 passes verifyHls.
    const result = await resolveStream(
      { tmdbId: 1, mediaType: 'movie', runtime: 100, title: 'Test' },
      'test-secret',
      { timeoutMs: 300 }
    );

    expect(result.success).toBe(true);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ kind: 'hls', url: 'https://cdn.example/stream.m3u8' });
  });

  it('caps a slow-but-alive loop instead of walking all 7 servers', async () => {
    const routes = [
      tokenRoute(),
      ['https://player.zxcstream.xyz/backend_/servers/', fakeRes({ json: { links: [] } })],
    ];
    vi.stubGlobal('fetch', makeFetch(routes));
    const t0 = Date.now();

    // Every server answers empty, and each attempt costs 1.2s token delay +
    // jitter — the full loop would run ~14s. The deadline must cut it short.
    const result = await resolveStream({ tmdbId: 1, mediaType: 'movie' }, 'test-secret', { timeoutMs: 2000 });
    const elapsed = Date.now() - t0;

    expect(result).toMatchObject({ success: false, reason: 'no_sources' });
    expect(elapsed).toBeLessThan(4000);
  });
});
