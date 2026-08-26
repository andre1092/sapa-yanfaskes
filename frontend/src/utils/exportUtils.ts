import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toJpeg } from 'html-to-image';

export const exportToCSV = (data: any[], type: 'faskes' | 'poli') => {
  if (data.length === 0) return;

  let csvContent = '';
  if (type === 'faskes') {
    csvContent += 'Nama FKRTL,All Sumber (Target 95%),Mobile JKN (Target 80%)\\n';
    data.forEach(row => {
      const allPct = typeof row.all_sumber_pct === 'number' ? row.all_sumber_pct.toFixed(2) + '%' : row.all_sumber_pct;
      const mjknPct = typeof row.mjkn_pct === 'number' ? row.mjkn_pct.toFixed(2) + '%' : row.mjkn_pct;
      csvContent += `"${row.Faskes}","${allPct}","${mjknPct}"
`;
    });
  } else {
    csvContent += 'Kabupaten,Nmppk,Nama Poli,Flag Bridging Antrean,% Antrol All Sumber,Flag Mobile JKN,% Antrol MJKN,Flag Tidak Antrol,Total SEP\\n';
    data.forEach(row => {
      const allPct = typeof row.all_sumber_pct === 'number' ? row.all_sumber_pct.toFixed(2) + '%' : row.all_sumber_pct;
      const mjknPct = typeof row.mjkn_pct === 'number' ? row.mjkn_pct.toFixed(2) + '%' : row.mjkn_pct;
      csvContent += `"${row.Kabupaten}","${row.Nama_RS}","${row.Nama_Poli}","${row.flag_bridging}","${allPct}","${row.flag_mjkn}","${mjknPct}","${row.flag_tidak_antrol}","${row.total_sep}"
`;
    });
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `Export_${type.toUpperCase()}_${new Date().getTime()}.csv`);
};

export const exportToExcel = async (data: any[], type: 'faskes' | 'poli') => {
  if (data.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Export Data');

  if (type === 'faskes') {
    sheet.columns = [
      { header: 'Nama FKRTL', key: 'faskes', width: 45 },
      { header: 'All Sumber\\n(Target 95%)', key: 'all_pct', width: 20 },
      { header: 'Mobile JKN\\n(Target 80%)', key: 'mjkn_pct', width: 20 }
    ];

    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4D94FF' } }; 
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Arial' };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    data.forEach(row => {
      const dbRow = sheet.addRow({
        faskes: row.Faskes,
        all_pct: row.all_sumber_pct / 100,
        mjkn_pct: row.mjkn_pct / 100
      });

      dbRow.getCell(2).numFmt = '0.00%';
      dbRow.getCell(3).numFmt = '0.00%';

      dbRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });

      const allCell = dbRow.getCell(2);
      if (row.all_sumber_pct >= 95) {
        allCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
        allCell.font = { color: { argb: 'FF006100' }, name: 'Arial', size: 10 };
      } else {
        allCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
        allCell.font = { color: { argb: 'FF9C0006' }, name: 'Arial', size: 10 };
      }

      const mjknCell = dbRow.getCell(3);
      if (row.mjkn_pct >= 80) {
        mjknCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
        mjknCell.font = { color: { argb: 'FF006100' }, name: 'Arial', size: 10 };
      } else {
        mjknCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
        mjknCell.font = { color: { argb: 'FF9C0006' }, name: 'Arial', size: 10 };
      }
    });
  } else {
    sheet.columns = [
      { header: 'Kabupaten', key: 'kabupaten', width: 20 },
      { header: 'Nmppk', key: 'nmppk', width: 35 },
      { header: 'Nama Poli', key: 'nama_poli', width: 25 },
      { header: 'Flag Bridging Antrean', key: 'flag_bridging', width: 20 },
      { header: '% Antrol All Sumber', key: 'all_pct', width: 20 },
      { header: 'Flag Mobile JKN', key: 'flag_mjkn', width: 15 },
      { header: '% Antrol MJKN', key: 'mjkn_pct', width: 15 },
      { header: 'Flag Tidak Antrol', key: 'flag_tidak', width: 20 },
      { header: 'Total SEP', key: 'total_sep', width: 15 }
    ];

    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4D94FF' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Arial' };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF4D94FF' } },
        left: { style: 'thin', color: { argb: 'FF4D94FF' } },
        bottom: { style: 'thin', color: { argb: 'FF4D94FF' } },
        right: { style: 'thin', color: { argb: 'FF4D94FF' } }
      };
    });

    data.forEach(row => {
      const dbRow = sheet.addRow({
        kabupaten: row.Kabupaten,
        nmppk: row.Nama_RS,
        nama_poli: row.Nama_Poli,
        flag_bridging: row.flag_bridging,
        all_pct: row.all_sumber_pct / 100,
        flag_mjkn: row.flag_mjkn,
        mjkn_pct: row.mjkn_pct / 100,
        flag_tidak: row.flag_tidak_antrol,
        total_sep: row.total_sep
      });

      dbRow.getCell(5).numFmt = '0.00%';
      dbRow.getCell(7).numFmt = '0.00%';

      dbRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF4D94FF' } },
          left: { style: 'thin', color: { argb: 'FF4D94FF' } },
          bottom: { style: 'thin', color: { argb: 'FF4D94FF' } },
          right: { style: 'thin', color: { argb: 'FF4D94FF' } }
        };
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Export_${type.toUpperCase()}_${new Date().getTime()}.xlsx`);
};

export const exportToJPEG = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const prevDisplay = element.style.display;
  const prevPosition = element.style.position;
  
  element.style.display = 'block';
  element.style.position = 'absolute';
  element.style.top = '-9999px';
  element.style.left = '-9999px';
  
  try {
    const dataUrl = await toJpeg(element, { quality: 1, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.download = `${filename}.jpeg`;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error('Error generating JPEG', error);
  } finally {
    element.style.display = prevDisplay;
    element.style.position = prevPosition;
  }
};
