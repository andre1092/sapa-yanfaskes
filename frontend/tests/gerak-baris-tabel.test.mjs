import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Baris tabel harus muncul bergiliran 30 ms (video kedua Charles Liu, PR #62). Tes ini menghitung
// kaskade aturan baris di index.css (spesifisitas, shorthand, urutan), bukan hanya keberadaan
// animasinya, karena di PR #62 shorthand `animation:` yang lebih spesifik pernah mengembalikan
// semua jeda ke 0. CSS_UJI boleh menunjuk berkas lain untuk membandingkan versi lama.
const jalur = process.env.CSS_UJI || new URL('../src/index.css', import.meta.url);
const css = await readFile(jalur, 'utf8');

const aturan = [...css.matchAll(/(\.berry-canvas tbody tr:nth-child\([^{]+?)\{([^}]*)\}/g)].map((m, urutan) => ({
  selektor: m[1].trim(), isi: m[2], urutan,
}));

function spesifisitas(selektor) {
  let b = 0; let c = 0;
  const tanpaNot = selektor.replace(/:not\(((?:[^()]|\([^()]*\))*)\)/g, (_, dalam) => {
    const [bb, cc] = spesifisitas(dalam); b += bb; c += cc; return '';
  });
  b += (tanpaNot.match(/\.[\w-]+/g) || []).length;
  b += (tanpaNot.match(/\[[^\]]+\]/g) || []).length;
  b += (tanpaNot.match(/:(?!:)[\w-]+/g) || []).length;
  c += (tanpaNot.replace(/\.[\w-]+|\[[^\]]+\]|:[\w-]+(\([^)]*\))?/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
  return [b, c];
}

function cocok(selektor, n, diEkspor) {
  if (diEkspor && selektor.includes('jpeg-export-')) return false;
  const arg = selektor.match(/tr:nth-child\(([^)]+)\)/)[1].replace(/\s+/g, '');
  const batas = arg.match(/^-n\+(\d+)$/);
  return batas ? n <= Number(batas[1]) : n === Number(arg);
}

function nilai(isi, properti) {
  const panjang = isi.match(new RegExp(`(?:^|;)\\s*animation-${properti}\\s*:\\s*([^;]+)`));
  if (panjang) return panjang[1].trim();
  const singkat = isi.match(/(?:^|;)\s*animation\s*:\s*([^;]+)/);
  if (!singkat) return undefined;
  if (properti === 'name') return singkat[1].match(/sapa-[\w-]+/)?.[0];
  const waktu = singkat[1].match(/-?[\d.]+m?s\b/g) || [];
  return waktu[1] ?? '0s';
}

function hitung(n, diEkspor = false) {
  const hasil = {};
  const berlaku = aturan.filter(a => cocok(a.selektor, n, diEkspor))
    .map(a => ({ ...a, sp: spesifisitas(a.selektor) }))
    .sort((x, y) => x.sp[0] - y.sp[0] || x.sp[1] - y.sp[1] || x.urutan - y.urutan);
  for (const a of berlaku) for (const p of ['name', 'delay']) { const v = nilai(a.isi, p); if (v !== undefined) hasil[p] = v; }
  return hasil;
}

const ms = v => (v === undefined ? undefined : v.endsWith('ms') ? Number.parseFloat(v) : Number.parseFloat(v) * 1000);

test('12 baris pertama memakai animasi masuk dengan jeda 0, 30, ..., 330 ms', () => {
  for (let n = 1; n <= 12; n++) {
    const h = hitung(n);
    assert.equal(h.name, 'sapa-baris-masuk', `baris ${n} tidak beranimasi`);
    assert.equal(ms(h.delay ?? '0s'), 30 * (n - 1), `jeda baris ${n}`);
  }
});

test('baris ke-13 dan seterusnya tidak beranimasi', () => {
  assert.equal(hitung(13).name, undefined);
});

test('tabel tersembunyi untuk JPEG (jpeg-export-*) dikecualikan dari animasi baris', () => {
  assert.ok(aturan.some(a => a.selektor.includes(':not([id^="jpeg-export-"] *)') && nilai(a.isi, 'name') === 'sapa-baris-masuk'));
  for (const n of [1, 2, 12]) assert.equal(hitung(n, true).name, undefined, `baris ekspor ${n}`);
});
