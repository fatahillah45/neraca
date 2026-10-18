// Contract tests for the "All transactions" export, which the monthly report parser reads.
// Existing sheet and column names must never change; new ones are only appended.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExcelJS } from '../tools/load-exceljs.mjs';
import { buildAllTransactionsWorkbook } from '../app/src/export/workbook.js';
import { lastMonthlyPeriod } from '../app/src/core/dates.js';
import { TX } from '../app/src/core/model.js';
import { sampleWeek, tx } from './fixtures.mjs';

const ExcelJS = loadExcelJS();
const now = new Date('2026-10-26T01:05:00Z');

const V1_TRANSACTION_COLUMNS = [
  'Date', 'Week', 'Month', 'Type', 'Account', 'To account', 'Category', 'Subcategory', 'Instrument', 'Holding',
  'Units', 'Description', 'Amount (Rp)', 'Cash effect (Rp)', 'Cost removed (Rp)', 'ID', 'Created', 'Updated',
];
const V1_PORTFOLIO_COLUMNS = ['Holding', 'Instrument', 'Platform', 'Cost (Rp)', 'Value (Rp)', 'Value status', 'Last valuation'];
const V1_ACCOUNT_COLUMNS = ['Account', 'Account type', 'Institution', 'Opening balance (Rp)', 'Opening date', 'Current balance (Rp)', 'Status'];

function data() {
  const d = sampleWeek();
  d.valuations.push(
    { id: 'v2', holdingId: 'h-emas', date: '2026-10-25', value: 2_100_000 },
    { id: 'v1', holdingId: 'h-emas', date: '2026-10-23', value: 2_050_000 },
    { id: 'v3', holdingId: 'h-saham', date: '2026-10-24', value: 2_300_000 },
  );
  return d;
}

async function roundTrip(opts) {
  const { workbook, fileName } = buildAllTransactionsWorkbook(ExcelJS, data(), { now, today: '2026-10-25', ...opts });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await workbook.xlsx.writeBuffer());
  const rows = (name) => {
    const ws = wb.getWorksheet(name);
    const out = [];
    ws.eachRow((row) => out.push(row.values.slice(1)));
    return out;
  };
  const info = Object.fromEntries(rows('Info').filter((r) => r.length >= 2).map((r) => [r[0], r[1]]));
  return { wb, fileName, rows, info };
}

test('sheets: the v0.2 sheets keep their order and Valuations is appended', async () => {
  const { wb } = await roundTrip({});
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Transactions', 'Accounts', 'Portfolio', 'Info', 'Valuations']);
});

test('existing columns are unchanged; Portfolio gains risk score and liquidity at the end', async () => {
  const { rows } = await roundTrip({});
  assert.deepEqual(rows('Transactions')[0], V1_TRANSACTION_COLUMNS);
  assert.deepEqual(rows('Accounts')[0], V1_ACCOUNT_COLUMNS);
  assert.deepEqual(rows('Portfolio')[0], [...V1_PORTFOLIO_COLUMNS, 'Risk score (1-5)', 'Liquidity']);
  const emas = rows('Portfolio').find((r) => r[0] === 'Emas (UJI)');
  assert.equal(emas[7], 3);
  assert.equal(emas[8], '≤ 2 business days');
  const depo = rows('Portfolio').find((r) => r[0] === 'Deposito (UJI)');
  assert.equal(depo[7], 1);
  assert.equal(depo[8], '> 1 month');
});

test('Valuations lists every valuation record, sorted by holding then date', async () => {
  const { rows } = await roundTrip({});
  const v = rows('Valuations');
  assert.deepEqual(v[0], ['Holding', 'Instrument', 'Date', 'Value (Rp)']);
  assert.deepEqual(v.slice(1).map((r) => [r[0], r[3]]), [
    ['Emas (UJI)', 2_050_000],
    ['Emas (UJI)', 2_100_000],
    ['Saham (UJI)', 2_300_000],
  ]);
  assert.equal(v[1][1], 'Emas');
});

test('Info has an explicit Test data row and records the period', async () => {
  const test1 = await roundTrip({ isTestData: true });
  assert.equal(test1.info['Test data'], 'Yes');
  assert.equal(test1.info['Period from'], 'Full history');
  const real = await roundTrip({ isTestData: false });
  assert.equal(real.info['Test data'], 'No');
  assert.equal(real.info.Transactions, 9);
});

test('a date range limits only the Transactions sheet', async () => {
  const full = await roundTrip({});
  const part = await roundTrip({ from: '2026-10-20', to: '2026-10-22' });
  assert.equal(part.rows('Transactions').length - 1, 4);
  assert.equal(part.info.Transactions, 4);
  assert.equal(part.info['Period from'], '2026-10-20');
  assert.equal(part.info['Period to'], '2026-10-22');
  assert.deepEqual(part.rows('Accounts'), full.rows('Accounts'));
  assert.deepEqual(part.rows('Portfolio'), full.rows('Portfolio'));
  assert.deepEqual(part.rows('Valuations'), full.rows('Valuations'));
  assert.equal(part.fileName, 'neraca-all-transactions-2026-10-20_to_2026-10-22.xlsx');
  assert.equal(full.fileName, 'neraca-all-transactions-2026-10-25.xlsx');
});

test('an invalid range is rejected', () => {
  assert.throws(() => buildAllTransactionsWorkbook(ExcelJS, data(), { from: '2026-10-22', to: '2026-10-20' }), /Invalid date range/);
  assert.throws(() => buildAllTransactionsWorkbook(ExcelJS, data(), { from: '2026-10-22' }), /Invalid date range/);
});

test('an empty valuation history still produces a valid Valuations sheet', async () => {
  const d = sampleWeek();
  d.transactions.push(tx({ type: TX.INVEST_BUY, date: '2026-10-25', amount: 1000, accountId: 'acc-gaji', holdingId: 'h-emas' }));
  const { workbook } = buildAllTransactionsWorkbook(ExcelJS, d, { now, today: '2026-10-25' });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.ok(wb.getWorksheet('Valuations'));
});

test('report period runs from the 25th to the 24th', () => {
  assert.deepEqual(lastMonthlyPeriod('2026-11-25'), { start: '2026-10-25', end: '2026-11-24' });
  assert.deepEqual(lastMonthlyPeriod('2026-11-24'), { start: '2026-09-25', end: '2026-10-24' });
  assert.deepEqual(lastMonthlyPeriod('2027-01-25'), { start: '2026-12-25', end: '2027-01-24' });
  assert.deepEqual(lastMonthlyPeriod('2027-01-10'), { start: '2026-11-25', end: '2026-12-24' });
});
