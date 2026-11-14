import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./transisiTampilan.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
// react-dom tidak bisa dimuat dari data URL; flushSync diganti pemanggil langsung untuk tes.
const kode = outputText.replace("import { flushSync } from 'react-dom';", 'const flushSync = f => f();');
const { jariJariSampaiSudut, titikDari, jalankanTransisi } = await import(`data:text/javascript;base64,${Buffer.from(kode).toString('base64')}`);

function lingkungan({ dukung = true, kurangiGerak = false } = {}) {
  const gaya = {};
  const akar = { dataset: {}, style: { setProperty: (k, v) => { gaya[k] = v; } } };
  let selesai;
  const panggilan = [];
  globalThis.window = { innerWidth: 1000, innerHeight: 600, matchMedia: () => ({ matches: kurangiGerak }) };
  globalThis.document = { documentElement: akar };
  if (dukung) {
    globalThis.document.startViewTransition = perbarui => {
      panggilan.push('mulai');
      perbarui();
      return { ready: Promise.resolve(), finished: new Promise(r => { selesai = r; }) };
    };
  }
  return { akar, gaya, panggilan, selesaikan: () => selesai?.() };
}

test('jari-jari mask mencapai sudut layar terjauh', () => {
  assert.equal(jariJariSampaiSudut(0, 0, 100, 100), 142);
  assert.equal(jariJariSampaiSudut(1000, 0, 1000, 600), 1167);
  assert.equal(jariJariSampaiSudut(500, 300, 1000, 600), 584);
});

test('titik pusat diambil dari tengah elemen yang diklik', () => {
  const event = { currentTarget: { getBoundingClientRect: () => ({ left: 10, top: 20, width: 40, height: 44 }) } };
  assert.deepEqual(titikDari(event), { x: 30, y: 42 });
  assert.equal(titikDari(undefined), undefined);
  assert.equal(titikDari({ currentTarget: null }), undefined);
});

test('browser tanpa View Transitions: perubahan langsung diterapkan', () => {
  const l = lingkungan({ dukung: false });
  let dipanggil = 0;
  jalankanTransisi(() => { dipanggil++; }, { jenis: 'tema', asal: { x: 1, y: 1 } });
  assert.equal(dipanggil, 1);
  assert.equal(l.akar.dataset.transisi, undefined);
});

test('pengguna meminta gerak dikurangi: tanpa transisi', () => {
  const l = lingkungan({ kurangiGerak: true });
  let dipanggil = 0;
  jalankanTransisi(() => { dipanggil++; }, { jenis: 'tema' });
  assert.equal(dipanggil, 1);
  assert.deepEqual(l.panggilan, []);
  assert.equal(l.akar.dataset.transisi, undefined);
});

test('dengan View Transitions: atribut dan pusat mask dipasang lalu dibersihkan', async () => {
  const l = lingkungan();
  let dipanggil = 0;
  jalankanTransisi(() => { dipanggil++; }, { jenis: 'tema', asal: { x: 1000, y: 0 } });
  assert.equal(dipanggil, 1);
  assert.deepEqual(l.panggilan, ['mulai']);
  assert.equal(l.akar.dataset.transisi, 'tema');
  assert.deepEqual(l.gaya, { '--transisi-x': '1000px', '--transisi-y': '0px', '--transisi-r': '1167px' });
  l.selesaikan();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(l.akar.dataset.transisi, undefined);
});
