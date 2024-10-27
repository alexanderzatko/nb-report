// public/service-worker.js

const CACHE_VERSION = 'v88';  // Update this when deploying new version. ALso in ConfigManager,js !!!
const CACHE_NAME = `snow-report-cache-${CACHE_VERSION}`;

const STATIC_RESOURCES = [
  '/',
  '/index.html',
  '/styles.css',
  '/js/app.js',
  '/js/i18n.js',
  '/manifest.json',
  '/locales/en/translation.json',
  '/locales/sk/translation.json',
  '/icon/login-icon.svg',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  console.log('Service Worker installing with version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return Promise.allSettled(
          STATIC_RESOURCES.map(url => 
            cache.add(url).catch(error => {
              console.warn('Failed to cache:', url, error);
              return null;
            })
          )
        ).then(() => self.skipWaiting());
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating with version:', CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => 
              cacheName.startsWith('snow-report-cache-') && 
              cacheName !== CACHE_NAME
            )
            .map((cacheName) => {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      }),
      clients.claim(),
      clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'UPDATE_AVAILABLE',
            version: CACHE_VERSION
          });
        });
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  // Don't handle non-GET requests or API calls
  if (event.request.method !== 'GET' || 
      !event.request.url.startsWith(self.location.origin) || 
      event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }

        return fetch(event.request.clone())
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              })
              .catch(error => {
                console.warn('Failed to cache:', event.request.url, error);
              });

            return response;
          })
          .catch(async () => {
            if (event.request.mode === 'navigate') {
              const cache = await caches.open(CACHE_NAME);
              return cache.match('/offline.html');
            }
            throw new Error('Fetch failed');
          });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
