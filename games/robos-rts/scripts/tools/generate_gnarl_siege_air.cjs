#!/usr/bin/env node
'use strict';

/**
 * Deterministic Standalone Procedural GLB Generator for Starfall Command
 * Faction: Gnarl Brood — Siege Air & Tier-3 Spire Assets
 *
 * Generates three original procedural chitin glTF 2.0 binary (.glb) models:
 *   1. corrosion_flyer.glb      — Compact anti-air creature with swept armored fins and a
 *                                 protruding +X acid nozzle (radius 1.56, Y=0, no floor).
 *                                 Anchor: Muzzle (+ Head). Clips: idle, hover, attack, cast, death.
 *   2. brood_siege_flyer.glb    — Broad slow living siege craft with two asymmetrical
 *                                 broodling launch sacs (radius 2.5, Y=0, no floor).
 *                                 Anchors: LeftLauncher, RightLauncher (+ Head).
 *                                 Clips: idle, hover, attack, death.
 *   3. greater_blight_spire.glb — Tier-3 bio tower with 3D branched amber veins and a
 *                                 6-horn crown (radius 2.6, Y=0, no floor).
 *                                 Anchor: SpireApex. Clip: idle.
 *
 * Conventions: Y up, +X forward, ground Y=0, no floor, named Surf_TEAM and Surf_GLOW,
 * teal team meshes and dark plum Gnarl Brood carapace palette. Zero external dependencies.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Deterministic Vector, Quaternion & Color Math
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
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
const degToRad = (d) => (d * Math.PI) / 180;

function quatFromAxisAngle(axis, rad) {
  const n = vNorm(axis);
  const h = rad * 0.5;
  const s = Math.sin(h);
  return [
    Number((n[0] * s).toFixed(7)),
    Number((n[1] * s).toFixed(7)),
    Number((n[2] * s).toFixed(7)),
    Number(Math.cos(h).toFixed(7)),
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

function rotateVecByQuat(v, q) {
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

function srgbHexToLinear(hex) {
  const clean = hex.replace('#', '');
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [0, 2, 4].map((i) => Number(toLin(parseInt(clean.slice(i, i + 2), 16) / 255).toFixed(6)));
}

function makeRectChamferRing(hx, hz, ch, y, cx = 0, cz = 0) {
  const c = Math.min(ch, hx * 0.92, hz * 0.92);
  return [
    [cx + hx, y, cz - hz + c],
    [cx + hx, y, cz + hz - c],
    [cx + hx - c, y, cz + hz],
    [cx - hx + c, y, cz + hz],
    [cx - hx, y, cz + hz - c],
    [cx - hx, y, cz - hz + c],
    [cx - hx + c, y, cz - hz],
    [cx + hx - c, y, cz - hz],
  ];
}

// ---------------------------------------------------------------------------
// Low-Poly Flat-Shaded Chitin Geometry Builder
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

  addPolygonCap(ring, normalDir) {
    if (ring.length < 3) return;
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
    const ctr = [cx / ring.length, cy / ring.length, cz / ring.length];
    for (let i = 0; i < ring.length; i++) {
      this.addTri(ctr, ring[i], ring[(i + 1) % ring.length], normalDir);
    }
  }

  addLoft(rings, ringCenters = null, capStart = true, capEnd = true) {
    if (rings.length < 2) return;
    const segs = rings[0].length;
    const centers =
      ringCenters ||
      rings.map((r) => {
        let sx = 0, sy = 0, sz = 0;
        for (const p of r) { sx += p[0]; sy += p[1]; sz += p[2]; }
        return [sx / r.length, sy / r.length, sz / r.length];
      });

    for (let k = 0; k < rings.length - 1; k++) {
      const r0 = rings[k], r1 = rings[k + 1];
      const midC = vScale(vAdd(centers[k], centers[k + 1]), 0.5);
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % segs;
        const a = r0[i], b = r0[j], c = r1[j], d = r1[i];
        const qMid = [
          (a[0] + b[0] + c[0] + d[0]) * 0.25,
          (a[1] + b[1] + c[1] + d[1]) * 0.25,
          (a[2] + b[2] + c[2] + d[2]) * 0.25,
        ];
        this.addQuad(a, b, c, d, vSub(qMid, midC));
      }
    }
    if (capStart) {
      const dir = vSub(centers[0], centers[1]);
      this.addPolygonCap(rings[0], vLen(dir) > 1e-6 ? dir : [0, -1, 0]);
    }
    if (capEnd) {
      const last = rings.length - 1;
      const dir = vSub(centers[last], centers[last - 1]);
      this.addPolygonCap(rings[last], vLen(dir) > 1e-6 ? dir : [0, 1, 0]);
    }
  }

  addChamferBox({
    center = [0, 0, 0],
    size = [1, 1, 1],
    rotDeg = [0, 0, 0],
    topScale = [0.88, 0.88],
    botScale = [1.0, 1.0],
    chamfer = 0.16,
    minYClamp = null,
  }) {
    const q = quatFromEulerXYZ(rotDeg[0], rotDeg[1], rotDeg[2]);
    const hx = size[0] * 0.5, hy = size[1] * 0.5, hz = size[2] * 0.5;
    const chB = Math.min(hx, hz) * chamfer * 2.0;
    const chT = Math.min(hx * topScale[0], hz * topScale[1]) * chamfer * 2.0;
    const xf = (pt) => {
      const w = vAdd(center, rotateVecByQuat(pt, q));
      if (minYClamp !== null && w[1] < minYClamp) w[1] = minYClamp;
      return w;
    };
    const rBot = makeRectChamferRing(hx * botScale[0], hz * botScale[1], chB, -hy).map(xf);
    const rTop = makeRectChamferRing(hx * topScale[0], hz * topScale[1], chT, hy).map(xf);
    this.addLoft([rBot, rTop], [xf([0, -hy, 0]), xf([0, hy, 0])], true, true);
  }

  addTubeAlongSpine(stations, sides = 6, capStart = true, capEnd = true, upHint = [0, 1, 0], minYClamp = null) {
    if (stations.length < 2) return;
    const rings = [];
    const centers = [];
    let prevUp = vNorm(upHint);
    for (let k = 0; k < stations.length; k++) {
      const cur = stations[k].pos;
      const tang =
        k === 0
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

      const rx = stations[k].rx ?? stations[k].r ?? 0.1;
      const ry = stations[k].ry ?? stations[k].r ?? rx;
      const ring = [];
      for (let i = 0; i < sides; i++) {
        const th = (2 * Math.PI * i) / sides + Math.PI / sides;
        const pt = vAdd(cur, vAdd(vScale(side, Math.cos(th) * rx), vScale(up, Math.sin(th) * ry)));
        if (minYClamp !== null && pt[1] < minYClamp) pt[1] = minYClamp;
        ring.push(pt);
      }
      rings.push(ring);
      const cPt = [...cur];
      if (minYClamp !== null && cPt[1] < minYClamp) cPt[1] = minYClamp;
      centers.push(cPt);
    }
    this.addLoft(rings, centers, capStart, capEnd);
  }

  addSculptedLobe({
    center = [0, 0, 0],
    radii = [0.5, 0.5, 0.5],
    rotDeg = [0, 0, 0],
    sectors = 10,
    stacks = 6,
    flattenBottom = 0.0,
    pinchX = 0.0,
    ribCount = 0,
    ribAmp = 0.0,
    phaseRad = 0,
    minYClamp = null,
  }) {
    const q = quatFromEulerXYZ(rotDeg[0], rotDeg[1], rotDeg[2]);
    const xf = (p) => {
      const w = vAdd(center, rotateVecByQuat(p, q));
      if (minYClamp !== null && w[1] < minYClamp) w[1] = minYClamp;
      return w;
    };
    const botPole = xf([0, -radii[1] * (1.0 - flattenBottom * 0.55), 0]);
    const topPole = xf([0, radii[1], 0]);
    const rings = [];
    for (let st = 1; st < stacks; st++) {
      const v = st / stacks;
      const phi = (v - 0.5) * Math.PI;
      let y = Math.sin(phi) * radii[1];
      if (y < 0 && flattenBottom > 0) y *= 1.0 - flattenBottom * 0.55 * Math.abs(Math.sin(phi));
      const cosP = Math.cos(phi);
      const ring = [];
      for (let s = 0; s < sectors; s++) {
        const th = (2 * Math.PI * s) / sectors + phaseRad;
        const rib = ribCount > 0 ? 1.0 + ribAmp * Math.sin(v * Math.PI) * Math.cos(ribCount * th) : 1.0;
        const xVal = Math.cos(th) * cosP * radii[0] * rib;
        const pinch = 1.0 + pinchX * (xVal / (radii[0] || 1));
        const zVal = Math.sin(th) * cosP * radii[2] * rib * pinch;
        ring.push(xf([xVal, y, zVal]));
      }
      rings.push(ring);
    }
    for (let s = 0; s < sectors; s++) {
      const j = (s + 1) % sectors;
      const a = rings[0][s], b = rings[0][j];
      this.addTri(botPole, b, a, vSub(vScale(vAdd(botPole, vAdd(a, b)), 1 / 3), center));
    }
    for (let k = 0; k < rings.length - 1; k++) {
      const r0 = rings[k], r1 = rings[k + 1];
      for (let s = 0; s < sectors; s++) {
        const j = (s + 1) % sectors;
        const qMid = vScale(vAdd(vAdd(r0[s], r0[j]), vAdd(r1[j], r1[s])), 0.25);
        this.addQuad(r0[s], r0[j], r1[j], r1[s], vSub(qMid, center));
      }
    }
    const lastR = rings[rings.length - 1];
    for (let s = 0; s < sectors; s++) {
      const j = (s + 1) % sectors;
      const a = lastR[s], b = lastR[j];
      this.addTri(topPole, a, b, vSub(vScale(vAdd(topPole, vAdd(a, b)), 1 / 3), center));
    }
  }

  addFlaredBlade({
    pStart,
    pEnd,
    flareDir,
    thickness = 0.14,
    backWidth = 0.08,
    flareStart = 0.08,
    flarePeak = 0.34,
    flareSub = 0.20,
    flareEnd = 0.03,
    minYClamp = null,
  }) {
    const axis = vNorm(vSub(pEnd, pStart));
    const fDir = vNorm(vSub(flareDir, vScale(axis, vDot(flareDir, axis))));
    const sideDir = vNorm(vCross(axis, fDir));
    const stations = [
      { t: 0.0, fw: flareStart, bw: backWidth * 0.85, th: thickness * 0.75 },
      { t: 0.3, fw: flarePeak, bw: backWidth * 1.05, th: thickness },
      { t: 0.66, fw: flareSub, bw: backWidth * 0.8, th: thickness * 0.76 },
      { t: 0.96, fw: flareEnd, bw: backWidth * 0.32, th: thickness * 0.3 },
    ];
    const rings = [];
    const centers = [];
    for (const st of stations) {
      const base = vLerp(pStart, pEnd, st.t);
      const pts = [
        vAdd(base, vScale(fDir, st.fw)),
        vAdd(base, vAdd(vScale(fDir, st.fw * 0.34), vScale(sideDir, st.th * 0.5))),
        vAdd(base, vAdd(vScale(fDir, -st.bw * 0.65), vScale(sideDir, st.th * 0.38))),
        vAdd(base, vScale(fDir, -st.bw)),
        vAdd(base, vAdd(vScale(fDir, -st.bw * 0.65), vScale(sideDir, -st.th * 0.38))),
        vAdd(base, vAdd(vScale(fDir, st.fw * 0.34), vScale(sideDir, -st.th * 0.5))),
      ];
      for (const p of pts) if (minYClamp !== null && p[1] < minYClamp) p[1] = minYClamp;
      const cPt = vAdd(base, vScale(fDir, (st.fw - st.bw) * 0.2));
      if (minYClamp !== null && cPt[1] < minYClamp) cPt[1] = minYClamp;
      rings.push(pts);
      centers.push(cPt);
    }
    this.addLoft(rings, centers, true, true);
  }

  addOrientedShield(origin, outAxis, upAxis, poly2D, thickness = 0.04, topShrink = 0.86, backInset = 0.01) {
    const out = vNorm(outAxis);
    let right = vCross(upAxis, out);
    if (vLen(right) < 1e-5) right = vCross([0, 1, 0], out);
    right = vNorm(right);
    const up = vNorm(vCross(out, right));
    const rBack = poly2D.map(([x, y]) =>
      vAdd(origin, vAdd(vScale(right, x), vAdd(vScale(up, y), vScale(out, -backInset))))
    );
    const rFront = poly2D.map(([x, y]) =>
      vAdd(origin, vAdd(vScale(right, x * topShrink), vAdd(vScale(up, y * topShrink), vScale(out, thickness))))
    );
    this.addLoft(
      [rBack, rFront],
      [vAdd(origin, vScale(out, -backInset)), vAdd(origin, vScale(out, thickness))],
      true,
      true
    );
  }
}

// ---------------------------------------------------------------------------
// glTF 2.0 Binary (.glb) Builder
// ---------------------------------------------------------------------------

class GLBSceneBuilder {
  constructor() {
    this.materials = [];
    this.meshes = [];
    this.nodes = [];
    this.animations = [];
    this.bufferChunks = [];
    this.byteOffset = 0;
    this.bufferViews = [];
    this.accessors = [];
  }

  addMaterial({
    name,
    hex,
    alpha = 1.0,
    metallic = 0.14,
    roughness = 0.5,
    emissiveHex = null,
    emissiveBoost = 1.0,
    alphaMode = undefined,
    doubleSided = false,
  }) {
    const rgb = srgbHexToLinear(hex);
    const mat = {
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [rgb[0], rgb[1], rgb[2], Number(alpha.toFixed(4))],
        metallicFactor: Number(metallic.toFixed(4)),
        roughnessFactor: Number(roughness.toFixed(4)),
      },
    };
    if (emissiveHex) {
      const e = srgbHexToLinear(emissiveHex);
      mat.emissiveFactor = [
        Number(clamp(e[0] * emissiveBoost, 0, 1).toFixed(6)),
        Number(clamp(e[1] * emissiveBoost, 0, 1).toFixed(6)),
        Number(clamp(e[2] * emissiveBoost, 0, 1).toFixed(6)),
      ];
    }
    if (alphaMode) mat.alphaMode = alphaMode;
    if (doubleSided) mat.doubleSided = true;
    const idx = this.materials.length;
    this.materials.push(mat);
    return idx;
  }

  _appendBuffer(buf, target) {
    const pad = (4 - (buf.length % 4)) % 4;
    const aligned = pad > 0 ? Buffer.concat([buf, Buffer.alloc(pad, 0)]) : buf;
    const bv = { buffer: 0, byteOffset: this.byteOffset, byteLength: buf.length };
    if (target !== undefined) bv.target = target;
    const bvIdx = this.bufferViews.length;
    this.bufferViews.push(bv);
    this.bufferChunks.push(aligned);
    this.byteOffset += aligned.length;
    return bvIdx;
  }

  _addFloatAccessor(arr, comps, typeStr, target) {
    const buf = Buffer.alloc(arr.length * 4);
    const mins = new Array(comps).fill(Infinity);
    const maxs = new Array(comps).fill(-Infinity);
    for (let i = 0; i < arr.length; i++) {
      buf.writeFloatLE(Number.isFinite(arr[i]) ? arr[i] : 0, i * 4);
      const f32 = buf.readFloatLE(i * 4);
      const c = i % comps;
      if (f32 < mins[c]) mins[c] = f32;
      if (f32 > maxs[c]) maxs[c] = f32;
    }
    const bv = this._appendBuffer(buf, target);
    const idx = this.accessors.length;
    this.accessors.push({
      bufferView: bv,
      componentType: 5126,
      count: arr.length / comps,
      type: typeStr,
      min: mins.map((x) => Number(x.toFixed(6))),
      max: maxs.map((x) => Number(x.toFixed(6))),
    });
    return idx;
  }

  _addU16Accessor(arr, target) {
    const buf = Buffer.alloc(arr.length * 2);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      buf.writeUInt16LE(arr[i], i * 2);
      if (arr[i] < mn) mn = arr[i];
      if (arr[i] > mx) mx = arr[i];
    }
    const bv = this._appendBuffer(buf, target);
    const idx = this.accessors.length;
    this.accessors.push({
      bufferView: bv,
      componentType: 5123,
      count: arr.length,
      type: 'SCALAR',
      min: [mn],
      max: [mx],
    });
    return idx;
  }

  addMesh(name, primGeoms) {
    const primitives = [];
    for (const pg of primGeoms) {
      if (!pg || pg.isEmpty()) continue;
      if (pg.vertexCount > 65535) throw new Error(`Mesh ${name} exceeds uint16 limit`);
      primitives.push({
        attributes: {
          POSITION: this._addFloatAccessor(pg.positions, 3, 'VEC3', 34962),
          NORMAL: this._addFloatAccessor(pg.normals, 3, 'VEC3', 34962),
        },
        indices: this._addU16Accessor(pg.indices, 34963),
        material: pg.materialIndex,
        mode: 4,
      });
    }
    if (primitives.length === 0) throw new Error(`Empty mesh: ${name}`);
    const idx = this.meshes.length;
    this.meshes.push({ name, primitives });
    return idx;
  }

  addNode({ name, meshIndex = null, translation = null, rotation = null, scale = null, parentIndex = null }) {
    const node = { name };
    if (meshIndex !== null) node.mesh = meshIndex;
    if (translation) node.translation = translation.map((v) => Number(v.toFixed(6)));
    if (rotation) node.rotation = rotation.map((v) => Number(v.toFixed(7)));
    if (scale) node.scale = scale.map((v) => Number(v.toFixed(6)));
    const idx = this.nodes.length;
    this.nodes.push(node);
    if (parentIndex !== null) {
      if (!this.nodes[parentIndex].children) this.nodes[parentIndex].children = [];
      this.nodes[parentIndex].children.push(idx);
    }
    return idx;
  }

  /**
   * Computes exact rest-pose world minY across all mesh primitives so a floating
   * organism's primary hub node can be calibrated to touch exact world Y = 0.0000
   * before animations are authored.
   */
  computeWorldBounds(rawGeomByNode) {
    const parentMap = new Map();
    this.nodes.forEach((n, idx) => {
      for (const c of n.children || []) parentMap.set(c, idx);
    });
    const worldPt = (nIdx, p) => {
      let cur = p;
      let idx = nIdx;
      while (idx !== undefined) {
        const n = this.nodes[idx];
        if (n.scale) cur = [cur[0] * n.scale[0], cur[1] * n.scale[1], cur[2] * n.scale[2]];
        if (n.rotation) cur = rotateVecByQuat(cur, n.rotation);
        if (n.translation) cur = vAdd(cur, n.translation);
        idx = parentMap.get(idx);
      }
      return cur;
    };
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let maxHorizR = 0;
    for (const [nIdx, geoms] of rawGeomByNode.entries()) {
      for (const pg of geoms) {
        for (let i = 0; i < pg.positions.length; i += 3) {
          const w = worldPt(nIdx, [pg.positions[i], pg.positions[i + 1], pg.positions[i + 2]]);
          for (let c = 0; c < 3; c++) {
            if (w[c] < min[c]) min[c] = w[c];
            if (w[c] > max[c]) max[c] = w[c];
          }
          const hr = Math.hypot(w[0], w[2]);
          if (hr > maxHorizR) maxHorizR = hr;
        }
      }
    }
    return { min, max, maxHorizR };
  }

  addAnimation(name, tracks) {
    const samplers = [];
    const channels = [];
    for (const tr of tracks) {
      const inAcc = this._addFloatAccessor(tr.times, 1, 'SCALAR');
      const comps = tr.path === 'rotation' ? 4 : 3;
      const typeStr = tr.path === 'rotation' ? 'VEC4' : 'VEC3';
      const flat = [];
      for (const val of tr.values) for (let c = 0; c < comps; c++) flat.push(val[c]);
      const outAcc = this._addFloatAccessor(flat, comps, typeStr);
      const sampIdx = samplers.length;
      samplers.push({ input: inAcc, output: outAcc, interpolation: tr.interpolation || 'LINEAR' });
      channels.push({ sampler: sampIdx, target: { node: tr.nodeIndex, path: tr.path } });
    }
    this.animations.push({ name, samplers, channels });
  }

  buildGLB(sceneName) {
    const hasParent = new Set();
    for (const n of this.nodes) for (const c of n.children || []) hasParent.add(c);
    const rootNodes = [];
    for (let i = 0; i < this.nodes.length; i++) if (!hasParent.has(i)) rootNodes.push(i);

    const binChunk = Buffer.concat(this.bufferChunks);
    const gltf = {
      asset: { version: '2.0', generator: 'StarfallCommand-GnarlSiegeAirGenerator-1.0' },
      scene: 0,
      scenes: [{ name: sceneName, nodes: rootNodes }],
      nodes: this.nodes,
      materials: this.materials,
      meshes: this.meshes,
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [{ byteLength: binChunk.length }],
    };
    if (this.animations.length > 0) gltf.animations = this.animations;

    const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
    const jsonChunk = jsonPad > 0 ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;

    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

    const jsonHdr = Buffer.alloc(8);
    jsonHdr.writeUInt32LE(jsonChunk.length, 0);
    jsonHdr.writeUInt32LE(0x4e4f534a, 4);

    const binHdr = Buffer.alloc(8);
    binHdr.writeUInt32LE(binChunk.length, 0);
    binHdr.writeUInt32LE(0x004e4942, 4);

    return { glbBuffer: Buffer.concat([header, jsonHdr, jsonChunk, binHdr, binChunk]), gltf };
  }
}

// ---------------------------------------------------------------------------
// Gnarl Brood Palette (Teal Team Meshes + Dark Plum Rupture-Crawler Carapace)
// ---------------------------------------------------------------------------

function createGnarlSiegeAirMaterials(scene) {
  return {
    Surf_TEAM: scene.addMaterial({
      name: 'Surf_TEAM',
      hex: '#22b4c8',
      metallic: 0.20,
      roughness: 0.38,
      emissiveHex: '#127688',
      emissiveBoost: 0.45,
    }),
    Surf_GLOW: scene.addMaterial({
      name: 'Surf_GLOW',
      hex: '#4ce8f5',
      metallic: 0.04,
      roughness: 0.18,
      emissiveHex: '#26d4e8',
      emissiveBoost: 1.75,
    }),
    // Dark plum Gnarl Brood carapace & bone lineage (matches Rupture Crawler)
    ChitinBody: scene.addMaterial({
      name: 'Mat_ChitinBody',
      hex: '#4e335a',
      metallic: 0.22,
      roughness: 0.46,
    }),
    ChitinRidge: scene.addMaterial({
      name: 'Mat_ChitinRidge',
      hex: '#9468a6',
      metallic: 0.18,
      roughness: 0.36,
    }),
    ChitinDark: scene.addMaterial({
      name: 'Mat_ChitinDark',
      hex: '#22142b',
      metallic: 0.28,
      roughness: 0.54,
    }),
    BoneSpur: scene.addMaterial({
      name: 'Mat_BoneSpur',
      hex: '#dac9ae',
      metallic: 0.10,
      roughness: 0.36,
    }),
    WarmMembrane: scene.addMaterial({
      name: 'Mat_WarmMembrane',
      hex: '#693642',
      metallic: 0.06,
      roughness: 0.70,
    }),
    // Caustic acid & amber bio-vein / gestational sac materials
    CausticGreen: scene.addMaterial({
      name: 'Mat_CausticGreen',
      hex: '#30c416',
      metallic: 0.04,
      roughness: 0.26,
      emissiveHex: '#187508',
      emissiveBoost: 0.52,
    }),
    CausticLime: scene.addMaterial({
      name: 'Mat_CausticLime',
      hex: '#9be01e',
      metallic: 0.02,
      roughness: 0.20,
      emissiveHex: '#569008',
      emissiveBoost: 0.64,
    }),
    AmberSac: scene.addMaterial({
      name: 'Mat_AmberSac',
      hex: '#d96a0e',
      metallic: 0.03,
      roughness: 0.26,
      emissiveHex: '#8c3600',
      emissiveBoost: 0.48,
    }),
    AmberVein: scene.addMaterial({
      name: 'Mat_AmberVein',
      hex: '#eb9e14',
      metallic: 0.02,
      roughness: 0.20,
      emissiveHex: '#a85600',
      emissiveBoost: 0.68,
    }),
    AmberBright: scene.addMaterial({
      name: 'Mat_AmberBright',
      hex: '#ffc238',
      metallic: 0.00,
      roughness: 0.16,
      emissiveHex: '#bd6e06',
      emissiveBoost: 0.82,
    }),
  };
}

// Helper to register mesh + node while tracking raw geometry for exact Y=0 calibration
function attachMeshNode(scene, rawMap, { name, meshName = null, geoms, translation = null, rotation = null, parentIndex = null }) {
  const mIdx = scene.addMesh(meshName || `${name}_Mesh`, geoms);
  const nIdx = scene.addNode({ name, meshIndex: mIdx, translation, rotation, parentIndex });
  rawMap.set(nIdx, geoms);
  return nIdx;
}

// ===========================================================================
// 1. corrosion_flyer.glb
// Compact anti-air creature with swept armored fins and a protruding acid nozzle
// Radius: 1.56 | Anchor: Muzzle | Clips: idle, hover, attack, cast, death
// ===========================================================================

function buildCorrosionFlyerGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createGnarlSiegeAirMaterials(scene);
  const rawMap = new Map();

  const rootIdx = scene.addNode({ name: 'CorrosionFlyer', translation: [0, 0, 0] });
  const bodyIdx = scene.addNode({ name: 'BodyCore', translation: [0, 1.05, 0], parentIndex: rootIdx });

  // 1A. Compact Armored Thoracic Mantle & Tail Rudder
  const gBody = new PrimitiveGeom(mats.ChitinBody);
  const gRidge = new PrimitiveGeom(mats.ChitinRidge);
  const gDark = new PrimitiveGeom(mats.ChitinDark);
  const gBone = new PrimitiveGeom(mats.BoneSpur);
  const gWarm = new PrimitiveGeom(mats.WarmMembrane);

  gDark.addSculptedLobe({ center: [0.04, -0.10, 0], radii: [0.66, 0.23, 0.43], sectors: 10, stacks: 5, flattenBottom: 0.3 });
  gWarm.addSculptedLobe({ center: [-0.05, 0.02, 0], radii: [0.62, 0.24, 0.41], sectors: 10, stacks: 5 });

  // 3 overlapping dark-plum dorsal carapace tergites
  const tergites = [
    { cx: 0.34, cy: 0.19, sx: 0.42, sy: 0.15, sz: 0.76, rz: -11 },
    { cx: -0.02, cy: 0.25, sx: 0.46, sy: 0.17, sz: 0.86, rz: -3 },
    { cx: -0.38, cy: 0.21, sx: 0.44, sy: 0.15, sz: 0.72, rz: 9 },
  ];
  for (const t of tergites) {
    gBody.addChamferBox({ center: [t.cx, t.cy, 0], size: [t.sx, t.sy, t.sz], rotDeg: [0, 0, t.rz], topScale: [0.82, 0.86], chamfer: 0.18 });
    gRidge.addChamferBox({ center: [t.cx - 0.10, t.cy + 0.07, 0], size: [0.14, 0.07, t.sz * 0.9], rotDeg: [0, 0, t.rz], topScale: [0.76, 0.88] });
  }

  // Swept rear tail-rudder spine + split bone tail-barbs (reaches x ~ -1.52)
  gBody.addTubeAlongSpine(
    [
      { pos: [-0.50, 0.10, 0], rx: 0.25, ry: 0.18 },
      { pos: [-0.98, 0.14, 0], rx: 0.15, ry: 0.12 },
      { pos: [-1.42, 0.22, 0], rx: 0.06, ry: 0.06 },
    ],
    6
  );
  for (const side of [-1, 1]) {
    gBone.addTubeAlongSpine(
      [
        { pos: [-1.18, 0.18, side * 0.07], rx: 0.055, ry: 0.04 },
        { pos: [-1.52, 0.28, side * 0.22], rx: 0.012, ry: 0.012 },
      ],
      5
    );
  }

  attachMeshNode(scene, rawMap, {
    name: 'MantleCarapace',
    geoms: [gBody, gRidge, gDark, gBone, gWarm],
    parentIndex: bodyIdx,
  });

  // Articulated Ventral Keel & Sky-Tendrils ('VentralTendrils', touches exact Y=0 at rest and curls on flight/death)
  const gVtDark = new PrimitiveGeom(mats.ChitinDark);
  const gVtBone = new PrimitiveGeom(mats.BoneSpur);
  gVtDark.addFlaredBlade({
    pStart: [0.22, 0.02, 0],
    pEnd: [-0.52, -0.42, 0],
    flareDir: [0.25, -0.95, 0],
    thickness: 0.10,
    backWidth: 0.06,
    flarePeak: 0.18,
    flareSub: 0.11,
  });
  for (const side of [-1, 1]) {
    gVtDark.addTubeAlongSpine(
      [
        { pos: [0.16, -0.02, side * 0.20], rx: 0.065, ry: 0.055 },
        { pos: [-0.04, -0.46, side * 0.26], rx: 0.042, ry: 0.038 },
        { pos: [-0.26, -0.72, side * 0.22], rx: 0.025, ry: 0.025 },
      ],
      5
    );
    gVtBone.addTubeAlongSpine(
      [
        { pos: [-0.24, -0.68, side * 0.22], rx: 0.028, ry: 0.026 },
        { pos: [-0.40, -0.85, side * 0.18], rx: 0.008, ry: 0.008 },
      ],
      4
    );
    gVtDark.addTubeAlongSpine(
      [
        { pos: [-0.22, 0.00, side * 0.17], rx: 0.052, ry: 0.045 },
        { pos: [-0.48, -0.44, side * 0.20], rx: 0.032, ry: 0.028 },
        { pos: [-0.72, -0.68, side * 0.15], rx: 0.014, ry: 0.014 },
      ],
      5
    );
  }
  const ventralIdx = attachMeshNode(scene, rawMap, {
    name: 'VentralTendrils',
    geoms: [gVtDark, gVtBone],
    translation: [0, -0.20, 0],
    parentIndex: bodyIdx,
  });

  // 1B. Pressurized Dorsal-Anterior Caustic Reservoir ('AcidSac')
  const gSacGreen = new PrimitiveGeom(mats.CausticGreen);
  const gSacLime = new PrimitiveGeom(mats.CausticLime);
  const gSacDark = new PrimitiveGeom(mats.ChitinDark);
  gSacGreen.addSculptedLobe({
    center: [0, 0, 0],
    radii: [0.34, 0.22, 0.28],
    sectors: 10,
    stacks: 5,
    ribCount: 6,
    ribAmp: 0.06,
  });
  gSacLime.addSculptedLobe({
    center: [0.06, 0.12, 0],
    radii: [0.21, 0.13, 0.18],
    sectors: 8,
    stacks: 4,
  });
  for (const side of [-1, 1]) {
    gSacDark.addTubeAlongSpine(
      [
        { pos: [-0.20, -0.04, side * 0.28], rx: 0.038, ry: 0.03 },
        { pos: [0.02, 0.20, side * 0.25], rx: 0.032, ry: 0.026 },
        { pos: [0.24, 0.06, side * 0.19], rx: 0.024, ry: 0.02 },
      ],
      5
    );
  }
  const acidSacRest = [-0.08, 0.33, 0];
  const acidSacIdx = attachMeshNode(scene, rawMap, {
    name: 'AcidSac',
    geoms: [gSacGreen, gSacLime, gSacDark],
    translation: acidSacRest,
    parentIndex: bodyIdx,
  });

  // 1C. Primary Surf_TEAM & Surf_GLOW Nodes on BodyCore
  const gTeamMain = new PrimitiveGeom(mats.Surf_TEAM);
  const crestPoly = [[-0.16, -0.09], [0.16, -0.08], [0.13, 0.09], [-0.13, 0.10]];
  for (const side of [-1, 1]) {
    gTeamMain.addOrientedShield(
      [0.32, 0.26, side * 0.34],
      [0.14, 0.80, side * 0.58],
      [-0.96, 0.18, 0],
      crestPoly,
      0.04
    );
  }
  gTeamMain.addChamferBox({ center: [-0.94, 0.22, 0], size: [0.34, 0.09, 0.14], rotDeg: [0, 0, 12], topScale: [0.8, 0.7] });
  attachMeshNode(scene, rawMap, { name: 'Surf_TEAM', meshName: 'Surf_TEAM', geoms: [gTeamMain], parentIndex: bodyIdx });

  const gGlowMain = new PrimitiveGeom(mats.Surf_GLOW);
  for (const side of [-1, 1]) {
    gGlowMain.addSculptedLobe({ center: [0.24, 0.06, side * 0.42], radii: [0.08, 0.045, 0.045], sectors: 6, stacks: 4 });
    gGlowMain.addSculptedLobe({ center: [-0.16, 0.06, side * 0.42], radii: [0.075, 0.04, 0.04], sectors: 6, stacks: 4 });
  }
  attachMeshNode(scene, rawMap, { name: 'Surf_GLOW', meshName: 'Surf_GLOW', geoms: [gGlowMain], parentIndex: bodyIdx });

  // 1D. Protruding +X Acid Nozzle & Cephalic Visor ('NozzleAssembly' -> 'Head', 'Muzzle')
  const nozzleRest = [0.56, 0.02, 0];
  const nozzleIdx = scene.addNode({ name: 'NozzleAssembly', translation: nozzleRest, parentIndex: bodyIdx });

  const gNzBody = new PrimitiveGeom(mats.ChitinBody);
  const gNzRidge = new PrimitiveGeom(mats.ChitinRidge);
  const gNzDark = new PrimitiveGeom(mats.ChitinDark);
  const gNzBone = new PrimitiveGeom(mats.BoneSpur);
  const gNzGreen = new PrimitiveGeom(mats.CausticGreen);
  const gNzLime = new PrimitiveGeom(mats.CausticLime);

  // Sloped cephalic visor hood
  gNzBody.addChamferBox({ center: [0.06, 0.12, 0], size: [0.38, 0.18, 0.54], rotDeg: [0, 0, -16], topScale: [0.76, 0.8] });
  gNzRidge.addChamferBox({ center: [0.16, 0.19, 0], size: [0.22, 0.07, 0.38], rotDeg: [0, 0, -18], topScale: [0.74, 0.78] });

  // Long protruding +X telescoping chitin nozzle barrel (reaches world x = 0.56 + 0.96 = 1.52)
  gNzDark.addTubeAlongSpine(
    [
      { pos: [0.04, -0.02, 0], rx: 0.19, ry: 0.17 },
      { pos: [0.42, -0.03, 0], rx: 0.14, ry: 0.13 },
      { pos: [0.76, -0.04, 0], rx: 0.105, ry: 0.10 },
      { pos: [0.92, -0.04, 0], rx: 0.125, ry: 0.12 },
    ],
    8
  );
  // Pressurized caustic feeder duct & glowing inner acid core protruding at muzzle
  gNzGreen.addTubeAlongSpine(
    [
      { pos: [-0.14, -0.14, 0], rx: 0.08, ry: 0.07 },
      { pos: [0.28, -0.14, 0], rx: 0.07, ry: 0.065 },
      { pos: [0.64, -0.06, 0], rx: 0.065, ry: 0.06 },
      { pos: [0.945, -0.04, 0], rx: 0.078, ry: 0.078 },
    ],
    7
  );
  gNzLime.addSculptedLobe({ center: [0.925, -0.04, 0], radii: [0.065, 0.082, 0.082], sectors: 8, stacks: 4 });

  // 3 calcified bone nozzle-crown stabilizer prongs framing the protruding acid muzzle
  for (const angDeg of [90, 212, 328]) {
    const rad = degToRad(angDeg);
    const cz = Math.cos(rad), sy = Math.sin(rad);
    gNzBone.addTubeAlongSpine(
      [
        { pos: [0.52, -0.04 + sy * 0.12, cz * 0.12], rx: 0.042, ry: 0.035 },
        { pos: [0.80, -0.04 + sy * 0.15, cz * 0.15], rx: 0.028, ry: 0.024 },
        { pos: [0.965, -0.04 + sy * 0.10, cz * 0.10], rx: 0.008, ry: 0.008 },
      ],
      5
    );
  }

  const headIdx = attachMeshNode(scene, rawMap, {
    name: 'Head',
    geoms: [gNzBody, gNzRidge, gNzDark, gNzBone, gNzGreen, gNzLime],
    parentIndex: nozzleIdx,
  });

  // Glowing compound eyes & brow badge on Head
  const gHeadGlow = new PrimitiveGeom(mats.Surf_GLOW);
  for (const side of [-1, 1]) {
    gHeadGlow.addSculptedLobe({ center: [0.20, 0.10, side * 0.22], radii: [0.07, 0.045, 0.04], sectors: 6, stacks: 4 });
  }
  attachMeshNode(scene, rawMap, { name: 'Surf_GLOW_Eyes', meshName: 'Surf_GLOW_Eyes', geoms: [gHeadGlow], parentIndex: headIdx });

  const gHeadTeam = new PrimitiveGeom(mats.Surf_TEAM);
  gHeadTeam.addOrientedShield([0.08, 0.23, 0], [0.28, 0.96, 0], [-0.96, 0.28, 0], [[-0.1, -0.12], [0.1, -0.12], [0.06, 0.11], [-0.06, 0.11]], 0.035);
  attachMeshNode(scene, rawMap, { name: 'Surf_TEAM_Brow', meshName: 'Surf_TEAM_Brow', geoms: [gHeadTeam], parentIndex: headIdx });

  // Required Muzzle anchor right at tip of protruding +X acid nozzle
  scene.addNode({ name: 'Muzzle', translation: [0.97, -0.04, 0], parentIndex: nozzleIdx });

  // 1E. Swept Armored Fins (Upper Primary Swept Fins + Lower Ventral Stabilizer Fins)
  const upperFinNodes = [];
  const lowerFinNodes = [];
  for (const [tag, side] of [['R', 1], ['L', -1]]) {
    const gFB = new PrimitiveGeom(mats.ChitinBody);
    const gFR = new PrimitiveGeom(mats.ChitinRidge);
    const gFD = new PrimitiveGeom(mats.ChitinDark);
    const gFBo = new PrimitiveGeom(mats.BoneSpur);

    // Primary swept armored wing-blade (fits cleanly inside radius 1.56)
    gFD.addSculptedLobe({ center: [0.0, 0.0, side * 0.04], radii: [0.18, 0.11, 0.14], sectors: 8, stacks: 4 });
    gFB.addFlaredBlade({
      pStart: [0.08, 0.01, side * 0.04],
      pEnd: [-0.55, 0.20, side * 1.01],
      flareDir: [-0.86, 0.18, side * -0.46],
      thickness: 0.13,
      backWidth: 0.11,
      flareStart: 0.22,
      flarePeak: 0.40,
      flareSub: 0.26,
      flareEnd: 0.05,
    });
    // Secondary overlapping ridge vane
    gFR.addFlaredBlade({
      pStart: [-0.04, 0.05, side * 0.12],
      pEnd: [-0.62, 0.18, side * 0.84],
      flareDir: [-0.90, 0.22, side * -0.35],
      thickness: 0.09,
      backWidth: 0.06,
      flareStart: 0.12,
      flarePeak: 0.25,
      flareSub: 0.17,
      flareEnd: 0.04,
    });
    // Calcified bone leading-edge spar & swept wingtip barb
    gFBo.addTubeAlongSpine(
      [
        { pos: [0.14, 0.02, side * 0.05], rx: 0.055, ry: 0.045 },
        { pos: [-0.20, 0.12, side * 0.55], rx: 0.044, ry: 0.036 },
        { pos: [-0.60, 0.22, side * 1.09], rx: 0.012, ry: 0.012 },
      ],
      5
    );

    const fIdx = attachMeshNode(scene, rawMap, {
      name: `FinUpper_${tag}`,
      geoms: [gFB, gFR, gFD, gFBo],
      translation: [0.16, 0.12, side * 0.36],
      parentIndex: bodyIdx,
    });
    upperFinNodes.push({ idx: fIdx, side });

    // Teal team stripe inlaid on each swept armored fin
    const gFTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gFTeam.addOrientedShield(
      [-0.24, 0.14, side * 0.52],
      [0.10, 0.94, side * -0.32],
      [-0.52, 0.26, side * 0.81],
      [[-0.11, -0.26], [0.11, -0.22], [0.08, 0.26], [-0.08, 0.22]],
      0.036
    );
    attachMeshNode(scene, rawMap, {
      name: `Surf_TEAM_Fin${tag}`,
      meshName: `Surf_TEAM_Fin${tag}`,
      geoms: [gFTeam],
      parentIndex: fIdx,
    });

    // Lower swept ventral-aft stabilizer fin
    const gLB = new PrimitiveGeom(mats.ChitinBody);
    const gLBo = new PrimitiveGeom(mats.BoneSpur);
    gLB.addFlaredBlade({
      pStart: [0.04, 0.0, side * 0.02],
      pEnd: [-0.52, -0.22, side * 0.68],
      flareDir: [-0.88, -0.20, side * -0.42],
      thickness: 0.09,
      backWidth: 0.07,
      flareStart: 0.12,
      flarePeak: 0.24,
      flareSub: 0.15,
      flareEnd: 0.03,
    });
    gLBo.addTubeAlongSpine(
      [
        { pos: [0.06, 0.0, side * 0.03], rx: 0.038, ry: 0.032 },
        { pos: [-0.55, -0.23, side * 0.72], rx: 0.01, ry: 0.01 },
      ],
      5
    );
    const lIdx = attachMeshNode(scene, rawMap, {
      name: `FinLower_${tag}`,
      geoms: [gLB, gLBo],
      translation: [-0.26, -0.10, side * 0.30],
      parentIndex: bodyIdx,
    });
    lowerFinNodes.push({ idx: lIdx, side });
  }

  // Calibrate BodyCore Y so lowest ventral tendril tip sits at exact world Y = 0.0000
  const preBounds = scene.computeWorldBounds(rawMap);
  const bodyRest = [0, Number((1.05 - preBounds.min[1]).toFixed(6)), 0];
  scene.nodes[bodyIdx].translation = bodyRest;

  // 1F. Animations: idle, hover, attack, cast, death
  const idQ = [0, 0, 0, 1];
  const uS = [1, 1, 1];

  // idle (1.8s seamless loop, Y >= 0 throughout)
  const tIdle = [0, 0.45, 0.90, 1.35, 1.80];
  scene.addAnimation('idle', [
    {
      nodeIndex: bodyIdx,
      path: 'translation',
      times: tIdle,
      values: [
        bodyRest,
        [bodyRest[0], bodyRest[1] + 0.055, 0],
        [bodyRest[0], bodyRest[1] + 0.095, 0],
        [bodyRest[0], bodyRest[1] + 0.035, 0],
        bodyRest,
      ],
    },
    {
      nodeIndex: bodyIdx,
      path: 'rotation',
      times: tIdle,
      values: [idQ, quatFromEulerXYZ(0, 0, 2.5), quatFromEulerXYZ(0, 0, -1.5), quatFromEulerXYZ(0, 0, 1.0), idQ],
    },
    {
      nodeIndex: acidSacIdx,
      path: 'scale',
      times: tIdle,
      values: [uS, [1.05, 1.07, 1.05], [0.98, 0.97, 0.98], [1.03, 1.04, 1.03], uS],
    },
    ...upperFinNodes.map((f) => ({
      nodeIndex: f.idx,
      path: 'rotation',
      times: tIdle,
      values: [idQ, quatFromEulerXYZ(f.side * 6, 0, 0), quatFromEulerXYZ(f.side * -5, 0, 0), quatFromEulerXYZ(f.side * 4, 0, 0), idQ],
    })),
    ...lowerFinNodes.map((f) => ({
      nodeIndex: f.idx,
      path: 'rotation',
      times: tIdle,
      values: [idQ, quatFromEulerXYZ(f.side * -5, 0, 0), quatFromEulerXYZ(f.side * 4, 0, 0), quatFromEulerXYZ(f.side * -3, 0, 0), idQ],
    })),
  ]);

  // hover (1.2s brisk aerial flight loop)
  const tHover = [0, 0.30, 0.60, 0.90, 1.20];
  scene.addAnimation('hover', [
    {
      nodeIndex: bodyIdx,
      path: 'translation',
      times: tHover,
      values: [
        bodyRest,
        [bodyRest[0] + 0.05, bodyRest[1] + 0.08, 0],
        [bodyRest[0] + 0.02, bodyRest[1] + 0.13, 0],
        [bodyRest[0] - 0.03, bodyRest[1] + 0.05, 0],
        bodyRest,
      ],
    },
    {
      nodeIndex: bodyIdx,
      path: 'rotation',
      times: tHover,
      values: [idQ, quatFromEulerXYZ(2.5, 0, -6.5), quatFromEulerXYZ(0, 0, -4.0), quatFromEulerXYZ(-2.5, 0, -2.0), idQ],
    },
    ...upperFinNodes.map((f) => ({
      nodeIndex: f.idx,
      path: 'rotation',
      times: tHover,
      values: [idQ, quatFromEulerXYZ(f.side * 13, f.side * -4, 0), quatFromEulerXYZ(f.side * -10, f.side * 3, 0), quatFromEulerXYZ(f.side * 8, 0, 0), idQ],
    })),
    ...lowerFinNodes.map((f) => ({
      nodeIndex: f.idx,
      path: 'rotation',
      times: tHover,
      values: [idQ, quatFromEulerXYZ(f.side * -9, 0, 0), quatFromEulerXYZ(f.side * 8, 0, 0), quatFromEulerXYZ(f.side * -6, 0, 0), idQ],
    })),
  ]);

  // attack (0.75s pressurized acid-bolt spit + nozzle recoil)
  const tAtk = [0, 0.18, 0.30, 0.50, 0.75];
  scene.addAnimation('attack', [
    {
      nodeIndex: bodyIdx,
      path: 'translation',
      times: tAtk,
      values: [
        bodyRest,
        [bodyRest[0] - 0.09, bodyRest[1] + 0.05, 0],
        [bodyRest[0] + 0.08, bodyRest[1] + 0.03, 0],
        [bodyRest[0] - 0.06, bodyRest[1] + 0.04, 0],
        bodyRest,
      ],
    },
    {
      nodeIndex: nozzleIdx,
      path: 'translation',
      times: tAtk,
      values: [
        nozzleRest,
        [nozzleRest[0] - 0.06, nozzleRest[1] + 0.02, 0],
        [nozzleRest[0] + 0.11, nozzleRest[1] - 0.01, 0],
        [nozzleRest[0] - 0.09, nozzleRest[1] + 0.01, 0],
        nozzleRest,
      ],
    },
    {
      nodeIndex: acidSacIdx,
      path: 'scale',
      times: tAtk,
      values: [uS, [1.16, 1.18, 1.16], [0.80, 0.78, 0.80], [0.94, 0.95, 0.94], uS],
    },
    ...upperFinNodes.map((f) => ({
      nodeIndex: f.idx,
      path: 'rotation',
      times: tAtk,
      values: [idQ, quatFromEulerXYZ(f.side * 14, f.side * 8, 0), quatFromEulerXYZ(f.side * -12, f.side * -10, 0), quatFromEulerXYZ(f.side * -4, 0, 0), idQ],
    })),
  ]);

  // cast (1.10s sustained corrosive deluge / corruption channel)
  const tCast = [0, 0.22, 0.48, 0.76, 1.10];
  scene.addAnimation('cast', [
    {
      nodeIndex: bodyIdx,
      path: 'translation',
      times: tCast,
      values: [
        bodyRest,
        [bodyRest[0] - 0.05, bodyRest[1] + 0.12, 0],
        [bodyRest[0] + 0.06, bodyRest[1] + 0.14, 0],
        [bodyRest[0] + 0.04, bodyRest[1] + 0.10, 0],
        bodyRest,
      ],
    },
    {
      nodeIndex: bodyIdx,
      path: 'rotation',
      times: tCast,
      values: [idQ, quatFromEulerXYZ(0, 0, 10), quatFromEulerXYZ(0, 0, -7), quatFromEulerXYZ(0, 0, -5), idQ],
    },
    {
      nodeIndex: nozzleIdx,
      path: 'translation',
      times: tCast,
      values: [
        nozzleRest,
        [nozzleRest[0] + 0.04, nozzleRest[1] + 0.02, 0],
        [nozzleRest[0] + 0.13, nozzleRest[1] - 0.02, 0],
        [nozzleRest[0] + 0.10, nozzleRest[1] - 0.01, 0],
        nozzleRest,
      ],
    },
    {
      nodeIndex: acidSacIdx,
      path: 'scale',
      times: tCast,
      values: [uS, [1.22, 1.24, 1.22], [0.84, 0.82, 0.84], [1.10, 1.12, 1.10], uS],
    },
    ...upperFinNodes.map((f) => ({
      nodeIndex: f.idx,
      path: 'rotation',
      times: tCast,
      values: [idQ, quatFromEulerXYZ(f.side * 18, f.side * 14, 0), quatFromEulerXYZ(f.side * 12, f.side * 16, 0), quatFromEulerXYZ(f.side * 8, f.side * 10, 0), idQ],
    })),
  ]);

  // death (1.05s acid-sac rupture & crash settle cleanly at Y >= 0)
  const tDeath = [0, 0.22, 0.58, 1.05];
  scene.addAnimation('death', [
    {
      nodeIndex: bodyIdx,
      path: 'translation',
      times: tDeath,
      values: [
        bodyRest,
        [bodyRest[0] - 0.06, bodyRest[1] + 0.10, 0.04],
        [-0.10, 0.84, 0.08],
        [-0.12, 0.72, 0.10],
      ],
    },
    {
      nodeIndex: bodyIdx,
      path: 'rotation',
      times: tDeath,
      values: [idQ, quatFromEulerXYZ(8, -5, 12), quatFromEulerXYZ(18, -10, -10), quatFromEulerXYZ(24, -12, -14)],
    },
    {
      nodeIndex: ventralIdx,
      path: 'rotation',
      times: tDeath,
      values: [idQ, quatFromEulerXYZ(0, 0, -12), quatFromEulerXYZ(0, 0, 48), quatFromEulerXYZ(0, 0, 66)],
    },
    {
      nodeIndex: ventralIdx,
      path: 'scale',
      times: tDeath,
      values: [uS, uS, [0.90, 0.58, 0.90], [0.85, 0.45, 0.85]],
    },
    {
      nodeIndex: acidSacIdx,
      path: 'scale',
      times: tDeath,
      values: [uS, [1.18, 1.14, 1.18], [0.58, 0.48, 0.58], [0.44, 0.34, 0.44]],
    },
    ...upperFinNodes.map((f) => ({
      nodeIndex: f.idx,
      path: 'rotation',
      times: tDeath,
      values: [idQ, quatFromEulerXYZ(f.side * 16, 0, 0), quatFromEulerXYZ(f.side * -12, f.side * 8, 0), quatFromEulerXYZ(f.side * -16, f.side * 12, 0)],
    })),
  ]);

  return scene.buildGLB('CorrosionFlyerScene');
}

// ===========================================================================
// 2. brood_siege_flyer.glb
// Broad slow living siege craft with two asymmetrical broodling launch sacs
// Radius: 2.5 | Anchors: LeftLauncher, RightLauncher | Clips: idle, hover, attack, death
// ===========================================================================

function buildBroodSiegeFlyerGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createGnarlSiegeAirMaterials(scene);
  const rawMap = new Map();

  const rootIdx = scene.addNode({ name: 'BroodSiegeFlyer', translation: [0, 0, 0] });
  const mantleIdx = scene.addNode({ name: 'SiegeMantle', translation: [0, 1.18, 0], parentIndex: rootIdx });

  // 2A. Broad Vaulted Manta Siege Carapace
  const gBody = new PrimitiveGeom(mats.ChitinBody);
  const gRidge = new PrimitiveGeom(mats.ChitinRidge);
  const gDark = new PrimitiveGeom(mats.ChitinDark);
  const gBone = new PrimitiveGeom(mats.BoneSpur);
  const gWarm = new PrimitiveGeom(mats.WarmMembrane);

  gDark.addSculptedLobe({ center: [0.06, -0.14, 0], radii: [1.34, 0.28, 1.08], sectors: 12, stacks: 5, flattenBottom: 0.38 });
  gWarm.addSculptedLobe({ center: [-0.04, 0.02, 0], radii: [1.28, 0.30, 1.04], sectors: 12, stacks: 5 });

  const plates = [
    { cx: 0.72, cy: 0.20, sx: 0.64, sy: 0.18, sz: 1.56, rz: -9 },
    { cx: 0.18, cy: 0.29, sx: 0.72, sy: 0.20, sz: 1.88, rz: -3 },
    { cx: -0.38, cy: 0.28, sx: 0.68, sy: 0.20, sz: 1.72, rz: 4 },
    { cx: -0.90, cy: 0.20, sx: 0.58, sy: 0.17, sz: 1.28, rz: 10 },
  ];
  for (const p of plates) {
    gBody.addChamferBox({ center: [p.cx, p.cy, 0], size: [p.sx, p.sy, p.sz], rotDeg: [0, 0, p.rz], topScale: [0.84, 0.88], chamfer: 0.18 });
    gRidge.addChamferBox({ center: [p.cx - 0.14, p.cy + 0.08, 0], size: [0.18, 0.08, p.sz * 0.90], rotDeg: [0, 0, p.rz], topScale: [0.78, 0.88] });
  }

  // Dorsal siege keel-horns
  for (const [hx, hy, sc] of [[0.42, 0.38, 1.0], [-0.14, 0.44, 1.15], [-0.68, 0.38, 0.92]]) {
    gBone.addTubeAlongSpine(
      [
        { pos: [hx, hy, 0], rx: 0.085 * sc, ry: 0.07 * sc },
        { pos: [hx - 0.22 * sc, hy + 0.34 * sc, 0], rx: 0.016, ry: 0.016 },
      ],
      5
    );
  }

  attachMeshNode(scene, rawMap, {
    name: 'MantleShell',
    geoms: [gBody, gRidge, gDark, gBone, gWarm],
    parentIndex: mantleIdx,
  });

  // Articulated Ventral Brood-Tendrils touching exact Y=0 at rest and curling inward on death
  const gVtDark = new PrimitiveGeom(mats.ChitinDark);
  const gVtBone = new PrimitiveGeom(mats.BoneSpur);
  for (const [tx, tz, drop] of [[0.36, -0.44, -0.96], [0.28, 0.44, -0.92], [-0.42, -0.36, -0.88], [-0.48, 0.36, -0.86]]) {
    const s = tz < 0 ? -1 : 1;
    gVtDark.addTubeAlongSpine(
      [
        { pos: [tx, 0.00, tz], rx: 0.085, ry: 0.075 },
        { pos: [tx - 0.14, -0.52, tz + s * 0.08], rx: 0.052, ry: 0.048 },
        { pos: [tx - 0.28, drop + 0.16, tz + s * 0.04], rx: 0.030, ry: 0.028 },
      ],
      5
    );
    gVtBone.addTubeAlongSpine(
      [
        { pos: [tx - 0.26, drop + 0.18, tz + s * 0.04], rx: 0.032, ry: 0.030 },
        { pos: [tx - 0.38, drop, tz + s * 0.02], rx: 0.009, ry: 0.009 },
      ],
      4
    );
  }
  const siegeVentralIdx = attachMeshNode(scene, rawMap, {
    name: 'VentralTendrils',
    geoms: [gVtDark, gVtBone],
    translation: [0, -0.22, 0],
    parentIndex: mantleIdx,
  });

  // 2B. Split Armored +X Siege Prow ('Head') & Segmented Rudder Tail ('TailRudder')
  const gProwB = new PrimitiveGeom(mats.ChitinBody);
  const gProwR = new PrimitiveGeom(mats.ChitinRidge);
  const gProwBo = new PrimitiveGeom(mats.BoneSpur);
  gProwB.addChamferBox({ center: [0.34, 0.06, 0], size: [0.74, 0.24, 1.08], rotDeg: [0, 0, -10], topScale: [0.78, 0.78] });
  gProwR.addChamferBox({ center: [0.46, 0.16, 0], size: [0.44, 0.08, 0.76], rotDeg: [0, 0, -12], topScale: [0.74, 0.76] });
  // Twin heavy curved bone siege-tusks (world x = 1.24 + 1.18 = 2.42, z = ±0.42 -> hypot = 2.456 <= 2.50)
  for (const side of [-1, 1]) {
    gProwBo.addTubeAlongSpine(
      [
        { pos: [0.48, -0.02, side * 0.44], rx: 0.11, ry: 0.09 },
        { pos: [0.88, -0.06, side * 0.48], rx: 0.072, ry: 0.06 },
        { pos: [1.18, 0.02, side * 0.36], rx: 0.016, ry: 0.016 },
      ],
      6
    );
  }
  const headIdx = attachMeshNode(scene, rawMap, {
    name: 'Head',
    geoms: [gProwB, gProwR, gProwBo],
    translation: [1.24, -0.02, 0],
    parentIndex: mantleIdx,
  });

  // Segmented Tail Rudder (world x = -1.22 - 1.22 = -2.44, z = ±0.34 -> hypot = 2.464 <= 2.50)
  const gTailB = new PrimitiveGeom(mats.ChitinBody);
  const gTailR = new PrimitiveGeom(mats.ChitinRidge);
  const gTailBo = new PrimitiveGeom(mats.BoneSpur);
  gTailB.addTubeAlongSpine(
    [
      { pos: [0.0, 0.04, 0], rx: 0.42, ry: 0.22 },
      { pos: [-0.58, 0.08, 0], rx: 0.28, ry: 0.16 },
      { pos: [-1.12, 0.14, 0], rx: 0.13, ry: 0.10 },
    ],
    6
  );
  for (const side of [-1, 1]) {
    gTailR.addFlaredBlade({
      pStart: [-0.46, 0.08, side * 0.12],
      pEnd: [-1.18, 0.20, side * 0.36],
      flareDir: [-0.45, 0.20, side * 0.86],
      thickness: 0.08,
      backWidth: 0.06,
      flarePeak: 0.20,
      flareSub: 0.14,
    });
    gTailBo.addTubeAlongSpine(
      [
        { pos: [-0.94, 0.14, side * 0.18], rx: 0.048, ry: 0.038 },
        { pos: [-1.22, 0.22, side * 0.34], rx: 0.012, ry: 0.012 },
      ],
      5
    );
  }
  const tailIdx = attachMeshNode(scene, rawMap, {
    name: 'TailRudder',
    geoms: [gTailB, gTailR, gTailBo],
    translation: [-1.22, 0.02, 0],
    parentIndex: mantleIdx,
  });

  // 2C. Primary Surf_TEAM & Surf_GLOW Nodes on SiegeMantle
  const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
  const mBadge = [[-0.24, -0.14], [0.24, -0.12], [0.19, 0.14], [-0.19, 0.16]];
  for (const side of [-1, 1]) {
    gTeam.addOrientedShield([0.36, 0.39, side * 0.56], [0.06, 0.94, side * 0.34], [-0.98, 0.08, 0], mBadge, 0.045);
    gTeam.addOrientedShield([-0.22, 0.38, side * 0.54], [-0.04, 0.94, side * 0.32], [-0.98, -0.06, 0], mBadge, 0.042);
  }
  gTeam.addOrientedShield([1.68, 0.19, 0], [0.26, 0.96, 0], [-0.96, 0.26, 0], [[-0.18, -0.22], [0.18, -0.22], [0.11, 0.20], [-0.11, 0.20]], 0.042);
  attachMeshNode(scene, rawMap, { name: 'Surf_TEAM', meshName: 'Surf_TEAM', geoms: [gTeam], parentIndex: mantleIdx });

  const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
  for (const side of [-1, 1]) {
    gGlow.addSculptedLobe({ center: [1.78, 0.06, side * 0.36], radii: [0.09, 0.055, 0.055], sectors: 6, stacks: 4 });
    gGlow.addSculptedLobe({ center: [0.58, 0.14, side * 0.88], radii: [0.11, 0.055, 0.065], sectors: 6, stacks: 4 });
    gGlow.addSculptedLobe({ center: [-0.24, 0.14, side * 0.84], radii: [0.10, 0.05, 0.06], sectors: 6, stacks: 4 });
  }
  attachMeshNode(scene, rawMap, { name: 'Surf_GLOW', meshName: 'Surf_GLOW', geoms: [gGlow], parentIndex: mantleIdx });
  // Keep Head referenced cleanly for look/portrait
  void headIdx;

  // 2D. Broad Slow Manta Siege Wings ('Wing_L' on -Z, 'Wing_R' on +Z)
  const wingNodes = [];
  for (const [tag, side] of [['L', -1], ['R', 1]]) {
    const gWB = new PrimitiveGeom(mats.ChitinBody);
    const gWR = new PrimitiveGeom(mats.ChitinRidge);
    const gWM = new PrimitiveGeom(mats.WarmMembrane);
    const gWBo = new PrimitiveGeom(mats.BoneSpur);

    // Pivot at [0.06, 0.06, side*0.86]; wingtip at [-0.36, 0.12, side*1.58] -> world [-0.30, 1.24, ±2.44], hypot = 2.458 <= 2.50
    gWB.addFlaredBlade({
      pStart: [0.22, 0.04, side * 0.04],
      pEnd: [-0.30, 0.12, side * 1.50],
      flareDir: [0.92, 0.12, side * -0.36],
      thickness: 0.18,
      backWidth: 0.34,
      flareStart: 0.44,
      flarePeak: 0.56,
      flareSub: 0.38,
      flareEnd: 0.09,
    });
    gWM.addFlaredBlade({
      pStart: [-0.14, -0.02, side * 0.08],
      pEnd: [-0.52, 0.06, side * 1.38],
      flareDir: [-0.95, 0.05, side * -0.28],
      thickness: 0.09,
      backWidth: 0.08,
      flareStart: 0.34,
      flarePeak: 0.52,
      flareSub: 0.36,
      flareEnd: 0.08,
    });
    gWR.addChamferBox({
      center: [-0.04, 0.12, side * 0.66],
      size: [0.46, 0.10, 0.88],
      rotDeg: [side * -6, side * 16, 0],
      topScale: [0.80, 0.86],
    });
    gWBo.addTubeAlongSpine(
      [
        { pos: [0.34, 0.04, side * 0.08], rx: 0.075, ry: 0.06 },
        { pos: [0.04, 0.10, side * 0.88], rx: 0.058, ry: 0.048 },
        { pos: [-0.34, 0.14, side * 1.59], rx: 0.016, ry: 0.016 },
      ],
      6
    );

    const wIdx = attachMeshNode(scene, rawMap, {
      name: `Wing_${tag}`,
      geoms: [gWB, gWR, gWM, gWBo],
      translation: [0.06, 0.06, side * 0.86],
      parentIndex: mantleIdx,
    });
    wingNodes.push({ idx: wIdx, side });

    const gWTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gWTeam.addOrientedShield(
      [-0.06, 0.17, side * 0.72],
      [0.06, 0.98, side * -0.18],
      [-0.28, 0.18, side * 0.94],
      [[-0.18, -0.36], [0.18, -0.30], [0.13, 0.36], [-0.13, 0.30]],
      0.042
    );
    attachMeshNode(scene, rawMap, {
      name: `Surf_TEAM_Wing${tag}`,
      meshName: `Surf_TEAM_Wing${tag}`,
      geoms: [gWTeam],
      parentIndex: wIdx,
    });
  }

  // 2E. TWO ASYMMETRICAL BROODLING LAUNCH SACS + LeftLauncher & RightLauncher
  // LeftLaunchSac (Z < 0): Forward-underslung massive single-chamber siege sac jutting past +X prow!
  const leftSacRest = [0.46, -0.18, -1.06];
  {
    const gSac = new PrimitiveGeom(mats.AmberSac);
    const gVein = new PrimitiveGeom(mats.AmberVein);
    const gBright = new PrimitiveGeom(mats.AmberBright);
    const gCage = new PrimitiveGeom(mats.ChitinDark);
    const gSpur = new PrimitiveGeom(mats.BoneSpur);

    // Swollen forward-reaching gestational pod (world x = 0.46 + 1.40 = 1.86, z = -1.06 -> hypot = 2.14 <= 2.50)
    gSac.addSculptedLobe({
      center: [0.34, -0.02, -0.04],
      radii: [0.76, 0.34, 0.42],
      rotDeg: [0, 8, -4],
      sectors: 12,
      stacks: 6,
      ribCount: 7,
      ribAmp: 0.08,
    });
    for (const [bx, by, bz, br] of [[0.18, 0.24, -0.14, 0.16], [0.54, 0.18, -0.18, 0.14], [0.38, -0.22, -0.16, 0.15]]) {
      gBright.addSculptedLobe({ center: [bx, by, bz], radii: [br * 1.2, br * 0.85, br], sectors: 8, stacks: 4 });
    }
    gVein.addTubeAlongSpine(
      [
        { pos: [-0.32, 0.14, 0.10], rx: 0.075, ry: 0.06 },
        { pos: [0.24, 0.28, -0.06], rx: 0.065, ry: 0.055 },
        { pos: [0.88, 0.10, -0.06], rx: 0.055, ry: 0.05 },
      ],
      6
    );
    // Armored launch chute & 3 bone sphincter fangs around forward mouth
    gCage.addTubeAlongSpine(
      [
        { pos: [0.84, -0.04, -0.05], rx: 0.24, ry: 0.22 },
        { pos: [1.28, -0.06, -0.06], rx: 0.19, ry: 0.18 },
      ],
      8
    );
    gBright.addSculptedLobe({ center: [1.26, -0.06, -0.06], radii: [0.10, 0.14, 0.14], sectors: 8, stacks: 4 });
    for (const angDeg of [70, 195, 315]) {
      const r = degToRad(angDeg);
      gSpur.addTubeAlongSpine(
        [
          { pos: [1.06, -0.06 + Math.sin(r) * 0.19, -0.06 + Math.cos(r) * 0.19], rx: 0.05, ry: 0.04 },
          { pos: [1.44, -0.06 + Math.sin(r) * 0.14, -0.06 + Math.cos(r) * 0.14], rx: 0.012, ry: 0.012 },
        ],
        5
      );
    }
    var leftSacIdx = attachMeshNode(scene, rawMap, {
      name: 'LeftLaunchSac',
      geoms: [gSac, gVein, gBright, gCage, gSpur],
      translation: leftSacRest,
      parentIndex: mantleIdx,
    });
    scene.addNode({ name: 'LeftLauncher', translation: [1.46, -0.06, -0.06], parentIndex: leftSacIdx });
  }

  // RightLaunchSac (Z > 0): Aft-shifted, elevated twin-bulb dorsal-shoulder incubator pod riding cleanly above Wing_R!
  const rightSacRest = [-0.20, 0.30, 1.00];
  {
    const gSac = new PrimitiveGeom(mats.AmberSac);
    const gVein = new PrimitiveGeom(mats.AmberVein);
    const gBright = new PrimitiveGeom(mats.AmberBright);
    const gCage = new PrimitiveGeom(mats.ChitinDark);
    const gSpur = new PrimitiveGeom(mats.BoneSpur);

    // Rear high incubator bulb + forward angled launch ampulla (distinct twin-chamber asymmetry!)
    gSac.addSculptedLobe({
      center: [-0.26, 0.12, 0.14],
      radii: [0.52, 0.32, 0.38],
      rotDeg: [8, -12, 6],
      sectors: 10,
      stacks: 5,
      ribCount: 6,
      ribAmp: 0.08,
    });
    gSac.addSculptedLobe({
      center: [0.48, 0.02, 0.08],
      radii: [0.56, 0.28, 0.34],
      rotDeg: [4, -6, -6],
      sectors: 10,
      stacks: 5,
      ribCount: 6,
      ribAmp: 0.07,
    });
    for (const [bx, by, bz, br] of [[-0.28, 0.42, 0.22, 0.17], [0.42, 0.26, 0.16, 0.15]]) {
      gBright.addSculptedLobe({ center: [bx, by, bz], radii: [br * 1.15, br * 0.85, br], sectors: 8, stacks: 4 });
    }
    gVein.addTubeAlongSpine(
      [
        { pos: [-0.66, 0.22, 0.18], rx: 0.07, ry: 0.06 },
        { pos: [0.06, 0.30, 0.22], rx: 0.08, ry: 0.065 },
        { pos: [0.84, 0.08, 0.12], rx: 0.06, ry: 0.05 },
      ],
      6
    );
    gCage.addTubeAlongSpine(
      [
        { pos: [0.90, -0.02, 0.08], rx: 0.22, ry: 0.20 },
        { pos: [1.36, -0.06, 0.06], rx: 0.17, ry: 0.16 },
      ],
      8
    );
    gBright.addSculptedLobe({ center: [1.34, -0.06, 0.06], radii: [0.095, 0.13, 0.13], sectors: 8, stacks: 4 });
    for (const angDeg of [50, 175, 295]) {
      const r = degToRad(angDeg);
      gSpur.addTubeAlongSpine(
        [
          { pos: [1.14, -0.05 + Math.sin(r) * 0.17, 0.06 + Math.cos(r) * 0.17], rx: 0.046, ry: 0.038 },
          { pos: [1.52, -0.06 + Math.sin(r) * 0.12, 0.06 + Math.cos(r) * 0.12], rx: 0.012, ry: 0.012 },
        ],
        5
      );
    }
    var rightSacIdx = attachMeshNode(scene, rawMap, {
      name: 'RightLaunchSac',
      geoms: [gSac, gVein, gBright, gCage, gSpur],
      translation: rightSacRest,
      parentIndex: mantleIdx,
    });
    scene.addNode({ name: 'RightLauncher', translation: [1.54, -0.06, 0.06], parentIndex: rightSacIdx });
  }

  // Calibrate SiegeMantle Y so lowest ventral tendril tip sits at exact world Y = 0.0000
  const preBounds = scene.computeWorldBounds(rawMap);
  const mantleRest = [0, Number((1.18 - preBounds.min[1]).toFixed(6)), 0];
  scene.nodes[mantleIdx].translation = mantleRest;

  // 2F. Animations: idle, hover, attack, death
  const idQ = [0, 0, 0, 1];
  const uS = [1, 1, 1];

  // idle (2.4s ponderous asymmetrical-sac breathing loop)
  const tIdle = [0, 0.60, 1.20, 1.80, 2.40];
  scene.addAnimation('idle', [
    {
      nodeIndex: mantleIdx,
      path: 'translation',
      times: tIdle,
      values: [
        mantleRest,
        [0, mantleRest[1] + 0.05, 0],
        [0, mantleRest[1] + 0.09, 0],
        [0, mantleRest[1] + 0.04, 0],
        mantleRest,
      ],
    },
    {
      nodeIndex: leftSacIdx,
      path: 'scale',
      times: tIdle,
      values: [uS, [1.06, 1.08, 1.06], [0.98, 0.97, 0.98], [1.02, 1.03, 1.02], uS],
    },
    {
      nodeIndex: rightSacIdx,
      path: 'scale',
      times: tIdle,
      values: [uS, [0.98, 0.98, 0.98], [1.07, 1.09, 1.07], [1.01, 1.02, 1.01], uS],
    },
    {
      nodeIndex: tailIdx,
      path: 'rotation',
      times: tIdle,
      values: [idQ, quatFromEulerXYZ(0, 4, 2), quatFromEulerXYZ(0, 0, -2), quatFromEulerXYZ(0, -4, 1), idQ],
    },
    ...wingNodes.map((w) => ({
      nodeIndex: w.idx,
      path: 'rotation',
      times: tIdle,
      values: [idQ, quatFromEulerXYZ(w.side * 4.5, 0, 0), quatFromEulerXYZ(w.side * -3.5, 0, 0), quatFromEulerXYZ(w.side * 2.5, 0, 0), idQ],
    })),
  ]);

  // hover (1.8s slow heavy manta glide loop)
  const tHover = [0, 0.45, 0.90, 1.35, 1.80];
  scene.addAnimation('hover', [
    {
      nodeIndex: mantleIdx,
      path: 'translation',
      times: tHover,
      values: [
        mantleRest,
        [0.06, mantleRest[1] + 0.09, 0],
        [0.02, mantleRest[1] + 0.14, 0],
        [-0.04, mantleRest[1] + 0.06, 0],
        mantleRest,
      ],
    },
    {
      nodeIndex: mantleIdx,
      path: 'rotation',
      times: tHover,
      values: [idQ, quatFromEulerXYZ(2, 0, -3.5), quatFromEulerXYZ(0, 0, -2.0), quatFromEulerXYZ(-2, 0, -1.0), idQ],
    },
    {
      nodeIndex: tailIdx,
      path: 'rotation',
      times: tHover,
      values: [idQ, quatFromEulerXYZ(0, 7, 3), quatFromEulerXYZ(0, 0, -3), quatFromEulerXYZ(0, -7, 2), idQ],
    },
    ...wingNodes.map((w) => ({
      nodeIndex: w.idx,
      path: 'rotation',
      times: tHover,
      values: [idQ, quatFromEulerXYZ(w.side * 9.5, w.side * -2.5, 0), quatFromEulerXYZ(w.side * -7.5, w.side * 2.0, 0), quatFromEulerXYZ(w.side * 5.0, 0, 0), idQ],
    })),
  ]);

  // attack (1.05s alternating LeftLaunchSac -> RightLaunchSac broodling salvo!)
  const tAtk = [0, 0.18, 0.32, 0.52, 0.68, 1.05];
  scene.addAnimation('attack', [
    {
      nodeIndex: mantleIdx,
      path: 'translation',
      times: tAtk,
      values: [
        mantleRest,
        [-0.06, mantleRest[1] + 0.05, 0.02],
        [0.04, mantleRest[1] + 0.03, 0.05],
        [-0.05, mantleRest[1] + 0.06, -0.02],
        [0.04, mantleRest[1] + 0.03, -0.05],
        mantleRest,
      ],
    },
    {
      nodeIndex: mantleIdx,
      path: 'rotation',
      times: tAtk,
      values: [
        idQ,
        quatFromEulerXYZ(-2, -4, 3),
        quatFromEulerXYZ(3, 5, -3),
        quatFromEulerXYZ(2, 4, 2),
        quatFromEulerXYZ(-3, -5, -3),
        idQ,
      ],
    },
    {
      nodeIndex: leftSacIdx,
      path: 'translation',
      times: tAtk,
      values: [
        leftSacRest,
        [leftSacRest[0] - 0.06, leftSacRest[1] + 0.02, leftSacRest[2]],
        [leftSacRest[0] + 0.14, leftSacRest[1] - 0.03, leftSacRest[2]],
        [leftSacRest[0] - 0.05, leftSacRest[1], leftSacRest[2]],
        leftSacRest,
        leftSacRest,
      ],
    },
    {
      nodeIndex: leftSacIdx,
      path: 'scale',
      times: tAtk,
      values: [uS, [1.15, 1.18, 1.15], [0.82, 0.80, 0.82], [0.95, 0.96, 0.95], uS, uS],
    },
    {
      nodeIndex: rightSacIdx,
      path: 'translation',
      times: tAtk,
      values: [
        rightSacRest,
        rightSacRest,
        [rightSacRest[0] - 0.06, rightSacRest[1] + 0.03, rightSacRest[2]],
        [rightSacRest[0] - 0.04, rightSacRest[1] + 0.04, rightSacRest[2]],
        [rightSacRest[0] + 0.15, rightSacRest[1] - 0.03, rightSacRest[2]],
        rightSacRest,
      ],
    },
    {
      nodeIndex: rightSacIdx,
      path: 'scale',
      times: tAtk,
      values: [uS, uS, [1.08, 1.10, 1.08], [1.16, 1.20, 1.16], [0.81, 0.79, 0.81], uS],
    },
  ]);

  // death (1.25s heavy siege-craft list & sac deflation cleanly above Y=0)
  const tDeath = [0, 0.28, 0.72, 1.25];
  scene.addAnimation('death', [
    {
      nodeIndex: mantleIdx,
      path: 'translation',
      times: tDeath,
      values: [
        mantleRest,
        [-0.08, mantleRest[1] + 0.08, -0.04],
        [-0.12, 0.96, -0.08],
        [-0.15, 0.86, -0.10],
      ],
    },
    {
      nodeIndex: mantleIdx,
      path: 'rotation',
      times: tDeath,
      values: [idQ, quatFromEulerXYZ(-6, 4, 8), quatFromEulerXYZ(-12, 8, -8), quatFromEulerXYZ(-15, 11, -11)],
    },
    {
      nodeIndex: siegeVentralIdx,
      path: 'rotation',
      times: tDeath,
      values: [idQ, quatFromEulerXYZ(0, 0, -10), quatFromEulerXYZ(0, 0, 52), quatFromEulerXYZ(0, 0, 68)],
    },
    {
      nodeIndex: siegeVentralIdx,
      path: 'scale',
      times: tDeath,
      values: [uS, uS, [0.90, 0.52, 0.90], [0.84, 0.40, 0.84]],
    },
    {
      nodeIndex: leftSacIdx,
      path: 'scale',
      times: tDeath,
      values: [uS, [1.14, 1.12, 1.14], [0.64, 0.54, 0.64], [0.50, 0.40, 0.50]],
    },
    {
      nodeIndex: rightSacIdx,
      path: 'scale',
      times: tDeath,
      values: [uS, [1.10, 1.12, 1.10], [0.68, 0.58, 0.68], [0.52, 0.42, 0.52]],
    },
    ...wingNodes.map((w) => ({
      nodeIndex: w.idx,
      path: 'rotation',
      times: tDeath,
      values: [idQ, quatFromEulerXYZ(w.side * 10, 0, 0), quatFromEulerXYZ(w.side * -8, w.side * 5, 0), quatFromEulerXYZ(w.side * -11, w.side * 8, 0)],
    })),
  ]);

  return scene.buildGLB('BroodSiegeFlyerScene');
}

// ===========================================================================
// 3. greater_blight_spire.glb
// Tier-3 bio tower with branched amber veins and crown
// Radius: 2.6 | Anchor: SpireApex | Clip: idle
// ===========================================================================

function buildGreaterBlightSpireGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createGnarlSiegeAirMaterials(scene);
  const rawMap = new Map();

  const rootIdx = scene.addNode({ name: 'GreaterBlightSpire', translation: [0, 0, 0] });

  // 3A. Rooted 6-Buttress Chitin Base + Helical Ribbed Spire Trunk + Tier-3 Calyx (Y=0..4.55)
  const gBody = new PrimitiveGeom(mats.ChitinBody);
  const gRidge = new PrimitiveGeom(mats.ChitinRidge);
  const gDark = new PrimitiveGeom(mats.ChitinDark);
  const gBone = new PrimitiveGeom(mats.BoneSpur);
  const gWarm = new PrimitiveGeom(mats.WarmMembrane);

  // Grounded organic brood-mound (no flat floor disc; pure tapered mound clamped cleanly to Y >= 0)
  gWarm.addSculptedLobe({
    center: [0, 0.34, 0],
    radii: [1.96, 0.58, 1.96],
    sectors: 12,
    stacks: 5,
    flattenBottom: 0.45,
    ribCount: 6,
    ribAmp: 0.06,
    minYClamp: 0.0,
  });

  // Lofted twisted dark-plum spire column (waist at Y=2.75, broad Tier-3 calyx at Y=4.35)
  const trunkStations = [
    { y: 0.00, r: 1.68, twist: 0 },
    { y: 0.85, r: 1.36, twist: 8 },
    { y: 1.80, r: 1.06, twist: 18 },
    { y: 2.75, r: 0.88, twist: 28 },
    { y: 3.60, r: 1.14, twist: 38 },
    { y: 4.38, r: 1.54, twist: 46 },
    { y: 4.62, r: 1.32, twist: 50 },
  ];
  const trunkRings = trunkStations.map((st) => {
    const ring = [];
    const segs = 12;
    for (let i = 0; i < segs; i++) {
      const th = (2 * Math.PI * i) / segs + degToRad(st.twist);
      const flute = i % 2 === 0 ? 1.05 : 0.93;
      ring.push([Math.cos(th) * st.r * flute, st.y, Math.sin(th) * st.r * flute]);
    }
    return ring;
  });
  gBody.addLoft(
    trunkRings,
    trunkStations.map((s) => [0, s.y, 0]),
    true,
    true
  );

  // Segmented lavender-plum carapace collar ridges along the spire shaft
  for (const [cy, cr, twist] of [[1.22, 1.34, 12], [2.22, 1.04, 22], [3.22, 1.08, 34], [4.18, 1.56, 44]]) {
    const r0 = [], r1 = [];
    for (let i = 0; i < 12; i++) {
      const th = (2 * Math.PI * i) / 12 + degToRad(twist);
      const fl = i % 2 === 0 ? 1.07 : 0.96;
      r0.push([Math.cos(th) * cr * fl, cy - 0.11, Math.sin(th) * cr * fl]);
      r1.push([Math.cos(th) * cr * 0.92 * fl, cy + 0.11, Math.sin(th) * cr * 0.92 * fl]);
    }
    gRidge.addLoft([r0, r1], [[0, cy - 0.11, 0], [0, cy + 0.11, 0]], true, true);
  }

  // 6 Arched Root Buttresses + Calcified Anchoring Talons reaching r = 2.585 at exact Y = 0.0000
  for (let i = 0; i < 6; i++) {
    const az = degToRad(30 + i * 60);
    const cx = Math.cos(az), sz = Math.sin(az);
    gDark.addFlaredBlade({
      pStart: [cx * 1.08, 1.72, sz * 1.08],
      pEnd: [cx * 2.34, 0.08, sz * 2.34],
      flareDir: [cx * 0.65, 0.75, sz * 0.65],
      thickness: 0.34,
      backWidth: 0.18,
      flareStart: 0.18,
      flarePeak: 0.44,
      flareSub: 0.34,
      flareEnd: 0.10,
      minYClamp: 0.0,
    });
    // Calcified talon tip planted cleanly on Y=0 at r = 2.585 (<= 2.60)
    gBone.addTubeAlongSpine(
      [
        { pos: [cx * 2.08, 0.34, sz * 2.08], rx: 0.14, ry: 0.12 },
        { pos: [cx * 2.575, 0.00, sz * 2.575], rx: 0.010, ry: 0.010 },
      ],
      5,
      true,
      true,
      [0, 1, 0],
      0.0
    );
  }

  // +X Anterior Brood-Archway Fangs for unmistakable +X forward orientation
  for (const side of [-1, 1]) {
    gBone.addTubeAlongSpine(
      [
        { pos: [1.76, 0.72, side * 0.48], rx: 0.09, ry: 0.08 },
        { pos: [2.24, 1.06, side * 0.34], rx: 0.018, ry: 0.018 },
      ],
      5
    );
  }

  attachMeshNode(scene, rawMap, {
    name: 'SpireStructure',
    geoms: [gBody, gRidge, gDark, gBone, gWarm],
    parentIndex: rootIdx,
  });

  // 3B. Primary Surf_TEAM & Surf_GLOW Nodes on Base & Upper Calyx
  const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
  const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
  const buttressBadge = [[-0.24, -0.22], [0.24, -0.22], [0.18, 0.24], [-0.18, 0.24]];
  const calyxBadge = [[-0.20, -0.14], [0.20, -0.14], [0.15, 0.16], [-0.15, 0.16]];
  for (let i = 0; i < 6; i++) {
    const az = degToRad(30 + i * 60);
    const cx = Math.cos(az), sz = Math.sin(az);
    gTeam.addOrientedShield(
      [cx * 1.78, 0.92, sz * 1.78],
      [cx * 0.72, 0.68, sz * 0.72],
      [-cx * 0.68, 0.72, -sz * 0.68],
      buttressBadge,
      0.05
    );
    gTeam.addOrientedShield(
      [cx * 1.53, 4.35, sz * 1.53],
      [cx * 0.92, -0.34, sz * 0.92],
      [cx * 0.34, 0.92, sz * 0.34],
      calyxBadge,
      0.048
    );
    gGlow.addSculptedLobe({
      center: [cx * 2.04, 0.54, sz * 2.04],
      radii: [0.11, 0.08, 0.11],
      sectors: 6,
      stacks: 4,
    });
    gGlow.addSculptedLobe({
      center: [cx * 1.34, 3.82, sz * 1.34],
      radii: [0.09, 0.09, 0.09],
      sectors: 6,
      stacks: 4,
    });
  }
  attachMeshNode(scene, rawMap, { name: 'Surf_TEAM', meshName: 'Surf_TEAM', geoms: [gTeam], parentIndex: rootIdx });
  attachMeshNode(scene, rawMap, { name: 'Surf_GLOW', meshName: 'Surf_GLOW', geoms: [gGlow], parentIndex: rootIdx });

  // 3C. 3D Branched Amber Veins ('AmberVeinNetwork' — 6 basal bulbs -> 6 trunks -> 12 forks -> 24 calyx capillaries!)
  const gAmberSac = new PrimitiveGeom(mats.AmberSac);
  const gAmberVein = new PrimitiveGeom(mats.AmberVein);
  const gAmberBright = new PrimitiveGeom(mats.AmberBright);

  for (let i = 0; i < 6; i++) {
    const az0 = degToRad(i * 60);
    // Basal amber reservoir sac nestled between buttresses
    const bx = Math.cos(az0) * 1.82;
    const bz = Math.sin(az0) * 1.82;
    gAmberSac.addSculptedLobe({
      center: [bx, 0.40, bz],
      radii: [0.34, 0.26, 0.34],
      sectors: 8,
      stacks: 4,
      minYClamp: 0.02,
    });
    gAmberBright.addSculptedLobe({ center: [bx * 1.03, 0.56, bz * 1.03], radii: [0.15, 0.11, 0.15], sectors: 6, stacks: 4 });

    // Primary ascending arterial trunk (spirals +22 deg up to bifurcation node at Y=2.38)
    const az1 = az0 + degToRad(11);
    const az2 = az0 + degToRad(22);
    const pFork1 = [Math.cos(az2) * 0.98, 2.38, Math.sin(az2) * 0.98];
    gAmberVein.addTubeAlongSpine(
      [
        { pos: [bx, 0.46, bz], r: 0.115 },
        { pos: [Math.cos(az1) * 1.32, 1.36, Math.sin(az1) * 1.32], r: 0.095 },
        { pos: pFork1, r: 0.082 },
      ],
      6,
      true,
      true,
      [0, 1, 0],
      0.02
    );
    gAmberBright.addSculptedLobe({ center: pFork1, radii: [0.12, 0.12, 0.12], sectors: 6, stacks: 4 });

    // First bifurcation: 2 diverging secondary amber branches (Y=2.38 -> Y=3.58)
    for (const b1 of [-1, 1]) {
      const az3 = az2 + degToRad(b1 * 15 + 8);
      const pFork2 = [Math.cos(az3) * 1.18, 3.58, Math.sin(az3) * 1.18];
      gAmberVein.addTubeAlongSpine(
        [
          { pos: pFork1, r: 0.072 },
          { pos: [Math.cos((az2 + az3) * 0.5) * 0.96, 2.96, Math.sin((az2 + az3) * 0.5) * 0.96], r: 0.064 },
          { pos: pFork2, r: 0.058 },
        ],
        5
      );
      gAmberBright.addSculptedLobe({ center: pFork2, radii: [0.09, 0.09, 0.09], sectors: 6, stacks: 4 });

      // Second bifurcation: 2 tertiary capillary veins fanning across the flared Tier-3 calyx into the crown!
      for (const b2 of [-1, 1]) {
        const az4 = az3 + degToRad(b2 * 9 + 4);
        const pTop = [Math.cos(az4) * 1.48, 4.46, Math.sin(az4) * 1.48];
        gAmberVein.addTubeAlongSpine(
          [
            { pos: pFork2, r: 0.048 },
            { pos: [Math.cos((az3 + az4) * 0.5) * 1.38, 4.04, Math.sin((az3 + az4) * 0.5) * 1.38], r: 0.042 },
            { pos: pTop, r: 0.036 },
          ],
          5
        );
      }
    }
  }

  const veinsIdx = attachMeshNode(scene, rawMap, {
    name: 'AmberVeinNetwork',
    geoms: [gAmberSac, gAmberVein, gAmberBright],
    parentIndex: rootIdx,
  });

  // 3D. Regal Tier-3 Bio-Crown ('SpireCrown' -> 6 Articulated 'CrownHorn_0..5' + 'AmberCrownCore' + 'SpireApex')
  const crownIdx = scene.addNode({ name: 'SpireCrown', translation: [0, 4.42, 0], parentIndex: rootIdx });

  const crownHorns = [];
  for (let i = 0; i < 6; i++) {
    const az = degToRad(i * 60);
    const cx = Math.cos(az), sz = Math.sin(az);
    const flareAxis = vNorm([-sz, 0, cx]); // tangential axis so +angle flares horn outward!
    // Slight noble height variation (+X/flank horns tallest up to world Y ~ 6.14)
    const hScale = i === 0 ? 1.08 : i === 1 || i === 5 ? 1.03 : 0.96;

    const gHB = new PrimitiveGeom(mats.ChitinBody);
    const gHR = new PrimitiveGeom(mats.ChitinRidge);
    const gHBo = new PrimitiveGeom(mats.BoneSpur);
    const gHV = new PrimitiveGeom(mats.AmberVein);

    // Pivot at [cx*1.28, 0.0, sz*1.28] on SpireCrown
    gHB.addFlaredBlade({
      pStart: [0, -0.06, 0],
      pEnd: [cx * 0.42, 0.98 * hScale, sz * 0.42],
      flareDir: [cx * 0.92, -0.22, sz * 0.92],
      thickness: 0.24,
      backWidth: 0.10,
      flareStart: 0.18,
      flarePeak: 0.34,
      flareSub: 0.22,
      flareEnd: 0.07,
    });
    gHR.addFlaredBlade({
      pStart: [cx * 0.06, 0.08, sz * 0.06],
      pEnd: [cx * 0.46, 0.92 * hScale, sz * 0.46],
      flareDir: [cx * 0.96, -0.10, sz * 0.96],
      thickness: 0.14,
      backWidth: 0.04,
      flarePeak: 0.20,
      flareSub: 0.13,
    });
    // Curved ivory-bone crown spire tip curving regally upward & slightly inward
    gHBo.addTubeAlongSpine(
      [
        { pos: [cx * 0.38, 0.86 * hScale, sz * 0.38], rx: 0.11, ry: 0.09 },
        { pos: [cx * 0.44, 1.28 * hScale, sz * 0.44], rx: 0.065, ry: 0.055 },
        { pos: [cx * 0.26, 1.60 * hScale, sz * 0.26], rx: 0.014, ry: 0.014 },
      ],
      6
    );
    // Inner amber vein lining each crown prong
    gHV.addTubeAlongSpine(
      [
        { pos: [-cx * 0.08, 0.04, -sz * 0.08], r: 0.052 },
        { pos: [cx * 0.24, 0.78 * hScale, sz * 0.24], r: 0.032 },
      ],
      5
    );

    const hIdx = attachMeshNode(scene, rawMap, {
      name: `CrownHorn_${i}`,
      geoms: [gHB, gHR, gHBo, gHV],
      translation: [cx * 1.28, 0, sz * 1.28],
      parentIndex: crownIdx,
    });
    crownHorns.push({ idx: hIdx, flareAxis });

    if (i % 2 === 0) {
      const gHT = new PrimitiveGeom(mats.Surf_TEAM);
      gHT.addOrientedShield(
        [cx * 0.48, 0.48 * hScale, sz * 0.48],
        [cx * 0.92, -0.24, sz * 0.92],
        [-cx * 0.24, 0.96, -sz * 0.24],
        [[-0.12, -0.22], [0.12, -0.22], [0.08, 0.22], [-0.08, 0.22]],
        0.038
      );
      attachMeshNode(scene, rawMap, {
        name: `Surf_TEAM_Crown_${i}`,
        meshName: `Surf_TEAM_Crown_${i}`,
        geoms: [gHT],
        parentIndex: hIdx,
      });
    }
  }

  // Suspended Molten-Amber Bio-Crown Core ('AmberCrownCore')
  const gCoreSac = new PrimitiveGeom(mats.AmberSac);
  const gCoreVein = new PrimitiveGeom(mats.AmberVein);
  const gCoreBright = new PrimitiveGeom(mats.AmberBright);
  gCoreSac.addSculptedLobe({
    center: [0, 0, 0],
    radii: [0.76, 0.62, 0.76],
    sectors: 12,
    stacks: 6,
    ribCount: 6,
    ribAmp: 0.09,
  });
  gCoreBright.addSculptedLobe({
    center: [0, 0.38, 0],
    radii: [0.42, 0.46, 0.42],
    sectors: 10,
    stacks: 5,
  });
  for (let i = 0; i < 6; i++) {
    const az = degToRad(i * 60);
    gCoreVein.addTubeAlongSpine(
      [
        { pos: [Math.cos(az) * 0.56, -0.10, Math.sin(az) * 0.56], r: 0.07 },
        { pos: [Math.cos(az) * 1.18, -0.32, Math.sin(az) * 1.18], r: 0.045 },
      ],
      5
    );
  }
  const coreRest = [0, 0.56, 0];
  const crownCoreIdx = attachMeshNode(scene, rawMap, {
    name: 'AmberCrownCore',
    geoms: [gCoreSac, gCoreVein, gCoreBright],
    translation: coreRest,
    parentIndex: crownIdx,
  });

  // SpireApex anchor at crown summit (world Y ~ 6.14)
  scene.addNode({ name: 'SpireApex', translation: [0, 1.72, 0], parentIndex: crownIdx });

  // 3E. Animation: idle (2.6s seamless bio-tower pulse & crown breathing)
  const idQ = [0, 0, 0, 1];
  const uS = [1, 1, 1];
  const tIdle = [0, 0.55, 1.10, 1.75, 2.20, 2.60];
  const hornDeg = [0, 5.5, 1.5, 4.0, -1.0, 0];

  scene.addAnimation('idle', [
    {
      nodeIndex: crownCoreIdx,
      path: 'translation',
      times: tIdle,
      values: [
        coreRest,
        [0, coreRest[1] + 0.075, 0],
        [0, coreRest[1] + 0.025, 0],
        [0, coreRest[1] + 0.055, 0],
        [0, coreRest[1] - 0.015, 0],
        coreRest,
      ],
    },
    {
      nodeIndex: crownCoreIdx,
      path: 'scale',
      times: tIdle,
      values: [uS, [1.08, 1.11, 1.08], [1.01, 1.02, 1.01], [1.05, 1.07, 1.05], [0.98, 0.97, 0.98], uS],
    },
    {
      nodeIndex: veinsIdx,
      path: 'scale',
      times: tIdle,
      values: [uS, [1.024, 1.0, 1.024], [1.004, 1.0, 1.004], [1.016, 1.0, 1.016], [0.994, 1.0, 0.994], uS],
    },
    ...crownHorns.map((h) => ({
      nodeIndex: h.idx,
      path: 'rotation',
      times: tIdle,
      values: hornDeg.map((d) => (d === 0 ? idQ : quatFromAxisAngle(h.flareAxis, degToRad(d)))),
    })),
  ]);

  return scene.buildGLB('GreaterBlightSpireScene');
}

// ---------------------------------------------------------------------------
// Self-Validation & Deterministic CLI Entry Point
// ---------------------------------------------------------------------------

function summarizeAndValidate(spec, glbBuffer, gltf) {
  const jsonLen = glbBuffer.readUInt32LE(12);
  const binStart = 20 + jsonLen + 8;

  const parentMap = new Map();
  gltf.nodes.forEach((n, idx) => {
    for (const c of n.children || []) parentMap.set(c, idx);
  });

  function worldPoint(nodeIdx, p) {
    let cur = p;
    let idx = nodeIdx;
    while (idx !== undefined) {
      const n = gltf.nodes[idx];
      if (n.scale) cur = [cur[0] * n.scale[0], cur[1] * n.scale[1], cur[2] * n.scale[2]];
      if (n.rotation) cur = rotateVecByQuat(cur, n.rotation);
      if (n.translation) cur = vAdd(cur, n.translation);
      idx = parentMap.get(idx);
    }
    return cur;
  }

  let verts = 0, tris = 0, maxHorizR = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  gltf.nodes.forEach((n, nIdx) => {
    if (n.mesh === undefined) return;
    for (const prim of gltf.meshes[n.mesh].primitives) {
      const posAcc = gltf.accessors[prim.attributes.POSITION];
      const idxAcc = gltf.accessors[prim.indices];
      verts += posAcc.count;
      tris += idxAcc.count / 3;
      const bv = gltf.bufferViews[posAcc.bufferView];
      const baseOff = binStart + (bv.byteOffset || 0) + (posAcc.byteOffset || 0);
      for (let i = 0; i < posAcc.count; i++) {
        const wp = worldPoint(nIdx, [
          glbBuffer.readFloatLE(baseOff + i * 12),
          glbBuffer.readFloatLE(baseOff + i * 12 + 4),
          glbBuffer.readFloatLE(baseOff + i * 12 + 8),
        ]);
        for (let c = 0; c < 3; c++) {
          if (wp[c] < min[c]) min[c] = wp[c];
          if (wp[c] > max[c]) max[c] = wp[c];
        }
        const hr = Math.hypot(wp[0], wp[2]);
        if (hr > maxHorizR) maxHorizR = hr;
      }
    }
  });

  const matNames = gltf.materials.map((m) => m.name);
  const nodeNames = gltf.nodes.map((n) => n.name);
  const animNames = (gltf.animations || []).map((a) => a.name);

  if (Math.abs(min[1]) > 1e-4) {
    throw new Error(`${spec.filename}: min.y=${min[1]} is not grounded at Y=0`);
  }
  if (maxHorizR > spec.radius + 1e-4) {
    throw new Error(`${spec.filename}: maxHorizontalRadius=${maxHorizR.toFixed(4)} exceeds spec radius ${spec.radius}`);
  }
  for (const reqMat of ['Surf_TEAM', 'Surf_GLOW']) {
    if (!matNames.includes(reqMat) || !nodeNames.includes(reqMat)) {
      throw new Error(`${spec.filename}: missing required ${reqMat}`);
    }
  }
  for (const reqAnchor of spec.anchors) {
    if (!nodeNames.includes(reqAnchor)) {
      throw new Error(`${spec.filename}: missing anchor ${reqAnchor}`);
    }
  }
  for (const reqClip of spec.clips) {
    if (!animNames.includes(reqClip)) {
      throw new Error(`${spec.filename}: missing animation clip ${reqClip}`);
    }
  }

  const anchorPositions = {};
  for (const a of spec.anchors) {
    const idx = nodeNames.indexOf(a);
    anchorPositions[a] = worldPoint(idx, [0, 0, 0]).map((v) => Number(v.toFixed(4)));
  }

  return {
    filename: spec.filename,
    bytes: glbBuffer.length,
    sha256: crypto.createHash('sha256').update(glbBuffer).digest('hex'),
    verts,
    tris,
    specRadius: spec.radius,
    maxHorizontalRadius: Number(maxHorizR.toFixed(4)),
    min: min.map((v) => Number(v.toFixed(4))),
    max: max.map((v) => Number(v.toFixed(4))),
    anchors: anchorPositions,
    animations: animNames,
    teamNodes: nodeNames.filter((n) => n.startsWith('Surf_TEAM')),
    glowNodes: nodeNames.filter((n) => n.startsWith('Surf_GLOW')),
  };
}

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
  fs.mkdirSync(outDir, { recursive: true });

  const specs = [
    {
      filename: 'corrosion_flyer.glb',
      radius: 1.56,
      anchors: ['Muzzle'],
      clips: ['idle', 'hover', 'attack', 'cast', 'death'],
      build: buildCorrosionFlyerGLB,
    },
    {
      filename: 'brood_siege_flyer.glb',
      radius: 2.5,
      anchors: ['LeftLauncher', 'RightLauncher'],
      clips: ['idle', 'hover', 'attack', 'death'],
      build: buildBroodSiegeFlyerGLB,
    },
    {
      filename: 'greater_blight_spire.glb',
      radius: 2.6,
      anchors: ['SpireApex'],
      clips: ['idle'],
      build: buildGreaterBlightSpireGLB,
    },
  ];

  const report = [];
  for (const sp of specs) {
    const { glbBuffer, gltf } = sp.build();
    fs.writeFileSync(path.join(outDir, sp.filename), glbBuffer);
    report.push(summarizeAndValidate(sp, glbBuffer, gltf));
  }
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildCorrosionFlyerGLB,
  buildBroodSiegeFlyerGLB,
  buildGreaterBlightSpireGLB,
};
