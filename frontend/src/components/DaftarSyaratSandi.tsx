import { Box } from '@mui/material';
import { IconCheck, IconCircle } from '@tabler/icons-react';
import type { SyaratSandiBaru } from '../auth/akunLokal';
import { WARNA } from './gayaMasuk';

/** Daftar syarat sandi baru dengan tanda terpenuhi; status tiap butir juga dibacakan pembaca layar. */
export function DaftarSyarat({ id, syarat, warnaRedup = WARNA.redup, warnaTerpenuhi = WARNA.hijau }: { id: string; syarat: SyaratSandiBaru[]; warnaRedup?: string; warnaTerpenuhi?: string }) {
  return <Box component="ul" id={id} aria-label="Syarat sandi baru" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 0.75 }}>
    {syarat.map(s => <Box component="li" key={s.kunci} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: s.terpenuhi ? warnaTerpenuhi : warnaRedup, fontSize: 14 }}>
      {s.terpenuhi ? <IconCheck size={16} aria-hidden="true" /> : <IconCircle size={16} aria-hidden="true" />}
      <span>{s.label}<Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{s.terpenuhi ? ', terpenuhi' : ', belum'}</Box></span>
    </Box>)}
  </Box>;
}
