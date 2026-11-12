import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildGlb } from './src/gltf_writer.js';
import { createFortifiedHubScene } from './src/buildings/fortified_hub.js';
import { createOperationsHubScene } from './src/buildings/operations_hub.js';
import { createRadarBeaconScene } from './src/buildings/radar_beacon.js';
import { createVehicleArmoryScene } from './src/buildings/vehicle_armory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ASSET_SPECS = [
  {
    filename: 'fortified_hub.glb',
    targetRadius: 4.2,
    buildScene: createFortifiedHubScene,
  },
  {
    filename: 'operations_hub.glb',
    targetRadius: 4.2,
    buildScene: createOperationsHubScene,
  },
  {
    filename: 'radar_beacon.glb',
    targetRadius: 1.875,
    buildScene: createRadarBeaconScene,
  },
  {
    filename: 'vehicle_armory.glb',
    targetRadius: 3.75,
    buildScene: createVehicleArmoryScene,
  },
];

export function generateAllBuffers() {
  const results = [];
  for (const spec of ASSET_SPECS) {
    const sceneDef = spec.buildScene();
    const glbBuffer = buildGlb(sceneDef);
    const sha256 = crypto.createHash('sha256').update(glbBuffer).digest('hex');
    results.push({
      filename: spec.filename,
      targetRadius: spec.targetRadius,
      glbBuffer,
      sha256,
      animations: (sceneDef.animations ?? []).map((a) => a.name),
    });
  }
  return results;
}

export function writeAllGlbs(outDir = __dirname) {
  fs.mkdirSync(outDir, { recursive: true });
  const generated = generateAllBuffers();
  for (const item of generated) {
    const outPath = path.join(outDir, item.filename);
    fs.writeFileSync(outPath, item.glbBuffer);
  }
  return generated;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const generated = writeAllGlbs(__dirname);
  console.log('Meridian Starfall Command — Deterministic GLB Build Complete:');
  for (const item of generated) {
    console.log(
      `  - ${item.filename.padEnd(20)} | ${(item.glbBuffer.length / 1024).toFixed(1).padStart(6)} KB | R=${String(item.targetRadius).padEnd(5)} | anims=[${item.animations.join(', ')}] | sha256=${item.sha256.slice(0, 16)}...`
    );
  }
}
