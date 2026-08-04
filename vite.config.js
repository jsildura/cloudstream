import { defineConfig, loadEnv } from 'vite'
import path from "path"
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa';
import Sitemap from 'vite-plugin-sitemap'
import http from 'http';
import https from 'https';

const corsProxyPlugin = () => ({
  name: 'cors-proxy',
  configureServer(server) {
    // Mock visit endpoint
    server.middlewares.use('/api/visit', (req, res, next) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    });

    // General proxy endpoint
    server.middlewares.use('/api/proxy', (req, res, next) => {
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
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      corsProxyPlugin(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
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
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /\.[^/]+$/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.hostname === 'image.tmdb.org',
              handler: 'CacheFirst',
              options: {
                cacheName: 'tmdb-images',
                expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
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
      Sitemap({
        hostname: 'https://streamflix.stream/',
        dynamicRoutes: [
          // Main content pages
          '/tv-shows',
          '/discover',
          // Streaming providers
          '/netflix',
          '/disney',
          '/prime-video',
          '/hbo',
          '/apple-tv',
          '/viu',
          '/crunchyroll',
          '/peacock',
          // Live content
          '/iptv',
          '/sports',
          '/music',
          // User pages
          '/my-list',
          // Legal/info pages
          '/about',
          '/disclaimer',
          '/privacy',
          '/terms',
          '/contact'
        ],
        readable: true,
        generateRobotsTxt: false
      }),
    ],
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
        // Only proxy /api paths that are NOT handled by local middleware
        // /api/proxy and /api/visit are handled by corsProxyPlugin middleware
        '/api': {
          target: 'https://api.themoviedb.org/3',
          changeOrigin: true,
          bypass: (req, res, proxyOptions) => {
            // Let corsProxyPlugin middleware handle these paths
            if (req.url.startsWith('/api/proxy') || req.url.startsWith('/api/visit')) {
              return req.url;
            }
            return null; // Proxy to TMDB
          },
          rewrite: (path) => path.replace(/^\/api/, ''),
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              if (env.VITE_TMDB_READ_ACCESS_TOKEN) {
                proxyReq.setHeader('Accept', 'application/json');
                proxyReq.setHeader('Authorization', `Bearer ${env.VITE_TMDB_READ_ACCESS_TOKEN}`);
              }
            });
          }
        }
      }
    }
  }
})