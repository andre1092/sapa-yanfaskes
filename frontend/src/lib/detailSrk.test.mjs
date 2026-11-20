import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./detailSrk.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const s = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

// Nilai palsu; pola nomor tiruan.
const KEPALA = 'Jenis Pelayanan,Kode Poli Tujuan SEP,"Day, Month, Year of Tgl SEP","Day, Month, Year of Tgl Terbit Kontrol",Nama Faskes,Nomor SEP,Nomor Surat Kontrol,Status Surat Kontrol';
const BARIS = 'Rawat Jalan,INT,"November 3, 2026","November 3, 2026","MELATI LUMAJANG, RSUD",1330R0021125V000111,1330R0021125K000222,Tanggal Terbit Kontrol Sama Dengan Tanggal SEP';

test('nomor SEP dan nomor surat kontrol dibuang, kode PPK dari 8 karakter awal', () => {
  const h = s.bersihkanDetailCsv(`${KEPALA}\r\n${BARIS}\r\n`);
  assert.equal(h.galat, null);
  assert.equal(h.baris, 1);
  assert.ok(!h.csv.includes('1330R0021125V000111') && !h.csv.includes('K000222') && !/nomor/i.test(h.csv));
  assert.equal(h.csv.split('\r\n')[0], 'kode_ppk,Jenis Pelayanan,Kode Poli Tujuan SEP,"Day, Month, Year of Tgl SEP","Day, Month, Year of Tgl Terbit Kontrol",Nama Faskes,Status Surat Kontrol');
  assert.equal(h.csv.split('\r\n')[1], '1330R002,Rawat Jalan,INT,"November 3, 2026","November 3, 2026","MELATI LUMAJANG, RSUD",Tanggal Terbit Kontrol Sama Dengan Tanggal SEP');
});

test('BOM dan urutan kolom berbeda tetap terbaca', () => {
  const k = 'Nomor SEP,Nomor Surat Kontrol,Status Surat Kontrol,Nama Faskes,Jenis Pelayanan,Kode Poli Tujuan SEP,"Day, Month, Year of Tgl SEP","Day, Month, Year of Tgl Terbit Kontrol"';
  const b = '0189R0011125V000123,0189R0011125K000124,Tanggal Terbit Kontrol Lebih Besar Tanggal SEP,RSD Mawar,Rawat Inap,BED,"November 4, 2026","November 9, 2026"';
  const h = s.bersihkanDetailCsv(`﻿${k}\n${b}\n`);
  assert.equal(h.galat, null);
  assert.ok(h.csv.split('\r\n')[1].startsWith('0189R001,Rawat Inap,BED,'));
});

test('kolom hilang, nomor tidak berpola, atau berkas kosong ditolak tanpa memantulkan isi', () => {
  assert.match(s.bersihkanDetailCsv('Jenis Pelayanan,Nama Faskes\r\nRawat Jalan,X\r\n').galat, /Kolom/);
  const salah = BARIS.replace('1330R0021125V000111', 'ABC123');
  const g = s.bersihkanDetailCsv(`${KEPALA}\r\n${salah}\r\n`).galat;
  assert.match(g, /baris 2/); assert.ok(!g.includes('ABC123'));
  assert.match(s.bersihkanDetailCsv(`${KEPALA}\r\n`).galat, /tidak berisi/);
});

// --- Review Clara PR #87 (2026-11-19) butir 4 dan 6. Nilai palsu; pola nomor tiruan. ---
const VARIAN = ['0189 R001 1125 V000123', '0189.R001.1125.V000123', '0189-R001-1125-V000123', '0189_R001_1125_V000123',
  '0189/R001/1125/V000123', '0189r0011125v000123', '０１８９R0011125V000123', '٠١٨٩R0011125V000123',
  '0189R001​1125V000123', '0189R001 1125⁠V000123', '0189R0011125', '1125V000123', '\u{1D7CE}189R0011125V000123'];

test('pola nomor di sel mana pun (bukan hanya kolom Nomor SEP) ditolak di browser tanpa memantulkan isi', () => {
  for (const v of VARIAN) {
    assert.ok(s.miripNomor(v), v);
    for (const [cari, ganti] of [['"MELATI LUMAJANG, RSUD"', `"${v}"`], [',INT,', `,"${v}",`]]) {
      const g = s.bersihkanDetailCsv(`${KEPALA}\r\n${BARIS.replace(cari, ganti)}\r\n`).galat;
      assert.match(g ?? '', /pola nomor/, v); assert.ok(!g.includes(v));
    }
  }
});

test('sel biasa tidak dianggap nomor', () => {
  for (const v of ['November 30, 2026', 'RSD Mawar', 'MELATI LUMAJANG, RSUD', '0189R001', 'INT', 'Tanggal Terbit Kontrol Sama Dengan Tanggal SEP']) {
    assert.equal(s.miripNomor(v), false, v);
  }
});

test('baris dengan jumlah kolom bergeser ditolak', () => {
  const g = s.bersihkanDetailCsv(`${KEPALA}\r\n${BARIS},tambahan\r\n`).galat;
  assert.match(g ?? '', /Jumlah kolom di baris 2/);
  assert.match(g, /tanpa dibuka di Excel/);
});

test('pilihan bulan unggah hanya 3 bulan terakhir, mulai November 2026', () => {
  assert.deepEqual(s.bulanUnggahDetail(new Date(2026, 10, 20)), ['2026-11']);
  assert.deepEqual(s.bulanUnggahDetail(new Date(2026, 11, 5)), ['2026-12', '2026-11']);
  assert.deepEqual(s.bulanUnggahDetail(new Date(2027, 2, 1)), ['2027-03', '2027-02', '2027-01']);
});

test('hasil integrasi harus memuat bulan yang diunggah', () => {
  assert.equal(s.bulanTersimpan({ bulan: [{ bulan: '2026-11' }] }, '2026-11'), true);
  assert.equal(s.bulanTersimpan({ bulan: [{ bulan: '2026-10' }] }, '2026-11'), false);
  assert.equal(s.bulanTersimpan({}, '2026-11'), false);
});
