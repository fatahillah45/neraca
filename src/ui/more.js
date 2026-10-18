import { html, useState } from '../../vendor/htm-preact-standalone.module.js';
import { useApp, TopBar } from './app.js';
import { Icon } from './components.js';
import { ExportScreen, BackupScreen } from './exportui.js';
import { TX, ACCOUNT_KINDS, LIQUIDITY, LIQUIDITY_LABELS, DEFAULT_TYPE_GROUPS } from '../core/model.js';
import { formatRp, parseAmountInput, formatNumber } from '../core/money.js';
import { formatShortDate } from '../core/dates.js';
import { balances } from '../core/ledger.js';
import { validateAccount, validateName } from '../core/validate.js';
import { saveAccount, saveCategory, saveInstrument, saveHolding, reorder, restoreTransaction, setSetting, TRASH_DAYS } from '../db/repo.js';

export function More({ route }) {
  const sub = route.split('?')[0].replace(/^\/more\/?/, '');
  switch (sub) {
    case 'accounts': return html`<${Accounts} />`;
    case 'categories': return html`<${Categories} />`;
    case 'instruments': return html`<${Instruments} />`;
    case 'export': return html`<${ExportScreen} />`;
    case 'backup': return html`<${BackupScreen} />`;
    case 'types': return html`<${Types} />`;
    case 'trash': return html`<${Trash} />`;
    case 'how': return html`<${How} />`;
    case 'mode': return html`<${Mode} />`;
    default: return html`<${Menu} />`;
  }
}

function Menu() {
  const { isTest } = useApp();
  const item = (href, title, meta) => html`<a class="list-row" href=${href} style="text-decoration:none;color:inherit">
    <div class="grow"><div class="title">${title}</div>${meta && html`<div class="meta">${meta}</div>`}</div><span class="faint">${Icon.chevron()}</span></a>`;
  return html`<${TopBar} title="More" />
    <main class="screen">
      <section class="card" style="padding:4px 16px">
        ${item('#/more/export', 'Export to Excel', 'Weekly workbooks and all transactions')}
        ${item('#/more/backup', 'Backup & restore', 'Keep your data safe outside this phone')}
      </section>
      <section class="card" style="padding:4px 16px">
        ${item('#/more/accounts', 'Accounts', 'Bank accounts, cash, e-wallets, opening balances')}
        ${item('#/more/categories', 'Categories & subcategories')}
        ${item('#/more/instruments', 'Instruments & holdings', 'Risk profile and liquidity')}
        ${item('#/more/types', 'Transaction type names')}
        ${item('#/more/trash', 'Trash', `Deleted transactions, kept ${TRASH_DAYS} days`)}
      </section>
      <section class="card" style="padding:4px 16px">
        ${item('#/more/how', 'How it is calculated', 'Metric formulas and risk assumptions')}
        ${item('#/more/mode', 'Data mode', isTest ? 'Currently using TEST DATA' : 'Currently using real data')}
      </section>
      <p class="faint small" style="text-align:center">Neraca v0.2.1 · data is stored only on this phone</p>
    </main>`;
}

function Accounts() {
  const { snap, today, db, refresh, toast } = useApp();
  const [edit, setEdit] = useState(null);
  const [errors, setErrors] = useState({});
  const bal = balances(snap, today);
  const list = [...snap.accounts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  async function save() {
    const acc = { ...edit, name: (edit.name ?? '').trim(), openingBalance: parseAmountInput(edit.openingText) ?? 0 };
    if (edit.negative) acc.openingBalance = -acc.openingBalance;
    delete acc.openingText; delete acc.negative;
    const v = validateAccount(acc, snap);
    if (!v.ok) { setErrors(Object.fromEntries(v.errors.map((e) => [e.field, e.message]))); return; }
    await saveAccount(db, acc);
    await refresh();
    setEdit(null); setErrors({});
    toast('Account saved.');
  }
  async function toggleArchive(a) {
    if (!a.archived && bal.get(a.id) !== 0) toast(`${a.name} still holds ${formatRp(bal.get(a.id))}; it stays in the total.`);
    await saveAccount(db, { ...a, archived: !a.archived });
    await refresh();
  }
  async function move(i, d) {
    const ids = list.map((a) => a.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorder(db, 'accounts', ids);
    await refresh();
  }

  if (edit) {
    const err = (f) => errors[f] && html`<div class="err">${errors[f]}</div>`;
    return html`<${TopBar} title=${edit.id ? 'Edit account' : 'New account'} />
      <main class="screen">
        <div class="field"><label>Account name</label><input class="input" value=${edit.name} placeholder="e.g. Salary account" onInput=${(e) => setEdit({ ...edit, name: e.target.value })} />${err('name')}</div>
        <div class="field"><label>Account type</label><div class="chips wrap">${ACCOUNT_KINDS.map((k) => html`<button class=${`chip ${edit.kind === k.key ? 'on' : ''}`} onClick=${() => setEdit({ ...edit, kind: k.key })}>${k.label}</button>`)}</div></div>
        <div class="field"><label>Institution (optional)</label><input class="input" value=${edit.institution ?? ''} placeholder="e.g. bank name" onInput=${(e) => setEdit({ ...edit, institution: e.target.value })} /></div>
        <div class="field"><label>Opening balance (Rp)</label><input class="input num" inputmode="numeric" value=${edit.openingText} onInput=${(e) => setEdit({ ...edit, openingText: formatNumber(parseAmountInput(e.target.value)) })} />${err('openingBalance')}
          <label class="row small muted" style="margin-top:6px"><input type="checkbox" checked=${!!edit.negative} onChange=${(e) => setEdit({ ...edit, negative: e.target.checked })} /> Opening balance is negative</label></div>
        <div class="field"><label>Opening balance date</label><input class="input" type="date" value=${edit.openingDate} onInput=${(e) => setEdit({ ...edit, openingDate: e.target.value })} />${err('openingDate')}
          <div class="faint small" style="margin-top:4px">The opening balance is not income. Transactions in this account cannot be dated before this day.</div></div>
        <div class="row"><button class="btn grow" onClick=${() => { setEdit(null); setErrors({}); }}>Cancel</button><button class="btn primary grow" onClick=${save}>Save</button></div>
      </main>`;
  }
  return html`<${TopBar} title="Accounts" back="#/more" />
    <main class="screen">
      <button class="btn primary block" onClick=${() => setEdit({ name: '', kind: 'rekening', institution: '', openingText: '0', openingDate: today })}>+ Add account</button>
      <section class="card" style="padding:4px 16px">
        ${list.length === 0 && html`<div class="empty">No accounts yet.</div>`}
        ${list.map((a, i) => html`<div class="list-row">
          <div class="grow tap" onClick=${() => setEdit({ ...a, openingText: formatNumber(Math.abs(a.openingBalance)), negative: a.openingBalance < 0 })}>
            <div class="title ${a.archived ? 'faint' : ''}">${a.name}${a.archived ? ' (archived)' : ''}</div>
            <div class="meta">${ACCOUNT_KINDS.find((k) => k.key === a.kind)?.label ?? ''} · opening ${formatRp(a.openingBalance)} on ${formatShortDate(a.openingDate)}</div></div>
          <div class="num">${formatRp(bal.get(a.id))}</div>
          <button class="iconbtn" aria-label="Move up" onClick=${() => move(i, -1)}>↑</button>
          <button class="iconbtn" aria-label=${a.archived ? 'Unarchive' : 'Archive'} onClick=${() => toggleArchive(a)}>${a.archived ? '↺' : '🗄'}</button>
        </div>`)}
      </section>
      <p class="faint small">Accounts cannot be deleted so your history stays intact; archive accounts you no longer use.</p>
    </main>`;
}

function Categories() {
  const { snap, db, refresh, label } = useApp();
  const [type, setType] = useState(TX.EXPENSE);
  const [edit, setEdit] = useState(null); // { id?, name, icon, parentId, active }
  const [error, setError] = useState(null);
  const tops = snap.categories.filter((c) => c.type === type && !c.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const children = (id) => snap.categories.filter((c) => c.parentId === id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  async function save() {
    const siblings = snap.categories.filter((c) => c.type === type && (c.parentId ?? null) === (edit.parentId ?? null));
    const e = validateName(edit.name, siblings, edit.id);
    if (e) { setError(e); return; }
    await saveCategory(db, { ...edit, type, name: edit.name.trim() });
    await refresh();
    setEdit(null); setError(null);
  }
  async function move(list, i, d) {
    const ids = list.map((c) => c.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorder(db, 'categories', ids);
    await refresh();
  }
  const row = (c, list, i, isSub) => html`<div class="list-row" style=${isSub ? 'padding-left:24px' : ''}>
    <div class="grow tap" onClick=${() => setEdit({ ...c })}><div class="title ${c.active ? '' : 'faint'}">${c.icon ? `${c.icon} ` : ''}${c.name}${c.active ? '' : ' (inactive)'}</div></div>
    <button class="iconbtn" aria-label="Move up" onClick=${() => move(list, i, -1)}>↑</button>
    ${!isSub && html`<button class="iconbtn" aria-label="Add subcategory" onClick=${() => setEdit({ name: '', icon: '', parentId: c.id, active: true })}>＋</button>`}
  </div>`;

  return html`<${TopBar} title="Categories" back="#/more" />
    <main class="screen">
      <div class="seg">${[TX.EXPENSE, TX.INCOME, TX.GIVING].map((t) => html`<button class=${type === t ? 'on' : ''} onClick=${() => setType(t)}>${label(t)}</button>`)}</div>
      <button class="btn primary block" style="margin-top:12px" onClick=${() => setEdit({ name: '', icon: '', parentId: null, active: true })}>+ New category</button>
      <section class="card" style="padding:4px 16px">
        ${tops.map((c, i) => html`${row(c, tops, i, false)}${children(c.id).map((s, j, arr) => row(s, arr, j, true))}`)}
      </section>
      <p class="faint small">Categories that have been used are deactivated rather than deleted, so history and reports stay correct.</p>
    </main>
    ${edit && html`<div class="dialog-back" onClick=${() => setEdit(null)}><div class="dialog" onClick=${(e) => e.stopPropagation()}>
      <h3>${edit.id ? 'Edit' : 'Add'} ${edit.parentId ? 'subcategory' : 'category'}</h3>
      <div class="field"><label>Name</label><input class="input" value=${edit.name} onInput=${(e) => setEdit({ ...edit, name: e.target.value })} />${error && html`<div class="err">${error}</div>`}</div>
      ${!edit.parentId && html`<div class="field"><label>Icon (emoji, optional)</label><input class="input" maxlength="4" value=${edit.icon} onInput=${(e) => setEdit({ ...edit, icon: e.target.value })} /></div>`}
      ${edit.id && html`<label class="row" style="min-height:44px"><input type="checkbox" checked=${edit.active} onChange=${(e) => setEdit({ ...edit, active: e.target.checked })} style="width:22px;height:22px" /> Active (shown in the form)</label>`}
      <div class="row" style="margin-top:12px"><button class="btn grow" onClick=${() => setEdit(null)}>Cancel</button><button class="btn primary grow" onClick=${save}>Save</button></div>
    </div></div>`}`;
}

function Instruments() {
  const { snap, db, refresh } = useApp();
  const [edit, setEdit] = useState(null);
  const [hold, setHold] = useState(null);
  const [error, setError] = useState(null);
  const insts = [...snap.instruments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  async function saveInst() {
    const e = validateName(edit.name, snap.instruments, edit.id);
    if (e) { setError(e); return; }
    await saveInstrument(db, { ...edit, name: edit.name.trim(), riskScore: Number(edit.riskScore) });
    await refresh(); setEdit(null); setError(null);
  }
  async function saveHold() {
    const e = validateName(hold.name, snap.holdings, hold.id);
    if (e) { setError(e); return; }
    if (!hold.instrumentId) { setError('Choose an instrument.'); return; }
    await saveHolding(db, { ...hold, name: hold.name.trim(), openingCost: parseAmountInput(hold.openingText) ?? 0, openingUnits: Number(String(hold.openingUnits ?? 0).replace(',', '.')) || 0, openingText: undefined });
    await refresh(); setHold(null); setError(null);
  }
  return html`<${TopBar} title="Instruments & holdings" back="#/more" />
    <main class="screen">
      <section class="card">
        <h2>Instruments</h2>
        <div class="sub">Scores from 1 (low) to 5 (high) are your own assumptions, used in the risk dashboard.</div>
        ${insts.map((i) => html`<div class="list-row tap" onClick=${() => setEdit({ ...i })}>
          <div class="grow"><div class="title ${i.active ? '' : 'faint'}">${i.name}</div><div class="meta">Score ${i.riskScore} · liquidity ${LIQUIDITY_LABELS[i.liquidity] ?? '-'}</div></div><span class="faint">${Icon.chevron()}</span></div>`)}
        <button class="link" onClick=${() => setEdit({ name: '', riskScore: 3, liquidity: LIQUIDITY.MONTH, note: '', active: true })}>+ New instrument</button>
      </section>
      <section class="card">
        <h2>Holdings</h2>
        <div class="sub">Holdings you owned before you started recording are entered with their opening cost, not as purchases.</div>
        ${snap.holdings.map((h) => html`<div class="list-row tap" onClick=${() => setHold({ ...h, openingText: formatNumber(h.openingCost ?? 0) })}>
          <div class="grow"><div class="title">${h.name}</div><div class="meta">${snap.instruments.find((i) => i.id === h.instrumentId)?.name ?? '-'}${h.platform ? ` · ${h.platform}` : ''}${h.openingCost ? ` · opening cost ${formatRp(h.openingCost)}` : ''}</div></div><span class="faint">${Icon.chevron()}</span></div>`)}
        <button class="link" onClick=${() => setHold({ name: '', platform: '', instrumentId: insts[0]?.id, openingText: '0', openingUnits: 0, active: true })}>+ New holding</button>
      </section>
    </main>
    ${edit && html`<div class="dialog-back" onClick=${() => setEdit(null)}><div class="dialog" onClick=${(e) => e.stopPropagation()}>
      <h3>${edit.id ? 'Edit' : 'Add'} instrument</h3>
      <div class="field"><label>Name</label><input class="input" value=${edit.name} onInput=${(e) => setEdit({ ...edit, name: e.target.value })} />${error && html`<div class="err">${error}</div>`}</div>
      <div class="field"><label>Risk score</label><div class="chips">${[1, 2, 3, 4, 5].map((s) => html`<button class=${`chip ${Number(edit.riskScore) === s ? 'on' : ''}`} onClick=${() => setEdit({ ...edit, riskScore: s })}>${s}</button>`)}</div></div>
      <div class="field"><label>Liquidity</label><div class="chips wrap">${Object.entries(LIQUIDITY_LABELS).map(([k, t]) => html`<button class=${`chip ${edit.liquidity === k ? 'on' : ''}`} onClick=${() => setEdit({ ...edit, liquidity: k })}>${t}</button>`)}</div></div>
      <div class="field"><label>Risk note</label><input class="input" value=${edit.note ?? ''} onInput=${(e) => setEdit({ ...edit, note: e.target.value })} /></div>
      ${edit.id && html`<label class="row" style="min-height:44px"><input type="checkbox" checked=${edit.active} onChange=${(e) => setEdit({ ...edit, active: e.target.checked })} style="width:22px;height:22px" /> Active</label>`}
      <div class="row" style="margin-top:12px"><button class="btn grow" onClick=${() => setEdit(null)}>Cancel</button><button class="btn primary grow" onClick=${saveInst}>Save</button></div>
    </div></div>`}
    ${hold && html`<div class="dialog-back" onClick=${() => setHold(null)}><div class="dialog" onClick=${(e) => e.stopPropagation()}>
      <h3>${hold.id ? 'Edit' : 'Add'} holding</h3>
      <div class="field"><label>Holding name</label><input class="input" value=${hold.name} onInput=${(e) => setHold({ ...hold, name: e.target.value })} />${error && html`<div class="err">${error}</div>`}</div>
      <div class="field"><label>Instrument</label><div class="chips">${insts.map((i) => html`<button class=${`chip ${hold.instrumentId === i.id ? 'on' : ''}`} onClick=${() => setHold({ ...hold, instrumentId: i.id })}>${i.name}</button>`)}</div></div>
      <div class="field"><label>Platform / bank (optional)</label><input class="input" value=${hold.platform ?? ''} onInput=${(e) => setHold({ ...hold, platform: e.target.value })} /></div>
      <div class="grid2">
        <div class="field"><label>Opening cost (Rp)</label><input class="input num" inputmode="numeric" value=${hold.openingText} onInput=${(e) => setHold({ ...hold, openingText: formatNumber(parseAmountInput(e.target.value)) })} /></div>
        <div class="field"><label>Opening units</label><input class="input num" inputmode="decimal" value=${hold.openingUnits ?? 0} onInput=${(e) => setHold({ ...hold, openingUnits: e.target.value })} /></div>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn grow" onClick=${() => setHold(null)}>Cancel</button><button class="btn primary grow" onClick=${saveHold}>Save</button></div>
    </div></div>`}`;
}

function Types() {
  const { db, refresh, typeGroups, toast } = useApp();
  const [groups, setGroups] = useState(typeGroups.map((g) => ({ ...g })));
  const set = (i, patch) => setGroups(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= groups.length) return; const n = [...groups]; [n[i], n[j]] = [n[j], n[i]]; setGroups(n); };
  async function save() {
    if (groups.some((g) => !g.label.trim())) return;
    await setSetting(db, 'typeGroups', groups.map((g) => ({ ...g, label: g.label.trim() })));
    await refresh();
    toast('Type names saved.');
  }
  return html`<${TopBar} title="Transaction type names" back="#/more" />
    <main class="screen">
      <p class="muted small">You can change the name, order, and visibility. The calculation rules of each type stay the same.</p>
      ${groups.map((g, i) => html`<section class="card">
        <div class="row"><input class="input grow" value=${g.label} onInput=${(e) => set(i, { label: e.target.value })} /><button class="iconbtn" aria-label="Move up" onClick=${() => move(i, -1)}>↑</button></div>
        <div class="row between small muted" style="margin-top:6px"><span>${DEFAULT_TYPE_GROUPS.find((d) => d.key === g.key)?.hint}</span>
          <label class="row"><input type="checkbox" checked=${!g.hidden} onChange=${(e) => set(i, { hidden: !e.target.checked })} /> Show in form</label></div>
      </section>`)}
      <button class="btn primary block" onClick=${save}>Save</button>
    </main>`;
}

function Trash() {
  const { snap, db, refresh, toast } = useApp();
  const items = snap.transactions.filter((t) => t.deletedAt && !t.linkedTo).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  const cat = new Map(snap.categories.map((c) => [c.id, c.name]));
  return html`<${TopBar} title="Trash" back="#/more" />
    <main class="screen">
      <p class="muted small">Deleted transactions are kept for ${TRASH_DAYS} days, then removed permanently.</p>
      <section class="card" style="padding:4px 16px">
        ${items.length === 0 && html`<div class="empty">Trash is empty.</div>`}
        ${items.map((t) => html`<div class="list-row">
          <div class="grow"><div class="title">${cat.get(t.categoryId) ?? t.type} · ${formatRp(t.amount)}</div><div class="meta">${formatShortDate(t.date)}${t.note ? ` · ${t.note}` : ''}</div></div>
          <button class="btn" onClick=${async () => { await restoreTransaction(db, t.id); await refresh(); toast('Transaction restored.'); }}>Restore</button></div>`)}
      </section>
    </main>`;
}

function How() {
  const { label } = useApp();
  const inc = label('income');
  const exp = label('expense');
  const giv = label('giving');
  const p = (t) => html`<p class="small" style="margin:6px 0">${t}</p>`;
  return html`<${TopBar} title="How it is calculated" back="#/more" />
    <main class="screen">
      <section class="card"><h2>Position and flows</h2>
        ${p('A position is a balance on one date; a flow is a total over a period. The two are never added together.')}
        ${p('Account balance = opening balance + all transactions of that account up to that date.')}
        ${p(`Transfers between your own accounts are stored as one transaction and never count as ${inc} or ${exp}. A transfer fee is recorded as an expense.`)}
        ${p(`${exp} = expenses − refunds. ${giv} is reported separately from ${exp}.`)}
        ${p(`Surplus = ${inc} − ${exp} − ${giv}.`)}</section>
      <section class="card"><h2>Ratios</h2>
        ${p(`Saving rate = Surplus ÷ ${inc}. Investing is part of saving, so it is not subtracted.`)}
        ${p(`Investment rate = Net invested ÷ ${inc}, where Net invested = purchases − cost cashed out.`)}
        ${p(`Giving rate = ${giv} ÷ ${inc}. All ratios show "—" when ${inc} is zero.`)}
        ${p('Daily average spending = expenses ÷ calendar days in the period that have passed up to today (not only days with transactions).')}</section>
      <section class="card"><h2>Investments</h2>
        ${p('Buying an investment lowers cash and raises the cost of the holding; net worth does not change.')}
        ${p('When cashing out: closing the holding removes all remaining cost; if units are entered, cost is removed in proportion to units; otherwise cost equal to the amount received is removed, up to the remaining cost. Amount received minus cost removed is the realized gain.')}
        ${p('Holding value = last valuation + purchases after it − amounts received from cash-outs after it (never below 0). Without a valuation, the value equals the cost and is labelled "Not valued".')}
        ${p('Net worth = cash & bank + portfolio value.')}</section>
      <section class="card"><h2>Risk</h2>
        ${p('This is exposure based on classifications, not statistical risk. An instrument name alone is not enough to measure risk precisely.')}
        ${p('Weighted score = sum of (share of value × instrument score). ≤ 2 is low, ≤ 3.5 is medium, above that is high.')}
        ${p('The liquidity ladder groups value by each instrument’s liquidity class. Concentration shows the largest holding’s share and the share per platform or bank.')}
        ${p('LPS deposit insurance covers at most Rp2 billion per depositor per bank, and only when the interest rate does not exceed the LPS guarantee rate.')}
        ${p('This dashboard does not assess your personal risk tolerance and gives no buy or sell recommendations.')}</section>
    </main>`;
}

function Mode() {
  const { isTest, switchMode, confirm } = useApp();
  return html`<${TopBar} title="Data mode" back="#/more" />
    <main class="screen">
      <section class="card">
        <h2>In use</h2>
        <div class="mid">${isTest ? 'TEST DATA' : 'Real data'}</div>
        <p class="muted small">Test data and real data are kept in separate databases on this phone and never mix.</p>
        ${isTest
          ? html`<button class="btn primary block" onClick=${() => switchMode('real')}>Switch to real data</button>
            <button class="btn danger block" style="margin-top:10px" onClick=${async () => { if (await confirm({ title: 'Reset test data?', body: 'All test data is deleted and rebuilt from the sample.', confirm: 'Reset', danger: true })) switchMode('test', { reset: true }); }}>Reset test data</button>`
          : html`<button class="btn block" onClick=${() => switchMode('test')}>Open test data</button>`}
      </section>
    </main>`;
}
