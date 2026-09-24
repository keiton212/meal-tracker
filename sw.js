const CACHE_NAME = 'meal-tracker-v22';
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
    './js/mealplan.js',
    './js/graph.js',
    './js/weight.js',
    './js/export.js',
    './js/cloud-config.js',
    './js/cloud-sync.js',
    './js/inbox.js',
    './js/backup.js',
    './manifest.json'
];

self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('push', event => {
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        windows.forEach(client => client.postMessage({ type: 'inbox-push' }));
        await self.registration.showNotification('MealLog', {
            body: 'ChatGPTから食事が届きました',
            data: { url: './index.html' }
        });
    })());
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const visible = windows.find(client => client.url.includes('index.html'));
        if (visible) {
            await visible.focus();
            visible.postMessage({ type: 'inbox-push' });
            return;
        }
        await self.clients.openWindow('./index.html');
    })());
});

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
        fetch(event.request, { cache: 'no-store' })
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
