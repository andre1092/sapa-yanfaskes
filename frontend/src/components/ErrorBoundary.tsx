import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[SAPA YANFASKES] Uncaught Error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-6 sm:p-10 max-w-4xl mx-auto w-full animate-fadeIn">
          <div className="glass-card rounded-3xl p-8 sm:p-10 border border-rose-500/30 dark:border-rose-500/40 shadow-2xl bg-gradient-to-b from-rose-500/10 via-slate-900/60 to-slate-950/80 text-center relative overflow-hidden">
            {/* Ambient Background Aura */}
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-[#2b4390]/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center">
              {/* Error Icon Badge */}
              <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mb-5 shadow-lg shadow-rose-950/40">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {this.props.fallbackTitle || 'Terjadi Kendala Memuat Komponen'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-lg leading-relaxed">
                Sistem SAPA YANFASKES mengamankan antarmuka dari gangguan data yang tidak terduga. Komponen ini dapat
                dimuat ulang tanpa mempengaruhi sesi atau navigasi Anda.
              </p>

              {this.state.error?.message && (
                <div className="mt-4 px-4 py-2.5 rounded-xl bg-slate-950/80 border border-rose-500/20 text-rose-300 font-mono text-[11px] max-w-xl truncate">
                  Error: {this.state.error.message}
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={this.handleReset}
                  className="px-5 py-2.5 bpjs-gradient-btn text-white text-xs font-bold rounded-xl shadow-lg shadow-[#44853b]/30 border border-emerald-400/40 active:scale-95 transition-transform cursor-pointer"
                >
                  Muat Ulang Komponen
                </button>
                <button
                  onClick={this.handleReload}
                  className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/20 active:scale-95 transition-all cursor-pointer"
                >
                  Segarkan Halaman (Reload)
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
