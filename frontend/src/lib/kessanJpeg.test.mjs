import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

// kessanJpeg.ts memakai fungsi dari kessan.ts dan suratKontrol.ts; keduanya ditranspilasi dulu dan impor relatifnya
// diganti alamat data: supaya bisa dimuat tanpa bundler.
const muat = async (berkas, ganti = {}) => {
  let source = await readFile(new URL(berkas, import.meta.url), 'utf8');
  let { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
  for (const [dari, ke] of Object.entries(ganti)) outputText = outputText.replaceAll(`from '${dari}'`, `from '${ke}'`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const urlKessan = await muat('./kessan.ts');
const urlSurkon = await muat('./suratKontrol.ts');
const j = await import(await muat('./kessanJpeg.ts', { './kessan': urlKessan, './suratKontrol': urlSurkon }));
const k = await import(urlKessan);

// Data tiruan: kode dan nama faskes samaran. Agregatnya sama dengan angka acuan November 2026 setelah 27 FKRTL
// (27 faskes, 16.191 dari target 7.782, rata-rata skor 97 dari faskes bertarget; Jember 14, Lumajang 9, Bondowoso 4 faskes).
// Dua baris terakhir meniru FKRTL tanpa baris sheet yang kini dikirim API: kunjungan 0, target null, skor 100.
const NOV = [
  ['Bondowoso', 1622, 357, 100], ['Lumajang', 1598, 357, 100], ['Jember', 1202, 278, 100], ['Lumajang', 1184, 357, 100],
  ['Jember', 1085, 370, 100], ['Jember', 915, 278, 100], ['Jember', 842, 278, 100], ['Jember', 757, 357, 100],
  ['Jember', 745, 370, 100], ['Lumajang', 629, 357, 100], ['Bondowoso', 589, 357, 100], ['Jember', 525, 357, 100],
  ['Jember', 519, 370, 100], ['Bondowoso', 492, 370, 100], ['Jember', 479, 357, 100], ['Lumajang', 455, 278, 100],
  ['Lumajang', 422, 278, 100], ['Jember', 402, 357, 100], ['Jember', 357, 357, 100], ['Jember', 334, 217, 100],
  ['Lumajang', 323, 278, 100], ['Lumajang', 312, 357, 75], ['Jember', 171, 132, 100], ['Jember', 146, 278, 50],
  ['Lumajang', 86, 80, 100], ['Lumajang', 0, null, 100], ['Bondowoso', 0, null, 100],
].map(([kabupaten, jumlah_kessan, target, skor], i) => {
  const no = String(i + 1).padStart(2, '0');
  return { kode_ppk: `9999R0${no}`, nama_faskes: `RS CONTOH ${no}`, kabupaten, bulan: '2026-11', jumlah_kessan, target,
    persen: target ? Math.round((jumlah_kessan / target) * 10000) / 100 : null, skor };
});

test('judul memuat bulan terpilih', () => {
  assert.equal(j.judulJpeg('2026-11'), 'Monitoring Kessan FKRTL — November 2026');
  assert.equal(j.judulJpeg('2026-01'), 'Monitoring Kessan FKRTL — Januari 2026');
});

test('keterangan lingkup, Last Update dengan cadangan, dan baris data sementara', () => {
  assert.equal(j.lingkupJpeg({ kabupaten: '', petugas: false, namaRs: '' }), 'Semua kabupaten');
  assert.equal(j.lingkupJpeg({ kabupaten: 'Lumajang', petugas: false, namaRs: '' }), 'Kabupaten Lumajang');
  assert.equal(j.lingkupJpeg({ kabupaten: '', petugas: true, namaRs: 'RS CONTOH 03' }), 'RS CONTOH 03');
  assert.equal(j.keteranganJpeg('Semua kabupaten'), 'Capaian kunjungan Kessan per FKRTL terhadap target bulanan · Semua kabupaten');
  assert.equal(j.teksLastUpdate('Last Update : 2026-11-20 02:42:06'), 'Last Update : 2026-11-20 02:42:06 · sumber BI BPJS Kesehatan');
  assert.equal(j.teksLastUpdate(null), 'Last Update : – · sumber BI BPJS Kesehatan');
  assert.equal(j.teksLastUpdate('  '), 'Last Update : – · sumber BI BPJS Kesehatan');
  assert.equal(j.teksSementara('2026-11'), 'Data November 2026 diambil sebelum bulan selesai; angkanya masih bisa bertambah.');
});

test('warna skor lima jenjang sesuai keputusan CEO', () => {
  assert.deepEqual(j.warnaSkor(100), { latar: '#C6EFCE', teks: '#006100' });
  assert.deepEqual(j.warnaSkor(75), { latar: '#E2EFDA', teks: '#375623' });
  assert.deepEqual(j.warnaSkor(50), { latar: '#FFD966', teks: '#5C4400' });
  assert.deepEqual(j.warnaSkor(25), { latar: '#F4B183', teks: '#6B2600' });
  assert.deepEqual(j.warnaSkor(0), { latar: '#FFC7CE', teks: '#9C0006' });
  assert.deepEqual(j.warnaSkor(80), j.warnaSkor(75));
  assert.deepEqual(j.warnaSkor(10), j.warnaSkor(0));
});

test('baris di bawah target kuning; tanpa target tidak kuning dan skornya 100*', () => {
  const kurang = j.barisJpeg({ ...NOV[0], jumlah_kessan: 146, target: 278, persen: 52.52, skor: 50 });
  assert.equal(kurang.kuning, true);
  assert.equal(kurang.tanpaTarget, false);
  assert.equal(kurang.labelSkor, '50');
  const pas = j.barisJpeg({ ...NOV[0], jumlah_kessan: 278, target: 278, persen: 100, skor: 100 });
  assert.equal(pas.kuning, false);
  const nol = j.barisJpeg({ ...NOV[0], jumlah_kessan: 0, target: 278, persen: 0, skor: 0 });
  assert.equal(nol.kuning, true);
  assert.equal(nol.persen, 0);
  const tanpa = j.barisJpeg({ ...NOV[0], jumlah_kessan: 0, target: null, persen: null, skor: 100 });
  assert.equal(tanpa.kuning, false);
  assert.equal(tanpa.tanpaTarget, true);
  assert.equal(tanpa.persen, null);
  assert.equal(tanpa.labelSkor, '100*');
  const targetNol = j.barisJpeg({ ...NOV[0], jumlah_kessan: 12, target: 0, persen: null, skor: 100 });
  assert.equal(targetNol.tanpaTarget, true);
  assert.equal(targetNol.kuning, false);
  // Persen kosong dari server dengan target ada: dihitung dari kunjungan ÷ target.
  assert.equal(j.barisJpeg({ ...NOV[0], jumlah_kessan: 50, target: 200, persen: null, skor: 25 }).persen, 25);
  // Kabupaten kosong ditulis "-".
  assert.equal(j.barisJpeg({ ...NOV[0], kabupaten: '' }).kabupaten, '-');
  assert.equal(j.barisJpeg({ ...NOV[0], kabupaten: 'Jember' }).kabupaten, 'Jember');
});

test('urutan tetap: kabupaten Jember, Lumajang, Bondowoso, lain; lalu kunjungan menurun; lalu nama', () => {
  const baris = [
    { ...NOV[0], kode_ppk: 'A', nama_faskes: 'RS B', kabupaten: 'Bondowoso', jumlah_kessan: 10 },
    { ...NOV[0], kode_ppk: 'B', nama_faskes: 'RS Z', kabupaten: '', jumlah_kessan: 999 },
    { ...NOV[0], kode_ppk: 'C', nama_faskes: 'RS C', kabupaten: 'Jember', jumlah_kessan: 5 },
    { ...NOV[0], kode_ppk: 'D', nama_faskes: 'RS B', kabupaten: 'Jember', jumlah_kessan: 5 },
    { ...NOV[0], kode_ppk: 'E', nama_faskes: 'RS L', kabupaten: 'Lumajang', jumlah_kessan: 1 },
    { ...NOV[0], kode_ppk: 'F', nama_faskes: 'RS J', kabupaten: 'Jember', jumlah_kessan: 50 },
    { ...NOV[0], kode_ppk: 'G', nama_faskes: 'RS S', kabupaten: 'Situbondo', jumlah_kessan: 3 },
  ];
  assert.deepEqual(j.urutJpeg(baris).map(b => b.kode_ppk), ['F', 'D', 'C', 'E', 'A', 'B', 'G']);
  // Tidak mengubah masukan.
  assert.equal(baris[0].kode_ppk, 'A');
});

test('semua kabupaten: subtotal per kabupaten dan Total cabang sesuai angka acuan November', () => {
  const t = j.susunTabelJpeg(NOV, { kabupaten: '', petugas: false });
  assert.equal(t.jumlahBaris, 27);
  assert.deepEqual(t.kelompok.map(g => [g.kabupaten, g.baris.length]), [['Jember', 14], ['Lumajang', 9], ['Bondowoso', 4]]);
  const [jem, lum, bon] = t.kelompok.map(g => g.subtotal);
  assert.equal(jem.label, 'Subtotal Jember (14 faskes)');
  assert.equal(jem.kunjungan, 8479);
  assert.equal(lum.label, 'Subtotal Lumajang (9 faskes)');
  assert.equal(lum.kunjungan, 5009);
  assert.equal(bon.label, 'Subtotal Bondowoso (4 faskes)');
  assert.equal(bon.kunjungan, 2703);
  assert.equal(t.total.label, 'Total cabang (27 faskes)');
  assert.equal(t.total.kunjungan, 16191);
  assert.equal(t.total.target, 7782);
  assert.equal(k.persen(t.total.persen), '208,06');
  // Rata-rata hanya dari 25 faskes bertarget (keputusan CEO): 97.
  assert.equal(k.skorRata(t.total.rataSkor), '97');
  assert.equal(t.adaTanpaTarget, true);
  // Dalam kelompok: kunjungan menurun, faskes tanpa target (kunjungan 0) di bawah.
  const lumajang = t.kelompok[1].baris;
  assert.equal(lumajang[0].kunjungan, 1598);
  assert.equal(lumajang[lumajang.length - 1].labelSkor, '100*');
  // Hanya dua faskes di bawah target yang kuning.
  assert.equal(t.kelompok.flatMap(g => g.baris).filter(b => b.kuning).length, 2);
  // Jumlah baris faskes sama dengan n di Total.
  assert.equal(t.kelompok.reduce((s, g) => s + g.baris.length, 0), 27);
});

test('baris berkabupaten lain atau kosong menjadi kelompok terakhir dengan subtotal sendiri', () => {
  const baris = [...NOV.slice(0, 3), { ...NOV[3], kabupaten: '' }, { ...NOV[4], kabupaten: 'Situbondo' }];
  const t = j.susunTabelJpeg(baris, { kabupaten: '', petugas: false });
  const akhir = t.kelompok[t.kelompok.length - 1];
  assert.equal(akhir.kabupaten, '');
  assert.equal(akhir.subtotal.label, 'Subtotal kabupaten lain (2 faskes)');
  assert.deepEqual(akhir.baris.map(b => b.kabupaten).sort(), ['-', 'Situbondo']);
  assert.equal(t.total.label, 'Total cabang (5 faskes)');
});

test('filter kabupaten: satu kelompok tanpa Subtotal, Total memakai nama kabupaten', () => {
  const lum = NOV.filter(b => b.kabupaten === 'Lumajang');
  const t = j.susunTabelJpeg(lum, { kabupaten: 'Lumajang', petugas: false });
  assert.equal(t.kelompok.length, 1);
  assert.equal(t.kelompok[0].subtotal, null);
  assert.equal(t.total.label, 'Total Kabupaten Lumajang (9 faskes)');
  assert.equal(t.total.kunjungan, 5009);
});

test('Petugas RS: satu baris tanpa Subtotal dan Total', () => {
  const t = j.susunTabelJpeg([NOV[23]], { kabupaten: '', petugas: true });
  assert.equal(t.kelompok.length, 1);
  assert.equal(t.kelompok[0].subtotal, null);
  assert.equal(t.total, null);
  assert.equal(t.jumlahBaris, 1);
  assert.equal(t.kelompok[0].baris[0].kuning, true);
});

test('satu kabupaten saja di Semua kabupaten: tanpa Subtotal; tanpa baris: tanpa Total', () => {
  const t = j.susunTabelJpeg(NOV.filter(b => b.kabupaten === 'Jember'), { kabupaten: '', petugas: false });
  assert.equal(t.kelompok.length, 1);
  assert.equal(t.kelompok[0].subtotal, null);
  assert.equal(t.total.label, 'Total cabang (14 faskes)');
  const kosong = j.susunTabelJpeg([], { kabupaten: '', petugas: false });
  assert.equal(kosong.jumlahBaris, 0);
  assert.equal(kosong.total, null);
  assert.equal(kosong.adaTanpaTarget, false);
});

test('nama berkas: bulan, kabupaten, nama RS, dan penanda sementara dibersihkan', () => {
  assert.equal(j.namaBerkasJpegKessan({ bulan: '2026-11', kabupaten: '', namaRs: '', sementara: true }),
    'Monitoring_Kessan_FKRTL_November_2026_sementara.jpg');
  assert.equal(j.namaBerkasJpegKessan({ bulan: '2026-10', kabupaten: 'Lumajang', namaRs: '', sementara: false }),
    'Monitoring_Kessan_FKRTL_Oktober_2026_Lumajang.jpg');
  assert.equal(j.namaBerkasJpegKessan({ bulan: '2026-10', kabupaten: '', namaRs: 'RS GIGI DAN MULUT UNIV. JEMBER', sementara: false }),
    'Monitoring_Kessan_FKRTL_Oktober_2026_RS_GIGI_DAN_MULUT_UNIV_JEMBER.jpg');
});

test('kaki gambar memakai waktu WIB', () => {
  assert.equal(j.teksDiunduh(new Date('2026-11-20T12:05:00Z')), 'Diunduh dari SAPA Yanfaskes, 20 Nov 2026 19.05 WIB.');
});

test('legenda jenjang skor berurutan dengan rentangnya', () => {
  assert.deepEqual(j.JENJANG_SKOR, [[100, '≥ 100% target'], [75, '75% – < 100%'], [50, '50% – < 75%'], [25, '25% – < 50%'], [0, '< 25%']]);
});
