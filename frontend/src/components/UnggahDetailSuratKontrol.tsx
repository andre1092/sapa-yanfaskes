import { useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { tanggalData } from '../lib/ssbiJadwal';
import { angka, labelBulan } from '../lib/suratKontrol';
import { bacaTeksBerkas, bersihkanDetailCsv, bulanTersimpan, gabungDetailCsv } from '../lib/detailSrk';

// Bagian "Detail Surat Kontrol" di Integrasi data (USUL-unduh-detail.md Kim; syarat Clara: nomor dibuang di browser).
// CEO 2026-11-25: seret-lepas tanpa pilih bulan; bulan diambil server dari Tgl SEP, tiap bulan menimpa bulan yang sama.
type InfoBulan = { bulan: string; baris: number; diunggah_pada: string; diunggah_oleh: string };
type Hitung = { eq: number; gt: number };
type Ringkasan = { bulan: string[]; baris: number; per_bulan: Record<string, { baris: number; RJ: Hitung; RI: Hitung }>; faskes: number; kode_tak_dikenal: string[] };

const pesanGalat = (e: unknown, cadangan: string) => {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof d === 'string' ? d : cadangan;
};

async function gzipTeks(teks: string): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') throw new Error('Browser ini belum bisa mengompres berkas. Pakai Chrome, Edge, atau Firefox versi terbaru.');
  return new Response(new Blob([teks]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

const kirim = (aksi: 'periksa' | 'integrasikan', gz: Blob) =>
  apiClient.post(`/api/v1/surat-kontrol-detail/${aksi}`, gz, { headers: { 'Content-Type': 'application/gzip' }, timeout: 120000 });

const daftar = (isi: string[]) => new Intl.ListFormat('id', { type: 'conjunction' }).format(isi);
const daftarBulan = (bulan: string[]) => daftar(bulan.map(labelBulan));

export function UnggahDetailSuratKontrol() {
  const qc = useQueryClient();
  const status = useQuery<{ bulan: InfoBulan[] }, Error>({
    queryKey: ['surat-kontrol-detail-status'],
    queryFn: async ({ signal }) => (await apiClient.get('/api/v1/surat-kontrol-detail/status', { signal, timeout: 30000 })).data,
    retry: 1,
  });
  const [gz, setGz] = useState<Blob | null>(null);
  const [hasil, setHasil] = useState<{ ringkasan: Ringkasan; ada: string[] } | null>(null);
  const [tahap, setTahap] = useState<'kosong' | 'memeriksa' | 'cocok' | 'galat' | 'mengirim' | 'berhasil'>('kosong');
  const [galat, setGalat] = useState('');
  const [seret, setSeret] = useState(false);
  const sibuk = tahap === 'memeriksa' || tahap === 'mengirim';

  const pilih = async (daftar: File[]) => {
    if (!daftar.length || sibuk) return;
    setHasil(null); setGz(null); setTahap('memeriksa');
    try {
      const bersih = [];
      for (const berkas of daftar) {
        // `accept` hanya berlaku di pemilih berkas; berkas yang diseret dicek ekstensinya di sini.
        if (!/\.csv$/i.test(berkas.name)) {
          setGalat(`${berkas.name}: bukan berkas CSV. Unduh dari SSBI lewat Download > Data, lalu seret berkas CSV-nya ke sini.`); setTahap('galat'); return;
        }
        const b = bersihkanDetailCsv(bacaTeksBerkas(await berkas.arrayBuffer()));
        if (b.galat) { setGalat(daftar.length > 1 ? `${berkas.name}: ${b.galat}` : b.galat); setTahap('galat'); return; }
        bersih.push(b);
      }
      const paket = await gzipTeks(gabungDetailCsv(bersih).csv);
      const res = await kirim('periksa', paket);
      setGz(paket); setHasil(res.data); setTahap('cocok');
    } catch (e) {
      setGalat(e instanceof Error && e.message.startsWith('Browser') ? e.message : pesanGalat(e, 'Berkas belum bisa diperiksa. Coba lagi.'));
      setTahap('galat');
    }
  };

  const r = hasil?.ringkasan;
  const integrasikan = async () => {
    if (!gz || !r || (hasil.ada.length && !window.confirm(`Data detail ${daftarBulan(hasil.ada)} yang sekarang akan diganti. Lanjutkan?`))) return;
    setTahap('mengirim');
    try {
      const res = await kirim('integrasikan', gz);
      qc.setQueryData(['surat-kontrol-detail-status'], { bulan: Array.isArray(res.data?.bulan) ? res.data.bulan : [] });
      qc.invalidateQueries({ queryKey: ['surat-kontrol-detail-bulan'] });
      if (!r.bulan.every(b => bulanTersimpan(res.data, b))) {
        setGalat(`Belum bisa dipastikan Detail ${daftarBulan(r.bulan)} tersimpan. Muat ulang halaman, lalu lihat tabel Bulan yang tersimpan. Jika ada yang belum muncul, integrasikan lagi.`);
        setTahap('galat'); return;
      }
      setTahap('berhasil');
    } catch (e) {
      setGalat(pesanGalat(e, `Data ${daftarBulan(r.bulan)} belum tersimpan karena koneksi terputus. Data lama tetap dipakai.`));
      setTahap('galat');
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setSeret(false); void pilih(Array.from(e.dataTransfer.files ?? [])); };
  const barisLama = (b: string) => status.data?.bulan.find(x => x.bulan === b)?.baris;
  return (
    <section aria-labelledby="skd-unggah" className="sk-unggah rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-5">
      <h2 id="skd-unggah" className="text-base font-bold text-[var(--text-main)]">Detail Surat Kontrol</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Unggah CSV view SSBI "Surat Kontrol = SEP". Bulan dibaca dari Tgl SEP; setiap bulan di berkas mengganti data bulan itu.
        Nomor SEP dan nomor surat kontrol dibuang di browser ini sebelum dikirim; SAPA hanya menyimpan kode PPK, faskes, jenis,
        poli, tanggal, dan status. Disimpan 3 bulan terakhir.
      </p>
      <h3 className="mt-4 text-sm font-semibold text-[var(--text-main)]">Bulan yang tersimpan</h3>
      {status.isLoading ? <p className="text-sm text-[var(--text-muted)]">Memuat…</p>
        : status.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{pesanGalat(status.error, 'Daftar bulan belum bisa dimuat.')}</p>
        : !status.data?.bulan.length ? <p className="text-sm text-[var(--text-muted)]">Belum ada bulan tersimpan.</p>
        : <table className="sk-tabel-bulan mt-1"><thead><tr><th scope="col">Bulan</th><th scope="col">Baris</th><th scope="col">Diunggah</th><th scope="col">Oleh</th></tr></thead>
          <tbody>{status.data.bulan.slice().reverse().map(b => <tr key={b.bulan}><td><strong>{labelBulan(b.bulan)}</strong></td><td>{angka(b.baris)}</td>
            <td>{tanggalData(b.diunggah_pada, true)}</td><td>{b.diunggah_oleh}</td></tr>)}</tbody></table>}
      <div
        onDragOver={e => { e.preventDefault(); if (!sibuk) setSeret(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSeret(false); }}
        onDrop={onDrop}
        className={`mt-4 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm ${
          seret ? 'border-[var(--action-primary)] bg-[var(--surface-subtle)]' : 'border-[var(--border-color)]'} ${sibuk ? 'opacity-60' : ''}`}
      >
        <span className="text-[var(--text-main)]">Seret berkas CSV ke sini, atau</span>
        <label className={`sapa-button sapa-button-secondary focus-within:outline focus-within:outline-2 ${sibuk ? 'pointer-events-none' : 'cursor-pointer'}`}>
          Pilih berkas
          <input type="file" accept=".csv,text/csv" multiple className="sr-only" disabled={sibuk} aria-label="Pilih berkas detail surat kontrol"
            onChange={(e: ChangeEvent<HTMLInputElement>) => { void pilih(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </label>
        <span className="text-xs text-[var(--text-muted)]">Boleh lebih dari satu berkas. Hanya data 3 bulan terakhir yang bisa diunggah. Unggah semua berkas satu bulan sekaligus, karena unggahan berikutnya mengganti seluruh bulan itu.</span>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer py-3 font-semibold text-[var(--text-main)]">Cara mengambil berkas dari SSBI</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--text-muted)]">
          <li>Buka view SSBI 1310_YANFASKES_SRK_FKRTL → Surat Kontrol = SEP, lalu pilih bulan Tgl SEP yang ingin diperbarui (hanya 3 bulan terakhir). Satu berkas boleh berisi beberapa bulan.</li>
          <li>Pastikan filter Status memuat = SEP dan &gt; SEP. Saat ini sheet hanya berisi Rawat jalan.</li>
          <li>Di SSBI, klik Download di bilah alat, pilih Data, lalu klik Download di jendela yang terbuka. Seret berkas CSV hasilnya ke sini tanpa dibuka di Excel.</li>
        </ol>
      </details>
      <div className="mt-2 flex flex-col gap-3 text-sm">
        {tahap === 'memeriksa' && <p role="status" className="text-[var(--text-muted)]">Membuang nomor dan memeriksa berkas…</p>}
        {tahap === 'galat' && <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-[var(--danger)]">{galat}</p>}
        {r && tahap !== 'berhasil' && <div role="status" className="rounded-lg bg-[var(--surface-subtle)] p-3 text-[var(--text-main)]">
          <p>Total {angka(r.baris)} baris, {angka(r.faskes)} faskes, {r.bulan.length} bulan.</p>
          <ul className="mt-1 space-y-1">{r.bulan.map(b => { const v = r.per_bulan[b]; return <li key={b}><strong>{labelBulan(b)}:</strong> {angka(v.baris)} baris.
            Rawat jalan = SEP {angka(v.RJ.eq)} · &gt; SEP {angka(v.RJ.gt)}{v.RI.eq + v.RI.gt > 0 && <>; Rawat inap = SEP {angka(v.RI.eq)} · &gt; SEP {angka(v.RI.gt)}</>}.</li>; })}</ul>
          {r.kode_tak_dikenal.length > 0 && <p className="mt-2 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3">
            <strong>Periksa sebelum Integrasikan:</strong> {r.kode_tak_dikenal.length} kode faskes belum ada di tabel padanan ({r.kode_tak_dikenal.join('; ')}). Nama faskes untuk kode ini tidak bisa dicek, jadi pastikan berkasnya benar. Minta tim teknis SAPA menambahkan kode ini ke tabel padanan.</p>}
          {hasil.ada.length > 0 && <p className="mt-2 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3">
            Detail yang sekarang akan diganti: {daftar(hasil.ada.map(b => { const n = barisLama(b); return `${labelBulan(b)}${n !== undefined ? ` (${angka(n)} baris)` : ''}`; }))}. Bulan lain tidak berubah.</p>}
        </div>}
        {tahap === 'berhasil' && r && <p role="status" className="rounded-lg border border-[var(--success)] p-3 text-[var(--text-main)]">Detail {daftarBulan(r.bulan)} tersimpan.</p>}
      </div>
      <button type="button" className="sapa-button sapa-button-primary mt-4" disabled={tahap !== 'cocok'} aria-busy={tahap === 'mengirim'} onClick={() => void integrasikan()}>
        {tahap === 'mengirim' ? 'Mengintegrasikan…' : 'Integrasikan'}</button>
    </section>
  );
}
