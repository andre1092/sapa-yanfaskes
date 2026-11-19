import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Typography, useMediaQuery } from '@mui/material';
import { toJpeg } from 'html-to-image';
import MainCard from '../berry/MainCard';
import { apiClient } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import { KerangkaMemuat } from './ui/KerangkaMemuat';
import { FilterSelect, FilterOption } from './ui/FilterSelect';
import {
  JENIS, STATUS, angka, gabungJenis, labelBulan, labelTotalCabang, namaBerkasJpeg, persen, poliTeratas,
  ringkasStatus, saringStatus, statusJenis, tanggalSampai, totalOf, treemap,
} from '../lib/suratKontrol';
import type { BarisPoli, BarisTren, DataBulan, DataJenis, Jumlah, Kunci, PilihanJenis, PilihanStatus } from '../lib/suratKontrol';
import '../berry/berry-dashboards.css';
import './suratKontrol.css';

// Hi-fi Kim: agents/kim/desain/monitoring-surkon/SPEK.md. Tren dan Poli selalu total cabang (keputusan CEO 2b).
type Respons = {
  bulan_tersedia: string[];
  bulan: string | null;
  data: DataBulan | null;
  rs: { kode: string; nama: string } | null;
  terkunci: boolean;
  diunggah_pada: string;
};

const statusHttp = (error: unknown) => (error as { response?: { status?: number } })?.response?.status;
const rincianStatus = (j: Jumlah, daftar: Kunci[]) => daftar.map(k => `${STATUS[k].label} ${angka(j[k])}`).join(' · ');

function Batang({ j, maks, daftar }: { j: Jumlah; maks: number; daftar: Kunci[] }) {
  return <span className="sk-batang" aria-hidden="true" style={{ width: `${Math.max(2, (totalOf(j) / maks) * 100)}%` }}>
    {daftar.filter(k => j[k] > 0).map(k => <span key={k} className={`sk-isi-${k}`} style={{ flexGrow: j[k] }} />)}
  </span>;
}

function Legenda({ daftar }: { daftar: Kunci[] }) {
  return <div className="sk-legenda" aria-hidden="true">{daftar.map(k => <span key={k}><i className={`sk-sw sk-sw-${k}`} />{STATUS[k].label}</span>)}</div>;
}

function TabelStatus({ judul, kolom, baris, daftar }: { judul: string; kolom: string; baris: { label: string; j: Jumlah }[]; daftar: Kunci[] }) {
  return <div className="sk-tabel-gulir"><table className="sk-tabel"><caption className="sr-only">{judul}</caption>
    <thead><tr><th scope="col">{kolom}</th>{daftar.map(k => <th scope="col" key={k}>{STATUS[k].label}</th>)}<th scope="col">Total</th></tr></thead>
    <tbody>{baris.map(b => <tr key={b.label}><th scope="row">{b.label}</th>{daftar.map(k => <td key={k}>{angka(b.j[k])}</td>)}<td>{angka(totalOf(b.j))}</td></tr>)}</tbody>
  </table></div>;
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
        const redup = status !== 'semua' && status !== k;
        return <div key={k} className={`sk-ubin sk-${k}`} data-redup={redup}>
          <div className="sk-ubin-nama"><i className={`sk-sw sk-sw-${k}`} aria-hidden="true" />{k === 'gt' && <span aria-hidden="true">⚠&nbsp;</span>}{STATUS[k].label}</div>
          <div className={`sk-ubin-angka sk-teks-${k}`}>{angka(r.jumlah[k])}</div>
          <div className="sk-ubin-persen">{persen(r.persen[k])}</div>
          <p className="sk-ubin-def">{STATUS[k].definisi}</p>
          {redup && <p className="sk-ubin-tidak">Tidak termasuk filter</p>}
        </div>;
      })}
    </div>
    {jenis === 'RJ' && <p className="sk-catatan">Rawat jalan tidak punya status Surkon &gt; SEP.</p>}
  </MainCard>;
}

function Tren({ tren, daftar, bulan, ket }: { tren: BarisTren[]; daftar: Kunci[]; bulan: string; ket: string }) {
  const [tabel, setTabel] = useState(false);
  const W = 600, H = 210, bawah = 22, atas = 6, kiri = 8;
  const hariMaks = Math.max(1, ...tren.map(t => t.hari));
  const maks = Math.max(1, ...tren.map(totalOf));
  const x = (h: number) => kiri + ((h - 1) / Math.max(1, hariMaks - 1)) * (W - kiri * 2);
  const y = (v: number) => H - bawah - (v / maks) * (H - bawah - atas);
  const lapisan = daftar.map((k, i) => {
    const dasar = (t: Jumlah) => daftar.slice(0, i).reduce((s, kk) => s + t[kk], 0);
    return { k, titik: [...tren.map(t => `${x(t.hari)},${y(dasar(t) + t[k])}`), ...[...tren].reverse().map(t => `${x(t.hari)},${y(dasar(t))}`)].join(' ') };
  });
  const langkah = hariMaks <= 15 ? 1 : 5;
  const lebar = (W - kiri * 2) / Math.max(1, hariMaks - 1);
  const teks = (t: BarisTren) => `${t.hari} ${labelBulan(bulan)} · ${daftar.map(k => `${k === 'lt' ? 'Surkon < SEP' : k === 'eq' ? '= SEP' : '> SEP'} ${angka(t[k])}`).join(' · ')} · Total ${angka(totalOf(t))}`;
  return <MainCard content={false} className="sk-panel sk-tren berry-dashboard-card" aria-labelledby="sk-tren">
    <div className="sk-panel-kepala"><div>
      <h2 id="sk-tren">Tren tanggal terbit SEP kontrol (<span className="sk-aksen">{labelBulan(bulan)}</span>)</h2>
      <p className="sk-ket">{ket}</p>
    </div><button type="button" className="sk-tautan sk-jpeg-abaikan" aria-expanded={tabel} onClick={() => setTabel(v => !v)}>{tabel ? 'Lihat sebagai grafik' : 'Lihat sebagai tabel'}</button></div>
    {tren.length === 0 ? <p className="sk-kosong">—</p> : tabel
      ? <TabelStatus judul="Jumlah SEP kontrol per tanggal" kolom="Tanggal" daftar={daftar} baris={tren.map(t => ({ label: String(t.hari), j: t }))} />
      : <>
        <Legenda daftar={daftar} />
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tren jumlah SEP kontrol per tanggal, 1–${hariMaks} ${labelBulan(bulan)}`}>
          {[0.25, 0.5, 0.75].map(g => <line key={g} className="sk-garis" x1={kiri} x2={W - kiri} y1={y(maks * g)} y2={y(maks * g)} />)}
          {lapisan.map(l => <polygon key={l.k} points={l.titik} style={{ fill: `var(--sk-isi-${l.k})` }} />)}
          {tren.map(t => <g key={t.hari} className="sk-titik" tabIndex={0} aria-label={teks(t)}>
            <title>{teks(t)}</title>
            <rect x={x(t.hari) - lebar / 2} y={0} width={lebar} height={H - bawah} fill="transparent" />
          </g>)}
          {tren.filter(t => t.hari === 1 || t.hari % langkah === 0).map(t => <text key={t.hari} x={x(t.hari)} y={H - 6} textAnchor="middle" className="sk-sumbu">{t.hari}</text>)}
        </svg>
      </>}
  </MainCard>;
}

function Faskes({ d, status, kodeRs, hp, petugas, daftar }: { d: DataJenis; status: PilihanStatus; kodeRs: string; hp: boolean; petugas: boolean; daftar: Kunci[] }) {
  const [semua, setSemua] = useState(false);
  const daftarRef = useRef<HTMLUListElement>(null);
  const baris = d.faskes.map(f => ({ ...f, ...saringStatus(f, status) })).filter(f => totalOf(f) > 0).sort((a, b) => totalOf(b) - totalOf(a));
  const maks = Math.max(1, ...baris.map(totalOf));
  const tampil = hp && !semua ? baris.slice(0, 8) : baris;
  useEffect(() => {
    daftarRef.current?.querySelector('[data-sorot="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [kodeRs, status]);
  return <MainCard content={false} className="sk-panel berry-dashboard-card" aria-labelledby="sk-faskes">
    <div className="sk-panel-kepala"><div>
      <h2 id="sk-faskes">Fasilitas kesehatan</h2>
      {petugas && <p className="sk-ket">Perbandingan antar-faskes tidak ditampilkan untuk akun rumah sakit.</p>}
    </div></div>
    {baris.length === 0 ? <p className="sk-kosong">Tidak ada SEP kontrol untuk pilihan ini.</p> : <>
      <Legenda daftar={daftar} />
      <ul ref={daftarRef} className={`sk-bar-daftar ${hp ? '' : 'sk-gulir'}`}>
        {tampil.map(f => <li key={f.kode} className="sk-bar" data-sorot={f.kode === kodeRs && !petugas}
          title={`${f.kode} - ${f.nama}\n${rincianStatus(f, daftar)}`}>
          <span className="sk-bar-nama">{f.nama}</span>
          <Batang j={f} maks={maks} daftar={daftar} />
          <span className="sk-bar-total">{angka(totalOf(f))}</span>
          <span className="sr-only">{rincianStatus(f, daftar)}</span>
        </li>)}
      </ul>
      {hp && baris.length > 8 && <button type="button" className="sk-tautan sk-jpeg-abaikan" onClick={() => setSemua(v => !v)}>
        {semua ? 'Tampilkan 8 teratas' : `Tampilkan semua (${baris.length})`}</button>}
    </>}
  </MainCard>;
}

function Poli({ poli, hp, ket, daftar }: { poli: BarisPoli[]; hp: boolean; ket: string; daftar: Kunci[] }) {
  const [semua, setSemua] = useState(false);
  const [tabel, setTabel] = useState(false);
  const atas = poliTeratas(poli, hp && semua ? 1000 : 10);
  const maks = Math.max(1, ...atas.map(totalOf));
  const kotak = treemap(atas.map(p => ({ id: p.nama, nilai: totalOf(p) })), 100, 100);
  const peta = new Map(atas.map(p => [p.nama, p]));
  const teks = (p: BarisPoli) => `${p.nama} · ${rincianStatus(p, daftar)} · Total ${angka(totalOf(p))}`;
  return <MainCard content={false} className="sk-panel berry-dashboard-card" aria-labelledby="sk-poli">
    <div className="sk-panel-kepala"><div>
      <h2 id="sk-poli">Poli tujuan SEP</h2>
      <p className="sk-ket">{ket}</p>
    </div><button type="button" className="sk-tautan sk-jpeg-abaikan" aria-expanded={tabel} onClick={() => setTabel(v => !v)}>{tabel ? 'Lihat sebagai grafik' : 'Lihat sebagai tabel'}</button></div>
    {atas.length === 0 ? <p className="sk-kosong">—</p> : tabel
      ? <TabelStatus judul="Jumlah SEP kontrol per poli tujuan" kolom="Poli" daftar={daftar} baris={poliTeratas(poli, 1000).map(p => ({ label: p.nama, j: p }))} />
      : <>
        <Legenda daftar={daftar} />
        {hp ? <>
          <ul className="sk-bar-daftar">{atas.map(p => <li key={p.nama} className="sk-bar" title={teks(p)}>
            <span className="sk-bar-nama">{p.nama}</span><Batang j={p} maks={maks} daftar={daftar} /><span className="sk-bar-total">{angka(totalOf(p))}</span>
            <span className="sr-only">{rincianStatus(p, daftar)}</span></li>)}</ul>
          {poli.length > 10 && <button type="button" className="sk-tautan sk-jpeg-abaikan" onClick={() => setSemua(v => !v)}>
            {semua ? 'Tampilkan 10 teratas' : `Tampilkan semua (${poli.length})`}</button>}
        </> : <TreemapPoli kotak={kotak} peta={peta} teks={teks} daftar={daftar} />}
      </>}
  </MainCard>;
}

function TreemapPoli({ kotak, peta, teks, daftar }: { kotak: ReturnType<typeof treemap>; peta: Map<string, BarisPoli>; teks: (p: BarisPoli) => string; daftar: Kunci[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ukuran, setUkuran] = useState({ w: 600, h: 300 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setUkuran({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} className="sk-treemap" role="list" aria-label="Treemap poli tujuan SEP">
    {kotak.map(c => {
      const p = peta.get(c.id)!;
      const label = (c.w / 100) * ukuran.w >= 72 && (c.h / 100) * ukuran.h >= 36;
      return <div key={c.id} role="listitem" tabIndex={0} className="sk-tm" title={teks(p)} aria-label={teks(p)}
        style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%` }}>
        <div className="sk-tm-isi">{daftar.filter(k => p[k] > 0).map(k => <span key={k} className={`sk-isi-${k}`} style={{ flexGrow: p[k], flexBasis: 0 }} />)}
          {label && <span className="sk-tm-label" aria-hidden="true"><b>{p.nama}</b>{angka(totalOf(p))}</span>}</div>
      </div>;
    })}
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
  const kanvas = useRef<HTMLDivElement>(null);
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
  const ringkas = d ? ringkasStatus(d, kodeRs) : null;
  const daftar = statusJenis(jenis);
  const ketCabang = terkunci ? 'Total cabang (semua faskes)' : labelTotalCabang(!!kodeRs, status !== 'semua');

  const gantiJenis = (j: PilihanJenis) => {
    setJenis(j);
    if (j === 'RJ' && status === 'gt') {
      setStatus('semua');
      setPesanFilter('Filter Status dikembalikan ke Semua status karena rawat jalan tidak punya Surkon > SEP.');
    } else setPesanFilter('');
  };

  const unduhJpeg = async () => {
    const node = kanvas.current;
    if (!node) return;
    setJpeg('menyiapkan');
    try {
      const latar = getComputedStyle(document.body).backgroundColor || '#ffffff';
      const url = await toJpeg(node, { quality: 0.95, backgroundColor: latar, pixelRatio: 2, skipFonts: true,
        filter: n => !(n instanceof HTMLElement && n.classList.contains('sk-jpeg-abaikan')) });
      const a = document.createElement('a');
      a.download = `${namaBerkasJpeg(bulanAktif, jenis, namaRs)}.jpg`;
      a.href = url;
      a.click();
      setJpeg('diam');
    } catch (error) {
      console.error('Gagal membuat JPEG Surat Kontrol', error);
      setJpeg('gagal');
    }
  };

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
  const ringkasFilter = [labelBulan(bulanAktif), JENIS[jenis], namaRs || 'Semua faskes', status === 'semua' ? 'Semua status' : STATUS[status].label].join(' · ');

  return <div className="sapa-page sk-page berry-dashboard" ref={kanvas}>
    <header className="sk-judul">
      <div>
        <p className="sapa-eyebrow">Ruang kerja / Pemantauan / Monitoring Surat Kontrol</p>
        <Typography component="h1" variant="h3" className="sapa-title">Monitoring Surat Kontrol</Typography>
        <p className="sapa-description">Membandingkan tanggal terbit surat kontrol dengan tanggal SEP kontrol di FKRTL. Berbeda dengan tab
          07 Surkon di Kepatuhan FKRTL, yang menilai kepatuhan penerbitan lewat bridging.</p>
        {dataBulan && <p className="sk-data-per">Data SEP sampai <strong>{tanggalSampai(dataBulan.sampai)}</strong> · sumber BI BPJS Kesehatan</p>}
      </div>
      <span className="sk-jpeg-abaikan">
        <button type="button" className="sapa-button sapa-button-secondary" onClick={unduhJpeg} disabled={!d || jpeg === 'menyiapkan'} aria-busy={jpeg === 'menyiapkan'}>
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
        {terkunci && <p className="sk-filter-ket">Akun rumah sakit hanya melihat RS sendiri.</p>}
        <p className="sk-filter-ket" role="status">{pesanFilter || (d ? `Menampilkan ${ringkasFilter}` : '')}</p>
      </div>
    </MainCard>

    {query.isPending ? <KerangkaMemuat label="Memuat monitoring surat kontrol" /> : query.isError ? (
      statusHttp(query.error) === 403 && user?.role === 'Petugas RS'
        ? <div className="sk-info" role="alert">Akun rumah sakit Anda belum terhubung ke data faskes. Hubungi administrator SAPA.</div>
        : <MainCard content={false} className="sk-panel berry-dashboard-card" role="alert">
          <p className="sk-kosong">Data Monitoring Surat Kontrol belum bisa dimuat.</p>
          <button type="button" className="sapa-button sk-jpeg-abaikan" onClick={() => void query.refetch()} disabled={query.isFetching}>Coba lagi</button>
        </MainCard>
    ) : !d || !ringkas ? (
      <div className="sk-info" role="status">
        <span>Belum ada data Monitoring Surat Kontrol.{' '}
          {admin ? <>Unggah data bulanan di menu <a href="/integration">Integrasi data</a>.</> : 'Data akan tampil setelah admin mengunggahnya.'}</span>
      </div>
    ) : <div className="sk-grid" aria-busy={query.isFetching}>
      <KartuStatus d={d} kodeRs={kodeRs} namaRs={namaRs} status={status} jenis={jenis} bulan={bulanAktif} />
      <Tren tren={d.tren} daftar={daftar} bulan={bulanAktif} ket={ketCabang} />
      <Faskes d={d} status={status} kodeRs={kodeRs} hp={hp} petugas={terkunci} daftar={daftar} />
      <Poli poli={d.poli} hp={hp} ket={ketCabang} daftar={daftar} />
      <MainCard content={false} className="sk-panel sk-penuh berry-dashboard-card" aria-labelledby="sk-gt">
        <div className="sk-panel-kepala"><h2 id="sk-gt"><span className="sk-aksen">Surkon &gt; SEP</span> pada <span className="sk-aksen">{labelBulan(bulanAktif)}</span></h2></div>
        {jenis === 'RJ' ? <p className="sk-kosong">Tidak ada status Surkon &gt; SEP untuk rawat jalan.</p>
          : ringkas.jumlah.gt === 0 ? <p className="sk-kosong">Tidak ada SEP dengan kondisi Surkon &gt; SEP pada {labelBulan(bulanAktif)}.</p>
          : <><p className="sk-besar">{angka(ringkas.jumlah.gt)} SEP <span className="sk-ubin-persen">({persen(ringkas.persen.gt)})</span></p>
            <p className="sk-catatan">surat kontrol terbit setelah tanggal SEP{namaRs ? ` · ${namaRs}` : ''}</p></>}
      </MainCard>
    </div>}
  </div>;
}
