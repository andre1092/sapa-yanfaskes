interface KerangkaMemuatProps {
  /** Teks untuk pembaca layar, misalnya "Memuat data kepatuhan". */
  label: string;
  /** "halaman" menambah jarak tepi seperti halaman penuh; "tab" untuk isi di dalam tab. */
  varian?: 'tab' | 'halaman';
}

const Garis = ({ className }: { className: string }) => <div className={`sapa-kerangka-garis ${className}`} />;

/**
 * Kerangka selama data dimuat. Bentuknya mengikuti isi akhir halaman data (ringkasan filter,
 * empat kartu angka, grafik, tabel) supaya tata letak tidak melompat saat data datang.
 * Audit UI/UX 2026-11-12, temuan 11.
 */
export function KerangkaMemuat({ label, varian = 'tab' }: KerangkaMemuatProps) {
  return (
    <div className={`sapa-kerangka space-y-6 ${varian === 'halaman' ? 'p-4 sm:p-6 lg:p-8' : ''}`} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-6">
        <div className="sapa-kerangka-kartu p-4"><Garis className="h-4 w-3/5" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="sapa-kerangka-kartu p-5">
              <Garis className="h-3 w-1/2" />
              <Garis className="h-8 w-2/3 mt-3" />
              <Garis className="h-3 w-full mt-4" />
            </div>
          ))}
        </div>
        <div className="sapa-kerangka-kartu p-5">
          <Garis className="h-4 w-1/3" />
          <Garis className="h-48 w-full mt-4" />
        </div>
        <div className="sapa-kerangka-kartu p-4 space-y-3">
          {[0, 1, 2, 3, 4].map(i => <Garis key={i} className="h-5 w-full" />)}
        </div>
      </div>
    </div>
  );
}
