// Rupiah amounts are always stored as integers (no cents) to avoid rounding errors.
// Display follows the reference app: full amounts with dot thousands (Rp11.116.870),
// compact amounts and percentages with a decimal point (Rp9.0M, 37.4%).

export const MAX_AMOUNT = 1_000_000_000_000_000; // Rp1 quadrillion, far below Number.MAX_SAFE_INTEGER
export const LARGE_AMOUNT_CONFIRM = 100_000_000; // ask for confirmation above Rp100 million

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

/** Number without 'Rp', for the keypad: 150000 -> '150.000'. */
export function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  const sign = n < 0 ? '-' : '';
  return sign + groupThousands(Math.abs(Math.round(n)));
}

function oneDecimal(x) {
  return (Math.round(x * 10) / 10).toFixed(1);
}

/**
 * Compact amounts for charts: K (thousand), M (million), B (billion), T (trillion).
 * 232054 -> 'Rp232K', 9000000 -> 'Rp9.0M', 1250000000 -> 'Rp1.3B'.
 */
export function formatCompact(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e12) return `${sign}Rp${oneDecimal(a / 1e12)}T`;
  if (a >= 1e9) return `${sign}Rp${oneDecimal(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}Rp${oneDecimal(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}Rp${Math.round(a / 1e3)}K`;
  return `${sign}Rp${Math.round(a)}`;
}

/** Percentage with one decimal: 0.3738 -> '37.4%'. null -> '—'. */
export function formatPercent(ratio) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  // Extreme ratios (e.g. early in the month before salary arrives) are capped to stay readable.
  if (ratio < -10) return '< -1000%';
  if (ratio > 10) return '> 1000%';
  return `${oneDecimal(ratio * 100)}%`;
}

/** Keep digits only from keypad input. '150.000' -> 150000; '' -> null. */
export function parseAmountInput(text) {
  const digits = String(text ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}
