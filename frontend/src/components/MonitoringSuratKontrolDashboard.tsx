import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Typography, useMediaQuery } from '@mui/material';
import { toJpeg } from 'html-to-image';
import MainCard from '../berry/MainCard';
import { apiClient } from '../lib/apiClient';
import { KerangkaMemuat } from './ui/KerangkaMemuat';
import { FilterSelect, FilterOption } from './ui/FilterSelect';
import {
  JENIS, KUNCI, STATUS, angka, gabungJenis, labelBulan, namaBerkasJpeg, persen, poliTeratas, ringkasStatus,
  saringStatus, statusTampil, tanggalSampai, totalOf, treemap,
} from '../lib/suratKontrol';
import type { BarisFaskes, DataBulan, DataJenis, Jumlah, Kunci, PilihanJenis, PilihanStatus } from '../lib/suratKontrol';
import '../berry/berry-dashboards.css';
import './suratKontrol.css';

type Respons = {
  bulan_tersedia: string[];
  bulan: string | null;
  data: DataBulan | null;
  rs: { kode: string; nama: string } | null;
  terkunci: boolean;
  diunggah_pada: string;
};

const pesanGalat = (error: unknown) => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : 'Sumber mungkin sedang tidak tersedia. Coba muat kembali.';
};

function Segmen({ j, maks }: { j: Jumlah; maks: number }) {
  return <>{KUNCI.filter(k => j[k] > 0).map(k => <span key={k} className={`sk-sw-${k}`} style={{ width: `${(j[k] / maks) * 100}%` }} />)}</>;
}

function Legenda({ status }: { status: Kunci[] }) {
  return <div className="sk-legenda" aria-hidden="true">{status.map(k => <span key={k}><i className={`sk-sw sk-sw-${k}`} />{STATUS[k].label}</span>)}</div>;
}

function KartuStatus({ d, kodeRs, namaRs, status, bulan }: { d: DataJenis; kodeRs: string; namaRs: string; status: PilihanStatus; bulan: string }) {
  const r = ringkasStatus(d, kodeRs);
  return <MainCard content={false} className="sk-panel berry-dashboard-card" aria-labelledby="sk-status">
    <h2 id="sk-status">Status{namaRs ? ` · ${namaRs}` : ''}</h2>
    {kodeRs && r.total === 0 ? <p className="sk-kosong">Belum ada SEP kontrol {namaRs} pada {labelBulan(bulan)}.</p> : null}
    <div className="sk-ubin-daftar">
      {(['lt', 'eq'] as Kunci[]).map(k => {
        const redup = status !== 'semua' && status !== k;
        return <div key={k} className="sk-ubin" data-redup={redup}>
          <div className="sk-ubin-nama"><i className={`sk-sw sk-sw-${k}`} aria-hidden="true" />{STATUS[k].label}</div>
          <div className={`sk-ubin-angka sk-teks-${k}`}>{angka(r.jumlah[k])}</div>
          <div className="sk-ubin-persen">{persen(r.persen[k])}{redup ? ' · Tidak termasuk filter' : ''}</div>
          <p className="sk-ubin-def">{STATUS[k].definisi}.</p>
        </div>;
      })}
    </div>
  </MainCard>;
}

function Tren({ d, status, bulan }: { d: DataJenis; status: PilihanStatus; bulan: string }) {
  const tren = d.tren.map(t => ({ hari: t.hari, ...saringStatus(t, status) }));
  const W = 600, H = 200, kiri = 4, bawah = 22;
  const hariMaks = Math.max(1, ...tren.map(t => t.hari));
  const maks = Math.max(1, ...tren.map(totalOf));
  const x = (h: number) => kiri + ((h - 1) / Math.max(1, hariMaks - 1)) * (W - kiri * 2);
  const y = (v: number) => H - bawah - (v / maks) * (H - bawah - 8);
  const lapisan = KUNCI.map((k, i) => {
    const bawahnya = (t: Jumlah) => KUNCI.slice(0, i).reduce((s, kk) => s + t[kk], 0);
    const atas = tren.map(t => `${x(t.hari)},${y(bawahnya(t) + t[k])}`);
    const dasar = [...tren].reverse().map(t => `${x(t.hari)},${y(bawahnya(t))}`);
    return { k, titik: [...atas, ...dasar].join(' '), ada: tren.some(t => t[k] > 0) };
  }).filter(l => l.ada);
  return <MainCard content={false} className="sk-panel sk-tren berry-dashboard-card" aria-labelledby="sk-tren">
    <h2 id="sk-tren">Tren tanggal terbit SEP kontrol (<span className="sk-merah">{labelBulan(bulan)}</span>)</h2>
    {tren.length === 0 ? <p className="sk-kosong">—</p> : <>
      <Legenda status={statusTampil(d.total)} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tren jumlah SEP kontrol per tanggal, ${labelBulan(bulan)}`}>
        {lapisan.map(l => <polygon key={l.k} points={l.titik} className={`sk-sw-${l.k}`} style={{ fill: `var(--sk-${l.k})`, opacity: 0.9 }} />)}
        {tren.map(t => <rect key={t.hari} x={x(t.hari) - (W / hariMaks) / 2} y={0} width={W / hariMaks} height={H - bawah} fill="transparent">
          <title>{`Tanggal ${t.hari} ${labelBulan(bulan)}\n${KUNCI.filter(k => t[k] > 0).map(k => `${STATUS[k].label}: ${angka(t[k])} SEP`).join('\n')}`}</title>
        </rect>)}
        {tren.filter(t => t.hari === 1 || t.hari % 5 === 0).map(t => <text key={t.hari} x={x(t.hari)} y={H - 6} textAnchor="middle" className="sk-sumbu">{t.hari}</text>)}
      </svg>
      <table className="sr-only"><caption>Jumlah SEP kontrol per tanggal</caption><thead><tr><th>Tanggal</th>{KUNCI.map(k => <th key={k}>{STATUS[k].label}</th>)}</tr></thead>
        <tbody>{tren.map(t => <tr key={t.hari}><td>{t.hari}</td>{KUNCI.map(k => <td key={k}>{angka(t[k])}</td>)}</tr>)}</tbody></table>
    </>}
  </MainCard>;
}

function Faskes({ d, status, kodeRs, hp }: { d: DataJenis; status: PilihanStatus; kodeRs: string; hp: boolean }) {
  const [semua, setSemua] = useState(false);
  const baris = d.faskes.map(f => ({ ...f, ...saringStatus(f, status) })).filter(f => totalOf(f) > 0)
    .sort((a, b) => totalOf(b) - totalOf(a));
  const maks = Math.max(1, ...baris.map(totalOf));
  const tampil = hp && !semua ? baris.slice(0, 8) : baris;
  return <MainCard content={false} className="sk-panel berry-dashboard-card" aria-labelledby="sk-faskes">
    <h2 id="sk-faskes">Fasilitas kesehatan</h2>
    {baris.length === 0 ? <p className="sk-kosong">Tidak ada SEP kontrol untuk pilihan ini.</p> : <>
      <Legenda status={statusTampil(d.total)} />
      <ul className={`sk-bar-daftar ${hp ? '' : 'sk-gulir'}`}>
        {tampil.map((f: BarisFaskes) => <li key={f.kode} className="sk-bar" data-pilih={f.kode === kodeRs}
          title={`${f.kode} - ${f.nama}\n${KUNCI.filter(k => f[k] > 0).map(k => `${STATUS[k].label}: ${angka(f[k])} SEP`).join('\n')}`}>
          <span className="sk-bar-label">{f.nama}</span>
          <span className="sk-bar-baris"><span className="sk-bar-jalur" aria-hidden="true"><Segmen j={f} maks={maks} /></span>
            <span className="sk-bar-angka">{angka(totalOf(f))}</span></span>
          <span className="sr-only">{KUNCI.filter(k => f[k] > 0).map(k => `${STATUS[k].label} ${angka(f[k])}`).join(', ')}</span>
        </li>)}
      </ul>
      {hp && baris.length > 8 && <button type="button" className="sk-lebih sk-jpeg-abaikan" onClick={() => setSemua(v => !v)}>
        {semua ? 'Tampilkan 8 teratas' : `Tampilkan semua (${baris.length})`}</button>}
    </>}
  </MainCard>;
}

function Poli({ d, status, hp }: { d: DataJenis; status: PilihanStatus; hp: boolean }) {
  const [semua, setSemua] = useState(false);
  const atas = poliTeratas(d.poli, status, hp && semua ? 1000 : 10);
  const maks = Math.max(1, ...atas.map(totalOf));
  const sel = treemap(atas.flatMap(p => KUNCI.filter(k => p[k] > 0).map(k => ({ id: `${p.nama}|${k}`, nilai: p[k] }))), 100, 100);
  return <MainCard content={false} className="sk-panel berry-dashboard-card" aria-labelledby="sk-poli">
    <h2 id="sk-poli">Poli tujuan SEP</h2>
    {atas.length === 0 ? <p className="sk-kosong">Tidak ada SEP kontrol untuk pilihan ini.</p> : <>
      <Legenda status={statusTampil(d.total)} />
      {hp ? <ul className="sk-bar-daftar">
        {atas.map(p => <li key={p.nama} className="sk-bar"><span className="sk-bar-label">{p.nama}</span>
          <span className="sk-bar-baris"><span className="sk-bar-jalur" aria-hidden="true"><Segmen j={p} maks={maks} /></span><span className="sk-bar-angka">{angka(totalOf(p))}</span></span></li>)}
      </ul> : <div className="sk-treemap" aria-hidden="true">
        {sel.map(c => {
          const [nama, k] = c.id.split('|') as [string, Kunci];
          const besar = c.w > 9 && c.h > 7;
          return <div key={c.id} title={`${nama}\n${STATUS[k].label}: ${angka(c.nilai)} SEP`}
            style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%`, background: `var(--sk-${k})` }}>
            {besar && <><strong>{nama}</strong>{angka(c.nilai)}</>}</div>;
        })}
      </div>}
      <table className="sr-only"><caption>Jumlah SEP kontrol per poli tujuan</caption><thead><tr><th>Poli</th>{KUNCI.map(k => <th key={k}>{STATUS[k].label}</th>)}</tr></thead>
        <tbody>{atas.map(p => <tr key={p.nama}><td>{p.nama}</td>{KUNCI.map(k => <td key={k}>{angka(p[k])}</td>)}</tr>)}</tbody></table>
      {hp && d.poli.length > 10 && <button type="button" className="sk-lebih sk-jpeg-abaikan" onClick={() => setSemua(v => !v)}>
        {semua ? 'Tampilkan 10 teratas' : `Tampilkan semua (${d.poli.length})`}</button>}
    </>}
  </MainCard>;
}

function PanelSemuaRs({ judul, id, pesan }: { judul: string; id: string; pesan: string }) {
  return <MainCard content={false} className="sk-panel berry-dashboard-card" aria-labelledby={id}>
    <h2 id={id}>{judul}</h2><p className="sk-kosong">{pesan}</p>
  </MainCard>;
}

export function MonitoringSuratKontrolDashboard() {
  const [bulan, setBulan] = useState('');
  const [rs, setRs] = useState('');
  const [status, setStatus] = useState<PilihanStatus>('semua');
  const [jenis, setJenis] = useState<PilihanJenis>('RJ');
  const [jpeg, setJpeg] = useState<'diam' | 'menyiapkan' | 'gagal'>('diam');
  const kanvas = useRef<HTMLDivElement>(null);
  const hp = useMediaQuery('(max-width: 639px)');
  const query = useQuery<Respons, Error>({
    queryKey: ['surat-kontrol', bulan],
    queryFn: async ({ signal }) => (await apiClient.get('/api/v1/surat-kontrol/data', { params: bulan ? { bulan } : {}, signal, timeout: 30000 })).data,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const r = query.data;
  const bulanAktif = r?.bulan || '';
  const d = r?.data ? gabungJenis(r.data, jenis) : null;
  const terkunci = !!r?.terkunci;
  const kodeRs = terkunci ? r?.rs?.kode || '' : rs;
  const dataBulan = r?.data;
  const daftarRs = useMemo(() => (dataBulan ? gabungJenis(dataBulan, 'semua').faskes.map(f => ({ kode: f.kode, nama: f.nama })).sort((a, b) => a.nama.localeCompare(b.nama, 'id')) : []), [dataBulan]);
  const namaRs = terkunci ? r?.rs?.nama || '' : daftarRs.find(f => f.kode === rs)?.nama || '';
  const ringkas = d ? ringkasStatus(d, kodeRs) : null;

  const unduhJpeg = async () => {
    const node = kanvas.current;
    if (!node) return;
    setJpeg('menyiapkan');
    try {
      const latar = getComputedStyle(document.body).backgroundColor || '#ffffff';
      const url = await toJpeg(node, { quality: 0.95, backgroundColor: latar, pixelRatio: 2, skipFonts: true,
        filter: n => !(n instanceof HTMLElement && n.classList.contains('sk-jpeg-abaikan')) });
      const a = document.createElement('a');
      a.download = `${namaBerkasJpeg(bulanAktif, jenis, namaRs)}.jpeg`;
      a.href = url;
      a.click();
      setJpeg('diam');
    } catch (error) {
      console.error('Gagal membuat JPEG Surat Kontrol', error);
      setJpeg('gagal');
    }
  };

  const filter = [
    { id: 'bulan', label: 'Bulan SEP', value: bulanAktif, onChange: (v: string) => setBulan(v), opsi: (r?.bulan_tersedia || []).slice().reverse().map(b => ({ value: b, label: labelBulan(b) })), disabled: !r?.bulan_tersedia.length },
    { id: 'rs', label: 'Fasilitas kesehatan', value: terkunci ? kodeRs : rs, onChange: setRs, disabled: terkunci,
      opsi: terkunci ? [{ value: kodeRs, label: namaRs }] : [{ value: '', label: 'Semua RS' }, ...daftarRs.map(f => ({ value: f.kode, label: f.nama }))] },
    { id: 'status', label: 'Status', value: status, onChange: (v: string) => setStatus(v as PilihanStatus),
      opsi: [{ value: 'semua', label: 'Semua status' }, ...KUNCI.map(k => ({ value: k, label: STATUS[k].label }))] },
    { id: 'jenis', label: 'Jenis pelayanan', value: jenis, onChange: (v: string) => setJenis(v as PilihanJenis),
      opsi: (['RJ', 'RI', 'semua'] as PilihanJenis[]).map(j => ({ value: j, label: JENIS[j] })) },
  ];
  const ketSemuaRs = (apa: string) => (terkunci ? `Data ${apa} per RS belum tersedia.` : kodeRs ? `Panel ini menampilkan semua RS. Data ${apa} per RS belum tersedia.` : '');

  return <div className="sapa-page sk-page berry-dashboard" ref={kanvas}>
    <header className="sk-heading">
      <div>
        <p className="sapa-eyebrow">Pemantauan rujukan</p>
        <Typography component="h1" variant="h3" className="sapa-title">Monitoring Surat Kontrol</Typography>
        <p className="sapa-description">Membandingkan tanggal terbit surat kontrol dengan tanggal SEP kontrol di FKRTL. Berbeda dengan tab
          07 Surkon di Kepatuhan FKRTL, yang menilai kepatuhan penerbitan lewat bridging.</p>
        {r?.data && <p className="sk-data-per">Data SEP sampai {tanggalSampai(r.data.sampai)} · sumber BI BPJS Kesehatan</p>}
      </div>
      <span className="sk-jpeg-abaikan">
        <button type="button" className="sapa-button sapa-button-secondary" onClick={unduhJpeg} disabled={!d || jpeg === 'menyiapkan'} aria-busy={jpeg === 'menyiapkan'}>
          {jpeg === 'menyiapkan' ? 'Menyiapkan JPEG…' : 'Unduh JPEG'}</button>
        {jpeg === 'gagal' && <span role="alert" className="sk-catatan block">JPEG belum bisa dibuat. Coba lagi.</span>}
      </span>
    </header>

    <MainCard content={false} className="laras-filters berry-dashboard-card sk-panel" aria-label="Filter monitoring surat kontrol">
      <div className="laras-filter-grid">{filter.map(f => <div className="laras-filter" key={f.id}>
        <label htmlFor={`sk-${f.id}`}>{f.label}</label>
        <FilterSelect id={`sk-${f.id}`} aria-label={f.label} value={f.value} className="w-full" disabled={f.disabled || query.isPending} onChange={e => f.onChange(e.target.value)}>
          {f.opsi.map(o => <FilterOption key={o.value} value={o.value}>{o.label}</FilterOption>)}
        </FilterSelect>
        {f.id === 'rs' && terkunci && <small className="laras-filter-hint">Dikunci ke rumah sakit akun Anda.</small>}
      </div>)}</div>
    </MainCard>

    {query.isPending ? <KerangkaMemuat label="Memuat monitoring surat kontrol" /> : query.isError ? (
      <MainCard content={false} className="sk-panel berry-dashboard-card" role="alert">
        <Typography component="h2" variant="h4">Data surat kontrol belum dapat dimuat</Typography>
        <p className="sk-catatan">{pesanGalat(query.error)}</p>
        <button type="button" className="sapa-button sk-jpeg-abaikan" onClick={() => void query.refetch()} disabled={query.isFetching}>Coba lagi</button>
      </MainCard>
    ) : !d || !ringkas ? (
      <MainCard content={false} className="sk-panel berry-dashboard-card" role="status">
        <p className="sk-kosong">Belum ada data SEP kontrol. Admin perlu mengunggah Crosstab BI di menu Integrasi data.</p>
      </MainCard>
    ) : <div className="sk-grid" aria-busy={query.isFetching}>
      <KartuStatus d={d} kodeRs={kodeRs} namaRs={namaRs} status={status} bulan={bulanAktif} />
      {d.tren.length ? <div><Tren d={d} status={status} bulan={bulanAktif} />{ketSemuaRs('tren') && <p className="sk-catatan">{ketSemuaRs('tren')}</p>}</div>
        : <PanelSemuaRs judul="Tren tanggal terbit SEP kontrol" id="sk-tren" pesan={ketSemuaRs('tren') || '—'} />}
      <Faskes d={d} status={status} kodeRs={kodeRs} hp={hp} />
      {d.poli.length ? <div><Poli d={d} status={status} hp={hp} />{ketSemuaRs('poli') && <p className="sk-catatan">{ketSemuaRs('poli')}</p>}</div>
        : <PanelSemuaRs judul="Poli tujuan SEP" id="sk-poli" pesan={ketSemuaRs('poli') || '—'} />}
      <MainCard content={false} className="sk-panel sk-penuh berry-dashboard-card" aria-labelledby="sk-gt">
        <h2 id="sk-gt">SEP dengan kondisi <span className="sk-merah">Surkon &gt; SEP</span> pada periode <span className="sk-merah">{labelBulan(bulanAktif)}</span></h2>
        {ringkas.jumlah.gt === 0 ? <p className="sk-kosong">Tidak ada SEP dengan kondisi Surkon &gt; SEP pada {labelBulan(bulanAktif)}.</p> : <>
          <p className="sk-besar">{angka(ringkas.jumlah.gt)} SEP <span className="sk-ubin-persen">({persen(ringkas.persen.gt)})</span></p>
          <p className="sk-catatan">Surat kontrol terbit setelah tanggal SEP{namaRs ? ` di ${namaRs}` : ''}. Rincian nomor SEP tidak ditampilkan.</p>
        </>}
      </MainCard>
    </div>}
  </div>;
}
