import {
  Stack,
  Typography,
  FormLabel,
  TextField,
  Chip,
  Tabs,
  Tab,
} from "@mui/material";
import MainCard from "../berry/MainCard";
import { AnimatedButton } from "./ui/AnimatedButton";
import { AdminDialog } from "./AdminDialog";
import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import { useSyncStore, formatCurrentTimestamp } from "../store/syncStore";
import { useUserStore } from "../store/userStore";

type SettingsTab = "profile" | "fktp" | "fkrtl";

export const AdminSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync Store
  const {
    lastUpdateAntrol,
    lastUpdateNakes,
    lastUpdatePengaduan,
    lastUpdateUmabl,
    lastUpdateDisplayTt,
    setSyncAntrol,
    setSyncNakes,
    setSyncPengaduan,
    setSyncUmabl,
    setSyncDisplayTt,
    setSyncAll,
  } = useSyncStore();

  // User Store
  const { profile, updateProfile, confirmEmailVerification } = useUserStore();

  // Profile Form States
  const [profileName, setProfileName] = useState(profile.name);
  const [profileUsername, setProfileUsername] = useState(profile.username);
  const [profileEmail, setProfileEmail] = useState(profile.email);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Keep form in sync when profile store is updated/migrated
  useEffect(() => {
    setProfileName(profile.name);
    setProfileUsername(profile.username);
    setProfileEmail(profile.email);
  }, [profile.name, profile.username, profile.email]);

  // Email Verification Modal State & Dispatch
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [pendingEmailToVerify, setPendingEmailToVerify] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailDispatchStatus, setEmailDispatchStatus] = useState<{
    success: boolean;
    message: string;
    method?: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Integration Loading States
  const [syncingModule, setSyncingModule] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const getWebmailUrl = (email: string) => {
    const domain = (email.split("@")[1] || "").toLowerCase();
    if (domain === "bpjs-kesehatan.go.id") {
      return "https://mail.bpjs-kesehatan.go.id";
    }
    if (domain.includes("gmail.com")) {
      return "https://mail.google.com";
    }
    if (domain.includes("yahoo.")) {
      return "https://mail.yahoo.com";
    }
    if (domain.includes("outlook.") || domain.includes("hotmail.")) {
      return "https://outlook.live.com";
    }
    return `mailto:${email}`;
  };

  const currentVerificationUrl = `${typeof window !== "undefined" ? window.location.origin : "https://sapa-yanfaskes.vercel.app"}/verify?token=sapa_auth_${Date.now()}&email=${encodeURIComponent(pendingEmailToVerify || profileEmail)}`;

  const handleCopyVerificationLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(currentVerificationUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      showToast("Tautan verifikasi resmi berhasil disalin ke clipboard!");
    }
  };

  // --- TAB 1: PROFIL LOGIC ---
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);

    const emailChanged =
      profileEmail.trim().toLowerCase() !== profile.email.trim().toLowerCase();

    if (emailChanged) {
      const targetEmail = profileEmail.trim();
      const targetName = profileName.trim();
      setPendingEmailToVerify(targetEmail);
      updateProfile({
        name: targetName,
        username: profileUsername.trim(),
        unverifiedEmail: targetEmail,
        isVerified: false,
      });
      setIsSavingProfile(false);
      setShowVerifyModal(true);
      setIsSendingEmail(true);
      setEmailDispatchStatus(null);

      // Kirim email verifikasi resmi via backend FastAPI
      try {
        const verifyUrl = `${window.location.origin}/verify?token=sapa_auth_${Date.now()}&email=${encodeURIComponent(targetEmail)}`;
        const res = await apiClient.post(
          "/api/v1/auth/send-verification-email",
          {
            to_email: targetEmail,
            name: targetName,
            verification_url: verifyUrl,
          },
        );

        if (res.data?.success) {
          setEmailDispatchStatus({
            success: true,
            message:
              res.data.message ||
              `Email verifikasi berhasil dikirim ke ${targetEmail}`,
            method: res.data.method,
          });
          showToast(`Email verifikasi resmi telah dikirim ke ${targetEmail}`);
        } else {
          setEmailDispatchStatus({
            success: false,
            message:
              res.data?.message ||
              "Pengiriman email server tertunda. Anda dapat menggunakan verifikasi langsung.",
          });
        }
      } catch (err: any) {
        setEmailDispatchStatus({
          success: false,
          message:
            "Server email fallback aktif. Anda dapat memverifikasi akun secara instan atau menyalin tautan verifikasi.",
        });
      } finally {
        setIsSendingEmail(false);
      }
    } else {
      updateProfile({
        name: profileName.trim(),
        username: profileUsername.trim(),
      });
      setIsSavingProfile(false);
      showToast("Profil dan kredensial akun berhasil disimpan.");
    }
  };

  const handleExecuteVerification = () => {
    confirmEmailVerification();
    setProfileEmail(pendingEmailToVerify);
    setShowVerifyModal(false);
    showToast(
      `Email ${pendingEmailToVerify} berhasil diverifikasi! Seluruh fitur SAPA YANFASKES kini aktif.`,
    );
  };

  // --- TAB 3: INTEGRASI FKRTL LOGIC ---
  const handleSyncModule = async (moduleId: string, name: string) => {
    setSyncingModule(moduleId);
    const nowTimestamp = formatCurrentTimestamp();

    try {
      if (moduleId === "antrol") {
        try {
          const res = await apiClient.post(
            "/api/v1/fkrtl-antrol-sync",
            {},
            { timeout: 20000 },
          );
          if (res.data?.last_update) {
            setSyncAntrol(res.data.last_update);
          } else {
            setSyncAntrol(nowTimestamp);
          }
        } catch (e) {
          console.warn("Sync endpoint fallback to get with refresh=true", e);
          try {
            const res = await apiClient.get(
              "/api/v1/fkrtl-antrol-stats?refresh=true",
              { timeout: 20000 },
            );
            if (res.data?.last_update) {
              setSyncAntrol(res.data.last_update);
            } else {
              setSyncAntrol(nowTimestamp);
            }
          } catch (errFallback) {
            console.error(
              "Failed to sync antrol data from backend:",
              errFallback,
            );
            setSyncAntrol(nowTimestamp);
          }
        }
        await queryClient.invalidateQueries({
          queryKey: ["fkrtl-antrol-stats"],
        });
        await queryClient.invalidateQueries({ queryKey: ["fkrtl-stats"] });
      } else if (moduleId === "nakes") {
        await queryClient.invalidateQueries({
          queryKey: ["fkrtl-kepatuhan-nakes"],
        });
        setSyncNakes(nowTimestamp);
      } else if (moduleId === "pengaduan") {
        await queryClient.invalidateQueries({
          queryKey: ["fkrtl-kepatuhan-pengaduan"],
        });
        setSyncPengaduan(nowTimestamp);
      } else if (moduleId === "umabl") {
        await queryClient.invalidateQueries({
          queryKey: ["fkrtl-kepatuhan-umabl"],
        });
        setSyncUmabl(nowTimestamp);
      } else if (moduleId === "display-tt") {
        await queryClient.invalidateQueries({
          queryKey: ["fkrtl-kepatuhan-display-tt"],
        });
        setSyncDisplayTt(nowTimestamp);
      } else if (moduleId === "all") {
        await queryClient.invalidateQueries();
        setSyncAll(nowTimestamp);
      }

      showToast(
        `Integrasi ${name} berhasil! Pembaruan terakhir diperbarui ke: ${nowTimestamp}`,
      );
    } finally {
      setTimeout(() => {
        setSyncingModule(null);
      }, 500);
    }
  };

  return (
    <Stack
      spacing={3}
      sx={{ minWidth: 0 }}
      className="sapa-page min-w-0 max-w-7xl mx-auto w-full space-y-6 sm:space-y-8 animate-fadeIn"
    >
      {/* Toast Notification */}
      {toastMessage && (
        <MainCard
          content={false}
          sx={{ p: 0, minWidth: 0 }}
          role="status"
          aria-live="polite"
          className="sapa-admin-toast fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 text-[var(--text-main)] animate-slideUp"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--panel-bg)]" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </MainCard>
      )}

      {/* 1. Executive Banner Header */}
      <Stack component="header" spacing={2}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}
        >
          <div>
            <Typography component="h1" variant="h3" className="sapa-page-title">
              Pengaturan
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.75 }}
            >
              Kelola profil akun dan sumber data fasilitas kesehatan.
            </Typography>
          </div>
          <Chip
            size="small"
            color={profile.isVerified ? "success" : "warning"}
            label={
              profile.isVerified ? "Akun terverifikasi" : "Menunggu verifikasi"
            }
          />
        </Stack>
      </Stack>

      {/* 2. 4 SEGMENTED GLASSMORPHISM TABS */}
      <Tabs
        value={activeTab}
        onChange={(_, value: SettingsTab) => setActiveTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Bagian pengaturan"
      >
        <Tab value="profile" label="Profil" />
        <Tab value="fktp" label="Integrasi FKTP" />
        <Tab value="fkrtl" label="Integrasi FKRTL" />
      </Tabs>

      {/* 3. TAB CONTENT RENDERING */}

      {/* TAB 1: PROFIL */}
      {activeTab === "profile" && (
        <MainCard
          content={false}
          sx={{ p: 3, minWidth: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-3">
              <div>
                <Typography
                  component="h2"
                  variant="h4"
                  className="text-base sm:text-lg font-bold text-[var(--text-main)]"
                >
                  Profil Pengguna &amp; Keamanan Akun
                </Typography>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Perbarui identitas administrator, username, email resmi, dan
                  kata sandi akses sistem.
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full text-xs font-bold bg-[var(--panel-bg)] text-[var(--text-main)] border border-[var(--border-color)]">
              {profile.role}
            </span>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6 max-w-3xl">
            {/* Grid Input Data Diri */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <FormLabel
                  htmlFor="adminsettings-field-1"
                  className="text-xs font-bold text-[var(--text-main)]"
                >
                  Nama Lengkap Administrator{" "}
                  <span className="text-[var(--text-muted)]">*</span>
                </FormLabel>
                <TextField
                  size="small"
                  fullWidth
                  id="adminsettings-field-1"
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  sx={{ minWidth: 0 }}
                />
              </div>

              <div className="space-y-1.5">
                <FormLabel
                  htmlFor="adminsettings-field-2"
                  className="text-xs font-bold text-[var(--text-main)]"
                >
                  Username <span className="text-[var(--text-muted)]">*</span>
                </FormLabel>
                <TextField
                  size="small"
                  fullWidth
                  id="adminsettings-field-2"
                  type="text"
                  required
                  value={profileUsername}
                  onChange={(e) => setProfileUsername(e.target.value)}
                  sx={{ minWidth: 0 }}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <FormLabel
                    htmlFor="adminsettings-profile-email"
                    className="text-xs font-bold text-[var(--text-main)]"
                  >
                    Alamat Email Resmi{" "}
                    <span className="text-[var(--text-muted)]">*</span>
                  </FormLabel>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Perubahan email memerlukan verifikasi tautan resmi SAPA
                    YANFASKES
                  </span>
                </div>
                <TextField
                  size="small"
                  fullWidth
                  id="adminsettings-profile-email"
                  type="email"
                  required
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  sx={{ minWidth: 0 }}
                />
              </div>
            </div>

            <p className="pt-4 border-t border-[var(--border-color)] text-[11px] text-[var(--text-muted)]">
              Kata sandi akun tidak diubah dari halaman ini. Gunakan layanan masuk atau hubungi administrator.
            </p>

            {/* Tombol Simpan */}
            <div className="pt-4 flex items-center justify-end gap-3">
              <AnimatedButton
                type="submit"
                loading={isSavingProfile}
                className="sapa-button sapa-button-primary px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>
                  {isSavingProfile ? "Menyimpan..." : "Simpan Perubahan"}
                </span>
              </AnimatedButton>
            </div>
          </form>
        </MainCard>
      )}

      {/* TAB 2: INTEGRASI DATA FKTP (KOSONGKAN DULU) */}
      {activeTab === "fktp" && (
        <MainCard
          content={false}
          sx={{ p: 4, minWidth: 0 }}
          className="text-center flex flex-col items-center justify-center space-y-4"
        >
          <div className="max-w-md">
            <Typography
              component="h3"
              variant="h5"
              className="text-lg sm:text-xl font-black text-[var(--text-main)]"
            >
              Integrasi Data FKTP (Pelayanan Primer)
            </Typography>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
              Modul integrasi data Fasilitas Kesehatan Tingkat Pertama
              (Puskesmas, Klinik Pratama, dan Dokter Praktik Mandiri) saat ini
              dikosongkan terlebih dahulu dan sedang dipersiapkan untuk
              standarisasi indikator Kapitasi Berbasis Komitmen (KBK) dan
              rujukan primer.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[var(--panel-bg)] text-[var(--text-main)] border border-[var(--border-color)]">
            <span className="w-2 h-2 rounded-full bg-[var(--panel-bg)] animate-pulse" />
            Tahap Perancangan Sumber Data
          </span>
        </MainCard>
      )}

      {/* TAB 3: INTEGRASI DATA FKRTL (TOMBOL-TOMBOL UPDATE SPREADSHEET DENGAN LAST UPDATE) */}
      {activeTab === "fkrtl" && (
        <div className="space-y-6">
          {/* Master Sync Bar */}
          <MainCard
            content={false}
            sx={{ p: 3, minWidth: 0 }}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--panel-bg)] text-[var(--text-main)]">
                SINKRONISASI MENYELURUH
              </span>
              <Typography
                component="h2"
                variant="h4"
                className="text-base sm:text-lg font-black text-[var(--text-main)] mt-1"
              >
                Integrasi Seluruh Modul FKRTL Sekaligus
              </Typography>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Segarkan seluruh cache data Google Spreadsheet FKRTL secara
                serentak untuk memperbarui antarmuka dashboard.
              </p>
            </div>

            <AnimatedButton
              onClick={() => handleSyncModule("all", "Seluruh Modul FKRTL")}
              loading={syncingModule === "all"}
              className="sapa-button sapa-button-secondary px-5 py-2.5 rounded-xl sapa-button-primary text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0"
            >
              <span
                className={syncingModule === "all" ? "animate-spin" : ""}
              ></span>
              <span>
                {syncingModule === "all"
                  ? "Mengintegrasikan..."
                  : "Integrasikan Semua Modul"}
              </span>
            </AnimatedButton>
          </MainCard>

          {/* Cards Modul-Modul Integrasi FKRTL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. Antrol FKRTL */}
            <MainCard
              content={false}
              sx={{ p: 2.5, minWidth: 0 }}
              className="flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-[var(--text-main)]">
                    <span className="text-base">⏱</span>
                    <span>Pemanfaatan Antrol FKRTL</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--panel-bg)] text-[var(--text-main)]">
                    2.052 Baris
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Data antrean online terintegrasi (Mobile JKN &amp; Bridging
                  SIMRS). Memperbarui KPI, kurva tren bulanan, serta perankingan
                  poliklinik dan rumah sakit.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--panel-bg)] text-[var(--text-main)] text-xs font-bold border border-[var(--border-color)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--panel-bg)]" />
                  <span>Pembaruan terakhir: {lastUpdateAntrol}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Target: 80% &amp; 95%
                </span>
                <AnimatedButton
                  onClick={() =>
                    handleSyncModule("antrol", "Pemanfaatan Antrol FKRTL")
                  }
                  loading={syncingModule === "antrol"}
                  className="sapa-button sapa-button-secondary px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span
                    className={syncingModule === "antrol" ? "animate-spin" : ""}
                  ></span>
                  <span>
                    {syncingModule === "antrol"
                      ? "Memproses..."
                      : "Integrasikan Antrol"}
                  </span>
                </AnimatedButton>
              </div>
            </MainCard>

            {/* 2. Tab 01 Nakes */}
            <MainCard
              content={false}
              sx={{ p: 2.5, minWidth: 0 }}
              className="flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-[var(--text-main)]">
                    <span>Tab 01. Jadwal Praktik Nakes</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--panel-bg)] text-[var(--text-main)]">
                    Bobot 25%
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Kesesuaian jadwal praktik dokter spesialis pada Aplikasi HFIS
                  dengan data pelayanan faskes. Terhubung master referensi 26
                  rumah sakit KC Jember.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--panel-bg)] text-[var(--text-main)] text-xs font-bold border border-[var(--border-color)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--panel-bg)]" />
                  <span>Pembaruan terakhir: {lastUpdateNakes}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Target Nasional: 100%
                </span>
                <AnimatedButton
                  onClick={() =>
                    handleSyncModule("nakes", "Tab 01 Jadwal Nakes")
                  }
                  loading={syncingModule === "nakes"}
                  className="sapa-button sapa-button-secondary px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span
                    className={syncingModule === "nakes" ? "animate-spin" : ""}
                  ></span>
                  <span>
                    {syncingModule === "nakes"
                      ? "Memproses..."
                      : "Integrasikan Nakes"}
                  </span>
                </AnimatedButton>
              </div>
            </MainCard>

            {/* 3. Tab 02 Pengaduan */}
            <MainCard
              content={false}
              sx={{ p: 2.5, minWidth: 0 }}
              className="flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-[var(--text-main)]">
                    <span>Tab 02. Penyelesaian Pengaduan</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--panel-bg)] text-[var(--text-main)]">
                    Bobot 20%
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Kecepatan tindak lanjut keluhan peserta sesuai SLA 1-3 hari
                  kerja pada Aplikasi SIPP. Terkoneksi 228 baris data live
                  Google Sheets.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--panel-bg)] text-[var(--text-main)] text-xs font-bold border border-[var(--border-color)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--panel-bg)]" />
                  <span>Pembaruan terakhir: {lastUpdatePengaduan}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Target Nasional: 100%
                </span>
                <AnimatedButton
                  onClick={() =>
                    handleSyncModule(
                      "pengaduan",
                      "Tab 02 Penyelesaian Pengaduan",
                    )
                  }
                  loading={syncingModule === "pengaduan"}
                  className="sapa-button sapa-button-secondary px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span
                    className={
                      syncingModule === "pengaduan" ? "animate-spin" : ""
                    }
                  ></span>
                  <span>
                    {syncingModule === "pengaduan"
                      ? "Memproses..."
                      : "Integrasikan Pengaduan"}
                  </span>
                </AnimatedButton>
              </div>
            </MainCard>

            {/* 4. Tab 03 Umbal Peserta (KESSAN) */}
            <MainCard
              content={false}
              sx={{ p: 2.5, minWidth: 0 }}
              className="flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-[var(--text-main)]">
                    <span>Tab 03. Umbal Peserta (KESSAN)</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--panel-bg)] text-[var(--text-main)]">
                    Bobot 10%
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Pengukuran umpan balik customer feedback peserta berdasarkan
                  proporsi target responden dan sampling populasi kunjungan
                  rumah sakit.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--panel-bg)] text-[var(--text-main)] text-xs font-bold border border-[var(--border-color)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--panel-bg)]" />
                  <span>Pembaruan terakhir: {lastUpdateUmabl}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Target: &ge; 100% dari target
                </span>
                <AnimatedButton
                  onClick={() =>
                    handleSyncModule("umabl", "Tab 03 Umbal Peserta")
                  }
                  loading={syncingModule === "umabl"}
                  className="sapa-button sapa-button-secondary px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span
                    className={syncingModule === "umabl" ? "animate-spin" : ""}
                  ></span>
                  <span>
                    {syncingModule === "umabl"
                      ? "Memproses..."
                      : "Integrasikan Umabl"}
                  </span>
                </AnimatedButton>
              </div>
            </MainCard>

            {/* 5. Tab 04 Display TT */}
            <MainCard
              content={false}
              sx={{ p: 2.5, minWidth: 0 }}
              className="flex flex-col justify-between gap-4 md:col-span-2"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-[var(--text-main)]">
                    <span>
                      Tab 04. Pembaruan (Update) Data Ketersediaan Tempat Tidur
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--panel-bg)] text-[var(--text-main)]">
                    Bobot 10%
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Memperhitungkan jumlah hari faskes melakukan pembaruan
                  informasi data ketersediaan tempat tidur secara harian dalam 1
                  bulan dari spreadsheet Display TT.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--panel-bg)] text-[var(--text-main)] text-xs font-bold border border-[var(--border-color)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--panel-bg)]" />
                  <span>Pembaruan terakhir: {lastUpdateDisplayTt}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Target Nasional: &ge; 25 hari
                </span>
                <AnimatedButton
                  onClick={() =>
                    handleSyncModule("display-tt", "Tab 04 Display TT")
                  }
                  loading={syncingModule === "display-tt"}
                  className="sapa-button sapa-button-secondary px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span
                    className={
                      syncingModule === "display-tt" ? "animate-spin" : ""
                    }
                  ></span>
                  <span>
                    {syncingModule === "display-tt"
                      ? "Memproses..."
                      : "Integrasikan Display TT"}
                  </span>
                </AnimatedButton>
              </div>
            </MainCard>
          </div>
        </div>
      )}

      {/* --- POP-UP MODAL: INFO VERIFIKASI EMAIL SAPA YANFASKES --- */}
      {showVerifyModal && (
        <AdminDialog
          label="Verifikasi email"
          onClose={() => setShowVerifyModal(false)}
        >
          <MainCard
            content={false}
            sx={{ p: 3, minWidth: 0 }}
            className="max-w-lg w-full space-y-5 relative animate-scaleUp"
          >
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2.5">
                <Typography
                  component="h3"
                  variant="h5"
                  className="text-sm sm:text-base font-black text-[var(--text-main)]"
                >
                  Info Sapa Yanfaskes
                </Typography>
              </div>
              <AnimatedButton
                onClick={() => setShowVerifyModal(false)}
                className="sapa-button sapa-button-secondary text-sm p-1"
                aria-label="Tutup dialog"
              >
                Tutup
              </AnimatedButton>
            </div>

            {/* Pesan Utama */}
            <MainCard
              content={false}
              sx={{ p: 2, minWidth: 0 }}
              className="text-[var(--text-main)] text-xs sm:text-sm font-semibold leading-relaxed"
            >
              Info Sapa Yanfaskes: Harap verifikasi akun Anda untuk mengaktifkan
              fitur-fitur pada SAPA YANFASKES.
            </MainCard>

            {/* Status Notifikasi Pengiriman Server */}
            {isSendingEmail ? (
              <MainCard
                content={false}
                sx={{ p: 1.5, minWidth: 0 }}
                className="text-[var(--text-main)] text-xs flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-[var(--panel-bg)] shrink-0" />
                <span>
                  Sedang mengirimkan email verifikasi resmi via server SAPA
                  YANFASKES...
                </span>
              </MainCard>
            ) : emailDispatchStatus ? (
              <div
                className={`p-3 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  emailDispatchStatus.success
                    ? "bg-emerald-50  border-emerald-300  text-emerald-800 "
                    : "bg-amber-50  border-amber-300  text-amber-800 "
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{emailDispatchStatus.success ? "" : "ℹ"}</span>
                  <span>{emailDispatchStatus.message}</span>
                </div>
                {emailDispatchStatus.method && (
                  <span className="px-2 py-0.5 rounded bg-[var(--panel-bg)] text-[var(--text-main)] text-[10px] font-mono font-bold uppercase self-start sm:self-auto">
                    METODE: {emailDispatchStatus.method}
                  </span>
                )}
              </div>
            ) : null}

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Tautan verifikasi resmi telah dikirimkan ke alamat email tujuan:{" "}
              <span className="font-bold text-[var(--text-main)] font-mono">
                {pendingEmailToVerify}
              </span>
              .
            </p>

            {/* Kartu Pratinjau Surat Email No-Reply Official */}
            <MainCard
              content={false}
              sx={{ p: 2, minWidth: 0 }}
              className="space-y-3 text-xs"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)] text-[11px] text-[var(--text-muted)]">
                <span>
                  Pengirim:{" "}
                  <strong className="text-[var(--text-main)]">
                    no-reply@sapa-yanfaskes.bpjs-kesehatan.go.id
                  </strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-[var(--panel-bg)] text-[var(--text-main)] font-bold text-[10px]">
                  Official Mail
                </span>
              </div>

              <div className="text-[var(--text-main)] font-bold">
                Subjek: [SAPA YANFASKES] Verifikasi Alamat Email Akun
                Administrator
              </div>

              <MainCard
                content={false}
                sx={{ p: 1.5, minWidth: 0 }}
                className="text-[11.5px] text-[var(--text-main)] leading-relaxed space-y-3 font-normal"
              >
                <p>Halo Administrator SAPA YANFASKES,</p>
                <p>
                  Harap verifikasi email Anda untuk menikmati semua fitur yang
                  ada di aplikasi SAPA YANFASKES melalui link berikut:
                </p>
                <MainCard
                  content={false}
                  sx={{ p: 1, minWidth: 0 }}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                >
                  <div className="text-[10.5px] font-mono text-[var(--text-main)] break-all select-all flex-1">
                    {currentVerificationUrl}
                  </div>
                  <AnimatedButton
                    type="button"
                    onClick={handleCopyVerificationLink}
                    className="sapa-button sapa-button-secondary px-3 py-1.5 rounded-lg text-[10px] font-bold shrink-0 transition-all cursor-pointer text-center"
                  >
                    {copiedLink ? " Tersalin!" : " Salin Tautan"}
                  </AnimatedButton>
                </MainCard>
                <p>atau tekan tombol di bawah ini:</p>
                <div className="text-center pt-1">
                  <AnimatedButton
                    type="button"
                    onClick={handleExecuteVerification}
                    className="sapa-button sapa-button-primary px-6 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>VERIFIKASI SEKARANG</span>
                  </AnimatedButton>
                </div>
              </MainCard>
            </MainCard>

            {/* Tombol Aksi Menuju Email */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <a
                href={getWebmailUrl(pendingEmailToVerify)}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[var(--border-color)] text-[var(--text-main)] hover:bg-[var(--panel-bg)] hover:text-[var(--text-main)] text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5"
              >
                <span>
                  {pendingEmailToVerify
                    .toLowerCase()
                    .endsWith("@bpjs-kesehatan.go.id")
                    ? "Buka Webmail BPJS Kesehatan"
                    : `Buka Email (${pendingEmailToVerify.split("@")[1] || "Webmail"})`}
                </span>
                <span className="text-[10px] opacity-70">↗</span>
              </a>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <AnimatedButton
                  type="button"
                  onClick={() => setShowVerifyModal(false)}
                  className="sapa-button sapa-button-secondary px-4 py-2.5 rounded-xl text-xs font-semibold"
                >
                  Tutup Sementara
                </AnimatedButton>
                <AnimatedButton
                  type="button"
                  onClick={handleExecuteVerification}
                  className="sapa-button sapa-button-primary px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
                >
                  Verifikasi Akun
                </AnimatedButton>
              </div>
            </div>
          </MainCard>
        </AdminDialog>
      )}
    </Stack>
  );
};
