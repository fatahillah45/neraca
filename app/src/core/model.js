// Konstanta model data. Jenis transaksi menentukan aturan hitung dan sengaja tetap di kode;
// label, urutan, dan visibilitasnya disimpan sebagai data (lihat settings.typeGroups).

export const TX = Object.freeze({
  INCOME: 'income',
  EXPENSE: 'expense',
  GIVING: 'giving',
  INVEST_BUY: 'invest_buy',
  INVEST_SELL: 'invest_sell',
  TRANSFER: 'transfer',
  ADJUSTMENT: 'adjustment',
});

export const TX_TYPES = Object.values(TX);

// Kelompok yang terlihat oleh pengguna sebagai "Jenis".
export const GROUP = Object.freeze({
  INCOME: 'income',
  EXPENSE: 'expense',
  GIVING: 'giving',
  INVEST: 'invest',
  TRANSFER: 'transfer',
  ADJUSTMENT: 'adjustment',
});

export const DEFAULT_TYPE_GROUPS = [
  { key: GROUP.EXPENSE, label: 'Pengeluaran', hint: 'Expense', hidden: false },
  { key: GROUP.INCOME, label: 'Pemasukan', hint: 'Income', hidden: false },
  { key: GROUP.GIVING, label: 'Sedekah', hint: 'Human-being / Giving', hidden: false },
  { key: GROUP.INVEST, label: 'Investasi', hint: 'Invested', hidden: false },
  { key: GROUP.TRANSFER, label: 'Transfer', hint: 'Antar akun sendiri', hidden: false },
  { key: GROUP.ADJUSTMENT, label: 'Penyesuaian', hint: 'Cocokkan saldo', hidden: false },
];

export function groupOfType(type) {
  if (type === TX.INVEST_BUY || type === TX.INVEST_SELL) return GROUP.INVEST;
  return type;
}

/** Jenis yang memakai kategori dari tabel categories. */
export const CATEGORY_TYPES = [TX.INCOME, TX.EXPENSE, TX.GIVING];

export const ACCOUNT_KINDS = [
  { key: 'tunai', label: 'Tunai' },
  { key: 'rekening', label: 'Rekening bank' },
  { key: 'ewallet', label: 'E-wallet' },
  { key: 'lainnya', label: 'Lainnya' },
];

// Kelas likuiditas untuk dashboard risiko.
export const LIQUIDITY = Object.freeze({
  FAST: 'cepat', // dapat dicairkan dalam <= 2 hari kerja
  MONTH: 'bulan', // <= 1 bulan
  LONG: 'panjang', // > 1 bulan / menunggu jatuh tempo
});

export const LIQUIDITY_LABELS = {
  [LIQUIDITY.FAST]: '≤ 2 hari kerja',
  [LIQUIDITY.MONTH]: '≤ 1 bulan',
  [LIQUIDITY.LONG]: '> 1 bulan',
};

export const SCHEMA_VERSION = 1;

export function newId() {
  return globalThis.crypto.randomUUID();
}
