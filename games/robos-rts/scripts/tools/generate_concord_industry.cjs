#!/usr/bin/env node
'use strict';

/**
 * Deterministic Standalone Procedural GLB Generator for Starfall Command
 * Faction: Aurelian Concord — Industry & Defense Structures
 *
 * Outputs (in target directory, default __dirname):
 *   1. prism_forge.glb        (~7.0 x 7.0 footprint, Y=0 ground, +X forward, 'idle' clip)
 *   2. robotics_foundry.glb   (~7.0 x 7.0 footprint, Y=0 ground, +X forward, 'idle' clip)
 *   3. aegis_relay_ladder.glb (~5.0 x 5.0 footprint, Y=0 ground, +X forward, 'idle' clip,
 *                              360-deg 'Turret' node + '+X' 'Muzzle' socket)
 *
 * Uses ONLY built-in Node.js modules ('fs', 'path'). Zero external dependencies.
 * Visual language aligned with generate_concord_tech.cjs & generate_concord_support.cjs.
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
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
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
  constructor(generatorName = 'starfall-concord-industry-generator-1.0') {
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
    if (alpha < 0.999) {
      mat.alphaMode = 'BLEND';
    }
    if (doubleSided) {
      mat.doubleSided = true;
    }
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
// Shared Aurelian Concord Palette (Compatible with Tech & Support Packs)
// ---------------------------------------------------------------------------

function createConcordIndustryMaterials(scene) {
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

  // Prism Forge: Deep royal molten sapphire facets + white-hot incandescent sapphire fissures
  const Mat_MoltenSapphire = scene.addMaterial({
    name: 'Mat_MoltenSapphire',
    baseColorHex: '#0f4fd6',
    metallic: 0.14,
    roughness: 0.18,
    emissiveHex: '#0a36ad',
    emissiveBoost: 0.62,
  });

  const Mat_SapphireHot = scene.addMaterial({
    name: 'Mat_SapphireHot',
    baseColorHex: '#a8f0ff',
    metallic: 0.0,
    roughness: 0.10,
    emissiveHex: '#4cc9ff',
    emissiveBoost: 1.24,
  });

  const Mat_SapphireShimmer = scene.addMaterial({
    name: 'Mat_SapphireShimmer',
    baseColorHex: '#2584ff',
    alpha: 0.48,
    metallic: 0.04,
    roughness: 0.16,
    emissiveHex: '#1968f5',
    emissiveBoost: 0.86,
    doubleSided: true,
  });

  // Robotics Foundry: Aurelian teal-aquamarine assembly field & launch portal
  const Mat_FoundryTeal = scene.addMaterial({
    name: 'Mat_FoundryTeal',
    baseColorHex: '#5ef2e4',
    metallic: 0.0,
    roughness: 0.16,
    emissiveHex: '#1cd8c9',
    emissiveBoost: 1.06,
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

  // Aegis Relay: High-intensity focused photon beam & emitter lens
  const Mat_PhotonCore = scene.addMaterial({
    name: 'Mat_PhotonCore',
    baseColorHex: '#9cf6ff',
    metallic: 0.0,
    roughness: 0.12,
    emissiveHex: '#3ce2ff',
    emissiveBoost: 1.20,
  });

  const Mat_PhotonLens = scene.addMaterial({
    name: 'Mat_PhotonLens',
    baseColorHex: '#26c8ff',
    alpha: 0.56,
    metallic: 0.06,
    roughness: 0.14,
    emissiveHex: '#12a4ff',
    emissiveBoost: 0.90,
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
    Mat_MoltenSapphire,
    Mat_SapphireHot,
    Mat_SapphireShimmer,
    Mat_FoundryTeal,
    Mat_FoundryField,
    Mat_PhotonCore,
    Mat_PhotonLens,
  };
}

/**
 * Cardinal-aligned regular polygon ring with exact ±halfWidth cardinal planes (for sides = 8, 12).
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

/**
 * Chamfered rectangular ring with exact ±hx and ±hz cardinal faces.
 */
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
// Asset 1: prism_forge.glb
// Forge equivalent — 7.0 x 7.0 footprint ([-3.5, +3.5], Y=0, +X forward),
// low heavy gold/ivory forge deck with 4 massive anvil corner bastions,
// squat mechanical crucible with 4 articulating forge jaws, and a molten
// sapphire floating prism. Strong heavy industrial outline distinct from Twilight Array.
// ---------------------------------------------------------------------------

function buildPrismForgeGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createConcordIndustryMaterials(scene);

  const rootIdx = scene.addNode({ name: 'PrismForge', translation: [0, 0, 0] });

  const gIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gIvoryLight = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gGold = new PrimitiveGeom(mats.Mat_Gold);
  const gGoldBright = new PrimitiveGeom(mats.Mat_GoldBright);
  const gBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);
  const gStone = new PrimitiveGeom(mats.Mat_StoneDark);
  const gSapphire = new PrimitiveGeom(mats.Mat_MoltenSapphire);
  const gSapphireHot = new PrimitiveGeom(mats.Mat_SapphireHot);

  // -------------------------------------------------------------------------
  // 1. Low Heavy Gold & Ivory 7.0 x 7.0 Forge Deck (exact [-3.50, +3.50], Y = 0.00 .. 0.96)
  //    Heavy chamfered-square / anvil-bastion silhouette (zero tall swept pylons!)
  // -------------------------------------------------------------------------
  gStone.addLoft(
    [
      makeRectChamferRing(3.500, 3.500, 0.78, 0.000),
      makeRectChamferRing(3.430, 3.430, 0.75, 0.280),
      makeRectChamferRing(3.180, 3.180, 0.68, 0.310),
    ],
    [[0, 0.001, 0], [0, 0.280, 0], [0, 0.310, 0]],
    true,
    true
  );

  // Recessed Molten-Sapphire Perimeter Conduit Strip around heavy forge plinth
  gSapphireHot.addLoft(
    [
      makeRectChamferRing(3.260, 3.260, 0.70, 0.275),
      makeRectChamferRing(3.260, 3.260, 0.70, 0.385),
    ],
    [[0, 0.28, 0], [0, 0.38, 0]],
    false,
    true
  );

  // Heavy Burnished Gold Forge Deck Rim & Broad Ivory Anvil Platform (Y = 0.38 .. 0.78)
  gGold.addLoft(
    [
      makeRectChamferRing(3.340, 3.340, 0.74, 0.380),
      makeRectChamferRing(3.240, 3.240, 0.72, 0.500),
    ],
    [[0, 0.381, 0], [0, 0.499, 0]],
    true,
    true
  );

  gIvory.addLoft(
    [
      makeRectChamferRing(3.180, 3.180, 0.70, 0.500),
      makeRectChamferRing(2.940, 2.940, 0.66, 0.760),
    ],
    [[0, 0.501, 0], [0, 0.759, 0]],
    false,
    true
  );

  // 4 Massive Corner Anvil Bastions (±X, ±Z) giving Prism Forge a bold, stocky 4-shouldered outline!
  const bastionSigns = [
    { tag: 'NE', sx: 1, sz: -1, deg: 45 },
    { tag: 'SE', sx: 1, sz: 1, deg: -45 },
    { tag: 'SW', sx: -1, sz: 1, deg: -135 },
    { tag: 'NW', sx: -1, sz: -1, deg: 135 },
  ];

  const bastionTeamPoly = [
    [-0.44, -0.28],
    [0.44, -0.28],
    [0.36, 0.26],
    [0.00, 0.34],
    [-0.36, 0.26],
  ];

  for (const bs of bastionSigns) {
    const bx = bs.sx * 2.38;
    const bz = bs.sz * 2.38;
    // Heavy sculpted ivory & gold corner forge bunker/capacitor block (stays strictly <= 3.46!)
    gIvoryLight.addChamferBox({
      center: [bx, 0.74, bz],
      size: [1.58, 0.84, 1.58],
      rotDeg: [0, bs.deg, 0],
      topScale: [0.84, 0.84],
      botScale: [0.98, 0.98],
      minYClamp: 0.0,
    });
    gGold.addChamferBox({
      center: [bx, 1.19, bz],
      size: [1.30, 0.14, 1.30],
      rotDeg: [0, bs.deg, 0],
      topScale: [0.90, 0.90],
    });
    // Heavy bronze cooling vents on outer corner face
    gBronze.addChamferBox({
      center: [bs.sx * 2.74, 0.64, bs.sz * 2.74],
      size: [0.36, 0.44, 0.88],
      rotDeg: [0, bs.deg, 0],
      topScale: [0.86, 0.90],
    });

    // Broad Player Team Armor Plate (Surf_TEAM_Bastion*) flush on top of each corner bastion!
    const radOut = vNorm([bs.sx, 0, bs.sz]);
    const shieldPos = [bx, 1.26, bz];
    const shieldOut = vNorm([radOut[0] * 0.24, 0.97, radOut[2] * 0.24]);
    const shieldUp = [-radOut[0], 0.24, -radOut[2]];

    gGoldBright.addOrientedShield(
      shieldPos,
      shieldOut,
      shieldUp,
      bastionTeamPoly.map(([x, y]) => [x * 1.14, y * 1.14]),
      0.055,
      0.88,
      0.015
    );

    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(
      vAdd(shieldPos, vScale(shieldOut, 0.036)),
      shieldOut,
      shieldUp,
      bastionTeamPoly,
      0.068,
      0.85,
      0.02
    );
    const tName = `Surf_TEAM_Bastion${bs.tag}`;
    const tMesh = scene.addMesh(tName, [gTeam]);
    scene.addNode({ name: tName, meshIndex: tMesh, parentIndex: rootIdx });
  }

  // +X Forward Ingot / Upgrade Dispatch Apron & Team Crest
  gIvoryLight.addChamferBox({
    center: [2.98, 0.42, 0],
    size: [0.96, 0.56, 2.08],
    topScale: [0.86, 0.90],
    minYClamp: 0.0,
  });
  gGoldBright.addChamferBox({
    center: [3.08, 0.72, 0],
    size: [0.68, 0.12, 1.78],
    topScale: [0.90, 0.92],
  });
  gSapphireHot.addChamferBox({
    center: [3.16, 0.79, 0],
    size: [0.38, 0.06, 1.32],
    topScale: [0.92, 0.92],
  });

  // +X Front Apron Team Crest (Surf_TEAM_FrontApron)
  {
    const gTeamFront = new PrimitiveGeom(mats.Surf_TEAM);
    const frontPoly = [
      [-0.64, -0.22],
      [0.64, -0.22],
      [0.52, 0.22],
      [-0.52, 0.22],
    ];
    const fOut = vNorm([0.86, 0.51, 0]);
    const fUp = [-0.51, 0.86, 0];
    gTeamFront.addOrientedShield([3.28, 0.48, 0], fOut, fUp, frontPoly, 0.055, 0.86, 0.02);
    const fMesh = scene.addMesh('Surf_TEAM_FrontApron', [gTeamFront]);
    scene.addNode({ name: 'Surf_TEAM_FrontApron', meshIndex: fMesh, parentIndex: rootIdx });
  }

  // -X, +Z, -Z Heavy Industrial Cooling Louvers / Flux Manifolds on the 3 non-front cardinal sides
  for (const [cx, cz, rotY] of [
    [-3.02, 0, 0],
    [0, 3.02, 90],
    [0, -3.02, -90],
  ]) {
    gStone.addChamferBox({
      center: [cx, 0.58, cz],
      size: [0.76, 0.58, 1.86],
      rotDeg: [0, rotY, 0],
      topScale: [0.86, 0.90],
      minYClamp: 0.0,
    });
    gGold.addChamferBox({
      center: [cx * 0.97, 0.90, cz * 0.97],
      size: [0.58, 0.12, 1.58],
      rotDeg: [0, rotY, 0],
      topScale: [0.90, 0.90],
    });
  }

  // -------------------------------------------------------------------------
  // 2. Squat Mechanical Crucible in Center of Forge Deck (Y = 0.72 .. 1.94, r = 2.18)
  // -------------------------------------------------------------------------
  const crucSides = 8;
  const crucOutBot = makeCardinalAlignedRing(crucSides, 2.18, 0.72);
  const crucOutMid = makeCardinalAlignedRing(crucSides, 2.10, 1.46);
  const crucOutTop = makeCardinalAlignedRing(crucSides, 1.92, 1.88);
  const crucInTop = makeCardinalAlignedRing(crucSides, 1.50, 1.90);
  const crucInBot = makeCardinalAlignedRing(crucSides, 1.28, 1.12);

  gBronze.addLoft(
    [crucOutBot, crucOutMid, crucOutTop, crucInTop, crucInBot],
    [[0, 0.72, 0], [0, 1.46, 0], [0, 1.88, 0], [0, 1.89, 0], [0, 1.12, 0]],
    false,
    true
  );

  // Heavy Gold Segmented Crucible Rim Collar & 8 Radial Forge Bus Buttresses
  const rimRings = [];
  const rimCenters = [];
  for (let i = 0; i < crucSides; i++) {
    rimRings.push([
      [crucOutTop[i][0] * 1.03, 1.72, crucOutTop[i][2] * 1.03],
      [crucOutTop[i][0] * 1.01, 1.94, crucOutTop[i][2] * 1.01],
      [crucInTop[i][0] * 0.99, 1.95, crucInTop[i][2] * 0.99],
      [crucInTop[i][0] * 1.02, 1.74, crucInTop[i][2] * 1.02],
    ]);
    rimCenters.push([
      (crucOutTop[i][0] + crucInTop[i][0]) * 0.5,
      1.84,
      (crucOutTop[i][2] + crucInTop[i][2]) * 0.5,
    ]);
  }
  gGoldBright.addCyclicRingLoft(rimRings, rimCenters);

  // 4 Cardinal Heavy Crucible Gusset Struts (0°, 90°, 180°, 270°)
  for (let k = 0; k < 4; k++) {
    const th = (Math.PI * 0.5) * k;
    const ca = Math.cos(th), sa = Math.sin(th);
    gGold.addTubeAlongSpine(
      [
        { pos: [ca * 1.92, 1.72, sa * 1.92], rx: 0.16, ry: 0.13 },
        { pos: [ca * 2.66, 0.78, sa * 2.66], rx: 0.20, ry: 0.14 },
      ],
      4,
      true,
      true
    );
  }

  // 4 Surf_GLOW_* Player Power Nodes flanking the Forge Deck
  const forgeGlowSpecs = [
    { name: 'Surf_GLOW_FrontR', pos: [2.72, 0.92, 1.16] },
    { name: 'Surf_GLOW_FrontL', pos: [2.72, 0.92, -1.16] },
    { name: 'Surf_GLOW_RearR', pos: [-2.72, 0.92, 1.16] },
    { name: 'Surf_GLOW_RearL', pos: [-2.72, 0.92, -1.16] },
  ];
  for (const gs of forgeGlowSpecs) {
    gGold.addChamferBox({
      center: [gs.pos[0], gs.pos[1] - 0.13, gs.pos[2]],
      size: [0.38, 0.16, 0.38],
      topScale: [0.84, 0.84],
    });
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({ center: gs.pos, radii: [0.16, 0.22, 0.16], sectors: 6, stacks: 4 });
    const gMesh = scene.addMesh(gs.name, [gGlow]);
    scene.addNode({ name: gs.name, meshIndex: gMesh, parentIndex: rootIdx });
  }

  const forgeDeckMesh = scene.addMesh('ForgeDeckCrucible_Mesh', [
    gIvory,
    gIvoryLight,
    gGold,
    gGoldBright,
    gBronze,
    gStone,
    gSapphire,
    gSapphireHot,
  ]);
  scene.addNode({ name: 'ForgeDeckCrucible', meshIndex: forgeDeckMesh, parentIndex: rootIdx });

  // Incandescent Molten Sapphire Crucible Bath (Y = 1.24, animated surge in 'idle'!)
  const bathPivotY = 1.26;
  const gBathDeep = new PrimitiveGeom(mats.Mat_MoltenSapphire);
  const gBathHot = new PrimitiveGeom(mats.Mat_SapphireHot);
  gBathDeep.addLoft(
    [
      makeCardinalAlignedRing(8, 1.32, -0.10),
      makeCardinalAlignedRing(8, 1.44, 0.04),
      makeCardinalAlignedRing(8, 0.82, 0.10),
    ],
    [[0, -0.10, 0], [0, 0.04, 0], [0, 0.10, 0]],
    false,
    true
  );
  const innerHotRing = makeCardinalAlignedRing(8, 0.86, 0.12);
  for (let i = 0; i < 8; i++) {
    gBathHot.addTri([0, 0.15, 0], innerHotRing[(i + 1) % 8], innerHotRing[i], [0, 1, 0]);
  }
  const bathMesh = scene.addMesh('MoltenSapphireBath_Mesh', [gBathDeep, gBathHot]);
  const bathNodeIdx = scene.addNode({
    name: 'MoltenSapphireBath',
    meshIndex: bathMesh,
    translation: [0, bathPivotY, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 3. 4 Squat Mechanical Crucible Clamp Jaws (NE, SE, SW, NW) gripping the floating prism!
  // -------------------------------------------------------------------------
  const jawSpecs = [
    { name: 'CrucibleJaw_NE', deg: -45 },
    { name: 'CrucibleJaw_SE', deg: 45 },
    { name: 'CrucibleJaw_SW', deg: 135 },
    { name: 'CrucibleJaw_NW', deg: -135 },
  ];
  const jawInfos = [];

  for (const js of jawSpecs) {
    const th = (js.deg * Math.PI) / 180;
    const ca = Math.cos(th), sa = Math.sin(th);
    const pivot = [ca * 1.96, 1.62, sa * 1.96];

    const gJawIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
    const gJawGold = new PrimitiveGeom(mats.Mat_GoldBright);
    const gJawBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);
    const gJawTip = new PrimitiveGeom(mats.Mat_SapphireHot);

    const toLocal = (r, y, tangOffset = 0) => {
      const tx = -sa, tz = ca;
      return [
        ca * r + tx * tangOffset - pivot[0],
        y - pivot[1],
        sa * r + tz * tangOffset - pivot[2],
      ];
    };

    // Squat heavy mechanical hinge block at crucible lip
    gJawBronze.addTubeAlongSpine(
      [
        { pos: toLocal(2.14, 1.38), rx: 0.28, ry: 0.24 },
        { pos: toLocal(1.94, 1.72), rx: 0.26, ry: 0.22 },
      ],
      4,
      true,
      true
    );

    // Chunky sculpted ivory & gold mechanical vise arm reaching inward horizontally/upward
    gJawIvory.addTubeAlongSpine(
      [
        { pos: toLocal(1.98, 1.76), rx: 0.24, ry: 0.20 },
        { pos: toLocal(1.66, 2.22), rx: 0.22, ry: 0.18 },
        { pos: toLocal(1.24, 2.40), rx: 0.16, ry: 0.14 },
      ],
      4,
      true,
      true
    );

    // Golden dorsal hydraulic actuator strap along top of mechanical jaw
    gJawGold.addTubeAlongSpine(
      [
        { pos: toLocal(2.06, 1.82), rx: 0.12, ry: 0.10 },
        { pos: toLocal(1.70, 2.30), rx: 0.11, ry: 0.09 },
        { pos: toLocal(1.26, 2.48), rx: 0.09, ry: 0.08 },
      ],
      4,
      true,
      true
    );

    // Glowing molten-sapphire induction emitter claw pad facing the floating prism
    gJawTip.addFacetedCrystal({
      center: toLocal(1.14, 2.34),
      radii: [0.13, 0.18, 0.13],
      sectors: 6,
      stacks: 4,
    });

    const jawMesh = scene.addMesh(`${js.name}_Mesh`, [
      gJawIvory,
      gJawGold,
      gJawBronze,
      gJawTip,
    ]);
    const jIdx = scene.addNode({
      name: js.name,
      meshIndex: jawMesh,
      translation: pivot,
      parentIndex: rootIdx,
    });

    jawInfos.push({ nodeIndex: jIdx, axis: [-sa, 0, ca] });
  }

  // -------------------------------------------------------------------------
  // 4. Molten Sapphire Floating Prism (Y = 1.54 .. 3.22, pivot = 2.38)
  //    Sharp 6-sided diamond-table cut molten sapphire prism with white-hot seams!
  // -------------------------------------------------------------------------
  const prismPivotY = 2.38;
  const gPrismBody = new PrimitiveGeom(mats.Mat_MoltenSapphire);
  const gPrismVeins = new PrimitiveGeom(mats.Mat_SapphireHot);
  const gPrismGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gPrismAura = new PrimitiveGeom(mats.Mat_SapphireShimmer);

  // Angular 6-Sided Cut-Sapphire Floating Prism (sharp planar facets, table crown & pointed pavilion!)
  const prismRing = (r, y) => {
    const pts = [];
    for (let s = 0; s < 6; s++) {
      const th = (Math.PI / 3) * s + Math.PI / 6;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    return pts;
  };
  gPrismBody.addLoft(
    [
      prismRing(0.06, -0.84),
      prismRing(0.76, -0.36),
      prismRing(1.02, 0.02),
      prismRing(0.84, 0.44),
      prismRing(0.42, 0.78),
    ],
    [[0, -0.84, 0], [0, -0.36, 0], [0, 0.02, 0], [0, 0.44, 0], [0, 0.78, 0]],
    true,
    true
  );

  // White-hot incandescent molten sapphire crown table & 6 sharp facet ridge seams
  const hotTable = prismRing(0.38, 0.79);
  for (let s = 0; s < 6; s++) {
    gPrismVeins.addTri([0, 0.82, 0], hotTable[(s + 1) % 6], hotTable[s], [0, 1, 0]);
    const th = (Math.PI / 3) * s + Math.PI / 6;
    const ca = Math.cos(th), sa = Math.sin(th);
    gPrismVeins.addTubeAlongSpine(
      [
        { pos: [ca * 0.77, -0.36, sa * 0.77], rx: 0.038, ry: 0.032 },
        { pos: [ca * 1.03, 0.02, sa * 1.03], rx: 0.044, ry: 0.036 },
        { pos: [ca * 0.85, 0.44, sa * 0.85], rx: 0.038, ry: 0.032 },
        { pos: [ca * 0.41, 0.79, sa * 0.41], rx: 0.030, ry: 0.026 },
      ],
      4,
      true,
      true
    );
  }

  // 6 Golden Equatorial Crucible Containment Clasps around the 6-sided prism girdle
  for (let s = 0; s < 6; s++) {
    const th = (Math.PI / 3) * s + Math.PI / 6;
    gPrismGold.addChamferBox({
      center: [Math.cos(th) * 1.02, 0.02, Math.sin(th) * 1.02],
      size: [0.18, 0.22, 0.20],
      rotDeg: [0, (-th * 180) / Math.PI, 45],
      topScale: [0.86, 0.86],
    });
  }

  // Subtle translucent molten-sapphire heat corona ring around the prism base
  const shimmerRings = [];
  const shimmerCenters = [];
  for (let s = 0; s < 8; s++) {
    const th = (Math.PI * 0.25) * s;
    const ca = Math.cos(th), sa = Math.sin(th);
    shimmerRings.push([
      [ca * 1.16, -0.26, sa * 1.16],
      [ca * 1.12, -0.14, sa * 1.12],
      [ca * 0.96, -0.14, sa * 0.96],
      [ca * 1.00, -0.26, sa * 1.00],
    ]);
    shimmerCenters.push([ca * 1.06, -0.20, sa * 1.06]);
  }
  gPrismAura.addCyclicRingLoft(shimmerRings, shimmerCenters);

  const prismMesh = scene.addMesh('MoltenSapphirePrism_Mesh', [
    gPrismBody,
    gPrismVeins,
    gPrismGold,
    gPrismAura,
  ]);
  const prismNodeIdx = scene.addNode({
    name: 'MoltenSapphirePrism',
    meshIndex: prismMesh,
    translation: [0, prismPivotY, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 5. Seamless Looping 'idle' Animation (3.0s forge crucible clamp & molten prism pulse)
  // -------------------------------------------------------------------------
  const fTimes = [0.0, 0.75, 1.5, 2.25, 3.0];
  const fTracks = [
    {
      nodeIndex: prismNodeIdx,
      path: 'translation',
      times: fTimes,
      values: [
        [0, prismPivotY, 0],
        [0, prismPivotY + 0.09, 0],
        [0, prismPivotY, 0],
        [0, prismPivotY - 0.07, 0],
        [0, prismPivotY, 0],
      ],
    },
    {
      nodeIndex: prismNodeIdx,
      path: 'rotation',
      times: fTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(2.5, 16, -2.5),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-2.5, -16, 2.5),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: bathNodeIdx,
      path: 'scale',
      times: fTimes,
      values: [
        [1.0, 1.0, 1.0],
        [1.04, 1.12, 1.04],
        [1.0, 1.0, 1.0],
        [0.97, 0.92, 0.97],
        [1.0, 1.0, 1.0],
      ],
    },
  ];

  for (const ji of jawInfos) {
    fTracks.push({
      nodeIndex: ji.nodeIndex,
      path: 'rotation',
      times: fTimes,
      values: [
        [0, 0, 0, 1],
        quatFromAxisAngle(ji.axis, (3.4 * Math.PI) / 180),
        [0, 0, 0, 1],
        quatFromAxisAngle(ji.axis, (-2.4 * Math.PI) / 180),
        [0, 0, 0, 1],
      ],
    });
  }

  scene.addAnimation('idle', fTracks);

  return scene.buildGLB('PrismForgeScene');
}

// ---------------------------------------------------------------------------
// Asset 2: robotics_foundry.glb
// Robotics Facility equivalent — 7.0 x 7.0 footprint ([-3.5, +3.5], Y=0, +X forward),
// raised fabrication chamber with an overhead traveling crane gantry and an
// unmistakable ground-level launch aperture facing +X.
// ---------------------------------------------------------------------------

function buildRoboticsFoundryGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createConcordIndustryMaterials(scene);

  const rootIdx = scene.addNode({ name: 'RoboticsFoundry', translation: [0, 0, 0] });

  const gIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gIvoryLight = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gGold = new PrimitiveGeom(mats.Mat_Gold);
  const gGoldBright = new PrimitiveGeom(mats.Mat_GoldBright);
  const gBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);
  const gStone = new PrimitiveGeom(mats.Mat_StoneDark);
  const gVoid = new PrimitiveGeom(mats.Mat_ApertureVoid);
  const gTeal = new PrimitiveGeom(mats.Mat_FoundryTeal);

  // -------------------------------------------------------------------------
  // 1. Heavy 7.0 x 7.0 Rectangular-Chamfered Foundry Plinth (exact [-3.50, +3.50], Y = 0.00 .. 0.30)
  // -------------------------------------------------------------------------
  gStone.addLoft(
    [
      makeRectChamferRing(3.500, 3.500, 0.58, 0.000),
      makeRectChamferRing(3.440, 3.440, 0.56, 0.240),
      makeRectChamferRing(3.260, 3.260, 0.52, 0.270),
    ],
    [[0, 0.001, 0], [0, 0.240, 0], [0, 0.270, 0]],
    true,
    true
  );

  // Golden Foundation Perimeter Trim (recessed at +X so ground-level launch ramp opens cleanly!)
  const trimBot = makeRectChamferRing(3.380, 3.380, 0.55, 0.220);
  const trimTop = makeRectChamferRing(3.300, 3.300, 0.53, 0.320);
  const trimIn = makeRectChamferRing(3.120, 3.120, 0.50, 0.320);
  const trimRings = [];
  const trimCenters = [];
  for (let i = 0; i < trimBot.length; i++) {
    const isFrontLaunch = i === 0 || i === 1;
    const h = isFrontLaunch ? 0.255 : 0.330;
    trimRings.push([
      trimBot[i],
      [trimTop[i][0], h, trimTop[i][2]],
      [trimIn[i][0], h, trimIn[i][2]],
      [trimIn[i][0], 0.220, trimIn[i][2]],
    ]);
    trimCenters.push([
      (trimTop[i][0] + trimIn[i][0]) * 0.5,
      0.27,
      (trimTop[i][2] + trimIn[i][2]) * 0.5,
    ]);
  }
  gGold.addCyclicRingLoft(trimRings, trimCenters);

  // -------------------------------------------------------------------------
  // 2. Ground-Level Launch Aperture & +X Rollout Deck (facing +X, Y = 0.02 .. 2.34)
  // -------------------------------------------------------------------------
  // Ground-level launch deck apron extending right to +X = 3.48 with glowing teal rollout chevrons!
  gIvoryLight.addLoft(
    [
      [
        [3.48, 0.02, 1.54],
        [3.48, 0.02, -1.54],
        [0.80, 0.02, -1.54],
        [0.80, 0.02, 1.54],
      ],
      [
        [3.38, 0.22, 1.44],
        [3.38, 0.22, -1.44],
        [0.80, 0.26, -1.44],
        [0.80, 0.26, 1.44],
      ],
    ],
    [[2.14, 0.02, 0], [2.09, 0.24, 0]],
    true,
    true
  );

  // Dark-slate central treadway deck & twin glowing teal ground-level launch chevrons pointing +X!
  gStone.addChamferBox({
    center: [2.32, 0.24, 0],
    size: [2.06, 0.06, 2.24],
    topScale: [0.98, 0.98],
  });
  for (const cx of [2.14, 2.86]) {
    gTeal.addTubeAlongSpine(
      [
        { pos: [cx - 0.24, 0.28, -0.78], rx: 0.065, ry: 0.035 },
        { pos: [cx + 0.18, 0.27, 0.00], rx: 0.075, ry: 0.040 },
        { pos: [cx - 0.24, 0.28, 0.78], rx: 0.065, ry: 0.035 },
      ],
      4,
      true,
      true
    );
  }
  // Twin burnished-gold launch guide curbs flanking the ground rollout bay
  for (const side of [-1, 1]) {
    gGoldBright.addTubeAlongSpine(
      [
        { pos: [1.45, 0.34, side * 1.46], rx: 0.14, ry: 0.10 },
        { pos: [3.36, 0.27, side * 1.42], rx: 0.11, ry: 0.08 },
      ],
      4,
      true,
      true
    );
  }

  // Deep Dark Recessed Ground-Level Launch Bay Interior Tunnel (x = -0.60 .. +1.68, y = 0.24 .. 2.18)
  // Creates unmistakable dark hangar depth behind the +X launch aperture!
  gVoid.addChamferBox({
    center: [0.58, 1.20, 0],
    size: [2.18, 1.92, 2.68],
    topScale: [0.92, 0.94],
  });

  // Monumental Trapezoidal Gold & Ivory Launch Portal Hood projecting toward +X!
  // Left & Right sloped portal jamb piers framing the ground-level +X mouth
  for (const side of [-1, 1]) {
    gIvory.addLoft(
      [
        [
          [2.42, 0.24, side * 1.32],
          [2.42, 0.24, side * 2.04],
          [1.24, 0.24, side * 2.10],
          [1.24, 0.24, side * 1.32],
        ],
        [
          [2.20, 2.26, side * 1.08],
          [2.20, 2.26, side * 1.80],
          [1.20, 2.26, side * 1.86],
          [1.20, 2.26, side * 1.08],
        ],
      ],
      [
        [1.83, 0.24, side * 1.68],
        [1.70, 2.26, side * 1.44],
      ],
      true,
      true
    );
    // Gold portal jamb inner reveal trim
    gGoldBright.addTubeAlongSpine(
      [
        { pos: [2.36, 0.28, side * 1.30], rx: 0.11, ry: 0.10 },
        { pos: [2.14, 2.22, side * 1.08], rx: 0.10, ry: 0.09 },
      ],
      4,
      true,
      true
    );
  }
  // Projecting Gold & Ivory Launch Canopy Lintel over the ground-level +X launch aperture (Y = 2.08 .. 2.48)
  gGold.addChamferBox({
    center: [1.92, 2.28, 0],
    size: [1.12, 0.36, 3.68],
    topScale: [0.90, 0.94],
  });
  gTeal.addChamferBox({
    center: [2.42, 2.18, 0],
    size: [0.16, 0.10, 2.14],
    topScale: [0.94, 0.96],
  });

  // Translucent Glowing Teal Launch Bay Force-Screen (LaunchApertureField at x = 1.88, facing +X)
  const gApertureScreen = new PrimitiveGeom(mats.Mat_FoundryField);
  gApertureScreen.addLoft(
    [
      [
        [1.92, 0.30, -1.26],
        [1.92, 0.30, 1.26],
        [1.84, 0.30, 1.26],
        [1.84, 0.30, -1.26],
      ],
      [
        [1.78, 2.06, -1.04],
        [1.78, 2.06, 1.04],
        [1.70, 2.06, 1.04],
        [1.70, 2.06, -1.04],
      ],
    ],
    [[1.88, 0.30, 0], [1.74, 2.06, 0]],
    true,
    true
  );
  const apertureScreenMesh = scene.addMesh('LaunchApertureField_Mesh', [gApertureScreen]);
  const apertureScreenNodeIdx = scene.addNode({
    name: 'LaunchApertureField',
    meshIndex: apertureScreenMesh,
    translation: [0, 0, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 3. Flanking Structural Bastions & Raised Fabrication Chamber (Y = 0.26 .. 3.76)
  // -------------------------------------------------------------------------
  // Twin Heavy Lateral Support Wings (z = ±2.44) + Rear Reactor Bulkhead (x = -2.42)
  for (const side of [-1, 1]) {
    gIvory.addChamferBox({
      center: [-0.46, 1.38, side * 2.46],
      size: [5.36, 2.26, 1.56],
      topScale: [0.90, 0.84],
      botScale: [0.98, 0.98],
      minYClamp: 0.0,
    });
    // Gold vertical structural ribs along outer flanks
    for (const rx of [-2.16, -0.56, 1.04]) {
      gGold.addChamferBox({
        center: [rx, 1.36, side * 3.16],
        size: [0.36, 2.08, 0.28],
        topScale: [0.84, 0.80],
        minYClamp: 0.0,
      });
    }
  }

  // Rear Foundry Powerhouse Bulkhead (x = -2.46)
  gIvory.addChamferBox({
    center: [-2.42, 1.56, 0],
    size: [1.72, 2.62, 4.96],
    topScale: [0.88, 0.92],
    minYClamp: 0.0,
  });
  gBronze.addChamferBox({
    center: [-3.18, 1.24, 0],
    size: [0.44, 1.76, 3.12],
    topScale: [0.86, 0.90],
    minYClamp: 0.0,
  });

  // RAISED FABRICATION CHAMBER poised above the launch bay (Y = 2.32 .. 3.40, leaving open recessed roof well!)
  gIvoryLight.addLoft(
    [
      makeRectChamferRing(2.34, 2.76, 0.56, 2.32, -0.58, 0),
      makeRectChamferRing(2.22, 2.62, 0.52, 3.38, -0.58, 0),
    ],
    [[-0.58, 2.32, 0], [-0.58, 3.38, 0]],
    true,
    true
  );

  // Golden Upper Chamber Collar framing a genuinely recessed Dark & Teal Fabrication Well (Y = 3.38 .. 3.76)!
  gGold.addLoft(
    [
      makeRectChamferRing(2.14, 2.52, 0.50, 3.38, -0.58, 0),
      makeRectChamferRing(1.98, 2.36, 0.46, 3.75, -0.58, 0),
      makeRectChamferRing(1.42, 1.62, 0.32, 3.76, -0.58, 0),
      makeRectChamferRing(1.32, 1.50, 0.28, 3.42, -0.58, 0),
    ],
    [[-0.58, 3.38, 0], [-0.58, 3.75, 0], [-0.58, 3.76, 0], [-0.58, 3.42, 0]],
    false,
    false
  );

  // Dark fabrication cradle floor (Y = 3.43) + glowing teal assembly matrix grid clearly visible from RTS zoom!
  gVoid.addChamferBox({
    center: [-0.58, 3.41, 0],
    size: [2.72, 0.06, 3.10],
    topScale: [0.98, 0.98],
  });
  for (const gz of [-0.90, 0.0, 0.90]) {
    gTeal.addChamferBox({
      center: [-0.58, 3.46, gz],
      size: [2.26, 0.05, 0.14],
      topScale: [0.94, 0.94],
    });
  }
  for (const gx of [-1.28, 0.12]) {
    gTeal.addChamferBox({
      center: [gx, 3.46, 0],
      size: [0.12, 0.05, 2.36],
      topScale: [0.94, 0.94],
    });
  }

  // Twin Elevated Golden Longitudinal Gantry Rails spanning the raised fabrication chamber!
  for (const side of [-1, 1]) {
    const rz = side * 2.04;
    gGoldBright.addTubeAlongSpine(
      [
        { pos: [-2.42, 3.82, rz], rx: 0.11, ry: 0.10 },
        { pos: [1.34, 3.82, rz], rx: 0.11, ry: 0.10 },
      ],
      4,
      true,
      true
    );
    // 3 Rail Stanchion Posts per side
    for (const sx of [-2.28, -0.54, 1.20]) {
      gBronze.addChamferBox({
        center: [sx, 3.68, rz],
        size: [0.28, 0.26, 0.28],
        topScale: [0.88, 0.88],
      });
    }
  }

  // 4 Bold Player Team Armor Panels (Surf_TEAM_*) on the Raised Chamber & +X Launch Portal Brow!
  const sideRoofPoly = [
    [-1.42, -0.34],
    [1.42, -0.34],
    [1.24, 0.34],
    [-1.24, 0.34],
  ];
  for (const [tName, side] of [
    ['Surf_TEAM_ChamberR', 1],
    ['Surf_TEAM_ChamberL', -1],
  ]) {
    const pos = [-0.54, 3.04, side * 2.66];
    const out = vNorm([0, 0.36, side * 0.93]);
    const up = [0, 0.93, -side * 0.36];
    gGoldBright.addOrientedShield(
      pos,
      out,
      up,
      sideRoofPoly.map(([x, y]) => [x * 1.08, y * 1.14]),
      0.05,
      0.92,
      0.015
    );
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(vAdd(pos, vScale(out, 0.035)), out, up, sideRoofPoly, 0.065, 0.90, 0.02);
    const tMesh = scene.addMesh(tName, [gTeam]);
    scene.addNode({ name: tName, meshIndex: tMesh, parentIndex: rootIdx });
  }

  // +X Portal Brow Team Crest (Surf_TEAM_PortalBrow) directly over the ground-level launch mouth!
  {
    const browPoly = [
      [-1.08, -0.28],
      [1.08, -0.28],
      [0.92, 0.28],
      [0.00, 0.36],
      [-0.92, 0.28],
    ];
    const bPos = [1.82, 2.94, 0];
    const bOut = vNorm([0.92, 0.39, 0]);
    const bUp = [-0.39, 0.92, 0];
    gGoldBright.addOrientedShield(
      bPos,
      bOut,
      bUp,
      browPoly.map(([x, y]) => [x * 1.10, y * 1.14]),
      0.05,
      0.90,
      0.015
    );
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(vAdd(bPos, vScale(bOut, 0.035)), bOut, bUp, browPoly, 0.065, 0.88, 0.02);
    const tMesh = scene.addMesh('Surf_TEAM_PortalBrow', [gTeam]);
    scene.addNode({ name: 'Surf_TEAM_PortalBrow', meshIndex: tMesh, parentIndex: rootIdx });
  }

  // -X Rear Chamber Team Panel (Surf_TEAM_RearChamber)
  {
    const rearPoly = [
      [-1.16, -0.32],
      [1.16, -0.32],
      [0.98, 0.32],
      [-0.98, 0.32],
    ];
    const rPos = [-2.88, 3.02, 0];
    const rOut = vNorm([-0.92, 0.39, 0]);
    const rUp = [0.39, 0.92, 0];
    gGoldBright.addOrientedShield(
      rPos,
      rOut,
      rUp,
      rearPoly.map(([x, y]) => [x * 1.10, y * 1.14]),
      0.05,
      0.90,
      0.015
    );
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(vAdd(rPos, vScale(rOut, 0.035)), rOut, rUp, rearPoly, 0.065, 0.88, 0.02);
    const tMesh = scene.addMesh('Surf_TEAM_RearChamber', [gTeam]);
    scene.addNode({ name: 'Surf_TEAM_RearChamber', meshIndex: tMesh, parentIndex: rootIdx });
  }

  // 4 Surf_GLOW_* Player Emissive Beacons (+X Launch Portal Beacons & Rear Chamber Beacons)
  const foundryGlowSpecs = [
    { name: 'Surf_GLOW_PortalR', pos: [2.46, 0.62, 1.74] },
    { name: 'Surf_GLOW_PortalL', pos: [2.46, 0.62, -1.74] },
    { name: 'Surf_GLOW_RearR', pos: [-2.96, 2.08, 1.92] },
    { name: 'Surf_GLOW_RearL', pos: [-2.96, 2.08, -1.92] },
  ];
  for (const gs of foundryGlowSpecs) {
    gGold.addChamferBox({
      center: [gs.pos[0], gs.pos[1] - 0.13, gs.pos[2]],
      size: [0.38, 0.16, 0.38],
      topScale: [0.84, 0.84],
    });
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({ center: gs.pos, radii: [0.16, 0.22, 0.16], sectors: 6, stacks: 4 });
    const gMesh = scene.addMesh(gs.name, [gGlow]);
    scene.addNode({ name: gs.name, meshIndex: gMesh, parentIndex: rootIdx });
  }

  const foundryHullMesh = scene.addMesh('RoboticsFoundryHull_Mesh', [
    gIvory,
    gIvoryLight,
    gGold,
    gGoldBright,
    gBronze,
    gStone,
    gVoid,
    gTeal,
  ]);
  scene.addNode({ name: 'RoboticsFoundryHull', meshIndex: foundryHullMesh, parentIndex: rootIdx });

  // Suspended Construct Core inside the Raised Fabrication Chamber (Y = 3.68)
  const corePivot = [-0.58, 3.68, 0];
  const gFabCoreGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gFabCoreTeal = new PrimitiveGeom(mats.Mat_FoundryTeal);
  gFabCoreTeal.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [0.46, 0.32, 0.46],
    sectors: 6,
    stacks: 4,
  });
  for (let s = 0; s < 4; s++) {
    const th = (Math.PI * 0.5) * s + Math.PI * 0.25;
    gFabCoreGold.addChamferBox({
      center: [Math.cos(th) * 0.44, 0, Math.sin(th) * 0.44],
      size: [0.16, 0.14, 0.16],
      rotDeg: [0, (-th * 180) / Math.PI, 0],
    });
  }
  const fabCoreMesh = scene.addMesh('FabricationCore_Mesh', [gFabCoreGold, gFabCoreTeal]);
  const fabCoreNodeIdx = scene.addNode({
    name: 'FabricationCore',
    meshIndex: fabCoreMesh,
    translation: corePivot,
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 4. Overhead Traveling Fabrication Gantry & Robotic Servo Carriage (Y = 3.76 .. 4.62)
  // -------------------------------------------------------------------------
  const gantryRestPos = [-0.54, 3.82, 0];
  const gGanIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gGanGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gGanBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);

  // Left & Right Gantry Rail Bogie Trucks + Arched Bridge Crane Beam spanning Z = -2.08 .. +2.08!
  for (const side of [-1, 1]) {
    gGanBronze.addChamferBox({
      center: [0, 0.06, side * 2.04],
      size: [0.84, 0.24, 0.38],
      topScale: [0.88, 0.88],
    });
    gGanIvory.addTubeAlongSpine(
      [
        { pos: [0, 0.14, side * 2.04], rx: 0.24, ry: 0.18 },
        { pos: [0, 0.68, side * 1.46], rx: 0.22, ry: 0.16 },
      ],
      4,
      true,
      true
    );
  }
  // Overhead Cross-Bridge Girder (Ivory core + Gold dorsal spine)
  gGanIvory.addChamferBox({
    center: [0, 0.68, 0],
    size: [0.54, 0.24, 3.12],
    topScale: [0.88, 0.96],
  });
  gGanGold.addChamferBox({
    center: [0, 0.82, 0],
    size: [0.36, 0.10, 3.24],
    topScale: [0.90, 0.98],
  });

  const gantryBridgeMesh = scene.addMesh('OverheadGantry_Mesh', [
    gGanIvory,
    gGanGold,
    gGanBronze,
  ]);
  const gantryNodeIdx = scene.addNode({
    name: 'OverheadGantry',
    meshIndex: gantryBridgeMesh,
    translation: gantryRestPos,
    parentIndex: rootIdx,
  });

  // Sliding Robotic Fabrication Servo Carriage suspended under OverheadGantry!
  const gCarGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gCarIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gCarTeal = new PrimitiveGeom(mats.Mat_FoundryTeal);
  const gCarBeam = new PrimitiveGeom(mats.Mat_FoundryField);

  gCarIvory.addChamferBox({
    center: [0, 0.46, 0],
    size: [0.62, 0.26, 0.68],
    topScale: [0.90, 0.90],
  });
  for (const sx of [-1, 1]) {
    gCarGold.addTubeAlongSpine(
      [
        { pos: [sx * 0.22, 0.36, 0], rx: 0.08, ry: 0.08 },
        { pos: [sx * 0.16, 0.08, 0], rx: 0.06, ry: 0.06 },
      ],
      4,
      true,
      true
    );
  }
  gCarTeal.addFacetedCrystal({
    center: [0, 0.06, 0],
    radii: [0.16, 0.12, 0.16],
    sectors: 6,
    stacks: 4,
  });
  // Subtle short fabrication projection cone pointing down at FabricationCore
  gCarBeam.addLoft(
    [
      makeCardinalAlignedRing(8, 0.22, -0.14),
      makeCardinalAlignedRing(8, 0.10, 0.04),
    ],
    [[0, -0.14, 0], [0, 0.04, 0]],
    false,
    false
  );

  const carriageMesh = scene.addMesh('GantryCarriage_Mesh', [
    gCarGold,
    gCarIvory,
    gCarTeal,
    gCarBeam,
  ]);
  const carriageNodeIdx = scene.addNode({
    name: 'GantryCarriage',
    meshIndex: carriageMesh,
    translation: [0, 0, 0],
    parentIndex: gantryNodeIdx,
  });

  // -------------------------------------------------------------------------
  // 5. Seamless Looping 'idle' Animation (3.6s gantry traverse, carriage sweep & core pulse)
  // -------------------------------------------------------------------------
  const rTimes = [0.0, 0.9, 1.8, 2.7, 3.6];
  scene.addAnimation('idle', [
    {
      nodeIndex: gantryNodeIdx,
      path: 'translation',
      times: rTimes,
      values: [
        [-0.54, 3.82, 0],
        [0.36, 3.82, 0],
        [-0.54, 3.82, 0],
        [-1.38, 3.82, 0],
        [-0.54, 3.82, 0],
      ],
    },
    {
      nodeIndex: carriageNodeIdx,
      path: 'translation',
      times: rTimes,
      values: [
        [0, 0, 0],
        [0, 0, 0.56],
        [0, 0, 0],
        [0, 0, -0.56],
        [0, 0, 0],
      ],
    },
    {
      nodeIndex: fabCoreNodeIdx,
      path: 'rotation',
      times: rTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 24, 0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -24, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: fabCoreNodeIdx,
      path: 'translation',
      times: rTimes,
      values: [
        corePivot,
        [corePivot[0], corePivot[1] + 0.07, corePivot[2]],
        corePivot,
        [corePivot[0], corePivot[1] - 0.05, corePivot[2]],
        corePivot,
      ],
    },
    {
      nodeIndex: apertureScreenNodeIdx,
      path: 'scale',
      times: rTimes,
      values: [
        [1.0, 1.0, 1.0],
        [1.0, 1.02, 1.0],
        [1.0, 1.0, 1.0],
        [1.0, 0.98, 1.0],
        [1.0, 1.0, 1.0],
      ],
    },
  ]);

  return scene.buildGLB('RoboticsFoundryScene');
}

// ---------------------------------------------------------------------------
// Asset 3: aegis_relay_ladder.glb
// Photon Cannon equivalent — 5.0 x 5.0 footprint ([-2.5, +2.5], Y=0, +X forward),
// fortified Concord pedestal supporting a 360-degree rotating 'Turret' node
// (Y-axis yaw pivot at [0, 1.32, 0]) with a prominent directional photon emitter
// and a readable forward 'Muzzle' socket facing +X.
// ---------------------------------------------------------------------------

function buildAegisRelayGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createConcordIndustryMaterials(scene);

  const rootIdx = scene.addNode({ name: 'AegisRelay', translation: [0, 0, 0] });

  const gIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gIvoryLight = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gGold = new PrimitiveGeom(mats.Mat_Gold);
  const gGoldBright = new PrimitiveGeom(mats.Mat_GoldBright);
  const gBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);
  const gStone = new PrimitiveGeom(mats.Mat_StoneDark);
  const gPhoton = new PrimitiveGeom(mats.Mat_PhotonCore);

  // -------------------------------------------------------------------------
  // 1. Fortified 5.0 x 5.0 Relay Pedestal (exact [-2.50, +2.50], Y = 0.00 .. 1.32)
  // -------------------------------------------------------------------------
  gStone.addLoft(
    [
      makeCardinalAlignedRing(8, 2.500, 0.000),
      makeCardinalAlignedRing(8, 2.420, 0.240),
      makeCardinalAlignedRing(8, 2.180, 0.280),
    ],
    [[0, 0.001, 0], [0, 0.240, 0], [0, 0.280, 0]],
    true,
    true
  );

  // Glowing Photon-Cyan Perimeter Conduit Channel
  gPhoton.addLoft(
    [
      makeCardinalAlignedRing(8, 2.260, 0.240),
      makeCardinalAlignedRing(8, 2.260, 0.340),
    ],
    [[0, 0.241, 0], [0, 0.339, 0]],
    false,
    true
  );

  // Stepped Gold & Sculpted Ivory Defensive Glacis Pedestal rising to Circular Turret Bearing (Y = 1.30)
  gGold.addLoft(
    [
      makeCardinalAlignedRing(8, 2.340, 0.335),
      makeCardinalAlignedRing(8, 2.240, 0.450),
    ],
    [[0, 0.336, 0], [0, 0.449, 0]],
    true,
    true
  );

  gIvory.addLoft(
    [
      makeCardinalAlignedRing(8, 2.180, 0.450),
      makeCardinalAlignedRing(8, 1.660, 1.060),
      makeCardinalAlignedRing(12, 1.480, 1.240),
    ],
    [[0, 0.451, 0], [0, 1.060, 0], [0, 1.240, 0]],
    false,
    true
  );

  // 12-Sided Precision Golden 360-Degree Azimuth Turret Race Collar at Y = 1.20 .. 1.34
  const raceOut = makeCardinalAlignedRing(12, 1.54, 1.20);
  const raceTop = makeCardinalAlignedRing(12, 1.48, 1.34);
  const raceIn = makeCardinalAlignedRing(12, 1.18, 1.34);
  gGoldBright.addLoft(
    [raceOut, raceTop, raceIn],
    [[0, 1.20, 0], [0, 1.34, 0], [0, 1.34, 0]],
    false,
    true
  );

  // 4 Diagonal Armored Stabilizer Claws (NE, SE, SW, NW) anchoring the turret base (strictly inside ±2.50!)
  for (const deg of [45, -45, 135, -135]) {
    const th = (deg * Math.PI) / 180;
    const ca = Math.cos(th), sa = Math.sin(th);
    gBronze.addTubeAlongSpine(
      [
        { pos: [ca * 1.56, 1.08, sa * 1.56], rx: 0.22, ry: 0.16 },
        { pos: [ca * 2.32, 0.42, sa * 2.32], rx: 0.26, ry: 0.18 },
      ],
      4,
      true,
      true
    );
    gGoldBright.addTubeAlongSpine(
      [
        { pos: [ca * 1.58, 1.16, sa * 1.58], rx: 0.11, ry: 0.08 },
        { pos: [ca * 2.28, 0.52, sa * 2.28], rx: 0.12, ry: 0.08 },
      ],
      4,
      true,
      true
    );
  }

  // +X Base Alignment Marker Apron (shows rest forward +X orientation on the static base)
  gIvoryLight.addChamferBox({
    center: [2.08, 0.38, 0],
    size: [0.72, 0.42, 1.16],
    topScale: [0.86, 0.88],
    minYClamp: 0.0,
  });
  gPhoton.addChamferBox({
    center: [2.24, 0.61, 0],
    size: [0.30, 0.06, 0.76],
    topScale: [0.92, 0.92],
  });

  // 4 Pedestal Glacis Team Plates (Surf_TEAM_Base*) at ±90° & ±180°/0° cardinal slopes
  const baseTeamPoly = [
    [-0.44, -0.24],
    [0.44, -0.24],
    [0.36, 0.24],
    [-0.36, 0.24],
  ];
  for (const [tName, deg] of [
    ['Surf_TEAM_BaseRight', 90],
    ['Surf_TEAM_BaseLeft', -90],
    ['Surf_TEAM_BaseRear', 180],
  ]) {
    const th = (deg * Math.PI) / 180;
    const ca = Math.cos(th), sa = Math.sin(th);
    const pos = [ca * 1.92, 0.78, sa * 1.92];
    const out = vNorm([ca * 0.76, 0.65, sa * 0.76]);
    const up = [-ca * 0.65, 0.76, -sa * 0.65];
    gGoldBright.addOrientedShield(
      pos,
      out,
      up,
      baseTeamPoly.map(([x, y]) => [x * 1.14, y * 1.16]),
      0.045,
      0.88,
      0.015
    );
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(vAdd(pos, vScale(out, 0.032)), out, up, baseTeamPoly, 0.058, 0.86, 0.02);
    const tMesh = scene.addMesh(tName, [gTeam]);
    scene.addNode({ name: tName, meshIndex: tMesh, parentIndex: rootIdx });
  }

  // 2 Pedestal Surf_GLOW_* Beacons flanking +X base apron
  for (const [gName, side] of [
    ['Surf_GLOW_BaseFrontR', 1],
    ['Surf_GLOW_BaseFrontL', -1],
  ]) {
    const gPos = [2.04, 0.66, side * 0.76];
    gGold.addChamferBox({
      center: [gPos[0], gPos[1] - 0.11, gPos[2]],
      size: [0.32, 0.14, 0.32],
      topScale: [0.84, 0.84],
    });
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({ center: gPos, radii: [0.14, 0.19, 0.14], sectors: 6, stacks: 4 });
    const gMesh = scene.addMesh(gName, [gGlow]);
    scene.addNode({ name: gName, meshIndex: gMesh, parentIndex: rootIdx });
  }

  const pedestalMesh = scene.addMesh('RelayPedestal_Mesh', [
    gIvory,
    gIvoryLight,
    gGold,
    gGoldBright,
    gBronze,
    gStone,
    gPhoton,
  ]);
  scene.addNode({ name: 'RelayPedestal', meshIndex: pedestalMesh, parentIndex: rootIdx });

  // Animated Azimuth Ring Glow (PedestalAzimuthRing flush inside the 12-sided turret race collar)
  const gAzRing = new PrimitiveGeom(mats.Mat_PhotonCore);
  for (let i = 0; i < 6; i++) {
    const th0 = (2 * Math.PI * i) / 6 + 0.08;
    const th1 = (2 * Math.PI * (i + 1)) / 6 - 0.08;
    gAzRing.addConcentricArcStrip({
      rInner: 1.24,
      rOuter: 1.40,
      yBot: -0.02,
      yTop: 0.025,
      thStart: th0,
      thEnd: th1,
      steps: 3,
      bevelIn: 0.01,
    });
  }
  const azRingMesh = scene.addMesh('PedestalAzimuthRing_Mesh', [gAzRing]);
  const azRingNodeIdx = scene.addNode({
    name: 'PedestalAzimuthRing',
    meshIndex: azRingMesh,
    translation: [0, 1.355, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 2. 360-Degree Rotating Turret Node: 'Turret' (pivot = [0, 1.34, 0], +X forward)
  //    NOTE: 'Turret' has ZERO animation tracks in 'idle' so the game engine can
  //    freely rotate Turret around +Y (0..360 deg) at runtime without track conflict!
  // -------------------------------------------------------------------------
  const turretPivotY = 1.34;
  const turretNodeIdx = scene.addNode({
    name: 'Turret',
    translation: [0, turretPivotY, 0],
    parentIndex: rootIdx,
  });

  const gTurIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gTurIvoryHi = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gTurGold = new PrimitiveGeom(mats.Mat_Gold);
  const gTurGoldHi = new PrimitiveGeom(mats.Mat_GoldBright);
  const gTurBronze = new PrimitiveGeom(mats.Mat_BronzeCrucible);
  const gTurStone = new PrimitiveGeom(mats.Mat_StoneDark);
  const gTurPhoton = new PrimitiveGeom(mats.Mat_PhotonCore);

  // Circular Turret Bearing Drum & Sculpted Armored Yoke Cradle (local Y = 0.00 .. 1.38)
  gTurBronze.addLoft(
    [
      makeCardinalAlignedRing(12, 1.22, 0.00),
      makeCardinalAlignedRing(12, 1.16, 0.24),
    ],
    [[0, 0.00, 0], [0, 0.24, 0]],
    true,
    true
  );

  // Rear Armored Capacitor Breech & Counterweight Housing (local X = -1.36 .. +0.18, Y = 0.22 .. 1.48)
  gTurIvory.addLoft(
    [
      makeRectChamferRing(0.84, 0.92, 0.28, 0.22, -0.44, 0),
      makeRectChamferRing(0.92, 1.02, 0.30, 0.86, -0.42, 0),
      makeRectChamferRing(0.70, 0.78, 0.24, 1.46, -0.46, 0),
    ],
    [[-0.44, 0.22, 0], [-0.42, 0.86, 0], [-0.46, 1.46, 0]],
    true,
    true
  );

  // Sleek Tapered Dorsal Targeting Sensor Crest sweeping forward toward +X (local Y = 1.42 .. 1.98)
  gTurIvoryHi.addTubeAlongSpine(
    [
      { pos: [-0.84, 1.42, 0], rx: 0.24, ry: 0.20 },
      { pos: [-0.24, 1.82, 0], rx: 0.20, ry: 0.18 },
      { pos: [0.46, 1.88, 0], rx: 0.13, ry: 0.12 },
      { pos: [0.92, 1.72, 0], rx: 0.04, ry: 0.04 },
    ],
    4,
    true,
    true
  );
  gTurGoldHi.addTubeAlongSpine(
    [
      { pos: [-0.88, 1.48, 0], rx: 0.10, ry: 0.09 },
      { pos: [-0.24, 1.92, 0], rx: 0.09, ry: 0.08 },
      { pos: [0.48, 1.96, 0], rx: 0.07, ry: 0.06 },
      { pos: [0.96, 1.76, 0], rx: 0.03, ry: 0.03 },
    ],
    4,
    true,
    true
  );

  // Twin Prominent Forward-Projecting Directional Emitter Prongs (+X Barrel Assembly, X = -0.10 .. +1.96!)
  // Gives Aegis Relay an unmistakable directional weapon silhouette from RTS camera zoom!
  for (const side of [-1, 1]) {
    // Sculpted Ivory & Gold lateral emitter rail prong
    gTurIvoryHi.addTubeAlongSpine(
      [
        { pos: [-0.14, 0.92, side * 0.68], rx: 0.26, ry: 0.20 },
        { pos: [0.84, 0.92, side * 0.52], rx: 0.22, ry: 0.16 },
        { pos: [1.86, 0.92, side * 0.34], rx: 0.14, ry: 0.11 },
      ],
      4,
      true,
      true
    );
    // Gleaming Gold outer barrel trim along each emitter prong
    gTurGoldHi.addTubeAlongSpine(
      [
        { pos: [-0.10, 0.98, side * 0.78], rx: 0.10, ry: 0.09 },
        { pos: [0.86, 0.96, side * 0.60], rx: 0.09, ry: 0.08 },
        { pos: [1.92, 0.94, side * 0.38], rx: 0.065, ry: 0.06 },
      ],
      4,
      true,
      true
    );
  }

  // Ventral Under-Barrel Stabilizer Keel projecting toward +X
  gTurGold.addTubeAlongSpine(
    [
      { pos: [-0.10, 0.50, 0], rx: 0.18, ry: 0.16 },
      { pos: [1.18, 0.62, 0], rx: 0.13, ry: 0.12 },
      { pos: [1.82, 0.72, 0], rx: 0.08, ry: 0.08 },
    ],
    4,
    true,
    true
  );

  // READABLE FORWARD MUZZLE COLLAR & CROWN BEZEL at local X = +1.84 .. +2.04, Y = 0.92, Z = 0!
  const muzRings = [];
  const muzCenters = [];
  for (let s = 0; s < 8; s++) {
    const th = (2 * Math.PI * s) / 8;
    const cy = Math.cos(th), sz = Math.sin(th);
    muzRings.push([
      [1.82, 0.92 + cy * 0.36, sz * 0.36],
      [2.04, 0.92 + cy * 0.32, sz * 0.32],
      [2.04, 0.92 + cy * 0.20, sz * 0.20],
      [1.82, 0.92 + cy * 0.22, sz * 0.22],
    ]);
    muzCenters.push([1.93, 0.92 + cy * 0.28, sz * 0.28]);
  }
  gTurGoldHi.addCyclicRingLoft(muzRings, muzCenters);

  // Dark inner bore recess & bright glowing forward muzzle aperture core at X = 2.01!
  gTurStone.addChamferBox({
    center: [1.86, 0.92, 0],
    size: [0.16, 0.34, 0.34],
    rotDeg: [45, 0, 0],
  });
  gTurPhoton.addFacetedCrystal({
    center: [1.98, 0.92, 0],
    radii: [0.10, 0.20, 0.20],
    sectors: 8,
    stacks: 4,
  });

  // Twin Bold Turret Shoulder Team Shields (Surf_TEAM_TurretR / Surf_TEAM_TurretL)
  const turTeamPoly = [
    [-0.58, -0.30],
    [0.58, -0.30],
    [0.44, 0.30],
    [-0.36, 0.34],
  ];
  for (const [tName, side] of [
    ['Surf_TEAM_TurretR', 1],
    ['Surf_TEAM_TurretL', -1],
  ]) {
    const pos = [-0.36, 1.06, side * 0.94];
    const out = vNorm([0.08, 0.42, side * 0.90]);
    const up = [0, 0.90, -side * 0.42];
    gTurGoldHi.addOrientedShield(
      pos,
      out,
      up,
      turTeamPoly.map(([x, y]) => [x * 1.12, y * 1.14]),
      0.05,
      0.90,
      0.015
    );
    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(vAdd(pos, vScale(out, 0.034)), out, up, turTeamPoly, 0.064, 0.88, 0.02);
    const tMesh = scene.addMesh(tName, [gTeam]);
    scene.addNode({ name: tName, meshIndex: tMesh, parentIndex: turretNodeIdx });
  }

  // Turret Rear & Dorsal Crest Surf_GLOW_* Gems (rotate with Turret!)
  for (const [gName, gPos, gRad] of [
    ['Surf_GLOW_TurretRear', [-1.34, 0.92, 0], [0.14, 0.22, 0.22]],
    ['Surf_GLOW_TurretCrest', [-0.22, 2.02, 0], [0.16, 0.13, 0.14]],
  ]) {
    gTurGold.addChamferBox({
      center: [gPos[0] + (gPos[0] < -1 ? 0.08 : 0), gPos[1] - 0.06, gPos[2]],
      size: [0.24, 0.16, 0.30],
    });
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({ center: gPos, radii: gRad, sectors: 6, stacks: 4 });
    const gMesh = scene.addMesh(gName, [gGlow]);
    scene.addNode({ name: gName, meshIndex: gMesh, parentIndex: turretNodeIdx });
  }

  const turretHousingMesh = scene.addMesh('TurretHousing_Mesh', [
    gTurIvory,
    gTurIvoryHi,
    gTurGold,
    gTurGoldHi,
    gTurBronze,
    gTurStone,
    gTurPhoton,
  ]);
  scene.addNode({
    name: 'TurretHousing',
    meshIndex: turretHousingMesh,
    parentIndex: turretNodeIdx,
  });

  // Directional Photon Emitter Core & Translucent Focusing Lens (child of Turret, animated pulse in 'idle')
  const coreLocalPos = [0.84, 0.92, 0];
  const gEmitCore = new PrimitiveGeom(mats.Mat_PhotonCore);
  const gEmitLens = new PrimitiveGeom(mats.Mat_PhotonLens);
  gEmitCore.addTubeAlongSpine(
    [
      { pos: [-0.72, 0, 0], rx: 0.20, ry: 0.20 },
      { pos: [0.28, 0, 0], rx: 0.17, ry: 0.17 },
      { pos: [0.98, 0, 0], rx: 0.13, ry: 0.13 },
    ],
    6,
    true,
    true
  );
  gEmitLens.addTubeAlongSpine(
    [
      { pos: [-0.56, 0, 0], rx: 0.28, ry: 0.28 },
      { pos: [0.96, 0, 0], rx: 0.21, ry: 0.21 },
      { pos: [1.22, 0, 0], rx: 0.24, ry: 0.24 },
    ],
    8,
    true,
    true
  );
  const emitCoreMesh = scene.addMesh('EmitterCore_Mesh', [gEmitCore, gEmitLens]);
  const emitCoreNodeIdx = scene.addNode({
    name: 'EmitterCore',
    meshIndex: emitCoreMesh,
    translation: coreLocalPos,
    parentIndex: turretNodeIdx,
  });

  // Rotating Hexagonal Photon Focusing Iris Ring around the Emitter Barrel (child of Turret at X = +1.36)
  const focusPos = [1.36, 0.92, 0];
  const gFocusGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gFocusCyan = new PrimitiveGeom(mats.Mat_PhotonCore);
  const fRings = [];
  const fCenters = [];
  for (let s = 0; s < 6; s++) {
    const th = (2 * Math.PI * s) / 6;
    const cy = Math.cos(th), sz = Math.sin(th);
    fRings.push([
      [-0.05, cy * 0.42, sz * 0.42],
      [0.05, cy * 0.42, sz * 0.42],
      [0.05, cy * 0.30, sz * 0.30],
      [-0.05, cy * 0.30, sz * 0.30],
    ]);
    fCenters.push([0, cy * 0.36, sz * 0.36]);
  }
  gFocusGold.addCyclicRingLoft(fRings, fCenters);
  for (let s = 0; s < 3; s++) {
    const th = (2 * Math.PI * s) / 3;
    gFocusCyan.addFacetedCrystal({
      center: [0, Math.cos(th) * 0.42, Math.sin(th) * 0.42],
      radii: [0.08, 0.07, 0.07],
      sectors: 5,
      stacks: 4,
    });
  }
  const focusRingMesh = scene.addMesh('EmitterFocusRing_Mesh', [gFocusGold, gFocusCyan]);
  const focusRingNodeIdx = scene.addNode({
    name: 'EmitterFocusRing',
    meshIndex: focusRingMesh,
    translation: focusPos,
    parentIndex: turretNodeIdx,
  });

  // FORWARD MUZZLE SOCKET NODE: 'Muzzle' (child of 'Turret', local [2.10, 0.92, 0.0], world [2.10, 2.26, 0.0])
  // Faces +X in both local and world space; rotates 360° with 'Turret'!
  scene.addNode({
    name: 'Muzzle',
    translation: [2.10, 0.92, 0.0],
    parentIndex: turretNodeIdx,
  });

  // -------------------------------------------------------------------------
  // 3. Seamless Looping 'idle' Animation (2.8s emitter charge pulse & focus ring spin)
  //    Leaves 'Turret' rotation untouched so game engine 360° aiming has full control!
  // -------------------------------------------------------------------------
  const aTimes = [0.0, 0.7, 1.4, 2.1, 2.8];
  scene.addAnimation('idle', [
    {
      nodeIndex: emitCoreNodeIdx,
      path: 'scale',
      times: aTimes,
      values: [
        [1.0, 1.0, 1.0],
        [1.02, 1.09, 1.09],
        [1.0, 1.0, 1.0],
        [0.99, 0.94, 0.94],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: focusRingNodeIdx,
      path: 'rotation',
      times: aTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(28, 0, 0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-28, 0, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: azRingNodeIdx,
      path: 'rotation',
      times: aTimes,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 15, 0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -15, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
  ]);

  return scene.buildGLB('AegisRelayScene');
}

// ---------------------------------------------------------------------------
// Self-Validation Summary & CLI Entry Point
// ---------------------------------------------------------------------------

function summarizeIndustryAsset(filename, glbBuffer, gltf) {
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

  const forge = buildPrismForgeGLB();
  fs.writeFileSync(path.join(outDir, 'prism_forge.glb'), forge.glb);

  const foundry = buildRoboticsFoundryGLB();
  fs.writeFileSync(path.join(outDir, 'robotics_foundry.glb'), foundry.glb);

  const relay = buildAegisRelayGLB();
  fs.writeFileSync(path.join(outDir, 'aegis_relay_ladder.glb'), relay.glb);

  const summary = [
    summarizeIndustryAsset('prism_forge.glb', forge.glb, forge.gltf),
    summarizeIndustryAsset('robotics_foundry.glb', foundry.glb, foundry.gltf),
    summarizeIndustryAsset('aegis_relay_ladder.glb', relay.glb, relay.gltf),
  ];

  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildPrismForgeGLB,
  buildRoboticsFoundryGLB,
  buildAegisRelayGLB,
};
