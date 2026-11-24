import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { batasJenisDetail } from '../lib/detailSrk';
import { labelBulan } from '../lib/suratKontrol';
import type { PilihanJenis, PilihanStatus } from '../lib/suratKontrol';

// Tombol "Download Detail" (USUL-unduh-detail.md Kim): sebelum Unduh JPEG, keterangan 12 px selalu terlihat.
type Props = { bulan: string; jenis: PilihanJenis; status: PilihanStatus; kodeRs: string; terkunci: boolean };

export function TombolDownloadDetail({ bulan, jenis, status, kodeRs, terkunci }: Props) {
  const id = useId();
  const [keadaan, setKeadaan] = useState<'diam' | 'mengunduh' | 'gagal'>('diam');
  const [galat, setGalat] = useState('');
  const q = useQuery<{ bulan: string[] }, Error>({
    queryKey: ['surat-kontrol-detail-bulan'],
    queryFn: async ({ signal }) => (await apiClient.get('/api/v1/surat-kontrol-detail/bulan', { signal, timeout: 30000 })).data,
    retry: (n, e) => (e as { response?: { status?: number } })?.response?.status !== 403 && n < 1,
    staleTime: 60 * 1000,
  });
  const ada = !!bulan && !!q.data?.bulan.includes(bulan);
  const batas = batasJenisDetail(jenis);
  const ket = status === 'lt' ? 'Detail hanya tersedia untuk SRK tidak sesuai. Ubah filter Status.'
    : batas.nonaktif ? batas.catatan
    : q.isError ? 'Detail belum bisa dimuat.'
    : !ada ? `Detail SEP ${labelBulan(bulan)} belum tersedia. Admin perlu mengunggahnya di menu Integrasi data.`
    : keadaan === 'gagal' ? galat
    : `${batas.catatan ? `${batas.catatan} ` : ''}Berkas RAHASIA: data pelayanan peserta, tanpa nomor SEP.`;
  const nonaktif = status === 'lt' || batas.nonaktif || !ada || keadaan === 'mengunduh';

  const unduh = async () => {
    setKeadaan('mengunduh');
    try {
      const res = await apiClient.get('/api/v1/surat-kontrol-detail/detail', {
        params: { bulan, jenis, status, ...(kodeRs && !terkunci ? { faskes: kodeRs } : {}) }, responseType: 'blob', timeout: 120000,
      });
      const nama = /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] || ''))?.[1] || 'Detail_Surat_Kontrol.xlsx';
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = nama; a.click();
      URL.revokeObjectURL(url);
      setKeadaan('diam');
    } catch (e) {
      const data = (e as { response?: { data?: Blob } })?.response?.data;
      let pesan = 'Detail belum bisa diunduh. Coba lagi.';
      try { if (data instanceof Blob) pesan = JSON.parse(await data.text()).detail || pesan; } catch { /* bukan JSON */ }
      setGalat(pesan); setKeadaan('gagal');
    }
  };

  return <span className="sk-jpeg-abaikan inline-flex flex-col">
    <button type="button" className="sapa-button sapa-button-secondary" disabled={nonaktif} aria-busy={keadaan === 'mengunduh'} aria-describedby={id} onClick={() => void unduh()}>
      {keadaan === 'mengunduh' ? 'Menyiapkan…' : 'Download Detail'}</button>
    <span id={id} className="sk-catatan" style={{ fontSize: 12, maxWidth: 260 }} role={keadaan === 'gagal' ? 'alert' : undefined}>{ket}</span>
  </span>;
}
