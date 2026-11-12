// Deterministic, spec-strict glTF 2.0 Binary (.glb) builder & hierarchy calibrator
import {
  cleanFloat, quatNormalize, mat4Identity, mat4FromTRS, mat4Mul, mat4TransformPoint,
} from './math.mjs';

function padBuffer(buf, padByte = 0x00) {
  const rem = buf.length % 4;
  if (rem === 0) return buf;
  const pad = Buffer.alloc(4 - rem, padByte);
  return Buffer.concat([buf, pad]);
}

function typedArrayToBuffer(arr) {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

function computeMinMax(typedArr, components) {
  const min = new Array(components).fill(Infinity);
  const max = new Array(components).fill(-Infinity);
  const count = typedArr.length / components;
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < components; c++) {
      const v = typedArr[i * components + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return {
    min: min.map((v) => cleanFloat(v)),
    max: max.map((v) => cleanFloat(v)),
  };
}

export class SceneAssetBuilder {
  constructor(assetName, materialLib) {
    this.assetName = assetName;
    this.materialLib = materialLib;
    this.nodes = [];
    this.nodeByName = new Map();
    this.animations = [];

    // Root node at index 0 with strict identity TRS
    this.rootIndex = this.addNode({
      name: `${assetName}_root`,
      parent: null,
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    });
  }

  addNode({
    name,
    parent = 0,
    translation = [0, 0, 0],
    rotation = [0, 0, 0, 1],
    scale = [1, 1, 1],
    part = null,
    creaseAngle = 34,
  }) {
    if (this.nodeByName.has(name)) {
      throw new Error(`Duplicate node name: ${name}`);
    }
    const idx = this.nodes.length;
    const node = {
      index: idx,
      name,
      parent,
      children: [],
      translation: [...translation],
      rotation: quatNormalize(rotation),
      scale: [...scale],
      part,
      creaseAngle,
      primitives: null,
    };
    this.nodes.push(node);
    this.nodeByName.set(name, idx);
    if (parent !== null && parent !== undefined) {
      this.nodes[parent].children.push(idx);
    }
    return idx;
  }

  /**
   * Add an animation clip:
   * tracks: Array<{
   *   node: number | string,
   *   path: 'translation' | 'rotation' | 'scale',
   *   times: number[],
   *   values: Array<number[]>,
   *   interpolation?: 'LINEAR' | 'STEP'
   * }>
   */
  addAnimation(name, tracks) {
    this.animations.push({ name, tracks });
  }

  _compileNodePrimitives() {
    for (const n of this.nodes) {
      if (n.part) {
        n.primitives = n.part.buildPrimitives(n.creaseAngle);
      } else {
        n.primitives = null;
      }
    }
  }

  _computeWorldMatrices() {
    const world = new Array(this.nodes.length);
    const visit = (idx, parentMat) => {
      const n = this.nodes[idx];
      const local = mat4FromTRS(n.translation, n.rotation, n.scale);
      const w = mat4Mul(parentMat, local);
      world[idx] = w;
      for (const ch of n.children) visit(ch, w);
    };
    visit(this.rootIndex, mat4Identity());
    return world;
  }

  _measureWorldBounds() {
    const world = this._computeWorldMatrices();
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let maxR = 0;
    let triCount = 0;

    for (const n of this.nodes) {
      if (!n.primitives) continue;
      const m = world[n.index];
      for (const prim of n.primitives) {
        triCount += prim.indices.length / 3;
        const pos = prim.positions;
        for (let i = 0; i < pos.length; i += 3) {
          const wp = mat4TransformPoint(m, [pos[i], pos[i + 1], pos[i + 2]]);
          if (wp[0] < minX) minX = wp[0];
          if (wp[1] < minY) minY = wp[1];
          if (wp[2] < minZ) minZ = wp[2];
          if (wp[0] > maxX) maxX = wp[0];
          if (wp[1] > maxY) maxY = wp[1];
          if (wp[2] > maxZ) maxZ = wp[2];
          const r = Math.hypot(wp[0], wp[2]);
          if (r > maxR) maxR = r;
        }
      }
    }

    return { minX, minY, minZ, maxX, maxY, maxZ, xzRadius: maxR, triCount };
  }

  /**
   * Calibrate geometry, hierarchy translations, and animation translations
   * so rest-pose world xzRadius === targetXZRadius and minY === 0.000000
   * while keeping root node strictly at identity TRS.
   */
  calibrateBounds(targetXZRadius, targetMinY = 0) {
    // Compile once to measure exact Float32 geometry bounds
    this._compileNodePrimitives();
    const initial = this._measureWorldBounds();
    if (initial.xzRadius <= 1e-6) {
      throw new Error(`${this.assetName}: empty or zero-radius geometry`);
    }

    const scaleFactor = targetXZRadius / initial.xzRadius;

    // 1. Uniformly scale all part geometry, node translations (except root), and translation keyframes
    for (const n of this.nodes) {
      if (n.index !== this.rootIndex) {
        n.translation = n.translation.map((v) => v * scaleFactor);
      }
      if (n.part) {
        for (const tris of n.part.byMat.values()) {
          for (const t of tris) {
            for (let k = 0; k < 3; k++) {
              t.p[k][0] *= scaleFactor;
              t.p[k][1] *= scaleFactor;
              t.p[k][2] *= scaleFactor;
            }
          }
        }
      }
    }

    for (const anim of this.animations) {
      for (const tr of anim.tracks) {
        if (tr.path === 'translation') {
          tr.values = tr.values.map((v) => [
            v[0] * scaleFactor,
            v[1] * scaleFactor,
            v[2] * scaleFactor,
          ]);
        }
      }
    }

    // Re-compile primitives after uniform scale and measure exact Float32 minY
    this._compileNodePrimitives();
    const scaled = this._measureWorldBounds();
    const dy = targetMinY - scaled.minY;

    // 2. Shift direct children of root by dy (and any translation tracks targeting direct children of root)
    const rootChildren = new Set(this.nodes[this.rootIndex].children);
    for (const childIdx of rootChildren) {
      this.nodes[childIdx].translation[1] = cleanFloat(Math.fround(this.nodes[childIdx].translation[1] + dy));
    }
    for (const anim of this.animations) {
      for (const tr of anim.tracks) {
        const nodeIdx = typeof tr.node === 'string' ? this.nodeByName.get(tr.node) : tr.node;
        if (tr.path === 'translation' && rootChildren.has(nodeIdx)) {
          tr.values = tr.values.map((v) => [v[0], v[1] + dy, v[2]]);
        }
      }
    }

    // Final micro-pass in Float32 so minY is 0.0 within 1e-6
    const finalBounds = this._measureWorldBounds();
    if (Math.abs(finalBounds.minY - targetMinY) > 1e-6) {
      const residualDy = targetMinY - finalBounds.minY;
      for (const childIdx of rootChildren) {
        this.nodes[childIdx].translation[1] = cleanFloat(Math.fround(this.nodes[childIdx].translation[1] + residualDy));
      }
      for (const anim of this.animations) {
        for (const tr of anim.tracks) {
          const nodeIdx = typeof tr.node === 'string' ? this.nodeByName.get(tr.node) : tr.node;
          if (tr.path === 'translation' && rootChildren.has(nodeIdx)) {
            tr.values = tr.values.map((v) => [v[0], v[1] + residualDy, v[2]]);
          }
        }
      }
    }

    return this._measureWorldBounds();
  }

  toGLB() {
    if (!this.nodes.some((n) => n.primitives)) {
      this._compileNodePrimitives();
    }

    const binChunks = [];
    let byteCursor = 0;
    const bufferViews = [];
    const accessors = [];

    const appendBufferView = (rawBuf, target = undefined) => {
      const padded = padBuffer(rawBuf, 0x00);
      const bv = {
        buffer: 0,
        byteOffset: byteCursor,
        byteLength: rawBuf.length,
      };
      if (target !== undefined) bv.target = target;
      const idx = bufferViews.length;
      bufferViews.push(bv);
      binChunks.push(padded);
      byteCursor += padded.length;
      return idx;
    };

    const appendAccessor = (typedArr, componentType, type, components, target) => {
      const bvIdx = appendBufferView(typedArrayToBuffer(typedArr), target);
      const { min, max } = computeMinMax(typedArr, components);
      const accIdx = accessors.length;
      accessors.push({
        bufferView: bvIdx,
        byteOffset: 0,
        componentType,
        count: typedArr.length / components,
        type,
        min,
        max,
      });
      return accIdx;
    };

    // 1. Embedded procedural textures & sampler
    const images = [];
    const textures = [];
    const samplers = [];
    if (this.materialLib.textures && this.materialLib.textures.length > 0) {
      samplers.push({
        magFilter: 9729, // LINEAR
        minFilter: 9987, // LINEAR_MIPMAP_LINEAR
        wrapS: 10497,    // REPEAT
        wrapT: 10497,    // REPEAT
      });
      for (const tex of this.materialLib.textures) {
        const bvIdx = appendBufferView(tex.bytes, undefined);
        const imgIdx = images.length;
        images.push({
          name: tex.name,
          mimeType: tex.mimeType,
          bufferView: bvIdx,
        });
        textures.push({
          name: tex.name,
          sampler: 0,
          source: imgIdx,
        });
      }
    }

    // 2. Meshes & Nodes
    const meshes = [];
    const gltfNodes = [];

    for (const n of this.nodes) {
      let meshIdx = undefined;
      if (n.primitives && n.primitives.length > 0) {
        const gltfPrims = [];
        for (const prim of n.primitives) {
          const posAcc = appendAccessor(prim.positions, 5126, 'VEC3', 3, 34962);
          const normAcc = appendAccessor(prim.normals, 5126, 'VEC3', 3, 34962);
          const uvAcc = appendAccessor(prim.uvs, 5126, 'VEC2', 2, 34962);
          const idxComponentType = prim.indices instanceof Uint32Array ? 5125 : 5123;
          const idxAcc = appendAccessor(prim.indices, idxComponentType, 'SCALAR', 1, 34963);

          gltfPrims.push({
            attributes: {
              POSITION: posAcc,
              NORMAL: normAcc,
              TEXCOORD_0: uvAcc,
            },
            indices: idxAcc,
            material: prim.material,
            mode: 4, // TRIANGLES
          });
        }
        meshIdx = meshes.length;
        meshes.push({
          name: `${n.name}_mesh`,
          primitives: gltfPrims,
        });
      }

      const gn = {
        name: n.name,
        translation: n.translation.map((v) => cleanFloat(Math.fround(v))),
        rotation: quatNormalize(n.rotation).map((v) => cleanFloat(Math.fround(v))),
        scale: n.scale.map((v) => cleanFloat(Math.fround(v))),
      };
      if (n.children.length > 0) gn.children = [...n.children];
      if (meshIdx !== undefined) gn.mesh = meshIdx;
      gltfNodes.push(gn);
    }

    // 3. Animations
    const gltfAnimations = [];
    for (const anim of this.animations) {
      const samplersAnim = [];
      const channels = [];

      for (const tr of anim.tracks) {
        const nodeIdx = typeof tr.node === 'string' ? this.nodeByName.get(tr.node) : tr.node;
        if (nodeIdx === undefined) {
          throw new Error(`Animation '${anim.name}' targets unknown node '${tr.node}'`);
        }

        const timesArr = new Float32Array(tr.times.map((t) => cleanFloat(Math.fround(t))));
        const inputAcc = appendAccessor(timesArr, 5126, 'SCALAR', 1, undefined);

        let outputAcc;
        if (tr.path === 'rotation') {
          const flat = new Float32Array(tr.values.length * 4);
          for (let i = 0; i < tr.values.length; i++) {
            const q = quatNormalize(tr.values[i]);
            flat[i * 4 + 0] = cleanFloat(Math.fround(q[0]));
            flat[i * 4 + 1] = cleanFloat(Math.fround(q[1]));
            flat[i * 4 + 2] = cleanFloat(Math.fround(q[2]));
            flat[i * 4 + 3] = cleanFloat(Math.fround(q[3]));
          }
          outputAcc = appendAccessor(flat, 5126, 'VEC4', 4, undefined);
        } else {
          const flat = new Float32Array(tr.values.length * 3);
          for (let i = 0; i < tr.values.length; i++) {
            const v = tr.values[i];
            flat[i * 3 + 0] = cleanFloat(Math.fround(v[0]));
            flat[i * 3 + 1] = cleanFloat(Math.fround(v[1]));
            flat[i * 3 + 2] = cleanFloat(Math.fround(v[2]));
          }
          outputAcc = appendAccessor(flat, 5126, 'VEC3', 3, undefined);
        }

        const sampIdx = samplersAnim.length;
        samplersAnim.push({
          input: inputAcc,
          interpolation: tr.interpolation || 'LINEAR',
          output: outputAcc,
        });

        channels.push({
          sampler: sampIdx,
          target: {
            node: nodeIdx,
            path: tr.path,
          },
        });
      }

      gltfAnimations.push({
        name: anim.name,
        channels,
        samplers: samplersAnim,
      });
    }

    const binBuffer = padBuffer(Buffer.concat(binChunks), 0x00);

    const gltfJson = {
      asset: {
        version: '2.0',
        generator: 'StarfallConcord-DeterministicBuilder/1.0',
      },
      scene: 0,
      scenes: [
        {
          name: this.assetName,
          nodes: [this.rootIndex],
        },
      ],
      nodes: gltfNodes,
      meshes,
      materials: this.materialLib.materials,
      textures,
      images,
      samplers,
      accessors,
      bufferViews,
      buffers: [
        {
          byteLength: binBuffer.length,
        },
      ],
      animations: gltfAnimations,
    };

    if (textures.length === 0) {
      delete gltfJson.textures;
      delete gltfJson.images;
      delete gltfJson.samplers;
    }

    const jsonBytes = Buffer.from(JSON.stringify(gltfJson), 'utf8');
    const jsonPadded = padBuffer(jsonBytes, 0x20); // 0x20 ASCII space padding per glTF 2.0 spec

    const totalByteLength = 12 + 8 + jsonPadded.length + 8 + binBuffer.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); // 'glTF'
    header.writeUInt32LE(2, 4);          // version 2
    header.writeUInt32LE(totalByteLength, 8);

    const jsonChunkHeader = Buffer.alloc(8);
    jsonChunkHeader.writeUInt32LE(jsonPadded.length, 0);
    jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

    const binChunkHeader = Buffer.alloc(8);
    binChunkHeader.writeUInt32LE(binBuffer.length, 0);
    binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

    return Buffer.concat([
      header,
      jsonChunkHeader,
      jsonPadded,
      binChunkHeader,
      binBuffer,
    ]);
  }
}
