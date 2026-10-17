// Validasi sebelum menyimpan. errors memblokir penyimpanan; warnings meminta konfirmasi.
import { TX, TX_TYPES, CATEGORY_TYPES } from './model.js';
import { isIsoDate } from './dates.js';
import { isValidAmount, LARGE_AMOUNT_CONFIRM, formatRp } from './money.js';
import { balances } from './ledger.js';

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

/**
 * @param tx transaksi yang akan disimpan (baru atau hasil edit; edit memakai id yang sama)
 * @param data snapshot data saat ini
 * @param opts { today: 'YYYY-MM-DD', now: Date }
 */
export function validateTransaction(tx, data, { today, now = new Date() }) {
  const errors = [];
  const warnings = [];
  const err = (field, message) => errors.push({ field, message });
  const warn = (code, message) => warnings.push({ code, message });

  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const holdings = new Map(data.holdings.map((h) => [h.id, h]));

  if (!TX_TYPES.includes(tx.type)) err('type', 'Jenis transaksi tidak dikenal.');
  if (!isIsoDate(tx.date)) err('date', 'Tanggal wajib diisi dengan benar.');
  if (!isValidAmount(tx.amount)) err('amount', 'Jumlah harus bilangan bulat lebih dari Rp0.');
  if (tx.type === TX.ADJUSTMENT && tx.sign !== 1 && tx.sign !== -1) err('amount', 'Arah penyesuaian tidak valid.');
  if (tx.isRefund && tx.type !== TX.EXPENSE) err('isRefund', 'Refund hanya untuk pengeluaran.');

  const acc = accounts.get(tx.accountId);
  if (!tx.accountId || !acc) err('accountId', tx.type === TX.TRANSFER ? 'Pilih akun asal.' : 'Pilih akun.');
  else {
    if (isIsoDate(tx.date) && acc.openingDate && tx.date < acc.openingDate) {
      err('date', `Tanggal sebelum saldo awal akun ${acc.name} (${acc.openingDate}).`);
    }
    if (acc.archived) warn('archived', `Akun ${acc.name} sudah diarsipkan.`);
  }

  if (tx.type === TX.TRANSFER) {
    const to = accounts.get(tx.toAccountId);
    if (!tx.toAccountId || !to) err('toAccountId', 'Pilih akun tujuan.');
    else if (tx.toAccountId === tx.accountId) err('toAccountId', 'Akun asal dan tujuan tidak boleh sama.');
    else if (isIsoDate(tx.date) && to.openingDate && tx.date < to.openingDate) {
      err('date', `Tanggal sebelum saldo awal akun ${to.name} (${to.openingDate}).`);
    }
  }

  if (CATEGORY_TYPES.includes(tx.type)) {
    const cat = categories.get(tx.categoryId);
    if (!tx.categoryId || !cat) err('categoryId', 'Pilih kategori.');
    else if (cat.type !== tx.type || cat.parentId) err('categoryId', 'Kategori tidak sesuai dengan jenis transaksi.');
    if (tx.subcategoryId) {
      const sub = categories.get(tx.subcategoryId);
      if (!sub || sub.parentId !== tx.categoryId) err('subcategoryId', 'Subkategori tidak sesuai dengan kategori.');
    }
  }

  if (tx.type === TX.INVEST_BUY || tx.type === TX.INVEST_SELL) {
    if (!tx.holdingId || !holdings.has(tx.holdingId)) err('holdingId', 'Pilih posisi investasi.');
    for (const f of ['units', 'unitPrice', 'fee']) {
      if (tx[f] !== undefined && tx[f] !== null && !(Number.isFinite(tx[f]) && tx[f] >= 0)) err(f, 'Isi angka 0 atau lebih.');
    }
  }

  if (isIsoDate(tx.date) && tx.date > today) warn('future', 'Tanggal di masa depan.');
  if (isValidAmount(tx.amount) && tx.amount > LARGE_AMOUNT_CONFIRM) {
    warn('large', `Jumlah ${formatRp(tx.amount)} di atas Rp100 juta. Pastikan tidak salah ketik nol.`);
  }

  if (errors.length === 0) {
    // Peringatan saldo negatif untuk tunai dan e-wallet, dihitung dengan transaksi ini sudah tersimpan.
    const others = data.transactions.filter((t) => t.id !== tx.id);
    const after = balances({ ...data, transactions: [...others, tx] }, null);
    for (const id of [tx.accountId, tx.toAccountId].filter(Boolean)) {
      const a = accounts.get(id);
      if (a && (a.kind === 'tunai' || a.kind === 'ewallet') && after.get(id) < 0) {
        warn('negative', `Saldo ${a.name} akan menjadi ${formatRp(after.get(id))}.`);
      }
    }
    // Kemungkinan duplikat: transaksi serupa yang disimpan dalam 2 menit terakhir.
    const dup = data.transactions.find((t) =>
      !t.deletedAt && t.id !== tx.id && t.type === tx.type && t.amount === tx.amount &&
      t.date === tx.date && t.accountId === tx.accountId &&
      (t.categoryId ?? null) === (tx.categoryId ?? null) &&
      (t.holdingId ?? null) === (tx.holdingId ?? null) &&
      (t.toAccountId ?? null) === (tx.toAccountId ?? null) &&
      t.createdAt && now.getTime() - Date.parse(t.createdAt) <= DUPLICATE_WINDOW_MS);
    if (dup) warn('duplicate', 'Transaksi yang sama baru saja disimpan. Simpan lagi?');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Nama wajib dan unik (tanpa membedakan huruf besar) di antara saudara yang aktif. */
export function validateName(name, siblings, selfId = null) {
  const n = String(name ?? '').trim();
  if (!n) return 'Nama wajib diisi.';
  if (n.length > 60) return 'Nama maksimal 60 karakter.';
  const clash = siblings.find((s) => s.id !== selfId && s.active !== false && s.name.trim().toLowerCase() === n.toLowerCase());
  return clash ? 'Nama ini sudah dipakai.' : null;
}

export function validateAccount(acc, data) {
  const errors = [];
  const nameErr = validateName(acc.name, data.accounts.filter((a) => !a.archived), acc.id);
  if (nameErr) errors.push({ field: 'name', message: nameErr });
  if (!Number.isSafeInteger(acc.openingBalance)) errors.push({ field: 'openingBalance', message: 'Saldo awal harus bilangan bulat (boleh 0).' });
  if (!isIsoDate(acc.openingDate)) errors.push({ field: 'openingDate', message: 'Tanggal saldo awal wajib diisi.' });
  else {
    const earliest = data.transactions
      .filter((t) => !t.deletedAt && (t.accountId === acc.id || t.toAccountId === acc.id))
      .map((t) => t.date).sort()[0];
    if (earliest && earliest < acc.openingDate) {
      errors.push({ field: 'openingDate', message: `Sudah ada transaksi tanggal ${earliest}; tanggal saldo awal harus sama atau lebih awal.` });
    }
  }
  return { ok: errors.length === 0, errors };
}
