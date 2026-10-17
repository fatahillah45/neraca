// Share or download a file from the phone. Chrome only allows some file types in the share sheet,
// so the app checks navigator.canShare and always offers Download as a fallback.

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let excelPromise = null;
export function loadExcelJS() {
  if (globalThis.ExcelJS) return Promise.resolve(globalThis.ExcelJS);
  excelPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/exceljs.min.js';
    s.onload = () => resolve(globalThis.ExcelJS);
    s.onerror = () => { excelPromise = null; reject(new Error('Could not load the Excel builder.')); };
    document.head.appendChild(s);
  });
  return excelPromise;
}

export function canShareFile(file) {
  try {
    return !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

/** @returns 'shared' | 'cancelled' | 'failed' */
export async function shareFile(file, title) {
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (e) {
    return e?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}

export async function workbookToFile(workbook, fileName) {
  const buf = await workbook.xlsx.writeBuffer();
  return new File([buf], fileName, { type: XLSX_MIME });
}
