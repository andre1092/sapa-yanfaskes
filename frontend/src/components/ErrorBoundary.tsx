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
        <section className="sapa-page min-w-0" aria-labelledby="component-error-title">
          <div className="sapa-panel p-6 sm:p-8 space-y-5" role="alert">
            <div className="space-y-2">
              <p className="sapa-eyebrow">Pemulihan tampilan</p>
              <h2 id="component-error-title" className="sapa-page-title">
                {this.props.fallbackTitle || 'Komponen belum dapat dimuat'}
              </h2>
              <p className="text-[var(--text-muted)] max-w-2xl">
                Terjadi kendala saat menampilkan data. Coba muat ulang komponen untuk melanjutkan pekerjaan Anda.
              </p>
            </div>
            {this.state.error?.message && (
              <details className="sapa-panel p-4 text-sm">
                <summary className="cursor-pointer font-semibold">Detail kendala</summary>
                <p className="mt-2 break-words font-mono text-[var(--text-muted)]">{this.state.error.message}</p>
              </details>
            )}
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={this.handleReset} className="sapa-button sapa-button-primary">Coba lagi</button>
              <button type="button" onClick={this.handleReload} className="sapa-button sapa-button-secondary">Segarkan halaman</button>
            </div>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
