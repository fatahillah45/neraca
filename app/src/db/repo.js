// Operasi tulis. Setiap perubahan transaksi menandai minggu yang terdampak agar layar Ekspor
// bisa menunjukkan minggu yang "perlu ekspor ulang".
import { TX, newId } from '../core/model.js';
import { weekStart, addDays, todayWib } from '../core/dates.js';
import { buildSeed } from '../core/seed.js';
import { DATA_TABLES } from './db.js';

const nowIso = () => new Date().toISOString();
export const TRASH_DAYS = 30;

async function touchWeeks(db, dates) {
  const at = nowIso();
  for (const d of new Set(dates.filter(Boolean).map(weekStart))) {
    const w = await db.weeks.get(d);
    await db.weeks.put({ ...(w ?? { weekStart: d }), changedAt: at });
  }
}

export async function ensureSeeded(db) {
  if ((await db.categories.count()) > 0) return false;
  const seed = buildSeed();
  await db.transaction('rw', db.categories, db.instruments, db.settings, async () => {
    await db.categories.bulkAdd(seed.categories);
    await db.instruments.bulkAdd(seed.instruments);
    await db.settings.bulkPut(seed.settings);
  });
  return true;
}

export async function setSetting(db, key, value) {
  await db.settings.put({ key, value });
}

function feeCategoryId(snapshot) {
  const exp = snapshot.categories.filter((c) => c.type === TX.EXPENSE && !c.parentId);
  return (exp.find((c) => /admin/i.test(c.name)) ?? exp.find((c) => /lain/i.test(c.name)) ?? exp[0])?.id ?? null;
}

/**
 * Simpan transaksi baru atau hasil edit. Untuk transfer, biaya admin (fee > 0) disimpan sebagai
 * transaksi Pengeluaran terpisah yang terhubung (linkedTo), dan ikut berubah atau terhapus bersama transfernya.
 */
export async function saveTransaction(db, snapshot, input, { fee = 0 } = {}) {
  const at = nowIso();
  const existing = input.id ? await db.transactions.get(input.id) : null;
  const tx = {
    ...input,
    id: input.id ?? newId(),
    createdAt: existing?.createdAt ?? input.createdAt ?? at,
    updatedAt: at,
  };
  delete tx.deletedAt;
  const dates = [tx.date, existing?.date];
  await db.transaction('rw', db.transactions, db.weeks, async () => {
    await db.transactions.put(tx);
    const linked = (await db.transactions.toArray()).find((t) => t.linkedTo === tx.id && !t.deletedAt);
    if (tx.type !== TX.TRANSFER && linked) {
      await db.transactions.update(linked.id, { deletedAt: at, updatedAt: at });
      dates.push(linked.date);
    }
    if (tx.type === TX.TRANSFER) {
      if (fee > 0) {
        const feeTx = {
          ...(linked ?? { id: newId(), createdAt: at }),
          type: TX.EXPENSE,
          date: tx.date,
          amount: fee,
          accountId: tx.accountId,
          categoryId: linked?.categoryId ?? feeCategoryId(snapshot),
          note: 'Biaya admin transfer',
          linkedTo: tx.id,
          updatedAt: at,
        };
        delete feeTx.deletedAt;
        await db.transactions.put(feeTx);
        dates.push(linked?.date);
      } else if (linked) {
        await db.transactions.update(linked.id, { deletedAt: at, updatedAt: at });
        dates.push(linked.date);
      }
    }
    await touchWeeks(db, dates);
  });
  return tx;
}

export function linkedFee(snapshot, transferId) {
  return snapshot.transactions.find((t) => t.linkedTo === transferId && !t.deletedAt) ?? null;
}

/** Hapus lunak: masuk Sampah selama 30 hari dan bisa diurungkan. */
export async function deleteTransaction(db, id) {
  const at = nowIso();
  await db.transaction('rw', db.transactions, db.weeks, async () => {
    const t = await db.transactions.get(id);
    if (!t) return;
    const all = await db.transactions.toArray();
    const ids = [id, ...all.filter((x) => x.linkedTo === id && !x.deletedAt).map((x) => x.id)];
    for (const x of ids) await db.transactions.update(x, { deletedAt: at, updatedAt: at });
    await touchWeeks(db, [t.date]);
  });
}

export async function restoreTransaction(db, id) {
  const at = nowIso();
  await db.transaction('rw', db.transactions, db.weeks, async () => {
    const t = await db.transactions.get(id);
    if (!t) return;
    const all = await db.transactions.toArray();
    const ids = [id, ...all.filter((x) => x.linkedTo === id && x.deletedAt === t.deletedAt).map((x) => x.id)];
    for (const x of ids) {
      const row = await db.transactions.get(x);
      delete row.deletedAt;
      row.updatedAt = at;
      await db.transactions.put(row);
    }
    await touchWeeks(db, [t.date]);
  });
}

/** Hapus permanen isi Sampah yang lebih tua dari 30 hari. */
export async function purgeTrash(db, now = new Date()) {
  const limit = new Date(now.getTime() - TRASH_DAYS * 86400000).toISOString();
  const old = (await db.transactions.toArray()).filter((t) => t.deletedAt && t.deletedAt < limit);
  if (old.length) await db.transactions.bulkDelete(old.map((t) => t.id));
  return old.length;
}

export async function saveAccount(db, acc) {
  const existing = acc.id ? await db.accounts.get(acc.id) : null;
  const row = { archived: false, order: (await db.accounts.count()), ...acc, id: acc.id ?? newId() };
  await db.transaction('rw', db.accounts, db.weeks, db.transactions, async () => {
    await db.accounts.put(row);
    // Saldo awal memengaruhi tabel Saldo akun di setiap workbook sejak tanggal itu.
    if (!existing || existing.openingBalance !== row.openingBalance || existing.openingDate !== row.openingDate) {
      const from = [row.openingDate, existing?.openingDate].filter(Boolean).sort()[0];
      const to = todayWib();
      const weeks = [];
      for (let d = weekStart(from); d <= to; d = addDays(d, 7)) weeks.push(d);
      await touchWeeks(db, weeks);
    }
  });
  return row;
}

export async function saveCategory(db, cat) {
  const row = { active: true, icon: '', ...cat, id: cat.id ?? newId() };
  if (row.order === undefined) {
    const siblings = await db.categories.where('type').equals(row.type).filter((c) => (c.parentId ?? null) === (row.parentId ?? null)).count();
    row.order = siblings;
  }
  await db.categories.put(row);
  return row;
}

export async function reorder(db, table, idsInOrder) {
  await db.transaction('rw', db[table], async () => {
    for (let i = 0; i < idsInOrder.length; i += 1) await db[table].update(idsInOrder[i], { order: i });
  });
}

export async function saveInstrument(db, inst) {
  const row = { active: true, riskScore: 3, liquidity: 'bulan', note: '', order: await db.instruments.count(), ...inst, id: inst.id ?? newId() };
  await db.instruments.put(row);
  return row;
}

export async function saveHolding(db, h) {
  const row = { active: true, platform: '', openingCost: 0, openingUnits: 0, ...h, id: h.id ?? newId() };
  await db.holdings.put(row);
  return row;
}

export async function saveValuation(db, v) {
  const row = { ...v, id: v.id ?? newId(), createdAt: v.createdAt ?? nowIso() };
  await db.valuations.put(row);
  return row;
}

export async function markWeekExported(db, monday) {
  const w = await db.weeks.get(monday);
  await db.weeks.put({ ...(w ?? { weekStart: monday }), exportedAt: nowIso() });
}

/** Ganti seluruh data dengan isi file cadangan (sudah diperiksa parseBackup). */
export async function replaceAllData(db, data) {
  await db.transaction('rw', [...DATA_TABLES.map((t) => db[t]), db.weeks], async () => {
    for (const t of DATA_TABLES) await db[t].clear();
    await db.weeks.clear();
    for (const t of DATA_TABLES) if (data[t]?.length) await db[t].bulkAdd(data[t]);
  });
}

export async function wipeDatabase(db) {
  await db.delete();
}
