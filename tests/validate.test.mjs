import test from 'node:test';
import assert from 'node:assert/strict';
import { TX } from '../app/src/core/model.js';
import { validateTransaction, validateAccount, validateName } from '../app/src/core/validate.js';
import { baseData, sampleWeek } from './fixtures.mjs';

const opts = { today: '2026-10-25', now: new Date('2026-10-25T05:00:00Z') };
const codes = (r) => r.warnings.map((w) => w.code);
const fields = (r) => r.errors.map((e) => e.field);

test('pengeluaran lengkap valid', () => {
  const r = validateTransaction({ id: 'n1', type: TX.EXPENSE, date: '2026-10-25', amount: 50_000, accountId: 'acc-gaji', categoryId: 'cat-makan', subcategoryId: 'sub-luar' }, baseData(), opts);
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, []);
});

test('jumlah nol, pecahan, dan kategori kosong ditolak', () => {
  const d = baseData();
  assert.deepEqual(fields(validateTransaction({ id: 'n', type: TX.EXPENSE, date: '2026-10-25', amount: 0, accountId: 'acc-gaji', categoryId: 'cat-makan' }, d, opts)), ['amount']);
  assert.deepEqual(fields(validateTransaction({ id: 'n', type: TX.EXPENSE, date: '2026-10-25', amount: 10.5, accountId: 'acc-gaji', categoryId: 'cat-makan' }, d, opts)), ['amount']);
  assert.deepEqual(fields(validateTransaction({ id: 'n', type: TX.EXPENSE, date: '2026-10-25', amount: 1000, accountId: 'acc-gaji' }, d, opts)), ['categoryId']);
});

test('kategori dan subkategori harus cocok dengan jenis', () => {
  const d = baseData();
  assert.deepEqual(fields(validateTransaction({ id: 'n', type: TX.INCOME, date: '2026-10-25', amount: 1000, accountId: 'acc-gaji', categoryId: 'cat-makan' }, d, opts)), ['categoryId']);
  assert.deepEqual(fields(validateTransaction({ id: 'n', type: TX.EXPENSE, date: '2026-10-25', amount: 1000, accountId: 'acc-gaji', categoryId: 'cat-transport', subcategoryId: 'sub-luar' }, d, opts)), ['subcategoryId']);
});

test('transfer ke akun yang sama ditolak', () => {
  const r = validateTransaction({ id: 'n', type: TX.TRANSFER, date: '2026-10-25', amount: 1000, accountId: 'acc-gaji', toAccountId: 'acc-gaji' }, baseData(), opts);
  assert.deepEqual(fields(r), ['toAccountId']);
});

test('tanggal sebelum saldo awal akun ditolak', () => {
  const r = validateTransaction({ id: 'n', type: TX.EXPENSE, date: '2026-09-30', amount: 1000, accountId: 'acc-gaji', categoryId: 'cat-makan' }, baseData(), opts);
  assert.deepEqual(fields(r), ['date']);
});

test('investasi tanpa posisi ditolak; refund di luar pengeluaran ditolak', () => {
  const d = baseData();
  assert.deepEqual(fields(validateTransaction({ id: 'n', type: TX.INVEST_BUY, date: '2026-10-25', amount: 1000, accountId: 'acc-gaji' }, d, opts)), ['holdingId']);
  assert.deepEqual(fields(validateTransaction({ id: 'n', type: TX.INCOME, date: '2026-10-25', amount: 1000, accountId: 'acc-gaji', categoryId: 'cat-gaji', isRefund: true }, d, opts)), ['isRefund']);
});

test('peringatan: masa depan, di atas Rp100 juta, dan saldo tunai negatif', () => {
  const d = baseData();
  assert.deepEqual(codes(validateTransaction({ id: 'n', type: TX.INCOME, date: '2026-10-26', amount: 150_000_000, accountId: 'acc-gaji', categoryId: 'cat-gaji' }, d, opts)), ['future', 'large']);
  assert.deepEqual(codes(validateTransaction({ id: 'n', type: TX.EXPENSE, date: '2026-10-25', amount: 400_000, accountId: 'acc-tunai', categoryId: 'cat-makan' }, d, opts)), ['negative']);
});

test('peringatan duplikat dalam 2 menit, tetapi tidak saat mengedit transaksi yang sama', () => {
  const d = sampleWeek();
  const existing = { id: 'dup-1', type: TX.EXPENSE, date: '2026-10-25', amount: 30_000, accountId: 'acc-gaji', categoryId: 'cat-makan', createdAt: '2026-10-25T04:59:00.000Z' };
  d.transactions.push(existing);
  const again = { ...existing, id: 'baru' };
  assert.deepEqual(codes(validateTransaction(again, d, opts)), ['duplicate']);
  assert.deepEqual(codes(validateTransaction({ ...existing }, d, opts)), []);
  const later = { now: new Date('2026-10-25T05:10:00Z'), today: '2026-10-25' };
  assert.deepEqual(codes(validateTransaction(again, d, later)), []);
});

test('akun: saldo awal tidak boleh sesudah transaksi pertamanya; nama unik', () => {
  const d = sampleWeek();
  const acc = { ...d.accounts[0], openingDate: '2026-10-20' };
  assert.equal(validateAccount(acc, d).ok, false);
  assert.equal(validateName('rekening gaji (uji)', d.accounts, 'lain'), 'This name is already used.');
  assert.equal(validateName('  ', d.accounts), 'Name is required.');
});
