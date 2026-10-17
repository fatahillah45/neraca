import { html, useState } from '../../vendor/htm-preact-standalone.module.js';
import { useApp, TopBar } from './app.js';
import { Icon } from './components.js';
import { ExportScreen, BackupScreen } from './exportui.js';
import { TX, ACCOUNT_KINDS, LIQUIDITY, LIQUIDITY_LABELS, DEFAULT_TYPE_GROUPS } from '../core/model.js';
import { formatRp, parseAmountInput, formatNumber } from '../core/money.js';
import { formatShortDate, isIsoDate } from '../core/dates.js';
import { balances } from '../core/ledger.js';
import { validateAccount, validateName } from '../core/validate.js';
import { saveAccount, saveCategory, saveInstrument, saveHolding, reorder, restoreTransaction, setSetting, TRASH_DAYS } from '../db/repo.js';

export function More({ route }) {
  const sub = route.split('?')[0].replace(/^\/lainnya\/?/, '');
  switch (sub) {
    case 'akun': return html`<${Accounts} />`;
    case 'kategori': return html`<${Categories} />`;
    case 'instrumen': return html`<${Instruments} />`;
    case 'ekspor': return html`<${ExportScreen} />`;
    case 'cadangan': return html`<${BackupScreen} />`;
    case 'jenis': return html`<${Types} />`;
    case 'sampah': return html`<${Trash} />`;
    case 'cara-hitung': return html`<${How} />`;
    case 'mode': return html`<${Mode} />`;
    default: return html`<${Menu} />`;
  }
}

function Menu() {
  const { isTest } = useApp();
  const item = (href, title, meta) => html`<a class="list-row" href=${href} style="text-decoration:none;color:inherit">
    <div class="grow"><div class="title">${title}</div>${meta && html`<div class="meta">${meta}</div>`}</div><span class="faint">${Icon.chevron()}</span></a>`;
  return html`<${TopBar} title="Lainnya" />
    <main class="screen">
      <section class="card" style="padding:4px 16px">
        ${item('#/lainnya/ekspor', 'Ekspor ke Excel', 'Workbook mingguan dan semua transaksi')}
        ${item('#/lainnya/cadangan', 'Cadangan & pemulihan', 'Simpan data di luar HP')}
      </section>
      <section class="card" style="padding:4px 16px">
        ${item('#/lainnya/akun', 'Akun', 'Rekening, tunai, e-wallet, saldo awal')}
        ${item('#/lainnya/kategori', 'Kategori & subkategori')}
        ${item('#/lainnya/instrumen', 'Instrumen & posisi investasi', 'Profil risiko dan likuiditas')}
        ${item('#/lainnya/jenis', 'Nama jenis transaksi')}
        ${item('#/lainnya/sampah', 'Sampah', `Transaksi terhapus, disimpan ${TRASH_DAYS} hari`)}
      </section>
      <section class="card" style="padding:4px 16px">
        ${item('#/lainnya/cara-hitung', 'Cara menghitung', 'Rumus metrik dan asumsi risiko')}
        ${item('#/lainnya/mode', 'Mode data', isTest ? 'Sedang memakai DATA UJI' : 'Sedang memakai data asli')}
      </section>
      <p class="faint small" style="text-align:center">Neraca v0.1 · data hanya tersimpan di HP ini</p>
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
    toast('Akun disimpan.');
  }
  async function toggleArchive(a) {
    if (!a.archived && bal.get(a.id) !== 0) toast(`Saldo ${a.name} masih ${formatRp(bal.get(a.id))}; tetap dihitung di total.`);
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
    return html`<${TopBar} title=${edit.id ? 'Ubah akun' : 'Akun baru'} />
      <main class="screen">
        <div class="field"><label>Nama akun</label><input class="input" value=${edit.name} placeholder="mis. Rekening Gaji" onInput=${(e) => setEdit({ ...edit, name: e.target.value })} />${err('name')}</div>
        <div class="field"><label>Jenis akun</label><div class="chips wrap">${ACCOUNT_KINDS.map((k) => html`<button class=${`chip ${edit.kind === k.key ? 'on' : ''}`} onClick=${() => setEdit({ ...edit, kind: k.key })}>${k.label}</button>`)}</div></div>
        <div class="field"><label>Institusi (opsional)</label><input class="input" value=${edit.institution ?? ''} placeholder="mis. nama bank" onInput=${(e) => setEdit({ ...edit, institution: e.target.value })} /></div>
        <div class="field"><label>Saldo awal (Rp)</label><input class="input num" inputmode="numeric" value=${edit.openingText} onInput=${(e) => setEdit({ ...edit, openingText: formatNumber(parseAmountInput(e.target.value)) })} />${err('openingBalance')}
          <label class="row small muted" style="margin-top:6px"><input type="checkbox" checked=${!!edit.negative} onChange=${(e) => setEdit({ ...edit, negative: e.target.checked })} /> Saldo awal negatif (minus)</label></div>
        <div class="field"><label>Tanggal saldo awal</label><input class="input" type="date" value=${edit.openingDate} onInput=${(e) => setEdit({ ...edit, openingDate: e.target.value })} />${err('openingDate')}
          <div class="faint small" style="margin-top:4px">Saldo awal bukan pemasukan. Transaksi akun ini tidak boleh bertanggal sebelum tanggal ini.</div></div>
        <div class="row"><button class="btn grow" onClick=${() => { setEdit(null); setErrors({}); }}>Batal</button><button class="btn primary grow" onClick=${save}>Simpan</button></div>
      </main>`;
  }
  return html`<${TopBar} title="Akun" back="#/lainnya" />
    <main class="screen">
      <button class="btn primary block" onClick=${() => setEdit({ name: '', kind: 'rekening', institution: '', openingText: '0', openingDate: today })}>+ Tambah akun</button>
      <section class="card" style="padding:4px 16px">
        ${list.length === 0 && html`<div class="empty">Belum ada akun.</div>`}
        ${list.map((a, i) => html`<div class="list-row">
          <div class="grow tap" onClick=${() => setEdit({ ...a, openingText: formatNumber(Math.abs(a.openingBalance)), negative: a.openingBalance < 0 })}>
            <div class="title ${a.archived ? 'faint' : ''}">${a.name}${a.archived ? ' (diarsipkan)' : ''}</div>
            <div class="meta">${ACCOUNT_KINDS.find((k) => k.key === a.kind)?.label ?? ''} · saldo awal ${formatRp(a.openingBalance)} per ${formatShortDate(a.openingDate)}</div></div>
          <div class="num">${formatRp(bal.get(a.id))}</div>
          <button class="iconbtn" aria-label="Naikkan" onClick=${() => move(i, -1)}>↑</button>
          <button class="iconbtn" aria-label=${a.archived ? 'Aktifkan' : 'Arsipkan'} onClick=${() => toggleArchive(a)}>${a.archived ? '↺' : '🗄'}</button>
        </div>`)}
      </section>
      <p class="faint small">Akun tidak bisa dihapus agar riwayat tetap utuh; arsipkan akun yang tidak dipakai lagi.</p>
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
    <div class="grow tap" onClick=${() => setEdit({ ...c })}><div class="title ${c.active ? '' : 'faint'}">${c.icon ? `${c.icon} ` : ''}${c.name}${c.active ? '' : ' (nonaktif)'}</div></div>
    <button class="iconbtn" aria-label="Naikkan" onClick=${() => move(list, i, -1)}>↑</button>
    ${!isSub && html`<button class="iconbtn" aria-label="Tambah subkategori" onClick=${() => setEdit({ name: '', icon: '', parentId: c.id, active: true })}>＋</button>`}
  </div>`;

  return html`<${TopBar} title="Kategori" back="#/lainnya" />
    <main class="screen">
      <div class="seg">${[TX.EXPENSE, TX.INCOME, TX.GIVING].map((t) => html`<button class=${type === t ? 'on' : ''} onClick=${() => setType(t)}>${label(t)}</button>`)}</div>
      <button class="btn primary block" style="margin-top:12px" onClick=${() => setEdit({ name: '', icon: '', parentId: null, active: true })}>+ Kategori baru</button>
      <section class="card" style="padding:4px 16px">
        ${tops.map((c, i) => html`${row(c, tops, i, false)}${children(c.id).map((s, j, arr) => row(s, arr, j, true))}`)}
      </section>
      <p class="faint small">Kategori yang sudah dipakai tidak dihapus, hanya dinonaktifkan, agar riwayat dan laporan tetap benar.</p>
    </main>
    ${edit && html`<div class="dialog-back" onClick=${() => setEdit(null)}><div class="dialog" onClick=${(e) => e.stopPropagation()}>
      <h3>${edit.id ? 'Ubah' : 'Tambah'} ${edit.parentId ? 'subkategori' : 'kategori'}</h3>
      <div class="field"><label>Nama</label><input class="input" value=${edit.name} onInput=${(e) => setEdit({ ...edit, name: e.target.value })} />${error && html`<div class="err">${error}</div>`}</div>
      ${!edit.parentId && html`<div class="field"><label>Ikon (emoji, opsional)</label><input class="input" maxlength="4" value=${edit.icon} onInput=${(e) => setEdit({ ...edit, icon: e.target.value })} /></div>`}
      ${edit.id && html`<label class="row" style="min-height:44px"><input type="checkbox" checked=${edit.active} onChange=${(e) => setEdit({ ...edit, active: e.target.checked })} style="width:22px;height:22px" /> Aktif (tampil di form)</label>`}
      <div class="row" style="margin-top:12px"><button class="btn grow" onClick=${() => setEdit(null)}>Batal</button><button class="btn primary grow" onClick=${save}>Simpan</button></div>
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
    if (!hold.instrumentId) { setError('Pilih instrumen.'); return; }
    await saveHolding(db, { ...hold, name: hold.name.trim(), openingCost: parseAmountInput(hold.openingText) ?? 0, openingUnits: Number(String(hold.openingUnits ?? 0).replace(',', '.')) || 0, openingText: undefined });
    await refresh(); setHold(null); setError(null);
  }
  return html`<${TopBar} title="Instrumen & posisi" back="#/lainnya" />
    <main class="screen">
      <section class="card">
        <h2>Instrumen</h2>
        <div class="sub">Skor 1 (rendah) sampai 5 (tinggi) adalah asumsi Anda sendiri, dipakai di dashboard risiko.</div>
        ${insts.map((i) => html`<div class="list-row tap" onClick=${() => setEdit({ ...i })}>
          <div class="grow"><div class="title ${i.active ? '' : 'faint'}">${i.name}</div><div class="meta">Skor ${i.riskScore} · likuiditas ${LIQUIDITY_LABELS[i.liquidity] ?? '-'}</div></div><span class="faint">${Icon.chevron()}</span></div>`)}
        <button class="link" onClick=${() => setEdit({ name: '', riskScore: 3, liquidity: LIQUIDITY.MONTH, note: '', active: true })}>+ Instrumen baru</button>
      </section>
      <section class="card">
        <h2>Posisi</h2>
        <div class="sub">Posisi yang sudah dimiliki sebelum mulai mencatat diisi dengan modal awal, bukan sebagai pembelian.</div>
        ${snap.holdings.map((h) => html`<div class="list-row tap" onClick=${() => setHold({ ...h, openingText: formatNumber(h.openingCost ?? 0) })}>
          <div class="grow"><div class="title">${h.name}</div><div class="meta">${snap.instruments.find((i) => i.id === h.instrumentId)?.name ?? '-'}${h.platform ? ` · ${h.platform}` : ''}${h.openingCost ? ` · modal awal ${formatRp(h.openingCost)}` : ''}</div></div><span class="faint">${Icon.chevron()}</span></div>`)}
        <button class="link" onClick=${() => setHold({ name: '', platform: '', instrumentId: insts[0]?.id, openingText: '0', openingUnits: 0, active: true })}>+ Posisi baru</button>
      </section>
    </main>
    ${edit && html`<div class="dialog-back" onClick=${() => setEdit(null)}><div class="dialog" onClick=${(e) => e.stopPropagation()}>
      <h3>${edit.id ? 'Ubah' : 'Tambah'} instrumen</h3>
      <div class="field"><label>Nama</label><input class="input" value=${edit.name} onInput=${(e) => setEdit({ ...edit, name: e.target.value })} />${error && html`<div class="err">${error}</div>`}</div>
      <div class="field"><label>Skor risiko</label><div class="chips">${[1, 2, 3, 4, 5].map((s) => html`<button class=${`chip ${Number(edit.riskScore) === s ? 'on' : ''}`} onClick=${() => setEdit({ ...edit, riskScore: s })}>${s}</button>`)}</div></div>
      <div class="field"><label>Likuiditas</label><div class="chips wrap">${Object.entries(LIQUIDITY_LABELS).map(([k, t]) => html`<button class=${`chip ${edit.liquidity === k ? 'on' : ''}`} onClick=${() => setEdit({ ...edit, liquidity: k })}>${t}</button>`)}</div></div>
      <div class="field"><label>Catatan risiko</label><input class="input" value=${edit.note ?? ''} onInput=${(e) => setEdit({ ...edit, note: e.target.value })} /></div>
      ${edit.id && html`<label class="row" style="min-height:44px"><input type="checkbox" checked=${edit.active} onChange=${(e) => setEdit({ ...edit, active: e.target.checked })} style="width:22px;height:22px" /> Aktif</label>`}
      <div class="row" style="margin-top:12px"><button class="btn grow" onClick=${() => setEdit(null)}>Batal</button><button class="btn primary grow" onClick=${saveInst}>Simpan</button></div>
    </div></div>`}
    ${hold && html`<div class="dialog-back" onClick=${() => setHold(null)}><div class="dialog" onClick=${(e) => e.stopPropagation()}>
      <h3>${hold.id ? 'Ubah' : 'Tambah'} posisi</h3>
      <div class="field"><label>Nama posisi</label><input class="input" value=${hold.name} onInput=${(e) => setHold({ ...hold, name: e.target.value })} />${error && html`<div class="err">${error}</div>`}</div>
      <div class="field"><label>Instrumen</label><div class="chips">${insts.map((i) => html`<button class=${`chip ${hold.instrumentId === i.id ? 'on' : ''}`} onClick=${() => setHold({ ...hold, instrumentId: i.id })}>${i.name}</button>`)}</div></div>
      <div class="field"><label>Platform / bank (opsional)</label><input class="input" value=${hold.platform ?? ''} onInput=${(e) => setHold({ ...hold, platform: e.target.value })} /></div>
      <div class="grid2">
        <div class="field"><label>Modal awal (Rp)</label><input class="input num" inputmode="numeric" value=${hold.openingText} onInput=${(e) => setHold({ ...hold, openingText: formatNumber(parseAmountInput(e.target.value)) })} /></div>
        <div class="field"><label>Unit awal</label><input class="input num" inputmode="decimal" value=${hold.openingUnits ?? 0} onInput=${(e) => setHold({ ...hold, openingUnits: e.target.value })} /></div>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn grow" onClick=${() => setHold(null)}>Batal</button><button class="btn primary grow" onClick=${saveHold}>Simpan</button></div>
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
    toast('Nama jenis disimpan.');
  }
  return html`<${TopBar} title="Nama jenis transaksi" back="#/lainnya" />
    <main class="screen">
      <p class="muted small">Nama, urutan, dan visibilitas bisa diubah. Aturan hitung setiap jenis tetap sama.</p>
      ${groups.map((g, i) => html`<section class="card">
        <div class="row"><input class="input grow" value=${g.label} onInput=${(e) => set(i, { label: e.target.value })} /><button class="iconbtn" onClick=${() => move(i, -1)}>↑</button></div>
        <div class="row between small muted" style="margin-top:6px"><span>${DEFAULT_TYPE_GROUPS.find((d) => d.key === g.key)?.hint}</span>
          <label class="row"><input type="checkbox" checked=${!g.hidden} onChange=${(e) => set(i, { hidden: !e.target.checked })} /> Tampil di form</label></div>
      </section>`)}
      <button class="btn primary block" onClick=${save}>Simpan</button>
    </main>`;
}

function Trash() {
  const { snap, db, refresh, toast } = useApp();
  const items = snap.transactions.filter((t) => t.deletedAt && !t.linkedTo).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  const cat = new Map(snap.categories.map((c) => [c.id, c.name]));
  return html`<${TopBar} title="Sampah" back="#/lainnya" />
    <main class="screen">
      <p class="muted small">Transaksi terhapus disimpan ${TRASH_DAYS} hari, lalu dihapus permanen.</p>
      <section class="card" style="padding:4px 16px">
        ${items.length === 0 && html`<div class="empty">Sampah kosong.</div>`}
        ${items.map((t) => html`<div class="list-row">
          <div class="grow"><div class="title">${cat.get(t.categoryId) ?? t.type} · ${formatRp(t.amount)}</div><div class="meta">${t.date}${t.note ? ` · ${t.note}` : ''}</div></div>
          <button class="btn" onClick=${async () => { await restoreTransaction(db, t.id); await refresh(); toast('Transaksi dipulihkan.'); }}>Pulihkan</button></div>`)}
      </section>
    </main>`;
}

function How() {
  const p = (t) => html`<p class="small" style="margin:6px 0">${t}</p>`;
  return html`<${TopBar} title="Cara menghitung" back="#/lainnya" />
    <main class="screen">
      <section class="card"><h2>Posisi dan arus</h2>
        ${p('Posisi adalah saldo pada satu tanggal; arus adalah jumlah selama periode. Keduanya tidak pernah dijumlahkan.')}
        ${p('Saldo akun = saldo awal + semua transaksi akun itu sampai tanggal tersebut.')}
        ${p('Transfer antar akun sendiri disimpan sebagai satu transaksi dan tidak dihitung sebagai pemasukan atau pengeluaran. Biaya admin transfer dicatat sebagai pengeluaran.')}
        ${p('Pengeluaran = pengeluaran − refund. Sedekah dilaporkan terpisah dari pengeluaran.')}
        ${p('Surplus = Pemasukan − Pengeluaran − Sedekah.')}</section>
      <section class="card"><h2>Rasio</h2>
        ${p('Saving rate = Surplus ÷ Pemasukan. Investasi adalah bagian dari tabungan, jadi tidak dikurangkan.')}
        ${p('Investment rate = Investasi bersih ÷ Pemasukan, dengan Investasi bersih = pembelian − modal yang dicairkan.')}
        ${p('Giving rate = Sedekah ÷ Pemasukan. Semua rasio tampil "—" bila Pemasukan nol.')}
        ${p('Rata-rata pengeluaran harian = Pengeluaran ÷ jumlah hari kalender dalam periode yang sudah berjalan sampai hari ini (bukan hanya hari yang ada transaksinya).')}</section>
      <section class="card"><h2>Investasi</h2>
        ${p('Membeli investasi mengurangi kas dan menambah modal posisi; kekayaan bersih tidak berubah.')}
        ${p('Saat mencairkan: jika posisi ditutup, seluruh modal ditarik; jika unit diisi, modal ditarik proporsional terhadap unit; selain itu modal ditarik sebesar jumlah diterima, maksimal modal tersisa. Selisih jumlah diterima dan modal ditarik adalah hasil terealisasi.')}
        ${p('Nilai posisi = penilaian terakhir + pembelian sesudahnya − jumlah diterima dari pencairan sesudahnya (minimal 0). Tanpa penilaian, nilai memakai modal dan diberi label "Belum dinilai".')}
        ${p('Kekayaan bersih = Kas & Bank + nilai portofolio.')}</section>
      <section class="card"><h2>Risiko</h2>
        ${p('Ini eksposur berdasarkan klasifikasi, bukan risiko statistik. Nama instrumen tidak cukup untuk mengukur risiko secara presisi.')}
        ${p('Skor tertimbang = jumlah dari (porsi nilai posisi × skor instrumennya). ≤ 2 rendah, ≤ 3,5 sedang, di atas itu tinggi.')}
        ${p('Tangga likuiditas mengelompokkan nilai berdasarkan kelas likuiditas instrumen. Konsentrasi menunjukkan porsi posisi terbesar dan porsi per platform atau bank.')}
        ${p('Penjaminan LPS: simpanan dijamin maksimal Rp2 miliar per nasabah per bank, dan hanya bila bunganya tidak melebihi tingkat bunga penjaminan LPS.')}
        ${p('Dashboard ini tidak menilai toleransi risiko Anda dan tidak memberi rekomendasi beli atau jual.')}</section>
    </main>`;
}

function Mode() {
  const { isTest, switchMode, confirm } = useApp();
  return html`<${TopBar} title="Mode data" back="#/lainnya" />
    <main class="screen">
      <section class="card">
        <h2>Sedang dipakai</h2>
        <div class="mid">${isTest ? 'DATA UJI' : 'Data asli'}</div>
        <p class="muted small">Data uji dan data asli disimpan di database terpisah di HP ini dan tidak pernah tercampur.</p>
        ${isTest
          ? html`<button class="btn primary block" onClick=${() => switchMode('real')}>Pindah ke data asli</button>
            <button class="btn danger block" style="margin-top:10px" onClick=${async () => { if (await confirm({ title: 'Reset data uji?', body: 'Semua data uji dihapus dan dibuat ulang dari contoh.', confirm: 'Reset', danger: true })) switchMode('test', { reset: true }); }}>Reset data uji</button>`
          : html`<button class="btn block" onClick=${() => switchMode('test')}>Buka data uji</button>`}
      </section>
    </main>`;
}
