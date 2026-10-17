import { html, useState, useCallback, createContext, useContext, useMemo } from '../../vendor/htm-preact-standalone.module.js';
import { loadSnapshot } from '../db/db.js';
import { todayWib } from '../core/dates.js';
import { DEFAULT_TYPE_GROUPS } from '../core/model.js';
import { Icon, Toast, ConfirmDialog, useHash } from './components.js';
import { Dashboard } from './dashboard.js';
import { TxForm } from './txform.js';
import { TxList } from './txlist.js';
import { Portfolio } from './portfolio.js';
import { More } from './more.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function App({ db, mode, initial, switchMode }) {
  const [snap, setSnap] = useState(initial);
  const [form, setForm] = useState(null); // { tx } | { tx: null, preset }
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  const hash = useHash();

  const refresh = useCallback(async () => setSnap(await loadSnapshot(db)), [db]);
  const confirm = useCallback((opts) => new Promise((resolve) => setDialog({ ...opts, resolve })), []);
  const closeDialog = (v) => { dialog?.resolve(v); setDialog(null); };

  const typeGroups = snap.settingsMap.typeGroups ?? DEFAULT_TYPE_GROUPS;
  const label = useCallback((key) => typeGroups.find((g) => g.key === key)?.label ?? key, [typeGroups]);

  const ctx = useMemo(() => ({
    db, mode, snap, refresh, today: todayWib(), label, typeGroups, switchMode,
    isTest: mode === 'test',
    openForm: (tx = null, preset = null) => setForm({ tx, preset }),
    toast: (text, action = null, ms) => setToast({ text, action, ms, at: Date.now() }),
    confirm,
  }), [db, mode, snap, refresh, label, typeGroups, switchMode, confirm]);

  const route = hash.replace(/^#/, '') || '/';
  let screen;
  if (route.startsWith('/transaksi')) screen = html`<${TxList} route=${route} />`;
  else if (route.startsWith('/portofolio')) screen = html`<${Portfolio} route=${route} />`;
  else if (route.startsWith('/lainnya')) screen = html`<${More} route=${route} />`;
  else screen = html`<${Dashboard} route=${route} />`;

  const tab = (href, text, icon, match) => html`<a href=${href} class=${match ? 'on' : ''}>${icon()}<span>${text}</span></a>`;
  return html`<${Ctx.Provider} value=${ctx}>
    ${screen}
    <nav class="nav" aria-label="Navigasi utama">
      ${tab('#/', 'Ringkasan', Icon.home, route === '/' || route.startsWith('/ringkasan'))}
      ${tab('#/transaksi', 'Transaksi', Icon.list, route.startsWith('/transaksi'))}
      <button class="fab" aria-label="Tambah transaksi" onClick=${() => setForm({ tx: null })}>+</button>
      ${tab('#/portofolio', 'Portofolio', Icon.pie, route.startsWith('/portofolio'))}
      ${tab('#/lainnya', 'Lainnya', Icon.more, route.startsWith('/lainnya'))}
    </nav>
    ${form && html`<${TxForm} key=${form.tx?.id ?? 'new'} initial=${form.tx} preset=${form.preset} onClose=${() => setForm(null)} />`}
    <${Toast} toast=${toast} onClose=${() => setToast(null)} />
    <${ConfirmDialog} dialog=${dialog} onClose=${closeDialog} />
  </${Ctx.Provider}>`;
}

export function TopBar({ title, back, right }) {
  const { isTest } = useApp();
  return html`<header class="topbar">
    ${back && html`<a class="iconbtn" href=${back} aria-label="Kembali">${Icon.back()}</a>`}
    <h1>${title}</h1>
    ${isTest && html`<span class="badge-uji">DATA UJI</span>`}
    ${right}
  </header>`;
}
