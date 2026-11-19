import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Typography, useMediaQuery } from '@mui/material';
import { toJpeg } from 'html-to-image';
import MainCard from '../berry/MainCard';
import { apiClient } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import { KerangkaMemuat } from './ui/KerangkaMemuat';
import { FilterSelect, FilterOption } from './ui/FilterSelect';
import {
  JENIS, STATUS, angka, dataBelumLengkap, gabungJenis, labelBulan, labelTotalCabang, namaBerkasJpeg, persen,
  ringkasStatus, saringStatus, statusJenis, tanggalSampai, totalOf, treemap, urutFaskes, urutPoli,
} from '../lib/suratKontrol';
import type { BarisFaskes, BarisPoli, BarisTren, DataBulan, DataJenis, Jumlah, Kunci, PilihanJenis, PilihanStatus } from '../lib/suratKontrol';
import '../berry/berry-dashboards.css';
import './suratKontrol.css';

// Hi-fi Kim: agents/kim/desain/monitoring-surkon/SPEK.md, termasuk Revisi v1.1.
type Respons = {
  bulan_tersedia: string[];
  bulan: string | null;
  data: DataBulan | null;
  rs: { kode: string; nama: string } | null;
  terkunci: boolean;
  diunggah_pada: string;
};

const statusHttp = (error: unknown) => (error as { response?: { status?: number } })?.response?.status;
const rincian = (j: Jumlah, daftar: Kunci[]) => daftar.map(k => `${STATUS[k].label} ${angka(j[k])}`).join(' · ');
const CATATAN_BELUM_LENGKAP = 'Surkon > SEP untuk tanggal-tanggal terakhir masih bisa bertambah, karena surat kontrolnya terbit setelah tanggal SEP.';

function useLebar<T extends HTMLElement>(awal: number) {
  const ref = useRef<T>(null);
  const [lebar, setLebar] = useState(awal);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setLebar(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, lebar] as const;
}

/** Segmen bar: flex sebanding nilai, minimal 2 px, celah 2 px di dalam panjang bar (v1.1 #6). */
function Batang({ j, maks, daftar }: { j: Jumlah; maks: number; daftar: Kunci[] }) {
  return <span className="sk-batang-jalur" aria-hidden="true"><span className="sk-batang" style={{ width: `${(totalOf(j) / maks) * 100}%` }}>
    {daftar.filter(k => j[k] > 0).map(k => <span key={k} className={`sk-isi-${k}`} style={{ flex: `${j[k]} 1 0` }} />)}
  </span></span>;
}

function Legenda({ daftar }: { daftar: Kunci[] }) {
  return <div className="sk-legenda" aria-hidden="true">{daftar.map(k => <span key={k}><i className={`sk-sw sk-sw-${k}`} />{k === 'gt' ? '⚠ ' : ''}{STATUS[k].label}</span>)}</div>;
}

function TabelStatus({ judul, kolom, baris, daftar }: { judul: string; kolom: string; baris: { label: string; j: Jumlah }[]; daftar: Kunci[] }) {
  return <div className="sk-tabel-gulir"><table className="sk-tabel"><caption className="sr-only">{judul}</caption>
    <thead><tr><th scope="col">{kolom}</th>{daftar.map(k => <th scope="col" key={k}>{STATUS[k].label}</th>)}<th scope="col">Total</th></tr></thead>
    <tbody>{baris.map(b => <tr key={b.label}><th scope="row">{b.label}</th>{daftar.map(k => <td key={k}>{angka(b.j[k])}</td>)}<td>{angka(totalOf(b.j))}</td></tr>)}</tbody>
  </table></div>;
}

/** Kepala panel dengan tombol "Lihat sebagai tabel"/"Lihat sebagai grafik"; fokus tetap di tombol. */
function Kepala({ id, judul, ket, tabel, setTabel, penuh }: { id: string; judul: ReactNode; ket?: string; tabel?: boolean; setTabel?: (v: boolean) => void; penuh: boolean }) {
  return <div className="sk-panel-kepala"><div><h2 id={id}>{judul}</h2>{ket && <p className="sk-ket">{ket}</p>}</div>
    {setTabel && !penuh && <button type="button" className="sk-tautan sk-jpeg-abaikan" aria-expanded={tabel} onClick={() => setTabel(!tabel)}>
      {tabel ? 'Lihat sebagai grafik' : 'Lihat sebagai tabel'}</button>}</div>;
}

function KartuStatus({ d, kodeRs, namaRs, status, jenis, bulan }: { d: DataJenis; kodeRs: string; namaRs: string; status: PilihanStatus; jenis: PilihanJenis; bulan: string }) {
  const r = ringkasStatus(d, kodeRs);
  const daftar = statusJenis(jenis);
  return <MainCard content={false} className="sk-panel berry-dashboard-card" aria-labelledby="sk-status">
    <div className="sk-panel-kepala"><div>
      <h2 id="sk-status">Status surat kontrol{namaRs ? ` · ${namaRs}` : ''}</h2>
      <p className="sk-ket">Jumlah SEP kontrol, <span className="sk-aksen">{labelBulan(bulan)}</span></p>
    </div></div>
    {kodeRs && r.total === 0 && <p className="sk-kosong">Belum ada SEP kontrol {namaRs} pada {labelBulan(bulan)}.</p>}
    <div className={`sk-kpi sk-n${daftar.length}`}>
      {daftar.map(k => {
        const luar = status !== 'semua' && status !== k;
        return <div key={k} className={`sk-ubin sk-${k}`} data-redup={luar}>
          <div className="sk-ubin-nama"><i className={`sk-sw sk-sw-${k}`} aria-hidden="true" />{k === 'gt' && <span aria-hidden="true">⚠&nbsp;</span>}{STATUS[k].label}</div>
          <div className={`sk-ubin-angka sk-teks-${k}`}>{angka(r.jumlah[k])}</div>
          <div className="sk-ubin-persen">{persen(r.persen[k])}</div>
          <p className="sk-ubin-def">{STATUS[k].definisi}</p>
          {luar && <p className="sk-ubin-tidak">Tidak termasuk filter</p>}
        </div>;
      })}
    </div>
    {jenis === 'RJ' && <p className="sk-catatan">Rawat jalan tidak punya status Surkon &gt; SEP.</p>}
  </MainCard>;
}

function Tren({ tren, daftar, bulan, ket, catatan, penuh }: { tren: BarisTren[]; daftar: Kunci[]; bulan: string; ket: string; catatan: string; penuh: boolean }) {
  const [tabel, setTabel] = useState(false);
  const [ref, W] = useLebar<HTMLDivElement>(penuh ? 560 : 600);
  const H = 210, bawah = 24, atas = 6, kiri = 10;
  const hariMaks = Math.max(1, ...tren.map(t => t.hari));
  const maks = Math.max(1, ...tren.map(totalOf));
  const x = (h: number) => kiri + ((h - 1) / Math.max(1, hariMaks - 1)) * (W - kiri * 2);
  const y = (v: number) => H - bawah - (v / maks) * (H - bawah - atas);
  const lapisan = daftar.map((k, i) => {
    const dasar = (t: Jumlah) => daftar.slice(0, i).reduce((s, kk) => s + t[kk], 0);
    return { k, ada: tren.some(t => t[k] > 0), titik: [...tren.map(t => `${x(t.hari)},${y(dasar(t) + t[k])}`), ...[...tren].reverse().map(t => `${x(t.hari)},${y(dasar(t))}`)].join(' ') };
  }).filter(l => l.ada);
  const langkah = hariMaks <= 15 ? 1 : 5;
  const lebar = (W - kiri * 2) / Math.max(1, hariMaks - 1);
  const teks = (t: BarisTren) => `${t.hari} ${labelBulan(bulan)} · ${rincian(t, daftar)} · Total ${angka(totalOf(t))}`;
  return <MainCard content={false} className="sk-panel sk-tren berry-dashboard-card" aria-labelledby="sk-tren">
    <Kepala id="sk-tren" judul={<>Tren tanggal terbit SEP kontrol (<span className="sk-aksen">{labelBulan(bulan)}</span>)</>} ket={ket} tabel={tabel} setTabel={setTabel} penuh={penuh} />
    {tren.length === 0 ? <p className="sk-kosong">—</p> : tabel && !penuh
      ? <TabelStatus judul="Jumlah SEP kontrol per tanggal" kolom="Tanggal" daftar={daftar} baris={tren.map(t => ({ label: String(t.hari), j: t }))} />
      : <div ref={ref}>
        <Legenda daftar={daftar} />
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Tren jumlah SEP kontrol per tanggal, 1–${hariMaks} ${labelBulan(bulan)}`}>
          {lapisan.map(l => <polygon key={l.k} points={l.titik} style={{ fill: `var(--sk-isi-${l.k})` }} />)}
          {tren.map(t => <g key={t.hari} className="sk-titik" tabIndex={penuh ? -1 : 0} role="img" aria-label={teks(t)}>
            <title>{teks(t)}</title>
            <rect x={x(t.hari) - lebar / 2} y={0} width={lebar} height={H - bawah} fill="transparent" />
          </g>)}
          {tren.filter(t => t.hari === 1 || t.hari % langkah === 0).map(t => <text key={t.hari} x={x(t.hari)} y={H - 6} textAnchor="middle" className="sk-sumbu">{t.hari}</text>)}
        </svg>
      </div>}
    {catatan && <p className="sk-catatan">{catatan}</p>}
  </MainCard>;
}

function Faskes({ d, status, kodeRs, hp, petugas, daftar, penuh }: { d: DataJenis; status: PilihanStatus; kodeRs: string; hp: boolean; petugas: boolean; daftar: Kunci[]; penuh: boolean }) {
  const [semua, setSemua] = useState(false);
  const [tabel, setTabel] = useState(false);
  const daftarRef = useRef<HTMLUListElement>(null);
  const baris = urutFaskes(d.faskes, status);
  const maks = Math.max(1, ...baris.map(totalOf));
  let tampil: BarisFaskes[] = hp && !semua && !penuh ? baris.slice(0, 8) : baris;
  const terpilih = baris.find(f => f.kode === kodeRs);
  if (terpilih && !tampil.includes(terpilih)) tampil = [terpilih, ...tampil];  // v1.1 #11: disematkan di atas
  useEffect(() => {
    daftarRef.current?.querySelector('[data-sorot="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [kodeRs, status]);
  return <MainCard content={false} className="sk-panel berry-dashboard-card" aria-labelledby="sk-faskes">
    <Kepala id="sk-faskes" judul="Fasilitas kesehatan" ket={petugas ? 'Perbandingan antarfaskes tidak ditampilkan untuk akun rumah sakit.' : ''} tabel={tabel} setTabel={setTabel} penuh={penuh} />
    {baris.length === 0 ? <p className="sk-kosong">Tidak ada SEP kontrol untuk pilihan ini.</p> : tabel && !penuh
      ? <TabelStatus judul="Jumlah SEP kontrol per fasilitas kesehatan" kolom="Fasilitas kesehatan" daftar={daftar} baris={baris.map(f => ({ label: f.nama, j: f }))} />
      : <>
        <Legenda daftar={daftar} />
        <ul ref={daftarRef} className={`sk-bar-daftar ${hp && !penuh ? 'sk-dua-tingkat' : penuh ? '' : 'sk-gulir'}`}>
          {tampil.map(f => <li key={f.kode} className="sk-bar" data-sorot={f.kode === kodeRs && !petugas} title={`${f.kode} - ${f.nama}\n${rincian(f, daftar)}`}>
            <span className="sk-bar-nama">{f.nama}</span>
            <Batang j={f} maks={maks} daftar={daftar} />
            <span className="sk-bar-total">{angka(totalOf(f))}</span>
            <span className="sr-only">{rincian(f, daftar)}</span>
          </li>)}
        </ul>
        {hp && !penuh && baris.length > 8 && <button type="button" className="sk-tautan sk-jpeg-abaikan" onClick={() => setSemua(v => !v)}>
          {semua ? 'Tampilkan 8 teratas' : `Tampilkan semua (${baris.length})`}</button>}
      </>}
  </MainCard>;
}

function Poli({ poli, status, hp, ket, daftar, penuh }: { poli: BarisPoli[]; status: PilihanStatus; hp: boolean; ket: string; daftar: Kunci[]; penuh: boolean }) {
  const [semua, setSemua] = useState(false);
  const [tabel, setTabel] = useState(false);
  const urut = urutPoli(poli, status);
  const maks = Math.max(1, ...urut.map(totalOf));
  const teks = (p: BarisPoli) => `${p.nama} · ${rincian(p, daftar)} · Total ${angka(totalOf(p))}`;
  return <MainCard content={false} className="sk-panel berry-dashboard-card" aria-labelledby="sk-poli">
    <Kepala id="sk-poli" judul="Poli tujuan SEP" ket={ket} tabel={tabel} setTabel={setTabel} penuh={penuh} />
    {urut.length === 0 ? <p className="sk-kosong">—</p> : tabel && !penuh
      ? <TabelStatus judul="Jumlah SEP kontrol per poli tujuan" kolom="Poli" daftar={daftar} baris={urut.map(p => ({ label: p.nama, j: p }))} />
      : <>
        <Legenda daftar={daftar} />
        {hp && !penuh ? <>
          <ul className="sk-bar-daftar sk-dua-tingkat">{(semua ? urut : urut.slice(0, 10)).map(p => <li key={p.nama} className="sk-bar" title={teks(p)}>
            <span className="sk-bar-nama">{p.nama}</span><Batang j={p} maks={maks} daftar={daftar} /><span className="sk-bar-total">{angka(totalOf(p))}</span>
            <span className="sr-only">{rincian(p, daftar)}</span></li>)}</ul>
          {urut.length > 10 && <button type="button" className="sk-tautan sk-jpeg-abaikan" onClick={() => setSemua(v => !v)}>
            {semua ? 'Tampilkan 10 teratas' : `Tampilkan semua (${urut.length})`}</button>}
        </> : <TreemapPoli urut={urut} teks={teks} daftar={daftar} penuh={penuh} />}
      </>}
  </MainCard>;
}

function TreemapPoli({ urut, teks, daftar, penuh }: { urut: BarisPoli[]; teks: (p: BarisPoli) => string; daftar: Kunci[]; penuh: boolean }) {
  const [ref, w] = useLebar<HTMLDivElement>(penuh ? 560 : 600);
  const h = 300;
  const peta = new Map(urut.map(p => [p.nama, p]));
  const kotak = treemap(urut.map(p => ({ id: p.nama, nilai: totalOf(p) })), 100, 100);
  return <div ref={ref} className="sk-treemap" role="group" aria-label="Treemap poli tujuan SEP">
    {kotak.map(c => {
      const p = peta.get(c.id)!;
      const pw = (c.w / 100) * w, ph = (c.h / 100) * h;
      return <div key={c.id} tabIndex={penuh ? -1 : 0} role="img" className="sk-tm" title={teks(p)} aria-label={teks(p)}
        style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%` }}>
        <div className="sk-tm-isi">{daftar.filter(k => p[k] > 0).map(k => <span key={k} className={`sk-isi-${k}`} style={{ flex: `${p[k]} 1 0` }} />)}</div>
        {pw >= 72 && ph >= 36 ? <span className="sk-tm-label" aria-hidden="true"><b>{p.nama}</b>{angka(totalOf(p))}</span>
          : pw >= 40 && ph >= 24 ? <span className="sk-tm-label" aria-hidden="true">{angka(totalOf(p))}</span> : null}
      </div>;
    })}
  </div>;
}

type IsiProps = { d: DataJenis; kodeRs: string; namaRs: string; status: PilihanStatus; jenis: PilihanJenis; bulan: string; sampai: string; hp: boolean; petugas: boolean; penuh: boolean };

function Isi({ d, kodeRs, namaRs, status, jenis, bulan, sampai, hp, petugas, penuh }: IsiProps) {
  const daftar = statusJenis(jenis);
  const r = ringkasStatus(d, kodeRs);
  const ket = labelTotalCabang(petugas || !!kodeRs);
  const belum = dataBelumLengkap(sampai) && jenis !== 'RJ' ? CATATAN_BELUM_LENGKAP : '';
  const tampilStatus = status === 'semua' ? daftar : [status];
  return <div className="sk-grid" data-penuh={penuh}>
    <KartuStatus d={d} kodeRs={kodeRs} namaRs={namaRs} status={status} jenis={jenis} bulan={bulan} />
    <Tren tren={d.tren.map(t => ({ hari: t.hari, ...saringStatus(t, status) }))} daftar={tampilStatus} bulan={bulan} ket={ket} catatan={belum} penuh={penuh} />
    <Faskes d={d} status={status} kodeRs={kodeRs} hp={hp} petugas={petugas} daftar={tampilStatus} penuh={penuh} />
    <Poli poli={d.poli} status={status} hp={hp} ket={ket} daftar={tampilStatus} penuh={penuh} />
    <MainCard content={false} className="sk-panel sk-penuh berry-dashboard-card" aria-labelledby="sk-gt">
      <div className="sk-panel-kepala"><h2 id="sk-gt"><span className="sk-aksen">Surkon &gt; SEP</span> pada <span className="sk-aksen">{labelBulan(bulan)}</span></h2></div>
      {jenis === 'RJ' ? <p className="sk-kosong">Tidak ada status Surkon &gt; SEP untuk rawat jalan.</p>
        : status === 'lt' || status === 'eq' ? <p className="sk-kosong">Surkon &gt; SEP tidak termasuk filter Status yang dipilih.</p>
        : r.jumlah.gt === 0 ? <p className="sk-kosong">Tidak ada SEP dengan kondisi Surkon &gt; SEP pada {labelBulan(bulan)}.</p>
        : <><p className="sk-besar">{angka(r.jumlah.gt)} SEP <span className="sk-ubin-persen">({persen(r.persen.gt)})</span></p>
          <p className="sk-catatan">surat kontrol terbit setelah tanggal SEP{namaRs ? ` · ${namaRs}` : ''}</p></>}
      {belum && <p className="sk-catatan">{belum}</p>}
    </MainCard>
  </div>;
}

export function MonitoringSuratKontrolDashboard() {
  const { user } = useAuthStore();
  const admin = user?.role === 'Admin' || user?.role === 'Super Admin';
  const [bulan, setBulan] = useState('');
  const [rs, setRs] = useState('');
  const [status, setStatus] = useState<PilihanStatus>('semua');
  const [jenis, setJenis] = useState<PilihanJenis>('RJ');
  const [pesanFilter, setPesanFilter] = useState('');
  const [jpeg, setJpeg] = useState<'diam' | 'menyiapkan' | 'gagal'>('diam');
  const eksporRef = useRef<HTMLDivElement>(null);
  const hp = useMediaQuery('(max-width: 639px)');
  const query = useQuery<Respons, Error>({
    queryKey: ['surat-kontrol', bulan],
    queryFn: async ({ signal }) => (await apiClient.get('/api/v1/surat-kontrol/data', { params: bulan ? { bulan } : {}, signal, timeout: 30000 })).data,
    staleTime: 5 * 60 * 1000,
    retry: (n, error) => statusHttp(error) !== 403 && n < 1,
    placeholderData: prev => prev,
  });
  const r = query.data;
  const bulanAktif = r?.bulan || '';
  const dataBulan = r?.data ?? null;
  const d = dataBulan ? gabungJenis(dataBulan, jenis) : null;
  const terkunci = !!r?.terkunci;
  const kodeRs = terkunci ? r?.rs?.kode || '' : rs;
  const daftarRs = useMemo(() => (dataBulan ? gabungJenis(dataBulan, 'semua').faskes.map(f => ({ kode: f.kode, nama: f.nama }))
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id')) : []), [dataBulan]);
  const namaRs = terkunci ? r?.rs?.nama || '' : daftarRs.find(f => f.kode === rs)?.nama || '';
  const daftar = statusJenis(jenis);
  const ringkasFilter = [labelBulan(bulanAktif), JENIS[jenis], namaRs || 'Semua faskes', status === 'semua' ? 'Semua status' : STATUS[status].label].join(' · ');

  const gantiJenis = (j: PilihanJenis) => {
    setJenis(j);
    if (j === 'RJ' && status === 'gt') {
      setStatus('semua');
      setPesanFilter('Filter Status dikembalikan ke Semua status karena rawat jalan tidak punya Surkon > SEP.');
    } else setPesanFilter('');
  };

  useEffect(() => {
    if (jpeg !== 'menyiapkan') return;
    let batal = false;
    const t = window.setTimeout(async () => {
      const node = eksporRef.current;
      if (!node || batal) return;
      try {
        const url = await toJpeg(node, { quality: 0.95, backgroundColor: '#ffffff', pixelRatio: 2, skipFonts: true, width: 1280,
          filter: n => !(n instanceof HTMLElement && n.classList.contains('sk-jpeg-abaikan')) });
        if (batal) return;
        const a = document.createElement('a');
        a.download = `${namaBerkasJpeg(bulanAktif, jenis, namaRs)}.jpg`;
        a.href = url;
        a.click();
        setJpeg('diam');
      } catch (error) {
        console.error('Gagal membuat JPEG Surat Kontrol', error);
        if (!batal) setJpeg('gagal');
      }
    }, 200);
    return () => { batal = true; window.clearTimeout(t); };
  }, [jpeg, bulanAktif, jenis, namaRs]);

  const filter = [
    { id: 'bulan', label: 'Bulan SEP', value: bulanAktif, onChange: setBulan, disabled: !r?.bulan_tersedia.length,
      opsi: (r?.bulan_tersedia || []).slice().reverse().map(b => ({ value: b, label: labelBulan(b) })) },
    { id: 'rs', label: 'Fasilitas kesehatan', value: terkunci ? kodeRs : rs, onChange: setRs, disabled: terkunci,
      opsi: terkunci ? [{ value: kodeRs, label: `🔒 ${namaRs}` }] : [{ value: '', label: 'Semua faskes' }, ...daftarRs.map(f => ({ value: f.kode, label: f.nama }))] },
    { id: 'status', label: 'Status', value: status, onChange: (v: string) => setStatus(v as PilihanStatus),
      opsi: [{ value: 'semua', label: 'Semua status' }, ...daftar.map(k => ({ value: k, label: STATUS[k].label }))] },
    { id: 'jenis', label: 'Jenis pelayanan', value: jenis, onChange: (v: string) => gantiJenis(v as PilihanJenis),
      opsi: (['RJ', 'RI', 'semua'] as PilihanJenis[]).map(j => ({ value: j, label: JENIS[j] })) },
  ];
  const props = d && dataBulan ? { d, kodeRs, namaRs, status, jenis, bulan: bulanAktif, sampai: dataBulan.sampai, hp, petugas: terkunci } : null;

  return <div className="sapa-page sk-page berry-dashboard">
    <header className="sk-judul">
      <div>
        <p className="sapa-eyebrow">Ruang kerja / Pemantauan / Monitoring Surat Kontrol</p>
        <Typography component="h1" variant="h3" className="sapa-title">Monitoring Surat Kontrol</Typography>
        <p className="sapa-description">Membandingkan tanggal terbit surat kontrol dengan tanggal SEP kontrol di FKRTL. Berbeda dengan tab
          07 Surkon di Kepatuhan FKRTL, yang menilai kepatuhan penerbitan lewat bridging.</p>
        {dataBulan && <p className="sk-data-per">Data SEP sampai <strong>{tanggalSampai(dataBulan.sampai)}</strong> · sumber BI BPJS Kesehatan</p>}
      </div>
      <span>
        <button type="button" className="sapa-button sapa-button-secondary" onClick={() => setJpeg('menyiapkan')} disabled={!d || jpeg === 'menyiapkan'} aria-busy={jpeg === 'menyiapkan'}>
          {jpeg === 'menyiapkan' ? 'Menyiapkan JPEG…' : 'Unduh JPEG'}</button>
        {jpeg === 'gagal' && <span role="alert" className="sk-catatan block">JPEG belum bisa dibuat. Coba lagi.</span>}
      </span>
    </header>

    <MainCard content={false} className="sk-filter berry-dashboard-card" aria-label="Filter monitoring surat kontrol">
      <div className="sk-filter-grid">
        {filter.map(f => <div key={f.id}>
          <label htmlFor={`sk-${f.id}`}>{f.label}</label>
          <FilterSelect id={`sk-${f.id}`} aria-label={f.label} value={f.value} className="w-full" disabled={f.disabled || query.isPending || !d}
            onChange={e => f.onChange(e.target.value)}>
            {f.opsi.map(o => <FilterOption key={o.value} value={o.value}>{o.label}</FilterOption>)}
          </FilterSelect>
        </div>)}
        {terkunci && <p className="sk-filter-ket">Akun rumah sakit hanya bisa memilih faskesnya sendiri. Tren dan poli tetap total cabang.</p>}
        <p className="sk-filter-ket" role="status">{pesanFilter || (d ? `Menampilkan ${ringkasFilter}` : '')}</p>
      </div>
    </MainCard>

    {query.isPending ? <KerangkaMemuat label="Memuat monitoring surat kontrol" /> : query.isError ? (
      statusHttp(query.error) === 403 && user?.role === 'Petugas RS'
        ? <div className="sk-info" role="alert">Akun rumah sakit Anda belum terhubung ke data faskes. Hubungi administrator SAPA.</div>
        : <MainCard content={false} className="sk-panel berry-dashboard-card" role="alert">
          <p className="sk-kosong">Data Monitoring Surat Kontrol belum bisa dimuat.</p>
          <button type="button" className="sapa-button" onClick={() => void query.refetch()} disabled={query.isFetching}>Coba lagi</button>
        </MainCard>
    ) : !props ? (
      <div className="sk-info" role="status">
        <span>Belum ada data Monitoring Surat Kontrol.{' '}
          {admin ? <>Unggah data bulanan di menu <a href="/integration">Integrasi data</a>.</> : 'Data akan tampil setelah admin mengunggahnya.'}</span>
      </div>
    ) : <div aria-busy={query.isFetching}><Isi {...props} penuh={false} /></div>}

    {/* v1.1 #14: simpul ekspor khusus, 1280 px, tema terang, daftar lengkap tanpa gulir. */}
    {jpeg === 'menyiapkan' && props && <div className="sk-ekspor-wadah" aria-hidden="true">
      <div ref={eksporRef} className="sk-ekspor sk-page">
        <p className="sk-ekspor-judul"><strong>Monitoring Surat Kontrol</strong> · {ringkasFilter} · data SEP sampai {tanggalSampai(props.sampai)}</p>
        <Isi {...props} hp={false} penuh />
      </div>
    </div>}
  </div>;
}
