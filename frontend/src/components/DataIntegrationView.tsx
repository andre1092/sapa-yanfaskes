import { Stack, Typography, TextField, Chip, Tabs, Tab } from "@mui/material";
import MainCard from "../berry/MainCard";
import { AnimatedButton } from "./ui/AnimatedButton";
import React, { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import { AMBANG_PATUH_NILAI_AKHIR } from "../lib/kepatuhanJpeg";
import { useSyncStore, formatCurrentTimestamp } from "../store/syncStore";

export interface DataModuleMeta {
  id: string;
  name: string;
  shortName: string;
  category: "FKRTL_KEPATUHAN" | "FKRTL_ANTROL" | "FKTP_ANTROL";
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
    id: "ringkasan",
    name: "Tab 00. Ringkasan Nilai Akhir Kepatuhan FKRTL",
    shortName: "00. Ringkasan Kepatuhan",
    category: "FKRTL_KEPATUHAN",
    categoryLabel: "Kepatuhan FKRTL",
    icon: "DATA",
    targetMetric: `≥ ${AMBANG_PATUH_NILAI_AKHIR.toFixed(2)} Poin`,
    weight: "Konsolidasi 8 Pilar",
    spreadsheetId: "1jzNWEPc4yGodIQQJ8VgVsN3V3mgQ_WaIWDxyYgjhAkM",
    sheetName: "nilai_kepatuhan_fkrtl",
    folderPath: "Google Drive Root / nilai_kepatuhan_fkrtl",
    coverage: "26 RS Mitra KC Jember (Bondowoso, Jember, Lumajang)",
    description:
      "Konsolidasi agregat 8 indikator kepatuhan standar mutu pelayanan rumah sakit secara periodik bulanan.",
  },
  {
    id: "nakes",
    name: "Tab 01. Kesesuaian Jadwal Praktik Dokter / Nakes",
    shortName: "01. Jadwal Nakes",
    category: "FKRTL_KEPATUHAN",
    categoryLabel: "Kepatuhan FKRTL",
    icon: "DATA",
    targetMetric: "100%",
    weight: "Bobot 25%",
    spreadsheetId: "1ZAER9fLUrqz-4qs970gog1ZSb1AZn00MAqspzU7HLZU",
    sheetName: "01_jadwal_praktik",
    folderPath: "01 JADWAL PRAKTIK NAKES/01_jadwal_praktik",
    coverage: "Integrasi HFIS & Registrasi Pelayanan Poliklinik",
    description:
      "Tingkat kepatuhan dokter spesialis dalam memberikan pelayanan sesuai jadwal resmi yang didaftarkan di HFIS BPJS.",
  },
  {
    id: "pengaduan",
    name: "Tab 02. Tindak Lanjut & Penyelesaian Pengaduan SIPP",
    shortName: "02. Pengaduan SIPP",
    category: "FKRTL_KEPATUHAN",
    categoryLabel: "Kepatuhan FKRTL",
    icon: "DATA",
    targetMetric: "100% (SLA 1-3 Hari)",
    weight: "Bobot 20%",
    spreadsheetId: "1iOsYZmtLLcLbKiqgbt8NJqEFoEeHorL7qE6PQwswvbk",
    sheetName: "02_penyelesaian_pengaduan_FKRTL",
    folderPath: "02 PENYELESAIAN PENGADUAN/02_penyelesaian_pengaduan_FKRTL",
    coverage: "Kanal Pengaduan Aplikasi SIPP & Penanganan RS",
    description:
      "Kecepatan respon dan penyelesaian keluhan atau pengaduan peserta sesuai standar Service Level Agreement 1 sampai 3 hari kerja.",
  },
  {
    id: "umabl",
    name: "Tab 03. Umpan Balik Peserta (KESSAN)",
    shortName: "03. Umbal Peserta (KESSAN)",
    category: "FKRTL_KEPATUHAN",
    categoryLabel: "Kepatuhan FKRTL",
    icon: "DATA",
    targetMetric: "≥ 100% Target Responden",
    weight: "Bobot 10%",
    spreadsheetId: "148m1t4Z-jaagUFRuJ-ClCUdVvHQyLdSVjQ3fsxoRzj8",
    sheetName: "03_umbal_peserta",
    folderPath: "03 UMBAL PESERTA/03_umbal_peserta",
    coverage: "Populasi Kunjungan RS & Sampling Kuesioner",
    description:
      "Evaluasi kepuasan peserta (Customer Feedback) melalui pengisian instrumen KESSAN berdasarkan 9 tier target responden.",
  },
  {
    id: "display-tt",
    name: "Tab 04. Pembaruan (Update) Data Ketersediaan Tempat Tidur",
    shortName: "04. Display Tempat Tidur",
    category: "FKRTL_KEPATUHAN",
    categoryLabel: "Kepatuhan FKRTL",
    icon: "DATA",
    targetMetric: "≥ 25 Hari Update",
    weight: "Bobot 10%",
    spreadsheetId: "10JV-1frRvBbUg3bgakoUiDnu-FaUT72-oE8i2THTSOk",
    sheetName: "04_display_tt",
    folderPath: "04 UPDATE DISPLAY TT/04_display_tt",
    coverage: "Display Tempat Tidur Rawat Inap & Bridging SIMRS",
    description:
      "Konsistensi faskes dalam melakukan pembaruan ketersediaan tempat tidur harian secara berkala dalam satu bulan kalender.",
  },
  {
    id: "tmo",
    name: "Tab 05. Pembaruan Tempat Pelayanan Obat & Jadwal Operasi",
    shortName: "05. Update TMO & Operasi",
    category: "FKRTL_KEPATUHAN",
    categoryLabel: "Kepatuhan FKRTL",
    icon: "DATA",
    targetMetric: "100%",
    weight: "Bobot 5%",
    spreadsheetId: "1zVl0oKveMyQTPOC9wYyWPb41apzK0xu9h2dVbh2gMkY",
    sheetName: "05_update_tmo",
    folderPath: "05 UPDATE TMO/05_update_tmo",
    coverage: "Jadwal Tindakan Operasi & Titik Pelayanan Farmasi PRB",
    description:
      "Penyediaan jadwal tindakan operasi terpadu dan kepatuhan display tempat pelayanan obat kronis/rujuk balik.",
  },
  {
    id: "antrean-wtl",
    name: "Tab 06. Antrean MJKN & Waktu Tunggu Layanan",
    shortName: "06. Antrean MJKN & WTL",
    category: "FKRTL_KEPATUHAN",
    categoryLabel: "Kepatuhan FKRTL",
    icon: "DATA",
    targetMetric: "100%",
    weight: "Bobot 20%",
    spreadsheetId: "16bki76IUsf9BzsIxFBlmKMcN5qJ6Eh7-3oZWY0fLm4c",
    sheetName: "06_antrean_waktu_tunggu",
    folderPath: "06 ANTREAN MJKN DAN WAKTU TUNGGU/06_antrean_waktu_tunggu",
    coverage: "Task ID 1-7 Antrean Mobile JKN & Waktu Tunggu Poli/Farmasi",
    description:
      "Pemantauan durasi waktu tunggu pelayanan rawat jalan dan percepatan alur pasien melalui integrasi antrean Mobile JKN.",
  },
  {
    id: "surkon",
    name: "Tab 07. Penerbitan Surat Kontrol (Surkon) & SPRI",
    shortName: "07. Surat Kontrol (Surkon)",
    category: "FKRTL_KEPATUHAN",
    categoryLabel: "Kepatuhan FKRTL",
    icon: "DATA",
    targetMetric: "≥ 90%",
    weight: "Bobot 5%",
    spreadsheetId: "1zgkvAL2qu2pcUtphUNJtcqDsFZFWFmxm91Jivwp3PCM",
    sheetName: "07_surkon_terbit",
    folderPath: "07 SURKON/07_surkon_terbit",
    coverage: "Sistem Bridging V-Claim Surat Kontrol & Rawat Inap SPRI",
    description:
      "Persentase penerbitan Surat Kontrol dan Surat Perintah Rawat Inap terintegrasi secara elektronik melalui bridging sistem.",
  },
  {
    id: "rme",
    name: "Tab 08. Integrasi Rekam Medis Elektronik (RME)",
    shortName: "08. Integrasi RME",
    category: "FKRTL_KEPATUHAN",
    categoryLabel: "Kepatuhan FKRTL",
    icon: "DATA",
    targetMetric: "≥ 95%",
    weight: "Bobot 5%",
    spreadsheetId: "1pFTad-Hwl8PqVxgf5xiJn0lE63ssI9ZeI4VLpLwtl7c",
    sheetName: "08_RME",
    folderPath: "08 RME/08_RME",
    coverage: "Pelayanan Rawat Jalan & Rawat Inap ≤ 7 Hari Kerja",
    description:
      "Kepatuhan pengiriman resume medis elektronik rawat jalan dan rawat inap ke platform nasional dan BPJS Kesehatan.",
  },

  // FKRTL ANTROL
  {
    id: "antrol",
    name: "Pemanfaatan Antrean Online (Antrol) FKRTL",
    shortName: "Antrol RS (FKRTL)",
    category: "FKRTL_ANTROL",
    categoryLabel: "Antrean RS",
    icon: "DATA",
    targetMetric: "80% (MJKN) & 95% (All)",
    weight: "Dashboard Pemanfaatan",
    spreadsheetId: "1U5OFfqMkN0Wj0ATmkSsplJZD_whfwmh1ef797IH6LnY",
    sheetName: "DB_LAP_ANTROL_FKRTL",
    folderPath: "Google Drive Publik / DB_LAP_ANTROL_FKRTL (2.052 Baris)",
    coverage: "26 RS, Poliklinik Spesialis, dan Kanal Mobile JKN",
    description:
      "Data transaksi riil antrean online rumah sakit, tren bulanan akumulatif, perankingan poliklinik, dan tingkat adopsi faskes.",
  },

  // FKTP ANTROL
  {
    id: "fktp",
    name: "Pemanfaatan Antrean Online FKTP (Pelayanan Primer)",
    shortName: "Antrol FKTP Primer",
    category: "FKTP_ANTROL",
    categoryLabel: "Antrean FKTP",
    icon: "DATA",
    targetMetric: "80% (MJKN) & 95% (All)",
    weight: "Pelayanan Primer",
    spreadsheetId: "1vjrWC6LxtgQojQmqP0MtXn4hsIWZCNuMJa2P0kW--Wo",
    sheetName: "DB_LAP_ANTROL_FKTP",
    folderPath: "Google Drive Publik / Capaian Antrol FKTP KC Jember",
    coverage: "Puskesmas, Klinik Pratama, DPP, Dokter Gigi",
    description:
      "Data capaian pemanfaatan antrean online fasilitas kesehatan primer tingkat pertama di Kabupaten Jember, Bondowoso, dan Lumajang.",
  },
];

type CategoryFilter =
  "ALL" | "FKRTL_KEPATUHAN" | "FKRTL_ANTROL" | "FKTP_ANTROL";

export const DataIntegrationView: React.FC = () => {
  const queryClient = useQueryClient();

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
  } = syncState;

  // UI States
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [syncingModuleId, setSyncingModuleId] = useState<string | null>(null);
  const [isMasterSyncing, setIsMasterSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const getModuleLastUpdate = (id: string): string => {
    switch (id) {
      case "ringkasan":
        return lastUpdateRingkasan;
      case "nakes":
        return lastUpdateNakes;
      case "pengaduan":
        return lastUpdatePengaduan;
      case "umabl":
        return lastUpdateUmabl;
      case "display-tt":
        return lastUpdateDisplayTt;
      case "tmo":
        return lastUpdateTmo;
      case "antrean-wtl":
        return lastUpdateAntreanWtl;
      case "surkon":
        return lastUpdateSurkon;
      case "rme":
        return lastUpdateRme;
      case "antrol":
        return lastUpdateAntrol;
      case "fktp":
        return lastUpdateFktp;
      default:
        return lastUpdateAll;
    }
  };

  // Filter Modul
  const filteredModules = useMemo(() => {
    return MODULES_REGISTRY.filter((mod) => {
      const matchCat =
        activeCategory === "ALL" || mod.category === activeCategory;
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
      if (mod.id === "antrol") {
        try {
          await apiClient.post("/api/v1/fkrtl-antrol-sync", null, {
            params: { refresh: "true" },
          });
        } catch {
          // Fallback GET
          await apiClient.get("/api/v1/fkrtl-antrol-sync");
        }
        await queryClient.invalidateQueries({
          queryKey: ["fkrtl-antrol-stats"],
        });
        await queryClient.invalidateQueries({ queryKey: ["fkrtl-stats"] });
      } else if (mod.id === "fktp") {
        try {
          await apiClient.post("/api/v1/fktp-antrol-sync");
        } catch {
          await apiClient.get("/api/v1/fktp-antrol-sync");
        }
        await queryClient.invalidateQueries({
          queryKey: ["fktp-antrol-stats"],
        });
      } else {
        // FKRTL 9 Tab Kepatuhan
        try {
          await apiClient.post("/api/v1/fkrtl-kepatuhan-sync", null, {
            params: { module: mod.id },
          });
        } catch {
          await apiClient.get(`/api/v1/fkrtl-kepatuhan-sync?module=${mod.id}`);
        }
        // Invalidate specific query
        await queryClient.invalidateQueries({
          queryKey: [`fkrtl-kepatuhan-${mod.id}`],
        });
        if (mod.id === "ringkasan") {
          await queryClient.invalidateQueries({
            queryKey: ["fkrtl-kepatuhan-ringkasan"],
          });
        }
      }

      // Update syncStore
      setSyncModule(mod.id, nowTime);

      // Audit Log Success

      showToast(
        `Pembaruan data "${mod.shortName}" berhasil diperbarui ke: ${nowTime}`,
        "success",
      );
    } catch (err: any) {
      console.error(`Gagal sinkronisasi modul ${mod.id}:`, err);

      // Audit Log Failed

      showToast(
        `Terjadi kendala jaringan saat menyinkronkan "${mod.shortName}". Data terakhir tetap ditampilkan.`,
        "error",
      );
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
      const results = await Promise.allSettled([
        apiClient.post("/api/v1/fkrtl-kepatuhan-sync", null, {
          params: { module: "all" },
        }),
        apiClient.post("/api/v1/fkrtl-antrol-sync", null, {
          params: { refresh: "true" },
        }),
        apiClient.post("/api/v1/fktp-antrol-sync"),
      ]);
      const successfulModules = MODULES_REGISTRY.filter((mod) => {
        const group =
          mod.category === "FKRTL_KEPATUHAN"
            ? 0
            : mod.category === "FKRTL_ANTROL"
              ? 1
              : 2;
        return results[group].status === "fulfilled";
      });
      successfulModules.forEach((mod) => setSyncModule(mod.id, nowTime));
      if (successfulModules.length > 0) await queryClient.invalidateQueries();
      const failedCount = MODULES_REGISTRY.length - successfulModules.length;
      const message =
        failedCount === 0
          ? `Sukses! Seluruh 11 modul capaian berhasil disinkronkan serentak: ${nowTime}`
          : `Sinkronisasi: ${successfulModules.length} modul berhasil, ${failedCount} modul gagal. Data terakhir modul yang gagal tetap ditampilkan. Silakan coba lagi.`;
      showToast(message, failedCount === 0 ? "success" : "error");
    } catch (err: any) {
      console.error("Gagal master sync:", err);


      showToast(
        "Sinkronisasi gagal. Data terakhir tetap ditampilkan. Silakan coba lagi.",
        "error",
      );
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
      "No",
      "Kategori",
      "Nama Modul Indikator",
      "Target Capaian",
      "Bobot",
      "Spreadsheet ID",
      "Sheet / Sumber",
      "Cakupan Wilayah",
      "Stempel Waktu Terakhir (Last Update)",
      "Sumber Data",
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
      "TERHUBUNG (LIVE)",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `rekap-integrasi-sapa-yanfaskes-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(
      "Berkas rekapitulasi status integrasi berhasil diunduh dalam format CSV.",
    );
  };

  return (
    <Stack
      spacing={3}
      sx={{ minWidth: 0 }}
      className="sapa-page min-w-0 space-y-6 max-w-7xl mx-auto pb-12"
    >
      {/* Toast Alert */}
      {toastMessage && (
        <div
          role={toastMessage.type === "error" ? "alert" : "status"}
          aria-live={toastMessage.type === "error" ? "assertive" : "polite"}
          className="sapa-admin-toast fixed top-6 right-6 z-50"
        >
          <div
            className={`px-5 py-3 rounded-2xl  flex items-center gap-3 border text-xs sm:text-sm font-bold ${
              toastMessage.type === "success"
                ? "bg-emerald-900/90 text-white border-emerald-500/50 "
                : "bg-[var(--danger-soft)] text-[var(--danger)] border-current"
            }`}
          >
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 1. EXECUTIVE HEADER BANNER (BPJS GREEN & BLUE THEME)               */}
      {/* ----------------------------------------------------------------- */}
      <Stack component="header" spacing={2}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}
        >
          <div>
            <Typography component="h1" variant="h3" className="sapa-page-title">
              Pembaruan data capaian
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.75 }}
            >
              Sinkronkan sumber data FKRTL dan FKTP, lalu periksa hasil
              pembaruan setiap modul.
            </Typography>
          </div>
          <Chip
            size="small"
            variant="outlined"
            label={MODULES_REGISTRY.length + " modul · Google Sheets"}
          />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Pembaruan terakhir: {lastUpdateAll}
        </Typography>
      </Stack>

      {/* ----------------------------------------------------------------- */}
      {/* 2. GLOBAL ACTION TOOLBAR (MASTER SYNC, EKSPOR, LIVE FILTER)       */}
      {/* ----------------------------------------------------------------- */}
      <MainCard
        content={false}
        sx={{ p: 2, minWidth: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        {/* Tombol Utama: Master Sync All */}
        <div className="flex flex-wrap items-center gap-3">
          <AnimatedButton
            onClick={handleMasterSyncAll}
            loading={isMasterSyncing}
            disabled={syncingModuleId !== null}
            className="sapa-button sapa-button-primary max-w-full h-auto whitespace-normal px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span className={isMasterSyncing ? "animate-spin" : ""}></span>
            <span>
              {isMasterSyncing
                ? "Sinkronisasi sedang berjalan..."
                : "Perbarui semua modul"}
            </span>
          </AnimatedButton>

          <AnimatedButton
            onClick={handleExportCsv}
            className="sapa-button sapa-button-secondary px-4 py-3 rounded-xl border text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>Ekspor Status (CSV)</span>
          </AnimatedButton>
        </div>

        {/* Live Search Bar */}
        <div className="relative w-full md:w-72">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--text-muted)]">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <TextField
            size="small"
            fullWidth
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari indikator atau ID..."
            sx={{ "& input": { pl: 4.5 }, minWidth: 0 }}
            slotProps={{
              htmlInput: { "aria-label": "Cari indikator atau ID..." },
            }}
          />
          {searchQuery && (
            <AnimatedButton
              onClick={() => setSearchQuery("")}
              className="sapa-button sapa-button-secondary absolute inset-y-0 right-0 pr-3 flex items-center"
              aria-label="Hapus pencarian"
            >
              Hapus
            </AnimatedButton>
          )}
        </div>
      </MainCard>

      {(isMasterSyncing || syncingModuleId !== null) && (
        <p role="status" className="sapa-admin-results">
          Pembaruan sedang berlangsung. Status setiap modul akan diperbarui
          setelah sumber data merespons.
        </p>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 3. SEGMENTED CATEGORY TABS                                        */}
      {/* ----------------------------------------------------------------- */}
      <Tabs
        value={activeCategory}
        onChange={(_, value) => setActiveCategory(value)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Kategori modul"
      >
        <Tab value="ALL" label="Semua modul" />
        <Tab value="FKRTL_KEPATUHAN" label="Kepatuhan FKRTL" />
        <Tab value="FKRTL_ANTROL" label="Antrol FKRTL" />
        <Tab value="FKTP_ANTROL" label="Antrol FKTP" />
      </Tabs>

      {/* ----------------------------------------------------------------- */}
      {/* 4. GRID KARTU MODUL INTEGRASI & PEMBARUAN DATA                    */}
      {/* ----------------------------------------------------------------- */}
      <p className="sapa-admin-results" role="status">
        Menampilkan {filteredModules.length} dari {MODULES_REGISTRY.length}{" "}
        modul
      </p>
      {filteredModules.length === 0 ? (
        <MainCard
          content={false}
          sx={{ p: 6, minWidth: 0 }}
          className="sapa-admin-empty text-center space-y-3"
        >
          <Typography
            component="h3"
            variant="h5"
            className="text-base font-bold text-[var(--text-main)]"
          >
            Modul Tidak Ditemukan
          </Typography>
          <p className="text-xs text-[var(--text-muted)]">
            Tidak ada modul capaian yang cocok dengan kata kunci &quot;
            {searchQuery}&quot;. Coba reset filter atau kata kunci Anda.
          </p>
          <AnimatedButton
            onClick={() => {
              setSearchQuery("");
              setActiveCategory("ALL");
            }}
            className="sapa-button sapa-button-secondary px-4 py-2 rounded-xl text-xs font-bold transition-colors"
          >
            Reset Pencarian
          </AnimatedButton>
        </MainCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredModules.map((mod) => {
            const isSyncing = syncingModuleId === mod.id || isMasterSyncing;
            const currentLastUpdate = getModuleLastUpdate(mod.id);

            return (
              <MainCard
                content={false}
                sx={{ p: 0, minWidth: 0 }}
                key={mod.id}
                className="transition-colors flex flex-col justify-between overflow-hidden group"
              >
                {/* Header Kartu */}
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                          {mod.categoryLabel}
                        </span>
                        <Typography
                          component="h3"
                          variant="h5"
                          className="text-sm font-bold text-[var(--text-main)] leading-snug group-hover:text-[var(--text-main)] transition-colors"
                        >
                          {mod.shortName}
                        </Typography>
                      </div>
                    </div>

                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--panel-bg)] text-[var(--text-main)] border border-[var(--border-color)] shrink-0">
                      {mod.weight}
                    </span>
                  </div>

                  {/* Deskripsi & Target */}
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {mod.description}
                  </p>

                  <div className="pt-2 border-t border-[var(--border-color)] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)] text-[11px]">
                        Target Nasional:
                      </span>
                      <span className="font-bold text-[var(--text-main)]">
                        {mod.targetMetric}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)] text-[11px]">
                        Cakupan:
                      </span>
                      <span
                        className="font-medium text-[var(--text-main)] text-[11px] truncate max-w-[170px]"
                        title={mod.coverage}
                      >
                        {mod.coverage}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)] text-[11px]">
                        Spreadsheet ID:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="font-mono text-[10px] text-[var(--text-muted)] truncate max-w-[120px]"
                          title={mod.spreadsheetId}
                        >
                          {mod.spreadsheetId.slice(0, 8)}...
                          {mod.spreadsheetId.slice(-4)}
                        </span>
                        <AnimatedButton
                          onClick={() =>
                            handleCopyId(mod.spreadsheetId, mod.shortName)
                          }
                          title="Salin ID Spreadsheet"
                          className="sapa-button sapa-button-secondary text-[10px] hover:underline cursor-pointer"
                          aria-label="Salin ID Spreadsheet"
                        >
                          {copiedId === mod.spreadsheetId
                            ? "Tersalin"
                            : "Salin"}
                        </AnimatedButton>
                      </div>
                    </div>

                    {/* Badge Last Update */}
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--panel-bg)] text-[var(--text-main)] text-xs font-bold border border-[var(--border-color)] w-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--panel-bg)]" />
                      <span className="text-[11px] font-mono">
                        Pembaruan: {currentLastUpdate}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Kartu & Tombol Aksi */}
                <div className="p-4 bg-[var(--panel-bg)] border-t border-[var(--border-color)] flex items-center justify-between gap-2">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${mod.spreadsheetId}/edit`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--panel-bg)] border border-transparent hover:border-[var(--border-color)] transition-all flex items-center gap-1.5"
                  >
                    <span>Buka sumber</span>
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>

                  <AnimatedButton
                    onClick={() => handleSyncSingleModule(mod)}
                    loading={isSyncing}
                    disabled={
                      syncingModuleId !== null && syncingModuleId !== mod.id
                    }
                    className="sapa-button sapa-button-secondary px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span className={isSyncing ? "animate-spin" : ""}></span>
                    <span>{isSyncing ? "Memproses..." : "Perbarui Data"}</span>
                  </AnimatedButton>
                </div>
              </MainCard>
            );
          })}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 5. PANDUAN INTEGRASI & PROTOKOL DATA                              */}
      {/* ----------------------------------------------------------------- */}
      <MainCard
        content={false}
        sx={{ p: 3, minWidth: 0 }}
        className="space-y-4"
      >
        <div className="flex items-center gap-3 pb-3 border-b border-[var(--border-color)]">
          <div className="w-9 h-9 rounded-xl bg-[var(--panel-bg)] text-[var(--text-main)] flex items-center justify-center font-bold text-lg"></div>
          <div>
            <Typography
              component="h3"
              variant="h5"
              className="text-sm sm:text-base font-bold text-[var(--text-main)]"
            >
              Panduan Pembaruan Data Capaian (SAPA YANFASKES)
            </Typography>
            <p className="text-xs text-[var(--text-muted)]">
              Standar Operasional Prosedur (SOP) integrasi data Google
              Spreadsheet resmi BPJS Kesehatan Kantor Cabang Jember.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[var(--text-muted)] leading-relaxed pt-2">
          <MainCard
            content={false}
            sx={{ p: 2, minWidth: 0 }}
            className="space-y-1.5"
          >
            <span className="font-bold text-[var(--text-main)] block text-xs">
              1. Frekuensi Pembaruan
            </span>
            <p>
              Data capaian ditarik secara harian dan bulanan langsung dari
              subfolder Google Drive resmi. Tombol{" "}
              <strong>Perbarui Data</strong> akan menghapus cache lokal seketika
              dan mengambil baris rekaman data paling mutakhir dari Google
              Sheets.
            </p>
          </MainCard>

          <MainCard
            content={false}
            sx={{ p: 2, minWidth: 0 }}
            className="space-y-1.5"
          >
            <span className="font-bold text-[var(--text-main)] block text-xs">
              2. Relasi &amp; Validasi Faskes
            </span>
            <p>
              Seluruh data kepatuhan dihubungkan secara relasional dengan master
              referensi faskes (`ref_fkrtl`) berdasarkan kolom{" "}
              <code>kode_ppk</code> untuk mencegah anomali atau data rumah sakit
              di luar wilayah kerja KC Jember.
            </p>
          </MainCard>

          <MainCard
            content={false}
            sx={{ p: 2, minWidth: 0 }}
            className="space-y-1.5"
          >
            <span className="font-bold text-[var(--text-main)] block text-xs">
              3. Jejak Audit &amp; Keamanan
            </span>
            <p>
              Setiap pembaruan data yang dieksekusi pengguna dicatat secara
              real-time ke dalam modul <strong>Logs (Audit Trail)</strong>{" "}
              mencakup stempel waktu, identitas akun pelaksana, modul target,
              dan status keberhasilan.
            </p>
          </MainCard>
        </div>
      </MainCard>
    </Stack>
  );
};
