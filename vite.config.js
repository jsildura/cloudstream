import { defineConfig, loadEnv } from 'vite'
import path from "path"
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
// Partytown moved orgs: @builder.io/partytown is deprecated in favour of
// @qwik.dev/partytown, which is where feature releases and fixes now land.
// Same export surface, so this is an import-path swap only.
import { partytownVite } from '@qwik.dev/partytown/utils';
import { partytownSnippet } from '@qwik.dev/partytown/integration';
import { visualizer } from 'rollup-plugin-visualizer';
import Beasties from 'beasties';
import http from 'http';
import https from 'https';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';

const corsProxyPlugin = () => ({
  name: 'cors-proxy',
  configureServer(server) {
    // ZXC stream secret for dev: process.env first, then the .env file.
    // (Never committed — .gitignore covers .env. Production uses Cloudflare's
    // encrypted ZXC_STREAM_SECRET binding instead.)
    const devEnv = loadEnv('development', process.cwd(), '');
    const ZXC_SECRET = process.env.ZXC_STREAM_SECRET || devEnv.ZXC_STREAM_SECRET;

    // Dev-only resolve cache, mirroring production
    // (functions/api/stream/streamflix.js): repeat plays re-serve the last
    // result instead of re-hitting zxcstream's backend — fewer traces, faster
    // loads, and less chance of tripping upstream rate limits. Successes live
    // 1 hour; failures 5 minutes so dead probes (e.g. S0 specials) don't
    // hammer upstream on every attempt. In-memory: resets when the dev server
    // restarts, which is fine for development.
    const devResolveCache = new Map();
    const DEV_CACHE_TTL_MS = 60 * 60 * 1000;
    const DEV_FAIL_TTL_MS = 5 * 60 * 1000;
    const devCacheKey = (meta) =>
      `${meta.tmdbId}/${meta.mediaType}/${meta.season ?? 0}/${meta.episode ?? 0}`;

    // Mock visit endpoint
    server.middlewares.use('/api/visit', (req, res, _next) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    });

    // General proxy endpoint
    server.middlewares.use('/api/proxy', (req, res, _next) => {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const targetUrl = urlObj.searchParams.get('url');

      if (!targetUrl) {
        res.statusCode = 400;
        res.end('Missing url parameter');
        return;
      }

      const client = targetUrl.startsWith('https') ? https : http;

      const proxyReq = client.get(targetUrl, (proxyRes) => {
        res.statusCode = proxyRes.statusCode;

        // Copy headers but handle CORS
        Object.keys(proxyRes.headers).forEach(key => {
          res.setHeader(key, proxyRes.headers[key]);
        });

        res.setHeader('Access-Control-Allow-Origin', '*');

        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.error('Proxy error:', err);
        res.statusCode = 500;
        res.end('Proxy failed');
      });
    });

    // Stream resolver endpoint (dev only)
    server.middlewares.use('/api/stream/streamflix', async (req, res, next) => {
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.end();
        return;
      }
      if (req.method !== 'POST') return next();
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', async () => {
        try {
          const meta = JSON.parse(body || '{}');
          // Same validation as production so the cache key is always valid.
          if (!meta.tmdbId || !['movie', 'tv'].includes(meta.mediaType)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, reason: 'bad_request' }));
            return;
          }

          const key = devCacheKey(meta);
          const cached = devResolveCache.get(key);
          if (cached && Date.now() - cached.at < cached.ttl) {
            // Mirror production (functions/api/stream/streamflix.js): serve a
            // cached success only while its top source still answers — CDN
            // data tokens expire in minutes, long before the 1h TTL, and a
            // stale cached URL fails in the player. Re-resolve when dead.
            const { isSourceAlive } = await import('./src/api/stream/zxcstream.js');
            const alive = !cached.body?.success || !cached.body.sources?.[0]?.url ||
              await isSourceAlive(cached.body.sources[0].url);
            if (alive) {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify(cached.body));
              return;
            }
          }

          const { resolveStream } = await import('./src/api/stream/zxcstream.js');
          const { routeSources } = await import('./src/api/stream/routing.js');
          const result = await resolveStream(meta, ZXC_SECRET);
          const routed = routeSources(result);
          devResolveCache.set(key, {
            body: routed,
            at: Date.now(),
            ttl: result.success ? DEV_CACHE_TTL_MS : DEV_FAIL_TTL_MS,
          });
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify(routed));
        } catch (err) {
          console.error('Stream resolve error:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, reason: 'exception' }));
        }
      });
    });

    // Media proxy endpoint (dev only) — thin adapter over the shared proxy.
    server.middlewares.use('/api/stream/media', async (req, res, next) => {
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.end();
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      try {
        const { handleMediaRequest } = await import('./src/api/stream/media-core.js');
        const u = new URL(req.url, `http://${req.headers.host}`).searchParams.get('u') || '';
        const resp = await handleMediaRequest(u, req.headers.range || '');
        resp.headers.forEach((value, key) => res.setHeader(key, value));
        res.statusCode = resp.status;
        if (resp.body) {
          Readable.fromWeb(resp.body).on('error', () => res.destroy()).pipe(res);
        } else {
          res.end();
        }
      } catch (err) {
        console.error('Media proxy error:', err);
        res.statusCode = 500;
        res.end('proxy error');
      }
    });
  }
});

// ─── Partytown snippet injection ──────────────────────────────────────────────
// The snippet is what actually relocates <script type="text/partytown"> tags to
// the worker. Two ordering constraints:
//   1. It must run AFTER the `partytown = {...}` config block in index.html, or
//      `forward` is unset and gtag/dataLayer calls are never proxied.
//   2. It does NOT need to precede the tagged scripts — the browser ignores an
//      unknown script type, so they sit inert in the DOM until the snippet
//      collects them by query.
// Appending to the end of <head> satisfies both. Injected from the package
// rather than hard-coded so it tracks the installed Partytown version.
const partytownSnippetPlugin = () => ({
  name: 'streamflix-partytown-snippet',
  transformIndexHtml() {
    return [
      {
        tag: 'script',
        children: partytownSnippet(),
        injectTo: 'head',
      },
    ];
  },
});

// ─── Critical CSS inlining (beasties) ─────────────────────────────────────────
// index.css is ~259 KB and blocks first paint on every route, including the
// inline-styled splash screen that exists precisely to cover that paint. This
// extracts the rules the initial HTML actually needs, inlines them, and loads
// the rest asynchronously via the media="print" onload swap.
//
// Runs in closeBundle so the CSS assets are already on disk. Must run BEFORE
// vite-plugin-pwa computes its precache manifest, or the service worker caches
// a revision hash for the pre-beasties index.html — VitePWA is pinned to
// closeBundleOrder: 'post' below to guarantee that ordering.
//
// #root is empty at build time (client-rendered SPA), so what gets inlined is
// the splash/document chrome. The deferred stylesheet is gated on load in
// index.html's splash logic, so React never paints unstyled.
const criticalCssPlugin = () => ({
  name: 'streamflix-critical-css',
  apply: 'build',
  async closeBundle() {
    const outDir = path.resolve(__dirname, 'dist');
    const htmlPath = path.join(outDir, 'index.html');
    let html;
    try {
      html = await fs.readFile(htmlPath, 'utf8');
    } catch {
      this.warn('critical-css: dist/index.html not found, skipping');
      return;
    }

    const beasties = new Beasties({
      path: outDir,
      publicPath: '/',
      // Inline what the initial document needs; async-load the remainder.
      preload: 'swap',
      // Keep @font-face and keyframes — the splash animation depends on them
      // and dropping them causes a visible hitch on first paint.
      inlineFonts: false,
      preloadFonts: true,
      pruneSource: false,
      reduceInlineStyles: false,
      mergeStylesheets: false,
      logLevel: 'warn',
    });

    try {
      const processed = await beasties.process(html);
      await fs.writeFile(htmlPath, processed, 'utf8');
      const inlined = (processed.match(/<style>/g) || []).length;
      console.log(
        `\n  critical-css: inlined ${inlined} <style> block(s), ` +
        `index.html ${(html.length / 1024).toFixed(1)} KB -> ${(processed.length / 1024).toFixed(1)} KB`
      );
    } catch (err) {
      // Never fail the build over an optimisation pass.
      this.warn(`critical-css: skipped (${err.message})`);
    }
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const analyze = mode === 'analyze' || process.env.ANALYZE === 'true'
  return {
    plugins: [
      react(),
      corsProxyPlugin(),
      // Copies the Partytown lib into dist/~partytown/ so the gtag snippet in
      // index.html can run in a web worker instead of on the main thread.
      partytownVite({
        dest: path.join(__dirname, 'dist', '~partytown'),
      }),
      partytownSnippetPlugin(),
      // Compresses images in the bundle AND in public/ (7 MB of mostly
      // unoptimised PNG). Lossless-ish defaults; see scripts/optimize-images.mjs
      // for the one-off WebP conversions of the worst offenders.
      ViteImageOptimizer({
        png: { quality: 80 },
        jpeg: { quality: 80 },
        jpg: { quality: 80 },
        webp: { quality: 82 },
        svg: {
          multipass: true,
          plugins: [
            {
              name: 'preset-default',
              params: {
                overrides: {
                  // Keep viewBox — removing it breaks CSS-scaled icons.
                  removeViewBox: false,
                },
              },
            },
          ],
        },
        // Icons and logos are referenced by exact byte size in the PWA manifest
        // checks; skip the tiny ones where compression gains nothing.
        exclude: /favicon\.ico$/,
        logStats: true,
      }),
      criticalCssPlugin(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        // Force VitePWA's closeBundle to run after criticalCssPlugin's, so the
        // precache manifest hashes the beasties-rewritten index.html rather than
        // the original. Without this the SW serves a stale HTML revision.
        integration: { closeBundleOrder: 'post' },
        includeAssets: ['icon/favicon.ico', 'offline.html'],
        manifest: {
          name: 'STREAMFLIX',
          short_name: 'streamflix',
          id: '/',
          start_url: '/',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone'],
          categories: ['entertainment', 'video'],
          description: 'Web application for Movie and TV Shows streaming.',
          lang: 'en',
          dir: 'auto',
          theme_color: '#e50914',
          background_color: '#000',
          orientation: 'any',
          icons: [
            { src: '/logo/streamflix_(512x512).png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/logo/streamflix_(512x512).png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/android-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/apple-icon-180x180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
            { src: '/icons/favicon-96x96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
            { src: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png', purpose: 'any' },
            { src: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png', purpose: 'any' }
          ],
          screenshots: [
            { src: '/img/landingpage.webp', sizes: '1600x805', type: 'image/webp', form_factor: 'wide', description: 'A screenshot of the home page - web' },
            { src: '/img/landingpage-mobile.webp', sizes: '390x760', type: 'image/webp', form_factor: 'narrow', description: 'A screenshot of the home page - mobile' }
          ],
          related_applications: [],
          prefer_related_applications: false,
          shortcuts: [
            { name: 'Home Page', url: '/home', description: 'Home page for STREAMFLIX', icons: [{ src: '/icons/favicon-96x96.png', sizes: '96x96' }] },
            { name: 'Movie Page', url: '/movies', description: 'Movie page for STREAMFLIX', icons: [{ src: '/icons/favicon-96x96.png', sizes: '96x96' }] },
            { name: 'TV Shows Page', url: '/tv-shows', description: 'TV Shows page for STREAMFLIX', icons: [{ src: '/icons/favicon-96x96.png', sizes: '96x96' }] }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,webp,svg,woff,woff2}'],
          // Partytown ships a debug build alongside the production one. It is
          // never requested at runtime, so precaching it just costs the user
          // storage on service-worker install.
          //
          // stats.html is the rollup-plugin-visualizer report (~850 KB) that
          // `npm run build:analyze` writes into dist/. It is a build artefact,
          // not part of the app: precaching it would make every visitor of an
          // accidentally-deployed analyze build download the whole module graph.
          globIgnores: ['**/~partytown/debug/**', '**/stats.html'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: '/index.html',
          // /paypal-return is a real static file, not an SPA route. Without it
          // here the service worker answers the PayPal redirect with index.html,
          // React routes the unknown path to NotFound, and the buyer sees a 404
          // while the popup never closes and capture never fires.
          navigateFallbackDenylist: [/^\/api\//, /^\/paypal-return/, /\.[^/]+$/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.hostname === 'image.tmdb.org',
              handler: 'CacheFirst',
              options: {
                cacheName: 'tmdb-images',
                // Tight cap: originals are MB each, and mobile storage is
                // precious. 200 images ≈ 100-400 MB worst case.
                expiration: { maxEntries: 200, maxAgeSeconds: 14 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              // Never cache streaming media manifests/segments, the live viewer
              // heartbeat, or the generic passthrough proxy. Must stay ahead of
              // the /api/ rule below — Workbox matches in array order.
              urlPattern: ({ url, request }) =>
                /\.(m3u8|mpd|ts|m4s)(\?|$)/.test(url.pathname) ||
                url.pathname.startsWith('/api/stream') ||
                url.pathname === '/api/visit' ||
                url.pathname === '/api/proxy' ||
                request.destination === 'video' ||
                request.destination === 'audio',
              handler: 'NetworkOnly'
            },
            {
              // TMDB metadata via our Pages Function. Every one of these is a
              // billable Function request, so serve from cache immediately and
              // refresh in the background — repeat visits cost nothing.
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'tmdb-proxy',
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 6 },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ]
        }
      }),
      // Bundle analysis, opt-in only: `npm run build:analyze`. Writes an
      // interactive treemap with gzip + brotli sizes per module. Kept out of
      // normal builds so CI and deploys don't pay for it.
      analyze && visualizer({
        filename: 'dist/stats.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
        open: false,
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./"),
      },
    },
    build: {
      target: "es2022",
      outDir: "dist",
      assetsDir: "assets",
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunks for better caching
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-shaka': ['shaka-player'],
            'vendor-hls': ['hls.js'],
          }
        }
      }
    },
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
    },
    server: {
      host: '0.0.0.0',  // Expose to all network interfaces for mobile testing
      // Note: COOP/COEP headers removed - they block cross-origin images from TMDB
      proxy: {
        // Pages Functions routes. Vite cannot execute functions/, so forward
        // them to a `wrangler pages dev` on :8788 (npm run preview:pages).
        // Without this they fall through to the catch-all below and get sent to
        // TMDB, which answers 404 status_code 34 and reads as a backend bug.
        // ECONNREFUSED here just means wrangler is not running.
        '^/api/(create-adfree-order|purchase-adfree|redeem-key|generate-adfree-keys)$': {
          target: 'http://127.0.0.1:8788',
          changeOrigin: false,
          configure: (proxy, _options) => {
            // Without this, a dead upstream surfaces as a bodyless 500 and the
            // UI blames PayPal. Say plainly that wrangler is not running.
            proxy.on('error', (err, _req, res) => {
              const body = JSON.stringify({
                ok: false,
                reason: 'pages-functions-unavailable',
                error: 'Pages Functions dev server unreachable',
                message:
                  'No wrangler on 127.0.0.1:8788 (' +
                  (err.code || err.message) +
                  '). Vite cannot run functions/ — start it with: npm run preview:pages'
              });
              if (!res.headersSent && res.writeHead) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
              }
              res.end(body);
            });
          }
        },
        // Only proxy /api paths that are NOT handled by local middleware
        // /api/proxy and /api/visit are handled by corsProxyPlugin middleware
        '/api': {
          target: 'https://api.themoviedb.org/3',
          changeOrigin: true,
          bypass: (req, _res, _proxyOptions) => {
            // Let corsProxyPlugin middleware handle these paths
            if (req.url.startsWith('/api/proxy') || req.url.startsWith('/api/visit') || req.url.startsWith('/api/stream')) {
              return req.url;
            }
            return null; // Proxy to TMDB
          },
          rewrite: (path) => path.replace(/^\/api/, ''),
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, _req, _res) => {
              // Unconditional: never let a caller's own Authorization header
              // (e.g. a Firebase ID token) travel onward to TMDB.
              proxyReq.setHeader('Accept', 'application/json');
              proxyReq.setHeader(
                'Authorization',
                env.VITE_TMDB_READ_ACCESS_TOKEN ? `Bearer ${env.VITE_TMDB_READ_ACCESS_TOKEN}` : ''
              );
            });
          }
        }
      }
    }
  }
})