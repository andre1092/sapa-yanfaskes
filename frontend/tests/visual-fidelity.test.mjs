/**
 * PROFI UI FIDELITY ENGINE - VISUAL FIDELITY TEST SUITE
 * Pengujian deterministik komparasi visual berbasis piksel menggunakan Pixelmatch
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { runVisualDiff } from '../scripts/visual-diff.mjs';

const SNAPSHOT_DIR = path.resolve('design-reference/snapshots');
fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

function createSolidPng(width, height, r, g, b, a = 255) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return png;
}

// Helper: Menggambar kartu header BPJS Kesehatan
function renderBpjsHeaderSnapshot(hasUnauthorizedBanner = false) {
  const width = 400;
  const height = 120;
  // Background: --bpjs-mint-white (#f7fcfa: 247, 252, 250)
  const png = createSolidPng(width, height, 247, 252, 250);

  // Header Bar: --bpjs-navy (#2b4390: 43, 67, 144)
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = 43;
      png.data[idx + 1] = 67;
      png.data[idx + 2] = 144;
      png.data[idx + 3] = 255;
    }
  }

  // Accent Line: --bpjs-green (#44853b: 68, 133, 59)
  for (let y = 40; y < 44; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = 68;
      png.data[idx + 1] = 133;
      png.data[idx + 2] = 59;
      png.data[idx + 3] = 255;
    }
  }

  // Jika ada elemen tidak terotorisasi (misal AI menambahkan banner promosi oranye ilegal)
  if (hasUnauthorizedBanner) {
    for (let y = 60; y < 90; y++) {
      for (let x = 50; x < 350; x++) {
        const idx = (width * y + x) << 2;
        png.data[idx] = 255; // Oranye terang
        png.data[idx + 1] = 120;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 255;
      }
    }
  }

  return png;
}

async function runTestSuite() {
  console.log('=== MEMULAI TEST SUITE PROFI UI FIDELITY (PIXELMATCH) ===');

  const refPath = path.join(SNAPSHOT_DIR, 'reference_header.png');
  const actPassPath = path.join(SNAPSHOT_DIR, 'actual_header_clean.png');
  const actFailPath = path.join(SNAPSHOT_DIR, 'actual_header_drift.png');
  const diffPath = path.join(SNAPSHOT_DIR, 'diff_header.png');
  const reportPath = path.join(SNAPSHOT_DIR, 'visual-report.json');

  // 1. Simpan Gambar Referensi Otoritatif
  const refPng = renderBpjsHeaderSnapshot(false);
  fs.writeFileSync(refPath, PNG.sync.write(refPng));

  // 2. Simpan Gambar Aktual Bersih (100% Cocok)
  const actPassPng = renderBpjsHeaderSnapshot(false);
  fs.writeFileSync(actPassPath, PNG.sync.write(actPassPng));

  // 3. Simpan Gambar Aktual dengan Deviasi (Elemen Ilegal)
  const actFailPng = renderBpjsHeaderSnapshot(true);
  fs.writeFileSync(actFailPath, PNG.sync.write(actFailPng));

  // -----------------------------------------------------------------
  // UJI 1: Kesesuaian Identik (0% Mismatch)
  // -----------------------------------------------------------------
  console.log('\n[UJI 1] Menguji kesesuaian visual 100% identik...');
  const resClean = runVisualDiff({
    referencePath: refPath,
    actualPath: actPassPath,
    diffPath: path.join(SNAPSHOT_DIR, 'diff_clean.png'),
    reportPath: path.join(SNAPSHOT_DIR, 'report_clean.json'),
    maxTolerancePercent: 0.1,
  });

  assert.strictEqual(resClean.mismatched_pixels, 0, 'Harus 0 piksel mismatch');
  assert.strictEqual(resClean.mismatch_ratio_percent, 0.0, 'Rasio harus 0%');
  assert.strictEqual(resClean.status, 'PASSED', 'Status harus PASSED');
  console.log(`✓ Uji 1 Lulus: ${resClean.mismatched_pixels} piksel tidak cocok (${resClean.mismatch_ratio_percent}%)`);

  // -----------------------------------------------------------------
  // UJI 2: Deteksi Elemen Ilegal / Penyimpangan Visual (Visual Drift)
  // -----------------------------------------------------------------
  console.log('\n[UJI 2] Menguji deteksi elemen visual liar/tidak terotorisasi...');
  const resDrift = runVisualDiff({
    referencePath: refPath,
    actualPath: actFailPath,
    diffPath,
    reportPath,
    maxTolerancePercent: 1.0,
  });

  assert.ok(resDrift.mismatched_pixels > 0, 'Piksel deviasi harus terdeteksi');
  assert.ok(resDrift.mismatch_ratio_percent > 1.0, 'Rasio mismatch harus melampaui toleransi');
  assert.strictEqual(resDrift.status, 'FAILED', 'Status harus FAILED saat ada elemen liar');
  console.log(
    `✓ Uji 2 Lulus: Berhasil mendeteksi elemen liar (${resDrift.mismatched_pixels} piksel tidak cocok, rasio: ${resDrift.mismatch_ratio_percent}%)`
  );

  // -----------------------------------------------------------------
  // UJI 3: Verifikasi Berkas Diff & Laporan JSON Dihasilkan
  // -----------------------------------------------------------------
  console.log('\n[UJI 3] Memverifikasi persistensi artefak diff.png dan visual-report.json...');
  assert.ok(fs.existsSync(diffPath), 'Berkas diff.png harus terbentuk');
  assert.ok(fs.existsSync(reportPath), 'Berkas visual-report.json harus terbentuk');

  const savedReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.strictEqual(savedReport.dimensions.width, 400);
  assert.strictEqual(savedReport.dimensions.height, 120);
  assert.strictEqual(savedReport.status, 'FAILED');
  console.log('✓ Uji 3 Lulus: Artefak diff visual tersimpan sempurna di design-reference/snapshots/');

  console.log('\n=== SELURUH PENGUJIAN VISUAL FIDELITY BERHASIL 100% ===');
}

runTestSuite().catch((err) => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
