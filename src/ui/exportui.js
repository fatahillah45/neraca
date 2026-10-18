import { html, useState, useEffect } from '../../vendor/htm-preact-standalone.module.js';
import { useApp, TopBar } from './app.js';
import { weekStart, addDays, weekFileBase, weekFolderHint, lastMonthlyPeriod, formatShortDate } from '../core/dates.js';
import { buildWeeklyWorkbook, buildAllTransactionsWorkbook } from '../export/workbook.js';
import { serializeBackup, parseBackup, backupFileName } from '../export/backup.js';
import { loadExcelJS, canShareFile, shareFile, downloadFile, workbookToFile } from '../export/share.js';
import { markWeekExported, setSetting, replaceAllData } from '../db/repo.js';
import { requestPersistence } from '../db/db.js';

/** "File ready" dialog: Share (when supported) and Download, each a fresh user action. */
function FileReady({ file, note, onDone, onClose }) {
  const shareable = canShareFile(file);
  const [msg, setMsg] = useState(null);
  return html`<div class="dialog-back" onClick=${onClose}>
    <div class="dialog" onClick=${(e) => e.stopPropagation()}>
      <h3>File ready</h3>
      <div class="num" style="word-break:break-all">${file.name}</div>
      <div class="muted small" style="margin-top:6px">${(file.size / 1024).toFixed(0)} KB${note ? ` · ${note}` : ''}</div>
      ${!shareable && html`<div class="muted small" style="margin-top:8px">Your browser's share menu does not support this file type. Tap Download: the file is saved to the Download folder, and you can send it to your laptop from the Files app.</div>`}
      ${msg && html`<div class="err">${msg}</div>`}
      <div class="row" style="margin-top:16px">
        <button class="btn grow" onClick=${() => { downloadFile(file); onDone('downloaded'); }}>Download</button>
        ${shareable && html`<button class="btn primary grow" onClick=${async () => {
          const r = await shareFile(file, file.name);
          if (r === 'shared') onDone('shared');
          else if (r === 'failed') setMsg('Could not open the share menu. Try Download.');
        }}>Share</button>`}
      </div>
    </div>
  </div>`;
}

function weekStatus(w, hasTx) {
  if (w?.exportedAt && (!w.changedAt || w.changedAt <= w.exportedAt)) return { text: 'Exported', cls: 'ok' };
  if (w?.exportedAt) return { text: 'Needs re-export', cls: 'warn' };
  return hasTx ? { text: 'Not exported', cls: '' } : { text: 'Empty', cls: '' };
}

export function ExportScreen() {
  const app = useApp();
  const { snap, today, db, refresh, typeGroups, isTest } = app;
  const [ready, setReady] = useState(null); // { file, monday?, note }
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const report = lastMonthlyPeriod(today);
  const [period, setPeriod] = useState('all'); // 'all' | 'report' | 'custom'
  const [custom, setCustom] = useState(report);
  const range = period === 'report' ? report : period === 'custom' ? custom : null;

  const live = snap.transactions.filter((t) => !t.deletedAt);
  const starts = [...snap.accounts.map((a) => a.openingDate), ...live.map((t) => t.date)].filter(Boolean).sort();
  const weeks = [];
  if (starts.length) {
    for (let d = weekStart(today); d >= weekStart(starts[0]); d = addDays(d, -7)) weeks.push(d);
  }
  const weekMap = new Map(snap.weeks.map((w) => [w.weekStart, w]));
  const countIn = (monday) => live.filter((t) => t.date >= monday && t.date <= addDays(monday, 6)).length;
  const pending = weeks.filter((w) => weekStatus(weekMap.get(w), countIn(w) > 0).cls === 'warn').length;

  async function makeWeek(monday) {
    setBusy(monday); setError(null);
    try {
      const ExcelJS = await loadExcelJS();
      const { workbook, fileName } = buildWeeklyWorkbook(ExcelJS, snap, monday, { typeGroups, isTestData: isTest });
      setReady({ file: await workbookToFile(workbook, fileName), monday, note: `Suggested laptop folder: Weekly Reports/${weekFolderHint(monday)}` });
    } catch (e) {
      setError(`Could not build the workbook: ${e.message}`);
    } finally { setBusy(null); }
  }
  async function makeAll() {
    setBusy('all'); setError(null);
    try {
      const ExcelJS = await loadExcelJS();
      if (range && !(range.start && range.end && range.start <= range.end)) throw new Error('choose a start date on or before the end date');
      const { workbook, fileName } = buildAllTransactionsWorkbook(ExcelJS, snap, { typeGroups, isTestData: isTest, today, from: range?.start ?? null, to: range?.end ?? null });
      const count = range ? live.filter((t) => t.date >= range.start && t.date <= range.end).length : live.length;
      setReady({ file: await workbookToFile(workbook, fileName), note: `${count} transactions` });
    } catch (e) {
      setError(`Could not build the file: ${e.message}`);
    } finally { setBusy(null); }
  }
  async function done() {
    if (ready?.monday) { await markWeekExported(db, ready.monday); await refresh(); }
    setReady(null);
    app.toast('File created. Move it to your laptop from the share menu or the Download folder.');
  }

  return html`
    <${TopBar} title="Export to Excel" back="#/more" />
    <main class="screen">
      ${error && html`<div class="banner danger">${error}</div>`}
      <section class="card">
        <h2>All transactions</h2>
        <div class="muted small">One complete table for analysis across weeks, plus accounts, portfolio with risk scores, and valuation history. Send this file when you want an analysis.</div>
        <div class="section-label">Transactions period</div>
        <div class="chips wrap">
          <button class=${`chip ${period === 'all' ? 'on' : ''}`} onClick=${() => setPeriod('all')}>Full history</button>
          <button class=${`chip ${period === 'report' ? 'on' : ''}`} onClick=${() => setPeriod('report')}>${formatShortDate(report.start)} – ${formatShortDate(report.end)}</button>
          <button class=${`chip ${period === 'custom' ? 'on' : ''}`} onClick=${() => setPeriod('custom')}>Custom</button>
        </div>
        ${period === 'custom' && html`<div class="row" style="margin-top:6px">
          <input class="input" type="date" value=${custom.start} max=${custom.end} onInput=${(e) => setCustom({ ...custom, start: e.target.value })} />
          <span class="muted">–</span>
          <input class="input" type="date" value=${custom.end} min=${custom.start} onInput=${(e) => setCustom({ ...custom, end: e.target.value })} />
        </div>`}
        ${period !== 'all' && html`<div class="faint small" style="margin-top:6px">The period limits the Transactions sheet only. Accounts, portfolio, and valuations are as of today.</div>`}
        <button class="btn primary block" style="margin-top:12px" disabled=${busy} onClick=${makeAll}>${busy === 'all' ? 'Building…' : 'Export all transactions (.xlsx)'}</button>
      </section>
      <section class="card">
        <h2>Weekly workbooks</h2>
        <div class="sub">Monday–Sunday WIB · 1 Summary sheet + 7 daily sheets${pending ? ` · ${pending} weeks need re-export` : ''}</div>
        ${weeks.length === 0 && html`<div class="empty">No data yet.</div>`}
        ${weeks.map((w) => {
          const n = countIn(w);
          const s = weekStatus(weekMap.get(w), n > 0);
          return html`<div class="list-row">
            <div class="grow"><div class="title num">${weekFileBase(w)}.xlsx</div><div class="meta">${n} transactions · <span class=${`pill ${s.cls}`}>${s.text}</span></div></div>
            <button class="btn" disabled=${busy} onClick=${() => makeWeek(w)}>${busy === w ? '…' : 'Export'}</button>
          </div>`;
        })}
      </section>
    </main>
    ${ready && html`<${FileReady} file=${ready.file} note=${ready.note} onDone=${done} onClose=${() => setReady(null)} />`}`;
}

export function BackupScreen() {
  const app = useApp();
  const { snap, db, refresh, isTest } = app;
  const [ready, setReady] = useState(null);
  const [check, setCheck] = useState(null); // parseBackup result
  const [persist, setPersist] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { requestPersistence().then(setPersist).catch(() => setPersist({ supported: false })); }, []);
  const last = snap.settingsMap.lastBackupAt;
  const fmt = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });

  async function makeBackup() {
    setError(null);
    const text = await serializeBackup(snap, { isTestData: isTest });
    setReady(new File([text], backupFileName(), { type: 'application/json' }));
  }
  async function done() {
    await setSetting(db, 'lastBackupAt', new Date().toISOString());
    await refresh();
    setReady(null);
    app.toast('Backup created. Keep the file somewhere other than this phone.');
  }
  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setCheck(await parseBackup(await f.text()));
  }
  async function restore() {
    const s = check.summary;
    const ok = await app.confirm({
      title: 'Replace all data on this phone?',
      body: `The ${isTest ? 'test' : 'real'} data on this phone will be replaced with the backup:\n• ${s.accounts} accounts, ${s.transactions} transactions\n• Last transaction ${s.lastDate ?? '-'}\n• Created ${fmt(s.exportedAt)}${s.isTestData && !isTest ? '\n\nWarning: this file contains TEST DATA.' : ''}`,
      confirm: 'Replace data', danger: true,
    });
    if (!ok) return;
    try {
      await replaceAllData(db, check.data);
      await refresh();
      setCheck(null);
      app.toast('Data restored from the backup file.');
    } catch (e2) {
      setError(`Restore failed; your existing data was not changed: ${e2.message}`);
    }
  }

  return html`
    <${TopBar} title="Backup & restore" back="#/more" />
    <main class="screen">
      ${error && html`<div class="banner danger">${error}</div>`}
      <section class="card">
        <h2>Back up</h2>
        <div class="muted small">Your data is stored only on this phone. Keep a backup file on your laptop or in the cloud at least once a week.</div>
        <div class="small" style="margin-top:8px">Last backup: <b>${last ? fmt(last) : 'never'}</b></div>
        <button class="btn primary block" style="margin-top:12px" onClick=${makeBackup}>Back up now</button>
      </section>
      <section class="card">
        <h2>Restore from file</h2>
        <div class="muted small">Choose a neraca-backup-….json file. It is checked first (checksum and data integrity) before you confirm.</div>
        <label class="btn block" style="margin-top:12px;display:grid;place-items:center">Choose backup file<input type="file" accept=".json,application/json" style="display:none" onChange=${pick} /></label>
        ${check && !check.ok && html`<div class="banner danger"><div>This file cannot be restored:<ul>${check.errors.map((e) => html`<li>${e}</li>`)}</ul></div></div>`}
        ${check?.ok && html`<div class="banner info"><div class="grow small">Valid file: ${check.summary.accounts} accounts, ${check.summary.transactions} transactions (${check.summary.firstDate ?? '-'} to ${check.summary.lastDate ?? '-'}).${check.summary.isTestData ? ' Contains TEST DATA.' : ''}</div></div>
          <button class="btn danger block" onClick=${restore}>Replace data with this file</button>`}
      </section>
      <section class="card">
        <h2>Storage on this phone</h2>
        <div class="small">${persist === null ? 'Checking…' : !persist.supported ? 'This browser does not support persistent storage.' : persist.persisted ? '✓ Persistent storage is on: the browser will not clear the data automatically when space runs low.' : 'Storage is not persistent yet. Installing the app to the home screen makes it safer.'}</div>
        <div class="muted small" style="margin-top:6px">Clearing Chrome data or uninstalling the app still deletes the data, so backups remain essential.</div>
      </section>
    </main>
    ${ready && html`<${FileReady} file=${ready} onDone=${done} onClose=${() => setReady(null)} />`}`;
}
