import React, { useState } from 'react';
import { useUserStore, type UserAccount, type UserRole } from '../store/userStore';

export const UserManagementView: React.FC = () => {
  const { users, profile, addUser, editUser, deleteUser } = useUserStore();

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('Semua');

  // Password Visibility State per User
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Add / Edit Modal States
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [formUsername, setFormUsername] = useState('');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('Admin');
  const [formStatus, setFormStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');
  const [formShowPassword, setFormShowPassword] = useState(false);
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

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const openAddModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormUsername('');
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('Admin');
    setFormStatus('Aktif');
    setFormShowPassword(false);
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (u: UserAccount) => {
    setIsEditing(true);
    setEditingId(u.id);
    setFormUsername(u.username);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormPassword(u.password);
    setFormRole(u.role);
    setFormStatus(u.status);
    setFormShowPassword(false);
    setFormError(null);
    setShowModal(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUsername = formUsername.trim().toLowerCase();
    const cleanName = formName.trim();
    const cleanEmail = formEmail.trim().toLowerCase();
    const cleanPassword = formPassword.trim();

    if (!cleanUsername || !cleanName || !cleanEmail || !cleanPassword) {
      setFormError('Seluruh bidang formulir wajib diisi dengan benar.');
      return;
    }

    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setFormError('Format alamat email tidak valid.');
      return;
    }

    if (cleanPassword.length < 6) {
      setFormError('Password keamanan minimal harus terdiri dari 6 karakter.');
      return;
    }

    // Periksa keunikan username
    const usernameConflict = users.some(
      (u) => u.username.toLowerCase() === cleanUsername && (!isEditing || u.id !== editingId)
    );
    if (usernameConflict) {
      setFormError(`Username "${cleanUsername}" sudah digunakan oleh akun lain.`);
      return;
    }

    if (isEditing && editingId) {
      editUser(editingId, {
        username: cleanUsername,
        name: cleanName,
        email: cleanEmail,
        password: cleanPassword,
        role: formRole,
        status: formStatus,
      });
      showToast(`Data pengguna "${cleanName}" berhasil diperbarui.`);
    } else {
      addUser({
        username: cleanUsername,
        name: cleanName,
        email: cleanEmail,
        password: cleanPassword,
        role: formRole,
        status: formStatus,
      });
      showToast(`Pengguna baru "${cleanName}" berhasil ditambahkan.`);
    }

    setShowModal(false);
  };

  const confirmDelete = (u: UserAccount) => {
    if (u.username === 'superadmin' || u.username === profile.username) {
      showToast('Akun Super Admin utama atau akun yang sedang aktif tidak dapat dihapus!');
      return;
    }
    setUserToDelete(u);
    setShowDeleteModal(true);
  };

  const executeDelete = () => {
    if (!userToDelete) return;
    const success = deleteUser(userToDelete.id);
    if (success) {
      showToast(`Akun pengguna "${userToDelete.name}" berhasil dihapus.`);
    } else {
      showToast('Gagal menghapus pengguna karena memiliki proteksi hak akses sistem.');
    }
    setShowDeleteModal(false);
    setUserToDelete(null);
  };

  // Unduh Data Pengguna (CSV)
  const handleExportCsv = () => {
    const headers = ['No', 'Username', 'Nama Lengkap', 'Email', 'Role', 'Status', 'Tanggal Dibuat'];
    const rows = filteredUsers.map((u, idx) => [
      idx + 1,
      u.username,
      `"${u.name.replace(/"/g, '""')}"`,
      u.email,
      u.role,
      u.status,
      u.createdAt,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `data_pengguna_sapa_yanfaskes_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Berkas CSV data pengguna berhasil diunduh.');
  };

  // Filter Data
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole =
      roleFilter === 'Semua' ||
      u.role === roleFilter ||
      (roleFilter === 'Super Admin' && u.role === 'Super Admin') ||
      (roleFilter === 'Admin' && (u.role === 'Admin' || u.role === 'Admin KC Jember')) ||
      (roleFilter === 'User' && (u.role === 'User' || u.role === 'Verifikator Yanfaskes' || u.role === 'Viewer Eksekutif'));

    return matchesSearch && matchesRole;
  });

  const countSuperAdmin = users.filter((u) => u.role === 'Super Admin').length;
  const countAdmin = users.filter((u) => u.role === 'Admin' || u.role === 'Admin KC Jember').length;
  const countUser = users.filter((u) => u.role === 'User' || u.role === 'Verifikator Yanfaskes' || u.role === 'Viewer Eksekutif').length;

  const getRoleBadgeStyle = (role: string) => {
    if (role === 'Super Admin') {
      return 'bg-[#2b4390]/15 text-[#2b4390] dark:bg-blue-900/30 dark:text-blue-300 border-[#2b4390]/30';
    }
    if (role === 'Admin' || role === 'Admin KC Jember') {
      return 'bg-[#44853b]/15 text-[#44853b] dark:bg-emerald-900/30 dark:text-emerald-300 border-[#44853b]/30';
    }
    return 'bg-[#6573a1]/15 text-[#6573a1] dark:bg-slate-800 dark:text-slate-300 border-[#afbade]/40';
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900/90 text-white shadow-xl border border-emerald-500/30 backdrop-blur-md animate-fadeIn">
          <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header Banner & Ringkasan KPI User */}
      <div className="glass-card rounded-2xl p-6 border border-[#afbade]/30 dark:border-emerald-500/20 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-gradient-to-br from-[#44853b]/10 to-[#2b4390]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="p-2 rounded-xl bg-gradient-to-tr from-[#44853b] to-[#2b4390] text-white shadow-md shadow-[#44853b]/20">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              <h2 className="text-xl font-extrabold text-[#2b4390] dark:text-white tracking-tight">
                Manajemen Akses Pengguna (User Management)
              </h2>
            </div>
            <p className="text-xs text-[#6573a1] dark:text-slate-400 max-w-2xl leading-relaxed">
              Kelola kredensial username, email, dan password pengguna akses SAPA Yanfaskes dengan pembagian hak akses bertingkat: 
              <strong className="text-[#2b4390] dark:text-emerald-400"> Super Admin</strong>, 
              <strong className="text-[#44853b] dark:text-emerald-300"> Admin</strong>, dan 
              <strong className="text-[#6573a1] dark:text-slate-300"> User</strong>.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-[#2b4390] dark:text-white bg-white dark:bg-slate-800/80 border border-[#afbade]/40 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-xs transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 text-[#44853b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Unduh CSV</span>
            </button>

            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bpjs-gradient-btn shadow-md shadow-[#44853b]/25 transition-all cursor-pointer active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>Tambah User</span>
            </button>
          </div>
        </div>

        {/* Mini KPI Ringkasan Role */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-[#afbade]/20 dark:border-slate-800/80">
          <div className="p-3 rounded-xl bg-white/60 dark:bg-slate-800/40 border border-[#afbade]/30 dark:border-slate-800">
            <span className="text-[10px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider">Total Pengguna</span>
            <div className="text-xl font-black text-[#2b4390] dark:text-white mt-0.5">{users.length}</div>
          </div>
          <div className="p-3 rounded-xl bg-[#2b4390]/5 dark:bg-blue-950/20 border border-[#2b4390]/20">
            <span className="text-[10px] font-bold text-[#2b4390] dark:text-blue-400 uppercase tracking-wider">Super Admin</span>
            <div className="text-xl font-black text-[#2b4390] dark:text-blue-300 mt-0.5">{countSuperAdmin}</div>
          </div>
          <div className="p-3 rounded-xl bg-[#44853b]/5 dark:bg-emerald-950/20 border border-[#44853b]/20">
            <span className="text-[10px] font-bold text-[#44853b] dark:text-emerald-400 uppercase tracking-wider">Admin</span>
            <div className="text-xl font-black text-[#44853b] dark:text-emerald-300 mt-0.5">{countAdmin}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-100/60 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] font-bold text-[#6573a1] dark:text-slate-400 uppercase tracking-wider">User</span>
            <div className="text-xl font-black text-slate-700 dark:text-slate-300 mt-0.5">{countUser}</div>
          </div>
        </div>
      </div>

      {/* Filter & Live Search Toolbar */}
      <div className="glass-card rounded-2xl p-4 border border-[#afbade]/30 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="relative w-full sm:w-80">
          <svg className="w-4 h-4 text-[#6573a1] dark:text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, username, atau email..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-[#afbade]/40 dark:border-slate-700 text-[#2b4390] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#44853b]/40"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-[#6573a1] dark:text-slate-400 shrink-0">Filter Role:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full sm:w-44 px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-[#afbade]/40 dark:border-slate-700 text-[#2b4390] dark:text-white focus:outline-hidden font-medium cursor-pointer"
          >
            <option value="Semua">Semua Role</option>
            <option value="Super Admin">Super Admin</option>
            <option value="Admin">Admin</option>
            <option value="User">User</option>
          </select>
        </div>
      </div>

      {/* Tabel Daftar Pengguna */}
      <div className="glass-card rounded-2xl border border-[#afbade]/30 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f7fcfa] dark:bg-slate-900/80 border-b border-[#afbade]/30 dark:border-slate-800 text-[#2b4390] dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4 w-12 text-center">No</th>
                <th className="py-3.5 px-4">Nama & Username</th>
                <th className="py-3.5 px-4">Email Akses</th>
                <th className="py-3.5 px-4">Password Akses</th>
                <th className="py-3.5 px-4">Role Akses</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4">Dibuat</th>
                <th className="py-3.5 px-4 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#afbade]/20 dark:divide-slate-800/60 font-medium">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#6573a1] dark:text-slate-400">
                    Tidak ditemukan data pengguna yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, idx) => {
                  const isCurrentProfile = u.username === profile.username;
                  const isPassVisible = Boolean(visiblePasswords[u.id]);

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-[#d4ecd1]/20 dark:hover:bg-slate-800/40 transition-colors ${
                        isCurrentProfile ? 'bg-[#44853b]/5 dark:bg-emerald-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#44853b] to-[#2b4390] text-white flex items-center justify-center font-bold text-[10px] shrink-0 shadow-xs">
                            {u.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-[#2b4390] dark:text-white flex items-center gap-1.5 truncate">
                              <span>{u.name}</span>
                              {isCurrentProfile && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-[#007A3D] dark:bg-emerald-900/60 dark:text-emerald-300 font-bold shrink-0">
                                  Login Saat Ini
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#6573a1] dark:text-slate-400">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{u.email}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                            {isPassVisible ? u.password : '••••••••••••'}
                          </span>
                          <button
                            onClick={() => togglePasswordVisibility(u.id)}
                            className="p-1 text-[#6573a1] hover:text-[#2b4390] dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                            title={isPassVisible ? 'Sembunyikan password' : 'Tampilkan password'}
                          >
                            {isPassVisible ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getRoleBadgeStyle(u.role)}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.status === 'Aktif'
                              ? 'bg-emerald-100 text-[#44853b] dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-[10px] whitespace-nowrap">
                        {u.createdAt}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 rounded-lg bg-blue-50 text-[#2b4390] hover:bg-blue-100 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            title="Edit Pengguna"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>

                          <button
                            onClick={() => confirmDelete(u)}
                            disabled={u.username === 'superadmin' || isCurrentProfile}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              u.username === 'superadmin' || isCurrentProfile
                                ? 'bg-slate-100 text-slate-300 dark:bg-slate-800/40 dark:text-slate-600 cursor-not-allowed'
                                : 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/60'
                            }`}
                            title={
                              u.username === 'superadmin' || isCurrentProfile
                                ? 'Akun terproteksi'
                                : 'Hapus Pengguna'
                            }
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matriks Hak Akses & Peran (Role & Privilege Matrix) Sesuai Instruksi Pengguna */}
      <div className="glass-card rounded-2xl p-6 border border-[#afbade]/30 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#2b4390]" />
          <h3 className="text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider">
            Matriks Hak Akses & Peran Pengguna (Role & Privilege Matrix)
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-[#afbade]/30 dark:border-slate-800 rounded-xl overflow-hidden">
            <thead className="bg-[#f7fcfa] dark:bg-slate-900 border-b border-[#afbade]/30 dark:border-slate-800 font-bold text-[#2b4390] dark:text-slate-200">
              <tr>
                <th className="py-2.5 px-4">Tingkatan Role</th>
                <th className="py-2.5 px-4 text-center">Melihat Data</th>
                <th className="py-2.5 px-4 text-center">Mendownload Data</th>
                <th className="py-2.5 px-4 text-center">Menambah User</th>
                <th className="py-2.5 px-4 text-center">Mengedit User</th>
                <th className="py-2.5 px-4 text-center">Menghapus User</th>
                <th className="py-2.5 px-4">Cakupan Menu Navigasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#afbade]/20 dark:divide-slate-800/80">
              <tr className="bg-white/40 dark:bg-slate-800/30">
                <td className="py-3 px-4 font-bold text-[#2b4390] dark:text-blue-300">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-[#2b4390]/15 border border-[#2b4390]/30 mr-1.5">
                    Super Admin
                  </span>
                </td>
                <td className="py-3 px-4 text-center text-emerald-500 font-black">✓</td>
                <td className="py-3 px-4 text-center text-emerald-500 font-black">✓</td>
                <td className="py-3 px-4 text-center text-emerald-500 font-black">✓</td>
                <td className="py-3 px-4 text-center text-emerald-500 font-black">✓</td>
                <td className="py-3 px-4 text-center text-emerald-500 font-black">✓</td>
                <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                  Seluruh Menu Sistem (Home, FKTP, FKRTL, Kepatuhan, Pengaturan, User)
                </td>
              </tr>
              <tr className="bg-white/20 dark:bg-slate-800/10">
                <td className="py-3 px-4 font-bold text-[#44853b] dark:text-emerald-300">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-[#44853b]/15 border border-[#44853b]/30 mr-1.5">
                    Admin
                  </span>
                </td>
                <td className="py-3 px-4 text-center text-emerald-500 font-black">✓</td>
                <td className="py-3 px-4 text-center text-emerald-500 font-black">✓</td>
                <td className="py-3 px-4 text-center text-rose-400 font-bold">✗</td>
                <td className="py-3 px-4 text-center text-rose-400 font-bold">✗</td>
                <td className="py-3 px-4 text-center text-rose-400 font-bold">✗</td>
                <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                  Melihat & Mendownload Laporan (FKRTL, FKTP, Matriks Mutu)
                </td>
              </tr>
              <tr className="bg-white/40 dark:bg-slate-800/30">
                <td className="py-3 px-4 font-bold text-[#6573a1] dark:text-slate-300">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-[#6573a1]/15 border border-[#6573a1]/30 mr-1.5">
                    User
                  </span>
                </td>
                <td className="py-3 px-4 text-center text-emerald-500 font-black">✓</td>
                <td className="py-3 px-4 text-center text-rose-400 font-bold">✗</td>
                <td className="py-3 px-4 text-center text-rose-400 font-bold">✗</td>
                <td className="py-3 px-4 text-center text-rose-400 font-bold">✗</td>
                <td className="py-3 px-4 text-center text-rose-400 font-bold">✗</td>
                <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                  Melihat Menu Tertentu Saja (Dashboard Ringkasan & Portal Publik)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL FORM TAMBAH / EDIT PENGGUNA */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 border border-[#afbade]/40 dark:border-emerald-500/30 shadow-2xl space-y-5 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-[#2b4390] dark:text-white flex items-center gap-2">
                <span className="p-1 rounded-lg bg-[#44853b]/20 text-[#44853b]">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </span>
                <span>{isEditing ? 'Edit Kredensial Pengguna' : 'Tambah Pengguna Akses Baru'}</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Misal: Andreas Dwi Rizko Nugroho"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#2b4390] dark:text-white font-medium focus:outline-hidden focus:ring-2 focus:ring-[#44853b]/40"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Username Akses
                </label>
                <input
                  type="text"
                  required
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="Misal: admin_jember"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#2b4390] dark:text-white font-medium focus:outline-hidden focus:ring-2 focus:ring-[#44853b]/40"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email Akses
                </label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="nama.petugas@bpjs-kesehatan.go.id"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#2b4390] dark:text-white font-medium focus:outline-hidden focus:ring-2 focus:ring-[#44853b]/40"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Password Akses
                </label>
                <div className="relative">
                  <input
                    type={formShowPassword ? 'text' : 'password'}
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3 py-2 pr-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#2b4390] dark:text-white font-medium focus:outline-hidden focus:ring-2 focus:ring-[#44853b]/40"
                  />
                  <button
                    type="button"
                    onClick={() => setFormShowPassword(!formShowPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                  >
                    {formShowPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Role Pengguna
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#2b4390] dark:text-white font-medium focus:outline-hidden"
                  >
                    <option value="Super Admin">Super Admin (Full Akses)</option>
                    <option value="Admin">Admin (Lihat & Download)</option>
                    <option value="User">User (Lihat Menu Tertentu)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Status Akun
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as 'Aktif' | 'Nonaktif')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#2b4390] dark:text-white font-medium focus:outline-hidden"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-bold text-white bpjs-gradient-btn shadow-md shadow-[#44853b]/25 transition-all cursor-pointer"
                >
                  {isEditing ? 'Simpan Perubahan' : 'Tambahkan Pengguna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="glass-panel w-full max-w-sm rounded-2xl p-6 border border-rose-500/30 shadow-2xl space-y-4 bg-white dark:bg-slate-900 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Konfirmasi Hapus Pengguna</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Apakah Anda yakin ingin menghapus akun <strong className="text-rose-600">@{userToDelete.username}</strong> ({userToDelete.name})? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={executeDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-950/30 transition-all cursor-pointer"
              >
                Hapus Akun
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
