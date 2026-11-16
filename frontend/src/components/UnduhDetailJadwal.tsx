import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { bolehMelakukan } from '../lib/izinPeran';
import { keadaanUnduh, labelBulan, namaDariHeader, parameterBulan } from '../lib/ssbiJadwal';
import type { InfoBulan } from '../lib/ssbiJadwal';
import { useAuthStore } from '../store/authStore';

/**
 * Tombol "Download Detail" (data SSBI per dokter) di tab 01 Jadwal Praktek Nakes.
 * Hanya tampil untuk peran yang boleh mengunduh; server membatasi Petugas RS ke RS-nya sendiri.
 */
export function UnduhDetailJadwal({ bulan }: { bulan: string }) {
  const boleh = bolehMelakukan(useAuthStore((s) => s.user?.role), 'ekspor');
  const idKeterangan = useId();
  const [keadaan, setKeadaan] = useState<'diam' | 'menyiapkan' | 'gagal' | 'diganti' | 'terlalu-besar'>('diam');
  const info = useQuery<InfoBulan, Error>({
    queryKey: ['ssbi-jadwal-bulan'],
    queryFn: async ({ signal }) => (await apiClient.get<InfoBulan>('/api/v1/ssbi-jadwal/bulan', { signal, timeout: 30000 })).data,
    enabled: boleh,
    staleTime: 60 * 1000,
    retry: 1,
  });
  if (!boleh) return null;

  const kode = parameterBulan(bulan);
  const labelUnduh = kode === 'semua' ? 'semua bulan' : kode ? labelBulan(kode) : '';
  const status = info.isError
    ? { aktif: false, teks: 'Ketersediaan detail belum bisa dicek. Muat ulang halaman.' }
    : keadaanUnduh(bulan, info.data);
  const menyiapkan = keadaan === 'menyiapkan';

  const unduh = async () => {
    if (!kode) return;
    setKeadaan('menyiapkan');
    try {
      const res = await apiClient.get<Blob>('/api/v1/ssbi-jadwal/detail', { params: { bulan: kode }, responseType: 'blob', timeout: 60000 });
      const nama = namaDariHeader(res.headers['content-disposition'], `Detail_Jadwal_Dokter_FKRTL_${kode === 'semua' ? 'Semua_Bulan' : labelBulan(kode).replace(' ', '_')}.xlsx`);
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = nama;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setKeadaan('diam');
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      console.error('Gagal mengunduh detail jadwal dokter', status);
      setKeadaan(status === 409 ? 'diganti' : status === 413 ? 'terlalu-besar' : 'gagal');
    }
  };

  return (
    <span className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
      <span id={idKeterangan} className="text-xs text-[var(--text-muted)]">
        {menyiapkan && kode ? `Menyiapkan detail ${labelUnduh}…` : status.teks}
      </span>
      <button
        type="button"
        className="sapa-button sapa-button-secondary w-full sm:w-auto"
        onClick={unduh}
        disabled={!status.aktif || menyiapkan}
        aria-busy={menyiapkan}
        aria-describedby={idKeterangan}
      >
        {menyiapkan ? 'Menyiapkan berkas…' : 'Download Detail'}
      </button>
      {keadaan === 'gagal' && (
        <span role="alert" className="text-xs text-[var(--danger)]">Berkas gagal disiapkan. Coba lagi.</span>
      )}
      {keadaan === 'terlalu-besar' && (
        <span role="alert" className="text-xs text-[var(--danger)]">Data semua bulan terlalu besar untuk satu berkas. Pilih satu bulan lalu unduh per bulan.</span>
      )}
      {keadaan === 'diganti' && (
        <span role="alert" className="text-xs text-[var(--danger)]">Data SSBI sedang diperbarui admin. Coba beberapa menit lagi.</span>
      )}
    </span>
  );
}
