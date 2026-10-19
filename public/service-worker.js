const CACHE_VERSION = 'v712';  // Should match ConfigManager.js version
const CACHE_NAME = 'snow-report-cache';
const FULL_CACHE_NAME = `${CACHE_NAME}-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline.html';
const AUTH_CACHE_NAME = 'auth-cache';

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
  '/fonts/BalooThambi2/BalooThambi2-Bold.woff',
  '/fonts/BalooThambi2/BalooThambi2-Bold.woff2',
  '/fonts/BalooThambi2/BalooThambi2-ExtraBold.woff',
  '/fonts/BalooThambi2/BalooThambi2-ExtraBold.woff2',
  '/fonts/BalooThambi2/BalooThambi2-Medium.woff',
  '/fonts/BalooThambi2/BalooThambi2-Medium.woff2',
  '/fonts/BalooThambi2/BalooThambi2-Regular.woff',
  '/fonts/BalooThambi2/BalooThambi2-Regular.woff2',
  '/fonts/BalooThambi2/BalooThambi2-SemiBold.woff',
  '/fonts/BalooThambi2/BalooThambi2-SemiBold.woff2',
  '/images/backgrounds/login-bg.jpg',
  '/images/backgrounds/dashboard-bg.jpg',
  '/images/backgrounds/transparent.gif',
  '/images/kredit_eph.svg',
  '/images/nabezky_logo_blue_white.svg',
  '/images/report_nabezky_logo_gs.svg',
  '/images/rolba.jpg',
  '/images/bezkarka.jpg',
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
  const url = new URL(event.request.url);

  // Never intercept API calls — let the browser handle them directly.
  // Safari reports intercepted POST failures as "TypeError: Load failed" /
  // "Fetch API cannot load ... due to access control checks" (not real CORS).
  // Returning offline.html for failed API calls also breaks JSON clients.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Only cache GET requests for the app shell
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(function(response) {
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
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html')
                .then(function(response) {
                  return response || caches.match('/offline.html');
                });
            }
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
