import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export interface DashboardStats {
  status: string;
  total_records: number;
  overall_avg_capaian: number;
  avg_per_sumber: Array<{ Sumber: string; AvgCapaian: number }>;
  trend_per_bulan: Array<{ BulanTahun: string; Sumber: string; AvgCapaian: number }>;
  top_faskes: Array<{ Faskes: string; AvgCapaian: number }>;
}

export const useDashboardData = () => {
  return useQuery<DashboardStats, Error>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await apiClient.get<DashboardStats>('/api/v1/dashboard-stats');
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes fresh
    gcTime: 15 * 60 * 1000,   // 15 minutes in memory
  });
};
