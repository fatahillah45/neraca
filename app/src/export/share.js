// Membagikan atau mengunduh file dari HP. Chrome Android hanya mengizinkan jenis file tertentu lewat
// menu Bagikan, jadi aplikasi memeriksa navigator.canShare dan selalu menyediakan Unduh sebagai cadangan.

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let excelPromise = null;
export function loadExcelJS() {
  if (globalThis.ExcelJS) return Promise.resolve(globalThis.ExcelJS);
  excelPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/exceljs.min.js';
    s.onload = () => resolve(globalThis.ExcelJS);
    s.onerror = () => { excelPromise = null; reject(new Error('Gagal memuat pembuat Excel.')); };
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
