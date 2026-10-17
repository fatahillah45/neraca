// Service worker: aplikasi tetap terbuka tanpa internet. Tidak ada data keuangan yang lewat sini;
// hanya file aplikasi (kode, gaya, ikon) yang disimpan di cache.
const VERSION = 'neraca-v0.1.0';
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
  'src/core/validate.js',
  'src/db/db.js',
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
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache dulu (cepat dan bisa offline), sambil memperbarui cache dari jaringan di latar belakang.
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
