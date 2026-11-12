#!/usr/bin/env node
'use strict';

/**
 * Deterministic standalone glTF 2.0 binary (.glb) generator for Starfall Command
 * Aurelian Concord tech structures:
 *   1. concord_core.glb     — Powered 3x3 research structure (~7.0w x 3.8h x 7.0d),
 *                             radial ivory plates with gold ribs, central hovering
 *                             teal lens, visible blue Surf_TEAM_* panels & Surf_GLOW_*.
 *   2. transit_waystone.glb — Warp Gate mode of Waystone (~7.0w x 5.55h x 7.0d),
 *                             ivory/gold Waystone base footprint with +X arrival ramp
 *                             and an unmistakable upright blue energy arch.
 *
 * Conventions:
 *   - Ground contact at Y = 0.0000
 *   - Forward axis +X, Up +Y, Right +Z
 *   - Player color mesh nodes named Surf_TEAM_*
 *   - Player emissive accent mesh nodes named Surf_GLOW_*
 *   - Seamless looping 'idle' animation clip on each asset
 *   - Zero external dependencies (built-in Node 'fs' and 'path' only)
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Color & Vector / Quaternion Math Utilities
// ---------------------------------------------------------------------------

function srgbChannelToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToLinearRGBA(hex, alpha = 1.0) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [
    Number(srgbChannelToLinear(r).toFixed(6)),
    Number(srgbChannelToLinear(g).toFixed(6)),
    Number(srgbChannelToLinear(b).toFixed(6)),
    Number(alpha.toFixed(6)),
  ];
}

function hexToLinearRGB(hex, boost = 1.0) {
  const rgba = hexToLinearRGBA(hex, 1.0);
  return [
    Number((rgba[0] * boost).toFixed(6)),
    Number((rgba[1] * boost).toFixed(6)),
    Number((rgba[2] * boost).toFixed(6)),
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
  return l > 1e-10 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
}

function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function quatFromEulerXYZ(rxDeg, ryDeg, rzDeg) {
  const hx = (rxDeg * Math.PI) / 360;
  const hy = (ryDeg * Math.PI) / 360;
  const hz = (rzDeg * Math.PI) / 360;
  const qx = [Math.sin(hx), 0, 0, Math.cos(hx)];
  const qy = [0, Math.sin(hy), 0, Math.cos(hy)];
  const qz = [0, 0, Math.sin(hz), Math.cos(hz)];
  const q = quatMul(quatMul(qz, qy), qx);
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((v) => Number((v / len).toFixed(6)));
}

function rotateVecByEulerXYZ(v, rxDeg, ryDeg, rzDeg) {
  const [qx, qy, qz, qw] = quatFromEulerXYZ(rxDeg, ryDeg, rzDeg);
  const uv = vCross([qx, qy, qz], v);
  const uuv = vCross([qx, qy, qz], uv);
  return vAdd(v, vAdd(vScale(uv, 2 * qw), vScale(uuv, 2)));
}

function transformPoint(p, pos = [0, 0, 0], rotDeg = [0, 0, 0], scl = [1, 1, 1]) {
  const scaled = [p[0] * scl[0], p[1] * scl[1], p[2] * scl[2]];
  const rotated =
    rotDeg[0] !== 0 || rotDeg[1] !== 0 || rotDeg[2] !== 0
      ? rotateVecByEulerXYZ(scaled, rotDeg[0], rotDeg[1], rotDeg[2])
      : scaled;
  return vAdd(rotated, pos);
}

// ---------------------------------------------------------------------------
// Flat-Shaded Low-Poly Geometry Builder
// ---------------------------------------------------------------------------

class PrimitiveGeom {
  constructor(materialIndex) {
    this.materialIndex = materialIndex;
    this.positions = [];
    this.normals = [];
    this.indices = [];
  }

  addTri(v0, v1, v2, outwardHint = null) {
    let a = v0;
    let b = v1;
    let c = v2;
    let cr = vCross(vSub(b, a), vSub(c, a));
    if (vLen(cr) < 1e-11) return;
    if (outwardHint && vDot(cr, outwardHint) < 0) {
      const tmp = b;
      b = c;
      c = tmp;
      cr = vScale(cr, -1);
    }
    const n = vNorm(cr);
    const base = this.positions.length;
    this.positions.push(a, b, c);
    this.normals.push(n, n, n);
    this.indices.push(base, base + 1, base + 2);
  }

  addQuad(v0, v1, v2, v3, outwardHint = null) {
    let a = v0;
    let b = v1;
    let c = v2;
    let d = v3;
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

  addTubeAlongSpine(spine, sides = 6, capStart = true, capEnd = true, minYClamp = null, phaseRad = 0) {
    const rings = [];
    const centers = [];
    let prevUp = [0, 1, 0];
    for (let s = 0; s < spine.length; s++) {
      const cur = spine[s];
      const prev = spine[Math.max(0, s - 1)];
      const next = spine[Math.min(spine.length - 1, s + 1)];
      const tangent = vNorm(vSub(next.pos, prev.pos));
      let upRef = cur.upHint || prevUp;
      if (Math.abs(vDot(tangent, upRef)) > 0.92) {
        upRef = Math.abs(tangent[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
      }
      const sideVec = vNorm(vCross(tangent, upRef));
      const orthoUp = vNorm(vCross(sideVec, tangent));
      prevUp = orthoUp;

      const ring = [];
      for (let i = 0; i < sides; i++) {
        const a = (2 * Math.PI * i) / sides + phaseRad;
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

  addFacetedCrystal({
    center = [0, 0, 0],
    radii = [0.5, 0.5, 0.5],
    rotDeg = [0, 0, 0],
    sectors = 8,
    stacks = 4,
  }) {
    const rings = [];
    const centers = [];
    for (let st = 1; st <= stacks - 1; st++) {
      const u = st / stacks;
      const phi = -Math.PI * 0.46 + u * Math.PI * 0.92;
      const yLocal = Math.sin(phi) * radii[1];
      const rCos = Math.cos(phi);
      const ring = [];
      for (let s = 0; s < sectors; s++) {
        const th = (2 * Math.PI * s) / sectors;
        const pLocal = [
          Math.cos(th) * rCos * radii[0],
          yLocal,
          Math.sin(th) * rCos * radii[2],
        ];
        ring.push(transformPoint(pLocal, center, rotDeg));
      }
      rings.push(ring);
      centers.push(transformPoint([0, yLocal, 0], center, rotDeg));
    }
    // Pointed top/bottom poles via custom caps
    const R = rings.length;
    const M = sectors;
    for (let r = 0; r < R - 1; r++) {
      const cm = vLerp(centers[r], centers[r + 1], 0.5);
      for (let i = 0; i < M; i++) {
        const inext = (i + 1) % M;
        const p00 = rings[r][i];
        const p01 = rings[r][inext];
        const p11 = rings[r + 1][inext];
        const p10 = rings[r + 1][i];
        const quadMid = vScale(vAdd(vAdd(p00, p01), vAdd(p10, p11)), 0.25);
        this.addQuad(p00, p01, p11, p10, vSub(quadMid, cm));
      }
    }
    const botPole = transformPoint([0, -radii[1], 0], center, rotDeg);
    const topPole = transformPoint([0, radii[1], 0], center, rotDeg);
    const cMid = transformPoint([0, 0, 0], center, rotDeg);
    for (let i = 0; i < M; i++) {
      const inext = (i + 1) % M;
      this.addTri(botPole, rings[0][inext], rings[0][i], vSub(botPole, cMid));
      this.addTri(topPole, rings[R - 1][i], rings[R - 1][inext], vSub(topPole, cMid));
    }
  }

  addChamferBox({
    center = [0, 0, 0],
    size = [1, 1, 1],
    rotDeg = [0, 0, 0],
    topScale = [0.92, 0.92],
    minYClamp = null,
  }) {
    const hx = size[0] * 0.5;
    const hy = size[1] * 0.5;
    const hz = size[2] * 0.5;
    const botRaw = [
      [hx, -hy, hz],
      [-hx, -hy, hz],
      [-hx, -hy, -hz],
      [hx, -hy, -hz],
    ];
    const topRaw = [
      [hx * topScale[0], hy, hz * topScale[1]],
      [-hx * topScale[0], hy, hz * topScale[1]],
      [-hx * topScale[0], hy, -hz * topScale[1]],
      [hx * topScale[0], hy, -hz * topScale[1]],
    ];
    const bot = botRaw.map((p) => {
      const w = transformPoint(p, center, rotDeg);
      if (minYClamp !== null && w[1] < minYClamp) w[1] = minYClamp;
      return w;
    });
    const top = topRaw.map((p) => transformPoint(p, center, rotDeg));
    const cBot = transformPoint([0, -hy, 0], center, rotDeg);
    const cTop = transformPoint([0, hy, 0], center, rotDeg);
    this.addLoft([bot, top], [cBot, cTop], true, true);
  }

  /**
   * Stamps an oriented beveled polygon armor plate / heraldic shield along surface normal `outDir`.
   */
  addOrientedShield(cPos, outDir, upRef, poly2D, thick, bevel = 0.82, dome = 0.02) {
    const out = vNorm(outDir);
    let uRef = upRef;
    if (Math.abs(vDot(out, uRef)) > 0.94) uRef = [1, 0, 0];
    const right = vNorm(vCross(uRef, out));
    const up = vNorm(vCross(out, right));

    const bot = [];
    const top = [];
    for (const [px, py] of poly2D) {
      bot.push(vAdd(cPos, vAdd(vScale(right, px), vScale(up, py))));
      top.push(
        vAdd(
          vAdd(cPos, vScale(out, thick)),
          vAdd(vScale(right, px * bevel), vScale(up, py * bevel))
        )
      );
    }
    const cTop = vAdd(cPos, vScale(out, thick + dome));
    const N = poly2D.length;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const edgeMid = vScale(vAdd(vAdd(bot[i], bot[j]), vAdd(top[i], top[j])), 0.25);
      this.addQuad(bot[i], bot[j], top[j], top[i], vAdd(vSub(edgeMid, cPos), vScale(out, 0.35)));
      this.addTri(cTop, top[j], top[i], out);
      this.addTri(cPos, bot[i], bot[j], vScale(out, -1));
    }
  }
}

// ---------------------------------------------------------------------------
// glTF 2.0 Binary (.glb) Scene Writer
// ---------------------------------------------------------------------------

class GLBSceneBuilder {
  constructor(generatorName = 'Starfall Aurelian Concord Tech GLB Generator') {
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
    roughness = 0.4,
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
        let minT = Infinity;
        let maxT = -Infinity;
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
// Shared Aurelian Concord Tech Palette (Grounded in RTSModels.gd)
// ---------------------------------------------------------------------------

function createConcordMaterials(scene) {
  // Surf_TEAM: Starfall Command Player 1 Blue (#4f8cf0) default for visible blue team panels
  const Surf_TEAM = scene.addMaterial({
    name: 'Surf_TEAM',
    baseColorHex: '#3c7ef0',
    metallic: 0.22,
    roughness: 0.36,
    emissiveHex: '#2b6de8',
    emissiveBoost: 0.42,
  });

  // Surf_GLOW: High-emission player accent gem/beacon (default luminous Starfall Blue)
  const Surf_GLOW = scene.addMaterial({
    name: 'Surf_GLOW',
    baseColorHex: '#7eb2ff',
    metallic: 0.0,
    roughness: 0.20,
    emissiveHex: '#4a88f5',
    emissiveBoost: 1.08,
  });

  // Warm sculpted Aurelian Ivory alloy (RTSModels.gd IVORY #bdb297 enriched for PBR)
  const Mat_Ivory = scene.addMaterial({
    name: 'Mat_Ivory',
    baseColorHex: '#c9bfa4',
    metallic: 0.18,
    roughness: 0.38,
  });

  // Lighter polished ivory bevel highlight for plate crowns
  const Mat_IvoryLight = scene.addMaterial({
    name: 'Mat_IvoryLight',
    baseColorHex: '#dfd7c0',
    metallic: 0.16,
    roughness: 0.32,
  });

  // Burnished Aurelian Gold structural ribs & collars (RTSModels.gd GOLD #b68d2c)
  const Mat_Gold = scene.addMaterial({
    name: 'Mat_Gold',
    baseColorHex: '#c89b32',
    metallic: 0.78,
    roughness: 0.28,
  });

  // Bright gleaming Aurelian Gold crest / bezel highlight
  const Mat_GoldBright = scene.addMaterial({
    name: 'Mat_GoldBright',
    baseColorHex: '#e6bc53',
    metallic: 0.80,
    roughness: 0.22,
  });

  // Dark slate-indigo stone plinth & recessed conduit channels (RTSModels.gd STONE_DARK #3a4150)
  const Mat_StoneDark = scene.addMaterial({
    name: 'Mat_StoneDark',
    baseColorHex: '#333b4a',
    metallic: 0.30,
    roughness: 0.56,
  });

  // Concord Core: Luminous Teal optical crystal lens (true blue-green teal under filmic tonemap)
  const Mat_TealLens = scene.addMaterial({
    name: 'Mat_TealLens',
    baseColorHex: '#0fd8a8',
    metallic: 0.05,
    roughness: 0.14,
    emissiveHex: '#08b88c',
    emissiveBoost: 0.86,
  });

  // Concord Core: Brilliant seafoam-teal focal iris & reactor core
  const Mat_TealCore = scene.addMaterial({
    name: 'Mat_TealCore',
    baseColorHex: '#9effe6',
    metallic: 0.0,
    roughness: 0.12,
    emissiveHex: '#42f5c8',
    emissiveBoost: 0.98,
  });

  // Concord Core: Translucent teal harmonic energy field (alpha BLEND)
  const Mat_TealField = scene.addMaterial({
    name: 'Mat_TealField',
    baseColorHex: '#1ce8ba',
    alpha: 0.42,
    metallic: 0.0,
    roughness: 0.18,
    emissiveHex: '#0ec49a',
    emissiveBoost: 0.68,
    doubleSided: true,
  });

  // Transit Waystone: Brilliant upright blue energy arch core (RTSModels.gd CRYSTAL #4fd1ff family)
  const Mat_WarpBlueBright = scene.addMaterial({
    name: 'Mat_WarpBlueBright',
    baseColorHex: '#6ce0ff',
    metallic: 0.0,
    roughness: 0.14,
    emissiveHex: '#38beff',
    emissiveBoost: 1.22,
  });

  // Transit Waystone: Royal-azure outer energy sheath (alpha BLEND)
  const Mat_WarpBlueHalo = scene.addMaterial({
    name: 'Mat_WarpBlueHalo',
    baseColorHex: '#226cff',
    alpha: 0.44,
    metallic: 0.0,
    roughness: 0.18,
    emissiveHex: '#185eff',
    emissiveBoost: 0.96,
    doubleSided: true,
  });

  // Transit Waystone: Shimmering upright blue warp portal curtain (alpha BLEND)
  const Mat_PortalCurtain = scene.addMaterial({
    name: 'Mat_PortalCurtain',
    baseColorHex: '#3896ff',
    alpha: 0.38,
    metallic: 0.0,
    roughness: 0.18,
    emissiveHex: '#2680ff',
    emissiveBoost: 0.80,
    doubleSided: true,
  });

  return {
    Surf_TEAM,
    Surf_GLOW,
    Mat_Ivory,
    Mat_IvoryLight,
    Mat_Gold,
    Mat_GoldBright,
    Mat_StoneDark,
    Mat_TealLens,
    Mat_TealCore,
    Mat_TealField,
    Mat_WarpBlueBright,
    Mat_WarpBlueHalo,
    Mat_PortalCurtain,
  };
}

/**
 * Helper: Generates an 8-sided regular octagon ring whose flat cardinal edges sit at exact ±halfWidth.
 */
function makeOctagonRing(halfWidth, y, offsetX = 0, offsetZ = 0) {
  const R = halfWidth / Math.cos(Math.PI / 8);
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (2 * Math.PI * i) / 8 + Math.PI / 8;
    pts.push([Math.cos(a) * R + offsetX, y, Math.sin(a) * R + offsetZ]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Asset 1: concord_core.glb
// Powered 3x3 Aurelian Concord research structure (~7.00 x 3.80 x 7.00, Y=0, +X forward):
// Radial ivory plates with gold ribs, central hovering teal lens, visible blue team panels.
// ---------------------------------------------------------------------------

function buildConcordCoreGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createConcordMaterials(scene);

  const rootIdx = scene.addNode({ name: 'ConcordCore', translation: [0, 0, 0] });

  const gIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gIvoryLight = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gGold = new PrimitiveGeom(mats.Mat_Gold);
  const gGoldBright = new PrimitiveGeom(mats.Mat_GoldBright);
  const gStone = new PrimitiveGeom(mats.Mat_StoneDark);
  const gTeal = new PrimitiveGeom(mats.Mat_TealLens);
  const gTealCore = new PrimitiveGeom(mats.Mat_TealCore);

  // -------------------------------------------------------------------------
  // 1. Grounded 7.00 x 7.00 Octagonal Powered Plinth (Y = 0.0000 exact)
  // -------------------------------------------------------------------------
  // Lower dark stone plinth: exact [-3.5000, +3.5000] in X and Z, Y = 0.0000 .. 0.3000
  gStone.addLoft(
    [
      makeOctagonRing(3.500, 0.000),
      makeOctagonRing(3.400, 0.280),
      makeOctagonRing(3.160, 0.300),
    ],
    [[0, 0.001, 0], [0, 0.280, 0], [0, 0.300, 0]],
    true,
    true
  );

  // Recessed glowing teal power-circuit band encircling the plinth (Y = 0.28 .. 0.40)
  gTeal.addLoft(
    [
      makeOctagonRing(3.260, 0.280),
      makeOctagonRing(3.260, 0.400),
    ],
    [[0, 0.281, 0], [0, 0.399, 0]],
    false,
    true
  );

  // Upper Ivory & Gold stepped sanctuary deck (Y = 0.39 .. 0.58)
  gGold.addLoft(
    [
      makeOctagonRing(3.340, 0.395),
      makeOctagonRing(3.280, 0.465),
    ],
    [[0, 0.396, 0], [0, 0.464, 0]],
    true,
    true
  );

  gIvory.addLoft(
    [
      makeOctagonRing(3.220, 0.465),
      makeOctagonRing(3.080, 0.580),
    ],
    [[0, 0.466, 0], [0, 0.579, 0]],
    false,
    true
  );

  // Sunken central arcane reactor well & glowing teal emitter floor (Y = 0.58 .. 0.88)
  const wellSectors = 12;
  const wellOuter = [];
  const wellInner = [];
  const wellCore = [];
  for (let s = 0; s < wellSectors; s++) {
    const th = (2 * Math.PI * s) / wellSectors;
    const ca = Math.cos(th), sa = Math.sin(th);
    wellOuter.push([ca * 1.62, 0.86, sa * 1.62]);
    wellInner.push([ca * 1.36, 0.62, sa * 1.36]);
    wellCore.push([ca * 0.96, 0.65, sa * 0.96]);
  }
  gStone.addLoft([wellInner, wellOuter], [[0, 0.62, 0], [0, 0.86, 0]], true, false);
  for (let s = 0; s < wellSectors; s++) {
    const sn = (s + 1) % wellSectors;
    gTeal.addQuad(wellCore[s], wellCore[sn], wellInner[sn], wellInner[s], [0, 1, 0]);
    gTealCore.addTri([0, 0.70, 0], wellCore[sn], wellCore[s], [0, 1, 0]);
  }

  // +X Forward Research Lectern & Conduit Forecourt (marks +X forward unmistakably)
  gIvory.addChamferBox({
    center: [2.88, 0.48, 0],
    size: [1.16, 0.54, 1.84],
    topScale: [0.86, 0.88],
    minYClamp: 0.0,
  });
  gGold.addChamferBox({
    center: [3.12, 0.78, 0],
    size: [0.64, 0.14, 1.48],
    topScale: [0.90, 0.90],
  });
  gTeal.addChamferBox({
    center: [3.14, 0.86, 0],
    size: [0.42, 0.07, 1.12],
    topScale: [0.90, 0.90],
  });

  // -------------------------------------------------------------------------
  // 2. 8 Radial Vaulted Ivory Plates + Burnished Gold Ribs (Y = 0.54 .. 2.76)
  // -------------------------------------------------------------------------
  const numPlates = 8;
  for (let k = 0; k < numPlates; k++) {
    const thC = (2 * Math.PI * k) / numPlates; // k=0 is +X forward!
    const isFront = k === 0;
    // Leave crisp radial energy gaps between plates so internal teal conduits shine through!
    const halfSpan = isFront ? 0.24 : 0.305; // out of pi/8 = 0.3927 rad

    // Radial profile stations from outer plinth inward to upper oculus ring
    const prof = isFront
      ? [
          { rOut: 2.98, rIn: 2.74, yTop: 0.82, yBot: 0.54, wMul: 1.00 },
          { rOut: 2.38, rIn: 2.16, yTop: 1.24, yBot: 0.92, wMul: 0.94 },
          { rOut: 1.72, rIn: 1.54, yTop: 1.46, yBot: 1.16, wMul: 0.88 },
        ]
      : [
          { rOut: 3.16, rIn: 2.86, yTop: 0.76, yBot: 0.52, wMul: 1.00 },
          { rOut: 2.76, rIn: 2.46, yTop: 1.48, yBot: 1.12, wMul: 0.98 },
          { rOut: 2.18, rIn: 1.90, yTop: 2.08, yBot: 1.68, wMul: 0.95 },
          { rOut: 1.56, rIn: 1.38, yTop: 2.34, yBot: 1.98, wMul: 0.90 },
        ];

    const plateRings = [];
    const plateCenters = [];
    for (const st of prof) {
      const hs = halfSpan * st.wMul;
      const thL = thC - hs;
      const thR = thC + hs;
      const cL = Math.cos(thL), sL = Math.sin(thL);
      const cM = Math.cos(thC), sM = Math.sin(thC);
      const cR = Math.cos(thR), sR = Math.sin(thR);

      // 6-point vaulted wedge cross-section (crowned along center azimuth thC)
      const ring = [
        [cL * st.rOut, st.yTop, sL * st.rOut],
        [cM * (st.rOut + 0.04), st.yTop + 0.09, sM * (st.rOut + 0.04)],
        [cR * st.rOut, st.yTop, sR * st.rOut],
        [cR * st.rIn, st.yBot, sR * st.rIn],
        [cM * st.rIn, st.yBot - 0.04, sM * st.rIn],
        [cL * st.rIn, st.yBot, sL * st.rIn],
      ];
      plateRings.push(ring);
      plateCenters.push([
        cM * ((st.rOut + st.rIn) * 0.5),
        (st.yTop + st.yBot) * 0.5,
        sM * ((st.rOut + st.rIn) * 0.5),
      ]);
    }
    gIvory.addLoft(plateRings, plateCenters, true, true);

    // Polished lighter-ivory inner lip cap on the upper vault edge
    if (!isFront) {
      const ca = Math.cos(thC), sa = Math.sin(thC);
      gIvoryLight.addOrientedShield(
        [ca * 1.72, 2.22, sa * 1.72],
        [ca * 0.36, 0.92, sa * 0.36],
        [-ca, 0, -sa],
        [
          [-0.36, -0.20],
          [0.36, -0.20],
          [0.28, 0.22],
          [-0.28, 0.22],
        ],
        0.06,
        0.86,
        0.015
      );
    }

    // Bold Burnished Gold Structural Rib sweeping up the center of each ivory plate!
    const ca = Math.cos(thC), sa = Math.sin(thC);
    const ribSpine = isFront
      ? [
          { pos: [ca * 3.38, 0.48, sa * 3.38], rx: 0.14, ry: 0.12 },
          { pos: [ca * 2.42, 1.28, sa * 2.42], rx: 0.13, ry: 0.14 },
          { pos: [ca * 1.56, 1.54, sa * 1.56], rx: 0.11, ry: 0.12 },
        ]
      : [
          { pos: [ca * 3.36, 0.48, sa * 3.36], rx: 0.16, ry: 0.14 },
          { pos: [ca * 2.82, 1.54, sa * 2.82], rx: 0.15, ry: 0.17 },
          { pos: [ca * 2.18, 2.18, sa * 2.18], rx: 0.14, ry: 0.16 },
          { pos: [ca * 1.44, 2.44, sa * 1.44], rx: 0.12, ry: 0.13 },
        ];
    gGold.addTubeAlongSpine(ribSpine, 5, true, true);

    // Inter-plate glowing teal power conduit + dark slate rib channel in each radial slot (thC + 22.5 deg)
    const thSlot = thC + Math.PI / numPlates;
    const cs = Math.cos(thSlot), ss = Math.sin(thSlot);
    gStone.addTubeAlongSpine(
      [
        { pos: [cs * 3.08, 0.56, ss * 3.08], rx: 0.18, ry: 0.10 },
        { pos: [cs * 2.32, 1.38, ss * 2.32], rx: 0.16, ry: 0.10 },
        { pos: [cs * 1.58, 1.88, ss * 1.58], rx: 0.14, ry: 0.09 },
      ],
      4,
      true,
      true
    );
    gTeal.addTubeAlongSpine(
      [
        { pos: [cs * 2.98, 0.66, ss * 2.98], rx: 0.065, ry: 0.065 },
        { pos: [cs * 2.28, 1.48, ss * 2.28], rx: 0.060, ry: 0.060 },
        { pos: [cs * 1.58, 1.96, ss * 1.58], rx: 0.055, ry: 0.055 },
      ],
      4,
      true,
      true
    );
    // Golden inter-plate perimeter fin anchoring each radial slot on the plinth
    gGoldBright.addTubeAlongSpine(
      [
        { pos: [cs * 3.38, 0.46, ss * 3.38], rx: 0.11, ry: 0.12 },
        { pos: [cs * 3.02, 0.92, ss * 3.02], rx: 0.07, ry: 0.08 },
      ],
      4,
      true,
      true
    );
  }

  // Upper Burnished Gold Oculus Crown Collar linking all radial ribs around the central well
  const collarRings = [];
  const collarCenters = [];
  const collarSectors = 16;
  for (let s = 0; s < collarSectors; s++) {
    const th = (2 * Math.PI * s) / collarSectors;
    const ca = Math.cos(th), sa = Math.sin(th);
    const frontDip = 1.0 - 0.34 * Math.pow(Math.max(0, ca), 6.0);
    const yC = 2.24 * frontDip + (1.0 - frontDip) * 1.46;
    collarRings.push([
      [ca * 1.66, yC - 0.12, sa * 1.66],
      [ca * 1.68, yC + 0.12, sa * 1.68],
      [ca * 1.38, yC + 0.16, sa * 1.38],
      [ca * 1.36, yC - 0.10, sa * 1.36],
    ]);
    collarCenters.push([ca * 1.52, yC + 0.02, sa * 1.52]);
  }
  gGold.addCyclicRingLoft(collarRings, collarCenters);

  // 3 Tall Golden Arcane Focusing Pylons (-X, +Z, -Z) framing the hovering teal lens (tier above Waystone!)
  for (const thP of [Math.PI * 0.5, -Math.PI * 0.5, Math.PI]) {
    const ca = Math.cos(thP), sa = Math.sin(thP);
    gGoldBright.addTubeAlongSpine(
      [
        { pos: [ca * 1.64, 2.18, sa * 1.64], rx: 0.18, ry: 0.16 },
        { pos: [ca * 1.56, 2.74, sa * 1.56], rx: 0.12, ry: 0.11 },
        { pos: [ca * 1.32, 3.08, sa * 1.32], rx: 0.045, ry: 0.045 },
      ],
      5,
      true,
      true
    );
  }

  // -------------------------------------------------------------------------
  // 3. 6 Large Visible Blue Team Panels (Surf_TEAM_*) & 4 Surf_GLOW_* Nodes
  // -------------------------------------------------------------------------
  const shieldPoly = [
    [-0.64, -0.40],
    [0.64, -0.40],
    [0.50, 0.40],
    [0.00, 0.50],
    [-0.50, 0.40],
  ];
  const coreTeamSpecs = [
    { name: 'Surf_TEAM_FrontR', th: Math.PI * 0.25 },
    { name: 'Surf_TEAM_FrontL', th: -Math.PI * 0.25 },
    { name: 'Surf_TEAM_SideR', th: Math.PI * 0.50 },
    { name: 'Surf_TEAM_SideL', th: -Math.PI * 0.50 },
    { name: 'Surf_TEAM_RearR', th: Math.PI * 0.75 },
    { name: 'Surf_TEAM_RearL', th: -Math.PI * 0.75 },
  ];

  for (const ts of coreTeamSpecs) {
    const ca = Math.cos(ts.th), sa = Math.sin(ts.th);
    const cPos = [ca * 2.50, 1.62, sa * 2.50];
    const outDir = vNorm([ca * 0.64, 0.77, sa * 0.64]);
    const upInPlane = [-ca, 0.82, -sa];

    // Burnished gold heraldic bezel frame on CoreStructure
    const bezelPoly = shieldPoly.map(([x, y]) => [x * 1.13, y * 1.13]);
    gGoldBright.addOrientedShield(cPos, outDir, upInPlane, bezelPoly, 0.08, 0.88, 0.01);

    // Player team color panel mesh node (Surf_TEAM_*)
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(
      vAdd(cPos, vScale(outDir, 0.048)),
      outDir,
      upInPlane,
      shieldPoly,
      0.09,
      0.86,
      0.03
    );
    const tMesh = scene.addMesh(ts.name, [gTeam]);
    scene.addNode({ name: ts.name, meshIndex: tMesh, parentIndex: rootIdx });
  }

  // 4 Surf_GLOW_* player-emissive crystal nodes (+X forecourt beacons & lateral spire gems)
  const coreGlowSpecs = [
    { name: 'Surf_GLOW_FrontR', pos: [3.08, 0.74, 0.96], r: [0.18, 0.22, 0.18] },
    { name: 'Surf_GLOW_FrontL', pos: [3.08, 0.74, -0.96], r: [0.18, 0.22, 0.18] },
    { name: 'Surf_GLOW_SideR', pos: [0.00, 2.38, 1.98], r: [0.19, 0.24, 0.19] },
    { name: 'Surf_GLOW_SideL', pos: [0.00, 2.38, -1.98], r: [0.19, 0.24, 0.19] },
  ];
  for (const gs of coreGlowSpecs) {
    gGold.addChamferBox({
      center: [gs.pos[0], gs.pos[1] - 0.12, gs.pos[2]],
      size: [gs.r[0] * 2.4, 0.18, gs.r[2] * 2.4],
      topScale: [0.82, 0.82],
    });
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({ center: gs.pos, radii: gs.r, sectors: 6, stacks: 4 });
    const gMesh = scene.addMesh(gs.name, [gGlow]);
    scene.addNode({ name: gs.name, meshIndex: gMesh, parentIndex: rootIdx });
  }

  const coreBaseMesh = scene.addMesh('CoreStructure_Mesh', [
    gIvory,
    gIvoryLight,
    gGold,
    gGoldBright,
    gStone,
    gTeal,
    gTealCore,
  ]);
  scene.addNode({ name: 'CoreStructure', meshIndex: coreBaseMesh, parentIndex: rootIdx });

  // -------------------------------------------------------------------------
  // 4. Central Hovering Teal Lens, Astrolabe Gimbal & Harmonic Beam
  // -------------------------------------------------------------------------
  // Translucent teal energy column connecting reactor well to the hovering teal lens
  const gBeam = new PrimitiveGeom(mats.Mat_TealField);
  const beamSectors = 10;
  const beamBot = [];
  const beamTop = [];
  for (let s = 0; s < beamSectors; s++) {
    const th = (2 * Math.PI * s) / beamSectors;
    beamBot.push([Math.cos(th) * 0.72, -0.92, Math.sin(th) * 0.72]);
    beamTop.push([Math.cos(th) * 0.44, 0.92, Math.sin(th) * 0.44]);
  }
  gBeam.addLoft([beamBot, beamTop], [[0, -0.92, 0], [0, 0.92, 0]], false, false);
  const beamMesh = scene.addMesh('ReactorBeam_Mesh', [gBeam]);
  const beamNodeIdx = scene.addNode({
    name: 'ReactorBeam',
    meshIndex: beamMesh,
    translation: [0, 1.72, 0],
    parentIndex: rootIdx,
  });

  // Central Hovering Teal Lens (Y = 3.12, biconvex 12-sided teal optic crystal + gold bezel + bright iris!)
  const lensPivotY = 3.12;
  const gLensTeal = new PrimitiveGeom(mats.Mat_TealLens);
  const gLensIris = new PrimitiveGeom(mats.Mat_TealCore);
  const gLensGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gLensAura = new PrimitiveGeom(mats.Mat_TealField);

  // Main biconvex teal crystal lens body (radius 1.18, thickness ±0.36)
  gLensTeal.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [1.18, 0.38, 1.18],
    sectors: 12,
    stacks: 4,
  });

  // Brilliant upper & lower focal iris prism crown so the lens gleams intensely from overhead RTS camera
  gLensIris.addFacetedCrystal({
    center: [0, 0.14, 0],
    radii: [0.62, 0.34, 0.62],
    sectors: 8,
    stacks: 4,
  });

  // Burnished gold equatorial optical bezel ring & 4 vernier clasps cradling the hovering teal lens
  const bezelSectors = 12;
  const bezelRings = [];
  const bezelCenters = [];
  for (let s = 0; s < bezelSectors; s++) {
    const th = (2 * Math.PI * s) / bezelSectors;
    const ca = Math.cos(th), sa = Math.sin(th);
    bezelRings.push([
      [ca * 1.25, -0.07, sa * 1.25],
      [ca * 1.25, 0.07, sa * 1.25],
      [ca * 1.10, 0.11, sa * 1.10],
      [ca * 1.10, -0.11, sa * 1.10],
    ]);
    bezelCenters.push([ca * 1.175, 0, sa * 1.175]);
  }
  gLensGold.addCyclicRingLoft(bezelRings, bezelCenters);

  for (let i = 0; i < 4; i++) {
    const th = (Math.PI * 0.5) * i + Math.PI * 0.25;
    gLensGold.addChamferBox({
      center: [Math.cos(th) * 1.22, 0, Math.sin(th) * 1.22],
      size: [0.24, 0.24, 0.24],
      rotDeg: [0, (-th * 180) / Math.PI, 0],
    });
  }

  // Translucent teal refraction corona halo just outside the gold bezel
  gLensAura.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [1.34, 0.14, 1.34],
    sectors: 12,
    stacks: 4,
  });

  // Emit opaque primitives BEFORE translucent aura primitive!
  const hoverLensMesh = scene.addMesh('HoverLens_Mesh', [
    gLensTeal,
    gLensIris,
    gLensGold,
    gLensAura,
  ]);
  const hoverLensNodeIdx = scene.addNode({
    name: 'HoverLens',
    meshIndex: hoverLensMesh,
    translation: [0, lensPivotY, 0],
    parentIndex: rootIdx,
  });

  // Orbiting Gold & Teal Astrolabe Gimbal Ring around HoverLens (reaches max Y ~ 3.80)
  const gGimbalGold = new PrimitiveGeom(mats.Mat_Gold);
  const gGimbalTeal = new PrimitiveGeom(mats.Mat_TealLens);
  const gimSectors = 16;
  const gimRings = [];
  const gimCenters = [];
  const tiltRad = (22 * Math.PI) / 180;
  for (let s = 0; s < gimSectors; s++) {
    const th = (2 * Math.PI * s) / gimSectors;
    const x0 = Math.cos(th), z0 = Math.sin(th);
    const rotTilt = (r, dy) => {
      const lx = x0 * r;
      const ly = dy;
      const lz = z0 * r;
      return [
        lx * Math.cos(tiltRad) - ly * Math.sin(tiltRad),
        lx * Math.sin(tiltRad) + ly * Math.cos(tiltRad),
        lz,
      ];
    };
    gimRings.push([
      rotTilt(1.62, -0.055),
      rotTilt(1.62, 0.055),
      rotTilt(1.48, 0.075),
      rotTilt(1.48, -0.075),
    ]);
    gimCenters.push(rotTilt(1.55, 0));
  }
  gGimbalGold.addCyclicRingLoft(gimRings, gimCenters);

  // 2 small teal calibration nodes at the tilted astrolabe poles
  for (const sgn of [-1, 1]) {
    gGimbalTeal.addFacetedCrystal({
      center: [sgn * 1.55 * Math.cos(tiltRad), sgn * 1.55 * Math.sin(tiltRad), 0],
      radii: [0.13, 0.18, 0.13],
      sectors: 6,
      stacks: 4,
    });
  }

  const gimbalMesh = scene.addMesh('AstrolabeGimbal_Mesh', [gGimbalGold, gGimbalTeal]);
  const gimbalNodeIdx = scene.addNode({
    name: 'AstrolabeGimbal',
    meshIndex: gimbalMesh,
    translation: [0, lensPivotY, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 5. Seamless Looping 'idle' Animation (3.2s levitating teal lens & gimbal precession)
  // -------------------------------------------------------------------------
  const cTimes = [0.0, 0.8, 1.6, 2.4, 3.2];
  scene.addAnimation('idle', [
    {
      nodeIndex: hoverLensNodeIdx,
      path: 'translation',
      times: cTimes,
      values: [
        [0, lensPivotY, 0],
        [0, lensPivotY + 0.10, 0],
        [0, lensPivotY, 0],
        [0, lensPivotY - 0.08, 0],
        [0, lensPivotY, 0],
      ],
    },
    {
      nodeIndex: hoverLensNodeIdx,
      path: 'rotation',
      times: cTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(3.5, 16, -2.5),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-3.5, -16, 2.5),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: gimbalNodeIdx,
      path: 'translation',
      times: cTimes,
      values: [
        [0, lensPivotY, 0],
        [0, lensPivotY + 0.06, 0],
        [0, lensPivotY, 0],
        [0, lensPivotY - 0.05, 0],
        [0, lensPivotY, 0],
      ],
    },
    {
      nodeIndex: gimbalNodeIdx,
      path: 'rotation',
      times: cTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-8, -24, 6),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(8, 24, -6),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: beamNodeIdx,
      path: 'scale',
      times: cTimes,
      values: [
        [1.0, 1.0, 1.0],
        [1.08, 1.04, 1.08],
        [1.0, 1.0, 1.0],
        [0.93, 0.96, 0.93],
        [1.0, 1.0, 1.0],
      ],
    },
  ]);

  return scene.buildGLB('ConcordCoreScene');
}

// ---------------------------------------------------------------------------
// Asset 2: transit_waystone.glb
// Warp Gate mode of Waystone (~7.00 x 5.55 x 7.00, Y=0, +X forward):
// Similar ivory/gold Waystone base footprint with +X arrival ramp, deployed
// split ivory/gold crescent pylons, and an unmistakable upright blue energy arch.
// ---------------------------------------------------------------------------

function buildTransitWaystoneGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createConcordMaterials(scene);

  const rootIdx = scene.addNode({ name: 'TransitWaystone', translation: [0, 0, 0] });

  const gIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gIvoryLight = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gGold = new PrimitiveGeom(mats.Mat_Gold);
  const gGoldBright = new PrimitiveGeom(mats.Mat_GoldBright);
  const gStone = new PrimitiveGeom(mats.Mat_StoneDark);
  const gWarpBlue = new PrimitiveGeom(mats.Mat_WarpBlueBright);

  // -------------------------------------------------------------------------
  // 1. Grounded 7.00 x 7.00 Ivory/Gold Waystone Plinth (Y = 0.0000, +X forward)
  // -------------------------------------------------------------------------
  // Chamfered Waystone dark-stone ground plinth spanning exact [-3.500, +3.500] in X and Z!
  const makeChamferRect = (hx, hz, ch, y, ox = 0) => [
    [hx + ox, y, hz - ch],
    [hx - ch + ox, y, hz],
    [-hx + ch + ox, y, hz],
    [-hx + ox, y, hz - ch],
    [-hx + ox, y, -hz + ch],
    [-hx + ch + ox, y, -hz],
    [hx - ch + ox, y, -hz],
    [hx + ox, y, -hz + ch],
  ];

  gStone.addLoft(
    [
      makeChamferRect(3.500, 3.500, 0.72, 0.000),
      makeChamferRect(3.400, 3.400, 0.68, 0.300),
    ],
    [[0, 0.001, 0], [0, 0.299, 0]],
    true,
    true
  );

  // Stepped Ivory Waystone Deck & Gold Trim (echoing RTSModels.gd _waystone base!)
  gGold.addLoft(
    [
      makeChamferRect(3.260, 3.240, 0.64, 0.300),
      makeChamferRect(3.180, 3.160, 0.62, 0.390),
    ],
    [[0, 0.301, 0], [0, 0.389, 0]],
    false,
    true
  );

  gIvory.addLoft(
    [
      makeChamferRect(3.080, 3.060, 0.58, 0.390),
      makeChamferRect(2.940, 2.920, 0.54, 0.520),
    ],
    [[0, 0.391, 0], [0, 0.519, 0]],
    false,
    true
  );

  // Central Circular Warp Phase Matrix Pad inlaid into the Ivory deck (Y = 0.52 .. 0.58)
  const padSectors = 16;
  const padGoldOuter = [];
  const padGoldInner = [];
  const padBlueDisc = [];
  for (let s = 0; s < padSectors; s++) {
    const th = (2 * Math.PI * s) / padSectors;
    const ca = Math.cos(th), sa = Math.sin(th);
    padGoldOuter.push([ca * 1.92, 0.520, sa * 1.92]);
    padGoldInner.push([ca * 1.66, 0.565, sa * 1.66]);
    padBlueDisc.push([ca * 1.56, 0.555, sa * 1.56]);
  }
  gGoldBright.addLoft([padGoldOuter, padGoldInner], [[0, 0.52, 0], [0, 0.565, 0]], false, true);
  for (let s = 0; s < padSectors; s++) {
    const sn = (s + 1) % padSectors;
    gWarpBlue.addTri([0, 0.575, 0], padBlueDisc[sn], padBlueDisc[s], [0, 1, 0]);
  }

  // +X Forward Ceremonial Transit Arrival Ramp & Illuminated Blue Runway Chevrons
  gIvoryLight.addLoft(
    [
      [
        [3.48, 0.02, 1.44],
        [3.48, 0.02, -1.44],
        [2.45, 0.02, -1.56],
        [2.45, 0.02, 1.56],
      ],
      [
        [3.36, 0.22, 1.32],
        [3.36, 0.22, -1.32],
        [2.28, 0.53, -1.44],
        [2.28, 0.53, 1.44],
      ],
    ],
    [[2.95, 0.025, 0], [2.82, 0.38, 0]],
    true,
    true
  );

  // Twin gold curb rails & 3 crisp elevated glowing blue transit chevrons pointing toward +X forward!
  for (const side of [-1, 1]) {
    gGold.addTubeAlongSpine(
      [
        { pos: [2.28, 0.62, side * 1.46], rx: 0.13, ry: 0.09 },
        { pos: [3.38, 0.30, side * 1.34], rx: 0.11, ry: 0.08 },
      ],
      4,
      true,
      true
    );
  }
  for (const [cx, cy] of [[2.50, 0.55], [2.84, 0.45], [3.18, 0.35]]) {
    gWarpBlue.addTubeAlongSpine(
      [
        { pos: [cx - 0.10, cy + 0.03, -0.82], rx: 0.055, ry: 0.040 },
        { pos: [cx + 0.14, cy - 0.01, 0.00], rx: 0.065, ry: 0.044 },
        { pos: [cx - 0.10, cy + 0.03, 0.82], rx: 0.055, ry: 0.040 },
      ],
      4,
      true,
      true
    );
  }

  // -X Rear Phase Capacitor Spine (anchors the rear and contrasts with +X open arrival ramp)
  gStone.addChamferBox({
    center: [-2.78, 0.68, 0],
    size: [0.92, 0.72, 2.24],
    topScale: [0.82, 0.86],
  });
  gGold.addChamferBox({
    center: [-2.78, 1.08, 0],
    size: [0.68, 0.18, 1.86],
    topScale: [0.88, 0.88],
  });

  // -------------------------------------------------------------------------
  // 2. Deployed Ivory & Gold Waystone Crescent Pylons (Z = ±2.38, Y = 0.50 .. 4.35)
  //    Anchored with gold collars like Waystone, sweeping upward & +X forward
  //    with unlocked golden emitter jaws projecting the upright blue energy arch!
  // -------------------------------------------------------------------------
  const evalArchPoint = (u) => {
    const u2 = u * u;
    const z = 2.18 * u * (1.0 + 0.09 * (1.0 - u2)); // Horseshoe flare at mid-height
    const y = 0.58 + 4.70 * (1.0 - Math.pow(Math.abs(u), 2.15)); // Rises to Y = 5.28 centerline
    const x = -0.74 + 1.56 * (1.0 - u2); // Sweeps from x = -0.74 at base forward to x = +0.82 at crown!
    return [x, y, z];
  };

  for (const side of [-1, 1]) {
    // Heavy Burnished Gold Base Collar (direct visual link to RTSModels.gd _waystone!)
    gGold.addChamferBox({
      center: [-0.70, 0.68, side * 2.38],
      size: [1.34, 0.38, 1.34],
      topScale: [0.88, 0.88],
    });

    // Sculpted Ivory Crescent Monolith Pylon rising from Y = 0.82 up to Y = 4.08
    const pylonSpine = [
      { pos: [-0.70, 0.78, side * 2.38], rx: 0.56, ry: 0.52 },
      { pos: [-0.50, 1.92, side * 2.52], rx: 0.48, ry: 0.46 },
      { pos: [-0.14, 3.12, side * 2.38], rx: 0.40, ry: 0.40 },
      { pos: [0.24, 4.04, side * 1.98], rx: 0.28, ry: 0.28 },
    ];
    gIvory.addTubeAlongSpine(pylonSpine, 6, true, true, null, Math.PI / 6);

    // Polished lighter-ivory outer wing fin giving crisp Aurelian silhouette
    gIvoryLight.addTubeAlongSpine(
      [
        { pos: [-0.76, 1.15, side * 2.82], rx: 0.16, ry: 0.24 },
        { pos: [-0.56, 2.38, side * 2.98], rx: 0.14, ry: 0.22 },
        { pos: [-0.18, 3.56, side * 2.74], rx: 0.08, ry: 0.12 },
      ],
      4,
      true,
      true
    );

    // Burnished Gold mid-band & unlocked upper emitter collar (replaces Waystone's closed lintel!)
    gGold.addChamferBox({
      center: [-0.42, 2.18, side * 2.50],
      size: [1.06, 0.26, 1.06],
      rotDeg: [side * -6, 0, -12],
      topScale: [0.92, 0.92],
    });
    gGoldBright.addChamferBox({
      center: [0.22, 4.00, side * 2.02],
      size: [0.86, 0.34, 0.86],
      rotDeg: [side * -24, 0, -20],
      topScale: [0.86, 0.86],
    });

    // Twin open golden emitter prongs aiming inward along the blue energy arch!
    gGoldBright.addTubeAlongSpine(
      [
        { pos: [0.26, 4.06, side * 1.94], rx: 0.16, ry: 0.14 },
        { pos: [0.48, 4.58, side * 1.48], rx: 0.06, ry: 0.06 },
      ],
      4,
      true,
      true
    );

    // Lower rear gold buttress strut bracing the forward-swept pylon onto the plinth
    gGold.addTubeAlongSpine(
      [
        { pos: [-1.82, 0.52, side * 2.34], rx: 0.20, ry: 0.18 },
        { pos: [-1.20, 1.48, side * 2.42], rx: 0.16, ry: 0.15 },
        { pos: [-0.54, 2.28, side * 2.46], rx: 0.14, ry: 0.13 },
      ],
      4,
      true,
      true
    );
  }

  // -------------------------------------------------------------------------
  // 3. Surf_TEAM_* & Surf_GLOW_* Player Accent Nodes on Transit Waystone
  //    2 flush pylon shoulder shields + 2 flush +X Waystone deck heraldic plates!
  // -------------------------------------------------------------------------
  const pylonShieldPoly = [
    [-0.38, -0.52],
    [0.38, -0.52],
    [0.46, 0.20],
    [0.00, 0.56],
    [-0.46, 0.20],
  ];
  const deckShieldPoly = [
    [-0.58, -0.36],
    [0.58, -0.36],
    [0.46, 0.36],
    [0.00, 0.46],
    [-0.46, 0.36],
  ];
  const waystoneTeamSpecs = [
    {
      name: 'Surf_TEAM_PylonR',
      pos: [-0.28, 3.04, 2.68],
      out: [-0.05, 0.60, 0.80],
      up: [0.22, 0.78, -0.58],
      poly: pylonShieldPoly,
    },
    {
      name: 'Surf_TEAM_PylonL',
      pos: [-0.28, 3.04, -2.68],
      out: [-0.05, 0.60, -0.80],
      up: [0.22, 0.78, 0.58],
      poly: pylonShieldPoly,
    },
    {
      name: 'Surf_TEAM_DeckR',
      pos: [1.58, 0.54, 2.18],
      out: [0.16, 0.96, 0.22],
      up: [1.0, 0.0, 0.0],
      poly: deckShieldPoly,
    },
    {
      name: 'Surf_TEAM_DeckL',
      pos: [1.58, 0.54, -2.18],
      out: [0.16, 0.96, -0.22],
      up: [1.0, 0.0, 0.0],
      poly: deckShieldPoly,
    },
  ];

  for (const ts of waystoneTeamSpecs) {
    const bezelPoly = ts.poly.map(([x, y]) => [x * 1.15, y * 1.15]);
    gGoldBright.addOrientedShield(ts.pos, ts.out, ts.up, bezelPoly, 0.065, 0.88, 0.01);

    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(
      vAdd(ts.pos, vScale(vNorm(ts.out), 0.042)),
      ts.out,
      ts.up,
      ts.poly,
      0.075,
      0.85,
      0.025
    );
    const tMesh = scene.addMesh(ts.name, [gTeam]);
    scene.addNode({ name: ts.name, meshIndex: tMesh, parentIndex: rootIdx });
  }

  // 3 Surf_GLOW_* player-emissive beacons (+X ramp threshold pair & -X rear capacitor gem)
  const waystoneGlowSpecs = [
    { name: 'Surf_GLOW_FrontR', pos: [3.08, 0.66, 1.48], r: [0.18, 0.24, 0.18] },
    { name: 'Surf_GLOW_FrontL', pos: [3.08, 0.66, -1.48], r: [0.18, 0.24, 0.18] },
    { name: 'Surf_GLOW_RearCore', pos: [-2.78, 1.34, 0.00], r: [0.22, 0.26, 0.22] },
  ];
  for (const gs of waystoneGlowSpecs) {
    gGold.addChamferBox({
      center: [gs.pos[0], gs.pos[1] - 0.14, gs.pos[2]],
      size: [0.42, 0.20, 0.42],
      topScale: [0.84, 0.84],
    });
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({ center: gs.pos, radii: gs.r, sectors: 6, stacks: 4 });
    const gMesh = scene.addMesh(gs.name, [gGlow]);
    scene.addNode({ name: gs.name, meshIndex: gMesh, parentIndex: rootIdx });
  }

  const waystoneBaseMesh = scene.addMesh('WaystoneFrame_Mesh', [
    gIvory,
    gIvoryLight,
    gGold,
    gGoldBright,
    gStone,
    gWarpBlue,
  ]);
  scene.addNode({ name: 'WaystoneFrame', meshIndex: waystoneBaseMesh, parentIndex: rootIdx });

  // -------------------------------------------------------------------------
  // 4. Unmistakable Upright Blue Energy Arch & Shimmering Warp Portal Field!
  //    Max height ~ 5.75 world units; prominent 3D plasma-crystal beam + corona + curtain.
  // -------------------------------------------------------------------------
  const archPivotY = 2.95;
  const gArchCore = new PrimitiveGeom(mats.Mat_WarpBlueBright);
  const gArchHalo = new PrimitiveGeom(mats.Mat_WarpBlueHalo);

  const archSteps = 18;
  const coreSpine = [];
  const haloSpine = [];
  for (let i = 0; i <= archSteps; i++) {
    const u = -1.0 + (2.0 * i) / archSteps;
    const pt = evalArchPoint(u);
    const crownFactor = 1.0 - u * u;
    const rCore = 0.18 + 0.12 * crownFactor;
    const rHalo = 0.25 + 0.15 * crownFactor;
    coreSpine.push({
      pos: [pt[0], pt[1] - archPivotY, pt[2]],
      rx: rCore,
      ry: rCore * 1.12,
      upHint: [1, 0, 0],
    });
    haloSpine.push({
      pos: [pt[0], pt[1] - archPivotY, pt[2]],
      rx: rHalo,
      ry: rHalo * 1.12,
      upHint: [1, 0, 0],
    });
  }
  gArchCore.addTubeAlongSpine(coreSpine, 6, true, true);
  gArchHalo.addTubeAlongSpine(haloSpine, 6, true, true);

  // 5 Bold Radiating Crystalline Blue Energy Crown Spires along the upper arch!
  for (const uFlare of [-0.44, -0.22, 0.0, 0.22, 0.44]) {
    const basePt = evalArchPoint(uFlare);
    const isApex = Math.abs(uFlare) < 0.01;
    const flareLen = isApex ? 0.50 : 0.40;
    const radDir = vNorm([0.24, 1.0, uFlare * 0.92]);
    const tipPt = vAdd(basePt, vScale(radDir, flareLen));
    gArchCore.addTubeAlongSpine(
      [
        { pos: [basePt[0], basePt[1] - 0.05 - archPivotY, basePt[2]], rx: 0.16, ry: 0.13, upHint: [1, 0, 0] },
        { pos: [tipPt[0], tipPt[1] - archPivotY, tipPt[2]], rx: 0.03, ry: 0.03, upHint: [1, 0, 0] },
      ],
      4,
      true,
      true
    );
  }

  // Emit opaque bright core FIRST, translucent outer halo SECOND!
  const energyArchMesh = scene.addMesh('EnergyArch_Mesh', [gArchCore, gArchHalo]);
  const energyArchNodeIdx = scene.addNode({
    name: 'EnergyArch',
    meshIndex: energyArchMesh,
    translation: [0, archPivotY, 0],
    parentIndex: rootIdx,
  });

  // Floating Golden & Blue Apex Keystone suspended inside the top of the upright blue arch
  const keystoneY = 4.58;
  const gKeyGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gKeyBlue = new PrimitiveGeom(mats.Mat_WarpBlueBright);
  gKeyGold.addChamferBox({
    center: [0.72, 0, 0],
    size: [0.34, 0.42, 0.56],
    rotDeg: [0, 0, -16],
    topScale: [0.76, 0.76],
  });
  gKeyBlue.addFacetedCrystal({
    center: [0.72, -0.26, 0],
    radii: [0.16, 0.30, 0.18],
    sectors: 6,
    stacks: 4,
  });
  const keystoneMesh = scene.addMesh('ApexKeystone_Mesh', [gKeyGold, gKeyBlue]);
  const keystoneNodeIdx = scene.addNode({
    name: 'ApexKeystone',
    meshIndex: keystoneMesh,
    translation: [0, keystoneY, 0],
    parentIndex: rootIdx,
  });

  // Upright Translucent Blue Warp Portal Curtain spanning the interior of the arch
  const gCurtain = new PrimitiveGeom(mats.Mat_PortalCurtain);
  const curtainCenter = [0.05, 2.35, 0.0];
  const curtainPairs = 8;
  for (let i = 0; i < curtainPairs; i++) {
    const uA = (i / curtainPairs) * 0.92;
    const uB = ((i + 1) / curtainPairs) * 0.92;
    const pRA = evalArchPoint(uA);
    const pRB = evalArchPoint(uB);
    const pLA = evalArchPoint(-uA);
    const pLB = evalArchPoint(-uB);
    // Inset slightly inside the bright arch tube
    const inset = (p) => [p[0] * 0.94, Math.max(0.58, p[1] - 0.18), p[2] * 0.90];
    gCurtain.addTri(curtainCenter, inset(pRA), inset(pRB), [1, 0, 0]);
    gCurtain.addTri(curtainCenter, inset(pLB), inset(pLA), [1, 0, 0]);
  }
  // Close bottom threshold between left and right base to curtainCenter
  const pRBot = [-0.50, 0.58, 1.92];
  const pLBot = [-0.50, 0.58, -1.92];
  gCurtain.addTri(curtainCenter, pRBot, pLBot, [1, 0, 0]);

  const curtainMesh = scene.addMesh('PortalCurtain_Mesh', [gCurtain]);
  const curtainNodeIdx = scene.addNode({
    name: 'PortalCurtain',
    meshIndex: curtainMesh,
    translation: [0, 0, 0],
    parentIndex: rootIdx,
  });

  // Inner Pulsing Blue Warp Vortex Ring suspended in the middle of the portal curtain
  const vortexPivot = [0.08, 2.58, 0];
  const gVortex = new PrimitiveGeom(mats.Mat_WarpBlueHalo);
  const vSectors = 14;
  const vRings = [];
  const vCenters = [];
  for (let s = 0; s < vSectors; s++) {
    const th = (2 * Math.PI * s) / vSectors;
    const cy = Math.cos(th), sz = Math.sin(th);
    const rZ = 1.18, rY = 1.52;
    const xRake = 0.24 * cy; // Aligns with forward rake of the arch!
    vRings.push([
      [xRake - 0.05, cy * rY, sz * rZ],
      [xRake + 0.05, cy * rY, sz * rZ],
      [xRake + 0.05, cy * (rY - 0.20), sz * (rZ - 0.18)],
      [xRake - 0.05, cy * (rY - 0.20), sz * (rZ - 0.18)],
    ]);
    vCenters.push([xRake, cy * (rY - 0.10), sz * (rZ - 0.09)]);
  }
  gVortex.addCyclicRingLoft(vRings, vCenters);
  const vortexMesh = scene.addMesh('PortalVortex_Mesh', [gVortex]);
  const vortexNodeIdx = scene.addNode({
    name: 'PortalVortex',
    meshIndex: vortexMesh,
    translation: vortexPivot,
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 5. Seamless Looping 'idle' Animation (2.8s warp arch surge & vortex pulse)
  // -------------------------------------------------------------------------
  const wTimes = [0.0, 0.7, 1.4, 2.1, 2.8];
  scene.addAnimation('idle', [
    {
      nodeIndex: energyArchNodeIdx,
      path: 'scale',
      times: wTimes,
      values: [
        [1.0, 1.0, 1.0],
        [1.022, 1.012, 1.018],
        [1.0, 1.0, 1.0],
        [0.988, 0.994, 0.990],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: keystoneNodeIdx,
      path: 'translation',
      times: wTimes,
      values: [
        [0, keystoneY, 0],
        [0.02, keystoneY + 0.09, 0],
        [0, keystoneY, 0],
        [-0.01, keystoneY - 0.06, 0],
        [0, keystoneY, 0],
      ],
    },
    {
      nodeIndex: vortexNodeIdx,
      path: 'scale',
      times: wTimes,
      values: [
        [1.0, 1.0, 1.0],
        [1.08, 1.07, 1.07],
        [1.0, 1.0, 1.0],
        [0.92, 0.93, 0.93],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: vortexNodeIdx,
      path: 'translation',
      times: wTimes,
      values: [
        vortexPivot,
        [vortexPivot[0] + 0.06, vortexPivot[1] + 0.04, 0],
        vortexPivot,
        [vortexPivot[0] - 0.04, vortexPivot[1] - 0.03, 0],
        vortexPivot,
      ],
    },
    {
      nodeIndex: curtainNodeIdx,
      path: 'scale',
      times: wTimes,
      values: [
        [1.0, 1.0, 1.0],
        [1.015, 1.0, 1.012],
        [1.0, 1.0, 1.0],
        [0.990, 1.0, 0.992],
        [1.0, 1.0, 1.0],
      ],
    },
  ]);

  return scene.buildGLB('TransitWaystoneScene');
}

// ---------------------------------------------------------------------------
// Self-Validation Summary & CLI Entry Point
// ---------------------------------------------------------------------------

function summarizeConcordAsset(filename, glbBuffer, gltf) {
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

  const core = buildConcordCoreGLB();
  fs.writeFileSync(path.join(outDir, 'concord_core.glb'), core.glb);

  const waystone = buildTransitWaystoneGLB();
  fs.writeFileSync(path.join(outDir, 'transit_waystone.glb'), waystone.glb);

  const summary = [
    summarizeConcordAsset('concord_core.glb', core.glb, core.gltf),
    summarizeConcordAsset('transit_waystone.glb', waystone.glb, waystone.gltf),
  ];

  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildConcordCoreGLB,
  buildTransitWaystoneGLB,
};
