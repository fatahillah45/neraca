import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeBackup, parseBackup, backupFileName } from '../app/src/export/backup.js';
import { totalCash } from '../app/src/core/ledger.js';
import { sampleWeek } from './fixtures.mjs';

const now = new Date('2026-10-26T01:05:00Z');

test('cadangan bolak-balik menghasilkan data dan saldo yang sama persis', async () => {
  const d = { ...sampleWeek(), settings: [{ key: 'typeGroups', value: [] }] };
  const text = await serializeBackup(d, { now, isTestData: true });
  const r = await parseBackup(text);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.deepEqual(r.data.transactions, d.transactions);
  assert.equal(totalCash(r.data, '2026-10-25'), totalCash(d, '2026-10-25'));
  assert.equal(r.summary.transactions, 9);
  assert.equal(r.summary.lastDate, '2026-10-24');
  assert.equal(r.summary.isTestData, true);
});

test('file terpotong, diubah, atau bukan cadangan ditolak', async () => {
  const text = await serializeBackup(sampleWeek(), { now });
  assert.equal((await parseBackup(text.slice(0, -40))).ok, false);
  const doc = JSON.parse(text);
  doc.data.transactions[0].amount += 1;
  const tampered = await parseBackup(JSON.stringify(doc));
  assert.equal(tampered.ok, false);
  assert.match(tampered.errors.join(' '), /Checksum/);
  assert.equal((await parseBackup('{"hello":1}')).ok, false);
});

test('referensi rusak terdeteksi walau checksum dihitung ulang', async () => {
  const d = sampleWeek();
  d.transactions[0].accountId = 'tidak-ada';
  const r = await parseBackup(await serializeBackup(d, { now }));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /refer to a missing/);
});

test('backup file name uses the WIB date and time', () => {
  assert.equal(backupFileName(new Date('2026-10-25T17:30:00Z')), 'neraca-backup-2026-10-26-0030.json');
});

test('backups made by v0.1 (format neraca-cadangan) can still be restored', async () => {
  const doc = JSON.parse(await serializeBackup(sampleWeek(), { now }));
  doc.format = 'neraca-cadangan';
  assert.equal((await parseBackup(JSON.stringify(doc))).ok, true);
});
