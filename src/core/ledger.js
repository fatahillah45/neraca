// Mesin hitung Neraca. Semua fungsi murni: menerima snapshot data, tidak menyentuh DOM atau database.
// data = { accounts, categories, instruments, holdings, transactions, valuations }
import { TX, LIQUIDITY } from './model.js';
import { addDays, countDaysInclusive, minIso, monthRange, addMonths, formatMonthLabel } from './dates.js';

const byDateThenCreated = (a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));

export function liveTransactions(txs) {
  return txs.filter((t) => !t.deletedAt);
}

/** Perubahan saldo per akun akibat satu transaksi. */
export function cashEffects(tx) {
  switch (tx.type) {
    case TX.INCOME:
      return [{ accountId: tx.accountId, delta: tx.amount }];
    case TX.EXPENSE:
      return [{ accountId: tx.accountId, delta: tx.isRefund ? tx.amount : -tx.amount }];
    case TX.GIVING:
    case TX.INVEST_BUY:
      return [{ accountId: tx.accountId, delta: -tx.amount }];
    case TX.INVEST_SELL:
      return [{ accountId: tx.accountId, delta: tx.amount }];
    case TX.TRANSFER:
      return [
        { accountId: tx.accountId, delta: -tx.amount },
        { accountId: tx.toAccountId, delta: tx.amount },
      ];
    case TX.ADJUSTMENT:
      return [{ accountId: tx.accountId, delta: tx.sign < 0 ? -tx.amount : tx.amount }];
    default:
      throw new Error(`Jenis transaksi tidak dikenal: ${tx.type}`);
  }
}

/** Efek bersih ke total Kas & Bank. Transfer selalu 0. */
export function netCashEffect(tx) {
  return cashEffects(tx).reduce((s, e) => s + e.delta, 0);
}

/** Saldo semua akun pada akhir hari asOf (null = semua waktu). Akun yang belum dibuka bersaldo 0. */
export function balances(data, asOf = null) {
  const map = new Map();
  for (const a of data.accounts) {
    const opened = !asOf || !a.openingDate || a.openingDate <= asOf;
    map.set(a.id, opened ? a.openingBalance || 0 : 0);
  }
  for (const tx of data.transactions) {
    if (tx.deletedAt || (asOf && tx.date > asOf)) continue;
    for (const e of cashEffects(tx)) {
      if (map.has(e.accountId)) map.set(e.accountId, map.get(e.accountId) + e.delta);
    }
  }
  return map;
}

export function totalCash(data, asOf = null) {
  let s = 0;
  for (const v of balances(data, asOf).values()) s += v;
  return s;
}

// ---------- Investasi ----------

/**
 * Riwayat satu posisi secara kronologis. Modal yang ditarik saat pencairan dihitung ulang setiap kali,
 * sehingga koreksi transaksi lama selalu tercermin:
 * 1. closePosition -> seluruh modal tersisa;
 * 2. unit diisi dan unit dimiliki diketahui -> proporsional terhadap unit;
 * 3. selain itu -> metode pemulihan modal: min(jumlah diterima, modal tersisa).
 */
export function holdingHistory(holding, txs, asOf = null) {
  let cost = holding.openingCost || 0;
  let units = holding.openingUnits || 0;
  const costRemovedById = new Map();
  const events = txs
    .filter((t) => !t.deletedAt && t.holdingId === holding.id && (t.type === TX.INVEST_BUY || t.type === TX.INVEST_SELL))
    .filter((t) => !asOf || t.date <= asOf)
    .sort(byDateThenCreated);
  for (const t of events) {
    if (t.type === TX.INVEST_BUY) {
      cost += t.amount;
      if (t.units) units += t.units;
    } else {
      let removed;
      if (t.closePosition) removed = cost;
      else if (t.units && units > 0) removed = Math.round((cost * Math.min(t.units, units)) / units);
      else removed = Math.min(t.amount, cost);
      removed = Math.max(0, Math.min(removed, cost));
      cost -= removed;
      if (t.closePosition) units = 0;
      else if (t.units) units = Math.max(0, units - t.units);
      costRemovedById.set(t.id, removed);
    }
  }
  return { cost, units, events, costRemovedById };
}

/** Peta id transaksi pencairan -> modal yang ditarik, untuk semua posisi. */
export function costRemovedMap(data) {
  const map = new Map();
  for (const h of data.holdings) {
    for (const [k, v] of holdingHistory(h, data.transactions).costRemovedById) map.set(k, v);
  }
  return map;
}

/**
 * Keadaan setiap posisi pada asOf.
 * Nilai = penilaian terakhir + pembelian sesudahnya - jumlah diterima dari pencairan sesudahnya (minimal 0).
 * Tanpa penilaian, nilai = modal dan diberi status 'belum_dinilai'.
 */
export function holdingStates(data, asOf = null) {
  return data.holdings.map((h) => {
    const { cost, units, events } = holdingHistory(h, data.transactions, asOf);
    const vals = data.valuations
      .filter((v) => v.holdingId === h.id && (!asOf || v.date <= asOf))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))));
    const last = vals.at(-1) ?? null;
    let value;
    let status;
    if (last) {
      const after = events.filter((t) => t.date > last.date);
      value = last.value;
      for (const t of after) value += t.type === TX.INVEST_BUY ? t.amount : -t.amount;
      const closedAfter = after.some((t) => t.closePosition);
      if (closedAfter && cost === 0) value = 0;
      value = Math.max(0, value);
      status = after.length ? 'perkiraan' : 'dinilai';
    } else {
      value = cost;
      status = 'belum_dinilai';
    }
    const isOpen = cost > 0 || value > 0;
    return {
      holding: h,
      cost,
      units,
      value,
      status,
      lastValuationDate: last?.date ?? null,
      unrealized: last ? value - cost : 0,
      isOpen,
    };
  });
}

export function portfolioTotals(states) {
  const open = states.filter((s) => s.isOpen);
  return {
    cost: open.reduce((s, x) => s + x.cost, 0),
    value: open.reduce((s, x) => s + x.value, 0),
    unvalued: open.filter((x) => x.status === 'belum_dinilai').length,
    estimated: open.filter((x) => x.status === 'perkiraan').length,
  };
}

// ---------- Arus dan metrik ----------

/** Arus dalam periode [start, end] inklusif. */
export function flows(data, start, end, removedMap = costRemovedMap(data)) {
  const f = {
    income: 0, expenseGross: 0, refunds: 0, giving: 0,
    investBuy: 0, investSellProceeds: 0, costRemoved: 0,
    adjustments: 0, openings: 0, transferVolume: 0, count: 0,
  };
  for (const tx of data.transactions) {
    if (tx.deletedAt || tx.date < start || tx.date > end) continue;
    f.count += 1;
    switch (tx.type) {
      case TX.INCOME: f.income += tx.amount; break;
      case TX.EXPENSE: if (tx.isRefund) f.refunds += tx.amount; else f.expenseGross += tx.amount; break;
      case TX.GIVING: f.giving += tx.amount; break;
      case TX.INVEST_BUY: f.investBuy += tx.amount; break;
      case TX.INVEST_SELL: f.investSellProceeds += tx.amount; f.costRemoved += removedMap.get(tx.id) ?? 0; break;
      case TX.TRANSFER: f.transferVolume += tx.amount; break;
      case TX.ADJUSTMENT: f.adjustments += tx.sign < 0 ? -tx.amount : tx.amount; break;
      default: break;
    }
  }
  for (const a of data.accounts) {
    if (a.openingDate && a.openingDate >= start && a.openingDate <= end) f.openings += a.openingBalance || 0;
  }
  f.expense = f.expenseGross - f.refunds;
  f.netInvest = f.investBuy - f.costRemoved;
  f.realizedGain = f.investSellProceeds - f.costRemoved;
  f.surplus = f.income - f.expense - f.giving;
  f.savingRate = f.income > 0 ? f.surplus / f.income : null;
  f.investRate = f.income > 0 ? f.netInvest / f.income : null;
  f.givingRate = f.income > 0 ? f.giving / f.income : null;
  return f;
}

/** Hari kalender yang sudah berjalan dalam periode, sampai hari ini. */
export function elapsedDays(start, end, today) {
  if (start > today) return 0;
  return countDaysInclusive(start, minIso(end, today));
}

export function avgDailyExpense(f, start, end, today) {
  const days = elapsedDays(start, end, today);
  return days > 0 ? f.expense / days : null;
}

/**
 * Pemeriksa rekonsiliasi: perubahan total Kas & Bank harus sama dengan
 * Pemasukan - Pengeluaran - Sedekah - Investasi beli + Jumlah diterima dari pencairan ± Penyesuaian + Saldo awal akun baru.
 */
export function reconcile(data, start, end) {
  const f = flows(data, start, end);
  const actual = totalCash(data, end) - totalCash(data, addDays(start, -1));
  const expected = f.income - f.expense - f.giving - f.investBuy + f.investSellProceeds + f.adjustments + f.openings;
  return { ok: actual === expected, actual, expected, flows: f };
}

/** Rentang periode untuk dashboard. */
export function periodRange(kind, data, today, custom = null) {
  if (kind === 'month') {
    const { y, m } = custom ?? { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) };
    return monthRange(y, m);
  }
  if (kind === 'custom') return { start: custom.start, end: custom.end };
  // 'all': sejak tanggal tercatat paling awal sampai hari ini (atau transaksi terakhir bila lebih akhir).
  const dates = [
    ...data.accounts.map((a) => a.openingDate).filter(Boolean),
    ...liveTransactions(data.transactions).map((t) => t.date),
  ].sort();
  const start = dates[0] ?? today;
  const last = dates.at(-1) ?? today;
  return { start: start <= today ? start : today, end: last > today ? last : today };
}

// ---------- Rincian dan tren ----------

/**
 * Rincian per kategori untuk satu jenis (expense/income/giving) dalam periode.
 * parentId null -> per kategori; parentId diisi -> per subkategori di bawah kategori itu.
 * Refund mengurangi kategori asalnya.
 */
export function categoryBreakdown(data, type, start, end, parentId = null) {
  const names = new Map(data.categories.map((c) => [c.id, c]));
  const acc = new Map();
  for (const tx of data.transactions) {
    if (tx.deletedAt || tx.type !== type || tx.date < start || tx.date > end) continue;
    if (parentId && tx.categoryId !== parentId) continue;
    const key = parentId ? tx.subcategoryId ?? '__none__' : tx.categoryId ?? '__none__';
    const sign = type === TX.EXPENSE && tx.isRefund ? -1 : 1;
    const row = acc.get(key) ?? { id: key, amount: 0, count: 0 };
    row.amount += sign * tx.amount;
    row.count += 1;
    acc.set(key, row);
  }
  return [...acc.values()]
    .map((r) => ({
      ...r,
      name: r.id === '__none__' ? (parentId ? 'Tanpa subkategori' : 'Tanpa kategori') : names.get(r.id)?.name ?? '(kategori terhapus)',
      icon: names.get(r.id)?.icon ?? '',
    }))
    .filter((r) => r.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
}

/** Arus per bulan untuk n bulan yang berakhir di (y, m). */
export function monthlySeries(data, y, m, n = 6) {
  const removed = costRemovedMap(data);
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const p = addMonths(y, m, -i);
    const r = monthRange(p.y, p.m);
    out.push({ y: p.y, m: p.m, label: formatMonthLabel(p.y, p.m), ...r, ...flows(data, r.start, r.end, removed) });
  }
  return out;
}

// ---------- Risiko portofolio ----------

/**
 * Eksposur berdasarkan klasifikasi (bukan risiko statistik).
 * Skor tertimbang = jumlah (porsi nilai posisi x skor instrumen).
 */
export function portfolioRisk(data, asOf = null) {
  const instruments = new Map(data.instruments.map((i) => [i.id, i]));
  const states = holdingStates(data, asOf).filter((s) => s.isOpen && s.value > 0);
  const total = states.reduce((s, x) => s + x.value, 0);
  if (total === 0) return { total: 0, weightedScore: null, byInstrument: [], contributors: [], liquidity: [], byPlatform: [], largestShare: null };
  const rows = states.map((s) => {
    const inst = instruments.get(s.holding.instrumentId);
    const share = s.value / total;
    const score = inst?.riskScore ?? 3;
    return { state: s, instrument: inst, share, score, contribution: share * score, liquidity: inst?.liquidity ?? LIQUIDITY.MONTH };
  });
  const group = (keyFn, labelFn) => {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      const g = m.get(k) ?? { key: k, label: labelFn(r), value: 0, share: 0 };
      g.value += r.state.value;
      g.share += r.share;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  };
  return {
    total,
    weightedScore: rows.reduce((s, r) => s + r.contribution, 0),
    byInstrument: group((r) => r.instrument?.id ?? '-', (r) => r.instrument?.name ?? 'Tanpa instrumen'),
    contributors: [...rows].sort((a, b) => b.contribution - a.contribution),
    liquidity: [LIQUIDITY.FAST, LIQUIDITY.MONTH, LIQUIDITY.LONG].map((k) => {
      const v = rows.filter((r) => r.liquidity === k).reduce((s, r) => s + r.state.value, 0);
      return { key: k, value: v, share: v / total };
    }),
    byPlatform: group((r) => (r.state.holding.platform || '').trim().toLowerCase() || '-', (r) => r.state.holding.platform || 'Tanpa platform'),
    largestShare: Math.max(...rows.map((r) => r.share)),
  };
}
