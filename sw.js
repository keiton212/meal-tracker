const CACHE_NAME = 'meal-tracker-v2';
const urlsToCache = [
    './',
    './index.html',
    './css/style.css',
    './js/utils.js',
    './js/storage.js',
    './js/nav.js',
    './js/main.js',
    './js/addfood.js',
    './js/foods.js',
    './js/schedule.js',
    './js/graph.js',
    './js/weight.js',
    './js/export.js',
    './manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(cacheNames.map(name => name !== CACHE_NAME ? caches.delete(name) : null))
        )
    );
    self.clients.claim();
});

// ネットワーク優先：オンライン時は常に最新版を取得し、オフライン時のみキャッシュを使う
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
});
