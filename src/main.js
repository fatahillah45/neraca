import { html, render } from '../vendor/htm-preact-standalone.module.js';
import { openDb, DB_REAL, DB_TEST, loadSnapshot, requestPersistence } from './db/db.js';
import { ensureSeeded, purgeTrash } from './db/repo.js';
import { buildSampleData } from './sample.js';
import { todayWib } from './core/dates.js';
import { App } from './ui/app.js';

const MODE_KEY = 'neraca.mode';
const root = document.getElementById('app');
root.textContent = ''; // buang teks "Memuat Neraca…" sebelum Preact merender
let currentDb = null;

function getMode() {
  try { return localStorage.getItem(MODE_KEY); } catch { return null; }
}
function saveMode(m) {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* mode tetap berlaku untuk sesi ini */ }
}

async function start(mode, { reset = false } = {}) {
  currentDb?.close();
  const name = mode === 'test' ? DB_TEST : DB_REAL;
  let db = openDb(name);
  if (reset && mode === 'test') {
    await db.delete();
    db = openDb(name);
  }
  await db.open();
  await ensureSeeded(db);
  if (mode === 'test' && (await db.accounts.count()) === 0) {
    const base = await loadSnapshot(db);
    const s = buildSampleData(base.categories, base.instruments, todayWib());
    await db.transaction('rw', db.accounts, db.holdings, db.transactions, db.valuations, async () => {
      await db.accounts.bulkAdd(s.accounts);
      await db.holdings.bulkAdd(s.holdings);
      await db.transactions.bulkAdd(s.transactions);
      await db.valuations.bulkAdd(s.valuations);
    });
  }
  await purgeTrash(db);
  requestPersistence().catch(() => {});
  currentDb = db;
  const initial = await loadSnapshot(db);
  render(html`<${App} key=${`${mode}-${Date.now()}`} db=${db} mode=${mode} initial=${initial} switchMode=${switchMode} />`, root);
}

function switchMode(mode, opts) {
  saveMode(mode);
  location.hash = '#/';
  start(mode, opts).catch(showError);
}

function Welcome() {
  return html`<main class="screen" style="padding-top:48px">
    <h1 style="font-size:28px;margin:0 0 8px">Neraca</h1>
    <p class="muted">Catatan keuangan pribadi. Semua data tersimpan hanya di HP ini.</p>
    <section class="card">
      <h2>Coba dulu</h2>
      <p class="small muted">Buka aplikasi dengan DATA UJI (angka rekaan) untuk mencoba semua fitur tanpa memengaruhi catatan asli.</p>
      <button class="btn primary block" onClick=${() => switchMode('test')}>Coba dengan data uji</button>
    </section>
    <section class="card">
      <h2>Mulai mencatat</h2>
      <p class="small muted">Database kosong untuk data asli Anda. Data uji tetap terpisah dan bisa dibuka kapan saja.</p>
      <button class="btn block" onClick=${() => switchMode('real')}>Mulai dengan data asli</button>
    </section>
  </main>`;
}

function showError(e) {
  console.error(e);
  render(html`<main class="screen" style="padding-top:48px">
    <h1>Neraca tidak bisa dibuka</h1>
    <div class="banner danger">${String(e?.message ?? e)}</div>
    <p class="small muted">Data Anda tidak dihapus. Coba tutup dan buka lagi aplikasi. Jika tetap gagal, kirim pesan galat di atas.</p>
  </main>`, root);
}

const mode = getMode();
if (mode === 'test' || mode === 'real') start(mode).catch(showError);
else render(html`<${Welcome} />`, root);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
