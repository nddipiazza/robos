#!/usr/bin/env node
// Deterministic offline generator for Starfall Command — Aurelian Concord Air & Support assets
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildSunseerAsset } from './src/assets/sunseer.mjs';
import { buildStasisWardAsset } from './src/assets/stasis_ward.mjs';
import { buildStarAssemblyAsset } from './src/assets/star_assembly.mjs';
import { buildFleetSpireAsset } from './src/assets/fleet_spire.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ASSET_GENERATORS = [
  { filename: 'sunseer.glb', targetXZRadius: 1.875, build: buildSunseerAsset },
  { filename: 'stasis_ward.glb', targetXZRadius: 1.25, build: buildStasisWardAsset },
  { filename: 'star_assembly.glb', targetXZRadius: 3.75, build: buildStarAssemblyAsset },
  { filename: 'fleet_spire.glb', targetXZRadius: 3.75, build: buildFleetSpireAsset },
];

export function buildAllAssetsInMemory() {
  const results = [];
  for (const spec of ASSET_GENERATORS) {
    const { buffer, bounds } = spec.build();
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    results.push({
      filename: spec.filename,
      targetXZRadius: spec.targetXZRadius,
      buffer,
      bounds,
      byteLength: buffer.length,
      sha256,
    });
  }
  return results;
}

export function writeAllAssets(outDir = __dirname) {
  fs.mkdirSync(outDir, { recursive: true });
  const results = buildAllAssetsInMemory();
  for (const item of results) {
    const outPath = path.join(outDir, item.filename);
    fs.writeFileSync(outPath, item.buffer);
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const outArgIdx = process.argv.indexOf('--out-dir');
  const outDir = outArgIdx !== -1 && process.argv[outArgIdx + 1]
    ? path.resolve(process.argv[outArgIdx + 1])
    : __dirname;

  const built = writeAllAssets(outDir);
  console.log(`Built ${built.length} Aurelian Concord GLB assets in ${outDir}:`);
  for (const b of built) {
    console.log(
      `  - ${b.filename.padEnd(18)} | ${(b.byteLength / 1024).toFixed(1).padStart(6)} KB | ` +
      `tris: ${String(b.bounds.triCount).padStart(4)} | ` +
      `xzRadius: ${b.bounds.xzRadius.toFixed(4)} (target ${b.targetXZRadius}) | ` +
      `minY: ${b.bounds.minY.toFixed(5)} | sha256: ${b.sha256.slice(0, 16)}...`
    );
  }
}
