import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export interface FkrtlFilterParams {
  tahun?: string;
  bulan?: string;
  kabupaten?: string;
  nama_rs?: string;
  kelas_rs?: string;
  sumber?: string;
}

export interface FkrtlAntrolStats {
  status: 'success' | 'no_data' | 'empty' | string;
  message?: string;
  last_update?: string;
  selected_period?: string;
  kpi_capaian: number;
  total_records?: number;
  trend_per_bulan: Array<{ month: string; avg_capaian: number }>;
  top_faskes: Array<{ faskes: string; avg_capaian: number }>;
  top_poli: Array<{ poli: string; avg_capaian: number }>;
  filter_options: {
    tahun: string[];
    bulan: string[];
    kabupaten: string[];
    nama_rs: string[];
    kelas_rs: string[];
    sumber: string[];
  };
}

export interface DashboardStats {
  status: string;
  total_records: number;
  overall_avg_capaian: number;
  avg_per_sumber: Array<{ Sumber: string; AvgCapaian: number }>;
  trend_per_bulan: Array<{ BulanTahun: string; Sumber: string; AvgCapaian: number }>;
  top_faskes: Array<{ Faskes: string; AvgCapaian: number }>;
}

export const useFkrtlAntrolData = (filters: FkrtlFilterParams = {}, enabled: boolean = true) => {
  return useQuery<FkrtlAntrolStats, Error>({
    queryKey: ['fkrtl-antrol-stats', filters],
    queryFn: async () => {
      const response = await apiClient.get<FkrtlAntrolStats>('/api/v1/fkrtl-antrol-stats', {
        params: {
          tahun: filters.tahun,
          bulan: filters.bulan,
          kabupaten: filters.kabupaten,
          nama_rs: filters.nama_rs,
          kelas_rs: filters.kelas_rs,
          sumber: filters.sumber,
        },
      });
      return response.data;
    },
    enabled: enabled,
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useDashboardData = (enabled: boolean = true) => {
  return useQuery<DashboardStats, Error>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await apiClient.get<DashboardStats>('/api/v1/dashboard-stats');
      return response.data;
    },
    enabled: enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};
