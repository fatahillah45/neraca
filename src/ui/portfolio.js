import { html, useState, useMemo } from '../../vendor/htm-preact-standalone.module.js';
import { useApp, TopBar } from './app.js';
import { Donut, Stat, PALETTE } from './components.js';
import { holdingStates, portfolioTotals, portfolioRisk } from '../core/ledger.js';
import { formatRp, formatCompact, formatPercent, parseAmountInput, formatNumber } from '../core/money.js';
import { formatShortDate, diffDays } from '../core/dates.js';
import { LIQUIDITY_LABELS, GROUP } from '../core/model.js';
import { saveValuation } from '../db/repo.js';

const STATUS = {
  dinilai: { text: 'Valued', cls: 'ok' },
  perkiraan: { text: 'Estimated', cls: 'warn' },
  belum_dinilai: { text: 'Not valued', cls: 'warn' },
};

function scoreLabel(s) {
  if (s === null) return '—';
  if (s <= 2) return 'Low';
  if (s <= 3.5) return 'Medium';
  return 'High';
}

export function Portfolio() {
  const { snap, today, db, refresh, toast, openForm } = useApp();
  const [valuing, setValuing] = useState(null); // { holdingId, text }
  const [showClosed, setShowClosed] = useState(false);

  const { states, totals, risk, inst } = useMemo(() => {
    const st = holdingStates(snap, today);
    return { states: st, totals: portfolioTotals(st), risk: portfolioRisk(snap, today), inst: new Map(snap.instruments.map((i) => [i.id, i])) };
  }, [snap, today]);
  const open = states.filter((s) => s.isOpen).sort((a, b) => b.value - a.value);
  const closed = states.filter((s) => !s.isOpen);

  async function submitValue() {
    const v = parseAmountInput(valuing.text);
    if (v === null) return;
    await saveValuation(db, { holdingId: valuing.holdingId, date: today, value: v });
    await refresh();
    setValuing(null);
    toast('Value updated.');
  }

  const segs = risk.byInstrument.map((g, i) => ({ label: g.label, value: g.value, color: PALETTE[i % PALETTE.length], share: g.share }));
  return html`
    <${TopBar} title="Portfolio" />
    <main class="screen">
      <section class="card">
        <h2>Overview</h2>
        <div class="grid2">
          <${Stat} label="Portfolio value" value=${formatRp(totals.value)} cls="c-invest" hint=${totals.unvalued ? `${totals.unvalued} holdings shown at cost` : 'from latest valuations'} />
          <${Stat} label="Cost basis" value=${formatRp(totals.cost)} />
          <${Stat} label="Value − cost" value=${formatRp(totals.value - totals.cost)} hint="unrealized" />
          <${Stat} label="Open holdings" value=${open.length} hint=${totals.estimated ? `${totals.estimated} estimated values` : ''} />
        </div>
        <button class="btn primary block" style="margin-top:12px" onClick=${() => openForm(null, { group: GROUP.INVEST })}>Record investment</button>
      </section>

      <section class="card">
        <h2>Holdings</h2>
        ${open.length === 0 && html`<div class="empty">No investment holdings yet.</div>`}
        ${open.map((s) => {
          const age = s.lastValuationDate ? diffDays(s.lastValuationDate, today) : null;
          const st = STATUS[s.status];
          return html`<div class="list-row" style="flex-wrap:wrap">
            <div class="grow">
              <div class="title">${s.holding.name}</div>
              <div class="meta">${inst.get(s.holding.instrumentId)?.name ?? ''}${s.holding.platform ? ` · ${s.holding.platform}` : ''} · cost ${formatCompact(s.cost)}</div>
            </div>
            <div style="text-align:right">
              <div class="num" style="font-weight:650">${formatRp(s.value)}</div>
              <span class=${`pill ${age !== null && age > 30 ? 'warn' : st.cls}`}>${st.text}${s.lastValuationDate ? ` ${formatShortDate(s.lastValuationDate)}` : ''}</span>
            </div>
            <button class="link small" style="width:100%;text-align:left" onClick=${() => setValuing({ holdingId: s.holding.id, text: '' })}>Update value ›</button>
          </div>`;
        })}
        ${closed.length > 0 && html`<button class="link small" onClick=${() => setShowClosed(!showClosed)}>${showClosed ? 'Hide' : 'Show'} ${closed.length} closed holdings</button>`}
        ${showClosed && closed.map((s) => html`<div class="list-row"><div class="grow"><div class="title faint">${s.holding.name}</div></div><span class="pill">Closed</span></div>`)}
      </section>

      <section class="card">
        <h2>Allocation by instrument</h2>
        ${segs.length === 0 ? html`<div class="empty">No investment value yet.</div>` : html`
          <div style="display:grid;place-items:center;margin:8px 0"><${Donut} segments=${segs} center=${formatCompact(risk.total)} sub="portfolio value" /></div>
          <div class="legend">${segs.map((g) => html`<div class="list-row"><i class="dot" style=${`background:${g.color}`}></i><div class="grow title">${g.label}</div><div class="num muted small">${formatPercent(g.share)}</div><div class="num">${formatRp(g.value)}</div></div>`)}</div>`}
      </section>

      <section class="card">
        <h2>Risk exposure</h2>
        <div class="sub">Based on instrument classifications you can edit, not a statistical calculation.</div>
        ${risk.total === 0 ? html`<div class="empty">No data yet.</div>` : html`
          <div class="grid2">
            <${Stat} label="Weighted score (1–5)" value=${risk.weightedScore.toFixed(2)} hint=${scoreLabel(risk.weightedScore)} />
            <${Stat} label="Largest holding" value=${formatPercent(risk.largestShare)} hint="share of total value" />
          </div>
          <div class="section-label">Largest risk contributors</div>
          ${risk.contributors.slice(0, 5).map((r) => html`<div class="list-row">
            <div class="grow"><div class="title">${r.state.holding.name}</div><div class="meta">${r.instrument?.name ?? '-'} · score ${r.score} · share ${formatPercent(r.share)}</div></div>
            <div class="num small">${(r.contribution).toFixed(2)}</div></div>`)}
          <div class="section-label">Liquidity ladder</div>
          ${risk.liquidity.map((l) => html`<div style="margin:8px 0">
            <div class="row between small"><span>${LIQUIDITY_LABELS[l.key]}</span><span class="num">${formatRp(l.value)} · ${formatPercent(l.share)}</span></div>
            <div style="height:8px;background:var(--surface-2);border-radius:4px;margin-top:4px"><div style=${`height:8px;border-radius:4px;background:var(--invest);width:${Math.round(l.share * 100)}%`}></div></div>
          </div>`)}
          <div class="section-label">Concentration by platform / bank</div>
          ${risk.byPlatform.map((p) => html`<div class="list-row"><div class="grow title">${p.label}</div><div class="num muted small">${formatPercent(p.share)}</div><div class="num">${formatRp(p.value)}</div></div>`)}
          ${risk.byPlatform.some((p) => p.value > 2_000_000_000) && html`<div class="banner warn small">A platform or bank holds more than Rp2 billion. LPS insurance covers at most Rp2 billion per depositor per bank.</div>`}
          <a class="link small" href="#/more/how">How this is calculated and its assumptions ›</a>
          <a class="link small" style="display:block" href="#/more/instruments">Edit instrument scores and liquidity ›</a>`}
      </section>
    </main>
    ${valuing && html`<div class="dialog-back" onClick=${() => setValuing(null)}>
      <div class="dialog" onClick=${(e) => e.stopPropagation()}>
        <h3>Update value</h3>
        <div class="muted small">${snap.holdings.find((h) => h.id === valuing.holdingId)?.name} · as of ${formatShortDate(today)}</div>
        <div class="field"><label>Current value (Rp)</label>
          <input class="input num" inputmode="numeric" autofocus value=${valuing.text ? formatNumber(parseAmountInput(valuing.text)) : ''} onInput=${(e) => setValuing({ ...valuing, text: e.target.value })} /></div>
        <div class="row"><button class="btn grow" onClick=${() => setValuing(null)}>Cancel</button><button class="btn primary grow" onClick=${submitValue}>Save</button></div>
      </div></div>`}`;
}
