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
  id:      'c81f7a42d9e53b16f408',
  fToken:  '9e3c7bd14af65281d0e49b73',
  ts:      '54d8b21fc9a37e60b1fd',
  token:   'b7f18e4c2d963a50ef81c4a9',
  title:   '2af9c71de84b5630c91e',
  year:    'f0b34e8d61ca9275a14f',
  season:  'd41e8c6b29af73510fc48a7e',
  episode: '8b7d13fae620c9541d8e7bc2',
  imdbId:  '6e2af5c97d1840b3f81a6d54',
};

// The upstream servers, in the order the site lists them. We try each in turn.
const SERVERS = ['sentinel__', 'resshin_', 'or1on', 'icaruz', 'berkas__', 'ressh1n', 'athena__'];

// Headers that make our request look like it came from the real site's player.
// Without a matching Origin/Referer, Cloudflare tends to answer 403.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Origin': BASE,
  'Referer': `${BASE}/`,
  'Accept': 'application/json, text/plain, */*',
};

// The 1.2s pause the site enforces between getting a token and using it.
const TOKEN_DELAY_MS = 1200;

// Abort any upstream call that doesn't answer in time. Cloudflare/throttled
// CDNs occasionally hang a connection; without this a single stuck fetch would
// stall the whole resolve loop forever.
const FETCH_TIMEOUT_MS = 8000;

// Budget for the WHOLE resolve. Per-fetch timeouts alone aren't enough: 7
// servers × (8s + sleeps) can exceed Cloudflare Pages Functions' wall-clock
// limit (observed as a dead request ~21s in under upstream throttling). A
// shared deadline threads through every fetch and the server loop, capping
// total resolve time and degrading gracefully to whatever sources were
// already verified instead of hanging.
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
async function fetchServerSources(server, meta, secret, deadline) {
  const { token, serverTs, xt } = await getServerToken(meta.tmdbId, secret, deadline);

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
  await sleep(TOKEN_DELAY_MS);
  return res.json();
}

// === STEP 4: verify a link is real (not a trailer, not a stub) ==============
const MIN_MP4_BYTES = 150 * 1024 * 1024; // 150 MB floor

function isHls(link, type) {
  return /\.m3u8(\?|$)/i.test(link || '') || /hls|m3u8/i.test(type || '');
}

// For MP4 we trust the API's `size` field (reliable per the recon notes).
function verifyMp4(link, expectedBytes) {
  if (typeof link.size !== 'number') return false;
  const floor = Math.max(MIN_MP4_BYTES, 0.4 * (expectedBytes || 0));
  return link.size >= floor;
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
    } else if (verifyMp4(link, expectedBytes)) {
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
export async function resolveStream(meta, secret, { timeoutMs = RESOLVE_TIMEOUT_MS } = {}) {
  if (!secret) throw new Error('missing ZXC_STREAM_SECRET');
  const deadline = Date.now() + timeoutMs;
  const attempts = []; // per-server status, for telemetry/debugging
  const verified = [];

  for (const server of SERVERS) {
    if (Date.now() >= deadline) break; // resolve budget exhausted — return what we have
    try {
      const raw = await fetchServerSources(server, meta, secret, deadline);
      const sources = await verifyResponse(raw, meta, deadline);
      attempts.push({ server, ok: sources.length > 0, count: sources.length });
      for (const s of sources) verified.push({ server, host: s.url ? new URL(s.url).hostname : null, ...s });
      // Stop early once we have a healthy pool.
      if (verified.length >= 3) break;
      await sleep(400 + Math.floor(Math.random() * 400)); // jitter between servers
    } catch (err) {
      attempts.push({ server, ok: false, error: String(err.message || err) });
    }
  }

  const top = verified.sort((a, b) => rank(b) - rank(a)).slice(0, 3);
  if (top.length === 0) {
    return { success: false, reason: 'no_sources', attempts };
  }
  return { success: true, sources: top, attempts };
}
