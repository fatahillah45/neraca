// DATA UJI. Semua angka di sini rekaan untuk pengujian, bukan catatan keuangan siapa pun.
import { TX } from '../app/src/core/model.js';

let seq = 0;
const id = (p) => `${p}-${String(++seq).padStart(4, '0')}`;

export function baseData() {
  seq = 0;
  const accounts = [
    { id: 'acc-gaji', name: 'Rekening Gaji (UJI)', kind: 'rekening', openingBalance: 5_000_000, openingDate: '2026-10-01', archived: false, order: 0 },
    { id: 'acc-tunai', name: 'Tunai (UJI)', kind: 'tunai', openingBalance: 300_000, openingDate: '2026-10-01', archived: false, order: 1 },
    { id: 'acc-ew', name: 'E-wallet (UJI)', kind: 'ewallet', openingBalance: 0, openingDate: '2026-10-01', archived: false, order: 2 },
  ];
  const categories = [
    { id: 'cat-makan', type: TX.EXPENSE, parentId: null, name: 'Makanan & Minuman', order: 0, active: true },
    { id: 'sub-luar', type: TX.EXPENSE, parentId: 'cat-makan', name: 'Makan di luar', order: 0, active: true },
    { id: 'sub-dapur', type: TX.EXPENSE, parentId: 'cat-makan', name: 'Belanja dapur', order: 1, active: true },
    { id: 'cat-transport', type: TX.EXPENSE, parentId: null, name: 'Transportasi', order: 1, active: true },
    { id: 'cat-admin', type: TX.EXPENSE, parentId: null, name: 'Biaya Admin Bank', order: 2, active: true },
    { id: 'cat-gaji', type: TX.INCOME, parentId: null, name: 'Gaji', order: 0, active: true },
    { id: 'cat-hasil', type: TX.INCOME, parentId: null, name: 'Hasil Investasi', order: 1, active: true },
    { id: 'cat-ibadah', type: TX.GIVING, parentId: null, name: 'Ibadah & Keagamaan', order: 0, active: true },
  ];
  const instruments = [
    { id: 'ins-emas', name: 'Emas', riskScore: 3, liquidity: 'cepat', order: 0, active: true },
    { id: 'ins-depo', name: 'Deposito', riskScore: 1, liquidity: 'panjang', order: 1, active: true },
    { id: 'ins-saham', name: 'Saham', riskScore: 5, liquidity: 'cepat', order: 2, active: true },
  ];
  const holdings = [
    { id: 'h-emas', name: 'Emas (UJI)', instrumentId: 'ins-emas', platform: 'Pegadaian', openingCost: 0, openingUnits: 0 },
    { id: 'h-depo', name: 'Deposito (UJI)', instrumentId: 'ins-depo', platform: 'Bank Digital A', openingCost: 0, openingUnits: 0 },
    { id: 'h-saham', name: 'Saham (UJI)', instrumentId: 'ins-saham', platform: 'Sekuritas B', openingCost: 2_000_000, openingUnits: 400 },
  ];
  return { accounts, categories, instruments, holdings, transactions: [], valuations: [] };
}

export function tx(fields) {
  const t = { id: id('tx'), createdAt: `2026-10-17T00:00:${String(seq % 60).padStart(2, '0')}.000Z`, ...fields };
  return t;
}

/** Satu minggu contoh, Senin 19 sampai Minggu 25 Oktober 2026. */
export function sampleWeek() {
  const d = baseData();
  d.transactions.push(
    tx({ type: TX.INCOME, date: '2026-10-19', amount: 10_000_000, accountId: 'acc-gaji', categoryId: 'cat-gaji', note: 'Gaji Oktober (UJI)' }),
    tx({ type: TX.EXPENSE, date: '2026-10-19', amount: 45_000, accountId: 'acc-tunai', categoryId: 'cat-makan', subcategoryId: 'sub-luar', note: 'Makan siang' }),
    tx({ type: TX.TRANSFER, date: '2026-10-20', amount: 500_000, accountId: 'acc-gaji', toAccountId: 'acc-ew', note: 'Isi e-wallet' }),
    tx({ type: TX.EXPENSE, date: '2026-10-20', amount: 2_500, accountId: 'acc-gaji', categoryId: 'cat-admin', note: 'Biaya transfer' }),
    tx({ type: TX.GIVING, date: '2026-10-21', amount: 1_000_000, accountId: 'acc-gaji', categoryId: 'cat-ibadah', note: 'Sedekah mingguan' }),
    tx({ type: TX.INVEST_BUY, date: '2026-10-22', amount: 2_000_000, accountId: 'acc-gaji', holdingId: 'h-emas', units: 1, unitPrice: 2_000_000 }),
    tx({ type: TX.EXPENSE, date: '2026-10-23', amount: 120_000, accountId: 'acc-ew', categoryId: 'cat-transport', note: 'Ojek online' }),
    tx({ type: TX.EXPENSE, date: '2026-10-23', amount: 20_000, accountId: 'acc-ew', categoryId: 'cat-transport', isRefund: true, note: 'Refund promo' }),
    tx({ type: TX.INVEST_BUY, date: '2026-10-24', amount: 3_000_000, accountId: 'acc-gaji', holdingId: 'h-depo' }),
  );
  // Minggu 25 Okt sengaja tanpa transaksi.
  return d;
}
