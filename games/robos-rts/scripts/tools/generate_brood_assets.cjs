#!/usr/bin/env node
/**
 * Starfall Command — Gnarl Brood Low-Poly GLB Asset Generator
 *
 * Deterministically generates two original glTF 2.0 binary (.glb) assets using
 * only built-in Node.js modules (zero external dependencies):
 *   1. brood_larva.glb — ~0.90 world units long (+X forward, Y=0 ground),
 *      segmented purple-brown alien grub with high-contrast dorsal chitin ridges,
 *      bright Surf_TEAM pads, and named Segment_0..Segment_4 nodes (+ wriggle clip).
 *   2. brood_egg.glb   — ~1.05 world units tall (+X forward, Y=0 ground),
 *      compact asymmetrical chitin cocoon with glowing embryonic lit seam,
 *      bright Surf_TEAM pads, EggBase, and EggShell node (+ pulse clip).
 *
 * Usage:
 *   node generate_brood_assets.js [output_dir]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Math & Color Utilities
// ---------------------------------------------------------------------------

function srgbChannelToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToLinearRGBA(hex, alpha = 1.0) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [
    Number(srgbChannelToLinear(r).toFixed(6)),
    Number(srgbChannelToLinear(g).toFixed(6)),
    Number(srgbChannelToLinear(b).toFixed(6)),
    alpha,
  ];
}

function hexToLinearRGB(hex, boost = 1.0) {
  const [r, g, b] = hexToLinearRGBA(hex, 1.0);
  return [
    Number(Math.min(1.0, r * boost).toFixed(6)),
    Number(Math.min(1.0, g * boost).toFixed(6)),
    Number(Math.min(1.0, b * boost).toFixed(6)),
  ];
}

function vAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vSub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vScale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function vLerp(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function vCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vLen(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function vNorm(a) {
  const l = vLen(a);
  if (l < 1e-9) return [0, 1, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
}

function quatFromEulerXYZ(rxDeg, ryDeg, rzDeg) {
  const rx = (rxDeg * Math.PI) / 360;
  const ry = (ryDeg * Math.PI) / 360;
  const rz = (rzDeg * Math.PI) / 360;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    Number((sx * cy * cz + cx * sy * sz).toFixed(6)),
    Number((cx * sy * cz - sx * cy * sz).toFixed(6)),
    Number((cx * cy * sz + sx * sy * cz).toFixed(6)),
    Number((cx * cy * cz - sx * sy * sz).toFixed(6)),
  ];
}

function rotateVecByEulerXYZ(v, rxDeg, ryDeg, rzDeg) {
  let [x, y, z] = v;
  if (rxDeg !== 0) {
    const r = (rxDeg * Math.PI) / 180;
    const c = Math.cos(r), s = Math.sin(r);
    const ny = y * c - z * s;
    const nz = y * s + z * c;
    y = ny; z = nz;
  }
  if (ryDeg !== 0) {
    const r = (ryDeg * Math.PI) / 180;
    const c = Math.cos(r), s = Math.sin(r);
    const nx = x * c + z * s;
    const nz = -x * s + z * c;
    x = nx; z = nz;
  }
  if (rzDeg !== 0) {
    const r = (rzDeg * Math.PI) / 180;
    const c = Math.cos(r), s = Math.sin(r);
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx; y = ny;
  }
  return [x, y, z];
}

function transformPoint(p, pos = [0, 0, 0], rotDeg = [0, 0, 0], scl = [1, 1, 1]) {
  const scaled = [p[0] * scl[0], p[1] * scl[1], p[2] * scl[2]];
  const rotated = rotateVecByEulerXYZ(scaled, rotDeg[0], rotDeg[1], rotDeg[2]);
  return vAdd(rotated, pos);
}

// ---------------------------------------------------------------------------
// Primitive Mesh Builder (Faceted Low-Poly with Verified Outward Winding)
// ---------------------------------------------------------------------------

class PrimitiveGeom {
  constructor(materialIndex) {
    this.materialIndex = materialIndex;
    this.positions = []; // [x, y, z]
    this.normals = [];   // [nx, ny, nz]
    this.indices = [];   // uint16
  }

  addTri(v0, v1, v2, outwardHint = null) {
    let e1 = vSub(v1, v0);
    let e2 = vSub(v2, v0);
    let cr = vCross(e1, e2);
    const area2 = vLen(cr);
    if (area2 < 1e-10) {
      return; // Skip degenerate triangles cleanly
    }
    let a = v0, b = v1, c = v2;
    if (outwardHint) {
      if (vDot(cr, outwardHint) < 0) {
        b = v2;
        c = v1;
        cr = vScale(cr, -1);
      }
    }
    const n = vNorm(cr);
    const base = this.positions.length;
    this.positions.push(a, b, c);
    this.normals.push(n, n, n);
    this.indices.push(base, base + 1, base + 2);
  }

  addQuad(v0, v1, v2, v3, outwardHint = null) {
    this.addTri(v0, v1, v2, outwardHint);
    this.addTri(v0, v2, v3, outwardHint);
  }

  /**
   * Builds a closed lofted tube/shell from an array of cross-section rings.
   * Each ring is an array of M 3D points ordered around `ringCenter`.
   */
  addLoft(rings, ringCenters, capStart = true, capEnd = true) {
    const R = rings.length;
    const M = rings[0].length;
    for (let r = 0; r < R - 1; r++) {
      const c0 = ringCenters[r];
      const c1 = ringCenters[r + 1];
      const cm = vLerp(c0, c1, 0.5);
      for (let i = 0; i < M; i++) {
        const inext = (i + 1) % M;
        const p00 = rings[r][i];
        const p01 = rings[r][inext];
        const p11 = rings[r + 1][inext];
        const p10 = rings[r + 1][i];
        const quadMid = vScale(vAdd(vAdd(p00, p01), vAdd(p10, p11)), 0.25);
        const outward = vSub(quadMid, cm);
        this.addQuad(p00, p01, p11, p10, outward);
      }
    }
    if (capStart) {
      const cStart = ringCenters[0];
      const axisStart = vSub(ringCenters[0], ringCenters[1]);
      // Use slightly inset center point if ring is non-planar
      let avg = [0, 0, 0];
      for (const p of rings[0]) avg = vAdd(avg, p);
      avg = vScale(avg, 1 / M);
      const hint = vLen(axisStart) > 1e-6 ? axisStart : [-1, 0, 0];
      for (let i = 0; i < M; i++) {
        const inext = (i + 1) % M;
        this.addTri(avg, rings[0][inext], rings[0][i], vAdd(vSub(avg, cStart), hint));
      }
    }
    if (capEnd) {
      const last = R - 1;
      const cEnd = ringCenters[last];
      const axisEnd = vSub(ringCenters[last], ringCenters[last - 1]);
      let avg = [0, 0, 0];
      for (const p of rings[last]) avg = vAdd(avg, p);
      avg = vScale(avg, 1 / M);
      const hint = vLen(axisEnd) > 1e-6 ? axisEnd : [1, 0, 0];
      for (let i = 0; i < M; i++) {
        const inext = (i + 1) % M;
        this.addTri(avg, rings[last][i], rings[last][inext], vAdd(vSub(avg, cEnd), hint));
      }
    }
  }

  /**
   * Builds a tapered/curved horn or tendril along a spine of {pos, rx, ry} control points.
   */
  addTubeAlongSpine(spine, sides = 6, capStart = true, capEnd = true) {
    const rings = [];
    const centers = [];
    for (let s = 0; s < spine.length; s++) {
      const cur = spine[s];
      const prev = spine[Math.max(0, s - 1)];
      const next = spine[Math.min(spine.length - 1, s + 1)];
      const tangent = vNorm(vSub(next.pos, prev.pos));
      let upRef = Math.abs(tangent[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
      const sideVec = vNorm(vCross(tangent, upRef));
      const orthoUp = vNorm(vCross(sideVec, tangent));
      const ring = [];
      for (let i = 0; i < sides; i++) {
        const a = (2 * Math.PI * i) / sides;
        const cs = Math.cos(a) * cur.rx;
        const sn = Math.sin(a) * (cur.ry !== undefined ? cur.ry : cur.rx);
        const pt = vAdd(cur.pos, vAdd(vScale(sideVec, cs), vScale(orthoUp, sn)));
        ring.push(pt);
      }
      rings.push(ring);
      centers.push(cur.pos);
    }
    this.addLoft(rings, centers, capStart, capEnd);
  }

  /**
   * Adds a beveled hexagonal/octagonal organic bio-pad oriented in 3D space.
   */
  addBeveledPad({
    center,
    rotDeg = [0, 0, 0],
    radiusX = 0.08,
    radiusZ = 0.06,
    thickness = 0.028,
    bevel = 0.76,
    sides = 6,
    dome = 0.008,
  }) {
    const botRing = [];
    const topRing = [];
    for (let i = 0; i < sides; i++) {
      const a = (2 * Math.PI * i) / sides + Math.PI / sides;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      botRing.push(transformPoint([cx * radiusX, 0, cz * radiusZ], center, rotDeg));
      topRing.push(
        transformPoint(
          [cx * radiusX * bevel, thickness, cz * radiusZ * bevel],
          center,
          rotDeg
        )
      );
    }
    const cBot = transformPoint([0, 0, 0], center, rotDeg);
    const cTop = transformPoint([0, thickness + dome, 0], center, rotDeg);
    const upDir = rotateVecByEulerXYZ([0, 1, 0], rotDeg[0], rotDeg[1], rotDeg[2]);
    const downDir = vScale(upDir, -1);

    for (let i = 0; i < sides; i++) {
      const inext = (i + 1) % sides;
      const sideMid = vScale(
        vAdd(vAdd(botRing[i], botRing[inext]), vAdd(topRing[i], topRing[inext])),
        0.25
      );
      const outward = vAdd(vSub(sideMid, cBot), vScale(upDir, 0.25));
      this.addQuad(botRing[i], botRing[inext], topRing[inext], topRing[i], outward);
      this.addTri(cTop, topRing[inext], topRing[i], upDir);
      this.addTri(cBot, botRing[i], botRing[inext], downDir);
    }
  }
}

// ---------------------------------------------------------------------------
// glTF 2.0 Scene & GLB Binary Writer
// ---------------------------------------------------------------------------

class GLBSceneBuilder {
  constructor(generatorName = 'Starfall Brood Procedural GLB Generator') {
    this.generatorName = generatorName;
    this.materials = [];
    this.meshes = [];
    this.nodes = [];
    this.rootNodes = [];
    this.animations = [];
  }

  addMaterial({
    name,
    baseColorHex,
    alpha = 1.0,
    metallic = 0.15,
    roughness = 0.55,
    emissiveHex = null,
    emissiveBoost = 1.0,
    doubleSided = false,
  }) {
    const mat = {
      name,
      pbrMetallicRoughness: {
        baseColorFactor: hexToLinearRGBA(baseColorHex, alpha),
        metallicFactor: Number(metallic.toFixed(4)),
        roughnessFactor: Number(roughness.toFixed(4)),
      },
    };
    if (emissiveHex) {
      mat.emissiveFactor = hexToLinearRGB(emissiveHex, emissiveBoost);
    }
    if (doubleSided) {
      mat.doubleSided = true;
    }
    if (alpha < 1.0) {
      mat.alphaMode = 'BLEND';
    }
    this.materials.push(mat);
    return this.materials.length - 1;
  }

  addMesh(name, primitives) {
    const nonEmpty = primitives.filter((p) => p.indices.length > 0);
    this.meshes.push({ name, primitives: nonEmpty });
    return this.meshes.length - 1;
  }

  addNode({
    name,
    meshIndex = null,
    translation = null,
    rotation = null,
    scale = null,
    parentIndex = null,
  }) {
    const node = { name };
    if (meshIndex !== null && meshIndex !== undefined) node.mesh = meshIndex;
    if (translation) node.translation = translation.map((v) => Number(v.toFixed(6)));
    if (rotation) node.rotation = rotation.map((v) => Number(v.toFixed(6)));
    if (scale) node.scale = scale.map((v) => Number(v.toFixed(6)));
    node.children = [];
    const idx = this.nodes.length;
    this.nodes.push(node);
    if (parentIndex === null || parentIndex === undefined) {
      this.rootNodes.push(idx);
    } else {
      this.nodes[parentIndex].children.push(idx);
    }
    return idx;
  }

  addAnimation(name, tracks) {
    // tracks: [{ nodeIndex, path: 'translation'|'rotation'|'scale', times: [...], values: [[...], ...] }]
    this.animations.push({ name, tracks });
  }

  buildGLB(sceneName) {
    const binChunks = [];
    let byteCursor = 0;
    const bufferViews = [];
    const accessors = [];

    const appendAligned = (buf, target = undefined) => {
      const padBefore = (4 - (byteCursor % 4)) % 4;
      if (padBefore > 0) {
        binChunks.push(Buffer.alloc(padBefore, 0));
        byteCursor += padBefore;
      }
      const byteOffset = byteCursor;
      binChunks.push(buf);
      byteCursor += buf.length;
      const padAfter = (4 - (byteCursor % 4)) % 4;
      if (padAfter > 0) {
        binChunks.push(Buffer.alloc(padAfter, 0));
        byteCursor += padAfter;
      }
      const bv = {
        buffer: 0,
        byteOffset,
        byteLength: buf.length,
      };
      if (target !== undefined) bv.target = target;
      bufferViews.push(bv);
      return bufferViews.length - 1;
    };

    const gltfMeshes = this.meshes.map((m) => {
      const gltfPrims = m.primitives.map((prim) => {
        const vCount = prim.positions.length;
        const iCount = prim.indices.length;

        const posBuf = Buffer.alloc(vCount * 12);
        const normBuf = Buffer.alloc(vCount * 12);
        const minPos = [Infinity, Infinity, Infinity];
        const maxPos = [-Infinity, -Infinity, -Infinity];

        for (let i = 0; i < vCount; i++) {
          const p = prim.positions[i];
          const n = prim.normals[i];
          for (let k = 0; k < 3; k++) {
            if (p[k] < minPos[k]) minPos[k] = p[k];
            if (p[k] > maxPos[k]) maxPos[k] = p[k];
          }
          posBuf.writeFloatLE(p[0], i * 12);
          posBuf.writeFloatLE(p[1], i * 12 + 4);
          posBuf.writeFloatLE(p[2], i * 12 + 8);

          normBuf.writeFloatLE(n[0], i * 12);
          normBuf.writeFloatLE(n[1], i * 12 + 4);
          normBuf.writeFloatLE(n[2], i * 12 + 8);
        }

        const idxBuf = Buffer.alloc(iCount * 2);
        for (let i = 0; i < iCount; i++) {
          idxBuf.writeUInt16LE(prim.indices[i], i * 2);
        }

        const posBV = appendAligned(posBuf, 34962);
        const normBV = appendAligned(normBuf, 34962);
        const idxBV = appendAligned(idxBuf, 34963);

        const posAcc = accessors.length;
        accessors.push({
          bufferView: posBV,
          byteOffset: 0,
          componentType: 5126,
          count: vCount,
          type: 'VEC3',
          min: minPos.map((v) => Number(v.toFixed(6))),
          max: maxPos.map((v) => Number(v.toFixed(6))),
        });

        const normAcc = accessors.length;
        accessors.push({
          bufferView: normBV,
          byteOffset: 0,
          componentType: 5126,
          count: vCount,
          type: 'VEC3',
        });

        const idxAcc = accessors.length;
        accessors.push({
          bufferView: idxBV,
          byteOffset: 0,
          componentType: 5123,
          count: iCount,
          type: 'SCALAR',
        });

        return {
          attributes: {
            POSITION: posAcc,
            NORMAL: normAcc,
          },
          indices: idxAcc,
          material: prim.materialIndex,
          mode: 4,
        };
      });

      return {
        name: m.name,
        primitives: gltfPrims,
      };
    });

    const gltfAnimations = this.animations.map((anim) => {
      const samplers = [];
      const channels = [];
      for (const tr of anim.tracks) {
        const count = tr.times.length;
        const timeBuf = Buffer.alloc(count * 4);
        let minT = Infinity;
        let maxT = -Infinity;
        for (let i = 0; i < count; i++) {
          const t = tr.times[i];
          if (t < minT) minT = t;
          if (t > maxT) maxT = t;
          timeBuf.writeFloatLE(t, i * 4);
        }
        const timeBV = appendAligned(timeBuf); // No target for animation keyframes
        const timeAcc = accessors.length;
        accessors.push({
          bufferView: timeBV,
          byteOffset: 0,
          componentType: 5126,
          count,
          type: 'SCALAR',
          min: [Number(minT.toFixed(6))],
          max: [Number(maxT.toFixed(6))],
        });

        const compCount = tr.path === 'rotation' ? 4 : 3;
        const valType = tr.path === 'rotation' ? 'VEC4' : 'VEC3';
        const valBuf = Buffer.alloc(count * compCount * 4);
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < compCount; c++) {
            valBuf.writeFloatLE(tr.values[i][c], (i * compCount + c) * 4);
          }
        }
        const valBV = appendAligned(valBuf);
        const valAcc = accessors.length;
        accessors.push({
          bufferView: valBV,
          byteOffset: 0,
          componentType: 5126,
          count,
          type: valType,
        });

        const samplerIdx = samplers.length;
        samplers.push({
          input: timeAcc,
          output: valAcc,
          interpolation: 'LINEAR',
        });
        channels.push({
          sampler: samplerIdx,
          target: {
            node: tr.nodeIndex,
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

    const cleanNodes = this.nodes.map((n) => {
      const copy = { ...n };
      if (!copy.children || copy.children.length === 0) {
        delete copy.children;
      }
      return copy;
    });

    const binData = Buffer.concat(binChunks);

    const gltf = {
      asset: {
        version: '2.0',
        generator: this.generatorName,
      },
      scene: 0,
      scenes: [
        {
          name: sceneName,
          nodes: this.rootNodes,
        },
      ],
      nodes: cleanNodes,
      meshes: gltfMeshes,
      materials: this.materials,
      accessors,
      bufferViews,
      buffers: [
        {
          byteLength: binData.length,
        },
      ],
    };

    if (gltfAnimations.length > 0) {
      gltf.animations = gltfAnimations;
    }

    let jsonBytes = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
    if (jsonPad > 0) {
      jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]); // pad JSON with spaces
    }

    const totalLength = 12 + 8 + jsonBytes.length + 8 + binData.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); // 'glTF'
    header.writeUInt32LE(2, 4);          // version 2
    header.writeUInt32LE(totalLength, 8);

    const jsonChunkHeader = Buffer.alloc(8);
    jsonChunkHeader.writeUInt32LE(jsonBytes.length, 0);
    jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

    const binChunkHeader = Buffer.alloc(8);
    binChunkHeader.writeUInt32LE(binData.length, 0);
    binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

    return {
      glb: Buffer.concat([header, jsonChunkHeader, jsonBytes, binChunkHeader, binData]),
      gltf,
    };
  }
}

// ---------------------------------------------------------------------------
// Shared Gnarl Brood Palette
// ---------------------------------------------------------------------------

function createBroodMaterials(scene, includeSeamGlow = false) {
  // Surf_TEAM: bright, unmistakable team-color surface/material with subtle self-illumination
  // Default tint matches Starfall Command Gnarl Brood (#e0453a boosted to #f24e42 for zoom clarity)
  const Surf_TEAM = scene.addMaterial({
    name: 'Surf_TEAM',
    baseColorHex: '#f24e42',
    metallic: 0.15,
    roughness: 0.34,
    emissiveHex: '#e0453a',
    emissiveBoost: 0.48,
  });

  // Main purple-brown alien grub/cocoon carapace
  const Mat_ChitinBody = scene.addMaterial({
    name: 'Mat_ChitinBody',
    baseColorHex: '#58394f',
    metallic: 0.20,
    roughness: 0.48,
  });

  // High-contrast lighter dusty-violet/taupe chitin for raised dorsal ridges & husk lips
  const Mat_ChitinRidge = scene.addMaterial({
    name: 'Mat_ChitinRidge',
    baseColorHex: '#9d719f',
    metallic: 0.18,
    roughness: 0.38,
  });

  // Deep dark purple-brown chitin for intersegmental grooves, mandibles, bezels, basal roots
  const Mat_ChitinDark = scene.addMaterial({
    name: 'Mat_ChitinDark',
    baseColorHex: '#281926',
    metallic: 0.25,
    roughness: 0.56,
  });

  // Warm fleshy brown-purple underbelly / soft larval membrane
  const Mat_GrubBelly = scene.addMaterial({
    name: 'Mat_GrubBelly',
    baseColorHex: '#694449',
    metallic: 0.05,
    roughness: 0.72,
  });

  // Bioluminescent brood acid/embryo glow (sensory ocelli on larva, lit seam on egg)
  const Mat_BroodGlow = scene.addMaterial({
    name: includeSeamGlow ? 'Mat_LitSeam' : 'Mat_BroodGlow',
    baseColorHex: '#c4ff4d',
    metallic: 0.0,
    roughness: 0.22,
    emissiveHex: '#a8f028',
    emissiveBoost: 0.95,
  });

  return {
    Surf_TEAM,
    Mat_ChitinBody,
    Mat_ChitinRidge,
    Mat_ChitinDark,
    Mat_GrubBelly,
    Mat_BroodGlow,
  };
}

// ---------------------------------------------------------------------------
// Asset 1: brood_larva.glb
// Short segmented purple-brown alien grub (~0.90 world units long, +X forward, Y=0)
// ---------------------------------------------------------------------------

/**
 * Helper to generate a grub cross-section ring at local X with flattened belly near Y=0
 * and arched dorsal back.
 */
function makeGrubCrossSection(localX, yBottom, yTop, halfWidthZ, sides = 10, pinchBottom = 0.82) {
  const pts = [];
  const midY = (yBottom + yTop) * 0.5;
  const halfH = (yTop - yBottom) * 0.5;
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides;
    const sinA = Math.sin(a); // +1 top, -1 bottom
    const cosA = Math.cos(a); // +1 +Z, -1 -Z
    let y;
    let zScale = 1.0;
    if (sinA < 0) {
      // Flatten ventral belly toward yBottom so grub sits naturally on Y=0
      const flatS = Math.pow(Math.abs(sinA), 0.62);
      y = midY - flatS * halfH;
      zScale = 1.0 - (1.0 - pinchBottom) * Math.abs(sinA);
    } else {
      y = midY + sinA * halfH;
      // Slightly broader shoulder around 25-45 deg for chunky grub read
      zScale = 1.0 + 0.08 * Math.sin(sinA * Math.PI);
    }
    pts.push([localX, Math.max(0.0, y), cosA * halfWidthZ * zScale]);
  }
  return {
    ring: pts,
    center: [localX, midY, 0],
  };
}

/**
 * Adds a bold raised transverse chitin ridge crest over the dorsal/pleural arc of a segment.
 */
function addTransverseRidge(geom, {
  xBack,
  xPeak,
  xFront,
  yBellyEdge,
  yBodyTop,
  ridgeHeight,
  halfWidthBody,
  ridgeFlareZ,
  keelSpike = 0.025,
}) {
  // Angular profile from -Z flank (-150 deg) over top (90 deg) to +Z flank (+30 deg -> mapped via theta in [-0.22*PI, 1.22*PI])
  const arcSteps = 8;
  const profiles = [
    // Back bevel tucked onto body
    { x: xBack, h: 0.004, flare: 0.004, keel: 0.0 },
    // Swept-back sharp dorsal ridge crest
    { x: xPeak, h: ridgeHeight, flare: ridgeFlareZ, keel: keelSpike },
    // Forward slope of armored tergite plate
    { x: (xPeak + xFront) * 0.52, h: ridgeHeight * 0.72, flare: ridgeFlareZ * 0.78, keel: keelSpike * 0.35 },
    // Front edge meeting body
    { x: xFront, h: 0.004, flare: 0.004, keel: 0.0 },
  ];

  const rings = [];
  const centers = [];
  for (const pf of profiles) {
    const ring = [];
    // Loop closed cross-section: outer arc (left -> top -> right) + inner chord under body surface
    for (let i = 0; i <= arcSteps; i++) {
      const u = i / arcSteps; // 0 = -Z lower flank, 0.5 = top (+Y), 1 = +Z lower flank
      const ang = -0.14 * Math.PI + u * 1.28 * Math.PI; // -25 deg to +205 deg
      const zDir = Math.cos(ang); // +1 on +Z, -1 on -Z
      const yDir = Math.sin(ang); // +1 at top
      const crownFocus = Math.pow(Math.max(0, yDir), 1.6);
      const lateralFlange = Math.pow(Math.abs(zDir), 1.2) * Math.max(0, yDir + 0.25);
      const centerTooth = Math.abs(u - 0.5) < 0.01 ? pf.keel : 0.0;

      const z = zDir * (halfWidthBody + pf.flare * (0.65 + 0.35 * lateralFlange));
      const yBase = yBellyEdge + Math.max(0, yDir) * (yBodyTop - yBellyEdge);
      const y = Math.max(0.02, yBase + pf.h * (0.45 + 0.55 * crownFocus) + centerTooth);
      ring.push([pf.x, y, z]);
    }
    // Two underside return points tucked cleanly inside the segment body so the ridge is 100% closed manifold
    ring.push([pf.x, yBellyEdge + 0.04, -halfWidthBody * 0.68]);
    ring.push([pf.x, yBellyEdge + 0.04, halfWidthBody * 0.68]);
    // Reorder so loop goes around consistently: outer arc went +Z (u=0) -> top (u=0.5) -> -Z (u=1.0),
    // so after -Z (u=1.0) goes -halfWidthBody*0.68 -> +halfWidthBody*0.68 -> back to +Z (u=0)!
    rings.push(ring);
    centers.push([pf.x, (yBellyEdge + yBodyTop) * 0.52, 0]);
  }
  geom.addLoft(rings, centers, true, true);
}

function buildBroodLarvaGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createBroodMaterials(scene, false);

  const rootIdx = scene.addNode({
    name: 'BroodLarva',
    translation: [0, 0, 0],
  });

  // 5 named segments along X (total world X from -0.450 to +0.450 = 0.900 world units)
  const segSpecs = [
    {
      name: 'Segment_0',
      pivotX: 0.285,
      xMin: 0.185,
      xMax: 0.375,
      yBot: 0.008,
      yTop: 0.245,
      halfZ: 0.158,
      ridgeH: 0.048,
      ridgeFlare: 0.032,
      keel: 0.018,
      proleg: false,
      teamPads: null,
      isHead: true,
      isTail: false,
    },
    {
      name: 'Segment_1',
      pivotX: 0.125,
      xMin: 0.025,
      xMax: 0.215,
      yBot: 0.000,
      yTop: 0.312,
      halfZ: 0.205,
      ridgeH: 0.058,
      ridgeFlare: 0.042,
      keel: 0.024,
      proleg: true,
      teamPads: {
        flankY: 0.235,
        flankZ: 0.175,
        rx: 0.064,
        rz: 0.052,
        tiltDeg: 40,
        dorsal: false,
      },
      isHead: false,
      isTail: false,
    },
    {
      name: 'Segment_2',
      pivotX: -0.035,
      xMin: -0.135,
      xMax: 0.055,
      yBot: 0.000,
      yTop: 0.332,
      halfZ: 0.218,
      ridgeH: 0.064,
      ridgeFlare: 0.046,
      keel: 0.028,
      proleg: true,
      teamPads: {
        flankY: 0.252,
        flankZ: 0.186,
        rx: 0.070,
        rz: 0.056,
        tiltDeg: 38,
        dorsal: true, // Extra central crown pad for pure overhead zoom clarity
      },
      isHead: false,
      isTail: false,
    },
    {
      name: 'Segment_3',
      pivotX: -0.190,
      xMin: -0.280,
      xMax: -0.105,
      yBot: 0.000,
      yTop: 0.288,
      halfZ: 0.186,
      ridgeH: 0.054,
      ridgeFlare: 0.038,
      keel: 0.022,
      proleg: true,
      teamPads: {
        flankY: 0.215,
        flankZ: 0.156,
        rx: 0.058,
        rz: 0.046,
        tiltDeg: 40,
        dorsal: false,
      },
      isHead: false,
      isTail: false,
    },
    {
      name: 'Segment_4',
      pivotX: -0.325,
      xMin: -0.395,
      xMax: -0.250,
      yBot: 0.004,
      yTop: 0.222,
      halfZ: 0.142,
      ridgeH: 0.046,
      ridgeFlare: 0.030,
      keel: 0.020,
      proleg: false,
      teamPads: null,
      isHead: false,
      isTail: true,
    },
  ];

  const segNodeIndices = [];

  for (let sIdx = 0; sIdx < segSpecs.length; sIdx++) {
    const spec = segSpecs[sIdx];
    const px = spec.pivotX;
    const lxMin = spec.xMin - px;
    const lxMax = spec.xMax - px;
    const span = lxMax - lxMin;

    const gBody = new PrimitiveGeom(mats.Mat_ChitinBody);
    const gRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
    const gDark = new PrimitiveGeom(mats.Mat_ChitinDark);
    const gBelly = new PrimitiveGeom(mats.Mat_GrubBelly);
    const gGlow = new PrimitiveGeom(mats.Mat_BroodGlow);

    // 1. Constricted dark intersegmental groove collar at rear & front + plump purple-brown segment core
    const rearGroove = makeGrubCrossSection(lxMin, spec.yBot + 0.018, spec.yTop * 0.74, spec.halfZ * 0.73, 10);
    const rearShoulder = makeGrubCrossSection(lxMin + span * 0.18, spec.yBot + 0.004, spec.yTop * 0.94, spec.halfZ * 0.95, 10);
    const midFull = makeGrubCrossSection(
      lxMin + span * 0.50,
      spec.yBot,
      spec.yTop,
      spec.halfZ,
      10
    );
    const frontShoulder = makeGrubCrossSection(
      lxMin + span * 0.82,
      spec.isHead ? spec.yBot + 0.016 : spec.yBot + 0.004,
      spec.isHead ? spec.yTop * 0.78 : spec.yTop * 0.93,
      spec.isHead ? spec.halfZ * 0.76 : spec.halfZ * 0.94,
      10
    );
    const frontGroove = makeGrubCrossSection(
      lxMax,
      spec.isHead ? spec.yBot + 0.032 : spec.yBot + 0.018,
      spec.isHead ? spec.yTop * 0.52 : spec.yTop * 0.74,
      spec.isHead ? spec.halfZ * 0.48 : spec.halfZ * 0.73,
      10
    );

    if (spec.isTail) {
      // Taper rear of tail segment cleanly
      const tailEnd = makeGrubCrossSection(lxMin, 0.025, spec.yTop * 0.48, spec.halfZ * 0.46, 10);
      gBody.addLoft(
        [tailEnd.ring, rearShoulder.ring, midFull.ring, frontShoulder.ring],
        [tailEnd.center, rearShoulder.center, midFull.center, frontShoulder.center],
        true,
        false
      );
      gDark.addLoft(
        [frontShoulder.ring, frontGroove.ring],
        [frontShoulder.center, frontGroove.center],
        false,
        true
      );
    } else if (spec.isHead) {
      gDark.addLoft(
        [rearGroove.ring, rearShoulder.ring],
        [rearGroove.center, rearShoulder.center],
        true,
        false
      );
      gBody.addLoft(
        [rearShoulder.ring, midFull.ring, frontShoulder.ring, frontGroove.ring],
        [rearShoulder.center, midFull.center, frontShoulder.center, frontGroove.center],
        false,
        true
      );
    } else {
      // Deep dark intersegmental rings on both sides so every segment division reads crisply!
      gDark.addLoft(
        [rearGroove.ring, rearShoulder.ring],
        [rearGroove.center, rearShoulder.center],
        true,
        false
      );
      gBody.addLoft(
        [rearShoulder.ring, midFull.ring, frontShoulder.ring],
        [rearShoulder.center, midFull.center, frontShoulder.center],
        false,
        false
      );
      gDark.addLoft(
        [frontShoulder.ring, frontGroove.ring],
        [frontShoulder.center, frontGroove.center],
        false,
        true
      );
    }

    // 2. Soft fleshy ventral pleura / prolegs touching Y = 0.000
    if (spec.proleg) {
      for (const side of [-1, 1]) {
        // Fleshy lateral creeping cushion resting right at Y=0.000
        const zLeg = side * (spec.halfZ * 0.74);
        const legSpine = [
          { pos: [0.0, 0.095, zLeg * 0.82], rx: 0.044, ry: 0.038 },
          { pos: [0.008, 0.036, zLeg * 1.02], rx: 0.038, ry: 0.032 },
          { pos: [0.015, 0.000, zLeg * 1.06], rx: 0.030, ry: 0.025 },
        ];
        gBelly.addTubeAlongSpine(legSpine, 6, true, true);
      }
    }

    // 3. Visibly distinct raised dorsal chitin ridge crest
    addTransverseRidge(gRidge, {
      xBack: lxMin + span * 0.20,
      xPeak: lxMin + span * 0.44,
      xFront: lxMin + span * 0.76,
      yBellyEdge: 0.09,
      yBodyTop: spec.yTop,
      ridgeHeight: spec.ridgeH,
      halfWidthBody: spec.halfZ * 0.94,
      ridgeFlareZ: spec.ridgeFlare,
      keelSpike: spec.keel,
    });

    // 4. Head mandibles & sensory ocelli (+X forward) -> exact tip at world X = +0.450
    if (spec.isHead) {
      for (const side of [-1, 1]) {
        const mandSpine = [
          { pos: [0.340 - px, 0.095, side * 0.092], rx: 0.034, ry: 0.028 },
          { pos: [0.402 - px, 0.078, side * 0.082], rx: 0.024, ry: 0.019 },
          { pos: [0.450 - px, 0.064, side * 0.030], rx: 0.007, ry: 0.006 },
        ];
        gDark.addTubeAlongSpine(mandSpine, 5, true, true);

        // Smaller lower sensory palp
        const palpSpine = [
          { pos: [0.335 - px, 0.048, side * 0.056], rx: 0.016, ry: 0.014 },
          { pos: [0.388 - px, 0.028, side * 0.045], rx: 0.007, ry: 0.006 },
        ];
        gBelly.addTubeAlongSpine(palpSpine, 5, true, true);

        // Glowing brood ocellus eyespot
        gGlow.addBeveledPad({
          center: [0.338 - px, 0.168, side * 0.102],
          rotDeg: [side * 46, -side * 28, -32],
          radiusX: 0.024,
          radiusZ: 0.020,
          thickness: 0.014,
          sides: 5,
        });
      }
    }

    // 5. Tail twin upturned cerci / horns (-X rear) -> exact tip at world X = -0.450
    if (spec.isTail) {
      for (const side of [-1, 1]) {
        const cerciSpine = [
          { pos: [-0.365 - px, 0.105, side * 0.062], rx: 0.028, ry: 0.024 },
          { pos: [-0.415 - px, 0.142, side * 0.082], rx: 0.018, ry: 0.016 },
          { pos: [-0.450 - px, 0.182, side * 0.074], rx: 0.006, ry: 0.006 },
        ];
        gDark.addTubeAlongSpine(cerciSpine, 5, true, true);
      }
    }

    // Dark chitin bezels beneath team-color pads (for crisp contrast against any player color)
    if (spec.teamPads) {
      const tp = spec.teamPads;
      const xPad = lxMin + span * 0.62;
      for (const side of [-1, 1]) {
        gDark.addBeveledPad({
          center: [xPad, tp.flankY - 0.004, side * (tp.flankZ - 0.005)],
          rotDeg: [side * tp.tiltDeg, -side * 8, 0],
          radiusX: tp.rx * 1.18,
          radiusZ: tp.rz * 1.18,
          thickness: 0.018,
          sides: 6,
        });
      }
      if (tp.dorsal) {
        gDark.addBeveledPad({
          center: [lxMin + span * 0.72, spec.yTop + 0.006, 0],
          rotDeg: [0, 0, -8],
          radiusX: 0.056,
          radiusZ: 0.078,
          thickness: 0.016,
          sides: 6,
        });
      }
    }

    const segMeshIdx = scene.addMesh(`${spec.name}_Mesh`, [gBody, gRidge, gDark, gBelly, gGlow]);
    const segNodeIdx = scene.addNode({
      name: spec.name,
      meshIndex: segMeshIdx,
      translation: [px, 0, 0],
      parentIndex: rootIdx,
    });
    segNodeIndices.push(segNodeIdx);

    // Child Surf_TEAM node on segments with team-color pads:
    // Node name = "Surf_TEAM", Mesh name = "Surf_TEAM", Material name = "Surf_TEAM"
    if (spec.teamPads) {
      const tp = spec.teamPads;
      const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
      const xPad = lxMin + span * 0.62;
      for (const side of [-1, 1]) {
        gTeam.addBeveledPad({
          center: [xPad, tp.flankY, side * tp.flankZ],
          rotDeg: [side * tp.tiltDeg, -side * 8, 0],
          radiusX: tp.rx,
          radiusZ: tp.rz,
          thickness: 0.026,
          bevel: 0.74,
          sides: 6,
          dome: 0.010,
        });
      }
      if (tp.dorsal) {
        gTeam.addBeveledPad({
          center: [lxMin + span * 0.72, spec.yTop + 0.014, 0],
          rotDeg: [0, 0, -8],
          radiusX: 0.046,
          radiusZ: 0.066,
          thickness: 0.024,
          bevel: 0.74,
          sides: 6,
          dome: 0.009,
        });
      }
      const teamMeshIdx = scene.addMesh('Surf_TEAM', [gTeam]);
      scene.addNode({
        name: 'Surf_TEAM',
        meshIndex: teamMeshIdx,
        parentIndex: segNodeIdx,
      });
    }
  }

  // Add looping 'wriggle' animation across named Segment_0..Segment_4 nodes
  const steps = 9;
  const duration = 1.0;
  const times = [];
  for (let k = 0; k < steps; k++) {
    times.push(Number(((k / (steps - 1)) * duration).toFixed(4)));
  }

  const wriggleTracks = [];
  for (let sIdx = 0; sIdx < segSpecs.length; sIdx++) {
    const px = segSpecs[sIdx].pivotX;
    const phaseOffset = sIdx * 0.95;
    const ampZ = [0.026, 0.022, 0.028, 0.024, 0.032][sIdx];
    const ampX = 0.010;
    const ampYaw = [7.5, 5.5, -6.0, -5.5, 8.5][sIdx];

    const transVals = [];
    const rotVals = [];
    for (let k = 0; k < steps; k++) {
      // Ensure k=0 and k=steps-1 are exact rest pose so t=0 is 100% aligned & symmetric!
      const u = k / (steps - 1);
      const envelope = Math.sin(u * Math.PI); // Smoothly ramps 0 -> 1 -> 0? Wait: for seamless loop with t=0 at rest:
      // Better: subtract phase value at u=0 OR use clean harmonic wave shifted so k=0 and k=end match!
      const wave = Math.sin(2 * Math.PI * u - phaseOffset) - Math.sin(-phaseOffset) * (1 - Math.sin(u * Math.PI));
      // Actually even cleaner seamless loop where k=0 AND k=end equal exact rest pose if envelope is not needed,
      // OR exact traveling wave where t=0 is frame 0: wait — in glTF, Node.translation is rest pose until animation plays!
      const angle = 2 * Math.PI * u + phaseOffset;
      const zOff = Math.sin(angle) * ampZ;
      const xOff = Math.cos(angle) * ampX;
      const yaw = Math.cos(angle) * ampYaw;
      transVals.push([Number((px + xOff).toFixed(6)), 0, Number(zOff.toFixed(6))]);
      rotVals.push(quatFromEulerXYZ(0, yaw, 0));
    }
    // Guarantee exact loop closure (last keyframe == first keyframe)
    transVals[steps - 1] = [...transVals[0]];
    rotVals[steps - 1] = [...rotVals[0]];

    wriggleTracks.push({
      nodeIndex: segNodeIndices[sIdx],
      path: 'translation',
      times,
      values: transVals,
    });
    wriggleTracks.push({
      nodeIndex: segNodeIndices[sIdx],
      path: 'rotation',
      times,
      values: rotVals,
    });
  }
  scene.addAnimation('wriggle', wriggleTracks);

  return scene.buildGLB('BroodLarvaScene');
}

// ---------------------------------------------------------------------------
// Asset 2: brood_egg.glb
// Compact asymmetrical chitin cocoon (~1.05 units tall, +X forward, Y=0 ground,
// lit seam, Surf_TEAM pads, and EggShell node for egg pulse)
// ---------------------------------------------------------------------------

/**
 * Evaluates the asymmetrical cocoon surface point in world space at normalized height v in [0, 1]
 * and azimuth angle theta in [0, 2*PI) (theta=0 is +X forward, theta=PI/2 is +Z right).
 */
function evalAsymCocoonWorld(v, theta) {
  // World height from 0.08 (tucked inside EggBase) to 1.015 (crowned by apex horn to 1.050)
  const y = 0.08 + v * 0.935;

  // Organic egg silhouette envelope: broad compact mid-lower body, narrowing asymmetrically toward crown
  const baseProfile = Math.pow(Math.sin(Math.min(0.996, 0.09 + v * 0.89) * Math.PI), 0.64);
  let r = 0.365 * baseProfile + 0.022 * (1 - v);

  // Asymmetrical secondary brooding bulge on (-X*0.3, +Z*0.9) mid-belly
  const bulgeAngleDiff = theta - 1.92;
  const bulgeBell = Math.exp(-Math.pow((v - 0.44) / 0.24, 2));
  const bulgeLob = Math.max(0, Math.cos(bulgeAngleDiff));
  r += 0.068 * bulgeBell * Math.pow(bulgeLob, 2.0);

  // Secondary smaller upper-front-right lobe
  const lobe2Diff = theta - 0.55;
  const lobe2Bell = Math.exp(-Math.pow((v - 0.68) / 0.20, 2));
  r += 0.036 * lobe2Bell * Math.pow(Math.max(0, Math.cos(lobe2Diff)), 2.0);

  // Subtle 5-rib organic chitin fluting
  r += 0.014 * Math.sin(v * Math.PI) * Math.cos(5 * theta + v * 1.4);

  // Asymmetrical center lean: leans forward (+X) and slightly toward -Z near the upper crown
  const leanX = 0.075 * Math.pow(v, 1.45) - 0.018 * Math.sin(v * Math.PI);
  const leanZ = -0.052 * Math.pow(v, 1.55) + 0.028 * Math.sin(v * Math.PI);

  return {
    point: [leanX + Math.cos(theta) * r, y, leanZ + Math.sin(theta) * r],
    center: [leanX, y, leanZ],
    radius: r,
  };
}

function buildBroodEggGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createBroodMaterials(scene, true);

  const rootIdx = scene.addNode({
    name: 'BroodEgg',
    translation: [0, 0, 0],
  });

  // -------------------------------------------------------------------------
  // 1. EggBase (stationary grounded chitinous clutch & tendrils at Y = 0.000)
  // -------------------------------------------------------------------------
  const gBaseDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gBaseBody = new PrimitiveGeom(mats.Mat_ChitinBody);

  const baseSides = 10;
  const baseRings = [];
  const baseCenters = [];
  const baseLevels = [
    { y: 0.000, r: 0.395 },
    { y: 0.055, r: 0.375 },
    { y: 0.135, r: 0.335 },
    { y: 0.185, r: 0.285 },
  ];
  for (const lv of baseLevels) {
    const ring = [];
    for (let i = 0; i < baseSides; i++) {
      const a = (2 * Math.PI * i) / baseSides;
      // Asymmetric scalloped organic base footprint
      const asym = 1.0 + 0.08 * Math.cos(a - 0.4) + 0.06 * Math.sin(3 * a + 0.7);
      ring.push([Math.cos(a) * lv.r * asym, lv.y, Math.sin(a) * lv.r * asym]);
    }
    baseRings.push(ring);
    baseCenters.push([0, lv.y, 0]);
  }
  gBaseDark.addLoft(baseRings, baseCenters, true, true);

  // 5 asymmetrical gripping chitin root-tendrils anchored flat to Y = 0.000
  const tendrilAngles = [0.05, 1.18, 2.35, 3.72, 5.05];
  const tendrilReach = [0.445, 0.415, 0.435, 0.405, 0.425];
  for (let t = 0; t < tendrilAngles.length; t++) {
    const a = tendrilAngles[t];
    const reach = tendrilReach[t];
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const spine = [
      { pos: [ca * 0.25, 0.145, sa * 0.25], rx: 0.055, ry: 0.042 },
      { pos: [ca * 0.35, 0.055, sa * 0.35], rx: 0.038, ry: 0.028 },
      { pos: [ca * reach, 0.008, sa * reach], rx: 0.016, ry: 0.008 }, // Lowest point = 0.008 - 0.008 = 0.000!
    ];
    (t % 2 === 0 ? gBaseDark : gBaseBody).addTubeAlongSpine(spine, 5, true, true);
  }

  const baseMeshIdx = scene.addMesh('EggBase_Mesh', [gBaseDark, gBaseBody]);
  scene.addNode({
    name: 'EggBase',
    meshIndex: baseMeshIdx,
    translation: [0, 0, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 2. EggShell (pulsing asymmetrical chitin cocoon + lit seam + Surf_TEAM child)
  //    Node pivot at (0, 0.10, 0) so scaling EggShell pulses from basal collar!
  // -------------------------------------------------------------------------
  const shellPivotY = 0.10;
  const toShellLocal = (p) => [p[0], p[1] - shellPivotY, p[2]];

  const gShellBody = new PrimitiveGeom(mats.Mat_ChitinBody);
  const gShellRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gShellDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gSeamGlow = new PrimitiveGeom(mats.Mat_BroodGlow);

  // Main asymmetrical cocoon chamber (12 radial sectors x 8 height rings)
  const sectors = 12;
  const vSteps = 8;
  const shellRings = [];
  const shellCenters = [];
  for (let vi = 0; vi <= vSteps; vi++) {
    const v = vi / vSteps;
    const ring = [];
    let cLocal = [0, 0, 0];
    for (let si = 0; si < sectors; si++) {
      const theta = (2 * Math.PI * si) / sectors;
      const ev = evalAsymCocoonWorld(v, theta);
      ring.push(toShellLocal(ev.point));
      cLocal = toShellLocal(ev.center);
    }
    shellRings.push(ring);
    shellCenters.push(cLocal);
  }
  gShellBody.addLoft(shellRings, shellCenters, true, true);

  // 3 Asymmetrical Overlapping Chitin Husk Ribs / Plates + Crown Apex Horn reaching exact Y = 1.050!
  // Primary hooked crown horn (+X/-Z crown peak, exact top = 1.050 world Y)
  const mainHornSpine = [
    { pos: toShellLocal([0.055, 0.895, -0.065]), rx: 0.082, ry: 0.068 },
    { pos: toShellLocal([0.088, 0.985, -0.072]), rx: 0.048, ry: 0.040 },
    { pos: toShellLocal([0.112, 1.044, -0.062]), rx: 0.008, ry: 0.006 }, // Topmost vertex = 1.044 + 0.006 = 1.050!
  ];
  gShellRidge.addTubeAlongSpine(mainHornSpine, 6, true, true);

  // Secondary shorter asymmetrical side-horn (+Z/+X brooding shoulder, Y ~ 0.93)
  const sideHornSpine = [
    { pos: toShellLocal([0.035, 0.790, 0.115]), rx: 0.064, ry: 0.054 },
    { pos: toShellLocal([0.048, 0.875, 0.155]), rx: 0.036, ry: 0.030 },
    { pos: toShellLocal([0.055, 0.935, 0.175]), rx: 0.009, ry: 0.008 },
  ];
  gShellRidge.addTubeAlongSpine(sideHornSpine, 5, true, true);

  // Tertiary stubby dorsal-back chitin spur (-X/-Z shoulder, Y ~ 0.82)
  const backSpurSpine = [
    { pos: toShellLocal([-0.145, 0.680, -0.095]), rx: 0.056, ry: 0.046 },
    { pos: toShellLocal([-0.205, 0.765, -0.135]), rx: 0.030, ry: 0.025 },
    { pos: toShellLocal([-0.235, 0.820, -0.152]), rx: 0.008, ry: 0.008 },
  ];
  gShellDark.addTubeAlongSpine(backSpurSpine, 5, true, true);

  // 3 Sculpted Spiral Chitin Husk Ribs wrapping up the sides of the cocoon for distinct silhouette
  const ribConfigs = [
    { theta0: 1.05, theta1: 0.62, v0: 0.12, v1: 0.78, matGeom: gShellRidge, thick: 0.040 },
    { theta0: 2.55, theta1: 2.05, v0: 0.10, v1: 0.80, matGeom: gShellRidge, thick: 0.042 },
    { theta0: 4.55, theta1: 4.05, v0: 0.12, v1: 0.84, matGeom: gShellRidge, thick: 0.040 },
  ];
  for (const rc of ribConfigs) {
    const ribSpine = [];
    const ribSamples = 6;
    for (let k = 0; k <= ribSamples; k++) {
      const t = k / ribSamples;
      const v = rc.v0 + (rc.v1 - rc.v0) * t;
      const th = rc.theta0 + (rc.theta1 - rc.theta0) * t;
      const ev = evalAsymCocoonWorld(v, th);
      const outDir = vNorm(vSub(ev.point, ev.center));
      const swell = Math.sin(t * Math.PI);
      const pOut = vAdd(ev.point, vScale(outDir, 0.016 * swell));
      ribSpine.push({
        pos: toShellLocal(pOut),
        rx: rc.thick * (0.45 + 0.65 * swell),
        ry: rc.thick * (0.35 + 0.50 * swell),
      });
    }
    rc.matGeom.addTubeAlongSpine(ribSpine, 5, true, true);
  }

  // -------------------------------------------------------------------------
  // 3. The Lit Seam (Glowing Embryonic Fissure + Parted Chitin Seam Lips)
  //    Runs up the +X front face, splits right across the crown, and onto the back-right!
  // -------------------------------------------------------------------------
  // Parameterize seam path across the surface:
  // Part A: Front lower (+X, slight -Z) up to Crown
  // Part B: Crown over to Upper Rear-Right (-X, +Z) so it is brightly visible from ALL RTS angles!
  const seamControl = [
    { v: 0.18, theta: -0.22, w: 0.022 },
    { v: 0.34, theta: -0.06, w: 0.044 },
    { v: 0.52, theta: 0.10, w: 0.056 },
    { v: 0.70, theta: 0.02, w: 0.058 },
    { v: 0.86, theta: -0.10, w: 0.054 },
    { v: 0.96, theta: 0.35, w: 0.050 }, // Across top crown between the two top horns!
    { v: 0.86, theta: 1.55, w: 0.048 }, // Upper +Z shoulder (faces the -56 deg south RTS camera directly!)
    { v: 0.68, theta: 1.88, w: 0.040 },
    { v: 0.50, theta: 2.05, w: 0.020 },
  ];

  const seamGlowSpine = [];
  const leftLipSpine = [];
  const rightLipSpine = [];

  for (let i = 0; i < seamControl.length; i++) {
    const sc = seamControl[i];
    const ev = evalAsymCocoonWorld(sc.v, sc.theta);
    const outDir = vNorm(vSub(ev.point, [ev.center[0], ev.center[1] - 0.12, ev.center[2]]));

    // Glowing plasma-acid core sits proud of the shell so it never z-fights and reads crisply
    const glowPt = vAdd(ev.point, vScale(outDir, 0.018));
    seamGlowSpine.push({
      pos: toShellLocal(glowPt),
      rx: sc.w,
      ry: sc.w * 0.62,
    });

    // Flanking lighter-chitin parted lips on either side of the glowing fissure
    const lipOffsetAngle = (sc.w + 0.026) / Math.max(0.14, ev.radius);
    const evL = evalAsymCocoonWorld(sc.v, sc.theta - lipOffsetAngle);
    const evR = evalAsymCocoonWorld(sc.v, sc.theta + lipOffsetAngle);
    const outL = vNorm(vSub(evL.point, evL.center));
    const outR = vNorm(vSub(evR.point, evR.center));
    leftLipSpine.push({
      pos: toShellLocal(vAdd(evL.point, vScale(outL, 0.014))),
      rx: sc.w * 0.52,
      ry: sc.w * 0.46,
    });
    rightLipSpine.push({
      pos: toShellLocal(vAdd(evR.point, vScale(outR, 0.014))),
      rx: sc.w * 0.52,
      ry: sc.w * 0.46,
    });
  }
  gSeamGlow.addTubeAlongSpine(seamGlowSpine, 6, true, true);
  gShellRidge.addTubeAlongSpine(leftLipSpine, 5, true, true);
  gShellRidge.addTubeAlongSpine(rightLipSpine, 5, true, true);

  // Secondary branching glowing fissure vein on front-right (+X / +Z) for unmistakable organic asymmetry
  const branchSeam = [
    { v: 0.54, theta: 0.14, w: 0.036 },
    { v: 0.46, theta: 0.58, w: 0.030 },
    { v: 0.36, theta: 0.92, w: 0.016 },
  ].map((sc) => {
    const ev = evalAsymCocoonWorld(sc.v, sc.theta);
    const outDir = vNorm(vSub(ev.point, ev.center));
    return {
      pos: toShellLocal(vAdd(ev.point, vScale(outDir, 0.017))),
      rx: sc.w,
      ry: sc.w * 0.58,
    };
  });
  gSeamGlow.addTubeAlongSpine(branchSeam, 5, true, true);

  // -------------------------------------------------------------------------
  // 4. Surf_TEAM Pads (3 bold asymmetrical team-color pads around EggShell + dark bezels)
  // -------------------------------------------------------------------------
  const gTeamEgg = new PrimitiveGeom(mats.Surf_TEAM);

  const eggPadSpecs = [
    // Pad 1: Prominent upper front-right (+X / +Z) — faces both forward +X and overhead RTS camera!
    { v: 0.60, theta: 0.86, rx: 0.115, rz: 0.092 },
    // Pad 2: Prominent upper front-left (+X / -Z) — balances forward silhouette asymmetrically!
    { v: 0.52, theta: -0.98, rx: 0.112, rz: 0.090 },
    // Pad 3: Prominent rear-left/south-west plate (-X / +Z) — visible from RTS south camera & rear!
    { v: 0.48, theta: 2.48, rx: 0.118, rz: 0.094 },
  ];

  for (const ps of eggPadSpecs) {
    const ev = evalAsymCocoonWorld(ps.v, ps.theta);
    // Compute surface outward vector and convert to Euler orientation so pad hugs the shell & tilts upward
    const rawOut = vNorm(vSub(ev.point, [ev.center[0], ev.center[1] - 0.16, ev.center[2]]));
    // Add slight upward bias so RTS overhead camera sees broad face of each team pad
    const out = vNorm([rawOut[0], rawOut[1] + 0.32, rawOut[2]]);

    // Build basis where local +Y = out
    const upRef = Math.abs(out[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const tangentX = vNorm(vCross(upRef, out));
    const tangentZ = vNorm(vCross(out, tangentX));

    const addBasisPad = (geom, centerWorld, rX, rZ, thick, bev, domeH) => {
      const sides = 6;
      const botRing = [];
      const topRing = [];
      const cLocal = toShellLocal(centerWorld);
      for (let i = 0; i < sides; i++) {
        const a = (2 * Math.PI * i) / sides + Math.PI / 6;
        const cx = Math.cos(a);
        const cz = Math.sin(a);
        const pBot = vAdd(
          cLocal,
          vAdd(vScale(tangentX, cx * rX), vScale(tangentZ, cz * rZ))
        );
        const pTop = vAdd(
          vAdd(cLocal, vScale(out, thick)),
          vAdd(vScale(tangentX, cx * rX * bev), vScale(tangentZ, cz * rZ * bev))
        );
        botRing.push(pBot);
        topRing.push(pTop);
      }
      const cTop = vAdd(cLocal, vScale(out, thick + domeH));
      const downDir = vScale(out, -1);
      for (let i = 0; i < sides; i++) {
        const inext = (i + 1) % sides;
        const sideMid = vScale(
          vAdd(vAdd(botRing[i], botRing[inext]), vAdd(topRing[i], topRing[inext])),
          0.25
        );
        geom.addQuad(
          botRing[i],
          botRing[inext],
          topRing[inext],
          topRing[i],
          vAdd(vSub(sideMid, cLocal), vScale(out, 0.25))
        );
        geom.addTri(cTop, topRing[inext], topRing[i], out);
        geom.addTri(cLocal, botRing[i], botRing[inext], downDir);
      }
    };

    // Recessed/raised dark chitin bezel border on EggShell
    const bezelCenter = vAdd(ev.point, vScale(rawOut, -0.004));
    addBasisPad(gShellDark, bezelCenter, ps.rx * 1.18, ps.rz * 1.18, 0.024, 0.84, 0.004);

    // Bright Surf_TEAM pad proud of the bezel
    const teamCenter = vAdd(ev.point, vScale(rawOut, 0.008));
    addBasisPad(gTeamEgg, teamCenter, ps.rx, ps.rz, 0.032, 0.76, 0.012);
  }

  const eggShellMeshIdx = scene.addMesh('EggShell_Mesh', [
    gShellBody,
    gShellRidge,
    gShellDark,
    gSeamGlow,
  ]);
  const eggShellNodeIdx = scene.addNode({
    name: 'EggShell',
    meshIndex: eggShellMeshIdx,
    translation: [0, shellPivotY, 0],
    parentIndex: rootIdx,
  });

  const teamEggMeshIdx = scene.addMesh('Surf_TEAM', [gTeamEgg]);
  scene.addNode({
    name: 'Surf_TEAM',
    meshIndex: teamEggMeshIdx,
    parentIndex: eggShellNodeIdx,
  });

  // Add looping organic 'pulse' animation on EggShell (heart-beat double-throb breathing)
  const pulseTimes = [0.0, 0.22, 0.42, 0.65, 1.05, 1.40];
  const pulseScales = [
    [1.0, 1.0, 1.0],
    [1.065, 0.965, 1.065],
    [1.015, 0.992, 1.015],
    [1.048, 0.975, 1.048],
    [0.985, 1.022, 0.985],
    [1.0, 1.0, 1.0],
  ];
  scene.addAnimation('pulse', [
    {
      nodeIndex: eggShellNodeIdx,
      path: 'scale',
      times: pulseTimes,
      values: pulseScales,
    },
  ]);

  return scene.buildGLB('BroodEggScene');
}

// ---------------------------------------------------------------------------
// Entry Point & Self-Verification Summary
// ---------------------------------------------------------------------------

function summarizeGLTF(filename, glbBuffer, gltf) {
  let totalVerts = 0;
  let totalTris = 0;
  const globalMin = [Infinity, Infinity, Infinity];
  const globalMax = [-Infinity, -Infinity, -Infinity];

  // Walk scene hierarchy accumulating rest transforms to compute exact world AABB
  const walkNode = (nodeIdx, parentOffset) => {
    const node = gltf.nodes[nodeIdx];
    const t = node.translation || [0, 0, 0];
    const worldOffset = [
      parentOffset[0] + t[0],
      parentOffset[1] + t[1],
      parentOffset[2] + t[2],
    ];
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes[node.mesh];
      for (const prim of mesh.primitives) {
        const posAcc = gltf.accessors[prim.attributes.POSITION];
        const idxAcc = gltf.accessors[prim.indices];
        totalVerts += posAcc.count;
        totalTris += idxAcc.count / 3;
        for (let k = 0; k < 3; k++) {
          globalMin[k] = Math.min(globalMin[k], posAcc.min[k] + worldOffset[k]);
          globalMax[k] = Math.max(globalMax[k], posAcc.max[k] + worldOffset[k]);
        }
      }
    }
    if (node.children) {
      for (const ch of node.children) walkNode(ch, worldOffset);
    }
  };

  for (const rIdx of gltf.scenes[0].nodes) {
    walkNode(rIdx, [0, 0, 0]);
  }

  const dims = [
    globalMax[0] - globalMin[0],
    globalMax[1] - globalMin[1],
    globalMax[2] - globalMin[2],
  ];

  return {
    filename,
    bytes: glbBuffer.length,
    verts: totalVerts,
    tris: totalTris,
    min: globalMin.map((v) => Number(v.toFixed(4))),
    max: globalMax.map((v) => Number(v.toFixed(4))),
    dims: dims.map((v) => Number(v.toFixed(4))),
    nodes: gltf.nodes.map((n) => n.name),
    materials: gltf.materials.map((m) => m.name),
    animations: (gltf.animations || []).map((a) => a.name),
  };
}

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
  fs.mkdirSync(outDir, { recursive: true });

  const larva = buildBroodLarvaGLB();
  const larvaPath = path.join(outDir, 'brood_larva.glb');
  fs.writeFileSync(larvaPath, larva.glb);

  const egg = buildBroodEggGLB();
  const eggPath = path.join(outDir, 'brood_egg.glb');
  fs.writeFileSync(eggPath, egg.glb);

  const summary = [
    summarizeGLTF('brood_larva.glb', larva.glb, larva.gltf),
    summarizeGLTF('brood_egg.glb', egg.glb, egg.gltf),
  ];

  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildBroodLarvaGLB,
  buildBroodEggGLB,
};
