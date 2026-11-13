import { useState } from 'react';
import { WARNA_SEL } from '../lib/antrolJpeg';
import { barisRincianPoli, barisTabelLaras } from '../lib/larasJpeg';
import type { RincianPoli, WarnaLaras } from '../lib/larasJpeg';
import type { LarasPoint } from '../hooks/useLarasData';

interface UnduhExcelLarasProps {
  judul: string;
  kolom: string;
  points: readonly LarasPoint[];
  formatLabel: (label: string) => string;
  keterangan: readonly string[];
  catatan: string;
  namaBerkas: string;
  /** Bila diisi (grafik per poli), berkas berisi angka tiap RS per poli dengan kabupaten. */
  rincianPoli?: readonly RincianPoli[];
}

const KETERANGAN: { warna: WarnaLaras; label: string }[] = [
  { warna: 'merah', label: 'Merah: 00 hari 01:00:00 atau lebih' },
  { warna: 'kuning', label: 'Kuning: 00 hari 00:55:00 sampai di bawah 00 hari 01:00:00' },
  { warna: 'hijau', label: 'Hijau: di bawah 00 hari 00:55:00' },
];

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
const GARIS = { style: 'thin' as const, color: { argb: 'FF1F2937' } };
const BINGKAI = { top: GARIS, left: GARIS, bottom: GARIS, right: GARIS };

export const UnduhExcelLaras = ({ judul, kolom, points, formatLabel, keterangan, catatan, namaBerkas, rincianPoli }: UnduhExcelLarasProps) => {
  const [keadaan, setKeadaan] = useState<'diam' | 'menyiapkan' | 'gagal'>('diam');

  const unduh = async () => {
    setKeadaan('menyiapkan');
    try {
      const [{ default: ExcelJS }, { saveAs }] = await Promise.all([import('exceljs'), import('file-saver')]);
      // Tabel: kolom teks di depan, lalu waktu (berwarna) dan durasi detik.
      const tabel = rincianPoli
        ? {
            sheet: 'Per poli per faskes',
            judul: `${judul} per Fasilitas Kesehatan`,
            kepala: ['No', 'Nama Faskes', 'Kabupaten', 'Nama Poli'],
            lebar: [6, 40, 24, 36],
            baris: barisRincianPoli(rincianPoli).map(item => ({ teks: [item.no, item.faskes, item.kabupaten, item.poli], hariExcel: item.hariExcel, detik: item.detik, warna: item.warna })),
          }
        : {
            sheet: 'Monitoring LARAS',
            judul,
            kepala: ['No', kolom],
            lebar: [6, 44],
            baris: barisTabelLaras(points, formatLabel).map(item => ({ teks: [item.no, item.label], hariExcel: item.hariExcel, detik: item.detik, warna: item.warna })),
          };
      const baris = tabel.baris;
      const nKolom = tabel.kepala.length + 2;
      const kolomWaktu = tabel.kepala.length + 1;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(tabel.sheet, { views: [{ state: 'frozen', ySplit: 5 }] });
      sheet.columns = [...tabel.lebar, 26, 16].map(width => ({ width }));

      sheet.getCell('A1').value = `Monitoring LARAS — ${tabel.judul}`;
      sheet.getCell('A1').font = { bold: true, size: 14, name: 'Arial' };
      sheet.getCell('A2').value = 'Optimalisasi Waktu Tunggu Rawat Jalan Di Rumah Sakit';
      sheet.getCell('A3').value = [...keterangan, `${baris.length} baris`, `Diunduh ${new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`].join(' · ');

      const kepala = sheet.getRow(5);
      kepala.values = [...tabel.kepala, 'Rata-Rata Waktu 3-4 dan 2-4 (jam:menit:detik)', 'Durasi (detik)'];
      kepala.height = 30;
      kepala.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00529C' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = BINGKAI;
      });

      baris.forEach(item => {
        const row = sheet.addRow([...item.teks, item.hariExcel, item.detik]);
        row.eachCell(cell => { cell.border = BINGKAI; cell.font = { name: 'Arial' }; });
        row.getCell(1).alignment = { horizontal: 'center' };
        const waktu = row.getCell(kolomWaktu);
        waktu.numFmt = '[hh]:mm:ss';
        waktu.alignment = { horizontal: 'center' };
        waktu.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(WARNA_SEL[item.warna].latar) } };
        waktu.font = { name: 'Arial', bold: true, color: { argb: argb(WARNA_SEL[item.warna].teks) } };
        row.getCell(nKolom).numFmt = '0';
      });
      if (baris.length > 0) sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + baris.length, column: nKolom } };

      let nomor = 5 + baris.length + 2;
      sheet.getCell(`A${nomor}`).value = 'Keterangan:';
      sheet.getCell(`A${nomor}`).font = { bold: true, name: 'Arial' };
      KETERANGAN.forEach(item => {
        nomor += 1;
        const contoh = sheet.getCell(`A${nomor}`);
        contoh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(WARNA_SEL[item.warna].latar) } };
        contoh.border = BINGKAI;
        sheet.getCell(`B${nomor}`).value = item.label;
      });
      sheet.getCell(`A${nomor + 2}`).value = `${catatan} Urut dari waktu terlama.`;

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${namaBerkas}.xlsx`);
      setKeadaan('diam');
    } catch (error) {
      console.error('Gagal membuat Excel LARAS', error);
      setKeadaan('gagal');
    }
  };

  return (
    <span className="laras-unduh">
      <button
        type="button"
        className="sapa-button sapa-button-secondary"
        onClick={() => void unduh()}
        disabled={(rincianPoli ? rincianPoli.length : points.length) === 0 || keadaan === 'menyiapkan'}
        aria-busy={keadaan === 'menyiapkan'}
        aria-label={`Unduh Excel ${judul}`}
        title={points.length === 0 ? 'Tidak ada baris untuk diunduh' : 'Unduh tabel sebagai berkas Excel (.xlsx)'}
      >
        {keadaan === 'menyiapkan' ? 'Menyiapkan berkas…' : 'Unduh Excel'}
      </button>
      {keadaan === 'gagal' && <span role="alert" className="laras-unduh-gagal">Berkas gagal dibuat. Coba lagi.</span>}
    </span>
  );
};
