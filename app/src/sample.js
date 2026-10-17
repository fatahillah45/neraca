// TEST DATA generator for test mode. All figures are fictional and every account/holding name ends with (TEST).
// Used only in the 'neraca-uji' database, never in the real-data database.
import { TX, newId } from './core/model.js';
import { addDays, addMonths, monthRange, weekdayIndex } from './core/dates.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function buildSampleData(categories, instruments, today) {
  const r = rng(20261017);
  const between = (lo, hi, step = 1000) => Math.round((lo + r() * (hi - lo)) / step) * step;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const s = addMonths(y, m, -2);
  const start = monthRange(s.y, s.m).start;

  const top = (type, name) => categories.find((c) => c.type === type && !c.parentId && c.name === name)?.id;
  const sub = (parentId, name) => categories.find((c) => c.parentId === parentId && c.name === name)?.id;
  const inst = (name) => instruments.find((i) => i.name === name)?.id;

  const acc = {
    gaji: { id: newId(), name: 'Salary Account (TEST)', kind: 'rekening', institution: 'Bank A', openingBalance: 8_000_000, openingDate: start, archived: false, order: 0 },
    tabungan: { id: newId(), name: 'Savings (TEST)', kind: 'rekening', institution: 'Bank Digital B', openingBalance: 15_000_000, openingDate: start, archived: false, order: 1 },
    tunai: { id: newId(), name: 'Cash (TEST)', kind: 'tunai', institution: '', openingBalance: 500_000, openingDate: start, archived: false, order: 2 },
    ew: { id: newId(), name: 'E-wallet (TEST)', kind: 'ewallet', institution: '', openingBalance: 200_000, openingDate: start, archived: false, order: 3 },
  };
  const hold = {
    emas: { id: newId(), name: 'Antam Gold (TEST)', instrumentId: inst('Gold'), platform: 'Pegadaian', openingCost: 5_000_000, openingUnits: 5, active: true },
    rdpu: { id: newId(), name: 'Money Market Fund (TEST)', instrumentId: inst('Money Market Fund'), platform: 'Fund App', openingCost: 0, openingUnits: 0, active: true },
    depo: { id: newId(), name: '3-month Deposit (TEST)', instrumentId: inst('Time Deposit (Deposito)'), platform: 'Bank Digital B', openingCost: 0, openingUnits: 0, active: true },
    saham: { id: newId(), name: 'Bank Stock (TEST)', instrumentId: inst('Stocks'), platform: 'Sekuritas C', openingCost: 3_000_000, openingUnits: 500, active: true },
  };

  const c = {
    makan: top(TX.EXPENSE, 'Food & Beverages'),
    transport: top(TX.EXPENSE, 'Transportation'),
    tagihan: top(TX.EXPENSE, 'Housing & Bills'),
    belanja: top(TX.EXPENSE, 'Shopping'),
    hiburan: top(TX.EXPENSE, 'Entertainment & Leisure'),
    langganan: top(TX.EXPENSE, 'Subscriptions & Services'),
    kesehatan: top(TX.EXPENSE, 'Health & Wellness'),
    gaji: top(TX.INCOME, 'Salary'),
    hasil: top(TX.INCOME, 'Investment Income'),
    ibadah: top(TX.GIVING, 'Worship & Religious'),
    donasi: top(TX.GIVING, 'Social Donations'),
  };
  const txs = [];
  let seq = 0;
  const add = (t) => {
    seq += 1;
    const created = new Date(Date.parse(`${t.date}T05:00:00Z`) + seq * 1000).toISOString();
    txs.push({ id: newId(), createdAt: created, updatedAt: created, ...t });
  };

  for (let d = start; d <= today; d = addDays(d, 1)) {
    const day = Number(d.slice(8, 10));
    const wd = weekdayIndex(d);
    // Meals and transport almost every day.
    add({ type: TX.EXPENSE, date: d, amount: between(25_000, 85_000), accountId: r() < 0.5 ? acc.tunai.id : acc.ew.id, categoryId: c.makan, subcategoryId: sub(c.makan, r() < 0.7 ? 'Dining out' : 'Coffee & snacks'), note: 'Meal (TEST)' });
    if (wd < 5) add({ type: TX.EXPENSE, date: d, amount: between(15_000, 60_000), accountId: acc.ew.id, categoryId: c.transport, subcategoryId: sub(c.transport, 'Ride-hailing'), note: 'Ride (TEST)' });
    if (wd === 5) add({ type: TX.EXPENSE, date: d, amount: between(300_000, 650_000), accountId: acc.gaji.id, categoryId: c.makan, subcategoryId: sub(c.makan, 'Groceries'), note: 'Weekly groceries (TEST)' });
    if (wd === 6 && r() < 0.5) add({ type: TX.EXPENSE, date: d, amount: between(80_000, 250_000), accountId: acc.ew.id, categoryId: c.hiburan, note: 'Weekend outing (TEST)' });
    if (wd === 0) add({ type: TX.TRANSFER, date: d, amount: 500_000, accountId: acc.gaji.id, toAccountId: acc.ew.id, note: 'Top up e-wallet (TEST)' });
    if (day === 3) add({ type: TX.EXPENSE, date: d, amount: 100_000, accountId: acc.ew.id, categoryId: c.tagihan, subcategoryId: sub(c.tagihan, 'Mobile credit & data'), note: 'Data plan (TEST)' });
    if (day === 5) add({ type: TX.EXPENSE, date: d, amount: between(380_000, 520_000), accountId: acc.gaji.id, categoryId: c.tagihan, subcategoryId: sub(c.tagihan, 'Electricity'), note: 'Electricity (TEST)' });
    if (day === 7) add({ type: TX.EXPENSE, date: d, amount: 350_000, accountId: acc.gaji.id, categoryId: c.tagihan, subcategoryId: sub(c.tagihan, 'Internet'), note: 'Internet (TEST)' });
    if (day === 12) add({ type: TX.EXPENSE, date: d, amount: 65_000, accountId: acc.gaji.id, categoryId: c.langganan, note: 'Music subscription (TEST)' });
    if (day === 15 && r() < 0.6) add({ type: TX.EXPENSE, date: d, amount: between(150_000, 900_000), accountId: acc.gaji.id, categoryId: c.belanja, subcategoryId: sub(c.belanja, 'Clothing'), note: 'Shopping (TEST)' });
    if (day === 18) add({ type: TX.EXPENSE, date: d, amount: between(50_000, 300_000), accountId: acc.tunai.id, categoryId: c.kesehatan, subcategoryId: sub(c.kesehatan, 'Medicine'), note: 'Pharmacy (TEST)' });
    if (day === 20) add({ type: TX.TRANSFER, date: d, amount: 1_000_000, accountId: acc.gaji.id, toAccountId: acc.tunai.id, note: 'Cash withdrawal (TEST)' });
    if (day === 25) {
      add({ type: TX.INCOME, date: d, amount: 11_000_000, accountId: acc.gaji.id, categoryId: c.gaji, note: 'Salary (TEST)' });
    }
    if (day === 26) {
      add({ type: TX.GIVING, date: d, amount: 1_100_000, accountId: acc.gaji.id, categoryId: c.ibadah, note: 'Worship giving (TEST)' });
      if (r() < 0.5) add({ type: TX.GIVING, date: d, amount: between(100_000, 300_000), accountId: acc.ew.id, categoryId: c.donasi, note: 'Donation (TEST)' });
    }
    if (day === 27) add({ type: TX.INVEST_BUY, date: d, amount: 1_500_000, accountId: acc.gaji.id, holdingId: hold.rdpu.id, note: 'Fund top-up (TEST)' });
    if (day === 28) add({ type: TX.TRANSFER, date: d, amount: 2_000_000, accountId: acc.gaji.id, toAccountId: acc.tabungan.id, note: 'Move to savings (TEST)' });
    if (day === 1 && d !== start) add({ type: TX.INCOME, date: d, amount: between(40_000, 60_000), accountId: acc.tabungan.id, categoryId: c.hasil, subcategoryId: sub(c.hasil, 'Interest'), note: 'Savings interest (TEST)' });
  }
  add({ type: TX.INVEST_BUY, date: addDays(start, 9), amount: 5_000_000, accountId: acc.tabungan.id, holdingId: hold.depo.id, note: 'Time deposit (TEST)' });
  add({ type: TX.INVEST_BUY, date: addDays(start, 40), amount: 2_150_000, accountId: acc.gaji.id, holdingId: hold.emas.id, units: 1, unitPrice: 2_150_000, note: 'Gold 1 gram (TEST)' });
  add({ type: TX.EXPENSE, date: addDays(start, 44), amount: 50_000, accountId: acc.ew.id, categoryId: c.makan, isRefund: true, note: 'Order refund (TEST)' });

  const valuations = [
    { id: newId(), holdingId: hold.emas.id, date: addDays(start, 30), value: 10_750_000, createdAt: new Date().toISOString() },
    { id: newId(), holdingId: hold.saham.id, date: addDays(start, 50), value: 2_750_000, createdAt: new Date().toISOString() },
  ];
  return {
    accounts: Object.values(acc),
    holdings: Object.values(hold),
    transactions: txs.filter((t) => t.date <= today),
    valuations: valuations.filter((v) => v.date <= today),
  };
}
