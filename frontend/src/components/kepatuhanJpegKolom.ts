// Isi gambar JPEG tiap tab Kepatuhan FKRTL: judul, kolom, dan urutan baris.
import { AMBANG_PATUH_NILAI_AKHIR, formatCapaian, statusNilaiAkhir, warnaCapaian } from '../lib/kepatuhanJpeg';
import type { RingkasanTableRow } from './RingkasanComplianceTab';
import type { NakesTableRow } from './NakesComplianceTab';
import type { PengaduanTableRow } from './PengaduanComplianceTab';
import type { UmablTableRow } from './UmablComplianceTab';
import type { DisplayTtTableRow } from './DisplayTtComplianceTab';
import type { TmoTableRow } from './TmoComplianceTab';
import type { AntreanWtlTableRow } from './AntreanWtlComplianceTab';
import type { SurkonTableRow } from './SurkonComplianceTab';
import type { RmeTableRow } from './RmeComplianceTab';

export interface BarisPerTab {
  ringkasan: RingkasanTableRow;
  nakes: NakesTableRow;
  pengaduan: PengaduanTableRow;
  umabl: UmablTableRow;
  displayTt: DisplayTtTableRow;
  tmo: TmoTableRow;
  antreanWtl: AntreanWtlTableRow;
  surkon: SurkonTableRow;
  rme: RmeTableRow;
}

export type TabUnduhJpeg = keyof BarisPerTab;

export interface KolomUnduhJpeg<T> {
  label: string;
  teks: (row: T) => string;
  rata?: 'left' | 'center' | 'right';
  /** Capaian 0-100 yang menentukan warna sel. Kolom tanpa ini tidak diwarnai. */
  capaian?: (row: T) => unknown;
}

export interface KonfigUnduhJpeg<T> {
  judul: string;
  namaBerkas: string;
  kolom: KolomUnduhJpeg<T>[];
  /** Kolom penentu urutan di dalam satu kabupaten, dari tertinggi ke terendah. */
  kunciUrut: (keyof T)[];
  catatan?: string;
}

const bilangan = (nilai: unknown): string => {
  const n = typeof nilai === 'number' ? nilai : parseFloat(String(nilai ?? ''));
  return Number.isFinite(n) ? n.toLocaleString('id-ID') : '-';
};

const teks = <T,>(label: string, kunci: keyof T): KolomUnduhJpeg<T> => ({
  label,
  teks: row => String(row[kunci] ?? '-'),
});

const jumlah = <T,>(label: string, kunci: keyof T): KolomUnduhJpeg<T> => ({
  label,
  rata: 'right',
  teks: row => bilangan(row[kunci]),
});

const desimal = <T,>(label: string, kunci: keyof T): KolomUnduhJpeg<T> => ({
  label,
  rata: 'right',
  teks: row => formatCapaian(row[kunci]),
});

const capaian = <T extends { capaian: number }>(label = 'Capaian (%)'): KolomUnduhJpeg<T> => ({
  label,
  rata: 'center',
  teks: row => formatCapaian(row.capaian),
  capaian: row => row.capaian,
});

const statusCapaian = <T extends { capaian: number }>(): KolomUnduhJpeg<T> => ({
  label: 'Status',
  rata: 'center',
  teks: row => (warnaCapaian(row.capaian) === 'hijau' ? 'Tercapai' : 'Belum Tercapai'),
});

/** Sel indikator di ringkasan berisi poin berbobot; capaiannya adalah poin dibagi bobot. */
const pilar = (label: string, kunci: keyof RingkasanTableRow, bobot: number): KolomUnduhJpeg<RingkasanTableRow> => ({
  label: `${label} (${bobot}%)`,
  rata: 'center',
  teks: row => formatCapaian(row[kunci]),
  capaian: row => {
    const poin = Number(row[kunci]);
    return Number.isFinite(poin) ? (poin / bobot) * 100 : null;
  },
});

export const KONFIG_UNDUH_JPEG: { [K in TabUnduhJpeg]: KonfigUnduhJpeg<BarisPerTab[K]> } = {
  ringkasan: {
    judul: '00. Ringkasan Nilai Akhir',
    namaBerkas: 'Ringkasan',
    kunciUrut: ['nilai_akhir'],
    catatan: `Warna sel indikator menurut capaian terhadap bobotnya (poin ÷ bobot). Nilai Akhir: Patuh bila ≥ ${AMBANG_PATUH_NILAI_AKHIR}.`,
    kolom: [
      teks('Kode PPK', 'kode_ppk'),
      teks('Nama Rumah Sakit', 'nama_ppk'),
      teks('Kabupaten', 'kabupaten'),
      pilar('Dokter', 'jadwal_dokter_pct', 25),
      pilar('Aduan', 'pengaduan_pct', 20),
      pilar('WTL', 'waktu_layan_pct', 20),
      pilar('KESSAN', 'kessan_pct', 10),
      pilar('TT', 'display_tt_pct', 10),
      pilar('TMO', 'tmo_pct', 5),
      pilar('Surkon', 'surkon_pct', 5),
      pilar('RME', 'rme_pct', 5),
      { label: 'Nilai Akhir', rata: 'center', teks: row => formatCapaian(row.nilai_akhir) },
      { label: 'Status', rata: 'center', teks: row => statusNilaiAkhir(row.nilai_akhir) },
    ],
  },
  nakes: {
    judul: '01. Jadwal Praktek Nakes',
    namaBerkas: 'Jadwal_Nakes',
    kunciUrut: ['capaian', 'capaian_nilai', 'persen_sesuai'],
    kolom: [
      teks('Nama Faskes', 'nama_ppk'),
      teks('Kabupaten', 'kabupaten'),
      teks('Tipe Faskes', 'tipe_faskes'),
      jumlah('Total Kunjungan', 'total_kunjungan'),
      jumlah('Tidak Sesuai', 'tidak_sesuai'),
      jumlah('Sesuai', 'sesuai'),
      desimal('Persen Sesuai (%)', 'persen_sesuai'),
      capaian(),
      statusCapaian(),
    ],
  },
  pengaduan: {
    judul: '02. Penyelesaian Pengaduan',
    namaBerkas: 'Pengaduan',
    kunciUrut: ['capaian'],
    kolom: [
      teks('Nama Faskes', 'nama_ppk'),
      teks('Kabupaten', 'kabupaten'),
      teks('Tipe Faskes', 'tipe_faskes'),
      jumlah('Pengaduan 3 Bulan Terakhir', 'pengaduan_3bln'),
      jumlah('Pengaduan Bulan Penilaian', 'pengaduan_bln'),
      jumlah('Ditindaklanjuti Sesuai SLA', 'ditindaklanjuti_sla'),
      jumlah('Top 10 Tahun Lalu', 'top10_thnlalu'),
      jumlah('Tidak Ditindaklanjuti', 'tidak_ditindaklanjuti'),
      capaian(),
      statusCapaian(),
    ],
  },
  umabl: {
    judul: '03. Umbal Peserta',
    namaBerkas: 'Umbal_Peserta',
    kunciUrut: ['capaian', 'persen_responden_target'],
    kolom: [
      teks('Nama Faskes', 'nama_ppk'),
      teks('Kabupaten', 'kabupaten'),
      teks('Tipe Faskes', 'tipe_faskes'),
      jumlah('Jlh Kunjungan', 'kunjungan'),
      jumlah('Jlh Responden', 'responden'),
      jumlah('Target', 'target'),
      desimal('% Jlh Responden Target', 'persen_responden_target'),
      capaian(),
      statusCapaian(),
    ],
  },
  displayTt: {
    judul: '04. Update Display TT',
    namaBerkas: 'Display_TT',
    kunciUrut: ['capaian', 'capaian_nilai', 'jumlah_update'],
    kolom: [
      teks('Nama Fasilitas Kesehatan (FKRTL)', 'nama_ppk'),
      teks('Kabupaten', 'kabupaten'),
      teks('Tipe Faskes', 'tipe_faskes'),
      jumlah('Jumlah Update (Hari)', 'jumlah_update'),
      capaian('Capaian (Poin)'),
      statusCapaian(),
    ],
  },
  tmo: {
    judul: '05. Update TMO',
    namaBerkas: 'Update_TMO',
    kunciUrut: ['capaian', 'capaian_nilai'],
    kolom: [
      teks('Kode PPK', 'kode_ppk'),
      teks('Nama Rumah Sakit', 'nama_ppk'),
      teks('Kabupaten', 'kabupaten'),
      jumlah('Jadwal Operasi', 'jadwal_operasi'),
      desimal('Update Operasi (%)', 'persentase_operasi'),
      desimal('Antrol TMO (%)', 'persentase_antrol'),
      capaian(),
      desimal('Poin (5%)', 'capaian_nilai'),
      statusCapaian(),
    ],
  },
  antreanWtl: {
    judul: '06. Antrean & WTL',
    namaBerkas: 'Antrean_WTL',
    kunciUrut: ['capaian', 'capaian_nilai'],
    kolom: [
      teks('Kode PPK', 'kode_ppk'),
      teks('Nama Rumah Sakit', 'nama_ppk'),
      teks('Kabupaten', 'kabupaten'),
      jumlah('Total Antrol', 'total_antrol'),
      jumlah('Total MJKN', 'total_mjkn'),
      desimal('MJKN (%)', 'persen_mjkn'),
      desimal('Task 2 (%)', 'persen_t2'),
      desimal('Task 3 (%)', 'persen_t3'),
      desimal('Task 4 (%)', 'persen_t4'),
      capaian(),
      desimal('Poin (20%)', 'capaian_nilai'),
      statusCapaian(),
    ],
  },
  surkon: {
    judul: '07. Surkon',
    namaBerkas: 'Surkon',
    kunciUrut: ['capaian', 'capaian_nilai', 'persentase'],
    kolom: [
      teks('Kode PPK', 'kode_ppk'),
      teks('Nama Rumah Sakit', 'nama_ppk'),
      teks('Kabupaten', 'kabupaten'),
      jumlah('Total SEP', 'total_sep'),
      jumlah('SEP Sesuai', 'total_sesuai'),
      desimal('Kesesuaian (%)', 'persentase'),
      capaian(),
      desimal('Poin (5%)', 'capaian_nilai'),
      statusCapaian(),
    ],
  },
  rme: {
    judul: '08. RME',
    namaBerkas: 'RME',
    kunciUrut: ['capaian', 'capaian_nilai', 'persentase_rme'],
    kolom: [
      teks('Kode PPK', 'kode_ppk'),
      teks('Nama Rumah Sakit', 'nama_ppk'),
      teks('Kabupaten', 'kabupaten'),
      jumlah('RJTL ≤ 7 hr', 'rjtl_lt7'),
      jumlah('RJTL > 7 hr', 'rjtl_gt7'),
      jumlah('RITL ≤ 7 hr', 'ritl_lt7'),
      jumlah('RITL > 7 hr', 'ritl_gt7'),
      desimal('Persentase (%)', 'persentase_rme'),
      capaian(),
      desimal('Poin (5%)', 'capaian_nilai'),
      statusCapaian(),
    ],
  },
};
