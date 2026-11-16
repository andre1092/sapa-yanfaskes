import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { apiClient } from '../lib/apiClient';
import {
  BATAS_MENTAH_MB, angka, bulanHilang, cekBerkas, cekHasilKompres, labelBulan, rentangBulan, tanggalData, ukuranMb,
} from '../lib/ssbiJadwal';
import type { InfoAktif, Ringkasan } from '../lib/ssbiJadwal';

const TAUTAN_SSBI = 'https://ssbi.bpjs-kesehatan.go.id/views/07_Kesesuaian_Jadwal/FKRTL.csv';
const KOLOM = ['Kabupaten', 'Nama Faskes', 'Tipe Faskes', 'Nama Poli', 'Nama Dokter', 'Waktu SIMRS', 'Jam Buka HFIS',
  'Jam Tutup HFIS', 'Day, Month, Year of Periode Data', 'Hari HFIS', 'Status'];

type Tahap = 'kosong' | 'memeriksa' | 'cocok' | 'galat' | 'mengirim' | 'menyimpan' | 'berhasil' | 'gagal' | 'sibuk';
type Pilihan = { nama: string; ukuran: number; gz: Blob; ringkasan: Ringkasan };

const pesanGalat = (error: unknown, cadangan: string) => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : cadangan;
};
const statusHttp = (error: unknown) => (error as { response?: { status?: number } })?.response?.status;

async function kompres(berkas: File): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('Browser ini belum bisa mengompres berkas. Pakai Chrome, Edge, atau Firefox versi terbaru.');
  }
  return new Response(berkas.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

const kirim = (path: string, pilihan: Pick<Pilihan, 'nama' | 'gz'>, onUploadProgress?: (selesai: boolean) => void) =>
  apiClient.post(path, pilihan.gz, {
    headers: { 'Content-Type': 'application/gzip', 'X-Nama-Berkas': encodeURIComponent(pilihan.nama) },
    timeout: 120000,
    onUploadProgress: onUploadProgress ? (e) => onUploadProgress(!e.total || e.loaded >= e.total) : undefined,
  });

function ringkasAktif(a: InfoAktif) {
  return `${a.nama_berkas || 'FKRTL.csv'}, ${angka(a.baris)} baris, ${rentangBulan(a.bulan)}`;
}

function Centang({ selesai, berjalan, children }: { selesai: boolean; berjalan?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden="true" className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
        selesai ? 'bg-[var(--success)] text-white' : berjalan ? 'border-2 border-[var(--action-primary)] animate-pulse' : 'border border-[var(--border-color)]'}`}
      >{selesai ? '✓' : ''}</span>
      <span className={selesai || berjalan ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}>
        {children}{selesai ? <span className="sr-only"> (selesai)</span> : berjalan ? <span className="sr-only"> (berjalan)</span> : null}
      </span>
    </li>
  );
}

export function DataIntegrationView() {
  const queryClient = useQueryClient();
  const status = useQuery<{ aktif: InfoAktif | null }, Error>({
    queryKey: ['ssbi-jadwal-status'],
    queryFn: async ({ signal }) => (await apiClient.get('/api/v1/ssbi-jadwal/status', { signal, timeout: 30000 })).data,
    staleTime: 30 * 1000,
    retry: 1,
  });
  const aktif = status.data?.aktif ?? null;
  const [tahap, setTahap] = useState<Tahap>('kosong');
  const [pilihan, setPilihan] = useState<Pilihan | null>(null);
  const [galat, setGalat] = useState('');
  const [dialog, setDialog] = useState(false);
  const [seret, setSeret] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasilRef = useRef<HTMLDivElement>(null);
  const sibukProses = tahap === 'mengirim' || tahap === 'menyimpan';

  useEffect(() => {
    if (tahap === 'berhasil' || tahap === 'gagal') hasilRef.current?.focus();
  }, [tahap]);

  useEffect(() => {
    if (!sibukProses) return;
    const cegah = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', cegah);
    return () => window.removeEventListener('beforeunload', cegah);
  }, [sibukProses]);

  const batal = () => {
    setPilihan(null);
    setGalat('');
    setTahap('kosong');
    if (inputRef.current) inputRef.current.value = '';
  };

  const pilih = async (berkas: File | undefined) => {
    if (!berkas || sibukProses) return;
    setPilihan(null);
    const salah = cekBerkas(berkas.name, berkas.size);
    if (salah) { setGalat(salah); setTahap('galat'); return; }
    setGalat('');
    setTahap('memeriksa');
    try {
      const gz = await kompres(berkas);
      const besar = cekHasilKompres(gz.size);
      if (besar) { setGalat(besar); setTahap('galat'); return; }
      const res = await kirim('/api/v1/ssbi-jadwal/periksa', { nama: berkas.name, gz });
      setPilihan({ nama: berkas.name, ukuran: berkas.size, gz, ringkasan: res.data.ringkasan });
      setTahap('cocok');
    } catch (error) {
      setGalat(statusHttp(error) === undefined && error instanceof Error && error.message.startsWith('Browser')
        ? error.message
        : pesanGalat(error, 'Berkas belum bisa diperiksa. Coba lagi.'));
      setTahap('galat');
    }
  };

  const integrasikan = async () => {
    if (!pilihan) return;
    setDialog(false);
    setTahap('mengirim');
    try {
      const res = await kirim('/api/v1/ssbi-jadwal/integrasikan', pilihan, (selesai) => { if (selesai) setTahap('menyimpan'); });
      queryClient.setQueryData(['ssbi-jadwal-status'], { aktif: res.data.aktif });
      queryClient.invalidateQueries({ queryKey: ['ssbi-jadwal-bulan'] });
      setTahap('berhasil');
    } catch (error) {
      if (statusHttp(error) === 409) { setTahap('sibuk'); return; }
      setGalat(pesanGalat(error, 'Koneksi terputus'));
      setTahap('gagal');
    }
  };

  const mulai = () => (aktif ? setDialog(true) : integrasikan());
  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setSeret(false); pilih(e.dataTransfer.files?.[0]); };
  const r = pilihan?.ringkasan;
  const bulanBaru = r ? Object.keys(r.bulan) : [];
  const hilang = aktif && r ? bulanHilang(aktif.bulan, bulanBaru) : [];
  const bisaIntegrasi = tahap === 'cocok' || tahap === 'gagal' || tahap === 'sibuk';

  return (
    <div className="sapa-page flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Integrasi data</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">
          Unggah data SSBI Kesesuaian Jadwal Praktik Dokter FKRTL, lalu integrasikan. Setelah itu pengguna bisa mengunduh
          detailnya per bulan di menu Kepatuhan FKRTL.
        </p>
      </header>

      <section aria-labelledby="ssbi-aktif" className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-5">
        <h2 id="ssbi-aktif" className="text-base font-bold text-[var(--text-main)]">Data yang sedang dipakai</h2>
        {status.isLoading ? (
          <p className="mt-2 text-sm text-[var(--text-muted)]">Memuat…</p>
        ) : status.isError ? (
          <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{pesanGalat(status.error, 'Data aktif belum bisa dimuat. Muat ulang halaman.')}</p>
        ) : aktif ? (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-[var(--text-muted)]">Berkas</dt><dd className="text-[var(--text-main)] break-all">{aktif.nama_berkas || 'FKRTL.csv'}</dd>
            <dt className="text-[var(--text-muted)]">Diintegrasikan</dt>
            <dd className="text-[var(--text-main)]">{tanggalData(aktif.diunggah_pada, true)}{aktif.diunggah_oleh ? `, oleh ${aktif.diunggah_oleh}` : ''}</dd>
            <dt className="text-[var(--text-muted)]">Isi</dt><dd className="text-[var(--text-main)]">{angka(aktif.baris)} baris, {angka(aktif.faskes)} faskes</dd>
            <dt className="text-[var(--text-muted)]">Periode</dt><dd className="text-[var(--text-main)]">{rentangBulan(aktif.bulan)}</dd>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Belum ada data SSBI. Unggah berkas pertama di bawah. Sampai saat itu, tombol Download Detail di Kepatuhan FKRTL belum aktif.
          </p>
        )}
      </section>

      <section aria-labelledby="ssbi-unggah" className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-5">
        <h2 id="ssbi-unggah" className="text-base font-bold text-[var(--text-main)]">Unggah data baru</h2>
        <ol className="mt-1 flex flex-wrap gap-x-4 text-xs text-[var(--text-muted)]">
          <li>1 Pilih berkas</li><li>2 Periksa isi</li><li>3 Integrasikan</li>
        </ol>

        <div
          onDragOver={(e) => { e.preventDefault(); if (!sibukProses) setSeret(true); }}
          onDragLeave={() => setSeret(false)}
          onDrop={onDrop}
          className={`mt-4 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm ${
            seret ? 'border-[var(--action-primary)] bg-[var(--surface-subtle)]' : 'border-[var(--border-color)]'} ${sibukProses ? 'opacity-60' : ''}`}
        >
          <span className="text-[var(--text-main)]">Seret berkas ke sini, atau</span>
          <label className={`sapa-button sapa-button-secondary focus-within:outline focus-within:outline-2 ${sibukProses ? 'pointer-events-none' : 'cursor-pointer'}`}>
            Pilih berkas
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={sibukProses}
              onChange={(e: ChangeEvent<HTMLInputElement>) => pilih(e.target.files?.[0])}
            />
          </label>
          <span className="text-xs text-[var(--text-muted)]">Berkas CSV hasil unduhan FKRTL.csv dari SSBI. Paling besar {BATAS_MENTAH_MB} MB.</span>
        </div>

        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-[var(--text-main)]">Cara mengambil berkas dari SSBI</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--text-muted)]">
            <li>Login ke SSBI.</li>
            <li>Di browser yang sama, buka tautan <a className="underline text-[var(--action-primary)]" href={TAUTAN_SSBI} target="_blank" rel="noopener noreferrer">FKRTL.csv</a>. Berkas langsung terunduh dalam ±2 menit.</li>
            <li>Unggah berkas yang terunduh tanpa diubah dan tanpa dibuka di Excel.</li>
          </ol>
        </details>
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-semibold text-[var(--text-main)]">Kolom yang dibutuhkan</summary>
          <p className="mt-2 text-[var(--text-muted)]">{KOLOM.join(' · ')}. Urutan kolom bebas.</p>
        </details>

        <div className="mt-4 flex flex-col gap-3 text-sm">
          {tahap === 'memeriksa' && <p role="status" className="text-[var(--text-muted)]">Memeriksa berkas…</p>}
          {tahap === 'galat' && (
            <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-[var(--danger)]">{galat}</p>
          )}
          {pilihan && r && tahap !== 'berhasil' && (
            <div role="status" className="rounded-lg bg-[var(--surface-subtle)] p-3">
              <p className="flex flex-wrap items-center gap-2 text-[var(--text-main)]">
                <strong className="break-all">{pilihan.nama}</strong>
                <span className="text-[var(--text-muted)]">{ukuranMb(pilihan.ukuran)} MB</span>
                {!sibukProses && <button type="button" className="underline text-[var(--action-primary)]" onClick={() => inputRef.current?.click()}>Ganti berkas</button>}
              </p>
              <ul className="mt-2 space-y-1">
                <Centang selesai>11 kolom sesuai</Centang>
                <Centang selesai>{angka(r.baris)} baris</Centang>
                <Centang selesai>Periode {rentangBulan(bulanBaru)}</Centang>
                <Centang selesai>{angka(r.faskes)} faskes</Centang>
                <Centang selesai>Per kabupaten: {Object.entries(r.kabupaten).map(([k, n]) => `${k.replace(/^KAB\.\s*/i, '')} ${angka(n)}`).join(', ')}</Centang>
              </ul>
            </div>
          )}
          {aktif && r && bisaIntegrasi && (
            <p className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-[var(--text-main)]">
              Data lama akan diganti total. {ringkasAktif(aktif)} dihapus dan diganti berkas ini.
              {hilang.length > 0 && ` Setelah diganti, detail ${hilang.map(labelBulan).join(', ')} tidak bisa diunduh lagi.`}
            </p>
          )}
          {sibukProses && pilihan && (
            <div role="status" className="rounded-lg bg-[var(--surface-subtle)] p-3">
              <ul className="space-y-1">
                <Centang selesai>Membaca dan mengompres berkas</Centang>
                <Centang selesai={tahap === 'menyimpan'} berjalan={tahap === 'mengirim'}>Mengirim berkas ({ukuranMb(pilihan.gz.size)} MB setelah dikompres)</Centang>
                <Centang selesai={false} berjalan={tahap === 'menyimpan'}>Memeriksa {angka(pilihan.ringkasan.baris)} baris</Centang>
                <Centang selesai={false} berjalan={tahap === 'menyimpan'}>Menyimpan dan mengganti data lama</Centang>
              </ul>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Jangan tutup halaman ini sampai unggahan selesai.</p>
            </div>
          )}
          {tahap === 'berhasil' && aktif && (
            <div ref={hasilRef} tabIndex={-1} role="status" className="rounded-lg border border-[var(--success)] p-3 text-[var(--text-main)]">
              Data SSBI terintegrasi. {angka(aktif.baris)} baris, periode {rentangBulan(aktif.bulan)}. Pengguna sudah bisa mengunduh
              detailnya di Kepatuhan FKRTL.
            </div>
          )}
          {tahap === 'gagal' && (
            <div ref={hasilRef} tabIndex={-1} role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-[var(--danger)]">
              Integrasi gagal: {galat.replace(/\.$/, '')}. Data lama tetap dipakai, tidak ada yang berubah.
            </div>
          )}
          {tahap === 'sibuk' && (
            <p role="alert" className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-[var(--text-main)]">
              Admin lain sedang mengintegrasikan data. Coba lagi setelah selesai.
            </p>
          )}
        </div>

        {tahap !== 'berhasil' ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="sapa-button sapa-button-primary" onClick={mulai} disabled={!bisaIntegrasi || !pilihan} aria-busy={sibukProses}>
              {sibukProses ? 'Mengintegrasikan…' : tahap === 'gagal' ? 'Coba lagi' : 'Integrasikan'}
            </button>
            {pilihan && !sibukProses && <button type="button" className="sapa-button sapa-button-secondary" onClick={batal}>Batal</button>}
          </div>
        ) : (
          <button type="button" className="sapa-button sapa-button-secondary mt-4" onClick={batal}>Unggah berkas lain</button>
        )}
      </section>

      <Dialog open={dialog} onClose={() => setDialog(false)} aria-labelledby="ssbi-dialog-judul">
        <DialogTitle id="ssbi-dialog-judul">Ganti data SSBI?</DialogTitle>
        <DialogContent>
          {aktif && pilihan && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-[var(--text-muted)]">Sekarang</dt><dd>{ringkasAktif(aktif)}</dd>
              <dt className="text-[var(--text-muted)]">Penggantinya</dt><dd>{pilihan.nama}, {angka(pilihan.ringkasan.baris)} baris, {rentangBulan(bulanBaru)}</dd>
            </dl>
          )}
          <p className="mt-3 text-sm">Data lama dihapus dan tidak bisa dikembalikan.</p>
        </DialogContent>
        <DialogActions>
          <button type="button" className="sapa-button sapa-button-secondary" autoFocus onClick={() => setDialog(false)}>Batal</button>
          <button type="button" className="sapa-button sapa-button-primary" onClick={integrasikan}>Ganti data</button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
