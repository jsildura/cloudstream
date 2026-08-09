import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { resolveStream, isSourceAlive } from './zxcstream.js';

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
const fakeRes = ({ ok = true, status = 200, json, text, acao = '*', headers = {} } = {}) => ({
  ok,
  status,
  headers: {
    get: (name) => {
      const n = name.toLowerCase();
      if (n === 'access-control-allow-origin') return acao;
      return headers[n] ?? null;
    },
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

describe('resolveStream token pipelining', () => {
  it('prefetches the next server\'s token during the current server\'s delay', async () => {
    const order = [];
    const routes = [
      tokenRoute(),
      ['https://player.zxcstream.xyz/backend_/servers/sentinel__', fakeRes({
        json: { links: [
          { link: 'https://cdn.example/a.m3u8', type: 'HLS', resolution: '1080' },
          { link: 'https://cdn.example/b.m3u8', type: 'HLS', resolution: '720' },
          { link: 'https://cdn.example/c.m3u8', type: 'HLS', resolution: '480' },
        ] },
      })],
      ['https://cdn.example/', fakeRes({ text: '#EXTINF:5000,\nseg0.ts\n#EXTINF:5000,\nseg1.ts\n' })],
    ];
    const baseFetch = makeFetch(routes);
    const recordingFetch = vi.fn((url, init) => {
      order.push(String(url).replace(/\?.*$/, '')); // strip the opaque query params
      return baseFetch(url, init);
    });
    vi.stubGlobal('fetch', recordingFetch);

    const result = await resolveStream(
      { tmdbId: 1, mediaType: 'movie', runtime: 100, title: 'T' },
      'test-secret',
      { timeoutMs: 10000, tokenDelayMs: 10 }
    );

    expect(result.success).toBe(true);
    expect(result.sources).toHaveLength(3);
    // Pipelined order: the next token is fetched DURING the current server's
    // delay, i.e. before the current server's sources fetch. Sequential code
    // would emit token, server, token, server instead.
    expect(order[0]).toBe('https://player.zxcstream.xyz/backend/token__');
    expect(order[1]).toBe('https://player.zxcstream.xyz/backend/token__');
    expect(order[2]).toBe('https://player.zxcstream.xyz/backend_/servers/sentinel__');
    expect(order.slice(3)).toEqual([
      'https://cdn.example/a.m3u8',
      'https://cdn.example/b.m3u8',
      'https://cdn.example/c.m3u8',
    ]);
  });

  it('reaches all 7 servers inside the budget thanks to pipelined tokens', async () => {
    const routes = [
      tokenRoute(),
      ['https://player.zxcstream.xyz/backend_/servers/', fakeRes({ json: { links: [] } })],
    ];
    vi.stubGlobal('fetch', makeFetch(routes));

    const result = await resolveStream(
      { tmdbId: 1, mediaType: 'movie' },
      'test-secret',
      { timeoutMs: 2000, tokenDelayMs: 10 }
    );

    expect(result).toMatchObject({ success: false, reason: 'no_sources' });
    // Every server gets a chance — the old sequential walk (1.2s delay + token
    // RTT per server) would have been cut off by the 2s budget after ~2 servers.
    expect(result.attempts.map((a) => a.server)).toEqual([
      'sentinel__', 'resshin_', 'or1on', 'icaruz', 'berkas__', 'ressh1n', 'athena__',
    ]);
  });
});

describe('isSourceAlive cache freshness', () => {
  it('treats 2xx/206 as alive and 403/427 as dead', async () => {
    for (const [status, expected] of [[200, true], [206, true], [403, false], [427, false]]) {
      const ok = status >= 200 && status < 300;
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(fakeRes({ ok, status }))));
      await expect(isSourceAlive('https://cdn.example/v.mp4')).resolves.toBe(expected);
    }
  });

  it('treats a probe that cannot connect as alive (do not force a re-resolve)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNRESET'))));
    await expect(isSourceAlive('https://cdn.example/v.mp4')).resolves.toBe(true);
  });
});

describe('verifyMp4 size-less acceptance', () => {
  const mp4Server = (link, probe) => [
    tokenRoute(),
    ['https://player.zxcstream.xyz/backend_/servers/sentinel__', fakeRes({ json: { links: [link] } })],
    ...(probe ? [probe] : []),
  ];

  it('accepts a size-less MP4 when the length probe is blocked (403 relay)', async () => {
    const link = { link: 'https://relay.workers.dev/proxy?data=x', type: 'mp4', resolution: '1080' };
    vi.stubGlobal('fetch', makeFetch(mp4Server(link, ['https://relay.workers.dev/proxy?data=x', fakeRes({ ok: false, status: 403 })])));

    const result = await resolveStream({ tmdbId: 1, mediaType: 'movie', runtime: 100, title: 'T' }, 'test-secret', { timeoutMs: 300 });

    expect(result.success).toBe(true);
    expect(result.sources[0]).toMatchObject({ kind: 'mp4', url: 'https://relay.workers.dev/proxy?data=x' });
  });

  it('accepts a size-less MP4 when the probe reports a full-length range', async () => {
    const link = { link: 'https://cdn.example/full.mp4', type: 'mp4', resolution: '1080' };
    const probe = ['https://cdn.example/full.mp4', fakeRes({
      status: 206,
      headers: { 'content-range': 'bytes 0-0/2000000000' }, // 2 GB > floor for 100 min
    })];
    vi.stubGlobal('fetch', makeFetch(mp4Server(link, probe)));

    const result = await resolveStream({ tmdbId: 1, mediaType: 'movie', runtime: 100, title: 'T' }, 'test-secret', { timeoutMs: 300 });

    expect(result.success).toBe(true);
    expect(result.sources[0]).toMatchObject({ kind: 'mp4', url: 'https://cdn.example/full.mp4' });
  });

  it('rejects a size-less MP4 when the probe measures a short trailer', async () => {
    const link = { link: 'https://cdn.example/trailer.mp4', type: 'mp4', resolution: '480' };
    const probe = ['https://cdn.example/trailer.mp4', fakeRes({
      status: 206,
      headers: { 'content-range': 'bytes 0-0/10000000' }, // 10 MB — a trailer
    })];
    vi.stubGlobal('fetch', makeFetch(mp4Server(link, probe)));

    const result = await resolveStream({ tmdbId: 1, mediaType: 'movie', runtime: 100, title: 'T' }, 'test-secret', { timeoutMs: 300 });

    expect(result).toMatchObject({ success: false, reason: 'no_sources' });
  });

  it('keeps trusting a present size field without probing', async () => {
    const link = { link: 'https://cdn.example/big.mp4', type: 'mp4', size: 2_000_000_000 }; // 2 GB > 1.03 GB floor for 100 min
    // No probe route: if verifyMp4 probed, the URL would hang and the 300ms
    // budget would be eaten, failing the resolve.
    vi.stubGlobal('fetch', makeFetch(mp4Server(link)));

    const result = await resolveStream({ tmdbId: 1, mediaType: 'movie', runtime: 100, title: 'T' }, 'test-secret', { timeoutMs: 300 });

    expect(result.success).toBe(true);
    expect(result.sources[0]).toMatchObject({ kind: 'mp4', url: 'https://cdn.example/big.mp4' });
  });
});
