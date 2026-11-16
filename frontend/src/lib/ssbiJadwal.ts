// Logika tampilan data SSBI Kesesuaian Jadwal Praktik Dokter FKRTL (menu Integrasi data dan
// tombol Download Detail). Server tetap memeriksa ulang semuanya; berkas ini hanya untuk teks
// dan keadaan tombol.

export const BATAS_MENTAH_MB = 30;
export const BATAS_KOMPRES_MB = 4;
const MB = 1024 * 1024;

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export type InfoAktif = {
  nama_berkas: string;
  diunggah_pada: string;
  diunggah_oleh: string;
  baris: number;
  faskes: number;
  periode_awal: string;
  periode_akhir: string;
  bulan: string[];
};

export type Ringkasan = {
  baris: number;
  faskes: number;
  periode_awal: string;
  periode_akhir: string;
  bulan: Record<string, number>;
  kabupaten: Record<string, number>;
};

export type InfoBulan = { ada_data: boolean; rs: string | null; bulan: string[]; data_per: string };

/** "September 2026" (nilai filter) atau "September 2026" versi Indonesia menjadi "2026-09"; selain itu null. */
export function kodeBulan(label: string | null | undefined): string | null {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec((label ?? '').trim());
  if (!m) return null;
  const nama = m[1].toLowerCase();
  let i = BULAN_EN.indexOf(nama);
  if (i < 0) i = BULAN_ID.findIndex(b => b.toLowerCase() === nama);
  return i < 0 ? null : `${m[2]}-${String(i + 1).padStart(2, '0')}`;
}

/** "2026-10" menjadi "Oktober 2026". */
export function labelBulan(kode: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(kode);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return kode;
  return `${BULAN_ID[Number(m[2]) - 1]} ${m[1]}`;
}

/** Daftar "YYYY-MM" berurutan menjadi "April–Oktober 2026" (atau dua tahun bila melewati tahun). */
export function rentangBulan(bulan: readonly string[]): string {
  const urut = [...bulan].sort();
  if (urut.length === 0) return '';
  const [awal, akhir] = [labelBulan(urut[0]), labelBulan(urut[urut.length - 1])];
  if (awal === akhir) return awal;
  const [namaAwal, tahunAwal] = awal.split(' ');
  return tahunAwal === akhir.split(' ')[1] ? `${namaAwal}–${akhir}` : `${awal}–${akhir}`;
}

/** Bulan di data lama yang tidak ada di berkas baru (detailnya hilang setelah diganti). */
export function bulanHilang(lama: readonly string[], baru: readonly string[]): string[] {
  const ada = new Set(baru);
  return [...lama].filter(b => !ada.has(b)).sort();
}

export function angka(n: number): string {
  return n.toLocaleString('id-ID');
}

export function ukuranMb(bytes: number): string {
  return (bytes / MB).toLocaleString('id-ID', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

/** ISO waktu integrasi menjadi "16 Nov 2026" (dan jam WIB bila diminta). */
export function tanggalData(iso: string, denganJam = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso ?? '');
  if (!m) return '';
  const tgl = `${Number(m[3])} ${BULAN_ID[Number(m[2]) - 1].slice(0, 3)} ${m[1]}`;
  return denganJam ? `${tgl} ${m[4]}.${m[5]} WIB` : tgl;
}

/** Galat pilih berkas yang bisa diketahui sebelum dikirim. */
export function cekBerkas(nama: string, ukuran: number): string | null {
  if (!/\.csv$/i.test(nama)) return 'Format berkas harus CSV (.csv). Unduh lewat tautan FKRTL.csv di SSBI.';
  if (ukuran > BATAS_MENTAH_MB * MB) return `Ukuran berkas ${ukuranMb(ukuran)} MB, melebihi batas ${BATAS_MENTAH_MB} MB.`;
  if (ukuran === 0) return 'Berkas tidak berisi baris data.';
  return null;
}

export function cekHasilKompres(ukuran: number): string | null {
  return ukuran > BATAS_KOMPRES_MB * MB
    ? `Berkas terlalu besar untuk dikirim (${ukuranMb(ukuran)} MB setelah dikompres, batas ${BATAS_KOMPRES_MB} MB). Hubungi tim teknis SAPA.`
    : null;
}

export type KeadaanUnduh = { aktif: boolean; teks: string };

export const SEMUA_BULAN = 'Semua Bulan';

/** Nilai filter bulan menjadi parameter server: "YYYY-MM", "semua", atau null bila tidak dikenali. */
export function parameterBulan(bulanDipilih: string): string | null {
  return bulanDipilih === SEMUA_BULAN ? 'semua' : kodeBulan(bulanDipilih);
}

/** Keadaan tombol Download Detail dan keterangan yang selalu terlihat di sampingnya. */
export function keadaanUnduh(bulanDipilih: string, info: InfoBulan | undefined): KeadaanUnduh {
  const kode = parameterBulan(bulanDipilih);
  if (!kode) return { aktif: false, teks: 'Pilih bulan untuk mengunduh detail.' };
  if (!info) return { aktif: false, teks: 'Memeriksa ketersediaan detail…' };
  if (!info.ada_data) return { aktif: false, teks: 'Detail belum tersedia. Admin perlu mengunggah data SSBI di menu Integrasi data.' };
  const per = tanggalData(info.data_per);
  const siapa = info.rs ? `Detail per dokter ${info.rs}` : 'Detail per dokter';
  if (kode === 'semua') {
    if (info.bulan.length === 0) return { aktif: false, teks: info.rs ? `Belum ada detail ${info.rs}.` : 'Belum ada detail.' };
    return { aktif: true, teks: `${siapa}, semua bulan (${rentangBulan(info.bulan)})${per ? ` · data SSBI per ${per}` : ''}` };
  }
  const label = labelBulan(kode);
  if (!info.bulan.includes(kode)) {
    if (info.rs) return { aktif: false, teks: `Belum ada detail ${info.rs} untuk ${label}.` };
    const cakupan = rentangBulan(info.bulan);
    return { aktif: false, teks: `Belum ada detail untuk ${label}.${cakupan ? ` Data SSBI yang terpasang mencakup ${cakupan}.` : ''}` };
  }
  return { aktif: true, teks: `${siapa}, ${label}${per ? ` · data SSBI per ${per}` : ''}` };
}

/** Nama berkas dari header Content-Disposition server (hanya huruf, angka, _ dan .xlsx). */
export function namaDariHeader(header: string | undefined, cadangan: string): string {
  const m = /filename="([A-Za-z0-9_]+\.xlsx)"/.exec(header ?? '');
  return m ? m[1] : cadangan;
}
