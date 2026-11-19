import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { apiClient } from '../lib/apiClient';
import { tanggalData } from '../lib/ssbiJadwal';
import { BATAS_BERKAS_KB, SHEET, STATUS, angka, bulanUnggah, kenaliSheet, labelBulan, periksaArea, statusJenis, tanggalSampai } from '../lib/suratKontrol';
import type { Jumlah, KeadaanSheet, Sheet } from '../lib/suratKontrol';
import './suratKontrol.css';

// Hi-fi Kim bagian B (agents/kim/desain/monitoring-surkon/SPEK.md). Nama berkas tidak dikirim ke server.
type InfoBulan = { bulan: string; sampai: string; diunggah_pada: string; diunggah_oleh: string };
type RingkasJenis = { total: Jumlah; faskes: number; poli: number; selisih_poli: number };
type HasilPeriksa = {
  ringkasan: { bulan: string; sampai: string; jenis: Record<Area, RingkasJenis>; peringatan: string[] };
  ada: InfoBulan | null;
  faskes_tak_dikenal: string[] | null;
};
type Area = 'RJ' | 'RI';
type Pilihan = { berkas: File; sheet: Sheet | null };
type Tahap = 'pilih' | 'memeriksa' | 'cocok' | 'galat' | 'mengirim' | 'berhasil' | 'gagal' | 'sibuk';

const AREA: Record<Area, string> = { RJ: 'Rawat jalan', RI: 'Rawat inap' };
const TANDA: Record<KeadaanSheet, [string, string]> = { ada: ['✓', 'Ditemukan'], belum: ['○', 'Belum ada'], ganda: ['⚠', 'Terpilih dua kali'] };

const pesanGalat = (error: unknown, cadangan: string) => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : cadangan;
};
const statusHttp = (error: unknown) => (error as { response?: { status?: number } })?.response?.status;

async function bacaSheet(berkas: File): Promise<Sheet | null> {
  if (berkas.size > BATAS_BERKAS_KB * 1024) return null;
  const awal = new Uint8Array(await berkas.slice(0, 4096).arrayBuffer());
  const utf16 = awal[0] === 0xff && awal[1] === 0xfe;
  const teks = new TextDecoder(utf16 ? 'utf-16le' : 'utf-8').decode(new Uint8Array(await berkas.arrayBuffer()));
  return kenaliSheet(teks);
}

async function base64(berkas: File): Promise<string> {
  const byte = new Uint8Array(await berkas.arrayBuffer());
  let biner = '';
  for (let i = 0; i < byte.length; i += 0x8000) biner += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return btoa(biner);
}

async function bungkus(pilihan: Record<Area, Pilihan[]>): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('Browser ini belum bisa mengompres berkas. Pakai Chrome, Edge, atau Firefox versi terbaru.');
  }
  const daftar = await Promise.all((['RJ', 'RI'] as Area[]).flatMap(j => pilihan[j].map(async p => ({ jenis: j, isi: await base64(p.berkas) }))));
  return new Response(new Blob([JSON.stringify({ berkas: daftar })]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

const kirim = (aksi: 'periksa' | 'integrasikan', bulan: string, gz: Blob) =>
  apiClient.post(`/api/v1/surat-kontrol/${aksi}`, gz, { params: { bulan }, headers: { 'Content-Type': 'application/gzip' }, timeout: 60000 });

function ZonaUnggah({ area, pilihan, onPilih, nonaktif }: { area: Area; pilihan: Pilihan[]; onPilih: (files: File[]) => void; nonaktif: boolean }) {
  const [seret, setSeret] = useState(false);
  const cek = periksaArea(pilihan.map(p => p.sheet));
  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setSeret(false); if (!nonaktif) onPilih(Array.from(e.dataTransfer.files ?? [])); };
  return <div className="sk-zona" data-seret={seret} onDragOver={e => { e.preventDefault(); if (!nonaktif) setSeret(true); }} onDragLeave={() => setSeret(false)} onDrop={onDrop}>
    <h3>{AREA[area]}</h3>
    <p>Seret 5 berkas CSV ke sini, atau</p>
    <label className={`sapa-button sapa-button-secondary focus-within:outline focus-within:outline-2 ${nonaktif ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
      Pilih berkas<span className="sr-only"> {AREA[area].toLowerCase()}</span>
      <input type="file" multiple accept=".csv,text/csv" className="sr-only" disabled={nonaktif}
        onChange={(e: ChangeEvent<HTMLInputElement>) => { onPilih(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
    </label>
    <ul className="sk-cek" aria-label={`Sheet ${AREA[area].toLowerCase()}`}>
      {SHEET.map(s => <li key={s} data-k={cek.sheet[s]}><span className="sk-tanda" aria-hidden="true">{TANDA[cek.sheet[s]][0]}</span>
        <span><strong>{s}</strong>{s === 'Keterangan' ? ' (opsional)' : ''}: {TANDA[cek.sheet[s]][1]}</span></li>)}
    </ul>
    {cek.asing > 0 && <p className="sk-catatan" role="alert">{cek.asing} berkas tidak dikenali sebagai sheet Surat Kontrol.</p>}
  </div>;
}

export function UnggahSuratKontrol() {
  const queryClient = useQueryClient();
  const status = useQuery<{ bulan: InfoBulan[] }, Error>({
    queryKey: ['surat-kontrol-status'],
    queryFn: async ({ signal }) => (await apiClient.get('/api/v1/surat-kontrol/status', { signal, timeout: 30000 })).data,
    staleTime: 30 * 1000,
    retry: 1,
  });
  const tersimpan = status.data?.bulan ?? [];
  const pilihanBulan = bulanUnggah(new Date());
  const [bulan, setBulan] = useState(pilihanBulan[0]);
  const [pilihan, setPilihan] = useState<Record<Area, Pilihan[]>>({ RJ: [], RI: [] });
  const [gz, setGz] = useState<Blob | null>(null);
  const [hasil, setHasil] = useState<HasilPeriksa | null>(null);
  const [tahap, setTahap] = useState<Tahap>('pilih');
  const [galat, setGalat] = useState('');
  const [dialog, setDialog] = useState(false);
  const hasilRef = useRef<HTMLDivElement>(null);
  const sibuk = tahap === 'memeriksa' || tahap === 'mengirim';
  const lengkap = periksaArea(pilihan.RJ.map(p => p.sheet)).lengkap && periksaArea(pilihan.RI.map(p => p.sheet)).lengkap;

  useEffect(() => { if (tahap === 'berhasil' || tahap === 'gagal') hasilRef.current?.focus(); }, [tahap]);

  const ulang = () => { setHasil(null); setGz(null); setGalat(''); setTahap('pilih'); };
  const tambah = async (area: Area, files: File[]) => {
    const baru = await Promise.all(files.map(async berkas => ({ berkas, sheet: await bacaSheet(berkas).catch(() => null) })));
    setPilihan(p => ({ ...p, [area]: [...p[area], ...baru] }));
    ulang();
  };

  const periksa = async () => {
    setHasil(null); setGalat(''); setTahap('memeriksa');
    try {
      const paket = await bungkus(pilihan);
      const res = await kirim('periksa', bulan, paket);
      setGz(paket); setHasil(res.data); setTahap('cocok');
    } catch (error) {
      setGalat(statusHttp(error) === undefined && error instanceof Error && error.message.startsWith('Browser')
        ? error.message : pesanGalat(error, 'Berkas belum bisa diperiksa. Coba lagi.'));
      setTahap('galat');
    }
  };

  const integrasikan = async () => {
    if (!gz) return;
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

  const bersihkan = () => { setPilihan({ RJ: [], RI: [] }); ulang(); };
  const langkahAktif = tahap === 'berhasil' ? 4 : hasil ? 3 : lengkap ? 2 : 1;
  const bisaIntegrasi = !!hasil && (tahap === 'cocok' || tahap === 'gagal' || tahap === 'sibuk');

  return (
    <section aria-labelledby="sk-unggah" className="sk-unggah rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-5">
      <h2 id="sk-unggah" className="text-base font-bold text-[var(--text-main)]">Monitoring Surat Kontrol</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Unggah 10 berkas Crosstab dari dashboard BI per bulan. Unggahan mengganti data bulan itu saja; bulan lain tidak berubah.</p>

      <h3 className="mt-4 text-sm font-semibold text-[var(--text-main)]">Bulan yang tersimpan</h3>
      {status.isLoading ? <p className="text-sm text-[var(--text-muted)]">Memuat…</p>
        : status.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{pesanGalat(status.error, 'Daftar bulan belum bisa dimuat.')}</p>
        : tersimpan.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Belum ada bulan tersimpan.</p>
        : <table className="sk-tabel-bulan mt-1"><thead><tr><th scope="col">Bulan</th><th scope="col">Data SEP sampai</th><th scope="col">Diunggah</th><th scope="col">Oleh</th></tr></thead>
          <tbody>{tersimpan.slice().reverse().map(b => <tr key={b.bulan}><td><strong>{labelBulan(b.bulan)}</strong></td><td>{tanggalSampai(b.sampai)}</td>
            <td>{tanggalData(b.diunggah_pada, true)}</td><td>{b.diunggah_oleh}</td></tr>)}</tbody></table>}

      <h3 className="mt-5 text-sm font-semibold text-[var(--text-main)]">Unggah data bulan</h3>
      <ol className="sk-langkah mt-2">
        {['Pilih bulan', 'Pilih berkas', 'Periksa isi', 'Integrasikan'].map((nama, i) => <li key={nama} data-selesai={i < langkahAktif - 1 || tahap === 'berhasil'}
          aria-current={i === langkahAktif - 1 && tahap !== 'berhasil' ? 'step' : undefined}>{i + 1} {nama}</li>)}
      </ol>

      <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-main)]" htmlFor="sk-bulan-unggah">
        Bulan data
        <select id="sk-bulan-unggah" value={bulan} disabled={sibuk} onChange={e => { setBulan(e.target.value); ulang(); }}
          className="min-h-[44px] max-w-xs rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 font-normal">
          {pilihanBulan.map(b => <option key={b} value={b}>{labelBulan(b)}</option>)}
        </select>
        <span className="text-xs font-normal text-[var(--text-muted)]">Pilih bulan yang sama dengan filter Tgl SEP di BI.</span>
      </label>

      <div className="sk-dua mt-4">
        {(['RJ', 'RI'] as Area[]).map(a => <ZonaUnggah key={a} area={a} pilihan={pilihan[a]} nonaktif={sibuk} onPilih={files => void tambah(a, files)} />)}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer py-3 font-semibold text-[var(--text-main)]">Cara mengambil berkas dari BI</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--text-muted)]">
          <li>Buka dashboard BI Monitoring Penerbitan Surat Kontrol (Cabang) di Chrome dan login.</li>
          <li>Atur filter: Tgl SEP = bulan yang dipilih di atas, Fasilitas Kesehatan = (All), Status = (All), Jenis Pelayanan = Rawat Jalan.</li>
          <li>Pilih Download → Crosstab, pilih satu sheet, format CSV, lalu Download. Ulangi untuk kelima sheet: Header Surkon, Faskes Surkon, Tren, Poli, Keterangan.</li>
          <li>Ganti Jenis Pelayanan ke Rawat Inap, lalu ulangi langkah 3.</li>
          <li>Unggah berkasnya tanpa dibuka atau diubah di Excel. Nama berkas tidak perlu diganti.</li>
        </ol>
      </details>

      <div className="mt-2 flex flex-col gap-3 text-sm">
        {tahap === 'memeriksa' && <p role="status" className="text-[var(--text-muted)]">Memeriksa berkas {labelBulan(bulan)}…</p>}
        {tahap === 'galat' && <p role="alert" className="kotak rounded-lg border border-[var(--danger)] p-3 text-[var(--danger)]">{galat}</p>}
        {hasil && tahap !== 'berhasil' && <div role="status" className="rounded-lg bg-[var(--surface-subtle)] p-3 text-[var(--text-main)]">
          <div className="sk-dua">{(['RJ', 'RI'] as Area[]).map(a => {
            const r = hasil.ringkasan.jenis[a];
            return <p key={a}><strong>{AREA[a]}:</strong> {statusJenis(a).filter(k => k !== 'gt' || r.total.gt > 0).map(k => `${k === 'lt' ? STATUS.lt.label : k === 'eq' ? '= SEP' : '> SEP'} ${angka(r.total[k])}`).join(' · ')}
              {' '}· {angka(r.faskes)} faskes · {angka(r.poli)} poli · data sampai {tanggalSampai(hasil.ringkasan.sampai)}</p>;
          })}</div>
          <p className="mt-2">✓ Total Header, Tren, dan Faskes cocok.</p>
          {(['RJ', 'RI'] as Area[]).filter(a => hasil.ringkasan.jenis[a].selisih_poli !== 0).map(a =>
            <p key={a}>Poli {AREA[a].toLowerCase()} berselisih {angka(Math.abs(hasil.ringkasan.jenis[a].selisih_poli))} SEP dari total (SEP tanpa poli). Tetap bisa diintegrasikan.</p>)}
        </div>}
        {hasil?.ringkasan.peringatan.map(p => <p key={p} className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-[var(--text-main)]">{p}</p>)}
        {hasil?.faskes_tak_dikenal && hasil.faskes_tak_dikenal.length > 0 && tahap !== 'berhasil' && (
          <p className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-[var(--text-main)]">
            <strong>{angka(hasil.faskes_tak_dikenal.length)} faskes belum dikenali SAPA:</strong> {hasil.faskes_tak_dikenal.join('; ')}.
            {' '}Datanya tetap tersimpan dan terlihat oleh Admin, tetapi Petugas RS-nya belum bisa melihatnya. Kabari tim teknis SAPA.
          </p>
        )}
        {hasil?.ada && bisaIntegrasi && <p className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-[var(--text-main)]">
          Data {labelBulan(bulan)} yang sekarang (data SEP sampai {tanggalSampai(hasil.ada.sampai)}) akan diganti. Bulan lain tidak berubah.</p>}
        {tahap === 'mengirim' && <p role="status" className="text-[var(--text-muted)]">Mengirim dan menyimpan data {labelBulan(bulan)}…</p>}
        {tahap === 'berhasil' && hasil && <div ref={hasilRef} tabIndex={-1} role="status" className="rounded-lg border border-[var(--success)] p-3 text-[var(--text-main)]">
          Data {labelBulan(bulan)} tersimpan. Data SEP sampai {tanggalSampai(hasil.ringkasan.sampai)}.{' '}
          <a className="tautan-kalimat underline text-[var(--action-primary)]" href="/monitoring-surat-kontrol">Buka Monitoring Surat Kontrol</a></div>}
        {tahap === 'gagal' && <div ref={hasilRef} tabIndex={-1} role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-[var(--danger)]">
          Integrasi gagal: {galat.charAt(0).toLowerCase() + galat.slice(1).replace(/\.$/, '')}. Data lama tetap dipakai, tidak ada yang berubah.</div>}
        {tahap === 'sibuk' && <p role="alert" className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-[var(--text-main)]">
          Admin lain sedang mengintegrasikan data Surat Kontrol. Coba lagi setelah selesai.</p>}
      </div>

      {tahap !== 'berhasil' ? <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="sapa-button sapa-button-secondary" disabled={!lengkap || sibuk} aria-busy={tahap === 'memeriksa'} onClick={() => void periksa()}>
          {tahap === 'memeriksa' ? 'Memeriksa…' : 'Periksa'}</button>
        <button type="button" className="sapa-button sapa-button-primary" disabled={!bisaIntegrasi} aria-busy={tahap === 'mengirim'}
          onClick={() => (hasil?.ada ? setDialog(true) : void integrasikan())}>
          {tahap === 'mengirim' ? 'Mengintegrasikan…' : tahap === 'gagal' ? 'Coba lagi' : 'Integrasikan'}</button>
        {(pilihan.RJ.length > 0 || pilihan.RI.length > 0) && !sibuk && <button type="button" className="sapa-button sapa-button-secondary" onClick={bersihkan}>Kosongkan pilihan</button>}
      </div> : <button type="button" className="sapa-button sapa-button-secondary mt-4" onClick={bersihkan}>Unggah bulan lain</button>}

      <Dialog open={dialog} onClose={() => setDialog(false)} aria-labelledby="sk-dialog-judul">
        <DialogTitle id="sk-dialog-judul">Ganti data {labelBulan(bulan)}?</DialogTitle>
        <DialogContent>{hasil?.ada && <div className="text-sm space-y-1">
          <p>Sekarang: data SEP sampai {tanggalSampai(hasil.ada.sampai)}, diunggah {tanggalData(hasil.ada.diunggah_pada, true)}{hasil.ada.diunggah_oleh ? ` oleh ${hasil.ada.diunggah_oleh}` : ''}.</p>
          <p>Penggantinya: data SEP sampai {tanggalSampai(hasil.ringkasan.sampai)}.</p>
          <p>Bulan lain tidak berubah.</p></div>}</DialogContent>
        <DialogActions>
          <button type="button" className="sapa-button sapa-button-secondary" autoFocus onClick={() => setDialog(false)}>Batal</button>
          <button type="button" className="sapa-button sapa-button-primary" onClick={() => void integrasikan()}>Ganti data</button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
