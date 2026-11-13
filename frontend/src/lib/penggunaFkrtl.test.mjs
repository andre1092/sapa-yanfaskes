import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const keDataUrl = kode => `data:text/javascript;base64,${Buffer.from(kode).toString('base64')}`;
const terjemah = async nama => ts.transpileModule(await readFile(new URL(nama, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const outputText = (await terjemah('./penggunaFkrtl.ts')).replace("'./cocokCari'", `'${keDataUrl(await terjemah('./cocokCari.ts'))}'`);
const mod = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const { ringkasPengguna, saringPengguna, statusPengguna } = mod;

const p = (nama, kode, kab, extra = {}) => ({ user_id: `auth0|${nama}`, nama, email: `${nama.toLowerCase()}@rs.test`, aktif: true, wajib_ganti_sandi: false, kode_ppk: kode, faskes: { kode_ppk: kode, nama_ppk: `RS ${kode}`, kabupaten: kab }, ...extra });
const PENGGUNA = [p('Ani', 'A1', 'Jember'), p('Budi', 'A1', 'Jember', { wajib_ganti_sandi: true }), p('Citra', 'B2', 'Bondowoso', { aktif: false })];
const FASKES = [{ kode_ppk: 'A1' }, { kode_ppk: 'B2' }, { kode_ppk: 'C3' }];

test('status: nonaktif mengalahkan wajib ganti sandi', () => {
  assert.deepEqual(PENGGUNA.map(statusPengguna), ['aktif', 'wajib_ganti', 'nonaktif']);
});

test('ringkasan: RS yang punya akun aktif, dari seluruh RS referensi', () => {
  assert.deepEqual(ringkasPengguna(PENGGUNA, FASKES), { rsBerakun: 1, totalRs: 3, wajibGanti: 1, nonaktif: 1 });
});

test('saring menurut kata kunci (nama, email, faskes, kode), kabupaten, dan status', () => {
  const nama = list => list.map(x => x.nama);
  assert.deepEqual(nama(saringPengguna(PENGGUNA, { cari: 'budi', kabupaten: '', status: '' })), ['Budi']);
  assert.deepEqual(nama(saringPengguna(PENGGUNA, { cari: 'rs b2', kabupaten: '', status: '' })), ['Citra']);
  assert.deepEqual(nama(saringPengguna(PENGGUNA, { cari: '', kabupaten: 'Jember', status: '' })), ['Ani', 'Budi']);
  assert.deepEqual(nama(saringPengguna(PENGGUNA, { cari: '', kabupaten: '', status: 'wajib_ganti' })), ['Budi']);
});

test('login terakhir memakai waktu WIB dengan jam', () => {
  const { formatLoginTerakhir } = mod;
  assert.equal(formatLoginTerakhir('2026-11-12T18:30:00.000Z'), '13/11/2026 01:30');
  assert.equal(formatLoginTerakhir('2026-11-12T08:05:00Z'), '12/11/2026 15:05');
  assert.equal(formatLoginTerakhir(null), 'Belum pernah');
  assert.equal(formatLoginTerakhir('bukan tanggal'), 'Belum pernah');
});
