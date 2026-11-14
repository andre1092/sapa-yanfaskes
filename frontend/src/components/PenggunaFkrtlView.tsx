import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Autocomplete, Box, Button, Chip, Snackbar, Dialog, DialogActions, DialogContent, DialogTitle, Drawer, IconButton, Menu, MenuItem,
  Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { IconCopy, IconDotsVertical, IconPlus, IconX } from '@tabler/icons-react';
import { apiClient } from '../lib/apiClient';
import { formatLoginTerakhir, ringkasPengguna, saringPengguna, statusPengguna } from '../lib/penggunaFkrtl';
import type { FaskesRef, PenggunaFkrtl, SaringanPengguna, StatusPengguna } from '../lib/penggunaFkrtl';
import { KerangkaMemuat } from './ui/KerangkaMemuat';

type DataPengguna = { siap: boolean; pakai_username?: boolean; pengguna: PenggunaFkrtl[]; faskes: FaskesRef[] };
type SandiTampil = { judul: string; nama: string; email: string; username?: string; sandi: string; userId: string; sesiLamaTerbuka?: boolean };
type Konfirmasi = { jenis: 'atur-ulang' | 'nonaktif' | 'aktif'; pengguna: PenggunaFkrtl };

const STATUS: Record<StatusPengguna, { label: string; color: 'success' | 'warning' | 'default' }> = {
  aktif: { label: 'Aktif', color: 'success' },
  wajib_ganti: { label: 'Wajib ganti sandi', color: 'warning' },
  nonaktif: { label: 'Nonaktif', color: 'default' },
};

const pesanGalat = (error: unknown, cadangan: string) => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : cadangan;
};
const idAman = (userId: string) => encodeURIComponent(userId);
// Di ponsel kolom ini disembunyikan; kabupaten ikut tampil di bawah nama faskes.
const KOLOM_LEBAR = { display: { xs: 'none', md: 'table-cell' } } as const;

export function PenggunaFkrtlView() {
  const queryClient = useQueryClient();
  const query = useQuery<DataPengguna, Error>({
    queryKey: ['pengguna-fkrtl'],
    queryFn: async ({ signal }) => (await apiClient.get<DataPengguna>('/api/v1/pengguna-fkrtl', { signal, timeout: 30000 })).data,
    staleTime: 30 * 1000,
  });
  const [saring, setSaring] = useState<SaringanPengguna>({ cari: '', kabupaten: '', status: '' });
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [form, setForm] = useState<{ faskes: FaskesRef | null; nama: string; email: string }>({ faskes: null, nama: '', email: '' });
  const [galatForm, setGalatForm] = useState('');
  const [sandiTampil, setSandiTampil] = useState<SandiTampil | null>(null);
  const [disalin, setDisalin] = useState(false);
  const [menuAksi, setMenuAksi] = useState<{ anchor: HTMLElement; pengguna: PenggunaFkrtl } | null>(null);
  const [konfirmasi, setKonfirmasi] = useState<Konfirmasi | null>(null);
  const [kabar, setKabar] = useState<{ jenis: 'success' | 'error'; teks: string } | null>(null);

  const data = query.data;
  const daftar = useMemo(() => (data ? saringPengguna(data.pengguna, saring) : []), [data, saring]);
  const ringkas = data ? ringkasPengguna(data.pengguna, data.faskes) : null;
  const kabupaten = useMemo(() => [...new Set((data?.faskes || []).map(f => f.kabupaten).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')), [data]);
  const muatUlang = () => queryClient.invalidateQueries({ queryKey: ['pengguna-fkrtl'] });

  const buat = useMutation({
    mutationFn: async () => (await apiClient.post<{ pengguna: PenggunaFkrtl; sandi_awal: string }>('/api/v1/pengguna-fkrtl', {
      nama: form.nama, email: form.email, kode_ppk: form.faskes?.kode_ppk || '',
    })).data,
    onSuccess: hasil => {
      setFormTerbuka(false);
      setForm({ faskes: null, nama: '', email: '' });
      setSandiTampil({ judul: 'Akun dibuat', nama: hasil.pengguna.nama, email: hasil.pengguna.email, username: hasil.pengguna.username, sandi: hasil.sandi_awal, userId: hasil.pengguna.user_id });
      void muatUlang();
    },
    onError: error => setGalatForm(pesanGalat(error, 'Akun gagal dibuat. Coba lagi.')),
  });
  const aturUlang = useMutation({
    mutationFn: async (p: PenggunaFkrtl) => (await apiClient.post<{ sandi_awal: string; sesi_dihapus?: boolean }>(`/api/v1/pengguna-fkrtl/${idAman(p.user_id)}/atur-ulang-sandi`)).data,
    onSuccess: (hasil, p) => { setSandiTampil({ judul: 'Sandi diatur ulang', nama: p.nama, email: p.email, username: p.username, sandi: hasil.sandi_awal, userId: p.user_id, sesiLamaTerbuka: hasil.sesi_dihapus === false }); void muatUlang(); },
    onError: error => setKabar({ jenis: 'error', teks: pesanGalat(error, 'Sandi gagal diatur ulang.') }),
  });
  const ubahAktif = useMutation({
    mutationFn: async ({ p, aktif }: { p: PenggunaFkrtl; aktif: boolean }) => apiClient.patch(`/api/v1/pengguna-fkrtl/${idAman(p.user_id)}`, { aktif }),
    onSuccess: (_, { p, aktif }) => { setKabar({ jenis: 'success', teks: `${p.nama} ${aktif ? 'diaktifkan kembali' : 'dinonaktifkan'}.` }); void muatUlang(); },
    onError: error => setKabar({ jenis: 'error', teks: pesanGalat(error, 'Status akun gagal diubah.') }),
  });
  const isiUsername = useMutation({
    mutationFn: async (p: PenggunaFkrtl) => (await apiClient.post<{ pengguna: PenggunaFkrtl }>(`/api/v1/pengguna-fkrtl/${idAman(p.user_id)}/username`)).data,
    onSuccess: hasil => { setKabar({ jenis: 'success', teks: `Username ${hasil.pengguna.username} dibuat untuk ${hasil.pengguna.nama}.` }); void muatUlang(); },
    onError: error => setKabar({ jenis: 'error', teks: pesanGalat(error, 'Username gagal dibuat.') }),
  });
  const undangan = useMutation({
    mutationFn: async (userId: string) => apiClient.post(`/api/v1/pengguna-fkrtl/${idAman(userId)}/undangan`),
    onSuccess: () => setKabar({ jenis: 'success', teks: 'Email setel kata sandi dikirim Auth0.' }),
    onError: error => setKabar({ jenis: 'error', teks: pesanGalat(error, 'Email gagal dikirim.') }),
  });

  const salinSandi = async () => {
    if (!sandiTampil) return;
    try { await navigator.clipboard.writeText(sandiTampil.sandi); setDisalin(true); } catch { setDisalin(false); }
  };
  const tutupSandi = () => { setSandiTampil(null); setDisalin(false); };
  const jalankanKonfirmasi = () => {
    if (!konfirmasi) return;
    if (konfirmasi.jenis === 'atur-ulang') aturUlang.mutate(konfirmasi.pengguna);
    else ubahAktif.mutate({ p: konfirmasi.pengguna, aktif: konfirmasi.jenis === 'aktif' });
    setKonfirmasi(null);
  };

  if (query.isPending) return <KerangkaMemuat label="Memuat pengguna FKRTL" />;
  if (query.isError || !data) {
    return <Paper elevation={0} sx={{ p: 4, borderRadius: 3 }} role="alert"><Typography variant="h3" component="h1" sx={{ mb: 1 }}>Pengguna FKRTL belum dapat dimuat</Typography><Typography color="text.secondary" sx={{ mb: 2 }}>{pesanGalat(query.error, 'Coba muat kembali sebentar lagi.')}</Typography><Button variant="contained" onClick={() => void query.refetch()}>Coba lagi</Button></Paper>;
  }

  return <Box className="sapa-page">
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-end' }} justifyContent="space-between" sx={{ mb: 3 }}>
      <Box>
        <Typography variant="h2" component="h1" sx={{ mb: 1 }}>Pengguna FKRTL</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: '65ch' }}>Akun petugas rumah sakit untuk melihat dan mengunduh data FKRTL. Kata sandi dikelola Auth0; SAPA tidak menyimpannya.</Typography>
        {ringkas && <Typography variant="body2" sx={{ mt: 1.5, fontVariantNumeric: 'tabular-nums' }}><strong>{ringkas.rsBerakun}</strong> dari {ringkas.totalRs} RS sudah punya akun aktif · <strong>{ringkas.wajibGanti}</strong> menunggu ganti sandi · {ringkas.nonaktif} nonaktif</Typography>}
      </Box>
      <Button variant="contained" startIcon={<IconPlus size={18} />} disabled={!data.siap} onClick={() => { setGalatForm(''); setFormTerbuka(true); }}>Tambah pengguna</Button>
    </Stack>

    {!data.siap && <Alert severity="warning" sx={{ mb: 3 }}>Pengelolaan akun belum dikonfigurasi. Super Admin perlu mengisi aplikasi Management API Auth0 dan ID peran Petugas RS di pengaturan Vercel, lalu memuat ulang halaman ini.</Alert>}

    <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, mb: 2 }}>
        <TextField label="Cari nama, username, email, atau faskes" type="search" value={saring.cari} onChange={event => setSaring(s => ({ ...s, cari: event.target.value }))} />
        <TextField select slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} label="Kabupaten" value={saring.kabupaten} onChange={event => setSaring(s => ({ ...s, kabupaten: event.target.value }))}>
          <MenuItem value="">Semua kabupaten</MenuItem>{kabupaten.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
        </TextField>
        <TextField select slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} label="Status" value={saring.status} onChange={event => setSaring(s => ({ ...s, status: event.target.value as SaringanPengguna['status'] }))}>
          <MenuItem value="">Semua status</MenuItem>{(Object.keys(STATUS) as StatusPengguna[]).map(k => <MenuItem key={k} value={k}>{STATUS[k].label}</MenuItem>)}
        </TextField>
      </Box>
      <Typography role="status" variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{daftar.length} akun ditampilkan</Typography>
      {data.pengguna.length === 0 ? <Box sx={{ py: 6, textAlign: 'center' }}><Typography variant="h4" component="h2" sx={{ mb: 1 }}>Belum ada akun petugas RS</Typography><Typography color="text.secondary" sx={{ mb: 2 }}>Tambahkan akun pertama, lalu serahkan sandi awalnya ke petugas.</Typography>{data.siap && <Button variant="outlined" startIcon={<IconPlus size={18} />} onClick={() => setFormTerbuka(true)}>Tambah pengguna</Button>}</Box>
        : daftar.length === 0 ? <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Tidak ada akun yang cocok dengan saringan ini.</Typography>
        : <TableContainer>
          <Table size="small" aria-label="Daftar akun petugas RS" sx={{ '& .MuiTableCell-root': { px: { xs: 1, md: 2 } } }}>
            <TableHead><TableRow><TableCell>Petugas</TableCell><TableCell>Faskes</TableCell><TableCell sx={KOLOM_LEBAR}>Kabupaten</TableCell><TableCell sx={KOLOM_LEBAR}>Status</TableCell><TableCell sx={KOLOM_LEBAR}>Login terakhir</TableCell><TableCell align="right"><Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Aksi</Box></TableCell></TableRow></TableHead>
            <TableBody>{daftar.map(p => {
              const status = STATUS[statusPengguna(p)];
              return <TableRow key={p.user_id} hover>
                <TableCell><Typography variant="subtitle2">{p.nama}</Typography>{p.username ? <Typography variant="caption" component="p" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflowWrap: 'anywhere' }}>{p.username}</Typography> : data.pakai_username && <Typography variant="caption" component="p" color="warning.main">Belum punya username</Typography>}<Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{p.email}</Typography><Box sx={{ display: { md: 'none' }, mt: 0.5 }}><Chip size="small" label={status.label} color={status.color} variant={status.color === 'default' ? 'outlined' : 'filled'} /></Box></TableCell>
                <TableCell><Typography variant="body2">{p.faskes.nama_ppk}</Typography><Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{p.kode_ppk}<Box component="span" sx={{ display: { md: 'none' } }}> · {p.faskes.kabupaten || 'Kabupaten belum diisi'}</Box></Typography></TableCell>
                <TableCell sx={KOLOM_LEBAR}>{p.faskes.kabupaten || 'Belum diisi'}</TableCell>
                <TableCell sx={KOLOM_LEBAR}><Chip size="small" label={status.label} color={status.color} variant={status.color === 'default' ? 'outlined' : 'filled'} /></TableCell>
                <TableCell sx={{ ...KOLOM_LEBAR, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatLoginTerakhir(p.login_terakhir)}</TableCell>
                <TableCell align="right"><IconButton aria-label={`Aksi untuk ${p.nama}`} onClick={event => setMenuAksi({ anchor: event.currentTarget, pengguna: p })}><IconDotsVertical size={18} /></IconButton></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </TableContainer>}
    </Paper>

    <Snackbar open={Boolean(kabar)} autoHideDuration={kabar?.jenis === 'error' ? null : 6000} onClose={(_, alasan) => { if (alasan !== 'clickaway') setKabar(null); }} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      {kabar ? <Alert severity={kabar.jenis} variant="filled" onClose={() => setKabar(null)} sx={{ width: '100%' }}>{kabar.teks}</Alert> : undefined}
    </Snackbar>

    <Menu anchorEl={menuAksi?.anchor} open={Boolean(menuAksi)} onClose={() => setMenuAksi(null)}>
      {menuAksi && [
        <MenuItem key="atur" onClick={() => { setKonfirmasi({ jenis: 'atur-ulang', pengguna: menuAksi.pengguna }); setMenuAksi(null); }}>Atur ulang sandi awal</MenuItem>,
        <MenuItem key="email" onClick={() => { undangan.mutate(menuAksi.pengguna.user_id); setMenuAksi(null); }}>Kirim email setel sandi</MenuItem>,
        data.pakai_username && !menuAksi.pengguna.username
          ? <MenuItem key="username" onClick={() => { isiUsername.mutate(menuAksi.pengguna); setMenuAksi(null); }}>Buat username</MenuItem>
          : null,
        menuAksi.pengguna.aktif
          ? <MenuItem key="nonaktif" sx={{ color: 'error.main' }} onClick={() => { setKonfirmasi({ jenis: 'nonaktif', pengguna: menuAksi.pengguna }); setMenuAksi(null); }}>Nonaktifkan akun</MenuItem>
          : <MenuItem key="aktif" onClick={() => { setKonfirmasi({ jenis: 'aktif', pengguna: menuAksi.pengguna }); setMenuAksi(null); }}>Aktifkan kembali</MenuItem>,
      ]}
    </Menu>

    <Drawer anchor="right" open={formTerbuka} onClose={() => !buat.isPending && setFormTerbuka(false)} slotProps={{ paper: { sx: { width: 'min(440px, 100vw)', p: 3 } } }}>
      <Box component="form" noValidate onSubmit={event => { event.preventDefault(); setGalatForm(''); buat.mutate(); }} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, height: '100%' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="h3" component="h2">Tambah pengguna</Typography><IconButton aria-label="Tutup" onClick={() => setFormTerbuka(false)} disabled={buat.isPending}><IconX size={20} /></IconButton></Stack>
        <Typography variant="body2" color="text.secondary">Petugas mendapat peran Petugas RS: melihat dan mengunduh data FKRTL. Sandi awal dibuat otomatis dan wajib diganti saat masuk pertama.</Typography>
        <Autocomplete
          options={data.faskes} value={form.faskes} onChange={(_, value) => setForm(f => ({ ...f, faskes: value }))}
          getOptionLabel={f => `${f.nama_ppk} (${f.kode_ppk})`} isOptionEqualToValue={(a, b) => a.kode_ppk === b.kode_ppk}
          renderOption={(props, f) => <li {...props} key={f.kode_ppk}><Box><Typography variant="body2">{f.nama_ppk}</Typography><Typography variant="caption" color="text.secondary">{f.kode_ppk} · {f.kabupaten || 'Kabupaten belum terpetakan'}</Typography></Box></li>}
          renderInput={params => <TextField {...params} label="Faskes (FKRTL)" required helperText="Dari referensi Fasilitas Kesehatan" />}
          noOptionsText="Faskes tidak ditemukan"
        />
        <TextField label="Nama petugas" required value={form.nama} onChange={event => setForm(f => ({ ...f, nama: event.target.value }))} autoComplete="off" slotProps={{ htmlInput: { maxLength: 100 } }} />
        <TextField label="Email" type="email" required value={form.email} onChange={event => setForm(f => ({ ...f, email: event.target.value }))} autoComplete="off" helperText={data.pakai_username ? 'Untuk lupa kata sandi. Username dibuat otomatis dari kode dan nama faskes.' : 'Dipakai untuk masuk SAPA'} />
        {galatForm && <Alert severity="error">{galatForm}</Alert>}
        <Box sx={{ flexGrow: 1 }} />
        <Stack direction="row" spacing={1.5} justifyContent="flex-end">
          <Button onClick={() => setFormTerbuka(false)} disabled={buat.isPending}>Batal</Button>
          <Button type="submit" variant="contained" disabled={buat.isPending || !form.faskes || !form.nama.trim() || !form.email.trim()}>{buat.isPending ? 'Membuat akun…' : 'Buat akun'}</Button>
        </Stack>
      </Box>
    </Drawer>

    <Dialog open={Boolean(sandiTampil)} onClose={() => { /* Hanya lewat tombol Selesai, supaya sandi tidak hilang sebelum disalin. */ }} disableEscapeKeyDown aria-labelledby="sandi-awal-judul" maxWidth="xs" fullWidth>
      {sandiTampil && <>
        <DialogTitle id="sandi-awal-judul">{sandiTampil.judul}</DialogTitle>
        <DialogContent>
          {sandiTampil.username && <Typography variant="body2" sx={{ mb: 1 }}>Username: <Box component="strong" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflowWrap: 'anywhere' }}>{sandiTampil.username}</Box></Typography>}
          <Typography variant="body2" sx={{ mb: 2 }}>Sandi awal untuk <strong>{sandiTampil.nama}</strong> ({sandiTampil.email}):</Typography>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.default', border: 1, borderColor: 'divider' }}>
            <Typography component="code" sx={{ flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18, letterSpacing: '0.04em', wordBreak: 'break-all' }}>{sandiTampil.sandi}</Typography>
            <Button size="small" startIcon={<IconCopy size={16} />} onClick={() => void salinSandi()}>{disalin ? 'Tersalin' : 'Salin'}</Button>
          </Stack>
          {sandiTampil.sesiLamaTerbuka && <Alert severity="warning" sx={{ mt: 2 }}>Sesi lama di browser petugas belum bisa diakhiri otomatis. Bila akun diduga dibobol, nonaktifkan akun lalu aktifkan lagi.</Alert>}
          <Alert severity="info" sx={{ mt: 2 }}>Sandi ini hanya tampil sekali. Serahkan {sandiTampil.username ? 'username dan sandi' : 'sandi'} ke petugas lewat jalur yang aman. Petugas wajib mengganti sandi saat masuk pertama.</Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => undangan.mutate(sandiTampil.userId)} disabled={undangan.isPending}>Kirim juga email setel sandi</Button>
          <Button variant="contained" onClick={tutupSandi}>Selesai</Button>
        </DialogActions>
      </>}
    </Dialog>

    <Dialog open={Boolean(konfirmasi)} onClose={() => setKonfirmasi(null)} aria-labelledby="konfirmasi-judul" maxWidth="xs" fullWidth>
      {konfirmasi && <>
        <DialogTitle id="konfirmasi-judul">{konfirmasi.jenis === 'atur-ulang' ? 'Atur ulang sandi awal?' : konfirmasi.jenis === 'nonaktif' ? 'Nonaktifkan akun?' : 'Aktifkan kembali akun?'}</DialogTitle>
        <DialogContent><Typography variant="body2">{konfirmasi.jenis === 'atur-ulang'
          ? `Sandi ${konfirmasi.pengguna.nama} saat ini tidak berlaku lagi dan sesi yang masih terbuka diakhiri. Sandi awal baru akan tampil sekali, dan petugas wajib menggantinya saat masuk.`
          : konfirmasi.jenis === 'nonaktif' ? `${konfirmasi.pengguna.nama} tidak bisa masuk SAPA sampai akunnya diaktifkan kembali.`
          : `${konfirmasi.pengguna.nama} bisa masuk SAPA lagi dengan sandinya.`}</Typography></DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setKonfirmasi(null)}>Batal</Button><Button variant="contained" color={konfirmasi.jenis === 'nonaktif' ? 'error' : 'primary'} onClick={jalankanKonfirmasi}>{konfirmasi.jenis === 'atur-ulang' ? 'Atur ulang' : konfirmasi.jenis === 'nonaktif' ? 'Nonaktifkan' : 'Aktifkan'}</Button></DialogActions>
      </>}
    </Dialog>
  </Box>;
}
