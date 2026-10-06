const CACHE_NAME = 'roddarcy-pos-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './register.html',
  './scanner.html',
  './products.html',
  './history.html',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/peer-manager.js',
  './js/register.js',
  './js/scanner.js',
  './js/products.js',
  './js/history.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Stale-while-revalidate or Network-first fallback to cache
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response && response.status === 200 && e.request.method === 'GET') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
