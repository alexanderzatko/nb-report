const CACHE_VERSION = 'v293';  // Should match ConfigManager.js version
const CACHE_NAME = 'snow-report-cache';
const FULL_CACHE_NAME = `${CACHE_NAME}-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline.html';

const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/js/app.js',
  '/js/i18n.js',
  '/manifest.json?v=5',
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
  '/fonts/roboto/Roboto-Regular.woff2',
  '/fonts/roboto/Roboto-Regular.woff',
  '/fonts/roboto/Roboto-Medium.woff2',
  '/fonts/roboto/Roboto-Medium.woff',
  '/fonts/roboto/Roboto-Bold.woff2',
  '/fonts/roboto/Roboto-Bold.woff'
];

self.addEventListener('install', function(event) {
  console.log('[ServiceWorker] Install event');
  event.waitUntil(
    caches.open(FULL_CACHE_NAME)
      .then(function(cache) {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(urlsToCache)
          .then(() => cache.add(OFFLINE_PAGE))
          .then(() => {
            console.log('[ServiceWorker] All resources cached');
          })
          .catch(error => {
            console.error('[ServiceWorker] Cache addAll failed:', error);
            throw error;
          });
      })
      .catch(function(error) {
        console.error('[ServiceWorker] Install failed:', error);
        throw error;
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
            // Only cache successful GET requests
            if (response.status === 200 && event.request.method === 'GET') {
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
    caches.keys()
      .then(function(cacheNames) {
        console.log('[ServiceWorker] Checking caches:', cacheNames);
        return Promise.all(
          cacheNames.map(function(cacheName) {
            if (cacheName.startsWith(CACHE_NAME) && cacheName !== FULL_CACHE_NAME) {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Activation complete');
      })
      .catch(error => {
        console.error('[ServiceWorker] Activation failed:', error);
        throw error;
      })
  );
});

self.addEventListener('message', function(event) {
  if (event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Skip waiting message received');
    self.skipWaiting();
  }
});
