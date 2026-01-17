import { defineConfig, loadEnv } from 'vite'
import path from "path"
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa';
import Sitemap from 'vite-plugin-sitemap'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: [
            '**/*.{js,jsx,css,html,ico,png,jpg,jpeg,webp,svg,woff,woff2,ttf,eot,xml,txt}']
        }
      }),
      Sitemap({
        hostname: 'https://streamflix.stream/',
        dynamicRoutes: [
          // Main content pages
          '/tv-shows',
          '/popular',
          '/top-rated',
          '/discover',
          '/trending',
          // Anime pages
          '/anime-movies',
          '/anime-series',
          // TV pages
          '/trending-tv',
          '/top-rated-tv',
          '/popular-tv',
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
        robots: [
          {
            userAgent: '*',
            allow: '/',
            disallow: ['/api/', '/watch'],
            crawlDelay: 2,
          },
        ]
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
    server: {
      host: '0.0.0.0',  // Expose to all network interfaces for mobile testing
      proxy: {
        '/api': {
          target: 'https://api.themoviedb.org/3',
          changeOrigin: true,
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