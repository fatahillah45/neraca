import { html, useState, useEffect } from '../../vendor/htm-preact-standalone.module.js';
import { useApp, TopBar } from './app.js';
import { weekStart, addDays, weekFileBase, weekFolderHint, formatShortDate } from '../core/dates.js';
import { buildWeeklyWorkbook, buildAllTransactionsWorkbook } from '../export/workbook.js';
import { serializeBackup, parseBackup, backupFileName } from '../export/backup.js';
import { loadExcelJS, canShareFile, shareFile, downloadFile, workbookToFile } from '../export/share.js';
import { markWeekExported, setSetting, replaceAllData } from '../db/repo.js';
import { requestPersistence } from '../db/db.js';

/** Dialog file siap: tombol Bagikan (bila didukung) dan Unduh, masing-masing aksi baru dari pengguna. */
function FileReady({ file, note, onDone, onClose }) {
  const shareable = canShareFile(file);
  const [msg, setMsg] = useState(null);
  return html`<div class="dialog-back" onClick=${onClose}>
    <div class="dialog" onClick=${(e) => e.stopPropagation()}>
      <h3>File siap</h3>
      <div class="num" style="word-break:break-all">${file.name}</div>
      <div class="muted small" style="margin-top:6px">${(file.size / 1024).toFixed(0)} KB${note ? ` · ${note}` : ''}</div>
      ${!shareable && html`<div class="muted small" style="margin-top:8px">Menu Bagikan tidak mendukung jenis file ini di browser Anda. Tekan Unduh: file tersimpan di folder Download, lalu kirim ke laptop dari aplikasi File.</div>`}
      ${msg && html`<div class="err">${msg}</div>`}
      <div class="row" style="margin-top:16px">
        <button class="btn grow" onClick=${() => { downloadFile(file); onDone('downloaded'); }}>Unduh</button>
        ${shareable && html`<button class="btn primary grow" onClick=${async () => {
          const r = await shareFile(file, file.name);
          if (r === 'shared') onDone('shared');
          else if (r === 'failed') setMsg('Gagal membuka menu Bagikan. Coba Unduh.');
        }}>Bagikan</button>`}
      </div>
    </div>
  </div>`;
}

function weekStatus(w, hasTx) {
  if (w?.exportedAt && (!w.changedAt || w.changedAt <= w.exportedAt)) return { text: 'Sudah diekspor', cls: 'ok' };
  if (w?.exportedAt) return { text: 'Perlu ekspor ulang', cls: 'warn' };
  return hasTx ? { text: 'Belum diekspor', cls: '' } : { text: 'Kosong', cls: '' };
}

export function ExportScreen() {
  const app = useApp();
  const { snap, today, db, refresh, typeGroups, isTest } = app;
  const [ready, setReady] = useState(null); // { file, monday? , kind }
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const live = snap.transactions.filter((t) => !t.deletedAt);
  const starts = [...snap.accounts.map((a) => a.openingDate), ...live.map((t) => t.date)].filter(Boolean).sort();
  const weeks = [];
  if (starts.length) {
    for (let d = weekStart(today); d >= weekStart(starts[0]); d = addDays(d, -7)) weeks.push(d);
  }
  const weekMap = new Map(snap.weeks.map((w) => [w.weekStart, w]));
  const countIn = (monday) => live.filter((t) => t.date >= monday && t.date <= addDays(monday, 6)).length;
  const pending = weeks.filter((w) => { const s = weekStatus(weekMap.get(w), countIn(w) > 0); return s.cls === 'warn'; }).length;

  async function makeWeek(monday) {
    setBusy(monday); setError(null);
    try {
      const ExcelJS = await loadExcelJS();
      const { workbook, fileName } = buildWeeklyWorkbook(ExcelJS, snap, monday, { typeGroups, isTestData: isTest });
      setReady({ file: await workbookToFile(workbook, fileName), monday, note: `Saran folder di laptop: Laporan Mingguan/${weekFolderHint(monday)}` });
    } catch (e) {
      setError(`Gagal membuat workbook: ${e.message}`);
    } finally { setBusy(null); }
  }
  async function makeAll() {
    setBusy('all'); setError(null);
    try {
      const ExcelJS = await loadExcelJS();
      const { workbook, fileName } = buildAllTransactionsWorkbook(ExcelJS, snap, { typeGroups, isTestData: isTest, today });
      setReady({ file: await workbookToFile(workbook, fileName), note: `${live.length} transaksi` });
    } catch (e) {
      setError(`Gagal membuat file: ${e.message}`);
    } finally { setBusy(null); }
  }
  async function done() {
    if (ready?.monday) { await markWeekExported(db, ready.monday); await refresh(); }
    setReady(null);
    app.toast('File dibuat. Pindahkan ke laptop dari menu Bagikan atau folder Download.');
  }

  return html`
    <${TopBar} title="Ekspor ke Excel" back="#/lainnya" />
    <main class="screen">
      ${error && html`<div class="banner danger">${error}</div>`}
      <section class="card">
        <h2>Semua transaksi</h2>
        <div class="muted small">Satu tabel lengkap untuk analisis lintas minggu. Kirim file ini bila ingin dianalisis.</div>
        <button class="btn primary block" style="margin-top:12px" disabled=${busy} onClick=${makeAll}>${busy === 'all' ? 'Membuat…' : 'Ekspor semua transaksi (.xlsx)'}</button>
      </section>
      <section class="card">
        <h2>Workbook mingguan</h2>
        <div class="sub">Senin–Minggu WIB · 1 sheet Ringkasan + 7 sheet harian${pending ? ` · ${pending} minggu perlu ekspor ulang` : ''}</div>
        ${weeks.length === 0 && html`<div class="empty">Belum ada data.</div>`}
        ${weeks.map((w) => {
          const n = countIn(w);
          const s = weekStatus(weekMap.get(w), n > 0);
          return html`<div class="list-row">
            <div class="grow"><div class="title num">${weekFileBase(w)}.xlsx</div><div class="meta">${n} transaksi · <span class=${`pill ${s.cls}`}>${s.text}</span></div></div>
            <button class="btn" disabled=${busy} onClick=${() => makeWeek(w)}>${busy === w ? '…' : 'Ekspor'}</button>
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
  const [check, setCheck] = useState(null); // hasil parseBackup
  const [persist, setPersist] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { requestPersistence().then(setPersist).catch(() => setPersist({ supported: false })); }, []);
  const last = snap.settingsMap.lastBackupAt;

  async function makeBackup() {
    setError(null);
    const text = await serializeBackup(snap, { isTestData: isTest });
    setReady(new File([text], backupFileName(), { type: 'application/json' }));
  }
  async function done() {
    await setSetting(db, 'lastBackupAt', new Date().toISOString());
    await refresh();
    setReady(null);
    app.toast('Cadangan dibuat. Simpan file di luar HP.');
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
      title: 'Ganti semua data di HP?',
      body: `Data ${isTest ? 'uji' : 'asli'} di HP ini akan diganti dengan isi cadangan:\n• ${s.accounts} akun, ${s.transactions} transaksi\n• Transaksi terakhir ${s.lastDate ?? '-'}\n• Dibuat ${new Date(s.exportedAt).toLocaleString('id-ID')}${s.isTestData && !isTest ? '\n\nPeringatan: file ini berisi DATA UJI.' : ''}`,
      confirm: 'Ganti data', danger: true,
    });
    if (!ok) return;
    try {
      await replaceAllData(db, check.data);
      await refresh();
      setCheck(null);
      app.toast('Data dipulihkan dari file cadangan.');
    } catch (e2) {
      setError(`Pemulihan gagal, data lama tidak berubah: ${e2.message}`);
    }
  }

  return html`
    <${TopBar} title="Cadangan & pemulihan" back="#/lainnya" />
    <main class="screen">
      ${error && html`<div class="banner danger">${error}</div>`}
      <section class="card">
        <h2>Cadangkan</h2>
        <div class="muted small">Data hanya tersimpan di HP ini. Simpan file cadangan di laptop atau cloud minimal seminggu sekali.</div>
        <div class="small" style="margin-top:8px">Cadangan terakhir: <b>${last ? new Date(last).toLocaleString('id-ID') : 'belum pernah'}</b></div>
        <button class="btn primary block" style="margin-top:12px" onClick=${makeBackup}>Cadangkan sekarang</button>
      </section>
      <section class="card">
        <h2>Pulihkan dari file</h2>
        <div class="muted small">Pilih file neraca-cadangan-….json. Isinya diperiksa dulu (checksum dan keutuhan data) sebelum Anda konfirmasi.</div>
        <label class="btn block" style="margin-top:12px;display:grid;place-items:center">Pilih file cadangan<input type="file" accept=".json,application/json" style="display:none" onChange=${pick} /></label>
        ${check && !check.ok && html`<div class="banner danger"><div>File tidak bisa dipulihkan:<ul>${check.errors.map((e) => html`<li>${e}</li>`)}</ul></div></div>`}
        ${check?.ok && html`<div class="banner info"><div class="grow small">File valid: ${check.summary.accounts} akun, ${check.summary.transactions} transaksi (${check.summary.firstDate ?? '-'} s.d. ${check.summary.lastDate ?? '-'}).${check.summary.isTestData ? ' Berisi DATA UJI.' : ''}</div></div>
          <button class="btn danger block" onClick=${restore}>Ganti data dengan isi file ini</button>`}
      </section>
      <section class="card">
        <h2>Penyimpanan di HP</h2>
        <div class="small">${persist === null ? 'Memeriksa…' : !persist.supported ? 'Browser tidak mendukung penyimpanan persisten.' : persist.persisted ? '✓ Penyimpanan persisten aktif: browser tidak akan menghapus data otomatis saat ruang menipis.' : 'Penyimpanan belum persisten. Pasang aplikasi ke layar utama agar lebih aman.'}</div>
        <div class="muted small" style="margin-top:6px">Menghapus data Chrome atau mencopot aplikasi tetap menghapus data. Karena itu cadangan tetap wajib.</div>
      </section>
    </main>
    ${ready && html`<${FileReady} file=${ready} onDone=${done} onClose=${() => setReady(null)} />`}`;
}
