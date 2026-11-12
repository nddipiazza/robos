#!/usr/bin/env node
'use strict';

/**
 * Deterministic Standalone Procedural GLB Generator for Starfall Command
 * Faction: Aurelian Concord — Psionic High Caster & Archive Tech Pair
 *
 * Outputs ONLY inside target directory (default __dirname):
 *   1. storm_scribe.glb     — Aurelian Concord High Templar role (~2.30u tall).
 *                             Tall psionic arch-caster with a prominent split robe,
 *                             upright golden-and-ivory tuning crest, and bright
 *                             channeling hands cradling incandescent storm orbs.
 *                             Anchors: 'Muzzle', 'CastOrigin' (+X forward).
 *                             Animations: 'idle', 'walk', 'attack', 'cast', 'death'.
 *   2. canticle_archive.glb — Aurelian Concord Templar Archives role (3x3 psionic
 *                             research structure, 6.50u wide x 6.50u deep).
 *                             Stepped faceted gold-and-ivory octagonal plinth with
 *                             +X ceremonial stair, flanking reliquary shoulders,
 *                             central resonance crucible, and a constellation of
 *                             levitating suspended archive facets.
 *                             Animations: 'idle' (seamless loop).
 *
 * Conventions:
 *   - +X forward, +Y up, +Z right, floor at Y = 0.0000
 *   - Independent accent mesh nodes named Surf_TEAM_* and Surf_GLOW_*
 *   - Uses ONLY built-in Node.js modules ('fs', 'path'). Zero external dependencies.
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
  const c = Math.min(ch, hx * 0.94, hz * 0.94);
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

function makeRegularPolygonRing(radiusX, radiusZ, sides, y, phaseRad = 0, cx = 0, cz = 0) {
  const ring = [];
  for (let i = 0; i < sides; i++) {
    const th = (2 * Math.PI * i) / sides + phaseRad;
    ring.push([cx + Math.cos(th) * radiusX, y, cz + Math.sin(th) * radiusZ]);
  }
  return ring;
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
    const chB = Math.min(hx * botScale[0], hz * botScale[1]) * chamfer * 2.0;
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
    if (vLen(right) < 1e-5) right = vCross([1, 0, 0], out);
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
      const flat = [];
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

  buildGLB(sceneName = 'ConcordCanticleScene') {
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
        generator: 'StarfallCommand-ConcordCanticleGenerator-1.0',
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
// Shared Aurelian Concord Canticle Palette Factory
// ---------------------------------------------------------------------------

function createConcordCanticleMaterials(scene) {
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
      hex: '#84beff',
      metallic: 0.04,
      roughness: 0.14,
      emissiveHex: '#70afff',
      emissiveBoost: 1.95,
    }),
    Mat_Ivory: scene.addMaterial({
      name: 'Mat_Ivory',
      hex: '#cbc1a6',
      metallic: 0.10,
      roughness: 0.52,
    }),
    Mat_IvoryLight: scene.addMaterial({
      name: 'Mat_IvoryLight',
      hex: '#e7dfd0',
      metallic: 0.08,
      roughness: 0.44,
    }),
    Mat_Gold: scene.addMaterial({
      name: 'Mat_Gold',
      hex: '#c9982e',
      metallic: 0.84,
      roughness: 0.27,
      emissiveHex: '#2e1f05',
      emissiveBoost: 0.35,
    }),
    Mat_GoldBright: scene.addMaterial({
      name: 'Mat_GoldBright',
      hex: '#f0bf4c',
      metallic: 0.88,
      roughness: 0.20,
      emissiveHex: '#422e08',
      emissiveBoost: 0.42,
    }),
    Mat_Bronze: scene.addMaterial({
      name: 'Mat_BronzeReliquary',
      hex: '#9a6e24',
      metallic: 0.78,
      roughness: 0.34,
    }),
    Mat_StoneDark: scene.addMaterial({
      name: 'Mat_StoneDark',
      hex: '#262e3d',
      metallic: 0.36,
      roughness: 0.62,
    }),
    Mat_StormArc: scene.addMaterial({
      name: 'Mat_StormArc',
      hex: '#46c6ff',
      metallic: 0.05,
      roughness: 0.14,
      emissiveHex: '#34b8ff',
      emissiveBoost: 2.15,
    }),
    Mat_StormCore: scene.addMaterial({
      name: 'Mat_StormCore',
      hex: '#dcfbff',
      metallic: 0.02,
      roughness: 0.08,
      emissiveHex: '#aef2ff',
      emissiveBoost: 2.60,
    }),
    Mat_StormField: scene.addMaterial({
      name: 'Mat_StormField',
      hex: '#5ad8ff',
      alpha: 0.48,
      metallic: 0.0,
      roughness: 0.12,
      emissiveHex: '#42c4ff',
      emissiveBoost: 1.95,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
  };
}

function addIndependentAccentNode(scene, name, parentIndex, matIndex, buildFn, translation = null, rotation = null) {
  const geom = new PrimitiveGeom(matIndex);
  buildFn(geom);
  const meshIdx = scene.addMesh(name, [geom]);
  return scene.addNode({
    name,
    meshIndex: meshIdx,
    translation,
    rotation,
    parentIndex,
  });
}

// ---------------------------------------------------------------------------
// Asset 1: storm_scribe.glb
// Aurelian Concord Storm Scribe (High Templar gameplay role, ~2.30u tall)
//   - Tall psionic arch-caster silhouette with A-line split robe & central slit
//   - Tall upright golden-and-ivory tuning-crown crest reaching Y = 2.3000
//   - Bright forward channeling hands cradling incandescent psionic storm orbs
//   - Anchors: 'Muzzle', 'CastOrigin' (+X forward)
//   - Animations: 'idle', 'walk', 'attack', 'cast', 'death'
// ---------------------------------------------------------------------------

function buildChannelingOrbMesh(scene, name, mats) {
  const gCore = new PrimitiveGeom(mats.Mat_StormCore);
  const gArc = new PrimitiveGeom(mats.Mat_StormArc);
  const gField = new PrimitiveGeom(mats.Mat_StormField);

  // Blazing white-cyan central psionic storm nucleus
  gCore.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [0.105, 0.115, 0.105],
    sectors: 6,
    stacks: 4,
  });

  // Two intersecting canted electric storm discharge arcs around the hand core
  for (const tilt of [
    [38, 18, 0],
    [-42, -22, 28],
  ]) {
    const q = quatFromEulerXYZ(tilt[0], tilt[1], tilt[2]);
    const stations = [];
    for (let i = 0; i <= 6; i++) {
      const th = (2 * Math.PI * i) / 6;
      const r = 0.155;
      stations.push({
        pos: rotateVecByQuat([Math.cos(th) * r, Math.sin(th) * r * 0.88, 0], q),
        rx: 0.022,
        ry: 0.018,
      });
    }
    gArc.addTubeAlongSpine(stations, 4, false, false);
  }

  // Translucent outer storm corona polyhedron
  gField.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [0.165, 0.175, 0.165],
    rotDeg: [15, 30, 0],
    sectors: 6,
    stacks: 4,
    phaseRad: Math.PI / 6,
  });

  return scene.addMesh(name, [gCore, gArc, gField]);
}

function buildStormScribeGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createConcordCanticleMaterials(scene);

  const rootIdx = scene.addNode({ name: 'StormScribe', translation: [0, 0, 0] });

  // CastOrigin anchor right in front of the raised converging hands (+X forward = (1,0,0)!)
  scene.addNode({
    name: 'CastOrigin',
    translation: [0.76, 1.58, 0.0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 1. Pelvis & Liturgical Cincture Girdle ('Pelvis' at [0, 1.02, 0])
  // -------------------------------------------------------------------------
  const pelvisRest = [0, 1.02, 0];
  const gPelvisDark = new PrimitiveGeom(mats.Mat_StoneDark);
  const gPelvisIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gPelvisGold = new PrimitiveGeom(mats.Mat_GoldBright);

  // Dark inner robe core (recessed behind the split robe slit for crisp contrast!)
  gPelvisDark.addChamferBox({
    center: [-0.01, -0.02, 0],
    size: [0.24, 0.22, 0.34],
    topScale: [0.96, 0.96],
  });
  // Ornate golden liturgical waist girdle & front canticle buckle
  gPelvisGold.addChamferBox({
    center: [0.01, 0.08, 0],
    size: [0.31, 0.08, 0.44],
    topScale: [1.04, 1.04],
  });
  gPelvisIvory.addChamferBox({
    center: [0.16, 0.06, 0],
    size: [0.07, 0.13, 0.14],
    topScale: [0.86, 0.86],
  });
  gPelvisGold.addFacetedCrystal({
    center: [0.19, 0.06, 0],
    radii: [0.03, 0.065, 0.055],
    sectors: 4,
    stacks: 3,
  });

  const pelvisMesh = scene.addMesh('Pelvis_Mesh', [gPelvisDark, gPelvisIvory, gPelvisGold]);
  const pelvisIdx = scene.addNode({
    name: 'Pelvis',
    meshIndex: pelvisMesh,
    translation: pelvisRest,
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 2. Prominent Split Liturgical Robe ('RobePanel_R' & 'RobePanel_L')
  //    Two sweeping A-line ivory-and-gold robe halves separated front & back
  //    by a bold gold-bordered central split from waist (Y=1.00) to hem (Y=0.08)!
  // -------------------------------------------------------------------------
  const robeNodes = {};
  for (const [sideTag, sideSign] of [
    ['R', 1],
    ['L', -1],
  ]) {
    const gRobeIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
    const gRobeShade = new PrimitiveGeom(mats.Mat_Ivory);
    const gRobeGold = new PrimitiveGeom(mats.Mat_GoldBright);
    const gRobeRune = new PrimitiveGeom(mats.Mat_StormArc);

    // Pivot at [0, -0.02, sideSign * 0.08] -> world Y = 1.00, Z = ±0.08
    // Local Z = 0 sits right at the gold-trimmed inner split edge (world Z = ±0.08..±0.11)!
    const mkRobeRing = (y, xFront, xBack, zInner, zOuter, zMidPush) => {
      const pts = [
        [xFront, y, sideSign * zInner],
        [xFront * 0.92, y, sideSign * zOuter * 0.86],
        [0.02, y, sideSign * (zOuter + zMidPush)],
        [xBack * 0.92, y, sideSign * zOuter * 0.92],
        [xBack, y, sideSign * zInner],
        [xBack * 0.72, y, sideSign * (zInner + 0.035)],
        [xFront * 0.72, y, sideSign * (zInner + 0.035)],
      ];
      return sideSign > 0 ? pts : pts.slice().reverse();
    };

    const rTop = mkRobeRing(0.02, 0.15, -0.16, 0.005, 0.16, 0.02);
    const rMid = mkRobeRing(-0.42, 0.19, -0.24, 0.018, 0.25, 0.04);
    const rBot = mkRobeRing(-0.91, 0.23, -0.34, 0.035, 0.35, 0.06);

    gRobeIvory.addLoft(
      [rBot, rMid, rTop],
      [
        [-0.04, -0.91, sideSign * 0.18],
        [-0.02, -0.42, sideSign * 0.13],
        [0.00, 0.02, sideSign * 0.08],
      ],
      true,
      true
    );

    // Bold gleaming golden trim running vertically down the FRONT inner split edge!
    gRobeGold.addTubeAlongSpine(
      [
        { pos: [0.155, 0.02, sideSign * 0.006], rx: 0.024, ry: 0.024 },
        { pos: [0.195, -0.42, sideSign * 0.018], rx: 0.026, ry: 0.026 },
        { pos: [0.235, -0.91, sideSign * 0.035], rx: 0.028, ry: 0.028 },
      ],
      4,
      true,
      true
    );
    // Golden trim running vertically down the REAR inner split edge!
    gRobeGold.addTubeAlongSpine(
      [
        { pos: [-0.165, 0.02, sideSign * 0.006], rx: 0.022, ry: 0.022 },
        { pos: [-0.245, -0.42, sideSign * 0.018], rx: 0.024, ry: 0.024 },
        { pos: [-0.345, -0.91, sideSign * 0.035], rx: 0.026, ry: 0.026 },
      ],
      4,
      true,
      true
    );
    // Sweeping golden bottom hem band around the outer split skirt!
    gRobeGold.addTubeAlongSpine(
      [
        { pos: [0.235, -0.90, sideSign * 0.035], rx: 0.026, ry: 0.022 },
        { pos: [0.18, -0.90, sideSign * 0.28], rx: 0.026, ry: 0.022 },
        { pos: [-0.04, -0.90, sideSign * 0.39], rx: 0.026, ry: 0.022 },
        { pos: [-0.345, -0.90, sideSign * 0.035], rx: 0.026, ry: 0.022 },
      ],
      4,
      true,
      true
    );

    // Outer pleated ivory side-plate & glowing psionic canticle hem rune
    gRobeShade.addChamferBox({
      center: [-0.02, -0.46, sideSign * 0.25],
      size: [0.24, 0.68, 0.06],
      rotDeg: [sideSign * 14, 0, -4],
      topScale: [0.76, 0.85],
    });
    gRobeRune.addFacetedCrystal({
      center: [0.16, -0.76, sideSign * 0.19],
      radii: [0.028, 0.085, 0.028],
      rotDeg: [sideSign * 12, 0, -8],
      sectors: 4,
      stacks: 3,
    });

    const robeMesh = scene.addMesh(`RobePanel_${sideTag}_Mesh`, [
      gRobeIvory,
      gRobeShade,
      gRobeGold,
      gRobeRune,
    ]);
    const rNodeIdx = scene.addNode({
      name: `RobePanel_${sideTag}`,
      meshIndex: robeMesh,
      translation: [0.0, -0.02, sideSign * 0.08],
      parentIndex: pelvisIdx,
    });
    robeNodes[sideTag] = rNodeIdx;

    // Independent Team-Colored Liturgical Stole cascading down each split robe panel!
    addIndependentAccentNode(
      scene,
      `Surf_TEAM_RobeStole${sideTag}`,
      rNodeIdx,
      mats.Surf_TEAM,
      (g) => {
        const mkStole = (y, xC, zIn, zOut) => {
          const ring = [
            [xC + 0.022, y, sideSign * zIn],
            [xC + 0.018, y, sideSign * zOut],
            [xC - 0.018, y, sideSign * zOut],
            [xC - 0.022, y, sideSign * zIn],
          ];
          return sideSign > 0 ? ring : ring.slice().reverse();
        };
        g.addLoft(
          [
            mkStole(-0.82, 0.215, 0.06, 0.20),
            mkStole(-0.40, 0.185, 0.045, 0.16),
            mkStole(0.01, 0.155, 0.03, 0.12),
          ],
          [
            [0.215, -0.82, sideSign * 0.13],
            [0.185, -0.40, sideSign * 0.10],
            [0.155, 0.01, sideSign * 0.075],
          ],
          true,
          true
        );
      }
    );
  }

  // -------------------------------------------------------------------------
  // 3. Articulated Ceremonial Cantor Greaves & Sabatons ('Thigh_R/L' -> 'Shin_R/L')
  //    Visible through the central split robe! Exact ground contact at Y = 0.0000!
  //    Pelvis Y = 1.02 + Thigh (-0.04 => 0.98) + Shin (-0.46 => 0.52) + Sole (-0.5200 => 0.0000!)
  // -------------------------------------------------------------------------
  const legNodes = {};
  for (const [sideTag, sideSign] of [
    ['R', 1],
    ['L', -1],
  ]) {
    const gThDark = new PrimitiveGeom(mats.Mat_StoneDark);
    const gThGold = new PrimitiveGeom(mats.Mat_Gold);
    gThDark.addTubeAlongSpine(
      [
        { pos: [0, 0.02, 0], rx: 0.078, ry: 0.078 },
        { pos: [0, -0.46, 0], rx: 0.068, ry: 0.068 },
      ],
      6,
      true,
      true
    );
    gThGold.addChamferBox({
      center: [0.07, -0.42, 0],
      size: [0.08, 0.10, 0.11],
    });
    const thMesh = scene.addMesh(`Thigh_${sideTag}_Mesh`, [gThDark, gThGold]);
    const thIdx = scene.addNode({
      name: `Thigh_${sideTag}`,
      meshIndex: thMesh,
      translation: [0.0, -0.04, sideSign * 0.14],
      parentIndex: pelvisIdx,
    });

    const gShDark = new PrimitiveGeom(mats.Mat_StoneDark);
    const gShIvory = new PrimitiveGeom(mats.Mat_Ivory);
    const gShGold = new PrimitiveGeom(mats.Mat_GoldBright);

    gShIvory.addTubeAlongSpine(
      [
        { pos: [0.01, 0.02, 0], rx: 0.072, ry: 0.072 },
        { pos: [0.01, -0.42, 0], rx: 0.064, ry: 0.064 },
      ],
      6,
      true,
      true
    );
    gShGold.addChamferBox({
      center: [0.075, -0.20, 0],
      size: [0.04, 0.34, 0.055],
    });
    // Grounded cantor boot sole at exact local Y = -0.5200 -> world Y = 0.0000!
    gShDark.addLoft(
      [
        makeRectChamferRing(0.135, 0.078, 0.028, -0.5200, 0.045, 0),
        makeRectChamferRing(0.105, 0.068, 0.024, -0.4150, 0.020, 0),
      ],
      [[0.045, -0.5200, 0], [0.020, -0.4150, 0]],
      true,
      true
    );
    gShGold.addChamferBox({
      center: [0.135, -0.485, 0],
      size: [0.085, 0.062, 0.105],
      minYClamp: -0.5200,
      topScale: [0.84, 0.84],
    });

    const shMesh = scene.addMesh(`Shin_${sideTag}_Mesh`, [gShDark, gShIvory, gShGold]);
    const shIdx = scene.addNode({
      name: `Shin_${sideTag}`,
      meshIndex: shMesh,
      translation: [0.0, -0.46, 0.0],
      parentIndex: thIdx,
    });

    legNodes[sideTag] = { thighIdx: thIdx, shinIdx: shIdx };
  }

  // -------------------------------------------------------------------------
  // 4. Regal High-Collared Cantor Torso & Symmetric Shoulder Mantles
  //    ('Torso' at [0, 0.12, 0] -> world Y = 1.14)
  // -------------------------------------------------------------------------
  const torsoRest = [0, 0.12, 0];
  const gTorIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gTorIvoryBase = new PrimitiveGeom(mats.Mat_Ivory);
  const gTorGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gTorDark = new PrimitiveGeom(mats.Mat_StoneDark);
  const gTorArc = new PrimitiveGeom(mats.Mat_StormArc);

  gTorDark.addChamferBox({
    center: [0, 0.08, 0],
    size: [0.23, 0.20, 0.32],
    topScale: [1.06, 1.08],
  });
  // Slender aristocratic V-tapered ivory liturgical breastplate
  gTorIvory.addLoft(
    [
      makeRectChamferRing(0.135, 0.17, 0.05, 0.10, 0.01, 0),
      makeRectChamferRing(0.185, 0.25, 0.065, 0.36, 0.02, 0),
      makeRectChamferRing(0.155, 0.22, 0.055, 0.52, 0.00, 0),
    ],
    [[0.01, 0.10, 0], [0.02, 0.36, 0], [0.00, 0.52, 0]],
    true,
    true
  );

  // Sculpted Golden Chalice Gorget / High Collar framing the head (open at +X front!)
  gTorGold.addConcentricArcStrip({
    rInner: 0.145,
    rOuter: 0.225,
    yBot: 0.49,
    yTop: 0.67,
    thStart: Math.PI * 0.26,
    thEnd: Math.PI * 1.74,
    steps: 8,
    bevelIn: 0.015,
  });

  // Dorsal Psionic Canticle Scroll-Reliquary Spine (-X)
  gTorIvoryBase.addChamferBox({
    center: [-0.20, 0.35, 0],
    size: [0.14, 0.38, 0.28],
    rotDeg: [0, 0, -6],
    topScale: [0.86, 0.84],
  });
  gTorGold.addChamferBox({
    center: [-0.25, 0.36, 0],
    size: [0.06, 0.42, 0.12],
    rotDeg: [0, 0, -6],
  });

  // Symmetric Regal Gold-and-Ivory Shoulder Mantles (distinct from Mirage Adept's asymmetry!)
  for (const side of [-1, 1]) {
    const mkMantleRing = (y, xH, zIn, zOut) => {
      const pts = [
        [-xH, y, side * zIn],
        [xH, y, side * zIn],
        [xH * 0.88, y + 0.04, side * zOut],
        [-xH * 0.88, y + 0.04, side * zOut],
      ];
      return side > 0 ? pts : pts.slice().reverse();
    };
    gTorIvory.addLoft(
      [
        mkMantleRing(0.36, 0.18, 0.21, 0.47),
        mkMantleRing(0.52, 0.16, 0.20, 0.51),
        mkMantleRing(0.62, 0.10, 0.22, 0.43),
      ],
      [
        [0, 0.38, side * 0.34],
        [0, 0.54, side * 0.36],
        [0, 0.64, side * 0.33],
      ],
      true,
      true
    );
    // Golden outer shoulder arch rim
    gTorGold.addTubeAlongSpine(
      [
        { pos: [0.16, 0.40, side * 0.48], rx: 0.032, ry: 0.030 },
        { pos: [0.00, 0.65, side * 0.45], rx: 0.032, ry: 0.030 },
        { pos: [-0.16, 0.40, side * 0.48], rx: 0.032, ry: 0.030 },
      ],
      4,
      true,
      true
    );
    // Glowing psionic emitter node on each shoulder
    gTorArc.addFacetedCrystal({
      center: [0.04, 0.54, side * 0.49],
      radii: [0.045, 0.075, 0.032],
      sectors: 6,
      stacks: 3,
    });
  }

  const torsoMesh = scene.addMesh('Torso_Mesh', [
    gTorIvory,
    gTorIvoryBase,
    gTorGold,
    gTorDark,
    gTorArc,
  ]);
  const torsoIdx = scene.addNode({
    name: 'Torso',
    meshIndex: torsoMesh,
    translation: torsoRest,
    parentIndex: pelvisIdx,
  });

  // Independent Surf_TEAM_* and Surf_GLOW_* Accents on Torso
  for (const [mName, side] of [
    ['Surf_TEAM_MantleRight', 1],
    ['Surf_TEAM_MantleLeft', -1],
  ]) {
    addIndependentAccentNode(scene, mName, torsoIdx, mats.Surf_TEAM, (g) => {
      const poly = [
        [-0.12, -0.10],
        [0.12, -0.10],
        [0.09, 0.11],
        [-0.09, 0.11],
      ];
      g.addOrientedShield(
        [0.0, 0.55, side * 0.48],
        vNorm([0.0, 0.62, side * 0.78]),
        [-1.0, 0.0, 0.0],
        poly,
        0.032,
        0.86,
        0.01
      );
    });
  }

  addIndependentAccentNode(scene, 'Surf_GLOW_SternumCore', torsoIdx, mats.Surf_GLOW, (g) => {
    g.addFacetedCrystal({
      center: [0.19, 0.37, 0.0],
      radii: [0.042, 0.095, 0.068],
      sectors: 6,
      stacks: 4,
    });
  });

  addIndependentAccentNode(scene, 'Surf_GLOW_BackMatrix', torsoIdx, mats.Surf_GLOW, (g) => {
    g.addFacetedCrystal({
      center: [-0.28, 0.38, 0.0],
      radii: [0.045, 0.13, 0.06],
      sectors: 6,
      stacks: 4,
    });
  });

  // -------------------------------------------------------------------------
  // 5. Arch-Caster Helm & Tall UPRIGHT Psionic Tuning-Crest
  //    ('Head' at [0.02, 0.58, 0] -> world Y = 1.72; upright crest reaches exact Y = 2.3000!)
  // -------------------------------------------------------------------------
  const headRest = [0.02, 0.58, 0];
  const gHeadIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gHeadGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gHeadDark = new PrimitiveGeom(mats.Mat_StoneDark);
  const gHeadStorm = new PrimitiveGeom(mats.Mat_StormCore);

  gHeadDark.addChamferBox({
    center: [0, 0.04, 0],
    size: [0.13, 0.10, 0.13],
  });
  // Serene faceted arch-templar helm
  gHeadIvory.addLoft(
    [
      makeRectChamferRing(0.105, 0.098, 0.038, 0.05, 0.01, 0),
      makeRectChamferRing(0.138, 0.125, 0.048, 0.17, 0.02, 0),
      makeRectChamferRing(0.122, 0.115, 0.042, 0.28, 0.00, 0),
    ],
    [[0.01, 0.05, 0], [0.02, 0.17, 0], [0.00, 0.28, 0]],
    true,
    true
  );

  // SIGNATURE TALL UPRIGHT CREST (local Y = 0.25 .. 0.5800 -> exact world Y = 1.97 .. 2.3000!)
  // Wide enough across Z (±0.21) AND thick enough along X to read clearly from RTS zoom & profile!
  // Base crown diadem supporting the upright crest
  gHeadGold.addChamferBox({
    center: [-0.01, 0.29, 0],
    size: [0.22, 0.06, 0.30],
    topScale: [0.92, 1.08],
  });

  // Central Upright Ivory-and-Gold Crown Spire reaching exact local Y = 0.5800 (world Y = 2.3000!)
  gHeadIvory.addLoft(
    [
      makeRectChamferRing(0.068, 0.075, 0.022, 0.29, -0.01, 0),
      makeRectChamferRing(0.056, 0.095, 0.020, 0.44, -0.015, 0),
      makeRectChamferRing(0.026, 0.032, 0.010, 0.5800, -0.02, 0),
    ],
    [[-0.01, 0.29, 0], [-0.015, 0.44, 0], [-0.02, 0.5800, 0]],
    true,
    true
  );
  // Golden vertical spine rib along the upright central crest
  gHeadGold.addLoft(
    [
      makeRectChamferRing(0.076, 0.024, 0.008, 0.30, -0.01, 0),
      makeRectChamferRing(0.064, 0.022, 0.008, 0.46, -0.015, 0),
      makeRectChamferRing(0.032, 0.016, 0.006, 0.5800, -0.02, 0),
    ],
    [[-0.01, 0.30, 0], [-0.015, 0.46, 0], [-0.02, 0.5800, 0]],
    true,
    true
  );

  // Twin Upright Golden Tuning-Tines flanking the central crest (world Y = 1.98 .. 2.26!)
  for (const side of [-1, 1]) {
    gHeadGold.addTubeAlongSpine(
      [
        { pos: [0.00, 0.27, side * 0.11], rx: 0.032, ry: 0.026 },
        { pos: [-0.01, 0.39, side * 0.195], rx: 0.034, ry: 0.026 },
        { pos: [-0.015, 0.545, side * 0.165], rx: 0.022, ry: 0.018 },
      ],
      5,
      true,
      true
    );
    // Luminous psionic arc crystal bridging tine to central upright spire
    gHeadStorm.addFacetedCrystal({
      center: [-0.012, 0.45, side * 0.115],
      radii: [0.024, 0.055, 0.032],
      sectors: 4,
      stacks: 3,
    });
  }

  const headMesh = scene.addMesh('Head_Mesh', [gHeadIvory, gHeadGold, gHeadDark, gHeadStorm]);
  const headIdx = scene.addNode({
    name: 'Head',
    meshIndex: headMesh,
    translation: headRest,
    parentIndex: torsoIdx,
  });

  addIndependentAccentNode(scene, 'Surf_GLOW_Visor', headIdx, mats.Surf_GLOW, (g) => {
    g.addChamferBox({
      center: [0.138, 0.18, 0],
      size: [0.065, 0.058, 0.21],
      topScale: [0.88, 0.92],
    });
  });

  addIndependentAccentNode(scene, 'Surf_TEAM_CrestBanner', headIdx, mats.Surf_TEAM, (g) => {
    g.addChamferBox({
      center: [-0.014, 0.39, 0],
      size: [0.125, 0.13, 0.135],
      topScale: [0.84, 0.80],
    });
  });

  addIndependentAccentNode(scene, 'Surf_GLOW_CrestJewel', headIdx, mats.Surf_GLOW, (g) => {
    g.addFacetedCrystal({
      center: [0.048, 0.44, 0],
      radii: [0.036, 0.078, 0.042],
      sectors: 6,
      stacks: 4,
    });
  });

  // -------------------------------------------------------------------------
  // 6. Symmetrical Cantor Arms & BRIGHT CHANNELING HANDS + 'Muzzle' Anchor!
  //    Identity rest rotations on UpperArm_R & Forearm_R keep Muzzle +X_fwd = (1,0,0)!
  // -------------------------------------------------------------------------
  const armNodes = {};
  const sharedOrbMesh = buildChannelingOrbMesh(scene, 'ChannelingStormOrb_Mesh', mats);

  for (const [sideTag, sideSign] of [
    ['R', 1],
    ['L', -1],
  ]) {
    const gUArmDark = new PrimitiveGeom(mats.Mat_StoneDark);
    const gUArmIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
    const gUArmGold = new PrimitiveGeom(mats.Mat_Gold);

    // Upper arm with flared cantor bell-sleeve sloping forward-down-outward
    gUArmDark.addTubeAlongSpine(
      [
        { pos: [0, 0, 0], rx: 0.064, ry: 0.064 },
        { pos: [0.15, -0.22, sideSign * 0.08], rx: 0.058, ry: 0.058 },
      ],
      6,
      true,
      true
    );
    gUArmIvory.addTubeAlongSpine(
      [
        { pos: [0.04, -0.06, sideSign * 0.02], rx: 0.072, ry: 0.072 },
        { pos: [0.14, -0.21, sideSign * 0.075], rx: 0.105, ry: 0.095 },
      ],
      6,
      true,
      true
    );
    gUArmGold.addTubeAlongSpine(
      [
        { pos: [0.13, -0.19, sideSign * 0.07], rx: 0.112, ry: 0.102 },
        { pos: [0.155, -0.225, sideSign * 0.082], rx: 0.116, ry: 0.106 },
      ],
      6,
      true,
      true
    );

    const uArmMesh = scene.addMesh(`UpperArm_${sideTag}_Mesh`, [gUArmDark, gUArmIvory, gUArmGold]);
    const uArmIdx = scene.addNode({
      name: `UpperArm_${sideTag}`,
      meshIndex: uArmMesh,
      translation: [0.02, 0.42, sideSign * 0.30],
      parentIndex: torsoIdx,
    });

    // Forearm + Golden Channeling Focus Bracer + Splayed Conductor Fingers
    const gFArmIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
    const gFArmGold = new PrimitiveGeom(mats.Mat_GoldBright);
    const gFArmCore = new PrimitiveGeom(mats.Mat_StormCore);

    gFArmIvory.addTubeAlongSpine(
      [
        { pos: [0, 0, 0], rx: 0.062, ry: 0.062 },
        { pos: [0.24, 0.06, -sideSign * 0.02], rx: 0.068, ry: 0.062 },
      ],
      6,
      true,
      true
    );
    // Ornate golden channeling wrist-focus ring & open upturned palm cradle
    gFArmGold.addChamferBox({
      center: [0.22, 0.06, -sideSign * 0.02],
      size: [0.16, 0.11, 0.14],
      rotDeg: [0, 0, 14],
      topScale: [0.90, 0.90],
    });
    // Three splayed golden conductor prongs cradling the bright storm orb!
    for (const [py, pz] of [
      [-0.045, 0.0],
      [0.035, 0.065],
      [0.035, -0.065],
    ]) {
      gFArmGold.addTubeAlongSpine(
        [
          { pos: [0.27, 0.07 + py * 0.5, -sideSign * 0.02 + pz * 0.6], rx: 0.022, ry: 0.020 },
          { pos: [0.39, 0.09 + py * 1.3, -sideSign * 0.025 + pz * 1.4], rx: 0.014, ry: 0.014 },
        ],
        4,
        true,
        true
      );
    }
    // Incandescent palm emitter lens
    gFArmCore.addFacetedCrystal({
      center: [0.30, 0.08, -sideSign * 0.022],
      radii: [0.055, 0.055, 0.055],
      sectors: 6,
      stacks: 3,
    });

    const fArmMesh = scene.addMesh(`Forearm_${sideTag}_Mesh`, [gFArmIvory, gFArmGold, gFArmCore]);
    const fArmIdx = scene.addNode({
      name: `Forearm_${sideTag}`,
      meshIndex: fArmMesh,
      translation: [0.15, -0.22, sideSign * 0.08],
      parentIndex: uArmIdx,
    });

    // Independent Surf_GLOW_* emitter ring right on each channeling hand!
    addIndependentAccentNode(
      scene,
      `Surf_GLOW_Hand${sideTag === 'R' ? 'Right' : 'Left'}`,
      fArmIdx,
      mats.Surf_GLOW,
      (g) => {
        g.addFacetedCrystal({
          center: [0.26, 0.13, -sideSign * 0.02],
          radii: [0.075, 0.048, 0.075],
          sectors: 6,
          stacks: 3,
        });
      }
    );

    // Animated Bright Channeling Storm Orb floating in each open hand!
    const orbIdx = scene.addNode({
      name: `ChannelOrb_${sideTag}`,
      meshIndex: sharedOrbMesh,
      translation: [0.39, 0.11, -sideSign * 0.03],
      parentIndex: fArmIdx,
    });

    armNodes[sideTag] = { uArmIdx, fArmIdx, orbIdx };
  }

  // Clear 'Muzzle' anchor at forward +X tip of Right Channeling Hand (+X_fwd = (1,0,0)!)
  scene.addNode({
    name: 'Muzzle',
    translation: [0.58, 0.11, -0.03],
    parentIndex: armNodes.R.fArmIdx,
  });

  // -------------------------------------------------------------------------
  // 7. Storm Scribe Baked Animations: 'idle', 'walk', 'attack', 'cast', 'death'
  // -------------------------------------------------------------------------

  // 7A. 'idle' (2.40s seamless poised arch-caster hover, robe sway & pulsing bright hands!)
  const idleT = [0.0, 0.6, 1.2, 1.8, 2.4];
  scene.addAnimation('idle', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: idleT,
      values: [
        [0, 1.02, 0],
        [0, 1.042, 0],
        [0, 1.02, 0],
        [0, 1.008, 0],
        [0, 1.02, 0],
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -4.0, -1.5),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 4.0, 1.2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 5.5, 1.5),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -5.5, -1.0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: robeNodes.R,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-4.5, 0, -2.0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-1.5, 0, 1.5),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: robeNodes.L,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(4.5, 0, -2.0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(1.5, 0, 1.5),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armNodes.R.uArmIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(4, -3, 6),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-3, 3, -4),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armNodes.L.uArmIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-3, -3, -4),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(4, 3, 6),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armNodes.R.orbIdx,
      path: 'scale',
      times: idleT,
      values: [
        [1.0, 1.0, 1.0],
        [1.18, 1.18, 1.18],
        [1.0, 1.0, 1.0],
        [0.90, 0.90, 0.90],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: armNodes.L.orbIdx,
      path: 'scale',
      times: idleT,
      values: [
        [1.0, 1.0, 1.0],
        [0.90, 0.90, 0.90],
        [1.0, 1.0, 1.0],
        [1.18, 1.18, 1.18],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: armNodes.R.orbIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(28, 42, 16),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-28, -42, -16),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armNodes.L.orbIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-28, 42, -16),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(28, -42, 16),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
  ]);

  // 7B. 'walk' (1.04s seamless majestic cantor stride & split-robe parting, min.y >= 0.0!)
  const walkT = [0.0, 0.26, 0.52, 0.78, 1.04];
  scene.addAnimation('walk', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: walkT,
      values: [
        [0, 1.02, 0],
        [0, 1.06, -0.015],
        [0, 1.02, 0],
        [0, 1.06, 0.015],
        [0, 1.02, 0],
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, -4),
        quatFromEulerXYZ(0, 6, -5),
        quatFromEulerXYZ(0, 0, -4),
        quatFromEulerXYZ(0, -6, -5),
        quatFromEulerXYZ(0, 0, -4),
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 3),
        quatFromEulerXYZ(0, -5, 4),
        quatFromEulerXYZ(0, 0, 3),
        quatFromEulerXYZ(0, 5, 4),
        quatFromEulerXYZ(0, 0, 3),
      ],
    },
    {
      nodeIndex: legNodes.R.thighIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 24),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -18),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: legNodes.R.shinIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -14),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -22),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: legNodes.L.thighIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -18),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 24),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: legNodes.L.shinIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -22),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -14),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    // Split robe halves billow outward & swing dynamically with each stride!
    {
      nodeIndex: robeNodes.R,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(-3, 0, -2),
        quatFromEulerXYZ(-8, 0, 14),
        quatFromEulerXYZ(-3, 0, -2),
        quatFromEulerXYZ(-5, 0, -10),
        quatFromEulerXYZ(-3, 0, -2),
      ],
    },
    {
      nodeIndex: robeNodes.L,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(3, 0, -2),
        quatFromEulerXYZ(5, 0, -10),
        quatFromEulerXYZ(3, 0, -2),
        quatFromEulerXYZ(8, 0, 14),
        quatFromEulerXYZ(3, 0, -2),
      ],
    },
    {
      nodeIndex: armNodes.R.uArmIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 4),
        quatFromEulerXYZ(0, -6, -6),
        quatFromEulerXYZ(0, 0, 4),
        quatFromEulerXYZ(0, 6, 12),
        quatFromEulerXYZ(0, 0, 4),
      ],
    },
    {
      nodeIndex: armNodes.L.uArmIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 4),
        quatFromEulerXYZ(0, 6, 12),
        quatFromEulerXYZ(0, 0, 4),
        quatFromEulerXYZ(0, -6, -6),
        quatFromEulerXYZ(0, 0, 4),
      ],
    },
  ]);

  // 7C. 'attack' (0.86s crisp Psionic Bolt strike from Right Channeling Hand / Muzzle!)
  const atkT = [0.0, 0.16, 0.30, 0.58, 0.86];
  scene.addAnimation('attack', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: atkT,
      values: [
        [0, 1.02, 0],
        [-0.03, 1.03, 0],
        [0.05, 1.01, 0],
        [0.01, 1.02, 0],
        [0, 1.02, 0],
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -16, 4),
        quatFromEulerXYZ(0, 18, -6),
        quatFromEulerXYZ(0, 5, -2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armNodes.R.uArmIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(10, -12, -10),
        quatFromEulerXYZ(-6, 16, 28),
        quatFromEulerXYZ(0, 5, 10),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armNodes.R.fArmIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -8, 12),
        quatFromEulerXYZ(0, 10, -10),
        quatFromEulerXYZ(0, 3, -3),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armNodes.R.orbIdx,
      path: 'scale',
      times: atkT,
      values: [
        [1.0, 1.0, 1.0],
        [1.32, 1.32, 1.32],
        [1.55, 1.55, 1.55],
        [0.85, 0.85, 0.85],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: armNodes.L.uArmIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-8, 10, 14),
        quatFromEulerXYZ(10, -14, -18),
        quatFromEulerXYZ(4, -5, -6),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
  ]);

  // 7D. 'cast' (1.36s High Templar Psionic Storm Invocation toward CastOrigin!)
  //     Scribe levitates upward, split robe flares dramatically, and BOTH bright
  //     channeling hands surge high and converge toward CastOrigin!
  const castT = [0.0, 0.32, 0.72, 1.06, 1.36];
  scene.addAnimation('cast', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: castT,
      values: [
        [0, 1.02, 0],
        [-0.02, 1.08, 0],
        [0.04, 1.15, 0],
        [0.02, 1.06, 0],
        [0, 1.02, 0],
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: castT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 7),
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(0, 0, -3),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: castT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 12),
        quatFromEulerXYZ(0, 0, -6),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    // Split robe flares wide in psionic updraft!
    {
      nodeIndex: robeNodes.R,
      path: 'rotation',
      times: castT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-14, 0, -6),
        quatFromEulerXYZ(-24, 0, -12),
        quatFromEulerXYZ(-10, 0, -4),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: robeNodes.L,
      path: 'rotation',
      times: castT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(14, 0, -6),
        quatFromEulerXYZ(24, 0, -12),
        quatFromEulerXYZ(10, 0, -4),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    // Both bright channeling hands sweep skyward & inward toward CastOrigin!
    {
      nodeIndex: armNodes.R.uArmIdx,
      path: 'rotation',
      times: castT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(16, -8, 32),
        quatFromEulerXYZ(-10, 18, 56),
        quatFromEulerXYZ(-4, 8, 22),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armNodes.L.uArmIdx,
      path: 'rotation',
      times: castT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-16, 8, 32),
        quatFromEulerXYZ(10, -18, 56),
        quatFromEulerXYZ(4, -8, 22),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armNodes.R.orbIdx,
      path: 'scale',
      times: castT,
      values: [
        [1.0, 1.0, 1.0],
        [1.38, 1.38, 1.38],
        [1.72, 1.72, 1.72],
        [1.24, 1.24, 1.24],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: armNodes.L.orbIdx,
      path: 'scale',
      times: castT,
      values: [
        [1.0, 1.0, 1.0],
        [1.38, 1.38, 1.38],
        [1.72, 1.72, 1.72],
        [1.24, 1.24, 1.24],
        [1.0, 1.0, 1.0],
      ],
    },
  ]);

  // 7E. 'death' (1.30s psionic overload & kneeling vestment collapse onto Y >= 0.0!)
  //     Split robe flares outward horizontally while legs fold cleanly so nothing clips below Y = 0!
  const deathT = [0.0, 0.26, 0.65, 1.02, 1.30];
  scene.addAnimation('death', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: deathT,
      values: [
        [0, 1.02, 0],
        [-0.04, 0.98, 0.02],
        [-0.10, 0.64, 0.04],
        [-0.15, 0.44, 0.05],
        [-0.15, 0.44, 0.05],
      ],
    },
    {
      nodeIndex: pelvisIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(3, -6, 6),
        quatFromEulerXYZ(6, -12, 14),
        quatFromEulerXYZ(8, -15, 18),
        quatFromEulerXYZ(8, -15, 18),
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 8, 12),
        quatFromEulerXYZ(6, -8, -20),
        quatFromEulerXYZ(10, -12, -38),
        quatFromEulerXYZ(10, -12, -38),
      ],
    },
    // Split robe drapes wide along the floor without dipping below Y = 0!
    {
      nodeIndex: robeNodes.R,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-14, 0, 8),
        quatFromEulerXYZ(-48, 0, 18),
        quatFromEulerXYZ(-68, 0, 22),
        quatFromEulerXYZ(-68, 0, 22),
      ],
    },
    {
      nodeIndex: robeNodes.L,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(14, 0, 8),
        quatFromEulerXYZ(48, 0, 18),
        quatFromEulerXYZ(68, 0, 22),
        quatFromEulerXYZ(68, 0, 22),
      ],
    },
    {
      nodeIndex: legNodes.R.thighIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 14),
        quatFromEulerXYZ(-8, 0, 48),
        quatFromEulerXYZ(-12, 0, 66),
        quatFromEulerXYZ(-12, 0, 66),
      ],
    },
    {
      nodeIndex: legNodes.R.shinIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -24),
        quatFromEulerXYZ(0, 0, -64),
        quatFromEulerXYZ(0, 0, -84),
        quatFromEulerXYZ(0, 0, -84),
      ],
    },
    {
      nodeIndex: legNodes.L.thighIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 10),
        quatFromEulerXYZ(8, 0, 44),
        quatFromEulerXYZ(12, 0, 62),
        quatFromEulerXYZ(12, 0, 62),
      ],
    },
    {
      nodeIndex: legNodes.L.shinIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -20),
        quatFromEulerXYZ(0, 0, -60),
        quatFromEulerXYZ(0, 0, -80),
        quatFromEulerXYZ(0, 0, -80),
      ],
    },
    {
      nodeIndex: armNodes.R.uArmIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(14, 0, 22),
        quatFromEulerXYZ(26, -12, 10),
        quatFromEulerXYZ(34, -16, -6),
        quatFromEulerXYZ(34, -16, -6),
      ],
    },
    {
      nodeIndex: armNodes.L.uArmIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-14, 0, 22),
        quatFromEulerXYZ(-26, 12, 10),
        quatFromEulerXYZ(-34, 16, -6),
        quatFromEulerXYZ(-34, 16, -6),
      ],
    },
    {
      nodeIndex: armNodes.R.orbIdx,
      path: 'scale',
      times: deathT,
      values: [
        [1.0, 1.0, 1.0],
        [1.35, 1.35, 1.35],
        [0.32, 0.32, 0.32],
        [0.08, 0.08, 0.08],
        [0.08, 0.08, 0.08],
      ],
    },
    {
      nodeIndex: armNodes.L.orbIdx,
      path: 'scale',
      times: deathT,
      values: [
        [1.0, 1.0, 1.0],
        [1.35, 1.35, 1.35],
        [0.32, 0.32, 0.32],
        [0.08, 0.08, 0.08],
        [0.08, 0.08, 0.08],
      ],
    },
  ]);

  return scene.buildGLB('StormScribeScene');
}

// ---------------------------------------------------------------------------
// Asset 2: canticle_archive.glb
// Aurelian Concord Canticle Archive (Templar Archives gameplay role, 3x3 structure)
//   - Exact 6.50u wide x 6.50u deep footprint, floor at Y = 0.0000, height ~4.88u
//   - Stepped, crisply faceted gold-and-ivory octagonal plinth with +X grand
//     ceremonial dais, flanking reliquary shoulders, and sunken resonance crucible
//   - Constellation of levitating "Suspended Archive Facets": split central
//     Canticle Codex monolith with Storm Scribe kinship tuning-crest, 4 tilted
//     inscribed polyhedral archive slabs, and 4 orbiting golden memory prisms
//   - Seamless looping 'idle' animation
// ---------------------------------------------------------------------------

function buildSuspendedTabletGeometry(mats, gIvory, gGold, gArc, gCore) {
  // Crisp beveled hexagonal/rhomboid archive codex tablet (local +X faces inward toward center)
  const poly2D = [
    [0.00, -0.72],
    [0.44, -0.34],
    [0.48, 0.30],
    [0.00, 0.74],
    [-0.48, 0.30],
    [-0.44, -0.34],
  ];

  // Sculpted ivory main archive slab
  gIvory.addOrientedShield([0, 0, 0], [1, 0, 0], [0, 1, 0], poly2D, 0.16, 0.82, 0.14);

  // Gleaming golden perimeter frame & upper/lower canticle finials
  const framePts = poly2D.map(([px, py]) => [0.02, py * 1.06, -px * 1.06]);
  for (let i = 0; i < framePts.length; i++) {
    const a = framePts[i];
    const b = framePts[(i + 1) % framePts.length];
    gGold.addTubeAlongSpine(
      [
        { pos: a, rx: 0.055, ry: 0.055 },
        { pos: b, rx: 0.055, ry: 0.055 },
      ],
      4,
      true,
      true
    );
  }
  // Upper & lower golden crown finials on each suspended archive facet
  gGold.addFacetedCrystal({
    center: [0.02, 0.84, 0],
    radii: [0.09, 0.16, 0.12],
    sectors: 4,
    stacks: 3,
  });
  gGold.addFacetedCrystal({
    center: [0.02, -0.82, 0],
    radii: [0.08, 0.14, 0.10],
    sectors: 4,
    stacks: 3,
  });

  // Luminous psionic canticle script bars on BOTH inner (+X) and outer (-X) faces
  // so every suspended facet gleams from RTS zoom regardless of quadrant!
  for (const faceSign of [1, -1]) {
    const xFace = faceSign > 0 ? 0.165 : -0.145;
    for (const yBar of [-0.24, 0.02, 0.28]) {
      gArc.addChamferBox({
        center: [xFace, yBar, 0],
        size: [0.04, 0.075, 0.54 - Math.abs(yBar) * 0.45],
      });
    }
    gCore.addFacetedCrystal({
      center: [xFace + faceSign * 0.015, 0.02, 0],
      radii: [0.045, 0.18, 0.14],
      sectors: 6,
      stacks: 3,
    });
  }
}

function buildCanticleArchiveGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createConcordCanticleMaterials(scene);

  const rootIdx = scene.addNode({ name: 'CanticleArchive', translation: [0, 0, 0] });

  // -------------------------------------------------------------------------
  // 1. Static Grounded Faceted Gold-and-Ivory Plinth ('ArchivePlinth')
  //    Exact footprint: X in [-3.2500, +3.2500], Z in [-3.2500, +3.2500] (6.50 x 6.50),
  //    exact floor contact at Y = 0.0000!
  // -------------------------------------------------------------------------
  const gPlDark = new PrimitiveGeom(mats.Mat_StoneDark);
  const gPlIvory = new PrimitiveGeom(mats.Mat_Ivory);
  const gPlIvoryLt = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gPlGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gPlGoldDeep = new PrimitiveGeom(mats.Mat_Gold);
  const gPlBronze = new PrimitiveGeom(mats.Mat_Bronze);
  const gPlArc = new PrimitiveGeom(mats.Mat_StormArc);
  const gPlCore = new PrimitiveGeom(mats.Mat_StormCore);
  const gPlField = new PrimitiveGeom(mats.Mat_StormField);

  // Tier 1A: Grounded 8-sided chamfered dark-slate foundation skirt (6.5000 x 6.5000 exact!)
  gPlDark.addLoft(
    [
      makeRectChamferRing(3.2500, 3.2500, 1.04, 0.0000),
      makeRectChamferRing(3.2100, 3.2100, 1.02, 0.1600),
    ],
    [[0, 0.0000, 0], [0, 0.1600, 0]],
    true,
    true
  );

  // Tier 1B: Broad Faceted Ivory-and-Gold Lower Plinth (Y = 0.16 .. 0.64)
  gPlIvory.addLoft(
    [
      makeRectChamferRing(3.1800, 3.1800, 1.00, 0.1600),
      makeRectChamferRing(2.8600, 2.8600, 0.90, 0.6400),
    ],
    [[0, 0.1600, 0], [0, 0.6400, 0]],
    false,
    true
  );

  // Golden perimeter cornice around Tier 1 top (Y = 0.60 .. 0.70)
  gPlGoldDeep.addLoft(
    [
      makeRectChamferRing(2.9200, 2.9200, 0.92, 0.5900),
      makeRectChamferRing(2.8200, 2.8200, 0.88, 0.7000),
    ],
    [[0, 0.5900, 0], [0, 0.7000, 0]],
    true,
    true
  );

  // 8 Bold Radial Facet Ribs in Gleaming Gold accentuating the octagonal bevels!
  const ribRingBot = makeRectChamferRing(3.20, 3.20, 1.01, 0.14);
  const ribRingTop = makeRectChamferRing(2.08, 2.08, 0.66, 1.50);
  for (let i = 0; i < 8; i++) {
    const bPt = ribRingBot[i];
    const mPt = [bPt[0] * 0.87, 0.70, bPt[2] * 0.87];
    const tPt = ribRingTop[i];
    gPlGold.addTubeAlongSpine(
      [
        { pos: bPt, rx: 0.11, ry: 0.09 },
        { pos: mPt, rx: 0.12, ry: 0.10 },
        { pos: tPt, rx: 0.10, ry: 0.09 },
      ],
      4,
      true,
      true
    );
  }

  // Tier 2: Stepped Faceted Ivory-and-Gold Reliquary Podium (Y = 0.68 .. 1.50)
  gPlIvoryLt.addLoft(
    [
      makeRectChamferRing(2.58, 2.58, 0.84, 0.68),
      makeRectChamferRing(2.12, 2.12, 0.70, 1.46),
    ],
    [[0, 0.68, 0], [0, 1.46, 0]],
    false,
    true
  );

  // Gleaming Gold Upper Sanctuary Rim (Y = 1.42 .. 1.56)
  gPlGold.addLoft(
    [
      makeRectChamferRing(2.18, 2.18, 0.72, 1.42),
      makeRectChamferRing(2.04, 2.04, 0.68, 1.56),
    ],
    [[0, 1.42, 0], [0, 1.56, 0]],
    true,
    true
  );

  // +X Forward Grand Ceremonial Archive Threshold & Stepped Dais (X = 1.95 .. 3.24, within 3.25!)
  for (let st = 0; st < 3; st++) {
    const y0 = st * 0.24;
    const y1 = y0 + 0.26;
    const xOuter = 3.23 - st * 0.34;
    const xInner = 2.05;
    const hzStep = 0.96 - st * 0.10;
    gPlIvoryLt.addChamferBox({
      center: [(xOuter + xInner) * 0.5, (y0 + y1) * 0.5, 0],
      size: [xOuter - xInner, y1 - y0, hzStep * 2],
      minYClamp: 0.0,
      topScale: [0.97, 0.96],
    });
    gPlGold.addChamferBox({
      center: [xOuter - 0.04, y1 - 0.03, 0],
      size: [0.10, 0.07, hzStep * 1.92],
    });
  }
  // Glowing cyan psionic welcome sigil inlaid on the +X ceremonial stair landing!
  gPlArc.addChamferBox({
    center: [2.36, 0.80, 0],
    size: [0.46, 0.06, 1.04],
    topScale: [0.90, 0.92],
  });
  for (const side of [-1, 1]) {
    // Golden stair cheek-balustrades framing the +X entrance
    gPlGold.addLoft(
      [
        makeRectChamferRing(0.56, 0.14, 0.04, 0.12, 2.66, side * 1.06),
        makeRectChamferRing(0.46, 0.11, 0.03, 1.02, 2.48, side * 1.06),
      ],
      [[2.66, 0.12, side * 1.06], [2.48, 1.02, side * 1.06]],
      true,
      true
    );
  }

  // Flanking Vaulted Gold-and-Ivory Reliquary Shoulders (±Z) & Rear Sanctum Buttress (-X)
  // Low, sculpted, faceted library alcoves (Y = 1.44 .. 2.52) that frame — without blocking! —
  // the open central resonance well and the levitating Suspended Archive Facets!
  for (const side of [-1, 1]) {
    gPlIvoryLt.addChamferBox({
      center: [-0.14, 1.94, side * 2.02],
      size: [2.10, 0.98, 0.68],
      rotDeg: [-side * 12, 0, 0],
      topScale: [0.80, 0.72],
    });
    gPlGold.addChamferBox({
      center: [-0.14, 2.45, side * 1.96],
      size: [1.72, 0.14, 0.54],
      rotDeg: [-side * 12, 0, 0],
      topScale: [0.88, 0.86],
    });
    // Glowing vertical canticle scroll-slots carved into each reliquary wall!
    for (const xSlot of [-0.66, -0.14, 0.38]) {
      gPlArc.addChamferBox({
        center: [xSlot, 1.96, side * 1.72],
        size: [0.16, 0.62, 0.16],
        rotDeg: [-side * 12, 0, 0],
      });
    }
  }

  // Rear (-X) Grand Archive Reliquary Crest Buttress (Y = 1.44 .. 2.78)
  gPlIvoryLt.addChamferBox({
    center: [-2.06, 2.06, 0],
    size: [0.72, 1.24, 2.24],
    rotDeg: [0, 0, -12],
    topScale: [0.74, 0.78],
  });
  gPlGold.addChamferBox({
    center: [-1.98, 2.70, 0],
    size: [0.56, 0.16, 1.82],
    rotDeg: [0, 0, -12],
  });
  for (const zSlot of [-0.56, 0.0, 0.56]) {
    gPlArc.addChamferBox({
      center: [-1.74, 2.06, zSlot],
      size: [0.16, 0.72, 0.18],
      rotDeg: [0, 0, -12],
    });
  }

  // Central Sunken Psionic Resonance Crucible on top of the Plinth (Y = 1.54 .. 1.68)
  gPlDark.addLoft(
    [
      makeRegularPolygonRing(1.56, 1.56, 8, 1.52, Math.PI / 8),
      makeRegularPolygonRing(1.48, 1.48, 8, 1.60, Math.PI / 8),
    ],
    [[0, 1.52, 0], [0, 1.60, 0]],
    false,
    true
  );
  gPlBronze.addConcentricArcStrip({
    rInner: 1.44,
    rOuter: 1.64,
    yBot: 1.52,
    yTop: 1.68,
    thStart: 0,
    thEnd: Math.PI * 2,
    steps: 16,
    bevelIn: 0.03,
  });
  // Luminous concentric psionic archive rings & central floor lens inside the crucible
  for (let k = 0; k < 4; k++) {
    const base = (Math.PI * 0.5) * k;
    gPlArc.addConcentricArcStrip({
      rInner: 1.06,
      rOuter: 1.30,
      yBot: 1.58,
      yTop: 1.65,
      thStart: base + 0.12,
      thEnd: base + 1.32,
      steps: 5,
      bevelIn: 0.02,
    });
  }
  gPlCore.addLoft(
    [
      makeRegularPolygonRing(0.76, 0.76, 8, 1.58, Math.PI / 8),
      makeRegularPolygonRing(0.58, 0.58, 8, 1.68, Math.PI / 8),
    ],
    [[0, 1.58, 0], [0, 1.68, 0]],
    false,
    true
  );
  // Upward translucent psionic projection column rising from well to suspended codex
  gPlField.addLoft(
    [
      makeRegularPolygonRing(0.68, 0.68, 6, 1.64, 0),
      makeRegularPolygonRing(0.42, 0.42, 6, 2.38, Math.PI / 6),
    ],
    [[0, 1.64, 0], [0, 2.38, 0]],
    false,
    false
  );

  const plinthMesh = scene.addMesh('ArchivePlinth_Mesh', [
    gPlDark,
    gPlIvory,
    gPlIvoryLt,
    gPlGold,
    gPlGoldDeep,
    gPlBronze,
    gPlArc,
    gPlCore,
    gPlField,
  ]);
  const plinthIdx = scene.addNode({
    name: 'ArchivePlinth',
    meshIndex: plinthMesh,
    translation: [0, 0, 0],
    parentIndex: rootIdx,
  });

  // Independent Surf_TEAM_* & Surf_GLOW_* Meshes on the Faceted Plinth!
  const diagConfigs = [
    ['NE', 1, -1],
    ['SE', 1, 1],
    ['NW', -1, -1],
    ['SW', -1, 1],
  ];
  for (const [tag, sx, sz] of diagConfigs) {
    addIndependentAccentNode(
      scene,
      `Surf_TEAM_Plinth${tag}`,
      plinthIdx,
      mats.Surf_TEAM,
      (g) => {
        const poly = [
          [-0.58, -0.34],
          [0.58, -0.34],
          [0.48, 0.34],
          [-0.48, 0.34],
        ];
        g.addOrientedShield(
          [sx * 1.82, 1.08, sz * 1.82],
          vNorm([sx * 0.62, 0.52, sz * 0.62]),
          [0, 1, 0],
          poly,
          0.07,
          0.86,
          0.02
        );
      }
    );
  }

  for (const [dName, sz] of [
    ['Surf_TEAM_DaisRight', 1],
    ['Surf_TEAM_DaisLeft', -1],
  ]) {
    addIndependentAccentNode(scene, dName, plinthIdx, mats.Surf_TEAM, (g) => {
      g.addChamferBox({
        center: [2.56, 1.06, sz * 1.06],
        size: [0.76, 0.10, 0.22],
        rotDeg: [0, 0, -10],
        topScale: [0.88, 0.88],
      });
    });
  }

  for (const [gName, pos, rad] of [
    ['Surf_GLOW_ReliquaryR', [-0.14, 2.54, 1.94], [0.48, 0.08, 0.12]],
    ['Surf_GLOW_ReliquaryL', [-0.14, 2.54, -1.94], [0.48, 0.08, 0.12]],
    ['Surf_GLOW_ReliquaryRear', [-1.96, 2.82, 0.0], [0.12, 0.09, 0.58]],
    ['Surf_GLOW_WellFront', [1.18, 1.66, 0.0], [0.14, 0.08, 0.36]],
    ['Surf_GLOW_WellRear', [-1.18, 1.66, 0.0], [0.14, 0.08, 0.36]],
  ]) {
    addIndependentAccentNode(scene, gName, plinthIdx, mats.Surf_GLOW, (g) => {
      g.addFacetedCrystal({
        center: pos,
        radii: rad,
        sectors: 6,
        stacks: 3,
      });
    });
  }

  // -------------------------------------------------------------------------
  // 2. Suspended Archive Facets (Levitating Above the Plinth, Y = 2.15 .. 4.88!)
  // -------------------------------------------------------------------------

  // 2A. Central Split Canticle Codex — Lower Faceted Vessel ('CentralCodexLower' at [0, 2.68, 0])
  const gCodBotIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gCodBotGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gCodBotArc = new PrimitiveGeom(mats.Mat_StormArc);

  gCodBotIvory.addLoft(
    [
      makeRegularPolygonRing(0.16, 0.16, 6, -0.52),
      makeRegularPolygonRing(0.68, 0.68, 6, 0.12),
      makeRegularPolygonRing(0.58, 0.58, 6, 0.44),
    ],
    [[0, -0.52, 0], [0, 0.12, 0], [0, 0.44, 0]],
    true,
    true
  );
  gCodBotGold.addLoft(
    [
      makeRegularPolygonRing(0.72, 0.72, 6, 0.06),
      makeRegularPolygonRing(0.64, 0.64, 6, 0.22),
    ],
    [[0, 0.06, 0], [0, 0.22, 0]],
    true,
    true
  );
  for (let s = 0; s < 6; s++) {
    const th = (Math.PI * s) / 3;
    gCodBotArc.addFacetedCrystal({
      center: [Math.cos(th) * 0.56, -0.06, Math.sin(th) * 0.56],
      radii: [0.07, 0.22, 0.07],
      sectors: 4,
      stacks: 3,
    });
  }
  const codexLowerMesh = scene.addMesh('CentralCodexLower_Mesh', [
    gCodBotIvory,
    gCodBotGold,
    gCodBotArc,
  ]);
  const codexLowerIdx = scene.addNode({
    name: 'CentralCodexLower',
    meshIndex: codexLowerMesh,
    translation: [0, 2.68, 0],
    parentIndex: rootIdx,
  });

  // 2B. Central Incandescent Psionic Archive Core ('CentralCodexCore' at [0, 3.44, 0])
  const gCoreHeart = new PrimitiveGeom(mats.Mat_StormCore);
  const gCoreShell = new PrimitiveGeom(mats.Mat_StormField);
  gCoreHeart.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [0.34, 0.38, 0.34],
    sectors: 6,
    stacks: 4,
  });
  gCoreShell.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [0.56, 0.48, 0.56],
    sectors: 6,
    stacks: 4,
    phaseRad: Math.PI / 6,
  });
  const codexCoreMesh = scene.addMesh('CentralCodexCore_Mesh', [gCoreHeart, gCoreShell]);
  const codexCoreIdx = scene.addNode({
    name: 'CentralCodexCore',
    meshIndex: codexCoreMesh,
    translation: [0, 3.44, 0],
    parentIndex: rootIdx,
  });
  addIndependentAccentNode(scene, 'Surf_GLOW_ArchiveCore', codexCoreIdx, mats.Surf_GLOW, (g) => {
    g.addFacetedCrystal({
      center: [0, 0, 0],
      radii: [0.42, 0.20, 0.42],
      sectors: 6,
      stacks: 3,
    });
  });

  // 2C. Central Split Canticle Codex — Upper Crown Spire ('CentralCodexUpper' at [0, 4.16, 0])
  //     Crowned with twin upright golden tuning-crest tines (kinship with Storm Scribe!)
  //     Reaches exact local Y = +0.72 -> world Y = 4.88!
  const gCodTopIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gCodTopGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gCodTopCore = new PrimitiveGeom(mats.Mat_StormCore);

  gCodTopIvory.addLoft(
    [
      makeRegularPolygonRing(0.58, 0.58, 6, -0.38),
      makeRegularPolygonRing(0.66, 0.66, 6, -0.06),
      makeRegularPolygonRing(0.22, 0.22, 6, 0.56),
    ],
    [[0, -0.38, 0], [0, -0.06, 0], [0, 0.56, 0]],
    true,
    true
  );
  gCodTopGold.addLoft(
    [
      makeRegularPolygonRing(0.68, 0.68, 6, -0.14),
      makeRegularPolygonRing(0.60, 0.60, 6, 0.02),
    ],
    [[0, -0.14, 0], [0, 0.02, 0]],
    true,
    true
  );
  // Twin Upright Golden Tuning-Crest Tines crowning the Archive Spire!
  for (const side of [-1, 1]) {
    gCodTopGold.addTubeAlongSpine(
      [
        { pos: [0, 0.16, side * 0.34], rx: 0.075, ry: 0.06 },
        { pos: [0, 0.46, side * 0.46], rx: 0.068, ry: 0.055 },
        { pos: [0, 0.72, side * 0.36], rx: 0.042, ry: 0.036 },
      ],
      5,
      true,
      true
    );
  }
  gCodTopCore.addFacetedCrystal({
    center: [0, 0.56, 0],
    radii: [0.12, 0.20, 0.12],
    sectors: 6,
    stacks: 4,
  });

  const codexUpperMesh = scene.addMesh('CentralCodexUpper_Mesh', [
    gCodTopIvory,
    gCodTopGold,
    gCodTopCore,
  ]);
  const codexUpperIdx = scene.addNode({
    name: 'CentralCodexUpper',
    meshIndex: codexUpperMesh,
    translation: [0, 4.16, 0],
    parentIndex: rootIdx,
  });

  for (const [cName, side] of [
    ['Surf_TEAM_CrownFinR', 1],
    ['Surf_TEAM_CrownFinL', -1],
  ]) {
    addIndependentAccentNode(scene, cName, codexUpperIdx, mats.Surf_TEAM, (g) => {
      g.addChamferBox({
        center: [0, 0.24, side * 0.44],
        size: [0.28, 0.34, 0.10],
        rotDeg: [-side * 12, 0, 0],
        topScale: [0.80, 0.85],
      });
    });
  }

  // 2D. Four Major Suspended Polyhedral Archive Facet Slabs!
  //     Hovering in 4 diagonal quadrants around the central codex, canted so both
  //     inner & outer faceted faces read unmistakably at -56 deg RTS zoom!
  const gTabIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gTabGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gTabArc = new PrimitiveGeom(mats.Mat_StormArc);
  const gTabCore = new PrimitiveGeom(mats.Mat_StormCore);
  buildSuspendedTabletGeometry(mats, gTabIvory, gTabGold, gTabArc, gTabCore);
  const sharedTabletMesh = scene.addMesh('SuspendedArchiveFacet_Mesh', [
    gTabIvory,
    gTabGold,
    gTabArc,
    gTabCore,
  ]);

  const suspendedFacetSpecs = [
    { tag: 'NE', pos: [1.14, 3.06, -1.14], ry: -135, phase: 0.0 },
    { tag: 'SE', pos: [1.14, 3.06, 1.14], ry: 135, phase: Math.PI * 0.5 },
    { tag: 'SW', pos: [-1.14, 3.22, 1.14], ry: 45, phase: Math.PI },
    { tag: 'NW', pos: [-1.14, 3.22, -1.14], ry: -45, phase: Math.PI * 1.5 },
  ];

  const suspendedFacetNodes = [];
  for (const sp of suspendedFacetSpecs) {
    const baseRot = quatFromEulerXYZ(0, sp.ry, -16);
    const fIdx = scene.addNode({
      name: `SuspendedFacet_${sp.tag}`,
      meshIndex: sharedTabletMesh,
      translation: sp.pos,
      rotation: baseRot,
      parentIndex: rootIdx,
    });
    suspendedFacetNodes.push({ nodeIndex: fIdx, spec: sp });

    // Independent Surf_TEAM_* crest & Surf_GLOW_* focus crystal on each suspended facet!
    addIndependentAccentNode(
      scene,
      `Surf_TEAM_FacetCrest_${sp.tag}`,
      fIdx,
      mats.Surf_TEAM,
      (g) => {
        g.addChamferBox({
          center: [-0.15, 0.42, 0],
          size: [0.06, 0.28, 0.36],
          topScale: [0.88, 0.80],
        });
      }
    );
    addIndependentAccentNode(
      scene,
      `Surf_GLOW_FacetGem_${sp.tag}`,
      fIdx,
      mats.Surf_GLOW,
      (g) => {
        g.addFacetedCrystal({
          center: [0.02, 0.94, 0],
          radii: [0.065, 0.11, 0.085],
          sectors: 6,
          stacks: 3,
        });
      }
    );
  }

  // 2E. Levitating Golden Harmonic Ring & 4 Cardinal Suspended Memory Prisms
  //     ('HarmonicFacetRing' at [0, 2.66, 0])
  const gRingGold = new PrimitiveGeom(mats.Mat_GoldBright);
  const gRingIvory = new PrimitiveGeom(mats.Mat_IvoryLight);
  const gRingArc = new PrimitiveGeom(mats.Mat_StormArc);

  for (let k = 0; k < 4; k++) {
    const thMid = (Math.PI * 0.5) * k;
    // Open golden psionic astrolabe arc spanning between diagonal facets
    gRingGold.addConcentricArcStrip({
      rInner: 1.98,
      rOuter: 2.12,
      yBot: -0.05,
      yTop: 0.05,
      thStart: thMid - 0.36,
      thEnd: thMid + 0.36,
      steps: 5,
      bevelIn: 0.015,
    });
    // Cardinal suspended diamond memory-prism facet at radius 2.10!
    const px = Math.cos(thMid) * 2.10;
    const pz = Math.sin(thMid) * 2.10;
    gRingIvory.addFacetedCrystal({
      center: [px, 0.04, pz],
      radii: [0.22, 0.42, 0.22],
      sectors: 6,
      stacks: 4,
    });
    gRingGold.addChamferBox({
      center: [px, 0.04, pz],
      size: [0.32, 0.10, 0.32],
      rotDeg: [0, 45, 0],
    });
    gRingArc.addFacetedCrystal({
      center: [px * 0.92, 0.04, pz * 0.92],
      radii: [0.10, 0.26, 0.10],
      sectors: 4,
      stacks: 3,
    });
  }

  const harmonicRingMesh = scene.addMesh('HarmonicFacetRing_Mesh', [
    gRingGold,
    gRingIvory,
    gRingArc,
  ]);
  const harmonicRingIdx = scene.addNode({
    name: 'HarmonicFacetRing',
    meshIndex: harmonicRingMesh,
    translation: [0, 2.66, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 3. Canticle Archive Seamless Loopable 'idle' Animation (4.00s, 9 steps)
  //    Sampled with u = (k === N ? 0 : k / N) so keyframe 0 and keyframe N are
  //    guaranteed float-for-float identical with continuous smooth velocity!
  // -------------------------------------------------------------------------
  const N = 8;
  const dur = 4.0;
  const idleTimes = [];
  for (let k = 0; k <= N; k++) {
    idleTimes.push(Number(((dur * k) / N).toFixed(4)));
  }

  const sampleLoop = (fn) => {
    const out = [];
    for (let k = 0; k <= N; k++) {
      const u = k === N ? 0 : k / N;
      out.push(fn(u * Math.PI * 2));
    }
    return out;
  };

  const archiveTracks = [
    // Central Codex Lower Vessel hovers majestically
    {
      nodeIndex: codexLowerIdx,
      path: 'translation',
      times: idleTimes,
      values: sampleLoop((ang) => [0, 2.68 + Math.sin(ang) * 0.11, 0]),
    },
    {
      nodeIndex: codexLowerIdx,
      path: 'rotation',
      times: idleTimes,
      values: sampleLoop((ang) => quatFromEulerXYZ(0, Math.sin(ang) * 14, 0)),
    },
    // Central Codex Core pulses & counter-rotates inside the open split!
    {
      nodeIndex: codexCoreIdx,
      path: 'translation',
      times: idleTimes,
      values: sampleLoop((ang) => [0, 3.44 + Math.sin(ang) * 0.14, 0]),
    },
    {
      nodeIndex: codexCoreIdx,
      path: 'scale',
      times: idleTimes,
      values: sampleLoop((ang) => {
        const s = 1.0 + Math.sin(ang * 2) * 0.14;
        return [s, s, s];
      }),
    },
    {
      nodeIndex: codexCoreIdx,
      path: 'rotation',
      times: idleTimes,
      values: sampleLoop((ang) => quatFromEulerXYZ(Math.sin(ang) * 16, -Math.sin(ang) * 26, 0)),
    },
    // Central Codex Upper Spire breathes slightly wider above the core!
    {
      nodeIndex: codexUpperIdx,
      path: 'translation',
      times: idleTimes,
      values: sampleLoop((ang) => [0, 4.16 + Math.sin(ang) * 0.18, 0]),
    },
    {
      nodeIndex: codexUpperIdx,
      path: 'rotation',
      times: idleTimes,
      values: sampleLoop((ang) => quatFromEulerXYZ(0, Math.sin(ang) * 14, 0)),
    },
    // Harmonic Facet Ring & 4 Outer Prisms gently counter-oscillate
    {
      nodeIndex: harmonicRingIdx,
      path: 'translation',
      times: idleTimes,
      values: sampleLoop((ang) => [0, 2.66 - Math.sin(ang) * 0.09, 0]),
    },
    {
      nodeIndex: harmonicRingIdx,
      path: 'rotation',
      times: idleTimes,
      values: sampleLoop((ang) => quatFromEulerXYZ(0, -Math.sin(ang) * 16, 0)),
    },
  ];

  // Staggered phase levitation & gentle harmonic tilt on all 4 Suspended Archive Facets!
  for (const item of suspendedFacetNodes) {
    const { nodeIndex, spec } = item;
    const ph = spec.phase;
    archiveTracks.push({
      nodeIndex,
      path: 'translation',
      times: idleTimes,
      values: sampleLoop((ang) => [
        spec.pos[0],
        spec.pos[1] + Math.sin(ang + ph) * 0.16,
        spec.pos[2],
      ]),
    });
    archiveTracks.push({
      nodeIndex,
      path: 'rotation',
      times: idleTimes,
      values: sampleLoop((ang) =>
        quatFromEulerXYZ(
          Math.cos(ang + ph) * 4.5,
          spec.ry + Math.sin(ang + ph) * 6.0,
          -16 + Math.sin(ang + ph) * 4.5
        )
      ),
    });
  }

  scene.addAnimation('idle', archiveTracks);

  return scene.buildGLB('CanticleArchiveScene');
}

// ---------------------------------------------------------------------------
// Self-Validation Summary & CLI Entry Point
// ---------------------------------------------------------------------------

function summarizeCanticleAsset(filename, glbBuffer, gltf) {
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
    { filename: 'storm_scribe.glb', build: buildStormScribeGLB },
    { filename: 'canticle_archive.glb', build: buildCanticleArchiveGLB },
  ];

  const summaries = [];
  for (const sp of specs) {
    const { glbBuffer, gltf } = sp.build();
    const fullPath = path.join(outDir, sp.filename);
    fs.writeFileSync(fullPath, glbBuffer);
    summaries.push(summarizeCanticleAsset(sp.filename, glbBuffer, gltf));
  }

  console.log(JSON.stringify(summaries, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildStormScribeGLB,
  buildCanticleArchiveGLB,
};
