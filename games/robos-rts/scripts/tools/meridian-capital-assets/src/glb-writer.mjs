// Deterministic Khronos glTF 2.0 Binary (.glb) serializer.
// Zero external dependencies; byte-for-byte repeatable output.

import { MERIDIAN_MATERIALS } from './materials.mjs';
import { alignQuatTrack, quatNormalize } from './math.mjs';
import { calibrateSceneToRadius, computeSceneBounds, mergePrimsByMaterial } from './geom.mjs';

function roundClean(v) {
  const f = Math.fround(v);
  return Object.is(f, -0) ? 0 : Number(f.toPrecision(8));
}

function padBuffer4(buf, padByte = 0x00) {
  const rem = buf.length % 4;
  if (rem === 0) return buf;
  const pad = Buffer.alloc(4 - rem, padByte);
  return Buffer.concat([buf, pad]);
}

export class SceneBuilder {
  constructor({ unitId, radius, materials = MERIDIAN_MATERIALS }) {
    this.unitId = unitId;
    this.radius = radius;
    this.materials = materials;
    this.nodes = [];
    this.rootIndices = [];
    this.nodeByName = new Map();
    this.animations = [];
  }

  addNode({
    name,
    parent = null,
    translation = [0, 0, 0],
    rotation = [0, 0, 0, 1],
    scale = [1, 1, 1],
    meshName = null,
    prims = null,
    mergeByMaterial = true,
    extras = null,
  }) {
    if (this.nodeByName.has(name)) {
      throw new Error(`Duplicate node name "${name}" in ${this.unitId}`);
    }
    const idx = this.nodes.length;
    const finalPrims = prims ? (mergeByMaterial ? mergePrimsByMaterial(prims) : prims) : null;
    const node = {
      name,
      translation: [translation[0], translation[1], translation[2]],
      rotation: quatNormalize(rotation),
      scale: [scale[0], scale[1], scale[2]],
      meshName: meshName || (finalPrims && finalPrims.length > 0 ? name : null),
      prims: finalPrims && finalPrims.length > 0 ? finalPrims : null,
      children: [],
      extras,
    };
    this.nodes.push(node);
    this.nodeByName.set(name, idx);

    if (parent === null || parent === undefined) {
      this.rootIndices.push(idx);
    } else {
      const pIdx = typeof parent === 'number' ? parent : this.getNodeIndex(parent);
      this.nodes[pIdx].children.push(idx);
    }
    return idx;
  }

  getNodeIndex(nameOrIdx) {
    if (typeof nameOrIdx === 'number') return nameOrIdx;
    const idx = this.nodeByName.get(nameOrIdx);
    if (idx === undefined) {
      throw new Error(`Unknown node "${nameOrIdx}" in ${this.unitId}`);
    }
    return idx;
  }

  getNode(nameOrIdx) {
    return this.nodes[this.getNodeIndex(nameOrIdx)];
  }

  calibrate(fillFactor = 0.992) {
    return calibrateSceneToRadius(this.nodes, this.rootIndices, this.radius, fillFactor);
  }

  getBounds() {
    return computeSceneBounds(this.nodes, this.rootIndices);
  }

  addAnimation(name, tracks) {
    this.animations.push({ name, tracks });
  }

  toGLB() {
    const binParts = [];
    let byteOffset = 0;

    const bufferViews = [];
    const accessors = [];
    const meshes = [];

    const pushBufferView = (rawBuf, target = undefined) => {
      const aligned = padBuffer4(rawBuf, 0x00);
      const bv = {
        buffer: 0,
        byteOffset,
        byteLength: rawBuf.length,
      };
      if (target !== undefined) bv.target = target;
      const bvIdx = bufferViews.length;
      bufferViews.push(bv);
      binParts.push(aligned);
      byteOffset += aligned.length;
      return bvIdx;
    };

    const pushFloatAccessor = (floatArray, type, numComps, target = undefined, withMinMax = false) => {
      const f32 = new Float32Array(floatArray.length);
      for (let i = 0; i < floatArray.length; i++) {
        const v = Math.fround(floatArray[i]);
        f32[i] = Object.is(v, -0) ? 0 : v;
      }
      const raw = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
      const bvIdx = pushBufferView(raw, target);
      const count = f32.length / numComps;
      const acc = {
        bufferView: bvIdx,
        componentType: 5126, // FLOAT
        count,
        type,
      };
      if (withMinMax && count > 0) {
        const mins = new Array(numComps).fill(Infinity);
        const maxs = new Array(numComps).fill(-Infinity);
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < numComps; c++) {
            const val = f32[i * numComps + c];
            if (val < mins[c]) mins[c] = val;
            if (val > maxs[c]) maxs[c] = val;
          }
        }
        acc.min = mins.map(roundClean);
        acc.max = maxs.map(roundClean);
      }
      const accIdx = accessors.length;
      accessors.push(acc);
      return accIdx;
    };

    const pushIndexAccessor = (indices, vertexCount) => {
      const useU32 = vertexCount > 65535;
      const typed = useU32 ? new Uint32Array(indices) : new Uint16Array(indices);
      const raw = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
      const bvIdx = pushBufferView(raw, 34963); // ELEMENT_ARRAY_BUFFER
      let minIdx = Infinity, maxIdx = -Infinity;
      for (let i = 0; i < typed.length; i++) {
        if (typed[i] < minIdx) minIdx = typed[i];
        if (typed[i] > maxIdx) maxIdx = typed[i];
      }
      const accIdx = accessors.length;
      accessors.push({
        bufferView: bvIdx,
        componentType: useU32 ? 5125 : 5123,
        count: typed.length,
        type: 'SCALAR',
        min: [minIdx],
        max: [maxIdx],
      });
      return accIdx;
    };

    // Build glTF nodes & meshes
    const gltfNodes = this.nodes.map((n) => {
      const gn = { name: n.name };
      const [tx, ty, tz] = n.translation;
      if (Math.hypot(tx, ty, tz) > 1e-7) {
        gn.translation = [roundClean(tx), roundClean(ty), roundClean(tz)];
      }
      const q = quatNormalize(n.rotation);
      if (Math.hypot(q[0], q[1], q[2], q[3] - 1) > 1e-7) {
        gn.rotation = q.map(roundClean);
      }
      const [sx, sy, sz] = n.scale;
      if (Math.hypot(sx - 1, sy - 1, sz - 1) > 1e-7) {
        gn.scale = [roundClean(sx), roundClean(sy), roundClean(sz)];
      }
      if (n.children.length > 0) {
        gn.children = n.children.slice();
      }
      if (n.extras) {
        gn.extras = n.extras;
      }
      if (n.prims && n.prims.length > 0) {
        const gltfPrims = n.prims.map((prim) => {
          const posAcc = pushFloatAccessor(prim.positions, 'VEC3', 3, 34962, true);
          const nrmAcc = pushFloatAccessor(prim.normals, 'VEC3', 3, 34962, false);
          const idxAcc = pushIndexAccessor(prim.indices, prim.vertexCount);
          return {
            attributes: {
              POSITION: posAcc,
              NORMAL: nrmAcc,
            },
            indices: idxAcc,
            material: prim.material,
            mode: 4, // TRIANGLES
          };
        });
        const meshIdx = meshes.length;
        meshes.push({
          name: n.meshName || n.name,
          primitives: gltfPrims,
        });
        gn.mesh = meshIdx;
      }
      return gn;
    });

    // Build glTF materials
    const gltfMaterials = this.materials.map((m) => {
      const mat = {
        name: m.name,
        pbrMetallicRoughness: {
          baseColorFactor: m.baseColorFactor,
          metallicFactor: m.metallicFactor,
          roughnessFactor: m.roughnessFactor,
        },
      };
      if (m.emissiveFactor && Math.hypot(...m.emissiveFactor) > 1e-6) {
        mat.emissiveFactor = m.emissiveFactor;
      }
      if (m.doubleSided) {
        mat.doubleSided = true;
      }
      return mat;
    });

    // Build glTF animations
    const gltfAnimations = this.animations.map((anim) => {
      const samplers = [];
      const channels = [];
      for (const tr of anim.tracks) {
        const nodeIdx = this.getNodeIndex(tr.node);
        const times = tr.times;
        if (!times || times.length < 2) {
          throw new Error(`Animation "${anim.name}" track on "${tr.node}.${tr.path}" needs >= 2 keyframes`);
        }
        for (let i = 1; i < times.length; i++) {
          if (!(times[i] > times[i - 1])) {
            throw new Error(`Non-monotonic keyframe time in "${anim.name}" on "${tr.node}.${tr.path}"`);
          }
        }
        const inputAcc = pushFloatAccessor(times, 'SCALAR', 1, undefined, true);
        let flatValues = [];
        let outType = 'VEC3';
        let numComps = 3;
        if (tr.path === 'rotation') {
          outType = 'VEC4';
          numComps = 4;
          const alignedQuats = alignQuatTrack(tr.values);
          for (const q of alignedQuats) {
            flatValues.push(q[0], q[1], q[2], q[3]);
          }
        } else {
          for (const v of tr.values) {
            flatValues.push(v[0], v[1], v[2]);
          }
        }
        const outputAcc = pushFloatAccessor(flatValues, outType, numComps, undefined, false);
        const samplerIdx = samplers.length;
        samplers.push({
          input: inputAcc,
          interpolation: tr.interpolation || 'LINEAR',
          output: outputAcc,
        });
        channels.push({
          sampler: samplerIdx,
          target: {
            node: nodeIdx,
            path: tr.path,
          },
        });
      }
      return {
        name: anim.name,
        samplers,
        channels,
      };
    });

    const binChunkData = padBuffer4(Buffer.concat(binParts), 0x00);

    const gltfJson = {
      asset: {
        version: '2.0',
        generator: 'starfall-meridian-capital-assets/1.0',
      },
      scene: 0,
      scenes: [
        {
          name: this.unitId,
          nodes: this.rootIndices,
          extras: {
            unitId: this.unitId,
            radius: this.radius,
            upAxis: '+Y',
            forwardAxis: '-Z',
            floorY: 0,
          },
        },
      ],
      nodes: gltfNodes,
      meshes,
      materials: gltfMaterials,
      animations: gltfAnimations,
      accessors,
      bufferViews,
      buffers: [
        {
          byteLength: binChunkData.length,
        },
      ],
    };

    const jsonRaw = Buffer.from(JSON.stringify(gltfJson), 'utf8');
    const jsonChunkData = padBuffer4(jsonRaw, 0x20); // space padding per glTF 2.0 spec

    const totalLength = 12 + 8 + jsonChunkData.length + 8 + binChunkData.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); // 'glTF'
    header.writeUInt32LE(2, 4);          // version 2
    header.writeUInt32LE(totalLength, 8);

    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonChunkData.length, 0);
    jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binChunkData.length, 0);
    binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

    return Buffer.concat([header, jsonHeader, jsonChunkData, binHeader, binChunkData]);
  }
}
