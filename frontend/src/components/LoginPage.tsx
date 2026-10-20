import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useUserStore } from '../store/userStore';
import { useLogStore } from '../store/logStore';
import { CloudflareTurnstile } from './CloudflareTurnstile';

interface LoginPageProps {
  onSuccessLogin?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccessLogin }) => {
  const { loginUser } = useAuthStore();
  const { users, updateProfile } = useUserStore();
  const { addLog } = useLogStore();

  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanInput = usernameOrEmail.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanInput || !cleanPassword) {
      setErrorMessage('Harap masukkan username/email dan kata sandi Anda.');
      return;
    }

    // Validasi Pengamanan Cloudflare Turnstile
    if (!turnstileToken) {
      addLog({
        userId: 'usr_guest',
        userName: cleanInput || 'Tamu / Anonim',
        userRole: 'Tamu / Anonim',
        action: 'LOGIN',
        module: 'Otentikasi Akun',
        status: 'FAILED',
        details: 'Gagal login: Verifikasi keamanan Cloudflare Turnstile belum diselesaikan.',
        ipAddress: '10.14.88.21 (Intranet BPJS)',
        device: typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? 'Chrome / macOS' : 'Chrome / Windows',
      });
      setErrorMessage('Harap selesaikan verifikasi keamanan Cloudflare terlebih dahulu.');
      return;
    }

    setIsLoading(true);

    // Verifikasi kredensial terhadap daftar akun pengguna
    setTimeout(() => {
      const matchedUser = users.find(
        (u) =>
          (u.username.toLowerCase() === cleanInput || u.email.toLowerCase() === cleanInput) &&
          u.password === cleanPassword
      );

      if (!matchedUser) {
        setIsLoading(false);
        addLog({
          userId: 'usr_guest',
          userName: cleanInput,
          userRole: 'Tamu / Anonim',
          action: 'LOGIN',
          module: 'Otentikasi Akun',
          status: 'FAILED',
          details: `Gagal login: Kredensial untuk akun '${cleanInput}' tidak cocok.`,
          ipAddress: '10.14.88.21 (Intranet BPJS)',
          device: typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? 'Chrome / macOS' : 'Chrome / Windows',
        });
        setErrorMessage('Username/Email atau kata sandi yang Anda masukkan tidak sesuai.');
        return;
      }

      if (matchedUser.status === 'Nonaktif') {
        setIsLoading(false);
        addLog({
          userId: matchedUser.id,
          userName: matchedUser.name,
          userRole: matchedUser.role,
          action: 'LOGIN',
          module: 'Otentikasi Akun',
          status: 'FAILED',
          details: `Gagal login: Akun '${matchedUser.username}' berstatus nonaktif.`,
          ipAddress: '10.14.88.21 (Intranet BPJS)',
          device: typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? 'Chrome / macOS' : 'Chrome / Windows',
        });
        setErrorMessage('Akun Anda saat ini berstatus nonaktif. Silakan hubungi Administrator.');
        return;
      }

      // Catat log sukses
      addLog({
        userId: matchedUser.id,
        userName: matchedUser.name,
        userRole: matchedUser.role,
        action: 'LOGIN',
        module: 'Otentikasi Akun',
        status: 'SUCCESS',
        details: `Pengguna '${matchedUser.name}' (${matchedUser.role}) berhasil masuk ke sistem SAPA Yanfaskes.`,
        ipAddress: '10.14.88.21 (Intranet BPJS)',
        device: typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? 'Chrome / macOS' : 'Chrome / Windows',
      });

      // Login berhasil: Simpan status sesi ke authStore & sinkronkan profil
      loginUser(
        {
          id: matchedUser.id,
          username: matchedUser.username,
          name: matchedUser.name,
          email: matchedUser.email,
          role: matchedUser.role,
        },
        turnstileToken
      );

      updateProfile({
        name: matchedUser.name,
        username: matchedUser.username,
        email: matchedUser.email,
        role: matchedUser.role,
      });

      setIsLoading(false);
      if (onSuccessLogin) {
        onSuccessLogin();
      }
    }, 280);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-100 text-slate-800">
      {/* ======================================================== */}
      {/* PANEL KIRI: IDENTITAS INSTITUSIONAL BPJS KESEHATAN        */}
      {/* Warna: Hijau Resmi BPJS Kesehatan (#009B4D) - Non-Navy   */}
      {/* ======================================================== */}
      <div className="w-full md:w-5/12 lg:w-1/2 bg-[#009B4D] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        {/* Subtle Institutional Geometric Curves Pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-10">
          <svg className="w-full h-full" viewBox="0 0 800 800" fill="none">
            <circle cx="400" cy="400" r="300" stroke="white" strokeWidth="2" strokeDasharray="8 8" />
            <circle cx="400" cy="400" r="220" stroke="white" strokeWidth="1.5" />
            <circle cx="400" cy="400" r="140" stroke="white" strokeWidth="1" />
            <path d="M0 400C200 400 200 800 400 800" stroke="white" strokeWidth="2" />
            <path d="M400 0C400 200 800 200 800 400" stroke="white" strokeWidth="2" />
          </svg>
        </div>

        {/* Brand & Emblem Header */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-lg p-1.5 shrink-0 border border-white/40">
              <img
                src="/logo-sapa-yanfaskes.png"
                alt="Logo SAPA Yanfaskes"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider font-bold text-emerald-100 block">
                BPJS Kesehatan
              </span>
              <span className="text-xl font-extrabold tracking-tight text-white block">
                SAPA YANFASKES
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/25 text-white text-xs font-semibold mb-6">
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
            <span>Portal Resmi Analisis & Kepatuhan Fasilitas Kesehatan</span>
          </div>

          <h2 className="text-2xl lg:text-3xl font-extrabold leading-snug mb-3 text-white">
            Saluran Analisis Performa & Akselerasi Fasilitas Kesehatan
          </h2>
          <p className="text-sm text-emerald-50 leading-relaxed max-w-lg mb-8">
            Platform pemantauan kinerja, kepatuhan standar mutu pelayanan, dan percepatan integrasi data FKTP serta FKRTL se-wilayah operasional BPJS Kesehatan.
          </p>

          {/* Institutional Pillars */}
          <div className="space-y-4 max-w-lg">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Monitoring 8 Pilar Kepatuhan Mutu FKRTL</h4>
                <p className="text-xs text-emerald-100 leading-normal">
                  Kesesuaian jadwal nakes, penyelesaian pengaduan SIPP, indeks KESSAN, hingga adopsi RME secara terukur.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Integrasi Data Real-Time Sub-2 Detik</h4>
                <p className="text-xs text-emerald-100 leading-normal">
                  Konektivitas langsung ke Google Spreadsheet operasional dan master referensi faskes terverifikasi.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Keamanan Akses Resmi Berbasis Peran (RBAC)</h4>
                <p className="text-xs text-emerald-100 leading-normal">
                  Perlindungan integritas data didukung verifikasi bot Cloudflare Turnstile dan otorisasi multi-level.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Panel Kiri */}
        <div className="relative z-10 pt-8 mt-8 border-t border-white/20 text-xs text-emerald-100">
          <p className="font-semibold text-white">Badan Penyelenggara Jaminan Sosial Kesehatan</p>
          <p className="text-[11px] text-emerald-100/90 mt-0.5">
            Hak Cipta © 2026 BPJS Kesehatan. Semua Hak Dilindungi.
          </p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* PANEL KANAN: FORMULIR LOGIN BERSIH & PROFESIONAL         */}
      {/* ======================================================== */}
      <div className="w-full md:w-7/12 lg:w-1/2 bg-white flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-md">
          {/* Header Form */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Masuk ke Akun Anda
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Silakan masukkan username atau alamat email terdaftar dan kata sandi Anda untuk mengakses dashboard.
            </p>
          </div>

          {/* Pesan Kesalahan / Error Alert */}
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2.5">
              <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Formulir Masuk */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Username atau Alamat Email
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="Contoh: admin_jember atau nama@bpjs-kesehatan.go.id"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#009B4D]/30 focus:border-[#009B4D] transition-colors"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi akun"
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#009B4D]/30 focus:border-[#009B4D] transition-colors"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                  title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {showPassword ? (
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
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 text-xs">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded text-[#009B4D] focus:ring-[#009B4D] border-slate-300 cursor-pointer"
                />
                <span>Ingat sesi saya di perangkat ini</span>
              </label>

              <span className="text-xs text-[#009B4D] hover:underline font-semibold cursor-pointer">
                Lupa Sandi?
              </span>
            </div>

            {/* PENGAMANAN RESMI BY CLOUDFLARE TURNSTILE */}
            <div className="pt-2">
              <CloudflareTurnstile
                onVerify={(token) => {
                  setTurnstileToken(token);
                  setErrorMessage(null);
                }}
                onExpire={() => setTurnstileToken(null)}
                theme="light"
              />
            </div>

            {/* Tombol Submit Masuk Solid Resmi */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 px-4 rounded-lg font-bold text-white text-sm bg-[#009B4D] hover:bg-[#008240] active:bg-[#007038] shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Memverifikasi Kredensial...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  <span>Masuk ke Sistem SAPA</span>
                </>
              )}
            </button>
          </form>

          {/* Akun Akses Default untuk Kemudahan Pengguna */}
          <div className="mt-8 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <span className="font-bold text-slate-800 block mb-1">Akun Akses Terdaftar:</span>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div>
                <span className="text-slate-500">Super Admin:</span>{' '}
                <code className="bg-slate-200/80 px-1 py-0.5 rounded text-slate-800">admin_jember</code>
              </div>
              <div>
                <span className="text-slate-500">Sandi:</span>{' '}
                <code className="bg-slate-200/80 px-1 py-0.5 rounded text-slate-800">JemberYanfaskes2026!</code>
              </div>
            </div>
          </div>

          {/* Footer Legal & Security */}
          <div className="mt-6 text-center text-xs text-slate-400">
            <span>Sistem Informasi Resmi BPJS Kesehatan • Terproteksi Cloudflare</span>
          </div>
        </div>
      </div>
    </div>
  );
};
