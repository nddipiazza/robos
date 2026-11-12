#!/usr/bin/env node
'use strict';

/**
 * Deterministic standalone glTF 2.0 binary (.glb) generator for Starfall Command
 * Aurelian Concord support & tech structures:
 *   1. aegis_capacitor.glb — Shield Battery analogue (~5.0w x 2.48h x 5.0d, 5x5 footprint),
 *                            low gold and ivory pedestal, unmistakable raised faceted
 *                            cyan-azure energy reservoir, and 4 curved white protective vanes.
 *   2. twilight_array.glb  — Twilight Council analogue (~7.0w x 4.65h x 7.0d, 7x7 footprint),
 *                            broad low dark-slate/ivory sanctuary floor with illuminated
 *                            concentric violet arcs and 3 gently swept gold/ivory pylons
 *                            enclosing a hovering faceted violet crystal.
 *
 * Conventions:
 *   - Ground contact at Y = 0.0000
 *   - Forward axis +X, Up +Y, Right +Z
 *   - Player color surfaces & mesh nodes prefixed Surf_TEAM_*
 *   - Player emissive surfaces & mesh nodes prefixed Surf_GLOW_*
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

function rotateVecByQuat(v, q) {
  const [qx, qy, qz, qw] = q;
  const uv = vCross([qx, qy, qz], v);
  const uuv = vCross([qx, qy, qz], uv);
  return vAdd(v, vAdd(vScale(uv, 2 * qw), vScale(uuv, 2)));
}

function rotateVecByEulerXYZ(v, rxDeg, ryDeg, rzDeg) {
  return rotateVecByQuat(v, quatFromEulerXYZ(rxDeg, ryDeg, rzDeg));
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

  /**
   * Extrudes an open curved arc segment (e.g. concentric floor rune arc) between angle th0 and th1.
   */
  addConcentricArcStrip({
    rInner,
    rOuter,
    yBot,
    yTop,
    thStart,
    thEnd,
    steps = 8,
    bevelIn = 0.02,
    offsetX = 0,
    offsetZ = 0,
  }) {
    const rings = [];
    const centers = [];
    for (let s = 0; s <= steps; s++) {
      const th = thStart + ((thEnd - thStart) * s) / steps;
      const ca = Math.cos(th);
      const sa = Math.sin(th);
      const rMid = (rInner + rOuter) * 0.5;
      rings.push([
        [ca * rOuter + offsetX, yBot, sa * rOuter + offsetZ],
        [ca * (rOuter - bevelIn) + offsetX, yTop, sa * (rOuter - bevelIn) + offsetZ],
        [ca * (rInner + bevelIn) + offsetX, yTop, sa * (rInner + bevelIn) + offsetZ],
        [ca * rInner + offsetX, yBot, sa * rInner + offsetZ],
      ]);
      centers.push([ca * rMid + offsetX, (yBot + yTop) * 0.5, sa * rMid + offsetZ]);
    }
    this.addLoft(rings, centers, true, true);
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
    phaseRad = 0,
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
        const th = (2 * Math.PI * s) / sectors + phaseRad;
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
  constructor(generatorName = 'Starfall Aurelian Concord Support GLB Generator') {
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
// Shared Aurelian Concord Support Palette (Aligned with generate_concord_tech.cjs)
// ---------------------------------------------------------------------------

function createConcordSupportMaterials(scene) {
  // Both material names AND mesh/node names carry Surf_TEAM_ / Surf_GLOW_ prefixes
  // so Godot 4.3 surface_get_name(), material.resource_name, and node names all match!
  const Surf_TEAM = scene.addMaterial({
    name: 'Surf_TEAM_Panel',
    baseColorHex: '#3c7ef0',
    metallic: 0.22,
    roughness: 0.36,
    emissiveHex: '#2b6de8',
    emissiveBoost: 0.42,
  });

  const Surf_GLOW = scene.addMaterial({
    name: 'Surf_GLOW_Accent',
    baseColorHex: '#7eb2ff',
    metallic: 0.0,
    roughness: 0.20,
    emissiveHex: '#4a88f5',
    emissiveBoost: 1.08,
  });

  // Warm sculpted Aurelian Ivory alloy (matches generate_concord_tech.cjs)
  const Mat_Ivory = scene.addMaterial({
    name: 'Mat_Ivory',
    baseColorHex: '#c9bfa4',
    metallic: 0.18,
    roughness: 0.38,
  });

  // Lighter polished ivory bevel highlight
  const Mat_IvoryLight = scene.addMaterial({
    name: 'Mat_IvoryLight',
    baseColorHex: '#dfd7c0',
    metallic: 0.16,
    roughness: 0.32,
  });

  // Crisp alabaster-porcelain white specifically for Aegis Capacitor's curved white protective vanes!
  const Mat_VaneWhite = scene.addMaterial({
    name: 'Mat_VaneWhite',
    baseColorHex: '#f1ede4',
    metallic: 0.12,
    roughness: 0.28,
  });

  // Burnished Aurelian Gold structural ribs & collars
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

  // Dark slate-indigo stone plinth & sanctuary court floor (high contrast for illuminated arcs)
  const Mat_StoneDark = scene.addMaterial({
    name: 'Mat_StoneDark',
    baseColorHex: '#2d3544',
    metallic: 0.28,
    roughness: 0.58,
  });

  // Aegis Capacitor: Brilliant shield-cyan inner energy charge cell
  const Mat_AegisCore = scene.addMaterial({
    name: 'Mat_AegisCore',
    baseColorHex: '#9cf6ff',
    metallic: 0.0,
    roughness: 0.12,
    emissiveHex: '#4be8ff',
    emissiveBoost: 1.16,
  });

  // Aegis Capacitor: Faceted translucent cyan-azure energy reservoir shell (alpha BLEND)
  const Mat_AegisReservoir = scene.addMaterial({
    name: 'Mat_AegisReservoir',
    baseColorHex: '#20c4ff',
    alpha: 0.58,
    metallic: 0.06,
    roughness: 0.14,
    emissiveHex: '#109eff',
    emissiveBoost: 0.88,
    doubleSided: true,
  });

  // Twilight Array: Deep royal-amethyst faceted crystal body (strong directional facet contrast!)
  const Mat_VioletCrystal = scene.addMaterial({
    name: 'Mat_VioletCrystal',
    baseColorHex: '#7c2ae8',
    metallic: 0.10,
    roughness: 0.20,
    emissiveHex: '#5b18b8',
    emissiveBoost: 0.54,
  });

  // Twilight Array: Vivid twilight-violet illuminated concentric floor arcs & crystal highlights
  const Mat_VioletBright = scene.addMaterial({
    name: 'Mat_VioletBright',
    baseColorHex: '#b975ff',
    metallic: 0.0,
    roughness: 0.16,
    emissiveHex: '#8b35f2',
    emissiveBoost: 0.96,
  });

  // Twilight Array: Translucent twilight-violet harmonic field ring (alpha BLEND)
  const Mat_VioletField = scene.addMaterial({
    name: 'Mat_VioletField',
    baseColorHex: '#9d4edd',
    alpha: 0.44,
    metallic: 0.0,
    roughness: 0.18,
    emissiveHex: '#7b2cbf',
    emissiveBoost: 0.72,
    doubleSided: true,
  });

  return {
    Surf_TEAM,
    Surf_GLOW,
    Mat_Ivory,
    Mat_IvoryLight,
    Mat_VaneWhite,
    Mat_Gold,
    Mat_GoldBright,
    Mat_StoneDark,
    Mat_AegisCore,
    Mat_AegisReservoir,
    Mat_VioletCrystal,
    Mat_VioletBright,
    Mat_VioletField,
  };
}

/**
 * Generates an N-sided regular polygon ring whose flat cardinal edges sit at exact ±halfWidth
 * (works for N = 8 octagon and N = 12 dodecagon, since both are multiples of 4!).
 */
function makeCardinalAlignedRing(sides, halfWidth, y, offsetX = 0, offsetZ = 0) {
  const halfStep = Math.PI / sides;
  const R = halfWidth / Math.cos(halfStep);
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides + halfStep;
    pts.push([Math.cos(a) * R + offsetX, y, Math.sin(a) * R + offsetZ]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Asset 1: aegis_capacitor.glb
// Shield Battery analogue — compact 5.0 x 5.0 world footprint ([-2.5, +2.5], Y=0, +X forward),
// low gold & ivory pedestal, unmistakable raised faceted energy reservoir, and
// 4 curved white protective vanes. Distinct from tall Resonator & weapon-bearing Aegis Relay.
// ---------------------------------------------------------------------------

function buildAegisCapacitorGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createConcordSupportMaterials(scene);

  const rootIdx = scene.addNode({ name: 'AegisCapacitor', translation: [0, 0, 0] });

  const gIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gIvoryLight = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gGold = new PrimitiveGeom(mats.Mat_Gold);
  const gGoldBright = new PrimitiveGeom(mats.Mat_GoldBright);
  const gStone = new PrimitiveGeom(mats.Mat_StoneDark);
  const gCyan = new PrimitiveGeom(mats.Mat_AegisCore);

  // -------------------------------------------------------------------------
  // 1. Low Gold & Ivory 5.0 x 5.0 Pedestal (Y = 0.0000 .. 0.7200, exact [-2.50, +2.50])
  // -------------------------------------------------------------------------
  gStone.addLoft(
    [
      makeCardinalAlignedRing(8, 2.500, 0.000),
      makeCardinalAlignedRing(8, 2.420, 0.220),
      makeCardinalAlignedRing(8, 2.240, 0.240),
    ],
    [[0, 0.001, 0], [0, 0.220, 0], [0, 0.240, 0]],
    true,
    true
  );

  // Recessed glowing shield-cyan power channel around the pedestal perimeter
  gCyan.addLoft(
    [
      makeCardinalAlignedRing(8, 2.310, 0.220),
      makeCardinalAlignedRing(8, 2.310, 0.315),
    ],
    [[0, 0.221, 0], [0, 0.314, 0]],
    false,
    true
  );

  // Burnished Gold pedestal collar & low sculpted Ivory platform deck
  gGold.addLoft(
    [
      makeCardinalAlignedRing(8, 2.380, 0.310),
      makeCardinalAlignedRing(8, 2.320, 0.400),
    ],
    [[0, 0.311, 0], [0, 0.399, 0]],
    true,
    true
  );

  gIvory.addLoft(
    [
      makeCardinalAlignedRing(8, 2.260, 0.400),
      makeCardinalAlignedRing(8, 2.100, 0.540),
    ],
    [[0, 0.401, 0], [0, 0.539, 0]],
    false,
    true
  );

  // Raised 10-sided Burnished Gold Reservoir Containment Rim in center of pedestal (Y = 0.52 .. 0.88)
  const rimSectors = 10;
  const rimOuterBot = [];
  const rimOuterTop = [];
  const rimInnerTop = [];
  const rimWellBot = [];
  for (let s = 0; s < rimSectors; s++) {
    const th = (2 * Math.PI * s) / rimSectors;
    const ca = Math.cos(th), sa = Math.sin(th);
    rimOuterBot.push([ca * 1.66, 0.52, sa * 1.66]);
    rimOuterTop.push([ca * 1.54, 0.86, sa * 1.54]);
    rimInnerTop.push([ca * 1.34, 0.88, sa * 1.34]);
    rimWellBot.push([ca * 1.26, 0.62, sa * 1.26]);
  }
  gGold.addLoft(
    [rimOuterBot, rimOuterTop, rimInnerTop, rimWellBot],
    [[0, 0.52, 0], [0, 0.86, 0], [0, 0.87, 0], [0, 0.62, 0]],
    false,
    true
  );

  // 10 Golden Radial Bus Ribs radiating across the low ivory pedestal
  for (let s = 0; s < rimSectors; s++) {
    const th = (2 * Math.PI * s) / rimSectors + Math.PI / rimSectors;
    const ca = Math.cos(th), sa = Math.sin(th);
    gGoldBright.addTubeAlongSpine(
      [
        { pos: [ca * 1.50, 0.72, sa * 1.50], rx: 0.08, ry: 0.07 },
        { pos: [ca * 2.16, 0.50, sa * 2.16], rx: 0.07, ry: 0.06 },
      ],
      4,
      true,
      true
    );
  }

  // +X Forward Shield-Transfer Threshold Apron (marks +X forward cleanly without any gun/turret!)
  gIvoryLight.addChamferBox({
    center: [2.04, 0.34, 0],
    size: [0.84, 0.42, 1.38],
    topScale: [0.86, 0.88],
    minYClamp: 0.0,
  });
  gGoldBright.addChamferBox({
    center: [2.22, 0.57, 0],
    size: [0.46, 0.10, 1.12],
    topScale: [0.90, 0.90],
  });
  gCyan.addChamferBox({
    center: [2.24, 0.63, 0],
    size: [0.30, 0.05, 0.84],
    topScale: [0.92, 0.92],
  });

  // -X Rear Grounding Shunt Block
  gStone.addChamferBox({
    center: [-2.06, 0.42, 0],
    size: [0.64, 0.48, 1.12],
    topScale: [0.84, 0.86],
    minYClamp: 0.0,
  });
  gGold.addChamferBox({
    center: [-2.06, 0.68, 0],
    size: [0.48, 0.10, 0.90],
    topScale: [0.90, 0.90],
  });

  // 3 Surf_GLOW_* player-emissive crystal nodes (+X threshold pair & -X rear shunt gem)
  const capGlowSpecs = [
    { name: 'Surf_GLOW_FrontR', pos: [2.14, 0.62, 0.82], r: [0.15, 0.20, 0.15] },
    { name: 'Surf_GLOW_FrontL', pos: [2.14, 0.62, -0.82], r: [0.15, 0.20, 0.15] },
    { name: 'Surf_GLOW_Rear', pos: [-2.06, 0.84, 0.00], r: [0.17, 0.22, 0.17] },
  ];
  for (const gs of capGlowSpecs) {
    gGold.addChamferBox({
      center: [gs.pos[0], gs.pos[1] - 0.11, gs.pos[2]],
      size: [0.34, 0.14, 0.34],
      topScale: [0.84, 0.84],
    });
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({ center: gs.pos, radii: gs.r, sectors: 6, stacks: 4 });
    const gMesh = scene.addMesh(gs.name, [gGlow]);
    scene.addNode({ name: gs.name, meshIndex: gMesh, parentIndex: rootIdx });
  }

  const pedestalMesh = scene.addMesh('CapacitorPedestal_Mesh', [
    gIvory,
    gIvoryLight,
    gGold,
    gGoldBright,
    gStone,
    gCyan,
  ]);
  scene.addNode({ name: 'CapacitorPedestal', meshIndex: pedestalMesh, parentIndex: rootIdx });

  // -------------------------------------------------------------------------
  // 2. Unmistakable Raised Faceted Energy Reservoir (Y = 0.72 .. 2.12)
  //    Broad 10-faceted table-cut aquamarine/cyan battery cell + inner charge core!
  // -------------------------------------------------------------------------
  const resPivotY = 1.38;

  // Inner Pulsing Bright Charge Core (separate animated node so charge visibly breathes!)
  const gCoreCell = new PrimitiveGeom(mats.Mat_AegisCore);
  const coreSectors = 10;
  const makeCellRing = (r, y) => {
    const pts = [];
    for (let s = 0; s < coreSectors; s++) {
      const th = (2 * Math.PI * s) / coreSectors;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    return pts;
  };
  gCoreCell.addLoft(
    [
      makeCellRing(0.76, -0.52),
      makeCellRing(1.04, -0.18),
      makeCellRing(1.06, 0.20),
      makeCellRing(0.74, 0.50),
    ],
    [[0, -0.52, 0], [0, -0.18, 0], [0, 0.20, 0], [0, 0.50, 0]],
    true,
    true
  );
  const coreCellMesh = scene.addMesh('ReservoirCore_Mesh', [gCoreCell]);
  const coreCellNodeIdx = scene.addNode({
    name: 'ReservoirCore',
    meshIndex: coreCellMesh,
    translation: [0, resPivotY, 0],
    parentIndex: rootIdx,
  });

  // Outer Faceted Translucent Cyan-Blue Energy Reservoir + Golden Bezel Straps
  const gResGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gResShell = new PrimitiveGeom(mats.Mat_AegisReservoir);

  // Golden upper table-cut crown bezel ring (leaves broad glowing flat top facet open!)
  const topCrownRings = [];
  const topCrownCenters = [];
  for (let s = 0; s < coreSectors; s++) {
    const th = (2 * Math.PI * s) / coreSectors;
    const ca = Math.cos(th), sa = Math.sin(th);
    topCrownRings.push([
      [ca * 0.96, 2.00, sa * 0.96],
      [ca * 0.94, 2.07, sa * 0.94],
      [ca * 0.76, 2.09, sa * 0.76],
      [ca * 0.78, 2.01, sa * 0.78],
    ]);
    topCrownCenters.push([ca * 0.86, 2.04, sa * 0.86]);
  }
  gResGold.addCyclicRingLoft(topCrownRings, topCrownCenters);

  // 5 Slim Golden Meridian Clamps hugging the outer faceted reservoir flanks cleanly
  for (let i = 0; i < 5; i++) {
    const th = (2 * Math.PI * i) / 5 + Math.PI / 5;
    const ca = Math.cos(th), sa = Math.sin(th);
    gResGold.addTubeAlongSpine(
      [
        { pos: [ca * 1.24, 0.84, sa * 1.24], rx: 0.065, ry: 0.055 },
        { pos: [ca * 1.38, 1.25, sa * 1.38], rx: 0.065, ry: 0.055 },
        { pos: [ca * 1.32, 1.70, sa * 1.32], rx: 0.060, ry: 0.050 },
        { pos: [ca * 0.94, 2.04, sa * 0.94], rx: 0.052, ry: 0.044 },
      ],
      4,
      true,
      true
    );
  }

  // Broad 10-sided Table-Cut Faceted Reservoir Crystal Shell (r = 1.32, Y = 0.82 .. 2.05)
  gResShell.addLoft(
    [
      makeCellRing(1.16, 0.82),
      makeCellRing(1.34, 1.24),
      makeCellRing(1.28, 1.68),
      makeCellRing(0.86, 2.05),
    ],
    [[0, 0.82, 0], [0, 1.24, 0], [0, 1.68, 0], [0, 2.05, 0]],
    true,
    true
  );

  // Emit opaque gold trim FIRST, translucent reservoir shell SECOND!
  const reservoirMesh = scene.addMesh('EnergyReservoir_Mesh', [gResGold, gResShell]);
  scene.addNode({ name: 'EnergyReservoir', meshIndex: reservoirMesh, parentIndex: rootIdx });

  // Floating Hexagonal Harmonic Regulator Ring hovering just above the cut-crystal table (Y = 2.22)
  const haloPivotY = 2.22;
  const gHaloGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gHaloCyan = new PrimitiveGeom(mats.Mat_AegisCore);
  const hSectors = 6;
  const hRings = [];
  const hCenters = [];
  for (let s = 0; s < hSectors; s++) {
    const th = (2 * Math.PI * s) / hSectors;
    const ca = Math.cos(th), sa = Math.sin(th);
    hRings.push([
      [ca * 0.68, -0.04, sa * 0.68],
      [ca * 0.68, 0.04, sa * 0.68],
      [ca * 0.54, 0.05, sa * 0.54],
      [ca * 0.54, -0.05, sa * 0.54],
    ]);
    hCenters.push([ca * 0.61, 0, sa * 0.61]);
  }
  gHaloGold.addCyclicRingLoft(hRings, hCenters);
  for (let s = 0; s < 3; s++) {
    const th = (2 * Math.PI * s) / 3;
    gHaloCyan.addFacetedCrystal({
      center: [Math.cos(th) * 0.61, 0.02, Math.sin(th) * 0.61],
      radii: [0.08, 0.11, 0.08],
      sectors: 5,
      stacks: 4,
    });
  }
  const haloMesh = scene.addMesh('RegulatorHalo_Mesh', [gHaloGold, gHaloCyan]);
  const haloNodeIdx = scene.addNode({
    name: 'RegulatorHalo',
    meshIndex: haloMesh,
    translation: [0, haloPivotY, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 3. 4 Curved White Protective Vanes + Flush Surf_TEAM_* Shields (Y = 0.48 .. 2.48)
  //    Cupped alabaster-white petals curving up & inward around the energy reservoir!
  // -------------------------------------------------------------------------
  const vaneSpecs = [
    { name: 'ProtectiveVane_FrontR', teamName: 'Surf_TEAM_VaneFrontR', thDeg: 50 },
    { name: 'ProtectiveVane_FrontL', teamName: 'Surf_TEAM_VaneFrontL', thDeg: -50 },
    { name: 'ProtectiveVane_RearR', teamName: 'Surf_TEAM_VaneRearR', thDeg: 132 },
    { name: 'ProtectiveVane_RearL', teamName: 'Surf_TEAM_VaneRearL', thDeg: -132 },
  ];

  const vaneNodeInfo = [];
  const vaneTeamPoly = [
    [-0.42, -0.34],
    [0.42, -0.34],
    [0.34, 0.34],
    [0.00, 0.44],
    [-0.34, 0.34],
  ];

  for (const vs of vaneSpecs) {
    const th = (vs.thDeg * Math.PI) / 180;
    const ca = Math.cos(th), sa = Math.sin(th);
    const pivotPos = [ca * 1.98, 0.52, sa * 1.98];

    const gVaneWhite = new PrimitiveGeom(mats.Mat_VaneWhite);
    const gVaneGold = new PrimitiveGeom(mats.Mat_Gold);
    const gVaneGoldHi = new PrimitiveGeom(mats.Mat_GoldBright);

    // Build vane in local coordinates relative to pivotPos, then rotate around Y by -thDeg?
    // Even cleaner: compute world coords directly and subtract pivotPos so rest rotation = identity!
    const toLocal = (r, y, dTheta) => {
      const a = th + dTheta;
      return [Math.cos(a) * r - pivotPos[0], y - pivotPos[1], Math.sin(a) * r - pivotPos[2]];
    };

    // 5 curved stations sweeping from base (r=2.04, y=0.48) outward to (r=2.24, y=1.18),
    // then curving gracefully inward & upward to cup the reservoir at (r=1.34, y=2.48)!
    const stations = [
      { rOut: 2.12, rIn: 1.88, y: 0.46, halfAng: 0.30, crown: 0.05 },
      { rOut: 2.28, rIn: 2.02, y: 1.06, halfAng: 0.35, crown: 0.08 },
      { rOut: 2.16, rIn: 1.90, y: 1.68, halfAng: 0.33, crown: 0.08 },
      { rOut: 1.82, rIn: 1.58, y: 2.18, halfAng: 0.26, crown: 0.06 },
      { rOut: 1.44, rIn: 1.28, y: 2.48, halfAng: 0.15, crown: 0.03 },
    ];

    const vaneRings = [];
    const vaneCenters = [];
    for (const st of stations) {
      const ha = st.halfAng;
      // 6-point cupped airfoil/petal cross-section
      vaneRings.push([
        toLocal(st.rOut - 0.04, st.y, -ha),
        toLocal(st.rOut + st.crown, st.y + 0.02, 0),
        toLocal(st.rOut - 0.04, st.y, ha),
        toLocal(st.rIn, st.y + 0.03, ha * 0.88),
        toLocal(st.rIn - 0.03, st.y + 0.04, 0),
        toLocal(st.rIn, st.y + 0.03, -ha * 0.88),
      ]);
      vaneCenters.push(toLocal((st.rOut + st.rIn) * 0.5, st.y + 0.02, 0));
    }
    gVaneWhite.addLoft(vaneRings, vaneCenters, true, true);

    // Burnished Gold Base Hinge Bracket anchoring the lower back of each curved white vane
    gVaneGold.addTubeAlongSpine(
      [
        { pos: toLocal(2.22, 0.50, 0), rx: 0.16, ry: 0.12 },
        { pos: toLocal(2.38, 1.06, 0), rx: 0.12, ry: 0.10 },
        { pos: toLocal(2.30, 1.46, 0), rx: 0.08, ry: 0.08 },
      ],
      4,
      true,
      true
    );

    // Flush Gold Bezel + Player Team Shield (Surf_TEAM_Vane*) on upper-outer face of white vane!
    const shieldPos = toLocal(2.12, 1.66, 0);
    const outDir = vNorm([ca * 0.76, 0.65, sa * 0.76]);
    const upInPlane = [-ca * 0.58, 0.80, -sa * 0.58];

    const bezelPoly = vaneTeamPoly.map(([x, y]) => [x * 1.15, y * 1.15]);
    gVaneGoldHi.addOrientedShield(shieldPos, outDir, upInPlane, bezelPoly, 0.055, 0.88, 0.01);

    const vaneMesh = scene.addMesh(`${vs.name}_Mesh`, [gVaneWhite, gVaneGold, gVaneGoldHi]);
    const vIdx = scene.addNode({
      name: vs.name,
      meshIndex: vaneMesh,
      translation: pivotPos,
      parentIndex: rootIdx,
    });

    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(
      vAdd(shieldPos, vScale(outDir, 0.036)),
      outDir,
      upInPlane,
      vaneTeamPoly,
      0.068,
      0.85,
      0.025
    );
    const tMesh = scene.addMesh(vs.teamName, [gTeam]);
    scene.addNode({
      name: vs.teamName,
      meshIndex: tMesh,
      parentIndex: vIdx,
    });

    // Tangential rotation axis (-sin(th), 0, cos(th)) so vane breathes radially inward/outward!
    vaneNodeInfo.push({ nodeIndex: vIdx, ca, sa });
  }

  // -------------------------------------------------------------------------
  // 4. Seamless Looping 'idle' Animation (2.8s shield charge pulse & vane breath)
  // -------------------------------------------------------------------------
  const aTimes = [0.0, 0.7, 1.4, 2.1, 2.8];
  const aTracks = [
    {
      nodeIndex: coreCellNodeIdx,
      path: 'scale',
      times: aTimes,
      values: [
        [1.0, 1.0, 1.0],
        [1.06, 1.04, 1.06],
        [1.0, 1.0, 1.0],
        [0.95, 0.97, 0.95],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: haloNodeIdx,
      path: 'translation',
      times: aTimes,
      values: [
        [0, haloPivotY, 0],
        [0, haloPivotY + 0.065, 0],
        [0, haloPivotY, 0],
        [0, haloPivotY - 0.045, 0],
        [0, haloPivotY, 0],
      ],
    },
    {
      nodeIndex: haloNodeIdx,
      path: 'rotation',
      times: aTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 18, 0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -18, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
  ];

  // Subtle synchronized radial breathing on all 4 curved white protective vanes (±2.2 deg)
  for (const vi of vaneNodeInfo) {
    const tiltQuat = (deg) => {
      const half = (deg * Math.PI) / 360;
      const ax = -vi.sa;
      const az = vi.ca;
      const s = Math.sin(half);
      return [
        Number((ax * s).toFixed(6)),
        0,
        Number((az * s).toFixed(6)),
        Number(Math.cos(half).toFixed(6)),
      ];
    };
    aTracks.push({
      nodeIndex: vi.nodeIndex,
      path: 'rotation',
      times: aTimes,
      values: [
        [0, 0, 0, 1],
        tiltQuat(-2.2),
        [0, 0, 0, 1],
        tiltQuat(1.6),
        [0, 0, 0, 1],
      ],
    });
  }

  scene.addAnimation('idle', aTracks);

  return scene.buildGLB('AegisCapacitorScene');
}

// ---------------------------------------------------------------------------
// Asset 2: twilight_array.glb
// Twilight Council analogue — broad 7.0 x 7.0 world footprint ([-3.5, +3.5], Y=0, +X forward),
// low dark-slate/ivory sanctuary floor with illuminated concentric violet arcs, and
// 3 gently swept gold & ivory pylons (+60°, -60°, 180°) enclosing a hovering violet crystal.
// ---------------------------------------------------------------------------

function buildTwilightArrayGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createConcordSupportMaterials(scene);

  const rootIdx = scene.addNode({ name: 'TwilightArray', translation: [0, 0, 0] });

  const gIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gIvoryLight = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gGold = new PrimitiveGeom(mats.Mat_Gold);
  const gGoldBright = new PrimitiveGeom(mats.Mat_GoldBright);
  const gStone = new PrimitiveGeom(mats.Mat_StoneDark);
  const gViolet = new PrimitiveGeom(mats.Mat_VioletCrystal);
  const gVioletBright = new PrimitiveGeom(mats.Mat_VioletBright);

  // -------------------------------------------------------------------------
  // 1. Broad Low 7.0 x 7.0 Sanctuary Floor with Illuminated Concentric Arcs!
  //    12-sided dodecagon aligns with BOTH exact [-3.50, +3.50] AABB AND 3-fold pylons!
  // -------------------------------------------------------------------------
  gStone.addLoft(
    [
      makeCardinalAlignedRing(12, 3.500, 0.000),
      makeCardinalAlignedRing(12, 3.430, 0.240),
      makeCardinalAlignedRing(12, 2.960, 0.260),
    ],
    [[0, 0.001, 0], [0, 0.240, 0], [0, 0.260, 0]],
    true,
    true
  );

  // Raised Outer Ivory & Gold Sanctuary Curb Rim (Y = 0.24 .. 0.42) framing a LOW central dark court!
  const rim12OutBot = makeCardinalAlignedRing(12, 3.380, 0.240);
  const rim12OutTop = makeCardinalAlignedRing(12, 3.260, 0.410);
  const rim12InTop = makeCardinalAlignedRing(12, 2.820, 0.410);
  const rim12InBot = makeCardinalAlignedRing(12, 2.740, 0.280);
  const curbRings = [];
  const curbCenters = [];
  for (let i = 0; i < 12; i++) {
    // Lower the curb at +X (indices 11 and 0 flank 0 deg!) for the open +X sanctuary entrance!
    const isEntrance = i === 0 || i === 11;
    const hTop = isEntrance ? 0.315 : 0.410;
    curbRings.push([
      rim12OutBot[i],
      [rim12OutTop[i][0], hTop, rim12OutTop[i][2]],
      [rim12InTop[i][0], hTop, rim12InTop[i][2]],
      rim12InBot[i],
    ]);
    curbCenters.push([
      (rim12OutTop[i][0] + rim12InTop[i][0]) * 0.5,
      0.32,
      (rim12OutTop[i][2] + rim12InTop[i][2]) * 0.5,
    ]);
  }
  gIvory.addCyclicRingLoft(curbRings, curbCenters);

  // Golden outer perimeter trim band around the 12-sided sanctuary court
  const goldTrimRings = [];
  const goldTrimCenters = [];
  for (let i = 0; i < 12; i++) {
    goldTrimRings.push([
      [rim12OutBot[i][0] * 1.01, 0.22, rim12OutBot[i][2] * 1.01],
      [rim12OutBot[i][0] * 1.00, 0.30, rim12OutBot[i][2] * 1.00],
      [rim12OutBot[i][0] * 0.96, 0.31, rim12OutBot[i][2] * 0.96],
      [rim12OutBot[i][0] * 0.97, 0.22, rim12OutBot[i][2] * 0.97],
    ]);
    goldTrimCenters.push([rim12OutBot[i][0] * 0.985, 0.26, rim12OutBot[i][2] * 0.985]);
  }
  gGold.addCyclicRingLoft(goldTrimRings, goldTrimCenters);

  // Flat Dark-Slate Central Astrolabe Court Floor at Y = 0.280 (maximizes contrast for luminous arcs!)
  const courtFloorRing = makeCardinalAlignedRing(12, 2.780, 0.280);
  for (let i = 0; i < 12; i++) {
    const inext = (i + 1) % 12;
    gStone.addTri([0, 0.280, 0], courtFloorRing[inext], courtFloorRing[i], [0, 1, 0]);
  }

  // +X Forward Ceremonial Sanctuary Threshold Apron (fits cleanly inside dodecagon cardinal edge |z| <= 0.937)
  gIvoryLight.addLoft(
    [
      [
        [3.48, 0.02, 0.86],
        [3.48, 0.02, -0.86],
        [2.68, 0.02, -1.04],
        [2.68, 0.02, 1.04],
      ],
      [
        [3.36, 0.22, 0.78],
        [3.36, 0.22, -0.78],
        [2.62, 0.32, -0.96],
        [2.62, 0.32, 0.96],
      ],
    ],
    [[3.08, 0.025, 0], [2.98, 0.27, 0]],
    true,
    true
  );
  // Twin gold threshold rails & glowing violet entrance chevron pointing +X
  for (const side of [-1, 1]) {
    gGoldBright.addTubeAlongSpine(
      [
        { pos: [2.62, 0.36, side * 0.96], rx: 0.11, ry: 0.08 },
        { pos: [3.36, 0.25, side * 0.80], rx: 0.09, ry: 0.07 },
      ],
      4,
      true,
      true
    );
  }
  gVioletBright.addTubeAlongSpine(
    [
      { pos: [2.88, 0.33, -0.58], rx: 0.06, ry: 0.035 },
      { pos: [3.14, 0.29, 0.00], rx: 0.07, ry: 0.040 },
      { pos: [2.88, 0.33, 0.58], rx: 0.06, ry: 0.035 },
    ],
    4,
    true,
    true
  );

  // -------------------------------------------------------------------------
  // 2. Illuminated Concentric Arcs on the Low Floor (3 Concentric Arc Tiers!)
  // -------------------------------------------------------------------------
  // Central Golden Focal Medallion & Glowing Violet Core Pad directly beneath Hovering Crystal
  const focalRing = makeCardinalAlignedRing(12, 0.62, 0.315);
  for (let i = 0; i < 12; i++) {
    const inext = (i + 1) % 12;
    gVioletBright.addTri([0, 0.335, 0], focalRing[inext], focalRing[i], [0, 1, 0]);
  }
  gGoldBright.addConcentricArcStrip({
    rInner: 0.60,
    rOuter: 0.74,
    yBot: 0.28,
    yTop: 0.335,
    thStart: 0,
    thEnd: Math.PI * 2,
    steps: 12,
    bevelIn: 0.015,
  });

  // 3 Radial Golden Ley-Line Channels leading from center out to the 3 Pylon Bases (+60°, -60°, 180°)
  const pylonAnglesDeg = [60, -60, 180];
  for (const deg of pylonAnglesDeg) {
    const th = (deg * Math.PI) / 180;
    const ca = Math.cos(th), sa = Math.sin(th);
    gGold.addTubeAlongSpine(
      [
        { pos: [ca * 0.72, 0.31, sa * 0.72], rx: 0.09, ry: 0.04 },
        { pos: [ca * 2.68, 0.31, sa * 2.68], rx: 0.11, ry: 0.045 },
      ],
      4,
      true,
      true
    );
  }

  // Tier 1 (Inner Static Illuminated Concentric Arcs, r = 0.96 .. 1.18): 3 bright violet arcs between ley-lines
  for (const baseDeg of [0, 120, 240]) {
    const th0 = ((baseDeg - 42) * Math.PI) / 180;
    const th1 = ((baseDeg + 42) * Math.PI) / 180;
    gGold.addConcentricArcStrip({
      rInner: 0.92,
      rOuter: 1.22,
      yBot: 0.28,
      yTop: 0.315,
      thStart: th0 - 0.03,
      thEnd: th1 + 0.03,
      steps: 6,
      bevelIn: 0.01,
    });
    gVioletBright.addConcentricArcStrip({
      rInner: 0.96,
      rOuter: 1.18,
      yBot: 0.31,
      yTop: 0.355,
      thStart: th0,
      thEnd: th1,
      steps: 6,
      bevelIn: 0.015,
    });
  }

  // Tier 3 (Outer Illuminated Concentric Arcs, r = 2.22 .. 2.48): 3 broad sweeping twilight arcs spanning pylon bays!
  for (const baseDeg of [0, 120, 240]) {
    const spanDeg = baseDeg === 0 ? 38 : 44;
    const th0 = ((baseDeg - spanDeg) * Math.PI) / 180;
    const th1 = ((baseDeg + spanDeg) * Math.PI) / 180;
    gGold.addConcentricArcStrip({
      rInner: 2.18,
      rOuter: 2.52,
      yBot: 0.28,
      yTop: 0.320,
      thStart: th0 - 0.02,
      thEnd: th1 + 0.02,
      steps: 8,
      bevelIn: 0.01,
    });
    gVioletBright.addConcentricArcStrip({
      rInner: 2.23,
      rOuter: 2.47,
      yBot: 0.315,
      yTop: 0.365,
      thStart: th0,
      thEnd: th1,
      steps: 8,
      bevelIn: 0.015,
    });
  }

  // Tier 2 (Middle Concentric Arc Ring, r = 1.56 .. 1.82): Separate animated node so middle arcs shimmer/rotate subtly!
  const gMidArcGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gMidArcViolet = new PrimitiveGeom(mats.Mat_VioletBright);
  const gMidArcDeep = new PrimitiveGeom(mats.Mat_VioletCrystal);
  for (let i = 0; i < 6; i++) {
    const centerDeg = i * 60 + 30;
    const th0 = ((centerDeg - 20) * Math.PI) / 180;
    const th1 = ((centerDeg + 20) * Math.PI) / 180;
    gMidArcGold.addConcentricArcStrip({
      rInner: 1.53,
      rOuter: 1.85,
      yBot: 0.00,
      yTop: 0.035,
      thStart: th0 - 0.02,
      thEnd: th1 + 0.02,
      steps: 5,
      bevelIn: 0.01,
    });
    (i % 2 === 0 ? gMidArcViolet : gMidArcDeep).addConcentricArcStrip({
      rInner: 1.57,
      rOuter: 1.81,
      yBot: 0.030,
      yTop: 0.080,
      thStart: th0,
      thEnd: th1,
      steps: 5,
      bevelIn: 0.015,
    });
  }
  const midArcsMesh = scene.addMesh('ConcentricArcsMid_Mesh', [
    gMidArcGold,
    gMidArcViolet,
    gMidArcDeep,
  ]);
  const midArcsNodeIdx = scene.addNode({
    name: 'ConcentricArcsMid',
    meshIndex: midArcsMesh,
    translation: [0, 0.285, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 3. Three Gently Swept Gold & Ivory Pylons (+60°, -60°, 180°, Y = 0.32 .. 4.66)
  //    Enclosing the hovering violet crystal while keeping +X & RTS view open!
  // -------------------------------------------------------------------------
  const pylonSpecs = [
    { name: 'Pylon_FrontR', teamName: 'Surf_TEAM_PylonFrontR', glowName: 'Surf_GLOW_PylonR', deg: 60 },
    { name: 'Pylon_FrontL', teamName: 'Surf_TEAM_PylonFrontL', glowName: 'Surf_GLOW_PylonL', deg: -60 },
    { name: 'Pylon_Rear', teamName: 'Surf_TEAM_PylonRear', glowName: 'Surf_GLOW_PylonRear', deg: 180 },
  ];

  const pylonTeamPoly = [
    [-0.36, -0.52],
    [0.36, -0.52],
    [0.44, 0.20],
    [0.00, 0.56],
    [-0.44, 0.20],
  ];

  for (const ps of pylonSpecs) {
    const th = (ps.deg * Math.PI) / 180;
    const ca = Math.cos(th), sa = Math.sin(th);

    // Stepped Burnished Gold Pylon Pedestal Foot (anchored inside 7x7 footprint at r = 2.74)
    gGold.addChamferBox({
      center: [ca * 2.72, 0.52, sa * 2.72],
      size: [1.14, 0.36, 1.24],
      rotDeg: [0, -ps.deg, 0],
      topScale: [0.88, 0.88],
    });

    // Gently Swept Ivory Monolith Pylon: rises from (r=2.74, y=0.68), swells slightly to (r=2.88, y=1.68),
    // then sweeps gracefully inward & upward to (r=1.34, y=4.62) enclosing the central crystal!
    const rPts = [
      { rOut: 2.98, rIn: 2.36, y: 0.66, w: 0.68 },
      { rOut: 3.08, rIn: 2.46, y: 1.65, w: 0.60 },
      { rOut: 2.74, rIn: 2.16, y: 2.78, w: 0.48 },
      { rOut: 2.14, rIn: 1.66, y: 3.82, w: 0.34 },
      { rOut: 1.48, rIn: 1.22, y: 4.58, w: 0.16 },
    ];
    const pRings = [];
    const pCenters = [];
    const tangX = -sa, tangZ = ca;
    for (const st of rPts) {
      const rMid = (st.rOut + st.rIn) * 0.5;
      // 6-point sleek hexagonal blade cross-section
      pRings.push([
        [ca * st.rOut + tangX * (st.w * 0.55), st.y, sa * st.rOut + tangZ * (st.w * 0.55)],
        [ca * (st.rOut + 0.09), st.y + 0.02, sa * (st.rOut + 0.09)],
        [ca * st.rOut - tangX * (st.w * 0.55), st.y, sa * st.rOut - tangZ * (st.w * 0.55)],
        [ca * st.rIn - tangX * (st.w * 0.42), st.y + 0.05, sa * st.rIn - tangZ * (st.w * 0.42)],
        [ca * (st.rIn - 0.06), st.y + 0.06, sa * (st.rIn - 0.06)],
        [ca * st.rIn + tangX * (st.w * 0.42), st.y + 0.05, sa * st.rIn + tangZ * (st.w * 0.42)],
      ]);
      pCenters.push([ca * rMid, st.y + 0.03, sa * rMid]);
    }
    gIvory.addLoft(pRings, pCenters, true, true);

    // Lighter polished-ivory sidecheek fins nested flush into lower flanks of pylon
    for (const sgn of [-1, 1]) {
      gIvoryLight.addTubeAlongSpine(
        [
          { pos: [ca * 2.76 + tangX * sgn * 0.36, 0.76, sa * 2.76 + tangZ * sgn * 0.36], rx: 0.12, ry: 0.16 },
          { pos: [ca * 2.84 + tangX * sgn * 0.32, 1.80, sa * 2.84 + tangZ * sgn * 0.32], rx: 0.10, ry: 0.14 },
          { pos: [ca * 2.48 + tangX * sgn * 0.24, 2.84, sa * 2.48 + tangZ * sgn * 0.24], rx: 0.06, ry: 0.08 },
        ],
        4,
        true,
        true
      );
    }

    // Continuous Burnished Gold Outer Dorsal Spine sweeping cleanly along the pylon crest!
    gGold.addTubeAlongSpine(
      [
        { pos: [ca * 3.04, 0.68, sa * 3.04], rx: 0.15, ry: 0.13 },
        { pos: [ca * 3.14, 1.68, sa * 3.14], rx: 0.14, ry: 0.12 },
        { pos: [ca * 2.78, 2.80, sa * 2.78], rx: 0.12, ry: 0.11 },
        { pos: [ca * 2.16, 3.84, sa * 2.16], rx: 0.10, ry: 0.09 },
        { pos: [ca * 1.44, 4.64, sa * 1.44], rx: 0.065, ry: 0.06 },
      ],
      5,
      true,
      true
    );

    // Inner Golden Arcane Focusing Rail + Glowing Violet Tip Nib aiming at the Hovering Crystal!
    gGoldBright.addTubeAlongSpine(
      [
        { pos: [ca * 2.34, 1.25, sa * 2.34], rx: 0.09, ry: 0.08 },
        { pos: [ca * 2.12, 2.78, sa * 2.12], rx: 0.085, ry: 0.08 },
        { pos: [ca * 1.62, 3.86, sa * 1.62], rx: 0.08, ry: 0.075 },
        { pos: [ca * 1.18, 4.54, sa * 1.18], rx: 0.05, ry: 0.05 },
      ],
      4,
      true,
      true
    );
    gVioletBright.addFacetedCrystal({
      center: [ca * 1.12, 4.46, sa * 1.12],
      radii: [0.12, 0.18, 0.12],
      rotDeg: [sa * 28, 0, -ca * 28],
      sectors: 6,
      stacks: 4,
    });

    // Flush Gold Bezel + Player Team Shield (Surf_TEAM_Pylon*) on upper-outer face of each swept pylon
    const teamPos = [ca * 2.72, 2.82, sa * 2.72];
    const teamOut = vNorm([ca * 0.80, 0.60, sa * 0.80]);
    const teamUp = [-ca * 0.56, 0.82, -sa * 0.56];
    const bezelPoly = pylonTeamPoly.map(([x, y]) => [x * 1.15, y * 1.14]);
    gGoldBright.addOrientedShield(teamPos, teamOut, teamUp, bezelPoly, 0.065, 0.88, 0.01);

    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(
      vAdd(teamPos, vScale(teamOut, 0.042)),
      teamOut,
      teamUp,
      pylonTeamPoly,
      0.075,
      0.85,
      0.025
    );
    const tMesh = scene.addMesh(ps.teamName, [gTeam]);
    scene.addNode({ name: ps.teamName, meshIndex: tMesh, parentIndex: rootIdx });

    // Surf_GLOW_Pylon* gem nestled at the inner-front base collar of each pylon
    const glowPos = [ca * 2.28 + tangX * 0.48, 0.58, sa * 2.28 + tangZ * 0.48];
    gGold.addChamferBox({
      center: [glowPos[0], glowPos[1] - 0.12, glowPos[2]],
      size: [0.34, 0.16, 0.34],
      topScale: [0.84, 0.84],
    });
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({ center: glowPos, radii: [0.15, 0.20, 0.15], sectors: 6, stacks: 4 });
    const gMesh = scene.addMesh(ps.glowName, [gGlow]);
    scene.addNode({ name: ps.glowName, meshIndex: gMesh, parentIndex: rootIdx });
  }

  // 2 Additional Terrace Rim Team Shields (Surf_TEAM_CourtR / Surf_TEAM_CourtL) & +X Threshold Glow Gems
  // so player team color is also boldly visible on the broad 7x7 sanctuary rim!
  const courtShieldPoly = [
    [-0.54, -0.30],
    [0.54, -0.30],
    [0.44, 0.30],
    [0.00, 0.38],
    [-0.44, 0.30],
  ];
  for (const [tag, deg] of [
    ['Surf_TEAM_CourtR', 118],
    ['Surf_TEAM_CourtL', -118],
  ]) {
    const th = (deg * Math.PI) / 180;
    const ca = Math.cos(th), sa = Math.sin(th);
    const pos = [ca * 3.04, 0.43, sa * 3.04];
    const out = vNorm([ca * 0.28, 0.96, sa * 0.28]);
    const up = [-ca, 0.28, -sa];
    gGoldBright.addOrientedShield(
      pos,
      out,
      up,
      courtShieldPoly.map(([x, y]) => [x * 1.14, y * 1.14]),
      0.05,
      0.88,
      0.01
    );
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(vAdd(pos, vScale(out, 0.032)), out, up, courtShieldPoly, 0.06, 0.85, 0.02);
    const tMesh = scene.addMesh(tag, [gTeam]);
    scene.addNode({ name: tag, meshIndex: tMesh, parentIndex: rootIdx });
  }

  for (const [tag, side] of [
    ['Surf_GLOW_FrontR', 1],
    ['Surf_GLOW_FrontL', -1],
  ]) {
    const gPos = [3.08, 0.48, side * 0.90];
    gGold.addChamferBox({
      center: [gPos[0], gPos[1] - 0.12, gPos[2]],
      size: [0.36, 0.16, 0.36],
      topScale: [0.84, 0.84],
    });
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({ center: gPos, radii: [0.16, 0.22, 0.16], sectors: 6, stacks: 4 });
    const gMesh = scene.addMesh(tag, [gGlow]);
    scene.addNode({ name: tag, meshIndex: gMesh, parentIndex: rootIdx });
  }

  const arrayBaseMesh = scene.addMesh('TwilightSanctuary_Mesh', [
    gIvory,
    gIvoryLight,
    gGold,
    gGoldBright,
    gStone,
    gViolet,
    gVioletBright,
  ]);
  scene.addNode({ name: 'TwilightSanctuary', meshIndex: arrayBaseMesh, parentIndex: rootIdx });

  // -------------------------------------------------------------------------
  // 4. Enclosing Central Hovering Violet Crystal & Golden Orbiting Shards (Y = 1.56 .. 3.92)
  //    Sharp jewel-cut 6-faceted hexagonal double-terminated prism truly levitating in open air!
  // -------------------------------------------------------------------------
  const crystalPivotY = 2.74;
  const gCrysDeep = new PrimitiveGeom(mats.Mat_VioletCrystal);
  const gCrysBright = new PrimitiveGeom(mats.Mat_VioletBright);
  const gCrysGold = new PrimitiveGeom(mats.Mat_GoldBright);

  // Sharp Hexagonal Jewel-Cut Prism Loft (flat-shaded 6-sided waist + double pyramidal terminations!)
  const hexCrystalRing = (r, y) => {
    const pts = [];
    for (let s = 0; s < 6; s++) {
      const th = (Math.PI / 3) * s + Math.PI / 6;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    return pts;
  };
  gCrysDeep.addLoft(
    [
      hexCrystalRing(0.03, -1.18),
      hexCrystalRing(0.46, -0.58),
      hexCrystalRing(0.68, -0.16),
      hexCrystalRing(0.68, 0.24),
      hexCrystalRing(0.44, 0.68),
      hexCrystalRing(0.03, 1.18),
    ],
    [[0, -1.18, 0], [0, -0.58, 0], [0, -0.16, 0], [0, 0.24, 0], [0, 0.68, 0], [0, 1.18, 0]],
    true,
    true
  );

  // 6 Slim Luminous Violet Ridge Highlights along the upper crown & lower spire edges
  for (let s = 0; s < 6; s++) {
    const th = (Math.PI / 3) * s + Math.PI / 6;
    const ca = Math.cos(th), sa = Math.sin(th);
    gCrysBright.addTubeAlongSpine(
      [
        { pos: [ca * 0.69, 0.24, sa * 0.69], rx: 0.035, ry: 0.030 },
        { pos: [ca * 0.45, 0.68, sa * 0.45], rx: 0.032, ry: 0.028 },
        { pos: [ca * 0.04, 1.19, sa * 0.04], rx: 0.024, ry: 0.024 },
      ],
      4,
      true,
      true
    );
  }

  // Delicate Golden Hexagonal Filigree Clasp Gems around the Hovering Violet Crystal waist
  for (let s = 0; s < 6; s++) {
    const th = (Math.PI / 3) * s + Math.PI / 6;
    gCrysGold.addChamferBox({
      center: [Math.cos(th) * 0.70, 0.04, Math.sin(th) * 0.70],
      size: [0.16, 0.20, 0.16],
      rotDeg: [0, (-th * 180) / Math.PI, 45],
    });
  }

  const crystalMesh = scene.addMesh('HoveringVioletCrystal_Mesh', [
    gCrysDeep,
    gCrysBright,
    gCrysGold,
  ]);
  const crystalNodeIdx = scene.addNode({
    name: 'HoveringVioletCrystal',
    meshIndex: crystalMesh,
    translation: [0, crystalPivotY, 0],
    parentIndex: rootIdx,
  });

  // 3 Orbiting Golden & Violet Resonance Shards encircling the Hovering Violet Crystal
  const gOrbGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gOrbViolet = new PrimitiveGeom(mats.Mat_VioletBright);
  for (let i = 0; i < 3; i++) {
    const th = (2 * Math.PI * i) / 3;
    const th0 = th - 0.34;
    const th1 = th + 0.34;
    gOrbGold.addConcentricArcStrip({
      rInner: 1.00,
      rOuter: 1.12,
      yBot: -0.04,
      yTop: 0.04,
      thStart: th0,
      thEnd: th1,
      steps: 4,
      bevelIn: 0.01,
    });
    gOrbViolet.addFacetedCrystal({
      center: [Math.cos(th) * 1.06, 0, Math.sin(th) * 1.06],
      radii: [0.11, 0.22, 0.11],
      sectors: 5,
      stacks: 4,
    });
  }
  const orbitMesh = scene.addMesh('CrystalOrbitShards_Mesh', [gOrbGold, gOrbViolet]);
  const orbitNodeIdx = scene.addNode({
    name: 'CrystalOrbitShards',
    meshIndex: orbitMesh,
    translation: [0, crystalPivotY, 0],
    parentIndex: rootIdx,
  });

  // Low Translucent Twilight Harmonic Projection Ring just above the floor medallion (Y = 0.50),
  // leaving a crisp ~1.0-unit open air gap beneath the hovering violet crystal!
  const gPlume = new PrimitiveGeom(mats.Mat_VioletField);
  const haloRings = [];
  const haloCenters = [];
  for (let s = 0; s < 12; s++) {
    const th = (2 * Math.PI * s) / 12;
    const ca = Math.cos(th), sa = Math.sin(th);
    haloRings.push([
      [ca * 0.78, -0.08, sa * 0.78],
      [ca * 0.66, 0.10, sa * 0.66],
      [ca * 0.52, 0.10, sa * 0.52],
      [ca * 0.62, -0.08, sa * 0.62],
    ]);
    haloCenters.push([ca * 0.64, 0.01, sa * 0.64]);
  }
  gPlume.addCyclicRingLoft(haloRings, haloCenters);
  const plumeMesh = scene.addMesh('TwilightFloorHalo_Mesh', [gPlume]);
  const plumeNodeIdx = scene.addNode({
    name: 'TwilightFloorHalo',
    meshIndex: plumeMesh,
    translation: [0, 0.48, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 5. Seamless Looping 'idle' Animation (3.2s crystal levitation, shard orbit & arc shimmer)
  // -------------------------------------------------------------------------
  const tTimes = [0.0, 0.8, 1.6, 2.4, 3.2];
  scene.addAnimation('idle', [
    {
      nodeIndex: crystalNodeIdx,
      path: 'translation',
      times: tTimes,
      values: [
        [0, crystalPivotY, 0],
        [0, crystalPivotY + 0.12, 0],
        [0, crystalPivotY, 0],
        [0, crystalPivotY - 0.09, 0],
        [0, crystalPivotY, 0],
      ],
    },
    {
      nodeIndex: crystalNodeIdx,
      path: 'rotation',
      times: tTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(2.5, 18, -2.0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-2.5, -18, 2.0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: orbitNodeIdx,
      path: 'translation',
      times: tTimes,
      values: [
        [0, crystalPivotY, 0],
        [0, crystalPivotY + 0.07, 0],
        [0, crystalPivotY, 0],
        [0, crystalPivotY - 0.05, 0],
        [0, crystalPivotY, 0],
      ],
    },
    {
      nodeIndex: orbitNodeIdx,
      path: 'rotation',
      times: tTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-7, -26, 6),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(7, 26, -6),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: midArcsNodeIdx,
      path: 'rotation',
      times: tTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 12, 0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -12, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: plumeNodeIdx,
      path: 'scale',
      times: tTimes,
      values: [
        [1.0, 1.0, 1.0],
        [1.10, 1.05, 1.10],
        [1.0, 1.0, 1.0],
        [0.92, 0.96, 0.92],
        [1.0, 1.0, 1.0],
      ],
    },
  ]);

  return scene.buildGLB('TwilightArrayScene');
}

// ---------------------------------------------------------------------------
// Self-Validation Summary & CLI Entry Point
// ---------------------------------------------------------------------------

function summarizeSupportAsset(filename, glbBuffer, gltf) {
  let totalVerts = 0;
  let totalTris = 0;
  const globalMin = [Infinity, Infinity, Infinity];
  const globalMax = [-Infinity, -Infinity, -Infinity];

  const walk = (nodeIdx, parentPos, parentQuat, parentScale) => {
    const node = gltf.nodes[nodeIdx];
    const t = node.translation || [0, 0, 0];
    const q = node.rotation || [0, 0, 0, 1];
    const s = node.scale || [1, 1, 1];

    const scaledLocalT = [t[0] * parentScale[0], t[1] * parentScale[1], t[2] * parentScale[2]];
    const rotLocalT = rotateVecByQuat(scaledLocalT, parentQuat);
    const wPos = vAdd(parentPos, rotLocalT);
    const wQuat = quatMul(parentQuat, q);
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
        for (let ix = 0; ix < 2; ix++) {
          for (let iy = 0; iy < 2; iy++) {
            for (let iz = 0; iz < 2; iz++) {
              const corner = [
                (ix === 0 ? posAcc.min[0] : posAcc.max[0]) * wScale[0],
                (iy === 0 ? posAcc.min[1] : posAcc.max[1]) * wScale[1],
                (iz === 0 ? posAcc.min[2] : posAcc.max[2]) * wScale[2],
              ];
              const wPt = vAdd(wPos, rotateVecByQuat(corner, wQuat));
              for (let k = 0; k < 3; k++) {
                if (wPt[k] < globalMin[k]) globalMin[k] = wPt[k];
                if (wPt[k] > globalMax[k]) globalMax[k] = wPt[k];
              }
            }
          }
        }
      }
    }
    if (node.children) {
      for (const ch of node.children) walk(ch, wPos, wQuat, wScale);
    }
  };

  for (const rIdx of gltf.scenes[0].nodes) {
    walk(rIdx, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
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
    teamMaterials: gltf.materials.filter((m) => m.name.startsWith('Surf_TEAM_')).map((m) => m.name),
    glowMaterials: gltf.materials.filter((m) => m.name.startsWith('Surf_GLOW_')).map((m) => m.name),
    teamNodes: gltf.nodes.filter((n) => n.name.startsWith('Surf_TEAM_')).map((n) => n.name),
    glowNodes: gltf.nodes.filter((n) => n.name.startsWith('Surf_GLOW_')).map((n) => n.name),
    animations: (gltf.animations || []).map((a) => a.name),
  };
}

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
  fs.mkdirSync(outDir, { recursive: true });

  const cap = buildAegisCapacitorGLB();
  fs.writeFileSync(path.join(outDir, 'aegis_capacitor.glb'), cap.glb);

  const arr = buildTwilightArrayGLB();
  fs.writeFileSync(path.join(outDir, 'twilight_array.glb'), arr.glb);

  const summary = [
    summarizeSupportAsset('aegis_capacitor.glb', cap.glb, cap.gltf),
    summarizeSupportAsset('twilight_array.glb', arr.glb, arr.gltf),
  ];

  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildAegisCapacitorGLB,
  buildTwilightArrayGLB,
};
