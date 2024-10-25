const CACHE_NAME = 'snow-report-cache-v88';
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
  '/js/config/ConfigManager.js',
  '/js/dropdowns/DropdownManager.js',
  '/js/events/EventManager.js',
  '/js/form/FormManager.js',
  '/js/location/LocationManager.js',
  '/js/media/PhotoManager.js',
  '/js/network/NetworkManager.js',
  '/js/services/ServiceWorkerManager.js',
  '/js/state/StateManager.js',
  '/js/storage/StorageManager.js',
  '/js/ui/UIManager.js',
  '/js/user/UserManager.js',
  '/js/utils/ErrorBoundary.js',
  '/js/utils/Logger.js',
  '/js/validation/ValidationManager.js',
  '/node_modules/i18next/dist/esm/i18next.js',
  '/node_modules/i18next-http-backend/esm/index.js',
  '/node_modules/i18next-browser-languagedetector/dist/esm/i18nextBrowserLanguageDetector.js'
];

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});
