const CACHE_VERSION = 'v134';  // Should match ConfigManager.js version
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
];

self.addEventListener('install', function(event) {
  console.log('[ServiceWorker] Installing new version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(FULL_CACHE_NAME)
      .then(function(cache) {
        console.log('Opened cache:', FULL_CACHE_NAME);
        return cache.addAll(urlsToCache);
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
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Skip waiting message received');
    self.skipWaiting();
  }
});
