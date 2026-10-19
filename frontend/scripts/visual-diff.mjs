#!/usr/bin/env node
/**
 * PROFI UI FIDELITY ENGINE - PIXELMATCH VISUAL DIFF RUNNER
 * Membandingkan gambar referensi terhadap hasil render aktual dengan perbandingan piksel presisi.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export function runVisualDiff({
  referencePath,
  actualPath,
  diffPath,
  reportPath,
  threshold = 0.1,
  maxTolerancePercent = 1.0,
}) {
  if (!fs.existsSync(referencePath)) {
    throw new Error(`File referensi tidak ditemukan: ${referencePath}`);
  }
  if (!fs.existsSync(actualPath)) {
    throw new Error(`File render aktual tidak ditemukan: ${actualPath}`);
  }

  const refBuf = fs.readFileSync(referencePath);
  const actBuf = fs.readFileSync(actualPath);

  const imgRef = PNG.sync.read(refBuf);
  const imgAct = PNG.sync.read(actBuf);

  const { width, height } = imgRef;

  if (imgAct.width !== width || imgAct.height !== height) {
    throw new Error(
      `Dimensi gambar tidak cocok! Referensi: ${width}x${height}, Aktual: ${imgAct.width}x${imgAct.height}`
    );
  }

  const diff = new PNG({ width, height });

  const numDiffPixels = pixelmatch(
    imgRef.data,
    imgAct.data,
    diff.data,
    width,
    height,
    {
      threshold,
      includeAA: false,
      diffColor: [255, 0, 80], // Sorotan merah muda terang untuk piksel tidak cocok
      diffColorAlt: [0, 180, 255],
    }
  );

  const totalPixels = width * height;
  const mismatchRatio = (numDiffPixels / totalPixels) * 100;
  const passed = mismatchRatio <= maxTolerancePercent;

  if (diffPath) {
    fs.mkdirSync(path.dirname(diffPath), { recursive: true });
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }

  const report = {
    timestamp: new Date().toISOString(),
    reference: referencePath,
    actual: actualPath,
    diff_image: diffPath || null,
    dimensions: { width, height },
    total_pixels: totalPixels,
    mismatched_pixels: numDiffPixels,
    mismatch_ratio_percent: Number(mismatchRatio.toFixed(3)),
    tolerance_threshold_percent: maxTolerancePercent,
    status: passed ? 'PASSED' : 'FAILED',
  };

  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }

  return report;
}

// CLI execution helper
if (process.argv[1] && process.argv[1].endsWith('visual-diff.mjs')) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node visual-diff.mjs <ref.png> <act.png> [diff.png] [report.json]');
    process.exit(1);
  }
  const [ref, act, diff, report] = args;
  try {
    const res = runVisualDiff({
      referencePath: ref,
      actualPath: act,
      diffPath: diff || 'design-reference/snapshots/diff.png',
      reportPath: report || 'design-reference/snapshots/visual-report.json',
    });
    console.log('Visual Diff Result:', JSON.stringify(res, null, 2));
    process.exit(res.status === 'PASSED' ? 0 : 2);
  } catch (err) {
    console.error('Visual Diff Error:', err.message);
    process.exit(1);
  }
}
