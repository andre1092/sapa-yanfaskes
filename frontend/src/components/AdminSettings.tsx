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
import { apiClient } from "../lib/apiClient";
import { useUserStore } from "../store/userStore";
import { useSession } from "../auth/useSession";

type SettingsTab = "profile";

export const AdminSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const { mode } = useSession();
  const [toastMessage, setToastMessage] = useState<string | null>(null);


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
              Kelola profil akun.
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
              {mode === "bff"
                ? "Kata sandi akun tidak diubah dari halaman ini. Ubah kata sandi lewat menu Pengaturan akun."
                : "Kata sandi akun tidak diubah dari halaman ini. Gunakan layanan masuk atau hubungi administrator."}
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
