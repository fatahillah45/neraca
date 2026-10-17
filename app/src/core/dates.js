// Tanggal kalender WIB (Asia/Jakarta, UTC+7, tanpa DST).
// Semua tanggal transaksi disimpan sebagai string 'YYYY-MM-DD' tanpa jam,
// sehingga tidak pernah bergeser hari karena konversi zona waktu.

export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export const BULAN_SINGKAT = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];
export const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
// Indeks 0 = Senin.
export const HARI_SINGKAT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
export const HARI_PANJANG = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

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
  if (!isIsoDate(iso)) throw new Error(`Tanggal tidak valid: ${iso}`);
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

/** Tanggal hari ini menurut WIB. */
export function todayWib(now = new Date()) {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Jam dan tanggal WIB untuk dicetak, mis. '26 Okt 2026 08.05 WIB'. */
export function formatTimestampWib(now = new Date()) {
  const w = new Date(now.getTime() + WIB_OFFSET_MS);
  const iso = w.toISOString();
  const { y, m, d } = parts(iso.slice(0, 10));
  return `${d} ${capital(BULAN_SINGKAT[m - 1])} ${y} ${iso.slice(11, 13)}.${iso.slice(14, 16)} WIB`;
}

export function addDays(iso, n) {
  return fromUtcMs(toUtcMs(iso) + n * 86400000);
}

/** Selisih hari kalender b - a. */
export function diffDays(a, b) {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86400000);
}

/** Jumlah hari kalender dari a sampai b, inklusif. */
export function countDaysInclusive(a, b) {
  return diffDays(a, b) + 1;
}

/** 0 = Senin ... 6 = Minggu. */
export function weekdayIndex(iso) {
  return (new Date(toUtcMs(iso)).getUTCDay() + 6) % 7;
}

/** Senin dari minggu yang memuat tanggal ini. */
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

/** Nama file mingguan tanpa ekstensi, mis. '19okt26-25okt26'. */
export function weekFileBase(monday) {
  if (weekdayIndex(monday) !== 0) throw new Error(`Bukan hari Senin: ${monday}`);
  return `${ddmmmyy(monday)}-${ddmmmyy(addDays(monday, 6))}`;
}

/** Saran subfolder di laptop berdasarkan bulan hari Senin, mis. '2026/10'. */
export function weekFolderHint(monday) {
  const { y, m } = parts(monday);
  return `${y}/${String(m).padStart(2, '0')}`;
}

/** Nama sheet harian, mis. 'Sen 19okt'. */
export function daySheetName(iso) {
  const { m, d } = parts(iso);
  return `${HARI_SINGKAT[weekdayIndex(iso)]} ${String(d).padStart(2, '0')}${BULAN_SINGKAT[m - 1]}`;
}

/** Judul panjang, mis. 'Senin, 19 Oktober 2026'. */
export function formatLongDate(iso) {
  const { y, m, d } = parts(iso);
  return `${HARI_PANJANG[weekdayIndex(iso)]}, ${d} ${BULAN_PANJANG[m - 1]} ${y}`;
}

/** Tanggal pendek, mis. '19 Okt 2026'. */
export function formatShortDate(iso) {
  const { y, m, d } = parts(iso);
  return `${d} ${capital(BULAN_SINGKAT[m - 1])} ${y}`;
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
  return `${BULAN_PANJANG[m - 1]} ${y}`;
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

function capital(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
