// Kategori, subkategori, dan instrumen awal. Semuanya bisa diubah, diurutkan, dan dinonaktifkan di aplikasi.
import { TX, LIQUIDITY, DEFAULT_TYPE_GROUPS, newId } from './model.js';

const CATEGORY_TREE = {
  [TX.EXPENSE]: [
    ['Makanan & Minuman', '🍽️', ['Makan di luar', 'Belanja dapur', 'Kopi & jajan']],
    ['Transportasi', '🚗', ['Bensin', 'Ojek & taksi online', 'Parkir & tol', 'Transportasi umum']],
    ['Tempat Tinggal & Tagihan', '🏠', ['Listrik', 'Air', 'Internet', 'Pulsa & paket data', 'Sewa']],
    ['Belanja', '🛍️', ['Pakaian', 'Rumah tangga', 'Elektronik']],
    ['Kesehatan', '🩺', ['Obat', 'Dokter & klinik', 'Olahraga']],
    ['Perawatan Diri', '💈', []],
    ['Hiburan & Rekreasi', '🎬', []],
    ['Langganan & Layanan', '🔁', []],
    ['Pendidikan & Pengembangan Diri', '📚', ['Buku', 'Kursus']],
    ['Hadiah untuk Orang Lain', '🎁', []],
    ['Biaya Admin Bank', '🏦', []],
    ['Lainnya', '•', []],
  ],
  [TX.INCOME]: [
    ['Gaji', '💼', []],
    ['Bonus & Tunjangan', '⭐', []],
    ['Hasil Investasi', '📈', ['Bunga', 'Dividen', 'Kupon SBN']],
    ['Penjualan Barang', '🏷️', []],
    ['Hadiah Diterima', '🎁', []],
    ['Lainnya', '•', []],
  ],
  [TX.GIVING]: [
    ['Ibadah & Keagamaan', '🙏', []],
    ['Donasi Sosial', '🤝', []],
    ['Bantuan Keluarga', '👪', []],
    ['Lainnya', '•', []],
  ],
};

// Skor 1 (rendah) sampai 5 (tinggi). Asumsi awal untuk didiskusikan, bukan ukuran resmi.
const INSTRUMENTS = [
  ['Emas', 3, LIQUIDITY.FAST, 'Fluktuasi harga sedang; ada selisih harga jual-beli; risiko bergantung tempat penyimpanan.'],
  ['Deposito', 1, LIQUIDITY.LONG, 'Nilai tetap; dijamin LPS hingga Rp2 miliar per bank bila bunga tidak melebihi tingkat penjaminan; penalti jika dicairkan sebelum jatuh tempo.'],
  ['SBN', 2, LIQUIDITY.LONG, 'Diterbitkan Pemerintah RI; sebagian seri tidak bisa dijual sebelum jatuh tempo.'],
  ['Reksa Dana Pasar Uang', 2, LIQUIDITY.FAST, 'Fluktuasi rendah; pencairan beberapa hari kerja.'],
  ['Reksa Dana Pendapatan Tetap', 3, LIQUIDITY.FAST, 'Fluktuasi sedang mengikuti harga obligasi.'],
  ['Reksa Dana Saham', 5, LIQUIDITY.FAST, 'Fluktuasi tinggi mengikuti pasar saham.'],
  ['Saham', 5, LIQUIDITY.FAST, 'Fluktuasi tinggi; risiko bergantung emiten; penyelesaian T+2.'],
  ['Lainnya', 3, LIQUIDITY.MONTH, 'Isi profil risikonya sendiri.'],
];

export function buildSeed() {
  const categories = [];
  for (const [type, list] of Object.entries(CATEGORY_TREE)) {
    list.forEach(([name, icon, subs], i) => {
      const id = newId();
      categories.push({ id, type, parentId: null, name, icon, order: i, active: true });
      subs.forEach((sub, j) => {
        categories.push({ id: newId(), type, parentId: id, name: sub, icon: '', order: j, active: true });
      });
    });
  }
  const instruments = INSTRUMENTS.map(([name, riskScore, liquidity, note], i) => ({
    id: newId(), name, riskScore, liquidity, note, order: i, active: true,
  }));
  return {
    categories,
    instruments,
    settings: [
      { key: 'typeGroups', value: DEFAULT_TYPE_GROUPS.map((g) => ({ ...g })) },
    ],
  };
}
