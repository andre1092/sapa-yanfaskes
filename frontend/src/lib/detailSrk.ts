// Download Detail SRK versi 1 (syarat Clara 2026-11-19): Nomor SEP dan Nomor Surat Kontrol dibuang DI BROWSER.
// Kode PPK diambil dari 8 karakter awal Nomor SEP; yang dikirim ke server hanya 7 kolom tanpa nomor.

const SUMBER = ['Jenis Pelayanan', 'Kode Poli Tujuan SEP', 'Day, Month, Year of Tgl SEP', 'Day, Month, Year of Tgl Terbit Kontrol',
  'Nama Faskes', 'Nomor SEP', 'Nomor Surat Kontrol', 'Status Surat Kontrol'] as const;
const KIRIM = ['kode_ppk', 'Jenis Pelayanan', 'Kode Poli Tujuan SEP', 'Day, Month, Year of Tgl SEP', 'Day, Month, Year of Tgl Terbit Kontrol',
  'Nama Faskes', 'Status Surat Kontrol'] as const;
const RE_NOMOR = /^[0-9]{4}[A-Z][0-9]{7}[A-Z][0-9]{6}$/;
// Review Clara PR #87 butir 4: sama dengan server (surat_kontrol_detail_service.mirip_nomor), pola utuh atau potongan
// dicek pada sel yang sudah dinormalisasi.
const RE_NOMOR_DI_SEL = /[0-9]{4}[A-Z][0-9]{7}[A-Z][0-9]{6}|[0-9]{4}[A-Z][0-9]{7}|[0-9]{4}[A-Z][0-9]{6}|[0-9]{11}/;
const RE_ND = /\p{Nd}/u;

/** Digit desimal Unicode apa pun -> ASCII: blok digit Unicode berurutan 0–9, jadi nilainya jarak dari awal deret. */
function digitAscii(ch: string): string {
  const cp = ch.codePointAt(0)!;
  let awal = cp;
  while (awal > 0 && RE_ND.test(String.fromCodePoint(awal - 1))) awal--;
  return String((cp - awal) % 10);
}

/** NFKC, digit Unicode -> ASCII, huruf besar, buang kategori Cf/Z dan pemisah spasi . - _ /. */
export function normalkanSel(nilai: string): string {
  let hasil = '';
  for (const ch of (nilai ?? '').normalize('NFKC')) {
    if (/[\p{Cf}\p{Z}\s._\-/]/u.test(ch)) continue;
    hasil += RE_ND.test(ch) ? digitAscii(ch) : ch;
  }
  return hasil.toUpperCase();
}

export const miripNomor = (nilai: string) => RE_NOMOR_DI_SEL.test(normalkanSel(nilai));

/** Jawaban Integrasikan dianggap berhasil hanya bila daftar bulan tersimpan memuat bulan yang diunggah. */
export const bulanTersimpan = (data: { bulan?: { bulan: string }[] } | null | undefined, bulan: string) =>
  Array.isArray(data?.bulan) && data.bulan.some(b => b?.bulan === bulan);

/** SSBI "Download > Data" memberi UTF-16 LE ber-BOM; selain itu dibaca UTF-8. TextDecoder membuang BOM. */
export function bacaTeksBerkas(isi: ArrayBuffer): string {
  const b = new Uint8Array(isi, 0, Math.min(2, isi.byteLength));
  const kode = b[0] === 0xff && b[1] === 0xfe ? 'utf-16le' : b[0] === 0xfe && b[1] === 0xff ? 'utf-16be' : 'utf-8';
  return new TextDecoder(kode).decode(isi);
}

/** Pembaca CSV RFC 4180 sederhana (kutip ganda, koma atau tab, CRLF/LF). */
function bacaCsv(teks: string, pemisah: string): string[][] {
  const baris: string[][] = [];
  let sel = '', kini: string[] = [], kutip = false;
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (kutip) {
      if (c === '"' && teks[i + 1] === '"') { sel += '"'; i++; } else if (c === '"') kutip = false; else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === pemisah) { kini.push(sel); sel = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && teks[i + 1] === '\n') i++;
      kini.push(sel); baris.push(kini); kini = []; sel = '';
    } else sel += c;
  }
  if (sel || kini.length) { kini.push(sel); baris.push(kini); }
  return baris.filter(b => b.some(x => x.trim()));
}

const kutipCsv = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export type HasilBersih = { csv: string; baris: number; galat: string | null };

export function bersihkanDetailCsv(teks: string): HasilBersih {
  const bersih = teks.replace(/^\uFEFF/, '');
  // Judul SSBI memuat koma ("Day, Month, Year of ..."), jadi tab di baris judul berarti berkas TSV.
  const rows = bacaCsv(bersih, /^[^\r\n]*\t/.test(bersih) ? '\t' : ',');
  if (!rows.length) return { csv: '', baris: 0, galat: 'Berkas tidak berisi baris data.' };
  const kepala = rows[0].map(h => h.trim());
  const posisi = Object.fromEntries(SUMBER.map(n => [n, kepala.indexOf(n)])) as Record<(typeof SUMBER)[number], number>;
  if (SUMBER.some(n => posisi[n] < 0)) return { csv: '', baris: 0, galat: 'Kolom berkas tidak sesuai view SSBI Surat Kontrol = SEP. Unduh ulang berkas CSV dari SSBI.' };
  const keluar = [KIRIM.map(kutipCsv).join(',')];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i].map(x => x.trim());
    if (r.length !== kepala.length) return { csv: '', baris: 0, galat: `Jumlah kolom di baris ${i + 1} tidak sama dengan baris judul. Unduh ulang berkas dari SSBI, lalu pilih tanpa dibuka di Excel.` };
    const sep = r[posisi['Nomor SEP']] ?? '';
    if (!RE_NOMOR.test(sep)) return { csv: '', baris: 0, galat: `Nomor SEP di baris ${i + 1} tidak sesuai pola. Unduh ulang berkas dari SSBI.` };
    const nilai = [sep.slice(0, 8), r[posisi['Jenis Pelayanan']], r[posisi['Kode Poli Tujuan SEP']], r[posisi['Day, Month, Year of Tgl SEP']],
      r[posisi['Day, Month, Year of Tgl Terbit Kontrol']], r[posisi['Nama Faskes']], r[posisi['Status Surat Kontrol']]];
    // Semua sel yang akan dikirim dicek pola nomor (nomor yang bergeser kolom tidak boleh sampai ke server).
    if (nilai.slice(1).some(v => miripNomor(v ?? ''))) {
      return { csv: '', baris: 0, galat: `Baris ${i + 1} memuat pola nomor SEP atau nomor surat kontrol di luar kolom nomor. Berkas tidak dikirim. Unduh ulang berkas dari SSBI, lalu pilih tanpa dibuka di Excel.` };
    }
    keluar.push(nilai.map(v => kutipCsv(v ?? '')).join(','));
  }
  if (keluar.length === 1) return { csv: '', baris: 0, galat: 'Berkas tidak berisi baris data.' };
  return { csv: `${keluar.join('\r\n')}\r\n`, baris: keluar.length - 1, galat: null };
}

/** Keputusan CEO 2026-11-24 "RJ saja dulu": sheet SSBI hanya memuat Rawat Jalan, jadi detail RI belum ada. */
export function batasJenisDetail(jenis: string): { nonaktif: boolean; catatan: string | null } {
  if (jenis === 'RI') return { nonaktif: true, catatan: 'Detail Rawat inap belum tersedia. Pilih Jenis Rawat jalan untuk mengunduh detail.' };
  if (jenis === 'semua') return { nonaktif: false, catatan: 'Berkas hanya berisi Rawat jalan; detail Rawat inap belum tersedia.' };
  return { nonaktif: false, catatan: null };
}

/** Beberapa berkas bersih (judul sama, KIRIM) menjadi satu kiriman: judul sekali, baris semua berkas berurutan. */
export function gabungDetailCsv(daftar: HasilBersih[]): HasilBersih {
  const baris = daftar.flatMap(h => h.csv.split('\r\n').slice(1).filter(Boolean));
  return { csv: `${[KIRIM.map(kutipCsv).join(','), ...baris].join('\r\n')}\r\n`, baris: baris.length, galat: null };
}
