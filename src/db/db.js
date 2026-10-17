// Penyimpanan di HP: IndexedDB lewat Dexie. Data asli dan data uji memakai database terpisah.
import Dexie from '../../vendor/dexie.mjs';

export const DB_REAL = 'neraca';
export const DB_TEST = 'neraca-uji';

export function openDb(name) {
  const db = new Dexie(name);
  db.version(1).stores({
    accounts: 'id, order',
    categories: 'id, type, parentId, order',
    instruments: 'id, order',
    holdings: 'id, instrumentId',
    transactions: 'id, date, type, accountId, updatedAt, deletedAt',
    valuations: 'id, holdingId, date',
    settings: 'key',
    weeks: 'weekStart',
  });
  return db;
}

export const DATA_TABLES = ['accounts', 'categories', 'instruments', 'holdings', 'transactions', 'valuations', 'settings'];

/** Snapshot lengkap untuk mesin hitung dan tampilan. */
export async function loadSnapshot(db) {
  const [accounts, categories, instruments, holdings, transactions, valuations, settings, weeks] = await Promise.all([
    db.accounts.toArray(), db.categories.toArray(), db.instruments.toArray(), db.holdings.toArray(),
    db.transactions.toArray(), db.valuations.toArray(), db.settings.toArray(), db.weeks.toArray(),
  ]);
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return { accounts, categories, instruments, holdings, transactions, valuations, settings, settingsMap, weeks };
}

/** Minta izin penyimpanan persisten agar browser tidak menghapus data saat ruang penyimpanan menipis. */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return { supported: false, persisted: false };
  const already = await navigator.storage.persisted();
  const persisted = already || (await navigator.storage.persist());
  return { supported: true, persisted };
}
