import { html, useState, useMemo } from '../../vendor/htm-preact-standalone.module.js';
import { useApp, TopBar } from './app.js';
import { Donut, Bars, Stat, PALETTE, Icon } from './components.js';
import {
  flows, balances, holdingStates, portfolioTotals, avgDailyExpense, categoryBreakdown, monthlySeries, periodRange,
  costRemovedMap, elapsedDays,
} from '../core/ledger.js';
import { formatRp, formatCompact, formatPercent } from '../core/money.js';
import { addMonths, formatMonthLabel, formatShortDate, minIso, BULAN_SINGKAT, diffDays } from '../core/dates.js';
import { TX, GROUP } from '../core/model.js';

export function Dashboard() {
  const { snap, today, label, isTest } = useApp();
  const [kind, setKind] = useState('month');
  const [ym, setYm] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
  const [custom, setCustom] = useState({ start: today.slice(0, 8) + '01', end: today });
  const [showAccounts, setShowAccounts] = useState(false);
  const [drill, setDrill] = useState(null); // id kategori pengeluaran

  const range = kind === 'month' ? periodRange('month', snap, today, ym)
    : kind === 'custom' ? periodRange('custom', snap, today, custom)
      : periodRange('all', snap, today);
  const asOf = minIso(range.end, today);

  const m = useMemo(() => {
    const removed = costRemovedMap(snap);
    const f = flows(snap, range.start, range.end, removed);
    const bal = balances(snap, asOf);
    const states = holdingStates(snap, asOf);
    const pt = portfolioTotals(states);
    const cash = [...bal.values()].reduce((s, v) => s + v, 0);
    const endY = Number(asOf.slice(0, 4));
    const endM = Number(asOf.slice(5, 7));
    const series = monthlySeries(snap, endY, endM, 6).map((r) => ({
      label: BULAN_SINGKAT[r.m - 1].replace(/^./, (c) => c.toUpperCase()),
      income: r.income, expense: r.expense, giving: r.giving, invest: Math.max(0, r.netInvest),
    }));
    const cats = categoryBreakdown(snap, TX.EXPENSE, range.start, range.end);
    const subs = drill ? categoryBreakdown(snap, TX.EXPENSE, range.start, range.end, drill) : null;
    return { f, bal, pt, cash, series, cats, subs, avg: avgDailyExpense(f, range.start, range.end, today), days: elapsedDays(range.start, range.end, today) };
  }, [snap, range.start, range.end, asOf, drill, today]);

  const hasData = snap.accounts.length > 0;
  const lastBackup = snap.settingsMap.lastBackupAt;
  const liveCount = snap.transactions.filter((t) => !t.deletedAt).length;
  const backupDays = lastBackup ? Math.floor((Date.now() - Date.parse(lastBackup)) / 86400000) : null;
  const needBackup = !isTest && liveCount > 0 && (backupDays === null || backupDays >= 7);

  const periodLabel = kind === 'month' ? formatMonthLabel(ym.y, ym.m)
    : kind === 'all' ? `Semua (${formatShortDate(range.start)} – ${formatShortDate(range.end)})`
      : `${formatShortDate(range.start)} – ${formatShortDate(range.end)}`;
  const shift = (n) => setYm(addMonths(ym.y, ym.m, n));
  const nextDisabled = ym.y * 12 + ym.m >= Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7));

  const segs = m.cats.map((c, i) => ({ ...c, value: c.amount, color: PALETTE[i % PALETTE.length] }));
  const subSegs = m.subs?.map((c, i) => ({ ...c, value: c.amount, color: PALETTE[(i + 3) % PALETTE.length] }));
  const drillCat = drill ? m.cats.find((c) => c.id === drill) : null;
  const expenseTotal = m.cats.reduce((s, c) => s + c.amount, 0);
  const txLink = (params) => `#/transaksi?${new URLSearchParams({ from: range.start, to: range.end, ...params })}`;

  return html`
    <${TopBar} title="Neraca" />
    <main class="screen">
      <div class="seg" role="tablist">
        ${[['month', 'Bulanan'], ['all', 'Semua'], ['custom', 'Rentang']].map(([k, t]) => html`
          <button class=${kind === k ? 'on' : ''} onClick=${() => { setKind(k); setDrill(null); }}>${t}</button>`)}
      </div>
      ${kind === 'month' && html`<div class="monthnav">
        <button class="iconbtn" aria-label="Bulan sebelumnya" onClick=${() => shift(-1)}>‹</button>
        <span class="label">${periodLabel}</span>
        <button class="iconbtn" aria-label="Bulan berikutnya" disabled=${nextDisabled} onClick=${() => shift(1)}>›</button>
      </div>`}
      ${kind === 'custom' && html`<div class="row" style="margin-top:10px">
        <input class="input" type="date" value=${custom.start} max=${custom.end} onInput=${(e) => setCustom({ ...custom, start: e.target.value || custom.start })} />
        <span class="muted">–</span>
        <input class="input" type="date" value=${custom.end} min=${custom.start} onInput=${(e) => setCustom({ ...custom, end: e.target.value || custom.end })} />
      </div>`}
      ${kind === 'all' && html`<div class="monthnav"><span class="label small">${periodLabel}</span></div>`}

      ${needBackup && html`<a class="banner warn" href="#/lainnya/cadangan" style="text-decoration:none;color:inherit">
        <span>⚠️</span><span class="grow">${backupDays === null ? 'Belum pernah membuat cadangan.' : `Cadangan terakhir ${backupDays} hari lalu.`} Data hanya ada di HP ini. <b>Cadangkan sekarang</b></span></a>`}

      ${!hasData && html`<div class="banner info"><span>👋</span><span class="grow">Mulai dengan menambahkan akun dan saldo awalnya di <a href="#/lainnya/akun">Lainnya › Akun</a>.</span></div>`}

      <section class="card">
        <h2>Posisi</h2>
        <div class="sub">Per ${formatShortDate(asOf)}${asOf === today ? ' (hari ini)' : ''}</div>
        <div class="row between tap" onClick=${() => setShowAccounts(!showAccounts)}>
          <div>
            <div class="muted small">Kas & Bank</div>
            <div class="big num">${formatRp(m.cash)}</div>
          </div>
          <span class="muted small">${showAccounts ? 'Tutup' : `${snap.accounts.filter((a) => !a.archived).length} akun`} ›</span>
        </div>
        ${showAccounts && html`<div style="margin-top:8px">${snap.accounts.filter((a) => !a.archived || m.bal.get(a.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((a) => html`
          <a class="list-row" href=${txLink({ akun: a.id })} style="text-decoration:none;color:inherit">
            <div class="grow"><div class="title">${a.name}</div><div class="meta">${a.institution || ''}</div></div>
            <div class="num ${m.bal.get(a.id) < 0 ? 'c-danger' : ''}">${formatRp(m.bal.get(a.id))}</div>
          </a>`)}</div>`}
        <div class="divider"></div>
        <div class="grid2">
          <${Stat} label="Nilai portofolio" value=${formatRp(m.pt.value)} hint=${m.pt.unvalued ? `${m.pt.unvalued} posisi belum dinilai` : `Modal ${formatCompact(m.pt.cost)}`} cls="c-invest" onClick=${() => { location.hash = '#/portofolio'; }} />
          <${Stat} label="Kekayaan bersih" value=${formatRp(m.cash + m.pt.value)} hint="Kas & Bank + portofolio" />
        </div>
      </section>

      <section class="card">
        <h2>Arus</h2>
        <div class="sub">${kind === 'month' ? formatMonthLabel(ym.y, ym.m) : periodLabel} · ${m.f.count} transaksi</div>
        <div class="grid2">
          <${Stat} label=${label(GROUP.INCOME)} value=${formatRp(m.f.income)} cls="c-income" />
          <${Stat} label=${label(GROUP.EXPENSE)} value=${formatRp(m.f.expense)} cls="c-expense" hint=${m.f.refunds ? `sudah dikurangi refund ${formatCompact(m.f.refunds)}` : null} />
          <${Stat} label=${label(GROUP.GIVING)} value=${formatRp(m.f.giving)} cls="c-giving" />
          <${Stat} label=${`${label(GROUP.INVEST)} bersih`} value=${formatRp(m.f.netInvest)} cls="c-invest" hint="beli − modal dicairkan" />
          <${Stat} label="Surplus" value=${formatRp(m.f.surplus)} hint="Pemasukan − Pengeluaran − Sedekah" />
          ${m.f.realizedGain !== 0
            ? html`<${Stat} label="Hasil investasi terealisasi" value=${formatRp(m.f.realizedGain)} />`
            : html`<${Stat} label="Transfer antar akun" value=${formatRp(m.f.transferVolume)} hint="tidak dihitung sebagai arus" />`}
        </div>
      </section>

      <section class="card">
        <h2>Rasio</h2>
        <div class="grid2">
          <${Stat} label="Saving rate" value=${formatPercent(m.f.savingRate)} hint="Surplus ÷ Pemasukan" />
          <${Stat} label="Investment rate" value=${formatPercent(m.f.investRate)} hint="Investasi bersih ÷ Pemasukan" />
          <${Stat} label="Giving rate" value=${formatPercent(m.f.givingRate)} hint="Sedekah ÷ Pemasukan" />
          <${Stat} label="Rata-rata pengeluaran harian" value=${m.avg === null ? '—' : formatRp(Math.round(m.avg))} hint=${`${m.days} hari kalender`} />
        </div>
        <a class="link small" href="#/lainnya/cara-hitung">Cara menghitung ›</a>
      </section>

      <section class="card">
        <h2>Tren 6 bulan</h2>
        <${Bars} rows=${m.series} series=${[
          { key: 'income', label: label(GROUP.INCOME), color: 'var(--income)' },
          { key: 'expense', label: label(GROUP.EXPENSE), color: 'var(--expense)' },
          { key: 'giving', label: label(GROUP.GIVING), color: 'var(--giving)' },
          { key: 'invest', label: `${label(GROUP.INVEST)} bersih`, color: 'var(--invest)' },
        ]} />
      </section>

      <section class="card">
        <div class="row between">
          <h2 style="margin:0">${drillCat ? drillCat.name : `${label(GROUP.EXPENSE)} per kategori`}</h2>
          ${drillCat && html`<button class="link small" onClick=${() => setDrill(null)}>‹ Semua kategori</button>`}
        </div>
        ${(drillCat ? subSegs : segs).length === 0
          ? html`<div class="empty">Belum ada pengeluaran pada periode ini.</div>`
          : html`
            <div style="display:grid;place-items:center;margin:12px 0 4px">
              <${Donut} segments=${drillCat ? subSegs : segs}
                center=${formatCompact(drillCat ? drillCat.amount : expenseTotal)}
                sub=${drillCat ? 'kategori ini' : 'total pengeluaran'}
                onSelect=${(i) => { if (!drillCat) setDrill(segs[i].id); }} />
            </div>
            <div class="legend">${(drillCat ? subSegs : segs).map((c) => html`
              <a class="list-row" style="text-decoration:none;color:inherit"
                href=${drillCat ? txLink({ kategori: drill, ...(c.id !== '__none__' ? { sub: c.id } : {}) }) : undefined}
                onClick=${drillCat ? undefined : (e) => { e.preventDefault(); if (c.id !== '__none__') setDrill(c.id); }}>
                <i class="dot" style=${`background:${c.color}`}></i>
                <div class="grow"><div class="title">${c.icon ? `${c.icon} ` : ''}${c.name}</div><div class="meta">${c.count} transaksi · ${formatPercent(c.amount / (drillCat ? drillCat.amount : expenseTotal))}</div></div>
                <div class="num">${formatRp(c.amount)}</div>
                <span class="faint">${Icon.chevron()}</span>
              </a>`)}</div>`}
      </section>

      <section class="card">
        <h2>${label(GROUP.GIVING)} per bulan</h2>
        <${Bars} rows=${m.series} height=${130} series=${[{ key: 'giving', label: label(GROUP.GIVING), color: 'var(--giving)' }]} />
        <div class="muted small" style="margin-top:6px">Giving rate periode ini: <b class="num">${formatPercent(m.f.givingRate)}</b></div>
      </section>
    </main>`;
}
