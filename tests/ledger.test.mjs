import test from 'node:test';
import assert from 'node:assert/strict';
import { TX } from '../app/src/core/model.js';
import {
  balances, totalCash, flows, reconcile, avgDailyExpense, holdingHistory, holdingStates,
  portfolioTotals, categoryBreakdown, monthlySeries, portfolioRisk, netCashEffect, periodRange,
} from '../app/src/core/ledger.js';
import { addDays } from '../app/src/core/dates.js';
import { baseData, sampleWeek, tx } from './fixtures.mjs';

test('saldo per akun setelah satu minggu contoh', () => {
  const d = sampleWeek();
  const b = balances(d, '2026-10-25');
  assert.equal(b.get('acc-gaji'), 8_497_500);
  assert.equal(b.get('acc-tunai'), 255_000);
  assert.equal(b.get('acc-ew'), 400_000);
  assert.equal(totalCash(d, '2026-10-25'), 9_152_500);
  assert.equal(totalCash(d, '2026-10-18'), 5_300_000);
});

test('arus mingguan: transfer tidak dihitung, refund mengurangi pengeluaran, investasi bukan pengeluaran', () => {
  const f = flows(sampleWeek(), '2026-10-19', '2026-10-25');
  assert.equal(f.income, 10_000_000);
  assert.equal(f.expenseGross, 167_500);
  assert.equal(f.refunds, 20_000);
  assert.equal(f.expense, 147_500);
  assert.equal(f.giving, 1_000_000);
  assert.equal(f.investBuy, 5_000_000);
  assert.equal(f.netInvest, 5_000_000);
  assert.equal(f.surplus, 8_852_500);
  assert.equal(f.transferVolume, 500_000);
  assert.equal(f.count, 9);
  assert.equal(f.savingRate, 8_852_500 / 10_000_000);
  assert.equal(f.investRate, 0.5);
  assert.equal(f.givingRate, 0.1);
});

test('transfer selalu berefek nol pada total kas', () => {
  const t = { type: TX.TRANSFER, amount: 750_000, accountId: 'a', toAccountId: 'b' };
  assert.equal(netCashEffect(t), 0);
});

test('rekonsiliasi minggu contoh cocok', () => {
  const r = reconcile(sampleWeek(), '2026-10-19', '2026-10-25');
  assert.equal(r.actual, 3_852_500);
  assert.equal(r.ok, true);
});

test('saldo awal akun baru masuk rekonsiliasi sebagai saldo awal, bukan pemasukan', () => {
  const d = sampleWeek();
  d.accounts.push({ id: 'acc-baru', name: 'Tabungan baru (UJI)', kind: 'rekening', openingBalance: 1_000_000, openingDate: '2026-10-21' });
  const r = reconcile(d, '2026-10-19', '2026-10-25');
  assert.equal(r.flows.openings, 1_000_000);
  assert.equal(r.flows.income, 10_000_000);
  assert.equal(r.ok, true);
  assert.equal(balances(d, '2026-10-20').get('acc-baru'), 0);
});

test('rata-rata pengeluaran harian dibagi hari kalender yang sudah berjalan', () => {
  const d = sampleWeek();
  const f = flows(d, '2026-10-19', '2026-10-25');
  assert.equal(avgDailyExpense(f, '2026-10-19', '2026-10-25', '2026-10-25'), 147_500 / 7);
  const fm = flows(d, '2026-10-01', '2026-10-31');
  assert.equal(avgDailyExpense(fm, '2026-10-01', '2026-10-31', '2026-10-25'), 147_500 / 25);
  assert.equal(avgDailyExpense(fm, '2026-11-01', '2026-11-30', '2026-10-25'), null);
});

test('Agustus dibagi 31 hari; investasi tidak dihitung sebagai pengeluaran dan tidak menambah kas', () => {
  const d = baseData();
  d.accounts[0].openingDate = '2026-08-01';
  d.accounts[0].openingBalance = 0;
  d.transactions.push(
    tx({ type: TX.INCOME, date: '2026-08-25', amount: 10_000_000, accountId: 'acc-gaji', categoryId: 'cat-gaji' }),
    tx({ type: TX.EXPENSE, date: '2026-08-10', amount: 6_200_000, accountId: 'acc-gaji', categoryId: 'cat-makan' }),
    tx({ type: TX.INVEST_BUY, date: '2026-08-26', amount: 3_000_000, accountId: 'acc-gaji', holdingId: 'h-emas' }),
  );
  const f = flows(d, '2026-08-01', '2026-08-31');
  assert.equal(avgDailyExpense(f, '2026-08-01', '2026-08-31', '2026-10-17'), 200_000);
  assert.equal(f.expense, 6_200_000);
  assert.equal(f.savingRate, 0.38);
  const r = reconcile(d, '2026-08-01', '2026-08-31');
  assert.equal(r.actual, 800_000);
  assert.equal(r.ok, true);
});

test('pencairan: proporsional unit, pemulihan modal, dan tutup posisi', () => {
  const d = baseData();
  const s1 = tx({ type: TX.INVEST_SELL, date: '2026-10-05', amount: 600_000, accountId: 'acc-gaji', holdingId: 'h-saham', units: 100 });
  const s2 = tx({ type: TX.INVEST_SELL, date: '2026-10-06', amount: 1_000_000, accountId: 'acc-gaji', holdingId: 'h-saham' });
  const s3 = tx({ type: TX.INVEST_SELL, date: '2026-10-07', amount: 700_000, accountId: 'acc-gaji', holdingId: 'h-saham', closePosition: true });
  d.transactions.push(s1, s2, s3);
  const h = holdingHistory(d.holdings.find((x) => x.id === 'h-saham'), d.transactions);
  assert.equal(h.costRemovedById.get(s1.id), 500_000);
  assert.equal(h.costRemovedById.get(s2.id), 1_000_000);
  assert.equal(h.costRemovedById.get(s3.id), 500_000);
  assert.equal(h.cost, 0);
  const f = flows(d, '2026-10-01', '2026-10-31');
  assert.equal(f.costRemoved, 2_000_000);
  assert.equal(f.realizedGain, 300_000);
  assert.equal(f.netInvest, -2_000_000);
  assert.equal(reconcile(d, '2026-10-01', '2026-10-31').ok, true);
});

test('koreksi pembelian lama mengubah modal yang ditarik saat pencairan berikutnya', () => {
  const d = baseData();
  const buy = tx({ type: TX.INVEST_BUY, date: '2026-10-02', amount: 1_000_000, accountId: 'acc-gaji', holdingId: 'h-emas', units: 2 });
  const sell = tx({ type: TX.INVEST_SELL, date: '2026-10-10', amount: 600_000, accountId: 'acc-gaji', holdingId: 'h-emas', units: 1 });
  d.transactions.push(buy, sell);
  const h = d.holdings.find((x) => x.id === 'h-emas');
  assert.equal(holdingHistory(h, d.transactions).costRemovedById.get(sell.id), 500_000);
  buy.amount = 1_200_000;
  assert.equal(holdingHistory(h, d.transactions).costRemovedById.get(sell.id), 600_000);
});

test('nilai portofolio: dinilai, perkiraan, belum dinilai, dan posisi tertutup', () => {
  const d = sampleWeek();
  d.valuations.push({ id: 'v1', holdingId: 'h-emas', date: '2026-10-25', value: 2_100_000 });
  let st = holdingStates(d, '2026-10-25');
  const emas = () => st.find((s) => s.holding.id === 'h-emas');
  const depo = () => st.find((s) => s.holding.id === 'h-depo');
  assert.equal(emas().value, 2_100_000);
  assert.equal(emas().status, 'dinilai');
  assert.equal(emas().unrealized, 100_000);
  assert.equal(depo().value, 3_000_000);
  assert.equal(depo().status, 'belum_dinilai');

  d.transactions.push(tx({ type: TX.INVEST_BUY, date: '2026-10-27', amount: 1_000_000, accountId: 'acc-gaji', holdingId: 'h-emas' }));
  st = holdingStates(d, '2026-10-27');
  assert.equal(emas().value, 3_100_000);
  assert.equal(emas().status, 'perkiraan');
  assert.equal(emas().cost, 3_000_000);

  d.transactions.push(tx({ type: TX.INVEST_SELL, date: '2026-10-28', amount: 3_200_000, accountId: 'acc-gaji', holdingId: 'h-emas', closePosition: true }));
  st = holdingStates(d, '2026-10-28');
  assert.equal(emas().cost, 0);
  assert.equal(emas().value, 0);
  assert.equal(emas().isOpen, false);

  const totals = portfolioTotals(holdingStates(d, '2026-10-25'));
  assert.equal(totals.value, 2_100_000 + 3_000_000 + 2_000_000);
  assert.equal(totals.unvalued, 2);
});

test('rincian pengeluaran per kategori dan subkategori, refund mengurangi kategorinya', () => {
  const d = sampleWeek();
  const cats = categoryBreakdown(d, TX.EXPENSE, '2026-10-19', '2026-10-25');
  assert.deepEqual(cats.map((c) => [c.name, c.amount]), [
    ['Transportasi', 100_000],
    ['Makanan & Minuman', 45_000],
    ['Biaya Admin Bank', 2_500],
  ]);
  const subs = categoryBreakdown(d, TX.EXPENSE, '2026-10-19', '2026-10-25', 'cat-makan');
  assert.deepEqual(subs.map((c) => [c.name, c.amount]), [['Makan di luar', 45_000]]);
});

test('seri 6 bulan berurutan dan berakhir di bulan yang diminta', () => {
  const s = monthlySeries(sampleWeek(), 2026, 10, 6);
  assert.deepEqual(s.map((x) => `${x.y}-${x.m}`), ['2026-5', '2026-6', '2026-7', '2026-8', '2026-9', '2026-10']);
  assert.equal(s.at(-1).income, 10_000_000);
});

test('periode Semua dimulai dari saldo awal paling awal', () => {
  const r = periodRange('all', sampleWeek(), '2026-10-25');
  assert.deepEqual(r, { start: '2026-10-01', end: '2026-10-25' });
});

test('risiko: skor tertimbang, tangga likuiditas, dan kontributor terbesar', () => {
  const d = sampleWeek();
  d.valuations.push({ id: 'v1', holdingId: 'h-emas', date: '2026-10-25', value: 2_100_000 });
  const r = portfolioRisk(d, '2026-10-25');
  assert.equal(r.total, 7_100_000);
  assert.equal(r.weightedScore.toFixed(4), (19.3 / 7.1).toFixed(4));
  assert.equal(r.liquidity.find((x) => x.key === 'cepat').value, 4_100_000);
  assert.equal(r.liquidity.find((x) => x.key === 'panjang').value, 3_000_000);
  assert.equal(r.contributors[0].state.holding.id, 'h-saham');
});

// Uji properti: transaksi acak (generator deterministik) harus selalu lolos rekonsiliasi.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test('rekonsiliasi lolos untuk 2.000 transaksi acak di banyak periode', () => {
  const d = baseData();
  const r = rng(42);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const accs = d.accounts.map((a) => a.id);
  const types = [TX.INCOME, TX.EXPENSE, TX.EXPENSE, TX.EXPENSE, TX.GIVING, TX.INVEST_BUY, TX.INVEST_SELL, TX.TRANSFER, TX.ADJUSTMENT];
  for (let i = 0; i < 2000; i += 1) {
    const type = pick(types);
    const date = addDays('2026-10-01', Math.floor(r() * 120));
    const amount = 1 + Math.floor(r() * 5_000_000);
    const accountId = pick(accs);
    const t = { type, date, amount, accountId };
    if (type === TX.INCOME) t.categoryId = 'cat-gaji';
    if (type === TX.EXPENSE) { t.categoryId = 'cat-makan'; t.isRefund = r() < 0.1; }
    if (type === TX.GIVING) t.categoryId = 'cat-ibadah';
    if (type === TX.INVEST_BUY || type === TX.INVEST_SELL) {
      t.holdingId = pick(['h-emas', 'h-depo', 'h-saham']);
      if (r() < 0.5) t.units = 1 + Math.floor(r() * 50);
      if (type === TX.INVEST_SELL && r() < 0.1) t.closePosition = true;
    }
    if (type === TX.TRANSFER) t.toAccountId = pick(accs.filter((a) => a !== accountId));
    if (type === TX.ADJUSTMENT) t.sign = r() < 0.5 ? -1 : 1;
    if (r() < 0.05) t.deletedAt = '2026-12-01T00:00:00.000Z';
    d.transactions.push(tx(t));
  }
  for (let k = 0; k < 40; k += 1) {
    const a = addDays('2026-09-25', Math.floor(r() * 130));
    const b = addDays(a, Math.floor(r() * 60));
    const res = reconcile(d, a, b);
    assert.equal(res.ok, true, `periode ${a}..${b}: ${res.actual} != ${res.expected}`);
  }
  for (const s of holdingStates(d)) assert.ok(s.cost >= 0, 'modal tidak boleh negatif');
});
