// JSON backup file: the only way to recover if the data on the phone is lost.
// Carries a SHA-256 checksum and is integrity-checked before restoring.
import { SCHEMA_VERSION, TX_TYPES } from '../core/model.js';

export const BACKUP_FORMAT = 'neraca-backup';
const LEGACY_FORMATS = ['neraca-cadangan'];
export const BACKUP_VERSION = 1;
export const TABLES = ['accounts', 'categories', 'instruments', 'holdings', 'transactions', 'valuations', 'settings'];

async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function canonicalData(data) {
  const out = {};
  for (const t of TABLES) out[t] = data[t] ?? [];
  return out;
}

export function backupFileName(now = new Date()) {
  const w = new Date(now.getTime() + 7 * 3600 * 1000).toISOString();
  return `neraca-backup-${w.slice(0, 10)}-${w.slice(11, 13)}${w.slice(14, 16)}.json`;
}

export async function serializeBackup(data, { now = new Date(), isTestData = false, appVersion = '' } = {}) {
  const payload = canonicalData(data);
  const body = JSON.stringify(payload);
  const counts = Object.fromEntries(TABLES.map((t) => [t, payload[t].length]));
  const doc = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: now.toISOString(),
    isTestData,
    counts,
    checksum: await sha256Hex(body),
    data: payload,
  };
  return JSON.stringify(doc);
}

/** Checks a backup file. Changes nothing; the caller decides whether to restore. */
export async function parseBackup(text) {
  const errors = [];
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  if (doc?.format !== BACKUP_FORMAT && !LEGACY_FORMATS.includes(doc?.format)) return { ok: false, errors: ['This is not a Neraca backup file.'] };
  if (typeof doc.version !== 'number' || doc.version > BACKUP_VERSION) errors.push('This backup comes from a newer app version. Update the app first.');
  if (typeof doc.schemaVersion !== 'number' || doc.schemaVersion > SCHEMA_VERSION) errors.push('The data schema is newer than this app.');
  const data = doc.data ?? {};
  for (const t of TABLES) if (!Array.isArray(data[t])) errors.push(`Section ${t} is missing or damaged.`);
  if (errors.length) return { ok: false, errors };

  for (const t of TABLES) {
    if (doc.counts?.[t] !== data[t].length) errors.push(`Count mismatch for ${t} (${data[t].length} vs ${doc.counts?.[t]}).`);
  }
  const sum = await sha256Hex(JSON.stringify(canonicalData(data)));
  if (sum !== doc.checksum) errors.push('Checksum mismatch: the file may be truncated or edited.');

  for (const t of TABLES.filter((x) => x !== 'settings')) {
    const ids = data[t].map((r) => r.id);
    if (ids.some((id) => typeof id !== 'string' || !id)) errors.push(`Some ${t} rows have no ID.`);
    if (new Set(ids).size !== ids.length) errors.push(`Duplicate IDs in ${t}.`);
  }
  const accIds = new Set(data.accounts.map((a) => a.id));
  const catIds = new Set(data.categories.map((c) => c.id));
  const holdIds = new Set(data.holdings.map((h) => h.id));
  let broken = 0;
  for (const t of data.transactions) {
    if (!TX_TYPES.includes(t.type) || !accIds.has(t.accountId) || !Number.isSafeInteger(t.amount)) broken += 1;
    else if (t.toAccountId && !accIds.has(t.toAccountId)) broken += 1;
    else if (t.categoryId && !catIds.has(t.categoryId)) broken += 1;
    else if (t.holdingId && !holdIds.has(t.holdingId)) broken += 1;
  }
  if (broken) errors.push(`${broken} transactions refer to a missing account, category, or holding.`);

  const live = data.transactions.filter((t) => !t.deletedAt);
  const dates = live.map((t) => t.date).sort();
  return {
    ok: errors.length === 0,
    errors,
    summary: {
      exportedAt: doc.exportedAt,
      isTestData: !!doc.isTestData,
      accounts: data.accounts.length,
      transactions: live.length,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
    },
    data,
  };
}
