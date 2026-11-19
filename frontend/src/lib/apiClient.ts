import axios from 'axios';
import { getSessionToken, HEADER_SAPA, modeSesi, safeReturnTo } from '../auth/session';
import { alamatHalamanMasuk } from './halamanAwal';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  if (modeSesi() === 'bff') {
    // Sesi cookie: tanpa Bearer, cookie HttpOnly dikirim browser ke asal sendiri saja (alamat API lain
    // tidak dipakai), dan X-SAPA menandai permintaan dari aplikasi untuk penjaga CSRF server.
    config.baseURL = '';
    config.withCredentials = false;
    config.headers.delete('Authorization');
    for (const [nama, nilai] of Object.entries(HEADER_SAPA)) config.headers.set(nama, nilai);
    return config;
  }
  config.headers.Authorization = `Bearer ${await getSessionToken()}`;
  return config;
});

let menujuHalamanMasuk = false;
apiClient.interceptors.response.use(undefined, (error) => {
  // Mode bff: 401 berarti sesi cookie berakhir. Pindah ke /login dengan tujuan semula yang aman.
  if (modeSesi() === 'bff' && error?.response?.status === 401 && !menujuHalamanMasuk) {
    const sekarang = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const tujuan = alamatHalamanMasuk(safeReturnTo(sekarang));
    if (tujuan !== sekarang) {
      menujuHalamanMasuk = true;
      window.location.replace(tujuan);
    }
  }
  return Promise.reject(error);
});
