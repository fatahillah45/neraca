// Pembuat workbook .xlsx. Menerima objek ExcelJS sebagai parameter agar bisa dipakai di browser dan di tes Node.
// Workbook selalu dibangun utuh dari data, tidak pernah ditambal.
import { TX, DEFAULT_TYPE_GROUPS, GROUP } from '../core/model.js';
import {
  weekDates, weekFileBase, daySheetName, formatLongDate, formatShortDate, formatTimestampWib, addDays, parts, weekStart,
} from '../core/dates.js';
import { balances, flows, costRemovedMap, netCashEffect, holdingStates } from '../core/ledger.js';
import { formatRp } from '../core/money.js';

export const RP_FORMAT = '"Rp"#,##0;-"Rp"#,##0';
const DATE_FORMAT = 'dd/mm/yyyy';
const TABLE_STYLE = { theme: 'TableStyleMedium2', showRowStripes: true };
const NOTE_COLOR = { argb: 'FF5F6B7A' };

export const DAY_COLUMNS = [
  'No', 'Tanggal', 'Jenis', 'Akun', 'Akun tujuan', 'Kategori', 'Subkategori',
  'Instrumen/Posisi', 'Deskripsi', 'Jumlah (Rp)', 'Efek ke kas (Rp)', 'ID',
];
const DAY_WIDTHS = [5, 11, 20, 22, 22, 24, 22, 26, 34, 15, 16, 38];

function labelsFrom(typeGroups) {
  const m = new Map((typeGroups ?? DEFAULT_TYPE_GROUPS).map((g) => [g.key, g.label]));
  return (k) => m.get(k) ?? DEFAULT_TYPE_GROUPS.find((g) => g.key === k)?.label ?? k;
}

export function typeLabel(tx, label) {
  switch (tx.type) {
    case TX.INVEST_BUY: return `${label(GROUP.INVEST)} (beli)`;
    case TX.INVEST_SELL: return `${label(GROUP.INVEST)} (cair)`;
    case TX.EXPENSE: return tx.isRefund ? `${label(GROUP.EXPENSE)} (refund)` : label(GROUP.EXPENSE);
    default: return label(tx.type);
  }
}

/** Tanggal ISO -> Date UTC tengah malam, agar Excel menampilkan tanggal yang sama tanpa geser zona waktu. */
function excelDate(iso) {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m - 1, d));
}

function lookups(data) {
  return {
    acc: new Map(data.accounts.map((a) => [a.id, a])),
    cat: new Map(data.categories.map((c) => [c.id, c])),
    hold: new Map(data.holdings.map((h) => [h.id, h])),
    inst: new Map(data.instruments.map((i) => [i.id, i])),
  };
}

function instrumentAndHolding(tx, lk) {
  const h = lk.hold.get(tx.holdingId);
  if (!h) return { instrument: '', holding: '' };
  return { instrument: lk.inst.get(h.instrumentId)?.name ?? '', holding: h.name };
}

function dayRow(tx, no, lk, label) {
  const { instrument, holding } = instrumentAndHolding(tx, lk);
  return [
    no,
    excelDate(tx.date),
    typeLabel(tx, label),
    lk.acc.get(tx.accountId)?.name ?? '',
    tx.type === TX.TRANSFER ? lk.acc.get(tx.toAccountId)?.name ?? '' : '',
    lk.cat.get(tx.categoryId)?.name ?? '',
    lk.cat.get(tx.subcategoryId)?.name ?? '',
    instrument ? `${instrument} · ${holding}` : '',
    tx.note ?? '',
    tx.amount,
    netCashEffect(tx),
    tx.id,
  ];
}

const sortTx = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));

function styleTitle(cell, text) {
  cell.value = text;
  cell.font = { bold: true, size: 14 };
}

function styleNote(cell, text) {
  cell.value = text;
  cell.font = { italic: true, size: 10, color: NOTE_COLOR };
}

/** Terapkan format angka/tanggal ke kolom tabel (indeks 1-based kolom sheet) untuk baris data dan total. */
function formatColumns(ws, firstRow, lastRow, colFormats) {
  for (let r = firstRow; r <= lastRow; r += 1) {
    for (const [col, fmt] of colFormats) ws.getCell(r, col).numFmt = fmt;
  }
}

function addTable(ws, { name, ref, columns, rows, totals = false }) {
  ws.addTable({
    name,
    ref,
    headerRow: true,
    totalsRow: totals,
    style: TABLE_STYLE,
    columns,
    rows: rows.length ? rows : [columns.map(() => null)],
  });
  return rows.length ? rows.length : 1;
}

/**
 * Workbook mingguan: sheet Ringkasan + tujuh sheet harian (Senin..Minggu).
 * @returns {{ workbook, fileName }}
 */
export function buildWeeklyWorkbook(ExcelJS, data, monday, { typeGroups, now = new Date(), isTestData = false } = {}) {
  if (weekStart(monday) !== monday) throw new Error(`Bukan hari Senin: ${monday}`);
  const label = labelsFrom(typeGroups);
  const lk = lookups(data);
  const days = weekDates(monday);
  const sunday = days[6];
  const removed = costRemovedMap(data);
  const prefix = isTestData ? '[DATA UJI] ' : '';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Neraca';
  wb.created = now;
  wb.modified = now;

  // --- Ringkasan ---
  const ws = wb.addWorksheet('Ringkasan');
  styleTitle(ws.getCell('A1'), `${prefix}Laporan Mingguan ${formatShortDate(monday)} – ${formatShortDate(sunday)}`);
  styleNote(ws.getCell('A2'), `Dibuat otomatis oleh Neraca pada ${formatTimestampWib(now)}. Perubahan manual di file ini tidak kembali ke aplikasi.`);
  styleNote(ws.getCell('A3'), 'Pengeluaran sudah dikurangi refund. Surplus = Pemasukan − Pengeluaran − Sedekah. Transfer antar akun tidak dihitung sebagai arus.');

  const summaryCols = [
    { name: 'Hari', totalsRowLabel: 'Total' },
    { name: 'Tanggal' },
    { name: label(GROUP.INCOME), totalsRowFunction: 'sum' },
    { name: label(GROUP.EXPENSE), totalsRowFunction: 'sum' },
    { name: label(GROUP.GIVING), totalsRowFunction: 'sum' },
    { name: `${label(GROUP.INVEST)} beli`, totalsRowFunction: 'sum' },
    { name: 'Pencairan diterima', totalsRowFunction: 'sum' },
    { name: 'Surplus', totalsRowFunction: 'sum' },
    { name: 'Jumlah transaksi', totalsRowFunction: 'sum' },
  ];
  const summaryRows = days.map((d) => {
    const f = flows(data, d, d, removed);
    return [formatLongDate(d).split(',')[0], excelDate(d), f.income, f.expense, f.giving, f.investBuy, f.investSellProceeds, f.surplus, f.count];
  });
  const sumStart = 5;
  addTable(ws, { name: 'Ringkasan_Harian', ref: `A${sumStart}`, columns: summaryCols, rows: summaryRows, totals: true });
  formatColumns(ws, sumStart + 1, sumStart + 8, [[2, DATE_FORMAT], [3, RP_FORMAT], [4, RP_FORMAT], [5, RP_FORMAT], [6, RP_FORMAT], [7, RP_FORMAT], [8, RP_FORMAT]]);

  const balStart = sumStart + 7 + 4; // header + 7 baris + total + 2 baris jarak
  ws.getCell(`A${balStart - 1}`).value = 'Saldo akun';
  ws.getCell(`A${balStart - 1}`).font = { bold: true };
  const before = balances(data, addDays(monday, -1));
  const after = balances(data, sunday);
  const accRows = [...data.accounts]
    .filter((a) => !a.archived || before.get(a.id) || after.get(a.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((a) => [a.name, before.get(a.id) ?? 0, after.get(a.id) ?? 0, (after.get(a.id) ?? 0) - (before.get(a.id) ?? 0)]);
  const balCols = [
    { name: 'Akun', totalsRowLabel: 'Total Kas & Bank' },
    { name: 'Saldo Senin 00.00', totalsRowFunction: 'sum' },
    { name: 'Saldo Minggu 23.59', totalsRowFunction: 'sum' },
    { name: 'Perubahan', totalsRowFunction: 'sum' },
  ];
  const nAcc = addTable(ws, { name: 'Saldo_Akun', ref: `A${balStart}`, columns: balCols, rows: accRows, totals: true });
  formatColumns(ws, balStart + 1, balStart + nAcc + 1, [[2, RP_FORMAT], [3, RP_FORMAT], [4, RP_FORMAT]]);
  [16, 12, 16, 16, 16, 16, 18, 16, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getColumn(1).width = 22;

  // --- Tujuh sheet harian ---
  for (const d of days) {
    const sheet = wb.addWorksheet(daySheetName(d), { views: [{ state: 'frozen', ySplit: 4 }] });
    const txs = data.transactions.filter((t) => !t.deletedAt && t.date === d).sort(sortTx);
    styleTitle(sheet.getCell('A1'), `${prefix}${formatLongDate(d)}`);
    if (txs.length === 0) styleNote(sheet.getCell('A2'), 'Tidak ada transaksi.');
    else {
      const f = flows(data, d, d, removed);
      const net = f.income - f.expense - f.giving - f.investBuy + f.investSellProceeds + f.adjustments;
      styleNote(sheet.getCell('A2'), `${txs.length} transaksi. Efek bersih ke Kas & Bank: ${formatRp(net)}.`);
    }
    const rows = txs.map((t, i) => dayRow(t, i + 1, lk, label));
    const columns = DAY_COLUMNS.map((name) => {
      if (name === 'No') return { name, totalsRowLabel: 'Total' };
      if (name === 'Efek ke kas (Rp)') return { name, totalsRowFunction: 'sum' };
      return { name };
    });
    const { y, m, d: dd } = parts(d);
    const n = addTable(sheet, {
      name: `Hari_${y}${String(m).padStart(2, '0')}${String(dd).padStart(2, '0')}`,
      ref: 'A4', columns, rows, totals: true,
    });
    formatColumns(sheet, 5, 5 + n, [[2, DATE_FORMAT], [10, RP_FORMAT], [11, RP_FORMAT]]);
    DAY_WIDTHS.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
  }
  return { workbook: wb, fileName: `${weekFileBase(monday)}.xlsx` };
}

export const ALL_COLUMNS = [
  'Tanggal', 'Minggu', 'Bulan', 'Jenis', 'Akun', 'Akun tujuan', 'Kategori', 'Subkategori', 'Instrumen', 'Posisi',
  'Unit', 'Deskripsi', 'Jumlah (Rp)', 'Efek ke kas (Rp)', 'Modal ditarik (Rp)', 'ID', 'Dibuat', 'Diubah',
];

/** Satu tabel lengkap untuk analisis lintas minggu, plus sheet Akun, Portofolio, dan Info. */
export function buildAllTransactionsWorkbook(ExcelJS, data, { typeGroups, now = new Date(), isTestData = false, today } = {}) {
  const label = labelsFrom(typeGroups);
  const lk = lookups(data);
  const removed = costRemovedMap(data);
  const prefix = isTestData ? '[DATA UJI] ' : '';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Neraca';
  wb.created = now;

  const ws = wb.addWorksheet('Transaksi', { views: [{ state: 'frozen', ySplit: 1 }] });
  const txs = data.transactions.filter((t) => !t.deletedAt).sort(sortTx);
  const rows = txs.map((t) => {
    const { instrument, holding } = instrumentAndHolding(t, lk);
    return [
      excelDate(t.date), weekFileBase(weekStart(t.date)), t.date.slice(0, 7), typeLabel(t, label),
      lk.acc.get(t.accountId)?.name ?? '', t.type === TX.TRANSFER ? lk.acc.get(t.toAccountId)?.name ?? '' : '',
      lk.cat.get(t.categoryId)?.name ?? '', lk.cat.get(t.subcategoryId)?.name ?? '', instrument, holding,
      t.units ?? null, t.note ?? '', t.amount, netCashEffect(t),
      t.type === TX.INVEST_SELL ? removed.get(t.id) ?? 0 : null,
      t.id, t.createdAt ?? '', t.updatedAt ?? '',
    ];
  });
  const n = addTable(ws, { name: 'Semua_Transaksi', ref: 'A1', columns: ALL_COLUMNS.map((name) => ({ name, filterButton: true })), rows });
  formatColumns(ws, 2, 1 + n, [[1, DATE_FORMAT], [13, RP_FORMAT], [14, RP_FORMAT], [15, RP_FORMAT]]);
  [11, 17, 9, 20, 22, 22, 24, 22, 18, 24, 8, 34, 15, 16, 16, 38, 24, 24].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const wa = wb.addWorksheet('Akun');
  const bal = balances(data, today ?? null);
  const accRows = [...data.accounts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((a) => [
    a.name, a.kind ?? '', a.institution ?? '', a.openingBalance ?? 0, a.openingDate ? excelDate(a.openingDate) : null, bal.get(a.id) ?? 0, a.archived ? 'Diarsipkan' : 'Aktif',
  ]);
  const na = addTable(wa, { name: 'Daftar_Akun', ref: 'A1', columns: ['Akun', 'Jenis akun', 'Institusi', 'Saldo awal (Rp)', 'Tanggal saldo awal', 'Saldo saat ini (Rp)', 'Status'].map((name) => ({ name })), rows: accRows });
  formatColumns(wa, 2, 1 + na, [[4, RP_FORMAT], [5, DATE_FORMAT], [6, RP_FORMAT]]);
  [26, 14, 18, 16, 16, 18, 12].forEach((w, i) => { wa.getColumn(i + 1).width = w; });

  const wp = wb.addWorksheet('Portofolio');
  const statusLabel = { dinilai: 'Dinilai', perkiraan: 'Perkiraan', belum_dinilai: 'Belum dinilai' };
  const pRows = holdingStates(data, today ?? null).filter((s) => s.isOpen).map((s) => [
    s.holding.name, lk.inst.get(s.holding.instrumentId)?.name ?? '', s.holding.platform ?? '', s.cost, s.value,
    statusLabel[s.status], s.lastValuationDate ? excelDate(s.lastValuationDate) : null,
  ]);
  const np = addTable(wp, { name: 'Posisi_Investasi', ref: 'A1', columns: ['Posisi', 'Instrumen', 'Platform', 'Modal (Rp)', 'Nilai (Rp)', 'Status nilai', 'Penilaian terakhir'].map((name) => ({ name })), rows: pRows });
  formatColumns(wp, 2, 1 + np, [[4, RP_FORMAT], [5, RP_FORMAT], [7, DATE_FORMAT]]);
  [28, 24, 18, 16, 16, 14, 16].forEach((w, i) => { wp.getColumn(i + 1).width = w; });

  const wi = wb.addWorksheet('Info');
  styleTitle(wi.getCell('A1'), `${prefix}Neraca: ekspor semua transaksi`);
  const info = [
    ['Dibuat', formatTimestampWib(now)],
    ['Jumlah transaksi', txs.length],
    ['Transaksi pertama', txs[0]?.date ?? '-'],
    ['Transaksi terakhir', txs.at(-1)?.date ?? '-'],
    ['Efek ke kas', 'Perubahan total Kas & Bank akibat transaksi; transfer antar akun bernilai 0.'],
    ['Jumlah (Rp)', 'Selalu positif; arah uang dibaca dari kolom Jenis dan Efek ke kas.'],
    ['Modal ditarik', 'Untuk pencairan investasi: modal yang keluar dari posisi. Hasil terealisasi = Jumlah − Modal ditarik.'],
  ];
  info.forEach(([k, v], i) => { wi.getCell(i + 3, 1).value = k; wi.getCell(i + 3, 1).font = { bold: true }; wi.getCell(i + 3, 2).value = v; });
  wi.getColumn(1).width = 20;
  wi.getColumn(2).width = 90;

  const stamp = (today ?? new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10));
  return { workbook: wb, fileName: `neraca-semua-transaksi-${stamp}.xlsx` };
}
