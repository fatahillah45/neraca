// Membuat workbook contoh dari DATA UJI (tests/fixtures.mjs) dan file harapan untuk diverifikasi Python.
// Pemakaian: node tools/make-sample-workbooks.mjs <folder-keluaran>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sampleWeek } from '../tests/fixtures.mjs';
import { buildWeeklyWorkbook, buildAllTransactionsWorkbook, DAY_COLUMNS, ALL_COLUMNS } from '../app/src/export/workbook.js';
import { flows, balances, costRemovedMap } from '../app/src/core/ledger.js';
import { weekDates, daySheetName } from '../app/src/core/dates.js';

import { loadExcelJS } from './load-exceljs.mjs';

const ExcelJS = loadExcelJS();

const out = process.argv[2];
if (!out) throw new Error('Folder keluaran wajib diisi.');
mkdirSync(out, { recursive: true });

const data = sampleWeek();
const monday = '2026-10-19';
const now = new Date('2026-10-26T01:05:00Z');

const weekly = buildWeeklyWorkbook(ExcelJS, data, monday, { now, isTestData: true });
writeFileSync(join(out, weekly.fileName), Buffer.from(await weekly.workbook.xlsx.writeBuffer()));

const all = buildAllTransactionsWorkbook(ExcelJS, data, { now, isTestData: true, today: '2026-10-25' });
writeFileSync(join(out, all.fileName), Buffer.from(await all.workbook.xlsx.writeBuffer()));

const removed = costRemovedMap(data);
const days = weekDates(monday);
const expected = {
  weeklyFile: weekly.fileName,
  allFile: all.fileName,
  sheets: ['Summary', ...days.map(daySheetName)],
  dayColumns: DAY_COLUMNS,
  allColumns: ALL_COLUMNS,
  days: days.map((d) => {
    const f = flows(data, d, d, removed);
    return {
      sheet: daySheetName(d),
      count: f.count,
      netCash: f.income - f.expense - f.giving - f.investBuy + f.investSellProceeds + f.adjustments,
      income: f.income, expense: f.expense, giving: f.giving, investBuy: f.investBuy,
    };
  }),
  week: (() => { const f = flows(data, days[0], days[6], removed); return { income: f.income, expense: f.expense, giving: f.giving, investBuy: f.investBuy, surplus: f.surplus, count: f.count }; })(),
  balancesEnd: Object.fromEntries([...balances(data, days[6])].map(([id, v]) => [data.accounts.find((a) => a.id === id).name, v])),
  allCount: data.transactions.filter((t) => !t.deletedAt).length,
};
writeFileSync(join(out, 'expected.json'), JSON.stringify(expected, null, 2));
console.log(`OK: ${weekly.fileName}, ${all.fileName}, expected.json -> ${out}`);
