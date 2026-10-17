import { html, useState, useMemo } from '../../vendor/htm-preact-standalone.module.js';
import { useApp, TopBar } from './app.js';
import { Donut, Bars, Stat, PALETTE, Icon } from './components.js';
import {
  flows, balances, holdingStates, portfolioTotals, avgDailyExpense, categoryBreakdown, monthlySeries, periodRange,
  costRemovedMap, elapsedDays,
} from '../core/ledger.js';
import { formatRp, formatCompact, formatPercent } from '../core/money.js';
import { addMonths, formatMonthLabel, formatShortDate, minIso, MONTH_SHORT } from '../core/dates.js';
import { TX, GROUP } from '../core/model.js';

export function Dashboard() {
  const { snap, today, label, isTest } = useApp();
  const [kind, setKind] = useState('month');
  const [ym, setYm] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
  const [custom, setCustom] = useState({ start: today.slice(0, 8) + '01', end: today });
  const [showAccounts, setShowAccounts] = useState(false);
  const [drill, setDrill] = useState(null); // expense category id

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
      label: MONTH_SHORT[r.m - 1],
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
    : kind === 'all' ? `All time (${formatShortDate(range.start)} – ${formatShortDate(range.end)})`
      : `${formatShortDate(range.start)} – ${formatShortDate(range.end)}`;
  const shift = (n) => setYm(addMonths(ym.y, ym.m, n));
  const nextDisabled = ym.y * 12 + ym.m >= Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7));

  const segs = m.cats.map((c, i) => ({ ...c, value: c.amount, color: PALETTE[i % PALETTE.length] }));
  const subSegs = m.subs?.map((c, i) => ({ ...c, value: c.amount, color: PALETTE[(i + 3) % PALETTE.length] }));
  const drillCat = drill ? m.cats.find((c) => c.id === drill) : null;
  const expenseTotal = m.cats.reduce((s, c) => s + c.amount, 0);
  const txLink = (params) => `#/transactions?${new URLSearchParams({ from: range.start, to: range.end, ...params })}`;

  return html`
    <${TopBar} title="Neraca" />
    <main class="screen">
      <div class="seg" role="tablist">
        ${[['month', 'Monthly'], ['all', 'All time'], ['custom', 'Custom']].map(([k, t]) => html`
          <button class=${kind === k ? 'on' : ''} onClick=${() => { setKind(k); setDrill(null); }}>${t}</button>`)}
      </div>
      ${kind === 'month' && html`<div class="monthnav">
        <button class="iconbtn" aria-label="Previous month" onClick=${() => shift(-1)}>‹</button>
        <span class="label">${periodLabel}</span>
        <button class="iconbtn" aria-label="Next month" disabled=${nextDisabled} onClick=${() => shift(1)}>›</button>
      </div>`}
      ${kind === 'custom' && html`<div class="row" style="margin-top:10px">
        <input class="input" type="date" value=${custom.start} max=${custom.end} onInput=${(e) => setCustom({ ...custom, start: e.target.value || custom.start })} />
        <span class="muted">–</span>
        <input class="input" type="date" value=${custom.end} min=${custom.start} onInput=${(e) => setCustom({ ...custom, end: e.target.value || custom.end })} />
      </div>`}
      ${kind === 'all' && html`<div class="monthnav"><span class="label small">${periodLabel}</span></div>`}

      ${needBackup && html`<a class="banner warn" href="#/more/backup" style="text-decoration:none;color:inherit">
        <span>⚠️</span><span class="grow">${backupDays === null ? 'No backup made yet.' : `Last backup was ${backupDays} days ago.`} Your data only lives on this phone. <b>Back up now</b></span></a>`}

      ${!hasData && html`<div class="banner info"><span>👋</span><span class="grow">Start by adding your accounts and their opening balances in <a href="#/more/accounts">More › Accounts</a>.</span></div>`}

      <section class="card">
        <h2>Position</h2>
        <div class="sub">As of ${formatShortDate(asOf)}${asOf === today ? ' (today)' : ''}</div>
        <div class="row between tap" onClick=${() => setShowAccounts(!showAccounts)}>
          <div>
            <div class="muted small">Cash & bank</div>
            <div class="big num">${formatRp(m.cash)}</div>
          </div>
          <span class="muted small">${showAccounts ? 'Hide' : `${snap.accounts.filter((a) => !a.archived).length} accounts`} ›</span>
        </div>
        ${showAccounts && html`<div style="margin-top:8px">${snap.accounts.filter((a) => !a.archived || m.bal.get(a.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((a) => html`
          <a class="list-row" href=${txLink({ account: a.id })} style="text-decoration:none;color:inherit">
            <div class="grow"><div class="title">${a.name}</div><div class="meta">${a.institution || ''}</div></div>
            <div class="num ${m.bal.get(a.id) < 0 ? 'c-danger' : ''}">${formatRp(m.bal.get(a.id))}</div>
          </a>`)}</div>`}
        <div class="divider"></div>
        <div class="grid2">
          <${Stat} label="Portfolio value" value=${formatRp(m.pt.value)} hint=${m.pt.unvalued ? `${m.pt.unvalued} holdings not valued yet` : `Cost ${formatCompact(m.pt.cost)}`} cls="c-invest" onClick=${() => { location.hash = '#/portfolio'; }} />
          <${Stat} label="Net worth" value=${formatRp(m.cash + m.pt.value)} hint="Cash & bank + portfolio" />
        </div>
      </section>

      <section class="card">
        <h2>Flows</h2>
        <div class="sub">${periodLabel} · ${m.f.count} transactions</div>
        <div class="grid2">
          <${Stat} label=${label(GROUP.INCOME)} value=${formatRp(m.f.income)} cls="c-income" />
          <${Stat} label=${label(GROUP.EXPENSE)} value=${formatRp(m.f.expense)} cls="c-expense" hint=${m.f.refunds ? `net of ${formatCompact(m.f.refunds)} refunds` : null} />
          <${Stat} label=${label(GROUP.GIVING)} value=${formatRp(m.f.giving)} cls="c-giving" />
          <${Stat} label=${`Net ${label(GROUP.INVEST).toLowerCase()}`} value=${formatRp(m.f.netInvest)} cls="c-invest" hint="bought − cost cashed out" />
          <${Stat} label="Surplus" value=${formatRp(m.f.surplus)} hint=${`${label(GROUP.INCOME)} − ${label(GROUP.EXPENSE)} − ${label(GROUP.GIVING)}`} />
          ${m.f.realizedGain !== 0
            ? html`<${Stat} label="Realized investment gain" value=${formatRp(m.f.realizedGain)} />`
            : html`<${Stat} label="Transfers between accounts" value=${formatRp(m.f.transferVolume)} hint="not counted as a flow" />`}
        </div>
      </section>

      <section class="card">
        <h2>Ratios</h2>
        <div class="grid2">
          <${Stat} label="Saving rate" value=${formatPercent(m.f.savingRate)} hint=${`Surplus ÷ ${label(GROUP.INCOME)}`} />
          <${Stat} label="Investment rate" value=${formatPercent(m.f.investRate)} hint=${`Net invested ÷ ${label(GROUP.INCOME)}`} />
          <${Stat} label="Giving rate" value=${formatPercent(m.f.givingRate)} hint=${`${label(GROUP.GIVING)} ÷ ${label(GROUP.INCOME)}`} />
          <${Stat} label="Daily average spending" value=${m.avg === null ? '—' : formatRp(Math.round(m.avg))} hint=${`${m.days} calendar days`} />
        </div>
        <a class="link small" href="#/more/how">How these are calculated ›</a>
      </section>

      <section class="card">
        <h2>6-month trend</h2>
        <${Bars} rows=${m.series} series=${[
          { key: 'income', label: label(GROUP.INCOME), color: 'var(--income)' },
          { key: 'expense', label: label(GROUP.EXPENSE), color: 'var(--expense)' },
          { key: 'giving', label: label(GROUP.GIVING), color: 'var(--giving)' },
          { key: 'invest', label: `Net ${label(GROUP.INVEST).toLowerCase()}`, color: 'var(--invest)' },
        ]} />
      </section>

      <section class="card">
        <div class="row between">
          <h2 style="margin:0">${drillCat ? drillCat.name : `${label(GROUP.EXPENSE)} by category`}</h2>
          ${drillCat && html`<button class="link small" onClick=${() => setDrill(null)}>‹ All categories</button>`}
        </div>
        ${(drillCat ? subSegs : segs).length === 0
          ? html`<div class="empty">No expenses in this period.</div>`
          : html`
            <div style="display:grid;place-items:center;margin:12px 0 4px">
              <${Donut} segments=${drillCat ? subSegs : segs}
                center=${formatCompact(drillCat ? drillCat.amount : expenseTotal)}
                sub=${drillCat ? 'this category' : 'total expenses'}
                onSelect=${(i) => { if (!drillCat) setDrill(segs[i].id); }} />
            </div>
            <div class="legend">${(drillCat ? subSegs : segs).map((c) => html`
              <a class="list-row" style="text-decoration:none;color:inherit"
                href=${drillCat ? txLink({ category: drill, ...(c.id !== '__none__' ? { sub: c.id } : {}) }) : undefined}
                onClick=${drillCat ? undefined : (e) => { e.preventDefault(); if (c.id !== '__none__') setDrill(c.id); }}>
                <i class="dot" style=${`background:${c.color}`}></i>
                <div class="grow"><div class="title">${c.icon ? `${c.icon} ` : ''}${c.name}</div><div class="meta">${c.count} transactions · ${formatPercent(c.amount / (drillCat ? drillCat.amount : expenseTotal))}</div></div>
                <div class="num">${formatRp(c.amount)}</div>
                <span class="faint">${Icon.chevron()}</span>
              </a>`)}</div>`}
      </section>

      <section class="card">
        <h2>${label(GROUP.GIVING)} by month</h2>
        <${Bars} rows=${m.series} height=${130} series=${[{ key: 'giving', label: label(GROUP.GIVING), color: 'var(--giving)' }]} />
        <div class="muted small" style="margin-top:6px">Giving rate this period: <b class="num">${formatPercent(m.f.givingRate)}</b></div>
      </section>
    </main>`;
}
