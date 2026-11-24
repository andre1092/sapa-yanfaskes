import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { tanggalData } from '../lib/ssbiJadwal';
import { angka, labelBulan } from '../lib/suratKontrol';
import { bacaTeksBerkas, bersihkanDetailCsv, bulanTersimpan, bulanUnggahDetail } from '../lib/detailSrk';

// Bagian "Detail Surat Kontrol" di Integrasi data (USUL-unduh-detail.md Kim; syarat Clara: nomor dibuang di browser).
type InfoBulan = { bulan: string; baris: number; diunggah_pada: string; diunggah_oleh: string };
type Ringkasan = { bulan: string; baris: number; faskes: number; RJ: { eq: number; gt: number }; RI: { eq: number; gt: number }; kode_tak_dikenal: string[] };

const pesanGalat = (e: unknown, cadangan: string) => {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof d === 'string' ? d : cadangan;
};

async function gzipTeks(teks: string): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') throw new Error('Browser ini belum bisa mengompres berkas. Pakai Chrome, Edge, atau Firefox versi terbaru.');
  return new Response(new Blob([teks]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

const kirim = (aksi: 'periksa' | 'integrasikan', bulan: string, gz: Blob) =>
  apiClient.post(`/api/v1/surat-kontrol-detail/${aksi}`, gz, { params: { bulan }, headers: { 'Content-Type': 'application/gzip' }, timeout: 120000 });

export function UnggahDetailSuratKontrol() {
  const qc = useQueryClient();
  const status = useQuery<{ bulan: InfoBulan[] }, Error>({
    queryKey: ['surat-kontrol-detail-status'],
    queryFn: async ({ signal }) => (await apiClient.get('/api/v1/surat-kontrol-detail/status', { signal, timeout: 30000 })).data,
    retry: 1,
  });
  const [bulan, setBulan] = useState('');
  const [gz, setGz] = useState<Blob | null>(null);
  const [hasil, setHasil] = useState<{ ringkasan: Ringkasan; ada: boolean } | null>(null);
  const [tahap, setTahap] = useState<'kosong' | 'memeriksa' | 'cocok' | 'galat' | 'mengirim' | 'berhasil'>('kosong');
  const [galat, setGalat] = useState('');
  const sibuk = tahap === 'memeriksa' || tahap === 'mengirim';

  const pilih = async (berkas: File | undefined) => {
    if (!berkas || !bulan) { setGalat('Pilih bulan dulu.'); setTahap('galat'); return; }
    setHasil(null); setGz(null); setTahap('memeriksa');
    try {
      const bersih = bersihkanDetailCsv(bacaTeksBerkas(await berkas.arrayBuffer()));
      if (bersih.galat) { setGalat(bersih.galat); setTahap('galat'); return; }
      const paket = await gzipTeks(bersih.csv);
      const res = await kirim('periksa', bulan, paket);
      setGz(paket); setHasil(res.data); setTahap('cocok');
    } catch (e) {
      setGalat(e instanceof Error && e.message.startsWith('Browser') ? e.message : pesanGalat(e, 'Berkas belum bisa diperiksa. Coba lagi.'));
      setTahap('galat');
    }
  };

  const integrasikan = async () => {
    if (!gz || (hasil?.ada && !window.confirm(`Data detail ${labelBulan(bulan)} yang sekarang akan diganti. Lanjutkan?`))) return;
    setTahap('mengirim');
    try {
      const res = await kirim('integrasikan', bulan, gz);
      qc.setQueryData(['surat-kontrol-detail-status'], { bulan: Array.isArray(res.data?.bulan) ? res.data.bulan : [] });
      qc.invalidateQueries({ queryKey: ['surat-kontrol-detail-bulan'] });
      if (!bulanTersimpan(res.data, bulan)) {
        setGalat(`Belum bisa dipastikan Detail ${labelBulan(bulan)} tersimpan. Muat ulang halaman, lalu lihat tabel Bulan yang tersimpan. Jika ${labelBulan(bulan)} belum ada, integrasikan lagi.`);
        setTahap('galat'); return;
      }
      setTahap('berhasil');
    } catch (e) {
      setGalat(pesanGalat(e, `Data ${labelBulan(bulan)} belum tersimpan karena koneksi terputus. Data lama tetap dipakai.`));
      setTahap('galat');
    }
  };

  const r = hasil?.ringkasan;
  const barisLama = r ? status.data?.bulan.find(b => b.bulan === r.bulan)?.baris : undefined;
  return (
    <section aria-labelledby="skd-unggah" className="sk-unggah rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-5">
      <h2 id="skd-unggah" className="text-base font-bold text-[var(--text-main)]">Detail Surat Kontrol</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Unggah CSV view SSBI "Surat Kontrol = SEP" per bulan. Nomor SEP dan nomor surat kontrol dibuang di browser ini
        sebelum dikirim; SAPA hanya menyimpan kode PPK, faskes, jenis, poli, tanggal, dan status. Disimpan 3 bulan terakhir.
      </p>
      <h3 className="mt-4 text-sm font-semibold text-[var(--text-main)]">Bulan yang tersimpan</h3>
      {status.isLoading ? <p className="text-sm text-[var(--text-muted)]">Memuat…</p>
        : status.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{pesanGalat(status.error, 'Daftar bulan belum bisa dimuat.')}</p>
        : !status.data?.bulan.length ? <p className="text-sm text-[var(--text-muted)]">Belum ada bulan tersimpan.</p>
        : <table className="sk-tabel-bulan mt-1"><thead><tr><th scope="col">Bulan</th><th scope="col">Baris</th><th scope="col">Diunggah</th><th scope="col">Oleh</th></tr></thead>
          <tbody>{status.data.bulan.slice().reverse().map(b => <tr key={b.bulan}><td><strong>{labelBulan(b.bulan)}</strong></td><td>{angka(b.baris)}</td>
            <td>{tanggalData(b.diunggah_pada, true)}</td><td>{b.diunggah_oleh}</td></tr>)}</tbody></table>}
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-main)]" htmlFor="skd-bulan">Bulan data
          <select id="skd-bulan" aria-describedby="skd-bulan-bantu" value={bulan} disabled={sibuk} onChange={e => { setBulan(e.target.value); setHasil(null); setTahap('kosong'); }}
            className="min-h-[44px] max-w-xs rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 font-normal">
            <option value="" disabled>Pilih bulan</option>
            {bulanUnggahDetail(new Date()).map(b => <option key={b} value={b}>{labelBulan(b)}</option>)}
          </select>
        </label>
        <label className={`sapa-button sapa-button-secondary ${sibuk || !bulan ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
          Pilih berkas CSV
          <input type="file" accept=".csv,text/csv" className="sr-only" disabled={sibuk || !bulan} aria-label="Pilih berkas detail surat kontrol"
            onChange={(e: ChangeEvent<HTMLInputElement>) => { void pilih(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      <p id="skd-bulan-bantu" className="mt-1 text-xs text-[var(--text-muted)]">Hanya 3 bulan terakhir yang bisa diunggah.</p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer py-3 font-semibold text-[var(--text-main)]">Cara mengambil berkas dari SSBI</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--text-muted)]">
          <li>Buka view SSBI 1310_YANFASKES_SRK_FKRTL → Surat Kontrol = SEP, lalu pilih bulan yang sama dengan pilihan di atas.</li>
          <li>Pastikan filter memuat Rawat Jalan dan Rawat Inap, status = SEP dan &gt; SEP.</li>
          <li>Klik tombol Download, pilih Data, lalu klik Download. Pilih berkas CSV hasilnya di sini tanpa dibuka di Excel.</li>
        </ol>
      </details>
      <div className="mt-2 flex flex-col gap-3 text-sm">
        {tahap === 'memeriksa' && <p role="status" className="text-[var(--text-muted)]">Membuang nomor dan memeriksa berkas…</p>}
        {tahap === 'galat' && <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-[var(--danger)]">{galat}</p>}
        {r && tahap !== 'berhasil' && <div role="status" className="rounded-lg bg-[var(--surface-subtle)] p-3 text-[var(--text-main)]">
          <p><strong>{labelBulan(r.bulan)}:</strong> {angka(r.baris)} baris, {angka(r.faskes)} faskes. Rawat jalan = SEP {angka(r.RJ.eq)} · &gt; SEP {angka(r.RJ.gt)};
            Rawat inap = SEP {angka(r.RI.eq)} · &gt; SEP {angka(r.RI.gt)}.</p>
          {r.kode_tak_dikenal.length > 0 && <p className="mt-2 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3">
            <strong>Periksa sebelum Integrasikan:</strong> {r.kode_tak_dikenal.length} kode faskes belum ada di tabel padanan ({r.kode_tak_dikenal.join('; ')}). Nama faskes untuk kode ini tidak bisa dicek, jadi pastikan berkasnya benar. Minta tim teknis SAPA menambahkan kode ini ke tabel padanan.</p>}
          {hasil?.ada && <p className="mt-2 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3">
            Detail {labelBulan(r.bulan)} yang sekarang{barisLama !== undefined ? ` (${angka(barisLama)} baris)` : ''} akan diganti. Bulan lain tidak berubah.</p>}
        </div>}
        {tahap === 'berhasil' && <p role="status" className="rounded-lg border border-[var(--success)] p-3 text-[var(--text-main)]">Detail {labelBulan(bulan)} tersimpan.</p>}
      </div>
      <button type="button" className="sapa-button sapa-button-primary mt-4" disabled={tahap !== 'cocok'} aria-busy={tahap === 'mengirim'} onClick={() => void integrasikan()}>
        {tahap === 'mengirim' ? 'Mengintegrasikan…' : 'Integrasikan'}</button>
    </section>
  );
}
