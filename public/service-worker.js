const CACHE_VERSION = 'v150';  // Should match ConfigManager.js version
const CACHE_NAME = 'snow-report-cache';
const FULL_CACHE_NAME = `${CACHE_NAME}-${CACHE_VERSION}`;

const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/js/app.js',
  '/js/i18n.js',
  '/manifest.json?v=4',
  '/locales/en/translation.json',
  '/locales/sk/translation.json',
  '/data/xc_dropdowns.json',
  '/data/countries-regions.json',
  '/vendor/exif.js',
  '/js/auth/AuthManager.js',
  '/js/events/EventManager.js',
  '/js/form/FormManager.js',
  '/js/managers/GPSManager.js',
  '/js/managers/SelectManager.js',
  '/js/media/PhotoManager.js',
  '/js/network/NetworkManager.js',
  '/js/services/ServiceWorkerManager.js',
  '/js/state/StateManager.js',
  '/js/utils/Logger.js',
  '/js/ui/UIManager.js',
  '/js/validation/ValidationManager.js',
  '/node_modules/i18next/dist/esm/i18next.js',
  '/node_modules/i18next-http-backend/esm/index.js',
  '/node_modules/i18next-browser-languagedetector/dist/esm/i18nextBrowserLanguageDetector.js',
  '/offline.html'
];

const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(FULL_CACHE_NAME)
      .then(function(cache) {
        return cache.addAll([...urlsToCache, OFFLINE_PAGE]);
      })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(function(response) {
            // Optional: Add successful network requests to cache
            if (response.status === 200) {
              const responseClone = response.clone();
              caches.open(FULL_CACHE_NAME)
                .then(function(cache) {
                  cache.put(event.request, responseClone);
                });
            }
            return response;
          })
          .catch(function() {
            // For navigation requests, return index.html from cache
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html')
                .then(function(response) {
                  return response || caches.match('/offline.html');
                });
            }
            // For other resources that fail to load, try offline.html only if no cached version
            return caches.match('/offline.html');
          });
      })
  );
});

self.addEventListener('activate', function(event) {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName.startsWith(CACHE_NAME) && cacheName !== FULL_CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) {
          return response; // Return cached response if found
        }
        return fetch(event.request) // Only fetch from network if not in cache
          .then(function(response) {
            // Optional: Add successful network requests to cache
            if (response.status === 200) {
              const responseClone = response.clone();
              caches.open(FULL_CACHE_NAME)
                .then(function(cache) {
                  cache.put(event.request, responseClone);
                });
            }
            return response;
          });
      })
  );
});

self.addEventListener('message', function(event) {
  if (event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Skip waiting message received');
    self.skipWaiting();
  }
});
