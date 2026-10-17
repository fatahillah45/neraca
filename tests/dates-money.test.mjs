import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isIsoDate, todayWib, weekStart, weekdayIndex, weekFileBase, weekFolderHint, daySheetName,
  formatLongDate, countDaysInclusive, addDays, monthRange,
} from '../app/src/core/dates.js';
import { formatRp, formatCompact, formatPercent, parseAmountInput, isValidAmount } from '../app/src/core/money.js';

test('19 Oktober 2026 adalah Senin dan minggunya 19okt26-25okt26', () => {
  assert.equal(weekdayIndex('2026-10-19'), 0);
  assert.equal(weekFileBase('2026-10-19'), '19okt26-25okt26');
  assert.equal(weekFileBase('2026-10-26'), '26okt26-01nov26');
});

test('minggu lintas tahun dan bulan Agustus memakai singkatan agu', () => {
  assert.equal(weekFileBase('2026-12-28'), '28des26-03jan27');
  assert.equal(weekFileBase('2026-08-03'), '03agu26-09agu26');
  assert.equal(weekFolderHint('2026-10-26'), '2026/10');
  assert.throws(() => weekFileBase('2026-10-20'), /Not a Monday/);
});

test('weekStart: Minggu ikut minggu yang dimulai Senin sebelumnya', () => {
  assert.equal(weekStart('2026-10-25'), '2026-10-19');
  assert.equal(weekStart('2026-10-19'), '2026-10-19');
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
});

test('sheet names and day titles in English', () => {
  assert.equal(daySheetName('2026-10-19'), 'Mon 19 Oct');
  assert.equal(daySheetName('2026-11-01'), 'Sun 01 Nov');
  assert.equal(formatLongDate('2026-10-25'), 'Sunday, 25 October 2026');
});

test('hari ini menurut WIB berganti pada pukul 00.00 WIB (17.00 UTC)', () => {
  assert.equal(todayWib(new Date('2026-10-17T16:59:59Z')), '2026-10-17');
  assert.equal(todayWib(new Date('2026-10-17T17:00:00Z')), '2026-10-18');
});

test('validasi tanggal termasuk tahun kabisat', () => {
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate('2026-10-1'), false);
});

test('jumlah hari kalender inklusif', () => {
  assert.equal(countDaysInclusive('2026-08-01', '2026-08-31'), 31);
  assert.equal(countDaysInclusive('2026-10-19', '2026-10-19'), 1);
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.deepEqual(monthRange(2028, 2), { start: '2028-02-01', end: '2028-02-29' });
});

test('Rupiah format and compact amounts like the reference app', () => {
  assert.equal(formatRp(1234567), 'Rp1.234.567');
  assert.equal(formatRp(-5000), '-Rp5.000');
  assert.equal(formatRp(0), 'Rp0');
  assert.equal(formatCompact(232054), 'Rp232K');
  assert.equal(formatCompact(9_000_000), 'Rp9.0M');
  assert.equal(formatCompact(1_250_000_000), 'Rp1.3B');
  assert.equal(formatPercent(0.37378), '37.4%');
  assert.equal(formatPercent(-94.3), '< -1000%');
  assert.equal(formatPercent(null), '—');
});

test('input keypad hanya menerima digit dan jumlah valid', () => {
  assert.equal(parseAmountInput('150.000'), 150000);
  assert.equal(parseAmountInput(''), null);
  assert.equal(isValidAmount(0), false);
  assert.equal(isValidAmount(1.5), false);
  assert.equal(isValidAmount(2500), true);
});
