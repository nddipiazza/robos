import { MATERIAL_LIBRARY, MATERIAL_ORDER } from './materials.js';
import { quatNormalize } from './math.js';

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;

const COMPONENT_USHORT = 5123;
const COMPONENT_UINT = 5125;
const COMPONENT_FLOAT = 5126;

function computeMinMaxFloat32(f32, numComponents) {
  const count = f32.length / numComponents;
  const min = new Array(numComponents).fill(Infinity);
  const max = new Array(numComponents).fill(-Infinity);
  for (let i = 0; i < count; i++) {
    const base = i * numComponents;
    for (let c = 0; c < numComponents; c++) {
      const v = f32[base + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return { min, max };
}

function computeMinMaxUint(arr) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min: [min], max: [max] };
}

// SceneDef structure:
// {
//   name: string,
//   root: NodeDef,
//   animations: Array<{
//     name: string,
//     tracks: Array<{
//       node: string, // node name
//       path: 'translation' | 'rotation' | 'scale',
//       interpolation?: 'LINEAR' | 'STEP',
//       times: number[],
//       values: number[][] // VEC3 or VEC4
//     }>
//   }>
// }
//
// NodeDef structure:
// {
//   name: string,
//   translation?: [number, number, number],
//   rotation?: [number, number, number, number],
//   scale?: [number, number, number],
//   part?: Part,
//   children?: NodeDef[]
// }

export function buildGlb(sceneDef) {
  const binChunks = [];
  let binByteOffset = 0;

  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const nodeIndexByName = new Map();

  // First pass: collect used materials in deterministic order
  const usedMatSet = new Set();
  function scanMaterials(nodeDef) {
    if (nodeDef.part) {
      for (const [matName, tris] of nodeDef.part.trisByMat.entries()) {
        if (tris.length > 0) usedMatSet.add(matName);
      }
    }
    if (nodeDef.children) {
      for (const ch of nodeDef.children) scanMaterials(ch);
    }
  }
  scanMaterials(sceneDef.root);

  const orderedMatNames = MATERIAL_ORDER.filter((m) => usedMatSet.has(m));
  for (const m of usedMatSet) {
    if (!orderedMatNames.includes(m)) {
      throw new Error(`Unknown material "${m}" not in MATERIAL_LIBRARY`);
    }
  }

  const matIndexByName = new Map();
  const materials = orderedMatNames.map((matName, idx) => {
    matIndexByName.set(matName, idx);
    const spec = MATERIAL_LIBRARY[matName];
    const matJson = {
      name: spec.name,
      pbrMetallicRoughness: {
        baseColorFactor: spec.baseColorFactor,
        metallicFactor: spec.metallicFactor,
        roughnessFactor: spec.roughnessFactor,
      },
      doubleSided: Boolean(spec.doubleSided),
    };
    if (spec.emissiveFactor) {
      matJson.emissiveFactor = spec.emissiveFactor;
    }
    return matJson;
  });

  function appendBinary(typedArray, target) {
    const rawBuf = Buffer.from(
      typedArray.buffer,
      typedArray.byteOffset,
      typedArray.byteLength
    );
    const byteOffset = binByteOffset;
    const byteLength = rawBuf.length;
    binChunks.push(rawBuf);
    binByteOffset += byteLength;

    const pad = (4 - (binByteOffset % 4)) % 4;
    if (pad > 0) {
      binChunks.push(Buffer.alloc(pad, 0));
      binByteOffset += pad;
    }

    const bv = {
      buffer: 0,
      byteOffset,
      byteLength,
    };
    if (target !== undefined) {
      bv.target = target;
    }
    const bvIndex = bufferViews.length;
    bufferViews.push(bv);
    return bvIndex;
  }

  function addFloatAccessor(f32, type, numComponents, target, includeMinMax = false) {
    const bvIndex = appendBinary(f32, target);
    const acc = {
      bufferView: bvIndex,
      byteOffset: 0,
      componentType: COMPONENT_FLOAT,
      count: f32.length / numComponents,
      type,
    };
    if (includeMinMax) {
      const { min, max } = computeMinMaxFloat32(f32, numComponents);
      acc.min = min;
      acc.max = max;
    }
    const accIndex = accessors.length;
    accessors.push(acc);
    return accIndex;
  }

  function addIndexAccessor(idxArr) {
    const bvIndex = appendBinary(idxArr, TARGET_ELEMENT_ARRAY_BUFFER);
    const { min, max } = computeMinMaxUint(idxArr);
    const acc = {
      bufferView: bvIndex,
      byteOffset: 0,
      componentType: idxArr instanceof Uint32Array ? COMPONENT_UINT : COMPONENT_USHORT,
      count: idxArr.length,
      type: 'SCALAR',
      min,
      max,
    };
    const accIndex = accessors.length;
    accessors.push(acc);
    return accIndex;
  }

  // Recursively flatten NodeDefs in pre-order (root = index 0)
  function emitNode(nodeDef) {
    if (!nodeDef.name) {
      throw new Error('Every glTF node must have a deterministic name');
    }
    if (nodeIndexByName.has(nodeDef.name)) {
      throw new Error(`Duplicate node name "${nodeDef.name}"`);
    }
    const myIndex = nodes.length;
    nodeIndexByName.set(nodeDef.name, myIndex);

    const nodeJson = {
      name: nodeDef.name,
    };
    if (nodeDef.translation) {
      nodeJson.translation = nodeDef.translation.map((v) => Number(v.toFixed(6)));
    }
    if (nodeDef.rotation) {
      const q = quatNormalize(nodeDef.rotation);
      nodeJson.rotation = q.map((v) => Number(v.toFixed(7)));
    }
    if (nodeDef.scale) {
      nodeJson.scale = nodeDef.scale.map((v) => Number(v.toFixed(6)));
    }

    if (nodeDef.part) {
      const rawPrims = nodeDef.part.buildPrimitives();
      rawPrims.sort(
        (a, b) => matIndexByName.get(a.material) - matIndexByName.get(b.material)
      );
      if (rawPrims.length > 0) {
        const gltfPrims = rawPrims.map((prim) => {
          const posAcc = addFloatAccessor(
            prim.positions,
            'VEC3',
            3,
            TARGET_ARRAY_BUFFER,
            true
          );
          const normAcc = addFloatAccessor(
            prim.normals,
            'VEC3',
            3,
            TARGET_ARRAY_BUFFER,
            false
          );
          const uvAcc = addFloatAccessor(
            prim.uvs,
            'VEC2',
            2,
            TARGET_ARRAY_BUFFER,
            false
          );
          const idxAcc = addIndexAccessor(prim.indices);
          return {
            attributes: {
              POSITION: posAcc,
              NORMAL: normAcc,
              TEXCOORD_0: uvAcc,
            },
            indices: idxAcc,
            material: matIndexByName.get(prim.material),
            mode: 4,
          };
        });
        const meshIndex = meshes.length;
        meshes.push({
          name: `${nodeDef.name}_Mesh`,
          primitives: gltfPrims,
        });
        nodeJson.mesh = meshIndex;
      }
    }

    nodes.push(nodeJson);

    if (nodeDef.children && nodeDef.children.length > 0) {
      const childIndices = nodeDef.children.map((ch) => emitNode(ch));
      nodeJson.children = childIndices;
    }

    return myIndex;
  }

  const rootIndex = emitNode(sceneDef.root);

  // Build animations
  const animations = [];
  if (sceneDef.animations && sceneDef.animations.length > 0) {
    for (const animDef of sceneDef.animations) {
      const samplers = [];
      const channels = [];
      const timeAccessorCache = new Map();

      for (const track of animDef.tracks) {
        const targetNode = nodeIndexByName.get(track.node);
        if (targetNode === undefined) {
          throw new Error(
            `Animation "${animDef.name}" references missing node "${track.node}"`
          );
        }
        if (track.times.length !== track.values.length || track.times.length < 2) {
          throw new Error(
            `Animation "${animDef.name}" track "${track.node}.${track.path}" must have >=2 matching times/values`
          );
        }

        const timeKey = track.times.map((t) => t.toFixed(6)).join(',');
        let inputAcc = timeAccessorCache.get(timeKey);
        if (inputAcc === undefined) {
          const f32Times = new Float32Array(track.times);
          inputAcc = addFloatAccessor(f32Times, 'SCALAR', 1, undefined, true);
          timeAccessorCache.set(timeKey, inputAcc);
        }

        let outputAcc;
        if (track.path === 'rotation') {
          const flat = new Float32Array(track.values.length * 4);
          for (let i = 0; i < track.values.length; i++) {
            const q = quatNormalize(track.values[i]);
            flat[i * 4 + 0] = q[0];
            flat[i * 4 + 1] = q[1];
            flat[i * 4 + 2] = q[2];
            flat[i * 4 + 3] = q[3];
            // Re-normalize in float32 precision
            const l = Math.hypot(
              flat[i * 4 + 0],
              flat[i * 4 + 1],
              flat[i * 4 + 2],
              flat[i * 4 + 3]
            );
            flat[i * 4 + 0] /= l;
            flat[i * 4 + 1] /= l;
            flat[i * 4 + 2] /= l;
            flat[i * 4 + 3] /= l;
          }
          outputAcc = addFloatAccessor(flat, 'VEC4', 4, undefined, false);
        } else if (track.path === 'translation' || track.path === 'scale') {
          const flat = new Float32Array(track.values.length * 3);
          for (let i = 0; i < track.values.length; i++) {
            flat[i * 3 + 0] = track.values[i][0];
            flat[i * 3 + 1] = track.values[i][1];
            flat[i * 3 + 2] = track.values[i][2];
          }
          outputAcc = addFloatAccessor(flat, 'VEC3', 3, undefined, false);
        } else {
          throw new Error(`Unsupported animation path "${track.path}"`);
        }

        const samplerIndex = samplers.length;
        samplers.push({
          input: inputAcc,
          interpolation: track.interpolation ?? 'LINEAR',
          output: outputAcc,
        });
        channels.push({
          sampler: samplerIndex,
          target: {
            node: targetNode,
            path: track.path,
          },
        });
      }

      animations.push({
        name: animDef.name,
        channels,
        samplers,
      });
    }
  }

  const binBuffer = Buffer.concat(binChunks);

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'MeridianStarfallCommand-DeterministicGLB/1.0',
    },
    scene: 0,
    scenes: [
      {
        name: sceneDef.name,
        nodes: [rootIndex],
      },
    ],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [
      {
        byteLength: binBuffer.length,
      },
    ],
  };

  if (animations.length > 0) {
    gltfJson.animations = animations;
  }

  const jsonRaw = Buffer.from(JSON.stringify(gltfJson), 'utf8');
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunkData =
    jsonPad > 0 ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;

  const binPad = (4 - (binBuffer.length % 4)) % 4;
  const binChunkData =
    binPad > 0 ? Buffer.concat([binBuffer, Buffer.alloc(binPad, 0x00)]) : binBuffer;

  const totalLength = 12 + 8 + jsonChunkData.length + 8 + binChunkData.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(GLB_VERSION, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunkData.length, 0);
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunkData.length, 0);
  binHeader.writeUInt32LE(CHUNK_BIN, 4);

  return Buffer.concat([header, jsonHeader, jsonChunkData, binHeader, binChunkData]);
}
