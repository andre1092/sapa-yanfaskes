import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSyncStore, formatCurrentTimestamp } from '../store/syncStore';
import { useUserStore, type UserAccount } from '../store/userStore';

type SettingsTab = 'profile' | 'fktp' | 'fkrtl' | 'users';

export const AdminSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
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
  const { profile, users, updateProfile, confirmEmailVerification, addUser, editUser, deleteUser } = useUserStore();

  // Profile Form States
  const [profileName, setProfileName] = useState(profile.name);
  const [profileUsername, setProfileUsername] = useState(profile.username);
  const [profileEmail, setProfileEmail] = useState(profile.email);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Email Verification Modal State
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [pendingEmailToVerify, setPendingEmailToVerify] = useState('');

  // Integration Loading States
  const [syncingModule, setSyncingModule] = useState<string | null>(null);

  // User Management State
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('Semua');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Add/Edit User Modal State
  const [showUserModal, setShowUserModal] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userFormUsername, setUserFormUsername] = useState('');
  const [userFormName, setUserFormName] = useState('');
  const [userFormEmail, setUserFormEmail] = useState('');
  const [userFormPassword, setUserFormPassword] = useState('');
  const [userFormRole, setUserFormRole] = useState<UserAccount['role']>('Verifikator Yanfaskes');
  const [userFormStatus, setUserFormStatus] = useState<UserAccount['status']>('Aktif');

  // Delete User Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // --- TAB 1: PROFIL LOGIC ---
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);

    if (newPassword && newPassword !== confirmPassword) {
      setIsSavingProfile(false);
      showToast('Konfirmasi kata sandi baru tidak cocok!');
      return;
    }

    const emailChanged = profileEmail.trim().toLowerCase() !== profile.email.trim().toLowerCase();

    setTimeout(() => {
      if (emailChanged) {
        setPendingEmailToVerify(profileEmail.trim());
        updateProfile({
          name: profileName.trim(),
          username: profileUsername.trim(),
          unverifiedEmail: profileEmail.trim(),
          isVerified: false,
          ...(newPassword ? { password: newPassword } : {}),
        });
        setIsSavingProfile(false);
        setShowVerifyModal(true);
      } else {
        updateProfile({
          name: profileName.trim(),
          username: profileUsername.trim(),
          ...(newPassword ? { password: newPassword } : {}),
        });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setIsSavingProfile(false);
        showToast('Profil dan kredensial akun berhasil disimpan 100%!');
      }
    }, 400);
  };

  const handleExecuteVerification = () => {
    confirmEmailVerification();
    setShowVerifyModal(false);
    showToast(`Email ${pendingEmailToVerify} berhasil diverifikasi! Seluruh fitur SAPA YANFASKES kini aktif.`);
  };

  // --- TAB 3: INTEGRASI FKRTL LOGIC ---
  const handleSyncModule = async (moduleId: string, name: string) => {
    setSyncingModule(moduleId);
    const nowTimestamp = formatCurrentTimestamp();

    try {
      if (moduleId === 'antrol') {
        await queryClient.invalidateQueries({ queryKey: ['fkrtl-antrol-stats'] });
        await queryClient.invalidateQueries({ queryKey: ['fkrtl-stats'] });
        setSyncAntrol(nowTimestamp);
      } else if (moduleId === 'nakes') {
        await queryClient.invalidateQueries({ queryKey: ['fkrtl-kepatuhan-nakes'] });
        setSyncNakes(nowTimestamp);
      } else if (moduleId === 'pengaduan') {
        await queryClient.invalidateQueries({ queryKey: ['fkrtl-kepatuhan-pengaduan'] });
        setSyncPengaduan(nowTimestamp);
      } else if (moduleId === 'umabl') {
        await queryClient.invalidateQueries({ queryKey: ['fkrtl-kepatuhan-umabl'] });
        setSyncUmabl(nowTimestamp);
      } else if (moduleId === 'display-tt') {
        await queryClient.invalidateQueries({ queryKey: ['fkrtl-kepatuhan-display-tt'] });
        setSyncDisplayTt(nowTimestamp);
      } else if (moduleId === 'all') {
        await queryClient.invalidateQueries();
        setSyncAll(nowTimestamp);
      }

      showToast(`Integrasi ${name} berhasil! Last Update diperbarui ke: ${nowTimestamp}`);
    } finally {
      setTimeout(() => {
        setSyncingModule(null);
      }, 500);
    }
  };

  // --- TAB 4: USER SETTING LOGIC ---
  const togglePasswordVisibility = (userId: string) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const handleOpenAddUserModal = () => {
    setIsEditingUser(false);
    setEditingUserId(null);
    setUserFormUsername('');
    setUserFormName('');
    setUserFormEmail('');
    setUserFormPassword('');
    setUserFormRole('Verifikator Yanfaskes');
    setUserFormStatus('Aktif');
    setShowUserModal(true);
  };

  const handleOpenEditUserModal = (user: UserAccount) => {
    setIsEditingUser(true);
    setEditingUserId(user.id);
    setUserFormUsername(user.username);
    setUserFormName(user.name);
    setUserFormEmail(user.email);
    setUserFormPassword(user.password);
    setUserFormRole(user.role);
    setUserFormStatus(user.status);
    setShowUserModal(true);
  };

  const handleSaveUserForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormUsername.trim() || !userFormName.trim() || !userFormEmail.trim() || !userFormPassword.trim()) {
      showToast('Harap lengkapi semua kolom isian pengguna.');
      return;
    }

    if (isEditingUser && editingUserId) {
      editUser(editingUserId, {
        username: userFormUsername.trim(),
        name: userFormName.trim(),
        email: userFormEmail.trim(),
        password: userFormPassword.trim(),
        role: userFormRole,
        status: userFormStatus,
      });
      showToast(`Data pengguna ${userFormUsername} berhasil diperbarui!`);
    } else {
      addUser({
        username: userFormUsername.trim(),
        name: userFormName.trim(),
        email: userFormEmail.trim(),
        password: userFormPassword.trim(),
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
      showToast(`Akun ${userToDelete.username} merupakan Super Admin utama dan dilindungi dari penghapusan.`);
    }
    setUserToDelete(null);
  };

  const filteredUsers = users.filter((u) => {
    if (selectedRoleFilter !== 'Semua' && u.role !== selectedRoleFilter) {
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#2b4390] text-white shadow-2xl border border-[#83a67e]/40 animate-slideUp">
          <span className="w-2 h-2 rounded-full bg-[#44853b] animate-ping" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* 1. Executive Banner Header */}
      <div className="glass-panel p-5 sm:p-7 rounded-3xl border border-[#afbade]/40 dark:border-white/10 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-[#44853b]/15 to-[#2b4390]/15 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border border-[#83a67e]/40 bg-[#d4ecd1]/40 text-[#44853b] dark:bg-emerald-500/10 dark:text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-[#44853b] animate-pulse" />
                SISTEM &amp; PENGATURAN ADMINISTRATOR
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#afbade]/20 text-[#2b4390] dark:bg-slate-800 dark:text-[#afbade]">
                v1.3.0 Live Sync
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#2b4390] dark:text-[#f7fcfa] tracking-tight">
              Admin <span className="bpjs-gradient-text">Settings</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#6573a1] dark:text-[#afbade] mt-1.5 max-w-2xl leading-relaxed">
              Pusat kendali konfigurasi profil, orkestrasi pembaruan data live Google Spreadsheet FKRTL &amp; FKTP, serta manajemen hak akses pengguna aplikasi SAPA YANFASKES.
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="glass-card px-4 py-3 rounded-2xl border border-[#83a67e]/40 dark:border-white/10 shadow-md flex items-center gap-3.5 bg-white/60 dark:bg-slate-900/60">
              <div className="w-10 h-10 rounded-xl bg-[#d4ecd1] dark:bg-emerald-950/60 border border-[#83a67e]/40 flex items-center justify-center text-lg">
                🛡️
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6573a1] dark:text-slate-400 block">
                  Status Akun
                </span>
                <span className="text-xs font-black text-[#44853b] dark:text-emerald-400 flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-[#44853b] animate-pulse" />
                  {profile.isVerified ? 'Terverifikasi Resmi' : 'Menunggu Verifikasi'}
                </span>
                <span className="text-[10px] font-semibold text-[#2b4390] dark:text-[#afbade] block">
                  {profile.role}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 4 SEGMENTED GLASSMORPHISM TABS */}
      <div className="glass-card rounded-2xl p-2 border border-[#afbade]/30 dark:border-white/10 shadow-md overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-2 min-w-max">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 cursor-pointer select-none ${
              activeTab === 'profile'
                ? 'bpjs-gradient-btn text-white shadow-md shadow-[#2b4390]/25 border border-[#83a67e]/50'
                : 'text-[#6573a1] hover:text-[#2b4390] hover:bg-[#d4ecd1]/30 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            <span>👤</span>
            <span>Profil</span>
          </button>

          <button
            onClick={() => setActiveTab('fktp')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 cursor-pointer select-none ${
              activeTab === 'fktp'
                ? 'bpjs-gradient-btn text-white shadow-md shadow-[#2b4390]/25 border border-[#83a67e]/50'
                : 'text-[#6573a1] hover:text-[#2b4390] hover:bg-[#d4ecd1]/30 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            <span>🏥</span>
            <span>Integrasi Data FKTP</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#afbade]/20 text-[#6573a1] dark:text-slate-400">
              Persiapan
            </span>
          </button>

          <button
            onClick={() => setActiveTab('fkrtl')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 cursor-pointer select-none ${
              activeTab === 'fkrtl'
                ? 'bpjs-gradient-btn text-white shadow-md shadow-[#2b4390]/25 border border-[#83a67e]/50'
                : 'text-[#6573a1] hover:text-[#2b4390] hover:bg-[#d4ecd1]/30 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            <span>🏢</span>
            <span>Integrasi Data FKRTL</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#d4ecd1] text-[#44853b] font-bold">
              Live Sync
            </span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 cursor-pointer select-none ${
              activeTab === 'users'
                ? 'bpjs-gradient-btn text-white shadow-md shadow-[#2b4390]/25 border border-[#83a67e]/50'
                : 'text-[#6573a1] hover:text-[#2b4390] hover:bg-[#d4ecd1]/30 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            <span>👥</span>
            <span>User Setting</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#afbade]/30 text-[#2b4390] dark:bg-slate-800 dark:text-white font-mono font-bold">
              {users.length} User
            </span>
          </button>
        </div>
      </div>

      {/* 3. TAB CONTENT RENDERING */}

      {/* TAB 1: PROFIL */}
      {activeTab === 'profile' && (
        <div className="glass-card rounded-3xl p-6 sm:p-8 border border-[#afbade]/40 dark:border-white/10 shadow-xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#afbade]/30 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#d4ecd1] dark:bg-emerald-950/60 border border-[#83a67e]/40 flex items-center justify-center text-lg shadow-sm">
                👤
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#2b4390] dark:text-[#f7fcfa]">
                  Profil Pengguna &amp; Keamanan Akun
                </h2>
                <p className="text-xs text-[#6573a1] dark:text-[#afbade] mt-0.5">
                  Perbarui identitas administrator, username, email resmi, dan kata sandi akses sistem.
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40">
              {profile.role}
            </span>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6 max-w-3xl">
            {/* Grid Input Data Diri */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#2b4390] dark:text-slate-300">
                  Nama Lengkap Administrator <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#2b4390] dark:text-slate-300">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={profileUsername}
                  onChange={(e) => setProfileUsername(e.target.value)}
                  className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#2b4390] dark:text-slate-300">
                    Alamat Email Resmi <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-[#6573a1] dark:text-slate-400">
                    Perubahan email memerlukan verifikasi tautan resmi SAPA YANFASKES
                  </span>
                </div>
                <input
                  type="email"
                  required
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b]"
                />
              </div>
            </div>

            {/* Bagian Ubah Password */}
            <div className="pt-4 border-t border-[#afbade]/20 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-[#2b4390] dark:text-white uppercase tracking-wider">
                    🔐 Ubah Kata Sandi (Password)
                  </h3>
                  <p className="text-[11px] text-[#6573a1] dark:text-slate-400 mt-0.5">
                    Kosongkan jika Anda tidak bermaksud mengganti kata sandi.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xs font-semibold text-[#2b4390] dark:text-sky-300 hover:underline flex items-center gap-1"
                >
                  <span>{showPassword ? '🙈 Sembunyikan' : '👁️ Tampilkan'} Sandi</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-[#6573a1] dark:text-slate-300">
                    Kata Sandi Lama
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-[#6573a1] dark:text-slate-300">
                    Kata Sandi Baru
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-[#6573a1] dark:text-slate-300">
                    Konfirmasi Sandi Baru
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900/80 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b]"
                  />
                </div>
              </div>
            </div>

            {/* Tombol Simpan */}
            <div className="pt-4 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="px-6 py-2.5 rounded-xl bpjs-gradient-btn text-white text-xs sm:text-sm font-bold shadow-md shadow-[#2b4390]/25 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>{isSavingProfile ? '⏳' : '💾'}</span>
                <span>{isSavingProfile ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: INTEGRASI DATA FKTP (KOSONGKAN DULU) */}
      {activeTab === 'fktp' && (
        <div className="glass-card rounded-3xl p-8 sm:p-12 border border-[#afbade]/40 dark:border-white/10 shadow-xl text-center flex flex-col items-center justify-center space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-[#d4ecd1]/50 border border-[#83a67e]/40 flex items-center justify-center text-4xl shadow-inner">
            🏥
          </div>
          <div className="max-w-md">
            <h3 className="text-lg sm:text-xl font-black text-[#2b4390] dark:text-white">
              Integrasi Data FKTP (Pelayanan Primer)
            </h3>
            <p className="text-xs sm:text-sm text-[#6573a1] dark:text-[#afbade] mt-2 leading-relaxed">
              Modul integrasi data Fasilitas Kesehatan Tingkat Pertama (Puskesmas, Klinik Pratama, dan Dokter Praktik Mandiri) saat ini dikosongkan terlebih dahulu dan sedang dipersiapkan untuk standarisasi indikator Kapitasi Berbasis Komitmen (KBK) dan rujukan primer.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#afbade]/20 text-[#2b4390] dark:bg-slate-800 dark:text-sky-300 border border-[#afbade]/30">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Tahap Perancangan Sumber Data
          </span>
        </div>
      )}

      {/* TAB 3: INTEGRASI DATA FKRTL (TOMBOL-TOMBOL UPDATE SPREADSHEET DENGAN LAST UPDATE) */}
      {activeTab === 'fkrtl' && (
        <div className="space-y-6">
          {/* Master Sync Bar */}
          <div className="glass-card rounded-3xl p-6 border border-[#83a67e]/40 dark:border-emerald-500/20 shadow-xl bg-gradient-to-r from-[#d4ecd1]/30 via-white/50 to-[#afbade]/20 dark:from-emerald-950/30 dark:via-slate-900/60 dark:to-blue-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#44853b] text-white">
                SINKRONISASI MENYELURUH
              </span>
              <h2 className="text-base sm:text-lg font-black text-[#2b4390] dark:text-white mt-1">
                Integrasi Seluruh Modul FKRTL Sekaligus
              </h2>
              <p className="text-xs text-[#6573a1] dark:text-[#afbade] mt-0.5">
                Segarkan seluruh cache data Google Spreadsheet FKRTL secara serentak untuk memperbarui antarmuka dashboard.
              </p>
            </div>

            <button
              onClick={() => handleSyncModule('all', 'Seluruh Modul FKRTL')}
              disabled={syncingModule === 'all'}
              className="px-5 py-2.5 rounded-xl bpjs-gradient-btn text-white text-xs sm:text-sm font-bold shadow-lg shadow-[#2b4390]/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 cursor-pointer shrink-0"
            >
              <span className={syncingModule === 'all' ? 'animate-spin' : ''}>⚡</span>
              <span>{syncingModule === 'all' ? 'Mengintegrasikan...' : 'Integrasikan Semua Modul'}</span>
            </button>
          </div>

          {/* Cards Modul-Modul Integrasi FKRTL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. Antrol FKRTL */}
            <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-lg flex flex-col justify-between gap-4 bg-white/60 dark:bg-slate-900/60">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-[#2b4390] dark:text-white">
                    <span className="text-base">⏱️</span>
                    <span>Pemanfaatan Antrol FKRTL</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#d4ecd1] text-[#44853b]">
                    2.052 Baris
                  </span>
                </div>
                <p className="text-xs text-[#6573a1] dark:text-[#afbade] leading-relaxed">
                  Data antrean online terintegrasi (Mobile JKN &amp; Bridging SIMRS). Memperbarui KPI, kurva tren bulanan, serta perankingan poliklinik dan rumah sakit.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#d4ecd1]/60 text-[#44853b] text-xs font-bold border border-[#83a67e]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#44853b]" />
                  <span>Last Update : {lastUpdateAntrol}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-[#6573a1] dark:text-slate-400">
                  Target: 80% &amp; 95%
                </span>
                <button
                  onClick={() => handleSyncModule('antrol', 'Pemanfaatan Antrol FKRTL')}
                  disabled={syncingModule === 'antrol'}
                  className="px-4 py-2 rounded-xl bg-[#2b4390] hover:bg-[#2b4390]/90 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className={syncingModule === 'antrol' ? 'animate-spin' : ''}>🔄</span>
                  <span>{syncingModule === 'antrol' ? 'Memproses...' : 'Integrasikan Antrol'}</span>
                </button>
              </div>
            </div>

            {/* 2. Tab 01 Nakes */}
            <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-lg flex flex-col justify-between gap-4 bg-white/60 dark:bg-slate-900/60">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-[#2b4390] dark:text-white">
                    <span className="text-base">👨‍⚕️</span>
                    <span>Tab 01. Jadwal Praktik Nakes</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#afbade]/20 text-[#2b4390] dark:text-sky-300">
                    Bobot 25%
                  </span>
                </div>
                <p className="text-xs text-[#6573a1] dark:text-[#afbade] leading-relaxed">
                  Kesesuaian jadwal praktik dokter spesialis pada Aplikasi HFIS dengan data pelayanan faskes. Terhubung master referensi 26 rumah sakit KC Jember.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#d4ecd1]/60 text-[#44853b] text-xs font-bold border border-[#83a67e]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#44853b]" />
                  <span>Last Update : {lastUpdateNakes}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-[#6573a1] dark:text-slate-400">
                  Target Nasional: 100%
                </span>
                <button
                  onClick={() => handleSyncModule('nakes', 'Tab 01 Jadwal Nakes')}
                  disabled={syncingModule === 'nakes'}
                  className="px-4 py-2 rounded-xl bg-[#2b4390] hover:bg-[#2b4390]/90 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className={syncingModule === 'nakes' ? 'animate-spin' : ''}>🔄</span>
                  <span>{syncingModule === 'nakes' ? 'Memproses...' : 'Integrasikan Nakes'}</span>
                </button>
              </div>
            </div>

            {/* 3. Tab 02 Pengaduan */}
            <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-lg flex flex-col justify-between gap-4 bg-white/60 dark:bg-slate-900/60">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-[#2b4390] dark:text-white">
                    <span className="text-base">📢</span>
                    <span>Tab 02. Penyelesaian Pengaduan</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#afbade]/20 text-[#2b4390] dark:text-sky-300">
                    Bobot 20%
                  </span>
                </div>
                <p className="text-xs text-[#6573a1] dark:text-[#afbade] leading-relaxed">
                  Kecepatan tindak lanjut keluhan peserta sesuai SLA 1-3 hari kerja pada Aplikasi SIPP. Terkoneksi 228 baris data live Google Sheets.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#d4ecd1]/60 text-[#44853b] text-xs font-bold border border-[#83a67e]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#44853b]" />
                  <span>Last Update : {lastUpdatePengaduan}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-[#6573a1] dark:text-slate-400">
                  Target Nasional: 100%
                </span>
                <button
                  onClick={() => handleSyncModule('pengaduan', 'Tab 02 Penyelesaian Pengaduan')}
                  disabled={syncingModule === 'pengaduan'}
                  className="px-4 py-2 rounded-xl bg-[#2b4390] hover:bg-[#2b4390]/90 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className={syncingModule === 'pengaduan' ? 'animate-spin' : ''}>🔄</span>
                  <span>{syncingModule === 'pengaduan' ? 'Memproses...' : 'Integrasikan Pengaduan'}</span>
                </button>
              </div>
            </div>

            {/* 4. Tab 03 Umbal Peserta (KESSAN) */}
            <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-lg flex flex-col justify-between gap-4 bg-white/60 dark:bg-slate-900/60">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-[#2b4390] dark:text-white">
                    <span className="text-base">💬</span>
                    <span>Tab 03. Umbal Peserta (KESSAN)</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#afbade]/20 text-[#2b4390] dark:text-sky-300">
                    Bobot 10%
                  </span>
                </div>
                <p className="text-xs text-[#6573a1] dark:text-[#afbade] leading-relaxed">
                  Pengukuran umpan balik customer feedback peserta berdasarkan proporsi target responden dan sampling populasi kunjungan rumah sakit.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#d4ecd1]/60 text-[#44853b] text-xs font-bold border border-[#83a67e]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#44853b]" />
                  <span>Last Update : {lastUpdateUmabl}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-[#6573a1] dark:text-slate-400">
                  Target: &ge; 100% dari target
                </span>
                <button
                  onClick={() => handleSyncModule('umabl', 'Tab 03 Umbal Peserta')}
                  disabled={syncingModule === 'umabl'}
                  className="px-4 py-2 rounded-xl bg-[#2b4390] hover:bg-[#2b4390]/90 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className={syncingModule === 'umabl' ? 'animate-spin' : ''}>🔄</span>
                  <span>{syncingModule === 'umabl' ? 'Memproses...' : 'Integrasikan Umabl'}</span>
                </button>
              </div>
            </div>

            {/* 5. Tab 04 Display TT */}
            <div className="glass-card rounded-2xl p-5 border border-[#afbade]/30 dark:border-white/10 shadow-lg flex flex-col justify-between gap-4 bg-white/60 dark:bg-slate-900/60 md:col-span-2">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-[#2b4390] dark:text-white">
                    <span className="text-base">🛏️</span>
                    <span>Tab 04. Pembaruan (Update) Data Ketersediaan Tempat Tidur</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#afbade]/20 text-[#2b4390] dark:text-sky-300">
                    Bobot 10%
                  </span>
                </div>
                <p className="text-xs text-[#6573a1] dark:text-[#afbade] leading-relaxed">
                  Memperhitungkan jumlah hari faskes melakukan pembaruan informasi data ketersediaan tempat tidur secara harian dalam 1 bulan dari spreadsheet Display TT.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#d4ecd1]/60 text-[#44853b] text-xs font-bold border border-[#83a67e]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#44853b]" />
                  <span>Last Update : {lastUpdateDisplayTt}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#afbade]/20 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-[#6573a1] dark:text-slate-400">
                  Target Nasional: &ge; 25 hari
                </span>
                <button
                  onClick={() => handleSyncModule('display-tt', 'Tab 04 Display TT')}
                  disabled={syncingModule === 'display-tt'}
                  className="px-4 py-2 rounded-xl bg-[#2b4390] hover:bg-[#2b4390]/90 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className={syncingModule === 'display-tt' ? 'animate-spin' : ''}>🔄</span>
                  <span>{syncingModule === 'display-tt' ? 'Memproses...' : 'Integrasikan Display TT'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: USER SETTING (DAFTAR USER, TAMBAH, EDIT, KURANG/HAPUS) */}
      {activeTab === 'users' && (
        <div className="glass-card rounded-3xl p-6 sm:p-8 border border-[#afbade]/40 dark:border-white/10 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#afbade]/30 dark:border-slate-800">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#2b4390] dark:text-[#f7fcfa] flex items-center gap-2">
                <span>👥 Manajemen Pengguna Aplikasi (User Setting)</span>
              </h2>
              <p className="text-xs text-[#6573a1] dark:text-[#afbade] mt-0.5">
                Daftar akun pengguna resmi, email institusi, kata sandi, serta hak akses peran dalam sistem SAPA YANFASKES.
              </p>
            </div>

            <button
              onClick={handleOpenAddUserModal}
              className="px-4 py-2 rounded-xl bpjs-gradient-btn text-white text-xs font-bold shadow-md shadow-[#2b4390]/25 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto"
            >
              <span>➕</span>
              <span>Tambah User Baru</span>
            </button>
          </div>

          {/* Filter Bar User */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Cari berdasarkan username, nama, atau email..."
                value={searchUserQuery}
                onChange={(e) => setSearchUserQuery(e.target.value)}
                className="w-full glass-input rounded-xl pl-9 pr-3.5 py-2 text-xs text-[#2b4390] dark:text-white placeholder-[#6573a1] dark:placeholder-slate-400 border border-[#afbade]/40 dark:border-white/10 focus:outline-none focus:border-[#44853b]"
              />
              <span className="absolute left-3 top-2.5 text-xs text-[#6573a1] dark:text-slate-400">🔍</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-[#2b4390] dark:text-slate-300">Filter Role:</label>
              <select
                value={selectedRoleFilter}
                onChange={(e) => setSelectedRoleFilter(e.target.value)}
                className="glass-input rounded-xl px-3 py-1.5 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900 border border-[#afbade]/40 dark:border-white/10"
              >
                <option value="Semua">Semua Role ({users.length})</option>
                <option value="Super Admin">Super Admin</option>
                <option value="Admin KC Jember">Admin KC Jember</option>
                <option value="Verifikator Yanfaskes">Verifikator Yanfaskes</option>
                <option value="Viewer Eksekutif">Viewer Eksekutif</option>
              </select>
            </div>
          </div>

          {/* Tabel Pengguna */}
          <div className="overflow-x-auto rounded-2xl border border-[#afbade]/30 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#e6f2ed] dark:bg-slate-900/80 text-[#2b4390] dark:text-[#afbade] uppercase text-[10px] font-bold tracking-wider border-b border-[#afbade]/30 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">No</th>
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">Email Resmi</th>
                  <th className="py-3 px-4">Password</th>
                  <th className="py-3 px-4">Peran (Role)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#afbade]/20 dark:divide-slate-800/60 font-medium">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[#6573a1] dark:text-slate-400 italic">
                      Tidak ada pengguna yang sesuai dengan filter pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u, idx) => {
                    const isPassVisible = Boolean(visiblePasswords[u.id]);
                    return (
                      <tr
                        key={u.id}
                        className="hover:bg-[#d4ecd1]/20 dark:hover:bg-slate-800/40 transition-colors group"
                      >
                        <td className="py-3 px-4 text-[#6573a1] dark:text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono font-bold text-[#2b4390] dark:text-white">
                          @{u.username}
                        </td>
                        <td className="py-3 px-4 font-bold text-[#2b4390] dark:text-slate-200">
                          {u.name}
                        </td>
                        <td className="py-3 px-4 text-[#6573a1] dark:text-slate-400 font-mono text-[11px]">
                          {u.email}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[#2b4390] dark:text-slate-300">
                          <div className="flex items-center gap-2">
                            <span>{isPassVisible ? u.password : '••••••••••••'}</span>
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility(u.id)}
                              className="text-xs hover:scale-110 transition-transform opacity-70 hover:opacity-100"
                              title={isPassVisible ? 'Sembunyikan sandi' : 'Lihat sandi'}
                            >
                              {isPassVisible ? '🙈' : '👁️'}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                              u.role === 'Super Admin'
                                ? 'bg-[#2b4390] text-white shadow-sm'
                                : u.role === 'Admin KC Jember'
                                ? 'bg-[#d4ecd1] text-[#44853b] border border-[#83a67e]/40'
                                : u.role === 'Verifikator Yanfaskes'
                                ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              u.status === 'Aktif'
                                ? 'bg-[#d4ecd1] text-[#44853b]'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditUserModal(u)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#afbade]/20 text-[#2b4390] hover:bg-[#afbade]/40 dark:bg-slate-800 dark:text-sky-300 transition-colors"
                              title="Edit Pengguna"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => {
                                setUserToDelete(u);
                                setShowDeleteModal(true);
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950/60 dark:text-rose-300 transition-colors"
                              title="Hapus / Kurang Pengguna"
                            >
                              🗑️ Hapus
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
      )}

      {/* --- POP-UP MODAL: INFO VERIFIKASI EMAIL SAPA YANFASKES --- */}
      {showVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-lg w-full rounded-3xl p-6 sm:p-7 border border-[#83a67e]/40 dark:border-emerald-500/30 shadow-2xl space-y-5 bg-white/95 dark:bg-slate-900/95 relative animate-scaleUp">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-[#afbade]/30 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#2b4390] to-[#44853b] text-white flex items-center justify-center text-sm shadow-md">
                  ✉️
                </span>
                <h3 className="text-sm sm:text-base font-black text-[#2b4390] dark:text-white">
                  Info Sapa Yanfaskes
                </h3>
              </div>
              <button
                onClick={() => setShowVerifyModal(false)}
                className="text-[#6573a1] hover:text-[#2b4390] text-sm p-1"
              >
                ✕
              </button>
            </div>

            {/* Pesan Utama */}
            <div className="p-4 rounded-2xl bg-[#d4ecd1]/40 border border-[#83a67e]/30 text-[#2b4390] dark:text-emerald-300 text-xs sm:text-sm font-semibold leading-relaxed">
              Info Sapa Yanfaskes: Harap verifikasi akun Anda untuk mengaktifkan fitur-fitur pada SAPA YANFASKES.
            </div>

            <p className="text-xs text-[#6573a1] dark:text-slate-300 leading-relaxed">
              Tautan verifikasi resmi telah dikirimkan ke alamat email tujuan:{' '}
              <span className="font-bold text-[#2b4390] dark:text-white font-mono">{pendingEmailToVerify}</span>.
            </p>

            {/* Kartu Pratinjau Surat Email No-Reply Official */}
            <div className="p-4 rounded-2xl border border-[#afbade]/40 dark:border-white/10 bg-slate-50/90 dark:bg-slate-950/80 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#afbade]/20 dark:border-slate-800 text-[11px] text-[#6573a1] dark:text-slate-400">
                <span>Pengirim: <strong className="text-[#2b4390] dark:text-white">no-reply@sapa-yanfaskes.bpjs-kesehatan.go.id</strong></span>
                <span className="px-2 py-0.5 rounded bg-[#d4ecd1] text-[#44853b] font-bold text-[10px]">Official Mail</span>
              </div>

              <div className="text-[#2b4390] dark:text-white font-bold">
                Subjek: [SAPA YANFASKES] Verifikasi Alamat Email Akun Administrator
              </div>

              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-[#afbade]/20 text-[11.5px] text-[#2b4390] dark:text-slate-200 leading-relaxed space-y-3 font-normal">
                <p>
                  Halo Administrator SAPA YANFASKES,
                </p>
                <p>
                  Harap verifikasi email Anda untuk menikmati semua fitur yang ada di aplikasi SAPA YANFASKES melalui link berikut:
                </p>
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10.5px] font-mono text-sky-700 dark:text-sky-300 break-all select-all">
                  https://sapa-yanfaskes.vercel.app/verify?token=sapa_auth_{Date.now()}&amp;email={encodeURIComponent(pendingEmailToVerify)}
                </div>
                <p>atau tekan tombol di bawah ini:</p>
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={handleExecuteVerification}
                    className="px-6 py-2.5 rounded-xl bpjs-gradient-btn text-white text-xs font-black shadow-lg shadow-[#44853b]/30 hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>✅</span>
                    <span>VERIFIKASI SEKARANG</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Tombol Aksi Menuju Email */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <a
                href={`mailto:${pendingEmailToVerify}`}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#2b4390] text-[#2b4390] dark:border-sky-400 dark:text-sky-300 hover:bg-[#2b4390] hover:text-white text-xs font-bold transition-all text-center"
              >
                📬 Buka Email ({pendingEmailToVerify.split('@')[1] || 'Webmail'})
              </a>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowVerifyModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#6573a1] hover:text-[#2b4390] dark:text-slate-400"
                >
                  Tutup Sementara
                </button>
                <button
                  type="button"
                  onClick={handleExecuteVerification}
                  className="px-5 py-2.5 rounded-xl bg-[#44853b] hover:bg-[#44853b]/90 text-white text-xs font-bold transition-all shadow-md"
                >
                  Verifikasi Akun
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- POP-UP MODAL: FORM TAMBAH / EDIT USER --- */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-lg w-full rounded-3xl p-6 sm:p-7 border border-[#afbade]/40 dark:border-white/10 shadow-2xl space-y-5 bg-white/95 dark:bg-slate-900/95 relative animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#afbade]/30 dark:border-slate-800">
              <h3 className="text-sm sm:text-base font-black text-[#2b4390] dark:text-white flex items-center gap-2">
                <span>{isEditingUser ? '✏️ Edit Pengguna' : '➕ Tambah Pengguna Baru'}</span>
              </h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="text-[#6573a1] hover:text-[#2b4390] text-sm p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUserForm} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#2b4390] dark:text-slate-300">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={userFormUsername}
                  onChange={(e) => setUserFormUsername(e.target.value)}
                  placeholder="contoh: verifikator_kc"
                  className="w-full glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900 border border-[#afbade]/40 dark:border-white/10"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#2b4390] dark:text-slate-300">
                  Nama Lengkap <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={userFormName}
                  onChange={(e) => setUserFormName(e.target.value)}
                  placeholder="contoh: Ahmad Fauzi, S.Kep"
                  className="w-full glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900 border border-[#afbade]/40 dark:border-white/10"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#2b4390] dark:text-slate-300">
                  Alamat Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={userFormEmail}
                  onChange={(e) => setUserFormEmail(e.target.value)}
                  placeholder="nama@bpjs-kesehatan.go.id"
                  className="w-full glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900 border border-[#afbade]/40 dark:border-white/10"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#2b4390] dark:text-slate-300">
                  Kata Sandi (Password) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={userFormPassword}
                  onChange={(e) => setUserFormPassword(e.target.value)}
                  placeholder="Kombinasi huruf, angka, simbol"
                  className="w-full glass-input rounded-xl px-3 py-2 text-xs font-mono font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900 border border-[#afbade]/40 dark:border-white/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#2b4390] dark:text-slate-300">
                    Peran (Role)
                  </label>
                  <select
                    value={userFormRole}
                    onChange={(e) => setUserFormRole(e.target.value as any)}
                    className="w-full glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900 border border-[#afbade]/40 dark:border-white/10"
                  >
                    <option value="Super Admin">Super Admin</option>
                    <option value="Admin KC Jember">Admin KC Jember</option>
                    <option value="Verifikator Yanfaskes">Verifikator Yanfaskes</option>
                    <option value="Viewer Eksekutif">Viewer Eksekutif</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#2b4390] dark:text-slate-300">
                    Status Akun
                  </label>
                  <select
                    value={userFormStatus}
                    onChange={(e) => setUserFormStatus(e.target.value as any)}
                    className="w-full glass-input rounded-xl px-3 py-2 text-xs font-semibold text-[#2b4390] dark:text-white bg-white/80 dark:bg-slate-900 border border-[#afbade]/40 dark:border-white/10"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6573a1] hover:text-[#2b4390]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bpjs-gradient-btn text-white text-xs font-bold shadow-md"
                >
                  {isEditingUser ? 'Simpan Perubahan' : 'Tambah Pengguna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- POP-UP MODAL: KONFIRMASI HAPUS USER --- */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-md w-full rounded-3xl p-6 border border-rose-500/40 shadow-2xl space-y-4 bg-white/95 dark:bg-slate-900/95 relative animate-scaleUp text-xs">
            <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400 font-black text-sm">
              <span className="text-xl">⚠️</span>
              <span>Konfirmasi Hapus Pengguna</span>
            </div>

            <p className="text-[#2b4390] dark:text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus akun pengguna{' '}
              <strong className="text-rose-600 dark:text-rose-400">@{userToDelete.username}</strong> ({userToDelete.name})?
              Pengguna ini tidak akan dapat login lagi ke sistem SAPA YANFASKES.
            </p>

            <div className="pt-3 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setUserToDelete(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6573a1] hover:text-[#2b4390]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md"
              >
                Hapus Pengguna
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
