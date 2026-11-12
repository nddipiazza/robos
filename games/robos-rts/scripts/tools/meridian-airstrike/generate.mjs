#!/usr/bin/env node
// Deterministic Self-Contained Generator for Starfall Command — Meridian Assets
// Generates:
//   - night_harrier.glb        (radius 1.875)
//   - sky_sentry.glb           (radius 1.875)
//   - sky_sentry_defender.glb  (radius 1.875)
//   - ignition_core.glb        (radius 3.75)
// Plus deterministic manifest.json with SHA-256 hashes & geometry summaries.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serializeSceneToGLB } from "./src/glb-writer.mjs";
import { createNightHarrierAsset } from "./src/assets/night-harrier.mjs";
import {
  createSkySentryAsset,
  createSkySentryDefenderAsset,
} from "./src/assets/sky-sentry.mjs";
import { createIgnitionCoreAsset } from "./src/assets/ignition-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ASSET_BUILDERS = [
  {
    file: "night_harrier.glb",
    targetRadius: 1.875,
    build: createNightHarrierAsset,
  },
  {
    file: "sky_sentry.glb",
    targetRadius: 1.875,
    build: createSkySentryAsset,
  },
  {
    file: "sky_sentry_defender.glb",
    targetRadius: 1.875,
    build: createSkySentryDefenderAsset,
  },
  {
    file: "ignition_core.glb",
    targetRadius: 3.75,
    build: createIgnitionCoreAsset,
  },
];

export function generateAllInMemory() {
  const results = [];
  for (const entry of ASSET_BUILDERS) {
    const scene = entry.build();
    const glbBuffer = serializeSceneToGLB(scene);
    const sha256 = crypto.createHash("sha256").update(glbBuffer).digest("hex");

    let triangleCount = 0;
    let vertexCount = 0;
    for (const n of scene.nodes) {
      if (!n.part) continue;
      for (const b of n.part.buckets.values()) {
        triangleCount += b.indices.length / 3;
        vertexCount += b.positions.length / 3;
      }
    }

    results.push({
      file: entry.file,
      targetRadius: entry.targetRadius,
      byteLength: glbBuffer.length,
      sha256,
      triangleCount,
      vertexCount,
      clips: (scene.animations || []).map((a) => a.name),
      anchors: scene.nodes
        .filter((n) => n.name.startsWith("Muzzle"))
        .map((n) => n.name),
      teamColorPlates: scene.nodes
        .filter((n) => n.name.includes("TeamColor"))
        .map((n) => n.name),
      buffer: glbBuffer,
    });
  }
  return results;
}

function main() {
  const outDir = __dirname;
  const generated = generateAllInMemory();

  const manifest = {
    generator: "Starfall-Meridian-Airstrike-Generator/1.0",
    coordinateSystem: {
      up: "+Y",
      forward: "-Z",
      floorY: 0,
    },
    assets: [],
  };

  for (const item of generated) {
    const outPath = path.join(outDir, item.file);
    fs.writeFileSync(outPath, item.buffer);
    manifest.assets.push({
      file: item.file,
      targetRadius: item.targetRadius,
      byteLength: item.byteLength,
      sha256: item.sha256,
      triangleCount: item.triangleCount,
      vertexCount: item.vertexCount,
      clips: item.clips,
      anchors: item.anchors,
      teamColorPlates: item.teamColorPlates,
    });
    console.log(
      `[OK] ${item.file.padEnd(25)} | ${String(item.byteLength).padStart(7)} B | ${String(item.triangleCount).padStart(4)} tris | radius ${item.targetRadius} | sha256 ${item.sha256.slice(0, 16)}...`,
    );
  }

  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`[OK] Wrote deterministic manifest to ${manifestPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
