import test from 'node:test';
import assert from 'node:assert/strict';
import { englishLabelUpdates } from '../app/src/core/translate.js';

const oldGroups = [
  { key: 'expense', label: 'Pengeluaran', hint: 'Expense' },
  { key: 'income', label: 'Pemasukan', hint: 'Income' },
  { key: 'giving', label: 'Sedekah', hint: 'Human-being / Giving' },
  { key: 'invest', label: 'Investasi', hint: 'Invested' },
  { key: 'transfer', label: 'Transfer', hint: 'Antar akun sendiri' },
  { key: 'adjustment', label: 'Penyesuaian', hint: 'Cocokkan saldo' },
];

function snap(overrides = {}) {
  return {
    categories: [
      { id: 'c1', type: 'expense', name: 'Makanan & Minuman' },
      { id: 'c2', type: 'expense', name: 'Kopi favorit saya' },
      { id: 'c3', type: 'giving', name: 'Ibadah & Keagamaan' },
    ],
    instruments: [{ id: 'i1', name: 'Emas', note: 'catatan lama' }, { id: 'i2', name: 'Kripto' }],
    accounts: [{ id: 'a1', name: 'Rekening Gaji (UJI)' }, { id: 'a2', name: 'BCA' }],
    holdings: [{ id: 'h1', name: 'Emas Antam (UJI)' }],
    settings: [{ key: 'typeGroups', value: oldGroups }],
    ...overrides,
  };
}

test('untouched Indonesian defaults become English; user-made names are kept', () => {
  const u = englishLabelUpdates(snap());
  assert.deepEqual(u.categories, [{ id: 'c1', name: 'Food & Beverages' }, { id: 'c3', name: 'Worship & Religious' }]);
  assert.equal(u.instruments.length, 1);
  assert.equal(u.instruments[0].name, 'Gold');
  assert.deepEqual(u.accounts, [{ id: 'a1', name: 'Rekening Gaji (TEST)' }]);
  assert.deepEqual(u.holdings, [{ id: 'h1', name: 'Emas Antam (TEST)' }]);
});

test('Sedekah becomes Human being; a label the user renamed stays', () => {
  const groups = oldGroups.map((g) => (g.key === 'income' ? { ...g, label: 'Penghasilan' } : g));
  const u = englishLabelUpdates(snap({ settings: [{ key: 'typeGroups', value: groups }] }));
  const byKey = Object.fromEntries(u.typeGroups.map((g) => [g.key, g.label]));
  assert.equal(byKey.giving, 'Human being');
  assert.equal(byKey.expense, 'Expense');
  assert.equal(byKey.invest, 'Invested');
  assert.equal(byKey.income, 'Penghasilan');
});
