import React, { useState, useMemo } from 'react';
import { NakesComplianceTab } from './NakesComplianceTab';
import { PengaduanComplianceTab } from './PengaduanComplianceTab';
import { UmablComplianceTab } from './UmablComplianceTab';
import { DisplayTtComplianceTab } from './DisplayTtComplianceTab';

export type ComplianceTabId =
  | '01-nakes'
  | '02-pengaduan'
  | '03-umabl'
  | '04-display-tt'
  | '05-tmo'
  | '06-antrean-wtl'
  | '07-surkon'
  | '08-rme';

interface TabDefinition {
  id: ComplianceTabId;
  code: string;
  name: string;
  shortName: string;
  icon: string;
  targetPercent: number;
  targetLabel?: string;
  badgeLabel?: string;
  description: string;
  kpiLabel: string;
}

const COMPLIANCE_TABS: TabDefinition[] = [
  {
    id: '01-nakes',
    code: '01',
    name: '01. Jadwal Praktek Nakes',
    shortName: 'Jadwal Praktek Nakes',
    icon: '👨‍⚕️',
    targetPercent: 100,
    badgeLabel: '25%',
    description: 'Definisi: kesesuaian antara jadwal praktik dokter/nakes pada Aplikasi HFIS dengan data pelayanan pasien pada aplikasi atau sistem informasi yang menyimpan data pelayanan pasien di FKRTL - Bobot 25%',
    kpiLabel: 'Kesesuaian Jadwal Nakes',
  },
  {
    id: '02-pengaduan',
    code: '02',
    name: '02. Penyelesaian Pengaduan',
    shortName: 'Penyelesaian Pengaduan',
    icon: '📢',
    targetPercent: 100,
    badgeLabel: '20%',
    description: 'Waktu penyelesaian pengaduan atau SLA 1 sampai 3 hari kerja sejak diterimanya pengaduan pada Aplikasi SIPP - bobot 20%',
    kpiLabel: 'Tingkat Penyelesaian Keluhan',
  },
  {
    id: '03-umabl',
    code: '03',
    name: '03. Umbal Peserta',
    shortName: 'Umabl Peserta',
    icon: '💬',
    targetPercent: 100,
    targetLabel: '≥ 100% dari target',
    badgeLabel: '10%',
    description: 'Pengukuran dinilai berdasarkan jumlah responden yang memberikan umpan balik/customer feedback - bobot 10%',
    kpiLabel: 'Pelaksanaan Umpan Balik Peserta',
  },
  {
    id: '04-display-tt',
    code: '04',
    name: '04. Update Display TT',
    shortName: 'Update Display TT',
    icon: '🛏️',
    targetPercent: 100,
    targetLabel: '≥ 25 hari',
    badgeLabel: '10%',
    description: 'Memperhitungkan jumlah hari Faskes melakukan pembaruan informasi data ketersediaan tempat tidur secara harian dalam 1 (satu) bulan - bobot 10%',
    kpiLabel: 'Pembaruan Data Ketersediaan Tempat Tidur',
  },
  {
    id: '05-tmo',
    code: '05',
    name: '05. Update TMO',
    shortName: 'Update TMO',
    icon: '💊',
    targetPercent: 85,
    description: 'Monitoring kepatuhan pencatatan dan update Tempat Pelayanan Obat (TMO) / Farmasi RS dan Telemedicine.',
    kpiLabel: 'Kepatuhan Update TMO',
  },
  {
    id: '06-antrean-wtl',
    code: '06',
    name: '06. Antrean & WTL',
    shortName: 'Antrean & WTL',
    icon: '⏱️',
    targetPercent: 85,
    description: 'Monitoring Waktu Tunggu Layanan (WTL) admisi, poli, dan farmasi serta kepatuhan integrasi antrean online rumah sakit.',
    kpiLabel: 'Kepatuhan Antrean & WTL',
  },
  {
    id: '07-surkon',
    code: '07',
    name: '07. Surkon',
    shortName: 'Surkon',
    icon: '📝',
    targetPercent: 90,
    description: 'Monitoring kepatuhan penerbitan Surat Kontrol (Surkon) dan SPRI pasien kronis/rujukan berbasis web service bridging.',
    kpiLabel: 'Capaian Bridging Surkon',
  },
  {
    id: '08-rme',
    code: '08',
    name: '08. RME',
    shortName: 'RME',
    icon: '📑',
    targetPercent: 95,
    description: 'Monitoring tingkat adopsi, integrasi sistem Rekam Medis Elektronik (RME) faskes dengan platform SatuSehat & BPJS Kesehatan.',
    kpiLabel: 'Tingkat Integrasi RME',
  },
];

interface HeaderInfo {
  title: string;
  gradientTitle: string;
  subtitle: string;
}

const TAB_HEADER_INFO: Record<ComplianceTabId, HeaderInfo> = {
  '01-nakes': {
    title: 'Kesesuaian Jadwal Praktik',
    gradientTitle: 'Dokter atau Tenaga Kesehatan',
    subtitle:
      'Definisi: kesesuaian antara jadwal praktik dokter/nakes pada Aplikasi HFIS dengan data pelayanan pasien pada aplikasi atau sistem informasi yang menyimpan data pelayanan pasien di FKRTL - Bobot 25%',
  },
  '02-pengaduan': {
    title: 'Tindak Lanjut dan',
    gradientTitle: 'Penyelesaian Pengaduan',
    subtitle:
      'Waktu penyelesaian pengaduan atau SLA 1 sampai 3 hari kerja sejak diterimanya pengaduan pada Aplikasi SIPP - bobot 20%',
  },
  '03-umabl': {
    title: 'Pelaksanaan',
    gradientTitle: 'Umpan Balik Peserta (Customer Feedback)',
    subtitle: 'Pengukuran dinilai berdasarkan jumlah responden yang memberikan umpan balik/customer feedback - bobot 10%',
  },
  '04-display-tt': {
    title: 'Pembaruan (Update)',
    gradientTitle: 'Data Ketersediaan Tempat Tidur',
    subtitle: 'Memperhitungkan jumlah hari Faskes melakukan pembaruan informasi data ketersediaan tempat tidur secara harian dalam 1 (satu) bulan - bobot 10%',
  },
  '05-tmo': {
    title: 'Monitoring Layanan',
    gradientTitle: 'Update Display TMO & Farmasi',
    subtitle: 'Pemutakhiran ketersediaan obat kronis dan pelayanan farmasi rumah sakit - bobot 10%',
  },
  '06-antrean-wtl': {
    title: 'Pemantauan Integrasi Sistem',
    gradientTitle: 'Antrean Online & Waktu Tunggu Layanan',
    subtitle: 'Monitoring sistem antrean terintegrasi dan waktu tunggu layanan poliklinik dan farmasi - bobot 10%',
  },
  '07-surkon': {
    title: 'Kepatuhan Penerbitan',
    gradientTitle: 'Surat Kontrol (Surkon)',
    subtitle: 'Penerbitan surat kontrol rencana rawat lanjutan melalui sistem bridging - bobot 10%',
  },
  '08-rme': {
    title: 'Tingkat Kepatuhan & Integrasi',
    gradientTitle: 'Rekam Medis Elektronik (RME)',
    subtitle: 'Integrasi dan kelengkapan rekam medis elektronik FKRTL dengan BPJS Kesehatan - bobot 5%',
  },
};

interface FaskesComplianceRow {
  kdppk: string;
  faskes: string;
  kabupaten: string;
  kelas: string;
  capaian: number;
  numerator: number;
  denominator: number;
  unit: string;
  lastUpdate: string;
}

const SAMPLE_FASKES_DATA: Record<ComplianceTabId, FaskesComplianceRow[]> = {
  '01-nakes': [
    { kdppk: '1309R001', faskes: 'RSUD Dr. Soebandi', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 94.2, numerator: 145, denominator: 154, unit: 'Dokter Sesuai', lastUpdate: '25/09/2026 08:30:15' },
    { kdppk: '1309R002', faskes: 'RS Siloam Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 96.5, numerator: 82, denominator: 85, unit: 'Dokter Sesuai', lastUpdate: '25/09/2026 08:25:40' },
    { kdppk: '1309R003', faskes: 'RS Baladhika Husada', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 91.8, numerator: 56, denominator: 61, unit: 'Dokter Sesuai', lastUpdate: '25/09/2026 08:18:22' },
    { kdppk: '1309R004', faskes: 'RS Kaliwates', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 88.5, numerator: 46, denominator: 52, unit: 'Dokter Sesuai', lastUpdate: '25/09/2026 07:55:10' },
    { kdppk: '1309R005', faskes: 'RS Jember Klinik', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 93.1, numerator: 54, denominator: 58, unit: 'Dokter Sesuai', lastUpdate: '25/09/2026 08:12:05' },
    { kdppk: '1309R006', faskes: 'RS Citra Husada', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 87.2, numerator: 41, denominator: 47, unit: 'Dokter Sesuai', lastUpdate: '25/09/2026 07:48:30' },
    { kdppk: '1309R007', faskes: 'RS Paru Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 95.0, numerator: 38, denominator: 40, unit: 'Dokter Sesuai', lastUpdate: '25/09/2026 08:05:55' },
    { kdppk: '1309R008', faskes: 'RSUD Balung', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 84.6, numerator: 44, denominator: 52, unit: 'Dokter Sesuai', lastUpdate: '25/09/2026 07:40:12' },
    { kdppk: '1310R001', faskes: 'RS Bhayangkara Lumajang', kabupaten: 'KAB. LUMAJANG', kelas: 'Kelas C', capaian: 92.0, numerator: 46, denominator: 50, unit: 'Dokter Sesuai', lastUpdate: '25/09/2026 08:15:33' },
    { kdppk: '1310R002', faskes: 'RS Djatiroto', kabupaten: 'KAB. LUMAJANG', kelas: 'Kelas C', capaian: 86.4, numerator: 38, denominator: 44, unit: 'Dokter Sesuai', lastUpdate: '25/09/2026 07:35:18' },
    { kdppk: '1311R001', faskes: 'RSUD dr. H. Koesnadi', kabupaten: 'KAB. BONDOWOSO', kelas: 'Kelas B', capaian: 91.5, numerator: 97, denominator: 106, unit: 'Dokter Sesuai', lastUpdate: '25/09/2026 08:22:11' },
    { kdppk: '1311R002', faskes: 'RS Bhayangkara Bondowoso', kabupaten: 'KAB. BONDOWOSO', kelas: 'Kelas C', capaian: 89.1, numerator: 41, denominator: 46, unit: 'Dokter Sesuai', lastUpdate: '25/09/2026 07:50:45' },
  ],
  '02-pengaduan': [
    { kdppk: '1309R001', faskes: 'RSUD Dr. Soebandi', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 98.2, numerator: 55, denominator: 56, unit: 'Keluhan Selesai', lastUpdate: '25/09/2026 08:10:00' },
    { kdppk: '1309R002', faskes: 'RS Siloam Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 100.0, numerator: 28, denominator: 28, unit: 'Keluhan Selesai', lastUpdate: '25/09/2026 08:00:12' },
    { kdppk: '1309R003', faskes: 'RS Baladhika Husada', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 96.0, numerator: 24, denominator: 25, unit: 'Keluhan Selesai', lastUpdate: '25/09/2026 07:45:00' },
    { kdppk: '1309R004', faskes: 'RS Kaliwates', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 94.7, numerator: 18, denominator: 19, unit: 'Keluhan Selesai', lastUpdate: '25/09/2026 07:30:15' },
    { kdppk: '1309R005', faskes: 'RS Jember Klinik', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 97.4, numerator: 37, denominator: 38, unit: 'Keluhan Selesai', lastUpdate: '25/09/2026 08:05:40' },
    { kdppk: '1309R007', faskes: 'RS Paru Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 100.0, numerator: 14, denominator: 14, unit: 'Keluhan Selesai', lastUpdate: '25/09/2026 07:55:00' },
    { kdppk: '1310R001', faskes: 'RS Bhayangkara Lumajang', kabupaten: 'KAB. LUMAJANG', kelas: 'Kelas C', capaian: 95.5, numerator: 21, denominator: 22, unit: 'Keluhan Selesai', lastUpdate: '25/09/2026 07:42:30' },
    { kdppk: '1311R001', faskes: 'RSUD dr. H. Koesnadi', kabupaten: 'KAB. BONDOWOSO', kelas: 'Kelas B', capaian: 96.8, numerator: 61, denominator: 63, unit: 'Keluhan Selesai', lastUpdate: '25/09/2026 08:20:00' },
  ],
  '03-umabl': [
    { kdppk: '1309R001', faskes: 'RSUD Dr. Soebandi', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 89.6, numerator: 896, denominator: 1000, unit: 'Indeks Kepuasan', lastUpdate: '25/09/2026 08:00:00' },
    { kdppk: '1309R002', faskes: 'RS Siloam Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 94.8, numerator: 948, denominator: 1000, unit: 'Indeks Kepuasan', lastUpdate: '25/09/2026 08:15:00' },
    { kdppk: '1309R003', faskes: 'RS Baladhika Husada', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 90.2, numerator: 902, denominator: 1000, unit: 'Indeks Kepuasan', lastUpdate: '25/09/2026 07:50:00' },
    { kdppk: '1309R005', faskes: 'RS Jember Klinik', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 91.5, numerator: 915, denominator: 1000, unit: 'Indeks Kepuasan', lastUpdate: '25/09/2026 08:10:00' },
    { kdppk: '1309R007', faskes: 'RS Paru Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 93.1, numerator: 931, denominator: 1000, unit: 'Indeks Kepuasan', lastUpdate: '25/09/2026 08:05:00' },
    { kdppk: '1310R001', faskes: 'RS Bhayangkara Lumajang', kabupaten: 'KAB. LUMAJANG', kelas: 'Kelas C', capaian: 88.4, numerator: 884, denominator: 1000, unit: 'Indeks Kepuasan', lastUpdate: '25/09/2026 07:45:00' },
    { kdppk: '1311R001', faskes: 'RSUD dr. H. Koesnadi', kabupaten: 'KAB. BONDOWOSO', kelas: 'Kelas B', capaian: 87.9, numerator: 879, denominator: 1000, unit: 'Indeks Kepuasan', lastUpdate: '25/09/2026 08:18:00' },
  ],
  '04-display-tt': [
    { kdppk: '1309R001', faskes: 'RSUD Dr. Soebandi', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 98.5, numerator: 450, denominator: 457, unit: 'TT Terintegrasi', lastUpdate: '25/09/2026 08:40:00' },
    { kdppk: '1309R002', faskes: 'RS Siloam Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 100.0, numerator: 110, denominator: 110, unit: 'TT Terintegrasi', lastUpdate: '25/09/2026 08:35:00' },
    { kdppk: '1309R003', faskes: 'RS Baladhika Husada', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 95.8, numerator: 115, denominator: 120, unit: 'TT Terintegrasi', lastUpdate: '25/09/2026 08:20:00' },
    { kdppk: '1309R004', faskes: 'RS Kaliwates', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 94.0, numerator: 79, denominator: 84, unit: 'TT Terintegrasi', lastUpdate: '25/09/2026 08:05:00' },
    { kdppk: '1309R005', faskes: 'RS Jember Klinik', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 97.2, numerator: 105, denominator: 108, unit: 'TT Terintegrasi', lastUpdate: '25/09/2026 08:28:00' },
    { kdppk: '1309R007', faskes: 'RS Paru Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 98.9, numerator: 92, denominator: 93, unit: 'TT Terintegrasi', lastUpdate: '25/09/2026 08:15:00' },
    { kdppk: '1310R001', faskes: 'RS Bhayangkara Lumajang', kabupaten: 'KAB. LUMAJANG', kelas: 'Kelas C', capaian: 96.3, numerator: 78, denominator: 81, unit: 'TT Terintegrasi', lastUpdate: '25/09/2026 08:10:00' },
    { kdppk: '1311R001', faskes: 'RSUD dr. H. Koesnadi', kabupaten: 'KAB. BONDOWOSO', kelas: 'Kelas B', capaian: 96.0, numerator: 240, denominator: 250, unit: 'TT Terintegrasi', lastUpdate: '25/09/2026 08:30:00' },
  ],
  '05-tmo': [
    { kdppk: '1309R001', faskes: 'RSUD Dr. Soebandi', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 88.5, numerator: 177, denominator: 200, unit: 'Resep TMO', lastUpdate: '25/09/2026 08:12:00' },
    { kdppk: '1309R002', faskes: 'RS Siloam Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 93.0, numerator: 93, denominator: 100, unit: 'Resep TMO', lastUpdate: '25/09/2026 08:20:00' },
    { kdppk: '1309R003', faskes: 'RS Baladhika Husada', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 86.7, numerator: 78, denominator: 90, unit: 'Resep TMO', lastUpdate: '25/09/2026 08:05:00' },
    { kdppk: '1309R005', faskes: 'RS Jember Klinik', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 89.2, numerator: 91, denominator: 102, unit: 'Resep TMO', lastUpdate: '25/09/2026 08:18:00' },
    { kdppk: '1309R007', faskes: 'RS Paru Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 91.4, numerator: 64, denominator: 70, unit: 'Resep TMO', lastUpdate: '25/09/2026 08:08:00' },
    { kdppk: '1310R001', faskes: 'RS Bhayangkara Lumajang', kabupaten: 'KAB. LUMAJANG', kelas: 'Kelas C', capaian: 84.1, numerator: 53, denominator: 63, unit: 'Resep TMO', lastUpdate: '25/09/2026 07:58:00' },
    { kdppk: '1311R001', faskes: 'RSUD dr. H. Koesnadi', kabupaten: 'KAB. BONDOWOSO', kelas: 'Kelas B', capaian: 87.5, numerator: 140, denominator: 160, unit: 'Resep TMO', lastUpdate: '25/09/2026 08:25:00' },
  ],
  '06-antrean-wtl': [
    { kdppk: '1309R001', faskes: 'RSUD Dr. Soebandi', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 86.4, numerator: 1240, denominator: 1435, unit: 'Pasien WTL Sesuai', lastUpdate: '25/09/2026 08:35:00' },
    { kdppk: '1309R002', faskes: 'RS Siloam Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 94.2, numerator: 452, denominator: 480, unit: 'Pasien WTL Sesuai', lastUpdate: '25/09/2026 08:30:00' },
    { kdppk: '1309R003', faskes: 'RS Baladhika Husada', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 88.9, numerator: 345, denominator: 388, unit: 'Pasien WTL Sesuai', lastUpdate: '25/09/2026 08:15:00' },
    { kdppk: '1309R004', faskes: 'RS Kaliwates', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 83.5, numerator: 258, denominator: 309, unit: 'Pasien WTL Sesuai', lastUpdate: '25/09/2026 08:00:00' },
    { kdppk: '1309R005', faskes: 'RS Jember Klinik', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 89.0, numerator: 324, denominator: 364, unit: 'Pasien WTL Sesuai', lastUpdate: '25/09/2026 08:22:00' },
    { kdppk: '1309R007', faskes: 'RS Paru Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 92.1, numerator: 280, denominator: 304, unit: 'Pasien WTL Sesuai', lastUpdate: '25/09/2026 08:18:00' },
    { kdppk: '1310R001', faskes: 'RS Bhayangkara Lumajang', kabupaten: 'KAB. LUMAJANG', kelas: 'Kelas C', capaian: 85.8, numerator: 218, denominator: 254, unit: 'Pasien WTL Sesuai', lastUpdate: '25/09/2026 08:05:00' },
    { kdppk: '1311R001', faskes: 'RSUD dr. H. Koesnadi', kabupaten: 'KAB. BONDOWOSO', kelas: 'Kelas B', capaian: 87.2, numerator: 654, denominator: 750, unit: 'Pasien WTL Sesuai', lastUpdate: '25/09/2026 08:28:00' },
  ],
  '07-surkon': [
    { kdppk: '1309R001', faskes: 'RSUD Dr. Soebandi', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 93.8, numerator: 1125, denominator: 1200, unit: 'Surkon Terbit Bridging', lastUpdate: '25/09/2026 08:30:00' },
    { kdppk: '1309R002', faskes: 'RS Siloam Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 98.1, numerator: 412, denominator: 420, unit: 'Surkon Terbit Bridging', lastUpdate: '25/09/2026 08:25:00' },
    { kdppk: '1309R003', faskes: 'RS Baladhika Husada', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 91.5, numerator: 320, denominator: 350, unit: 'Surkon Terbit Bridging', lastUpdate: '25/09/2026 08:12:00' },
    { kdppk: '1309R005', faskes: 'RS Jember Klinik', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 94.0, numerator: 282, denominator: 300, unit: 'Surkon Terbit Bridging', lastUpdate: '25/09/2026 08:18:00' },
    { kdppk: '1309R007', faskes: 'RS Paru Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 95.6, numerator: 218, denominator: 228, unit: 'Surkon Terbit Bridging', lastUpdate: '25/09/2026 08:10:00' },
    { kdppk: '1310R001', faskes: 'RS Bhayangkara Lumajang', kabupaten: 'KAB. LUMAJANG', kelas: 'Kelas C', capaian: 89.2, numerator: 182, denominator: 204, unit: 'Surkon Terbit Bridging', lastUpdate: '25/09/2026 08:02:00' },
    { kdppk: '1311R001', faskes: 'RSUD dr. H. Koesnadi', kabupaten: 'KAB. BONDOWOSO', kelas: 'Kelas B', capaian: 92.4, numerator: 582, denominator: 630, unit: 'Surkon Terbit Bridging', lastUpdate: '25/09/2026 08:26:00' },
  ],
  '08-rme': [
    { kdppk: '1309R001', faskes: 'RSUD Dr. Soebandi', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 98.4, numerator: 1850, denominator: 1880, unit: 'Resume Medis RME', lastUpdate: '25/09/2026 08:40:00' },
    { kdppk: '1309R002', faskes: 'RS Siloam Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 100.0, numerator: 620, denominator: 620, unit: 'Resume Medis RME', lastUpdate: '25/09/2026 08:35:00' },
    { kdppk: '1309R003', faskes: 'RS Baladhika Husada', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 96.5, numerator: 440, denominator: 456, unit: 'Resume Medis RME', lastUpdate: '25/09/2026 08:22:00' },
    { kdppk: '1309R004', faskes: 'RS Kaliwates', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 93.8, numerator: 345, denominator: 368, unit: 'Resume Medis RME', lastUpdate: '25/09/2026 08:15:00' },
    { kdppk: '1309R005', faskes: 'RS Jember Klinik', kabupaten: 'KAB. JEMBER', kelas: 'Kelas C', capaian: 97.6, numerator: 450, denominator: 461, unit: 'Resume Medis RME', lastUpdate: '25/09/2026 08:28:00' },
    { kdppk: '1309R007', faskes: 'RS Paru Jember', kabupaten: 'KAB. JEMBER', kelas: 'Kelas B', capaian: 99.2, numerator: 368, denominator: 371, unit: 'Resume Medis RME', lastUpdate: '25/09/2026 08:20:00' },
    { kdppk: '1310R001', faskes: 'RS Bhayangkara Lumajang', kabupaten: 'KAB. LUMAJANG', kelas: 'Kelas C', capaian: 95.1, numerator: 290, denominator: 305, unit: 'Resume Medis RME', lastUpdate: '25/09/2026 08:10:00' },
    { kdppk: '1311R001', faskes: 'RSUD dr. H. Koesnadi', kabupaten: 'KAB. BONDOWOSO', kelas: 'Kelas B', capaian: 97.0, numerator: 970, denominator: 1000, unit: 'Resume Medis RME', lastUpdate: '25/09/2026 08:32:00' },
  ],
};

export const LaporanKepatuhanDashboard: React.FC = () => {
  const [activeTabId, setActiveTabId] = useState<ComplianceTabId>('01-nakes');
  const [selectedKabupaten, setSelectedKabupaten] = useState<string>('(All)');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MET' | 'UNMET'>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  const activeTabDef = useMemo(() => {
    return COMPLIANCE_TABS.find((t) => t.id === activeTabId) || COMPLIANCE_TABS[0];
  }, [activeTabId]);

  const rawRows = useMemo(() => {
    return SAMPLE_FASKES_DATA[activeTabId] || [];
  }, [activeTabId]);

  const kabupatenOptions = useMemo(() => {
    const set = new Set<string>();
    rawRows.forEach((r) => set.add(r.kabupaten));
    return ['(All)', ...Array.from(set)];
  }, [rawRows]);

  const filteredRows = useMemo(() => {
    return rawRows.filter((r) => {
      if (selectedKabupaten !== '(All)' && r.kabupaten !== selectedKabupaten) return false;
      const isMet = r.capaian >= activeTabDef.targetPercent;
      if (statusFilter === 'MET' && !isMet) return false;
      if (statusFilter === 'UNMET' && isMet) return false;
      if (searchKeyword.trim()) {
        const q = searchKeyword.toLowerCase();
        if (!r.faskes.toLowerCase().includes(q) && !r.kdppk.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [rawRows, selectedKabupaten, statusFilter, searchKeyword, activeTabDef.targetPercent]);

  // Statistik Agregasi untuk Tab Aktif
  const stats = useMemo(() => {
    if (filteredRows.length === 0) {
      return { avgCapaian: 0, totalFaskes: 0, totalMet: 0, totalUnmet: 0 };
    }
    const sum = filteredRows.reduce((acc, curr) => acc + curr.capaian, 0);
    const avg = sum / filteredRows.length;
    const metCount = filteredRows.filter((r) => r.capaian >= activeTabDef.targetPercent).length;
    return {
      avgCapaian: avg,
      totalFaskes: filteredRows.length,
      totalMet: metCount,
      totalUnmet: filteredRows.length - metCount,
    };
  }, [filteredRows, activeTabDef.targetPercent]);

  const formatPercentID = (val: number): string => {
    return val.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  };

  const headerInfo = TAB_HEADER_INFO[activeTabId] || TAB_HEADER_INFO['01-nakes'];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto animate-fadeIn">
      {/* 1. Header Banner & Info */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-[#83a67e]/30 dark:border-emerald-500/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#44853b]/10 via-[#2b4390]/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-[#44853b] dark:bg-emerald-400 animate-pulse" />
                Laporan Kepatuhan FKRTL
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#afbade]/20 text-[#2b4390] border border-[#afbade]/40 dark:bg-blue-500/10 dark:text-sky-300 dark:border-blue-500/20">
                8 Indikator Terpadu
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-[#2b4390] dark:text-[#f7fcfa] tracking-tight">
              {headerInfo.title} <span className="bpjs-gradient-text">{headerInfo.gradientTitle}</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#6573a1] dark:text-[#afbade] mt-1 max-w-3xl leading-relaxed">
              {headerInfo.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="glass-panel px-4 py-2.5 rounded-2xl border border-[#afbade]/30 dark:border-white/10 flex items-center gap-3 shadow-md">
              <span className="text-2xl">{activeTabDef.icon}</span>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#6573a1] dark:text-slate-400 block tracking-wider">
                  Target Nasional {activeTabDef.shortName}
                </span>
                <span className="text-sm font-black text-[#44853b] dark:text-emerald-400 font-mono">
                  {activeTabDef.targetLabel ?? `≥ ${activeTabDef.targetPercent}%`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. TAB-TAB KEPATUHAN (8 INDIKATOR RESMI BPJS KESEHATAN) */}
      <div className="glass-card rounded-2xl p-2 border border-[#afbade]/30 dark:border-white/10 shadow-lg overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max">
          {COMPLIANCE_TABS.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer select-none ${
                  isActive
                    ? 'bpjs-gradient-btn text-white shadow-md shadow-[#2b4390]/25 border border-[#83a67e]/50'
                    : 'text-[#6573a1] hover:text-[#2b4390] hover:bg-[#d4ecd1]/30 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <span className="text-sm">{tab.icon}</span>
                <span>{tab.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-[#afbade]/20 text-[#2b4390] dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {tab.badgeLabel ?? `${tab.targetPercent}%`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* RENDER TAB KEPATUHAN: TAB 01 (NAKES), TAB 02 (PENGADUAN), TAB 03 (UMABL), ATAU TAB LAINNYA */}
      {activeTabId === '01-nakes' ? (
        <NakesComplianceTab />
      ) : activeTabId === '02-pengaduan' ? (
        <PengaduanComplianceTab />
      ) : activeTabId === '03-umabl' ? (
        <UmablComplianceTab />
      ) : activeTabId === '04-display-tt' ? (
        <DisplayTtComplianceTab />
      ) : (
        <>
          {/* 3. Panel Ringkasan Indikator Terpilih & Statistik KPI */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-[#83a67e]/30 dark:border-emerald-500/20 shadow-md">
          <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider block">
            Rata-rata {activeTabDef.kpiLabel}
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-black text-[#2b4390] dark:text-[#f7fcfa] font-mono">
              {formatPercentID(stats.avgCapaian)}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                stats.avgCapaian >= activeTabDef.targetPercent
                  ? 'bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30'
                  : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30'
              }`}
            >
              {stats.avgCapaian >= activeTabDef.targetPercent ? 'Tercapai' : 'Perlu Peningkatan'}
            </span>
          </div>
          <span className="text-[10.5px] text-[#6573a1] dark:text-slate-400 mt-1 block">
            Target Standar BPJS: &ge;{activeTabDef.targetPercent}%
          </span>
        </div>

        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-[#afbade]/30 dark:border-white/10 shadow-md">
          <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider block">
            Faskes Memenuhi Target (Patuh)
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-black text-[#44853b] dark:text-emerald-400 font-mono">
              {stats.totalMet}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-slate-400">
              dari {stats.totalFaskes} RS ({formatPercentID(stats.totalFaskes ? (stats.totalMet / stats.totalFaskes) * 100 : 0)})
            </span>
          </div>
          <span className="text-[10.5px] text-[#44853b] dark:text-emerald-400/80 mt-1 block font-semibold">
            ✓ Capaian &ge; {activeTabDef.targetPercent}%
          </span>
        </div>

        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-[#afbade]/30 dark:border-white/10 shadow-md">
          <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider block">
            Faskes Belum Memenuhi (Waspada)
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 font-mono">
              {stats.totalUnmet}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-slate-400">
              dari {stats.totalFaskes} RS
            </span>
          </div>
          <span className="text-[10.5px] text-amber-600 dark:text-amber-400/80 mt-1 block font-semibold">
            ⚠ Capaian &lt; {activeTabDef.targetPercent}%
          </span>
        </div>

        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-[#afbade]/30 dark:border-blue-500/20 shadow-md">
          <span className="text-[11px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider block">
            Total Rumah Sakit Terdaftar
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-black text-[#2b4390] dark:text-sky-400 font-mono">
              {stats.totalFaskes}
            </span>
            <span className="text-xs text-[#6573a1] dark:text-slate-400">FKRTL Aktif</span>
          </div>
          <span className="text-[10.5px] text-[#6573a1] dark:text-slate-400 mt-1 block">
            Wilayah Kerja Kantor Cabang
          </span>
        </div>
      </div>

      {/* 4. Filter Bar & Kontrol Pencarian */}
      <div className="glass-card rounded-2xl p-4 border border-[#afbade]/30 dark:border-white/10 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Filter Kabupaten */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#2b4390] dark:text-slate-300">Kabupaten:</label>
            <select
              value={selectedKabupaten}
              onChange={(e) => setSelectedKabupaten(e.target.value)}
              className="glass-input rounded-xl px-3 py-1.5 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer"
            >
              {kabupatenOptions.map((kab) => (
                <option key={kab} value={kab} className="bg-slate-900 text-white">
                  {kab}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status Kepatuhan */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#2b4390] dark:text-slate-300">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="glass-input rounded-xl px-3 py-1.5 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b] cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">Semua Status</option>
              <option value="MET" className="bg-slate-900 text-white">Patuh (&ge;{activeTabDef.targetPercent}%)</option>
              <option value="UNMET" className="bg-slate-900 text-white">Belum Patuh (&lt;{activeTabDef.targetPercent}%)</option>
            </select>
          </div>
        </div>

        {/* Live Search Faskes */}
        <div className="relative w-full md:w-72">
          <input
            type="text"
            placeholder="Cari Nama Rumah Sakit / Kode PPK..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="glass-input w-full rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#2b4390] dark:text-white placeholder-[#6573a1] dark:placeholder-slate-500 bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b]"
          />
          <svg className="w-3.5 h-3.5 text-[#6573a1] dark:text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* 5. Tabel Matriks Kepatuhan Rumah Sakit */}
      <div className="glass-card rounded-2xl shadow-xl border border-[#afbade]/30 dark:border-white/10 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#afbade]/30 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f0f7f4] dark:bg-slate-900/40">
          <div>
            <h3 className="text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#44853b] shadow-sm shadow-[#44853b]/50" />
              Matriks Kepatuhan: {activeTabDef.name}
            </h3>
            <p className="text-xs text-[#6573a1] dark:text-slate-400 mt-0.5">
              {activeTabDef.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6573a1] dark:text-slate-400">
              Menampilkan <span className="font-bold text-[#2b4390] dark:text-white">{filteredRows.length}</span> fasilitas kesehatan
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#e6f2ed] dark:bg-slate-900/80 text-[#2b4390] dark:text-[#afbade] uppercase text-[10px] font-bold tracking-wider border-b border-[#afbade]/30 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">No</th>
                <th className="py-3 px-4">Kode PPK</th>
                <th className="py-3 px-4">Nama Rumah Sakit (FKRTL)</th>
                <th className="py-3 px-4">Kabupaten</th>
                <th className="py-3 px-4">Kelas RS</th>
                <th className="py-3 px-4 text-center">Realisasi / Target</th>
                <th className="py-3 px-4 text-center">Persentase Capaian</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Update Terakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#afbade]/20 dark:divide-slate-800/60 font-medium">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#6573a1] dark:text-slate-400 italic">
                    Tidak ada data fasilitas kesehatan yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => {
                  const isMet = row.capaian >= activeTabDef.targetPercent;
                  return (
                    <tr
                      key={row.kdppk}
                      className="hover:bg-[#d4ecd1]/20 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-3.5 px-4 text-[#6573a1] dark:text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#2b4390] dark:text-slate-300">{row.kdppk}</td>
                      <td className="py-3.5 px-4 font-bold text-[#2b4390] dark:text-white group-hover:text-[#44853b] dark:group-hover:text-emerald-300 transition-colors">
                        {row.faskes}
                      </td>
                      <td className="py-3.5 px-4 text-[#2b4390] dark:text-slate-300">{row.kabupaten}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#d4ecd1]/50 text-[#2b4390] dark:bg-slate-800 dark:text-slate-300 border border-[#afbade]/30 dark:border-white/5">
                          {row.kelas}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-[#2b4390] dark:text-slate-300">
                        {row.numerator} / {row.denominator} <span className="text-[10px] text-[#6573a1] dark:text-slate-500">({row.unit})</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-20 bg-[#afbade]/20 dark:bg-slate-800 rounded-full h-2 overflow-hidden border border-[#afbade]/30 dark:border-white/5">
                            <div
                              style={{ width: `${Math.min(row.capaian, 100)}%` }}
                              className={`h-full rounded-full transition-all duration-500 ${
                                isMet
                                  ? 'bg-gradient-to-r from-[#44853b] to-[#83a67e]'
                                  : 'bg-gradient-to-r from-amber-500 to-rose-400'
                              }`}
                            />
                          </div>
                          <span className="font-mono font-bold text-[#2b4390] dark:text-white text-[11px]">
                            {formatPercentID(row.capaian)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {isMet ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30">
                            ✓ Patuh
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30">
                            ⚠ Belum Patuh
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-[11px] text-[#6573a1] dark:text-slate-400">
                        {row.lastUpdate}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
