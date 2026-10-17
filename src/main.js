import { html, render } from '../vendor/htm-preact-standalone.module.js';
import { openDb, DB_REAL, DB_TEST, loadSnapshot, requestPersistence } from './db/db.js';
import { ensureSeeded, purgeTrash } from './db/repo.js';
import { migrate } from './db/migrate.js';
import { buildSampleData } from './sample.js';
import { todayWib } from './core/dates.js';
import { App } from './ui/app.js';

const MODE_KEY = 'neraca.mode';
const root = document.getElementById('app');
root.textContent = ''; // remove the "Loading Neraca…" text before Preact renders
let currentDb = null;

function getMode() {
  try { return localStorage.getItem(MODE_KEY); } catch { return null; }
}
function saveMode(m) {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* the mode still applies for this session */ }
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
  await migrate(db);
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
    <p class="muted">Personal finance records. All data is stored only on this phone.</p>
    <section class="card">
      <h2>Try it first</h2>
      <p class="small muted">Open the app with TEST DATA (fictional figures) to try every feature without touching your real records.</p>
      <button class="btn primary block" onClick=${() => switchMode('test')}>Try with test data</button>
    </section>
    <section class="card">
      <h2>Start recording</h2>
      <p class="small muted">An empty database for your real data. Test data stays separate and can be opened any time.</p>
      <button class="btn block" onClick=${() => switchMode('real')}>Start with real data</button>
    </section>
  </main>`;
}

function showError(e) {
  console.error(e);
  render(html`<main class="screen" style="padding-top:48px">
    <h1>Neraca could not open</h1>
    <div class="banner danger">${String(e?.message ?? e)}</div>
    <p class="small muted">Your data has not been deleted. Close and reopen the app. If it still fails, send the error message above.</p>
  </main>`, root);
}

const mode = getMode();
if (mode === 'test' || mode === 'real') start(mode).catch(showError);
else render(html`<${Welcome} />`, root);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // When a new version of the app is installed, reload once so the screen shows the new version.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
  });
}
