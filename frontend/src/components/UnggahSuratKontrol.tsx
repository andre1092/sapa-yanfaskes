import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { apiClient } from '../lib/apiClient';
import { tanggalData } from '../lib/ssbiJadwal';
import { JENIS, STATUS, angka, bulanDariBerkas, cekBerkasUnggah, labelBulan, tanggalSampai } from '../lib/suratKontrol';
import type { Jumlah } from '../lib/suratKontrol';

type InfoBulan = { bulan: string; sampai: string; diunggah_pada: string; diunggah_oleh: string };
type RingkasJenis = { total: Jumlah; faskes: number; poli: number };
type HasilPeriksa = { ringkasan: { bulan: string; sampai: string; jenis: Record<'RJ' | 'RI', RingkasJenis> }; ada: InfoBulan | null; faskes_tak_dikenal: string[] | null };
type Tahap = 'kosong' | 'memeriksa' | 'cocok' | 'galat' | 'mengirim' | 'berhasil' | 'gagal' | 'sibuk';

const TAUTAN_BI = 'https://bi.bpjs-kesehatan.go.id/views/MonitoringPenerbitanSuratKontrolCabang/MonitoringPenerbitanSuratKontrol';

const pesanGalat = (error: unknown, cadangan: string) => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : cadangan;
};
const statusHttp = (error: unknown) => (error as { response?: { status?: number } })?.response?.status;

async function base64(berkas: File): Promise<string> {
  const byte = new Uint8Array(await berkas.arrayBuffer());
  let biner = '';
  for (let i = 0; i < byte.length; i += 0x8000) biner += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return btoa(biner);
}

async function bungkus(berkas: File[]): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('Browser ini belum bisa mengompres berkas. Pakai Chrome, Edge, atau Firefox versi terbaru.');
  }
  const isi = JSON.stringify({ berkas: await Promise.all(berkas.map(async b => ({ nama: b.name, isi: await base64(b) }))) });
  return new Response(new Blob([isi]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

const kirim = (aksi: 'periksa' | 'integrasikan', bulan: string, gz: Blob) =>
  apiClient.post(`/api/v1/surat-kontrol/${aksi}`, gz, { params: { bulan }, headers: { 'Content-Type': 'application/gzip' }, timeout: 60000 });

const ringkasJumlah = (j: Jumlah) => (['lt', 'eq', 'gt'] as const).filter(k => k !== 'gt' || j.gt > 0).map(k => `${STATUS[k].label} ${angka(j[k])}`).join(' · ');

export function UnggahSuratKontrol() {
  const queryClient = useQueryClient();
  const status = useQuery<{ bulan: InfoBulan[] }, Error>({
    queryKey: ['surat-kontrol-status'],
    queryFn: async ({ signal }) => (await apiClient.get('/api/v1/surat-kontrol/status', { signal, timeout: 30000 })).data,
    staleTime: 30 * 1000,
    retry: 1,
  });
  const tersimpan = status.data?.bulan ?? [];
  const [bulan, setBulan] = useState('');
  const [berkas, setBerkas] = useState<File[]>([]);
  const [gz, setGz] = useState<Blob | null>(null);
  const [hasil, setHasil] = useState<HasilPeriksa | null>(null);
  const [tahap, setTahap] = useState<Tahap>('kosong');
  const [galat, setGalat] = useState('');
  const [dialog, setDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sibuk = tahap === 'memeriksa' || tahap === 'mengirim';

  const periksa = async (daftar: File[], bln: string) => {
    setHasil(null); setGz(null);
    const salah = cekBerkasUnggah(daftar, bln);
    if (salah) { setGalat(salah); setTahap('galat'); return; }
    setGalat(''); setTahap('memeriksa');
    try {
      const paket = await bungkus(daftar);
      const res = await kirim('periksa', bln, paket);
      setGz(paket); setHasil(res.data); setTahap('cocok');
    } catch (error) {
      setGalat(statusHttp(error) === undefined && error instanceof Error && error.message.startsWith('Browser')
        ? error.message : pesanGalat(error, 'Berkas belum bisa diperiksa. Coba lagi.'));
      setTahap('galat');
    }
  };

  const pilih = (files: FileList | null | undefined) => {
    if (!files || sibuk) return;
    const daftar = Array.from(files);
    const usul = bulan || bulanDariBerkas(daftar.map(b => b.name)) || '';
    setBerkas(daftar); setBulan(usul);
    void periksa(daftar, usul);
  };

  const gantiBulan = (nilai: string) => {
    setBulan(nilai);
    if (berkas.length) void periksa(berkas, nilai);
  };

  const integrasikan = async () => {
    if (!gz || !hasil) return;
    setDialog(false); setTahap('mengirim');
    try {
      const res = await kirim('integrasikan', bulan, gz);
      queryClient.setQueryData(['surat-kontrol-status'], { bulan: res.data.bulan });
      queryClient.invalidateQueries({ queryKey: ['surat-kontrol'] });
      setTahap('berhasil');
    } catch (error) {
      if (statusHttp(error) === 409) { setTahap('sibuk'); return; }
      setGalat(pesanGalat(error, 'koneksi terputus')); setTahap('gagal');
    }
  };

  const batal = () => {
    setBerkas([]); setGz(null); setHasil(null); setGalat(''); setTahap('kosong');
    if (inputRef.current) inputRef.current.value = '';
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); pilih(e.dataTransfer.files); };
  const bisa = !!hasil && (tahap === 'cocok' || tahap === 'gagal' || tahap === 'sibuk');

  return (
    <section aria-labelledby="sk-unggah" className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-5">
      <h2 id="sk-unggah" className="text-base font-bold text-[var(--text-main)]">Monitoring Surat Kontrol</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Unggah 10 berkas Crosstab BI untuk satu bulan. Unggah ulang hanya mengganti bulan itu; bulan lain tetap.
      </p>

      <div className="mt-3 text-sm">
        <h3 className="font-semibold text-[var(--text-main)]">Bulan tersimpan</h3>
        {status.isLoading ? <p className="text-[var(--text-muted)]">Memuat…</p>
          : status.isError ? <p role="alert" className="text-[var(--danger)]">{pesanGalat(status.error, 'Daftar bulan belum bisa dimuat.')}</p>
          : tersimpan.length === 0 ? <p className="text-[var(--text-muted)]">Belum ada. Menu Monitoring Surat Kontrol masih kosong sampai bulan pertama diunggah.</p>
          : <ul className="mt-1 space-y-1">{tersimpan.slice().reverse().map(b => (
            <li key={b.bulan} className="text-[var(--text-main)]"><strong>{labelBulan(b.bulan)}</strong>
              <span className="text-[var(--text-muted)]">, data SEP sampai {tanggalSampai(b.sampai)}; diunggah {tanggalData(b.diunggah_pada, true)}{b.diunggah_oleh ? ` oleh ${b.diunggah_oleh}` : ''}</span></li>))}
          </ul>}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-main)]" htmlFor="sk-bulan-unggah">
          Bulan data
          <input id="sk-bulan-unggah" type="month" min="2026-11" value={bulan} disabled={sibuk}
            onChange={(e: ChangeEvent<HTMLInputElement>) => gantiBulan(e.target.value)}
            className="min-h-[44px] rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 font-normal" />
        </label>
      </div>

      <div onDragOver={e => e.preventDefault()} onDrop={onDrop}
        className={`mt-4 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-color)] p-6 text-center text-sm ${sibuk ? 'opacity-60' : ''}`}>
        <span className="text-[var(--text-main)]">Seret 10 berkas ke sini, atau</span>
        <label className={`sapa-button sapa-button-secondary focus-within:outline focus-within:outline-2 ${sibuk ? 'pointer-events-none' : 'cursor-pointer'}`}>
          Pilih berkas
          <input ref={inputRef} type="file" multiple accept=".csv,text/csv" className="sr-only" disabled={sibuk}
            onChange={(e: ChangeEvent<HTMLInputElement>) => pilih(e.target.files)} />
        </label>
        <span className="text-xs text-[var(--text-muted)]">Nama berkas: YYYY-MM_RJ_&lt;Sheet&gt;.csv dan YYYY-MM_RI_&lt;Sheet&gt;.csv. Keterangan boleh tidak disertakan.</span>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer py-3 font-semibold text-[var(--text-main)]">Cara mengambil berkas dari BI</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--text-muted)]">
          <li>Buka dashboard <a className="tautan-kalimat underline text-[var(--action-primary)]" href={TAUTAN_BI} target="_blank" rel="noopener noreferrer">Monitoring Penerbitan Surat Kontrol</a> di BI.</li>
          <li>Pilih bulan di filter Tgl SEP, Fasilitas Kesehatan (All), Status (All), lalu Jenis Pelayanan Rawat Jalan.</li>
          <li>Download → Crosstab → CSV untuk sheet Faskes Surkon, Header Surkon, Keterangan, Poli, Tren.</li>
          <li>Beri awalan nama berkas, misalnya <code>2026-11_RJ_Tren.csv</code>. Ulangi untuk Rawat Inap dengan awalan <code>_RI_</code>.</li>
          <li>Unggah tanpa membuka berkas di Excel.</li>
        </ol>
      </details>

      <div className="mt-4 flex flex-col gap-3 text-sm">
        {tahap === 'memeriksa' && <p role="status" className="text-[var(--text-muted)]">Memeriksa {berkas.length} berkas…</p>}
        {tahap === 'galat' && <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-[var(--danger)]">{galat}</p>}
        {hasil && tahap !== 'berhasil' && (
          <div role="status" className="rounded-lg bg-[var(--surface-subtle)] p-3 text-[var(--text-main)]">
            <p><strong>{labelBulan(hasil.ringkasan.bulan)}</strong>, data SEP sampai {tanggalSampai(hasil.ringkasan.sampai)}. Angka antar-sheet cocok.</p>
            <ul className="mt-2 space-y-1">
              {(['RJ', 'RI'] as const).map(j => {
                const r = hasil.ringkasan.jenis[j];
                return <li key={j}>✓ {JENIS[j]}: {ringkasJumlah(r.total)}; {angka(r.faskes)} faskes, {angka(r.poli)} poli</li>;
              })}
            </ul>
            {hasil.faskes_tak_dikenal && hasil.faskes_tak_dikenal.length > 0 && (
              <p className="mt-3 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3">
                <strong>{angka(hasil.faskes_tak_dikenal.length)} faskes belum dikenali SAPA:</strong> {hasil.faskes_tak_dikenal.join('; ')}.
                {' '}Datanya tetap tampil untuk semua peran, tetapi belum ada akun Petugas RS yang terhubung ke faskes ini.
              </p>
            )}
          </div>
        )}
        {hasil?.ada && bisa && (
          <p className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-[var(--text-main)]">
            <strong>Data {labelBulan(hasil.ringkasan.bulan)} akan diganti.</strong> Data lama (sampai {tanggalSampai(hasil.ada.sampai)}) dihapus. Bulan lain tidak berubah.
          </p>
        )}
        {tahap === 'mengirim' && <p role="status" className="text-[var(--text-muted)]">Menyimpan {labelBulan(bulan)}… Jangan tutup halaman ini.</p>}
        {tahap === 'berhasil' && <p role="status" className="rounded-lg border border-[var(--success)] p-3 text-[var(--text-main)]">
          Data {labelBulan(bulan)} tersimpan. Pengguna sudah bisa melihatnya di menu Monitoring Surat Kontrol.</p>}
        {tahap === 'gagal' && <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-[var(--danger)]">
          Integrasi gagal: {galat.charAt(0).toLowerCase() + galat.slice(1).replace(/\.$/, '')}. Data lama tetap dipakai.</p>}
        {tahap === 'sibuk' && <p role="alert" className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-[var(--text-main)]">
          Admin lain sedang mengintegrasikan data. Coba lagi setelah selesai.</p>}
      </div>

      {tahap !== 'berhasil' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="sapa-button sapa-button-primary" disabled={!bisa} aria-busy={tahap === 'mengirim'}
            onClick={() => (hasil?.ada ? setDialog(true) : integrasikan())}>
            {tahap === 'mengirim' ? 'Menyimpan…' : tahap === 'gagal' ? 'Coba lagi' : 'Integrasikan'}
          </button>
          {berkas.length > 0 && !sibuk && <button type="button" className="sapa-button sapa-button-secondary" onClick={batal}>Batal</button>}
        </div>
      ) : <button type="button" className="sapa-button sapa-button-secondary mt-4" onClick={batal}>Unggah bulan lain</button>}

      <Dialog open={dialog} onClose={() => setDialog(false)} aria-labelledby="sk-dialog-judul">
        <DialogTitle id="sk-dialog-judul">Ganti data {labelBulan(bulan)}?</DialogTitle>
        <DialogContent><p className="text-sm">Data {labelBulan(bulan)} yang tersimpan diganti dengan berkas ini. Bulan lain tidak berubah.</p></DialogContent>
        <DialogActions>
          <button type="button" className="sapa-button sapa-button-secondary" autoFocus onClick={() => setDialog(false)}>Batal</button>
          <button type="button" className="sapa-button sapa-button-primary" onClick={integrasikan}>Ganti data</button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
