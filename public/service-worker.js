const CACHE_VERSION = 'v651';  // Should match ConfigManager.js version
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

const CACHE_ENDPOINTS = [
  '/api/auth-status'
];

const NEVER_CACHE_ENDPOINTS = [
  '/api/nblogin',
  '/api/refresh-token',
  '/api/user-data'
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

  // Special handling for auth-status endpoint
  if (url.pathname === '/api/auth-status') {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Clone the response before caching
                const responseToCache = response.clone();
                caches.open(FULL_CACHE_NAME)
                    .then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                return response;
            })
            .catch(async function() {
                const cache = await caches.open(FULL_CACHE_NAME);
                const cachedResponse = await cache.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }
                // If no cached response but we have auth data in localStorage,
                // return a synthetic successful response
                const authData = localStorage.getItem('auth_data');
                if (authData && JSON.parse(authData).isAuthenticated) {
                    return new Response(JSON.stringify({
                        isAuthenticated: true,
                        fromCache: true
                    }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                throw new Error('No cached auth response');
            })
    );
    return;
  }
  
  // Check if this is a request that should never be cached
  if (NEVER_CACHE_ENDPOINTS.some(endpoint => url.pathname.includes(endpoint))) {
    // Skip cache, always fetch from network
    event.respondWith(
      fetch(event.request)
        .catch(function() {
          // Only return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          throw new Error('Network request failed');
        })
    );
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
