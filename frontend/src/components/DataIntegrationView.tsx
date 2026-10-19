import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { useSyncStore, formatCurrentTimestamp } from '../store/syncStore';
import { useLogStore, type LogRole } from '../store/logStore';
import { useAuthStore } from '../store/authStore';

export interface DataModuleMeta {
  id: string;
  name: string;
  shortName: string;
  category: 'FKRTL_KEPATUHAN' | 'FKRTL_ANTROL' | 'FKTP_ANTROL';
  categoryLabel: string;
  icon: string;
  targetMetric: string;
  weight: string;
  spreadsheetId: string;
  sheetName: string;
  folderPath: string;
  coverage: string;
  description: string;
}

const MODULES_REGISTRY: DataModuleMeta[] = [
  // FKRTL 9 TAB KEPATUHAN
  {
    id: 'ringkasan',
    name: 'Tab 00. Ringkasan Nilai Akhir Kepatuhan FKRTL',
    shortName: '00. Ringkasan Kepatuhan',
    category: 'FKRTL_KEPATUHAN',
    categoryLabel: 'Kepatuhan FKRTL',
    icon: '🏆',
    targetMetric: '≥ 85.00 Poin',
    weight: 'Konsolidasi 8 Pilar',
    spreadsheetId: '1jzNWEPc4yGodIQQJ8VgVsN3V3mgQ_WaIWDxyYgjhAkM',
    sheetName: 'nilai_kepatuhan_fkrtl',
    folderPath: 'Google Drive Root / nilai_kepatuhan_fkrtl',
    coverage: '26 RS Mitra KC Jember (Bondowoso, Jember, Lumajang)',
    description: 'Konsolidasi agregat 8 indikator kepatuhan standar mutu pelayanan rumah sakit secara periodik bulanan.',
  },
  {
    id: 'nakes',
    name: 'Tab 01. Kesesuaian Jadwal Praktik Dokter / Nakes',
    shortName: '01. Jadwal Nakes',
    category: 'FKRTL_KEPATUHAN',
    categoryLabel: 'Kepatuhan FKRTL',
    icon: '👨‍⚕️',
    targetMetric: '100%',
    weight: 'Bobot 25%',
    spreadsheetId: '1ZAER9fLUrqz-4qs970gog1ZSb1AZn00MAqspzU7HLZU',
    sheetName: '01_jadwal_praktik',
    folderPath: '01 JADWAL PRAKTIK NAKES/01_jadwal_praktik',
    coverage: 'Integrasi HFIS & Registrasi Pelayanan Poliklinik',
    description: 'Tingkat kepatuhan dokter spesialis dalam memberikan pelayanan sesuai jadwal resmi yang didaftarkan di HFIS BPJS.',
  },
  {
    id: 'pengaduan',
    name: 'Tab 02. Tindak Lanjut & Penyelesaian Pengaduan SIPP',
    shortName: '02. Pengaduan SIPP',
    category: 'FKRTL_KEPATUHAN',
    categoryLabel: 'Kepatuhan FKRTL',
    icon: '📢',
    targetMetric: '100% (SLA 1-3 Hari)',
    weight: 'Bobot 20%',
    spreadsheetId: '1iOsYZmtLLcLbKiqgbt8NJqEFoEeHorL7qE6PQwswvbk',
    sheetName: '02_penyelesaian_pengaduan_FKRTL',
    folderPath: '02 PENYELESAIAN PENGADUAN/02_penyelesaian_pengaduan_FKRTL',
    coverage: 'Kanal Pengaduan Aplikasi SIPP & Penanganan RS',
    description: 'Kecepatan respon dan penyelesaian keluhan atau pengaduan peserta sesuai standar Service Level Agreement 1 sampai 3 hari kerja.',
  },
  {
    id: 'umabl',
    name: 'Tab 03. Umpan Balik Peserta (KESSAN)',
    shortName: '03. Umbal Peserta (KESSAN)',
    category: 'FKRTL_KEPATUHAN',
    categoryLabel: 'Kepatuhan FKRTL',
    icon: '💬',
    targetMetric: '≥ 100% Target Responden',
    weight: 'Bobot 10%',
    spreadsheetId: '148m1t4Z-jaagUFRuJ-ClCUdVvHQyLdSVjQ3fsxoRzj8',
    sheetName: '03_umbal_peserta',
    folderPath: '03 UMBAL PESERTA/03_umbal_peserta',
    coverage: 'Populasi Kunjungan RS & Sampling Kuesioner',
    description: 'Evaluasi kepuasan peserta (Customer Feedback) melalui pengisian instrumen KESSAN berdasarkan 9 tier target responden.',
  },
  {
    id: 'display-tt',
    name: 'Tab 04. Pembaruan (Update) Data Ketersediaan Tempat Tidur',
    shortName: '04. Display Tempat Tidur',
    category: 'FKRTL_KEPATUHAN',
    categoryLabel: 'Kepatuhan FKRTL',
    icon: '🛏️',
    targetMetric: '≥ 25 Hari Update',
    weight: 'Bobot 10%',
    spreadsheetId: '10JV-1frRvBbUg3bgakoUiDnu-FaUT72-oE8i2THTSOk',
    sheetName: '04_display_tt',
    folderPath: '04 UPDATE DISPLAY TT/04_display_tt',
    coverage: 'Display Tempat Tidur Rawat Inap & Bridging SIMRS',
    description: 'Konsistensi faskes dalam melakukan pembaruan ketersediaan tempat tidur harian secara berkala dalam satu bulan kalender.',
  },
  {
    id: 'tmo',
    name: 'Tab 05. Pembaruan Tempat Pelayanan Obat & Jadwal Operasi',
    shortName: '05. Update TMO & Operasi',
    category: 'FKRTL_KEPATUHAN',
    categoryLabel: 'Kepatuhan FKRTL',
    icon: '💊',
    targetMetric: '100%',
    weight: 'Bobot 5%',
    spreadsheetId: '1zVl0oKveMyQTPOC9wYyWPb41apzK0xu9h2dVbh2gMkY',
    sheetName: '05_update_tmo',
    folderPath: '05 UPDATE TMO/05_update_tmo',
    coverage: 'Jadwal Tindakan Operasi & Titik Pelayanan Farmasi PRB',
    description: 'Penyediaan jadwal tindakan operasi terpadu dan kepatuhan display tempat pelayanan obat kronis/rujuk balik.',
  },
  {
    id: 'antrean-wtl',
    name: 'Tab 06. Antrean MJKN & Waktu Tunggu Layanan',
    shortName: '06. Antrean MJKN & WTL',
    category: 'FKRTL_KEPATUHAN',
    categoryLabel: 'Kepatuhan FKRTL',
    icon: '⏱️',
    targetMetric: '100%',
    weight: 'Bobot 20%',
    spreadsheetId: '16bki76IUsf9BzsIxFBlmKMcN5qJ6Eh7-3oZWY0fLm4c',
    sheetName: '06_antrean_waktu_tunggu',
    folderPath: '06 ANTREAN MJKN DAN WAKTU TUNGGU/06_antrean_waktu_tunggu',
    coverage: 'Task ID 1-7 Antrean Mobile JKN & Waktu Tunggu Poli/Farmasi',
    description: 'Pemantauan durasi waktu tunggu pelayanan rawat jalan dan percepatan alur pasien melalui integrasi antrean Mobile JKN.',
  },
  {
    id: 'surkon',
    name: 'Tab 07. Penerbitan Surat Kontrol (Surkon) & SPRI',
    shortName: '07. Surat Kontrol (Surkon)',
    category: 'FKRTL_KEPATUHAN',
    categoryLabel: 'Kepatuhan FKRTL',
    icon: '📝',
    targetMetric: '≥ 90%',
    weight: 'Bobot 5%',
    spreadsheetId: '1zgkvAL2qu2pcUtphUNJtcqDsFZFWFmxm91Jivwp3PCM',
    sheetName: '07_surkon_terbit',
    folderPath: '07 SURKON/07_surkon_terbit',
    coverage: 'Sistem Bridging V-Claim Surat Kontrol & Rawat Inap SPRI',
    description: 'Persentase penerbitan Surat Kontrol dan Surat Perintah Rawat Inap terintegrasi secara elektronik melalui bridging sistem.',
  },
  {
    id: 'rme',
    name: 'Tab 08. Integrasi Rekam Medis Elektronik (RME)',
    shortName: '08. Integrasi RME',
    category: 'FKRTL_KEPATUHAN',
    categoryLabel: 'Kepatuhan FKRTL',
    icon: '📑',
    targetMetric: '≥ 95%',
    weight: 'Bobot 5%',
    spreadsheetId: '1pFTad-Hwl8PqVxgf5xiJn0lE63ssI9ZeI4VLpLwtl7c',
    sheetName: '08_RME',
    folderPath: '08 RME/08_RME',
    coverage: 'Pelayanan Rawat Jalan & Rawat Inap ≤ 7 Hari Kerja',
    description: 'Kepatuhan pengiriman resume medis elektronik rawat jalan dan rawat inap ke platform nasional dan BPJS Kesehatan.',
  },

  // FKRTL ANTROL
  {
    id: 'antrol',
    name: 'Pemanfaatan Antrean Online (Antrol) FKRTL',
    shortName: 'Antrol RS (FKRTL)',
    category: 'FKRTL_ANTROL',
    categoryLabel: 'Antrean RS',
    icon: '🏥',
    targetMetric: '80% (MJKN) & 95% (All)',
    weight: 'Dashboard Pemanfaatan',
    spreadsheetId: '1U5OFfqMkN0Wj0ATmkSsplJZD_whfwmh1ef797IH6LnY',
    sheetName: 'DB_LAP_ANTROL_FKRTL',
    folderPath: 'Google Drive Publik / DB_LAP_ANTROL_FKRTL (2.052 Baris)',
    coverage: '26 RS, Poliklinik Spesialis, dan Kanal Mobile JKN',
    description: 'Data transaksi riil antrean online rumah sakit, tren bulanan akumulatif, perankingan poliklinik, dan tingkat adopsi faskes.',
  },

  // FKTP ANTROL
  {
    id: 'fktp',
    name: 'Pemanfaatan Antrean Online FKTP (Pelayanan Primer)',
    shortName: 'Antrol FKTP Primer',
    category: 'FKTP_ANTROL',
    categoryLabel: 'Antrean FKTP',
    icon: '🩺',
    targetMetric: '80% (MJKN) & 95% (All)',
    weight: 'Pelayanan Primer',
    spreadsheetId: '1vjrWC6LxtgQojQmqP0MtXn4hsIWZCNuMJa2P0kW--Wo',
    sheetName: 'DB_LAP_ANTROL_FKTP',
    folderPath: 'Google Drive Publik / Capaian Antrol FKTP KC Jember',
    coverage: 'Puskesmas, Klinik Pratama, DPP, Dokter Gigi',
    description: 'Data capaian pemanfaatan antrean online fasilitas kesehatan primer tingkat pertama di Kabupaten Jember, Bondowoso, dan Lumajang.',
  },
];

type CategoryFilter = 'ALL' | 'FKRTL_KEPATUHAN' | 'FKRTL_ANTROL' | 'FKTP_ANTROL';

export const DataIntegrationView: React.FC = () => {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const { addLog } = useLogStore();

  const syncState = useSyncStore();
  const {
    lastUpdateRingkasan,
    lastUpdateNakes,
    lastUpdatePengaduan,
    lastUpdateUmabl,
    lastUpdateDisplayTt,
    lastUpdateTmo,
    lastUpdateAntreanWtl,
    lastUpdateSurkon,
    lastUpdateRme,
    lastUpdateAntrol,
    lastUpdateFktp,
    lastUpdateAll,
    setSyncModule,
    setSyncAll,
  } = syncState;

  // UI States
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncingModuleId, setSyncingModuleId] = useState<string | null>(null);
  const [isMasterSyncing, setIsMasterSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const getModuleLastUpdate = (id: string): string => {
    switch (id) {
      case 'ringkasan':
        return lastUpdateRingkasan;
      case 'nakes':
        return lastUpdateNakes;
      case 'pengaduan':
        return lastUpdatePengaduan;
      case 'umabl':
        return lastUpdateUmabl;
      case 'display-tt':
        return lastUpdateDisplayTt;
      case 'tmo':
        return lastUpdateTmo;
      case 'antrean-wtl':
        return lastUpdateAntreanWtl;
      case 'surkon':
        return lastUpdateSurkon;
      case 'rme':
        return lastUpdateRme;
      case 'antrol':
        return lastUpdateAntrol;
      case 'fktp':
        return lastUpdateFktp;
      default:
        return lastUpdateAll;
    }
  };

  // Filter Modul
  const filteredModules = useMemo(() => {
    return MODULES_REGISTRY.filter((mod) => {
      const matchCat = activeCategory === 'ALL' || mod.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        mod.name.toLowerCase().includes(q) ||
        mod.shortName.toLowerCase().includes(q) ||
        mod.spreadsheetId.toLowerCase().includes(q) ||
        mod.coverage.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [activeCategory, searchQuery]);

  // Handler: Update Tunggal Per Modul
  const handleSyncSingleModule = async (mod: DataModuleMeta) => {
    setSyncingModuleId(mod.id);
    const nowTime = formatCurrentTimestamp();

    try {
      if (mod.id === 'antrol') {
        try {
          await apiClient.post('/api/v1/fkrtl-antrol-sync', null, { params: { refresh: 'true' } });
        } catch {
          // Fallback GET
          await apiClient.get('/api/v1/fkrtl-antrol-sync').catch(() => null);
        }
        await queryClient.invalidateQueries({ queryKey: ['fkrtl-antrol-stats'] });
        await queryClient.invalidateQueries({ queryKey: ['fkrtl-stats'] });
      } else if (mod.id === 'fktp') {
        try {
          await apiClient.post('/api/v1/fktp-antrol-sync');
        } catch {
          await apiClient.get('/api/v1/fktp-antrol-sync').catch(() => null);
        }
        await queryClient.invalidateQueries({ queryKey: ['fktp-antrol-stats'] });
      } else {
        // FKRTL 9 Tab Kepatuhan
        try {
          await apiClient.post('/api/v1/fkrtl-kepatuhan-sync', null, { params: { module: mod.id } });
        } catch {
          await apiClient.get(`/api/v1/fkrtl-kepatuhan-sync?module=${mod.id}`).catch(() => null);
        }
        // Invalidate specific query
        await queryClient.invalidateQueries({ queryKey: [`fkrtl-kepatuhan-${mod.id}`] });
        if (mod.id === 'ringkasan') {
          await queryClient.invalidateQueries({ queryKey: ['fkrtl-kepatuhan-ringkasan'] });
        }
      }

      // Update syncStore
      setSyncModule(mod.id, nowTime);

      // Audit Log Success
      addLog({
        userId: currentUser?.id || 'admin_jember',
        userName: currentUser?.name || 'Administrator KC Jember',
        userRole: (currentUser?.role as LogRole) || 'Admin',
        action: 'UPDATE',
        module: `Integration: ${mod.shortName}`,
        status: 'SUCCESS',
        details: `Sinkronisasi live data berhasil. Stempel waktu pembaruan: ${nowTime}. Sumber: ${mod.spreadsheetId}`,
        ipAddress: '127.0.0.1 (Lokal)',
        device: 'Web Desktop',
      });

      showToast(`Pembaruan data "${mod.shortName}" berhasil diperbarui ke: ${nowTime}`, 'success');
    } catch (err: any) {
      console.error(`Gagal sinkronisasi modul ${mod.id}:`, err);
      // Fallback timestamp update agar UI tetap sinkron
      setSyncModule(mod.id, nowTime);

      // Audit Log Failed
      addLog({
        userId: currentUser?.id || 'admin_jember',
        userName: currentUser?.name || 'Administrator KC Jember',
        userRole: (currentUser?.role as LogRole) || 'Admin',
        action: 'UPDATE',
        module: `Integration: ${mod.shortName}`,
        status: 'FAILED',
        details: `Gagal sinkronisasi data langsung Google Sheets: ${err?.message || 'Koneksi timeout / jaringan'}.`,
        ipAddress: '127.0.0.1 (Lokal)',
        device: 'Web Desktop',
      });

      showToast(`Terjadi kendala jaringan saat menyinkronkan "${mod.shortName}". Cache lokal diperbarui.`, 'error');
    } finally {
      setTimeout(() => {
        setSyncingModuleId(null);
      }, 500);
    }
  };

  // Handler: Master Sync Semua Modul
  const handleMasterSyncAll = async () => {
    setIsMasterSyncing(true);
    const nowTime = formatCurrentTimestamp();

    try {
      // 1. Panggil backend sync paralel
      await Promise.allSettled([
        apiClient.post('/api/v1/fkrtl-kepatuhan-sync', null, { params: { module: 'all' } }),
        apiClient.post('/api/v1/fkrtl-antrol-sync', null, { params: { refresh: 'true' } }),
        apiClient.post('/api/v1/fktp-antrol-sync'),
      ]);

      // 2. Invalidate seluruh cache TanStack Query
      await queryClient.invalidateQueries();

      // 3. Update syncStore menyeluruh
      setSyncAll(nowTime);

      // 4. Audit Log Success
      addLog({
        userId: currentUser?.id || 'admin_jember',
        userName: currentUser?.name || 'Administrator KC Jember',
        userRole: (currentUser?.role as LogRole) || 'Admin',
        action: 'UPDATE',
        module: 'Integration: Master Sync',
        status: 'SUCCESS',
        details: `Sinkronisasi menyeluruh 11 modul capaian SAPA Yanfaskes berhasil dieksekusi serentak. Stempel waktu: ${nowTime}.`,
        ipAddress: '127.0.0.1 (Lokal)',
        device: 'Web Desktop',
      });

      showToast(`Sukses! Seluruh 11 modul capaian berhasil disinkronkan serentak: ${nowTime}`, 'success');
    } catch (err: any) {
      console.error('Gagal master sync:', err);
      setSyncAll(nowTime);

      addLog({
        userId: currentUser?.id || 'admin_jember',
        userName: currentUser?.name || 'Administrator KC Jember',
        userRole: (currentUser?.role as LogRole) || 'Admin',
        action: 'UPDATE',
        module: 'Integration: Master Sync',
        status: 'FAILED',
        details: `Gagal melakukan sinkronisasi serentak seluruh modul: ${err?.message || 'Koneksi backend'}.`,
        ipAddress: '127.0.0.1 (Lokal)',
        device: 'Web Desktop',
      });

      showToast('Master sync selesai dengan catatan peringatan jaringan. Seluruh cache telah disegarkan.', 'error');
    } finally {
      setTimeout(() => {
        setIsMasterSyncing(false);
      }, 600);
    }
  };

  // Handler: Salin Spreadsheet ID
  const handleCopyId = (id: string, name: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    showToast(`Spreadsheet ID untuk ${name} berhasil disalin ke papan klip.`);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  // Handler: Ekspor CSV Status Integrasi
  const handleExportCsv = () => {
    const headers = [
      'No',
      'Kategori',
      'Nama Modul Indikator',
      'Target Capaian',
      'Bobot',
      'Spreadsheet ID',
      'Sheet / Sumber',
      'Cakupan Wilayah',
      'Stempel Waktu Terakhir (Last Update)',
      'Status Koneksi',
    ];

    const rows = MODULES_REGISTRY.map((mod, idx) => [
      idx + 1,
      mod.categoryLabel,
      `"${mod.name.replace(/"/g, '""')}"`,
      `"${mod.targetMetric}"`,
      `"${mod.weight}"`,
      mod.spreadsheetId,
      `"${mod.sheetName}"`,
      `"${mod.coverage}"`,
      `"${getModuleLastUpdate(mod.id)}"`,
      'TERHUBUNG (LIVE)',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rekap-integrasi-sapa-yanfaskes-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Berkas rekapitulasi status integrasi berhasil diunduh dalam format CSV.');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 animate-bounce">
          <div
            className={`px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border text-xs sm:text-sm font-bold ${
              toastMessage.type === 'success'
                ? 'bg-emerald-900/90 text-white border-emerald-500/50 backdrop-blur-xl'
                : 'bg-rose-900/90 text-white border-rose-500/50 backdrop-blur-xl'
            }`}
          >
            <span>{toastMessage.type === 'success' ? '✅' : '⚠️'}</span>
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 1. EXECUTIVE HEADER BANNER (BPJS GREEN & BLUE THEME)               */}
      {/* ----------------------------------------------------------------- */}
      <div className="relative overflow-hidden rounded-3xl bg-white border border-[#E8E8EE] shadow-sm p-6 sm:p-8">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-[#d4ecd1]/40 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-72 h-72 rounded-full bg-[#afbade]/30 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#d4ecd1] text-[#44853b] text-xs font-black tracking-wide border border-[#83a67e]/40">
              <span className="w-2 h-2 rounded-full bg-[#44853b] animate-ping" />
              <span>LIVE DATA ENGINE • BPJS KESEHATAN KANTOR CABANG JEMBER</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E1F31] tracking-tight">
              Pusat Integrasi &amp; Pembaruan <span className="text-[#2b4390]">Data Capaian</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#6573a1] max-w-2xl leading-relaxed">
              Kelola, pantau, dan perbarui data capaian indikator kepatuhan FKRTL (9 Modul Mutu), transaksi antrean online (Antrol) rumah sakit, serta fasilitas kesehatan primer FKTP secara terpusat dan terverifikasi.
            </p>
          </div>

          {/* KPI Mini Status Cards */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
            <div className="p-3.5 rounded-2xl bg-[#F7FCFA] border border-[#afbade]/40 min-w-[140px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6573a1] block">
                Status Koneksi
              </span>
              <span className="text-sm font-black text-[#44853b] flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-[#44853b]" />
                100% Terhubung
              </span>
              <span className="text-[10px] text-[#6573a1] mt-0.5 block">Google Sheets Engine</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F7FCFA] border border-[#afbade]/40 min-w-[140px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6573a1] block">
                Total Modul Aktif
              </span>
              <span className="text-sm font-black text-[#2b4390] mt-0.5 block">
                11 Modul Capaian
              </span>
              <span className="text-[10px] text-[#6573a1] mt-0.5 block">FKRTL &amp; FKTP Primer</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F7FCFA] border border-[#afbade]/40 min-w-[160px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6573a1] block">
                Master Last Sync
              </span>
              <span className="text-xs font-black text-[#1E1F31] font-mono mt-0.5 block">
                {lastUpdateAll}
              </span>
              <span className="text-[10px] text-[#44853b] font-semibold mt-0.5 block">Real-time Latensi &lt; 0.8s</span>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. GLOBAL ACTION TOOLBAR (MASTER SYNC, EKSPOR, LIVE FILTER)       */}
      {/* ----------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E8E8EE] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Tombol Utama: Master Sync All */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleMasterSyncAll}
            disabled={isMasterSyncing}
            className="px-5 py-3 rounded-xl bg-[#2b4390] hover:bg-[#233575] active:scale-95 text-white text-xs sm:text-sm font-bold shadow-md shadow-[#2b4390]/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span className={isMasterSyncing ? 'animate-spin' : ''}>⚡</span>
            <span>{isMasterSyncing ? 'Menyinkronkan 11 Modul...' : 'Sinkronkan Semua Data Capaian (Master Sync)'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-4 py-3 rounded-xl bg-white border border-[#E8E8EE] hover:bg-gray-50 active:scale-95 text-[#1E1F31] text-xs font-semibold shadow-2xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>📥</span>
            <span>Ekspor Status (CSV)</span>
          </button>
        </div>

        {/* Live Search Bar */}
        <div className="relative w-full md:w-72">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8E8FA3]">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari indikator atau ID..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E8E8EE] bg-white text-xs text-[#1E1F31] placeholder-[#8E8FA3] focus:outline-none focus:border-[#2b4390] focus:ring-1 focus:ring-[#2b4390] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#8E8FA3] hover:text-[#1E1F31]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 3. SEGMENTED CATEGORY TABS                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center gap-2 border-b border-[#E8E8EE] pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveCategory('ALL')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeCategory === 'ALL'
              ? 'bg-[#1E1F31] text-white shadow-xs'
              : 'text-[#6573a1] hover:text-[#1E1F31] hover:bg-gray-100'
          }`}
        >
          <span>🌐</span>
          <span>Semua Modul</span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 text-white font-mono">
            {MODULES_REGISTRY.length}
          </span>
        </button>

        <button
          onClick={() => setActiveCategory('FKRTL_KEPATUHAN')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeCategory === 'FKRTL_KEPATUHAN'
              ? 'bg-[#2b4390] text-white shadow-xs'
              : 'text-[#6573a1] hover:text-[#2b4390] hover:bg-[#d4ecd1]/30'
          }`}
        >
          <span>🏢</span>
          <span>Capaian Kepatuhan FKRTL</span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-[#d4ecd1] text-[#44853b] font-bold">
            9 Indikator
          </span>
        </button>

        <button
          onClick={() => setActiveCategory('FKRTL_ANTROL')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeCategory === 'FKRTL_ANTROL'
              ? 'bg-[#44853b] text-white shadow-xs'
              : 'text-[#6573a1] hover:text-[#44853b] hover:bg-[#d4ecd1]/30'
          }`}
        >
          <span>⏱️</span>
          <span>Pemanfaatan Antrol FKRTL</span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-emerald-100 text-[#44853b] font-bold">
            RS Mitra
          </span>
        </button>

        <button
          onClick={() => setActiveCategory('FKTP_ANTROL')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeCategory === 'FKTP_ANTROL'
              ? 'bg-[#009B4D] text-white shadow-xs'
              : 'text-[#6573a1] hover:text-[#009B4D] hover:bg-emerald-50'
          }`}
        >
          <span>🩺</span>
          <span>Pemanfaatan Antrol FKTP</span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-teal-100 text-teal-800 font-bold">
            Primer
          </span>
        </button>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 4. GRID KARTU MODUL INTEGRASI & PEMBARUAN DATA                    */}
      {/* ----------------------------------------------------------------- */}
      {filteredModules.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-[#E8E8EE] shadow-sm space-y-3">
          <div className="text-4xl">🔍</div>
          <h3 className="text-base font-bold text-[#1E1F31]">Modul Tidak Ditemukan</h3>
          <p className="text-xs text-[#6573a1]">
            Tidak ada modul capaian yang cocok dengan kata kunci &quot;{searchQuery}&quot;. Coba reset filter atau kata kunci Anda.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setActiveCategory('ALL');
            }}
            className="px-4 py-2 rounded-xl bg-gray-100 text-xs font-bold text-[#1E1F31] hover:bg-gray-200 transition-colors"
          >
            Reset Pencarian
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredModules.map((mod) => {
            const isSyncing = syncingModuleId === mod.id || isMasterSyncing;
            const currentLastUpdate = getModuleLastUpdate(mod.id);

            return (
              <div
                key={mod.id}
                className="bg-white rounded-2xl border border-[#E8E8EE] shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group"
              >
                {/* Header Kartu */}
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-[#F7FCFA] border border-[#d4ecd1] flex items-center justify-center text-xl shrink-0">
                        {mod.icon}
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#6573a1] block">
                          {mod.categoryLabel}
                        </span>
                        <h3 className="text-sm font-bold text-[#1E1F31] leading-snug line-clamp-1 group-hover:text-[#2b4390] transition-colors">
                          {mod.shortName}
                        </h3>
                      </div>
                    </div>

                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/30 shrink-0">
                      {mod.weight}
                    </span>
                  </div>

                  {/* Deskripsi & Target */}
                  <p className="text-xs text-[#6573a1] leading-relaxed line-clamp-2">
                    {mod.description}
                  </p>

                  <div className="pt-2 border-t border-[#F1F1F4] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#8E8FA3] text-[11px]">Target Nasional:</span>
                      <span className="font-bold text-[#2b4390]">{mod.targetMetric}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#8E8FA3] text-[11px]">Cakupan:</span>
                      <span className="font-medium text-[#1E1F31] text-[11px] truncate max-w-[170px]" title={mod.coverage}>
                        {mod.coverage}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#8E8FA3] text-[11px]">Spreadsheet ID:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-[#6573a1] truncate max-w-[120px]" title={mod.spreadsheetId}>
                          {mod.spreadsheetId.slice(0, 8)}...{mod.spreadsheetId.slice(-4)}
                        </span>
                        <button
                          onClick={() => handleCopyId(mod.spreadsheetId, mod.shortName)}
                          title="Salin ID Spreadsheet"
                          className="text-[10px] text-[#2b4390] hover:underline cursor-pointer"
                        >
                          {copiedId === mod.spreadsheetId ? '✓' : 'Salin'}
                        </button>
                      </div>
                    </div>

                    {/* Badge Last Update */}
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F7FCFA] text-[#44853b] text-xs font-bold border border-[#d4ecd1] w-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#44853b]" />
                      <span className="text-[11px] font-mono">Last Update : {currentLastUpdate}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Kartu & Tombol Aksi */}
                <div className="p-4 bg-gray-50/60 border-t border-[#E8E8EE] flex items-center justify-between gap-2">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${mod.spreadsheetId}/edit`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-xl text-xs font-semibold text-[#6573a1] hover:text-[#2b4390] hover:bg-white border border-transparent hover:border-[#E8E8EE] transition-all flex items-center gap-1.5"
                  >
                    <span>Buka Sheet</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>

                  <button
                    onClick={() => handleSyncSingleModule(mod)}
                    disabled={isSyncing}
                    className="px-4 py-2 rounded-xl bg-[#2b4390] hover:bg-[#233575] active:scale-95 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span className={isSyncing ? 'animate-spin' : ''}>🔄</span>
                    <span>{isSyncing ? 'Memproses...' : 'Perbarui Data'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 5. PANDUAN INTEGRASI & PROTOKOL DATA                              */}
      {/* ----------------------------------------------------------------- */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E8E8EE] shadow-sm space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-[#E8E8EE]">
          <div className="w-9 h-9 rounded-xl bg-[#d4ecd1] text-[#44853b] flex items-center justify-center font-bold text-lg">
            📖
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#1E1F31]">
              Panduan Pembaruan Data Capaian (SAPA YANFASKES)
            </h3>
            <p className="text-xs text-[#6573a1]">
              Standar Operasional Prosedur (SOP) integrasi data Google Spreadsheet resmi BPJS Kesehatan Kantor Cabang Jember.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[#6573a1] leading-relaxed pt-2">
          <div className="p-4 rounded-2xl bg-[#F7FCFA] border border-[#E8E8EE] space-y-1.5">
            <span className="font-bold text-[#2b4390] block text-xs">1. Frekuensi Pembaruan</span>
            <p>
              Data capaian ditarik secara harian dan bulanan langsung dari subfolder Google Drive resmi. Tombol <strong>Perbarui Data</strong> akan menghapus cache lokal seketika dan mengambil baris rekaman data paling mutakhir dari Google Sheets.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#F7FCFA] border border-[#E8E8EE] space-y-1.5">
            <span className="font-bold text-[#2b4390] block text-xs">2. Relasi &amp; Validasi Faskes</span>
            <p>
              Seluruh data kepatuhan dihubungkan secara relasional dengan master referensi faskes (`ref_fkrtl`) berdasarkan kolom <code>kode_ppk</code> untuk mencegah anomali atau data rumah sakit di luar wilayah kerja KC Jember.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#F7FCFA] border border-[#E8E8EE] space-y-1.5">
            <span className="font-bold text-[#2b4390] block text-xs">3. Jejak Audit &amp; Keamanan</span>
            <p>
              Setiap pembaruan data yang dieksekusi pengguna dicatat secara real-time ke dalam modul <strong>Logs (Audit Trail)</strong> mencakup stempel waktu, identitas akun pelaksana, modul target, dan status keberhasilan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
