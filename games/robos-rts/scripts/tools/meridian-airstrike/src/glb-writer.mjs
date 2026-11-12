// Deterministic glTF 2.0 Binary (.glb) Serializer & Bounds Normalizer
// Pure Node.js Buffer implementation — zero external dependencies.

import {
  cleanZero,
  f32,
  mat4FromTRS,
  mat4Mul,
  mat4TransformPoint,
  norm3,
  quatIdentity,
  quatNormalize,
} from "./math.mjs";
import { MERIDIAN_MATERIALS } from "./palette.mjs";

/**
 * Scene specification structure:
 * {
 *   name: string,
 *   targetRadius: number,
 *   floorY?: number, // default 0
 *   nodes: Array<{
 *     id: string,
 *     name: string,
 *     parent: string | null,
 *     translation?: [number, number, number],
 *     rotation?: [number, number, number, number],
 *     scale?: [number, number, number],
 *     part?: MeshPart,
 *     meshName?: string,
 *   }>,
 *   animations: Array<{
 *     name: string,
 *     tracks: Array<{
 *       nodeId: string,
 *       path: "translation" | "rotation" | "scale",
 *       interpolation?: "LINEAR" | "STEP",
 *       times: number[],
 *       values: Array<number[]>, // [x,y,z] or [x,y,z,w]
 *     }>
 *   }>
 * }
 */

export function normalizeAssetScene(scene, { targetRadius, floorY = 0, bodyRootId = null }) {
  const nodeMap = new Map();
  for (const n of scene.nodes) {
    n.translation = n.translation ? [...n.translation] : [0, 0, 0];
    n.rotation = n.rotation ? quatNormalize(n.rotation) : quatIdentity();
    n.scale = n.scale ? [...n.scale] : [1, 1, 1];
    nodeMap.set(n.id, n);
  }

  const computeWorldMats = () => {
    const world = new Map();
    const getW = (id) => {
      if (world.has(id)) return world.get(id);
      const n = nodeMap.get(id);
      const local = mat4FromTRS(n.translation, n.rotation, n.scale);
      const w = n.parent ? mat4Mul(getW(n.parent), local) : local;
      world.set(id, w);
      return w;
    };
    for (const n of scene.nodes) getW(n.id);
    return world;
  };

  // Step 1: Measure rest-pose horizontal radial bound & AABB
  let worldMats = computeWorldMats();
  let maxRadialXZ = 0;
  for (const n of scene.nodes) {
    if (!n.part || n.part.isEmpty()) continue;
    const wm = worldMats.get(n.id);
    for (const b of n.part.buckets.values()) {
      for (let i = 0; i < b.positions.length; i += 3) {
        const wp = mat4TransformPoint(wm, [
          b.positions[i],
          b.positions[i + 1],
          b.positions[i + 2],
        ]);
        const r = Math.hypot(wp[0], wp[2]);
        if (r > maxRadialXZ) maxRadialXZ = r;
      }
    }
  }

  // Uniformly bake scale `s` into vertex coordinates, node translations, and translation tracks
  // so every node's rest `scale` remains exact [1, 1, 1]!
  if (targetRadius && maxRadialXZ > 1e-6) {
    const s = targetRadius / maxRadialXZ;
    if (Math.abs(s - 1.0) > 1e-7) {
      const scaledParts = new Set();
      for (const n of scene.nodes) {
        n.translation = [
          cleanZero(n.translation[0] * s),
          cleanZero(n.translation[1] * s),
          cleanZero(n.translation[2] * s),
        ];
        if (n.part && !scaledParts.has(n.part)) {
          scaledParts.add(n.part);
          for (const b of n.part.buckets.values()) {
            for (let i = 0; i < b.positions.length; i++) {
              b.positions[i] = cleanZero(b.positions[i] * s);
            }
          }
        }
      }
      for (const anim of scene.animations || []) {
        for (const tr of anim.tracks) {
          if (tr.path === "translation") {
            tr.values = tr.values.map((v) => [
              cleanZero(v[0] * s),
              cleanZero(v[1] * s),
              cleanZero(v[2] * s),
            ]);
          }
        }
      }
    }
  }

  // Step 2: Align rest-pose minimum Y exactly to `floorY` (0.0)
  worldMats = computeWorldMats();
  let minY = Infinity;
  for (const n of scene.nodes) {
    if (!n.part || n.part.isEmpty()) continue;
    const wm = worldMats.get(n.id);
    for (const b of n.part.buckets.values()) {
      for (let i = 0; i < b.positions.length; i += 3) {
        const wp = mat4TransformPoint(wm, [
          f32(b.positions[i]),
          f32(b.positions[i + 1]),
          f32(b.positions[i + 2]),
        ]);
        if (wp[1] < minY) minY = wp[1];
      }
    }
  }

  if (Number.isFinite(minY)) {
    const dy = cleanZero(floorY - minY);
    if (Math.abs(dy) > 1e-8) {
      // Shift either designated bodyRootId or top-level children of scene root
      const shiftTarget =
        (bodyRootId && nodeMap.get(bodyRootId)) ||
        scene.nodes.find((n) => n.parent === null);
      if (shiftTarget) {
        shiftTarget.translation[1] = f32(shiftTarget.translation[1] + dy);
        for (const anim of scene.animations || []) {
          for (const tr of anim.tracks) {
            if (tr.nodeId === shiftTarget.id && tr.path === "translation") {
              tr.values = tr.values.map((v) => [v[0], f32(v[1] + dy), v[2]]);
            }
          }
        }
      }
    }
  }

  return scene;
}

export function serializeSceneToGLB(scene) {
  // Deterministic material table containing only materials referenced by scene meshes,
  // ordered deterministically by MERIDIAN_MATERIALS key order.
  const usedMatKeys = [];
  const matKeyOrder = Object.keys(MERIDIAN_MATERIALS);
  const referencedSet = new Set();

  for (const n of scene.nodes) {
    if (!n.part) continue;
    n.part.optimize();
    for (const [mk, b] of n.part.buckets.entries()) {
      if (b.indices.length > 0) referencedSet.add(mk);
    }
  }
  for (const mk of matKeyOrder) {
    if (referencedSet.has(mk)) usedMatKeys.push(mk);
  }
  for (const mk of referencedSet) {
    if (!usedMatKeys.includes(mk)) usedMatKeys.push(mk);
  }

  const matIndexMap = new Map();
  const gltfMaterials = usedMatKeys.map((mk, idx) => {
    matIndexMap.set(mk, idx);
    const def = MERIDIAN_MATERIALS[mk];
    if (!def) throw new Error(`Unknown material key: ${mk}`);
    const matObj = {
      name: def.name,
      pbrMetallicRoughness: {
        baseColorFactor: def.baseColorFactor.map((v) => Number(v.toFixed(6))),
        metallicFactor: Number(def.metallicFactor.toFixed(6)),
        roughnessFactor: Number(def.roughnessFactor.toFixed(6)),
      },
      doubleSided: false,
    };
    if (def.emissiveFactor) {
      matObj.emissiveFactor = def.emissiveFactor.map((v) => Number(v.toFixed(6)));
    }
    return matObj;
  });

  const bufferViews = [];
  const accessors = [];
  const binChunks = [];
  let byteOffset = 0;

  const pushBinaryChunk = (buf, target = undefined) => {
    const padLen = (4 - (buf.length % 4)) % 4;
    const bv = {
      buffer: 0,
      byteOffset,
      byteLength: buf.length,
    };
    if (target !== undefined) bv.target = target;
    const bvIndex = bufferViews.length;
    bufferViews.push(bv);
    binChunks.push(buf);
    byteOffset += buf.length;
    if (padLen > 0) {
      binChunks.push(Buffer.alloc(padLen, 0));
      byteOffset += padLen;
    }
    return bvIndex;
  };

  const addFloat32Accessor = (valuesFlat, numComponents, typeStr, target = undefined, isNormal = false) => {
    const count = valuesFlat.length / numComponents;
    const arr = new Float32Array(valuesFlat.length);

    if (isNormal) {
      for (let i = 0; i < count; i++) {
        const un = norm3([
          valuesFlat[i * 3],
          valuesFlat[i * 3 + 1],
          valuesFlat[i * 3 + 2],
        ]);
        arr[i * 3] = f32(Math.max(-1, Math.min(1, un[0])));
        arr[i * 3 + 1] = f32(Math.max(-1, Math.min(1, un[1])));
        arr[i * 3 + 2] = f32(Math.max(-1, Math.min(1, un[2])));
      }
    } else {
      for (let i = 0; i < valuesFlat.length; i++) {
        arr[i] = f32(valuesFlat[i]);
      }
    }

    const min = new Array(numComponents).fill(Infinity);
    const max = new Array(numComponents).fill(-Infinity);
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < numComponents; c++) {
        const v = arr[i * numComponents + c];
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }

    const raw = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const bvIdx = pushBinaryChunk(raw, target);
    const accIdx = accessors.length;
    accessors.push({
      bufferView: bvIdx,
      byteOffset: 0,
      componentType: 5126, // FLOAT
      count,
      type: typeStr,
      min: min.map((v) => (v === 0 ? 0 : v)),
      max: max.map((v) => (v === 0 ? 0 : v)),
    });
    return accIdx;
  };

  const addIndicesAccessor = (indices) => {
    let maxIdx = 0;
    for (const idx of indices) if (idx > maxIdx) maxIdx = idx;
    const useU32 = maxIdx > 65535;
    const typed = useU32 ? new Uint32Array(indices) : new Uint16Array(indices);
    const raw = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const bvIdx = pushBinaryChunk(raw, 34963); // ELEMENT_ARRAY_BUFFER
    const accIdx = accessors.length;
    accessors.push({
      bufferView: bvIdx,
      byteOffset: 0,
      componentType: useU32 ? 5125 : 5123,
      count: indices.length,
      type: "SCALAR",
      min: [0],
      max: [maxIdx],
    });
    return accIdx;
  };

  // Build meshes & nodes (deduplicating shared MeshPart instances cleanly)
  const gltfMeshes = [];
  const meshIdxByPart = new Map();
  const nodeIndexById = new Map();
  scene.nodes.forEach((n, idx) => nodeIndexById.set(n.id, idx));

  const childrenByParent = new Map();
  const rootNodeIndices = [];
  scene.nodes.forEach((n, idx) => {
    if (n.parent === null || n.parent === undefined) {
      rootNodeIndices.push(idx);
    } else {
      if (!nodeIndexById.has(n.parent)) {
        throw new Error(`Unknown parent node id "${n.parent}" on node "${n.id}"`);
      }
      if (!childrenByParent.has(n.parent)) childrenByParent.set(n.parent, []);
      childrenByParent.get(n.parent).push(idx);
    }
  });

  const gltfNodes = scene.nodes.map((n) => {
    const nodeObj = { name: n.name };

    const t = n.translation || [0, 0, 0];
    const r = quatNormalize(n.rotation || [0, 0, 0, 1]);
    const s = n.scale || [1, 1, 1];

    nodeObj.translation = [f32(t[0]), f32(t[1]), f32(t[2])];
    nodeObj.rotation = [f32(r[0]), f32(r[1]), f32(r[2]), f32(r[3])];
    nodeObj.scale = [f32(s[0]), f32(s[1]), f32(s[2])];

    const kids = childrenByParent.get(n.id);
    if (kids && kids.length > 0) {
      nodeObj.children = kids;
    }

    if (n.part && !n.part.isEmpty()) {
      let cachedMeshIdx = meshIdxByPart.get(n.part);
      if (cachedMeshIdx !== undefined) {
        nodeObj.mesh = cachedMeshIdx;
      } else {
        const primitives = [];
        // Deterministic bucket ordering
        const orderedBuckets = [...n.part.buckets.entries()]
          .filter(([, b]) => b.indices.length > 0)
          .sort((a, b) => matIndexMap.get(a[0]) - matIndexMap.get(b[0]));

        for (const [mk, b] of orderedBuckets) {
          const posAcc = addFloat32Accessor(b.positions, 3, "VEC3", 34962, false);
          const normAcc = addFloat32Accessor(b.normals, 3, "VEC3", 34962, true);
          const idxAcc = addIndicesAccessor(b.indices);
          primitives.push({
            attributes: {
              POSITION: posAcc,
              NORMAL: normAcc,
            },
            indices: idxAcc,
            material: matIndexMap.get(mk),
            mode: 4, // TRIANGLES
          });
        }

        if (primitives.length > 0) {
          const meshIdx = gltfMeshes.length;
          gltfMeshes.push({
            name: n.meshName || n.part.name || `${n.name}_Mesh`,
            primitives,
          });
          meshIdxByPart.set(n.part, meshIdx);
          nodeObj.mesh = meshIdx;
        }
      }
    }

    return nodeObj;
  });

  // Build animations
  const gltfAnimations = [];
  for (const anim of scene.animations || []) {
    const samplers = [];
    const channels = [];

    for (const tr of anim.tracks) {
      const targetNodeIdx = nodeIndexById.get(tr.nodeId);
      if (targetNodeIdx === undefined) {
        throw new Error(`Animation "${anim.name}" references unknown nodeId "${tr.nodeId}"`);
      }

      const inputAcc = addFloat32Accessor(tr.times, 1, "SCALAR", undefined, false);
      let flatOut = [];
      let outType = "VEC3";
      let outComp = 3;

      if (tr.path === "rotation") {
        outType = "VEC4";
        outComp = 4;
        for (const q of tr.values) {
          const uq = quatNormalize(q);
          flatOut.push(uq[0], uq[1], uq[2], uq[3]);
        }
      } else {
        for (const v of tr.values) {
          flatOut.push(v[0], v[1], v[2]);
        }
      }

      const outputAcc = addFloat32Accessor(flatOut, outComp, outType, undefined, false);
      const samplerIdx = samplers.length;
      samplers.push({
        input: inputAcc,
        interpolation: tr.interpolation || "LINEAR",
        output: outputAcc,
      });
      channels.push({
        sampler: samplerIdx,
        target: {
          node: targetNodeIdx,
          path: tr.path,
        },
      });
    }

    if (channels.length > 0) {
      gltfAnimations.push({
        name: anim.name,
        channels,
        samplers,
      });
    }
  }

  const binBuffer = Buffer.concat(binChunks);

  const gltfJson = {
    asset: {
      version: "2.0",
      generator: "Starfall-Meridian-Airstrike-Generator/1.0",
      copyright: "Original procedural geometry for Starfall Command (Meridian)",
    },
    scene: 0,
    scenes: [
      {
        name: scene.name,
        nodes: rootNodeIndices,
      },
    ],
    nodes: gltfNodes,
    meshes: gltfMeshes,
    materials: gltfMaterials,
    animations: gltfAnimations,
    accessors,
    bufferViews,
    buffers: [
      {
        byteLength: binBuffer.length,
      },
    ],
  };

  const jsonRaw = Buffer.from(JSON.stringify(gltfJson), "utf8");
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunkData =
    jsonPad > 0 ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;

  const totalByteLength = 12 + 8 + jsonChunkData.length + 8 + binBuffer.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4); // version 2
  header.writeUInt32LE(totalByteLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonChunkData.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuffer.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([
    header,
    jsonChunkHeader,
    jsonChunkData,
    binChunkHeader,
    binBuffer,
  ]);
}
