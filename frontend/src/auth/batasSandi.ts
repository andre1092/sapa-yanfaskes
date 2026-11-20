// Batas atas sandi di klien, sama untuk semua isian sandi (form masuk, Siapkan akun, Ubah password), supaya
// sandi baru yang diterima selalu bisa dipakai masuk. Satuannya byte UTF-8, bukan karakter: huruf beraksen dan
// emoji memakan dua sampai empat byte.

export const MAKS_SANDI_BYTE = 256;

export const PESAN_SANDI_TERLALU_PANJANG = `Terlalu panjang: maksimal ${MAKS_SANDI_BYTE} byte (huruf beraksen dan emoji dihitung lebih dari satu)`;

export const panjangByte = (s: string) => new TextEncoder().encode(s).length;

export const sandiTerlaluPanjang = (s: string) => panjangByte(s) > MAKS_SANDI_BYTE;
