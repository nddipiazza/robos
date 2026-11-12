#!/usr/bin/env node
'use strict';

/**
 * Deterministic Standalone Procedural GLB Generator for Starfall Command
 * Faction: Aurelian Concord — Light Infantry Psionic Pair
 *
 * Outputs ONLY inside target directory (default __dirname):
 *   1. mirage_adept.glb  — Sleek light infantry soldier with crescent forearm launcher,
 *                          asymmetric gold/ivory armor, and blue emitters.
 *                          Anchors: 'Muzzle', 'ShadeOrigin'.
 *                          Animations: 'idle', 'walk', 'attack', 'cast', 'death'.
 *   2. mirage_shade.glb  — Separately controllable translucent psionic projection with
 *                          matching silhouette & glow, zero solid opaque armor, keeping
 *                          the Shade's body translucent when Surf_TEAM_* / Surf_GLOW_*
 *                          surfaces are overridden with opaque engine materials.
 *                          Anchor: 'Muzzle'.
 *                          Animations: 'drift', 'idle', 'death'.
 *
 * Uses ONLY built-in Node.js modules ('fs', 'path'). Zero external dependencies.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Deterministic Math & Quaternion Utilities
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
// Low-Poly Flat-Shaded Geometry Builder
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
    const ab = vSub(b, a);
    const ac = vSub(c, a);
    const raw = vCross(ab, ac);
    if (vLen(raw) < 1e-9) return;
    let n = vNorm(raw);
    let p1 = b, p2 = c;
    if (outwardHint && vDot(n, outwardHint) < 0) {
      n = vScale(n, -1);
      p1 = c;
      p2 = b;
    }
    const base = this.vertexCount;
    this.positions.push(
      a[0], a[1], a[2],
      p1[0], p1[1], p1[2],
      p2[0], p2[1], p2[2]
    );
    this.normals.push(
      n[0], n[1], n[2],
      n[0], n[1], n[2],
      n[0], n[1], n[2]
    );
    this.indices.push(base, base + 1, base + 2);
  }

  addQuad(a, b, c, d, outwardHint = null) {
    this.addTri(a, b, c, outwardHint);
    this.addTri(a, c, d, outwardHint);
  }

  addPolygonCap(ring, centerHint, normalDir) {
    if (ring.length < 3) return;
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) {
      cx += p[0]; cy += p[1]; cz += p[2];
    }
    const ctr = [cx / ring.length, cy / ring.length, cz / ring.length];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      this.addTri(ctr, a, b, normalDir);
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
      const r0 = rings[k];
      const r1 = rings[k + 1];
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
      this.addPolygonCap(rings[0], centers[0], vLen(dir) > 1e-6 ? dir : [0, -1, 0]);
    }
    if (capEnd) {
      const last = rings.length - 1;
      const dir = vSub(centers[last], centers[last - 1]);
      this.addPolygonCap(rings[last], centers[last], vLen(dir) > 1e-6 ? dir : [0, 1, 0]);
    }
  }

  addChamferBox({
    center = [0, 0, 0],
    size = [1, 1, 1],
    rotDeg = [0, 0, 0],
    topScale = [0.90, 0.90],
    botScale = [1.0, 1.0],
    chamfer = 0.14,
    minYClamp = null,
  }) {
    const q = quatFromEulerXYZ(rotDeg[0], rotDeg[1], rotDeg[2]);
    const hx = size[0] * 0.5;
    const hy = size[1] * 0.5;
    const hz = size[2] * 0.5;
    const chB = Math.min(hx, hz) * chamfer * 2.0;
    const chT = Math.min(hx * topScale[0], hz * topScale[1]) * chamfer * 2.0;

    const rawBot = makeRectChamferRing(hx * botScale[0], hz * botScale[1], chB, -hy);
    const rawTop = makeRectChamferRing(hx * topScale[0], hz * topScale[1], chT, hy);

    const xf = (pt) => {
      const w = vAdd(center, rotateVecByQuat(pt, q));
      if (minYClamp !== null && w[1] < minYClamp) w[1] = minYClamp;
      return w;
    };
    const rBot = rawBot.map(xf);
    const rTop = rawTop.map(xf);
    const cBot = xf([0, -hy, 0]);
    const cTop = xf([0, hy, 0]);
    this.addLoft([rBot, rTop], [cBot, cTop], true, true);
  }

  addTubeAlongSpine(stations, sides = 6, capStart = true, capEnd = true) {
    if (stations.length < 2) return;
    const rings = [];
    const centers = [];
    let prevUp = [0, 1, 0];

    for (let k = 0; k < stations.length; k++) {
      const cur = stations[k].pos;
      let tang;
      if (k === 0) tang = vNorm(vSub(stations[1].pos, cur));
      else if (k === stations.length - 1) tang = vNorm(vSub(cur, stations[k - 1].pos));
      else tang = vNorm(vSub(stations[k + 1].pos, stations[k - 1].pos));

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
        const cs = Math.cos(th) * rx;
        const sn = Math.sin(th) * ry;
        ring.push(vAdd(cur, vAdd(vScale(side, cs), vScale(up, sn))));
      }
      rings.push(ring);
      centers.push(cur);
    }
    this.addLoft(rings, centers, capStart, capEnd);
  }

  addFacetedCrystal({
    center = [0, 0, 0],
    radii = [0.2, 0.3, 0.2],
    rotDeg = [0, 0, 0],
    sectors = 6,
    stacks = 4,
    phaseRad = 0,
  }) {
    const q = quatFromEulerXYZ(rotDeg[0], rotDeg[1], rotDeg[2]);
    const xf = (p) => vAdd(center, rotateVecByQuat(p, q));
    const botPole = xf([0, -radii[1], 0]);
    const topPole = xf([0, radii[1], 0]);

    const rings = [];
    for (let st = 1; st < stacks; st++) {
      const v = st / stacks;
      const phi = (v - 0.5) * Math.PI;
      const y = Math.sin(phi) * radii[1];
      const cosP = Math.cos(phi);
      const ring = [];
      for (let s = 0; s < sectors; s++) {
        const th = (2 * Math.PI * s) / sectors + phaseRad;
        ring.push(xf([Math.cos(th) * cosP * radii[0], y, Math.sin(th) * cosP * radii[2]]));
      }
      rings.push(ring);
    }

    for (let s = 0; s < sectors; s++) {
      const j = (s + 1) % sectors;
      const a = rings[0][s], b = rings[0][j];
      const midB = vScale(vAdd(botPole, vAdd(a, b)), 1 / 3);
      this.addTri(botPole, b, a, vSub(midB, center));
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
      const midT = vScale(vAdd(topPole, vAdd(a, b)), 1 / 3);
      this.addTri(topPole, a, b, vSub(midT, center));
    }
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
      vAdd(
        origin,
        vAdd(vScale(right, x * topShrink), vAdd(vScale(up, y * topShrink), vScale(out, thickness)))
      )
    );
    this.addLoft(
      [rBack, rFront],
      [vAdd(origin, vScale(out, -backInset)), vAdd(origin, vScale(out, thickness))],
      true,
      true
    );
  }

  addConcentricArcStrip({
    rInner,
    rOuter,
    yBot,
    yTop,
    thStart,
    thEnd,
    steps = 8,
    bevelIn = 0.01,
    cx = 0,
    cz = 0,
  }) {
    const rings = [];
    const centers = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const th = thStart + (thEnd - thStart) * u;
      const c = Math.cos(th), s = Math.sin(th);
      const rMid = (rInner + rOuter) * 0.5;
      rings.push([
        [cx + c * rInner, yBot, cz + s * rInner],
        [cx + c * rOuter, yBot, cz + s * rOuter],
        [cx + c * (rOuter - bevelIn), yTop, cz + s * (rOuter - bevelIn)],
        [cx + c * (rInner + bevelIn), yTop, cz + s * (rInner + bevelIn)],
      ]);
      centers.push([cx + c * rMid, (yBot + yTop) * 0.5, cz + s * rMid]);
    }
    this.addLoft(rings, centers, true, true);
  }
}

// ---------------------------------------------------------------------------
// glTF 2.0 Binary (.glb) Scene Builder
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
    metallic = 0.12,
    roughness = 0.55,
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
    const bv = {
      buffer: 0,
      byteOffset: this.byteOffset,
      byteLength: buf.length,
    };
    if (target !== undefined) bv.target = target;
    const bvIndex = this.bufferViews.length;
    this.bufferViews.push(bv);
    this.bufferChunks.push(aligned);
    this.byteOffset += aligned.length;
    return bvIndex;
  }

  _addFloatAccessor(floatArray, comps, typeStr, target) {
    const buf = Buffer.alloc(floatArray.length * 4);
    const mins = new Array(comps).fill(Infinity);
    const maxs = new Array(comps).fill(-Infinity);
    for (let i = 0; i < floatArray.length; i++) {
      const v = Number.isFinite(floatArray[i]) ? floatArray[i] : 0;
      buf.writeFloatLE(v, i * 4);
      const c = i % comps;
      const f32 = buf.readFloatLE(i * 4);
      if (f32 < mins[c]) mins[c] = f32;
      if (f32 > maxs[c]) maxs[c] = f32;
    }
    const bv = this._appendBuffer(buf, target);
    const accIdx = this.accessors.length;
    this.accessors.push({
      bufferView: bv,
      componentType: 5126, // FLOAT
      count: floatArray.length / comps,
      type: typeStr,
      min: mins.map((x) => Number(x.toFixed(6))),
      max: maxs.map((x) => Number(x.toFixed(6))),
    });
    return accIdx;
  }

  _addU16Accessor(intArray, target) {
    const buf = Buffer.alloc(intArray.length * 2);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < intArray.length; i++) {
      buf.writeUInt16LE(intArray[i], i * 2);
      if (intArray[i] < mn) mn = intArray[i];
      if (intArray[i] > mx) mx = intArray[i];
    }
    const bv = this._appendBuffer(buf, target);
    const accIdx = this.accessors.length;
    this.accessors.push({
      bufferView: bv,
      componentType: 5123, // UNSIGNED_SHORT
      count: intArray.length,
      type: 'SCALAR',
      min: [mn],
      max: [mx],
    });
    return accIdx;
  }

  addMesh(name, primGeoms) {
    const primitives = [];
    for (const pg of primGeoms) {
      if (!pg || pg.isEmpty()) continue;
      const posAcc = this._addFloatAccessor(pg.positions, 3, 'VEC3', 34962);
      const normAcc = this._addFloatAccessor(pg.normals, 3, 'VEC3', 34962);
      const idxAcc = this._addU16Accessor(pg.indices, 34963);
      primitives.push({
        attributes: { POSITION: posAcc, NORMAL: normAcc },
        indices: idxAcc,
        material: pg.materialIndex,
        mode: 4,
      });
    }
    if (primitives.length === 0) throw new Error(`Empty mesh: ${name}`);
    const meshIdx = this.meshes.length;
    this.meshes.push({ name, primitives });
    return meshIdx;
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

  addAnimation(name, tracks) {
    const samplers = [];
    const channels = [];
    for (const tr of tracks) {
      const inAcc = this._addFloatAccessor(tr.times, 1, 'SCALAR');
      let flat = [];
      let comps = 3;
      let typeStr = 'VEC3';
      if (tr.path === 'rotation') {
        comps = 4;
        typeStr = 'VEC4';
      }
      for (const val of tr.values) {
        for (let c = 0; c < comps; c++) flat.push(val[c]);
      }
      const outAcc = this._addFloatAccessor(flat, comps, typeStr);
      const sampIdx = samplers.length;
      samplers.push({
        input: inAcc,
        output: outAcc,
        interpolation: tr.interpolation || 'LINEAR',
      });
      channels.push({
        sampler: sampIdx,
        target: { node: tr.nodeIndex, path: tr.path },
      });
    }
    this.animations.push({ name, samplers, channels });
  }

  buildGLB(sceneName = 'ConcordScene') {
    const hasParent = new Set();
    for (const n of this.nodes) {
      for (const c of n.children || []) hasParent.add(c);
    }
    const rootNodes = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (!hasParent.has(i)) rootNodes.push(i);
    }

    const binChunk = Buffer.concat(this.bufferChunks);
    const gltf = {
      asset: {
        version: '2.0',
        generator: 'StarfallCommand-ConcordMirageGenerator-1.0',
      },
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
    const jsonChunk =
      jsonPad > 0 ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;

    const totalLen = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); // 'glTF'
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(totalLen, 8);

    const jsonHdr = Buffer.alloc(8);
    jsonHdr.writeUInt32LE(jsonChunk.length, 0);
    jsonHdr.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

    const binHdr = Buffer.alloc(8);
    binHdr.writeUInt32LE(binChunk.length, 0);
    binHdr.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

    return {
      glbBuffer: Buffer.concat([header, jsonHdr, jsonChunk, binHdr, binChunk]),
      gltf,
    };
  }
}

// ---------------------------------------------------------------------------
// Palette Factories (Concord Opaque + Shade Spectral Translucent)
// ---------------------------------------------------------------------------

function createMirageAdeptMaterials(scene) {
  return {
    Surf_TEAM: scene.addMaterial({
      name: 'Surf_TEAM_Panel',
      hex: '#3c7ef0',
      metallic: 0.22,
      roughness: 0.36,
      emissiveHex: '#183a80',
      emissiveBoost: 0.55,
    }),
    Surf_GLOW: scene.addMaterial({
      name: 'Surf_GLOW_Accent',
      hex: '#7eb2ff',
      metallic: 0.05,
      roughness: 0.14,
      emissiveHex: '#6ca8ff',
      emissiveBoost: 1.85,
    }),
    Mat_Ivory: scene.addMaterial({
      name: 'Mat_Ivory',
      hex: '#c9bfa4',
      metallic: 0.10,
      roughness: 0.54,
    }),
    Mat_IvoryLight: scene.addMaterial({
      name: 'Mat_IvoryLight',
      hex: '#e2dac4',
      metallic: 0.08,
      roughness: 0.46,
    }),
    Mat_Gold: scene.addMaterial({
      name: 'Mat_Gold',
      hex: '#c89b32',
      metallic: 0.82,
      roughness: 0.28,
      emissiveHex: '#2c1e05',
      emissiveBoost: 0.35,
    }),
    Mat_GoldBright: scene.addMaterial({
      name: 'Mat_GoldBright',
      hex: '#eab949',
      metallic: 0.86,
      roughness: 0.22,
      emissiveHex: '#3e2b08',
      emissiveBoost: 0.40,
    }),
    Mat_Bronze: scene.addMaterial({
      name: 'Mat_BronzeCrucible',
      hex: '#9e7226',
      metallic: 0.78,
      roughness: 0.34,
    }),
    Mat_StoneDark: scene.addMaterial({
      name: 'Mat_StoneDark',
      hex: '#2b3342',
      metallic: 0.38,
      roughness: 0.62,
    }),
    Mat_EmitterBlue: scene.addMaterial({
      name: 'Mat_EmitterBlue',
      hex: '#38b4ff',
      metallic: 0.08,
      roughness: 0.16,
      emissiveHex: '#2ca4ff',
      emissiveBoost: 1.9,
    }),
    Mat_EmitterBlueCore: scene.addMaterial({
      name: 'Mat_EmitterBlueCore',
      hex: '#bdf4ff',
      metallic: 0.04,
      roughness: 0.10,
      emissiveHex: '#8ceaff',
      emissiveBoost: 2.3,
    }),
    Mat_EmitterBlueField: scene.addMaterial({
      name: 'Mat_EmitterBlueField',
      hex: '#4ac4ff',
      alpha: 0.52,
      metallic: 0.0,
      roughness: 0.14,
      emissiveHex: '#38b6ff',
      emissiveBoost: 1.8,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
  };
}

function createMirageShadeMaterials(scene) {
  return {
    // Team & Glow materials used ONLY on delicate floating psionic sigils/sparks
    // so when the engine overrides Surf_TEAM_* / Surf_GLOW_* with solid opaque materials,
    // the Shade's entire spectral body remains 100% translucent!
    Surf_TEAM: scene.addMaterial({
      name: 'Surf_TEAM_Panel',
      hex: '#3c7ef0',
      metallic: 0.15,
      roughness: 0.30,
      emissiveHex: '#2456b8',
      emissiveBoost: 0.85,
    }),
    Surf_GLOW: scene.addMaterial({
      name: 'Surf_GLOW_Accent',
      hex: '#86c4ff',
      metallic: 0.0,
      roughness: 0.12,
      emissiveHex: '#78baff',
      emissiveBoost: 2.1,
    }),
    // Three layered ALPHA_BLEND spectral psionic materials (zero opaque armor!)
    Mat_ShadeOuter: scene.addMaterial({
      name: 'Mat_ShadePhantomOuter',
      hex: '#42ccff',
      alpha: 0.30,
      metallic: 0.0,
      roughness: 0.16,
      emissiveHex: '#2cb4ff',
      emissiveBoost: 1.65,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
    Mat_ShadeInner: scene.addMaterial({
      name: 'Mat_ShadePhantomInner',
      hex: '#aaf6ff',
      alpha: 0.48,
      metallic: 0.0,
      roughness: 0.10,
      emissiveHex: '#80ecff',
      emissiveBoost: 2.15,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
    Mat_ShadeMist: scene.addMaterial({
      name: 'Mat_ShadePhantomMist',
      hex: '#2da4fa',
      alpha: 0.18,
      metallic: 0.0,
      roughness: 0.22,
      emissiveHex: '#1f8ae8',
      emissiveBoost: 1.35,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
  };
}

// ---------------------------------------------------------------------------
// Shared Crescent Forearm Launcher Builder Helper (Guarantees Matching Silhouette!)
// ---------------------------------------------------------------------------

function populateCrescentLauncherGeometry({
  gMain,
  gTrim,
  gEmitter,
  gEmitterCore,
  gField,
}) {
  // Forearm bracer mount along +X (x = -0.06 .. +0.34)
  gMain.addChamferBox({
    center: [0.12, 0.02, 0.0],
    size: [0.38, 0.13, 0.18],
    topScale: [0.86, 0.86],
  });
  gTrim.addChamferBox({
    center: [0.16, 0.09, 0.0],
    size: [0.30, 0.04, 0.14],
    topScale: [0.88, 0.88],
  });

  // Signature Wide Crescent Forearm Bow-Arc!
  // Spans Z = -0.44 .. +0.44 (0.88 span!) curving forward to X = +0.58 at center & tips
  // Slightly canted (-18 deg roll) so the dramatic crescent shape reads clearly from
  // BOTH -56 deg RTS camera zoom AND 3/4 view!
  const cantQuat = quatFromEulerXYZ(-18, 0, 0);
  const xfBow = (p) => vAdd([0.28, 0.02, 0.0], rotateVecByQuat(p, cantQuat));

  for (const side of [-1, 1]) {
    // Curved crescent horn sweeping outward in Z and forward in X!
    const hornStations = [
      { pos: xfBow([0.04, 0.0, side * 0.08]), rx: 0.075, ry: 0.052 },
      { pos: xfBow([0.12, 0.0, side * 0.24]), rx: 0.082, ry: 0.054 },
      { pos: xfBow([0.26, 0.0, side * 0.38]), rx: 0.068, ry: 0.046 },
      { pos: xfBow([0.44, 0.0, side * 0.43]), rx: 0.042, ry: 0.032 },
    ];
    gMain.addTubeAlongSpine(hornStations, 5, true, true);

    // Golden outer crescent blade edge along each horn
    const trimStations = [
      { pos: xfBow([0.08, 0.02, side * 0.10]), rx: 0.045, ry: 0.028 },
      { pos: xfBow([0.18, 0.02, side * 0.28]), rx: 0.048, ry: 0.028 },
      { pos: xfBow([0.34, 0.01, side * 0.42]), rx: 0.036, ry: 0.022 },
      { pos: xfBow([0.48, 0.00, side * 0.44]), rx: 0.024, ry: 0.018 },
    ];
    gTrim.addTubeAlongSpine(trimStations, 4, true, true);

    // Vivid Blue Emitter Tip on each crescent horn!
    gEmitter.addFacetedCrystal({
      center: xfBow([0.50, 0.00, side * 0.44]),
      radii: [0.075, 0.045, 0.045],
      sectors: 6,
      stacks: 4,
    });
  }

  // Forward Central Focusing Prong & Blue Plasma Guide Rail
  gTrim.addTubeAlongSpine(
    [
      { pos: xfBow([0.06, 0.0, 0.0]), rx: 0.05, ry: 0.045 },
      { pos: xfBow([0.38, 0.0, 0.0]), rx: 0.036, ry: 0.034 },
    ],
    5,
    true,
    true
  );
  gEmitterCore.addFacetedCrystal({
    center: xfBow([0.44, 0.0, 0.0]),
    radii: [0.095, 0.055, 0.055],
    sectors: 6,
    stacks: 4,
  });

  // Glowing Blue Energy Bow-Arc connecting the two crescent tips through the focal point!
  if (gField) {
    gField.addTubeAlongSpine(
      [
        { pos: xfBow([0.48, 0.0, -0.42]), rx: 0.022, ry: 0.022 },
        { pos: xfBow([0.46, 0.0, -0.18]), rx: 0.026, ry: 0.026 },
        { pos: xfBow([0.45, 0.0, 0.00]), rx: 0.030, ry: 0.030 },
        { pos: xfBow([0.46, 0.0, 0.18]), rx: 0.026, ry: 0.026 },
        { pos: xfBow([0.48, 0.0, 0.42]), rx: 0.022, ry: 0.022 },
      ],
      4,
      true,
      true
    );
  }
}

// ---------------------------------------------------------------------------
// Asset 1: mirage_adept.glb
// Aurelian Concord Mirage Adept (sleek light infantry, crescent forearm launcher,
// asymmetric gold/ivory armor, blue emitters, Muzzle & ShadeOrigin,
// clips: idle, walk, attack, cast, death)
// ---------------------------------------------------------------------------

function buildMirageAdeptGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createMirageAdeptMaterials(scene);

  const rootIdx = scene.addNode({ name: 'MirageAdept', translation: [0, 0, 0] });

  // ShadeOrigin anchor right in front of the caster (+X forward = (1,0,0) exact!)
  scene.addNode({
    name: 'ShadeOrigin',
    translation: [0.72, 1.12, 0.0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 1. Pelvis & Waist Sash Assembly ('Pelvis' at [0, 0.96, 0])
  // -------------------------------------------------------------------------
  const pelvisRest = [0, 0.96, 0];
  const gPelvisDark = new PrimitiveGeom(mats.Mat_StoneDark);
  const gPelvisIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gPelvisGold = new PrimitiveGeom(mats.Mat_GoldBright);

  // Sleek armored belt & pelvis core
  gPelvisDark.addChamferBox({
    center: [0, 0.02, 0],
    size: [0.28, 0.20, 0.38],
    topScale: [0.94, 0.96],
  });
  gPelvisGold.addChamferBox({
    center: [0.02, 0.10, 0],
    size: [0.32, 0.07, 0.44],
    topScale: [1.02, 1.02],
  });
  // Asymmetric Left-Hip Armored Tasset Plate (Ivory + Gold trim on -Z side!)
  gPelvisIvory.addChamferBox({
    center: [0.00, -0.08, -0.25],
    size: [0.32, 0.30, 0.09],
    rotDeg: [-16, 0, 0],
    topScale: [0.86, 0.88],
  });
  gPelvisGold.addChamferBox({
    center: [0.00, 0.05, -0.23],
    size: [0.28, 0.06, 0.10],
    rotDeg: [-16, 0, 0],
  });

  const pelvisMesh = scene.addMesh('Pelvis_Mesh', [gPelvisDark, gPelvisIvory, gPelvisGold]);
  const pelvisIdx = scene.addNode({
    name: 'Pelvis',
    meshIndex: pelvisMesh,
    translation: pelvisRest,
    parentIndex: rootIdx,
  });

  // Flowing Concord Front & Rear Team Tabard Sashes (Surf_TEAM_TabardFront / Back)
  {
    const gFrontSash = new PrimitiveGeom(mats.Surf_TEAM);
    gFrontSash.addLoft(
      [
        [
          [0.18, -0.34, -0.09],
          [0.18, -0.34, 0.09],
          [0.14, -0.34, 0.09],
          [0.14, -0.34, -0.09],
        ],
        [
          [0.17, 0.06, -0.12],
          [0.17, 0.06, 0.12],
          [0.13, 0.06, 0.12],
          [0.13, 0.06, -0.12],
        ],
      ],
      [[0.16, -0.34, 0], [0.15, 0.06, 0]],
      true,
      true
    );
    const fMesh = scene.addMesh('Surf_TEAM_TabardFront', [gFrontSash]);
    scene.addNode({ name: 'Surf_TEAM_TabardFront', meshIndex: fMesh, parentIndex: pelvisIdx });

    const gBackSash = new PrimitiveGeom(mats.Surf_TEAM);
    gBackSash.addLoft(
      [
        [
          [-0.20, -0.40, -0.13],
          [-0.20, -0.40, 0.13],
          [-0.16, -0.40, 0.13],
          [-0.16, -0.40, -0.13],
        ],
        [
          [-0.16, 0.06, -0.15],
          [-0.16, 0.06, 0.15],
          [-0.12, 0.06, 0.15],
          [-0.12, 0.06, -0.15],
        ],
      ],
      [[-0.18, -0.40, 0], [-0.14, 0.06, 0]],
      true,
      true
    );
    const bMesh = scene.addMesh('Surf_TEAM_TabardBack', [gBackSash]);
    scene.addNode({ name: 'Surf_TEAM_TabardBack', meshIndex: bMesh, parentIndex: pelvisIdx });
  }

  // -------------------------------------------------------------------------
  // 2. Articulated Sleek Concord Legs ('Thigh_R/L' -> 'Shin_R/L')
  //    Pelvis Y = 0.96, Thigh at Y = -0.04 (0.92), Shin at Y = -0.44 (0.48),
  //    Boot ground sole at local Y = -0.4800 -> exact world Y = 0.0000!
  // -------------------------------------------------------------------------
  const legNodes = {};
  for (const [sideTag, sideSign] of [
    ['R', 1],
    ['L', -1],
  ]) {
    const gThDark = new PrimitiveGeom(mats.Mat_StoneDark);
    const gThIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
    const gThGold = new PrimitiveGeom(mats.Mat_Gold);

    // Dark undersuit thigh cylinder + sculpted front-outer ivory thigh cuisse
    gThDark.addTubeAlongSpine(
      [
        { pos: [0, 0.02, 0], rx: 0.095, ry: 0.095 },
        { pos: [0, -0.42, 0], rx: 0.078, ry: 0.078 },
      ],
      6,
      true,
      true
    );
    gThIvory.addChamferBox({
      center: [0.02, -0.19, sideSign * 0.03],
      size: [0.19, 0.34, 0.17],
      topScale: [1.06, 1.06],
      botScale: [0.84, 0.84],
    });
    gThGold.addChamferBox({
      center: [0.09, -0.40, 0],
      size: [0.10, 0.10, 0.14],
      topScale: [0.88, 0.88],
    });

    const thMesh = scene.addMesh(`Thigh_${sideTag}_Mesh`, [gThDark, gThIvory, gThGold]);
    const thIdx = scene.addNode({
      name: `Thigh_${sideTag}`,
      meshIndex: thMesh,
      translation: [0.0, -0.04, sideSign * 0.16],
      parentIndex: pelvisIdx,
    });

    const gShIvory = new PrimitiveGeom(mats.Mat_Ivory);
    const gShGold = new PrimitiveGeom(mats.Mat_GoldBright);
    const gShDark = new PrimitiveGeom(mats.Mat_StoneDark);
    const gShBlue = new PrimitiveGeom(mats.Mat_EmitterBlue);

    // Tapered sleek Concord shin greave
    gShIvory.addLoft(
      [
        makeRectChamferRing(0.085, 0.078, 0.028, -0.38, 0.01, 0),
        makeRectChamferRing(0.105, 0.095, 0.032, -0.14, 0.02, 0),
        makeRectChamferRing(0.085, 0.082, 0.026, 0.04, 0.01, 0),
      ],
      [[0.01, -0.38, 0], [0.02, -0.14, 0], [0.01, 0.04, 0]],
      true,
      true
    );
    // Golden shin crest
    gShGold.addChamferBox({
      center: [0.10, -0.17, 0],
      size: [0.045, 0.34, 0.06],
      topScale: [0.86, 0.86],
    });
    // Small glowing blue ankle stabilizer emitter on outer calf!
    gShBlue.addFacetedCrystal({
      center: [-0.01, -0.28, sideSign * 0.09],
      radii: [0.032, 0.055, 0.024],
      sectors: 6,
      stacks: 3,
    });
    // Grounded armored Concord boot (sole at exact local Y = -0.4800 -> world Y = 0.0000!)
    gShDark.addLoft(
      [
        makeRectChamferRing(0.145, 0.088, 0.032, -0.480, 0.045, 0),
        makeRectChamferRing(0.115, 0.078, 0.028, -0.375, 0.020, 0),
      ],
      [[0.045, -0.480, 0], [0.020, -0.375, 0]],
      true,
      true
    );
    gShGold.addChamferBox({
      center: [0.14, -0.445, 0],
      size: [0.09, 0.065, 0.12],
      minYClamp: -0.480,
      topScale: [0.84, 0.84],
    });

    const shMesh = scene.addMesh(`Shin_${sideTag}_Mesh`, [gShIvory, gShGold, gShDark, gShBlue]);
    const shIdx = scene.addNode({
      name: `Shin_${sideTag}`,
      meshIndex: shMesh,
      translation: [0.0, -0.44, 0.0],
      parentIndex: thIdx,
    });

    legNodes[sideTag] = { thighIdx: thIdx, shinIdx: shIdx };
  }

  // -------------------------------------------------------------------------
  // 3. Sleek Concord Torso, Dorsal Projector & ASYMMETRIC Gold/Ivory Shoulders!
  //    ('Torso' at [0, 0.14, 0] -> world Y = 1.10)
  // -------------------------------------------------------------------------
  const torsoRest = [0, 0.14, 0];
  const gTorIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gTorIvoryBase = new PrimitiveGeom(mats.Mat_Ivory);
  const gTorGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gTorBronze = new PrimitiveGeom(mats.Mat_Bronze);
  const gTorDark = new PrimitiveGeom(mats.Mat_StoneDark);
  const gTorBlue = new PrimitiveGeom(mats.Mat_EmitterBlueCore);

  // Tapered V-silhouette Concord chest cuirass
  gTorDark.addChamferBox({
    center: [0, 0.10, 0],
    size: [0.24, 0.22, 0.34],
    topScale: [1.08, 1.10],
  });
  gTorIvory.addLoft(
    [
      makeRectChamferRing(0.14, 0.18, 0.05, 0.14, 0.01, 0),
      makeRectChamferRing(0.19, 0.26, 0.07, 0.38, 0.02, 0),
      makeRectChamferRing(0.15, 0.22, 0.06, 0.52, 0.00, 0),
    ],
    [[0.01, 0.14, 0], [0.02, 0.38, 0], [0.00, 0.52, 0]],
    true,
    true
  );
  // Golden collar gorget & sternum ribs
  gTorGold.addChamferBox({
    center: [0.02, 0.52, 0],
    size: [0.26, 0.08, 0.38],
    topScale: [0.88, 0.90],
  });
  // Glowing blue chest emitter node
  gTorBlue.addFacetedCrystal({
    center: [0.19, 0.36, 0],
    radii: [0.045, 0.075, 0.055],
    sectors: 6,
    stacks: 4,
  });

  // Compact Dorsal Phase-Projector Fin on Back (-X) with Blue Emitter Vents
  gTorIvoryBase.addChamferBox({
    center: [-0.19, 0.36, 0],
    size: [0.14, 0.34, 0.26],
    rotDeg: [0, 0, -8],
    topScale: [0.84, 0.82],
  });
  gTorGold.addTubeAlongSpine(
    [
      { pos: [-0.25, 0.20, 0], rx: 0.04, ry: 0.05 },
      { pos: [-0.30, 0.58, 0], rx: 0.035, ry: 0.045 },
    ],
    4,
    true,
    true
  );
  for (const sz of [-0.09, 0.09]) {
    gTorBlue.addFacetedCrystal({
      center: [-0.25, 0.42, sz],
      radii: [0.035, 0.08, 0.03],
      sectors: 6,
      stacks: 3,
    });
  }

  // ASYMMETRIC LEFT SHOULDER (-Z = -0.38): Tall Swept Ivory & Gold Aegis Wing-Pauldron!
  gTorIvory.addLoft(
    [
      [
        [-0.18, 0.34, -0.26],
        [0.18, 0.34, -0.26],
        [0.20, 0.36, -0.48],
        [-0.20, 0.36, -0.48],
      ],
      [
        [-0.16, 0.56, -0.24],
        [0.16, 0.56, -0.24],
        [0.18, 0.62, -0.52],
        [-0.18, 0.62, -0.52],
      ],
      [
        [-0.10, 0.78, -0.28],
        [0.06, 0.78, -0.28],
        [0.08, 0.84, -0.44],
        [-0.12, 0.84, -0.44],
      ],
    ],
    [[-0.01, 0.35, -0.37], [-0.01, 0.59, -0.38], [-0.02, 0.81, -0.36]],
    true,
    true
  );
  // Swept Golden Rim & Blue Emitter Vein on High Left Pauldron
  gTorGold.addTubeAlongSpine(
    [
      { pos: [0.18, 0.36, -0.49], rx: 0.035, ry: 0.035 },
      { pos: [0.06, 0.85, -0.45], rx: 0.032, ry: 0.032 },
      { pos: [-0.18, 0.40, -0.48], rx: 0.035, ry: 0.035 },
    ],
    4,
    true,
    true
  );
  gTorBlue.addFacetedCrystal({
    center: [-0.02, 0.70, -0.49],
    radii: [0.05, 0.09, 0.03],
    sectors: 6,
    stacks: 3,
  });

  // ASYMMETRIC RIGHT SHOULDER (+Z = +0.34): Low-Profile Agile Weapon-Arm Guard!
  gTorBronze.addChamferBox({
    center: [0.01, 0.44, 0.34],
    size: [0.24, 0.14, 0.22],
    rotDeg: [-16, 0, 0],
    topScale: [0.86, 0.86],
  });
  gTorGold.addChamferBox({
    center: [0.01, 0.51, 0.33],
    size: [0.20, 0.05, 0.18],
    rotDeg: [-16, 0, 0],
  });

  const torsoMesh = scene.addMesh('Torso_Mesh', [
    gTorIvory,
    gTorIvoryBase,
    gTorGold,
    gTorBronze,
    gTorDark,
    gTorBlue,
  ]);
  const torsoIdx = scene.addNode({
    name: 'Torso',
    meshIndex: torsoMesh,
    translation: torsoRest,
    parentIndex: pelvisIdx,
  });

  // Torso Surf_TEAM_* & Surf_GLOW_* Nodes
  {
    const gTeamL = new PrimitiveGeom(mats.Surf_TEAM);
    const pPoly = [
      [-0.13, -0.15],
      [0.13, -0.15],
      [0.09, 0.15],
      [-0.10, 0.15],
    ];
    gTeamL.addOrientedShield(
      [-0.01, 0.56, -0.50],
      vNorm([0.0, 0.36, -0.93]),
      [0.0, 0.93, 0.36],
      pPoly,
      0.035,
      0.86,
      0.01
    );
    const tlMesh = scene.addMesh('Surf_TEAM_PauldronLeft', [gTeamL]);
    scene.addNode({ name: 'Surf_TEAM_PauldronLeft', meshIndex: tlMesh, parentIndex: torsoIdx });

    const gTeamR = new PrimitiveGeom(mats.Surf_TEAM);
    const rPoly = [
      [-0.09, -0.07],
      [0.09, -0.07],
      [0.07, 0.07],
      [-0.07, 0.07],
    ];
    gTeamR.addOrientedShield(
      [0.01, 0.52, 0.37],
      vNorm([0.0, 0.78, 0.62]),
      [-1.0, 0.0, 0.0],
      rPoly,
      0.028,
      0.88,
      0.01
    );
    const trMesh = scene.addMesh('Surf_TEAM_ShoulderRight', [gTeamR]);
    scene.addNode({ name: 'Surf_TEAM_ShoulderRight', meshIndex: trMesh, parentIndex: torsoIdx });

    const gGlowBack = new PrimitiveGeom(mats.Surf_GLOW);
    gGlowBack.addFacetedCrystal({
      center: [-0.28, 0.38, 0],
      radii: [0.045, 0.11, 0.055],
      sectors: 6,
      stacks: 4,
    });
    const gbMesh = scene.addMesh('Surf_GLOW_BackCore', [gGlowBack]);
    scene.addNode({ name: 'Surf_GLOW_BackCore', meshIndex: gbMesh, parentIndex: torsoIdx });
  }

  // -------------------------------------------------------------------------
  // 4. Sleek Visored Concord Helmet & Swept Psionic Crest ('Head' at [0.02, 0.58, 0])
  //    World Y = 1.68 .. 2.18!
  // -------------------------------------------------------------------------
  const headRest = [0.02, 0.58, 0];
  const gHeadIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gHeadGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gHeadDark = new PrimitiveGeom(mats.Mat_StoneDark);

  gHeadDark.addChamferBox({
    center: [0, 0.04, 0],
    size: [0.14, 0.10, 0.14],
  });
  // Elongated sleek Concord helmet shell
  gHeadIvory.addLoft(
    [
      makeRectChamferRing(0.11, 0.10, 0.04, 0.06, 0.01, 0),
      makeRectChamferRing(0.15, 0.13, 0.05, 0.18, 0.02, 0),
      makeRectChamferRing(0.13, 0.11, 0.04, 0.30, -0.01, 0),
      makeRectChamferRing(0.07, 0.06, 0.02, 0.37, -0.05, 0),
    ],
    [[0.01, 0.06, 0], [0.02, 0.18, 0], [-0.01, 0.30, 0], [-0.05, 0.37, 0]],
    true,
    true
  );
  // Swept Golden Psionic Crown-Crest Fin reaching local Y = 0.50 -> world Y = 2.18!
  gHeadGold.addLoft(
    [
      [
        [-0.04, 0.28, -0.03],
        [0.10, 0.28, -0.02],
        [0.10, 0.28, 0.02],
        [-0.04, 0.28, 0.03],
      ],
      [
        [-0.22, 0.50, -0.02],
        [-0.04, 0.46, -0.015],
        [-0.04, 0.46, 0.015],
        [-0.22, 0.50, 0.02],
      ],
    ],
    [[0.03, 0.28, 0], [-0.13, 0.48, 0]],
    true,
    true
  );

  const headMesh = scene.addMesh('Head_Mesh', [gHeadIvory, gHeadGold, gHeadDark]);
  const headIdx = scene.addNode({
    name: 'Head',
    meshIndex: headMesh,
    translation: headRest,
    parentIndex: torsoIdx,
  });

  {
    const gVisor = new PrimitiveGeom(mats.Surf_GLOW);
    gVisor.addChamferBox({
      center: [0.15, 0.19, 0],
      size: [0.07, 0.065, 0.21],
      topScale: [0.88, 0.92],
    });
    const vMesh = scene.addMesh('Surf_GLOW_Visor', [gVisor]);
    scene.addNode({ name: 'Surf_GLOW_Visor', meshIndex: vMesh, parentIndex: headIdx });

    const gCrestTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gCrestTeam.addChamferBox({
      center: [-0.08, 0.40, 0],
      size: [0.16, 0.10, 0.055],
      rotDeg: [0, 0, 24],
      topScale: [0.86, 0.90],
    });
    const ctMesh = scene.addMesh('Surf_TEAM_HelmCrest', [gCrestTeam]);
    scene.addNode({ name: 'Surf_TEAM_HelmCrest', meshIndex: ctMesh, parentIndex: headIdx });
  }

  // -------------------------------------------------------------------------
  // 5. Right Arm + Iconic Crescent Forearm Launcher + 'Muzzle' Anchor!
  // -------------------------------------------------------------------------
  const gArmRDark = new PrimitiveGeom(mats.Mat_StoneDark);
  const gArmRIvory = new PrimitiveGeom(mats.Mat_Ivory);
  gArmRDark.addTubeAlongSpine(
    [
      { pos: [0, 0, 0], rx: 0.068, ry: 0.068 },
      { pos: [0.10, -0.24, 0.04], rx: 0.058, ry: 0.058 },
    ],
    6,
    true,
    true
  );
  gArmRIvory.addChamferBox({
    center: [0.05, -0.12, 0.04],
    size: [0.12, 0.18, 0.12],
    rotDeg: [0, 0, 22],
  });
  const uArmRMesh = scene.addMesh('UpperArm_R_Mesh', [gArmRDark, gArmRIvory]);
  const uArmRIdx = scene.addNode({
    name: 'UpperArm_R',
    meshIndex: uArmRMesh,
    translation: [0.02, 0.42, 0.32],
    parentIndex: torsoIdx,
  });

  // Forearm_R + Crescent Forearm Launcher
  const gLaunchMain = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gLaunchTrim = new PrimitiveGeom(mats.Mat_GoldBright);
  const gLaunchEmit = new PrimitiveGeom(mats.Mat_EmitterBlue);
  const gLaunchCore = new PrimitiveGeom(mats.Mat_EmitterBlueCore);
  const gLaunchField = new PrimitiveGeom(mats.Mat_EmitterBlueField);

  populateCrescentLauncherGeometry({
    gMain: gLaunchMain,
    gTrim: gLaunchTrim,
    gEmitter: gLaunchEmit,
    gEmitterCore: gLaunchCore,
    gField: gLaunchField,
  });

  const forearmRMesh = scene.addMesh('Forearm_R_Launcher_Mesh', [
    gLaunchMain,
    gLaunchTrim,
    gLaunchEmit,
    gLaunchCore,
    gLaunchField,
  ]);
  const forearmRIdx = scene.addNode({
    name: 'Forearm_R',
    meshIndex: forearmRMesh,
    translation: [0.10, -0.24, 0.05],
    parentIndex: uArmRIdx,
  });

  {
    const gLwTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gLwTeam.addChamferBox({
      center: [0.18, 0.10, 0.0],
      size: [0.22, 0.045, 0.13],
      topScale: [0.88, 0.88],
    });
    const lwMesh = scene.addMesh('Surf_TEAM_LauncherWing', [gLwTeam]);
    scene.addNode({ name: 'Surf_TEAM_LauncherWing', meshIndex: lwMesh, parentIndex: forearmRIdx });

    const gLcGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gLcGlow.addFacetedCrystal({
      center: [0.58, 0.02, 0.0],
      radii: [0.075, 0.055, 0.055],
      sectors: 6,
      stacks: 4,
    });
    const lcMesh = scene.addMesh('Surf_GLOW_LauncherCore', [gLcGlow]);
    scene.addNode({ name: 'Surf_GLOW_LauncherCore', meshIndex: lcMesh, parentIndex: forearmRIdx });
  }

  // Clear 'Muzzle' anchor at forward +X tip of Crescent Forearm Launcher!
  scene.addNode({
    name: 'Muzzle',
    translation: [0.82, 0.02, 0.0],
    parentIndex: forearmRIdx,
  });

  // -------------------------------------------------------------------------
  // 6. Left Off-Hand Arm + Psionic Phase Gauntlet ('UpperArm_L' -> 'Forearm_L')
  // -------------------------------------------------------------------------
  const gArmLDark = new PrimitiveGeom(mats.Mat_StoneDark);
  gArmLDark.addTubeAlongSpine(
    [
      { pos: [0, 0, 0], rx: 0.068, ry: 0.068 },
      { pos: [0.06, -0.25, -0.05], rx: 0.058, ry: 0.058 },
    ],
    6,
    true,
    true
  );
  const uArmLMesh = scene.addMesh('UpperArm_L_Mesh', [gArmLDark]);
  const uArmLIdx = scene.addNode({
    name: 'UpperArm_L',
    meshIndex: uArmLMesh,
    translation: [0.00, 0.42, -0.32],
    parentIndex: torsoIdx,
  });

  const gGauntIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gGauntGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gGauntBlue = new PrimitiveGeom(mats.Mat_EmitterBlue);
  gGauntIvory.addChamferBox({
    center: [0.12, -0.02, 0],
    size: [0.26, 0.11, 0.13],
    topScale: [0.86, 0.86],
  });
  gGauntGold.addChamferBox({
    center: [0.14, 0.05, 0],
    size: [0.20, 0.04, 0.10],
  });
  gGauntBlue.addFacetedCrystal({
    center: [0.27, -0.02, 0],
    radii: [0.06, 0.045, 0.05],
    sectors: 6,
    stacks: 4,
  });
  const forearmLMesh = scene.addMesh('Forearm_L_Mesh', [gGauntIvory, gGauntGold, gGauntBlue]);
  const forearmLIdx = scene.addNode({
    name: 'Forearm_L',
    meshIndex: forearmLMesh,
    translation: [0.06, -0.25, -0.05],
    parentIndex: uArmLIdx,
  });
  {
    const gGauntGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGauntGlow.addFacetedCrystal({
      center: [0.22, 0.06, -0.02],
      radii: [0.045, 0.045, 0.045],
      sectors: 6,
      stacks: 3,
    });
    const ggMesh = scene.addMesh('Surf_GLOW_GauntletL', [gGauntGlow]);
    scene.addNode({ name: 'Surf_GLOW_GauntletL', meshIndex: ggMesh, parentIndex: forearmLIdx });
  }

  // -------------------------------------------------------------------------
  // 7. Mirage Adept Baked Animations: 'idle', 'walk', 'attack', 'cast', 'death'
  //    Note: In +X forward, Z-axis rotation pitches limbs forward (+rz swings -Y limb toward +X!).
  //    Verify: rotateVecByQuat([0, -1, 0], Rz(+theta)) = [+sin(theta), -cos(theta), 0] -> +X FORWARD!
  //    And for knee bend backward (-X), Rz(-theta) swings [0, -1, 0] to [-sin(theta), -cos(theta), 0]!
  // -------------------------------------------------------------------------

  // 7A. 'idle' (2.2s seamless poised light-infantry breathing & vigilant scan; full joint tracks!)
  const idleT = [0.0, 0.55, 1.1, 1.65, 2.2];
  const idQuat = quatFromEulerXYZ(0, 0, 0);
  const idQuat5 = [idQuat, idQuat, idQuat, idQuat, idQuat];
  const forearmRRest = [0.10, -0.24, 0.05];
  scene.addAnimation('idle', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: idleT,
      values: [
        [0, 0.96, 0],
        [0, 0.975, 0],
        [0, 0.96, 0],
        [0, 0.954, 0],
        [0, 0.96, 0],
      ],
    },
    {
      nodeIndex: pelvisIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0.8, 0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -0.8, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: legNodes.R.thighIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -0.8),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 1.2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: legNodes.R.shinIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 0.8),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -1.6),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: legNodes.L.thighIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -0.8),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 1.2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: legNodes.L.shinIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 0.8),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -1.6),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -4.5, -1.5),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 3.5, 1.0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 6.0, 1.5),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -5.0, -1.0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: uArmRIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 2.5, 3.0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -2.0, -2.0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'translation',
      times: idleT,
      values: [forearmRRest, forearmRRest, forearmRRest, forearmRRest, forearmRRest],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'rotation',
      times: idleT,
      values: idQuat5,
    },
    {
      nodeIndex: uArmLIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(3.0, -4.0, -3.0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-2.0, 3.0, 2.0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: forearmLIdx,
      path: 'rotation',
      times: idleT,
      values: idQuat5,
    },
  ]);

  // 7B. 'walk' (0.96s seamless agile Concord stride keeping min.y >= 0.0!)
  const walkT = [0.0, 0.24, 0.48, 0.72, 0.96];
  scene.addAnimation('walk', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: walkT,
      values: [
        [0, 0.96, 0],
        [0, 1.01, -0.015],
        [0, 0.96, 0],
        [0, 1.01, 0.015],
        [0, 0.96, 0],
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, -4),
        quatFromEulerXYZ(0, 7, -5),
        quatFromEulerXYZ(0, 0, -4),
        quatFromEulerXYZ(0, -7, -5),
        quatFromEulerXYZ(0, 0, -4),
      ],
    },
    {
      nodeIndex: legNodes.R.thighIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 28),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -22),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: legNodes.R.shinIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -18),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -26),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: legNodes.L.thighIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -22),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 28),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: legNodes.L.shinIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -26),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -18),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: uArmRIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 4),
        quatFromEulerXYZ(0, -5, 0),
        quatFromEulerXYZ(0, 0, 4),
        quatFromEulerXYZ(0, 5, 8),
        quatFromEulerXYZ(0, 0, 4),
      ],
    },
    {
      nodeIndex: uArmLIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 6, 18),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -6, -16),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
  ]);

  // 7C. 'attack' (0.84s crisp Crescent Forearm Launcher glaive fire & recoil!)
  const atkT = [0.0, 0.14, 0.26, 0.54, 0.84];
  scene.addAnimation('attack', [
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 12, -3),
        quatFromEulerXYZ(0, -8, 4),
        quatFromEulerXYZ(0, 3, -1),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: uArmRIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -8, 18),
        quatFromEulerXYZ(0, 10, 4),
        quatFromEulerXYZ(0, -3, 10),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'translation',
      times: atkT,
      values: [
        [0.10, -0.24, 0.05],
        [0.14, -0.22, 0.03],
        [-0.04, -0.20, 0.06],
        [0.08, -0.23, 0.05],
        [0.10, -0.24, 0.05],
      ],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -4, -14),
        quatFromEulerXYZ(8, 6, 8),
        quatFromEulerXYZ(0, -2, -6),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: atkT,
      values: [
        [0, 0.96, 0],
        [0.03, 0.95, 0],
        [-0.05, 0.94, 0],
        [-0.01, 0.955, 0],
        [0, 0.96, 0],
      ],
    },
  ]);

  // 7D. 'cast' (1.20s Psionic Mirage Shade Projection ritual toward ShadeOrigin!)
  const castT = [0.0, 0.28, 0.62, 0.92, 1.20];
  scene.addAnimation('cast', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: castT,
      values: [
        [0, 0.96, 0],
        [-0.02, 0.99, 0],
        [0.05, 1.03, 0],
        [0.02, 0.98, 0],
        [0, 0.96, 0],
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: castT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 16, 4),
        quatFromEulerXYZ(0, -22, -6),
        quatFromEulerXYZ(0, -8, -2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    // Left off-hand phase gauntlet sweeps forward toward ShadeOrigin (+X)!
    {
      nodeIndex: uArmLIdx,
      path: 'rotation',
      times: castT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-18, -14, 34),
        quatFromEulerXYZ(10, 22, 68),
        quatFromEulerXYZ(4, 10, 28),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: forearmLIdx,
      path: 'rotation',
      times: castT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 12, 18),
        quatFromEulerXYZ(0, 18, 22),
        quatFromEulerXYZ(0, 8, 10),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    // Right crescent launcher raises in counter-balance resonance!
    {
      nodeIndex: uArmRIdx,
      path: 'rotation',
      times: castT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(12, -10, 26),
        quatFromEulerXYZ(18, -18, 38),
        quatFromEulerXYZ(6, -6, 14),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: castT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -10, 5),
        quatFromEulerXYZ(0, 18, -4),
        quatFromEulerXYZ(0, 6, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
  ]);

  // 7E. 'death' (1.25s kneeling stagger & clean collapse onto ground Y >= 0!)
  const deathT = [0.0, 0.25, 0.62, 0.98, 1.25];
  scene.addAnimation('death', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: deathT,
      values: [
        [0, 0.96, 0],
        [-0.05, 0.94, 0.02],
        [-0.10, 0.74, 0.03],
        [-0.14, 0.66, 0.04],
        [-0.14, 0.66, 0.04],
      ],
    },
    {
      nodeIndex: pelvisIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(3, -6, 6),
        quatFromEulerXYZ(6, -10, 12),
        quatFromEulerXYZ(8, -14, 16),
        quatFromEulerXYZ(8, -14, 16),
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 8, 8),
        quatFromEulerXYZ(4, -6, -14),
        quatFromEulerXYZ(6, -10, -26),
        quatFromEulerXYZ(6, -10, -26),
      ],
    },
    {
      nodeIndex: legNodes.R.thighIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 14),
        quatFromEulerXYZ(-6, 0, 42),
        quatFromEulerXYZ(-8, 0, 56),
        quatFromEulerXYZ(-8, 0, 56),
      ],
    },
    {
      nodeIndex: legNodes.R.shinIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -22),
        quatFromEulerXYZ(0, 0, -60),
        quatFromEulerXYZ(0, 0, -82),
        quatFromEulerXYZ(0, 0, -82),
      ],
    },
    {
      nodeIndex: legNodes.L.thighIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 8),
        quatFromEulerXYZ(6, 0, 38),
        quatFromEulerXYZ(8, 0, 52),
        quatFromEulerXYZ(8, 0, 52),
      ],
    },
    {
      nodeIndex: legNodes.L.shinIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -18),
        quatFromEulerXYZ(0, 0, -56),
        quatFromEulerXYZ(0, 0, -78),
        quatFromEulerXYZ(0, 0, -78),
      ],
    },
    {
      nodeIndex: uArmRIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(8, 0, 14),
        quatFromEulerXYZ(12, -8, 22),
        quatFromEulerXYZ(14, -10, 26),
        quatFromEulerXYZ(14, -10, 26),
      ],
    },
    {
      nodeIndex: uArmLIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-8, 0, 12),
        quatFromEulerXYZ(-14, 10, 24),
        quatFromEulerXYZ(-18, 14, 32),
        quatFromEulerXYZ(-18, 14, 32),
      ],
    },
  ]);

  return scene.buildGLB('MirageAdeptScene');
}

// ---------------------------------------------------------------------------
// Asset 2: mirage_shade.glb
// Aurelian Concord Mirage Shade — separately controllable, translucent psionic
// projection with the SAME readable silhouette & glow as Mirage Adept, WITHOUT
// solid opaque armor! Keeps the Shade's body 100% translucent even when
// Surf_TEAM_* and Surf_GLOW_* nodes are overridden by opaque engine materials.
// Anchor: 'Muzzle'. Animations: 'drift' (seamless), 'idle' (seamless), 'death'.
// ---------------------------------------------------------------------------

function buildMirageShadeGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createMirageShadeMaterials(scene);

  const rootIdx = scene.addNode({ name: 'MirageShade', translation: [0, 0, 0] });

  // -------------------------------------------------------------------------
  // 1. Ground-Contact Spectral Phase Ripple ('PhaseGroundWake' at Y = 0.0000!)
  //    Guarantees exact min.y == 0.0000 while the ghostly phantom hovers above!
  // -------------------------------------------------------------------------
  const gGroundMist = new PrimitiveGeom(mats.Mat_ShadeMist);
  const gGroundInner = new PrimitiveGeom(mats.Mat_ShadeInner);

  for (let k = 0; k < 3; k++) {
    const base = (2 * Math.PI * k) / 3;
    gGroundMist.addConcentricArcStrip({
      rInner: 0.34,
      rOuter: 0.56,
      yBot: 0.000,
      yTop: 0.018,
      thStart: base + 0.12,
      thEnd: base + 1.85,
      steps: 5,
      bevelIn: 0.006,
    });
    gGroundInner.addConcentricArcStrip({
      rInner: 0.18,
      rOuter: 0.25,
      yBot: 0.004,
      yTop: 0.022,
      thStart: base + 0.45,
      thEnd: base + 1.50,
      steps: 4,
      bevelIn: 0.004,
    });
  }

  const groundWakeMesh = scene.addMesh('PhaseGroundWake_Mesh', [gGroundMist, gGroundInner]);
  const groundWakeIdx = scene.addNode({
    name: 'PhaseGroundWake',
    meshIndex: groundWakeMesh,
    translation: [0, 0, 0],
    parentIndex: rootIdx,
  });

  // Razor-thin floating team-colored psionic arc runes around the ground wake
  for (const [rName, side] of [
    ['Surf_TEAM_GroundRuneR', 1],
    ['Surf_TEAM_GroundRuneL', -1],
  ]) {
    const gRune = new PrimitiveGeom(mats.Surf_TEAM);
    const thMid = side * (Math.PI * 0.48);
    gRune.addConcentricArcStrip({
      rInner: 0.58,
      rOuter: 0.66,
      yBot: 0.014,
      yTop: 0.032,
      thStart: thMid - 0.58,
      thEnd: thMid + 0.58,
      steps: 5,
      bevelIn: 0.004,
    });
    const rMesh = scene.addMesh(rName, [gRune]);
    scene.addNode({ name: rName, meshIndex: rMesh, parentIndex: groundWakeIdx });
  }

  {
    const gWakeGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gWakeGlow.addFacetedCrystal({
      center: [0, 0.06, 0],
      radii: [0.065, 0.04, 0.065],
      sectors: 6,
      stacks: 3,
    });
    const wgMesh = scene.addMesh('Surf_GLOW_WakeSpark', [gWakeGlow]);
    scene.addNode({ name: 'Surf_GLOW_WakeSpark', meshIndex: wgMesh, parentIndex: groundWakeIdx });
  }

  // -------------------------------------------------------------------------
  // 2. Levitating Spectral Phantom Root ('ShadeBody' at [0, 1.02, 0])
  //    Entire body, head, limbs, asymmetric left wing-pauldron, crescent bow,
  //    and trailing wisps use ONLY translucent ALPHA_BLEND spectral materials!
  // -------------------------------------------------------------------------
  const shadeBodyRest = [0, 1.02, 0];
  const gWaistOuter = new PrimitiveGeom(mats.Mat_ShadeOuter);
  const gWaistInner = new PrimitiveGeom(mats.Mat_ShadeInner);

  // Translucent spectral waist & asymmetric left hip phantom tasset
  gWaistOuter.addChamferBox({
    center: [0, 0.0, 0],
    size: [0.27, 0.20, 0.36],
    topScale: [0.94, 0.96],
  });
  gWaistOuter.addChamferBox({
    center: [-0.01, -0.08, -0.24],
    size: [0.30, 0.28, 0.07],
    rotDeg: [-16, 0, 0],
  });
  // Inner glowing psionic core diamond inside waist
  gWaistInner.addFacetedCrystal({
    center: [0.02, 0.02, 0],
    radii: [0.08, 0.11, 0.10],
    sectors: 6,
    stacks: 4,
  });

  const shadeBodyMesh = scene.addMesh('ShadeBody_Mesh', [gWaistOuter, gWaistInner]);
  const shadeBodyIdx = scene.addNode({
    name: 'ShadeBody',
    meshIndex: shadeBodyMesh,
    translation: shadeBodyRest,
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 3. Ethereal Trailing Spectral Leg-Wisps & Phase Veil ('ShadeWake_R/L', 'ShadeVeilTail')
  //    Taper gracefully downward & backward (-X) from Y = 1.00 down to Y ~ 0.12
  //    leaving an unmistakable hovering ghost gap above Y = 0!
  // -------------------------------------------------------------------------
  const wakeLegIndices = {};
  for (const [sideTag, sideSign] of [
    ['R', 1],
    ['L', -1],
  ]) {
    const gLegOut = new PrimitiveGeom(mats.Mat_ShadeOuter);
    const gLegIn = new PrimitiveGeom(mats.Mat_ShadeInner);
    const gLegMist = new PrimitiveGeom(mats.Mat_ShadeMist);

    // Ghostly thigh-to-shin silhouette tapering into a pointed spectral wisp!
    gLegOut.addTubeAlongSpine(
      [
        { pos: [0.00, 0.02, 0], rx: 0.105, ry: 0.10 },
        { pos: [0.02, -0.34, sideSign * 0.02], rx: 0.095, ry: 0.09 },
        { pos: [-0.08, -0.66, sideSign * 0.03], rx: 0.068, ry: 0.065 },
        { pos: [-0.22, -0.88, sideSign * 0.04], rx: 0.022, ry: 0.022 },
      ],
      6,
      true,
      true
    );
    // Inner luminous spectral energy filament down each leg wisp
    gLegIn.addTubeAlongSpine(
      [
        { pos: [0.01, -0.02, 0], rx: 0.042, ry: 0.042 },
        { pos: [0.02, -0.36, sideSign * 0.02], rx: 0.036, ry: 0.036 },
        { pos: [-0.14, -0.76, sideSign * 0.03], rx: 0.016, ry: 0.016 },
      ],
      5,
      true,
      true
    );
    // Trailing spectral mist fin behind calf
    gLegMist.addLoft(
      [
        [
          [-0.04, -0.18, -0.02],
          [-0.04, -0.18, 0.02],
          [-0.24, -0.26, 0.01],
          [-0.24, -0.26, -0.01],
        ],
        [
          [-0.14, -0.72, -0.015],
          [-0.14, -0.72, 0.015],
          [-0.36, -0.82, 0.008],
          [-0.36, -0.82, -0.008],
        ],
      ],
      [[-0.14, -0.22, 0], [-0.25, -0.77, 0]],
      true,
      true
    );

    const wMesh = scene.addMesh(`ShadeWake_${sideTag}_Mesh`, [gLegOut, gLegIn, gLegMist]);
    wakeLegIndices[sideTag] = scene.addNode({
      name: `ShadeWake_${sideTag}`,
      meshIndex: wMesh,
      translation: [0.0, -0.04, sideSign * 0.16],
      parentIndex: shadeBodyIdx,
    });
  }

  // Central Flowing Spectral Veil Tail Ribbon ('ShadeVeilTail')
  const gVeilMist = new PrimitiveGeom(mats.Mat_ShadeMist);
  gVeilMist.addLoft(
    [
      [
        [-0.10, 0.02, -0.16],
        [-0.10, 0.02, 0.16],
        [-0.14, 0.02, 0.16],
        [-0.14, 0.02, -0.16],
      ],
      [
        [-0.26, -0.44, -0.22],
        [-0.26, -0.44, 0.22],
        [-0.30, -0.44, 0.22],
        [-0.30, -0.44, -0.22],
      ],
      [
        [-0.48, -0.84, -0.10],
        [-0.48, -0.84, 0.10],
        [-0.51, -0.84, 0.10],
        [-0.51, -0.84, -0.10],
      ],
    ],
    [[-0.12, 0.02, 0], [-0.28, -0.44, 0], [-0.49, -0.84, 0]],
    true,
    true
  );
  const veilMesh = scene.addMesh('ShadeVeilTail_Mesh', [gVeilMist]);
  const veilIdx = scene.addNode({
    name: 'ShadeVeilTail',
    meshIndex: veilMesh,
    translation: [-0.04, -0.02, 0],
    parentIndex: shadeBodyIdx,
  });

  // -------------------------------------------------------------------------
  // 4. Translucent Spectral Torso & Matching Asymmetric Left Wing-Pauldron!
  //    ('ShadeTorso' at [0, 0.12, 0] -> world Y = 1.14)
  // -------------------------------------------------------------------------
  const gShTorOut = new PrimitiveGeom(mats.Mat_ShadeOuter);
  const gShTorIn = new PrimitiveGeom(mats.Mat_ShadeInner);
  const gShTorMist = new PrimitiveGeom(mats.Mat_ShadeMist);

  // Matching sleek V-silhouette phantom torso (100% translucent, seamless join to ShadeBody!)
  gShTorOut.addLoft(
    [
      makeRectChamferRing(0.13, 0.17, 0.05, -0.04, 0.00, 0),
      makeRectChamferRing(0.19, 0.26, 0.07, 0.36, 0.02, 0),
      makeRectChamferRing(0.15, 0.22, 0.06, 0.52, 0.00, 0),
    ],
    [[0.00, -0.04, 0], [0.02, 0.36, 0], [0.00, 0.52, 0]],
    true,
    true
  );

  // Inner glowing psionic rib/spine column visible right through the translucent chest!
  gShTorIn.addTubeAlongSpine(
    [
      { pos: [0.0, -0.04, 0], rx: 0.065, ry: 0.075 },
      { pos: [0.01, 0.48, 0], rx: 0.055, ry: 0.065 },
    ],
    6,
    true,
    true
  );

  // Matching Dorsal Phase-Projector Phantom Silhouette + Tapered Spectral Wisp Plume
  gShTorOut.addChamferBox({
    center: [-0.19, 0.36, 0],
    size: [0.13, 0.32, 0.24],
    rotDeg: [0, 0, -8],
    topScale: [0.84, 0.82],
  });
  gShTorMist.addLoft(
    [
      [
        [-0.24, 0.24, -0.07],
        [-0.24, 0.24, 0.07],
        [-0.24, 0.48, 0.07],
        [-0.24, 0.48, -0.07],
      ],
      [
        [-0.58, 0.38, -0.015],
        [-0.58, 0.38, 0.015],
        [-0.56, 0.43, 0.015],
        [-0.56, 0.43, -0.015],
      ],
    ],
    [[-0.24, 0.36, 0], [-0.57, 0.405, 0]],
    true,
    true
  );

  // Matching ASYMMETRIC LEFT WING-PAULDRON in Translucent Spectral Energy!
  gShTorOut.addLoft(
    [
      [
        [-0.18, 0.34, -0.26],
        [0.18, 0.34, -0.26],
        [0.20, 0.36, -0.48],
        [-0.20, 0.36, -0.48],
      ],
      [
        [-0.16, 0.56, -0.24],
        [0.16, 0.56, -0.24],
        [0.18, 0.62, -0.52],
        [-0.18, 0.62, -0.52],
      ],
      [
        [-0.10, 0.78, -0.28],
        [0.06, 0.78, -0.28],
        [0.08, 0.84, -0.44],
        [-0.12, 0.84, -0.44],
      ],
    ],
    [[-0.01, 0.35, -0.37], [-0.01, 0.59, -0.38], [-0.02, 0.81, -0.36]],
    true,
    true
  );
  gShTorIn.addFacetedCrystal({
    center: [-0.02, 0.62, -0.40],
    radii: [0.06, 0.14, 0.05],
    sectors: 6,
    stacks: 4,
  });

  // Matching Low-Profile Right Shoulder Phantom Cap
  gShTorOut.addChamferBox({
    center: [0.01, 0.44, 0.34],
    size: [0.22, 0.13, 0.20],
    rotDeg: [-16, 0, 0],
  });

  const shadeTorsoMesh = scene.addMesh('ShadeTorso_Mesh', [gShTorOut, gShTorIn, gShTorMist]);
  const shadeTorsoIdx = scene.addNode({
    name: 'ShadeTorso',
    meshIndex: shadeTorsoMesh,
    translation: [0, 0.12, 0],
    parentIndex: shadeBodyIdx,
  });

  // Delicate Floating Psionic Runes & Heart Spark on ShadeTorso
  // (Small floating runes keep 92%+ of the Shade's body see-through under opaque team overrides!)
  {
    const gChestRune = new PrimitiveGeom(mats.Surf_TEAM);
    // Slim floating psionic chevron rune in front of sternum
    const cPoly = [
      [-0.08, 0.04],
      [0.00, -0.07],
      [0.08, 0.04],
      [0.04, 0.07],
      [0.00, -0.01],
      [-0.04, 0.07],
    ];
    gChestRune.addOrientedShield([0.21, 0.38, 0], [1, 0, 0], [0, 1, 0], cPoly, 0.02, 0.90, 0.005);
    const crMesh = scene.addMesh('Surf_TEAM_ChestRune', [gChestRune]);
    scene.addNode({ name: 'Surf_TEAM_ChestRune', meshIndex: crMesh, parentIndex: shadeTorsoIdx });

    // Slim floating psionic sigil hovering just outside the left spectral pauldron!
    const gAegisSigil = new PrimitiveGeom(mats.Surf_TEAM);
    const aPoly = [
      [0.00, -0.13],
      [0.07, 0.00],
      [0.00, 0.13],
      [-0.07, 0.00],
    ];
    gAegisSigil.addOrientedShield(
      [-0.01, 0.60, -0.55],
      vNorm([0, 0.32, -0.95]),
      [0, 0.95, 0.32],
      aPoly,
      0.022,
      0.86,
      0.005
    );
    const asMesh = scene.addMesh('Surf_TEAM_LeftAegisSigil', [gAegisSigil]);
    scene.addNode({
      name: 'Surf_TEAM_LeftAegisSigil',
      meshIndex: asMesh,
      parentIndex: shadeTorsoIdx,
    });

    // Inner glowing heart spark visible inside the translucent chest!
    const gHeartSpark = new PrimitiveGeom(mats.Surf_GLOW);
    gHeartSpark.addFacetedCrystal({
      center: [0.04, 0.34, 0],
      radii: [0.065, 0.095, 0.065],
      sectors: 6,
      stacks: 4,
    });
    const hsMesh = scene.addMesh('Surf_GLOW_HeartSpark', [gHeartSpark]);
    scene.addNode({
      name: 'Surf_GLOW_HeartSpark',
      meshIndex: hsMesh,
      parentIndex: shadeTorsoIdx,
    });
  }

  // -------------------------------------------------------------------------
  // 5. Translucent Spectral Head & Swept Psionic Crest ('ShadeHead' at [0.02, 0.56, 0])
  // -------------------------------------------------------------------------
  const gShHeadOut = new PrimitiveGeom(mats.Mat_ShadeOuter);
  const gShHeadIn = new PrimitiveGeom(mats.Mat_ShadeInner);

  gShHeadOut.addLoft(
    [
      makeRectChamferRing(0.11, 0.10, 0.04, 0.04, 0.01, 0),
      makeRectChamferRing(0.15, 0.13, 0.05, 0.18, 0.02, 0),
      makeRectChamferRing(0.13, 0.11, 0.04, 0.30, -0.01, 0),
      makeRectChamferRing(0.07, 0.06, 0.02, 0.37, -0.05, 0),
    ],
    [[0.01, 0.04, 0], [0.02, 0.18, 0], [-0.01, 0.30, 0], [-0.05, 0.37, 0]],
    true,
    true
  );
  // Swept Spectral Helm Crest (matching Adept's exact silhouette!)
  gShHeadIn.addLoft(
    [
      [
        [-0.04, 0.28, -0.03],
        [0.10, 0.28, -0.02],
        [0.10, 0.28, 0.02],
        [-0.04, 0.28, 0.03],
      ],
      [
        [-0.24, 0.52, -0.02],
        [-0.04, 0.46, -0.015],
        [-0.04, 0.46, 0.015],
        [-0.24, 0.52, 0.02],
      ],
    ],
    [[0.03, 0.28, 0], [-0.14, 0.49, 0]],
    true,
    true
  );

  const shadeHeadMesh = scene.addMesh('ShadeHead_Mesh', [gShHeadOut, gShHeadIn]);
  const shadeHeadIdx = scene.addNode({
    name: 'ShadeHead',
    meshIndex: shadeHeadMesh,
    translation: [0.02, 0.56, 0],
    parentIndex: shadeTorsoIdx,
  });

  {
    // Floating psionic brow halo-chevron above helmet (crisp RTS team indicator, zero body occlusion!)
    const gHelmSigil = new PrimitiveGeom(mats.Surf_TEAM);
    const hPoly = [
      [-0.12, -0.02],
      [0.00, 0.08],
      [0.12, -0.02],
      [0.08, -0.06],
      [0.00, 0.02],
      [-0.08, -0.06],
    ];
    gHelmSigil.addOrientedShield(
      [-0.01, 0.50, 0],
      vNorm([0.35, 0.94, 0]),
      [-0.94, 0.35, 0],
      hPoly,
      0.028,
      0.88,
      0.008
    );
    const hmMesh = scene.addMesh('Surf_TEAM_HelmSigil', [gHelmSigil]);
    scene.addNode({ name: 'Surf_TEAM_HelmSigil', meshIndex: hmMesh, parentIndex: shadeHeadIdx });

    const gVisSpark = new PrimitiveGeom(mats.Surf_GLOW);
    gVisSpark.addChamferBox({
      center: [0.13, 0.19, 0],
      size: [0.055, 0.05, 0.18],
    });
    const vsMesh = scene.addMesh('Surf_GLOW_VisorSpark', [gVisSpark]);
    scene.addNode({ name: 'Surf_GLOW_VisorSpark', meshIndex: vsMesh, parentIndex: shadeHeadIdx });
  }

  // -------------------------------------------------------------------------
  // 6. Spectral Arms & Matching Translucent Crescent Forearm Launcher + 'Muzzle'
  // -------------------------------------------------------------------------
  const gShArmROut = new PrimitiveGeom(mats.Mat_ShadeOuter);
  gShArmROut.addTubeAlongSpine(
    [
      { pos: [0, 0, 0], rx: 0.068, ry: 0.068 },
      { pos: [0.10, -0.24, 0.04], rx: 0.056, ry: 0.056 },
    ],
    6,
    true,
    true
  );
  const shArmRMesh = scene.addMesh('ShadeArm_R_Mesh', [gShArmROut]);
  const shArmRIdx = scene.addNode({
    name: 'ShadeArm_R',
    meshIndex: shArmRMesh,
    translation: [0.02, 0.42, 0.32],
    parentIndex: shadeTorsoIdx,
  });

  // Translucent Spectral Crescent Forearm Launcher (identical silhouette, zero opaque armor!)
  const gShLaunchOuter = new PrimitiveGeom(mats.Mat_ShadeOuter);
  const gShLaunchInner = new PrimitiveGeom(mats.Mat_ShadeInner);
  const gShLaunchMist = new PrimitiveGeom(mats.Mat_ShadeMist);

  populateCrescentLauncherGeometry({
    gMain: gShLaunchOuter,
    gTrim: gShLaunchInner,
    gEmitter: gShLaunchInner,
    gEmitterCore: gShLaunchInner,
    gField: gShLaunchMist,
  });

  const shForearmRMesh = scene.addMesh('ShadeForearm_R_Mesh', [
    gShLaunchOuter,
    gShLaunchInner,
    gShLaunchMist,
  ]);
  const shForearmRIdx = scene.addNode({
    name: 'ShadeForearm_R',
    meshIndex: shForearmRMesh,
    translation: [0.10, -0.24, 0.05],
    parentIndex: shArmRIdx,
  });

  {
    const gCresSigil = new PrimitiveGeom(mats.Surf_TEAM);
    gCresSigil.addFacetedCrystal({
      center: [0.22, 0.13, 0.0],
      radii: [0.08, 0.028, 0.045],
      sectors: 4,
      stacks: 3,
    });
    const csMesh = scene.addMesh('Surf_TEAM_CrescentSigil', [gCresSigil]);
    scene.addNode({
      name: 'Surf_TEAM_CrescentSigil',
      meshIndex: csMesh,
      parentIndex: shForearmRIdx,
    });

    const gCresSpark = new PrimitiveGeom(mats.Surf_GLOW);
    gCresSpark.addFacetedCrystal({
      center: [0.58, 0.02, 0.0],
      radii: [0.07, 0.05, 0.05],
      sectors: 6,
      stacks: 4,
    });
    const cspMesh = scene.addMesh('Surf_GLOW_LauncherSpark', [gCresSpark]);
    scene.addNode({
      name: 'Surf_GLOW_LauncherSpark',
      meshIndex: cspMesh,
      parentIndex: shForearmRIdx,
    });
  }

  scene.addNode({
    name: 'Muzzle',
    translation: [0.82, 0.02, 0.0],
    parentIndex: shForearmRIdx,
  });

  // Left Spectral Off-Hand Arm
  const gShArmLOut = new PrimitiveGeom(mats.Mat_ShadeOuter);
  const gShArmLIn = new PrimitiveGeom(mats.Mat_ShadeInner);
  gShArmLOut.addTubeAlongSpine(
    [
      { pos: [0, 0, 0], rx: 0.066, ry: 0.066 },
      { pos: [0.08, -0.24, -0.05], rx: 0.056, ry: 0.056 },
      { pos: [0.28, -0.26, -0.04], rx: 0.048, ry: 0.048 },
    ],
    6,
    true,
    true
  );
  gShArmLIn.addFacetedCrystal({
    center: [0.31, -0.26, -0.04],
    radii: [0.055, 0.045, 0.045],
    sectors: 6,
    stacks: 3,
  });
  const shArmLMesh = scene.addMesh('ShadeArm_L_Mesh', [gShArmLOut, gShArmLIn]);
  const shArmLIdx = scene.addNode({
    name: 'ShadeArm_L',
    meshIndex: shArmLMesh,
    translation: [0.00, 0.42, -0.32],
    parentIndex: shadeTorsoIdx,
  });

  // -------------------------------------------------------------------------
  // 7. Mirage Shade Baked Animations:
  //    - 'drift' (1.80s seamless forward-gliding ghostly phase drift — primary!)
  //    - 'idle'  (2.40s seamless hovering spectral bob & sway)
  //    - 'death' (0.90s psionic dissipation collapse onto Y >= 0)
  // -------------------------------------------------------------------------

  // 7A. 'drift' (1.80s seamless ethereal forward phase-glide!)
  const driftT = [0.0, 0.45, 0.9, 1.35, 1.8];
  const unitScale5 = [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ];
  scene.addAnimation('drift', [
    {
      nodeIndex: shadeBodyIdx,
      path: 'translation',
      times: driftT,
      values: [
        [0.04, 1.05, 0.0],
        [0.08, 1.13, 0.03],
        [0.04, 1.05, 0.0],
        [0.07, 0.99, -0.03],
        [0.04, 1.05, 0.0],
      ],
    },
    {
      nodeIndex: shadeBodyIdx,
      path: 'scale',
      times: driftT,
      values: unitScale5,
    },
    {
      nodeIndex: shadeBodyIdx,
      path: 'rotation',
      times: driftT,
      values: [
        quatFromEulerXYZ(0, 0, -11),
        quatFromEulerXYZ(3, -5, -14),
        quatFromEulerXYZ(0, 0, -11),
        quatFromEulerXYZ(-3, 5, -9),
        quatFromEulerXYZ(0, 0, -11),
      ],
    },
    {
      nodeIndex: shadeTorsoIdx,
      path: 'rotation',
      times: driftT,
      values: [
        quatFromEulerXYZ(0, 0, -3),
        quatFromEulerXYZ(0, 6, -5),
        quatFromEulerXYZ(0, 0, -3),
        quatFromEulerXYZ(0, -6, -2),
        quatFromEulerXYZ(0, 0, -3),
      ],
    },
    {
      nodeIndex: shadeHeadIdx,
      path: 'rotation',
      times: driftT,
      values: [
        quatFromEulerXYZ(0, 0, 12),
        quatFromEulerXYZ(0, -5, 15),
        quatFromEulerXYZ(0, 0, 12),
        quatFromEulerXYZ(0, 5, 10),
        quatFromEulerXYZ(0, 0, 12),
      ],
    },
    // Ghostly leg wisps & veil undulate behind the drifting phantom!
    {
      nodeIndex: wakeLegIndices.R,
      path: 'rotation',
      times: driftT,
      values: [
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(0, 0, -18),
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(0, 0, 2),
        quatFromEulerXYZ(0, 0, -8),
      ],
    },
    {
      nodeIndex: wakeLegIndices.L,
      path: 'rotation',
      times: driftT,
      values: [
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(0, 0, 2),
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(0, 0, -18),
        quatFromEulerXYZ(0, 0, -8),
      ],
    },
    {
      nodeIndex: veilIdx,
      path: 'rotation',
      times: driftT,
      values: [
        quatFromEulerXYZ(0, 0, -6),
        quatFromEulerXYZ(5, 8, -16),
        quatFromEulerXYZ(0, 0, -6),
        quatFromEulerXYZ(-5, -8, -2),
        quatFromEulerXYZ(0, 0, -6),
      ],
    },
    {
      nodeIndex: shArmRIdx,
      path: 'rotation',
      times: driftT,
      values: [
        quatFromEulerXYZ(0, 0, 10),
        quatFromEulerXYZ(0, -4, 14),
        quatFromEulerXYZ(0, 0, 10),
        quatFromEulerXYZ(0, 4, 7),
        quatFromEulerXYZ(0, 0, 10),
      ],
    },
    {
      nodeIndex: shArmLIdx,
      path: 'rotation',
      times: driftT,
      values: [
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(-6, 8, -18),
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(6, -6, 0),
        quatFromEulerXYZ(0, 0, -8),
      ],
    },
    // Ground phase wake pulses & rotates seamlessly 360 deg (0 -> 90 -> 180 -> 270 -> 360 = quat equality via sign-matched axisAngle? Wait: 360 deg has cos(180)=-1 vs +1!)
    // Use smooth oscillatory phase-ripple + scale pulse so start === end float-for-float!
    {
      nodeIndex: groundWakeIdx,
      path: 'rotation',
      times: driftT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 28, 0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -28, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: groundWakeIdx,
      path: 'scale',
      times: driftT,
      values: [
        [1.0, 1.0, 1.0],
        [0.90, 1.0, 0.90],
        [1.0, 1.0, 1.0],
        [1.08, 1.0, 1.08],
        [1.0, 1.0, 1.0],
      ],
    },
  ]);

  // 7B. 'idle' (2.40s seamless stationary ghost levitation; full joint reset tracks!)
  const sIdleT = [0.0, 0.6, 1.2, 1.8, 2.4];
  const shIdQ = quatFromEulerXYZ(0, 0, 0);
  const shIdQ5 = [shIdQ, shIdQ, shIdQ, shIdQ, shIdQ];
  scene.addAnimation('idle', [
    {
      nodeIndex: shadeBodyIdx,
      path: 'translation',
      times: sIdleT,
      values: [
        [0, 1.02, 0],
        [0, 1.09, 0],
        [0, 1.02, 0],
        [0, 0.97, 0],
        [0, 1.02, 0],
      ],
    },
    {
      nodeIndex: shadeBodyIdx,
      path: 'rotation',
      times: sIdleT,
      values: shIdQ5,
    },
    {
      nodeIndex: shadeBodyIdx,
      path: 'scale',
      times: sIdleT,
      values: unitScale5,
    },
    {
      nodeIndex: shadeTorsoIdx,
      path: 'rotation',
      times: sIdleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -5, -2),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 5, 2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: shadeHeadIdx,
      path: 'rotation',
      times: sIdleT,
      values: shIdQ5,
    },
    {
      nodeIndex: wakeLegIndices.R,
      path: 'rotation',
      times: sIdleT,
      values: shIdQ5,
    },
    {
      nodeIndex: wakeLegIndices.L,
      path: 'rotation',
      times: sIdleT,
      values: shIdQ5,
    },
    {
      nodeIndex: veilIdx,
      path: 'rotation',
      times: sIdleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(4, 6, -8),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-4, -6, 4),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: shArmRIdx,
      path: 'rotation',
      times: sIdleT,
      values: shIdQ5,
    },
    {
      nodeIndex: shArmLIdx,
      path: 'rotation',
      times: sIdleT,
      values: shIdQ5,
    },
    {
      nodeIndex: groundWakeIdx,
      path: 'rotation',
      times: sIdleT,
      values: shIdQ5,
    },
    {
      nodeIndex: groundWakeIdx,
      path: 'scale',
      times: sIdleT,
      values: [
        [1.0, 1.0, 1.0],
        [0.92, 1.0, 0.92],
        [1.0, 1.0, 1.0],
        [1.06, 1.0, 1.06],
        [1.0, 1.0, 1.0],
      ],
    },
  ]);

  // 7C. 'death' (0.90s psionic projection dissipation — implodes upward/downward cleanly above Y >= 0!)
  const sDeathT = [0.0, 0.22, 0.58, 0.90];
  scene.addAnimation('death', [
    {
      nodeIndex: shadeBodyIdx,
      path: 'translation',
      times: sDeathT,
      values: [
        [0, 1.02, 0],
        [0, 1.18, 0],
        [0, 0.52, 0],
        [0, 0.18, 0],
      ],
    },
    {
      nodeIndex: shadeBodyIdx,
      path: 'scale',
      times: sDeathT,
      values: [
        [1.0, 1.0, 1.0],
        [1.12, 1.16, 1.12],
        [0.36, 0.42, 0.36],
        [0.06, 0.06, 0.06],
      ],
    },
    {
      nodeIndex: groundWakeIdx,
      path: 'scale',
      times: sDeathT,
      values: [
        [1.0, 1.0, 1.0],
        [1.25, 1.0, 1.25],
        [0.45, 0.5, 0.45],
        [0.08, 0.2, 0.08],
      ],
    },
  ]);

  return scene.buildGLB('MirageShadeScene');
}

// ---------------------------------------------------------------------------
// Self-Validation Summary & CLI Entry Point
// ---------------------------------------------------------------------------

function summarizeMirageAsset(filename, glbBuffer, gltf) {
  let totalVerts = 0;
  let totalTris = 0;
  const globalMin = [Infinity, Infinity, Infinity];
  const globalMax = [-Infinity, -Infinity, -Infinity];

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

  gltf.nodes.forEach((n, nIdx) => {
    if (n.mesh === undefined) return;
    const mesh = gltf.meshes[n.mesh];
    for (const prim of mesh.primitives) {
      const posAcc = gltf.accessors[prim.attributes.POSITION];
      const idxAcc = gltf.accessors[prim.indices];
      totalVerts += posAcc.count;
      totalTris += idxAcc.count / 3;

      const bv = gltf.bufferViews[posAcc.bufferView];
      const baseOff = binStart + (bv.byteOffset || 0) + (posAcc.byteOffset || 0);
      for (let i = 0; i < posAcc.count; i++) {
        const vx = glbBuffer.readFloatLE(baseOff + i * 12);
        const vy = glbBuffer.readFloatLE(baseOff + i * 12 + 4);
        const vz = glbBuffer.readFloatLE(baseOff + i * 12 + 8);
        const wp = worldPoint(nIdx, [vx, vy, vz]);
        for (let c = 0; c < 3; c++) {
          if (wp[c] < globalMin[c]) globalMin[c] = wp[c];
          if (wp[c] > globalMax[c]) globalMax[c] = wp[c];
        }
      }
    }
  });

  const allNodes = gltf.nodes.map((n) => n.name);
  const teamNodes = allNodes.filter((n) => n.startsWith('Surf_TEAM_'));
  const glowNodes = allNodes.filter((n) => n.startsWith('Surf_GLOW_'));
  const animations = (gltf.animations || []).map((a) => a.name);

  return {
    filename,
    bytes: glbBuffer.length,
    verts: totalVerts,
    tris: totalTris,
    min: globalMin.map((x) => Number(x.toFixed(4))),
    max: globalMax.map((x) => Number(x.toFixed(4))),
    size: [
      Number((globalMax[0] - globalMin[0]).toFixed(4)),
      Number((globalMax[1] - globalMin[1]).toFixed(4)),
      Number((globalMax[2] - globalMin[2]).toFixed(4)),
    ],
    allNodes,
    teamNodes,
    glowNodes,
    animations,
  };
}

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
  fs.mkdirSync(outDir, { recursive: true });

  const specs = [
    { filename: 'mirage_adept.glb', build: buildMirageAdeptGLB },
    { filename: 'mirage_shade.glb', build: buildMirageShadeGLB },
  ];

  const summaries = [];
  for (const sp of specs) {
    const { glbBuffer, gltf } = sp.build();
    const fullPath = path.join(outDir, sp.filename);
    fs.writeFileSync(fullPath, glbBuffer);
    summaries.push(summarizeMirageAsset(sp.filename, glbBuffer, gltf));
  }

  console.log(JSON.stringify(summaries, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildMirageAdeptGLB,
  buildMirageShadeGLB,
};
