import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Transisi objek bersama (video kedua Charles Liu): sorotan menu aktif meluncur saat pindah halaman.
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const shell = await readFile(new URL('../src/components/InsightTracerDashboard.tsx', import.meta.url), 'utf8');

function blokGerakBebas() {
  const blok = [];
  for (const m of css.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{/g)) {
    let kedalaman = 1; let i = m.index + m[0].length;
    while (kedalaman > 0 && i < css.length) { if (css[i] === '{') kedalaman++; else if (css[i] === '}') kedalaman--; i++; }
    blok.push(css.slice(m.index, i));
  }
  return blok;
}
const daftarBlok = blokGerakBebas();
const diLuarBlok = daftarBlok.reduce((sisa, b) => sisa.replace(b, ''), css);

test('nama objek bersama hanya dipasang saat transisi halaman dan gerak tidak dikurangi', () => {
  assert.ok(daftarBlok.some(b => b.includes(':root[data-transisi="halaman"] .sapa-sidebar-item[aria-current="page"] { view-transition-name: sapa-menu-aktif; }')));
  assert.doesNotMatch(diLuarBlok, /view-transition-name/);
});

test('sorotan meluncur dengan ease-in-out, dan isi lama keluar lebih singkat dari isi baru masuk', () => {
  const grup = css.match(/::view-transition-group\(sapa-menu-aktif\) \{([^}]*)\}/);
  assert.ok(grup);
  assert.match(grup[1], /cubic-bezier\(\.4, 0, \.2, 1\)/);
  const lama = Number(css.match(/data-transisi="halaman"\]::view-transition-old\(root\) \{ animation-duration: (\d+)ms/)[1]);
  const baru = Number(css.match(/data-transisi="halaman"\]::view-transition-new\(root\) \{ animation-duration: (\d+)ms/)[1]);
  assert.ok(lama < baru, `keluar ${lama} ms, masuk ${baru} ms`);
});

test('pindah menu memakai transisi halaman, tetapi menu yang sama tidak', () => {
  const fungsi = shell.match(/const handleMenuSelect = \(menuName: string\) => \{([\s\S]*?)\n  \};/)[1];
  assert.match(fungsi, /if \(menuName === activeMenu\) ubah\(\);\s*else jalankanTransisi\(ubah, \{ jenis: 'halaman' \}\);/);
});
