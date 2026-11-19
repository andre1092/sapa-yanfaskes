// Download Detail SRK versi 1 (syarat Clara 2026-11-19): Nomor SEP dan Nomor Surat Kontrol dibuang DI BROWSER.
// Kode PPK diambil dari 8 karakter awal Nomor SEP; yang dikirim ke server hanya 7 kolom tanpa nomor.

const SUMBER = ['Jenis Pelayanan', 'Kode Poli Tujuan SEP', 'Day, Month, Year of Tgl SEP', 'Day, Month, Year of Tgl Terbit Kontrol',
  'Nama Faskes', 'Nomor SEP', 'Nomor Surat Kontrol', 'Status Surat Kontrol'] as const;
const KIRIM = ['kode_ppk', 'Jenis Pelayanan', 'Kode Poli Tujuan SEP', 'Day, Month, Year of Tgl SEP', 'Day, Month, Year of Tgl Terbit Kontrol',
  'Nama Faskes', 'Status Surat Kontrol'] as const;
const RE_NOMOR = /^[0-9]{4}[A-Z][0-9]{7}[A-Z][0-9]{6}$/;

/** Pembaca CSV RFC 4180 sederhana (kutip ganda, koma, CRLF/LF). */
function bacaCsv(teks: string): string[][] {
  const baris: string[][] = [];
  let sel = '', kini: string[] = [], kutip = false;
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (kutip) {
      if (c === '"' && teks[i + 1] === '"') { sel += '"'; i++; } else if (c === '"') kutip = false; else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === ',') { kini.push(sel); sel = ''; }
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
  const rows = bacaCsv(teks.replace(/^﻿/, ''));
  if (!rows.length) return { csv: '', baris: 0, galat: 'Berkas tidak berisi baris data.' };
  const kepala = rows[0].map(h => h.trim());
  const posisi = Object.fromEntries(SUMBER.map(n => [n, kepala.indexOf(n)])) as Record<(typeof SUMBER)[number], number>;
  if (SUMBER.some(n => posisi[n] < 0)) return { csv: '', baris: 0, galat: 'Kolom berkas tidak sesuai view SSBI Surat Kontrol = SEP. Unduh ulang berkas CSV dari SSBI.' };
  const keluar = [KIRIM.map(kutipCsv).join(',')];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i].map(x => x.trim());
    const sep = r[posisi['Nomor SEP']] ?? '';
    if (!RE_NOMOR.test(sep)) return { csv: '', baris: 0, galat: `Nomor SEP di baris ${i + 1} tidak sesuai pola. Unduh ulang berkas dari SSBI.` };
    const nilai = [sep.slice(0, 8), r[posisi['Jenis Pelayanan']], r[posisi['Kode Poli Tujuan SEP']], r[posisi['Day, Month, Year of Tgl SEP']],
      r[posisi['Day, Month, Year of Tgl Terbit Kontrol']], r[posisi['Nama Faskes']], r[posisi['Status Surat Kontrol']]];
    keluar.push(nilai.map(v => kutipCsv(v ?? '')).join(','));
  }
  if (keluar.length === 1) return { csv: '', baris: 0, galat: 'Berkas tidak berisi baris data.' };
  return { csv: `${keluar.join('\r\n')}\r\n`, baris: keluar.length - 1, galat: null };
}
