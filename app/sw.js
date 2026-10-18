// Service worker: keeps the app usable offline. No financial data passes through here;
// only app files (code, styles, icons) are cached.
const VERSION = 'neraca-v0.2.1';
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'src/main.js',
  'src/sample.js',
  'src/core/dates.js',
  'src/core/ledger.js',
  'src/core/model.js',
  'src/core/money.js',
  'src/core/seed.js',
  'src/core/translate.js',
  'src/core/validate.js',
  'src/db/db.js',
  'src/db/migrate.js',
  'src/db/repo.js',
  'src/export/backup.js',
  'src/export/share.js',
  'src/export/workbook.js',
  'src/ui/app.js',
  'src/ui/components.js',
  'src/ui/dashboard.js',
  'src/ui/exportui.js',
  'src/ui/more.js',
  'src/ui/portfolio.js',
  'src/ui/styles.css',
  'src/ui/txform.js',
  'src/ui/txlist.js',
  'vendor/dexie.mjs',
  'vendor/exceljs.min.js',
  'vendor/htm-preact-standalone.module.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the HTTP cache so a new version never stores stale files.
  event.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first (fast and offline), while refreshing the cache from the network in the background.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
