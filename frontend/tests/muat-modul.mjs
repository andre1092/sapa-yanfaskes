import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Memuat modul TypeScript/TSX dari src/ untuk tes node tanpa bundler: setiap berkas ditranspilasi
// lalu diimpor sebagai data: URL. Impor relatif diikuti (hasilnya di-cache, jadi satu berkas = satu
// instans modul), impor paket diarahkan ke node_modules frontend, impor CSS menjadi modul kosong. import.meta.env dibaca dari
// globalThis.__VITE_ENV__ supaya tes bisa memberi nilai palsu.

const cache = new Map();
const EKSTENSI = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

async function ada(url) {
  try { await access(url); return true; } catch { return false; }
}

async function cari(dasar, spesifikasi) {
  for (const akhiran of EKSTENSI) {
    const url = new URL(spesifikasi + akhiran, dasar);
    if (/\.(ts|tsx)$/.test(url.pathname) && await ada(url)) return url;
  }
  throw new Error(`Modul ${spesifikasi} tidak ditemukan dari ${fileURLToPath(dasar)}`);
}

async function dataUrl(url) {
  const kunci = url.href;
  if (!cache.has(kunci)) {
    cache.set(kunci, (async () => {
      const sumber = await readFile(url, 'utf8');
      const { outputText } = ts.transpileModule(sumber, {
        fileName: fileURLToPath(url),
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      });
      let kode = outputText.replaceAll('import.meta.env', '(globalThis.__VITE_ENV__ ?? {})');
      const pola = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\2/g;
      const ganti = new Map();
      for (const [, , , spesifikasi] of kode.matchAll(pola)) {
        if (ganti.has(spesifikasi)) continue;
        // Impor CSS (efek samping bundler) diganti modul kosong.
        if (spesifikasi.endsWith('.css')) ganti.set(spesifikasi, 'data:text/javascript,');
        else if (spesifikasi.startsWith('.')) ganti.set(spesifikasi, await dataUrl(await cari(url, spesifikasi)));
        else if (spesifikasi.startsWith('node:')) ganti.set(spesifikasi, spesifikasi);
        else ganti.set(spesifikasi, import.meta.resolve(spesifikasi));
      }
      kode = kode.replace(pola, (_, awal, kutip, spesifikasi) => `${awal}${kutip}${ganti.get(spesifikasi)}${kutip}`);
      return `data:text/javascript;base64,${Buffer.from(kode).toString('base64')}`;
    })());
  }
  return cache.get(kunci);
}

/** Impor berkas src (relatif terhadap frontend/src). */
export async function muat(jalur) {
  return import(await dataUrl(new URL(`../src/${jalur}`, import.meta.url)));
}
