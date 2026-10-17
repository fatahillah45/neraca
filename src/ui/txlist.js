import { html, useState, useMemo } from '../../vendor/htm-preact-standalone.module.js';
import { useApp, TopBar } from './app.js';
import { TYPE_COLOR } from './components.js';
import { TX, GROUP, groupOfType } from '../core/model.js';
import { formatRp, formatPercent } from '../core/money.js';
import { formatLongDate, monthRange, addMonths, formatMonthLabel } from '../core/dates.js';
import { netCashEffect, costRemovedMap } from '../core/ledger.js';

function parseQuery(route) {
  const q = route.split('?')[1] ?? '';
  return Object.fromEntries(new URLSearchParams(q));
}

export function TxList({ route }) {
  const { snap, today, label, openForm, typeGroups } = useApp();
  const q = parseQuery(route);
  const [ym, setYm] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
  const [group, setGroup] = useState('all');
  const [text, setText] = useState('');
  const fixedRange = q.from && q.to;
  const range = fixedRange ? { start: q.from, end: q.to } : monthRange(ym.y, ym.m);

  const lk = useMemo(() => ({
    acc: new Map(snap.accounts.map((a) => [a.id, a])),
    cat: new Map(snap.categories.map((c) => [c.id, c])),
    hold: new Map(snap.holdings.map((h) => [h.id, h])),
    removed: costRemovedMap(snap),
  }), [snap]);

  const rows = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return snap.transactions.filter((t) => {
      if (t.deletedAt || t.date < range.start || t.date > range.end) return false;
      if (group !== 'all' && groupOfType(t.type) !== group) return false;
      if (q.akun && t.accountId !== q.akun && t.toAccountId !== q.akun) return false;
      if (q.kategori && t.categoryId !== q.kategori) return false;
      if (q.sub && t.subcategoryId !== q.sub) return false;
      if (needle) {
        const hay = [t.note, lk.cat.get(t.categoryId)?.name, lk.cat.get(t.subcategoryId)?.name, lk.acc.get(t.accountId)?.name, lk.hold.get(t.holdingId)?.name, String(t.amount)].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.createdAt).localeCompare(String(a.createdAt))));
  }, [snap, range.start, range.end, group, text, route]);

  const byDay = [];
  for (const t of rows) {
    const last = byDay.at(-1);
    if (last && last.date === t.date) last.items.push(t);
    else byDay.push({ date: t.date, items: [t] });
  }

  const title = (t) => {
    if (t.type === TX.TRANSFER) return `${lk.acc.get(t.accountId)?.name ?? '?'} → ${lk.acc.get(t.toAccountId)?.name ?? '?'}`;
    if (t.type === TX.INVEST_BUY || t.type === TX.INVEST_SELL) return `${t.type === TX.INVEST_BUY ? 'Beli' : 'Cairkan'} ${lk.hold.get(t.holdingId)?.name ?? ''}`;
    if (t.type === TX.ADJUSTMENT) return `Penyesuaian ${lk.acc.get(t.accountId)?.name ?? ''}`;
    const c = lk.cat.get(t.categoryId);
    const s = lk.cat.get(t.subcategoryId);
    return `${c?.icon ? `${c.icon} ` : ''}${c?.name ?? '(tanpa kategori)'}${s ? ` · ${s.name}` : ''}${t.isRefund ? ' (refund)' : ''}`;
  };
  const shown = (t) => {
    const net = netCashEffect(t);
    if (t.type === TX.TRANSFER) return { text: formatRp(t.amount), cls: 'c-transfer' };
    return { text: `${net > 0 ? '+' : net < 0 ? '−' : ''}${formatRp(Math.abs(net))}`, cls: `c-${groupOfType(t.type) === GROUP.ADJUSTMENT ? 'transfer' : groupOfType(t.type)}` };
  };
  const filterNote = [q.akun && lk.acc.get(q.akun)?.name, q.kategori && lk.cat.get(q.kategori)?.name, q.sub && lk.cat.get(q.sub)?.name].filter(Boolean).join(' · ');

  return html`
    <${TopBar} title="Transaksi" back=${fixedRange ? '#/' : null} />
    <main class="screen">
      ${fixedRange
        ? html`<div class="banner info"><span class="grow small">${range.start} – ${range.end}${filterNote ? ` · ${filterNote}` : ''}</span><a class="link small" href="#/transaksi">Hapus filter</a></div>`
        : html`<div class="monthnav">
          <button class="iconbtn" aria-label="Bulan sebelumnya" onClick=${() => setYm(addMonths(ym.y, ym.m, -1))}>‹</button>
          <span class="label">${formatMonthLabel(ym.y, ym.m)}</span>
          <button class="iconbtn" aria-label="Bulan berikutnya" onClick=${() => setYm(addMonths(ym.y, ym.m, 1))}>›</button>
        </div>`}
      <input class="input" type="search" placeholder="Cari catatan, kategori, akun, atau jumlah" value=${text} onInput=${(e) => setText(e.target.value)} style="margin-top:8px" />
      <div class="chips" style="margin-top:8px">
        <button class=${`chip ${group === 'all' ? 'on' : ''}`} onClick=${() => setGroup('all')}>Semua</button>
        ${typeGroups.map((g) => html`<button class=${`chip ${group === g.key ? 'on' : ''}`} onClick=${() => setGroup(g.key)}>${g.label}</button>`)}
      </div>
      ${byDay.length === 0 && html`<div class="empty">Tidak ada transaksi.</div>`}
      ${byDay.map((d) => {
        const net = d.items.reduce((s, t) => s + netCashEffect(t), 0);
        return html`<section class="card" style="padding:4px 14px">
          <div class="row between" style="padding:10px 0 4px"><b class="small">${formatLongDate(d.date)}</b><span class="small num faint">${net >= 0 ? '+' : '−'}${formatRp(Math.abs(net))}</span></div>
          ${d.items.map((t) => {
            const s = shown(t);
            return html`<div class="list-row tap" onClick=${() => openForm(t)}>
              <i class="dot" style=${`background:${TYPE_COLOR[groupOfType(t.type)]}`}></i>
              <div class="grow"><div class="title">${title(t)}</div>
                <div class="meta">${[t.type !== TX.TRANSFER ? lk.acc.get(t.accountId)?.name : null, t.note, t.linkedTo ? 'biaya transfer' : null].filter(Boolean).join(' · ')}</div></div>
              <div class=${`num ${s.cls}`} style="font-weight:600">${s.text}</div>
            </div>`;
          })}
        </section>`;
      })}
    </main>`;
}
