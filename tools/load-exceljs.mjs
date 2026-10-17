// Memuat bundel ExcelJS (UMD untuk browser) di Node sebagai CommonJS.
// Diperlukan karena package.json proyek bertipe "module", sehingga require() akan memperlakukannya sebagai ESM.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadExcelJS() {
  const code = readFileSync(new URL('../app/vendor/exceljs.min.js', import.meta.url), 'utf8');
  const module = { exports: {} };
  const wrapper = vm.runInThisContext(`(function (module, exports) {\n${code}\n})`, { filename: 'exceljs.min.js' });
  wrapper(module, module.exports);
  if (typeof module.exports.Workbook !== 'function') throw new Error('ExcelJS gagal dimuat.');
  return module.exports;
}
