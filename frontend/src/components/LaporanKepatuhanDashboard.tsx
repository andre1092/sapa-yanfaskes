import MainCard from '../berry/MainCard';
import '../berry/berry-dashboards.css';
import { Box, Chip, Stack, Tab, Tabs, Typography } from '@mui/material';
import React, { useState, useMemo } from 'react';
import { RingkasanComplianceTab } from './RingkasanComplianceTab';
import { AMBANG_PATUH_NILAI_AKHIR } from '../lib/kepatuhanJpeg';
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
    targetPercent: AMBANG_PATUH_NILAI_AKHIR,
    targetLabel: `≥ ${AMBANG_PATUH_NILAI_AKHIR.toFixed(2)} Poin`,
    badgeLabel: '100 Poin',
    description: 'Konsolidasi capaian 8 pilar standar mutu kepatuhan faskes rujukan tingkat lanjutan (FKRTL) BPJS Kesehatan',
    kpiLabel: 'Nilai Akhir Kepatuhan',
  },
  {
    id: '01-nakes',
    code: '01',
    name: '01. Jadwal Praktek Nakes',
    shortName: 'Jadwal Praktek Nakes',
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
    targetPercent: 85,
    description: 'Monitoring kepatuhan pencatatan dan update Tempat Pelayanan Obat (TMO) / Farmasi RS dan Telemedicine.',
    kpiLabel: 'Kepatuhan Update TMO',
  },
  {
    id: '06-antrean-wtl',
    code: '06',
    name: '06. Antrean & WTL',
    shortName: 'Antrean & WTL',
    targetPercent: 85,
    description: 'Monitoring Waktu Tunggu Layanan (WTL) admisi, poli, dan farmasi serta kepatuhan integrasi antrean online rumah sakit.',
    kpiLabel: 'Kepatuhan Antrean & WTL',
  },
  {
    id: '07-surkon',
    code: '07',
    name: '07. Surkon',
    shortName: 'Surkon',
    targetPercent: 90,
    description: 'Monitoring kepatuhan penerbitan Surat Kontrol (Surkon) dan SPRI pasien kronis/rujukan berbasis web service bridging.',
    kpiLabel: 'Capaian Bridging Surkon',
  },
  {
    id: '08-rme',
    code: '08',
    name: '08. RME',
    shortName: 'RME',
    targetPercent: 95,
    description: 'Monitoring tingkat adopsi, integrasi sistem Rekam Medis Elektronik (RME) faskes dengan platform SatuSehat & BPJS Kesehatan.',
    kpiLabel: 'Tingkat Integrasi RME',
  },
];

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


  return (
    <div className="berry-dashboard sapa-page min-w-0 w-full p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <Stack className="berry-dashboard-heading" direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
        <Box><Typography variant="h3" component="h1">Kepatuhan FKRTL</Typography><Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>Pemantauan 8 indikator kepatuhan fasilitas kesehatan rujukan.</Typography></Box>
        <Box><Typography variant="caption" color="text.secondary">Pembaruan terakhir</Typography><Typography variant="body2" fontWeight={500}>{activeLiveSync || 'Belum tersedia'}</Typography></Box>
      </Stack>
      <MainCard content={false} className="berry-dashboard-card berry-compliance-navigation">
        <Tabs value={activeTabId} onChange={(_, value: ComplianceTabId) => setActiveTabId(value)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Indikator kepatuhan FKRTL">
          {COMPLIANCE_TABS.map(tab => <Tab key={tab.id} id={`compliance-tab-${tab.id}`} aria-controls={`compliance-panel-${tab.id}`} value={tab.id} label={tab.name} />)}
        </Tabs>
      </MainCard>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} gap={2}>
        <Box><Typography variant="h4" component="h2">{activeTabDef.shortName}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: '80ch' }}>{activeTabDef.description}</Typography></Box>
        <Chip variant="outlined" color="secondary" label={`Target ${activeTabDef.targetLabel ?? `≥ ${activeTabDef.targetPercent}%`}`} />
      </Stack>
      <div role="tabpanel" id={`compliance-panel-${activeTabId}`} aria-labelledby={`compliance-tab-${activeTabId}`}>
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
    </div>
  );
};
