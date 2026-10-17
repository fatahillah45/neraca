import { html, useState, useMemo } from '../../vendor/htm-preact-standalone.module.js';
import { useApp } from './app.js';
import { Icon } from './components.js';
import { TX, GROUP, groupOfType } from '../core/model.js';
import { formatNumber, formatRp } from '../core/money.js';
import { addDays, formatShortDate } from '../core/dates.js';
import { validateTransaction } from '../core/validate.js';
import { balances, holdingHistory } from '../core/ledger.js';
import { saveTransaction, deleteTransaction, restoreTransaction, saveHolding, linkedFee } from '../db/repo.js';

const LAST_KEY = 'neraca.last';
function readLast() {
  try { return JSON.parse(localStorage.getItem(LAST_KEY)) ?? {}; } catch { return {}; }
}
function writeLast(v) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(v)); } catch { /* opsional */ }
}

const GROUP_TYPE = { [GROUP.INCOME]: TX.INCOME, [GROUP.EXPENSE]: TX.EXPENSE, [GROUP.GIVING]: TX.GIVING, [GROUP.TRANSFER]: TX.TRANSFER, [GROUP.ADJUSTMENT]: TX.ADJUSTMENT };

export function TxForm({ initial, preset, onClose }) {
  const app = useApp();
  const { snap, today, label, typeGroups, db } = app;
  const last = readLast();
  const editing = !!initial;
  const accounts = snap.accounts.filter((a) => !a.archived || a.id === initial?.accountId || a.id === initial?.toAccountId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const defaultAccount = (g) => (accounts.find((a) => a.id === last.account?.[g]) ?? accounts[0])?.id ?? null;
  const startGroup = initial ? groupOfType(initial.type) : preset?.group ?? last.group ?? GROUP.EXPENSE;
  const fee0 = initial?.type === TX.TRANSFER ? linkedFee(snap, initial.id)?.amount ?? 0 : 0;

  const [group, setGroup] = useState(startGroup);
  const [amount, setAmount] = useState(initial?.type === TX.ADJUSTMENT ? null : initial?.amount ?? null);
  const [pad, setPad] = useState(initial ? null : 'amount'); // field yang sedang diisi keypad: 'amount' | 'fee' | null
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? null);
  const [subcategoryId, setSubcategoryId] = useState(initial?.subcategoryId ?? null);
  const [accountId, setAccountId] = useState(initial?.accountId ?? defaultAccount(startGroup));
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? null);
  const [date, setDate] = useState(initial?.date ?? today);
  const [note, setNote] = useState(initial?.note ?? '');
  const [isRefund, setIsRefund] = useState(!!initial?.isRefund);
  const [investAction, setInvestAction] = useState(initial?.type === TX.INVEST_SELL ? 'sell' : 'buy');
  const startHolding = snap.holdings.find((h) => h.id === initial?.holdingId);
  const [instrumentId, setInstrumentId] = useState(startHolding?.instrumentId ?? preset?.instrumentId ?? null);
  const [holdingId, setHoldingId] = useState(initial?.holdingId ?? preset?.holdingId ?? null);
  const [units, setUnits] = useState(initial?.units ?? '');
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice ?? '');
  const [closePosition, setClosePosition] = useState(!!initial?.closePosition);
  const [showDetail, setShowDetail] = useState(!!(initial?.units || initial?.unitPrice));
  const [fee, setFee] = useState(fee0 || null);
  const [newHolding, setNewHolding] = useState(null); // { name, platform }
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const type = group === GROUP.INVEST ? (investAction === 'sell' ? TX.INVEST_SELL : TX.INVEST_BUY) : GROUP_TYPE[group];

  // Kategori diurutkan dari yang paling sering dipakai 90 hari terakhir.
  const cats = useMemo(() => {
    if (![TX.INCOME, TX.EXPENSE, TX.GIVING].includes(type)) return [];
    const since = addDays(today, -90);
    const freq = new Map();
    for (const t of snap.transactions) if (!t.deletedAt && t.type === type && t.date >= since) freq.set(t.categoryId, (freq.get(t.categoryId) ?? 0) + 1);
    return snap.categories.filter((c) => c.type === type && !c.parentId && (c.active || c.id === categoryId))
      .sort((a, b) => (freq.get(b.id) ?? 0) - (freq.get(a.id) ?? 0) || (a.order ?? 0) - (b.order ?? 0));
  }, [snap, type]);
  const subs = categoryId
    ? snap.categories.filter((c) => c.parentId === categoryId && (c.active || c.id === subcategoryId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];
  const instruments = snap.instruments.filter((i) => i.active || i.id === instrumentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const holdings = snap.holdings.filter((h) => h.instrumentId === instrumentId && (h.active !== false || h.id === holdingId));
  const currentBalance = accountId ? balances({ ...snap, transactions: snap.transactions.filter((t) => t.id !== initial?.id) }, date).get(accountId) ?? 0 : 0;
  const adjustTarget = amount;
  const holdingCost = holdingId ? holdingHistory(snap.holdings.find((h) => h.id === holdingId), snap.transactions.filter((t) => t.id !== initial?.id), date).cost : 0;

  const press = (k) => {
    const set = pad === 'fee' ? setFee : setAmount;
    const cur = pad === 'fee' ? fee : amount;
    const s = String(cur ?? '');
    let next = s;
    if (k === 'del') next = s.slice(0, -1);
    else if (k === '000') next = s ? s + '000' : s;
    else next = s === '0' ? k : s + k;
    if (next.length > 15) return;
    set(next === '' ? null : Number(next));
  };

  function buildTx() {
    const base = { id: initial?.id, createdAt: initial?.createdAt, date, note: note.trim(), accountId, type };
    if (type === TX.ADJUSTMENT) {
      const delta = (adjustTarget ?? 0) - currentBalance;
      return { ...base, amount: Math.abs(delta), sign: delta < 0 ? -1 : 1 };
    }
    const tx = { ...base, amount };
    if ([TX.INCOME, TX.EXPENSE, TX.GIVING].includes(type)) {
      tx.categoryId = categoryId;
      if (subcategoryId) tx.subcategoryId = subcategoryId;
      if (type === TX.EXPENSE && isRefund) tx.isRefund = true;
    }
    if (type === TX.TRANSFER) tx.toAccountId = toAccountId;
    if (type === TX.INVEST_BUY || type === TX.INVEST_SELL) {
      tx.holdingId = holdingId;
      if (units !== '' && units !== null) tx.units = Number(String(units).replace(',', '.'));
      if (unitPrice !== '' && unitPrice !== null) tx.unitPrice = Number(String(unitPrice).replace(/\D/g, ''));
      if (type === TX.INVEST_SELL && closePosition) tx.closePosition = true;
    }
    return tx;
  }

  async function submit(again) {
    if (busy) return;
    if (type === TX.ADJUSTMENT && (adjustTarget === null || adjustTarget === currentBalance)) {
      setErrors({ amount: adjustTarget === null ? 'Isi saldo sebenarnya menurut bank.' : 'Saldo sudah sama, tidak perlu penyesuaian.' });
      return;
    }
    const tx = buildTx();
    const v = validateTransaction(tx, snap, { today, now: new Date() });
    if (!v.ok) {
      setErrors(Object.fromEntries(v.errors.map((e) => [e.field, e.message])));
      if (v.errors.some((e) => e.field === 'amount')) setPad('amount');
      return;
    }
    if (v.warnings.length) {
      const ok = await app.confirm({ title: 'Periksa dulu', body: v.warnings.map((w) => `• ${w.message}`).join('\n'), confirm: 'Simpan saja' });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const saved = await saveTransaction(db, snap, tx, { fee: type === TX.TRANSFER ? fee ?? 0 : 0 });
      writeLast({ ...last, group, account: { ...(last.account ?? {}), [group]: accountId } });
      await app.refresh();
      app.toast(editing ? 'Perubahan disimpan.' : `Tersimpan: ${formatRp(saved.amount)}`, editing ? null : {
        label: 'Urungkan', run: async () => { await deleteTransaction(db, saved.id); await app.refresh(); },
      }, 8000);
      if (again) {
        setAmount(null); setNote(''); setSubcategoryId(null); setIsRefund(false); setUnits(''); setUnitPrice(''); setFee(null);
        setErrors({}); setPad('amount');
      } else onClose();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await app.confirm({ title: 'Hapus transaksi ini?', body: 'Transaksi masuk Sampah dan bisa dipulihkan selama 30 hari.', confirm: 'Hapus', danger: true });
    if (!ok) return;
    await deleteTransaction(db, initial.id);
    await app.refresh();
    app.toast('Transaksi dihapus.', { label: 'Urungkan', run: async () => { await restoreTransaction(db, initial.id); await app.refresh(); } });
    onClose();
  }

  async function createHolding() {
    if (!newHolding?.name?.trim()) return;
    const h = await saveHolding(db, { name: newHolding.name.trim(), platform: (newHolding.platform ?? '').trim(), instrumentId });
    await app.refresh();
    setHoldingId(h.id);
    setNewHolding(null);
  }

  const switchGroup = (g) => {
    setGroup(g);
    setCategoryId(null); setSubcategoryId(null); setErrors({});
    if (!editing) setAccountId(defaultAccount(g));
  };

  const visibleGroups = typeGroups.filter((g) => !g.hidden || g.key === group);
  const accountChips = (value, onPick, exclude) => html`<div class="chips">
    ${accounts.filter((a) => a.id !== exclude).map((a) => html`<button class=${`chip ${value === a.id ? 'on' : ''}`} onClick=${() => onPick(a.id)}>${a.name}</button>`)}
    ${accounts.length === 0 && html`<a class="chip add" href="#/lainnya/akun" onClick=${onClose}>+ Tambah akun dulu</a>`}
  </div>`;
  const err = (f) => errors[f] && html`<div class="err">${errors[f]}</div>`;
  const amountLabel = type === TX.ADJUSTMENT ? 'Saldo sebenarnya' : type === TX.INVEST_SELL ? 'Jumlah diterima' : 'Jumlah';

  return html`<div class="sheet" role="dialog" aria-label="Form transaksi">
    <div class="sheet-head">
      <button class="iconbtn" aria-label="Tutup" onClick=${onClose}>${Icon.close()}</button>
      <h2>${editing ? 'Ubah transaksi' : 'Tambah transaksi'}</h2>
      ${editing && html`<button class="btn danger" onClick=${remove}>Hapus</button>`}
    </div>
    <div class="sheet-body">
      <div class="chips" role="tablist" aria-label="Jenis">
        ${visibleGroups.map((g) => html`<button class=${`chip ${group === g.key ? 'on' : ''}`} onClick=${() => switchGroup(g.key)}>${g.label}</button>`)}
      </div>

      ${group === GROUP.INVEST && html`<div class="seg" style="margin:6px 0">
        <button class=${investAction === 'buy' ? 'on' : ''} onClick=${() => setInvestAction('buy')}>Beli / tambah</button>
        <button class=${investAction === 'sell' ? 'on' : ''} onClick=${() => setInvestAction('sell')}>Cairkan / jual</button>
      </div>`}

      <div class=${`amount ${pad === 'amount' ? 'focus' : ''}`} onClick=${() => setPad('amount')}>
        <span class="muted small grow" style="align-self:center">${amountLabel}</span>
        <span class="cur">Rp</span><span class="val num">${amount === null ? '0' : formatNumber(amount)}</span>
      </div>
      ${err('amount')}
      ${type === TX.ADJUSTMENT && accountId && html`<div class="small muted" style="margin-top:6px">
        Saldo di aplikasi per ${formatShortDate(date)}: <b class="num">${formatRp(currentBalance)}</b>
        ${adjustTarget !== null && html` · Selisih: <b class="num">${formatRp(adjustTarget - currentBalance)}</b>`}
      </div>`}

      ${[TX.INCOME, TX.EXPENSE, TX.GIVING].includes(type) && html`
        <div class="section-label">Kategori</div>
        <div class="catgrid">
          ${cats.map((c) => html`<button class=${`cat ${categoryId === c.id ? 'on' : ''}`} onClick=${() => { setCategoryId(c.id); setSubcategoryId(null); setPad(null); }}>
            <span class="ic">${c.icon || '•'}</span><span class="nm">${c.name}</span></button>`)}
        </div>
        ${err('categoryId')}
        ${subs.length > 0 && html`<div class="section-label">Subkategori (opsional)</div>
          <div class="chips wrap">${subs.map((s) => html`<button class=${`chip ${subcategoryId === s.id ? 'on' : ''}`} onClick=${() => setSubcategoryId(subcategoryId === s.id ? null : s.id)}>${s.name}</button>`)}</div>
          ${err('subcategoryId')}`}
        ${type === TX.EXPENSE && html`<label class="row" style="margin-top:12px;min-height:44px">
          <input type="checkbox" checked=${isRefund} onChange=${(e) => setIsRefund(e.target.checked)} style="width:22px;height:22px" />
          <span>Ini refund (uang kembali), mengurangi pengeluaran kategori ini</span></label>`}`}

      ${group === GROUP.INVEST && html`
        <div class="section-label">Instrumen</div>
        <div class="chips">${instruments.map((i) => html`<button class=${`chip ${instrumentId === i.id ? 'on' : ''}`} onClick=${() => { setInstrumentId(i.id); setHoldingId(null); setPad(null); }}>${i.name}</button>`)}</div>
        ${instrumentId && html`<div class="section-label">Posisi</div>
          <div class="chips wrap">
            ${holdings.map((h) => html`<button class=${`chip ${holdingId === h.id ? 'on' : ''}`} onClick=${() => setHoldingId(h.id)}>${h.name}${h.platform ? ` · ${h.platform}` : ''}</button>`)}
            <button class="chip add" onClick=${() => setNewHolding({ name: '', platform: '' })}>+ Posisi baru</button>
          </div>
          ${newHolding && html`<div class="card" style="margin-top:8px">
            <div class="field"><label>Nama posisi</label><input class="input" placeholder="mis. Emas Antam" value=${newHolding.name} onInput=${(e) => setNewHolding({ ...newHolding, name: e.target.value })} /></div>
            <div class="field"><label>Platform / tempat (opsional)</label><input class="input" placeholder="mis. Pegadaian, Bibit, Bank X" value=${newHolding.platform} onInput=${(e) => setNewHolding({ ...newHolding, platform: e.target.value })} /></div>
            <div class="row"><button class="btn grow" onClick=${() => setNewHolding(null)}>Batal</button><button class="btn primary grow" onClick=${createHolding}>Buat posisi</button></div>
          </div>`}`}
        ${err('holdingId')}
        ${type === TX.INVEST_SELL && holdingId && html`<div class="small muted" style="margin-top:6px">Modal tersisa di posisi ini: <b class="num">${formatRp(holdingCost)}</b></div>`}
        ${type === TX.INVEST_SELL && html`<label class="row" style="margin-top:8px;min-height:44px">
          <input type="checkbox" checked=${closePosition} onChange=${(e) => setClosePosition(e.target.checked)} style="width:22px;height:22px" />
          <span>Tutup posisi (semua dicairkan, mis. deposito jatuh tempo)</span></label>`}
        <button class="link small" onClick=${() => setShowDetail(!showDetail)}>${showDetail ? 'Sembunyikan detail opsional' : 'Detail opsional: unit dan harga per unit'}</button>
        ${showDetail && html`<div class="grid2">
          <div class="field"><label>Unit / gram</label><input class="input num" inputmode="decimal" value=${units} onInput=${(e) => setUnits(e.target.value)} /></div>
          <div class="field"><label>Harga per unit (Rp)</label><input class="input num" inputmode="numeric" value=${unitPrice} onInput=${(e) => setUnitPrice(e.target.value)} /></div>
        </div>`}`}

      <div class="section-label">${type === TX.TRANSFER ? 'Dari akun' : type === TX.INVEST_SELL ? 'Masuk ke akun' : type === TX.INVEST_BUY ? 'Dibayar dari akun' : 'Akun'}</div>
      ${accountChips(accountId, setAccountId, null)}
      ${err('accountId')}
      ${type === TX.TRANSFER && html`
        <div class="section-label">Ke akun</div>
        ${accountChips(toAccountId, setToAccountId, accountId)}
        ${err('toAccountId')}
        <div class=${`amount ${pad === 'fee' ? 'focus' : ''}`} style="min-height:52px" onClick=${() => setPad('fee')}>
          <span class="muted small grow" style="align-self:center">Biaya admin (opsional)</span>
          <span class="cur">Rp</span><span class="num" style="font-size:22px;font-weight:650">${fee ? formatNumber(fee) : '0'}</span>
        </div>`}

      <div class="section-label">Tanggal</div>
      <div class="chips">
        <button class=${`chip ${date === today ? 'on' : ''}`} onClick=${() => setDate(today)}>Hari ini</button>
        <button class=${`chip ${date === addDays(today, -1) ? 'on' : ''}`} onClick=${() => setDate(addDays(today, -1))}>Kemarin</button>
        <input class="input" type="date" style="width:auto;min-height:40px;padding:6px 10px" value=${date} onInput=${(e) => e.target.value && setDate(e.target.value)} />
      </div>
      ${err('date')}

      <div class="field"><label>Catatan (opsional)</label>
        <input class="input" maxlength="140" placeholder="mis. makan siang dengan tim" value=${note} onFocus=${() => setPad(null)} onInput=${(e) => setNote(e.target.value)} /></div>
    </div>

    ${pad && html`<div class="keypad" role="group" aria-label="Keypad angka">
      ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'].map((k) => html`
        <button onClick=${() => press(k)} aria-label=${k === 'del' ? 'Hapus angka' : k}>${k === 'del' ? '⌫' : k}</button>`)}
      <button class="done" style="grid-column: span 3" onClick=${() => setPad(null)}>Selesai</button>
    </div>`}
    ${!pad && html`<div class="sheet-foot">
      ${!editing && html`<button class="btn grow" disabled=${busy} onClick=${() => submit(true)}>Simpan & tambah</button>`}
      <button class="btn primary grow" disabled=${busy} onClick=${() => submit(false)}>Simpan</button>
    </div>`}
  </div>`;
}
