// Minimal Service Worker for PWA installability
// This provides the minimum requirements for the app to be installable

const CACHE_NAME = 'streamflix-v1';

// Install event - just activate immediately
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => cacheName !== CACHE_NAME)
                        .map((cacheName) => caches.delete(cacheName))
                );
            }),
            // Take control of all clients immediately
            self.clients.claim()
        ])
    );
});

// Fetch event - only intercept same-origin requests
self.addEventListener('fetch', (event) => {
    // Get the request URL
    const url = new URL(event.request.url);

    // Skip cross-origin requests entirely - let the browser handle them natively
    // This prevents Cross-Origin-Resource-Policy (CORP) errors
    if (url.origin !== self.location.origin) {
        return; // Don't call event.respondWith, let it pass through
    }

    // Only handle same-origin requests
    event.respondWith(
        fetch(event.request).catch((error) => {
            console.log('Fetch failed for:', event.request.url, error);
            // Return empty response to prevent errors
            return new Response('', {
                status: 503,
                statusText: 'Service Unavailable'
            });
        })
    );
});
