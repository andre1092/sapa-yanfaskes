import { useState } from 'react';
import { WARNA_SEL } from '../lib/antrolJpeg';
import { barisTabelLaras } from '../lib/larasJpeg';
import type { WarnaLaras } from '../lib/larasJpeg';
import type { LarasPoint } from '../hooks/useLarasData';

interface UnduhExcelLarasProps {
  judul: string;
  kolom: string;
  points: readonly LarasPoint[];
  formatLabel: (label: string) => string;
  keterangan: readonly string[];
  catatan: string;
  namaBerkas: string;
}

const KETERANGAN: { warna: WarnaLaras; label: string }[] = [
  { warna: 'merah', label: 'Merah: 00 hari 01:00:00 atau lebih' },
  { warna: 'kuning', label: 'Kuning: 00 hari 00:55:00 sampai di bawah 00 hari 01:00:00' },
  { warna: 'hijau', label: 'Hijau: di bawah 00 hari 00:55:00' },
];

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
const GARIS = { style: 'thin' as const, color: { argb: 'FF1F2937' } };
const BINGKAI = { top: GARIS, left: GARIS, bottom: GARIS, right: GARIS };

export const UnduhExcelLaras = ({ judul, kolom, points, formatLabel, keterangan, catatan, namaBerkas }: UnduhExcelLarasProps) => {
  const [keadaan, setKeadaan] = useState<'diam' | 'menyiapkan' | 'gagal'>('diam');

  const unduh = async () => {
    setKeadaan('menyiapkan');
    try {
      const [{ default: ExcelJS }, { saveAs }] = await Promise.all([import('exceljs'), import('file-saver')]);
      const baris = barisTabelLaras(points, formatLabel);
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Monitoring LARAS', { views: [{ state: 'frozen', ySplit: 5 }] });
      sheet.columns = [{ width: 6 }, { width: 44 }, { width: 26 }, { width: 16 }];

      sheet.getCell('A1').value = `Monitoring LARAS — ${judul}`;
      sheet.getCell('A1').font = { bold: true, size: 14, name: 'Arial' };
      sheet.getCell('A2').value = 'Optimalisasi Waktu Tunggu Rawat Jalan Di Rumah Sakit';
      sheet.getCell('A3').value = [...keterangan, `${baris.length} baris`, `Diunduh ${new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`].join(' · ');

      const kepala = sheet.getRow(5);
      kepala.values = ['No', kolom, 'Rata-Rata Waktu 3-4 dan 2-4 (jam:menit:detik)', 'Durasi (detik)'];
      kepala.height = 30;
      kepala.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00529C' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = BINGKAI;
      });

      baris.forEach(item => {
        const row = sheet.addRow([item.no, item.label, item.hariExcel, item.detik]);
        row.eachCell(cell => { cell.border = BINGKAI; cell.font = { name: 'Arial' }; });
        row.getCell(1).alignment = { horizontal: 'center' };
        const waktu = row.getCell(3);
        waktu.numFmt = '[hh]:mm:ss';
        waktu.alignment = { horizontal: 'center' };
        waktu.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(WARNA_SEL[item.warna].latar) } };
        waktu.font = { name: 'Arial', bold: true, color: { argb: argb(WARNA_SEL[item.warna].teks) } };
        row.getCell(4).numFmt = '0';
      });
      if (baris.length > 0) sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + baris.length, column: 4 } };

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
        disabled={points.length === 0 || keadaan === 'menyiapkan'}
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
