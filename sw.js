// Service Worker：アプリ本体をキャッシュしてオフラインでも開けるようにする
// ファイルを更新したら CACHE_VERSION を上げてください。

const CACHE_VERSION = 'kondate-v4';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/actions.js',
  './js/planner.js',
  './js/shopping.js',
  './js/fridge.js',
  './js/nutrition.js',
  './js/store.js',
  './js/data/recipes.js',
  './js/data/nutrients.js',
  './js/data/ingredients.js',
  './js/lib/util.js',
  './js/lib/ui.js',
  './js/components/recipe-detail.js',
  './js/components/recipe-form.js',
  './js/components/recipe-picker.js',
  './js/components/settings-sheet.js',
  './js/components/nutrition-view.js',
  './js/views/today.js',
  './js/views/week.js',
  './js/views/shopping.js',
  './js/views/recipes.js',
  './js/views/fridge.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// キャッシュを先に返しつつ、裏でネットワークから最新版を取得してキャッシュを更新する
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
