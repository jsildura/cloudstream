// ⚠️⚠️⚠️ SERVER-ONLY FILE ⚠️⚠️⚠️
// Contains a working SECRET + FIELD_MAP for zxcstream's API.
// Import this from Vite middleware / Cloudflare Functions ONLY.
// Never import it from a React component — the secret would ship to every user.

// === CONFIG (the only things you might need to change) =====================

// The origin all backend calls go to. The site serves its JS from here and
// makes same-origin calls to /backend/*, so this is almost certainly correct.
const BASE = 'https://player.zxcstream.xyz';

// The shared secret (module 92852 of the site's bundle) is NOT stored here.
// Production reads it from Cloudflare's encrypted `ZXC_STREAM_SECRET`
// binding (see functions/api/stream/streamflix.js); dev reads it from
// .env / process.env (see vite.config.js). It is passed to resolveStream().

// Obfuscated field names. The site sends its parameters under these weird keys
// instead of "id", "token", etc. Copied verbatim from the same module.
const FIELD_MAP = {
  id:      'c81f42d9e2532b16f408',
  fToken:  '9e3c7b14af652481d0e49b73',
  ts:      '54d8b21fa3754e60b1fd',
  token:   'b7f18e4c225d963aef81c4a9',
  title:   '2af9c71de384b546391e',
  year:    'f0b34e8d66a9275a14f',
  season:  'd41e8c6b259af57510fc48a7e',
  episode: '8b7d13fe620c94541d8e7bc2',
  imdbId:  '6e2af5c97d19840b631a6d54',
};

// The upstream servers, in the order the site lists them. We try each in turn.
const SERVERS = ['o_rion', 'i_carus', 'b_erkas', 'r_esshin', 'a_thena', 's_entinel'];

// Headers that make our request look like it came from the real site's player.
// Without a matching Origin/Referer, Cloudflare tends to answer 403.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Origin': BASE,
  'Referer': `${BASE}/`,
  'Accept': 'application/json, text/plain, */*',
};

// The 1.2s pause the site enforces between getting a token and using it. The
// loop also uses this window to prefetch the NEXT server's token, so the pause
// costs no extra wall time (see resolveStream).
const TOKEN_DELAY_MS = 1200;

// Abort any upstream call that doesn't answer in time. Cloudflare/throttled
// CDNs occasionally hang a connection; without this a single stuck fetch would
// stall the whole resolve loop forever.
const FETCH_TIMEOUT_MS = 8000;

// Budget for the WHOLE resolve. Per-fetch timeouts alone aren't enough: even
// with pipelined tokens, 7 servers × (8s worst-case hang + 1.2s delay) can
// exceed Cloudflare Pages Functions' wall-clock limit (observed as a dead
// request ~21s under upstream throttling). A shared deadline threads through
// every fetch and the server loop, capping total resolve time and degrading
// gracefully to whatever sources were already verified instead of hanging.
// Pipelining keeps the healthy 7-server walk ~10s, so the budget is normally
// not the binding constraint.
const RESOLVE_TIMEOUT_MS = 15000;

const fetchT = (url, opts = {}, deadline = 0) => {
  const remaining = deadline ? Math.max(1, deadline - Date.now()) : FETCH_TIMEOUT_MS;
  return fetch(url, { ...opts, signal: AbortSignal.timeout(Math.min(FETCH_TIMEOUT_MS, remaining)) });
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// === STEP 1: sign a request ================================================

// WebCrypto version — works in Node 20+, Cloudflare Workers, and browsers
async function sha512Hex(s) {
  const buf = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateFrontendToken(id, secret) {
  const rt = Date.now();
  const xt = (await sha512Hex(`${rt}:${secret}:${id}`)).slice(0, 64);
  return { xt, rt };
}

// === STEP 2: swap our signature for a server-issued token ===================
// POST /backend/token__  →  { <token>, <serverTs> }
async function getServerToken(id, secret, deadline) {
  const { xt, rt } = await generateFrontendToken(id, secret);
  const body = {
    [FIELD_MAP.id]: id,
    [FIELD_MAP.fToken]: xt,
    [FIELD_MAP.ts]: rt,
  };
  const res = await fetchT(`${BASE}/backend/token__`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...BROWSER_HEADERS },
    body: JSON.stringify(body),
  }, deadline);
  if (!res.ok) throw new Error(`token__ HTTP ${res.status}`);
  const data = await res.json();
  return { token: data[FIELD_MAP.token], serverTs: data[FIELD_MAP.ts], xt };
}

// === STEP 3: ask one upstream server for its stream links ===================
// Pure fetch: the token arrives pre-aged from the caller (prefetched during
// the previous server's delay), so there's no waiting inside this function.
async function fetchServerSources(server, meta, tokenBundle, deadline) {
  const { token, serverTs, xt } = tokenBundle;

  const params = new URLSearchParams({
    [FIELD_MAP.id]: String(meta.tmdbId),
    b: meta.mediaType,
    [FIELD_MAP.ts]: String(serverTs),
    [FIELD_MAP.token]: token,
    [FIELD_MAP.fToken]: xt,
    [FIELD_MAP.title]: meta.title ?? '',
    [FIELD_MAP.year]: meta.year ?? '',
    date: meta.date ?? '',
  });
  if (meta.mediaType === 'tv') {
    params.set(FIELD_MAP.season, String(meta.season));
    params.set(FIELD_MAP.episode, String(meta.episode));
  }
  if (meta.imdbId) {
    params.set(FIELD_MAP.imdbId, String(meta.imdbId));
  }

  const res = await fetchT(`${BASE}/backend_/servers/${server}?${params.toString()}`, {
    headers: BROWSER_HEADERS,
  }, deadline);
  if (!res.ok) throw new Error(`servers/${server} HTTP ${res.status}`);
  return res.json();
}

// === STEP 4: verify a link is real (not a trailer, not a stub) ==============
const MIN_MP4_BYTES = 150 * 1024 * 1024; // 150 MB floor

function isHls(link, type) {
  return /\.m3u8(\?|$)/i.test(link || '') || /hls|m3u8/i.test(type || '');
}

// MP4 verification: trust the API's `size` field when present (reliable per
// the recon notes). Some servers omit `size` (proxied links, e.g. workers.dev
// relays) — probe those for a total length as a best effort. Only a MEASURED
// short length is grounds for rejection (trailer/stub). If the probe fails or
// reports nothing (blocked CDN, chunked stream), accept the link anyway: a
// dead link errors in the player and the per-attempt retry advances past it,
// while a real source the API just didn't annotate would otherwise be thrown
// away (the exact failure behind "direct play missing a title the iframe
// plays").
const PROBE_TIMEOUT_MS = 4000;

async function verifyMp4(link, expectedBytes, deadline) {
  const floor = Math.max(MIN_MP4_BYTES, 0.4 * (expectedBytes || 0));
  if (typeof link.size === 'number') return link.size >= floor;

  const url = link.link || link.url;
  const probeDeadline = deadline
    ? Math.min(deadline, Date.now() + PROBE_TIMEOUT_MS)
    : Date.now() + PROBE_TIMEOUT_MS;
  try {
    const res = await fetchT(url, {
      method: 'GET',
      headers: { ...BROWSER_HEADERS, Range: 'bytes=0-0' },
    }, probeDeadline);
    // Drop the body after reading headers — a 200 (Range ignored) would
    // otherwise stream the whole file into the resolver.
    if (res.body?.cancel) { try { await res.body.cancel(); } catch { /* best-effort */ } }
    if (!res.ok) return true; // blocked (e.g. 403 from a relay) — can't measure, accept
    // 206 → Content-Range: bytes 0-0/<total>; 200 → Content-Length is the full size.
    const cr = res.headers.get('content-range');
    const m = cr && cr.match(/\/(\d+)\s*$/);
    const total = m ? Number(m[1]) : Number(res.headers.get('content-length'));
    if (!Number.isFinite(total) || total <= 0) return true; // unmeasurable — accept
    return total >= floor;
  } catch {
    return true; // probe failed — accept and let the player decide
  }
}

// === cached-source freshness check ==========================================
// CDN data tokens inside resolved URLs expire in minutes, but the resolve cache
// lives an hour — a cache hit can therefore serve dead links (the relays answer
// 403/427 once the token lapses) that fail in the player. That is exactly the
// "direct play missing a title the iframe plays" symptom: the iframe re-resolves
// fresh from the browser, the cache does not. Callers probe the top cached
// source before serving and re-resolve when it no longer answers. A probe that
// can't connect is NOT treated as dead (the CDN may block our IP while the
// browser works); only a hard HTTP error status is.
export async function isSourceAlive(url, deadline = 0) {
  try {
    const res = await fetchT(url, {
      method: 'GET',
      headers: { ...BROWSER_HEADERS, Range: 'bytes=0-0' },
    }, deadline);
    // Drop the body after reading headers — a 200 (Range ignored) would
    // otherwise stream the whole file into the function.
    if (res.body?.cancel) { try { await res.body.cancel(); } catch { /* best-effort */ } }
    return res.ok; // 2xx/206 → alive; 403/427/... → dead
  } catch {
    return true; // can't measure — don't force a re-resolve on a transient failure
  }
}

// For HLS we fetch the playlist and add up segment durations. A master playlist
// (#EXT-X-STREAM-INF) points at variant playlists — we follow the first one.
async function verifyHls(url, runtimeSec, deadline) {
  try {
    const res = await fetchT(url, { headers: BROWSER_HEADERS }, deadline);
    if (!res.ok) return { ok: false, corsOk: false };
    // A header being "present" is NOT enough — CDNs can pin it to one specific
    // origin (e.g. ACAO: https://s1.devcorp.me), which the browser still blocks.
    // Only a wildcard tells us the browser can actually load it directly.
    const acao = res.headers.get('access-control-allow-origin');
    const corsOk = acao === '*';
    let text = await res.text();

    if (text.includes('#EXT-X-STREAM-INF')) {
      const variant = text.split('\n').find((l) => l.trim() && !l.startsWith('#'));
      if (variant) {
        const variantUrl = new URL(variant.trim(), url).toString();
        const vRes = await fetchT(variantUrl, { headers: BROWSER_HEADERS }, deadline);
        if (vRes.ok) text = await vRes.text();
      }
    }

    let total = 0;
    for (const line of text.split('\n')) {
      const m = line.match(/#EXTINF:([\d.]+)/);
      if (m) total += parseFloat(m[1]);
    }
    // Accept if we can't measure runtime; otherwise require >= 80% of expected.
    const ok = runtimeSec ? total >= 0.8 * runtimeSec : total > 0;
    return { ok, corsOk, measuredSec: Math.round(total) };
  } catch {
    return { ok: false, corsOk: false };
  }
}

// === STEP 5: turn one server's raw response into verified sources ===========
async function verifyResponse(raw, meta, deadline) {
  const links = Array.isArray(raw?.links) ? raw.links : [];
  const runtimeSec = (meta.runtime || 0) * 60;
  const expectedBytes = runtimeSec * (3.6e6 / 8); // ~3.6 Mbps @ 1080p
  const out = [];

  for (const link of links) {
    const url = link.link || link.url;
    if (!url) continue;
    if (isHls(url, link.type)) {
      const v = await verifyHls(url, runtimeSec, deadline);
      if (v.ok) out.push({ kind: 'hls', url, resolution: String(link.resolution || ''), corsOk: v.corsOk, measuredSec: v.measuredSec });
    } else if (await verifyMp4(link, expectedBytes, deadline)) {
      out.push({ kind: 'mp4', url, resolution: String(link.resolution || ''), sizeBytes: link.size });
    }
  }
  return out;
}

// Rank: prefer HLS 1080 > MP4 1080 > HLS 720 > MP4 720 > everything else.
function rank(s) {
  const res = parseInt(s.resolution, 10) || 0;
  const kindBonus = s.kind === 'hls' ? 0.5 : 0;
  return res + kindBonus;
}

// === STEP 6: try servers in order, collect the best 3 verified sources ======
// Tokens are pipelined: server N+1's token is prefetched during server N's
// enforced token-age delay, hiding every token round-trip from the critical
// path. That drops a full 7-server walk from ~15s to ~10s, so late servers
// (berkas__ etc.) are actually reached inside the budget — the sequential
// walk previously cut them off and produced false no_sources. At most one
// request is ever in flight, and the sequence zxcstream sees is unchanged
// (token → server → token → server), so pipelining adds no detection surface.
// The old inter-server jitter is gone: the 1.2s token-age window now paces the
// server fetches, and each token is still used exactly 1.2s after it was
// issued, matching the site's own player behavior.
export async function resolveStream(meta, secret, { timeoutMs = RESOLVE_TIMEOUT_MS, tokenDelayMs = TOKEN_DELAY_MS } = {}) {
  if (!secret) throw new Error('missing ZXC_STREAM_SECRET');
  const deadline = Date.now() + timeoutMs;
  const attempts = []; // per-server status, for telemetry/debugging
  const verified = [];

  // Token fetches never throw here — failures become { error } so the loop can
  // record the attempt and move on, the same as any other per-server failure.
  const prefetchToken = () => getServerToken(meta.tmdbId, secret, deadline).then(
    (bundle) => ({ bundle }),
    (err) => ({ error: err })
  );

  // Token for the first server; every later token is prefetched inside the loop.
  let tok = await prefetchToken();

  for (let i = 0; i < SERVERS.length; i++) {
    const server = SERVERS[i];
    if (Date.now() >= deadline) break; // resolve budget exhausted — return what we have

    // Prefetch the NEXT token while this server's token-age delay runs — the
    // only request in flight during the wait. Awaiting it before the server
    // fetch keeps ≤1 request in flight (a no-op when it landed inside the
    // window; a plain sequential fallback when the network is slower than the
    // delay). Skipped on the last server so we never send an orphan request.
    const nextTok = i < SERVERS.length - 1 ? prefetchToken() : null;
    await sleep(tokenDelayMs);
    const next = nextTok ? await nextTok : null;

    if (tok.error) {
      attempts.push({ server, ok: false, error: String(tok.error.message || tok.error) });
      tok = next;
      continue;
    }

    try {
      const raw = await fetchServerSources(server, meta, tok.bundle, deadline);
      const sources = await verifyResponse(raw, meta, deadline);
      attempts.push({ server, ok: sources.length > 0, count: sources.length });
      for (const s of sources) verified.push({ server, host: s.url ? new URL(s.url).hostname : null, ...s });
      // Stop early once we have a healthy pool.
      if (verified.length >= 3) break;
    } catch (err) {
      attempts.push({ server, ok: false, error: String(err.message || err) });
    }

    tok = next;
  }

  const top = verified.sort((a, b) => rank(b) - rank(a)).slice(0, 3);
  if (top.length === 0) {
    return { success: false, reason: 'no_sources', attempts };
  }
  return { success: true, sources: top, attempts };
}
