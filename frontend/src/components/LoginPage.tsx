import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useUserStore } from '../store/userStore';
import { CloudflareTurnstile } from './CloudflareTurnstile';

interface LoginPageProps {
  onSuccessLogin?: () => void;
  onSsoLogin?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccessLogin, onSsoLogin }) => {
  const { loginUser } = useAuthStore();
  const { users, updateProfile } = useUserStore();

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
      setErrorMessage('Harap selesaikan verifikasi keamanan Cloudflare terlebih dahulu.');
      return;
    }

    setIsLoading(true);

    // Simulasi respons cepat < 300ms untuk keamanan dan audit
    setTimeout(() => {
      // Cari pengguna di database userStore
      const matchedUser = users.find(
        (u) =>
          (u.username.toLowerCase() === cleanInput || u.email.toLowerCase() === cleanInput) &&
          u.password === cleanPassword
      );

      if (!matchedUser) {
        setIsLoading(false);
        setErrorMessage('Username/Email atau kata sandi yang Anda masukkan salah.');
        return;
      }

      if (matchedUser.status === 'Nonaktif') {
        setIsLoading(false);
        setErrorMessage('Akun Anda saat ini dinonaktifkan. Silakan hubungi Super Administrator.');
        return;
      }

      // Login berhasil: Simpan ke AuthStore & sinkronkan profil aktif
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
    <div className="relative min-h-screen flex items-center justify-center bg-slate-950 p-4 overflow-hidden select-none">
      {/* Dynamic Ambient Background Aura (BPJS Palette & Cloudflare Aura) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-20 w-[600px] h-[600px] bg-[#44853b]/20 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-28 w-[600px] h-[600px] bg-[#2b4390]/25 rounded-full blur-[150px]" />
        <div className="absolute -bottom-36 left-1/3 w-[650px] h-[550px] bg-[#F38020]/10 rounded-full blur-[160px]" />
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-md rounded-3xl glass-panel p-8 sm:p-10 border border-white/15 shadow-2xl backdrop-blur-2xl text-slate-200 animate-fadeIn">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-[#44853b] via-[#6573a1] to-[#2b4390] p-[1.5px] shadow-xl shadow-[#44853b]/25 mb-4">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <svg
                className="w-8 h-8 text-[#44853b] dark:text-emerald-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center justify-center gap-1.5">
            <span>SAPA</span>
            <span className="bpjs-gradient-text font-black">YANFASKES</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Saluran Analisis Performa & Akselerasi Fasilitas Kesehatan
          </p>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mb-5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2.5 animate-fadeIn">
            <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-300 mb-1.5">
              Username atau Alamat Email
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="misal: admin_jember atau email@bpjs"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-white placeholder-slate-500 font-medium focus:outline-hidden focus:ring-2 focus:ring-[#44853b]/50 focus:border-[#44853b]"
              />
              <svg className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-slate-300">
                Kata Sandi (Password)
              </label>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi akun"
                className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-white placeholder-slate-500 font-medium focus:outline-hidden focus:ring-2 focus:ring-[#44853b]/50 focus:border-[#44853b]"
              />
              <svg className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                title={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none text-slate-400">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-[#44853b] focus:ring-[#44853b] border-slate-700 bg-slate-900 cursor-pointer"
              />
              <span>Ingat Sesi Saya</span>
            </label>

            <span className="text-[11px] text-emerald-400 hover:underline cursor-pointer">
              Bantuan Akun
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
              theme="dark"
            />
          </div>

          {/* Tombol Submit Masuk */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 rounded-xl font-bold text-white bpjs-gradient-btn shadow-lg shadow-[#44853b]/30 hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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

        {/* Divider / SSO Option */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <span className="relative px-3 bg-slate-950 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            Atau
          </span>
        </div>

        {/* SSO Button Alternatif */}
        <button
          onClick={onSsoLogin}
          className="w-full py-2.5 rounded-xl border border-slate-700/80 bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2.5 transition-all cursor-pointer"
        >
          <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-[#009B4D] to-[#00529C] flex items-center justify-center">
            <span className="text-[10px] font-black text-white">SSO</span>
          </div>
          <span>Masuk Melalui Single Sign-On BPJS</span>
        </button>

        {/* Footer Security Badges */}
        <div className="mt-8 pt-5 border-t border-slate-800/80 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400">
            <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Terproteksi Cloudflare WAF • SSL/TLS 1.3 • Zero-Trust BPJS</span>
          </div>
        </div>
      </div>
    </div>
  );
};
