#!/usr/bin/env node
'use strict';

/**
 * Deterministic Standalone Procedural GLB Generator for Starfall Command
 * Faction: Aurelian Concord — Advanced Robotics Ladder Assets
 *
 * Outputs (in target directory, default __dirname):
 *   1. robotics_annex.glb   (Robotics Bay equivalent, 7.0x7.0 footprint, Y=0, +X forward, 'idle')
 *   2. bastion_walker.glb   (Immortal equivalent, 4 articulated broad armored legs + twin blue
 *                            emitters, Y=0, +X forward, 'Muzzle' & 'MuzzleLeft',
 *                            clips: 'idle', 'walk', 'attack', 'death')
 *   3. rift_engine.glb      (Disruptor equivalent, round low hovering mechanical shell with
 *                            exposed contained energy core, Y=0 ground contact, +X forward,
 *                            'NovaOrigin', clips: 'idle', 'hover', 'cast', 'death')
 *
 * Uses ONLY built-in Node.js modules ('fs', 'path'). Zero external dependencies.
 * Visual language & materials aligned with generate_concord_industry.cjs.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Deterministic Math & Vector / Quaternion Utilities
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
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

function vDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vLen(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function vNorm(a) {
  const l = vLen(a);
  return l > 1e-10 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
}

function quatFromAxisAngle(axis, rad) {
  const n = vNorm(axis);
  const half = rad * 0.5;
  const s = Math.sin(half);
  return [
    Number((n[0] * s).toFixed(7)),
    Number((n[1] * s).toFixed(7)),
    Number((n[2] * s).toFixed(7)),
    Number(Math.cos(half).toFixed(7)),
  ];
}

/**
 * Intrinsic / standard XYZ Euler helper (small/moderate angles or cardinal rotations).
 */
function quatFromEulerXYZ(rxDeg, ryDeg, rzDeg) {
  const rx = (rxDeg * Math.PI) / 360;
  const ry = (ryDeg * Math.PI) / 360;
  const rz = (rzDeg * Math.PI) / 360;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const x = sx * cy * cz + cx * sy * sz;
  const y = cx * sy * cz - sx * cy * sz;
  const z = cx * cy * sz + sx * sy * cz;
  const w = cx * cy * cz - sx * sy * sz;
  const l = Math.hypot(x, y, z, w) || 1;
  return [
    Number((x / l).toFixed(7)),
    Number((y / l).toFixed(7)),
    Number((z / l).toFixed(7)),
    Number((w / l).toFixed(7)),
  ];
}

function quatMul(a, b) {
  const x = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1];
  const y = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0];
  const z = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3];
  const w = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2];
  const l = Math.hypot(x, y, z, w) || 1;
  return [
    Number((x / l).toFixed(7)),
    Number((y / l).toFixed(7)),
    Number((z / l).toFixed(7)),
    Number((w / l).toFixed(7)),
  ];
}

function rotateVecByQuat(v, q) {
  const u = [q[0], q[1], q[2]];
  const s = q[3];
  const d = vDot(u, v);
  const c = vCross(u, v);
  return [
    2 * d * u[0] + (s * s - vDot(u, u)) * v[0] + 2 * s * c[0],
    2 * d * u[1] + (s * s - vDot(u, u)) * v[1] + 2 * s * c[1],
    2 * d * u[2] + (s * s - vDot(u, u)) * v[2] + 2 * s * c[2],
  ];
}

function srgbHexToLinear(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [
    Number(toLin(r).toFixed(6)),
    Number(toLin(g).toFixed(6)),
    Number(toLin(b).toFixed(6)),
  ];
}

// ---------------------------------------------------------------------------
// Flat-Shaded Low-Poly Geometry Builder (Outward-Verified Winding)
// ---------------------------------------------------------------------------

class PrimitiveGeom {
  constructor(materialIndex) {
    this.materialIndex = materialIndex;
    this.positions = [];
    this.normals = [];
    this.indices = [];
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  addTri(p0, p1, p2, outwardHint = null) {
    let a = p0, b = p1, c = p2;
    let n = vCross(vSub(b, a), vSub(c, a));
    const len = vLen(n);
    if (len < 1e-9) return;
    n = [n[0] / len, n[1] / len, n[2] / len];

    if (outwardHint && vDot(n, outwardHint) < 0) {
      const tmp = b;
      b = c;
      c = tmp;
      n = [-n[0], -n[1], -n[2]];
    }

    const base = this.vertexCount;
    for (const p of [a, b, c]) {
      this.positions.push(
        Number(p[0].toFixed(5)),
        Number(p[1].toFixed(5)),
        Number(p[2].toFixed(5))
      );
      this.normals.push(
        Number(n[0].toFixed(5)),
        Number(n[1].toFixed(5)),
        Number(n[2].toFixed(5))
      );
    }
    this.indices.push(base, base + 1, base + 2);
  }

  addQuad(p0, p1, p2, p3, outwardHint = null) {
    this.addTri(p0, p1, p2, outwardHint);
    this.addTri(p0, p2, p3, outwardHint);
  }

  addPolygonCap(ring, capCenter, normalHint) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      this.addTri(capCenter, a, b, normalHint);
    }
  }

  addLoft(rings, ringCenters, capStart = true, capEnd = true) {
    const numRings = rings.length;
    if (numRings < 2) return;
    const segs = rings[0].length;

    for (let r = 0; r < numRings - 1; r++) {
      const r0 = rings[r];
      const r1 = rings[r + 1];
      const c0 = ringCenters[r];
      const c1 = ringCenters[r + 1];
      const midC = vScale(vAdd(c0, c1), 0.5);

      for (let i = 0; i < segs; i++) {
        const inext = (i + 1) % segs;
        const p00 = r0[i];
        const p01 = r0[inext];
        const p11 = r1[inext];
        const p10 = r1[i];
        const quadMid = vScale(vAdd(vAdd(p00, p01), vAdd(p10, p11)), 0.25);
        const outHint = vSub(quadMid, midC);
        this.addQuad(p00, p01, p11, p10, outHint);
      }
    }

    if (capStart) {
      const axisStart = vSub(ringCenters[0], ringCenters[1]);
      const hintStart = vLen(axisStart) > 1e-6 ? axisStart : [0, -1, 0];
      this.addPolygonCap(rings[0], ringCenters[0], hintStart);
    }
    if (capEnd) {
      const last = numRings - 1;
      const axisEnd = vSub(ringCenters[last], ringCenters[last - 1]);
      const hintEnd = vLen(axisEnd) > 1e-6 ? axisEnd : [0, 1, 0];
      this.addPolygonCap(rings[last], ringCenters[last], hintEnd);
    }
  }

  addCyclicRingLoft(rings, ringCenters) {
    const numRings = rings.length;
    if (numRings < 3) return;
    const segs = rings[0].length;

    for (let r = 0; r < numRings; r++) {
      const rnext = (r + 1) % numRings;
      const r0 = rings[r];
      const r1 = rings[rnext];
      const midC = vScale(vAdd(ringCenters[r], ringCenters[rnext]), 0.5);

      for (let i = 0; i < segs; i++) {
        const inext = (i + 1) % segs;
        const p00 = r0[i];
        const p01 = r0[inext];
        const p11 = r1[inext];
        const p10 = r1[i];
        const quadMid = vScale(vAdd(vAdd(p00, p01), vAdd(p10, p11)), 0.25);
        this.addQuad(p00, p01, p11, p10, vSub(quadMid, midC));
      }
    }
  }

  addConcentricArcStrip({
    rInner,
    rOuter,
    yBot,
    yTop,
    thStart,
    thEnd,
    steps = 8,
    bevelIn = 0.02,
  }) {
    const rings = [];
    const centers = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const th = thStart + (thEnd - thStart) * u;
      const ca = Math.cos(th);
      const sa = Math.sin(th);
      rings.push([
        [ca * rOuter, yBot, sa * rOuter],
        [ca * (rOuter - bevelIn), yTop, sa * (rOuter - bevelIn)],
        [ca * (rInner + bevelIn), yTop, sa * (rInner + bevelIn)],
        [ca * rInner, yBot, sa * rInner],
      ]);
      centers.push([ca * ((rInner + rOuter) * 0.5), (yBot + yTop) * 0.5, sa * ((rInner + rOuter) * 0.5)]);
    }
    this.addLoft(rings, centers, true, true);
  }

  addTubeAlongSpine(spine, sides = 6, capStart = true, capEnd = true) {
    const n = spine.length;
    if (n < 2) return;

    const tangents = [];
    for (let i = 0; i < n; i++) {
      if (i === 0) tangents.push(vNorm(vSub(spine[1].pos, spine[0].pos)));
      else if (i === n - 1) tangents.push(vNorm(vSub(spine[n - 1].pos, spine[n - 2].pos)));
      else tangents.push(vNorm(vSub(spine[i + 1].pos, spine[i - 1].pos)));
    }

    let upRef = Math.abs(tangents[0][1]) < 0.85 ? [0, 1, 0] : [1, 0, 0];
    let normalVec = vNorm(vCross(tangents[0], upRef));

    const rings = [];
    const centers = [];

    for (let i = 0; i < n; i++) {
      const t = tangents[i];
      if (i > 0) {
        const proj = vSub(normalVec, vScale(t, vDot(normalVec, t)));
        if (vLen(proj) > 1e-5) normalVec = vNorm(proj);
      }
      const binorm = vNorm(vCross(t, normalVec));
      const { pos, rx, ry } = spine[i];
      const rotOffset = spine[i].phase || 0;
      const ring = [];
      for (let s = 0; s < sides; s++) {
        const a = (2 * Math.PI * s) / sides + rotOffset;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        ring.push([
          pos[0] + normalVec[0] * (ca * rx) + binorm[0] * (sa * ry),
          pos[1] + normalVec[1] * (ca * rx) + binorm[1] * (sa * ry),
          pos[2] + normalVec[2] * (ca * rx) + binorm[2] * (sa * ry),
        ]);
      }
      rings.push(ring);
      centers.push(pos);
    }

    this.addLoft(rings, centers, capStart, capEnd);
  }

  addChamferBox({
    center = [0, 0, 0],
    size = [1, 1, 1],
    rotDeg = [0, 0, 0],
    topScale = [0.9, 0.9],
    botScale = [1.0, 1.0],
    minYClamp = null,
  }) {
    const hx = size[0] * 0.5;
    const hy = size[1] * 0.5;
    const hz = size[2] * 0.5;
    const q = quatFromEulerXYZ(rotDeg[0], rotDeg[1], rotDeg[2]);

    const xform = (lp) => {
      const p = vAdd(center, rotateVecByQuat(lp, q));
      if (minYClamp !== null && p[1] < minYClamp) p[1] = minYClamp;
      return p;
    };

    const bx = hx * botScale[0];
    const bz = hz * botScale[1];
    const tx = hx * topScale[0];
    const tz = hz * topScale[1];

    const rBot = [
      xform([-bx, -hy, -bz]),
      xform([bx, -hy, -bz]),
      xform([bx, -hy, bz]),
      xform([-bx, -hy, bz]),
    ];
    const rTop = [
      xform([-tx, hy, -tz]),
      xform([tx, hy, -tz]),
      xform([tx, hy, tz]),
      xform([-tx, hy, tz]),
    ];
    this.addLoft([rBot, rTop], [xform([0, -hy, 0]), xform([0, hy, 0])], true, true);
  }

  addFacetedCrystal({
    center = [0, 0, 0],
    radii = [0.5, 0.8, 0.5],
    rotDeg = [0, 0, 0],
    sectors = 6,
    stacks = 4,
    phaseRad = 0,
  }) {
    const q = quatFromEulerXYZ(rotDeg[0], rotDeg[1], rotDeg[2]);
    const xform = (lp) => vAdd(center, rotateVecByQuat(lp, q));

    const rings = [];
    const ringCenters = [];
    for (let st = 1; st < stacks; st++) {
      const v = st / stacks;
      const phi = (v - 0.5) * Math.PI;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const ring = [];
      for (let s = 0; s < sectors; s++) {
        const th = (2 * Math.PI * s) / sectors + phaseRad;
        ring.push(
          xform([
            Math.cos(th) * cp * radii[0],
            sp * radii[1],
            Math.sin(th) * cp * radii[2],
          ])
        );
      }
      rings.push(ring);
      ringCenters.push(xform([0, sp * radii[1], 0]));
    }

    const botPole = xform([0, -radii[1], 0]);
    const topPole = xform([0, radii[1], 0]);

    for (let s = 0; s < sectors; s++) {
      const snext = (s + 1) % sectors;
      const p0 = rings[0][s];
      const p1 = rings[0][snext];
      const mid = vScale(vAdd(vAdd(botPole, p0), p1), 1 / 3);
      this.addTri(botPole, p1, p0, vSub(mid, center));
    }

    if (rings.length >= 2) {
      this.addLoft(rings, ringCenters, false, false);
    }

    const topRing = rings[rings.length - 1];
    for (let s = 0; s < sectors; s++) {
      const snext = (s + 1) % sectors;
      const p0 = topRing[s];
      const p1 = topRing[snext];
      const mid = vScale(vAdd(vAdd(topPole, p0), p1), 1 / 3);
      this.addTri(topPole, p0, p1, vSub(mid, center));
    }
  }

  addOrientedShield(origin, outNormal, upHint, poly2D, depth = 0.08, topScale = 0.86, backInset = 0.015) {
    const N = vNorm(outNormal);
    let U = vSub(upHint, vScale(N, vDot(upHint, N)));
    if (vLen(U) < 1e-6) U = [0, 1, 0];
    U = vNorm(U);
    const R = vNorm(vCross(U, N));

    const baseRing = poly2D.map(([x, y]) => [
      origin[0] + R[0] * x + U[0] * y - N[0] * backInset,
      origin[1] + R[1] * x + U[1] * y - N[1] * backInset,
      origin[2] + R[2] * x + U[2] * y - N[2] * backInset,
    ]);
    const topRing = poly2D.map(([x, y]) => [
      origin[0] + R[0] * (x * topScale) + U[0] * (y * topScale) + N[0] * depth,
      origin[1] + R[1] * (x * topScale) + U[1] * (y * topScale) + N[1] * depth,
      origin[2] + R[2] * (x * topScale) + U[2] * (y * topScale) + N[2] * depth,
    ]);
    const c0 = vSub(origin, vScale(N, backInset));
    const c1 = vAdd(origin, vScale(N, depth));
    this.addLoft([baseRing, topRing], [c0, c1], true, true);
  }
}

// ---------------------------------------------------------------------------
// Minimal Binary glTF 2.0 (.glb) Scene Assembler
// ---------------------------------------------------------------------------

class GLBSceneBuilder {
  constructor(generatorName = 'starfall-concord-advanced-robotics-generator-1.0') {
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
    roughness = 0.45,
    emissiveHex = null,
    emissiveBoost = 1.0,
    doubleSided = false,
  }) {
    const rgb = srgbHexToLinear(baseColorHex);
    const mat = {
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [rgb[0], rgb[1], rgb[2], Number(alpha.toFixed(4))],
        metallicFactor: Number(metallic.toFixed(4)),
        roughnessFactor: Number(roughness.toFixed(4)),
      },
    };
    if (alpha < 0.999) mat.alphaMode = 'BLEND';
    if (doubleSided) mat.doubleSided = true;
    if (emissiveHex) {
      const e = srgbHexToLinear(emissiveHex);
      mat.emissiveFactor = [
        Number(clamp(e[0] * emissiveBoost, 0, 1).toFixed(5)),
        Number(clamp(e[1] * emissiveBoost, 0, 1).toFixed(5)),
        Number(clamp(e[2] * emissiveBoost, 0, 1).toFixed(5)),
      ];
    }
    const idx = this.materials.length;
    this.materials.push(mat);
    return idx;
  }

  addMesh(name, primitives) {
    const valid = primitives.filter((p) => p.vertexCount > 0 && p.indices.length > 0);
    if (valid.length === 0) {
      throw new Error(`Mesh "${name}" has zero non-empty primitives.`);
    }
    const idx = this.meshes.length;
    this.meshes.push({ name, primitives: valid });
    return idx;
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
    if (translation) node.translation = translation.map((v) => Number(v.toFixed(5)));
    if (rotation) node.rotation = rotation.map((v) => Number(v.toFixed(6)));
    if (scale) node.scale = scale.map((v) => Number(v.toFixed(5)));

    const idx = this.nodes.length;
    this.nodes.push(node);

    if (parentIndex !== null && parentIndex !== undefined) {
      if (!this.nodes[parentIndex].children) this.nodes[parentIndex].children = [];
      this.nodes[parentIndex].children.push(idx);
    } else {
      this.rootNodes.push(idx);
    }
    return idx;
  }

  addAnimation(name, tracks) {
    this.animations.push({ name, tracks });
  }

  buildGLB(sceneName = 'Scene') {
    const bufferViews = [];
    const accessors = [];
    const binChunks = [];
    let byteOffset = 0;

    const appendAligned = (buf, target) => {
      const pad = (4 - (buf.length % 4)) % 4;
      const aligned = pad > 0 ? Buffer.concat([buf, Buffer.alloc(pad, 0)]) : buf;
      const viewIdx = bufferViews.length;
      const bv = {
        buffer: 0,
        byteOffset,
        byteLength: buf.length,
      };
      if (target) bv.target = target;
      bufferViews.push(bv);
      binChunks.push(aligned);
      byteOffset += aligned.length;
      return viewIdx;
    };

    const gltfMeshes = this.meshes.map((m) => {
      const gltfPrims = m.primitives.map((prim) => {
        const vCount = prim.vertexCount;
        if (vCount > 65535) {
          throw new Error(`Primitive in mesh "${m.name}" exceeds uint16 vertex limit (${vCount}).`);
        }

        const posBuf = Buffer.alloc(vCount * 12);
        const normBuf = Buffer.alloc(vCount * 12);
        const minPos = [Infinity, Infinity, Infinity];
        const maxPos = [-Infinity, -Infinity, -Infinity];

        for (let i = 0; i < vCount; i++) {
          for (let k = 0; k < 3; k++) {
            const pv = prim.positions[i * 3 + k];
            const nv = prim.normals[i * 3 + k];
            if (pv < minPos[k]) minPos[k] = pv;
            if (pv > maxPos[k]) maxPos[k] = pv;
            posBuf.writeFloatLE(pv, (i * 3 + k) * 4);
            normBuf.writeFloatLE(nv, (i * 3 + k) * 4);
          }
        }

        const idxCount = prim.indices.length;
        const idxBuf = Buffer.alloc(idxCount * 2);
        for (let i = 0; i < idxCount; i++) {
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
          min: minPos.map((v) => Number(v.toFixed(5))),
          max: maxPos.map((v) => Number(v.toFixed(5))),
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
          count: idxCount,
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
// Shared Aurelian Concord Advanced Robotics Palette (Aligned w/ Forge/Foundry)
// ---------------------------------------------------------------------------

function createConcordRoboticsMaterials(scene) {
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

  const Mat_Ivory = scene.addMaterial({
    name: 'Mat_Ivory',
    baseColorHex: '#c9bfa4',
    metallic: 0.18,
    roughness: 0.38,
  });

  const Mat_IvoryLight = scene.addMaterial({
    name: 'Mat_IvoryLight',
    baseColorHex: '#dfd7c0',
    metallic: 0.16,
    roughness: 0.32,
  });

  const Mat_Gold = scene.addMaterial({
    name: 'Mat_Gold',
    baseColorHex: '#c89b32',
    metallic: 0.78,
    roughness: 0.28,
  });

  const Mat_GoldBright = scene.addMaterial({
    name: 'Mat_GoldBright',
    baseColorHex: '#e6bc53',
    metallic: 0.80,
    roughness: 0.22,
  });

  const Mat_BronzeCrucible = scene.addMaterial({
    name: 'Mat_BronzeCrucible',
    baseColorHex: '#9e7226',
    metallic: 0.76,
    roughness: 0.34,
  });

  const Mat_StoneDark = scene.addMaterial({
    name: 'Mat_StoneDark',
    baseColorHex: '#2d3544',
    metallic: 0.28,
    roughness: 0.58,
  });

  const Mat_ApertureVoid = scene.addMaterial({
    name: 'Mat_ApertureVoid',
    baseColorHex: '#151b26',
    metallic: 0.15,
    roughness: 0.76,
  });

  // Robotics Annex: Precision teal-aquamarine calibration core & beams (matches Robotics Foundry)
  const Mat_FoundryTeal = scene.addMaterial({
    name: 'Mat_FoundryTeal',
    baseColorHex: '#5ef2e4',
    metallic: 0.0,
    roughness: 0.16,
    emissiveHex: '#1cd8c9',
    emissiveBoost: 1.08,
  });

  const Mat_FoundryField = scene.addMaterial({
    name: 'Mat_FoundryField',
    baseColorHex: '#34e0d2',
    alpha: 0.44,
    metallic: 0.0,
    roughness: 0.18,
    emissiveHex: '#14b8a6',
    emissiveBoost: 0.82,
    doubleSided: true,
  });

  // Bastion Walker: Twin vivid sapphire-cobalt phase emitters (distinct electric blue energy!)
  const Mat_EmitterBlue = scene.addMaterial({
    name: 'Mat_EmitterBlue',
    baseColorHex: '#47b8ff',
    metallic: 0.04,
    roughness: 0.12,
    emissiveHex: '#1284ff',
    emissiveBoost: 1.24,
  });

  const Mat_EmitterBlueCore = scene.addMaterial({
    name: 'Mat_EmitterBlueCore',
    baseColorHex: '#b3eeff',
    metallic: 0.0,
    roughness: 0.10,
    emissiveHex: '#54ccff',
    emissiveBoost: 1.32,
  });

  const Mat_EmitterBlueLens = scene.addMaterial({
    name: 'Mat_EmitterBlueLens',
    baseColorHex: '#1e90ff',
    alpha: 0.54,
    metallic: 0.06,
    roughness: 0.14,
    emissiveHex: '#0b6ef5',
    emissiveBoost: 0.94,
    doubleSided: true,
  });

  // Rift Engine: Blazing golden-solar / volatile white-amber exposed contained rift core!
  const Mat_RiftCoreHot = scene.addMaterial({
    name: 'Mat_RiftCoreHot',
    baseColorHex: '#fff0b3',
    metallic: 0.0,
    roughness: 0.10,
    emissiveHex: '#ffbe3b',
    emissiveBoost: 1.36,
  });

  const Mat_RiftCoreSolar = scene.addMaterial({
    name: 'Mat_RiftCoreSolar',
    baseColorHex: '#ff9b26',
    metallic: 0.06,
    roughness: 0.16,
    emissiveHex: '#f57c00',
    emissiveBoost: 1.02,
  });

  const Mat_RiftCorona = scene.addMaterial({
    name: 'Mat_RiftCorona',
    baseColorHex: '#ffd166',
    alpha: 0.44,
    metallic: 0.0,
    roughness: 0.16,
    emissiveHex: '#ffa62b',
    emissiveBoost: 0.88,
    doubleSided: true,
  });

  return {
    Surf_TEAM,
    Surf_GLOW,
    Mat_Ivory,
    Mat_IvoryLight,
    Mat_Gold,
    Mat_GoldBright,
    Mat_BronzeCrucible,
    Mat_StoneDark,
    Mat_ApertureVoid,
    Mat_FoundryTeal,
    Mat_FoundryField,
    Mat_EmitterBlue,
    Mat_EmitterBlueCore,
    Mat_EmitterBlueLens,
    Mat_RiftCoreHot,
    Mat_RiftCoreSolar,
    Mat_RiftCorona,
  };
}

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

function makeRectChamferRing(hx, hz, chamfer, y, offsetX = 0, offsetZ = 0) {
  const c = Math.min(chamfer, hx * 0.45, hz * 0.45);
  return [
    [hx + offsetX, y, -(hz - c) + offsetZ],
    [hx + offsetX, y, (hz - c) + offsetZ],
    [(hx - c) + offsetX, y, hz + offsetZ],
    [-(hx - c) + offsetX, y, hz + offsetZ],
    [-hx + offsetX, y, (hz - c) + offsetZ],
    [-hx + offsetX, y, -(hz - c) + offsetZ],
    [-(hx - c) + offsetX, y, -hz + offsetZ],
    [(hx - c) + offsetX, y, -hz + offsetZ],
  ];
}

// ---------------------------------------------------------------------------
// Asset 1: robotics_annex.glb
// Robotics Bay equivalent — 7.0 x 7.0 footprint ([-3.5, +3.5], Y=0, +X forward),
// industrial ivory/gold/bronze high-tech robotics research annex with a rear
// thermal-arcane reactor spire, twin inward-arching robotic calibration arms,
// and an open forward-center precision turntable & suspended construct core matrix.
// ---------------------------------------------------------------------------

function buildRoboticsAnnexGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createConcordRoboticsMaterials(scene);

  const rootIdx = scene.addNode({ name: 'RoboticsAnnex', translation: [0, 0, 0] });

  const gIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gIvoryLight = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gGold = new PrimitiveGeom(mats.Mat_Gold);
  const gGoldBright = new PrimitiveGeom(mats.Mat_GoldBright);
  const gBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);
  const gStone = new PrimitiveGeom(mats.Mat_StoneDark);
  const gVoid = new PrimitiveGeom(mats.Mat_ApertureVoid);
  const gTeal = new PrimitiveGeom(mats.Mat_FoundryTeal);

  // -------------------------------------------------------------------------
  // 1. Heavy 7.0 x 7.0 Industrial Annex Foundation (exact [-3.50, +3.50], Y = 0.00 .. 0.88)
  // -------------------------------------------------------------------------
  gStone.addLoft(
    [
      makeRectChamferRing(3.500, 3.500, 0.92, 0.000),
      makeRectChamferRing(3.430, 3.430, 0.90, 0.260),
      makeRectChamferRing(3.200, 3.200, 0.84, 0.300),
    ],
    [[0, 0.001, 0], [0, 0.260, 0], [0, 0.300, 0]],
    true,
    true
  );

  // Recessed Glowing Teal Conduit Band around Annex Plinth
  gTeal.addLoft(
    [
      makeRectChamferRing(3.280, 3.280, 0.86, 0.265),
      makeRectChamferRing(3.280, 3.280, 0.86, 0.370),
    ],
    [[0, 0.27, 0], [0, 0.37, 0]],
    false,
    true
  );

  // Burnished Gold Collar & Broad Sculpted Ivory Research Deck (Y = 0.36 .. 0.86)
  gGold.addLoft(
    [
      makeRectChamferRing(3.360, 3.360, 0.88, 0.365),
      makeRectChamferRing(3.260, 3.260, 0.86, 0.490),
    ],
    [[0, 0.366, 0], [0, 0.489, 0]],
    true,
    true
  );

  gIvory.addLoft(
    [
      makeRectChamferRing(3.180, 3.180, 0.84, 0.490),
      makeRectChamferRing(2.960, 2.960, 0.78, 0.860),
    ],
    [[0, 0.491, 0], [0, 0.859, 0]],
    false,
    true
  );

  // +X Forward Diagnostic Umbilical Interface Dock (marks +X forward cleanly!)
  gIvoryLight.addChamferBox({
    center: [2.88, 0.48, 0],
    size: [1.16, 0.72, 2.36],
    topScale: [0.86, 0.90],
    minYClamp: 0.0,
  });
  gVoid.addChamferBox({
    center: [3.34, 0.48, 0],
    size: [0.22, 0.42, 1.48],
    topScale: [0.92, 0.94],
  });
  gTeal.addChamferBox({
    center: [3.39, 0.48, 0],
    size: [0.14, 0.14, 1.22],
    topScale: [0.94, 0.96],
  });
  gGoldBright.addChamferBox({
    center: [2.88, 0.88, 0],
    size: [0.88, 0.12, 2.04],
    topScale: [0.90, 0.92],
  });

  // Twin Lateral Industrial Power & Hydraulics Pods (±Z flanks, Y = 0.52 .. 1.84)
  const wingTeamPoly = [
    [-0.92, -0.32],
    [0.92, -0.32],
    [0.76, 0.32],
    [-0.76, 0.32],
  ];
  for (const [tName, side] of [
    ['Surf_TEAM_WingRight', 1],
    ['Surf_TEAM_WingLeft', -1],
  ]) {
    const wz = side * 2.58;
    gIvoryLight.addChamferBox({
      center: [-0.28, 1.16, wz],
      size: [2.88, 1.24, 1.32],
      topScale: [0.84, 0.78],
      minYClamp: 0.0,
    });
    gBronze.addChamferBox({
      center: [-0.28, 0.92, side * 3.16],
      size: [2.16, 0.68, 0.36],
      topScale: [0.88, 0.84],
      minYClamp: 0.0,
    });
    gGold.addChamferBox({
      center: [-0.28, 1.82, wz],
      size: [2.36, 0.14, 0.98],
      topScale: [0.90, 0.90],
    });

    // Bold Team Armor Panel on outer-top bevel of each side capacitor wing
    const pos = [-0.28, 1.54, side * 2.98];
    const out = vNorm([0, 0.56, side * 0.83]);
    const up = [0, 0.83, -side * 0.56];
    gGoldBright.addOrientedShield(
      pos,
      out,
      up,
      wingTeamPoly.map(([x, y]) => [x * 1.10, y * 1.14]),
      0.05,
      0.90,
      0.015
    );
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(vAdd(pos, vScale(out, 0.034)), out, up, wingTeamPoly, 0.064, 0.88, 0.02);
    const tMesh = scene.addMesh(tName, [gTeam]);
    scene.addNode({ name: tName, meshIndex: tMesh, parentIndex: rootIdx });
  }

  // +X Dock Pair of Team Panels (Surf_TEAM_FrontDockR / L)
  const dockTeamPoly = [
    [-0.38, -0.26],
    [0.38, -0.26],
    [0.30, 0.26],
    [-0.30, 0.26],
  ];
  for (const [tName, side] of [
    ['Surf_TEAM_FrontDockR', 1],
    ['Surf_TEAM_FrontDockL', -1],
  ]) {
    const pos = [2.88, 0.96, side * 0.64];
    const out = vNorm([0.34, 0.94, 0]);
    const up = [-0.94, 0.34, 0];
    gGoldBright.addOrientedShield(
      pos,
      out,
      up,
      dockTeamPoly.map(([x, y]) => [x * 1.12, y * 1.14]),
      0.045,
      0.90,
      0.015
    );
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(vAdd(pos, vScale(out, 0.032)), out, up, dockTeamPoly, 0.058, 0.88, 0.02);
    const tMesh = scene.addMesh(tName, [gTeam]);
    scene.addNode({ name: tName, meshIndex: tMesh, parentIndex: rootIdx });
  }

  // -------------------------------------------------------------------------
  // 2. Commanding Rear Thermal-Arcane Core Spire (x = -2.14, Y = 0.78 .. 4.78)
  //    Creates unmistakable rear-crowned C-amphitheater Robotics Bay silhouette!
  // -------------------------------------------------------------------------
  gIvory.addLoft(
    [
      makeRectChamferRing(0.96, 1.48, 0.34, 0.78, -2.14, 0),
      makeRectChamferRing(0.88, 1.36, 0.30, 2.38, -2.18, 0),
      makeRectChamferRing(0.68, 1.04, 0.24, 3.86, -2.02, 0),
      makeRectChamferRing(0.42, 0.64, 0.16, 4.66, -1.78, 0),
    ],
    [[-2.14, 0.78, 0], [-2.18, 2.38, 0], [-2.02, 3.86, 0], [-1.78, 4.66, 0]],
    true,
    true
  );

  // Twin Swept Burnished-Gold Heat-Exchanger Buttress Fins flanking the Rear Spire
  for (const side of [-1, 1]) {
    gGold.addTubeAlongSpine(
      [
        { pos: [-2.36, 0.86, side * 1.56], rx: 0.22, ry: 0.14 },
        { pos: [-2.38, 2.48, side * 1.44], rx: 0.18, ry: 0.12 },
        { pos: [-2.12, 3.96, side * 1.08], rx: 0.14, ry: 0.09 },
        { pos: [-1.80, 4.74, side * 0.62], rx: 0.08, ry: 0.06 },
      ],
      4,
      true,
      true
    );
  }
  // Vertical Glowing Teal Thermal Core Conduit Slit down the +X face of the Rear Spire
  gTeal.addTubeAlongSpine(
    [
      { pos: [-1.24, 1.32, 0], rx: 0.12, ry: 0.18 },
      { pos: [-1.32, 2.54, 0], rx: 0.11, ry: 0.16 },
      { pos: [-1.34, 3.78, 0], rx: 0.09, ry: 0.13 },
    ],
    4,
    true,
    true
  );

  // Rear Tower Team Crests (Surf_TEAM_TowerCrest on -X rear face + Surf_TEAM_SpireRight/Left on ±Z flanks!)
  {
    const crestPoly = [
      [-0.56, -0.44],
      [0.56, -0.44],
      [0.44, 0.34],
      [0.00, 0.50],
      [-0.44, 0.34],
    ];
    const cPos = [-2.89, 3.14, 0];
    const cOut = vNorm([-0.97, 0.24, 0]);
    const cUp = [0.24, 0.97, 0];
    gGoldBright.addOrientedShield(
      cPos,
      cOut,
      cUp,
      crestPoly.map(([x, y]) => [x * 1.12, y * 1.14]),
      0.05,
      0.88,
      0.015
    );
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(vAdd(cPos, vScale(cOut, 0.034)), cOut, cUp, crestPoly, 0.064, 0.86, 0.02);
    const tMesh = scene.addMesh('Surf_TEAM_TowerCrest', [gTeam]);
    scene.addNode({ name: 'Surf_TEAM_TowerCrest', meshIndex: tMesh, parentIndex: rootIdx });

    const flankPoly = [
      [-0.36, -0.46],
      [0.36, -0.46],
      [0.28, 0.46],
      [-0.28, 0.46],
    ];
    for (const [sName, side] of [
      ['Surf_TEAM_SpireRight', 1],
      ['Surf_TEAM_SpireLeft', -1],
    ]) {
      const sPos = [-2.09, 3.18, side * 1.19];
      const sOut = vNorm([0.05, 0.22, side * 0.974]);
      const sUp = [0.10, 0.97, -side * 0.22];
      gGoldBright.addOrientedShield(
        sPos,
        sOut,
        sUp,
        flankPoly.map(([x, y]) => [x * 1.14, y * 1.12]),
        0.045,
        0.88,
        0.015
      );
      const gSpireTeam = new PrimitiveGeom(mats.Surf_TEAM);
      gSpireTeam.addOrientedShield(
        vAdd(sPos, vScale(sOut, 0.032)),
        sOut,
        sUp,
        flankPoly,
        0.058,
        0.86,
        0.02
      );
      const sMesh = scene.addMesh(sName, [gSpireTeam]);
      scene.addNode({ name: sName, meshIndex: sMesh, parentIndex: rootIdx });
    }
  }

  // Recessed Dark Calibration Pit on Forward-Center Deck (centered at X = +0.52, Z = 0, Y = 0.86 .. 0.96)
  const pitRing = makeCardinalAlignedRing(12, 1.88, 0.88, 0.52, 0);
  for (let i = 0; i < 12; i++) {
    gVoid.addTri([0.52, 0.88, 0], pitRing[(i + 1) % 12], pitRing[i], [0, 1, 0]);
  }
  gGoldBright.addLoft(
    [
      makeCardinalAlignedRing(12, 2.02, 0.85, 0.52, 0),
      makeCardinalAlignedRing(12, 1.94, 0.97, 0.52, 0),
    ],
    [[0.52, 0.85, 0], [0.52, 0.97, 0]],
    false,
    true
  );

  // Surf_GLOW_* Beacons on Annex Base & Spire Top
  for (const [gName, gPos, gRad] of [
    ['Surf_GLOW_DockR', [2.98, 1.06, 1.24], [0.16, 0.22, 0.16]],
    ['Surf_GLOW_DockL', [2.98, 1.06, -1.24], [0.16, 0.22, 0.16]],
    ['Surf_GLOW_TowerTop', [-1.76, 4.86, 0.00], [0.18, 0.24, 0.18]],
  ]) {
    gGold.addChamferBox({
      center: [gPos[0], gPos[1] - 0.13, gPos[2]],
      size: [0.38, 0.16, 0.38],
      topScale: [0.84, 0.84],
    });
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({ center: gPos, radii: gRad, sectors: 6, stacks: 4 });
    const gMesh = scene.addMesh(gName, [gGlow]);
    scene.addNode({ name: gName, meshIndex: gMesh, parentIndex: rootIdx });
  }

  // Note: the unshifted addConcentricArcStrip at (0,0) is fine too, or let's build AnnexHull cleanly without overlap:
  const annexHullPrims = [gIvory, gIvoryLight, gGold, gGoldBright, gBronze, gStone, gVoid, gTeal];
  const annexHullMesh = scene.addMesh('RoboticsAnnexHull_Mesh', annexHullPrims);
  scene.addNode({ name: 'RoboticsAnnexHull', meshIndex: annexHullMesh, parentIndex: rootIdx });

  // -------------------------------------------------------------------------
  // 3. Rotating Precision Calibration Turntable (centered at [0.52, 0.94, 0])
  // -------------------------------------------------------------------------
  const tablePos = [0.52, 0.94, 0];
  const gTabGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gTabBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);
  const gTabTeal = new PrimitiveGeom(mats.Mat_FoundryTeal);

  gTabBronze.addConcentricArcStrip({
    rInner: 1.48,
    rOuter: 1.76,
    yBot: -0.04,
    yTop: 0.08,
    thStart: 0,
    thEnd: Math.PI * 2,
    steps: 12,
    bevelIn: 0.02,
  });
  for (let k = 0; k < 3; k++) {
    const base = (2 * Math.PI * k) / 3;
    gTabTeal.addConcentricArcStrip({
      rInner: 1.02,
      rOuter: 1.32,
      yBot: -0.02,
      yTop: 0.07,
      thStart: base + 0.16,
      thEnd: base + (2 * Math.PI) / 3 - 0.16,
      steps: 5,
      bevelIn: 0.015,
    });
    const ca = Math.cos(base), sa = Math.sin(base);
    gTabGold.addChamferBox({
      center: [ca * 1.56, 0.14, sa * 1.56],
      size: [0.34, 0.18, 0.38],
      rotDeg: [0, (-base * 180) / Math.PI, 0],
    });
  }
  // Central glowing teal focal emitter pad on turntable
  const tabCore = makeCardinalAlignedRing(8, 0.64, 0.06);
  for (let i = 0; i < 8; i++) {
    gTabTeal.addTri([0, 0.09, 0], tabCore[(i + 1) % 8], tabCore[i], [0, 1, 0]);
  }

  const turntableMesh = scene.addMesh('CalibrationTurntable_Mesh', [gTabGold, gTabBronze, gTabTeal]);
  const turntableNodeIdx = scene.addNode({
    name: 'CalibrationTurntable',
    meshIndex: turntableMesh,
    translation: tablePos,
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 4. Suspended Robotic Construct Core Matrix ([0.52, 2.46, 0])
  // -------------------------------------------------------------------------
  const matrixPos = [0.52, 2.46, 0];
  const gMatTeal = new PrimitiveGeom(mats.Mat_FoundryTeal);
  const gMatGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gMatField = new PrimitiveGeom(mats.Mat_FoundryField);

  // Faceted Thermal-Teal Robotic Core Prism
  gMatTeal.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [0.62, 0.86, 0.62],
    sectors: 6,
    stacks: 4,
  });
  // Equatorial & Meridian Golden Calibration Cage Rings around the core
  const cageRings = [];
  const cageCenters = [];
  for (let s = 0; s < 8; s++) {
    const th = (2 * Math.PI * s) / 8;
    const ca = Math.cos(th), sa = Math.sin(th);
    cageRings.push([
      [ca * 0.92, -0.05, sa * 0.92],
      [ca * 0.92, 0.05, sa * 0.92],
      [ca * 0.78, 0.06, sa * 0.78],
      [ca * 0.78, -0.06, sa * 0.78],
    ]);
    cageCenters.push([ca * 0.85, 0, sa * 0.85]);
  }
  gMatGold.addCyclicRingLoft(cageRings, cageCenters);
  gMatField.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [0.80, 1.02, 0.80],
    sectors: 6,
    stacks: 4,
    phaseRad: Math.PI / 6,
  });

  const matrixMesh = scene.addMesh('AnnexCoreMatrix_Mesh', [gMatTeal, gMatGold, gMatField]);
  const matrixNodeIdx = scene.addNode({
    name: 'AnnexCoreMatrix',
    meshIndex: matrixMesh,
    translation: matrixPos,
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 5. Twin Inward-Arching Articulated Robotic Calibration Booms (Right & Left)
  // -------------------------------------------------------------------------
  const armInfos = [];
  for (const [armName, glowName, side] of [
    ['CalibrationArm_Right', 'Surf_GLOW_ArmRight', 1],
    ['CalibrationArm_Left', 'Surf_GLOW_ArmLeft', -1],
  ]) {
    const pivot = [-0.64, 1.66, side * 2.18];
    const gArmIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
    const gArmGold = new PrimitiveGeom(mats.Mat_GoldBright);
    const gArmBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);
    const gArmTeal = new PrimitiveGeom(mats.Mat_FoundryTeal);

    // Shoulder turret drum
    gArmBronze.addChamferBox({
      center: [0, 0.14, 0],
      size: [0.86, 0.44, 0.86],
      topScale: [0.88, 0.88],
    });
    // Sweeping articulated robotic calibration boom arching high & inward toward [0.52, 2.46, 0]!
    gArmIvory.addTubeAlongSpine(
      [
        { pos: [0.00, 0.28, 0.00], rx: 0.28, ry: 0.24 },
        { pos: [0.36, 1.68, -side * 0.28], rx: 0.24, ry: 0.20 },
        { pos: [0.92, 2.34, -side * 0.96], rx: 0.20, ry: 0.16 },
        { pos: [1.14, 1.54, -side * 1.38], rx: 0.15, ry: 0.14 },
      ],
      4,
      true,
      true
    );
    // Golden dorsal hydraulic spine along top of each robotic calibration boom
    gArmGold.addTubeAlongSpine(
      [
        { pos: [-0.08, 0.38, side * 0.08], rx: 0.12, ry: 0.10 },
        { pos: [0.32, 1.82, -side * 0.22], rx: 0.11, ry: 0.09 },
        { pos: [0.92, 2.48, -side * 0.94], rx: 0.10, ry: 0.08 },
        { pos: [1.16, 1.68, -side * 1.36], rx: 0.08, ry: 0.07 },
      ],
      4,
      true,
      true
    );
    // Multi-pronged golden servo head + glowing teal calibration laser nib aimed at AnnexCoreMatrix!
    gArmGold.addChamferBox({
      center: [1.14, 1.48, -side * 1.42],
      size: [0.36, 0.32, 0.36],
      rotDeg: [side * 32, 0, 0],
    });
    gArmTeal.addFacetedCrystal({
      center: [1.16, 1.34, -side * 1.52],
      radii: [0.13, 0.18, 0.13],
      rotDeg: [side * 42, 0, 0],
      sectors: 6,
      stacks: 4,
    });

    const armMesh = scene.addMesh(`${armName}_Mesh`, [
      gArmIvory,
      gArmGold,
      gArmBronze,
      gArmTeal,
    ]);
    const armIdx = scene.addNode({
      name: armName,
      meshIndex: armMesh,
      translation: pivot,
      parentIndex: rootIdx,
    });

    // Surf_GLOW_Arm* shoulder beacon attached to the articulated arm
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({
      center: [0.06, 0.56, side * 0.36],
      radii: [0.14, 0.18, 0.14],
      sectors: 6,
      stacks: 4,
    });
    const gMesh = scene.addMesh(glowName, [gGlow]);
    scene.addNode({ name: glowName, meshIndex: gMesh, parentIndex: armIdx });

    armInfos.push({ nodeIndex: armIdx, side });
  }

  // -------------------------------------------------------------------------
  // 6. Seamless Looping 'idle' Animation (3.4s calibration turntable, core & dual arms)
  // -------------------------------------------------------------------------
  const aTimes = [0.0, 0.85, 1.7, 2.55, 3.4];
  const aTracks = [
    {
      nodeIndex: turntableNodeIdx,
      path: 'rotation',
      times: aTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 20, 0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -20, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: matrixNodeIdx,
      path: 'translation',
      times: aTimes,
      values: [
        matrixPos,
        [matrixPos[0], matrixPos[1] + 0.11, matrixPos[2]],
        matrixPos,
        [matrixPos[0], matrixPos[1] - 0.08, matrixPos[2]],
        matrixPos,
      ],
    },
    {
      nodeIndex: matrixNodeIdx,
      path: 'rotation',
      times: aTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(4, -28, -3),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-4, 28, 3),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
  ];

  for (const ai of armInfos) {
    aTracks.push({
      nodeIndex: ai.nodeIndex,
      path: 'rotation',
      times: aTimes,
      values: [
        [0, 0, 0, 1],
        quatFromEulerXYZ(ai.side * 3.8, -ai.side * 4.5, 0),
        [0, 0, 0, 1],
        quatFromEulerXYZ(-ai.side * 2.8, ai.side * 4.5, 0),
        [0, 0, 0, 1],
      ],
    });
  }

  scene.addAnimation('idle', aTracks);

  return scene.buildGLB('RoboticsAnnexScene');
}

// ---------------------------------------------------------------------------
// Asset 2: bastion_walker.glb
// Immortal equivalent — heavy Aurelian Concord assault walker (~3.2 x 3.2, Y=0, +X forward),
// 4 articulated broad armored legs (Hip -> Knee/Shin -> Grounded Claw Foot at exact Y=0),
// rotating upper armored Turret, and twin blue phase-disruptor emitters with
// clear 'Muzzle' (right) and 'MuzzleLeft' (left) forward anchors.
// Animations: 'idle', 'walk', 'attack', 'death'.
// ---------------------------------------------------------------------------

function buildBastionWalkerGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createConcordRoboticsMaterials(scene);

  const rootIdx = scene.addNode({ name: 'BastionWalker', translation: [0, 0, 0] });

  // -------------------------------------------------------------------------
  // 1. Armored Lower Pelvis / Chassis Hub ('Chassis' at [0, 0.96, 0])
  // -------------------------------------------------------------------------
  const chassisRestPos = [0, 0.96, 0];
  const gChasIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gChasGold = new PrimitiveGeom(mats.Mat_Gold);
  const gChasBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);
  const gChasStone = new PrimitiveGeom(mats.Mat_StoneDark);
  const gChasBlue = new PrimitiveGeom(mats.Mat_EmitterBlue);

  // Heavy octagonal lower mechanical undercarriage & ventral Aegis core
  gChasStone.addLoft(
    [
      makeCardinalAlignedRing(8, 0.68, -0.26),
      makeCardinalAlignedRing(8, 0.84, 0.04),
      makeCardinalAlignedRing(8, 0.74, 0.28),
    ],
    [[0, -0.26, 0], [0, 0.04, 0], [0, 0.28, 0]],
    true,
    true
  );
  // Forward +X lower prow glacis bumper
  gChasIvory.addChamferBox({
    center: [0.76, 0.02, 0],
    size: [0.44, 0.30, 0.72],
    rotDeg: [0, 0, -14],
    topScale: [0.84, 0.86],
  });
  gChasGold.addConcentricArcStrip({
    rInner: 0.62,
    rOuter: 0.78,
    yBot: 0.24,
    yTop: 0.34,
    thStart: 0,
    thEnd: Math.PI * 2,
    steps: 10,
    bevelIn: 0.015,
  });
  gChasBlue.addFacetedCrystal({
    center: [0.96, 0.02, 0],
    radii: [0.09, 0.09, 0.16],
    sectors: 6,
    stacks: 4,
  });

  const chassisMesh = scene.addMesh('Chassis_Mesh', [
    gChasIvory,
    gChasGold,
    gChasBronze,
    gChasStone,
    gChasBlue,
  ]);
  const chassisIdx = scene.addNode({
    name: 'Chassis',
    meshIndex: chassisMesh,
    translation: chassisRestPos,
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 2. Four Articulated Broad Armored Legs (exact foot ground contact Y = 0.0000!)
  //    In right-handed +X forward, +Y up: +Z is Right, -Z is Left!
  //    Each leg uses a clean local frame rotated by yawDeg so:
  //      +X_leg points radially outward along the splayed leg plane,
  //      +Y_leg points up,
  //      +Z_leg is the horizontal knee/hip pitch axis!
  // -------------------------------------------------------------------------
  // Hip world Y = 0.96 - 0.06 = 0.90.
  // Knee offset from Hip in leg frame = [+0.56, -0.22, 0] -> Knee world Y = 0.68.
  // Foot ground pad bottom in Knee frame = [+0.36, -0.68, 0] -> Foot world Y = 0.68 - 0.68 = 0.0000 EXACT!
  const legDefs = [
    {
      tag: 'FrontR',
      hipPos: [0.52, -0.06, 0.52],
      yawDeg: -43, // rotateVecByQuat([1,0,0], Ry(-43°)) = [cos(43°), 0, +sin(43°)] (+X, +Z)!
      hasTeamPlate: true,
    },
    {
      tag: 'FrontL',
      hipPos: [0.52, -0.06, -0.52],
      yawDeg: 43, // rotateVecByQuat([1,0,0], Ry(+43°)) = [cos(43°), 0, -sin(43°)] (+X, -Z)!
      hasTeamPlate: true,
    },
    {
      tag: 'RearR',
      hipPos: [-0.52, -0.06, 0.52],
      yawDeg: -137, // [-cos(43°), 0, +sin(43°)] (-X, +Z)!
      hasTeamPlate: true,
    },
    {
      tag: 'RearL',
      hipPos: [-0.52, -0.06, -0.52],
      yawDeg: 137, // [-cos(43°), 0, -sin(43°)] (-X, -Z)!
      hasTeamPlate: true,
    },
  ];

  const legNodes = {};

  for (const ld of legDefs) {
    const baseHipQuat = quatFromEulerXYZ(0, ld.yawDeg, 0);

    // Upper Leg / Broad Armored Femur & Thigh Shield
    const gThighIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
    const gThighGold = new PrimitiveGeom(mats.Mat_GoldBright);
    const gThighBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);

    // Bronze ball-joint servo at hip
    gThighBronze.addFacetedCrystal({
      center: [0, 0, 0],
      radii: [0.18, 0.18, 0.18],
      sectors: 8,
      stacks: 4,
    });
    // Heavy femur strut extending outward (+X_leg) and slightly down (-Y_leg) to [0.56, -0.22, 0]
    gThighBronze.addTubeAlongSpine(
      [
        { pos: [0.04, 0.00, 0], rx: 0.15, ry: 0.18 },
        { pos: [0.56, -0.22, 0], rx: 0.14, ry: 0.16 },
      ],
      6,
      true,
      true
    );
    // Broad Sculpted Ivory & Gold Upper Leg Carapace Shield (signature wide armored leg silhouette!)
    gThighIvory.addChamferBox({
      center: [0.32, 0.04, 0],
      size: [0.58, 0.24, 0.48],
      rotDeg: [0, 0, -20],
      topScale: [0.86, 0.88],
    });
    gThighGold.addChamferBox({
      center: [0.34, 0.15, 0],
      size: [0.46, 0.08, 0.36],
      rotDeg: [0, 0, -20],
      topScale: [0.88, 0.88],
    });

    const hipMesh = scene.addMesh(`Leg_${ld.tag}_Mesh`, [
      gThighIvory,
      gThighGold,
      gThighBronze,
    ]);
    const hipIdx = scene.addNode({
      name: `Leg_${ld.tag}`,
      meshIndex: hipMesh,
      translation: ld.hipPos,
      rotation: baseHipQuat,
      parentIndex: chassisIdx,
    });

    if (ld.hasTeamPlate) {
      const gLegTeam = new PrimitiveGeom(mats.Surf_TEAM);
      const legPoly = [
        [-0.18, -0.14],
        [0.18, -0.14],
        [0.14, 0.14],
        [-0.14, 0.14],
      ];
      gLegTeam.addOrientedShield(
        [0.35, 0.18, 0],
        vNorm([0.34, 0.94, 0]),
        [-0.94, 0.34, 0],
        legPoly,
        0.045,
        0.86,
        0.015
      );
      const tName = `Surf_TEAM_Leg${ld.tag}`;
      const tMesh = scene.addMesh(tName, [gLegTeam]);
      scene.addNode({ name: tName, meshIndex: tMesh, parentIndex: hipIdx });
    }

    // Lower Leg / Broad Armored Greave Shield & Grounded 3-Claw Foot Pad (Knee at [0.56, -0.22, 0])
    const gShinIvory = new PrimitiveGeom(mats.Mat_Ivory);
    const gShinIvoryHi = new PrimitiveGeom(mats.Mat_IvoryLight);
    const gShinGold = new PrimitiveGeom(mats.Mat_Gold);
    const gShinGoldHi = new PrimitiveGeom(mats.Mat_GoldBright);
    const gShinStone = new PrimitiveGeom(mats.Mat_StoneDark);

    // Knee drum actuator
    gShinGold.addChamferBox({
      center: [0, 0, 0],
      size: [0.24, 0.24, 0.36],
      topScale: [0.90, 0.92],
    });

    // Broad Armored Outer Greave Plate sweeping from [0.06, 0.08, 0] down to [0.36, -0.56, 0]!
    // Wide in Z_leg (±0.28 = 0.56 wide!) so all four legs read as BROAD ARMORED LEGS from RTS zoom!
    gShinIvoryHi.addLoft(
      [
        [
          [0.24, -0.54, -0.26],
          [0.48, -0.54, -0.22],
          [0.52, -0.54, 0.00],
          [0.48, -0.54, 0.22],
          [0.24, -0.54, 0.26],
          [0.14, -0.54, 0.00],
        ],
        [
          [0.08, -0.18, -0.30],
          [0.38, -0.18, -0.24],
          [0.44, -0.18, 0.00],
          [0.38, -0.18, 0.24],
          [0.08, -0.18, 0.30],
          [-0.02, -0.18, 0.00],
        ],
        [
          [-0.02, 0.14, -0.22],
          [0.22, 0.14, -0.18],
          [0.26, 0.14, 0.00],
          [0.22, 0.14, 0.18],
          [-0.02, 0.14, 0.22],
          [-0.08, 0.14, 0.00],
        ],
      ],
      [[0.34, -0.54, 0], [0.22, -0.18, 0], [0.10, 0.14, 0]],
      true,
      true
    );

    // Golden shin ridge crest down front of broad armored leg
    gShinGoldHi.addTubeAlongSpine(
      [
        { pos: [0.26, 0.14, 0], rx: 0.07, ry: 0.08 },
        { pos: [0.45, -0.18, 0], rx: 0.08, ry: 0.09 },
        { pos: [0.52, -0.54, 0], rx: 0.07, ry: 0.08 },
      ],
      4,
      true,
      true
    );

    // Broad Grounded Mechanical Foot Base + Stabilizer Claws (bottom at exact local Y = -0.68000 -> world Y = 0.00000!)
    gShinStone.addLoft(
      [
        makeRectChamferRing(0.28, 0.30, 0.10, -0.680, 0.36, 0),
        makeRectChamferRing(0.24, 0.26, 0.08, -0.520, 0.34, 0),
      ],
      [[0.36, -0.680, 0], [0.34, -0.520, 0]],
      true,
      true
    );
    // Twin golden front anchor talons touching Y = -0.680
    for (const cz of [-0.14, 0.14]) {
      gShinGold.addLoft(
        [
          [
            [0.54, -0.680, cz - 0.07],
            [0.72, -0.680, cz],
            [0.54, -0.680, cz + 0.07],
            [0.46, -0.680, cz],
          ],
          [
            [0.50, -0.550, cz - 0.05],
            [0.62, -0.580, cz],
            [0.50, -0.550, cz + 0.05],
            [0.44, -0.550, cz],
          ],
        ],
        [[0.56, -0.680, cz], [0.52, -0.560, cz]],
        true,
        true
      );
    }

    const shinMesh = scene.addMesh(`Knee_${ld.tag}_Mesh`, [
      gShinIvory,
      gShinIvoryHi,
      gShinGold,
      gShinGoldHi,
      gShinStone,
    ]);
    const kneeIdx = scene.addNode({
      name: `Knee_${ld.tag}`,
      meshIndex: shinMesh,
      translation: [0.56, -0.22, 0],
      parentIndex: hipIdx,
    });

    legNodes[ld.tag] = { hipIdx, kneeIdx, baseHipQuat, yawDeg: ld.yawDeg };
  }

  // -------------------------------------------------------------------------
  // 3. Rotating Upper Armored Carapace Turret ('Turret' at [0, 0.32, 0] -> world Y = 1.28)
  // -------------------------------------------------------------------------
  const turretLocalPos = [0, 0.32, 0];
  const gTurIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gTurIvoryHi = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gTurGold = new PrimitiveGeom(mats.Mat_Gold);
  const gTurGoldHi = new PrimitiveGeom(mats.Mat_GoldBright);
  const gTurBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);
  const gTurStone = new PrimitiveGeom(mats.Mat_StoneDark);
  const gTurBlue = new PrimitiveGeom(mats.Mat_EmitterBlueCore);

  // Broad Low-Slung Armored Walker Carapace Body (local Y = 0.00 .. 0.98 -> world Y = 1.28 .. 2.26)
  gTurIvory.addLoft(
    [
      makeRectChamferRing(0.86, 0.82, 0.28, 0.00, -0.06, 0),
      makeRectChamferRing(1.02, 0.98, 0.32, 0.44, -0.04, 0),
      makeRectChamferRing(0.84, 0.86, 0.28, 0.88, -0.08, 0),
      makeRectChamferRing(0.54, 0.58, 0.20, 1.06, -0.14, 0),
    ],
    [[-0.06, 0.00, 0], [-0.04, 0.44, 0], [-0.08, 0.88, 0], [-0.14, 1.06, 0]],
    true,
    true
  );

  // Armored Forward Visor Cowl & Glowing Concord Sensor Eye (+X face!)
  gTurIvoryHi.addChamferBox({
    center: [0.76, 0.64, 0],
    size: [0.56, 0.38, 0.88],
    rotDeg: [0, 0, -16],
    topScale: [0.84, 0.84],
  });
  gTurGoldHi.addChamferBox({
    center: [0.82, 0.82, 0],
    size: [0.46, 0.12, 0.78],
    rotDeg: [0, 0, -14],
    topScale: [0.88, 0.88],
  });

  // Heavy Golden Dorsal Crest & Rear Aegis Hardened-Shield Generator Arc!
  gTurGoldHi.addTubeAlongSpine(
    [
      { pos: [0.48, 1.04, 0], rx: 0.11, ry: 0.12 },
      { pos: [-0.18, 1.16, 0], rx: 0.13, ry: 0.14 },
      { pos: [-0.88, 1.02, 0], rx: 0.12, ry: 0.12 },
    ],
    4,
    true,
    true
  );
  // Iconic Curved Golden Aegis Shield-Hardener Halo Fin behind the turret crown
  gTurGold.addConcentricArcStrip({
    rInner: 0.68,
    rOuter: 0.86,
    yBot: 0.92,
    yTop: 1.04,
    thStart: Math.PI * 0.62,
    thEnd: Math.PI * 1.38,
    steps: 6,
    bevelIn: 0.015,
  });
  gTurBlue.addConcentricArcStrip({
    rInner: 0.71,
    rOuter: 0.83,
    yBot: 1.03,
    yTop: 1.09,
    thStart: Math.PI * 0.66,
    thEnd: Math.PI * 1.34,
    steps: 6,
    bevelIn: 0.015,
  });

  // Lateral Weapon Trunnion Yokes supporting the Twin Blue Emitters at Z = ±0.98
  for (const side of [-1, 1]) {
    gTurBronze.addChamferBox({
      center: [-0.04, 0.48, side * 0.94],
      size: [0.56, 0.36, 0.34],
      topScale: [0.88, 0.90],
    });
    // Raised armored shoulder pauldron arch over each weapon mount
    gTurIvoryHi.addChamferBox({
      center: [-0.10, 0.82, side * 0.88],
      size: [0.84, 0.24, 0.46],
      rotDeg: [side * -18, 0, 0],
      topScale: [0.88, 0.88],
    });
  }

  const turretMesh = scene.addMesh('Turret_Mesh', [
    gTurIvory,
    gTurIvoryHi,
    gTurGold,
    gTurGoldHi,
    gTurBronze,
    gTurStone,
    gTurBlue,
  ]);
  const turretIdx = scene.addNode({
    name: 'Turret',
    meshIndex: turretMesh,
    translation: turretLocalPos,
    parentIndex: chassisIdx,
  });

  // Turret Surf_TEAM_* Armor Panels (ShoulderR, ShoulderL, FrontHood — flush above sloped armor!)
  for (const [tName, side] of [
    ['Surf_TEAM_ShoulderR', 1],
    ['Surf_TEAM_ShoulderL', -1],
  ]) {
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    const poly = [
      [-0.36, -0.18],
      [0.36, -0.18],
      [0.28, 0.18],
      [-0.28, 0.18],
    ];
    const out = vNorm([0.04, 0.86, side * 0.51]);
    const up = [-1, 0.04, 0];
    gTeam.addOrientedShield([-0.11, 0.99, side * 0.72], out, up, poly, 0.055, 0.88, 0.015);
    const tMesh = scene.addMesh(tName, [gTeam]);
    scene.addNode({ name: tName, meshIndex: tMesh, parentIndex: turretIdx });
  }
  {
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    const poly = [
      [-0.28, -0.18],
      [0.28, -0.18],
      [0.22, 0.18],
      [-0.22, 0.18],
    ];
    gTeam.addOrientedShield(
      [0.58, 0.98, 0],
      vNorm([0.45, 0.89, 0]),
      [-0.89, 0.45, 0],
      poly,
      0.052,
      0.88,
      0.015
    );
    const tMesh = scene.addMesh('Surf_TEAM_FrontHood', [gTeam]);
    scene.addNode({ name: 'Surf_TEAM_FrontHood', meshIndex: tMesh, parentIndex: turretIdx });
  }

  // Turret Surf_GLOW_* Visor & Rear Reactor Core
  {
    const gVisor = new PrimitiveGeom(mats.Surf_GLOW);
    gVisor.addChamferBox({
      center: [1.02, 0.62, 0],
      size: [0.14, 0.14, 0.62],
      topScale: [0.90, 0.92],
    });
    const vMesh = scene.addMesh('Surf_GLOW_Visor', [gVisor]);
    scene.addNode({ name: 'Surf_GLOW_Visor', meshIndex: vMesh, parentIndex: turretIdx });

    const gRearGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gRearGlow.addFacetedCrystal({
      center: [-0.96, 0.56, 0],
      radii: [0.14, 0.20, 0.24],
      sectors: 6,
      stacks: 4,
    });
    const rMesh = scene.addMesh('Surf_GLOW_RearCore', [gRearGlow]);
    scene.addNode({ name: 'Surf_GLOW_RearCore', meshIndex: rMesh, parentIndex: turretIdx });
  }

  // -------------------------------------------------------------------------
  // 4. Twin Blue Phase-Disruptor Emitters + 'Muzzle' & 'MuzzleLeft' Anchors!
  //    Right Emitter (+Z = +1.08) -> 'Muzzle'
  //    Left Emitter  (-Z = -1.08) -> 'MuzzleLeft'
  // -------------------------------------------------------------------------
  const emitterSpecs = [
    { name: 'Emitter_Right', muzzleName: 'Muzzle', side: 1 },
    { name: 'Emitter_Left', muzzleName: 'MuzzleLeft', side: -1 },
  ];
  const emitterIndices = {};

  for (const es of emitterSpecs) {
    const emitRest = [0.08, 0.48, es.side * 1.12];
    const gEmIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
    const gEmGold = new PrimitiveGeom(mats.Mat_GoldBright);
    const gEmBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);
    const gEmBlue = new PrimitiveGeom(mats.Mat_EmitterBlue);
    const gEmBlueCore = new PrimitiveGeom(mats.Mat_EmitterBlueCore);
    const gEmBlueLens = new PrimitiveGeom(mats.Mat_EmitterBlueLens);

    // Armored rear breech pod
    gEmBronze.addChamferBox({
      center: [-0.34, 0, 0],
      size: [0.58, 0.36, 0.36],
      topScale: [0.88, 0.88],
    });

    // Upper & Lower Sculpted Ivory + Gold Twin Focusing Rails extending forward to +1.28!
    for (const sy of [-1, 1]) {
      gEmIvory.addTubeAlongSpine(
        [
          { pos: [-0.14, sy * 0.16, 0], rx: 0.10, ry: 0.13 },
          { pos: [0.64, sy * 0.14, 0], rx: 0.09, ry: 0.12 },
          { pos: [1.26, sy * 0.12, 0], rx: 0.065, ry: 0.09 },
        ],
        4,
        true,
        true
      );
      gEmGold.addTubeAlongSpine(
        [
          { pos: [-0.10, sy * 0.22, 0], rx: 0.05, ry: 0.06 },
          { pos: [1.30, sy * 0.16, 0], rx: 0.04, ry: 0.05 },
        ],
        4,
        true,
        true
      );
    }

    // Golden Muzzle Collar Bezel at X = +1.22 .. +1.36
    const mRings = [];
    const mCenters = [];
    for (let s = 0; s < 8; s++) {
      const th = (2 * Math.PI * s) / 8;
      const cy = Math.cos(th), sz = Math.sin(th);
      mRings.push([
        [1.20, cy * 0.20, sz * 0.20],
        [1.36, cy * 0.18, sz * 0.18],
        [1.36, cy * 0.11, sz * 0.11],
        [1.20, cy * 0.12, sz * 0.12],
      ]);
      mCenters.push([1.28, cy * 0.15, sz * 0.15]);
    }
    gEmGold.addCyclicRingLoft(mRings, mCenters);

    // Prominent Vivid Blue Emitter Energy Conduit & Glowing Blue Muzzle Core!
    gEmBlue.addTubeAlongSpine(
      [
        { pos: [-0.16, 0, 0], rx: 0.13, ry: 0.13 },
        { pos: [0.68, 0, 0], rx: 0.12, ry: 0.12 },
        { pos: [1.34, 0, 0], rx: 0.10, ry: 0.10 },
      ],
      8,
      true,
      true
    );
    gEmBlueCore.addFacetedCrystal({
      center: [1.35, 0, 0],
      radii: [0.09, 0.12, 0.12],
      sectors: 8,
      stacks: 4,
    });
    // Exposed glowing blue side capacitor coil along outer flank of each emitter!
    gEmBlueCore.addChamferBox({
      center: [0.22, 0, es.side * 0.14],
      size: [0.68, 0.12, 0.08],
      topScale: [0.92, 0.92],
    });
    gEmBlueLens.addTubeAlongSpine(
      [
        { pos: [0.02, 0, 0], rx: 0.17, ry: 0.17 },
        { pos: [1.18, 0, 0], rx: 0.15, ry: 0.15 },
      ],
      8,
      false,
      false
    );

    const emMesh = scene.addMesh(`${es.name}_Mesh`, [
      gEmIvory,
      gEmGold,
      gEmBronze,
      gEmBlue,
      gEmBlueCore,
      gEmBlueLens,
    ]);
    const emIdx = scene.addNode({
      name: es.name,
      meshIndex: emMesh,
      translation: emitRest,
      parentIndex: turretIdx,
    });

    // Clear Muzzle / MuzzleLeft Anchor right at forward +X tip of each blue emitter!
    scene.addNode({
      name: es.muzzleName,
      translation: [1.42, 0.0, 0.0],
      parentIndex: emIdx,
    });

    emitterIndices[es.name] = { nodeIndex: emIdx, restPos: emitRest };
  }

  // Helper to compose a leg hip rotation from (strideYawDeg, liftDeg) relative to baseHipQuat
  const hipPose = (tag, dYawDeg, liftDeg) => {
    const ln = legNodes[tag];
    // World-Y stride swing * Base splay * Local-Z vertical lift (+liftDeg raises knee!)
    const qYaw = quatFromEulerXYZ(0, ln.yawDeg + dYawDeg, 0);
    const qLift = quatFromEulerXYZ(0, 0, liftDeg);
    return quatMul(qYaw, qLift);
  };

  // -------------------------------------------------------------------------
  // 5A. Clip 1: 'idle' (2.4s seamless heavy armored breathing & vigilant turret scan)
  // -------------------------------------------------------------------------
  const idleT = [0.0, 0.6, 1.2, 1.8, 2.4];
  scene.addAnimation('idle', [
    {
      nodeIndex: chassisIdx,
      path: 'translation',
      times: idleT,
      values: [
        [0, 0.96, 0],
        [0, 0.99, 0],
        [0, 0.96, 0],
        [0, 0.94, 0],
        [0, 0.96, 0],
      ],
    },
    {
      nodeIndex: turretIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 4.5, -1.2),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -4.5, 1.2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    ...['FrontR', 'FrontL', 'RearR', 'RearL'].map((tag) => ({
      nodeIndex: legNodes[tag].hipIdx,
      path: 'rotation',
      times: idleT,
      values: [
        hipPose(tag, 0, 0),
        hipPose(tag, 0, -2.2),
        hipPose(tag, 0, 0),
        hipPose(tag, 0, 1.5),
        hipPose(tag, 0, 0),
      ],
    })),
    ...['FrontR', 'FrontL', 'RearR', 'RearL'].map((tag) => ({
      nodeIndex: legNodes[tag].kneeIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 2.2),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -1.5),
        quatFromEulerXYZ(0, 0, 0),
      ],
    })),
  ]);

  // -------------------------------------------------------------------------
  // 5B. Clip 2: 'walk' (1.2s seamless diagonal quadruped gait: FrontR+RearL vs FrontL+RearR)
  //     Note: In +X forward, swinging a Right leg (+Z) forward (+X) decreases Z-to-X angle -> +dYaw?
  //     Let's verify: FrontR is at yaw=-43° ([+0.73, 0, +0.68]). Changing yaw toward 0° (+16° -> -27°)
  //     moves it FORWARD toward +X! RearR is at yaw=-137° ([-0.73, 0, +0.68]); +16° -> -121° ALSO moves it FORWARD (+X)!
  //     Meanwhile for Left legs (FrontL +43°, RearL +137°), -16° (+27°, +121°) moves them FORWARD (+X)!
  // -------------------------------------------------------------------------
  const walkT = [0.0, 0.3, 0.6, 0.9, 1.2];
  const fwdSwing = { FrontR: 15, RearR: 15, FrontL: -15, RearL: -15 };
  scene.addAnimation('walk', [
    {
      nodeIndex: chassisIdx,
      path: 'translation',
      times: walkT,
      values: [
        [0, 0.96, 0],
        [0, 1.03, -0.03],
        [0, 0.96, 0],
        [0, 1.03, 0.03],
        [0, 0.96, 0],
      ],
    },
    {
      nodeIndex: chassisIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(2.5, -2.0, -1.8),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-2.5, 2.0, -1.8),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: turretIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-1.5, 2.5, 1.0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(1.5, -2.5, 1.0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    // Diagonal Pair A: FrontR & RearL lift & swing forward at t=0.3, plant & push back at t=0.9
    ...['FrontR', 'RearL'].map((tag) => ({
      nodeIndex: legNodes[tag].hipIdx,
      path: 'rotation',
      times: walkT,
      values: [
        hipPose(tag, 0, 0),
        hipPose(tag, fwdSwing[tag], 20),
        hipPose(tag, fwdSwing[tag] * 0.4, 0),
        hipPose(tag, -fwdSwing[tag], -4),
        hipPose(tag, 0, 0),
      ],
    })),
    ...['FrontR', 'RearL'].map((tag) => ({
      nodeIndex: legNodes[tag].kneeIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -28),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 8),
        quatFromEulerXYZ(0, 0, 0),
      ],
    })),
    // Diagonal Pair B: FrontL & RearR push back at t=0.3, lift & swing forward at t=0.9
    ...['FrontL', 'RearR'].map((tag) => ({
      nodeIndex: legNodes[tag].hipIdx,
      path: 'rotation',
      times: walkT,
      values: [
        hipPose(tag, 0, 0),
        hipPose(tag, -fwdSwing[tag], -4),
        hipPose(tag, -fwdSwing[tag] * 0.4, 0),
        hipPose(tag, fwdSwing[tag], 20),
        hipPose(tag, 0, 0),
      ],
    })),
    ...['FrontL', 'RearR'].map((tag) => ({
      nodeIndex: legNodes[tag].kneeIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 8),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -28),
        quatFromEulerXYZ(0, 0, 0),
      ],
    })),
  ]);

  // -------------------------------------------------------------------------
  // 5C. Clip 3: 'attack' (0.96s punchy twin blue emitter salvo returning cleanly to rest!)
  // -------------------------------------------------------------------------
  const atkT = [0.0, 0.14, 0.34, 0.50, 0.74, 0.96];
  const rRest = emitterIndices.Emitter_Right.restPos;
  const lRest = emitterIndices.Emitter_Left.restPos;
  scene.addAnimation('attack', [
    {
      nodeIndex: emitterIndices.Emitter_Right.nodeIndex,
      path: 'translation',
      times: atkT,
      values: [
        rRest,
        [rRest[0] - 0.30, rRest[1] + 0.02, rRest[2]],
        [rRest[0] - 0.08, rRest[1], rRest[2]],
        [rRest[0] - 0.02, rRest[1], rRest[2]],
        rRest,
        rRest,
      ],
    },
    {
      nodeIndex: emitterIndices.Emitter_Left.nodeIndex,
      path: 'translation',
      times: atkT,
      values: [
        lRest,
        [lRest[0] + 0.02, lRest[1], lRest[2]],
        [lRest[0] + 0.02, lRest[1], lRest[2]],
        [lRest[0] - 0.30, lRest[1] + 0.02, lRest[2]],
        [lRest[0] - 0.08, lRest[1], lRest[2]],
        lRest,
      ],
    },
    {
      nodeIndex: turretIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -3.5, 4.5),
        quatFromEulerXYZ(0, -1.0, 1.5),
        quatFromEulerXYZ(0, 3.5, 5.0),
        quatFromEulerXYZ(0, 0.8, 1.2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: chassisIdx,
      path: 'translation',
      times: atkT,
      values: [
        [0, 0.96, 0],
        [-0.08, 0.93, 0],
        [-0.04, 0.95, 0],
        [-0.10, 0.92, 0],
        [-0.03, 0.95, 0],
        [0, 0.96, 0],
      ],
    },
  ]);

  // -------------------------------------------------------------------------
  // 5D. Clip 4: 'death' (1.4s mechanical overload shudder & 4-legged splay collapse onto Y >= 0)
  // -------------------------------------------------------------------------
  const dthT = [0.0, 0.22, 0.55, 0.98, 1.40];
  scene.addAnimation('death', [
    {
      nodeIndex: chassisIdx,
      path: 'translation',
      times: dthT,
      values: [
        [0, 0.96, 0],
        [-0.05, 1.02, 0.03],
        [0.03, 0.76, 0.03],
        [0.05, 0.62, 0.03],
        [0.05, 0.62, 0.03],
      ],
    },
    {
      nodeIndex: chassisIdx,
      path: 'rotation',
      times: dthT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-4, 5, 4),
        quatFromEulerXYZ(2, -5, -3),
        quatFromEulerXYZ(3.5, -8, -4),
        quatFromEulerXYZ(3.5, -8, -4),
      ],
    },
    {
      nodeIndex: turretIdx,
      path: 'rotation',
      times: dthT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(5, -10, 7),
        quatFromEulerXYZ(6, 14, -8),
        quatFromEulerXYZ(7, 20, -11),
        quatFromEulerXYZ(7, 20, -11),
      ],
    },
    // Splay all 4 hips upward (+26 deg lift) while folding knees outward (+28 deg) so feet & belly rest cleanly on Y >= 0!
    ...['FrontR', 'FrontL', 'RearR', 'RearL'].map((tag, idx) => ({
      nodeIndex: legNodes[tag].hipIdx,
      path: 'rotation',
      times: dthT,
      values: [
        hipPose(tag, 0, 0),
        hipPose(tag, idx % 2 === 0 ? 4 : -4, -3),
        hipPose(tag, idx % 2 === 0 ? 8 : -8, 16),
        hipPose(tag, idx % 2 === 0 ? 11 : -11, 26),
        hipPose(tag, idx % 2 === 0 ? 11 : -11, 26),
      ],
    })),
    ...['FrontR', 'FrontL', 'RearR', 'RearL'].map((tag) => ({
      nodeIndex: legNodes[tag].kneeIdx,
      path: 'rotation',
      times: dthT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 6),
        quatFromEulerXYZ(0, 0, 16),
        quatFromEulerXYZ(0, 0, 28),
        quatFromEulerXYZ(0, 0, 28),
      ],
    })),
  ]);

  return scene.buildGLB('BastionWalkerScene');
}

// ---------------------------------------------------------------------------
// Asset 3: rift_engine.glb
// Disruptor equivalent — round low hovering mechanical shell (~2.92 diameter, Y=0 ground contact,
// +X forward) with an exposed contained blazing energy core and 'NovaOrigin' anchor.
// Animations: 'idle', 'hover', 'cast', 'death'.
// ---------------------------------------------------------------------------

function buildRiftEngineGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createConcordRoboticsMaterials(scene);

  const rootIdx = scene.addNode({ name: 'RiftEngine', translation: [0, 0, 0] });

  // -------------------------------------------------------------------------
  // 1. Sleek Ground-Contact Gravitic Field Projection Reticle at exact Y = 0.0000!
  //    Guarantees exact min.y == 0.0000 while keeping the round mechanical shell
  //    visibly levitating in mid-air above an unmistakable open hover gap!
  // -------------------------------------------------------------------------
  const gGroundField = new PrimitiveGeom(mats.Mat_RiftCorona);
  const gGroundGold = new PrimitiveGeom(mats.Mat_Gold);
  for (let k = 0; k < 4; k++) {
    const th = (Math.PI * 0.5) * k + Math.PI * 0.25;
    gGroundField.addConcentricArcStrip({
      rInner: 0.84,
      rOuter: 0.92,
      yBot: 0.000,
      yTop: 0.016,
      thStart: th - 0.44,
      thEnd: th + 0.44,
      steps: 4,
      bevelIn: 0.005,
    });
    gGroundGold.addConcentricArcStrip({
      rInner: 0.91,
      rOuter: 0.98,
      yBot: 0.000,
      yTop: 0.022,
      thStart: th - 0.12,
      thEnd: th + 0.12,
      steps: 2,
      bevelIn: 0.005,
    });
  }
  const groundRingMesh = scene.addMesh('GraviticGroundRing_Mesh', [gGroundGold, gGroundField]);
  const groundRingIdx = scene.addNode({
    name: 'GraviticGroundRing',
    meshIndex: groundRingMesh,
    translation: [0, 0, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 2. Round Low Hovering Mechanical Shell Assembly ('HoverHull' at [0, 1.06, 0])
  // -------------------------------------------------------------------------
  const hoverRestPos = [0, 1.06, 0];
  const hoverIdx = scene.addNode({
    name: 'HoverHull',
    translation: hoverRestPos,
    parentIndex: rootIdx,
  });

  // Inner Annular Bronze & Gold Containment Chassis Ring + Forward +X Rift Projector Forks!
  const gFrameBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);
  const gFrameGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gFrameIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gFrameSolar = new PrimitiveGeom(mats.Mat_RiftCoreSolar);

  // Low annular containment collar surrounding the open central core well (r = 0.78 .. 1.04)
  // Leaves a wide open gap at +X (-24° .. +24°) so the exposed core shines forward too!
  gFrameBronze.addConcentricArcStrip({
    rInner: 0.78,
    rOuter: 1.04,
    yBot: -0.22,
    yTop: 0.22,
    thStart: 0.42,
    thEnd: Math.PI * 2 - 0.42,
    steps: 14,
    bevelIn: 0.03,
  });

  // +X Forward Split Rift-Projector Tuning Prongs (readable +X nose without breaking round outline!)
  for (const side of [-1, 1]) {
    gFrameIvory.addTubeAlongSpine(
      [
        { pos: [0.76, 0.00, side * 0.48], rx: 0.16, ry: 0.14 },
        { pos: [1.38, 0.00, side * 0.30], rx: 0.11, ry: 0.10 },
      ],
      4,
      true,
      true
    );
    gFrameGold.addTubeAlongSpine(
      [
        { pos: [0.80, 0.08, side * 0.52], rx: 0.07, ry: 0.06 },
        { pos: [1.44, 0.04, side * 0.30], rx: 0.05, ry: 0.05 },
      ],
      4,
      true,
      true
    );
    gFrameSolar.addFacetedCrystal({
      center: [1.44, 0.00, side * 0.26],
      radii: [0.08, 0.09, 0.08],
      sectors: 6,
      stacks: 4,
    });
  }

  // -X Rear Stabilizer Tail Vane & Vent
  gFrameIvory.addChamferBox({
    center: [-1.18, 0.06, 0],
    size: [0.52, 0.28, 0.64],
    topScale: [0.84, 0.84],
  });
  gFrameGold.addChamferBox({
    center: [-1.24, 0.22, 0],
    size: [0.42, 0.08, 0.50],
    topScale: [0.88, 0.88],
  });

  const frameMesh = scene.addMesh('CentralContainmentFrame_Mesh', [
    gFrameBronze,
    gFrameGold,
    gFrameIvory,
    gFrameSolar,
  ]);
  scene.addNode({
    name: 'CentralContainmentFrame',
    meshIndex: frameMesh,
    parentIndex: hoverIdx,
  });

  // Surf_GLOW_* forward & rear projector accents on HoverHull
  for (const [gName, gPos, gRad] of [
    ['Surf_GLOW_FrontR', [1.22, 0.16, 0.42], [0.11, 0.12, 0.11]],
    ['Surf_GLOW_FrontL', [1.22, 0.16, -0.42], [0.11, 0.12, 0.11]],
    ['Surf_GLOW_RearTail', [-1.42, 0.08, 0.00], [0.10, 0.14, 0.18]],
  ]) {
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({ center: gPos, radii: gRad, sectors: 6, stacks: 4 });
    const gMesh = scene.addMesh(gName, [gGlow]);
    scene.addNode({ name: gName, meshIndex: gMesh, parentIndex: hoverIdx });
  }

  // -------------------------------------------------------------------------
  // 3. 4 Curved Round Mechanical Shell Segments ('Shell_FrontR/L', 'Shell_RearR/L')
  //    Forms an unmistakable ROUND low saucer-ring shell (r = 1.46) with a wide
  //    central oculus exposing the blazing contained energy core!
  // -------------------------------------------------------------------------
  const shellSpecs = [
    { name: 'Shell_FrontR', teamName: 'Surf_TEAM_ShellFrontR', centerDeg: 46, spanDeg: 35 },
    { name: 'Shell_FrontL', teamName: 'Surf_TEAM_ShellFrontL', centerDeg: -46, spanDeg: 35 },
    { name: 'Shell_RearR', teamName: 'Surf_TEAM_ShellRearR', centerDeg: 132, spanDeg: 37 },
    { name: 'Shell_RearL', teamName: 'Surf_TEAM_ShellRearL', centerDeg: -132, spanDeg: 37 },
  ];

  const shellInfos = [];

  for (const ss of shellSpecs) {
    const cRad = (ss.centerDeg * Math.PI) / 180;
    const ca = Math.cos(cRad), sa = Math.sin(cRad);
    const pivot = [ca * 0.98, 0.0, sa * 0.98];

    const gShIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
    const gShGold = new PrimitiveGeom(mats.Mat_GoldBright);
    const gShDark = new PrimitiveGeom(mats.Mat_StoneDark);

    const steps = 6;
    const th0 = ((ss.centerDeg - ss.spanDeg) * Math.PI) / 180;
    const th1 = ((ss.centerDeg + ss.spanDeg) * Math.PI) / 180;

    // Curved saucer-bevel cross-section lofted along circular arc (r = 0.80 .. 1.46, y = -0.36 .. +0.42)!
    const arcRings = [];
    const arcCenters = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const th = th0 + (th1 - th0) * u;
      const c = Math.cos(th), s = Math.sin(th);
      const pt = (r, y) => [c * r - pivot[0], y - pivot[1], s * r - pivot[2]];
      arcRings.push([
        pt(0.82, 0.38),
        pt(1.16, 0.42),
        pt(1.46, 0.12),
        pt(1.44, -0.14),
        pt(1.14, -0.36),
        pt(0.82, -0.28),
      ]);
      arcCenters.push(pt(1.14, 0.03));
    }
    gShIvory.addLoft(arcRings, arcCenters, true, true);

    // Gleaming Gold Inner Oculus Rim & Outer Equatorial Trim Band on each curved shell arc!
    const rimInRings = [];
    const rimInCenters = [];
    const rimOutRings = [];
    const rimOutCenters = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const th = th0 + (th1 - th0) * u;
      const c = Math.cos(th), s = Math.sin(th);
      const pt = (r, y) => [c * r - pivot[0], y - pivot[1], s * r - pivot[2]];
      rimInRings.push([
        pt(0.76, 0.34),
        pt(0.88, 0.43),
        pt(0.88, 0.32),
        pt(0.76, 0.24),
      ]);
      rimInCenters.push(pt(0.82, 0.33));

      rimOutRings.push([
        pt(1.42, 0.16),
        pt(1.49, 0.02),
        pt(1.47, -0.16),
        pt(1.40, -0.02),
      ]);
      rimOutCenters.push(pt(1.44, 0.00));
    }
    gShGold.addLoft(rimInRings, rimInCenters, true, true);
    gShGold.addLoft(rimOutRings, rimOutCenters, true, true);

    // Dark-slate ventral hover-thruster louver under each shell quadrant
    gShDark.addChamferBox({
      center: [ca * 1.18 - pivot[0], -0.34, sa * 1.18 - pivot[2]],
      size: [0.34, 0.10, 0.56],
      rotDeg: [0, -ss.centerDeg, 0],
    });

    const shMesh = scene.addMesh(`${ss.name}_Mesh`, [gShIvory, gShGold, gShDark]);
    const shIdx = scene.addNode({
      name: ss.name,
      meshIndex: shMesh,
      translation: pivot,
      parentIndex: hoverIdx,
    });

    // Curved-slope Surf_TEAM_Shell* plate on upper dorsal face of each round shell segment!
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    const sPoly = [
      [-0.36, -0.18],
      [0.36, -0.18],
      [0.28, 0.18],
      [-0.28, 0.18],
    ];
    const tOrigin = [ca * 1.16 - pivot[0], 0.34, sa * 1.16 - pivot[2]];
    const tOut = vNorm([ca * 0.48, 0.88, sa * 0.48]);
    const tUp = [-ca * 0.88, 0.48, -sa * 0.88];
    gTeam.addOrientedShield(tOrigin, tOut, tUp, sPoly, 0.055, 0.88, 0.02);
    const tMesh = scene.addMesh(ss.teamName, [gTeam]);
    scene.addNode({ name: ss.teamName, meshIndex: tMesh, parentIndex: shIdx });

    // Tangential flare axis (-sin, 0, cos): negative angle flares top outward away from core!
    shellInfos.push({ nodeIndex: shIdx, axis: [-sa, 0, ca] });
  }

  // -------------------------------------------------------------------------
  // 4. Exposed Contained Energy Core, Dual Gyro Containment Rings & 'NovaOrigin'!
  // -------------------------------------------------------------------------
  const coreLocalPos = [0, 0.08, 0]; // World [0, 1.14, 0] — wide open inside the central oculus!

  // Outer Golden Gyroscopic Containment Ring ('GyroRingOuter')
  const gGyroOut = new PrimitiveGeom(mats.Mat_GoldBright);
  gGyroOut.addConcentricArcStrip({
    rInner: 0.62,
    rOuter: 0.72,
    yBot: -0.04,
    yTop: 0.04,
    thStart: 0,
    thEnd: Math.PI * 2,
    steps: 14,
    bevelIn: 0.01,
  });
  const gyroOutMesh = scene.addMesh('GyroRingOuter_Mesh', [gGyroOut]);
  const gyroOutIdx = scene.addNode({
    name: 'GyroRingOuter',
    meshIndex: gyroOutMesh,
    translation: coreLocalPos,
    rotation: quatFromEulerXYZ(22, 0, -18),
    parentIndex: hoverIdx,
  });

  // Inner Orthogonal Containment Ring ('GyroRingInner')
  const gGyroIn = new PrimitiveGeom(mats.Mat_BronzeCrucible);
  gGyroIn.addConcentricArcStrip({
    rInner: 0.50,
    rOuter: 0.58,
    yBot: -0.035,
    yTop: 0.035,
    thStart: 0,
    thEnd: Math.PI * 2,
    steps: 12,
    bevelIn: 0.01,
  });
  const gyroInMesh = scene.addMesh('GyroRingInner_Mesh', [gGyroIn]);
  const gyroInIdx = scene.addNode({
    name: 'GyroRingInner',
    meshIndex: gyroInMesh,
    translation: coreLocalPos,
    rotation: quatFromEulerXYZ(-58, 24, 0),
    parentIndex: hoverIdx,
  });

  // Blazing Exposed Contained Rift Energy Core ('ContainedEnergyCore')
  const gCoreHot = new PrimitiveGeom(mats.Mat_RiftCoreHot);
  const gCoreSolar = new PrimitiveGeom(mats.Mat_RiftCoreSolar);
  const gCoreCorona = new PrimitiveGeom(mats.Mat_RiftCorona);

  gCoreHot.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [0.36, 0.36, 0.36],
    sectors: 10,
    stacks: 5,
  });
  // 4 Golden/Solar Magnetic Polar Caps clamping top/bottom/sides of the volatile sphere
  for (const rot of [
    [0, 0, 0],
    [90, 0, 0],
  ]) {
    gCoreSolar.addFacetedCrystal({
      center: [0, 0, 0],
      radii: [0.42, 0.22, 0.42],
      rotDeg: rot,
      sectors: 8,
      stacks: 4,
    });
  }
  gCoreCorona.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [0.47, 0.47, 0.47],
    sectors: 10,
    stacks: 5,
    phaseRad: Math.PI / 10,
  });

  const coreMesh = scene.addMesh('ContainedEnergyCore_Mesh', [
    gCoreHot,
    gCoreSolar,
    gCoreCorona,
  ]);
  const coreIdx = scene.addNode({
    name: 'ContainedEnergyCore',
    meshIndex: coreMesh,
    translation: coreLocalPos,
    parentIndex: hoverIdx,
  });

  // Explicit 'NovaOrigin' Anchor right at the center of the Exposed Contained Energy Core!
  scene.addNode({
    name: 'NovaOrigin',
    translation: coreLocalPos,
    parentIndex: hoverIdx,
  });

  // -------------------------------------------------------------------------
  // 5A. Clip 1: 'idle' (2.6s seamless levitation, gyro containment spin & core pulse)
  // -------------------------------------------------------------------------
  const rIdleT = [0.0, 0.65, 1.3, 1.95, 2.6];
  scene.addAnimation('idle', [
    {
      nodeIndex: hoverIdx,
      path: 'translation',
      times: rIdleT,
      values: [
        [0, 1.06, 0],
        [0, 1.14, 0],
        [0, 1.06, 0],
        [0, 0.99, 0],
        [0, 1.06, 0],
      ],
    },
    {
      nodeIndex: gyroOutIdx,
      path: 'rotation',
      times: rIdleT,
      values: [
        quatFromEulerXYZ(22, 0, -18),
        quatFromEulerXYZ(22, 42, -18),
        quatFromEulerXYZ(22, 0, 18),
        quatFromEulerXYZ(22, -42, -18),
        quatFromEulerXYZ(22, 0, -18),
      ],
    },
    {
      nodeIndex: gyroInIdx,
      path: 'rotation',
      times: rIdleT,
      values: [
        quatFromEulerXYZ(-58, 24, 0),
        quatFromEulerXYZ(-32, -38, 20),
        quatFromEulerXYZ(-58, 24, 0),
        quatFromEulerXYZ(-76, 68, -20),
        quatFromEulerXYZ(-58, 24, 0),
      ],
    },
    {
      nodeIndex: coreIdx,
      path: 'scale',
      times: rIdleT,
      values: [
        [1.0, 1.0, 1.0],
        [1.08, 1.08, 1.08],
        [1.0, 1.0, 1.0],
        [0.94, 0.94, 0.94],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: groundRingIdx,
      path: 'scale',
      times: rIdleT,
      values: [
        [1.0, 1.0, 1.0],
        [0.93, 1.0, 0.93],
        [1.0, 1.0, 1.0],
        [1.06, 1.0, 1.06],
        [1.0, 1.0, 1.0],
      ],
    },
  ]);

  // -------------------------------------------------------------------------
  // 5B. Clip 2: 'hover' (1.6s seamless forward-gliding hover movement loop)
  // -------------------------------------------------------------------------
  const rHoverT = [0.0, 0.4, 0.8, 1.2, 1.6];
  scene.addAnimation('hover', [
    {
      nodeIndex: hoverIdx,
      path: 'translation',
      times: rHoverT,
      values: [
        [0.04, 1.08, 0],
        [0.08, 1.15, 0.02],
        [0.04, 1.08, 0],
        [0.06, 1.03, -0.02],
        [0.04, 1.08, 0],
      ],
    },
    {
      nodeIndex: hoverIdx,
      path: 'rotation',
      times: rHoverT,
      values: [
        quatFromEulerXYZ(0, 0, -6.5),
        quatFromEulerXYZ(2.2, 0, -7.8),
        quatFromEulerXYZ(0, 0, -6.5),
        quatFromEulerXYZ(-2.2, 0, -5.5),
        quatFromEulerXYZ(0, 0, -6.5),
      ],
    },
    {
      nodeIndex: gyroOutIdx,
      path: 'rotation',
      times: rHoverT,
      values: [
        quatFromEulerXYZ(22, 0, -18),
        quatFromEulerXYZ(35, 72, -10),
        quatFromEulerXYZ(22, 0, 18),
        quatFromEulerXYZ(10, -72, -10),
        quatFromEulerXYZ(22, 0, -18),
      ],
    },
    {
      nodeIndex: coreIdx,
      path: 'scale',
      times: rHoverT,
      values: [
        [1.04, 1.04, 1.04],
        [1.12, 1.12, 1.12],
        [1.04, 1.04, 1.04],
        [0.98, 0.98, 0.98],
        [1.04, 1.04, 1.04],
      ],
    },
  ]);

  // -------------------------------------------------------------------------
  // 5C. Clip 3: 'cast' (1.5s Rift Nova discharge: 4 shell segments flare open, core surges!)
  // -------------------------------------------------------------------------
  const rCastT = [0.0, 0.35, 0.68, 1.05, 1.5];
  scene.addAnimation('cast', [
    {
      nodeIndex: hoverIdx,
      path: 'translation',
      times: rCastT,
      values: [
        [0, 1.06, 0],
        [0, 1.24, 0],
        [-0.08, 1.30, 0],
        [0, 1.12, 0],
        [0, 1.06, 0],
      ],
    },
    {
      nodeIndex: coreIdx,
      path: 'scale',
      times: rCastT,
      values: [
        [1.0, 1.0, 1.0],
        [1.24, 1.24, 1.24],
        [1.42, 1.42, 1.42],
        [0.86, 0.86, 0.86],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: gyroOutIdx,
      path: 'rotation',
      times: rCastT,
      values: [
        quatFromEulerXYZ(22, 0, -18),
        quatFromEulerXYZ(0, 85, 0),
        quatFromEulerXYZ(-22, 170, 18),
        quatFromEulerXYZ(12, 45, -10),
        quatFromEulerXYZ(22, 0, -18),
      ],
    },
    ...shellInfos.map((si) => ({
      nodeIndex: si.nodeIndex,
      path: 'rotation',
      times: rCastT,
      values: [
        [0, 0, 0, 1],
        quatFromAxisAngle(si.axis, (-15 * Math.PI) / 180),
        quatFromAxisAngle(si.axis, (-22 * Math.PI) / 180),
        quatFromAxisAngle(si.axis, (-6 * Math.PI) / 180),
        [0, 0, 0, 1],
      ],
    })),
  ]);

  // -------------------------------------------------------------------------
  // 5D. Clip 4: 'death' (1.4s core containment collapse & shell crash onto Y >= 0)
  // -------------------------------------------------------------------------
  const rDeathT = [0.0, 0.24, 0.62, 1.05, 1.4];
  scene.addAnimation('death', [
    {
      nodeIndex: hoverIdx,
      path: 'translation',
      times: rDeathT,
      values: [
        [0, 1.06, 0],
        [0.04, 1.16, -0.03],
        [-0.03, 0.84, 0.03],
        [-0.04, 0.72, 0.03],
        [-0.04, 0.72, 0.03],
      ],
    },
    {
      nodeIndex: hoverIdx,
      path: 'rotation',
      times: rDeathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-7, 10, 6),
        quatFromEulerXYZ(5, -12, -5),
        quatFromEulerXYZ(7, -16, -6),
        quatFromEulerXYZ(7, -16, -6),
      ],
    },
    {
      nodeIndex: coreIdx,
      path: 'scale',
      times: rDeathT,
      values: [
        [1.0, 1.0, 1.0],
        [1.26, 1.26, 1.26],
        [0.42, 0.42, 0.42],
        [0.14, 0.14, 0.14],
        [0.14, 0.14, 0.14],
      ],
    },
    {
      nodeIndex: groundRingIdx,
      path: 'scale',
      times: rDeathT,
      values: [
        [1.0, 1.0, 1.0],
        [1.12, 1.0, 1.12],
        [0.45, 0.5, 0.45],
        [0.10, 0.2, 0.10],
        [0.10, 0.2, 0.10],
      ],
    },
    ...shellInfos.map((si, idx) => ({
      nodeIndex: si.nodeIndex,
      path: 'rotation',
      times: rDeathT,
      values: [
        [0, 0, 0, 1],
        quatFromAxisAngle(si.axis, (-12 * Math.PI) / 180),
        quatFromAxisAngle(si.axis, ((idx % 2 === 0 ? -18 : -10) * Math.PI) / 180),
        quatFromAxisAngle(si.axis, ((idx % 2 === 0 ? -20 : -12) * Math.PI) / 180),
        quatFromAxisAngle(si.axis, ((idx % 2 === 0 ? -20 : -12) * Math.PI) / 180),
      ],
    })),
  ]);

  return scene.buildGLB('RiftEngineScene');
}

// ---------------------------------------------------------------------------
// Self-Validation Summary & CLI Entry Point
// ---------------------------------------------------------------------------

function summarizeRoboticsAsset(filename, glbBuffer, gltf) {
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
    allNodes: gltf.nodes.map((n) => n.name),
    teamNodes: gltf.nodes.filter((n) => n.name.startsWith('Surf_TEAM_')).map((n) => n.name),
    glowNodes: gltf.nodes.filter((n) => n.name.startsWith('Surf_GLOW_')).map((n) => n.name),
    animations: (gltf.animations || []).map((a) => a.name),
  };
}

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
  fs.mkdirSync(outDir, { recursive: true });

  const annex = buildRoboticsAnnexGLB();
  fs.writeFileSync(path.join(outDir, 'robotics_annex.glb'), annex.glb);

  const bastion = buildBastionWalkerGLB();
  fs.writeFileSync(path.join(outDir, 'bastion_walker.glb'), bastion.glb);

  const rift = buildRiftEngineGLB();
  fs.writeFileSync(path.join(outDir, 'rift_engine.glb'), rift.glb);

  const summary = [
    summarizeRoboticsAsset('robotics_annex.glb', annex.glb, annex.gltf),
    summarizeRoboticsAsset('bastion_walker.glb', bastion.glb, bastion.gltf),
    summarizeRoboticsAsset('rift_engine.glb', rift.glb, rift.gltf),
  ];

  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildRoboticsAnnexGLB,
  buildBastionWalkerGLB,
  buildRiftEngineGLB,
};
