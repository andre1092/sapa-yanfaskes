import {
  Stack,
  Typography,
  TextField,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  FormLabel,
} from "@mui/material";
import MainCard from "../berry/MainCard";
import { FilterOption } from "./ui/FilterSelect";
import { AnimatedButton } from "./ui/AnimatedButton";
import { AdminDialog, AdminSelect } from "./AdminDialog";
import React, { useState } from "react";
import {
  useUserStore,
  type UserAccount,
  type UserRole,
} from "../store/userStore";
import { useLogStore } from "../store/logStore";

export const UserManagementView: React.FC = () => {
  const { users, profile, addUser, editUser, deleteUser } = useUserStore();
  const { addLog } = useLogStore();

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("Semua");

  // Add / Edit Modal States
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [formUsername, setFormUsername] = useState("");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("Admin");
  const [formStatus, setFormStatus] = useState<"Aktif" | "Nonaktif">("Aktif");
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Modal States
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const openAddModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormUsername("");
    setFormName("");
    setFormEmail("");
    setFormRole("Admin");
    setFormStatus("Aktif");
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (u: UserAccount) => {
    setIsEditing(true);
    setEditingId(u.id);
    setFormUsername(u.username);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormRole(u.role);
    setFormStatus(u.status);
    setFormError(null);
    setShowModal(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUsername = formUsername.trim().toLowerCase();
    const cleanName = formName.trim();
    const cleanEmail = formEmail.trim().toLowerCase();

    if (!cleanUsername || !cleanName || !cleanEmail) {
      setFormError("Seluruh bidang formulir wajib diisi dengan benar.");
      addLog({
        userId: profile.username || "usr_admin",
        userName: profile.name || "Administrator",
        userRole: (profile.role as any) || "Super Admin",
        action: isEditing ? "UPDATE" : "ADD",
        module: "Manajemen Pengguna",
        status: "FAILED",
        details: `Gagal ${isEditing ? "memperbarui" : "menambahkan"} pengguna: Bidang formulir belum lengkap.`,
        ipAddress: "10.14.88.21 (Intranet BPJS)",
        device:
          typeof navigator !== "undefined" &&
          navigator.userAgent.includes("Mac")
            ? "Chrome / macOS"
            : "Chrome / Windows",
      });
      return;
    }

    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setFormError("Format alamat email tidak valid.");
      addLog({
        userId: profile.username || "usr_admin",
        userName: profile.name || "Administrator",
        userRole: (profile.role as any) || "Super Admin",
        action: isEditing ? "UPDATE" : "ADD",
        module: "Manajemen Pengguna",
        status: "FAILED",
        details: `Gagal ${isEditing ? "memperbarui" : "menambahkan"} pengguna: Format email '${cleanEmail}' tidak valid.`,
        ipAddress: "10.14.88.21 (Intranet BPJS)",
        device:
          typeof navigator !== "undefined" &&
          navigator.userAgent.includes("Mac")
            ? "Chrome / macOS"
            : "Chrome / Windows",
      });
      return;
    }

    // Periksa keunikan username
    const usernameConflict = users.some(
      (u) =>
        u.username.toLowerCase() === cleanUsername &&
        (!isEditing || u.id !== editingId),
    );
    if (usernameConflict) {
      setFormError(
        `Username "${cleanUsername}" sudah digunakan oleh akun lain.`,
      );
      addLog({
        userId: profile.username || "usr_admin",
        userName: profile.name || "Administrator",
        userRole: (profile.role as any) || "Super Admin",
        action: isEditing ? "UPDATE" : "ADD",
        module: "Manajemen Pengguna",
        status: "FAILED",
        details: `Gagal ${isEditing ? "memperbarui" : "menambahkan"} pengguna: Username '${cleanUsername}' sudah terdaftar.`,
        ipAddress: "10.14.88.21 (Intranet BPJS)",
        device:
          typeof navigator !== "undefined" &&
          navigator.userAgent.includes("Mac")
            ? "Chrome / macOS"
            : "Chrome / Windows",
      });
      return;
    }

    if (isEditing && editingId) {
      editUser(editingId, {
        username: cleanUsername,
        name: cleanName,
        email: cleanEmail,
        role: formRole,
        status: formStatus,
      });
      addLog({
        userId: profile.username || "usr_admin",
        userName: profile.name || "Administrator",
        userRole: (profile.role as any) || "Super Admin",
        action: "UPDATE",
        module: "Manajemen Pengguna",
        status: "SUCCESS",
        details: `Berhasil memperbarui data pengguna: ${cleanName} (@${cleanUsername} - Role: ${formRole}).`,
        ipAddress: "10.14.88.21 (Intranet BPJS)",
        device:
          typeof navigator !== "undefined" &&
          navigator.userAgent.includes("Mac")
            ? "Chrome / macOS"
            : "Chrome / Windows",
      });
      showToast(`Data pengguna "${cleanName}" berhasil diperbarui.`);
    } else {
      addUser({
        username: cleanUsername,
        name: cleanName,
        email: cleanEmail,
        role: formRole,
        status: formStatus,
      });
      addLog({
        userId: profile.username || "usr_admin",
        userName: profile.name || "Administrator",
        userRole: (profile.role as any) || "Super Admin",
        action: "ADD",
        module: "Manajemen Pengguna",
        status: "SUCCESS",
        details: `Berhasil menambahkan pengguna baru: ${cleanName} (@${cleanUsername} - Role: ${formRole}).`,
        ipAddress: "10.14.88.21 (Intranet BPJS)",
        device:
          typeof navigator !== "undefined" &&
          navigator.userAgent.includes("Mac")
            ? "Chrome / macOS"
            : "Chrome / Windows",
      });
      showToast(`Pengguna baru "${cleanName}" berhasil ditambahkan.`);
    }

    setShowModal(false);
  };

  const confirmDelete = (u: UserAccount) => {
    if (u.username === "superadmin" || u.username === profile.username) {
      addLog({
        userId: profile.username || "usr_admin",
        userName: profile.name || "Administrator",
        userRole: (profile.role as any) || "Super Admin",
        action: "DELETE",
        module: "Manajemen Pengguna",
        status: "FAILED",
        details: `Gagal menghapus pengguna: Akun '${u.username}' terproteksi sistem dari penghapusan.`,
        ipAddress: "10.14.88.21 (Intranet BPJS)",
        device:
          typeof navigator !== "undefined" &&
          navigator.userAgent.includes("Mac")
            ? "Chrome / macOS"
            : "Chrome / Windows",
      });
      showToast(
        "Akun Super Admin utama atau akun yang sedang aktif tidak dapat dihapus!",
      );
      return;
    }
    setUserToDelete(u);
    setShowDeleteModal(true);
  };

  const executeDelete = () => {
    if (!userToDelete) return;
    const success = deleteUser(userToDelete.id);
    if (success) {
      addLog({
        userId: profile.username || "usr_admin",
        userName: profile.name || "Administrator",
        userRole: (profile.role as any) || "Super Admin",
        action: "DELETE",
        module: "Manajemen Pengguna",
        status: "SUCCESS",
        details: `Berhasil menghapus akun pengguna: ${userToDelete.name} (@${userToDelete.username}).`,
        ipAddress: "10.14.88.21 (Intranet BPJS)",
        device:
          typeof navigator !== "undefined" &&
          navigator.userAgent.includes("Mac")
            ? "Chrome / macOS"
            : "Chrome / Windows",
      });
      showToast(`Akun pengguna "${userToDelete.name}" berhasil dihapus.`);
    } else {
      addLog({
        userId: profile.username || "usr_admin",
        userName: profile.name || "Administrator",
        userRole: (profile.role as any) || "Super Admin",
        action: "DELETE",
        module: "Manajemen Pengguna",
        status: "FAILED",
        details: `Gagal menghapus akun pengguna '${userToDelete.name}' karena kendala proteksi sistem.`,
        ipAddress: "10.14.88.21 (Intranet BPJS)",
        device:
          typeof navigator !== "undefined" &&
          navigator.userAgent.includes("Mac")
            ? "Chrome / macOS"
            : "Chrome / Windows",
      });
      showToast(
        "Gagal menghapus pengguna karena memiliki proteksi hak akses sistem.",
      );
    }
    setShowDeleteModal(false);
    setUserToDelete(null);
  };

  // Unduh Data Pengguna (CSV)
  const handleExportCsv = () => {
    const headers = [
      "No",
      "Username",
      "Nama Lengkap",
      "Email",
      "Role",
      "Status",
      "Tanggal Dibuat",
    ];
    const rows = filteredUsers.map((u, idx) => [
      idx + 1,
      u.username,
      `"${u.name.replace(/"/g, '""')}"`,
      u.email,
      u.role,
      u.status,
      u.createdAt,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `data_pengguna_sapa_yanfaskes_${new Date().toISOString().substring(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Berkas CSV data pengguna berhasil diunduh.");
  };

  // Filter Data
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole =
      roleFilter === "Semua" ||
      u.role === roleFilter ||
      (roleFilter === "Super Admin" && u.role === "Super Admin") ||
      (roleFilter === "Admin" &&
        (u.role === "Admin" || u.role === "Admin KC Jember")) ||
      (roleFilter === "User" &&
        (u.role === "User" ||
          u.role === "Verifikator Yanfaskes" ||
          u.role === "Viewer Eksekutif"));

    return matchesSearch && matchesRole;
  });

  const countSuperAdmin = users.filter((u) => u.role === "Super Admin").length;
  const countAdmin = users.filter(
    (u) => u.role === "Admin" || u.role === "Admin KC Jember",
  ).length;
  const countUser = users.filter(
    (u) =>
      u.role === "User" ||
      u.role === "Verifikator Yanfaskes" ||
      u.role === "Viewer Eksekutif",
  ).length;

  const getRoleBadgeStyle = (role: string) => {
    if (role === "Super Admin") {
      return "bg-[var(--panel-bg)] text-[var(--text-main)]   border-[var(--border-color)]";
    }
    if (role === "Admin" || role === "Admin KC Jember") {
      return "bg-[var(--panel-bg)] text-[var(--text-main)]   border-[var(--border-color)]";
    }
    return "bg-[var(--panel-bg)] text-[var(--text-muted)]   border-[var(--border-color)]";
  };

  return (
    <Stack
      spacing={3}
      sx={{ minWidth: 0 }}
      className="sapa-page min-w-0 space-y-6"
    >
      {/* Toast Notification */}
      {toastMessage && (
        <MainCard
          content={false}
          sx={{ p: 0, minWidth: 0 }}
          role="status"
          aria-live="polite"
          className="sapa-admin-toast fixed top-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 text-[var(--text-main)] animate-fadeIn"
        >
          <svg
            className="w-5 h-5 text-[var(--text-muted)] shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span className="text-xs font-semibold">{toastMessage}</span>
        </MainCard>
      )}

      {/* Header Banner & Ringkasan KPI User */}
      <Stack component="header" spacing={2}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}
        >
          <div>
            <Typography component="h1" variant="h3" className="sapa-page-title">
              Akses pengguna
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.75 }}
            >
              Kelola akun dan hak akses SAPA Yanfaskes.
            </Typography>
          </div>
          <div className="sapa-admin-actions flex flex-wrap items-center gap-3">
            <AnimatedButton
              onClick={handleExportCsv}
              className="sapa-button sapa-button-secondary flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer"
            >
              <svg
                className="w-4 h-4 text-[var(--text-main)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span>Unduh CSV</span>
            </AnimatedButton>

            <AnimatedButton
              onClick={openAddModal}
              className="sapa-button sapa-button-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>Tambah pengguna</span>
            </AnimatedButton>
          </div>
        </Stack>
        <div className="sapa-admin-summary grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-[var(--border-color)]">
          <MainCard content={false} sx={{ p: 1.5, minWidth: 0 }}>
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Total Pengguna
            </span>
            <div className="text-xl font-black text-[var(--text-main)] mt-0.5">
              {users.length}
            </div>
          </MainCard>
          <MainCard content={false} sx={{ p: 1.5, minWidth: 0 }}>
            <span className="text-[10px] font-bold text-[var(--text-main)] uppercase tracking-wider">
              Super Admin
            </span>
            <div className="text-xl font-black text-[var(--text-main)] mt-0.5">
              {countSuperAdmin}
            </div>
          </MainCard>
          <MainCard content={false} sx={{ p: 1.5, minWidth: 0 }}>
            <span className="text-[10px] font-bold text-[var(--text-main)] uppercase tracking-wider">
              Admin
            </span>
            <div className="text-xl font-black text-[var(--text-main)] mt-0.5">
              {countAdmin}
            </div>
          </MainCard>
          <MainCard content={false} sx={{ p: 1.5, minWidth: 0 }}>
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              User
            </span>
            <div className="text-xl font-black text-[var(--text-main)] mt-0.5">
              {countUser}
            </div>
          </MainCard>
        </div>
      </Stack>

      {/* Filter & Live Search Toolbar */}
      <MainCard
        content={false}
        sx={{ p: 2, minWidth: 0 }}
        className="flex flex-col sm:flex-row items-center justify-between gap-3"
      >
        <div className="relative w-full sm:w-80">
          <svg
            className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2"
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
          <TextField
            size="small"
            fullWidth
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, username, atau email..."
            sx={{ "& input": { pl: 4.5 }, minWidth: 0 }}
            slotProps={{
              htmlInput: { "aria-label": "Cari nama, username, atau email..." },
            }}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-[var(--text-muted)] shrink-0">
            Peran:
          </span>
          <AdminSelect
            value={roleFilter}
            onValueChange={(value) => setRoleFilter(value)}
            className="sapa-control w-full sm:w-44 px-3 py-2 rounded-xl text-xs bg-[var(--panel-bg)] border border-[var(--border-color)] text-[var(--text-main)] focus:outline-hidden font-medium cursor-pointer"
            aria-label="Filter peran pengguna"
          >
            <FilterOption value="Semua">Semua peran</FilterOption>
            <FilterOption value="Super Admin">Super Admin</FilterOption>
            <FilterOption value="Admin">Admin</FilterOption>
            <FilterOption value="User">User</FilterOption>
          </AdminSelect>
        </div>
      </MainCard>

      <p className="sapa-admin-results" role="status">
        Menampilkan {filteredUsers.length} dari {users.length} pengguna
      </p>
      {/* Tabel Daftar Pengguna */}
      <MainCard
        content={false}
        sx={{ p: 0, minWidth: 0 }}
        className="overflow-hidden"
      >
        <div
          tabIndex={0}
          role="region"
          aria-label="Tabel data, geser untuk melihat kolom lainnya"
          className="min-w-0 max-w-full overflow-x-auto"
        >
          <Table className="sapa-table w-full text-left text-xs">
            <TableHead className="bg-[var(--panel-bg)] border-b border-[var(--border-color)] text-[var(--text-main)] font-bold uppercase tracking-wider text-[11px]">
              <TableRow>
                <TableCell className="py-3.5 px-4 w-12 text-center">
                  No
                </TableCell>
                <TableCell className="py-3.5 px-4">Nama & Username</TableCell>
                <TableCell className="py-3.5 px-4">Email Akses</TableCell>
                <TableCell className="py-3.5 px-4">Role Akses</TableCell>
                <TableCell className="py-3.5 px-4 text-center">
                  Status
                </TableCell>
                <TableCell className="py-3.5 px-4">Dibuat</TableCell>
                <TableCell className="py-3.5 px-4 text-center w-28">
                  Aksi
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody className="divide-y divide-[var(--border-color)] font-medium">
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="sapa-admin-empty py-8 text-center text-[var(--text-muted)]"
                  >
                    <strong className="block text-[var(--text-main)]">
                      {users.length === 0
                        ? "Belum ada pengguna"
                        : "Pengguna tidak ditemukan"}
                    </strong>
                    <p className="mt-2 mb-4">
                      {users.length === 0
                        ? "Tambahkan pengguna untuk mulai mengatur akses."
                        : "Coba nama, username, email, atau peran lain."}
                    </p>
                    {users.length > 0 && (
                      <AnimatedButton
                        className="sapa-button sapa-button-secondary"
                        onClick={() => {
                          setSearchQuery("");
                          setRoleFilter("Semua");
                        }}
                      >
                        Reset pencarian
                      </AnimatedButton>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((u, idx) => {
                  const isCurrentProfile = u.username === profile.username;

                  return (
                    <TableRow
                      key={u.id}
                      className={`hover:bg-[var(--panel-bg)]  transition-colors ${
                        isCurrentProfile ? "bg-[var(--panel-bg)] " : ""
                      }`}
                    >
                      <TableCell className="py-3 px-4 text-center text-[var(--text-muted)]">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg text-[var(--text-main)] flex items-center justify-center font-bold text-[10px] shrink-0">
                            {u.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-[var(--text-main)] flex items-center gap-1.5 truncate">
                              <span>{u.name}</span>
                              {isCurrentProfile && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[var(--panel-bg)] text-[var(--text-main)] font-bold shrink-0">
                                  Login Saat Ini
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)]">
                              @{u.username}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-[var(--text-main)]">
                        {u.email}
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getRoleBadgeStyle(u.role)}`}
                        >
                          {u.role}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.status === "Aktif"
                              ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                              : "bg-[var(--danger-soft)] text-[var(--danger)]"
                          }`}
                        >
                          {u.status}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-[var(--text-muted)] text-[10px] whitespace-nowrap">
                        {u.createdAt}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <AnimatedButton
                            onClick={() => openEditModal(u)}
                            className="sapa-button sapa-button-secondary p-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Edit Pengguna"
                            aria-label="Edit Pengguna"
                          >
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
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          </AnimatedButton>

                          <AnimatedButton
                            onClick={() => confirmDelete(u)}
                            disabled={
                              u.username === "superadmin" || isCurrentProfile
                            }
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              u.username === "superadmin" || isCurrentProfile
                                ? "bg-slate-100 text-slate-300   cursor-not-allowed"
                                : "bg-rose-50 text-rose-600 hover:bg-rose-100   "
                            }`}
                            title={
                              u.username === "superadmin" || isCurrentProfile
                                ? "Akun terproteksi"
                                : "Hapus Pengguna"
                            }
                            aria-label={
                              u.username === "superadmin" || isCurrentProfile
                                ? "Akun terproteksi"
                                : "Hapus Pengguna"
                            }
                          >
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
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
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
      </MainCard>

      {/* Matriks Hak Akses & Peran (Role & Privilege Matrix) Sesuai Instruksi Pengguna */}
      <MainCard
        content={false}
        sx={{ p: 3, minWidth: 0 }}
        className="space-y-4"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--panel-bg)]" />
          <Typography
            component="h3"
            variant="h5"
            className="text-sm font-bold text-[var(--text-main)] uppercase tracking-wider"
          >
            Matriks Hak Akses & Peran Pengguna (Role & Privilege Matrix)
          </Typography>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-label="Tabel data, geser untuk melihat kolom lainnya"
          className="min-w-0 max-w-full overflow-x-auto"
        >
          <Table sx={{ minWidth: 960 }} className="sapa-table w-full text-left text-xs border border-[var(--border-color)] rounded-xl overflow-hidden">
            <TableHead className="bg-[var(--panel-bg)] border-b border-[var(--border-color)] font-bold text-[var(--text-main)]">
              <TableRow>
                <TableCell className="py-2.5 px-4">Tingkatan Role</TableCell>
                <TableCell className="py-2.5 px-4 text-center">
                  Melihat Data
                </TableCell>
                <TableCell className="py-2.5 px-4 text-center">
                  Mendownload Data
                </TableCell>
                <TableCell className="py-2.5 px-4 text-center">
                  Menambah User
                </TableCell>
                <TableCell className="py-2.5 px-4 text-center">
                  Mengedit User
                </TableCell>
                <TableCell className="py-2.5 px-4 text-center">
                  Menghapus User
                </TableCell>
                <TableCell className="py-2.5 px-4">
                  Cakupan Menu Navigasi
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody className="divide-y divide-[var(--border-color)]">
              <TableRow className="bg-[var(--panel-bg)]">
                <TableCell className="py-3 px-4 font-bold text-[var(--text-main)]">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-[var(--panel-bg)] border border-[var(--border-color)] mr-1.5">
                    Super Admin
                  </span>
                </TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-black">Diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-black">Diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-black">Diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-black">Diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-black">Diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-[var(--text-main)]">
                  Seluruh Menu Sistem (Home, FKTP, FKRTL, Kepatuhan, Pengaturan,
                  User)
                </TableCell>
              </TableRow>
              <TableRow className="bg-[var(--panel-bg)]">
                <TableCell className="py-3 px-4 font-bold text-[var(--text-main)]">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-[var(--panel-bg)] border border-[var(--border-color)] mr-1.5">
                    Admin
                  </span>
                </TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-black">Diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-black">Diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-bold">Tidak diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-bold">Tidak diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-bold">Tidak diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-[var(--text-main)]">
                  Melihat & Mendownload Laporan (FKRTL, FKTP, Matriks Mutu)
                </TableCell>
              </TableRow>
              <TableRow className="bg-[var(--panel-bg)]">
                <TableCell className="py-3 px-4 font-bold text-[var(--text-muted)]">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-[var(--panel-bg)] border border-[var(--border-color)] mr-1.5">
                    User
                  </span>
                </TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-black">Diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-bold">Tidak diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-bold">Tidak diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-bold">Tidak diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-bold">Tidak diizinkan</TableCell>
                <TableCell className="py-3 px-4 text-[var(--text-main)]">
                  Melihat Menu Tertentu Saja (Dashboard Ringkasan & Portal
                  Publik)
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </MainCard>

      {/* MODAL FORM TAMBAH / EDIT PENGGUNA */}
      {showModal && (
        <AdminDialog label="Pengguna" onClose={() => setShowModal(false)}>
          <MainCard
            content={false}
            sx={{ p: 3, minWidth: 0 }}
            className="w-full max-w-md space-y-5"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <Typography
                component="h3"
                variant="h5"
                className="font-bold text-base text-[var(--text-main)] flex items-center gap-2"
              >
                <span className="p-1 rounded-lg bg-[var(--panel-bg)] text-[var(--text-main)]">
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
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                </span>
                <span>
                  {isEditing
                    ? "Edit Kredensial Pengguna"
                    : "Tambah Pengguna Akses Baru"}
                </span>
              </Typography>
              <AnimatedButton
                onClick={() => setShowModal(false)}
                className="sapa-button sapa-button-secondary transition-colors cursor-pointer"
                aria-label="Tutup dialog"
              >
                Tutup
              </AnimatedButton>
            </div>

            {formError && (
              <MainCard
                content={false}
                sx={{ p: 1.5, minWidth: 0 }}
                role="alert"
                className="text-[var(--text-main)] text-xs font-semibold flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{formError}</span>
              </MainCard>
            )}

            <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
              <div>
                <FormLabel
                  htmlFor="usermanagementview-field-1"
                  className="block font-semibold text-[var(--text-main)] mb-1"
                >
                  Nama Lengkap
                </FormLabel>
                <TextField
                  size="small"
                  fullWidth
                  id="usermanagementview-field-1"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Misal: Andreas Dwi Rizko Nugroho"
                  sx={{ minWidth: 0 }}
                />
              </div>

              <div>
                <FormLabel
                  htmlFor="usermanagementview-field-2"
                  className="block font-semibold text-[var(--text-main)] mb-1"
                >
                  Username Akses
                </FormLabel>
                <TextField
                  size="small"
                  fullWidth
                  id="usermanagementview-field-2"
                  type="text"
                  required
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="Misal: admin_jember"
                  sx={{ minWidth: 0 }}
                />
              </div>

              <div>
                <FormLabel
                  htmlFor="usermanagementview-field-3"
                  className="block font-semibold text-[var(--text-main)] mb-1"
                >
                  Email Akses
                </FormLabel>
                <TextField
                  size="small"
                  fullWidth
                  id="usermanagementview-field-3"
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="nama.petugas@bpjs-kesehatan.go.id"
                  sx={{ minWidth: 0 }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FormLabel
                    htmlFor="usermanagementview-field-4"
                    className="block font-semibold text-[var(--text-main)] mb-1"
                  >
                    Role Pengguna
                  </FormLabel>
                  <AdminSelect
                    aria-label="Role Pengguna"
                    id="usermanagementview-field-4"
                    value={formRole}
                    onValueChange={(value) => setFormRole(value as UserRole)}
                    className="sapa-control w-full px-3 py-2 rounded-xl bg-[var(--panel-bg)] border border-[var(--border-color)] text-[var(--text-main)] font-medium focus:outline-hidden"
                  >
                    <FilterOption value="Super Admin">
                      Super Admin (Full Akses)
                    </FilterOption>
                    <FilterOption value="Admin">
                      Admin (Lihat & Download)
                    </FilterOption>
                    <FilterOption value="User">
                      User (Lihat Menu Tertentu)
                    </FilterOption>
                  </AdminSelect>
                </div>

                <div>
                  <FormLabel
                    htmlFor="usermanagementview-field-5"
                    className="block font-semibold text-[var(--text-main)] mb-1"
                  >
                    Status Akun
                  </FormLabel>
                  <AdminSelect
                    aria-label="Status Akun"
                    id="usermanagementview-field-5"
                    value={formStatus}
                    onValueChange={(value) =>
                      setFormStatus(value as "Aktif" | "Nonaktif")
                    }
                    className="sapa-control w-full px-3 py-2 rounded-xl bg-[var(--panel-bg)] border border-[var(--border-color)] text-[var(--text-main)] font-medium focus:outline-hidden"
                  >
                    <FilterOption value="Aktif">Aktif</FilterOption>
                    <FilterOption value="Nonaktif">Nonaktif</FilterOption>
                  </AdminSelect>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-end gap-2.5">
                <AnimatedButton
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="sapa-button sapa-button-secondary px-4 py-2 rounded-xl transition-colors font-medium cursor-pointer"
                >
                  Batal
                </AnimatedButton>
                <AnimatedButton
                  type="submit"
                  className="sapa-button sapa-button-primary px-5 py-2 rounded-xl font-bold transition-all cursor-pointer"
                >
                  {isEditing ? "Simpan Perubahan" : "Tambahkan Pengguna"}
                </AnimatedButton>
              </div>
            </form>
          </MainCard>
        </AdminDialog>
      )}

      {/* MODAL KONFIRMASI HAPUS */}
      {showDeleteModal && userToDelete && (
        <AdminDialog
          label="Konfirmasi hapus pengguna"
          onClose={() => setShowDeleteModal(false)}
        >
          <MainCard
            content={false}
            sx={{ p: 3, minWidth: 0 }}
            className="w-full max-w-sm space-y-4 text-center"
          >
            <div className="w-12 h-12 rounded-full bg-[var(--panel-bg)] text-[var(--text-main)] flex items-center justify-center mx-auto">
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </div>
            <div>
              <Typography
                component="h3"
                variant="h5"
                className="font-bold text-base text-[var(--text-main)]"
              >
                Konfirmasi Hapus Pengguna
              </Typography>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Apakah Anda yakin ingin menghapus akun{" "}
                <strong className="text-[var(--text-main)]">
                  @{userToDelete.username}
                </strong>{" "}
                ({userToDelete.name})? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <AnimatedButton
                onClick={() => setShowDeleteModal(false)}
                className="sapa-button sapa-button-secondary px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Batal
              </AnimatedButton>
              <AnimatedButton
                onClick={executeDelete}
                className="sapa-button sapa-button-danger px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Hapus Akun
              </AnimatedButton>
            </div>
          </MainCard>
        </AdminDialog>
      )}
    </Stack>
  );
};
