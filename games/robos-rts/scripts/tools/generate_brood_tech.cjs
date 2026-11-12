#!/usr/bin/env node
/**
 * Starfall Command — Gnarl Brood Tech Buildings Low-Poly GLB Generator
 *
 * Deterministically generates two original glTF 2.0 binary (.glb) tech structures
 * using only built-in Node.js modules (zero external dependencies):
 *   1. hatchling_pool.glb — Broad low ring of purple chitin (~7.3w x 2.0h x 7.3d,
 *      ground Y=0, +X forward) around a luminous amber-green liquid basin, with
 *      inward-hooked ridges, translucent gestational clusters, Surf_TEAM_* player
 *      color panels, Surf_GLOW_* team emissive accents, and a subtle 'idle' loop.
 *   2. bile_warren.glb    — Taller squat burrow of ridged carapace (~7.3w x 3.3h x 7.3d,
 *      ground Y=0, +X forward), with a dark +X ramp mouth, rounded acid sacs,
 *      Surf_TEAM_* player color panels, Surf_GLOW_* team emissive accents, and
 *      a subtle 'idle' loop.
 *
 * Usage:
 *   node generate_brood_tech.cjs [output_dir]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Math, Vector, Quaternion & Linear Color Helpers
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
    Number(alpha.toFixed(6)),
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

function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function quatFromEulerXYZ(rxDeg, ryDeg, rzDeg) {
  const rx = (rxDeg * Math.PI) / 360;
  const ry = (ryDeg * Math.PI) / 360;
  const rz = (rzDeg * Math.PI) / 360;
  const qx = [Math.sin(rx), 0, 0, Math.cos(rx)];
  const qy = [0, Math.sin(ry), 0, Math.cos(ry)];
  const qz = [0, 0, Math.sin(rz), Math.cos(rz)];
  const q = quatMul(qz, quatMul(qy, qx));
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((v) => Number((v / l).toFixed(6)));
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
// Low-Poly Flat-Shaded Primitive Builder (Verified Outward Winding)
// ---------------------------------------------------------------------------

class PrimitiveGeom {
  constructor(materialIndex) {
    this.materialIndex = materialIndex;
    this.positions = [];
    this.normals = [];
    this.indices = [];
  }

  addTri(v0, v1, v2, outwardHint = null) {
    const e1 = vSub(v1, v0);
    const e2 = vSub(v2, v0);
    let cr = vCross(e1, e2);
    if (vLen(cr) < 1e-10) return;
    let a = v0, b = v1, c = v2;
    if (outwardHint && vDot(cr, outwardHint) < 0) {
      b = v2;
      c = v1;
      cr = vScale(cr, -1);
    }
    const n = vNorm(cr);
    const base = this.positions.length;
    this.positions.push(a, b, c);
    this.normals.push(n, n, n);
    this.indices.push(base, base + 1, base + 2);
  }

  addQuad(v0, v1, v2, v3, outwardHint = null) {
    let a = v0, b = v1, c = v2, d = v3;
    let cr1 = vCross(vSub(b, a), vSub(c, a));
    let cr2 = vCross(vSub(c, a), vSub(d, a));
    if (vLen(cr1) < 1e-10 || vLen(cr2) < 1e-10) {
      this.addTri(v0, v1, v2, outwardHint);
      this.addTri(v0, v2, v3, outwardHint);
      return;
    }
    const avgCr = vAdd(cr1, cr2);
    if (outwardHint && vDot(avgCr, outwardHint) < 0) {
      const tmp = b;
      b = d;
      d = tmp;
      cr1 = vCross(vSub(b, a), vSub(c, a));
      cr2 = vCross(vSub(c, a), vSub(d, a));
    }
    const n1 = vNorm(cr1);
    const n2 = vNorm(cr2);
    if (vDot(n1, n2) > 0.996) {
      const n = vNorm(vAdd(n1, n2));
      const base = this.positions.length;
      this.positions.push(a, b, c, d);
      this.normals.push(n, n, n, n);
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      this.addTri(a, b, c, outwardHint);
      this.addTri(a, c, d, outwardHint);
    }
  }

  addLoft(rings, ringCenters, capStart = true, capEnd = true, pos = [0, 0, 0], rotDeg = [0, 0, 0]) {
    const xfRings = rings.map((r) => r.map((p) => transformPoint(p, pos, rotDeg)));
    const xfCenters = ringCenters.map((c) => transformPoint(c, pos, rotDeg));
    const R = xfRings.length;
    const M = xfRings[0].length;

    for (let r = 0; r < R - 1; r++) {
      const cm = vLerp(xfCenters[r], xfCenters[r + 1], 0.5);
      for (let i = 0; i < M; i++) {
        const inext = (i + 1) % M;
        const p00 = xfRings[r][i];
        const p01 = xfRings[r][inext];
        const p11 = xfRings[r + 1][inext];
        const p10 = xfRings[r + 1][i];
        const quadMid = vScale(vAdd(vAdd(p00, p01), vAdd(p10, p11)), 0.25);
        this.addQuad(p00, p01, p11, p10, vSub(quadMid, cm));
      }
    }

    if (capStart) {
      let avg = [0, 0, 0];
      for (const p of xfRings[0]) avg = vAdd(avg, p);
      avg = vScale(avg, 1 / M);
      const axisStart = vSub(xfCenters[0], xfCenters[1]);
      const hint = vLen(axisStart) > 1e-6 ? axisStart : [0, -1, 0];
      for (let i = 0; i < M; i++) {
        const inext = (i + 1) % M;
        this.addTri(avg, xfRings[0][inext], xfRings[0][i], hint);
      }
    }

    if (capEnd) {
      const last = R - 1;
      let avg = [0, 0, 0];
      for (const p of xfRings[last]) avg = vAdd(avg, p);
      avg = vScale(avg, 1 / M);
      const axisEnd = vSub(xfCenters[last], xfCenters[last - 1]);
      const hint = vLen(axisEnd) > 1e-6 ? axisEnd : [0, 1, 0];
      for (let i = 0; i < M; i++) {
        const inext = (i + 1) % M;
        this.addTri(avg, xfRings[last][i], xfRings[last][inext], hint);
      }
    }
  }

  /**
   * Builds a closed cyclic ring (toroidal/crater wall) where rings[0..R-1] wrap around
   * back to rings[0]. Each ring[s] is a closed cross-section around ringCenters[s].
   */
  addCyclicRingLoft(rings, ringCenters) {
    const R = rings.length;
    const M = rings[0].length;
    for (let r = 0; r < R; r++) {
      const rNext = (r + 1) % R;
      const cm = vLerp(ringCenters[r], ringCenters[rNext], 0.5);
      for (let i = 0; i < M; i++) {
        const iNext = (i + 1) % M;
        const p00 = rings[r][i];
        const p01 = rings[r][iNext];
        const p11 = rings[rNext][iNext];
        const p10 = rings[rNext][i];
        const quadMid = vScale(vAdd(vAdd(p00, p01), vAdd(p10, p11)), 0.25);
        this.addQuad(p00, p01, p11, p10, vSub(quadMid, cm));
      }
    }
  }

  addTubeAlongSpine(spine, sides = 6, capStart = true, capEnd = true, minYClamp = null) {
    const rings = [];
    const centers = [];
    let prevUp = [0, 1, 0];
    for (let s = 0; s < spine.length; s++) {
      const cur = spine[s];
      const prev = spine[Math.max(0, s - 1)];
      const next = spine[Math.min(spine.length - 1, s + 1)];
      const tangent = vNorm(vSub(next.pos, prev.pos));
      let upRef = prevUp;
      if (Math.abs(vDot(tangent, upRef)) > 0.92) {
        upRef = Math.abs(tangent[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
      }
      const sideVec = vNorm(vCross(tangent, upRef));
      const orthoUp = vNorm(vCross(sideVec, tangent));
      prevUp = orthoUp;

      const ring = [];
      for (let i = 0; i < sides; i++) {
        const a = (2 * Math.PI * i) / sides;
        const cs = Math.cos(a) * cur.rx;
        const sn = Math.sin(a) * (cur.ry !== undefined ? cur.ry : cur.rx);
        const pt = vAdd(cur.pos, vAdd(vScale(sideVec, cs), vScale(orthoUp, sn)));
        if (minYClamp !== null && pt[1] < minYClamp) pt[1] = minYClamp;
        ring.push(pt);
      }
      rings.push(ring);
      const cPos = [...cur.pos];
      if (minYClamp !== null && cPos[1] < minYClamp + 0.005) cPos[1] = minYClamp + 0.005;
      centers.push(cPos);
    }
    this.addLoft(rings, centers, capStart, capEnd);
  }

  /**
   * Adds a faceted organic dome / spheroid (for rounded acid sacs & translucent cysts).
   */
  addOrganicSpheroid({
    center = [0, 0, 0],
    radii = [0.5, 0.5, 0.5],
    rotDeg = [0, 0, 0],
    sectors = 10,
    stacks = 5,
    hemiOnly = false,
    wobble = 0.0,
    minYClamp = null,
  }) {
    const rings = [];
    const centers = [];
    const startStack = hemiOnly ? 0 : 1;
    const endStack = hemiOnly ? stacks - 1 : stacks - 1;

    for (let st = startStack; st <= endStack; st++) {
      const u = hemiOnly ? st / stacks : st / stacks; // 0..1
      const phi = hemiOnly
        ? (u * Math.PI) * 0.46 // 0 (equator) up to near top pole
        : -Math.PI * 0.44 + u * Math.PI * 0.88;
      const yLocal = Math.sin(phi) * radii[1];
      const rCos = Math.cos(phi);
      const ring = [];
      for (let s = 0; s < sectors; s++) {
        const th = (2 * Math.PI * s) / sectors;
        const asym = 1.0 + wobble * Math.sin(3 * th + st * 0.8);
        const pLocal = [
          Math.cos(th) * rCos * radii[0] * asym,
          yLocal,
          Math.sin(th) * rCos * radii[2] * asym,
        ];
        const pWorld = transformPoint(pLocal, center, rotDeg);
        if (minYClamp !== null && pWorld[1] < minYClamp) pWorld[1] = minYClamp;
        ring.push(pWorld);
      }
      rings.push(ring);
      const cWorld = transformPoint([0, yLocal, 0], center, rotDeg);
      centers.push(cWorld);
    }
    this.addLoft(rings, centers, true, true);
  }

  /**
   * Adds a beveled hexagonal/shield armor pad or glowing gem oriented by Euler degrees.
   */
  addBeveledPad({
    center,
    rotDeg = [0, 0, 0],
    radiusX = 0.3,
    radiusZ = 0.24,
    thickness = 0.08,
    bevel = 0.76,
    sides = 6,
    dome = 0.03,
  }) {
    const botRing = [];
    const topRing = [];
    for (let i = 0; i < sides; i++) {
      const a = (2 * Math.PI * i) / sides + Math.PI / sides;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      botRing.push(transformPoint([cx * radiusX, 0, cz * radiusZ], center, rotDeg));
      topRing.push(transformPoint([cx * radiusX * bevel, thickness, cz * radiusZ * bevel], center, rotDeg));
    }
    const cBot = transformPoint([0, 0, 0], center, rotDeg);
    const cTop = transformPoint([0, thickness + dome, 0], center, rotDeg);
    const upDir = rotateVecByEulerXYZ([0, 1, 0], rotDeg[0], rotDeg[1], rotDeg[2]);
    const downDir = vScale(upDir, -1);

    for (let i = 0; i < sides; i++) {
      const inext = (i + 1) % sides;
      const sideMid = vScale(vAdd(vAdd(botRing[i], botRing[inext]), vAdd(topRing[i], topRing[inext])), 0.25);
      this.addQuad(botRing[i], botRing[inext], topRing[inext], topRing[i], vAdd(vSub(sideMid, cBot), vScale(upDir, 0.25)));
      this.addTri(cTop, topRing[inext], topRing[i], upDir);
      this.addTri(cBot, botRing[i], botRing[inext], downDir);
    }
  }
}

// ---------------------------------------------------------------------------
// glTF 2.0 Binary (.glb) Scene Writer
// ---------------------------------------------------------------------------

class GLBSceneBuilder {
  constructor(generatorName = 'Starfall Gnarl Brood Tech GLB Generator') {
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
    metallic = 0.18,
    roughness = 0.52,
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
    if (doubleSided) mat.doubleSided = true;
    if (alpha < 1.0) mat.alphaMode = 'BLEND';
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
    translation = [0, 0, 0],
    rotation = [0, 0, 0, 1],
    scale = [1, 1, 1],
    parentIndex = null,
  }) {
    const node = {
      name,
      translation: translation.map((v) => Number(v.toFixed(6))),
      rotation: rotation.map((v) => Number(v.toFixed(6))),
      scale: scale.map((v) => Number(v.toFixed(6))),
      children: [],
    };
    if (meshIndex !== null && meshIndex !== undefined) node.mesh = meshIndex;
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
      const bv = { buffer: 0, byteOffset, byteLength: buf.length };
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
          attributes: { POSITION: posAcc, NORMAL: normAcc },
          indices: idxAcc,
          material: prim.materialIndex,
          mode: 4,
        };
      });
      return { name: m.name, primitives: gltfPrims };
    });

    const gltfAnimations = this.animations.map((anim) => {
      const samplers = [];
      const channels = [];
      const timeCache = new Map();

      const getTimeAcc = (times) => {
        const key = times.join(',');
        if (timeCache.has(key)) return timeCache.get(key);
        const count = times.length;
        const timeBuf = Buffer.alloc(count * 4);
        let minT = Infinity, maxT = -Infinity;
        for (let i = 0; i < count; i++) {
          const t = times[i];
          if (t < minT) minT = t;
          if (t > maxT) maxT = t;
          timeBuf.writeFloatLE(t, i * 4);
        }
        const timeBV = appendAligned(timeBuf);
        const accIdx = accessors.length;
        accessors.push({
          bufferView: timeBV,
          byteOffset: 0,
          componentType: 5126,
          count,
          type: 'SCALAR',
          min: [Number(minT.toFixed(6))],
          max: [Number(maxT.toFixed(6))],
        });
        timeCache.set(key, accIdx);
        return accIdx;
      };

      for (const tr of anim.tracks) {
        const count = tr.times.length;
        const timeAcc = getTimeAcc(tr.times);
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
          target: { node: tr.nodeIndex, path: tr.path },
        });
      }
      return { name: anim.name, samplers, channels };
    });

    const cleanNodes = this.nodes.map((n) => {
      const copy = { ...n };
      if (!copy.children || copy.children.length === 0) delete copy.children;
      return copy;
    });

    const binData = Buffer.concat(binChunks);

    const gltf = {
      asset: { version: '2.0', generator: this.generatorName },
      scene: 0,
      scenes: [{ name: sceneName, nodes: this.rootNodes }],
      nodes: cleanNodes,
      meshes: gltfMeshes,
      materials: this.materials,
      accessors,
      bufferViews,
      buffers: [{ byteLength: binData.length }],
      animations: gltfAnimations,
    };

    let jsonBytes = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
    if (jsonPad > 0) {
      jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
    }

    const totalLength = 12 + 8 + jsonBytes.length + 8 + binData.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(totalLength, 8);

    const jsonChunkHeader = Buffer.alloc(8);
    jsonChunkHeader.writeUInt32LE(jsonBytes.length, 0);
    jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4);

    const binChunkHeader = Buffer.alloc(8);
    binChunkHeader.writeUInt32LE(binData.length, 0);
    binChunkHeader.writeUInt32LE(0x004e4942, 4);

    return {
      glb: Buffer.concat([header, jsonChunkHeader, jsonBytes, binChunkHeader, binData]),
      gltf,
    };
  }
}

// ---------------------------------------------------------------------------
// Shared Gnarl Brood Tech Palette
// ---------------------------------------------------------------------------

function createBroodTechMaterials(scene) {
  // Surf_TEAM: matte-satin player team color (default Gnarl Brood crimson #e0453a boosted)
  const Surf_TEAM = scene.addMaterial({
    name: 'Surf_TEAM',
    baseColorHex: '#f04c3e',
    metallic: 0.18,
    roughness: 0.42,
    emissiveHex: '#e0453a',
    emissiveBoost: 0.35,
  });

  // Surf_GLOW: vivid high-emission player team bioluminescent accent
  const Surf_GLOW = scene.addMaterial({
    name: 'Surf_GLOW',
    baseColorHex: '#ff6e5e',
    metallic: 0.0,
    roughness: 0.22,
    emissiveHex: '#ff5242',
    emissiveBoost: 1.0,
  });

  // Main Gnarl Brood purple chitin carapace
  const Mat_Chitin = scene.addMaterial({
    name: 'Mat_Chitin',
    baseColorHex: '#52385c',
    metallic: 0.22,
    roughness: 0.48,
  });

  // Lighter violet-taupe chitin for hooked ridges, dorsal crests & carapace lips
  const Mat_ChitinRidge = scene.addMaterial({
    name: 'Mat_ChitinRidge',
    baseColorHex: '#986ca4',
    metallic: 0.18,
    roughness: 0.38,
  });

  // Deep dark purple-slate chitin for basal roots, bezels, straps & inter-plate clefts
  const Mat_ChitinDark = scene.addMaterial({
    name: 'Mat_ChitinDark',
    baseColorHex: '#281b30',
    metallic: 0.26,
    roughness: 0.56,
  });

  // Organic fleshy brood membrane skirt / burrow earth-tissue
  const Mat_BroodMembrane = scene.addMaterial({
    name: 'Mat_BroodMembrane',
    baseColorHex: '#5e3c4a',
    metallic: 0.06,
    roughness: 0.76,
  });

  // Luminous amber-green liquid basin & acid core
  const Mat_AmberGreenLiquid = scene.addMaterial({
    name: 'Mat_AmberGreenLiquid',
    baseColorHex: '#8ef024',
    metallic: 0.05,
    roughness: 0.16,
    emissiveHex: '#76db16',
    emissiveBoost: 0.86,
  });

  // Warm golden-amber caustic nutrient eddies / cyst inner nucleus
  const Mat_LiquidCaustic = scene.addMaterial({
    name: 'Mat_LiquidCaustic',
    baseColorHex: '#ffdf4d',
    metallic: 0.0,
    roughness: 0.14,
    emissiveHex: '#f5be28',
    emissiveBoost: 0.96,
  });

  // Translucent gestational cluster membrane (alpha BLEND)
  const Mat_TranslucentCluster = scene.addMaterial({
    name: 'Mat_TranslucentCluster',
    baseColorHex: '#aef588',
    alpha: 0.52,
    metallic: 0.05,
    roughness: 0.16,
    emissiveHex: '#5ecf44',
    emissiveBoost: 0.42,
    doubleSided: true,
  });

  // Swollen rounded corrosive acid sac skin (for Bile Warren)
  const Mat_AcidSac = scene.addMaterial({
    name: 'Mat_AcidSac',
    baseColorHex: '#72c81b',
    metallic: 0.04,
    roughness: 0.30,
    emissiveHex: '#58a310',
    emissiveBoost: 0.40,
  });

  // Deep shadowy cavern throat for Bile Warren's +X dark ramp mouth
  const Mat_BurrowMaw = scene.addMaterial({
    name: 'Mat_BurrowMaw',
    baseColorHex: '#08040c',
    metallic: 0.0,
    roughness: 0.98,
  });

  return {
    Surf_TEAM,
    Surf_GLOW,
    Mat_Chitin,
    Mat_ChitinRidge,
    Mat_ChitinDark,
    Mat_BroodMembrane,
    Mat_AmberGreenLiquid,
    Mat_LiquidCaustic,
    Mat_TranslucentCluster,
    Mat_AcidSac,
    Mat_BurrowMaw,
  };
}

// ---------------------------------------------------------------------------
// Asset 1: hatchling_pool.glb
// Broad low ring of purple chitin (~7.3 x 2.0 x 7.3) around a luminous
// amber-green liquid basin, with hooked ridges and translucent clusters.
// ---------------------------------------------------------------------------

function buildHatchlingPoolGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createBroodTechMaterials(scene);

  const rootIdx = scene.addNode({ name: 'HatchlingPool', translation: [0, 0, 0] });

  const gChitin = new PrimitiveGeom(mats.Mat_Chitin);
  const gRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gMembrane = new PrimitiveGeom(mats.Mat_BroodMembrane);

  // -------------------------------------------------------------------------
  // 1. Broad Low Chitin Crater Ring (Sectors around Y, +X spillway notch)
  // -------------------------------------------------------------------------
  const sectors = 16;
  const wallRings = [];
  const wallCenters = [];
  const floorOuter = [];
  const botOuter = [];

  for (let s = 0; s < sectors; s++) {
    const th = (2 * Math.PI * s) / sectors; // th = 0 is +X forward!
    const ca = Math.cos(th);
    const sa = Math.sin(th);

    // Organic asymmetry while preserving ~7.30 overall footprint
    const asym = 1.0 + 0.045 * Math.sin(3 * th + 0.6) + 0.035 * Math.cos(2 * th - 0.5);

    // +X forward spawning spillway dip: rim lowers smoothly around th = 0
    const frontAlign = Math.max(0, Math.cos(th));
    const spillwayDip = 1.0 - 0.42 * Math.pow(frontAlign, 4.0);

    const rSkirt = 3.42 * asym;
    const rOuterMid = 3.16 * asym;
    const rRimOuter = 2.82 * asym;
    const rRimInner = 2.44 * asym;
    const rBasinWall = 2.22 * asym;

    const hMid = 0.54 * spillwayDip;
    const hRimOuter = 1.12 * spillwayDip;
    const hRimPeak = 1.26 * spillwayDip;
    const hInnerShelf = 0.72 * spillwayDip;

    // 6-point closed cross-section of the annular chitin ring wall at azimuth th
    const profile = [
      [ca * rSkirt, 0.000, sa * rSkirt],          // 0: Outer ground skirt at Y = 0
      [ca * rOuterMid, hMid, sa * rOuterMid],     // 1: Outer armored slope
      [ca * rRimOuter, hRimOuter, sa * rRimOuter],// 2: Outer rim shoulder
      [ca * rRimInner, hRimPeak, sa * rRimInner], // 3: Inner crater crest
      [ca * rBasinWall, hInnerShelf, sa * rBasinWall], // 4: Inner liquid overhang shelf
      [ca * (rBasinWall * 0.94), 0.000, sa * (rBasinWall * 0.94)], // 5: Inner floor anchor at Y = 0
    ];
    wallRings.push(profile);
    wallCenters.push([ca * 2.78 * asym, 0.48 * spillwayDip, sa * 2.78 * asym]);

    floorOuter.push([ca * (rBasinWall * 0.98), 0.24, sa * (rBasinWall * 0.98)]);
    botOuter.push([ca * rSkirt, 0.000, sa * rSkirt]);
  }

  gChitin.addCyclicRingLoft(wallRings, wallCenters);

  // Dark sunken basin floor at Y = 0.24 + flat bottom seal at Y = 0.000
  for (let s = 0; s < sectors; s++) {
    const sNext = (s + 1) % sectors;
    gDark.addTri([0, 0.24, 0], floorOuter[sNext], floorOuter[s], [0, 1, 0]);
    gDark.addTri([0, 0.000, 0], botOuter[s], botOuter[sNext], [0, -1, 0]);
  }

  // Raised lighter-chitin scalloped inner rim lip segments around the crater
  for (let s = 0; s < sectors; s++) {
    if (s === 0 || s === sectors - 1) continue; // Keep +X spawning spillway open!
    const sNext = (s + 1) % sectors;
    const thM = ((s + 0.5) * 2 * Math.PI) / sectors;
    const ca = Math.cos(thM), sa = Math.sin(thM);
    const pA = wallRings[s][3];
    const pB = wallRings[sNext][3];
    const mid = vLerp(pA, pB, 0.5);
    gRidge.addBeveledPad({
      center: [mid[0], mid[1] - 0.02, mid[2]],
      rotDeg: [sa * 16, 0, -ca * 16],
      radiusX: 0.34,
      radiusZ: 0.34,
      thickness: 0.11,
      sides: 5,
      dome: 0.04,
    });
  }

  // +X Forward Spawning Spillway Apron & Twin Gate Buttresses (exact +X max = +3.6500)
  const spillwaySpine = [
    { pos: [2.25, 0.48, 0], rx: 0.68, ry: 0.16 },
    { pos: [3.05, 0.22, 0], rx: 0.78, ry: 0.14 },
    { pos: [3.63, 0.02, 0], rx: 0.62, ry: 0.02 },
  ];
  gMembrane.addTubeAlongSpine(spillwaySpine, 6, true, true, 0.0);

  // 8 Splayed Outer Ground Root Buttresses anchoring footprint to exact 7.30 x 7.30 ([-3.65, +3.65])
  const rootAngles = [
    { th: 0.00, reach: 3.650, h0: 0.42 }, // +X exact 3.650
    { th: 0.72, reach: 3.580, h0: 0.68 },
    { th: Math.PI * 0.5, reach: 3.650, h0: 0.72 }, // +Z exact 3.650
    { th: 2.32, reach: 3.560, h0: 0.74 },
    { th: Math.PI, reach: 3.650, h0: 0.78 }, // -X exact -3.650
    { th: 3.92, reach: 3.550, h0: 0.70 },
    { th: Math.PI * 1.5, reach: 3.650, h0: 0.72 }, // -Z exact -3.650
    { th: 5.56, reach: 3.580, h0: 0.66 },
  ];
  for (let i = 0; i < rootAngles.length; i++) {
    const ra = rootAngles[i];
    const ca = Math.cos(ra.th), sa = Math.sin(ra.th);
    const spine = [
      { pos: [ca * 2.65, ra.h0, sa * 2.65], rx: 0.28, ry: 0.22 },
      { pos: [ca * 3.22, ra.h0 * 0.38, sa * 3.22], rx: 0.20, ry: 0.14 },
      { pos: [ca * (ra.reach - 0.02), 0.022, sa * (ra.reach - 0.02)], rx: 0.05, ry: 0.022 },
    ];
    (i % 2 === 0 ? gDark : gMembrane).addTubeAlongSpine(spine, 5, true, true, 0.0);
  }

  // -------------------------------------------------------------------------
  // 2. 8 Hooked Chitin Ridges (Curving Up & Hooking Inward Over the Basin!)
  //    Dominant rear-dorsal hook reaches exact Y = 2.0000!
  // -------------------------------------------------------------------------
  const hookSpecs = [
    { th: 0.52, hPeak: 1.74, rTip: 1.98 },   // Front-right (+X/+Z) spillway guardian hook
    { th: -0.52, hPeak: 1.74, rTip: 1.98 },  // Front-left (+X/-Z) spillway guardian hook
    { th: 1.32, hPeak: 1.84, rTip: 1.88 },
    { th: -1.36, hPeak: 1.80, rTip: 1.90 },
    { th: 2.18, hPeak: 1.90, rTip: 1.82 },
    { th: -2.22, hPeak: 1.86, rTip: 1.84 },
    { th: 3.08, hPeak: 1.954, rTip: 1.74 },  // Dominant rear (-X) hooked ridge -> top ~ 2.000!
  ];

  for (const hs of hookSpecs) {
    const ca = Math.cos(hs.th), sa = Math.sin(hs.th);
    // Outer dark chitin buttress spine supporting the hook
    const darkSpine = [
      { pos: [ca * 3.25, 0.28, sa * 3.25], rx: 0.26, ry: 0.22 },
      { pos: [ca * 2.95, 1.05, sa * 2.95], rx: 0.22, ry: 0.20 },
      { pos: [ca * 2.52, hs.hPeak * 0.88, sa * 2.52], rx: 0.14, ry: 0.12 },
    ];
    gDark.addTubeAlongSpine(darkSpine, 5, true, true, 0.0);

    // Sweeping lighter-chitin hooked blade arcing up to hPeak and hooking inward/downward toward pool center!
    const ridgeSpine = [
      { pos: [ca * 3.08, 0.52, sa * 3.08], rx: 0.20, ry: 0.18 },
      { pos: [ca * 2.74, hs.hPeak * 0.74, sa * 2.74], rx: 0.22, ry: 0.20 },
      { pos: [ca * 2.28, hs.hPeak, sa * 2.28], rx: 0.15, ry: 0.018 }, // Highest point = hs.hPeak + 0.018!
      { pos: [ca * hs.rTip, hs.hPeak - 0.20, sa * hs.rTip], rx: 0.035, ry: 0.030 }, // Inward hooked tip!
    ];
    gRidge.addTubeAlongSpine(ridgeSpine, 5, true, true, 0.0);
  }

  // Dark bezels on PoolBase for the 4 Surf_TEAM_* pads
  const poolTeamPadSpecs = [
    { name: 'Surf_TEAM_FrontR', th: 0.52, r: 3.02, y: 0.86, tiltOut: 38, rx: 0.44, rz: 0.34 },
    { name: 'Surf_TEAM_FrontL', th: -0.52, r: 3.02, y: 0.86, tiltOut: 38, rx: 0.44, rz: 0.34 },
    { name: 'Surf_TEAM_RearR', th: 2.18, r: 3.04, y: 0.92, tiltOut: 38, rx: 0.46, rz: 0.36 },
    { name: 'Surf_TEAM_RearL', th: -2.22, r: 3.04, y: 0.92, tiltOut: 38, rx: 0.46, rz: 0.36 },
  ];

  for (const tp of poolTeamPadSpecs) {
    const ca = Math.cos(tp.th), sa = Math.sin(tp.th);
    const out = vNorm([ca * 0.72, 0.68, sa * 0.72]); // Tilted toward overhead RTS camera & outward
    const upRef = [0, 1, 0];
    const tX = vNorm(vCross(upRef, out));
    const tZ = vNorm(vCross(out, tX));

    // Helper to stamp oriented hexagonal pad
    const addOrientedHex = (geom, cPos, rX, rZ, thick, bev, domeH) => {
      const bot = [], top = [];
      for (let i = 0; i < 6; i++) {
        const a = (2 * Math.PI * i) / 6 + Math.PI / 6;
        const cx = Math.cos(a), cz = Math.sin(a);
        bot.push(vAdd(cPos, vAdd(vScale(tX, cx * rX), vScale(tZ, cz * rZ))));
        top.push(vAdd(vAdd(cPos, vScale(out, thick)), vAdd(vScale(tX, cx * rX * bev), vScale(tZ, cz * rZ * bev))));
      }
      const cTop = vAdd(cPos, vScale(out, thick + domeH));
      for (let i = 0; i < 6; i++) {
        const j = (i + 1) % 6;
        geom.addQuad(bot[i], bot[j], top[j], top[i], out);
        geom.addTri(cTop, top[j], top[i], out);
        geom.addTri(cPos, bot[i], bot[j], vScale(out, -1));
      }
    };

    const basePos = [ca * tp.r, tp.y, sa * tp.r];
    addOrientedHex(gDark, basePos, tp.rx * 1.18, tp.rz * 1.18, 0.07, 0.85, 0.01);

    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    addOrientedHex(gTeam, vAdd(basePos, vScale(out, 0.03)), tp.rx, tp.rz, 0.08, 0.76, 0.03);
    const tMesh = scene.addMesh(tp.name, [gTeam]);
    scene.addNode({ name: tp.name, meshIndex: tMesh, parentIndex: rootIdx });
  }

  // 3 Surf_GLOW_* team-emissive bioluminescent nodes crowning the +X spillway & rear shrine
  const poolGlowSpecs = [
    { name: 'Surf_GLOW_SpillwayR', pos: [2.72, 1.08, 0.94], r: 0.20 },
    { name: 'Surf_GLOW_SpillwayL', pos: [2.72, 1.08, -0.94], r: 0.20 },
    { name: 'Surf_GLOW_RearApex', pos: [-2.82, 1.28, 0.16], r: 0.22 },
  ];
  for (const gs of poolGlowSpecs) {
    gDark.addOrganicSpheroid({ center: [gs.pos[0], gs.pos[1] - 0.05, gs.pos[2]], radii: [gs.r * 1.25, gs.r * 0.65, gs.r * 1.25], sectors: 7, stacks: 4 });
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addOrganicSpheroid({ center: gs.pos, radii: [gs.r, gs.r * 0.88, gs.r], sectors: 7, stacks: 4 });
    const gMesh = scene.addMesh(gs.name, [gGlow]);
    scene.addNode({ name: gs.name, meshIndex: gMesh, parentIndex: rootIdx });
  }

  const baseMeshIdx = scene.addMesh('PoolCrater_Mesh', [gChitin, gRidge, gDark, gMembrane]);
  scene.addNode({ name: 'PoolCrater', meshIndex: baseMeshIdx, parentIndex: rootIdx });

  // -------------------------------------------------------------------------
  // 3. Luminous Amber-Green Liquid Basin & Caustic Ripples (Animated in 'idle')
  // -------------------------------------------------------------------------
  const gLiquid = new PrimitiveGeom(mats.Mat_AmberGreenLiquid);
  const gCaustic = new PrimitiveGeom(mats.Mat_LiquidCaustic);

  const liqSectors = 16;
  const liqRim = [];
  const liqMid = [];
  for (let s = 0; s < liqSectors; s++) {
    const th = (2 * Math.PI * s) / liqSectors;
    const asym = 1.0 + 0.045 * Math.sin(3 * th + 0.6) + 0.035 * Math.cos(2 * th - 0.5);
    const rL = 2.24 * asym;
    const rM = 1.25 * (1.0 + 0.06 * Math.cos(3 * th - 0.4));
    liqRim.push([Math.cos(th) * rL, 0.0, Math.sin(th) * rL]);
    liqMid.push([Math.cos(th) * rM, 0.035, Math.sin(th) * rM]);
  }
  for (let s = 0; s < liqSectors; s++) {
    const sNext = (s + 1) % liqSectors;
    gLiquid.addQuad(liqMid[s], liqMid[sNext], liqRim[sNext], liqRim[s], [0, 1, 0]);
    gLiquid.addTri([0, 0.055, 0], liqMid[sNext], liqMid[s], [0, 1, 0]);
  }
  const liquidMesh = scene.addMesh('LiquidBasin_Mesh', [gLiquid]);
  const liquidNodeIdx = scene.addNode({
    name: 'LiquidBasin',
    meshIndex: liquidMesh,
    translation: [0, 0.54, 0],
    parentIndex: rootIdx,
  });

  // Floating luminous caustic nutrient rings / froth pads on top of the liquid
  const ripplePods = [
    { x: 0.15, z: -0.10, rx: 0.72, rz: 0.64, h: 0.045 },
    { x: -0.82, z: 0.65, rx: 0.42, rz: 0.36, h: 0.038 },
    { x: 0.85, z: 0.55, rx: 0.36, rz: 0.30, h: 0.035 },
    { x: -0.45, z: -0.95, rx: 0.38, rz: 0.32, h: 0.036 },
  ];
  for (const rp of ripplePods) {
    gCaustic.addBeveledPad({
      center: [rp.x, 0.04, rp.z],
      radiusX: rp.rx,
      radiusZ: rp.rz,
      thickness: rp.h,
      bevel: 0.68,
      sides: 7,
      dome: 0.02,
    });
  }
  const causticMesh = scene.addMesh('LiquidCaustics_Mesh', [gCaustic]);
  const causticNodeIdx = scene.addNode({
    name: 'LiquidCaustics',
    meshIndex: causticMesh,
    translation: [0, 0.55, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 4. Translucent Gestational Cyst Clusters (3 multi-dome alpha-blend clusters)
  // -------------------------------------------------------------------------
  const clusterSpecs = [
    {
      name: 'TranslucentCluster_0',
      pivot: [-0.95, 0.66, 1.62],
      bulbs: [
        { off: [0, 0.18, 0], r: [0.46, 0.42, 0.44], core: true },
        { off: [0.42, 0.10, -0.22], r: [0.32, 0.30, 0.32], core: true },
        { off: [-0.36, 0.08, -0.26], r: [0.28, 0.26, 0.28], core: false },
        { off: [0.10, 0.05, 0.36], r: [0.24, 0.22, 0.24], core: false },
      ],
    },
    {
      name: 'TranslucentCluster_1',
      pivot: [-1.45, 0.68, -1.12],
      bulbs: [
        { off: [0, 0.20, 0], r: [0.48, 0.44, 0.46], core: true },
        { off: [0.38, 0.10, 0.30], r: [0.34, 0.30, 0.32], core: true },
        { off: [-0.32, 0.08, 0.28], r: [0.26, 0.24, 0.26], core: false },
      ],
    },
    {
      name: 'TranslucentCluster_2',
      pivot: [0.85, 0.64, -1.72],
      bulbs: [
        { off: [0, 0.16, 0], r: [0.42, 0.38, 0.40], core: true },
        { off: [-0.38, 0.09, 0.18], r: [0.30, 0.28, 0.30], core: true },
        { off: [0.34, 0.07, 0.22], r: [0.24, 0.22, 0.24], core: false },
      ],
    },
  ];

  const clusterNodeIndices = [];
  for (const cs of clusterSpecs) {
    const gCradle = new PrimitiveGeom(mats.Mat_ChitinDark);
    const gCore = new PrimitiveGeom(mats.Mat_LiquidCaustic);
    const gShell = new PrimitiveGeom(mats.Mat_TranslucentCluster);

    // Dark chitin calyx ring at base of cluster so translucent domes pop crisply against liquid
    gCradle.addOrganicSpheroid({
      center: [0, -0.04, 0],
      radii: [0.62, 0.14, 0.60],
      sectors: 8,
      stacks: 3,
    });

    for (const b of cs.bulbs) {
      if (b.core) {
        gCore.addOrganicSpheroid({
          center: [b.off[0], b.off[1] - 0.02, b.off[2]],
          radii: [b.r[0] * 0.48, b.r[1] * 0.48, b.r[2] * 0.48],
          sectors: 7,
          stacks: 4,
        });
      }
      gShell.addOrganicSpheroid({
        center: b.off,
        radii: b.r,
        sectors: 8,
        stacks: 5,
        wobble: 0.05,
      });
    }
    // Emit opaque cradle & core primitives FIRST, translucent shell LAST so render order is clean
    const cMesh = scene.addMesh(`${cs.name}_Mesh`, [gCradle, gCore, gShell]);
    const cIdx = scene.addNode({
      name: cs.name,
      meshIndex: cMesh,
      translation: cs.pivot,
      parentIndex: rootIdx,
    });
    clusterNodeIndices.push(cIdx);
  }

  // -------------------------------------------------------------------------
  // 5. Subtle Looping 'idle' Animation (2.8s seamless broth tide & cyst pulse)
  // -------------------------------------------------------------------------
  const idleTimes = [0.0, 0.7, 1.4, 2.1, 2.8];
  const idleTracks = [
    {
      nodeIndex: liquidNodeIdx,
      path: 'translation',
      times: idleTimes,
      values: [
        [0, 0.54, 0],
        [0, 0.575, 0],
        [0, 0.54, 0],
        [0, 0.515, 0],
        [0, 0.54, 0],
      ],
    },
    {
      nodeIndex: causticNodeIdx,
      path: 'translation',
      times: idleTimes,
      values: [
        [0, 0.55, 0],
        [0.04, 0.588, 0.03],
        [0, 0.55, 0],
        [-0.04, 0.522, -0.03],
        [0, 0.55, 0],
      ],
    },
    {
      nodeIndex: causticNodeIdx,
      path: 'scale',
      times: idleTimes,
      values: [
        [1.0, 1.0, 1.0],
        [1.035, 1.0, 0.975],
        [1.0, 1.0, 1.0],
        [0.975, 1.0, 1.035],
        [1.0, 1.0, 1.0],
      ],
    },
  ];

  // Staggered organic pulse on the 3 translucent clusters
  const clusterScales = [
    [[1, 1, 1], [1.065, 0.96, 1.065], [1, 1, 1], [0.97, 1.045, 0.97], [1, 1, 1]],
    [[1, 1, 1], [0.97, 1.05, 0.97], [1.06, 0.96, 1.06], [1, 1, 1], [1, 1, 1]],
    [[1, 1, 1], [1, 1, 1], [1.055, 0.965, 1.055], [0.975, 1.04, 0.975], [1, 1, 1]],
  ];
  for (let i = 0; i < clusterNodeIndices.length; i++) {
    idleTracks.push({
      nodeIndex: clusterNodeIndices[i],
      path: 'scale',
      times: idleTimes,
      values: clusterScales[i],
    });
  }

  scene.addAnimation('idle', idleTracks);

  return scene.buildGLB('HatchlingPoolScene');
}

// ---------------------------------------------------------------------------
// Asset 2: bile_warren.glb
// Taller squat burrow of ridged carapace (~7.3 x 3.3 x 7.3, ground Y=0, +X forward),
// with a dark +X ramp mouth, rounded acid sacs, Surf_TEAM_*, Surf_GLOW_*, and 'idle'.
// ---------------------------------------------------------------------------

/**
 * Adds a thick imbricated transverse carapace plate (tergite) in rich Mat_Chitin (#52385c),
 * accented by a narrow raised transverse rib in Mat_ChitinRidge (#986ca4) and a recessed
 * Mat_ChitinDark (#281b30) seam groove so plates overlap solidly with zero gaps.
 */
function addArchedCarapacePlate(gBody, gRidge, gDark, {
  xBack,
  xPeak,
  xFront,
  yFoot,
  yCrown,
  halfZ,
  ridgeLift = 0.16,
  keelBoost = 0.06,
  pivotY = 0.0,
}) {
  const arcSteps = 8;
  const bodySlices = [
    { x: xBack, yMul: 0.88, zMul: 0.90 },
    { x: xPeak, yMul: 1.00, zMul: 1.00 },
    { x: xPeak * 0.35 + xFront * 0.65, yMul: 0.96, zMul: 0.97 },
    { x: xFront, yMul: 0.87, zMul: 0.90 },
  ];

  const evalArchRing = (xPos, yTop, zHalf, keel = 0.0, yUnderOffset = -0.22) => {
    const ring = [];
    for (let i = 0; i <= arcSteps; i++) {
      const u = i / arcSteps; // 0 = +Z right foot, 0.5 = +Y dorsal crown, 1 = -Z left foot
      const ang = u * Math.PI;
      const zFrac = Math.cos(ang);
      const yFrac = Math.sin(ang);
      const z = zFrac * zHalf;
      const dorsalKeel = Math.abs(u - 0.5) < 0.01 ? keel : 0.0;
      const y = yFoot + Math.pow(yFrac, 0.80) * (yTop - yFoot) + dorsalKeel;
      ring.push([xPos, y - pivotY, z]);
    }
    ring.push([xPos, yFoot + yUnderOffset - pivotY, -zHalf * 0.68]);
    ring.push([xPos, yFoot + yUnderOffset - pivotY, zHalf * 0.68]);
    return ring;
  };

  const bodyRings = [];
  const bodyCenters = [];
  for (const sl of bodySlices) {
    bodyRings.push(evalArchRing(sl.x, yCrown * sl.yMul, halfZ * sl.zMul, 0.02));
    bodyCenters.push([sl.x, (yFoot + yCrown * 0.48) - pivotY, 0]);
  }
  gBody.addLoft(bodyRings, bodyCenters, true, true);

  // Narrow raised lighter-chitin transverse rib crest along xPeak (leaves rich purple body exposed!)
  const ribSlices = [
    { x: xPeak - 0.19, lift: -0.02, zPad: -0.02, keel: 0.0 },
    { x: xPeak - 0.05, lift: ridgeLift, zPad: 0.07, keel: keelBoost },
    { x: xPeak + 0.10, lift: ridgeLift * 0.88, zPad: 0.06, keel: keelBoost * 0.8 },
    { x: xPeak + 0.22, lift: -0.02, zPad: -0.02, keel: 0.0 },
  ];
  const ribRings = [];
  const ribCenters = [];
  for (const rs of ribSlices) {
    ribRings.push(evalArchRing(rs.x, yCrown + rs.lift, halfZ + rs.zPad, rs.keel, 0.05));
    ribCenters.push([rs.x, (yFoot + yCrown * 0.56) - pivotY, 0]);
  }
  gRidge.addLoft(ribRings, ribCenters, true, true);

  // Dark recessed inter-plate shadow seam tucked neatly under the front overlap
  const seamBack = evalArchRing(xFront - 0.18, yCrown * 0.90, halfZ * 0.92, 0.0, -0.15);
  const seamFront = evalArchRing(xFront + 0.03, yCrown * 0.85, halfZ * 0.88, 0.0, -0.15);
  gDark.addLoft(
    [seamBack, seamFront],
    [[xFront - 0.18, (yFoot + yCrown * 0.42) - pivotY, 0], [xFront + 0.03, (yFoot + yCrown * 0.40) - pivotY, 0]],
    true,
    true
  );
}

function buildBileWarrenGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createBroodTechMaterials(scene);

  const rootIdx = scene.addNode({ name: 'BileWarren', translation: [0, 0, 0] });

  // -------------------------------------------------------------------------
  // 1. Grounded Squat Burrow Mound & Root Buttresses (WarrenBase, Y = 0.0000)
  // -------------------------------------------------------------------------
  const gBaseChitin = new PrimitiveGeom(mats.Mat_Chitin);
  const gBaseRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gBaseDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gBaseMembrane = new PrimitiveGeom(mats.Mat_BroodMembrane);
  const gMaw = new PrimitiveGeom(mats.Mat_BurrowMaw);

  // Cohesive armored burrow mound indented deeply on +X for the sunken dark ramp mouth
  const moundSectors = 16;
  const moundLevels = [
    { y: 0.000, rX: 3.34, rZ: 3.32 },
    { y: 0.580, rX: 3.08, rZ: 3.04 },
    { y: 1.340, rX: 2.58, rZ: 2.54 },
    { y: 2.020, rX: 1.92, rZ: 1.88 },
  ];
  const moundRings = [];
  const moundCenters = [];
  for (const lv of moundLevels) {
    const ring = [];
    for (let s = 0; s < moundSectors; s++) {
      const th = (2 * Math.PI * s) / moundSectors;
      const ca = Math.cos(th), sa = Math.sin(th);
      // Carve deep +X entrance recess so the dark ramp chute cuts boldly into the burrow!
      const mouthIndent = Math.pow(Math.max(0, ca), 2.4);
      const asym = 1.0 + 0.04 * Math.sin(3 * th + 0.4);
      const rx = lv.rX * asym * (1.0 - 0.48 * mouthIndent);
      const rz = lv.rZ * asym;
      ring.push([ca * Math.max(0.85, rx) - 0.22, lv.y, sa * rz]);
    }
    moundRings.push(ring);
    moundCenters.push([-0.22, lv.y + 0.01, 0]);
  }
  gBaseMembrane.addLoft(moundRings, moundCenters, true, true);

  // Armored lower-flank chitin skirt plates around the burrow mound so base reads rich purple-brown
  for (const th of [1.15, -1.15, 2.05, -2.05, Math.PI]) {
    const ca = Math.cos(th), sa = Math.sin(th);
    gBaseChitin.addTubeAlongSpine(
      [
        { pos: [ca * 2.95 - 0.20, 0.22, sa * 2.95], rx: 0.58, ry: 0.20 },
        { pos: [ca * 2.55 - 0.20, 0.92, sa * 2.55], rx: 0.52, ry: 0.26 },
        { pos: [ca * 2.05 - 0.20, 1.55, sa * 2.05], rx: 0.34, ry: 0.18 },
      ],
      6,
      true,
      true,
      0.0
    );
  }

  // 8 Grounded Chitin Root Buttresses anchoring ~7.30 x 7.30 footprint ([-3.64, +3.64])
  const warrenRoots = [
    { x0: 1.85, z0: 1.52, x1: 3.625, z1: 1.34, h0: 0.92 },   // +X right ramp mandible spur (+3.647)
    { x0: 1.85, z0: -1.52, x1: 3.625, z1: -1.34, h0: 0.92 }, // +X left ramp mandible spur (+3.647)
    { x0: 0.30, z0: 2.68, x1: 0.40, z1: 3.625, h0: 0.86 },   // +Z flank anchor (+3.647)
    { x0: 0.30, z0: -2.68, x1: 0.40, z1: -3.625, h0: 0.86 }, // -Z flank anchor (-3.647)
    { x0: -1.95, z0: 2.25, x1: -2.68, z1: 2.98, h0: 0.80 },
    { x0: -1.95, z0: -2.25, x1: -2.68, z1: -2.98, h0: 0.80 },
    { x0: -2.75, z0: 0.65, x1: -3.625, z1: 0.82, h0: 0.88 }, // -X rear anchor (-3.647)
    { x0: -2.75, z0: -0.65, x1: -3.625, z1: -0.82, h0: 0.88 },
  ];
  for (let i = 0; i < warrenRoots.length; i++) {
    const rt = warrenRoots[i];
    const spine = [
      { pos: [rt.x0, rt.h0, rt.z0], rx: 0.30, ry: 0.24 },
      { pos: [(rt.x0 + rt.x1) * 0.52, rt.h0 * 0.40, (rt.z0 + rt.z1) * 0.52], rx: 0.20, ry: 0.14 },
      { pos: [rt.x1, 0.022, rt.z1], rx: 0.022, ry: 0.022 },
    ];
    (i < 2 ? gBaseChitin : gBaseDark).addTubeAlongSpine(spine, 5, true, true, 0.0);
  }

  // -------------------------------------------------------------------------
  // 2. Bold Dark +X Ramp Mouth (Wide Sunken Dark Chute + Cavernous Throat + Mandibles)
  // -------------------------------------------------------------------------
  // Outer ramp foundation & dark ramp chute extending clearly to +X (x = 3.62, z in [-1.28, +1.28])
  const rampBaseRings = [
    [[3.62, 0.000, 1.28], [3.62, 0.000, -1.28], [3.48, 0.075, -1.18], [3.48, 0.075, 1.18]],
    [[2.45, 0.000, 1.32], [2.45, 0.000, -1.32], [2.45, 0.165, -1.16], [2.45, 0.165, 1.16]],
    [[0.65, 0.000, 1.20], [0.65, 0.000, -1.20], [0.65, 0.080, -1.06], [0.65, 0.080, 1.06]],
  ];
  gBaseDark.addLoft(rampBaseRings, [[3.55, 0.03, 0], [2.45, 0.08, 0], [0.65, 0.04, 0]], true, true);

  // Wide pitch-black sunken ramp surface plunging down from x=3.46 into the dark burrow maw (x=0.68)!
  const mawRampRings = [
    [[3.46, 0.078, 1.04], [3.46, 0.078, -1.04], [3.46, 0.098, -1.00], [3.46, 0.098, 1.00]],
    [[2.45, 0.168, 1.06], [2.45, 0.168, -1.06], [2.45, 0.192, -1.02], [2.45, 0.192, 1.02]],
    [[1.35, 0.110, 1.02], [1.35, 0.110, -1.02], [1.35, 0.135, -0.98], [1.35, 0.135, 0.98]],
    [[0.68, 0.055, 0.96], [0.68, 0.055, -0.96], [0.68, 0.085, -0.92], [0.68, 0.085, 0.92]],
  ];
  gMaw.addLoft(
    mawRampRings,
    [[3.46, 0.088, 0], [2.45, 0.18, 0], [1.35, 0.12, 0], [0.68, 0.07, 0]],
    true,
    true
  );

  // 4 Crisp Chitin Traction Ribs across the dark ramp floor so it reads instantly as a RAMP!
  for (const [rx, ry] of [[3.22, 0.12], [2.74, 0.18], [2.22, 0.18], [1.72, 0.15]]) {
    gBaseRidge.addTubeAlongSpine(
      [
        { pos: [rx, ry, -0.96], rx: 0.065, ry: 0.048 },
        { pos: [rx + 0.05, ry + 0.015, 0.0], rx: 0.075, ry: 0.055 },
        { pos: [rx, ry, 0.96], rx: 0.065, ry: 0.048 },
      ],
      5,
      true,
      true,
      0.0
    );
  }

  // Huge pitch-black cavernous arched burrow mouth & inner side walls (X = 0.55 .. 1.98, Y = 0.08 .. 2.12)
  const mawArchSteps = 8;
  const mawFrontRing = [];
  const mawBackRing = [];
  for (let i = 0; i <= mawArchSteps; i++) {
    const ang = (i / mawArchSteps) * Math.PI;
    const z = Math.cos(ang) * 1.16;
    const y = 0.10 + Math.pow(Math.sin(ang), 0.72) * 2.02;
    mawFrontRing.push([1.96 - Math.sin(ang) * 0.22, y, z]);
    mawBackRing.push([0.52, y * 0.92, z * 0.90]);
  }
  mawFrontRing.push([1.96, 0.08, -1.16]);
  mawFrontRing.push([1.96, 0.08, 1.16]);
  mawBackRing.push([0.52, 0.08, -1.02]);
  mawBackRing.push([0.52, 0.08, 1.02]);
  gMaw.addLoft([mawBackRing, mawFrontRing], [[0.52, 0.95, 0], [1.85, 0.95, 0]], true, true);

  // Heavy flanking ramp chute walls & sweeping forward mandible tusks framing the dark ramp mouth!
  for (const side of [-1, 1]) {
    // Inner dark shadow lining wall along the ramp chute so the mouth reads dark even from +/-Z RTS angles!
    gMaw.addTubeAlongSpine(
      [
        { pos: [3.32, 0.20, side * 1.08], rx: 0.14, ry: 0.16 },
        { pos: [2.42, 0.52, side * 1.12], rx: 0.18, ry: 0.36 },
        { pos: [1.72, 1.02, side * 1.12], rx: 0.20, ry: 0.56 },
      ],
      5,
      true,
      true,
      0.0
    );

    // Outer armored purple chitin ramp cheek wall connecting solidly up into the brow hood!
    gBaseChitin.addTubeAlongSpine(
      [
        { pos: [3.48, 0.18, side * 1.26], rx: 0.24, ry: 0.18 },
        { pos: [2.58, 0.62, side * 1.36], rx: 0.34, ry: 0.34 },
        { pos: [1.72, 1.28, side * 1.36], rx: 0.42, ry: 0.42 },
        { pos: [1.38, 1.98, side * 0.92], rx: 0.38, ry: 0.34 },
      ],
      6,
      true,
      true,
      0.0
    );

    // Sweeping lighter-chitin mandible tusk framing the +X ramp entrance
    gBaseRidge.addTubeAlongSpine(
      [
        { pos: [1.95, 0.78, side * 1.48], rx: 0.26, ry: 0.22 },
        { pos: [2.78, 0.96, side * 1.46], rx: 0.18, ry: 0.16 },
        { pos: [3.42, 1.18, side * 1.16], rx: 0.055, ry: 0.055 },
      ],
      5,
      true,
      true,
      0.0
    );
  }

  // Surf_GLOW_MawR & Surf_GLOW_MawL bioluminescent gate beacons flanking the ramp mouth
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'Surf_GLOW_MawR' : 'Surf_GLOW_MawL';
    const gPos = [2.28, 1.22, side * 1.44];
    gBaseDark.addOrganicSpheroid({
      center: [gPos[0] - 0.04, gPos[1] - 0.03, gPos[2]],
      radii: [0.25, 0.22, 0.25],
      sectors: 7,
      stacks: 4,
    });
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addOrganicSpheroid({
      center: gPos,
      radii: [0.20, 0.19, 0.20],
      sectors: 7,
      stacks: 4,
    });
    const gMesh = scene.addMesh(tag, [gGlow]);
    scene.addNode({ name: tag, meshIndex: gMesh, parentIndex: rootIdx });
  }

  // -------------------------------------------------------------------------
  // 3. Ridged Carapace Roof (CarapaceHood node, 4 overlapping arched plates + dorsal spines!)
  //    Peak dorsal crest reaches exact world Y = 3.3000!
  // -------------------------------------------------------------------------
  const hoodPivotY = 1.10;
  const gHoodBody = new PrimitiveGeom(mats.Mat_Chitin);
  const gHoodRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gHoodDark = new PrimitiveGeom(mats.Mat_ChitinDark);

  // Plate 0: Rear tail-shield carapace arch
  addArchedCarapacePlate(gHoodBody, gHoodRidge, gHoodDark, {
    xBack: -3.02, xPeak: -2.38, xFront: -1.48,
    yFoot: 0.62, yCrown: 2.04, halfZ: 1.88,
    ridgeLift: 0.16, keelBoost: 0.05, pivotY: hoodPivotY,
  });

  // Plate 1: Broad mid-rear carapace arch
  addArchedCarapacePlate(gHoodBody, gHoodRidge, gHoodDark, {
    xBack: -1.94, xPeak: -1.18, xFront: -0.22,
    yFoot: 0.78, yCrown: 2.66, halfZ: 2.24,
    ridgeLift: 0.18, keelBoost: 0.06, pivotY: hoodPivotY,
  });

  // Plate 2: Tall dominant thorax carapace arch (rib top = 3.04 + 0.18 + 0.08 = exact 3.3000!)
  addArchedCarapacePlate(gHoodBody, gHoodRidge, gHoodDark, {
    xBack: -0.74, xPeak: 0.08, xFront: 1.22,
    yFoot: 0.90, yCrown: 3.04, halfZ: 2.20,
    ridgeLift: 0.18, keelBoost: 0.08, pivotY: hoodPivotY,
  });

  // Plate 3: Solidly overlapping forward +X ramp-mouth brow hood (overhangs dark maw cleanly!)
  addArchedCarapacePlate(gHoodBody, gHoodRidge, gHoodDark, {
    xBack: 0.62, xPeak: 1.48, xFront: 2.38,
    yFoot: 0.96, yCrown: 2.50, halfZ: 1.78,
    ridgeLift: 0.16, keelBoost: 0.06, pivotY: hoodPivotY,
  });

  // Longitudinal serrated dorsal spine ridge along Z = 0 linking the 4 plates (clamped <= 3.30)
  gHoodRidge.addTubeAlongSpine(
    [
      { pos: [-2.85, 1.92 - hoodPivotY, 0], rx: 0.12, ry: 0.08 },
      { pos: [-1.25, 2.76 - hoodPivotY, 0], rx: 0.16, ry: 0.12 },
      { pos: [0.05, 3.16 - hoodPivotY, 0], rx: 0.18, ry: 0.13 },
      { pos: [1.45, 2.60 - hoodPivotY, 0], rx: 0.15, ry: 0.10 },
      { pos: [2.36, 2.18 - hoodPivotY, 0], rx: 0.08, ry: 0.06 },
    ],
    5,
    true,
    true
  );

  // Paired dorso-lateral longitudinal carapace keels accentuating the ridged beetle-burrow silhouette
  for (const side of [-1, 1]) {
    gHoodDark.addTubeAlongSpine(
      [
        { pos: [-2.45, 1.62 - hoodPivotY, side * 1.12], rx: 0.11, ry: 0.09 },
        { pos: [-1.05, 2.24 - hoodPivotY, side * 1.32], rx: 0.13, ry: 0.11 },
        { pos: [0.22, 2.52 - hoodPivotY, side * 1.28], rx: 0.13, ry: 0.11 },
        { pos: [1.55, 2.08 - hoodPivotY, side * 1.06], rx: 0.10, ry: 0.08 },
      ],
      5,
      true,
      true
    );
  }

  const hoodNodeIdx = scene.addNode({
    name: 'CarapaceHood',
    translation: [0, hoodPivotY, 0],
    parentIndex: rootIdx,
  });

  // 4 Integrated Surf_TEAM_* Armored Carapace War-Plates with dark recessed bezels
  const warrenTeamSpecs = [
    { name: 'Surf_TEAM_BrowR', pos: [1.04, 2.34 - hoodPivotY, 1.24], out: [0.26, 0.68, 0.68], rx: 0.48, rz: 0.34 },
    { name: 'Surf_TEAM_BrowL', pos: [1.04, 2.34 - hoodPivotY, -1.24], out: [0.26, 0.68, -0.68], rx: 0.48, rz: 0.34 },
    { name: 'Surf_TEAM_FlankR', pos: [-0.76, 2.42 - hoodPivotY, 1.52], out: [-0.08, 0.66, 0.74], rx: 0.54, rz: 0.36 },
    { name: 'Surf_TEAM_FlankL', pos: [-0.76, 2.42 - hoodPivotY, -1.52], out: [-0.08, 0.66, -0.74], rx: 0.54, rz: 0.36 },
  ];

  for (const ts of warrenTeamSpecs) {
    const out = vNorm(ts.out);
    const tX = vNorm(vCross([0, 1, 0], out));
    const tZ = vNorm(vCross(out, tX));

    const addHex = (geom, cPos, rX, rZ, thick, bev, domeH) => {
      const bot = [], top = [];
      for (let i = 0; i < 6; i++) {
        const a = (2 * Math.PI * i) / 6 + Math.PI / 6;
        const cx = Math.cos(a), cz = Math.sin(a);
        bot.push(vAdd(cPos, vAdd(vScale(tX, cx * rX), vScale(tZ, cz * rZ))));
        top.push(vAdd(vAdd(cPos, vScale(out, thick)), vAdd(vScale(tX, cx * rX * bev), vScale(tZ, cz * rZ * bev))));
      }
      const cTop = vAdd(cPos, vScale(out, thick + domeH));
      for (let i = 0; i < 6; i++) {
        const j = (i + 1) % 6;
        geom.addQuad(bot[i], bot[j], top[j], top[i], out);
        geom.addTri(cTop, top[j], top[i], out);
        geom.addTri(cPos, bot[i], bot[j], vScale(out, -1));
      }
    };

    addHex(gHoodDark, ts.pos, ts.rx * 1.18, ts.rz * 1.18, 0.08, 0.85, 0.01);

    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    addHex(gTeam, vAdd(ts.pos, vScale(out, 0.035)), ts.rx, ts.rz, 0.09, 0.76, 0.035);
    const tMesh = scene.addMesh(ts.name, [gTeam]);
    scene.addNode({ name: ts.name, meshIndex: tMesh, parentIndex: hoodNodeIdx });
  }

  // Surf_GLOW_Dorsal beacon nestled in a dark chitin socket behind the main hump
  gHoodDark.addOrganicSpheroid({
    center: [-1.82, 2.40 - hoodPivotY, 0],
    radii: [0.30, 0.16, 0.30],
    sectors: 7,
    stacks: 4,
  });
  const gDorsalGlow = new PrimitiveGeom(mats.Surf_GLOW);
  gDorsalGlow.addOrganicSpheroid({
    center: [-1.82, 2.50 - hoodPivotY, 0],
    radii: [0.22, 0.20, 0.22],
    sectors: 7,
    stacks: 4,
  });
  const dorsalGlowMesh = scene.addMesh('Surf_GLOW_Dorsal', [gDorsalGlow]);
  scene.addNode({ name: 'Surf_GLOW_Dorsal', meshIndex: dorsalGlowMesh, parentIndex: hoodNodeIdx });

  const hoodMeshIdx = scene.addMesh('CarapaceHood_Mesh', [gHoodBody, gHoodRidge, gHoodDark]);
  scene.nodes[hoodNodeIdx].mesh = hoodMeshIdx;

  // -------------------------------------------------------------------------
  // 4. Plump Rounded Acid Sacs (5 socketed corrosive globes on flanks & rear!)
  // -------------------------------------------------------------------------
  const sacSpecs = [
    { name: 'AcidSac_RightMain', pivot: [0.10, 0.98, 2.36], radii: [0.90, 0.86, 0.84], outDir: [0.05, 0.55, 0.83] },
    { name: 'AcidSac_RightRear', pivot: [-1.38, 0.88, 2.08], radii: [0.74, 0.70, 0.70], outDir: [-0.35, 0.55, 0.75] },
    { name: 'AcidSac_LeftMain', pivot: [-0.18, 0.96, -2.34], radii: [0.88, 0.84, 0.82], outDir: [-0.05, 0.55, -0.83] },
    { name: 'AcidSac_LeftFront', pivot: [1.08, 0.82, -1.98], radii: [0.68, 0.66, 0.66], outDir: [0.35, 0.55, -0.75] },
    { name: 'AcidSac_Rear', pivot: [-2.48, 0.92, -0.48], radii: [0.82, 0.78, 0.78], outDir: [-0.82, 0.55, -0.18] },
  ];

  const sacNodeIndices = [];
  for (const ss of sacSpecs) {
    // Dark chitin socket cup anchored on WarrenBase so each sac erupts organically from the burrow!
    const outN = vNorm(ss.outDir);
    gBaseDark.addOrganicSpheroid({
      center: vAdd(ss.pivot, vScale(outN, -0.24)),
      radii: [ss.radii[0] * 1.06, ss.radii[1] * 0.72, ss.radii[2] * 1.06],
      sectors: 9,
      stacks: 4,
      minYClamp: 0.0,
    });

    const gSac = new PrimitiveGeom(mats.Mat_AcidSac);
    const gSacCap = new PrimitiveGeom(mats.Mat_AmberGreenLiquid);
    const gSacNucleus = new PrimitiveGeom(mats.Mat_LiquidCaustic);
    const gClaws = new PrimitiveGeom(mats.Mat_ChitinDark);

    // Main plump rounded acid sac globe
    gSac.addOrganicSpheroid({
      center: [0, 0, 0],
      radii: ss.radii,
      sectors: 10,
      stacks: 6,
      wobble: 0.025,
    });

    // Luminous upper-outer pressurized bile meniscus blister
    const capOff = [outN[0] * ss.radii[0] * 0.26, ss.radii[1] * 0.34, outN[2] * ss.radii[2] * 0.26];
    gSacCap.addOrganicSpheroid({
      center: capOff,
      radii: [ss.radii[0] * 0.66, ss.radii[1] * 0.60, ss.radii[2] * 0.66],
      sectors: 9,
      stacks: 5,
    });

    // Bright amber-gold apex spot for extra visual pop at RTS zoom
    gSacNucleus.addOrganicSpheroid({
      center: [capOff[0] * 1.35, ss.radii[1] * 0.62, capOff[2] * 1.35],
      radii: [ss.radii[0] * 0.30, ss.radii[1] * 0.24, ss.radii[2] * 0.30],
      sectors: 7,
      stacks: 4,
    });

    // Twin curved chitinous retaining ribs gripping the lower flanks of the sac cleanly on its surface
    const sideTang = vNorm(vCross([0, 1, 0], outN));
    for (const clawSide of [-1, 1]) {
      const clawDir = vNorm(vAdd(vScale(outN, 0.72), vScale(sideTang, clawSide * 0.68)));
      const clawSpine = [
        {
          pos: [-outN[0] * ss.radii[0] * 0.35, -ss.radii[1] * 0.52, -outN[2] * ss.radii[2] * 0.35],
          rx: 0.12,
          ry: 0.10,
        },
        {
          pos: [clawDir[0] * ss.radii[0] * 0.94, -ss.radii[1] * 0.12, clawDir[2] * ss.radii[2] * 0.94],
          rx: 0.09,
          ry: 0.075,
        },
        {
          pos: [clawDir[0] * ss.radii[0] * 0.82, ss.radii[1] * 0.36, clawDir[2] * ss.radii[2] * 0.82],
          rx: 0.038,
          ry: 0.032,
        },
      ];
      gClaws.addTubeAlongSpine(clawSpine, 5, true, true);
    }

    const sMesh = scene.addMesh(`${ss.name}_Mesh`, [gSac, gSacCap, gSacNucleus, gClaws]);
    const sIdx = scene.addNode({
      name: ss.name,
      meshIndex: sMesh,
      translation: ss.pivot,
      parentIndex: rootIdx,
    });
    sacNodeIndices.push(sIdx);
  }

  // Emit WarrenBase AFTER adding the acid-sac socket cups to gBaseDark!
  const warrenBaseMesh = scene.addMesh('WarrenBase_Mesh', [gBaseChitin, gBaseRidge, gBaseDark, gBaseMembrane, gMaw]);
  scene.addNode({ name: 'WarrenBase', meshIndex: warrenBaseMesh, parentIndex: rootIdx });

  // -------------------------------------------------------------------------
  // 5. Subtle Looping 'idle' Animation (2.6s carapace breath + churning acid sacs)
  // -------------------------------------------------------------------------
  const wTimes = [0.0, 0.65, 1.30, 1.95, 2.60];
  const wTracks = [
    {
      nodeIndex: hoodNodeIdx,
      path: 'translation',
      times: wTimes,
      values: [
        [0, hoodPivotY, 0],
        [0, hoodPivotY + 0.028, 0],
        [0, hoodPivotY, 0],
        [0, hoodPivotY - 0.018, 0],
        [0, hoodPivotY, 0],
      ],
    },
    {
      nodeIndex: hoodNodeIdx,
      path: 'rotation',
      times: wTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -0.8),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 0.6),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
  ];

  const sacPulses = [
    [[1, 1, 1], [1.075, 0.945, 1.075], [0.97, 1.045, 0.97], [1.03, 0.98, 1.03], [1, 1, 1]],
    [[1, 1, 1], [0.965, 1.05, 0.965], [1.07, 0.95, 1.07], [1, 1, 1], [1, 1, 1]],
    [[1, 1, 1], [1.04, 0.97, 1.04], [0.965, 1.05, 0.965], [1.07, 0.95, 1.07], [1, 1, 1]],
    [[1, 1, 1], [1, 1, 1], [1.065, 0.955, 1.065], [0.97, 1.045, 0.97], [1, 1, 1]],
    [[1, 1, 1], [0.97, 1.045, 0.97], [1.035, 0.975, 1.035], [1.065, 0.955, 1.065], [1, 1, 1]],
  ];
  for (let i = 0; i < sacNodeIndices.length; i++) {
    wTracks.push({
      nodeIndex: sacNodeIndices[i],
      path: 'scale',
      times: wTimes,
      values: sacPulses[i],
    });
  }

  scene.addAnimation('idle', wTracks);

  return scene.buildGLB('BileWarrenScene');
}

// ---------------------------------------------------------------------------
// Self-Validation Summary & CLI Entry Point
// ---------------------------------------------------------------------------

function summarizeTechAsset(filename, glbBuffer, gltf) {
  let totalVerts = 0;
  let totalTris = 0;
  const globalMin = [Infinity, Infinity, Infinity];
  const globalMax = [-Infinity, -Infinity, -Infinity];

  const walk = (nodeIdx, parentPos, parentScale) => {
    const node = gltf.nodes[nodeIdx];
    const t = node.translation || [0, 0, 0];
    const s = node.scale || [1, 1, 1];
    const wPos = [
      parentPos[0] + t[0] * parentScale[0],
      parentPos[1] + t[1] * parentScale[1],
      parentPos[2] + t[2] * parentScale[2],
    ];
    const wScale = [
      parentScale[0] * s[0],
      parentScale[1] * s[1],
      parentScale[2] * s[2],
    ];

    if (node.mesh !== undefined) {
      const mesh = gltf.meshes[node.mesh];
      for (const prim of mesh.primitives) {
        const posAcc = gltf.accessors[prim.attributes.POSITION];
        const idxAcc = gltf.accessors[prim.indices];
        totalVerts += posAcc.count;
        totalTris += idxAcc.count / 3;
        for (let k = 0; k < 3; k++) {
          const pMin = wPos[k] + posAcc.min[k] * wScale[k];
          const pMax = wPos[k] + posAcc.max[k] * wScale[k];
          globalMin[k] = Math.min(globalMin[k], pMin, pMax);
          globalMax[k] = Math.max(globalMax[k], pMin, pMax);
        }
      }
    }
    if (node.children) {
      for (const ch of node.children) walk(ch, wPos, wScale);
    }
  };

  for (const rIdx of gltf.scenes[0].nodes) {
    walk(rIdx, [0, 0, 0], [1, 1, 1]);
  }

  return {
    filename,
    bytes: glbBuffer.length,
    verts: totalVerts,
    tris: totalTris,
    min: globalMin.map((v) => Number(v.toFixed(4))),
    max: globalMax.map((v) => Number(v.toFixed(4))),
    size: [
      Number((globalMax[0] - globalMin[0]).toFixed(4)),
      Number((globalMax[1] - globalMin[1]).toFixed(4)),
      Number((globalMax[2] - globalMin[2]).toFixed(4)),
    ],
    teamNodes: gltf.nodes.filter((n) => n.name.startsWith('Surf_TEAM_')).map((n) => n.name),
    glowNodes: gltf.nodes.filter((n) => n.name.startsWith('Surf_GLOW_')).map((n) => n.name),
    animations: (gltf.animations || []).map((a) => a.name),
  };
}

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
  fs.mkdirSync(outDir, { recursive: true });

  const pool = buildHatchlingPoolGLB();
  fs.writeFileSync(path.join(outDir, 'hatchling_pool.glb'), pool.glb);

  const warren = buildBileWarrenGLB();
  fs.writeFileSync(path.join(outDir, 'bile_warren.glb'), warren.glb);

  const summary = [
    summarizeTechAsset('hatchling_pool.glb', pool.glb, pool.gltf),
    summarizeTechAsset('bile_warren.glb', warren.glb, warren.gltf),
  ];

  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildHatchlingPoolGLB,
  buildBileWarrenGLB,
};
