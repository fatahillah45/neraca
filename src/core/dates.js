// Calendar dates in WIB (Asia/Jakarta, UTC+7, no DST).
// Transaction dates are stored as 'YYYY-MM-DD' strings without a time, so they never shift a day
// because of time-zone conversion.

export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

// Indonesian month abbreviations are used ONLY for the weekly file name convention (e.g. 19okt26-25okt26).
export const BULAN_SINGKAT = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Index 0 = Monday.
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s) {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function parts(iso) {
  if (!isIsoDate(iso)) throw new Error(`Invalid date: ${iso}`);
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) };
}

function toUtcMs(iso) {
  const { y, m, d } = parts(iso);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Today's date in WIB. */
export function todayWib(now = new Date()) {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** WIB date and time for printing, e.g. '26 Oct 2026 08:05 WIB'. */
export function formatTimestampWib(now = new Date()) {
  const iso = new Date(now.getTime() + WIB_OFFSET_MS).toISOString();
  const { y, m, d } = parts(iso.slice(0, 10));
  return `${d} ${MONTH_SHORT[m - 1]} ${y} ${iso.slice(11, 13)}:${iso.slice(14, 16)} WIB`;
}

export function addDays(iso, n) {
  return fromUtcMs(toUtcMs(iso) + n * 86400000);
}

/** Calendar days b - a. */
export function diffDays(a, b) {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86400000);
}

/** Number of calendar days from a to b, inclusive. */
export function countDaysInclusive(a, b) {
  return diffDays(a, b) + 1;
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(iso) {
  return (new Date(toUtcMs(iso)).getUTCDay() + 6) % 7;
}

/** Monday of the week containing this date. */
export function weekStart(iso) {
  return addDays(iso, -weekdayIndex(iso));
}

export function weekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function ddmmmyy(iso) {
  const { y, m, d } = parts(iso);
  return `${String(d).padStart(2, '0')}${BULAN_SINGKAT[m - 1]}${String(y % 100).padStart(2, '0')}`;
}

/** Weekly file name without extension, e.g. '19okt26-25okt26' (Indonesian months, as specified by the owner). */
export function weekFileBase(monday) {
  if (weekdayIndex(monday) !== 0) throw new Error(`Not a Monday: ${monday}`);
  return `${ddmmmyy(monday)}-${ddmmmyy(addDays(monday, 6))}`;
}

/** Suggested laptop subfolder based on the Monday's month, e.g. '2026/10'. */
export function weekFolderHint(monday) {
  const { y, m } = parts(monday);
  return `${y}/${String(m).padStart(2, '0')}`;
}

/** Daily sheet name, e.g. 'Mon 19 Oct'. */
export function daySheetName(iso) {
  const { m, d } = parts(iso);
  return `${DAY_SHORT[weekdayIndex(iso)]} ${String(d).padStart(2, '0')} ${MONTH_SHORT[m - 1]}`;
}

/** Long title, e.g. 'Monday, 19 October 2026'. */
export function formatLongDate(iso) {
  const { y, m, d } = parts(iso);
  return `${DAY_LONG[weekdayIndex(iso)]}, ${d} ${MONTH_LONG[m - 1]} ${y}`;
}

/** Short date, e.g. '19 Oct 2026'. */
export function formatShortDate(iso) {
  const { y, m, d } = parts(iso);
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

export function monthRange(y, m) {
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(daysInMonth(y, m)).padStart(2, '0')}` };
}

export function addMonths(y, m, n) {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function formatMonthLabel(y, m) {
  return `${MONTH_LONG[m - 1]} ${y}`;
}

export function compareIso(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minIso(a, b) {
  return a <= b ? a : b;
}

export function maxIso(a, b) {
  return a >= b ? a : b;
}
