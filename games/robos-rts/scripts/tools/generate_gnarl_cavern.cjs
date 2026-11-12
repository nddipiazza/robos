#!/usr/bin/env node
'use strict';

/**
 * Starfall Command — Gnarl Brood Carapace Cavern & Carapace Bulwark GLB Generator
 *
 * Standalone deterministic procedural glTF 2.0 binary (.glb) generator (zero dependencies):
 *   1. carapace_cavern.glb          — Broad organic Gnarl Brood bio-foundry (radius ~2.5,
 *                                     height ~3.8, Y up, +X forward, floor Y=0, no floor geometry)
 *                                     with giant ivory-bone tusks framing a deep chitin mouth,
 *                                     Surf_TEAM armor, Surf_GLOW accents, and looping 'idle' clip.
 *   2. carapace_bulwark_ladder.glb  — Massive stocky armored six-legged melee juggernaut
 *                                     (radius ~2.5, height ~3.5, Y up, +X forward, floor Y=0,
 *                                     no floor geometry) with two long blade mandibles, clear
 *                                     wide scissoring attack sweep, anchors 'BladeLeft' &
 *                                     'BladeRight', Surf_TEAM armor, Surf_GLOW accents, and
 *                                     'idle', 'walk', 'attack', 'burrow', 'surface', 'death' clips.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Deterministic Math & Quaternion Utilities
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const deg = (d) => (d * Math.PI) / 180;
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vScale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vLerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vCross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const vLen = (a) => Math.hypot(a[0], a[1], a[2]);
const vNorm = (a) => {
  const l = vLen(a);
  return l > 1e-10 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
};

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

// Applies X roll first, then Y yaw, then Z pitch: q = qZ * qY * qX
function quatEuler(rxDeg, ryDeg, rzDeg) {
  const rx = deg(rxDeg) * 0.5;
  const ry = deg(ryDeg) * 0.5;
  const rz = deg(rzDeg) * 0.5;
  const qx = [Math.sin(rx), 0, 0, Math.cos(rx)];
  const qy = [0, Math.sin(ry), 0, Math.cos(ry)];
  const qz = [0, 0, Math.sin(rz), Math.cos(rz)];
  return quatMul(qz, quatMul(qy, qx));
}

function quatConj(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

function quatLerpNorm(a, b, t) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  if (a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  const x = a[0] + (bx - a[0]) * t;
  const y = a[1] + (by - a[1]) * t;
  const z = a[2] + (bz - a[2]) * t;
  const w = a[3] + (bw - a[3]) * t;
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

function rotQuat(v, q) {
  const u = [q[0], q[1], q[2]];
  const s = q[3];
  const d = vDot(u, v);
  const c = vCross(u, v);
  const uu = vDot(u, u);
  return [
    2 * d * u[0] + (s * s - uu) * v[0] + 2 * s * c[0],
    2 * d * u[1] + (s * s - uu) * v[1] + 2 * s * c[1],
    2 * d * u[2] + (s * s - uu) * v[2] + 2 * s * c[2],
  ];
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexRGBA(hex, alpha = 1.0) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [
    Number(srgbToLinear(r).toFixed(6)),
    Number(srgbToLinear(g).toFixed(6)),
    Number(srgbToLinear(b).toFixed(6)),
    Number(alpha.toFixed(6)),
  ];
}

function hexRGB(hex, boost = 1.0) {
  const [r, g, b] = hexRGBA(hex, 1.0);
  return [
    Number(Math.min(1.0, r * boost).toFixed(6)),
    Number(Math.min(1.0, g * boost).toFixed(6)),
    Number(Math.min(1.0, b * boost).toFixed(6)),
  ];
}

// ---------------------------------------------------------------------------
// Low-Poly Flat-Shaded Geometry Builder (Verified Outward Winding)
// ---------------------------------------------------------------------------

class Geom {
  constructor(materialIndex) {
    this.materialIndex = materialIndex;
    this.positions = [];
    this.normals = [];
    this.indices = [];
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  isEmpty() {
    return this.indices.length === 0;
  }

  addTri(a, b, c, outwardHint = null) {
    const raw = vCross(vSub(b, a), vSub(c, a));
    if (vLen(raw) < 1e-9) return;
    let n = vNorm(raw);
    let p1 = b, p2 = c;
    if (outwardHint && vDot(n, outwardHint) < 0) {
      n = vScale(n, -1);
      p1 = c;
      p2 = b;
    }
    const base = this.vertexCount;
    this.positions.push(a[0], a[1], a[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    this.normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
    this.indices.push(base, base + 1, base + 2);
  }

  addQuad(a, b, c, d, outwardHint = null) {
    this.addTri(a, b, c, outwardHint);
    this.addTri(a, c, d, outwardHint);
  }

  addCap(ring, normalHint) {
    if (ring.length < 3) return;
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
    const ctr = [cx / ring.length, cy / ring.length, cz / ring.length];
    for (let i = 0; i < ring.length; i++) {
      this.addTri(ctr, ring[i], ring[(i + 1) % ring.length], normalHint);
    }
  }

  addLoft(rings, centers = null, capStart = true, capEnd = true, outwardSign = 1) {
    if (rings.length < 2) return;
    const segs = rings[0].length;
    const ctrs = centers || rings.map((r) => {
      let sx = 0, sy = 0, sz = 0;
      for (const p of r) { sx += p[0]; sy += p[1]; sz += p[2]; }
      return [sx / r.length, sy / r.length, sz / r.length];
    });

    for (let k = 0; k < rings.length - 1; k++) {
      const r0 = rings[k], r1 = rings[k + 1];
      const midC = vLerp(ctrs[k], ctrs[k + 1], 0.5);
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % segs;
        const a = r0[i], b = r0[j], c = r1[j], d = r1[i];
        const qMid = vScale(vAdd(vAdd(a, b), vAdd(c, d)), 0.25);
        this.addQuad(a, b, c, d, vScale(vSub(qMid, midC), outwardSign));
      }
    }
    if (capStart) {
      const dir = vSub(ctrs[0], ctrs[1]);
      this.addCap(rings[0], vLen(dir) > 1e-6 ? dir : [0, -1, 0]);
    }
    if (capEnd) {
      const last = rings.length - 1;
      const dir = vSub(ctrs[last], ctrs[last - 1]);
      this.addCap(rings[last], vLen(dir) > 1e-6 ? dir : [0, 1, 0]);
    }
  }

  addTube(stations, sides = 6, capStart = true, capEnd = true, upHint = [0, 1, 0], minY = null) {
    if (stations.length < 2) return;
    const rings = [];
    const ctrs = [];
    let prevUp = vNorm(upHint);

    for (let k = 0; k < stations.length; k++) {
      const cur = stations[k].pos;
      const tang = k === 0
        ? vNorm(vSub(stations[1].pos, cur))
        : k === stations.length - 1
          ? vNorm(vSub(cur, stations[k - 1].pos))
          : vNorm(vSub(stations[k + 1].pos, stations[k - 1].pos));

      let side = vCross(tang, prevUp);
      if (vLen(side) < 1e-4) side = vCross(tang, [0, 0, 1]);
      if (vLen(side) < 1e-4) side = vCross(tang, [1, 0, 0]);
      side = vNorm(side);
      const up = vNorm(vCross(side, tang));
      prevUp = up;

      const rx = stations[k].rx ?? stations[k].r ?? 0.12;
      const ry = stations[k].ry ?? stations[k].r ?? 0.12;
      const ring = [];
      for (let i = 0; i < sides; i++) {
        const th = (2 * Math.PI * i) / sides + Math.PI / sides;
        const pt = vAdd(cur, vAdd(vScale(side, Math.cos(th) * rx), vScale(up, Math.sin(th) * ry)));
        if (minY !== null && pt[1] < minY) pt[1] = minY;
        ring.push(pt);
      }
      rings.push(ring);
      const cp = [...cur];
      if (minY !== null && cp[1] < minY) cp[1] = minY;
      ctrs.push(cp);
    }
    this.addLoft(rings, ctrs, capStart, capEnd);
  }

  /**
   * Asymmetric 6-point hexagonal blade / tusk loft with thick armored back spine
   * along -edgeDir and sharp cutting bevel along +edgeDir.
   * Optionally writes the gleaming razor bevel strip into `edgeGeom`.
   */
  addBlade(stations, edgeGeom = null, minY = null) {
    const bodyRings = [];
    const bodyCtrs = [];
    const razorRings = [];
    const razorCtrs = [];

    for (let k = 0; k < stations.length; k++) {
      const st = stations[k];
      const cur = st.pos;
      const tang = k === 0
        ? vNorm(vSub(stations[1].pos, cur))
        : k === stations.length - 1
          ? vNorm(vSub(cur, stations[k - 1].pos))
          : vNorm(vSub(stations[k + 1].pos, stations[k - 1].pos));

      const edge = vNorm(vSub(st.edgeDir, vScale(tang, vDot(st.edgeDir, tang))));
      const nrm = vNorm(vCross(tang, edge));

      const bw = st.backW;
      const ew = st.edgeW;
      const th = st.thick * 0.5;
      const clampPt = (p) => {
        const out = [...p];
        if (minY !== null && out[1] < minY) out[1] = minY;
        return out;
      };

      const pBack = clampPt(vAdd(cur, vScale(edge, -bw)));
      const pTopB = clampPt(vAdd(cur, vAdd(vScale(edge, -bw * 0.35), vScale(nrm, th))));
      const pTopF = clampPt(vAdd(cur, vAdd(vScale(edge, ew * 0.55), vScale(nrm, th * 0.52))));
      const pEdge = clampPt(vAdd(cur, vScale(edge, ew)));
      const pBotF = clampPt(vAdd(cur, vAdd(vScale(edge, ew * 0.55), vScale(nrm, -th * 0.52))));
      const pBotB = clampPt(vAdd(cur, vAdd(vScale(edge, -bw * 0.35), vScale(nrm, -th))));

      if (edgeGeom) {
        bodyRings.push([pBack, pTopB, pTopF, pBotF, pBotB]);
        bodyCtrs.push(clampPt(vAdd(cur, vScale(edge, -bw * 0.15))));
        razorRings.push([pTopF, pEdge, pBotF, clampPt(vAdd(cur, vScale(edge, ew * 0.42)))]);
        razorCtrs.push(clampPt(vAdd(cur, vScale(edge, ew * 0.62))));
      } else {
        bodyRings.push([pBack, pTopB, pTopF, pEdge, pBotF, pBotB]);
        bodyCtrs.push(clampPt(cur));
      }
    }

    this.addLoft(bodyRings, bodyCtrs, true, true);
    if (edgeGeom) edgeGeom.addLoft(razorRings, razorCtrs, true, true);
  }

  addCarapacePlate({
    center = [0, 0, 0],
    size = [1, 0.2, 1],
    rotDeg = [0, 0, 0],
    topScale = [0.80, 0.82],
    botScale = [1.0, 1.0],
    chamfer = 0.22,
    dome = 0.04,
    minY = null,
  }) {
    const q = quatEuler(rotDeg[0], rotDeg[1], rotDeg[2]);
    const hx = size[0] * 0.5, hy = size[1] * 0.5, hz = size[2] * 0.5;
    const makeRing = (sx, sz, y) => {
      const rx = hx * sx, rz = hz * sz;
      const cx = Math.min(rx, rz) * chamfer * 2.0;
      return [
        [rx, y, -rz + cx], [rx, y, rz - cx],
        [rx - cx, y, rz], [-rx + cx, y, rz],
        [-rx, y, rz - cx], [-rx, y, -rz + cx],
        [-rx + cx, y, -rz], [rx - cx, y, -rz],
      ];
    };
    const xf = (p) => {
      const w = vAdd(center, rotQuat(p, q));
      if (minY !== null && w[1] < minY) w[1] = minY;
      return w;
    };
    const rBot = makeRing(botScale[0], botScale[1], -hy).map(xf);
    const rTop = makeRing(topScale[0], topScale[1], hy).map(xf);
    const cBot = xf([0, -hy, 0]);
    const cTop = xf([0, hy + dome, 0]);
    this.addLoft([rBot, rTop], [cBot, cTop], false, false);
    const downDir = rotQuat([0, -1, 0], q);
    const upDir = rotQuat([0, 1, 0], q);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      this.addTri(cBot, rBot[i], rBot[j], downDir);
      this.addTri(cTop, rTop[j], rTop[i], upDir);
    }
  }

  addShieldPad({
    center = [0, 0, 0],
    rotDeg = [0, 0, 0],
    rx = 0.35,
    rz = 0.30,
    thickness = 0.08,
    bevel = 0.78,
    sides = 6,
    dome = 0.03,
    minY = null,
  }) {
    const q = quatEuler(rotDeg[0], rotDeg[1], rotDeg[2]);
    const xf = (p) => {
      const w = vAdd(center, rotQuat(p, q));
      if (minY !== null && w[1] < minY) w[1] = minY;
      return w;
    };
    const bot = [], top = [];
    for (let i = 0; i < sides; i++) {
      const a = (2 * Math.PI * i) / sides + Math.PI / sides;
      const cs = Math.cos(a), sn = Math.sin(a);
      bot.push(xf([cs * rx, 0, sn * rz]));
      top.push(xf([cs * rx * bevel, thickness, sn * rz * bevel]));
    }
    const cB = xf([0, 0, 0]);
    const cT = xf([0, thickness + dome, 0]);
    const up = rotQuat([0, 1, 0], q);
    this.addLoft([bot, top], [cB, cT], false, false);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.addTri(cB, bot[i], bot[j], vScale(up, -1));
      this.addTri(cT, top[j], top[i], up);
    }
  }

  addSpheroid({
    center = [0, 0, 0],
    radii = [0.5, 0.5, 0.5],
    rotDeg = [0, 0, 0],
    sectors = 10,
    stacks = 5,
    flattenBottom = 0.0,
    ribCount = 0,
    ribAmp = 0.0,
    minY = null,
  }) {
    const q = quatEuler(rotDeg[0], rotDeg[1], rotDeg[2]);
    const xf = (p) => {
      const w = vAdd(center, rotQuat(p, q));
      if (minY !== null && w[1] < minY) w[1] = minY;
      return w;
    };
    const rings = [], ctrs = [];
    for (let st = 1; st < stacks; st++) {
      const v = st / stacks;
      const phi = (v - 0.5) * Math.PI * 0.92;
      let y = Math.sin(phi) * radii[1];
      if (y < 0 && flattenBottom > 0) y *= 1.0 - flattenBottom;
      const rCos = Math.cos(phi);
      const ring = [];
      for (let s = 0; s < sectors; s++) {
        const th = (2 * Math.PI * s) / sectors;
        const rib = ribCount > 0 ? 1.0 + ribAmp * Math.cos(ribCount * th) : 1.0;
        ring.push(xf([Math.cos(th) * rCos * radii[0] * rib, y, Math.sin(th) * rCos * radii[2] * rib]));
      }
      rings.push(ring);
      ctrs.push(xf([0, y, 0]));
    }
    const botY = -radii[1] * (1.0 - flattenBottom * 0.95);
    const botPole = xf([0, botY, 0]);
    const topPole = xf([0, radii[1], 0]);
    this.addLoft(rings, ctrs, false, false);
    const last = rings.length - 1;
    for (let s = 0; s < sectors; s++) {
      const j = (s + 1) % sectors;
      const mB = vScale(vAdd(botPole, vAdd(rings[0][s], rings[0][j])), 1 / 3);
      this.addTri(botPole, rings[0][j], rings[0][s], vSub(mB, xf([0, 0, 0])));
      const mT = vScale(vAdd(topPole, vAdd(rings[last][s], rings[last][j])), 1 / 3);
      this.addTri(topPole, rings[last][s], rings[last][j], vSub(mT, xf([0, 0, 0])));
    }
  }
}

// ---------------------------------------------------------------------------
// glTF 2.0 Binary (.glb) Builder
// ---------------------------------------------------------------------------

class GLBScene {
  constructor(generator) {
    this.generator = generator;
    this.materials = [];
    this.meshes = [];
    this.nodes = [];
    this.animations = [];
    this.bufferChunks = [];
    this.bufferViews = [];
    this.accessors = [];
    this.byteOffset = 0;
  }

  addMaterial({
    name,
    hex,
    alpha = 1.0,
    metallic = 0.20,
    roughness = 0.46,
    emissiveHex = null,
    emissiveBoost = 1.0,
    doubleSided = false,
  }) {
    const mat = {
      name,
      pbrMetallicRoughness: {
        baseColorFactor: hexRGBA(hex, alpha),
        metallicFactor: Number(metallic.toFixed(4)),
        roughnessFactor: Number(roughness.toFixed(4)),
      },
    };
    if (emissiveHex) mat.emissiveFactor = hexRGB(emissiveHex, emissiveBoost);
    if (alpha < 1.0) mat.alphaMode = 'BLEND';
    if (doubleSided) mat.doubleSided = true;
    this.materials.push(mat);
    return this.materials.length - 1;
  }

  _appendBuf(buf, target) {
    const pad = (4 - (buf.length % 4)) % 4;
    const aligned = pad > 0 ? Buffer.concat([buf, Buffer.alloc(pad, 0)]) : buf;
    const bv = { buffer: 0, byteOffset: this.byteOffset, byteLength: buf.length };
    if (target !== undefined) bv.target = target;
    this.bufferViews.push(bv);
    this.bufferChunks.push(aligned);
    this.byteOffset += aligned.length;
    return this.bufferViews.length - 1;
  }

  _floatAccessor(arr, comps, type, target) {
    const buf = Buffer.alloc(arr.length * 4);
    const min = new Array(comps).fill(Infinity);
    const max = new Array(comps).fill(-Infinity);
    for (let i = 0; i < arr.length; i++) {
      buf.writeFloatLE(arr[i], i * 4);
      const f = buf.readFloatLE(i * 4);
      const c = i % comps;
      if (f < min[c]) min[c] = f;
      if (f > max[c]) max[c] = f;
    }
    const bv = this._appendBuf(buf, target);
    this.accessors.push({
      bufferView: bv,
      componentType: 5126,
      count: arr.length / comps,
      type,
      min: min.map((v) => Number(v.toFixed(6))),
      max: max.map((v) => Number(v.toFixed(6))),
    });
    return this.accessors.length - 1;
  }

  _u16Accessor(arr, target) {
    const buf = Buffer.alloc(arr.length * 2);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      buf.writeUInt16LE(arr[i], i * 2);
      if (arr[i] < mn) mn = arr[i];
      if (arr[i] > mx) mx = arr[i];
    }
    const bv = this._appendBuf(buf, target);
    this.accessors.push({
      bufferView: bv,
      componentType: 5123,
      count: arr.length,
      type: 'SCALAR',
      min: [mn],
      max: [mx],
    });
    return this.accessors.length - 1;
  }

  addMesh(name, geoms) {
    const primitives = [];
    for (const g of geoms) {
      if (!g || g.isEmpty()) continue;
      if (g.vertexCount > 65535) throw new Error(`Mesh ${name} exceeds uint16 vertices`);
      primitives.push({
        attributes: {
          POSITION: this._floatAccessor(g.positions, 3, 'VEC3', 34962),
          NORMAL: this._floatAccessor(g.normals, 3, 'VEC3', 34962),
        },
        indices: this._u16Accessor(g.indices, 34963),
        material: g.materialIndex,
        mode: 4,
      });
    }
    if (!primitives.length) throw new Error(`Empty mesh: ${name}`);
    this.meshes.push({ name, primitives });
    return this.meshes.length - 1;
  }

  addNode({ name, meshIndex = null, translation = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1], parentIndex = null }) {
    const node = {
      name,
      translation: translation.map((v) => Number(v.toFixed(6))),
      rotation: rotation.map((v) => Number(v.toFixed(7))),
      scale: scale.map((v) => Number(v.toFixed(6))),
    };
    if (meshIndex !== null) node.mesh = meshIndex;
    const idx = this.nodes.length;
    this.nodes.push(node);
    if (parentIndex !== null) {
      if (!this.nodes[parentIndex].children) this.nodes[parentIndex].children = [];
      this.nodes[parentIndex].children.push(idx);
    }
    return idx;
  }

  addMeshNode(name, geoms, parentIndex, translation = [0, 0, 0], rotation = [0, 0, 0, 1]) {
    const meshIndex = this.addMesh(name, geoms);
    return this.addNode({ name, meshIndex, translation, rotation, parentIndex });
  }

  addAnimation(name, tracks) {
    const samplers = [];
    const channels = [];
    const timeCache = new Map();
    for (const tr of tracks) {
      const tKey = tr.times.map((t) => t.toFixed(5)).join(',');
      let inAcc = timeCache.get(tKey);
      if (inAcc === undefined) {
        inAcc = this._floatAccessor(tr.times, 1, 'SCALAR');
        timeCache.set(tKey, inAcc);
      }
      const comps = tr.path === 'rotation' ? 4 : 3;
      const type = tr.path === 'rotation' ? 'VEC4' : 'VEC3';
      const flat = [];
      for (const v of tr.values) {
        for (let c = 0; c < comps; c++) flat.push(v[c]);
      }
      const outAcc = this._floatAccessor(flat, comps, type);
      const sIdx = samplers.length;
      samplers.push({ input: inAcc, output: outAcc, interpolation: 'LINEAR' });
      channels.push({ sampler: sIdx, target: { node: tr.nodeIndex, path: tr.path } });
    }
    this.animations.push({ name, samplers, channels });
  }

  buildGLB(sceneName) {
    const childSet = new Set();
    for (const n of this.nodes) {
      for (const c of n.children || []) childSet.add(c);
    }
    const rootNodes = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (!childSet.has(i)) rootNodes.push(i);
    }

    const binChunk = Buffer.concat(this.bufferChunks);
    const gltf = {
      asset: { version: '2.0', generator: this.generator },
      scene: 0,
      scenes: [{ name: sceneName, nodes: rootNodes }],
      nodes: this.nodes,
      materials: this.materials,
      meshes: this.meshes,
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [{ byteLength: binChunk.length }],
      animations: this.animations,
    };

    const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
    const jsonChunk = jsonPad > 0 ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;

    const totalLen = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
    const hdr = Buffer.alloc(12);
    hdr.writeUInt32LE(0x46546c67, 0);
    hdr.writeUInt32LE(2, 4);
    hdr.writeUInt32LE(totalLen, 8);

    const jHdr = Buffer.alloc(8);
    jHdr.writeUInt32LE(jsonChunk.length, 0);
    jHdr.writeUInt32LE(0x4e4f534a, 4);

    const bHdr = Buffer.alloc(8);
    bHdr.writeUInt32LE(binChunk.length, 0);
    bHdr.writeUInt32LE(0x004e4942, 4);

    return { glb: Buffer.concat([hdr, jHdr, jsonChunk, bHdr, binChunk]), gltf };
  }
}

// ---------------------------------------------------------------------------
// Shared Gnarl Brood Heavy Carapace Palette
// ---------------------------------------------------------------------------

function createGnarlPalette(scene) {
  return {
    // Dedicated team armor & glow materials (matched on material & mesh & node names)
    Surf_TEAM: scene.addMaterial({
      name: 'Surf_TEAM',
      hex: '#ee4a3c',
      metallic: 0.20,
      roughness: 0.40,
      emissiveHex: '#cc3226',
      emissiveBoost: 0.35,
    }),
    Surf_GLOW: scene.addMaterial({
      name: 'Surf_GLOW',
      hex: '#ff7462',
      metallic: 0.0,
      roughness: 0.20,
      emissiveHex: '#ff5240',
      emissiveBoost: 1.0,
    }),
    Mat_Chitin: scene.addMaterial({
      name: 'Mat_Chitin',
      hex: '#543866',
      metallic: 0.22,
      roughness: 0.46,
    }),
    Mat_ChitinRidge: scene.addMaterial({
      name: 'Mat_ChitinRidge',
      hex: '#a274b8',
      metallic: 0.18,
      roughness: 0.35,
    }),
    Mat_ChitinDark: scene.addMaterial({
      name: 'Mat_ChitinDark',
      hex: '#21142c',
      metallic: 0.28,
      roughness: 0.54,
    }),
    Mat_Bone: scene.addMaterial({
      name: 'Mat_Bone',
      hex: '#e4d6b8',
      metallic: 0.10,
      roughness: 0.35,
    }),
    Mat_BoneEdge: scene.addMaterial({
      name: 'Mat_BoneEdge',
      hex: '#f7efe0',
      metallic: 0.18,
      roughness: 0.24,
      emissiveHex: '#463a28',
      emissiveBoost: 0.18,
    }),
    Mat_BroodFlesh: scene.addMaterial({
      name: 'Mat_BroodFlesh',
      hex: '#6d3444',
      metallic: 0.06,
      roughness: 0.72,
    }),
    Mat_ForgeGreen: scene.addMaterial({
      name: 'Mat_ForgeGreen',
      hex: '#92f024',
      metallic: 0.04,
      roughness: 0.18,
      emissiveHex: '#70d412',
      emissiveBoost: 0.85,
    }),
    Mat_ForgeAmber: scene.addMaterial({
      name: 'Mat_ForgeAmber',
      hex: '#ff9818',
      metallic: 0.02,
      roughness: 0.18,
      emissiveHex: '#db5c00',
      emissiveBoost: 0.88,
    }),
    Mat_MawAbyss: scene.addMaterial({
      name: 'Mat_MawAbyss',
      hex: '#07030c',
      metallic: 0.0,
      roughness: 0.98,
    }),
  };
}

// ---------------------------------------------------------------------------
// MODEL 1: carapace_cavern.glb
// Broad organic foundry with giant tusks framing a deep chitin mouth
// Target: radius ~2.5 (maxHorizRadius <= 2.50), height ~3.8, floor Y=0, no floor geometry
// ---------------------------------------------------------------------------

function buildCarapaceCavern() {
  const scene = new GLBScene('StarfallCommand-GnarlCavernGenerator-1.0');
  const m = createGnarlPalette(scene);
  const root = scene.addNode({ name: 'CarapaceCavern' });

  const gChitin = new Geom(m.Mat_Chitin);
  const gRidge = new Geom(m.Mat_ChitinRidge);
  const gDark = new Geom(m.Mat_ChitinDark);
  const gBone = new Geom(m.Mat_Bone);
  const gBoneEdge = new Geom(m.Mat_BoneEdge);
  const gFlesh = new Geom(m.Mat_BroodFlesh);
  const gAbyss = new Geom(m.Mat_MawAbyss);

  // 1. Broad C-Shaped Organic Foundry Vault around open +X mouth (NO ground floor plate!)
  //    Sweeps from +42 deg (right cheek) around -X (180 deg) to +318 deg (left cheek).
  const arcSteps = 14;
  const wallRings = [];
  const wallCtrs = [];
  const startDeg = 42;
  const endDeg = 318;

  for (let i = 0; i <= arcSteps; i++) {
    const u = i / arcSteps;
    const th = deg(startDeg + (endDeg - startDeg) * u);
    const ca = Math.cos(th), sa = Math.sin(th);
    const rearFactor = Math.max(0, -ca); // peaks at -X
    const rib = 1.0 + 0.045 * Math.cos(6 * th);

    const rOuterBot = (2.18 + 0.14 * rearFactor) * rib;
    const rOuterMid = (2.24 + 0.10 * rearFactor) * rib;
    const rOuterTop = (1.76 + 0.16 * rearFactor) * rib;
    const rInnerTop = 1.04 + 0.12 * rearFactor;
    const rInnerBot = 1.02 + 0.16 * rearFactor;

    const hMid = 1.08 + 0.22 * rearFactor;
    const hPeak = 2.28 + 0.44 * rearFactor;
    const hInTop = 1.92 + 0.34 * rearFactor;

    wallRings.push([
      [ca * rOuterBot, 0.0, sa * rOuterBot],
      [ca * rOuterMid, hMid, sa * rOuterMid],
      [ca * rOuterTop, hPeak, sa * rOuterTop],
      [ca * rInnerTop, hInTop, sa * rInnerTop],
      [ca * rInnerBot, 0.0, sa * rInnerBot],
    ]);
    wallCtrs.push([ca * 1.62, 1.05, sa * 1.62]);
  }
  gChitin.addLoft(wallRings, wallCtrs, true, true);

  // Deep Chitin Mouth Abyss Vault (+X recessed dark cavern ceiling & back-throat wall, open floor!)
  const mawArchSteps = 9;
  const mawFront = [], mawMid = [], mawBack = [];
  for (let i = 0; i <= mawArchSteps; i++) {
    const t = i / mawArchSteps; // 0 (right +Z) .. 1 (left -Z)
    const ang = Math.PI * t;    // 0 .. PI
    const z = Math.cos(ang);
    const yArch = Math.sin(ang);
    mawFront.push([1.48, Math.max(0.0, yArch * 2.02), z * 1.04]);
    mawMid.push([0.35, Math.max(0.0, yArch * 1.88), z * 0.96]);
    mawBack.push([-0.68, Math.max(0.0, yArch * 1.54), z * 0.72]);
  }
  for (let i = 0; i < mawArchSteps; i++) {
    // Inward-facing dark tunnel ceiling & walls (normal points toward tunnel centerline [x, 0.6, 0])
    const qMid1 = vScale(vAdd(vAdd(mawFront[i], mawFront[i + 1]), vAdd(mawMid[i + 1], mawMid[i])), 0.25);
    gAbyss.addQuad(mawFront[i], mawFront[i + 1], mawMid[i + 1], mawMid[i], vSub([0.9, 0.55, 0], qMid1));
    const qMid2 = vScale(vAdd(vAdd(mawMid[i], mawMid[i + 1]), vAdd(mawBack[i + 1], mawBack[i])), 0.25);
    gAbyss.addQuad(mawMid[i], mawMid[i + 1], mawBack[i + 1], mawBack[i], vSub([-0.15, 0.50, 0], qMid2));
  }
  // Dark rear throat wall closing the deep cavity at x = -0.68 (bottom edge at Y=0, no floor geometry)
  const backCtr = [-0.72, 0.55, 0];
  for (let i = 0; i < mawArchSteps; i++) {
    gAbyss.addTri(backCtr, mawBack[i], mawBack[i + 1], [1, 0.1, 0]);
  }

  // Overhanging Tiered Carapace Armor Plates wrapping the foundry flanks & rear
  const tierAngles = [58, 96, 136, 180, 224, 264, 302];
  for (const degAz of tierAngles) {
    const th = deg(degAz);
    const ca = Math.cos(th), sa = Math.sin(th);
    const yaw = -degAz;
    gChitin.addCarapacePlate({
      center: [ca * 1.86, 1.58, sa * 1.86],
      size: [0.72, 0.34, 1.24],
      rotDeg: [0, yaw, -28],
      topScale: [0.78, 0.82],
      dome: 0.06,
      minY: 0.0,
    });
    gRidge.addCarapacePlate({
      center: [ca * 1.72, 1.98, sa * 1.72],
      size: [0.34, 0.14, 1.12],
      rotDeg: [0, yaw, -26],
      topScale: [0.74, 0.86],
      dome: 0.04,
    });
  }

  // 6 Heavy Splayed Basal Buttress Roots + Calcified Bone Claws gripping Y=0 (max r <= 2.49)
  for (const degAz of [66, 114, 158, 202, 246, 294]) {
    const th = deg(degAz);
    const ca = Math.cos(th), sa = Math.sin(th);
    gFlesh.addSpheroid({
      center: [ca * 2.08, 0.28, sa * 2.08],
      radii: [0.42, 0.30, 0.38],
      rotDeg: [0, -degAz, 0],
      sectors: 8,
      stacks: 4,
      flattenBottom: 0.9,
      minY: 0.0,
    });
    gDark.addTube([
      { pos: [ca * 1.72, 1.18, sa * 1.72], rx: 0.28, ry: 0.24 },
      { pos: [ca * 2.18, 0.44, sa * 2.18], rx: 0.24, ry: 0.20 },
      { pos: [ca * 2.38, 0.08, sa * 2.38], rx: 0.14, ry: 0.08 },
    ], 6, true, true, [0, 1, 0], 0.0);
    // High-contrast ivory bone buttress spur so outer footprint pops against dark purple creep
    gBone.addTube([
      { pos: [ca * 1.96, 0.72, sa * 1.96], rx: 0.15, ry: 0.13 },
      { pos: [ca * 2.34, 0.32, sa * 2.34], rx: 0.10, ry: 0.09 },
      { pos: [ca * 2.48, 0.03, sa * 2.48], rx: 0.025, ry: 0.02 },
    ], 5, true, true, [0, 1, 0], 0.0);
  }

  // Forward Tusk Bastion Pedestals on Left (-Z) and Right (+Z) framing the +X mouth
  for (const s of [-1, 1]) {
    gDark.addSpheroid({
      center: [0.92, 0.52, s * 1.44],
      radii: [0.64, 0.56, 0.58],
      sectors: 9,
      stacks: 5,
      flattenBottom: 0.92,
      minY: 0.0,
    });
    gRidge.addTube([
      { pos: [0.76, 0.42, s * 1.38], rx: 0.52, ry: 0.48 },
      { pos: [1.08, 0.68, s * 1.56], rx: 0.46, ry: 0.42 },
    ], 7, true, true, [0, 1, 0], 0.0);

    // Lower jaw framing horn jutting forward along the mouth corner (r = hypot(2.26, 0.92) = 2.44)
    gBone.addBlade([
      { pos: [1.22, 0.36, s * 1.12], edgeDir: [0.2, 0.8, -s * 0.5], backW: 0.18, edgeW: 0.20, thick: 0.24 },
      { pos: [1.84, 0.64, s * 1.04], edgeDir: [0.2, 0.85, -s * 0.45], backW: 0.12, edgeW: 0.15, thick: 0.16 },
      { pos: [2.26, 1.04, s * 0.88], edgeDir: [0.2, 0.9, -s * 0.4], backW: 0.02, edgeW: 0.03, thick: 0.03 },
    ], gBoneEdge, 0.0);
  }

  scene.addMeshNode('CavernVault', [gChitin, gRidge, gDark, gBone, gBoneEdge, gFlesh, gAbyss], root);

  // Cavern Vault Team Armor & Glow Accent Meshes
  for (const [tag, s] of [['Left', -1], ['Right', 1]]) {
    const gCollar = new Geom(m.Surf_TEAM);
    gCollar.addCarapacePlate({
      center: [0.92, 0.98, s * 1.54],
      size: [0.72, 0.20, 0.68],
      rotDeg: [s * 32, -s * 22, -18],
      topScale: [0.78, 0.78],
      dome: 0.05,
    });
    scene.addMeshNode(`Surf_TEAM_TuskCollar${tag}`, [gCollar], root);

    const gFlankTeam = new Geom(m.Surf_TEAM);
    gFlankTeam.addShieldPad({
      center: [-0.28, 2.26, s * 1.66],
      rotDeg: [s * 38, -s * 12, 0],
      rx: 0.52,
      rz: 0.42,
      thickness: 0.10,
      sides: 6,
      dome: 0.05,
    });
    scene.addMeshNode(`Surf_TEAM_Vault${tag}`, [gFlankTeam], root);
  }

  const gRearTeam = new Geom(m.Surf_TEAM);
  gRearTeam.addShieldPad({
    center: [-1.76, 2.22, 0.0],
    rotDeg: [0, 0, 42],
    rx: 0.48,
    rz: 0.58,
    thickness: 0.10,
    sides: 6,
    dome: 0.05,
  });
  scene.addMeshNode('Surf_TEAM_RearSpine', [gRearTeam], root);

  const gFlankGlow = new Geom(m.Surf_GLOW);
  for (const degAz of [78, 134, 226, 282]) {
    const th = deg(degAz);
    gFlankGlow.addSpheroid({
      center: [Math.cos(th) * 1.98, 1.32, Math.sin(th) * 1.98],
      radii: [0.11, 0.16, 0.11],
      sectors: 6,
      stacks: 4,
    });
  }
  scene.addMeshNode('Surf_GLOW_FlankSeams', [gFlankGlow], root);

  // 2. GIANT FRAMING TUSKS ('GiantTuskLeft' & 'GiantTuskRight')
  //    Colossal curved ivory-bone tusks sweeping forward/outward and towering up to Y ~ 3.65!
  const tuskNodes = {};
  for (const [tag, s] of [['Left', -1], ['Right', 1]]) {
    const pivot = [0.82, 0.58, s * 1.36];
    const gTBone = new Geom(m.Mat_Bone);
    const gTEdge = new Geom(m.Mat_BoneEdge);
    const gTDark = new Geom(m.Mat_ChitinDark);

    // Chitin clasp rings gripping tusk base
    gTDark.addTube([
      { pos: [-0.06, -0.06, -s * 0.04], rx: 0.42, ry: 0.38 },
      { pos: [0.20, 0.12, s * 0.14], rx: 0.36, ry: 0.33 },
    ], 7, true, true);

    // Colossal 6-station faceted ivory war-tusk (stays cleanly within horizontal radius <= 2.50!)
    gTBone.addBlade([
      { pos: [0.00, 0.00, 0.00],          edgeDir: [-0.25, 0.55, -s * 0.80], backW: 0.32, edgeW: 0.34, thick: 0.52 },
      { pos: [0.46, 0.28, s * 0.26],      edgeDir: [-0.30, 0.55, -s * 0.78], backW: 0.28, edgeW: 0.32, thick: 0.44 },
      { pos: [0.80, 0.98, s * 0.08],      edgeDir: [-0.45, 0.45, -s * 0.77], backW: 0.22, edgeW: 0.27, thick: 0.34 },
      { pos: [0.82, 1.90, -s * 0.16],     edgeDir: [-0.55, 0.35, -s * 0.75], backW: 0.16, edgeW: 0.20, thick: 0.25 },
      { pos: [0.60, 2.60, -s * 0.36],     edgeDir: [-0.60, 0.30, -s * 0.74], backW: 0.09, edgeW: 0.13, thick: 0.14 },
      { pos: [0.36, 3.06, -s * 0.52],     edgeDir: [-0.60, 0.30, -s * 0.74], backW: 0.015, edgeW: 0.02, thick: 0.025 },
    ], gTEdge);

    // Exterior barb spur midway up each giant tusk for extra silhouette bite
    gTBone.addTube([
      { pos: [0.58, 0.68, s * 0.20], rx: 0.11, ry: 0.09 },
      { pos: [0.82, 0.92, s * 0.36], rx: 0.02, ry: 0.02 },
    ], 5, true, true);

    tuskNodes[tag] = scene.addMeshNode(`GiantTusk${tag}`, [gTBone, gTEdge, gTDark], root, pivot);
  }

  // 3. Articulated Upper Mandibular Brow Hood & Fangs ('UpperJawHood') framing top of deep mouth
  const browPivot = [0.92, 2.18, 0.0];
  const gJawChitin = new Geom(m.Mat_Chitin);
  const gJawRidge = new Geom(m.Mat_ChitinRidge);
  const gJawBone = new Geom(m.Mat_Bone);

  gJawChitin.addCarapacePlate({
    center: [0.36, 0.16, 0.0],
    size: [1.14, 0.38, 2.18],
    rotDeg: [0, 0, -16],
    topScale: [0.76, 0.80],
    dome: 0.08,
  });
  gJawRidge.addCarapacePlate({
    center: [0.72, 0.02, 0.0],
    size: [0.52, 0.22, 1.94],
    rotDeg: [0, 0, -24],
    topScale: [0.72, 0.84],
    dome: 0.05,
  });
  // 5 Hooked Ivory-Bone Upper Maw Fangs hanging down over the dark chitin mouth
  for (const fz of [-0.74, -0.38, 0.0, 0.38, 0.74]) {
    const scaleLen = fz === 0 ? 0.56 : Math.abs(fz) < 0.5 ? 0.46 : 0.40;
    gJawBone.addTube([
      { pos: [0.84 - Math.abs(fz) * 0.16, -0.04, fz], rx: 0.095, ry: 0.085 },
      { pos: [1.02 - Math.abs(fz) * 0.14, -0.22 - scaleLen * 0.4, fz * 0.95], rx: 0.055, ry: 0.05 },
      { pos: [0.94 - Math.abs(fz) * 0.12, -0.18 - scaleLen, fz * 0.90], rx: 0.014, ry: 0.014 },
    ], 5, true, true);
  }
  const upperJawIdx = scene.addMeshNode('UpperJawHood', [gJawChitin, gJawRidge, gJawBone], root, browPivot);

  const gBrowTeam = new Geom(m.Surf_TEAM);
  gBrowTeam.addShieldPad({
    center: [0.46, 0.36, 0.0],
    rotDeg: [0, 0, -20],
    rx: 0.42,
    rz: 0.78,
    thickness: 0.09,
    sides: 6,
    dome: 0.04,
  });
  scene.addMeshNode('Surf_TEAM_BrowCrest', [gBrowTeam], upperJawIdx);

  const gBrowGlow = new Geom(m.Surf_GLOW);
  for (const s of [-1, 1]) {
    for (const [gx, gz] of [[0.78, 0.48], [0.64, 0.82]]) {
      gBrowGlow.addSpheroid({
        center: [gx, 0.14, s * gz],
        radii: [0.09, 0.06, 0.11],
        sectors: 6,
        stacks: 4,
      });
    }
  }
  scene.addMeshNode('Surf_GLOW_MawVents', [gBrowGlow], upperJawIdx);

  // 4. Deep Recessed Bio-Forge Crucible Heart ('ForgeCrucible') inside the dark chitin mouth
  const forgePivot = [0.16, 0.78, 0.0];
  const gForgeG = new Geom(m.Mat_ForgeGreen);
  const gForgeA = new Geom(m.Mat_ForgeAmber);
  const gForgeD = new Geom(m.Mat_ChitinDark);

  gForgeD.addSpheroid({ center: [-0.08, -0.34, 0], radii: [0.58, 0.28, 0.64], sectors: 9, stacks: 4, flattenBottom: 0.8 });
  gForgeG.addSpheroid({ center: [0.0, -0.08, 0], radii: [0.48, 0.36, 0.54], sectors: 10, stacks: 5, ribCount: 5, ribAmp: 0.07 });
  gForgeA.addSpheroid({ center: [0.10, 0.08, 0], radii: [0.34, 0.28, 0.38], sectors: 9, stacks: 5 });
  const forgeIdx = scene.addMeshNode('ForgeCrucible', [gForgeD, gForgeG, gForgeA], root, forgePivot);

  const gForgeGlow = new Geom(m.Surf_GLOW);
  for (const s of [-1, 1]) {
    gForgeGlow.addSpheroid({ center: [0.18, 0.14, s * 0.28], radii: [0.13, 0.11, 0.13], sectors: 6, stacks: 4 });
  }
  scene.addMeshNode('Surf_GLOW_ForgeCore', [gForgeGlow], forgeIdx);

  // 5. Towering Dorsal Foundry Crown & Twin Calcification Chimneys ('DorsalForgeCrown', peak Y = 3.8000!)
  const crownPivot = [-0.42, 2.38, 0.0];
  const gCrChitin = new Geom(m.Mat_Chitin);
  const gCrRidge = new Geom(m.Mat_ChitinRidge);
  const gCrDark = new Geom(m.Mat_ChitinDark);
  const gCrBone = new Geom(m.Mat_Bone);
  const gCrAmber = new Geom(m.Mat_ForgeAmber);

  // Massive domed dorsal foundry carapace vault
  gCrChitin.addSpheroid({
    center: [0.0, 0.18, 0.0],
    radii: [1.32, 0.66, 1.36],
    sectors: 12,
    stacks: 6,
    flattenBottom: 0.55,
    ribCount: 6,
    ribAmp: 0.04,
  });
  gCrRidge.addCarapacePlate({
    center: [0.06, 0.64, 0.0],
    size: [1.46, 0.28, 1.18],
    rotDeg: [0, 0, -6],
    topScale: [0.74, 0.76],
    dome: 0.08,
  });

  // Central Calcified Anvil Crown Horn peaking at exact world Y = 2.38 + 1.42 = 3.8000!
  gCrDark.addTube([
    { pos: [-0.08, 0.68, 0.0], rx: 0.36, ry: 0.32 },
    { pos: [0.04, 0.98, 0.0], rx: 0.26, ry: 0.22 },
  ], 6, true, true);
  gCrBone.addBlade([
    { pos: [-0.02, 0.82, 0.0], edgeDir: [0.92, 0.38, 0], backW: 0.22, edgeW: 0.24, thick: 0.32 },
    { pos: [0.16, 1.18, 0.0],  edgeDir: [0.92, 0.38, 0], backW: 0.13, edgeW: 0.16, thick: 0.18 },
    { pos: [0.28, 1.42, 0.0],  edgeDir: [0.92, 0.38, 0], backW: 0.01, edgeW: 0.015, thick: 0.02 },
  ]);

  // Twin Lateral Bio-Foundry Calcification Chimneys
  for (const s of [-1, 1]) {
    gCrDark.addTube([
      { pos: [-0.28, 0.24, s * 0.94], rx: 0.36, ry: 0.34 },
      { pos: [-0.38, 0.78, s * 1.08], rx: 0.28, ry: 0.26 },
      { pos: [-0.42, 0.98, s * 1.12], rx: 0.32, ry: 0.30 },
    ], 7, true, true);
    gCrAmber.addSpheroid({
      center: [-0.42, 0.98, s * 1.12],
      radii: [0.20, 0.12, 0.20],
      sectors: 7,
      stacks: 4,
    });
    // Bone rim spikes on each chimney
    for (const cAng of [-0.6, 0.6]) {
      gCrBone.addTube([
        { pos: [-0.42 + Math.sin(cAng) * 0.24, 0.92, s * (1.12 + Math.cos(cAng) * 0.22)], rx: 0.07, ry: 0.06 },
        { pos: [-0.46 + Math.sin(cAng) * 0.30, 1.18, s * (1.18 + Math.cos(cAng) * 0.26)], rx: 0.015, ry: 0.015 },
      ], 4, true, true);
    }
  }
  const crownIdx = scene.addMeshNode('DorsalForgeCrown', [gCrChitin, gCrRidge, gCrDark, gCrBone, gCrAmber], root, crownPivot);

  const gCrownTeam = new Geom(m.Surf_TEAM);
  for (const s of [-1, 1]) {
    gCrownTeam.addShieldPad({
      center: [0.14, 0.76, s * 0.56],
      rotDeg: [s * 24, 0, -8],
      rx: 0.34,
      rz: 0.26,
      thickness: 0.08,
      sides: 6,
      dome: 0.03,
    });
  }
  scene.addMeshNode('Surf_TEAM_CrownPlates', [gCrownTeam], crownIdx);

  const gCrownGlow = new Geom(m.Surf_GLOW);
  for (const s of [-1, 1]) {
    gCrownGlow.addSpheroid({
      center: [-0.42, 1.04, s * 1.12],
      radii: [0.15, 0.09, 0.15],
      sectors: 7,
      stacks: 4,
    });
  }
  scene.addMeshNode('Surf_GLOW_ChimneyVents', [gCrownGlow], crownIdx);

  // 6. Seamless Looping 'idle' Animation (2.80s organic foundry bellows + giant tusk flex)
  const idQ = [0, 0, 0, 1];
  const tIdle = [0.0, 0.70, 1.40, 2.10, 2.80];
  scene.addAnimation('idle', [
    {
      nodeIndex: crownIdx,
      path: 'translation',
      times: tIdle,
      values: [
        crownPivot,
        [crownPivot[0], crownPivot[1] + 0.045, 0],
        [crownPivot[0], crownPivot[1] - 0.015, 0],
        [crownPivot[0], crownPivot[1] + 0.028, 0],
        crownPivot,
      ],
    },
    {
      nodeIndex: crownIdx,
      path: 'scale',
      times: tIdle,
      values: [
        [1, 1, 1],
        [1.028, 1.022, 1.032],
        [0.988, 0.992, 0.988],
        [1.018, 1.014, 1.020],
        [1, 1, 1],
      ],
    },
    {
      nodeIndex: upperJawIdx,
      path: 'rotation',
      times: tIdle,
      values: [
        idQ,
        quatEuler(0, 0, 3.2),
        quatEuler(0, 0, -1.4),
        quatEuler(0, 0, 2.0),
        idQ,
      ],
    },
    {
      nodeIndex: tuskNodes.Left,
      path: 'rotation',
      times: tIdle,
      values: [
        idQ,
        quatEuler(1.6, 2.4, 1.8),
        quatEuler(-0.8, -1.2, -0.8),
        quatEuler(1.0, 1.5, 1.1),
        idQ,
      ],
    },
    {
      nodeIndex: tuskNodes.Right,
      path: 'rotation',
      times: tIdle,
      values: [
        idQ,
        quatEuler(-1.6, -2.4, 1.8),
        quatEuler(0.8, 1.2, -0.8),
        quatEuler(-1.0, -1.5, 1.1),
        idQ,
      ],
    },
    {
      nodeIndex: forgeIdx,
      path: 'scale',
      times: tIdle,
      values: [
        [1, 1, 1],
        [1.12, 1.16, 1.12],
        [0.95, 0.94, 0.95],
        [1.08, 1.10, 1.08],
        [1, 1, 1],
      ],
    },
  ]);

  return scene.buildGLB('CarapaceCavernScene');
}

// ---------------------------------------------------------------------------
// MODEL 2: carapace_bulwark_ladder.glb
// Massive stocky armored six-legged melee creature with two long blade mandibles
// Target: radius ~2.5 (maxHorizRadius <= 2.50), height ~3.5, floor Y=0, no floor geometry
// Anchors: 'BladeLeft', 'BladeRight'
// Clips: 'idle', 'walk', 'attack', 'burrow', 'surface', 'death'
// ---------------------------------------------------------------------------

function buildCarapaceBulwark() {
  const scene = new GLBScene('StarfallCommand-GnarlCavernGenerator-1.0');
  const m = createGnarlPalette(scene);

  const root = scene.addNode({ name: 'CarapaceBulwark' });
  const bodyRest = [0.0, 1.40, 0.0];
  const bodyRoot = scene.addNode({ name: 'BodyRoot', translation: bodyRest, parentIndex: root });

  // 1. Massive Stocky Armored Thorax & Towering Dorsal Bastion Crown (world Y peak = 3.5000!)
  const gThChitin = new Geom(m.Mat_Chitin);
  const gThRidge = new Geom(m.Mat_ChitinRidge);
  const gThDark = new Geom(m.Mat_ChitinDark);
  const gThBone = new Geom(m.Mat_Bone);
  const gThFlesh = new Geom(m.Mat_BroodFlesh);

  // Broad muscular ventral chest & heavy coxal leg-frame (world Y ~ 0.84 .. 1.68)
  gThDark.addSpheroid({
    center: [0.02, -0.22, 0.0],
    radii: [1.14, 0.38, 0.94],
    sectors: 12,
    stacks: 5,
    flattenBottom: 0.45,
  });
  gThFlesh.addSpheroid({
    center: [-0.04, 0.04, 0.0],
    radii: [1.08, 0.44, 0.88],
    sectors: 12,
    stacks: 5,
  });

  // Pectoral Battering Prow & Paired Ivory Chest Tusks
  gThDark.addCarapacePlate({
    center: [0.88, -0.18, 0.0],
    size: [0.56, 0.34, 1.18],
    rotDeg: [0, 0, -24],
    topScale: [0.80, 0.84],
    dome: 0.05,
  });
  for (const s of [-1, 1]) {
    gThBone.addTube([
      { pos: [0.96, -0.24, s * 0.48], rx: 0.11, ry: 0.09 },
      { pos: [1.34, -0.30, s * 0.56], rx: 0.025, ry: 0.02 },
    ], 5, true, true);
  }

  // 4 Stepped Overlapping Juggernaut Dorsal Carapace Tergites (wide, thick, stocky!)
  const tergites = [
    { cx: 0.56, cy: 0.44, sx: 0.78, sy: 0.32, sz: 2.04, rz: -18 },
    { cx: 0.12, cy: 0.72, sx: 0.86, sy: 0.36, sz: 2.26, rz: -8 },
    { cx: -0.38, cy: 0.66, sx: 0.82, sy: 0.34, sz: 2.12, rz: 6 },
    { cx: -0.82, cy: 0.46, sx: 0.68, sy: 0.28, sz: 1.82, rz: 16 },
  ];
  for (const tg of tergites) {
    gThChitin.addCarapacePlate({
      center: [tg.cx, tg.cy, 0],
      size: [tg.sx, tg.sy, tg.sz],
      rotDeg: [0, 0, tg.rz],
      topScale: [0.80, 0.84],
      dome: 0.08,
    });
    gThRidge.addCarapacePlate({
      center: [tg.cx - 0.14, tg.cy + 0.16, 0],
      size: [0.28, 0.12, tg.sz * 0.90],
      rotDeg: [0, 0, tg.rz],
      topScale: [0.76, 0.88],
      dome: 0.04,
    });
    // Flared calcified lateral eaves spikes
    for (const s of [-1, 1]) {
      gThBone.addTube([
        { pos: [tg.cx, tg.cy + 0.02, s * (tg.sz * 0.44)], rx: 0.11, ry: 0.08 },
        { pos: [tg.cx - 0.14, tg.cy + 0.16, s * (tg.sz * 0.54)], rx: 0.024, ry: 0.02 },
      ], 5, true, true);
    }
  }

  // Towering Dorsal Siege Bastion Hump & Central Ivory Fin-Horn peaking at world Y = 1.40 + 2.10 = 3.5000!
  gThChitin.addCarapacePlate({
    center: [0.08, 1.18, 0.0],
    size: [1.18, 0.44, 1.48],
    rotDeg: [0, 0, -6],
    topScale: [0.74, 0.76],
    dome: 0.10,
  });
  gThBone.addBlade([
    { pos: [-0.10, 1.32, 0.0], edgeDir: [0.90, 0.44, 0], backW: 0.28, edgeW: 0.30, thick: 0.34 },
    { pos: [0.18, 1.76, 0.0],  edgeDir: [0.90, 0.44, 0], backW: 0.16, edgeW: 0.20, thick: 0.20 },
    { pos: [0.38, 2.10, 0.0],  edgeDir: [0.90, 0.44, 0], backW: 0.012, edgeW: 0.018, thick: 0.02 },
  ]);

  // Twin Massive Swept Shoulder Bastion Horns (world Y ~ 3.32, bold V-crown in isometric view!)
  for (const s of [-1, 1]) {
    gThDark.addTube([
      { pos: [0.16, 0.92, s * 0.62], rx: 0.24, ry: 0.20 },
      { pos: [0.22, 1.18, s * 0.78], rx: 0.19, ry: 0.16 },
    ], 6, true, true);
    gThBone.addBlade([
      { pos: [0.20, 1.10, s * 0.74],  edgeDir: [0.78, 0.42, s * 0.46], backW: 0.18, edgeW: 0.20, thick: 0.24 },
      { pos: [0.38, 1.56, s * 0.98],  edgeDir: [0.78, 0.42, s * 0.46], backW: 0.11, edgeW: 0.14, thick: 0.15 },
      { pos: [0.54, 1.92, s * 1.14],  edgeDir: [0.78, 0.42, s * 0.46], backW: 0.015, edgeW: 0.02, thick: 0.02 },
    ]);
  }

  const thoraxIdx = scene.addMeshNode('ThoraxVault', [gThChitin, gThRidge, gThDark, gThBone, gThFlesh], bodyRoot);

  // Thorax Surf_TEAM & Surf_GLOW Meshes
  for (const [tag, s] of [['Left', -1], ['Right', 1]]) {
    const gShTeam = new Geom(m.Surf_TEAM);
    gShTeam.addCarapacePlate({
      center: [0.24, 0.88, s * 0.96],
      size: [0.88, 0.16, 0.62],
      rotDeg: [s * 34, -s * 8, -12],
      topScale: [0.80, 0.80],
      dome: 0.05,
    });
    scene.addMeshNode(`Surf_TEAM_Shoulder${tag}`, [gShTeam], thoraxIdx);
  }

  const gCrestTeam = new Geom(m.Surf_TEAM);
  gCrestTeam.addShieldPad({
    center: [-0.28, 1.42, 0.0],
    rotDeg: [0, 0, 14],
    rx: 0.48,
    rz: 0.44,
    thickness: 0.10,
    sides: 6,
    dome: 0.05,
  });
  scene.addMeshNode('Surf_TEAM_DorsalCrest', [gCrestTeam], thoraxIdx);

  const gThGlow = new Geom(m.Surf_GLOW);
  for (const s of [-1, 1]) {
    for (const [gx, gy, gz] of [[0.46, 0.34, 0.98], [-0.08, 0.44, 1.06], [-0.58, 0.38, 0.96]]) {
      gThGlow.addSpheroid({ center: [gx, gy, s * gz], radii: [0.11, 0.07, 0.08], sectors: 6, stacks: 4 });
    }
  }
  scene.addMeshNode('Surf_GLOW_ThoraxVents', [gThGlow], thoraxIdx);

  // 2. Stocky Armored Rear Carapace Bunker & Spiked Tail-Club ('AbdomenBunker', world X to -2.38)
  const abdRest = [-1.06, -0.04, 0.0];
  const gAbChitin = new Geom(m.Mat_Chitin);
  const gAbRidge = new Geom(m.Mat_ChitinRidge);
  const gAbDark = new Geom(m.Mat_ChitinDark);
  const gAbBone = new Geom(m.Mat_Bone);

  gAbDark.addSpheroid({ center: [-0.36, -0.02, 0], radii: [0.76, 0.38, 0.74], sectors: 10, stacks: 5, flattenBottom: 0.35 });
  gAbChitin.addCarapacePlate({ center: [-0.24, 0.24, 0], size: [0.78, 0.32, 1.54], rotDeg: [0, 0, 18], dome: 0.07 });
  gAbChitin.addCarapacePlate({ center: [-0.74, 0.08, 0], size: [0.68, 0.26, 1.18], rotDeg: [0, 0, 22], dome: 0.06 });
  gAbRidge.addCarapacePlate({ center: [-1.08, -0.04, 0], size: [0.46, 0.20, 0.82], rotDeg: [0, 0, 14], dome: 0.05 });

  for (const s of [-1, 1]) {
    gAbBone.addTube([
      { pos: [-0.98, -0.04, s * 0.34], rx: 0.11, ry: 0.09 },
      { pos: [-1.30, 0.06, s * 0.48], rx: 0.022, ry: 0.02 },
    ], 5, true, true);
  }
  const abdomenIdx = scene.addMeshNode('AbdomenBunker', [gAbChitin, gAbRidge, gAbDark, gAbBone], bodyRoot, abdRest);

  const gRumpTeam = new Geom(m.Surf_TEAM);
  gRumpTeam.addShieldPad({ center: [-0.46, 0.40, 0], rotDeg: [0, 0, 22], rx: 0.42, rz: 0.54, thickness: 0.09, sides: 6, dome: 0.04 });
  scene.addMeshNode('Surf_TEAM_RumpPlate', [gRumpTeam], abdomenIdx);

  const gTailGlow = new Geom(m.Surf_GLOW);
  for (const s of [-1, 1]) {
    gTailGlow.addSpheroid({ center: [-0.82, 0.12, s * 0.52], radii: [0.10, 0.07, 0.09], sectors: 6, stacks: 4 });
  }
  scene.addMeshNode('Surf_GLOW_TailVents', [gTailGlow], abdomenIdx);

  // 3. Armored Siege Skull ('Head') & Two Long Scythe-Cleaver Blade Mandibles + 'BladeLeft'/'BladeRight'
  const headRest = [0.96, -0.04, 0.0]; // world [0.96, 1.36, 0.0]
  const gHdChitin = new Geom(m.Mat_Chitin);
  const gHdRidge = new Geom(m.Mat_ChitinRidge);
  const gHdDark = new Geom(m.Mat_ChitinDark);
  const gHdBone = new Geom(m.Mat_Bone);

  gHdDark.addCarapacePlate({ center: [0.18, -0.14, 0], size: [0.64, 0.28, 1.18], rotDeg: [0, 0, -8], dome: 0.04 });
  gHdChitin.addCarapacePlate({ center: [0.28, 0.12, 0], size: [0.76, 0.34, 1.28], rotDeg: [0, 0, -22], dome: 0.07 });
  gHdRidge.addCarapacePlate({ center: [0.48, 0.18, 0], size: [0.46, 0.18, 0.94], rotDeg: [0, 0, -28], dome: 0.05 });

  // Upturned Calcified Nasal Siege-Horn
  gHdBone.addBlade([
    { pos: [0.54, 0.12, 0], edgeDir: [0.85, 0.52, 0], backW: 0.14, edgeW: 0.16, thick: 0.20 },
    { pos: [0.82, 0.38, 0], edgeDir: [0.80, 0.60, 0], backW: 0.02, edgeW: 0.025, thick: 0.03 },
  ]);
  const headIdx = scene.addMeshNode('Head', [gHdChitin, gHdRidge, gHdDark, gHdBone], bodyRoot, headRest);

  const gHeadTeam = new Geom(m.Surf_TEAM);
  gHeadTeam.addShieldPad({ center: [0.26, 0.30, 0], rotDeg: [0, 0, -24], rx: 0.30, rz: 0.42, thickness: 0.08, sides: 6, dome: 0.04 });
  scene.addMeshNode('Surf_TEAM_HeadBrow', [gHeadTeam], headIdx);

  const gEyesGlow = new Geom(m.Surf_GLOW);
  for (const s of [-1, 1]) {
    gEyesGlow.addSpheroid({ center: [0.54, 0.06, s * 0.38], radii: [0.09, 0.06, 0.08], sectors: 6, stacks: 4 });
    gEyesGlow.addSpheroid({ center: [0.40, 0.12, s * 0.52], radii: [0.07, 0.05, 0.07], sectors: 6, stacks: 4 });
  }
  scene.addMeshNode('Surf_GLOW_Eyes', [gEyesGlow], headIdx);

  // Two Long Blade Mandibles ('MandibleLeft' on -Z, 'MandibleRight' on +Z) + Anchors 'BladeLeft' & 'BladeRight'
  // World pivot = [1.12, 1.28, s * 0.56]; tip at world [2.40, 1.34, s * 0.60] -> horiz rad = 2.474 <= 2.50!
  const mandibles = {};
  for (const [tag, s] of [['Left', -1], ['Right', 1]]) {
    const mPivot = [0.16, -0.08, s * 0.56];
    const gMDark = new Geom(m.Mat_ChitinDark);
    const gMRidge = new Geom(m.Mat_ChitinRidge);
    const gMBone = new Geom(m.Mat_Bone);
    const gMEdge = new Geom(m.Mat_BoneEdge);

    // Massive armored cheek condyle & outer spine guard
    gMDark.addSpheroid({ center: [0.04, 0.0, s * 0.06], radii: [0.24, 0.20, 0.24], sectors: 8, stacks: 4 });
    gMRidge.addTube([
      { pos: [0.08, 0.04, s * 0.10], rx: 0.18, ry: 0.14 },
      { pos: [0.44, 0.04, s * 0.62], rx: 0.15, ry: 0.11 },
      { pos: [0.78, 0.03, s * 0.58], rx: 0.10, ry: 0.08 },
    ], 6, true, true);

    // Long Wide Curved Ivory-Bone Scythe-Cleaver Blade (razor cutting edge faces inward/forward!)
    gMBone.addBlade([
      { pos: [0.10, 0.00, s * 0.14], edgeDir: [0.52, -0.05, -s * 0.85], backW: 0.16, edgeW: 0.20, thick: 0.22 },
      { pos: [0.44, -0.02, s * 0.62], edgeDir: [0.42, -0.05, -s * 0.90], backW: 0.20, edgeW: 0.28, thick: 0.20 },
      { pos: [0.84, -0.02, s * 0.54], edgeDir: [0.25, -0.04, -s * 0.96], backW: 0.18, edgeW: 0.32, thick: 0.16 },
      { pos: [1.12, 0.02, s * 0.28],  edgeDir: [-0.15, -0.02, -s * 0.98], backW: 0.12, edgeW: 0.24, thick: 0.12 },
      { pos: [1.28, 0.06, s * 0.04],  edgeDir: [-0.35, 0.0, -s * 0.93],  backW: 0.02, edgeW: 0.03, thick: 0.03 },
    ], gMEdge);

    // Exterior wicked bone hook-spur on the outer elbow of the mandible
    gMBone.addTube([
      { pos: [0.42, 0.0, s * 0.60], rx: 0.09, ry: 0.06 },
      { pos: [0.34, 0.04, s * 0.84], rx: 0.018, ry: 0.015 },
    ], 5, true, true);

    const mNode = scene.addMeshNode(`Mandible${tag}`, [gMDark, gMRidge, gMBone, gMEdge], headIdx, mPivot);

    const gMTeam = new Geom(m.Surf_TEAM);
    gMTeam.addCarapacePlate({
      center: [0.28, 0.09, s * 0.38],
      size: [0.44, 0.09, 0.26],
      rotDeg: [s * 14, -s * 42, 0],
      dome: 0.03,
    });
    scene.addMeshNode(`Surf_TEAM_Mandible${tag}`, [gMTeam], mNode);

    const gMGlow = new Geom(m.Surf_GLOW);
    gMGlow.addTube([
      { pos: [0.46, 0.05, s * 0.50], rx: 0.038, ry: 0.030 },
      { pos: [0.82, 0.04, s * 0.42], rx: 0.034, ry: 0.026 },
      { pos: [1.06, 0.05, s * 0.22], rx: 0.018, ry: 0.016 },
    ], 5, true, true);
    scene.addMeshNode(`Surf_GLOW_Blade${tag}`, [gMGlow], mNode);

    // Required Anchor Node: 'BladeLeft' / 'BladeRight' right on the forward striking blade arc
    scene.addNode({
      name: `Blade${tag}`,
      translation: [1.04, 0.02, s * 0.26],
      parentIndex: mNode,
    });

    mandibles[tag] = { nodeIndex: mNode, side: s };
  }

  // 4. Six Stocky Armored Walking Legs ('Leg_FL', 'Leg_FR', 'Leg_ML', 'Leg_MR', 'Leg_RL', 'Leg_RR')
  //    Each leg = Hip (femur) -> Shin (crusher tibia + flat 3-clawed siege foot resting at exact Y = 0.0000)
  const legDefs = [
    { tag: 'FL', pair: 0, s: -1, hip: [0.58, -0.22, -0.78], knee: [0.20, 0.20, -0.58], footOff: [0.16, 0, -0.36] },
    { tag: 'FR', pair: 0, s: 1,  hip: [0.58, -0.22, 0.78],  knee: [0.20, 0.20, 0.58],  footOff: [0.16, 0, 0.36] },
    { tag: 'ML', pair: 1, s: -1, hip: [-0.14, -0.22, -0.86], knee: [0.02, 0.22, -0.64], footOff: [0.00, 0, -0.44] },
    { tag: 'MR', pair: 1, s: 1,  hip: [-0.14, -0.22, 0.86],  knee: [0.02, 0.22, 0.64],  footOff: [0.00, 0, 0.44] },
    { tag: 'RL', pair: 2, s: -1, hip: [-0.84, -0.22, -0.78], knee: [-0.18, 0.20, -0.58], footOff: [-0.16, 0, -0.36] },
    { tag: 'RR', pair: 2, s: 1,  hip: [-0.84, -0.22, 0.78],  knee: [-0.18, 0.20, 0.58],  footOff: [-0.16, 0, 0.36] },
  ];

  const legs = [];
  for (const ld of legDefs) {
    const { tag, s, hip, knee, footOff } = ld;
    const shinDrop = bodyRest[1] + hip[1] + knee[1]; // exact vertical drop from knee to Y = 0.0000 (= 1.38 or 1.40)

    const gFemChitin = new Geom(m.Mat_Chitin);
    const gFemRidge = new Geom(m.Mat_ChitinRidge);
    const gFemDark = new Geom(m.Mat_ChitinDark);
    const gFemBone = new Geom(m.Mat_Bone);

    // Coxa socket + thick armored femur + calcified knee horn
    gFemDark.addSpheroid({ center: [0, 0, 0], radii: [0.22, 0.20, 0.22], sectors: 8, stacks: 4 });
    gFemChitin.addBlade([
      { pos: [0, 0, 0], edgeDir: [0, 1, 0], backW: 0.16, edgeW: 0.20, thick: 0.30 },
      { pos: vLerp([0, 0, 0], knee, 0.55), edgeDir: [0, 1, 0], backW: 0.18, edgeW: 0.24, thick: 0.34 },
      { pos: knee, edgeDir: [0, 1, 0], backW: 0.14, edgeW: 0.18, thick: 0.26 },
    ]);
    gFemRidge.addTube([
      { pos: [knee[0] * 0.25, knee[1] * 0.25 + 0.14, knee[2] * 0.25], rx: 0.13, ry: 0.08 },
      { pos: [knee[0] * 0.92, knee[1] * 0.92 + 0.16, knee[2] * 0.92], rx: 0.11, ry: 0.07 },
    ], 5, true, true);
    gFemBone.addTube([
      { pos: [knee[0], knee[1] + 0.08, knee[2]], rx: 0.09, ry: 0.08 },
      { pos: [knee[0] + 0.04, knee[1] + 0.34, knee[2] + s * 0.12], rx: 0.02, ry: 0.02 },
    ], 5, true, true);

    const hipNode = scene.addMeshNode(`Leg_${tag}`, [gFemChitin, gFemRidge, gFemDark, gFemBone], bodyRoot, hip);

    if (ld.pair === 0) {
      const gLegTeam = new Geom(m.Surf_TEAM);
      gLegTeam.addShieldPad({
        center: [knee[0] * 0.55, knee[1] * 0.55 + 0.18, knee[2] * 0.55],
        rotDeg: [-s * 18, 0, 0],
        rx: 0.22,
        rz: 0.18,
        thickness: 0.06,
        sides: 6,
        dome: 0.02,
      });
      scene.addMeshNode(`Surf_TEAM_Leg${tag}`, [gLegTeam], hipNode);
    }

    // Stocky Crusher Tibia & Flat-Soled 3-Clawed Siege Foot (exact bottom = -shinDrop -> world Y = 0.0000!)
    const gShChitin = new Geom(m.Mat_Chitin);
    const gShRidge = new Geom(m.Mat_ChitinRidge);
    const gShDark = new Geom(m.Mat_ChitinDark);
    const gShBone = new Geom(m.Mat_Bone);

    const ankle = [footOff[0], -shinDrop + 0.16, footOff[2]];
    const sole = [footOff[0], -shinDrop, footOff[2]];

    gShDark.addSpheroid({ center: [0, 0, 0], radii: [0.18, 0.18, 0.18], sectors: 8, stacks: 4 });
    // Heavy outer armored tibia shield
    gShChitin.addBlade([
      { pos: [0, 0.04, 0], edgeDir: [0, 0.15, s], backW: 0.16, edgeW: 0.24, thick: 0.32 },
      { pos: [footOff[0] * 0.55, -shinDrop * 0.48, footOff[2] * 0.62], edgeDir: [0, 0.1, s], backW: 0.16, edgeW: 0.28, thick: 0.36 },
      { pos: ankle, edgeDir: [0, 0.05, s], backW: 0.14, edgeW: 0.20, thick: 0.28 },
    ], null, -shinDrop);
    gShRidge.addTube([
      { pos: [footOff[0] * 0.25, -shinDrop * 0.18, footOff[2] * 0.25 + s * 0.16], rx: 0.12, ry: 0.09 },
      { pos: [footOff[0] * 0.80, -shinDrop * 0.72, footOff[2] * 0.80 + s * 0.16], rx: 0.10, ry: 0.08 },
    ], 5, true, true, [0, 1, 0], -shinDrop);

    // Wide flat-bottomed armored siege hoof pad clamped cleanly at -shinDrop (world Y = 0.0000)
    gShDark.addCarapacePlate({
      center: [sole[0], -shinDrop + 0.08, sole[2]],
      size: [0.38, 0.16, 0.38],
      topScale: [0.82, 0.82],
      dome: 0.03,
      minY: -shinDrop,
    });
    // 3 Splayed Ivory-Bone Siege Claws resting flat on -shinDrop
    for (const cYaw of [-28, 0, 28]) {
      const rad = deg(cYaw + (s > 0 ? 55 : -55));
      const dx = Math.cos(rad), dz = Math.sin(rad);
      gShBone.addTube([
        { pos: [sole[0] + dx * 0.12, -shinDrop + 0.09, sole[2] + dz * 0.12], rx: 0.075, ry: 0.065 },
        { pos: [sole[0] + dx * 0.30, -shinDrop + 0.03, sole[2] + dz * 0.30], rx: 0.022, ry: 0.020 },
      ], 4, true, true, [0, 1, 0], -shinDrop);
    }

    const shinNode = scene.addMeshNode(`Shin_${tag}`, [gShChitin, gShRidge, gShDark, gShBone], hipNode, knee);
    legs.push({ ...ld, hipNode, shinNode, shinDrop, femLat: Math.abs(knee[2]), femUp: knee[1] });
  }

  // -------------------------------------------------------------------------
  // Analytic Grounded Hexapod Leg Solver
  // Solves exact femur X-roll + counter-rotating vertical shin so planted feet
  // remain flat on Y >= 0.0000 across any BodyRoot translation & rotation!
  // -------------------------------------------------------------------------
  function buildLegTracks(times, bodyPosArr, bodyRotArr, poseFn) {
    const hipRot = legs.map(() => []);
    const shinRot = legs.map(() => []);

    for (let k = 0; k < times.length; k++) {
      const bPos = bodyPosArr[k];
      const bRot = bodyRotArr[k];
      const invBRot = quatConj(bRot);

      legs.forEach((lg, i) => {
        const p = poseFn(lg, k);
        if (p.rawHipRot && p.rawShinRot) {
          hipRot[i].push(p.rawHipRot);
          shinRot[i].push(p.rawShinRot);
          return;
        }
        const hipWorld = vAdd(bPos, rotQuat(lg.hip, bRot));
        const targetFootY = Math.max(0.0, p.lift || 0.0);
        // Desired world knee Y so upright shin places sole at targetFootY:
        const desiredKneeDeltaY = (targetFootY + lg.shinDrop) - hipWorld[1];
        const R = Math.hypot(lg.femUp, lg.femLat);
        const baseAlpha = Math.atan2(lg.femUp, lg.femLat);
        const ratio = clamp(desiredKneeDeltaY / R, -0.985, 0.985);
        // Upward roll angle phi: femUp*cos(phi) + femLat*sin(phi) = R*sin(baseAlpha + phi)
        const upPhiDeg = ((Math.asin(ratio) - baseAlpha) * 180) / Math.PI;

        // World femur orientation: stride yaw around Y + upward roll around X
        const yawDeg = lg.s * (p.stride || 0);
        const rollDeg = -lg.s * upPhiDeg;
        const qHipWorld = quatEuler(rollDeg, yawDeg, 0);
        const qHipLocal = quatMul(invBRot, qHipWorld);

        // Keep Shin upright in world space (plus optional lifted knee tuck) so flat sole never tilts into Y < 0!
        const tuckDeg = lg.s * (p.shinSplay || 0);
        const qShinWorld = quatEuler(tuckDeg, yawDeg * 0.65, 0);
        const qShinLocal = quatMul(quatConj(qHipWorld), qShinWorld);

        hipRot[i].push(qHipLocal);
        shinRot[i].push(qShinLocal);
      });
    }

    const tracks = [];
    legs.forEach((lg, i) => {
      tracks.push({ nodeIndex: lg.hipNode, path: 'rotation', times, values: hipRot[i] });
      tracks.push({ nodeIndex: lg.shinNode, path: 'rotation', times, values: shinRot[i] });
    });
    return tracks;
  }

  // Mandible rotation helper: openDeg > 0 flares wide outward; openDeg < 0 cleaves inward across +X!
  const mandRot = (s, openDeg, pitchDeg = 0, rollDeg = 0) =>
    quatEuler(s * rollDeg, -s * openDeg, pitchDeg);

  const idQ = [0, 0, 0, 1];

  // 5A. 'idle' (2.20s heavy armored juggernaut breath + menacing mandible flex)
  const idleT = [0.0, 0.55, 1.10, 1.65, 2.20];
  const idleBodyPos = [
    bodyRest,
    [0.0, 1.44, 0.0],
    [0.0, 1.38, 0.0],
    [0.0, 1.43, 0.0],
    bodyRest,
  ];
  const idleBodyRot = [
    idQ,
    quatEuler(0, 1.2, 1.0),
    quatEuler(0, 0, -0.8),
    quatEuler(0, -1.2, 0.8),
    idQ,
  ];
  scene.addAnimation('idle', [
    { nodeIndex: bodyRoot, path: 'translation', times: idleT, values: idleBodyPos },
    { nodeIndex: bodyRoot, path: 'rotation', times: idleT, values: idleBodyRot },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: idleT,
      values: [idQ, quatEuler(0, -2.5, 2.0), quatEuler(0, 0, -1.5), quatEuler(0, 2.5, 1.5), idQ],
    },
    {
      nodeIndex: abdomenIdx,
      path: 'rotation',
      times: idleT,
      values: [idQ, quatEuler(0, 2.0, -1.8), quatEuler(0, 0, 1.4), quatEuler(0, -2.0, -1.5), idQ],
    },
    {
      nodeIndex: mandibles.Left.nodeIndex,
      path: 'rotation',
      times: idleT,
      values: [idQ, mandRot(-1, 7, 2), mandRot(-1, -3, -1), mandRot(-1, 5, 1), idQ],
    },
    {
      nodeIndex: mandibles.Right.nodeIndex,
      path: 'rotation',
      times: idleT,
      values: [idQ, mandRot(1, 7, 2), mandRot(1, -3, -1), mandRot(1, 5, 1), idQ],
    },
    ...buildLegTracks(idleT, idleBodyPos, idleBodyRot, () => ({ lift: 0.002, stride: 0 })),
  ]);

  // 5B. 'walk' (1.04s heavy hexapod alternating-tripod march: FL+MR+RL vs FR+ML+RR)
  const walkT = [0.0, 0.26, 0.52, 0.78, 1.04];
  const walkBodyPos = [
    bodyRest,
    [0.0, 1.46, -0.04],
    bodyRest,
    [0.0, 1.46, 0.04],
    bodyRest,
  ];
  const walkBodyRot = [
    idQ,
    quatEuler(-2.6, 2.4, -1.2),
    idQ,
    quatEuler(2.6, -2.4, -1.2),
    idQ,
  ];
  scene.addAnimation('walk', [
    { nodeIndex: bodyRoot, path: 'translation', times: walkT, values: walkBodyPos },
    { nodeIndex: bodyRoot, path: 'rotation', times: walkT, values: walkBodyRot },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: walkT,
      values: [idQ, quatEuler(0, -4, -2), idQ, quatEuler(0, 4, -2), idQ],
    },
    {
      nodeIndex: abdomenIdx,
      path: 'rotation',
      times: walkT,
      values: [idQ, quatEuler(3, -5, 2), idQ, quatEuler(-3, 5, 2), idQ],
    },
    {
      nodeIndex: mandibles.Left.nodeIndex,
      path: 'rotation',
      times: walkT,
      values: [idQ, mandRot(-1, 8, 2), idQ, mandRot(-1, -5, -1), idQ],
    },
    {
      nodeIndex: mandibles.Right.nodeIndex,
      path: 'rotation',
      times: walkT,
      values: [idQ, mandRot(1, -5, -1), idQ, mandRot(1, 8, 2), idQ],
    },
    ...buildLegTracks(walkT, walkBodyPos, walkBodyRot, (lg, k) => {
      // Tripod A = FL (pair 0, s -1), MR (pair 1, s +1), RL (pair 2, s -1)
      const tripodA = (lg.pair + (lg.s < 0 ? 0 : 1)) % 2 === 0;
      if (k === 1) return tripodA ? { lift: 0.24, stride: 16, shinSplay: -8 } : { lift: 0.004, stride: -14 };
      if (k === 3) return !tripodA ? { lift: 0.24, stride: 16, shinSplay: -8 } : { lift: 0.004, stride: -14 };
      return { lift: 0.002, stride: 0 };
    }),
  ]);

  // 5C. 'attack' (0.92s unmistakable wide windup -> massive lunging cross-scissor cleave -> outward rip!)
  const atkT = [0.0, 0.20, 0.38, 0.58, 0.92];
  const atkBodyPos = [
    bodyRest,
    [-0.16, 1.48, 0.0],  // coiled rear-back windup
    [0.30, 1.32, 0.0],   // heavy forward melee lunge!
    [0.10, 1.42, 0.0],   // violent outward rip follow-through
    bodyRest,
  ];
  const atkBodyRot = [
    idQ,
    quatEuler(0, 0, 7.5),     // rear up before strike
    quatEuler(0, 0, -6.5),    // slam forward into cleave
    quatEuler(0, 0, 3.5),     // rip upward
    idQ,
  ];
  scene.addAnimation('attack', [
    { nodeIndex: bodyRoot, path: 'translation', times: atkT, values: atkBodyPos },
    { nodeIndex: bodyRoot, path: 'rotation', times: atkT, values: atkBodyRot },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        quatEuler(0, 0, 12),     // head rears high, jaws spread wide
        quatEuler(0, 0, -10),    // head drives into horizontal cleave
        quatEuler(0, 0, 8),      // upward rip toss
        idQ,
      ],
    },
    {
      nodeIndex: mandibles.Left.nodeIndex,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        mandRot(-1, 38, 12, -8),   // FLARE WIDE OPEN!
        mandRot(-1, -44, 5, 6),    // MASSIVE CROSS-CLEAVE SWEEP ACROSS +X! (passes slightly above Right blade)
        mandRot(-1, 24, 8, -5),    // OUTWARD RENDING RIP!
        idQ,
      ],
    },
    {
      nodeIndex: mandibles.Right.nodeIndex,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        mandRot(1, 38, 12, -8),    // FLARE WIDE OPEN!
        mandRot(1, -44, -5, 6),    // MASSIVE CROSS-CLEAVE SWEEP ACROSS +X! (passes cleanly below Left blade)
        mandRot(1, 24, 8, -5),     // OUTWARD RENDING RIP!
        idQ,
      ],
    },
    {
      nodeIndex: abdomenIdx,
      path: 'rotation',
      times: atkT,
      values: [idQ, quatEuler(0, 0, -8), quatEuler(0, 0, 10), quatEuler(0, 0, -4), idQ],
    },
    ...buildLegTracks(atkT, atkBodyPos, atkBodyRot, (lg, k) => {
      if (k === 1 && lg.pair === 0) return { lift: 0.14, stride: 12, shinSplay: -6 };
      if (k === 2 && lg.pair === 0) return { lift: 0.005, stride: -10 };
      return { lift: 0.003, stride: 0 };
    }),
  ]);

  // Shared burrowed state (90% submerged beneath Y=0; dorsal crest peeks ~0.32 above ground; matches surface[0]!)
  const burrowedBodyPos = [0.0, -1.78, 0.0];
  const burrowedBodyRot = quatEuler(0, 0, -3.0);
  const burrowedHeadRot = quatEuler(0, 0, -14);
  const burrowedMandL = mandRot(-1, -22, -10);
  const burrowedMandR = mandRot(1, -22, -10);
  const burrowedLegHip = (s) => quatEuler(-s * 42, s * 18, 0);
  const burrowedLegShin = (s) => quatEuler(s * 54, 0, 0);

  // 5D. 'burrow' (1.08s: standing rest -> frantic downward clawing -> plunges underground into burrowed state)
  const burT = [0.0, 0.24, 0.56, 0.84, 1.08];
  const burBodyPos = [
    bodyRest,
    [0.08, 1.12, 0.0],    // crouch & pitch nose down to tear earth
    [0.04, -0.28, 0.0],   // corkscrew plunge into terrain
    [0.0, -1.36, 0.0],    // thorax submerging
    burrowedBodyPos,      // settled in burrowed state
  ];
  const burBodyRot = [
    idQ,
    quatEuler(0, 0, -18),
    quatEuler(3.5, -4, -22),
    quatEuler(-2.5, 3, -10),
    burrowedBodyRot,
  ];
  scene.addAnimation('burrow', [
    { nodeIndex: bodyRoot, path: 'translation', times: burT, values: burBodyPos },
    { nodeIndex: bodyRoot, path: 'rotation', times: burT, values: burBodyRot },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: burT,
      values: [idQ, quatEuler(0, 0, -22), quatEuler(0, 8, -26), quatEuler(0, -6, -18), burrowedHeadRot],
    },
    {
      nodeIndex: mandibles.Left.nodeIndex,
      path: 'rotation',
      times: burT,
      values: [idQ, mandRot(-1, 22, -16), mandRot(-1, -26, -18), mandRot(-1, 10, -12), burrowedMandL],
    },
    {
      nodeIndex: mandibles.Right.nodeIndex,
      path: 'rotation',
      times: burT,
      values: [idQ, mandRot(1, 22, -16), mandRot(1, -26, -18), mandRot(1, 10, -12), burrowedMandR],
    },
    {
      nodeIndex: abdomenIdx,
      path: 'rotation',
      times: burT,
      values: [idQ, quatEuler(0, 0, 14), quatEuler(0, 0, 20), quatEuler(0, 0, 8), idQ],
    },
    ...buildLegTracks(burT, burBodyPos, burBodyRot, (lg, k) => {
      if (k === 0) return { lift: 0.002, stride: 0 };
      if (k === 1) return lg.pair === 0 ? { lift: 0.16, stride: 18 } : { lift: 0.01, stride: -8 };
      return { rawHipRot: burrowedLegHip(lg.s), rawShinRot: burrowedLegShin(lg.s) };
    }),
  ]);

  // 5E. 'surface' (1.04s: burrowed state -> explosive skyward breach & mandible roar -> grounded rest!)
  const surfT = [0.0, 0.28, 0.58, 0.82, 1.04];
  const surfBodyPos = [
    burrowedBodyPos,
    [-0.04, -0.18, 0.0],  // bursting upward out of ground!
    [0.04, 1.54, 0.0],    // dramatic breach crest & battle roar!
    [0.0, 1.32, 0.0],     // heavy landing impact absorption
    bodyRest,
  ];
  const surfBodyRot = [
    burrowedBodyRot,
    quatEuler(0, 0, 20),
    quatEuler(0, 0, 9),
    quatEuler(0, 0, -2.5),
    idQ,
  ];
  scene.addAnimation('surface', [
    { nodeIndex: bodyRoot, path: 'translation', times: surfT, values: surfBodyPos },
    { nodeIndex: bodyRoot, path: 'rotation', times: surfT, values: surfBodyRot },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: surfT,
      values: [burrowedHeadRot, quatEuler(0, 0, 18), quatEuler(0, 0, 12), quatEuler(0, 0, -4), idQ],
    },
    {
      nodeIndex: mandibles.Left.nodeIndex,
      path: 'rotation',
      times: surfT,
      values: [burrowedMandL, mandRot(-1, 14, 10), mandRot(-1, 34, 10), mandRot(-1, -6, -2), idQ],
    },
    {
      nodeIndex: mandibles.Right.nodeIndex,
      path: 'rotation',
      times: surfT,
      values: [burrowedMandR, mandRot(1, 14, 10), mandRot(1, 34, 10), mandRot(1, -6, -2), idQ],
    },
    {
      nodeIndex: abdomenIdx,
      path: 'rotation',
      times: surfT,
      values: [idQ, quatEuler(0, 0, -18), quatEuler(0, 0, -10), quatEuler(0, 0, 4), idQ],
    },
    ...buildLegTracks(surfT, surfBodyPos, surfBodyRot, (lg, k) => {
      if (k === 0) return { rawHipRot: burrowedLegHip(lg.s), rawShinRot: burrowedLegShin(lg.s) };
      if (k === 1) return { rawHipRot: quatEuler(-lg.s * 24, lg.s * 10, 0), rawShinRot: quatEuler(lg.s * 28, 0, 0) };
      if (k === 2) return { lift: 0.06, stride: 6 };
      return { lift: 0.002, stride: 0 };
    }),
  ]);

  // 5F. 'death' (1.24s non-looping agonized rear-up -> splayed leg buckle -> heavy grounded collapse at Y >= 0!)
  const deathT = [0.0, 0.24, 0.62, 0.94, 1.24];
  const deathBodyPos = [
    bodyRest,
    [-0.08, 1.50, 0.0],   // agonized upward convulsion
    [0.04, 0.88, 0.06],   // legs buckle, heavy sternum slams toward earth
    [0.06, 0.76, 0.08],   // secondary shudder settle (sternum resting just above Y = 0)
    [0.06, 0.76, 0.08],   // final motionless corpse pose cleanly above Y = 0
  ];
  const deathBodyRot = [
    idQ,
    quatEuler(-4, 3, 12),
    quatEuler(8, -5, -4),
    quatEuler(10, -6, -5),
    quatEuler(10, -6, -5),
  ];
  function solveCollapsedLeg(lg, bPos, bRot, femUpDeg, targetFootY) {
    const invBRot = quatConj(bRot);
    const yaw = lg.s * (lg.pair === 0 ? 14 : lg.pair === 2 ? -14 : 0);
    const qHipWorld = quatEuler(-lg.s * femUpDeg, yaw, 0);
    const hipWorld = vAdd(bPos, rotQuat(lg.hip, bRot));
    const kneeWorld = vAdd(hipWorld, rotQuat(lg.knee, qHipWorld));
    // Foot lowest edge offset in Shin space when tilted outward by psi:
    // deltaY(psi) = -shinDrop * cos(psi) + (|footOffZ| - 0.24) * sin(psi)
    const A = lg.shinDrop;
    const B = Math.abs(lg.footOff[2]) - 0.24;
    const R = Math.hypot(A, B);
    const desiredDelta = targetFootY - kneeWorld[1];
    // B*sin(psi) - A*cos(psi) = R * sin(psi - atan2(A, B))
    const psi = Math.atan2(A, B) + Math.asin(clamp(desiredDelta / R, -0.99, 0.99));
    const psiDeg = (psi * 180) / Math.PI;
    const qShinWorld = quatEuler(-lg.s * psiDeg, yaw * 0.7, 0);
    return {
      rawHipRot: quatMul(invBRot, qHipWorld),
      rawShinRot: quatMul(quatConj(qHipWorld), qShinWorld),
    };
  }
  scene.addAnimation('death', [
    { nodeIndex: bodyRoot, path: 'translation', times: deathT, values: deathBodyPos },
    { nodeIndex: bodyRoot, path: 'rotation', times: deathT, values: deathBodyRot },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatEuler(0, 0, 18),
        quatEuler(-5, 8, -8),
        quatEuler(-6, 10, -10),
        quatEuler(-6, 10, -10),
      ],
    },
    {
      nodeIndex: mandibles.Left.nodeIndex,
      path: 'rotation',
      times: deathT,
      values: [idQ, mandRot(-1, 32, 14), mandRot(-1, 18, -3), mandRot(-1, 22, -4), mandRot(-1, 22, -4)],
    },
    {
      nodeIndex: mandibles.Right.nodeIndex,
      path: 'rotation',
      times: deathT,
      values: [idQ, mandRot(1, 32, 14), mandRot(1, 14, -4), mandRot(1, 16, -5), mandRot(1, 16, -5)],
    },
    {
      nodeIndex: abdomenIdx,
      path: 'rotation',
      times: deathT,
      values: [idQ, quatEuler(0, 0, -12), quatEuler(-4, 4, 6), quatEuler(-5, 5, 8), quatEuler(-5, 5, 8)],
    },
    ...buildLegTracks(deathT, deathBodyPos, deathBodyRot, (lg, k) => {
      if (k === 0) return { lift: 0.002, stride: 0 };
      if (k === 1) return { lift: 0.08, stride: 4 };
      if (k === 2) return solveCollapsedLeg(lg, deathBodyPos[k], deathBodyRot[k], 24, 0.12);
      return solveCollapsedLeg(lg, deathBodyPos[k], deathBodyRot[k], 28, 0.09);
    }),
  ]);

  return scene.buildGLB('CarapaceBulwarkScene');
}

// ---------------------------------------------------------------------------
// Exact GLB Binary & Animated Forward-Kinematics Validator
// ---------------------------------------------------------------------------

function validateGLBAsset(filename, glb, expected) {
  if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error(`${filename}: invalid GLB magic`);
  if (glb.readUInt32LE(4) !== 2) throw new Error(`${filename}: invalid GLB version`);
  if (glb.readUInt32LE(8) !== glb.length) throw new Error(`${filename}: length mismatch`);

  const jsonLen = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;

  // Extract raw vertex arrays per mesh primitive
  const meshVerts = gltf.meshes.map((mesh) => {
    const pts = [];
    let tris = 0;
    for (const prim of mesh.primitives) {
      const posAcc = gltf.accessors[prim.attributes.POSITION];
      const idxAcc = gltf.accessors[prim.indices];
      tris += idxAcc.count / 3;
      const bv = gltf.bufferViews[posAcc.bufferView];
      const base = binStart + (bv.byteOffset || 0) + (posAcc.byteOffset || 0);
      for (let i = 0; i < posAcc.count; i++) {
        pts.push([
          glb.readFloatLE(base + i * 12),
          glb.readFloatLE(base + i * 12 + 4),
          glb.readFloatLE(base + i * 12 + 8),
        ]);
      }
    }
    return { pts, tris };
  });

  const parentOf = new Map();
  gltf.nodes.forEach((n, idx) => {
    for (const c of n.children || []) parentOf.set(c, idx);
  });

  function evalPoseBounds(nodeOverrides = new Map()) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let maxHorizRad = 0;

    function toWorld(nodeIdx, p) {
      let cur = p;
      let i = nodeIdx;
      while (i !== undefined) {
        const n = gltf.nodes[i];
        const ov = nodeOverrides.get(i);
        const s = ov?.scale || n.scale || [1, 1, 1];
        const r = ov?.rotation || n.rotation || [0, 0, 0, 1];
        const t = ov?.translation || n.translation || [0, 0, 0];
        cur = [cur[0] * s[0], cur[1] * s[1], cur[2] * s[2]];
        cur = rotQuat(cur, r);
        cur = vAdd(cur, t);
        i = parentOf.get(i);
      }
      return cur;
    }

    gltf.nodes.forEach((n, nIdx) => {
      if (n.mesh === undefined) return;
      for (const p of meshVerts[n.mesh].pts) {
        const w = toWorld(nIdx, p);
        for (let c = 0; c < 3; c++) {
          if (w[c] < min[c]) min[c] = w[c];
          if (w[c] > max[c]) max[c] = w[c];
        }
        const hr = Math.hypot(w[0], w[2]);
        if (hr > maxHorizRad) maxHorizRad = hr;
      }
    });
    return { min, max, maxHorizRad, toWorld };
  }

  const rest = evalPoseBounds();
  let totalVerts = 0, totalTris = 0;
  gltf.nodes.forEach((n) => {
    if (n.mesh !== undefined) {
      totalVerts += meshVerts[n.mesh].pts.length;
      totalTris += meshVerts[n.mesh].tris;
    }
  });

  // Read animation accessor helper
  function readAcc(accIdx) {
    const acc = gltf.accessors[accIdx];
    const bv = gltf.bufferViews[acc.bufferView];
    const base = binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const comps = acc.type === 'VEC4' ? 4 : acc.type === 'VEC3' ? 3 : 1;
    const out = [];
    for (let i = 0; i < acc.count; i++) {
      if (comps === 1) out.push(glb.readFloatLE(base + i * 4));
      else {
        const v = [];
        for (let c = 0; c < comps; c++) v.push(glb.readFloatLE(base + (i * comps + c) * 4));
        out.push(v);
      }
    }
    return out;
  }

  const clipBounds = {};
  for (const anim of gltf.animations || []) {
    let duration = 0;
    const decoded = anim.channels.map((ch) => {
      const smp = anim.samplers[ch.sampler];
      const times = readAcc(smp.input);
      const values = readAcc(smp.output);
      duration = Math.max(duration, times[times.length - 1]);
      return { node: ch.target.node, path: ch.target.path, times, values };
    });

    let clipMinY = Infinity, clipMaxY = -Infinity;
    const samples = 24;
    for (let s = 0; s <= samples; s++) {
      const t = (duration * s) / samples;
      const ov = new Map();
      for (const d of decoded) {
        let k = 0;
        while (k < d.times.length - 2 && t > d.times[k + 1]) k++;
        const span = d.times[k + 1] - d.times[k] || 1;
        const u = clamp((t - d.times[k]) / span, 0, 1);
        const val = d.path === 'rotation'
          ? quatLerpNorm(d.values[k], d.values[k + 1], u)
          : vLerp(d.values[k], d.values[k + 1], u);
        if (!ov.has(d.node)) ov.set(d.node, {});
        ov.get(d.node)[d.path] = val;
      }
      const b = evalPoseBounds(ov);
      if (b.min[1] < clipMinY) clipMinY = b.min[1];
      if (b.max[1] > clipMaxY) clipMaxY = b.max[1];
    }
    clipBounds[anim.name] = {
      duration: Number(duration.toFixed(3)),
      minY: Number(clipMinY.toFixed(4)),
      maxY: Number(clipMaxY.toFixed(4)),
    };
  }

  const nodeNames = gltf.nodes.map((n) => n.name);
  const meshNames = gltf.meshes.map((m) => m.name);
  const matNames = gltf.materials.map((m) => m.name);
  const animNames = (gltf.animations || []).map((a) => a.name);
  const teamMeshes = meshNames.filter((n) => n.includes('Surf_TEAM'));
  const glowMeshes = meshNames.filter((n) => n.includes('Surf_GLOW'));

  // Strict Assertions
  if (Math.abs(rest.min[1]) > 0.002) {
    throw new Error(`${filename}: rest minY=${rest.min[1]} must be ~0.0`);
  }
  if (rest.maxHorizRad > expected.maxRadius + 0.02 || rest.maxHorizRad < expected.maxRadius - 0.15) {
    throw new Error(`${filename}: horizontal radius ${rest.maxHorizRad} outside target ~${expected.maxRadius}`);
  }
  if (Math.abs(rest.max[1] - expected.height) > 0.12) {
    throw new Error(`${filename}: height ${rest.max[1]} outside target ~${expected.height}`);
  }
  if (!matNames.includes('Surf_TEAM') || !matNames.includes('Surf_GLOW')) {
    throw new Error(`${filename}: missing Surf_TEAM or Surf_GLOW material`);
  }
  if (teamMeshes.length === 0 || glowMeshes.length === 0) {
    throw new Error(`${filename}: missing Surf_TEAM or Surf_GLOW meshes`);
  }
  for (const reqClip of expected.clips) {
    if (!animNames.includes(reqClip)) throw new Error(`${filename}: missing clip '${reqClip}'`);
  }
  for (const reqAnchor of expected.anchors || []) {
    if (!nodeNames.includes(reqAnchor)) throw new Error(`${filename}: missing anchor '${reqAnchor}'`);
  }
  for (const groundedClip of expected.groundedClips) {
    if (clipBounds[groundedClip].minY < -0.015) {
      throw new Error(`${filename}: clip '${groundedClip}' dips below floor Y=0 (${clipBounds[groundedClip].minY})`);
    }
  }

  return {
    filename,
    bytes: glb.length,
    sha256: crypto.createHash('sha256').update(glb).digest('hex'),
    verts: totalVerts,
    tris: totalTris,
    min: rest.min.map((v) => Number(v.toFixed(4))),
    max: rest.max.map((v) => Number(v.toFixed(4))),
    size: rest.max.map((v, i) => Number((v - rest.min[i]).toFixed(4))),
    maxHorizontalRadius: Number(rest.maxHorizRad.toFixed(4)),
    materials: matNames,
    teamMeshes,
    glowMeshes,
    anchors: (expected.anchors || []).map((a) => {
      const idx = nodeNames.indexOf(a);
      return { name: a, restWorldPos: rest.toWorld(idx, [0, 0, 0]).map((v) => Number(v.toFixed(4))) };
    }),
    animations: clipBounds,
  };
}

// ---------------------------------------------------------------------------
// Main Entry Point (Deterministic Build + Validation)
// ---------------------------------------------------------------------------

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
  fs.mkdirSync(outDir, { recursive: true });

  const cavernA = buildCarapaceCavern();
  const cavernB = buildCarapaceCavern();
  if (!cavernA.glb.equals(cavernB.glb)) throw new Error('Non-deterministic carapace_cavern.glb');

  const bulwarkA = buildCarapaceBulwark();
  const bulwarkB = buildCarapaceBulwark();
  if (!bulwarkA.glb.equals(bulwarkB.glb)) throw new Error('Non-deterministic carapace_bulwark_ladder.glb');

  const cavernPath = path.join(outDir, 'carapace_cavern.glb');
  const bulwarkPath = path.join(outDir, 'carapace_bulwark_ladder.glb');
  fs.writeFileSync(cavernPath, cavernA.glb);
  fs.writeFileSync(bulwarkPath, bulwarkA.glb);

  const report = [
    validateGLBAsset('carapace_cavern.glb', fs.readFileSync(cavernPath), {
      maxRadius: 2.5,
      height: 3.8,
      clips: ['idle'],
      groundedClips: ['idle'],
      anchors: [],
    }),
    validateGLBAsset('carapace_bulwark_ladder.glb', fs.readFileSync(bulwarkPath), {
      maxRadius: 2.5,
      height: 3.5,
      clips: ['idle', 'walk', 'attack', 'burrow', 'surface', 'death'],
      groundedClips: ['idle', 'walk', 'attack', 'death'],
      anchors: ['BladeLeft', 'BladeRight'],
    }),
  ];

  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { buildCarapaceCavern, buildCarapaceBulwark, validateGLBAsset };
