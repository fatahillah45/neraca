# Neraca

Aplikasi pencatatan keuangan pribadi (PWA) berbahasa Indonesia: pemasukan, pengeluaran, sedekah, transfer, dan investasi, dengan ekspor workbook Excel mingguan.

**Repositori ini hanya berisi kode.** Data keuangan tersimpan di HP pengguna (IndexedDB) dan tidak pernah dikirim ke server mana pun. Semua angka di tes dan mode uji adalah data rekaan berlabel UJI.

## Struktur

| Folder | Isi |
| --- | --- |
| `app/` | Aplikasi yang di-hosting (tanpa proses build). `src/core` mesin hitung, `src/export` Excel dan cadangan, `src/db` penyimpanan, `src/ui` layar. Library pihak ketiga ada di `app/vendor` beserta lisensinya. |
| `tests/` | Tes otomatis (`node --test`). |
| `tools/` | Server pengembangan, pembuat ikon, dan verifikasi workbook dengan Python/openpyxl. |

## Pengembangan

```bash
npm test
```

```bash
python tools/devserver.py 8080
```

Verifikasi workbook contoh:

```bash
node tools/make-sample-workbooks.mjs out
```

```bash
python tools/verify_workbook.py out
```

## Deploy

Branch `gh-pages` berisi isi folder `app/` dan dilayani oleh GitHub Pages:

```bash
git subtree push --prefix app origin gh-pages
```
