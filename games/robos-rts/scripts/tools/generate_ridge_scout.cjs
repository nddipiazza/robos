#!/usr/bin/env node
/**
 * Starfall Command — Meridian Guard "Ridge Scout" Low-Poly GLB Generator
 *
 * Deterministically generates `ridge_scout.glb` using only built-in Node.js modules:
 *   - Fast Meridian Guard armored cliff-jumping reconnaissance trooper
 *   - Leaner, more mobile silhouette than the Rifleman
 *   - Twin industrial recon pistols + Muzzle and MuzzleLeft sockets
 *   - Compact twin-nozzle jump pack on upper back
 *   - Integrated visored recon helmet
 *   - Worn graphite industrial armor + team panels named Surf_TEAM_*
 *   - Distinct articulated leg rig (Pelvis -> ThighR/L -> ShinR/L -> FootR/L)
 *   - Gameplay scale: 1.20 world units tall, ground Y = 0, forward +X
 *   - 5 baked node animation clips: idle, run, jump, fire, throw
 *
 * Usage:
 *   node generate_ridge_scout.cjs [output_dir]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Vector, Transform & Color Math
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

/**
 * Intrinsic XYZ Euler degrees -> unit quaternion [x, y, z, w] matching rotateVecByEulerXYZ
 * (applies X roll first, then Y yaw, then Z pitch: q = qZ * qY * qX).
 */
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
// Flat-Shaded Low-Poly Geometry Builder (Compact Shared-Quad Buffers)
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

  /**
   * Emits a flat-shaded quad. Shares 4 vertices (instead of 6) when planar,
   * reducing binary GLB size while preserving crisp flat normals.
   */
  addQuad(v0, v1, v2, v3, outwardHint = null) {
    let a = v0, b = v1, c = v2, d = v3;
    let cr1 = vCross(vSub(b, a), vSub(c, a));
    let cr2 = vCross(vSub(c, a), vSub(d, a));
    const l1 = vLen(cr1);
    const l2 = vLen(cr2);
    if (l1 < 1e-10 || l2 < 1e-10) {
      this.addTri(v0, v1, v2, outwardHint);
      this.addTri(v0, v2, v3, outwardHint);
      return;
    }
    const avgCr = vAdd(cr1, cr2);
    if (outwardHint && vDot(avgCr, outwardHint) < 0) {
      // Flip winding a -> d -> c -> b
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

  /**
   * Builds a closed lofted low-poly form from cross-section rings.
   */
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
      const hint = vLen(axisStart) > 1e-6 ? axisStart : rotateVecByEulerXYZ([0, -1, 0], rotDeg[0], rotDeg[1], rotDeg[2]);
      if (M === 4) {
        this.addQuad(xfRings[0][3], xfRings[0][2], xfRings[0][1], xfRings[0][0], hint);
      } else {
        for (let i = 0; i < M; i++) {
          const inext = (i + 1) % M;
          this.addTri(avg, xfRings[0][inext], xfRings[0][i], hint);
        }
      }
    }

    if (capEnd) {
      const last = R - 1;
      let avg = [0, 0, 0];
      for (const p of xfRings[last]) avg = vAdd(avg, p);
      avg = vScale(avg, 1 / M);
      const axisEnd = vSub(xfCenters[last], xfCenters[last - 1]);
      const hint = vLen(axisEnd) > 1e-6 ? axisEnd : rotateVecByEulerXYZ([0, 1, 0], rotDeg[0], rotDeg[1], rotDeg[2]);
      if (M === 4) {
        this.addQuad(xfRings[last][0], xfRings[last][1], xfRings[last][2], xfRings[last][3], hint);
      } else {
        for (let i = 0; i < M; i++) {
          const inext = (i + 1) % M;
          this.addTri(avg, xfRings[last][i], xfRings[last][inext], hint);
        }
      }
    }
  }

  /**
   * Adds a tapered industrial prism (box with independent bottom & top X/Z extents and offsets).
   * Only 6 planar quads (24 vertices, 12 triangles) for crisp flat-shaded industrial armor!
   */
  addTaperedBox({
    y0,
    y1,
    bx0, bx1, bz0, bz1, // bottom minX, maxX, minZ, maxZ
    tx0, tx1, tz0, tz1, // top minX, maxX, minZ, maxZ
    pos = [0, 0, 0],
    rotDeg = [0, 0, 0],
    capBottom = true,
    capTop = true,
  }) {
    const r0 = [
      [bx1, y0, bz1],
      [bx1, y0, bz0],
      [bx0, y0, bz0],
      [bx0, y0, bz1],
    ];
    const r1 = [
      [tx1, y1, tz1],
      [tx1, y1, tz0],
      [tx0, y1, tz0],
      [tx0, y1, tz1],
    ];
    const c0 = [(bx0 + bx1) * 0.5, y0, (bz0 + bz1) * 0.5];
    const c1 = [(tx0 + tx1) * 0.5, y1, (tz0 + tz1) * 0.5];
    this.addLoft([r0, r1], [c0, c1], capBottom, capTop, pos, rotDeg);
  }

  /**
   * Adds a simple centered box.
   */
  addBox(size, pos = [0, 0, 0], rotDeg = [0, 0, 0]) {
    const [sx, sy, sz] = size.map((v) => v * 0.5);
    this.addTaperedBox({
      y0: -sy, y1: sy,
      bx0: -sx, bx1: sx, bz0: -sz, bz1: sz,
      tx0: -sx, tx1: sx, tz0: -sz, tz1: sz,
      pos, rotDeg,
    });
  }

  /**
   * Adds a low-poly faceted cylinder / frustum along local Y, then transformed by pos/rotDeg.
   */
  addFrustum({ rBotX, rBotZ, rTopX, rTopZ, y0, y1, sides = 6, capBot = true, capTop = true, pos = [0, 0, 0], rotDeg = [0, 0, 0] }) {
    const ring0 = [];
    const ring1 = [];
    for (let i = 0; i < sides; i++) {
      const a = (2 * Math.PI * i) / sides + Math.PI / sides;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      ring0.push([ca * rBotX, y0, sa * rBotZ]);
      ring1.push([ca * rTopX, y1, sa * rTopZ]);
    }
    this.addLoft([ring0, ring1], [[0, y0, 0], [0, y1, 0]], capBot, capTop, pos, rotDeg);
  }

  /**
   * Adds a compact 8-face low-poly octahedron joint ball for seamless limb articulation
   * with minimal triangle count (8 tris, 24 verts).
   */
  addJointBall(radius, pos = [0, 0, 0], scale = [1, 1, 1]) {
    const rx = radius * scale[0];
    const ry = radius * scale[1];
    const rz = radius * scale[2];
    const top = vAdd(pos, [0, ry, 0]);
    const bot = vAdd(pos, [0, -ry, 0]);
    const ring = [
      vAdd(pos, [rx, 0, 0]),
      vAdd(pos, [0, 0, rz]),
      vAdd(pos, [-rx, 0, 0]),
      vAdd(pos, [0, 0, -rz]),
    ];
    for (let i = 0; i < 4; i++) {
      const inext = (i + 1) % 4;
      const midTop = vSub(vScale(vAdd(top, vAdd(ring[i], ring[inext])), 1 / 3), pos);
      const midBot = vSub(vScale(vAdd(bot, vAdd(ring[i], ring[inext])), 1 / 3), pos);
      this.addTri(top, ring[inext], ring[i], midTop);
      this.addTri(bot, ring[i], ring[inext], midBot);
    }
  }

  /**
   * Adds a tapered prism extending horizontally along +X (from x0 to x1),
   * with independent rear (x0) and front (x1) Y/Z extents.
   */
  addForwardTaperedBox({
    x0, x1,
    ry0, ry1, rz0, rz1, // rear (x0) minY, maxY, minZ, maxZ
    fy0, fy1, fz0, fz1, // front (x1) minY, maxY, minZ, maxZ
    pos = [0, 0, 0],
    rotDeg = [0, 0, 0],
  }) {
    const r0 = [
      [x0, ry0, rz1],
      [x0, ry0, rz0],
      [x0, ry1, rz0],
      [x0, ry1, rz1],
    ];
    const r1 = [
      [x1, fy0, fz1],
      [x1, fy0, fz0],
      [x1, fy1, fz0],
      [x1, fy1, fz1],
    ];
    const c0 = [x0, (ry0 + ry1) * 0.5, (rz0 + rz1) * 0.5];
    const c1 = [x1, (fy0 + fy1) * 0.5, (fz0 + fz1) * 0.5];
    this.addLoft([r0, r1], [c0, c1], true, true, pos, rotDeg);
  }
}

// ---------------------------------------------------------------------------
// glTF 2.0 Binary (.glb) Scene Assembler
// ---------------------------------------------------------------------------

class GLBSceneBuilder {
  constructor(generatorName = 'Starfall Meridian Guard Ridge Scout GLB Generator') {
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
    metallic = 0.2,
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
    if (meshIndex !== null && meshIndex !== undefined) {
      node.mesh = meshIndex;
    }
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

      // Share timestamp accessors within an animation when keyframe times match
      const timeCache = new Map();
      const getTimeAccessor = (times) => {
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
        const timeAcc = getTimeAccessor(tr.times);
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
      // Strip identity TRS only if not targeted by animations? Keeping explicit clean TRS is tiny & safe!
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
// Ridge Scout Materials & Part Builders
// ---------------------------------------------------------------------------

function createRidgeScoutMaterials(scene) {
  // Team-color material (Meridian Guard default blue #4f8cf0, bright & readable from RTS zoom)
  const Surf_TEAM = scene.addMaterial({
    name: 'Surf_TEAM_Mat',
    baseColorHex: '#4f8cf0',
    metallic: 0.22,
    roughness: 0.36,
    emissiveHex: '#3b7be8',
    emissiveBoost: 0.38,
  });

  // Primary worn matte graphite-slate armor plating
  const Mat_Graphite = scene.addMaterial({
    name: 'Mat_GraphiteArmor',
    baseColorHex: '#464e59',
    metallic: 0.42,
    roughness: 0.56,
  });

  // Scuffed/weathered lighter gunmetal-graphite edges, knee guards, pistol slides & helmet ridge
  const Mat_GraphiteWorn = scene.addMaterial({
    name: 'Mat_GraphiteWorn',
    baseColorHex: '#737e8e',
    metallic: 0.48,
    roughness: 0.44,
  });

  // Dark carbon-weave ballistic undersuit, joints, boot treads & weapon grips
  const Mat_UnderSuit = scene.addMaterial({
    name: 'Mat_UnderSuit',
    baseColorHex: '#22262d',
    metallic: 0.18,
    roughness: 0.74,
  });

  // Meridian Guard integrated cyan-ice tactical visor
  const Mat_Visor = scene.addMaterial({
    name: 'Mat_Visor',
    baseColorHex: '#82d8ff',
    metallic: 0.10,
    roughness: 0.18,
    emissiveHex: '#5ac8fa',
    emissiveBoost: 0.88,
  });

  // Jump-pack twin nozzle thermal glow & pistol sight accents
  const Mat_Thruster = scene.addMaterial({
    name: 'Mat_ThrusterGlow',
    baseColorHex: '#ffb84d',
    metallic: 0.0,
    roughness: 0.22,
    emissiveHex: '#ff8a1f',
    emissiveBoost: 0.95,
  });

  return {
    Surf_TEAM,
    Mat_Graphite,
    Mat_GraphiteWorn,
    Mat_UnderSuit,
    Mat_Visor,
    Mat_Thruster,
  };
}

/**
 * Builds one industrial dual-rail tactical recon pistol along +X in Forearm local space.
 */
function buildForearmAndPistol(mats, sideSign) {
  // sideSign: +1 for Right (+Z), -1 for Left (-Z)
  // Elbow joint is at local [0, 0, 0]; forearm & pistol extend cleanly along +X!
  const gArmor = new PrimitiveGeom(mats.Mat_Graphite);
  const gWorn = new PrimitiveGeom(mats.Mat_GraphiteWorn);
  const gSuit = new PrimitiveGeom(mats.Mat_UnderSuit);
  const gGlow = new PrimitiveGeom(mats.Mat_Thruster);

  // Elbow joint ball
  gSuit.addJointBall(0.036, [0, 0, 0]);

  // Sleek angular forearm gauntlet extending along +X (x: 0.01 .. 0.165)
  gArmor.addForwardTaperedBox({
    x0: 0.010, x1: 0.165,
    ry0: -0.036, ry1: 0.038, rz0: -0.036, rz1: 0.036,
    fy0: -0.028, fy1: 0.030, fz0: -0.028, fz1: 0.028,
  });

  // Scuffed outer forearm vambrace ridge
  gWorn.addBox([0.115, 0.022, 0.014], [0.090, 0.014, sideSign * 0.034]);

  // Gloved hand gripping pistol (x: 0.162 .. 0.224)
  gSuit.addBox([0.062, 0.052, 0.046], [0.192, -0.002, 0]);

  // Angled pistol grip & magazine baseplate below palm
  gSuit.addBox([0.044, 0.088, 0.032], [0.188, -0.036, 0], [0, 0, 16]);

  // Industrial Recon Pistol lower frame & underbarrel tactical rail/weight (x: 0.165 .. 0.352)
  gArmor.addForwardTaperedBox({
    x0: 0.162, x1: 0.352,
    ry0: 0.002, ry1: 0.028, rz0: -0.021, rz1: 0.021,
    fy0: 0.006, fy1: 0.028, fz0: -0.018, fz1: 0.018,
  });

  // Scuffed lighter-graphite heavy top slide & compensator extending to x = 0.372!
  gWorn.addForwardTaperedBox({
    x0: 0.156, x1: 0.372,
    ry0: 0.027, ry1: 0.054, rz0: -0.020, rz1: 0.020,
    fy0: 0.027, fy1: 0.050, fz0: -0.016, fz1: 0.016,
  });

  // Dark muzzle port & trigger guard
  gSuit.addBox([0.046, 0.012, 0.014], [0.230, -0.010, 0]);

  // Glowing amber tactical reflex optic on top rear of pistol slide
  gGlow.addBox([0.024, 0.013, 0.018], [0.186, 0.058, 0]);

  return [gArmor, gWorn, gSuit, gGlow];
}

// ---------------------------------------------------------------------------
// Main Ridge Scout Builder
// ---------------------------------------------------------------------------

function buildRidgeScoutGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createRidgeScoutMaterials(scene);

  // Root node at [0, 0, 0] (+X forward, +Y up, +Z right, -Z left)
  const rootIdx = scene.addNode({ name: 'RidgeScout', translation: [0, 0, 0] });

  // =========================================================================
  // 1. PELVIS (world [0, 0.58, 0])
  // =========================================================================
  const pelvisY = 0.58;
  const gPelvisArmor = new PrimitiveGeom(mats.Mat_Graphite);
  const gPelvisWorn = new PrimitiveGeom(mats.Mat_GraphiteWorn);
  const gPelvisSuit = new PrimitiveGeom(mats.Mat_UnderSuit);

  // Compact angular recon pelvis block & groin guard
  gPelvisSuit.addTaperedBox({
    y0: -0.055, y1: 0.055,
    bx0: -0.068, bx1: 0.076, bz0: -0.105, bz1: 0.105,
    tx0: -0.078, tx1: 0.088, tz0: -0.132, tz1: 0.132,
  });
  // Armored tactical belt & front buckle plate
  gPelvisArmor.addBox([0.178, 0.046, 0.278], [0.005, 0.032, 0]);
  gPelvisWorn.addBox([0.036, 0.052, 0.082], [0.084, 0.028, 0]);
  // Compact hip mag/charge pouches on +/-Z hips (including throwable recon charge on right hip)
  for (const side of [-1, 1]) {
    gPelvisArmor.addBox([0.075, 0.068, 0.036], [-0.01, 0.015, side * 0.148], [side * 8, 0, 0]);
  }

  const pelvisMesh = scene.addMesh('Pelvis_Mesh', [gPelvisArmor, gPelvisWorn, gPelvisSuit]);
  const pelvisIdx = scene.addNode({
    name: 'Pelvis',
    meshIndex: pelvisMesh,
    translation: [0, pelvisY, 0],
    parentIndex: rootIdx,
  });

  // =========================================================================
  // 2. DISTINCT ARTICULATED LEG RIG (Pelvis -> ThighR/L -> ShinR/L -> FootR/L)
  //    Exact vertical chain: 0.58 - 0.02 (hip=0.56) - 0.26 (knee=0.30) - 0.22 (ankle=0.08) - 0.08 = 0.0000!
  // =========================================================================
  const legNodes = {};
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'R' : 'L';
    const hipZ = side * 0.108;

    // --- THIGH ---
    const gThighArmor = new PrimitiveGeom(mats.Mat_Graphite);
    const gThighWorn = new PrimitiveGeom(mats.Mat_GraphiteWorn);
    const gThighSuit = new PrimitiveGeom(mats.Mat_UnderSuit);

    gThighSuit.addJointBall(0.046, [0, 0, 0]);
    // Inner ballistic undersuit thigh core
    gThighSuit.addTaperedBox({
      y0: -0.255, y1: -0.015,
      bx0: -0.044, bx1: 0.048, bz0: -0.042, bz1: 0.042,
      tx0: -0.056, tx1: 0.060, tz0: -0.052, tz1: 0.052,
    });
    // Lean sculpted outer/front graphite thigh plate
    gThighArmor.addTaperedBox({
      y0: -0.235, y1: -0.030,
      bx0: -0.038, bx1: 0.058, bz0: side > 0 ? -0.028 : -0.054, bz1: side > 0 ? 0.054 : 0.028,
      tx0: -0.048, tx1: 0.068, bz0_unused: 0,
      tz0: side > 0 ? -0.032 : -0.066, tz1: side > 0 ? 0.066 : 0.032,
    });
    gThighWorn.addBox([0.022, 0.16, 0.026], [0.056, -0.13, side * 0.036]);

    const thighMesh = scene.addMesh(`Thigh${tag}_Mesh`, [gThighArmor, gThighWorn, gThighSuit]);
    const thighIdx = scene.addNode({
      name: `Thigh${tag}`,
      meshIndex: thighMesh,
      translation: [0, -0.02, hipZ],
      parentIndex: pelvisIdx,
    });

    // --- SHIN & KNEE GUARD ---
    const gShinArmor = new PrimitiveGeom(mats.Mat_Graphite);
    const gShinWorn = new PrimitiveGeom(mats.Mat_GraphiteWorn);
    const gShinSuit = new PrimitiveGeom(mats.Mat_UnderSuit);

    gShinSuit.addJointBall(0.040, [0, 0, 0]);
    // Tapered cliff-jumper shin greave + rear shock-absorber strut
    gShinArmor.addTaperedBox({
      y0: -0.215, y1: -0.015,
      bx0: -0.036, bx1: 0.048, bz0: -0.036, bz1: 0.036,
      tx0: -0.046, tx1: 0.058, tz0: -0.046, tz1: 0.046,
    });
    // Rear hydraulic shock strut for cliff-jump landings
    gShinSuit.addBox([0.028, 0.19, 0.030], [-0.048, -0.11, 0], [0, 0, -5]);
    // Prominent angled worn-graphite knee cap (+X forward)
    gShinWorn.addTaperedBox({
      y0: -0.048, y1: 0.036,
      bx0: 0.032, bx1: 0.072, bz0: -0.040, bz1: 0.040,
      tx0: 0.026, tx1: 0.062, tz0: -0.034, tz1: 0.034,
    });

    const shinMesh = scene.addMesh(`Shin${tag}_Mesh`, [gShinArmor, gShinWorn, gShinSuit]);
    const shinIdx = scene.addNode({
      name: `Shin${tag}`,
      meshIndex: shinMesh,
      translation: [0, -0.26, 0],
      parentIndex: thighIdx,
    });

    // --- CLIFF-GRIP BOOT (sole sits flat at local Y = -0.0800 -> exact world Y = 0.0000!) ---
    const gFootArmor = new PrimitiveGeom(mats.Mat_Graphite);
    const gFootWorn = new PrimitiveGeom(mats.Mat_GraphiteWorn);
    const gFootSuit = new PrimitiveGeom(mats.Mat_UnderSuit);

    gFootSuit.addJointBall(0.034, [0, 0, 0]);
    // Cleated magnetic cliff-grip boot sole (exact bottom y0 = -0.0800)
    gFootSuit.addTaperedBox({
      y0: -0.080, y1: -0.048,
      bx0: -0.072, bx1: 0.138, bz0: -0.048, bz1: 0.048,
      tx0: -0.066, tx1: 0.128, tz0: -0.044, tz1: 0.044,
    });
    // Angled armored boot upper / toe cap
    gFootArmor.addTaperedBox({
      y0: -0.048, y1: 0.008,
      bx0: -0.064, bx1: 0.126, bz0: -0.044, bz1: 0.044,
      tx0: -0.046, tx1: 0.056, tz0: -0.036, tz1: 0.036,
    });
    // Scuffed toe clamp bevel
    gFootWorn.addBox([0.046, 0.024, 0.076], [0.106, -0.042, 0], [0, 0, -14]);

    const footMesh = scene.addMesh(`Foot${tag}_Mesh`, [gFootArmor, gFootWorn, gFootSuit]);
    const footIdx = scene.addNode({
      name: `Foot${tag}`,
      meshIndex: footMesh,
      translation: [0, -0.22, 0],
      parentIndex: shinIdx,
    });

    legNodes[tag] = { thighIdx, shinIdx, footIdx };
  }

  // =========================================================================
  // 3. TORSO & SURF_TEAM_CHEST (world [0, 0.63, 0] waist pivot)
  // =========================================================================
  const gTorsoArmor = new PrimitiveGeom(mats.Mat_Graphite);
  const gTorsoWorn = new PrimitiveGeom(mats.Mat_GraphiteWorn);
  const gTorsoSuit = new PrimitiveGeom(mats.Mat_UnderSuit);

  gTorsoSuit.addJointBall(0.058, [0, 0, 0]);
  // Lean cinched ballistic abdomen (world Y 0.63 .. 0.75 -> local 0.00 .. 0.12)
  gTorsoSuit.addTaperedBox({
    y0: 0.00, y1: 0.13,
    bx0: -0.072, bx1: 0.080, bz0: -0.108, bz1: 0.108,
    tx0: -0.080, tx1: 0.092, tz0: -0.118, tz1: 0.118,
  });

  // Angular V-tapered Recon Chest Carapace (local Y 0.11 .. 0.34 -> world 0.74 .. 0.97)
  gTorsoArmor.addTaperedBox({
    y0: 0.11, y1: 0.31,
    bx0: -0.084, bx1: 0.102, bz0: -0.116, bz1: 0.116,
    tx0: -0.098, tx1: 0.134, tz0: -0.168, tz1: 0.168,
  });
  // Upper chest bevel & armored gorget collar (local Y 0.31 .. 0.365 -> world 0.94 .. 0.995)
  gTorsoWorn.addTaperedBox({
    y0: 0.31, y1: 0.365,
    bx0: -0.096, bx1: 0.130, bz0: -0.164, bz1: 0.164,
    tx0: -0.072, tx1: 0.088, tz0: -0.118, tz1: 0.118,
  });
  // Front sternum keel bevel
  gTorsoWorn.addBox([0.032, 0.13, 0.075], [0.118, 0.21, 0], [0, 0, 10]);

  const torsoMesh = scene.addMesh('Torso_Mesh', [gTorsoArmor, gTorsoWorn, gTorsoSuit]);
  const torsoIdx = scene.addNode({
    name: 'Torso',
    meshIndex: torsoMesh,
    translation: [0, 0.05, 0],
    parentIndex: pelvisIdx,
  });

  // Team Panel 1: Surf_TEAM_Chest (angled upper chest & collar chevron panels)
  const gTeamChest = new PrimitiveGeom(mats.Surf_TEAM);
  for (const side of [-1, 1]) {
    gTeamChest.addBox(
      [0.024, 0.088, 0.076],
      [0.122, 0.268, side * 0.092],
      [0, -side * 14, 14]
    );
  }
  const teamChestMesh = scene.addMesh('Surf_TEAM_Chest', [gTeamChest]);
  scene.addNode({
    name: 'Surf_TEAM_Chest',
    meshIndex: teamChestMesh,
    parentIndex: torsoIdx,
  });

  // =========================================================================
  // 4. INTEGRATED VISORED HELMET (Head pivot at world [0.015, 1.00, 0])
  //    Exact crown sensor fin apex = local Y 0.2000 -> world Y = 1.2000!
  // =========================================================================
  const gHeadArmor = new PrimitiveGeom(mats.Mat_Graphite);
  const gHeadWorn = new PrimitiveGeom(mats.Mat_GraphiteWorn);
  const gHeadSuit = new PrimitiveGeom(mats.Mat_UnderSuit);
  const gVisor = new PrimitiveGeom(mats.Mat_Visor);

  // Neck seal
  gHeadSuit.addFrustum({
    rBotX: 0.052, rBotZ: 0.052, rTopX: 0.048, rTopZ: 0.048,
    y0: -0.025, y1: 0.028, sides: 6,
  });

  // Angular forward-raked recon helmet shell (3-tier faceted loft, local Y 0.015 .. 0.182)
  const helmRings = [
    // Jaw / chin breather base
    [
      [0.108, 0.020, 0.048], [0.020, 0.015, 0.086], [-0.088, 0.022, 0.074],
      [-0.102, 0.028, 0.0],  [-0.088, 0.022, -0.074], [0.020, 0.015, -0.086],
      [0.108, 0.020, -0.048], [0.122, 0.018, 0.0],
    ],
    // Mid brow / temple flare
    [
      [0.118, 0.105, 0.062], [0.025, 0.102, 0.098], [-0.096, 0.098, 0.084],
      [-0.114, 0.100, 0.0],  [-0.096, 0.098, -0.084], [0.025, 0.102, -0.098],
      [0.118, 0.105, -0.062], [0.132, 0.108, 0.0],
    ],
    // Sleek tapered helmet crown
    [
      [0.068, 0.178, 0.042], [0.005, 0.180, 0.068], [-0.078, 0.172, 0.056],
      [-0.092, 0.170, 0.0],  [-0.078, 0.172, -0.056], [0.005, 0.180, -0.068],
      [0.068, 0.178, -0.042], [0.082, 0.176, 0.0],
    ],
  ];
  gHeadArmor.addLoft(helmRings, [[0.01, 0.02, 0], [0.01, 0.10, 0], [0, 0.176, 0]], true, true);

  // Integrated wrap-around glowing cyan tactical visor (+X front & swept temples)
  const visorRings = [
    [
      [0.118, 0.058, 0.058], [0.042, 0.062, 0.098], [-0.020, 0.068, 0.094],
      [-0.020, 0.068, -0.094], [0.042, 0.062, -0.098], [0.118, 0.058, -0.058],
      [0.138, 0.056, 0.0],
    ],
    [
      [0.122, 0.106, 0.058], [0.042, 0.106, 0.098], [-0.020, 0.104, 0.094],
      [-0.020, 0.104, -0.094], [0.042, 0.106, -0.098], [0.122, 0.106, -0.058],
      [0.142, 0.104, 0.0],
    ],
  ];
  gVisor.addLoft(visorRings, [[0.04, 0.062, 0], [0.04, 0.104, 0]], true, true);

  // Scuffed gunmetal crown ridge & swept recon sensor blade (exact top y1 = 0.2000 -> world 1.2000!)
  gHeadWorn.addTaperedBox({
    y0: 0.168, y1: 0.200,
    bx0: -0.096, bx1: 0.072, bz0: -0.022, bz1: 0.022,
    tx0: -0.112, tx1: 0.036, tz0: -0.012, tz1: 0.012,
  });

  // Chin breather grille accent
  gHeadWorn.addBox([0.026, 0.030, 0.056], [0.118, 0.036, 0], [0, 0, -10]);

  const headMesh = scene.addMesh('Head_Mesh', [gHeadArmor, gHeadWorn, gHeadSuit, gVisor]);
  const headIdx = scene.addNode({
    name: 'Head',
    meshIndex: headMesh,
    translation: [0.015, 0.37, 0],
    parentIndex: torsoIdx,
  });

  // =========================================================================
  // 5. COMPACT TWIN-NOZZLE JUMP PACK (child of Torso at [-0.105, 0.19, 0])
  // =========================================================================
  const gPackArmor = new PrimitiveGeom(mats.Mat_Graphite);
  const gPackWorn = new PrimitiveGeom(mats.Mat_GraphiteWorn);
  const gPackSuit = new PrimitiveGeom(mats.Mat_UnderSuit);
  const gPackGlow = new PrimitiveGeom(mats.Mat_Thruster);

  // Sleek central jump-pack spine & fuel core
  gPackArmor.addTaperedBox({
    y0: -0.085, y1: 0.155,
    bx0: -0.095, bx1: 0.022, bz0: -0.075, bz1: 0.075,
    tx0: -0.115, tx1: 0.018, tz0: -0.098, tz1: 0.098,
  });
  // Upper intake hood bevel
  gPackWorn.addTaperedBox({
    y0: 0.155, y1: 0.195,
    bx0: -0.112, bx1: 0.015, bz0: -0.094, bz1: 0.094,
    tx0: -0.082, tx1: 0.010, tz0: -0.068, tz1: 0.068,
  });

  // Twin canted thruster pods & vectored exhaust nozzles (Right +Z, Left -Z)
  // Note: rz = -16 deg angles downward nozzles (-Y) backward (-X) away from legs;
  // rx = -side * 10 deg splays downward nozzles outward (+/-Z)!
  for (const side of [-1, 1]) {
    const podPos = [-0.068, 0.035, side * 0.108];
    const podRot = [-side * 10, 0, -16];

    // Thruster turbine housing
    gPackArmor.addTaperedBox({
      y0: -0.085, y1: 0.125,
      bx0: -0.048, bx1: 0.048, bz0: -0.044, bz1: 0.044,
      tx0: -0.042, tx1: 0.042, tz0: -0.038, tz1: 0.038,
      pos: podPos,
      rotDeg: podRot,
    });
    // Scuffed top intake cowl ring
    gPackWorn.addBox([0.088, 0.032, 0.080], transformPoint([0, 0.132, 0], podPos, podRot), podRot);

    // Flared twin exhaust nozzle bell at bottom of each pod
    gPackSuit.addFrustum({
      rBotX: 0.054, rBotZ: 0.054,
      rTopX: 0.038, rTopZ: 0.038,
      y0: -0.155, y1: -0.080,
      sides: 6,
      pos: podPos,
      rotDeg: podRot,
    });
    // Glowing inner plasma thruster core inside each nozzle bell
    gPackGlow.addFrustum({
      rBotX: 0.040, rBotZ: 0.040,
      rTopX: 0.024, rTopZ: 0.024,
      y0: -0.158, y1: -0.135,
      sides: 6,
      pos: podPos,
      rotDeg: podRot,
    });
  }

  const jumpPackMesh = scene.addMesh('JumpPack_Mesh', [gPackArmor, gPackWorn, gPackSuit, gPackGlow]);
  const jumpPackIdx = scene.addNode({
    name: 'JumpPack',
    meshIndex: jumpPackMesh,
    translation: [-0.105, 0.19, 0],
    parentIndex: torsoIdx,
  });

  // Team Panel 2: Surf_TEAM_Pack (angled high-visibility stabilizer fins on upper jump pack)
  const gTeamPack = new PrimitiveGeom(mats.Surf_TEAM);
  for (const side of [-1, 1]) {
    gTeamPack.addTaperedBox({
      y0: 0.045, y1: 0.175,
      bx0: -0.118, bx1: -0.035, bz0: -0.012, bz1: 0.012,
      tx0: -0.148, tx1: -0.048, tz0: -0.010, tz1: 0.010,
      pos: [0, 0, side * 0.128],
      rotDeg: [side * 24, 0, -10],
    });
  }
  // Center dorsal team-color stripe on jump-pack spine
  gTeamPack.addBox([0.022, 0.145, 0.058], [-0.112, 0.065, 0], [0, 0, 8]);
  const teamPackMesh = scene.addMesh('Surf_TEAM_Pack', [gTeamPack]);
  scene.addNode({
    name: 'Surf_TEAM_Pack',
    meshIndex: teamPackMesh,
    parentIndex: jumpPackIdx,
  });

  // Animated Jump-Pack Thruster Plumes (tucked at 0.01 scale at rest -> ignite during 'jump'!)
  const gPlume = new PrimitiveGeom(mats.Mat_Thruster);
  for (const side of [-1, 1]) {
    const podPos = [-0.068, 0.035, side * 0.108];
    const podRot = [-side * 10, 0, -16];
    gPlume.addFrustum({
      rBotX: 0.006, rBotZ: 0.006,
      rTopX: 0.046, rTopZ: 0.046,
      y0: -0.44, y1: -0.15,
      sides: 6,
      pos: podPos,
      rotDeg: podRot,
    });
  }
  const plumeMesh = scene.addMesh('ThrusterPlumes_Mesh', [gPlume]);
  const plumeIdx = scene.addNode({
    name: 'ThrusterPlumes',
    meshIndex: plumeMesh,
    translation: [0, 0, 0],
    scale: [0.01, 0.01, 0.01],
    parentIndex: jumpPackIdx,
  });

  // =========================================================================
  // 6. ARMS, SURF_TEAM_SHOULDER_*, TWIN PISTOLS & MUZZLE SOCKETS
  // =========================================================================
  const armNodes = {};
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'R' : 'L';
    const shZ = side * 0.188;

    // --- UPPER ARM & RECON PAULDRON ---
    const gArmArmor = new PrimitiveGeom(mats.Mat_Graphite);
    const gArmWorn = new PrimitiveGeom(mats.Mat_GraphiteWorn);
    const gArmSuit = new PrimitiveGeom(mats.Mat_UnderSuit);

    gArmSuit.addJointBall(0.040, [0, 0, 0]);
    // Lean upper arm cylinder
    gArmSuit.addTaperedBox({
      y0: -0.175, y1: -0.010,
      bx0: -0.032, bx1: 0.034, bz0: -0.032, bz1: 0.032,
      tx0: -0.038, tx1: 0.040, tz0: -0.038, tz1: 0.038,
    });
    // Sleek angular recon shoulder pauldron (much trimmer than Rifleman/Breacher!)
    gArmArmor.addTaperedBox({
      y0: -0.065, y1: 0.048,
      bx0: -0.052, bx1: 0.056, bz0: side > 0 ? -0.018 : -0.062, bz1: side > 0 ? 0.062 : 0.018,
      tx0: -0.044, tx1: 0.048, tz0: side > 0 ? -0.026 : -0.044, tz1: side > 0 ? 0.044 : 0.026,
    });
    gArmWorn.addBox([0.098, 0.018, 0.020], [0.002, 0.048, side * 0.020]);

    const upperArmMesh = scene.addMesh(`UpperArm${tag}_Mesh`, [gArmArmor, gArmWorn, gArmSuit]);
    const upperArmIdx = scene.addNode({
      name: `UpperArm${tag}`,
      meshIndex: upperArmMesh,
      translation: [0.01, 0.295, shZ],
      parentIndex: torsoIdx,
    });

    // Team Panel 3 & 4: Surf_TEAM_ShoulderR / Surf_TEAM_ShoulderL
    const gTeamSh = new PrimitiveGeom(mats.Surf_TEAM);
    gTeamSh.addTaperedBox({
      y0: -0.042, y1: 0.036,
      bx0: -0.042, bx1: 0.046, bz0: -0.010, bz1: 0.010,
      tx0: -0.034, tx1: 0.038, tz0: -0.010, tz1: 0.010,
      pos: [0.002, 0.0, side * 0.056],
      rotDeg: [-side * 16, 0, 0],
    });
    const teamShMesh = scene.addMesh(`Surf_TEAM_Shoulder${tag}`, [gTeamSh]);
    scene.addNode({
      name: `Surf_TEAM_Shoulder${tag}`,
      meshIndex: teamShMesh,
      parentIndex: upperArmIdx,
    });

    // --- FOREARM + RECON PISTOL ---
    const forearmPrims = buildForearmAndPistol(mats, side);
    const forearmMesh = scene.addMesh(`Forearm${tag}_Mesh`, forearmPrims);
    const forearmIdx = scene.addNode({
      name: `Forearm${tag}`,
      meshIndex: forearmMesh,
      translation: [0.012, -0.175, side * 0.008],
      parentIndex: upperArmIdx,
    });

    // --- MUZZLE SOCKETS: "Muzzle" (right, +Z) and "MuzzleLeft" (left, -Z) ---
    const socketName = side > 0 ? 'Muzzle' : 'MuzzleLeft';
    scene.addNode({
      name: socketName,
      translation: [0.376, 0.038, 0], // Exact tip of pistol barrel bore, +X forward!
      parentIndex: forearmIdx,
    });

    armNodes[tag] = { upperArmIdx, forearmIdx };
  }

  // =========================================================================
  // 7. BAKED ANIMATION CLIPS: idle, run, jump, fire, throw
  // =========================================================================

  const Q = quatFromEulerXYZ;

  // Helper to build tracks from keyframe pose snapshots cleanly
  function buildClip(clipName, times, poseFn) {
    const poseList = times.map((t, idx) => poseFn(t, idx, times.length));
    const tracks = [];

    const addRotTrack = (nodeIndex, getter) => {
      tracks.push({
        nodeIndex,
        path: 'rotation',
        times,
        values: poseList.map((p) => {
          const e = getter(p) || [0, 0, 0];
          return Q(e[0], e[1], e[2]);
        }),
      });
    };

    const addTransTrack = (nodeIndex, baseT, getter) => {
      tracks.push({
        nodeIndex,
        path: 'translation',
        times,
        values: poseList.map((p) => {
          const d = getter(p) || [0, 0, 0];
          return [
            Number((baseT[0] + d[0]).toFixed(6)),
            Number((baseT[1] + d[1]).toFixed(6)),
            Number((baseT[2] + d[2]).toFixed(6)),
          ];
        }),
      });
    };

    addTransTrack(pelvisIdx, [0, pelvisY, 0], (p) => p.pelvisPos);
    addRotTrack(pelvisIdx, (p) => p.pelvisRot);
    addRotTrack(torsoIdx, (p) => p.torsoRot);
    addRotTrack(headIdx, (p) => p.headRot);
    addRotTrack(armNodes.R.upperArmIdx, (p) => p.armR);
    addRotTrack(armNodes.R.forearmIdx, (p) => p.foreR);
    addRotTrack(armNodes.L.upperArmIdx, (p) => p.armL);
    addRotTrack(armNodes.L.forearmIdx, (p) => p.foreL);
    addRotTrack(legNodes.R.thighIdx, (p) => p.thighR);
    addRotTrack(legNodes.R.shinIdx, (p) => p.shinR);
    addRotTrack(legNodes.R.footIdx, (p) => p.footR);
    addRotTrack(legNodes.L.thighIdx, (p) => p.thighL);
    addRotTrack(legNodes.L.shinIdx, (p) => p.shinL);
    addRotTrack(legNodes.L.footIdx, (p) => p.footL);

    if (poseList.some((p) => p.plumeScale)) {
      tracks.push({
        nodeIndex: plumeIdx,
        path: 'scale',
        times,
        values: poseList.map((p) => p.plumeScale || [0.01, 0.01, 0.01]),
      });
    }

    scene.addAnimation(clipName, tracks);
  }

  // -------------------------------------------------------------------------
  // Clip 1: `idle` (1.60s seamless combat-ready recon stance)
  // -------------------------------------------------------------------------
  buildClip('idle', [0.0, 0.4, 0.8, 1.2, 1.6], (_t, i) => {
    const breathe = [0, 1, 0, -1, 0][i];
    const scan = [0, 1, 0, -1, 0][i];
    return {
      pelvisPos: [0, -0.012 + breathe * 0.008, 0],
      pelvisRot: [0, scan * 3, 0],
      torsoRot: [0, scan * 4, -5 + breathe * 1.5],
      headRot: [0, scan * 7, 3],
      armR: [-6, -5, 10 + breathe * 2],
      foreR: [0, 6, 8 - breathe * 2],
      armL: [6, 5, 10 - breathe * 2],
      foreL: [0, -6, 8 + breathe * 2],
      thighR: [0, -3, 7],
      shinR: [0, 0, -14],
      footR: [0, 0, 7],
      thighL: [0, 3, -5],
      shinL: [0, 0, -10],
      footL: [0, 0, 15],
    };
  });

  // -------------------------------------------------------------------------
  // Clip 2: `run` (0.64s fast agile recon sprint loop)
  // -------------------------------------------------------------------------
  const runSteps = 9;
  const runTimes = Array.from({ length: runSteps }, (_, k) => Number(((k / (runSteps - 1)) * 0.64).toFixed(4)));
  buildClip('run', runTimes, (_t, k, n) => {
    const u = k === n - 1 ? 0 : k / (n - 1);
    const ph = u * 2 * Math.PI;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const bounce = Math.sin(2 * ph - Math.PI * 0.35);

    const legSwing = (phase) => {
      const sw = Math.sin(phase);
      const lift = Math.max(0, Math.cos(phase));
      const thighPitch = sw * 38 + 4;
      const kneeBend = -14 - 44 * Math.pow(lift, 1.2) - 10 * Math.max(0, -sw);
      const anklePitch = -thighPitch * 0.35 - kneeBend * 0.35;
      return { thighPitch, kneeBend, anklePitch };
    };

    const rLeg = legSwing(ph);
    const lLeg = legSwing(ph + Math.PI);

    return {
      pelvisPos: [0.02, -0.028 + bounce * 0.032, s * 0.015],
      pelvisRot: [s * 4, -s * 8, -4],
      torsoRot: [-s * 3, s * 11, -17 + bounce * 2],
      headRot: [0, -s * 6, 14],
      armR: [-8, 0, -s * 28 + 8],
      foreR: [0, 8, 18 + c * 6],
      armL: [8, 0, s * 28 + 8],
      foreL: [0, -8, 18 - c * 6],
      thighR: [0, 0, rLeg.thighPitch],
      shinR: [0, 0, rLeg.kneeBend],
      footR: [0, 0, rLeg.anklePitch],
      thighL: [0, 0, lLeg.thighPitch],
      shinL: [0, 0, lLeg.kneeBend],
      footL: [0, 0, lLeg.anklePitch],
    };
  });

  // -------------------------------------------------------------------------
  // Clip 3: `jump` (1.10s twin-nozzle cliff-jump boost & shock-absorbed landing)
  // -------------------------------------------------------------------------
  const jumpKeyframes = [
    // 0.00s: Ready stance
    {
      t: 0.00,
      pose: {
        pelvisPos: [0, 0, 0], torsoRot: [0, 0, 0], headRot: [0, 0, 0],
        armR: [0, 0, 0], foreR: [0, 0, 0], armL: [0, 0, 0], foreL: [0, 0, 0],
        thighR: [0, 0, 0], shinR: [0, 0, 0], footR: [0, 0, 0],
        thighL: [0, 0, 0], shinL: [0, 0, 0], footL: [0, 0, 0],
        plumeScale: [0.01, 0.01, 0.01],
      },
    },
    // 0.16s: Pre-jump crouch coil
    {
      t: 0.16,
      pose: {
        pelvisPos: [-0.02, -0.12, 0], torsoRot: [0, 0, -22], headRot: [0, 0, 18],
        armR: [-12, 0, -24], foreR: [0, 5, 22], armL: [12, 0, -24], foreL: [0, -5, 22],
        thighR: [0, 0, 34], shinR: [0, 0, -64], footR: [0, 0, 30],
        thighL: [0, 0, 30], shinL: [0, 0, -58], footL: [0, 0, 28],
        plumeScale: [0.25, 0.35, 0.25],
      },
    },
    // 0.42s: Twin-nozzle jet ignition & steep upward ascent!
    {
      t: 0.42,
      pose: {
        pelvisPos: [0.06, 0.48, 0], torsoRot: [0, -4, -14], headRot: [0, 4, 12],
        armR: [-18, -8, 28], foreR: [0, 10, -8], armL: [18, 8, 22], foreL: [0, -10, -6],
        thighR: [0, 0, 48], shinR: [0, 0, -68], footR: [0, 0, -14],
        thighL: [0, 0, -20], shinL: [0, 0, -26], footL: [0, 0, -22],
        plumeScale: [1.15, 1.35, 1.15],
      },
    },
    // 0.66s: High cliff-clearing apex hover, twin pistols scanning target zone below
    {
      t: 0.66,
      pose: {
        pelvisPos: [0.08, 0.56, 0], torsoRot: [0, 4, -10], headRot: [0, -4, -8],
        armR: [-14, -6, 36], foreR: [0, 8, -22], armL: [14, 6, 34], foreL: [0, -8, -20],
        thighR: [0, 0, 32], shinR: [0, 0, -48], footR: [0, 0, -10],
        thighL: [0, 0, -12], shinL: [0, 0, -34], footL: [0, 0, -16],
        plumeScale: [0.90, 1.05, 0.90],
      },
    },
    // 0.90s: Shock-strut landing compression on Y=0
    {
      t: 0.90,
      pose: {
        pelvisPos: [0.01, -0.11, 0], torsoRot: [0, 0, -18], headRot: [0, 0, 14],
        armR: [-22, 0, 12], foreR: [0, 6, 14], armL: [22, 0, 12], foreL: [0, -6, 14],
        thighR: [0, 0, 32], shinR: [0, 0, -60], footR: [0, 0, 28],
        thighL: [0, 0, 28], shinL: [0, 0, -54], footL: [0, 0, 26],
        plumeScale: [0.08, 0.10, 0.08],
      },
    },
    // 1.10s: Crisp recovery to rest stance
    {
      t: 1.10,
      pose: {
        pelvisPos: [0, 0, 0], torsoRot: [0, 0, 0], headRot: [0, 0, 0],
        armR: [0, 0, 0], foreR: [0, 0, 0], armL: [0, 0, 0], foreL: [0, 0, 0],
        thighR: [0, 0, 0], shinR: [0, 0, 0], footR: [0, 0, 0],
        thighL: [0, 0, 0], shinL: [0, 0, 0], footL: [0, 0, 0],
        plumeScale: [0.01, 0.01, 0.01],
      },
    },
  ];
  buildClip('jump', jumpKeyframes.map((k) => k.t), (_t, i) => jumpKeyframes[i].pose);

  // -------------------------------------------------------------------------
  // Clip 4: `fire` (0.56s rapid alternating right/left twin-pistol fire cycle)
  // -------------------------------------------------------------------------
  const fireKeyframes = [
    // 0.00s: Braced dual-aim stance
    {
      t: 0.00,
      pose: {
        pelvisPos: [0, -0.02, 0], pelvisRot: [0, 0, 0], torsoRot: [0, 0, -7], headRot: [0, 0, 6],
        armR: [-4, -4, 52], foreR: [0, 4, -48],
        armL: [4, 4, 52], foreL: [0, -4, -48],
        thighR: [0, -4, 12], shinR: [0, 0, -22], footR: [0, 0, 10],
        thighL: [0, 4, -8], shinL: [0, 0, -14], footL: [0, 0, 22],
      },
    },
    // 0.09s: Right pistol fires! Crisp upward muzzle kick + shoulder recoil
    {
      t: 0.09,
      pose: {
        pelvisPos: [-0.01, -0.022, 0], pelvisRot: [0, -3, 0], torsoRot: [0, 7, -4], headRot: [0, -6, 4],
        armR: [-6, -8, 44], foreR: [0, 4, -22], // Forearm/pistol kicks +26 deg upward!
        armL: [4, 4, 54], foreL: [0, -4, -50],
        thighR: [0, -4, 12], shinR: [0, 0, -22], footR: [0, 0, 10],
        thighL: [0, 4, -8], shinL: [0, 0, -14], footL: [0, 0, 22],
      },
    },
    // 0.26s: Right recovers onto target, Left prepares
    {
      t: 0.26,
      pose: {
        pelvisPos: [0, -0.02, 0], pelvisRot: [0, 0, 0], torsoRot: [0, 0, -7], headRot: [0, 0, 6],
        armR: [-4, -4, 52], foreR: [0, 4, -48],
        armL: [4, 4, 52], foreL: [0, -4, -48],
        thighR: [0, -4, 12], shinR: [0, 0, -22], footR: [0, 0, 10],
        thighL: [0, 4, -8], shinL: [0, 0, -14], footL: [0, 0, 22],
      },
    },
    // 0.35s: Left pistol fires! Crisp upward muzzle kick + counter-twist
    {
      t: 0.35,
      pose: {
        pelvisPos: [-0.01, -0.022, 0], pelvisRot: [0, 3, 0], torsoRot: [0, -7, -4], headRot: [0, 6, 4],
        armR: [-4, -4, 54], foreR: [0, 4, -50],
        armL: [6, 8, 44], foreL: [0, -4, -22], // Left forearm/pistol kicks +26 deg upward!
        thighR: [0, -4, 12], shinR: [0, 0, -22], footR: [0, 0, 10],
        thighL: [0, 4, -8], shinL: [0, 0, -14], footL: [0, 0, 22],
      },
    },
    // 0.56s: Return to braced dual-aim for seamless loop
    {
      t: 0.56,
      pose: {
        pelvisPos: [0, -0.02, 0], pelvisRot: [0, 0, 0], torsoRot: [0, 0, -7], headRot: [0, 0, 6],
        armR: [-4, -4, 52], foreR: [0, 4, -48],
        armL: [4, 4, 52], foreL: [0, -4, -48],
        thighR: [0, -4, 12], shinR: [0, 0, -22], footR: [0, 0, 10],
        thighL: [0, 4, -8], shinL: [0, 0, -14], footL: [0, 0, 22],
      },
    },
  ];
  buildClip('fire', fireKeyframes.map((k) => k.t), (_t, i) => fireKeyframes[i].pose);

  // -------------------------------------------------------------------------
  // Clip 5: `throw` (0.85s tactical recon charge / grenade hurl)
  // -------------------------------------------------------------------------
  const throwKeyframes = [
    // 0.00s: Ready stance
    {
      t: 0.00,
      pose: {
        pelvisPos: [0, 0, 0], pelvisRot: [0, 0, 0], torsoRot: [0, 0, 0], headRot: [0, 0, 0],
        armR: [0, 0, 0], foreR: [0, 0, 0], armL: [0, 0, 0], foreL: [0, 0, 0],
        thighR: [0, 0, 0], shinR: [0, 0, 0], footR: [0, 0, 0],
        thighL: [0, 0, 0], shinL: [0, 0, 0], footL: [0, 0, 0],
      },
    },
    // 0.24s: Deep coil wind-up (torso rotates right, right arm cocks back, left arm sights target)
    {
      t: 0.24,
      pose: {
        pelvisPos: [-0.03, -0.04, 0], pelvisRot: [0, -16, 0], torsoRot: [0, -32, 8], headRot: [0, 42, -4],
        armR: [-28, -18, -54], foreR: [0, 12, 42],
        armL: [10, 14, 48], foreL: [0, -8, -32],
        thighR: [0, -8, -14], shinR: [0, 0, -26], footR: [0, 0, 38],
        thighL: [0, 8, 22], shinL: [0, 0, -32], footL: [0, 0, 10],
      },
    },
    // 0.44s: Explosive forward snap release!
    {
      t: 0.44,
      pose: {
        pelvisPos: [0.04, -0.03, 0], pelvisRot: [0, 14, 0], torsoRot: [0, 28, -20], headRot: [0, -36, 16],
        armR: [-14, 18, 78], foreR: [0, -8, -52],
        armL: [18, -10, -22], foreL: [0, 0, 18],
        thighR: [0, 6, -18], shinR: [0, 0, -16], footR: [0, 0, 32],
        thighL: [0, -4, 28], shinL: [0, 0, -42], footL: [0, 0, 14],
      },
    },
    // 0.62s: Follow-through hold
    {
      t: 0.62,
      pose: {
        pelvisPos: [0.03, -0.025, 0], pelvisRot: [0, 10, 0], torsoRot: [0, 18, -14], headRot: [0, -24, 10],
        armR: [-10, 12, 44], foreR: [0, -6, -24],
        armL: [12, -6, -10], foreL: [0, 0, 12],
        thighR: [0, 4, -10], shinR: [0, 0, -14], footR: [0, 0, 22],
        thighL: [0, -2, 18], shinL: [0, 0, -28], footL: [0, 0, 10],
      },
    },
    // 0.85s: Clean recovery to ready stance
    {
      t: 0.85,
      pose: {
        pelvisPos: [0, 0, 0], pelvisRot: [0, 0, 0], torsoRot: [0, 0, 0], headRot: [0, 0, 0],
        armR: [0, 0, 0], foreR: [0, 0, 0], armL: [0, 0, 0], foreL: [0, 0, 0],
        thighR: [0, 0, 0], shinR: [0, 0, 0], footR: [0, 0, 0],
        thighL: [0, 0, 0], shinL: [0, 0, 0], footL: [0, 0, 0],
      },
    },
  ];
  buildClip('throw', throwKeyframes.map((k) => k.t), (_t, i) => throwKeyframes[i].pose);

  return scene.buildGLB('RidgeScoutScene');
}

// ---------------------------------------------------------------------------
// Self-Validation Summary & Entry Point
// ---------------------------------------------------------------------------

function computeRestBoundsAndStats(glbBuffer, gltf) {
  let totalVerts = 0;
  let totalTris = 0;
  const globalMin = [Infinity, Infinity, Infinity];
  const globalMax = [-Infinity, -Infinity, -Infinity];
  const socketPositions = {};

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

    if (node.name === 'Muzzle' || node.name === 'MuzzleLeft') {
      socketPositions[node.name] = wPos.map((v) => Number(v.toFixed(4)));
    }

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
    filename: 'ridge_scout.glb',
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
    sockets: socketPositions,
    teamPanels: gltf.nodes.filter((n) => n.name.startsWith('Surf_TEAM_')).map((n) => n.name),
    materials: gltf.materials.map((m) => m.name),
    animations: (gltf.animations || []).map((a) => a.name),
  };
}

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
  fs.mkdirSync(outDir, { recursive: true });

  const { glb, gltf } = buildRidgeScoutGLB();
  const outPath = path.join(outDir, 'ridge_scout.glb');
  fs.writeFileSync(outPath, glb);

  const summary = computeRestBoundsAndStats(glb, gltf);
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { buildRidgeScoutGLB };
