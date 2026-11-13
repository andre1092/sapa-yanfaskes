import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./izinPeran.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { bolehMelakukan, menuBoleh } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('matriks peran yang disetujui CEO', () => {
  const harapan = {
    viewer: { lihat: true, ekspor: false, sinkron: false, pengaturan: false },
    Admin: { lihat: true, ekspor: true, sinkron: true, pengaturan: false },
    'Super Admin': { lihat: true, ekspor: true, sinkron: true, pengaturan: true },
  };
  for (const [peran, aksi] of Object.entries(harapan)) {
    for (const [nama, boleh] of Object.entries(aksi)) assert.equal(bolehMelakukan(peran, nama), boleh, `${peran} ${nama}`);
  }
});

test('peran tidak dikenal atau kosong tidak mendapat izin tambahan', () => {
  for (const peran of [undefined, null, '', 'owner']) {
    assert.equal(bolehMelakukan(peran, 'sinkron'), false);
    assert.equal(bolehMelakukan(peran, 'pengaturan'), false);
  }
});

test('menu Administrasi mengikuti izin', () => {
  assert.equal(menuBoleh('Integration', 'viewer'), false);
  assert.equal(menuBoleh('Integration', 'Admin'), true);
  assert.equal(menuBoleh('Validation Rules', 'Admin'), false);
  assert.equal(menuBoleh('Validation Rules', 'Super Admin'), true);
  assert.equal(menuBoleh('Logs', 'Admin'), false);
  assert.equal(menuBoleh('Logs', 'Super Admin'), true);
  for (const menu of ['Home', 'Pemanfaatan Antrol FKRTL', 'Capaian Kepatuhan FKTP', 'Monitoring LARAS', 'Capaian Kepatuhan FKRTL']) {
    assert.equal(menuBoleh(menu, 'viewer'), true, menu);
  }
});

test('Petugas RS: lihat dan unduh FKRTL, tanpa FKTP dan Administrasi', () => {
  assert.equal(bolehMelakukan('Petugas RS', 'lihat'), true);
  assert.equal(bolehMelakukan('Petugas RS', 'ekspor'), true);
  assert.equal(bolehMelakukan('Petugas RS', 'sinkron'), false);
  assert.equal(bolehMelakukan('Petugas RS', 'pengaturan'), false);
  for (const menu of ['Home', 'Pemanfaatan Antrol FKRTL', 'Monitoring LARAS', 'Capaian Kepatuhan FKRTL']) {
    assert.equal(menuBoleh(menu, 'Petugas RS'), true, menu);
  }
  for (const menu of ['Capaian Kepatuhan FKTP', 'Integration', 'Logs', 'Validation Rules', 'Pengguna FKRTL']) {
    assert.equal(menuBoleh(menu, 'Petugas RS'), false, menu);
  }
});

test('menu Pengguna FKRTL hanya untuk Super Admin', () => {
  assert.equal(menuBoleh('Pengguna FKRTL', 'viewer'), false);
  assert.equal(menuBoleh('Pengguna FKRTL', 'Admin'), false);
  assert.equal(menuBoleh('Pengguna FKRTL', 'Super Admin'), true);
});
