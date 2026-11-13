import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export interface LarasFilters { bulan: string; faskes: string; poli: string; jenis_kunjungan: string }
export interface LarasPoint { label: string; avg_seconds: number; sample_count: number }
export interface LarasChart { points: LarasPoint[]; message?: string }
export interface LarasData {
  status: 'success' | 'no_data';
  filter_options: { bulan: Array<{ value: string; label: string }>; faskes: Array<{ value: string; label: string }>; poli: string[]; jenis_kunjungan: string[] };
  active_filters: LarasFilters;
  kpi: { avg_seconds: number | null; sample_count: number; basis: string };
  /** Angka tiap RS per poli untuk unduhan Excel (API lama tidak mengirimnya). */
  rincian_poli?: Array<{ faskes: string; kabupaten: string; poli: string; avg_seconds: number }>;
  charts: Record<'per_bulan' | 'per_kabupaten' | 'per_hari' | 'per_faskes' | 'per_poli', LarasChart>;
  metadata: { selected_period?: string | null; bobot_kunjungan?: boolean; source_url: string; last_updated: string | null; methodology: string; source_scope: string; limitations: string[] };
}
export const EMPTY_LARAS_FILTERS: LarasFilters = { bulan: '', faskes: '', poli: '', jenis_kunjungan: '' };
export function useLarasData(filters: LarasFilters) {
  return useQuery<LarasData, Error>({
    queryKey: ['monitoring-laras', filters],
    queryFn: async ({ signal }) => {
      const response = await apiClient.get<LarasData>('/api/v1/monitoring-laras', { params: filters, signal, timeout: 30000 });
      if (!response.data || !['success', 'no_data'].includes(response.data.status) || !response.data.filter_options || !response.data.charts || !response.data.metadata || !response.data.kpi) throw new Error('Format data LARAS tidak sesuai.');
      return response.data;
    },
    staleTime: 3 * 60 * 1000,
    retry: 1,
  });
}
