// Letak tulisan "Target" pada grafik tren, supaya tidak menimpa angka di atas titik data.
// Semua ukuran dalam satuan viewBox grafik.

export interface TitikGrafik {
  x: number;
  y: number;
}

export interface LetakLabelTarget {
  x: number;
  y: number;
  anchor: 'start' | 'end';
}

const LEBAR_LABEL = 95;
const TINGGI_LABEL = 10;

/** Ruang yang dipakai satu titik: lingkarannya dan angka di atasnya. */
const kotakTitik = (titik: TitikGrafik) => ({
  kiri: titik.x - 18,
  kanan: titik.x + 18,
  atas: titik.y - 21,
  bawah: titik.y + 7,
});

const kotakLabel = (letak: LetakLabelTarget) => ({
  kiri: letak.anchor === 'end' ? letak.x - LEBAR_LABEL : letak.x,
  kanan: letak.anchor === 'end' ? letak.x : letak.x + LEBAR_LABEL,
  atas: letak.y - TINGGI_LABEL,
  bawah: letak.y + 2,
});

/**
 * Memilih tempat pertama yang kosong: kanan atas garis, kanan bawah, kiri atas, kiri bawah.
 * Bila semuanya terhalang, tulisan tetap di kanan atas.
 */
export const letakLabelTarget = (
  titik: readonly TitikGrafik[],
  yTarget: number,
  xKiri = 50,
  xKanan = 875,
): LetakLabelTarget => {
  const calon: LetakLabelTarget[] = [
    { x: xKanan, y: yTarget - 5, anchor: 'end' },
    { x: xKanan, y: yTarget + 13, anchor: 'end' },
    { x: xKiri, y: yTarget - 5, anchor: 'start' },
    { x: xKiri, y: yTarget + 13, anchor: 'start' },
  ];
  const kosong = (letak: LetakLabelTarget) => {
    const label = kotakLabel(letak);
    return titik.every((t) => {
      const k = kotakTitik(t);
      return k.kanan < label.kiri || k.kiri > label.kanan || k.bawah < label.atas || k.atas > label.bawah;
    });
  };
  return calon.find(kosong) ?? calon[0];
};
