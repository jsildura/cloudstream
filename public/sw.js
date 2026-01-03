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

// Fetch event - network first with error handling
self.addEventListener('fetch', (event) => {
    // Just pass through to network - no caching for now
    // This satisfies PWA requirements while keeping the app always up-to-date
    event.respondWith(
        fetch(event.request).catch((error) => {
            // Silently handle failures for ad scripts and external resources
            // Common ad domains to ignore
            const adDomains = [
                'effectivegatecpm.com',
                'adsterra',
                'doubleclick',
                'googlesyndication',
                'googleadservices'
            ];

            const isAdScript = adDomains.some(domain =>
                event.request.url.includes(domain)
            );

            // Only log non-ad failures
            if (!isAdScript) {
                console.log('Fetch failed for:', event.request.url, error);
            }

            // Return empty response to prevent errors
            return new Response('', {
                status: 503,
                statusText: 'Service Unavailable'
            });
        })
    );
});
