// Rupiah selalu disimpan sebagai bilangan bulat (tanpa sen) agar tidak ada galat pembulatan.

export const MAX_AMOUNT = 1_000_000_000_000_000; // Rp1 kuadriliun, batas aman jauh di bawah Number.MAX_SAFE_INTEGER
export const LARGE_AMOUNT_CONFIRM = 100_000_000; // di atas Rp100 juta minta konfirmasi

export function isValidAmount(n) {
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_AMOUNT;
}

function groupThousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 1234567 -> 'Rp1.234.567'; -5000 -> '-Rp5.000'. */
export function formatRp(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}Rp${groupThousands(Math.abs(Math.round(n)))}`;
}

/** Angka tanpa 'Rp', untuk keypad: 150000 -> '150.000'. */
export function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  const sign = n < 0 ? '-' : '';
  return sign + groupThousands(Math.abs(Math.round(n)));
}

function oneDecimal(x) {
  const r = Math.round(x * 10) / 10;
  return (Number.isInteger(r) ? `${r},0` : String(r).replace('.', ','));
}

/**
 * Singkatan Indonesia untuk grafik: rb (ribu), jt (juta), M (miliar), T (triliun).
 * 232054 -> 'Rp232 rb', 9000000 -> 'Rp9,0 jt', 1200000000 -> 'Rp1,2 M'.
 */
export function formatCompact(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e12) return `${sign}Rp${oneDecimal(a / 1e12)} T`;
  if (a >= 1e9) return `${sign}Rp${oneDecimal(a / 1e9)} M`;
  if (a >= 1e6) return `${sign}Rp${oneDecimal(a / 1e6)} jt`;
  if (a >= 1e3) return `${sign}Rp${Math.round(a / 1e3)} rb`;
  return `${sign}Rp${Math.round(a)}`;
}

/** Persen dengan satu desimal dan koma: 0.3738 -> '37,4%'. null -> '—'. */
export function formatPercent(ratio) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  // Rasio ekstrem (mis. awal bulan sebelum gaji masuk) dibatasi agar tetap terbaca.
  if (ratio < -10) return '< -1000%';
  if (ratio > 10) return '> 1000%';
  return `${oneDecimal(ratio * 100)}%`;
}

/** Ambil hanya digit dari input keypad. '150.000' -> 150000; '' -> null. */
export function parseAmountInput(text) {
  const digits = String(text ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}
