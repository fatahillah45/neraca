// Menjaga daftar precache service worker tetap lengkap, dan memastikan tidak ada rahasia di kode aplikasi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(appDir).map((p) => relative(appDir, p).split(sep).join('/'));

test('semua file aplikasi ada di daftar precache service worker', () => {
  const sw = readFileSync(join(appDir, 'sw.js'), 'utf8');
  const skip = new Set(['sw.js', '_headers', '.nojekyll']);
  const missing = files.filter((f) => !skip.has(f) && !f.startsWith('vendor/LICENSE') && !sw.includes(`'${f}'`));
  assert.deepEqual(missing, []);
});

test('tidak ada token, password, atau kunci rahasia di kode aplikasi', () => {
  const suspicious = /(api[_-]?key|secret|password|passwd|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"][^'"]{6,}/i;
  const hits = files
    .filter((f) => /\.(js|mjs|html|json|webmanifest)$/.test(f) && !f.startsWith('vendor/'))
    .filter((f) => suspicious.test(readFileSync(join(appDir, f), 'utf8')));
  assert.deepEqual(hits, []);
});

test('aplikasi tidak memanggil server lain (tidak ada URL http eksternal di kode sendiri)', () => {
  const hits = files
    .filter((f) => /\.(js|html|css)$/.test(f) && !f.startsWith('vendor/'))
    .filter((f) => /https?:\/\/(?!www\.w3\.org)/.test(readFileSync(join(appDir, f), 'utf8')));
  assert.deepEqual(hits, []);
});
