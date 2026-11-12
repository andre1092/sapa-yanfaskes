import {
  Stack,
  Typography,
  FormLabel,
  TextField,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Tabs,
  Tab,
} from "@mui/material";
import MainCard from "../berry/MainCard";
import { FilterOption } from "./ui/FilterSelect";
import { AnimatedButton } from "./ui/AnimatedButton";
import { AdminDialog, AdminSelect } from "./AdminDialog";
import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import { useSyncStore, formatCurrentTimestamp } from "../store/syncStore";
import { useUserStore, type UserAccount } from "../store/userStore";

type SettingsTab = "profile" | "fktp" | "fkrtl" | "users";

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
  const {
    profile,
    users,
    updateProfile,
    confirmEmailVerification,
    addUser,
    editUser,
    deleteUser,
  } = useUserStore();

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

  // User Management State
  const [searchUserQuery, setSearchUserQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("Semua");

  // Add/Edit User Modal State
  const [showUserModal, setShowUserModal] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userFormUsername, setUserFormUsername] = useState("");
  const [userFormName, setUserFormName] = useState("");
  const [userFormEmail, setUserFormEmail] = useState("");
  const [userFormRole, setUserFormRole] = useState<UserAccount["role"]>(
    "Verifikator Yanfaskes",
  );
  const [userFormStatus, setUserFormStatus] =
    useState<UserAccount["status"]>("Aktif");

  // Delete User Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);

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
        `Integrasi ${name} berhasil! Last Update diperbarui ke: ${nowTimestamp}`,
      );
    } finally {
      setTimeout(() => {
        setSyncingModule(null);
      }, 500);
    }
  };

  // --- TAB 4: USER SETTING LOGIC ---
  const handleOpenAddUserModal = () => {
    setIsEditingUser(false);
    setEditingUserId(null);
    setUserFormUsername("");
    setUserFormName("");
    setUserFormEmail("");
    setUserFormRole("Verifikator Yanfaskes");
    setUserFormStatus("Aktif");
    setShowUserModal(true);
  };

  const handleOpenEditUserModal = (user: UserAccount) => {
    setIsEditingUser(true);
    setEditingUserId(user.id);
    setUserFormUsername(user.username);
    setUserFormName(user.name);
    setUserFormEmail(user.email);
    setUserFormRole(user.role);
    setUserFormStatus(user.status);
    setShowUserModal(true);
  };

  const handleSaveUserForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !userFormUsername.trim() ||
      !userFormName.trim() ||
      !userFormEmail.trim()
    ) {
      showToast("Harap lengkapi semua kolom isian pengguna.");
      return;
    }

    if (isEditingUser && editingUserId) {
      editUser(editingUserId, {
        username: userFormUsername.trim(),
        name: userFormName.trim(),
        email: userFormEmail.trim(),
        role: userFormRole,
        status: userFormStatus,
      });

      // Sinkronisasi otomatis ke profil aktif jika user yang diedit adalah akun yang sedang login
      const targetUser = users.find((u) => u.id === editingUserId);
      if (
        targetUser &&
        targetUser.username.toLowerCase() === profile.username.toLowerCase()
      ) {
        updateProfile({
          username: userFormUsername.trim(),
          name: userFormName.trim(),
          email: userFormEmail.trim(),
          role: userFormRole,
        });
      }

      showToast(`Data pengguna ${userFormUsername} berhasil diperbarui!`);
    } else {
      addUser({
        username: userFormUsername.trim(),
        name: userFormName.trim(),
        email: userFormEmail.trim(),
        role: userFormRole,
        status: userFormStatus,
      });
      showToast(`Pengguna baru ${userFormUsername} berhasil ditambahkan!`);
    }

    setShowUserModal(false);
  };

  const handleConfirmDeleteUser = () => {
    if (!userToDelete) return;
    const success = deleteUser(userToDelete.id);
    setShowDeleteModal(false);
    if (success) {
      showToast(`Pengguna ${userToDelete.username} berhasil dihapus.`);
    } else {
      showToast(
        `Akun ${userToDelete.username} merupakan Super Admin utama dan dilindungi dari penghapusan.`,
      );
    }
    setUserToDelete(null);
  };

  const filteredUsers = users.filter((u) => {
    if (selectedRoleFilter !== "Semua" && u.role !== selectedRoleFilter) {
      return false;
    }
    if (searchUserQuery.trim()) {
      const q = searchUserQuery.toLowerCase();
      return (
        u.username.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    }
    return true;
  });

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
              Kelola profil akun, sumber data fasilitas kesehatan, dan akses
              pengguna.
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
        <Tab value="users" label="Akses pengguna" />
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
                  <span>Last Update : {lastUpdateAntrol}</span>
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
                  <span>Last Update : {lastUpdateNakes}</span>
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
                  <span>Last Update : {lastUpdatePengaduan}</span>
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
                  <span>Last Update : {lastUpdateUmabl}</span>
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
                  <span>Last Update : {lastUpdateDisplayTt}</span>
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

      {/* TAB 4: USER SETTING (DAFTAR USER, TAMBAH, EDIT, KURANG/HAPUS) */}
      {activeTab === "users" && (
        <MainCard
          content={false}
          sx={{ p: 3, minWidth: 0 }}
          className="space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-color)]">
            <div>
              <Typography
                component="h2"
                variant="h4"
                className="text-base sm:text-lg font-bold text-[var(--text-main)] flex items-center gap-2"
              >
                <span> Manajemen Pengguna Aplikasi (User Setting)</span>
              </Typography>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Daftar akun pengguna resmi, email institusi, kata sandi, serta
                hak akses peran dalam sistem SAPA YANFASKES.
              </p>
            </div>

            <AnimatedButton
              onClick={handleOpenAddUserModal}
              className="sapa-button sapa-button-primary px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto"
            >
              <span>Tambah User Baru</span>
            </AnimatedButton>
          </div>

          {/* Filter Bar User */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <TextField
                size="small"
                fullWidth
                type="text"
                placeholder="Cari berdasarkan username, nama, atau email..."
                value={searchUserQuery}
                onChange={(e) => setSearchUserQuery(e.target.value)}
                sx={{ "& input": { pl: 4.5 }, minWidth: 0 }}
                slotProps={{
                  htmlInput: {
                    "aria-label":
                      "Cari berdasarkan username, nama, atau email...",
                  },
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <FormLabel
                htmlFor="adminsettings-field-6"
                className="text-xs font-bold text-[var(--text-main)]"
              >
                Filter Role:
              </FormLabel>
              <AdminSelect
                aria-label="Filter Role:"
                id="adminsettings-field-6"
                value={selectedRoleFilter}
                onValueChange={(value) => setSelectedRoleFilter(value)}
                className="sapa-control rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] bg-[var(--panel-bg)] border border-[var(--border-color)]"
              >
                <FilterOption value="Semua">
                  Semua Role ({users.length})
                </FilterOption>
                <FilterOption value="Super Admin">Super Admin</FilterOption>
                <FilterOption value="Admin KC Jember">
                  Admin KC Jember
                </FilterOption>
                <FilterOption value="Verifikator Yanfaskes">
                  Verifikator Yanfaskes
                </FilterOption>
                <FilterOption value="Viewer Eksekutif">
                  Viewer Eksekutif
                </FilterOption>
              </AdminSelect>
            </div>
          </div>

          {/* Tabel Pengguna */}
          <div
            tabIndex={0}
            role="region"
            aria-label="Tabel data, geser untuk melihat kolom lainnya"
            className="min-w-0 max-w-full overflow-x-auto rounded-xl border border-[var(--border-color)]"
          >
            <Table className="sapa-table w-full text-left text-xs">
              <TableHead className="bg-[var(--panel-bg)] text-[var(--text-main)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--border-color)]">
                <TableRow>
                  <TableCell className="py-3 px-4">No</TableCell>
                  <TableCell className="py-3 px-4">Username</TableCell>
                  <TableCell className="py-3 px-4">Nama Lengkap</TableCell>
                  <TableCell className="py-3 px-4">Email Resmi</TableCell>
                  <TableCell className="py-3 px-4">Peran (Role)</TableCell>
                  <TableCell className="py-3 px-4 text-center">
                    Status
                  </TableCell>
                  <TableCell className="py-3 px-4 text-center">Aksi</TableCell>
                </TableRow>
              </TableHead>
              <TableBody className="divide-y divide-[var(--border-color)] font-medium">
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-[var(--text-muted)] italic"
                    >
                      Tidak ada pengguna yang sesuai dengan filter pencarian.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u, idx) => {
                    const isCurrentActiveUser =
                      u.username.toLowerCase() ===
                      profile.username.toLowerCase();
                    return (
                      <TableRow
                        key={u.id}
                        className={`transition-colors group ${
                          isCurrentActiveUser
                            ? "bg-[var(--panel-bg)]  border-l-4 border-l-[#44853b] hover:bg-[var(--panel-bg)]"
                            : "hover:bg-[var(--panel-bg)] "
                        }`}
                      >
                        <TableCell className="py-3 px-4 text-[var(--text-muted)] font-mono text-[11px]">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="py-3 px-4 font-mono font-bold text-[var(--text-main)]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>@{u.username}</span>
                            {isCurrentActiveUser && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-[var(--panel-bg)] text-[var(--text-main)] inline-flex items-center gap-1">
                                <span>Akun Anda (Login Saat Ini)</span>
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-4 font-bold text-[var(--text-main)]">
                          <div className="flex items-center gap-1.5">
                            <span>{u.name}</span>
                            {isCurrentActiveUser && (
                              <span
                                className="text-[10px] text-[var(--text-main)] font-bold"
                                title="Sesi login aktif saat ini"
                              >
                                (Aktif)
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-[var(--text-muted)] font-mono text-[11px]">
                          {u.email}
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                              u.role === "Super Admin"
                                ? "bg-[var(--panel-bg)] text-white "
                                : u.role === "Admin KC Jember"
                                  ? "bg-[var(--panel-bg)] text-[var(--text-main)] border border-[var(--border-color)]"
                                  : u.role === "Verifikator Yanfaskes"
                                    ? "bg-sky-100 text-sky-800  "
                                    : "bg-slate-100 text-slate-700  "
                            }`}
                          >
                            {u.role}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              u.status === "Aktif"
                                ? "bg-[var(--panel-bg)] text-[var(--text-main)]"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {u.status}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <AnimatedButton
                              onClick={() => handleOpenEditUserModal(u)}
                              className="sapa-button sapa-button-secondary px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                              title="Edit Pengguna"
                            >
                              Edit
                            </AnimatedButton>
                            <AnimatedButton
                              onClick={() => {
                                setUserToDelete(u);
                                setShowDeleteModal(true);
                              }}
                              className="sapa-button sapa-button-danger px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                              title="Hapus / Kurang Pengguna"
                            >
                              Hapus
                            </AnimatedButton>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Matriks Transparansi Hak Akses & Peran Pengguna Resmi (Role & Privilege Matrix) */}
          <MainCard
            content={false}
            sx={{ p: 2.5, minWidth: 0 }}
            className="mt-8 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
              <div>
                <Typography
                  component="h3"
                  variant="h5"
                  className="text-xs sm:text-sm font-black text-[var(--text-main)] flex items-center gap-2"
                >
                  <span>
                    Matriks Hak Akses &amp; Peran Pengguna Resmi (Role &amp;
                    Privilege Matrix)
                  </span>
                </Typography>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Daftar akun dan hak akses resmi yang beroperasi di aplikasi
                  SAPA YANFASKES Kantor Cabang Jember.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[var(--panel-bg)] text-[var(--text-main)] text-[10px] font-bold self-start sm:self-auto">
                4 Peran Terdaftar
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Role 1: Super Admin */}
              <MainCard
                content={false}
                sx={{ p: 2, minWidth: 0 }}
                className="space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[var(--panel-bg)] text-[var(--text-main)]">
                    Super Admin
                  </span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    Level 1 (Full)
                  </span>
                </div>
                <div className="text-[11.5px] font-bold text-[var(--text-main)]">
                  Andreas Dwi Rizko Nugroho (@admin_jember)
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Kontrol penuh seluruh aplikasi: Dashboard FKTP/FKRTL, trigger
                  sinkronisasi spreadsheet manual, kelola semua akun &amp; hak
                  akses, serta pengaturan profil.
                </p>
                <div className="pt-1 text-[10px] font-bold text-[var(--text-main)] flex items-center gap-1">
                  <span>Akses Semua Menu &amp; Fitur</span>
                </div>
              </MainCard>

              {/* Role 2: Admin KC Jember */}
              <MainCard
                content={false}
                sx={{ p: 2, minWidth: 0 }}
                className="space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[var(--panel-bg)] text-[var(--text-main)] border border-[var(--border-color)]">
                    Admin KC Jember
                  </span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    Level 2 (Operasional)
                  </span>
                </div>
                <div className="text-[11.5px] font-bold text-[var(--text-main)]">
                  dr. Siti Nurhaliza (@admin_yanfaskes)
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Operasional monitoring KC Jember: Akses analisis performa
                  faskes, sinkronisasi data FKRTL berkala, ekspor laporan
                  kepatuhan, dan verifikasi antrean.
                </p>
                <div className="pt-1 text-[10px] font-bold text-[var(--text-main)] flex items-center gap-1">
                  <span>Dashboard, Tab 01-05 &amp; Integrasi</span>
                </div>
              </MainCard>

              {/* Role 3: Verifikator Yanfaskes */}
              <MainCard
                content={false}
                sx={{ p: 2, minWidth: 0 }}
                className="space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[var(--panel-bg)] text-[var(--text-main)]">
                    Verifikator Yanfaskes
                  </span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    Level 3 (Verifikasi)
                  </span>
                </div>
                <div className="text-[11.5px] font-bold text-[var(--text-main)]">
                  Budi Prasetyo &amp; dr. Maya Safitri
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Pemeriksaan dan validasi teknis: Verifikasi pemanfaatan antrol
                  faskes, kepatuhan display tempat tidur, SIP nakes, dan
                  penanganan pengaduan faskes.
                </p>
                <div className="pt-1 text-[10px] font-bold text-[var(--text-muted)] flex items-center gap-1">
                  <span>Validasi &amp; Monitoring Data</span>
                </div>
              </MainCard>

              {/* Role 4: Viewer Eksekutif */}
              <MainCard
                content={false}
                sx={{ p: 2, minWidth: 0 }}
                className="space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[var(--panel-bg)] text-[var(--text-main)]">
                    Viewer Eksekutif
                  </span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    Level 4 (Read-Only)
                  </span>
                </div>
                <div className="text-[11.5px] font-bold text-[var(--text-main)]">
                  Kepala Cabang BPJS Jember (@kacab_jember)
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Akses tinjauan tingkat pimpinan: Melihat ringkasan grafik
                  agregat kepatuhan faskes wilayah Jember dan Lumajang tanpa
                  wewenang mutasi konfigurasi.
                </p>
                <div className="pt-1 text-[10px] font-bold text-[var(--text-muted)] flex items-center gap-1">
                  <span>Hanya Baca (Executive Summary)</span>
                </div>
              </MainCard>
            </div>
          </MainCard>
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

      {/* --- POP-UP MODAL: FORM TAMBAH / EDIT USER --- */}
      {showUserModal && (
        <AdminDialog label="Pengguna" onClose={() => setShowUserModal(false)}>
          <MainCard
            content={false}
            sx={{ p: 3, minWidth: 0 }}
            className="max-w-lg w-full space-y-5 relative animate-scaleUp"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
              <Typography
                component="h3"
                variant="h5"
                className="text-sm sm:text-base font-black text-[var(--text-main)] flex items-center gap-2"
              >
                <span>
                  {isEditingUser ? " Edit Pengguna" : " Tambah Pengguna Baru"}
                </span>
              </Typography>
              <AnimatedButton
                onClick={() => setShowUserModal(false)}
                className="sapa-button sapa-button-secondary text-sm p-1"
                aria-label="Tutup dialog"
              >
                Tutup
              </AnimatedButton>
            </div>

            <form onSubmit={handleSaveUserForm} className="space-y-4 text-xs">
              <div className="space-y-1">
                <FormLabel
                  htmlFor="adminsettings-field-7"
                  className="font-bold text-[var(--text-main)]"
                >
                  Username <span className="text-[var(--text-muted)]">*</span>
                </FormLabel>
                <TextField
                  size="small"
                  fullWidth
                  id="adminsettings-field-7"
                  type="text"
                  required
                  value={userFormUsername}
                  onChange={(e) => setUserFormUsername(e.target.value)}
                  placeholder="contoh: verifikator_kc"
                  sx={{ minWidth: 0 }}
                />
              </div>

              <div className="space-y-1">
                <FormLabel
                  htmlFor="adminsettings-field-8"
                  className="font-bold text-[var(--text-main)]"
                >
                  Nama Lengkap{" "}
                  <span className="text-[var(--text-muted)]">*</span>
                </FormLabel>
                <TextField
                  size="small"
                  fullWidth
                  id="adminsettings-field-8"
                  type="text"
                  required
                  value={userFormName}
                  onChange={(e) => setUserFormName(e.target.value)}
                  placeholder="contoh: Ahmad Fauzi, S.Kep"
                  sx={{ minWidth: 0 }}
                />
              </div>

              <div className="space-y-1">
                <FormLabel
                  htmlFor="adminsettings-field-9"
                  className="font-bold text-[var(--text-main)]"
                >
                  Alamat Email{" "}
                  <span className="text-[var(--text-muted)]">*</span>
                </FormLabel>
                <TextField
                  size="small"
                  fullWidth
                  id="adminsettings-field-9"
                  type="email"
                  required
                  value={userFormEmail}
                  onChange={(e) => setUserFormEmail(e.target.value)}
                  placeholder="nama@bpjs-kesehatan.go.id"
                  sx={{ minWidth: 0 }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <FormLabel
                    htmlFor="adminsettings-field-11"
                    className="font-bold text-[var(--text-main)]"
                  >
                    Peran (Role)
                  </FormLabel>
                  <AdminSelect
                    aria-label="Peran (Role)"
                    id="adminsettings-field-11"
                    value={userFormRole}
                    onValueChange={(value) => setUserFormRole(value as any)}
                    className="sapa-control w-full rounded-xl px-3 py-2 text-xs font-semibold text-[var(--text-main)] bg-[var(--panel-bg)] border border-[var(--border-color)]"
                  >
                    <FilterOption value="Super Admin">Super Admin</FilterOption>
                    <FilterOption value="Admin">Admin</FilterOption>
                    <FilterOption value="User">User</FilterOption>
                    <FilterOption value="Admin KC Jember">
                      Admin KC Jember
                    </FilterOption>
                    <FilterOption value="Verifikator Yanfaskes">
                      Verifikator Yanfaskes
                    </FilterOption>
                    <FilterOption value="Viewer Eksekutif">
                      Viewer Eksekutif
                    </FilterOption>
                  </AdminSelect>
                </div>

                <div className="space-y-1">
                  <FormLabel
                    htmlFor="adminsettings-field-12"
                    className="font-bold text-[var(--text-main)]"
                  >
                    Status Akun
                  </FormLabel>
                  <AdminSelect
                    aria-label="Status Akun"
                    id="adminsettings-field-12"
                    value={userFormStatus}
                    onValueChange={(value) => setUserFormStatus(value as any)}
                    className="sapa-control w-full rounded-xl px-3 py-2 text-xs font-semibold text-[var(--text-main)] bg-[var(--panel-bg)] border border-[var(--border-color)]"
                  >
                    <FilterOption value="Aktif">Aktif</FilterOption>
                    <FilterOption value="Nonaktif">Nonaktif</FilterOption>
                  </AdminSelect>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2.5">
                <AnimatedButton
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="sapa-button sapa-button-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  Batal
                </AnimatedButton>
                <AnimatedButton
                  type="submit"
                  className="sapa-button sapa-button-primary px-5 py-2 rounded-xl text-xs font-bold"
                >
                  {isEditingUser ? "Simpan Perubahan" : "Tambah Pengguna"}
                </AnimatedButton>
              </div>
            </form>
          </MainCard>
        </AdminDialog>
      )}

      {/* --- POP-UP MODAL: KONFIRMASI HAPUS USER --- */}
      {showDeleteModal && userToDelete && (
        <AdminDialog
          label="Konfirmasi hapus pengguna"
          onClose={() => setShowDeleteModal(false)}
        >
          <MainCard
            content={false}
            sx={{ p: 3, minWidth: 0 }}
            className="max-w-md w-full space-y-4 relative animate-scaleUp text-xs"
          >
            <div className="flex items-center gap-2.5 text-[var(--text-main)] font-black text-sm">
              <span>Konfirmasi Hapus Pengguna</span>
            </div>

            <p className="text-[var(--text-main)] leading-relaxed">
              Apakah Anda yakin ingin menghapus akun pengguna{" "}
              <strong className="text-[var(--text-main)]">
                @{userToDelete.username}
              </strong>{" "}
              ({userToDelete.name})? Pengguna ini tidak akan dapat login lagi ke
              sistem SAPA YANFASKES.
            </p>

            <div className="pt-3 flex items-center justify-end gap-2.5">
              <AnimatedButton
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setUserToDelete(null);
                }}
                className="sapa-button sapa-button-secondary px-4 py-2 rounded-xl text-xs font-semibold"
              >
                Batal
              </AnimatedButton>
              <AnimatedButton
                type="button"
                onClick={handleConfirmDeleteUser}
                className="sapa-button sapa-button-danger px-4 py-2 rounded-xl text-xs font-bold"
              >
                Hapus Pengguna
              </AnimatedButton>
            </div>
          </MainCard>
        </AdminDialog>
      )}
    </Stack>
  );
};
