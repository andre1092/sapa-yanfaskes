import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import MainCard from '../berry/MainCard';
import { apiClient } from '../lib/apiClient';
import { AnimatedButton } from './ui/AnimatedButton';
import { KerangkaMemuat } from './ui/KerangkaMemuat';
import '../berry/berry-dashboards.css';

interface Entri { id: number; at: string; actor: string; role: string; action: string; target: string; status: number; ip: string }
interface Jawaban { entries: Entri[]; next_before_id: number | null }

const waktu = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });

// Riwayat aktivitas dari server; hanya Super Admin yang dapat membukanya (diperiksa juga di server).
export function AuditLogView() {
  const [aksi, setAksi] = useState('');
  const [pelaku, setPelaku] = useState('');
  const [saring, setSaring] = useState({ action: '', actor: '' });
  const query = useQuery({
    queryKey: ['audit-log', saring],
    queryFn: async ({ signal }) => (await apiClient.get<Jawaban>('/api/v1/audit-log', { params: { limit: 200, ...saring }, signal })).data,
  });

  return (
    <section className="sapa-page p-4 sm:p-6" aria-busy={query.isPending}>
      <MainCard content={false} className="berry-dashboard-card p-4 sm:p-6">
        <Typography variant="h2" component="h1" sx={{ mb: 1 }}>Log aktivitas</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Akses yang ditolak dan tindakan admin (sinkronisasi, muat ulang, ekspor, email verifikasi). Login berhasil dan gagal tercatat di log Auth0.
        </Typography>
        <form className="flex flex-wrap items-end gap-3 mb-4" onSubmit={(event) => { event.preventDefault(); setSaring({ action: aksi.trim(), actor: pelaku.trim() }); }}>
          <TextField size="small" label="Tindakan" value={aksi} onChange={(e) => setAksi(e.target.value)} placeholder="mis. sync" />
          <TextField size="small" label="Pelaku (ID Auth0)" value={pelaku} onChange={(e) => setPelaku(e.target.value)} />
          <AnimatedButton type="submit" className="sapa-button sapa-button-primary">Terapkan</AnimatedButton>
        </form>
        {query.isPending ? <KerangkaMemuat label="Memuat log aktivitas" /> : query.isError ? (
          <Typography role="alert" color="error">Log aktivitas sedang tidak dapat dimuat.</Typography>
        ) : query.data.entries.length === 0 ? (
          <Typography color="text.secondary">Belum ada aktivitas yang tercatat.</Typography>
        ) : (
          <div className="overflow-x-auto">
            <Table size="small" aria-label="Log aktivitas">
              <TableHead><TableRow>
                <TableCell>Waktu</TableCell><TableCell>Pelaku</TableCell><TableCell>Peran</TableCell>
                <TableCell>Tindakan</TableCell><TableCell>Status</TableCell><TableCell>IP</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {query.data.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{waktu(e.at)}</TableCell><TableCell>{e.actor || 'tanpa login'}</TableCell>
                    <TableCell>{e.role || '-'}</TableCell><TableCell>{e.action}</TableCell>
                    <TableCell>{e.status}</TableCell><TableCell>{e.ip || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </MainCard>
    </section>
  );
}
