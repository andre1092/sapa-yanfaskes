import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Mask penyingkapan (video kedua Charles Liu): ganti tema dan batang progres. Tes membaca index.css
// dan memastikan gerak hanya hidup bila pengguna tidak meminta gerak dikurangi, dan tabel JPEG
// tetap tanpa animasi.
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

function blokGerakBebas() {
  const blok = [];
  const pola = /@media \(prefers-reduced-motion: no-preference\) \{/g;
  for (const m of css.matchAll(pola)) {
    let kedalaman = 1; let i = m.index + m[0].length;
    while (kedalaman > 0 && i < css.length) { if (css[i] === '{') kedalaman++; else if (css[i] === '}') kedalaman--; i++; }
    blok.push(css.slice(m.index, i));
  }
  return blok;
}
const daftarBlok = blokGerakBebas();
const gerakBebas = daftarBlok.join('\n');
const diLuarBlok = daftarBlok.reduce((sisa, b) => sisa.replace(b, ''), css);

test('mask ganti tema berupa lingkaran dari tombol dan hanya saat gerak tidak dikurangi', () => {
  assert.match(gerakBebas, /:root\[data-transisi="tema"\]::view-transition-new\(root\) \{ animation: sapa-singkap-tema /);
  assert.doesNotMatch(diLuarBlok, /animation: sapa-singkap-tema/);
  assert.match(css, /@keyframes sapa-singkap-tema \{ from \{ clip-path: circle\(0 at var\(--transisi-x/);
});

test('batang progres tersingkap dari kiri, kecuali di tabel JPEG', () => {
  const aturan = gerakBebas.match(/([^{}]*)\{[^}]*animation-name: sapa-singkap-batang;[^}]*\}/);
  assert.ok(aturan, 'aturan batang progres tidak ada');
  assert.match(aturan[1], /\[class\*="transition-\[width\]"\]:not\(\[id\^="jpeg-export-"\] \*\)/);
  assert.match(css, /@keyframes sapa-singkap-batang \{ from \{ clip-path: inset\(0 100% 0 0\); \}/);
});
