import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./labelTargetGrafik.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { letakLabelTarget } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

// Garis target 70 pada grafik setinggi 160 dari dasar 200: y = 200 - 0.70 * 160.
const Y_TARGET = 88;

test('tanpa titik di dekat garis, tulisan target di kanan atas garis', () => {
  const letak = letakLabelTarget([{ x: 70, y: 150 }, { x: 870, y: 150 }], Y_TARGET);
  assert.deepEqual(letak, { x: 875, y: 83, anchor: 'end' });
});

test('titik terakhir menempel di garis: tulisan pindah ke kiri atas', () => {
  const letak = letakLabelTarget([{ x: 70, y: 150 }, { x: 870, y: 86.32 }], Y_TARGET);
  assert.deepEqual(letak, { x: 50, y: 83, anchor: 'start' });
});

test('keadaan produksi Oktober 2026 (77.35, 76.50, 71.05): tulisan pindah ke kiri bawah', () => {
  const titik = [{ x: 70, y: 76.24 }, { x: 470, y: 77.6 }, { x: 870, y: 86.32 }];
  assert.deepEqual(letakLabelTarget(titik, Y_TARGET), { x: 50, y: 101, anchor: 'start' });
});

test('semua tempat terhalang: kembali ke kanan atas', () => {
  const letak = letakLabelTarget([{ x: 70, y: 88 }, { x: 870, y: 88 }], Y_TARGET);
  assert.deepEqual(letak, { x: 875, y: 83, anchor: 'end' });
});
