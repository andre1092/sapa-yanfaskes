import {
  Stack,
  Typography,
  TextField,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
} from "@mui/material";
import MainCard from "../berry/MainCard";
import { FilterOption } from "./ui/FilterSelect";
import { AdminDialog, AdminSelect } from "./AdminDialog";
import { AnimatedButton } from "./ui/AnimatedButton";
import React, { useState, useMemo, useEffect } from "react";
import { useLogStore, type ActionType } from "../store/logStore";
import { useAuthStore } from "../store/authStore";

export const LogsView: React.FC = () => {
  const { logs, clearLogs, exportLogsToCsv } = useLogStore();
  const { user: currentUser } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAction, setSelectedAction] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedRole, setSelectedRole] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const itemsPerPage = 10;

  // Filter & Search Log
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Filter Teks Pencarian
      const query = searchQuery.trim().toLowerCase();
      const matchSearch =
        !query ||
        log.userName.toLowerCase().includes(query) ||
        log.module.toLowerCase().includes(query) ||
        log.details.toLowerCase().includes(query) ||
        log.ipAddress.toLowerCase().includes(query) ||
        log.device.toLowerCase().includes(query);

      // 2. Filter Tipe Aksi
      const matchAction =
        selectedAction === "ALL" || log.action === selectedAction;

      // 3. Filter Status
      const matchStatus =
        selectedStatus === "ALL" || log.status === selectedStatus;

      // 4. Filter Peran
      const matchRole = selectedRole === "ALL" || log.userRole === selectedRole;

      return matchSearch && matchAction && matchStatus && matchRole;
    });
  }, [logs, searchQuery, selectedAction, selectedStatus, selectedRole]);

  // Kalkulasi Metrik KPI
  const totalLogs = logs.length;
  const successLogs = logs.filter((l) => l.status === "SUCCESS").length;
  const failedLogs = logs.filter((l) => l.status === "FAILED").length;
  const uniqueUsers = new Set(logs.map((l) => l.userName)).size;

  // Paginasi
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  // Helper Warna Badge Aksi
  const getActionBadge = (action: ActionType) => {
    switch (action) {
      case "LOGIN":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "LOGOUT":
        return "bg-slate-100 text-slate-700 border-slate-300";
      case "VIEW":
        return "bg-cyan-50 text-cyan-700 border-cyan-200";
      case "ADD":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "UPDATE":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "DELETE":
        return "bg-[var(--danger-soft)] text-[var(--danger)] border-current";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  return (
    <Stack
      spacing={3}
      sx={{ minWidth: 0 }}
      className="sapa-page min-w-0 space-y-6 animate-fadeIn"
    >
      {/* Header Banner & Breadcrumbs */}
      <Stack component="header" spacing={2}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}
        >
          <div>
            <Typography component="h1" variant="h3" className="sapa-page-title">
              Aktivitas sistem
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.75 }}
            >
              Tinjau jejak audit, aktivitas pengguna, dan hasil perubahan data.
            </Typography>
          </div>
          <div className="sapa-admin-actions flex flex-wrap items-center gap-2.5">
            <AnimatedButton
              onClick={exportLogsToCsv}
              className="sapa-button sapa-button-secondary flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span>Ekspor CSV</span>
            </AnimatedButton>

            {currentUser?.role === "Super Admin" && (
              <AnimatedButton
                onClick={() => setShowClearDialog(true)}
                className="sapa-button sapa-button-danger flex items-center gap-2 px-3 py-2 border rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                title="Bersihkan Log (Khusus Super Admin)"
                aria-label="Bersihkan Log (Khusus Super Admin)"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </AnimatedButton>
            )}
          </div>
        </Stack>
      </Stack>

      {/* 4 Kartu Metrik Ringkasan KPI Log */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MainCard content={false} sx={{ p: 2.5, minWidth: 0 }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              Total Aktivitas
            </span>
            <div className="w-8 h-8 rounded-lg bg-[var(--panel-bg)] text-[var(--text-main)] flex items-center justify-center">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-black text-[var(--text-main)] mt-2">
            {totalLogs}
          </p>
          <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
            Tercatat di sistem SAPA
          </span>
        </MainCard>

        <MainCard content={false} sx={{ p: 2.5, minWidth: 0 }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              Aktivitas Berhasil
            </span>
            <div className="w-8 h-8 rounded-lg bg-[var(--panel-bg)] text-[var(--text-main)] flex items-center justify-center">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-black text-[var(--text-main)] mt-2">
            {successLogs}
          </p>
          <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
            {totalLogs > 0
              ? `${((successLogs / totalLogs) * 100).toFixed(1)}% rasio sukses`
              : "0%"}
          </span>
        </MainCard>

        <MainCard content={false} sx={{ p: 2.5, minWidth: 0 }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              Aktivitas Gagal
            </span>
            <div className="w-8 h-8 rounded-lg bg-[var(--panel-bg)] text-[var(--text-main)] flex items-center justify-center">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-black text-[var(--text-main)] mt-2">
            {failedLogs}
          </p>
          <span className="text-[11px] text-[var(--text-muted)] font-semibold mt-1 block">
            {failedLogs > 0
              ? `${failedLogs} peringatan / error`
              : "Nihil error"}
          </span>
        </MainCard>

        <MainCard content={false} sx={{ p: 2.5, minWidth: 0 }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              Pengguna Unik
            </span>
            <div className="w-8 h-8 rounded-lg bg-[var(--panel-bg)] text-[var(--text-main)] flex items-center justify-center">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-black text-[var(--text-main)] mt-2">
            {uniqueUsers}
          </p>
          <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
            Akun terdata beraktivitas
          </span>
        </MainCard>
      </div>

      {/* Filter Bar & Live Search */}
      <MainCard
        content={false}
        sx={{ p: 2, minWidth: 0 }}
        className="flex flex-col lg:flex-row items-center justify-between gap-3 text-xs"
      >
        {/* Search Input */}
        <div className="relative w-full lg:w-96">
          <TextField
            size="small"
            fullWidth
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Cari nama, modul, deskripsi aktivitas, atau IP..."
            sx={{ "& input": { pl: 4.5 }, minWidth: 0 }}
            slotProps={{
              htmlInput: {
                "aria-label":
                  "Cari nama, modul, deskripsi aktivitas, atau IP...",
              },
            }}
          />
          <svg
            className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2"
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

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Filter Status */}
          <AdminSelect
            value={selectedStatus}
            onValueChange={(value) => {
              setSelectedStatus(value);
              setCurrentPage(1);
            }}
            className="sapa-control px-3 py-2 rounded-xl bg-[var(--panel-bg)] border border-[var(--border-color)] text-[var(--text-main)] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--bpjs-green)]"
            aria-label="Filter status aktivitas"
          >
            <FilterOption value="ALL">Semua Status</FilterOption>
            <FilterOption value="SUCCESS">Berhasil (Sukses)</FilterOption>
            <FilterOption value="FAILED">
              Gagal (Error / Peringatan)
            </FilterOption>
          </AdminSelect>

          {/* Filter Tipe Aksi */}
          <AdminSelect
            value={selectedAction}
            onValueChange={(value) => {
              setSelectedAction(value);
              setCurrentPage(1);
            }}
            className="sapa-control px-3 py-2 rounded-xl bg-[var(--panel-bg)] border border-[var(--border-color)] text-[var(--text-main)] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--bpjs-green)]"
            aria-label="Filter tipe aksi"
          >
            <FilterOption value="ALL">Semua Tipe Aksi</FilterOption>
            <FilterOption value="LOGIN">LOGIN</FilterOption>
            <FilterOption value="LOGOUT">LOGOUT</FilterOption>
            <FilterOption value="VIEW">VIEW (Tinjau)</FilterOption>
            <FilterOption value="ADD">ADD (Tambah)</FilterOption>
            <FilterOption value="UPDATE">UPDATE (Ubah)</FilterOption>
            <FilterOption value="DELETE">DELETE (Hapus)</FilterOption>
          </AdminSelect>

          {/* Filter Peran */}
          <AdminSelect
            value={selectedRole}
            onValueChange={(value) => {
              setSelectedRole(value);
              setCurrentPage(1);
            }}
            className="sapa-control px-3 py-2 rounded-xl bg-[var(--panel-bg)] border border-[var(--border-color)] text-[var(--text-main)] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--bpjs-green)]"
            aria-label="Filter peran pengguna"
          >
            <FilterOption value="ALL">Semua Peran</FilterOption>
            <FilterOption value="Super Admin">Super Admin</FilterOption>
            <FilterOption value="Admin">Admin</FilterOption>
            <FilterOption value="User">User</FilterOption>
            <FilterOption value="Tamu / Anonim">Tamu / Anonim</FilterOption>
          </AdminSelect>

          {/* Reset Filter Button */}
          {(searchQuery ||
            selectedAction !== "ALL" ||
            selectedStatus !== "ALL" ||
            selectedRole !== "ALL") && (
            <AnimatedButton
              onClick={() => {
                setSearchQuery("");
                setSelectedAction("ALL");
                setSelectedStatus("ALL");
                setSelectedRole("ALL");
                setCurrentPage(1);
              }}
              className="sapa-button sapa-button-secondary px-3 py-2 rounded-xl font-bold cursor-pointer transition-colors"
            >
              Reset Filter
            </AnimatedButton>
          )}
        </div>
      </MainCard>

      <p className="sapa-admin-results" role="status">
        {filteredLogs.length} aktivitas sesuai filter dari {totalLogs} catatan
      </p>
      {/* Tabel Riwayat Aktivitas Log */}
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
          <Table className="sapa-table w-full text-left border-collapse text-xs">
            <TableHead>
              <TableRow className="bg-[var(--panel-bg)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                <TableCell className="py-3.5 px-4 w-12 text-center">
                  No
                </TableCell>
                <TableCell className="py-3.5 px-4 w-36">
                  Waktu & Tanggal
                </TableCell>
                <TableCell className="py-3.5 px-4">Pengguna & Peran</TableCell>
                <TableCell className="py-3.5 px-3 text-center">Aksi</TableCell>
                <TableCell className="py-3.5 px-4">Modul Sasaran</TableCell>
                <TableCell className="py-3.5 px-3 text-center">
                  Status
                </TableCell>
                <TableCell className="py-3.5 px-4">
                  Detail & Deskripsi Keterangan
                </TableCell>
                <TableCell className="py-3.5 px-4 text-right">
                  Alamat IP & Klien
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody className="divide-y divide-[var(--border-color)]">
              {paginatedLogs.length > 0 ? (
                paginatedLogs.map((log, idx) => {
                  const rowNum = (currentPage - 1) * itemsPerPage + idx + 1;
                  const isFailed = log.status === "FAILED";

                  return (
                    <TableRow
                      key={log.id}
                      className={`hover:bg-[var(--panel-bg)] transition-colors ${
                        isFailed ? "bg-[var(--danger-soft)]" : ""
                      }`}
                    >
                      {/* No */}
                      <TableCell className="py-3 px-4 text-center text-[var(--text-muted)] font-medium">
                        {rowNum}
                      </TableCell>

                      {/* Timestamp */}
                      <TableCell className="py-3 px-4 font-mono font-medium text-[var(--text-main)] whitespace-nowrap">
                        {log.timestamp}
                      </TableCell>

                      {/* Pengguna & Peran */}
                      <TableCell className="py-3 px-4">
                        <div className="font-bold text-[var(--text-main)] leading-snug">
                          {log.userName}
                        </div>
                        <span
                          className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            log.userRole === "Super Admin"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : log.userRole === "Admin"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : log.userRole === "User"
                                  ? "bg-slate-100 text-slate-700 border border-slate-200"
                                  : "bg-[var(--danger-soft)] text-[var(--danger)] border border-current"
                          }`}
                        >
                          {log.userRole}
                        </span>
                      </TableCell>

                      {/* Aksi */}
                      <TableCell className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-wide ${getActionBadge(
                            log.action,
                          )}`}
                        >
                          {log.action}
                        </span>
                      </TableCell>

                      {/* Modul */}
                      <TableCell className="py-3 px-4 font-semibold text-[var(--text-main)] whitespace-nowrap">
                        {log.module}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-3 px-3 text-center whitespace-nowrap">
                        <Chip
                          size="small"
                          color={log.status === "SUCCESS" ? "success" : "error"}
                          variant="outlined"
                          label={
                            log.status === "SUCCESS" ? "Berhasil" : "Gagal"
                          }
                        />
                      </TableCell>

                      {/* Detail Deskripsi */}
                      <TableCell className="py-3 px-4">
                        <p
                          className={`leading-relaxed text-xs ${
                            isFailed
                              ? "text-[var(--danger)] font-semibold"
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          {log.details}
                        </p>
                      </TableCell>

                      {/* IP & Klien */}
                      <TableCell className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="font-mono text-[11px] font-semibold text-[var(--text-main)]">
                          {log.ipAddress}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[140px] ml-auto">
                          {log.device}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="sapa-admin-empty py-12 text-center text-[var(--text-muted)]"
                  >
                    <div className="w-12 h-12 rounded-xl bg-[var(--panel-bg)] flex items-center justify-center mx-auto mb-3 text-[var(--text-muted)]">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.8}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <span className="text-sm font-bold text-[var(--text-main)] block">
                      {totalLogs === 0
                        ? "Belum ada aktivitas tercatat"
                        : "Aktivitas tidak ditemukan"}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] mt-0.5 block">
                      {totalLogs === 0
                        ? "Aktivitas akan tampil setelah pengguna menggunakan aplikasi."
                        : "Sesuaikan kata kunci atau reset filter untuk melihat aktivitas lainnya."}
                    </span>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer Paginasi */}
        <div className="p-4 bg-[var(--panel-bg)] border-t border-[var(--border-color)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
          <div>
            Menampilkan{" "}
            <span className="font-bold text-[var(--text-main)]">
              {filteredLogs.length > 0
                ? (currentPage - 1) * itemsPerPage + 1
                : 0}
            </span>{" "}
            s.d.{" "}
            <span className="font-bold text-[var(--text-main)]">
              {Math.min(currentPage * itemsPerPage, filteredLogs.length)}
            </span>{" "}
            dari{" "}
            <span className="font-bold text-[var(--text-main)]">
              {filteredLogs.length}
            </span>{" "}
            total riwayat aktivitas
          </div>

          <div className="flex items-center gap-1.5">
            <AnimatedButton
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="sapa-button sapa-button-secondary px-3 py-1.5 rounded-lg border font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Sebelumnya
            </AnimatedButton>
            <span className="px-3 py-1.5 font-bold text-[var(--text-main)]">
              {currentPage} / {totalPages}
            </span>
            <AnimatedButton
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="sapa-button sapa-button-secondary px-3 py-1.5 rounded-lg border font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Selanjutnya
            </AnimatedButton>
          </div>
        </div>
      </MainCard>
      {showClearDialog && currentUser?.role === "Super Admin" && (
        <AdminDialog
          label="Hapus riwayat aktivitas"
          onClose={() => setShowClearDialog(false)}
        >
          <MainCard
            content={false}
            sx={{ p: 3, minWidth: 0 }}
            className="space-y-4"
          >
            <Typography
              component="h2"
              variant="h4"
              className="text-lg font-bold text-[var(--text-main)]"
            >
              Bersihkan riwayat aktivitas?
            </Typography>
            <p className="text-sm text-[var(--text-muted)]">
              Seluruh catatan aktivitas akan dihapus. Tindakan ini tidak dapat
              dibatalkan.
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <AnimatedButton
                className="sapa-button sapa-button-secondary"
                onClick={() => setShowClearDialog(false)}
              >
                Batal
              </AnimatedButton>
              <AnimatedButton
                className="sapa-button sapa-button-danger"
                onClick={() => {
                  clearLogs();
                  setCurrentPage(1);
                  setShowClearDialog(false);
                }}
              >
                Hapus Riwayat
              </AnimatedButton>
            </div>
          </MainCard>
        </AdminDialog>
      )}
    </Stack>
  );
};
