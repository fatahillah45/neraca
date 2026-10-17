// One-time migration from the original Indonesian default labels (v0.1) to English (v0.2).
// Only names that still equal an untouched Indonesian default are renamed; anything the user
// renamed or created stays exactly as it is. Transactions are never modified.
import { DEFAULT_TYPE_GROUPS } from './model.js';
import { INSTRUMENTS } from './seed.js';

const CATEGORY_MAP = {
  // Expense
  'Makanan & Minuman': 'Food & Beverages', 'Makan di luar': 'Dining out', 'Belanja dapur': 'Groceries', 'Kopi & jajan': 'Coffee & snacks',
  'Transportasi': 'Transportation', 'Bensin': 'Fuel', 'Ojek & taksi online': 'Ride-hailing', 'Parkir & tol': 'Parking & tolls', 'Transportasi umum': 'Public transport',
  'Tempat Tinggal & Tagihan': 'Housing & Bills', 'Listrik': 'Electricity', 'Air': 'Water', 'Pulsa & paket data': 'Mobile credit & data', 'Sewa': 'Rent',
  'Belanja': 'Shopping', 'Pakaian': 'Clothing', 'Rumah tangga': 'Household', 'Elektronik': 'Electronics',
  'Kesehatan': 'Health & Wellness', 'Obat': 'Medicine', 'Dokter & klinik': 'Doctor & clinic', 'Olahraga': 'Sports & fitness',
  'Perawatan Diri': 'Personal Care & Grooming', 'Hiburan & Rekreasi': 'Entertainment & Leisure', 'Langganan & Layanan': 'Subscriptions & Services',
  'Pendidikan & Pengembangan Diri': 'Education & Self-development', 'Buku': 'Books', 'Kursus': 'Courses',
  'Hadiah untuk Orang Lain': 'Gifts & Presents', 'Biaya Admin Bank': 'Bank Fees', 'Lainnya': 'Other',
  // Income
  'Gaji': 'Salary', 'Bonus & Tunjangan': 'Bonus & Allowances', 'Hasil Investasi': 'Investment Income', 'Bunga': 'Interest', 'Dividen': 'Dividends',
  'Kupon SBN': 'Bond coupons', 'Penjualan Barang': 'Sales of Goods', 'Hadiah Diterima': 'Gifts Received',
  // Giving
  'Ibadah & Keagamaan': 'Worship & Religious', 'Donasi Sosial': 'Social Donations', 'Bantuan Keluarga': 'Family Support',
};

const INSTRUMENT_MAP = {
  'Emas': 'Gold', 'Deposito': 'Time Deposit (Deposito)', 'SBN': 'Government Bonds (SBN)', 'Reksa Dana Pasar Uang': 'Money Market Fund',
  'Reksa Dana Pendapatan Tetap': 'Fixed Income Fund', 'Reksa Dana Saham': 'Equity Fund', 'Saham': 'Stocks', 'Lainnya': 'Other',
};

const OLD_TYPE_LABELS = {
  expense: 'Pengeluaran', income: 'Pemasukan', giving: 'Sedekah', invest: 'Investasi', transfer: 'Transfer', adjustment: 'Penyesuaian',
};

/**
 * @returns {{ categories: Array<{id, name}>, instruments: Array<{id, name, note?}>, typeGroups: Array|null, accounts: Array<{id,name}>, holdings: Array<{id,name}> }}
 *          the rows to update (empty arrays when nothing changes).
 */
export function englishLabelUpdates(snap) {
  const enNote = new Map(INSTRUMENTS.map(([name, , , note]) => [name, note]));
  const categories = snap.categories
    .filter((c) => CATEGORY_MAP[c.name])
    .map((c) => ({ id: c.id, name: CATEGORY_MAP[c.name] }));
  const instruments = snap.instruments
    .filter((i) => INSTRUMENT_MAP[i.name])
    .map((i) => ({ id: i.id, name: INSTRUMENT_MAP[i.name], note: enNote.get(INSTRUMENT_MAP[i.name]) ?? i.note }));
  const current = snap.settings.find((s) => s.key === 'typeGroups')?.value ?? null;
  let typeGroups = null;
  if (current) {
    typeGroups = current.map((g) => {
      const def = DEFAULT_TYPE_GROUPS.find((d) => d.key === g.key);
      if (!def) return g;
      return { ...g, label: g.label === OLD_TYPE_LABELS[g.key] ? def.label : g.label, hint: def.hint };
    });
  }
  // Sample (test) accounts and holdings carry an Indonesian "(UJI)" suffix.
  const rename = (rows) => rows.filter((r) => r.name?.includes('(UJI)')).map((r) => ({ id: r.id, name: r.name.replace('(UJI)', '(TEST)') }));
  return { categories, instruments, typeGroups, accounts: rename(snap.accounts), holdings: rename(snap.holdings) };
}
