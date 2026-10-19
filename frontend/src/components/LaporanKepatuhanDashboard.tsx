import React, { useState, useMemo } from 'react';
import { RingkasanComplianceTab } from './RingkasanComplianceTab';
import { NakesComplianceTab } from './NakesComplianceTab';
import { PengaduanComplianceTab } from './PengaduanComplianceTab';
import { UmablComplianceTab } from './UmablComplianceTab';
import { DisplayTtComplianceTab } from './DisplayTtComplianceTab';
import { TmoComplianceTab } from './TmoComplianceTab';
import { AntreanWtlComplianceTab } from './AntreanWtlComplianceTab';
import { SurkonComplianceTab } from './SurkonComplianceTab';
import { RmeComplianceTab } from './RmeComplianceTab';
import { useSyncStore } from '../store/syncStore';

export type ComplianceTabId =
  | '00-ringkasan'
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
    id: '00-ringkasan',
    code: '00',
    name: '00. Ringkasan Nilai Akhir',
    shortName: 'Ringkasan Nilai Akhir',
    icon: '🏆',
    targetPercent: 85,
    targetLabel: '≥ 85.00 Poin',
    badgeLabel: '100 Poin',
    description: 'Konsolidasi capaian 8 pilar standar mutu kepatuhan faskes rujukan tingkat lanjutan (FKRTL) BPJS Kesehatan',
    kpiLabel: 'Nilai Akhir Kepatuhan',
  },
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
  '00-ringkasan': {
    title: 'Rekapitulasi Konsolidasi',
    gradientTitle: 'Nilai Akhir Kepatuhan FKRTL',
    subtitle:
      'Konsolidasi capaian 8 pilar standar mutu kepatuhan faskes rujukan tingkat lanjutan (FKRTL) BPJS Kesehatan',
  },
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

export const LaporanKepatuhanDashboard: React.FC = () => {
  const [activeTabId, setActiveTabId] = useState<ComplianceTabId>('00-ringkasan');

  const activeTabDef = useMemo(() => {
    return COMPLIANCE_TABS.find((t) => t.id === activeTabId) || COMPLIANCE_TABS[0];
  }, [activeTabId]);

  const { lastUpdateNakes, lastUpdatePengaduan, lastUpdateUmabl, lastUpdateDisplayTt, lastUpdateAll } = useSyncStore();

  const activeLiveSync = useMemo(() => {
    switch (activeTabId) {
      case '01-nakes': return lastUpdateNakes || lastUpdateAll;
      case '02-pengaduan': return lastUpdatePengaduan || lastUpdateAll;
      case '03-umabl': return lastUpdateUmabl || lastUpdateAll;
      case '04-display-tt': return lastUpdateDisplayTt || lastUpdateAll;
      default: return lastUpdateAll;
    }
  }, [activeTabId, lastUpdateNakes, lastUpdatePengaduan, lastUpdateUmabl, lastUpdateDisplayTt, lastUpdateAll]);

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
            {/* Live Sync Last Update badge */}
            <div className="glass-panel px-4 py-2.5 rounded-2xl border border-[#83a67e]/40 dark:border-emerald-500/30 flex items-center gap-2.5 shadow-md bg-[#d4ecd1]/30 dark:bg-emerald-950/20">
              <span className="w-2.5 h-2.5 rounded-full bg-[#44853b] dark:bg-emerald-400 animate-pulse" />
              <div>
                <span className="text-[10px] uppercase font-bold text-[#6573a1] dark:text-slate-400 block tracking-wider">
                  Last Update :
                </span>
                <span className="text-xs font-black text-[#44853b] dark:text-emerald-300 font-mono">
                  {activeLiveSync || '26/09/2026 08:00:00'}
                </span>
              </div>
            </div>

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

      {/* RENDER TAB KEPATUHAN FKRTL: TAB 00 S/D TAB 08 */}
      {activeTabId === '00-ringkasan' ? (
        <RingkasanComplianceTab />
      ) : activeTabId === '01-nakes' ? (
        <NakesComplianceTab />
      ) : activeTabId === '02-pengaduan' ? (
        <PengaduanComplianceTab />
      ) : activeTabId === '03-umabl' ? (
        <UmablComplianceTab />
      ) : activeTabId === '04-display-tt' ? (
        <DisplayTtComplianceTab />
      ) : activeTabId === '05-tmo' ? (
        <TmoComplianceTab />
      ) : activeTabId === '06-antrean-wtl' ? (
        <AntreanWtlComplianceTab />
      ) : activeTabId === '07-surkon' ? (
        <SurkonComplianceTab />
      ) : activeTabId === '08-rme' ? (
        <RmeComplianceTab />
      ) : null}
    </div>
  );
};
