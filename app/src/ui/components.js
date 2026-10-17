import { html, useState, useEffect } from '../../vendor/htm-preact-standalone.module.js';
import { formatCompact, formatRp } from '../core/money.js';

export const PALETTE = ['#4f9be8', '#3fb37f', '#dcb04f', '#e2766d', '#a07ee0', '#4cc3c9', '#e48fb7', '#9bbf4a', '#d98a4a', '#8f9aa7'];
export const TYPE_COLOR = { income: 'var(--income)', expense: 'var(--expense)', giving: 'var(--giving)', invest: 'var(--invest)', transfer: 'var(--transfer)', adjustment: 'var(--transfer)' };

const path = (d) => html`<path d=${d} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`;
export const Icon = {
  home: () => html`<svg viewBox="0 0 24 24">${path('M4 20V10l8-6 8 6v10h-5v-6H9v6z')}</svg>`,
  list: () => html`<svg viewBox="0 0 24 24">${path('M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01')}</svg>`,
  pie: () => html`<svg viewBox="0 0 24 24">${path('M12 3a9 9 0 1 0 9 9h-9z')}${path('M15 3.5A9 9 0 0 1 20.5 9H15z')}</svg>`,
  more: () => html`<svg viewBox="0 0 24 24">${path('M5 12h.01M12 12h.01M19 12h.01')}</svg>`,
  back: () => html`<svg viewBox="0 0 24 24" width="22" height="22">${path('M15 5l-7 7 7 7')}</svg>`,
  close: () => html`<svg viewBox="0 0 24 24" width="22" height="22">${path('M6 6l12 12M18 6L6 18')}</svg>`,
  chevron: () => html`<svg viewBox="0 0 24 24" width="18" height="18">${path('M9 5l7 7-7 7')}</svg>`,
};

/** Donut from segments {label, value, color}. Tapping a segment calls onSelect(i). */
export function Donut({ segments, size = 180, thickness = 26, center, sub, onSelect }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return html`
    <svg viewBox="0 0 ${size} ${size}" width=${size} height=${size} role="img" aria-label=${center ?? 'Donut chart'}>
      <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--surface-2)" stroke-width=${thickness} />
      ${total > 0 && segments.map((s, i) => {
        const len = (Math.max(0, s.value) / total) * c;
        const gap = segments.length > 1 ? Math.min(2, len / 3) : 0;
        const el = html`<circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${s.color}
          stroke-width=${thickness} stroke-dasharray=${`${Math.max(0, len - gap)} ${c}`} stroke-dashoffset=${-offset}
          transform=${`rotate(-90 ${size / 2} ${size / 2})`} style=${onSelect ? 'cursor:pointer' : ''}
          onClick=${() => onSelect?.(i)} />`;
        offset += len;
        return el;
      })}
      ${center && html`<text x="50%" y="48%" text-anchor="middle" fill="var(--text)" font-size="17" font-weight="700" class="num">${center}</text>`}
      ${sub && html`<text x="50%" y="61%" text-anchor="middle" fill="var(--text-3)" font-size="11">${sub}</text>`}
    </svg>`;
}

/** Grouped bars per month. series: [{key, label, color}], rows: [{label, [key]: number}]. */
export function Bars({ rows, series, height = 170, onSelect }) {
  const W = 340;
  const padL = 44;
  const padB = 22;
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.key] ?? 0)));
  const nice = niceMax(max);
  const plotH = height - padB - 8;
  const gw = (W - padL - 4) / rows.length;
  const bw = Math.max(4, Math.min(12, (gw - 10) / series.length));
  const y = (v) => 8 + plotH - (Math.max(0, v) / nice) * plotH;
  const ticks = [0, nice / 2, nice];
  return html`
    <svg viewBox="0 0 ${W} ${height}" width="100%" role="img" aria-label="Monthly trend">
      ${ticks.map((t) => html`
        <line x1=${padL} x2=${W} y1=${y(t)} y2=${y(t)} stroke="var(--border)" stroke-dasharray=${t === 0 ? '' : '3 4'} />
        <text x=${padL - 6} y=${y(t) + 4} text-anchor="end" font-size="10" fill="var(--text-3)">${formatCompact(t).replace('Rp', '')}</text>`)}
      ${rows.map((r, i) => {
        const gx = padL + i * gw + (gw - bw * series.length) / 2;
        return html`<g style=${onSelect ? 'cursor:pointer' : ''} onClick=${() => onSelect?.(i)}>
          <rect x=${padL + i * gw} y="0" width=${gw} height=${height - padB} fill="transparent" />
          ${series.map((s, j) => html`<rect x=${gx + j * bw} y=${y(r[s.key] ?? 0)} width=${bw - 1.5}
            height=${Math.max(0, 8 + plotH - y(r[s.key] ?? 0))} rx="2" fill=${s.color} />`)}
          <text x=${padL + i * gw + gw / 2} y=${height - 6} text-anchor="middle" font-size="11" fill="var(--text-2)">${r.label}</text>
        </g>`;
      })}
    </svg>
    <div class="bar-legend">${series.map((s) => html`<span><i class="dot" style=${`background:${s.color}`}></i>${s.label}</span>`)}</div>`;
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function Stat({ label, value, hint, cls = '', onClick }) {
  return html`<div class="stat ${onClick ? 'tap' : ''}" onClick=${onClick}>
    <div class="label">${label}</div>
    <div class="value num ${cls}">${value}</div>
    ${hint && html`<div class="hint">${hint}</div>`}
  </div>`;
}

export function Money({ value, cls = '' }) {
  return html`<span class="num ${cls}">${formatRp(value)}</span>`;
}

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onClose, toast.ms ?? 5000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return html`<div class="toast" role="status">
    <span class="grow">${toast.text}</span>
    ${toast.action && html`<button onClick=${() => { toast.action.run(); onClose(); }}>${toast.action.label}</button>`}
  </div>`;
}

/** Simple confirm dialog. options: {title, body, confirm, danger} */
export function ConfirmDialog({ dialog, onClose }) {
  if (!dialog) return null;
  return html`<div class="dialog-back" onClick=${() => onClose(false)}>
    <div class="dialog" onClick=${(e) => e.stopPropagation()}>
      <h3>${dialog.title}</h3>
      ${dialog.body && html`<div class="muted" style="white-space:pre-line">${dialog.body}</div>`}
      <div class="row" style="margin-top:16px">
        <button class="btn grow" onClick=${() => onClose(false)}>${dialog.cancel ?? 'Cancel'}</button>
        <button class=${`btn grow ${dialog.danger ? 'danger' : 'primary'}`} onClick=${() => onClose(true)}>${dialog.confirm ?? 'Continue'}</button>
      </div>
    </div>
  </div>`;
}

export function useHash() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}
