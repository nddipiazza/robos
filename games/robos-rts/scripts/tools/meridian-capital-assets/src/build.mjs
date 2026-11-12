// Deterministic build entry point for Starfall Command Meridian air, drone-turret, and capital assets.
// Outputs watchkeeper.glb, bastion_turret.glb, dreadnought.glb, and manifest.json.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWatchkeeperScene, WATCHKEEPER_RADIUS } from './units/watchkeeper.mjs';
import { buildBastionTurretScene, BASTION_TURRET_RADIUS } from './units/bastion-turret.mjs';
import { buildDreadnoughtScene, DREADNOUGHT_RADIUS } from './units/dreadnought.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const OUTPUT_DIR = dirname(__dirname);

export const ASSET_SPECS = [
  {
    fileName: 'watchkeeper.glb',
    unitId: 'watchkeeper',
    radius: WATCHKEEPER_RADIUS,
    buildScene: buildWatchkeeperScene,
    requiredClips: ['idle', 'hover', 'attack', 'cast', 'death'],
    requiredAnchors: ['Muzzle', 'MuzzleLeft', 'MuzzleRight'],
  },
  {
    fileName: 'bastion_turret.glb',
    unitId: 'bastion_turret',
    radius: BASTION_TURRET_RADIUS,
    buildScene: buildBastionTurretScene,
    requiredClips: ['idle', 'attack', 'cast', 'death'],
    requiredAnchors: ['Muzzle', 'MuzzleLeft', 'MuzzleRight'],
  },
  {
    fileName: 'dreadnought.glb',
    unitId: 'dreadnought',
    radius: DREADNOUGHT_RADIUS,
    buildScene: buildDreadnoughtScene,
    requiredClips: ['idle', 'hover', 'attack', 'cast', 'death'],
    requiredAnchors: ['Muzzle', 'MuzzleLeft', 'MuzzleRight', 'SiegeMuzzle'],
  },
];

export function buildAllInMemory() {
  return ASSET_SPECS.map((spec) => {
    const scene = spec.buildScene();
    const glbBuffer = scene.toGLB();
    const sha256 = createHash('sha256').update(glbBuffer).digest('hex');
    const bounds = scene.getBounds();

    let vertexCount = 0;
    let triangleCount = 0;
    for (const n of scene.nodes) {
      if (n.prims) {
        for (const p of n.prims) {
          vertexCount += p.vertexCount;
          triangleCount += p.indices.length / 3;
        }
      }
    }

    return {
      ...spec,
      glbBuffer,
      sha256,
      byteLength: glbBuffer.length,
      vertexCount,
      triangleCount,
      bounds,
      clips: scene.animations.map((a) => a.name),
    };
  });
}

export function writeAllAssets(outDir = OUTPUT_DIR) {
  mkdirSync(outDir, { recursive: true });
  const built = buildAllInMemory();
  const manifest = {
    generator: 'starfall-meridian-capital-assets/1.0',
    conventions: {
      upAxis: '+Y',
      floorY: 0,
      forwardAxis: '-Z',
    },
    assets: [],
  };

  for (const item of built) {
    const outPath = join(outDir, item.fileName);
    writeFileSync(outPath, item.glbBuffer);
    const round6 = (v) => Math.round(v * 1e6) / 1e6;
    manifest.assets.push({
      fileName: item.fileName,
      unitId: item.unitId,
      targetRadius: item.radius,
      measuredMaxRadialXZ: round6(item.bounds.maxRadialXZ),
      bbox: {
        min: [round6(item.bounds.minX), round6(item.bounds.minY), round6(item.bounds.minZ)],
        max: [round6(item.bounds.maxX), round6(item.bounds.maxY), round6(item.bounds.maxZ)],
      },
      byteLength: item.byteLength,
      sha256: item.sha256,
      vertexCount: item.vertexCount,
      triangleCount: item.triangleCount,
      clips: item.clips,
      anchors: item.requiredAnchors,
    });
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { built, manifest };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { manifest } = writeAllAssets();
  console.log('Generated Starfall Command Meridian assets:');
  for (const a of manifest.assets) {
    console.log(
      `  - ${a.fileName}: ${a.byteLength} bytes | ${a.triangleCount} tris | radius=${a.measuredMaxRadialXZ}/${a.targetRadius} | minY=${a.bbox.min[1]} | sha256=${a.sha256.slice(0, 16)}...`,
    );
  }
}
