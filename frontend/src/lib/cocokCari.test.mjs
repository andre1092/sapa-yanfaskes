import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./cocokCari.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { normalisasiCari, pencocokCari, cocokCari } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('normalisasi membuang huruf besar, aksen, tanda baca, dan spasi ganda', () => {
  assert.equal(normalisasiCari('  RSD  dr. Soebandi, JEMBER '), 'rsd dr soebandi jember');
  assert.equal(normalisasiCari('Klinik Pratama "Mā\'arif"'), 'klinik pratama ma arif');
  assert.equal(normalisasiCari(null), '');
  assert.equal(normalisasiCari(1302), '1302');
});

test('kueri kosong atau hanya tanda baca cocok dengan semua baris', () => {
  assert.equal(cocokCari('', 'apa saja'), true);
  assert.equal(cocokCari('  .,- ', 'apa saja'), true);
});

test('huruf besar-kecil dan tanda baca tidak menghalangi', () => {
  assert.equal(cocokCari('rsd DR soebandi', 'RSD dr. Soebandi'), true);
  assert.equal(cocokCari('dr.soebandi', 'RSD dr. Soebandi'), true);
  assert.equal(cocokCari('1302-r001', '1302R001'), true);
});

test('kata boleh tersebar di beberapa kolom dan urutannya bebas', () => {
  assert.equal(cocokCari('jember soebandi', 'RSD dr. Soebandi', '1302R001', 'Jember'), true);
  assert.equal(cocokCari('soebandi banyuwangi', 'RSD dr. Soebandi', '1302R001', 'Jember'), false);
});

test('spasi yang hilang tetap ditemukan', () => {
  assert.equal(cocokCari('sitifatimah', 'Siti Fatimah'), true);
  assert.equal(cocokCari('maarif', "Ma'arif"), true);
});

test('kolom kosong atau bukan teks tidak membuat galat', () => {
  assert.equal(cocokCari('jember', undefined, null, 'Jember'), true);
  assert.equal(cocokCari('12', 1234), true);
});

test('pencocok dipakai ulang untuk banyak baris', () => {
  const cocok = pencocokCari('kalisat');
  assert.deepEqual(['Puskesmas Kalisat', 'Puskesmas Sukowono'].filter(n => cocok(n)), ['Puskesmas Kalisat']);
});
