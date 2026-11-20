import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import {
  KABUPATEN_URUT, URUT_BAWAAN, aturLabel, angka, bacaFilter, bulanPendek, kelasSkor, labelBulan, perKabupaten, persen,
  rentangBulan, ringkas, saring, seriFaskes, seriKabupaten, skalaSumbu, skorRata, tampilLabelBulan, teksStatusFilter,
  tulisFilter, urutBerikut, urutkan,
} from '../lib/kessan';
import type { BarisKessan, FilterKessan, KolomUrut, ResponsKessan, Urutan } from '../lib/kessan';
import { UnduhJpegKessan } from './UnduhJpegKessan';
import './kessan.css';

// Hi-fi Kim: agents/kim/desain/monitoring-kessan/SPEK.md dan mockup.html (2026-11-20).

const statusHttp = (error: unknown) => (error as { response?: { status?: number } })?.response?.status;
const detailGalat = (error: unknown) => (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;

const WARNA_KAB: Record<string, string> = { Jember: 'var(--ks-kab-1)', Lumajang: 'var(--ks-kab-2)', Bondowoso: 'var(--ks-kab-3)' };
const warnaKab = (k: string) => WARNA_KAB[k] || 'var(--ks-kab-1)';

function useLebar<T extends HTMLElement>(awal: number) {
  const ref = useRef<T>(null);
  const [lebar, setLebar] = useState(awal);
  // Lebar awal diukur sinkron (tidak bergantung pada ResizeObserver yang ditahan saat tab di latar).
  useLayoutEffect(() => {
    const w = ref.current?.getBoundingClientRect().width;
    if (w) setLebar(Math.max(200, Math.round(w)));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setLebar(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, lebar] as const;
}

const IkonInfo = () => <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
  <path fill="currentColor" d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16" /></svg>;

const Kerangka = ({ w, h }: { w: string; h: number }) => <span className="ks-sk" style={{ width: w, height: h }} />;

/* ---------- kartu ringkas ---------- */

type KartuProps = { baris: BarisKessan[]; bulan: string; kabupaten: string; petugas: boolean; namaRs: string };

function Kartu({ baris, bulan, kabupaten, petugas, namaRs }: KartuProps) {
  const r = ringkas(baris);
  const ada = r.jumlahFaskes > 0;
  const lingkup = kabupaten ? `Kabupaten ${kabupaten}` : 'Semua kabupaten';
  const subTotal = !ada ? labelBulan(bulan) : r.target > 0 ? `Target ${angka(r.target)} · ${persen(r.persen)}% dari target` : 'Target belum ada';
  const subSkor = !ada ? ' ' : petugas ? (r.belum100 ? 'Belum skor 100' : 'Target tercapai')
    : r.belum100 ? `${angka(r.belum100)} faskes belum skor 100` : 'Semua faskes skor 100';
  return <>
    <div className="ks-kpi ks-kpi-jf">
      {petugas ? <>
        <p className="ks-kpi-lbl">Faskes</p><p className="ks-kpi-v ks-kpi-nama">{namaRs || '–'}</p><p className="ks-kpi-s">Akun rumah sakit</p>
      </> : <>
        <p className="ks-kpi-lbl">Jumlah Faskes</p><p className="ks-kpi-v">{ada ? angka(r.jumlahFaskes) : '–'}</p><p className="ks-kpi-s">FKRTL · {lingkup}</p>
      </>}
    </div>
    <div className="ks-kpi ks-kpi-tot">
      <p className="ks-kpi-lbl">{petugas ? 'Capaian Kunjungan' : 'Total Kunjungan Kessan'}</p>
      <p className="ks-kpi-v">{ada ? angka(r.kunjungan) : '–'}</p><p className="ks-kpi-s">{subTotal}</p>
    </div>
    <div className="ks-kpi ks-kpi-skor">
      <p className="ks-kpi-lbl">{petugas ? 'Skor Kepatuhan' : 'Rata-rata Skor Kepatuhan'}</p>
      <p className="ks-kpi-v">{skorRata(r.rataSkor)}</p><p className="ks-kpi-s">{subSkor}</p>
    </div>
  </>;
}

function KartuMemuat() {
  return <>{['ks-kpi-jf', 'ks-kpi-tot', 'ks-kpi-skor'].map(c => <div key={c} className={`ks-kpi ${c}`} aria-hidden="true">
    <p className="ks-kpi-lbl"><Kerangka w="60%" h={14} /></p><p className="ks-kpi-v"><Kerangka w="40%" h={30} /></p><p className="ks-kpi-s"><Kerangka w="70%" h={12} /></p>
  </div>)}</>;
}

/* ---------- grafik 1: kunjungan per kabupaten ---------- */

function BarKabupaten({ barisPeriode, daftarKab, bulan, kabupaten, pilih }: { barisPeriode: BarisKessan[]; daftarKab: string[]; bulan: string; kabupaten: string; pilih: (k: string) => void }) {
  if (!barisPeriode.length) return <div className="ks-kosong"><h3>Belum ada data</h3><p>Data Kessan {labelBulan(bulan)} belum tersedia.</p></div>;
  const agg = perKabupaten(barisPeriode, daftarKab);
  const maks = Math.max(1, ...agg.map(a => a.kunjungan));
  return <>
    <ul className={`ks-kb-daftar${kabupaten ? ' ks-ada-pilihan' : ''}`} aria-label="Saring menurut kabupaten">
      {agg.map(a => {
        const aktif = kabupaten === a.kabupaten;
        return <li key={a.kabupaten}>
          <button type="button" className="ks-kb" style={{ '--c': warnaKab(a.kabupaten) } as CSSProperties} aria-pressed={aktif}
            aria-label={`${a.kabupaten}: ${angka(a.kunjungan)} kunjungan, ${angka(a.jumlahFaskes)} faskes. ${aktif ? 'Sedang disaring; tekan untuk menampilkan semua kabupaten' : `Saring ke ${a.kabupaten}`}`}
            onClick={() => pilih(aktif ? '' : a.kabupaten)}>
            <span className="ks-kb-nama"><i aria-hidden="true" />{a.kabupaten}</span>
            <span className="ks-kb-jalur" aria-hidden="true"><span className="ks-kb-isi" style={{ width: `${(a.kunjungan / maks) * 100}%` }} /></span>
            <span className="ks-kb-nilai">{angka(a.kunjungan)}</span>
            <span className="ks-kb-sub">{angka(a.jumlahFaskes)} faskes{a.persen != null ? ` · ${persen(a.persen)}% dari target` : ''}</span>
          </button>
        </li>;
      })}
    </ul>
    {kabupaten && <p className="ks-muted ks-kb-hint">Disaring: {kabupaten}. Tekan bar yang sama untuk menampilkan semua kabupaten.</p>}
  </>;
}

/* ---------- grafik 2: tren (SVG tanpa pustaka) ---------- */

type SeriTren = { nama: string; warna: string; nilai: number[] };

function GrafikTren({ bulan, seri, terpilih, sementara, kabupaten }: { bulan: string[]; seri: SeriTren[]; terpilih: string; sementara: string[]; kabupaten: string }) {
  const [ref, W] = useLebar<HTMLDivElement>(560);
  const tipRef = useRef<HTMLDivElement>(null);
  const [hov, setHov] = useState<number | null>(null);
  const n = bulan.length;
  const H = 236, multi = seri.length > 1;
  const m = { l: 46, r: multi ? (W < 380 ? 78 : 88) : 16, t: 10, b: 26 };
  const pw = Math.max(1, W - m.l - m.r), ph = H - m.t - m.b;
  const { langkah, puncak } = skalaSumbu(Math.max(0, ...seri.flatMap(s => s.nilai)));
  const x = (i: number) => m.l + (n > 1 ? (i * pw) / (n - 1) : pw / 2);
  const y = (v: number) => m.t + ph - (v / puncak) * ph;
  const dx = n > 1 ? pw / (n - 1) : pw;
  const iPilih = Math.max(0, bulan.indexOf(terpilih));
  const sem = (i: number) => sementara.includes(bulan[i]);
  const iSem = bulan.findIndex(b => sementara.includes(b));
  const potong = iSem < 0 ? n - 1 : Math.max(iSem - 1, 0);
  const redup = (s: SeriTren) => multi && !!kabupaten && kabupaten !== s.nama;
  const urutGambar = [...seri].sort((a, b) => Number(redup(b)) - Number(redup(a)));
  const garisBantu: number[] = [];
  for (let v = 0; v <= puncak + 1e-9; v += langkah) garisBantu.push(v);
  const yLabel = multi ? aturLabel(seri.map(s => y(s.nilai[n - 1] ?? 0)), 16, m.t + ph) : [];
  const bulanSem = bulan.filter(b => sementara.includes(b));

  // Tooltip dijaga tetap di dalam plot: pindah ke kiri garis bila tidak muat di kanan.
  useLayoutEffect(() => {
    const t = tipRef.current;
    if (!t || hov == null) return;
    const tx = x(hov), w = t.offsetWidth;
    t.style.left = `${tx + 12 + w > W ? Math.max(0, tx - 12 - w) : tx + 12}px`;
  });

  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key) || !n) return;
    e.preventDefault();
    if (e.key === 'Escape') { setHov(null); return; }
    const i = hov ?? iPilih;
    setHov(e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : Math.max(0, Math.min(n - 1, i + (e.key === 'ArrowLeft' ? -1 : 1))));
  };
  const pointerMove = (e: PointerEvent<SVGRectElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - m.l) / dx)));
    if (i !== hov) setHov(i);
  };
  // Ketukan tidak memicu pointermove dan pointerleave langsung menyusul pointerup, jadi tooltip sentuh dibuka saat
  // pointerdown dan baru ditutup lewat ketukan di luar grafik atau Esc.
  const pointerLeave = (e: PointerEvent<SVGRectElement>) => {
    if (e.pointerType === 'mouse' && document.activeElement !== ref.current) setHov(null);
  };
  const terbuka = hov != null;
  useEffect(() => {
    if (!terbuka) return;
    const luar = (e: globalThis.PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setHov(null); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setHov(null); };
    document.addEventListener('pointerdown', luar);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', luar); document.removeEventListener('keydown', esc); };
  }, [terbuka, ref]);

  if (!n) return <div className="ks-kosong"><h3>Belum ada data</h3><p>Data tren Kessan belum tersedia.</p></div>;
  return <>
    {multi && <ul className="ks-legenda" aria-hidden="true">
      {seri.map(s => <li key={s.nama} className={redup(s) ? 'ks-redup' : ''} style={{ '--c': s.warna } as CSSProperties}><i />{s.nama}</li>)}
    </ul>}
    <div ref={ref} className="ks-tren" tabIndex={0} role="group" aria-describedby="ks-tren-ket"
      aria-label={`Grafik tren kunjungan, ${labelBulan(bulan[0])} sampai ${labelBulan(bulan[n - 1])}. Gunakan panah kiri dan kanan untuk membaca tiap bulan. Angka lengkap ada di tabel data tren di bawah grafik.`}
      onKeyDown={keyDown} onFocus={() => setHov(h => h ?? iPilih)} onBlur={() => setHov(null)}>
      <svg width={W} height={H} aria-hidden="true">
        <rect className="ks-pilih-bulan" x={x(iPilih) - dx / 2} y={m.t} width={dx} height={ph} style={{ fill: 'var(--ks-sel-band)' }} />
        {garisBantu.map(v => <g key={v}>
          <line x1={m.l} x2={m.l + pw} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--ks-grid)' }} strokeWidth={1} />
          <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} style={{ fill: 'var(--ks-axis)' }}>{angka(v)}</text>
        </g>)}
        {bulan.map((b, i) => tampilLabelBulan(i, dx, iPilih) && <text key={b} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11}
          fontWeight={i === iPilih ? 600 : 400} style={{ fill: i === iPilih ? 'var(--text-main)' : 'var(--ks-axis)' }}>{bulanPendek(b)}</text>)}
        {urutGambar.map(s => {
          const titik = s.nilai.map((v, i) => `${x(i)},${y(v)}`);
          return <g key={s.nama} opacity={redup(s) ? 0.25 : 1}>
            <polyline points={titik.slice(0, potong + 1).join(' ')} fill="none" style={{ stroke: s.warna }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {iSem >= 0 && <polyline points={titik.slice(potong).join(' ')} fill="none" style={{ stroke: s.warna }} strokeWidth={2} strokeDasharray="4 4" />}
            {[...new Set([iPilih, hov].filter((v): v is number => v != null))].map(i => <circle key={i} cx={x(i)} cy={y(s.nilai[i])} r={sem(i) ? 3.5 : 4}
              strokeWidth={2} style={{ fill: sem(i) ? 'var(--ks-paper)' : s.warna, stroke: sem(i) ? s.warna : 'var(--ks-paper)' }} />)}
          </g>;
        })}
        {multi && seri.map((s, i) => <g key={s.nama}>
          <line x1={m.l + pw + 6} x2={m.l + pw + 14} y1={yLabel[i]} y2={yLabel[i]} strokeWidth={2} opacity={redup(s) ? 0.35 : 1} style={{ stroke: s.warna }} />
          <text x={m.l + pw + 18} y={yLabel[i] + 4} fontSize={12} style={{ fill: redup(s) ? 'var(--text-muted)' : 'var(--text-main)' }}>{s.nama}</text>
        </g>)}
        {hov != null && <line x1={x(hov)} x2={x(hov)} y1={m.t} y2={m.t + ph} strokeWidth={1} strokeDasharray="2 3" style={{ stroke: 'var(--ks-axis)' }} />}
        <rect x={m.l - dx / 2} y={m.t} width={pw + dx} height={ph} fill="transparent" onPointerMove={pointerMove}
          onPointerDown={pointerMove} onPointerLeave={pointerLeave} />
      </svg>
      {hov != null && <div ref={tipRef} className="ks-tip" style={{ left: x(hov) + 12, top: 8 }}>
        <b>{labelBulan(bulan[hov])}</b>
        {seri.map(s => <div key={s.nama} className="ks-tip-r" style={{ '--c': s.warna } as CSSProperties}>
          <span><i />{s.nama}</span><span className="ks-tip-n">{angka(s.nilai[hov])}</span>
        </div>)}
        {sem(hov) && <div className="ks-tip-sem">Data sementara</div>}
      </div>}
    </div>
    <p className="ks-muted ks-tren-ket" id="ks-tren-ket">
      {bulanSem.length ? `Garis putus-putus dan titik berlubang: ${bulanSem.map(labelBulan).join(', ')} data sementara. ` : ''}Pita ungu muda: periode terpilih.
    </p>
    <details className="ks-data">
      <summary>Tampilkan data tren sebagai tabel</summary>
      <div className="ks-dt-gulir" tabIndex={0} role="region" aria-label="Data tren per bulan"><table>
        <thead><tr><th scope="col">Bulan</th>{seri.map(s => <th key={s.nama} scope="col">{s.nama}</th>)}</tr></thead>
        <tbody>{bulan.map((b, i) => <tr key={b}><th scope="row">{labelBulan(b)}{sem(i) ? ' (sementara)' : ''}</th>
          {seri.map(s => <td key={s.nama}>{angka(s.nilai[i])}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
  </>;
}

/* ---------- tabel utama ---------- */

const KOLOM: { k: KolomUrut; t: string; c: string }[] = [
  { k: 'nama', t: 'Nama Faskes', c: '' }, { k: 'kabupaten', t: 'Kabupaten', c: '' }, { k: 'target', t: 'Target Kessan', c: 'ks-num' },
  { k: 'kunjungan', t: 'Capaian Kunjungan', c: 'ks-num' }, { k: 'persen', t: '% Kunjungan Kessan', c: 'ks-num' }, { k: 'skor', t: 'Skor Kepatuhan', c: 'ks-tgh' },
];
const URUT_HP: { v: string; t: string }[] = [
  { v: 'kunjungan:desc', t: 'Capaian terbanyak' }, { v: 'kunjungan:asc', t: 'Capaian tersedikit' }, { v: 'persen:desc', t: '% tertinggi' },
  { v: 'persen:asc', t: '% terendah' }, { v: 'skor:asc', t: 'Skor terendah' }, { v: 'nama:asc', t: 'Nama A–Z' },
];
// Teks pendek untuk urutan dari kepala tabel yang tidak ada di URUT_HP, supaya select tidak melebar di HP.
const URUT_HP_LAIN: Record<string, string> = {
  'target:desc': 'Target terbesar', 'target:asc': 'Target terkecil', 'skor:desc': 'Skor tertinggi',
  'nama:desc': 'Nama Z–A', 'kabupaten:asc': 'Kabupaten A–Z', 'kabupaten:desc': 'Kabupaten Z–A',
};

function IkonUrut({ arah }: { arah: 'asc' | 'desc' | null }) {
  return <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M6 2 9 5H3z" fill="currentColor" opacity={arah === 'desc' ? 0.3 : 1} />
    <path d="M6 10 3 7h6z" fill="currentColor" opacity={arah === 'asc' ? 0.3 : 1} />
  </svg>;
}

function teksUrut(u: Urutan) {
  const kol = KOLOM.find(c => c.k === u.kolom)?.t || '';
  const teks = u.kolom === 'nama' || u.kolom === 'kabupaten';
  return `${kol}, ${u.arah === 'asc' ? (teks ? 'A sampai Z' : 'terkecil di atas') : (teks ? 'Z sampai A' : 'terbesar di atas')}`;
}

type TabelProps = { baris: BarisKessan[]; bulan: string; petugas: boolean; urut: Urutan; setUrut: (u: Urutan) => void; kartu: boolean; geser: boolean };

function TabelFaskes({ baris, bulan, petugas, urut, setUrut, kartu, geser }: TabelProps) {
  const R = urutkan(baris, urut);
  const maks = Math.max(1, ...R.map(b => b.jumlah_kessan));
  const r = ringkas(R);
  return <>
    <p className="ks-muted ks-geser">Geser tabel ke samping untuk melihat semua kolom.</p>
    {/* Hanya menjadi region gulir yang bisa difokus saat tabel memang digeser (640–811 px). */}
    <div className="ks-tw" tabIndex={geser ? 0 : undefined} role={geser ? 'region' : undefined}
      aria-label={geser ? 'Tabel capaian per faskes, geser ke samping' : undefined}>
      <table className="ks-utama" role="table">
        <caption className="sr-only">Capaian Kessan per faskes, {labelBulan(bulan)}. Urut menurut {teksUrut(urut)}.</caption>
        <thead role="rowgroup"><tr role="row">{KOLOM.map(c => {
          const aktif = urut.kolom === c.k;
          return <th key={c.k} scope="col" role="columnheader" className={c.c} aria-sort={aktif ? (urut.arah === 'asc' ? 'ascending' : 'descending') : undefined}>
            {/* Mode kartu: kepala hanya tersembunyi visual (tetap terbaca pembaca layar); select Urutkan menggantikannya. */}
            <button type="button" tabIndex={kartu ? -1 : undefined} onClick={() => setUrut(urutBerikut(urut, c.k))}>{c.t}<IkonUrut arah={aktif ? urut.arah : null} /></button>
          </th>;
        })}</tr></thead>
        <tbody role="rowgroup">{R.map(b => {
          const t = b.jumlah_kessan / maks;
          const adaTarget = b.target != null && b.target > 0;
          return <tr key={`${b.kode_ppk}-${b.bulan}`} role="row">
            <th scope="row" role="rowheader">{b.nama_faskes}</th>
            <td role="cell" className="ks-kab ks-c-kab">{b.kabupaten}</td>
            <td role="cell" className="ks-num ks-c-tgt">{adaTarget ? angka(b.target as number) : <>–<span className="ks-tanpa"> target belum ada</span></>}</td>
            <td role="cell" className="ks-num ks-c-kunj"><span className="ks-cap">
              <span className="ks-cap-bar" aria-hidden="true"><span style={{ width: `${t * 100}%`, '--t': t } as CSSProperties} /></span>
              <span className="ks-cap-n">{angka(b.jumlah_kessan)}</span>
            </span></td>
            <td role="cell" className="ks-num ks-c-pct">{adaTarget && b.persen != null ? `${persen(b.persen)}%` : '–'}</td>
            <td role="cell" className="ks-tgh ks-c-skor"><span className={`ks-chip ks-chip-${kelasSkor(b.skor)}`}>{b.skor}</span></td>
          </tr>;
        })}</tbody>
        {!petugas && <tfoot role="rowgroup"><tr role="row">
          <th scope="row" role="rowheader">Total {angka(r.jumlahFaskes)} faskes</th>
          <td role="cell" className="ks-kab ks-c-kab">–</td>
          <td role="cell" className="ks-num ks-c-tgt">{r.target > 0 ? angka(r.target) : '–'}</td>
          <td role="cell" className="ks-num ks-c-kunj"><span className="ks-cap"><span className="ks-cap-bar" aria-hidden="true" /><span className="ks-cap-n">{angka(r.kunjungan)}</span></span></td>
          <td role="cell" className="ks-num ks-c-pct">{r.persen != null ? `${persen(r.persen)}%` : '–'}</td>
          <td role="cell" className="ks-tgh ks-c-skor"><span className="ks-rr">rata-rata {skorRata(r.rataSkor)}</span></td>
        </tr></tfoot>}
      </table>
    </div>
    <div className="ks-kaki">
      <span>Skor kepatuhan:</span>
      <span><span className="ks-chip ks-chip-ok">100</span> ≥ 100% target</span>
      <span><span className="ks-chip ks-chip-mid">75</span> 75–&lt;100%</span>
      <span><span className="ks-chip ks-chip-mid">50</span> 50–&lt;75%</span>
      <span><span className="ks-chip ks-chip-bad">25</span> 25–&lt;50%</span>
      <span><span className="ks-chip ks-chip-bad">0</span> &lt; 25%</span>
      <span>Target belum ada (kosong atau 0): skor 100.</span>
    </div>
  </>;
}

function TabelMemuat() {
  return <div aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="ks-sk-baris">
    <Kerangka w="34%" h={14} /><Kerangka w="12%" h={14} /><Kerangka w="10%" h={14} /><Kerangka w="22%" h={10} /><Kerangka w="10%" h={14} />
  </div>)}</div>;
}

/* ---------- halaman ---------- */

export function MonitoringKessanDashboard() {
  const { user } = useAuthStore();
  const periodeRef = useRef<HTMLSelectElement>(null);
  // Lebar .ks-page = lebar container query `ks`; di bawah 640 px tabel tampil sebagai kartu.
  const [halRef, lebarHal] = useLebar<HTMLDivElement>(1280);
  const [cariAwal] = useState(() => (typeof window === 'undefined' ? '' : window.location.search));
  const [pilihan, setPilihan] = useState<FilterKessan | null>(null);
  const [umumkan, setUmumkan] = useState(false);
  const [urut, setUrut] = useState<Urutan>(URUT_BAWAAN);
  // Region status dipasang kosong dulu, lalu diisi sesudah jeda singkat supaya pembaca layar membacakannya.
  const [statusSiap, setStatusSiap] = useState(false);
  useEffect(() => { const t = setTimeout(() => setStatusSiap(true), 150); return () => clearTimeout(t); }, []);
  // Sesudah "Coba lagi": fokus ke Periode bila berhasil, kembali ke tombol bila gagal lagi.
  const cobaRef = useRef<HTMLButtonElement>(null);
  const [fokusKe, setFokusKe] = useState<'periode' | 'coba' | null>(null);
  const query = useQuery<ResponsKessan, Error>({
    queryKey: ['kessan'],
    queryFn: async ({ signal }) => (await apiClient.get('/api/v1/kessan/data', { signal, timeout: 30000 })).data,
    staleTime: 5 * 60 * 1000,
    retry: (n, error) => statusHttp(error) !== 403 && n < 1,
  });

  const r = query.data;
  const memuat = query.isPending;
  const galat = query.isError && !r;
  // Server tetap sumber kebenaran baris; peran sesi hanya dipakai sebelum respons ada (memuat dan galat).
  const terkunci = r ? !!r.terkunci : user?.role === 'Petugas RS';
  const tersedia = r?.bulan_tersedia ?? [];
  const terbaru = tersedia[tersedia.length - 1] || '';
  const daftarKab = r ? KABUPATEN_URUT.filter(k => r.kabupaten.includes(k)).concat(r.kabupaten.filter(k => !KABUPATEN_URUT.includes(k))) : KABUPATEN_URUT;
  const dasar = pilihan ?? bacaFilter(cariAwal, tersedia, daftarKab);
  const f: FilterKessan = {
    periode: tersedia.includes(dasar.periode) ? dasar.periode : terbaru,
    kabupaten: !terkunci && daftarKab.includes(dasar.kabupaten) ? dasar.kabupaten : '',
  };
  const semua = r?.baris ?? [];
  const barisPeriode = saring(semua, f.periode, '');
  const tampil = saring(semua, f.periode, f.kabupaten);
  const bulanSementara = r?.bulan_sementara ?? [];
  const sementara = !!f.periode && bulanSementara.includes(f.periode);
  const namaRs = r?.rs?.nama || semua[0]?.nama_faskes || '';
  const bawaan = f.periode === terbaru && !f.kabupaten;

  // Filter disimpan di alamat (?periode=…&kab=…) supaya tautan bisa dibagikan; nilai bawaan tidak ditulis.
  useEffect(() => {
    if (!r || typeof window === 'undefined') return;
    const cari = tulisFilter(window.location.search, f, terbaru);
    if (cari !== window.location.search) window.history.replaceState(window.history.state, '', `${window.location.pathname}${cari}${window.location.hash}`);
    // f dibentuk ulang tiap render; nilai primitifnya yang menjadi pemicu.
  }, [r, f.periode, f.kabupaten, terbaru]); // eslint-disable-line react-hooks/exhaustive-deps

  const ubah = (sebagian: Partial<FilterKessan>) => { setPilihan({ ...f, ...sebagian }); setUmumkan(true); };
  const aturUlang = () => { setPilihan({ periode: terbaru, kabupaten: '' }); setUmumkan(true); periodeRef.current?.focus(); };

  const teksStatus = memuat ? (statusSiap ? 'Memuat data Kessan…' : '')
    : umumkan && r ? teksStatusFilter({ jumlah: tampil.length, bulan: f.periode, kabupaten: f.kabupaten, sementara }) : '';
  const lastUpdate = galat ? 'Last Update : –' : r?.last_update_bi || (memuat ? ' ' : 'Last Update : –');
  const nonaktif = memuat || galat || !tersedia.length;
  const tanpaData = !!r && !tersedia.length;

  useEffect(() => {
    if (fokusKe === 'coba') { cobaRef.current?.focus(); setFokusKe(null); return; }
    if (fokusKe !== 'periode' || !r) return;
    if (!nonaktif) periodeRef.current?.focus();
    setFokusKe(null);
  }, [fokusKe, r, nonaktif]);
  const cobaLagi = async () => {
    if (query.isFetching) return;
    setUmumkan(true);
    const hasil = await query.refetch();
    setFokusKe(hasil.data ? 'periode' : 'coba');
  };

  const seri: SeriTren[] = terkunci
    ? [{ nama: namaRs || 'Faskes', warna: 'var(--ks-kab-1)', nilai: seriFaskes(semua, tersedia) }]
    : seriKabupaten(semua, tersedia, daftarKab).map(s => ({ ...s, warna: warnaKab(s.nama) }));

  const belumTerhubung = galat && statusHttp(query.error) === 403 && user?.role === 'Petugas RS';
  const belumDiatur = galat && detailGalat(query.error) === 'Data Kessan belum dikonfigurasi.';

  return <div className="sapa-page ks-page" ref={halRef}>
    <div className="ks-hal">
      <header className="ks-kepala">
        <div className="ks-pita">
          <h1>Monitoring Kessan FKRTL</h1>
          <p>Capaian kunjungan Kessan tiap FKRTL terhadap target bulanan</p>
        </div>
        <p className="ks-update"><span>{lastUpdate}</span><span className="ks-update-sumber">· sumber BI BPJS Kesehatan</span></p>
      </header>

      {sementara && !memuat && !galat && <p className="ks-sem">
        <IkonInfo /><span><strong>{labelBulan(f.periode)} · data sementara.</strong> Datanya diambil sebelum bulan selesai, jadi angkanya masih bisa bertambah.</span>
      </p>}
      {terkunci && <p className="ks-sem ks-info-rs"><IkonInfo /><span>Akun rumah sakit: hanya data faskes sendiri.</span></p>}

      <div className="ks-lay" data-keadaan={galat || tanpaData ? 'galat' : undefined}>
        <section className="ks-filter" aria-labelledby="ks-h-filter">
          <h2 id="ks-h-filter">Filter</h2>
          <div className="ks-filter-isi">
            <div className="ks-fld">
              <label htmlFor="ks-periode">Periode</label>
              <select id="ks-periode" ref={periodeRef} aria-describedby="ks-periode-bantu" value={f.periode} disabled={nonaktif}
                onChange={e => ubah({ periode: e.target.value })}>
                {tersedia.length ? tersedia.slice().reverse().map(b => <option key={b} value={b}>{labelBulan(b)}</option>) : <option value="">–</option>}
              </select>
              <p className="ks-bantu ks-sem-bantu" id="ks-periode-bantu">{sementara && !nonaktif ? 'Data sementara' : ''}</p>
            </div>
            {!terkunci && <div className="ks-fld">
              <label htmlFor="ks-kab">Kabupaten</label>
              <select id="ks-kab" value={f.kabupaten} disabled={nonaktif} onChange={e => ubah({ kabupaten: e.target.value })}>
                <option value="">Semua kabupaten</option>
                {daftarKab.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>}
            {!bawaan && !nonaktif && <button type="button" className="ks-btn-teks" onClick={aturUlang}>Atur ulang filter</button>}
          </div>
        </section>

        {galat ? (belumTerhubung
          ? <section className="ks-panel ks-galat" role="alert"><h3>Akun belum terhubung ke data faskes</h3>
            <p>Akun rumah sakit Anda belum terhubung ke data faskes. Hubungi administrator SAPA.</p></section>
          : <section className="ks-panel ks-galat" role="alert">
            <h3>{belumDiatur ? 'Data Kessan belum tersedia' : 'Data Kessan belum bisa dimuat'}</h3>
            <p>{belumDiatur ? 'Sumber data Kessan belum diatur. Hubungi administrator SAPA.' : 'Periksa koneksi, lalu coba lagi. Jika tetap gagal, hubungi administrator SAPA.'}</p>
            {/* aria-disabled, bukan disabled: tombol nonaktif kehilangan fokus dan fokus jatuh ke body. */}
            {!belumDiatur && <button ref={cobaRef} type="button" className="ks-btn" onClick={() => void cobaLagi()} aria-disabled={query.isFetching || undefined}>
              {query.isFetching ? 'Memuat…' : 'Coba lagi'}</button>}
          </section>)
          : tanpaData ? <section className="ks-panel ks-galat ks-kosong" aria-labelledby="ks-h-kosong">
            <h3 id="ks-h-kosong">Belum ada data Kessan</h3><p>Data Kessan belum tersedia.</p>
          </section>
          : <>
            {memuat ? <KartuMemuat /> : <Kartu baris={tampil} bulan={f.periode} kabupaten={f.kabupaten} petugas={terkunci} namaRs={namaRs} />}

            <div className="ks-viz" data-satu={terkunci || undefined}>
              {!terkunci && <section className="ks-panel" aria-labelledby="ks-h-kab">
                <div className="ks-panel-kepala"><h2 id="ks-h-kab">Kunjungan per kabupaten</h2>
                  {!memuat && <p className="ks-muted">{labelBulan(f.periode)} · klik bar untuk menyaring</p>}</div>
                {memuat ? <div aria-hidden="true">{[0, 1, 2].map(i => <div key={i} className="ks-sk-kb"><Kerangka w="80px" h={14} /><Kerangka w="70%" h={20} /></div>)}</div>
                  : <BarKabupaten barisPeriode={barisPeriode} daftarKab={daftarKab} bulan={f.periode} kabupaten={f.kabupaten} pilih={k => ubah({ kabupaten: k })} />}
              </section>}
              <section className="ks-panel" aria-labelledby="ks-h-tren">
                <div className="ks-panel-kepala"><h2 id="ks-h-tren">{terkunci ? 'Tren kunjungan Kessan' : 'Tren kunjungan per kabupaten'}</h2>
                  {!memuat && <p className="ks-muted">{rentangBulan(tersedia)}</p>}</div>
                {memuat ? <Kerangka w="100%" h={220} />
                  : <GrafikTren bulan={tersedia} seri={seri} terpilih={f.periode} sementara={bulanSementara} kabupaten={f.kabupaten} />}
              </section>
            </div>

            <section className="ks-panel ks-tbl" aria-labelledby="ks-h-tabel">
              <div className="ks-panel-kepala ks-tbl-kepala">
                <div>
                  <h2 id="ks-h-tabel">Capaian per faskes</h2>
                  {!memuat && <p className="ks-muted">
                    {labelBulan(f.periode)} · {terkunci ? namaRs : f.kabupaten ? `Kabupaten ${f.kabupaten}` : 'Semua kabupaten'} · {angka(tampil.length)} faskes
                    {sementara && <>{' '}<span className="ks-badge-sem">Data sementara</span></>}
                  </p>}
                </div>
                {/* Isi JPEG mengikuti Periode dan Kabupaten; urutan klik di tabel tidak dipakai (SPEK-jpeg.md). */}
                <UnduhJpegKessan baris={tampil} bulan={f.periode} kabupaten={f.kabupaten} petugas={terkunci} namaRs={namaRs}
                  sementara={sementara} lastUpdate={r?.last_update_bi} nonaktif={memuat} />
                {!memuat && tampil.length > 0 && <label className="ks-urut-hp">Urutkan
                  <select value={URUT_HP.some(o => o.v === `${urut.kolom}:${urut.arah}`) ? `${urut.kolom}:${urut.arah}` : ''}
                    onChange={e => { const [kolom, arah] = e.target.value.split(':'); setUrut({ kolom: kolom as KolomUrut, arah: arah as 'asc' | 'desc' }); }}>
                    {!URUT_HP.some(o => o.v === `${urut.kolom}:${urut.arah}`) && <option value="" disabled>{URUT_HP_LAIN[`${urut.kolom}:${urut.arah}`] ?? teksUrut(urut)}</option>}
                    {URUT_HP.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
                  </select>
                </label>}
              </div>
              {memuat ? <TabelMemuat />
                : !tampil.length ? <div className="ks-kosong">
                  <h3>Belum ada data Kessan untuk {labelBulan(f.periode) || 'periode ini'}</h3>
                  <p>Pilih bulan lain di filter Periode.{f.kabupaten ? ' Atau pilih Semua kabupaten.' : ''}</p>
                </div>
                : <TabelFaskes baris={tampil} bulan={f.periode} petugas={terkunci} urut={urut} setUrut={setUrut} kartu={lebarHal < 640} geser={lebarHal >= 640 && lebarHal < 812} />}
            </section>
          </>}
      </div>
      <p className="sr-only" role="status" id="status-filter">{teksStatus}</p>
    </div>
  </div>;
}
