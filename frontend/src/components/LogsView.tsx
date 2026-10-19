import React, { useState, useMemo } from 'react';
import { useLogStore, type ActionType } from '../store/logStore';
import { useAuthStore } from '../store/authStore';

export const LogsView: React.FC = () => {
  const { logs, clearLogs, exportLogsToCsv } = useLogStore();
  const { user: currentUser } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter & Search Log
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Filter Teks Pencarian
      const query = searchQuery.toLowerCase();
      const matchSearch =
        !searchQuery ||
        log.userName.toLowerCase().includes(query) ||
        log.module.toLowerCase().includes(query) ||
        log.details.toLowerCase().includes(query) ||
        log.ipAddress.toLowerCase().includes(query) ||
        log.device.toLowerCase().includes(query);

      // 2. Filter Tipe Aksi
      const matchAction = selectedAction === 'ALL' || log.action === selectedAction;

      // 3. Filter Status
      const matchStatus = selectedStatus === 'ALL' || log.status === selectedStatus;

      // 4. Filter Peran
      const matchRole = selectedRole === 'ALL' || log.userRole === selectedRole;

      return matchSearch && matchAction && matchStatus && matchRole;
    });
  }, [logs, searchQuery, selectedAction, selectedStatus, selectedRole]);

  // Kalkulasi Metrik KPI
  const totalLogs = logs.length;
  const successLogs = logs.filter((l) => l.status === 'SUCCESS').length;
  const failedLogs = logs.filter((l) => l.status === 'FAILED').length;
  const uniqueUsers = new Set(logs.map((l) => l.userName)).size;

  // Paginasi
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  // Helper Warna Badge Aksi
  const getActionBadge = (action: ActionType) => {
    switch (action) {
      case 'LOGIN':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'LOGOUT':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'VIEW':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'ADD':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'UPDATE':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'DELETE':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn select-none">
      {/* Header Banner & Breadcrumbs */}
      <div className="bg-white rounded-2xl p-6 border border-[#E8E8EE] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#8E8FA3] uppercase tracking-wider mb-1">
            <span>MANAGE</span>
            <span>•</span>
            <span className="text-[#009B4D]">AUDIT TRAIL & LOGS</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1E1F31] tracking-tight flex items-center gap-2.5">
            <span>Catatan Aktivitas Sistem (Activity Logs)</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E4F8DD] text-[#27AE60] border border-[#27AE60]/30">
              REAL-TIME
            </span>
          </h1>
          <p className="text-xs text-[#8E8FA3] mt-1 max-w-2xl">
            Merekam seluruh riwayat aktivitas pemanfaatan dashboard SAPA Yanfaskes oleh User, Admin, dan Super Admin, termasuk log kegagalan login, modifikasi data, penambahan akun, serta peninjauan modul.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={exportLogsToCsv}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#009B4D] hover:bg-[#008240] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Ekspor CSV</span>
          </button>

          {currentUser?.role === 'Super Admin' && (
            <button
              onClick={() => {
                if (window.confirm('Apakah Anda yakin ingin mengosongkan riwayat log aktivitas? Tindakan ini tidak dapat dibatalkan.')) {
                  clearLogs();
                }
              }}
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              title="Bersihkan Log (Khusus Super Admin)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 4 Kartu Metrik Ringkasan KPI Log */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#E8E8EE] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8E8FA3] uppercase tracking-wide">Total Aktivitas</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-black text-[#1E1F31] mt-2">{totalLogs}</p>
          <span className="text-[11px] text-[#8E8FA3] mt-1 block">Tercatat di sistem SAPA</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E8E8EE] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8E8FA3] uppercase tracking-wide">Aktivitas Berhasil</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2">{successLogs}</p>
          <span className="text-[11px] text-[#8E8FA3] mt-1 block">
            {totalLogs > 0 ? `${((successLogs / totalLogs) * 100).toFixed(1)}% rasio sukses` : '0%'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E8E8EE] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8E8FA3] uppercase tracking-wide">Aktivitas Gagal</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 mt-2">{failedLogs}</p>
          <span className="text-[11px] text-rose-500 font-semibold mt-1 block">
            {failedLogs > 0 ? `${failedLogs} peringatan / error` : 'Nihil error'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E8E8EE] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8E8FA3] uppercase tracking-wide">Pengguna Unik</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl font-black text-[#1E1F31] mt-2">{uniqueUsers}</p>
          <span className="text-[11px] text-[#8E8FA3] mt-1 block">Akun terdata beraktivitas</span>
        </div>
      </div>

      {/* Filter Bar & Live Search */}
      <div className="bg-white p-4 rounded-2xl border border-[#E8E8EE] shadow-xs flex flex-col lg:flex-row items-center justify-between gap-3 text-xs">
        {/* Search Input */}
        <div className="relative w-full lg:w-96">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Cari nama, modul, deskripsi aktivitas, atau IP..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 font-medium focus:outline-none focus:ring-2 focus:ring-[#009B4D]/20 focus:border-[#009B4D]"
          />
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Filter Status */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-[#009B4D]/20"
          >
            <option value="ALL">Semua Status</option>
            <option value="SUCCESS">Berhasil (Sukses)</option>
            <option value="FAILED">Gagal (Error / Peringatan)</option>
          </select>

          {/* Filter Tipe Aksi */}
          <select
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-[#009B4D]/20"
          >
            <option value="ALL">Semua Tipe Aksi</option>
            <option value="LOGIN">LOGIN</option>
            <option value="LOGOUT">LOGOUT</option>
            <option value="VIEW">VIEW (Tinjau)</option>
            <option value="ADD">ADD (Tambah)</option>
            <option value="UPDATE">UPDATE (Ubah)</option>
            <option value="DELETE">DELETE (Hapus)</option>
          </select>

          {/* Filter Peran */}
          <select
            value={selectedRole}
            onChange={(e) => {
              setSelectedRole(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-[#009B4D]/20"
          >
            <option value="ALL">Semua Peran</option>
            <option value="Super Admin">Super Admin</option>
            <option value="Admin">Admin</option>
            <option value="User">User</option>
            <option value="Tamu / Anonim">Tamu / Anonim</option>
          </select>

          {/* Reset Filter Button */}
          {(searchQuery || selectedAction !== 'ALL' || selectedStatus !== 'ALL' || selectedRole !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedAction('ALL');
                setSelectedStatus('ALL');
                setSelectedRole('ALL');
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl font-bold cursor-pointer transition-colors"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Tabel Riwayat Aktivitas Log */}
      <div className="bg-white rounded-2xl border border-[#E8E8EE] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8F9FD] border-b border-[#E8E8EE] text-[#8E8FA3] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4 w-12 text-center">No</th>
                <th className="py-3.5 px-4 w-36">Waktu & Tanggal</th>
                <th className="py-3.5 px-4">Pengguna & Peran</th>
                <th className="py-3.5 px-3 text-center">Aksi</th>
                <th className="py-3.5 px-4">Modul Sasaran</th>
                <th className="py-3.5 px-3 text-center">Status</th>
                <th className="py-3.5 px-4">Detail & Deskripsi Keterangan</th>
                <th className="py-3.5 px-4 text-right">Alamat IP & Klien</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8EE]">
              {paginatedLogs.length > 0 ? (
                paginatedLogs.map((log, idx) => {
                  const rowNum = (currentPage - 1) * itemsPerPage + idx + 1;
                  const isFailed = log.status === 'FAILED';

                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-[#F8F9FD] transition-colors ${
                        isFailed ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      {/* No */}
                      <td className="py-3 px-4 text-center text-[#8E8FA3] font-medium">
                        {rowNum}
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-4 font-mono font-medium text-slate-600 whitespace-nowrap">
                        {log.timestamp}
                      </td>

                      {/* Pengguna & Peran */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#1E1F31] leading-snug">
                          {log.userName}
                        </div>
                        <span
                          className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            log.userRole === 'Super Admin'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : log.userRole === 'Admin'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : log.userRole === 'User'
                              ? 'bg-slate-100 text-slate-700 border border-slate-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {log.userRole}
                        </span>
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-wide ${getActionBadge(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* Modul */}
                      <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                        {log.module}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {log.status === 'SUCCESS' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E4F8DD] text-[#27AE60] border border-[#27AE60]/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#27AE60]" />
                            BERHASIL
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                            GAGAL
                          </span>
                        )}
                      </td>

                      {/* Detail Deskripsi */}
                      <td className="py-3 px-4">
                        <p
                          className={`leading-relaxed text-xs ${
                            isFailed ? 'text-rose-700 font-semibold' : 'text-slate-600'
                          }`}
                        >
                          {log.details}
                        </p>
                      </td>

                      {/* IP & Klien */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="font-mono text-[11px] font-semibold text-slate-700">
                          {log.ipAddress}
                        </div>
                        <div className="text-[10px] text-[#8E8FA3] truncate max-w-[140px] ml-auto">
                          {log.device}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#8E8FA3]">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <span className="text-sm font-bold text-slate-700 block">Tidak Ada Catatan Log Ditemukan</span>
                    <span className="text-xs text-slate-400 mt-0.5 block">Silakan sesuaikan kata kunci pencarian atau filter yang dipilih.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Paginasi */}
        <div className="p-4 bg-[#F8F9FD] border-t border-[#E8E8EE] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8E8FA3]">
          <div>
            Menampilkan <span className="font-bold text-slate-700">{filteredLogs.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> s.d.{' '}
            <span className="font-bold text-slate-700">{Math.min(currentPage * itemsPerPage, filteredLogs.length)}</span> dari{' '}
            <span className="font-bold text-slate-700">{filteredLogs.length}</span> total riwayat aktivitas
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            >
              Sebelumnya
            </button>
            <span className="px-3 py-1.5 font-bold text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
