#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// Deterministic math helpers
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };
const v3add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const v3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const v3scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const v3lerp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const v3dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const v3cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const v3len = (a) => Math.hypot(a[0], a[1], a[2]);
const v3norm = (a) => {
  const l = v3len(a);
  return l > 1e-8 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
};

function quatFromEulerXYZ(rx, ry, rz) {
  const cx = Math.cos(rx * 0.5), sx = Math.sin(rx * 0.5);
  const cy = Math.cos(ry * 0.5), sy = Math.sin(ry * 0.5);
  const cz = Math.cos(rz * 0.5), sz = Math.sin(rz * 0.5);
  const q = [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ];
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

function catmullRom(pts, t) {
  const n = pts.length - 1;
  const f = clamp(t, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const u = f - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n, i + 2)];
  const u2 = u * u, u3 = u2 * u;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] = 0.5 * (
      (2 * p1[k]) +
      (-p0[k] + p2[k]) * u +
      (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 +
      (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3
    );
  }
  return out;
}

function chainWeights(chain, s) {
  const n = chain.length - 1;
  const f = clamp(s, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = smooth(f - i);
  const w0 = 1 - t, w1 = t;
  return {
    j: [chain[i], w1 > 1e-5 ? chain[i + 1] : 0, 0, 0],
    w: [w0, w1 > 1e-5 ? w1 : 0, 0, 0],
  };
}

function createBucket() {
  return { pos: [], norm: [], uv: [], joints: [], weights: [], idx: [] };
}

function normalizeWeights(w, j) {
  const cleanW = [Math.max(0, w[0]), Math.max(0, w[1]), Math.max(0, w[2]), Math.max(0, w[3])];
  const f32 = new Float32Array(cleanW);
  let sum = f32[0] + f32[1] + f32[2] + f32[3];
  if (sum < 1e-6) return { j: [j[0], 0, 0, 0], w: [1, 0, 0, 0] };
  const outW = [f32[0] / sum, f32[1] / sum, f32[2] / sum, f32[3] / sum];
  const outJ = [
    outW[0] > 0 ? j[0] : 0,
    outW[1] > 0 ? j[1] : 0,
    outW[2] > 0 ? j[2] : 0,
    outW[3] > 0 ? j[3] : 0,
  ];
  return { j: outJ, w: outW };
}

// Loft closed or open rings into watertight triangle mesh with auto-oriented outward normals
function addLoft(bucket, rings, opts = {}) {
  const closed = opts.closed !== false;
  const capStart = !!opts.capStart;
  const capEnd = !!opts.capEnd;
  const R = rings.length;
  const M = rings[0].pts.length;
  const baseVert = bucket.pos.length / 3;

  // Estimate center trajectory to verify outward face winding
  const centers = rings.map((r) => {
    let sx = 0, sy = 0, sz = 0;
    for (const p of r.pts) { sx += p[0]; sy += p[1]; sz += p[2]; }
    return [sx / M, sy / M, sz / M];
  });

  for (let i = 0; i < R; i++) {
    const r = rings[i];
    const skin = normalizeWeights(r.skin.w, r.skin.j);
    const vCoord = r.v !== undefined ? r.v : i / Math.max(1, R - 1);
    for (let m = 0; m < M; m++) {
      const p = r.pts[m];
      bucket.pos.push(p[0], p[1], p[2]);
      bucket.norm.push(0, 1, 0);
      bucket.uv.push(m / M, vCoord);
      bucket.joints.push(skin.j[0], skin.j[1], skin.j[2], skin.j[3]);
      bucket.weights.push(skin.w[0], skin.w[1], skin.w[2], skin.w[3]);
    }
  }

  // Test winding on a mid-section quad against radial outward vector
  let flip = false;
  const mid = Math.floor((R - 1) * 0.5);
  {
    const p00 = rings[mid].pts[0];
    const p10 = rings[mid + 1].pts[0];
    const p01 = rings[mid].pts[1 % M];
    const fn = v3cross(v3sub(p10, p00), v3sub(p01, p00));
    const radial = v3sub(p00, centers[mid]);
    if (v3dot(fn, radial) < 0) flip = true;
  }

  const segs = closed ? M : M - 1;
  const localTris = [];
  const pushTri = (a, b, c) => {
    if (a === b || b === c || a === c) return;
    const pa = [bucket.pos[a * 3], bucket.pos[a * 3 + 1], bucket.pos[a * 3 + 2]];
    const pb = [bucket.pos[b * 3], bucket.pos[b * 3 + 1], bucket.pos[b * 3 + 2]];
    const pc = [bucket.pos[c * 3], bucket.pos[c * 3 + 1], bucket.pos[c * 3 + 2]];
    if (v3len(v3cross(v3sub(pb, pa), v3sub(pc, pa))) < 1e-9) return;
    if (flip) { bucket.idx.push(a, c, b); localTris.push([a, c, b]); }
    else { bucket.idx.push(a, b, c); localTris.push([a, b, c]); }
  };

  for (let i = 0; i < R - 1; i++) {
    for (let m = 0; m < segs; m++) {
      const m1 = (m + 1) % M;
      const a = baseVert + i * M + m;
      const b = baseVert + (i + 1) * M + m;
      const c = baseVert + (i + 1) * M + m1;
      const d = baseVert + i * M + m1;
      pushTri(a, b, c);
      pushTri(a, c, d);
    }
  }

  if (capStart) {
    const cPos = opts.startTip || centers[0];
    const skin = normalizeWeights(rings[0].skin.w, rings[0].skin.j);
    const ci = bucket.pos.length / 3;
    bucket.pos.push(cPos[0], cPos[1], cPos[2]);
    bucket.norm.push(0, 1, 0);
    bucket.uv.push(0.5, 0);
    bucket.joints.push(skin.j[0], skin.j[1], skin.j[2], skin.j[3]);
    bucket.weights.push(skin.w[0], skin.w[1], skin.w[2], skin.w[3]);
    for (let m = 0; m < segs; m++) {
      const m1 = (m + 1) % M;
      pushTri(ci, baseVert + m, baseVert + m1);
    }
  }

  if (capEnd) {
    const cPos = opts.endTip || centers[R - 1];
    const skin = normalizeWeights(rings[R - 1].skin.w, rings[R - 1].skin.j);
    const ci = bucket.pos.length / 3;
    bucket.pos.push(cPos[0], cPos[1], cPos[2]);
    bucket.norm.push(0, 1, 0);
    bucket.uv.push(0.5, 1);
    bucket.joints.push(skin.j[0], skin.j[1], skin.j[2], skin.j[3]);
    bucket.weights.push(skin.w[0], skin.w[1], skin.w[2], skin.w[3]);
    const off = baseVert + (R - 1) * M;
    for (let m = 0; m < segs; m++) {
      const m1 = (m + 1) % M;
      pushTri(ci, off + m1, off + m);
    }
  }

  // Compute smooth normals strictly within this loft component
  const endVert = bucket.pos.length / 3;
  const acc = new Float64Array((endVert - baseVert) * 3);
  for (const [a, b, c] of localTris) {
    const pa = [bucket.pos[a * 3], bucket.pos[a * 3 + 1], bucket.pos[a * 3 + 2]];
    const pb = [bucket.pos[b * 3], bucket.pos[b * 3 + 1], bucket.pos[b * 3 + 2]];
    const pc = [bucket.pos[c * 3], bucket.pos[c * 3 + 1], bucket.pos[c * 3 + 2]];
    const fn = v3cross(v3sub(pb, pa), v3sub(pc, pa));
    for (const vi of [a, b, c]) {
      const li = (vi - baseVert) * 3;
      acc[li] += fn[0]; acc[li + 1] += fn[1]; acc[li + 2] += fn[2];
    }
  }
  for (let vi = baseVert; vi < endVert; vi++) {
    const li = (vi - baseVert) * 3;
    const n = v3norm([acc[li], acc[li + 1], acc[li + 2]]);
    bucket.norm[vi * 3] = n[0];
    bucket.norm[vi * 3 + 1] = n[1];
    bucket.norm[vi * 3 + 2] = n[2];
  }
}

// Extrude a closed 2D/3D polygon outline into a beveled 3D carapace panel
function addBeveledPanel(bucket, topLoop, bottomLoop, skinFn) {
  const N = topLoop.length;
  let cx = 0, cy = 0, cz = 0, bx = 0, by = 0, bz = 0;
  for (let i = 0; i < N; i++) {
    cx += topLoop[i][0]; cy += topLoop[i][1]; cz += topLoop[i][2];
    bx += bottomLoop[i][0]; by += bottomLoop[i][1]; bz += bottomLoop[i][2];
  }
  const topCenter = [cx / N, cy / N + 0.008, cz / N];
  const botCenter = [bx / N, by / N, bz / N];
  const rings = [
    { pts: bottomLoop, skin: skinFn(botCenter), v: 0 },
    { pts: topLoop, skin: skinFn(topCenter), v: 1 },
  ];
  // Build crisp faceted top, side, and bottom faces so beveled panels catch specular highlights
  const pushFacet = (p0, p1, p2) => {
    const fn = v3norm(v3cross(v3sub(p1, p0), v3sub(p2, p0)));
    if (v3len(v3cross(v3sub(p1, p0), v3sub(p2, p0))) < 1e-9) return;
    const base = bucket.pos.length / 3;
    for (const [idx, p] of [[0, p0], [1, p1], [2, p2]]) {
      const sk = normalizeWeights(skinFn(p).w, skinFn(p).j);
      bucket.pos.push(p[0], p[1], p[2]);
      bucket.norm.push(fn[0], fn[1], fn[2]);
      bucket.uv.push(idx === 1 ? 1 : 0, idx === 2 ? 1 : 0);
      bucket.joints.push(sk.j[0], sk.j[1], sk.j[2], sk.j[3]);
      bucket.weights.push(sk.w[0], sk.w[1], sk.w[2], sk.w[3]);
    }
    bucket.idx.push(base, base + 1, base + 2);
  };

  // Determine polygon winding relative to panel upward direction
  const upDir = v3sub(topCenter, botCenter);
  const testN = v3cross(v3sub(topLoop[1], topCenter), v3sub(topLoop[2 % N], topCenter));
  const ccw = v3dot(testN, upDir) >= 0;

  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    const t0 = topLoop[i], t1 = topLoop[i1];
    const b0 = bottomLoop[i], b1 = bottomLoop[i1];
    if (ccw) {
      pushFacet(topCenter, t0, t1);
      pushFacet(botCenter, b1, b0);
      pushFacet(b0, b1, t1);
      pushFacet(b0, t1, t0);
    } else {
      pushFacet(topCenter, t1, t0);
      pushFacet(botCenter, b0, b1);
      pushFacet(b1, b0, t0);
      pushFacet(b1, t0, t1);
    }
  }
  void rings;
}

// Compute parallel-transport frames along a 3D spline
function computeFrames(pts, samples) {
  const pos = [];
  for (let i = 0; i < samples; i++) pos.push(catmullRom(pts, i / (samples - 1)));
  const tangents = pos.map((p, i) => {
    const a = pos[Math.max(0, i - 1)];
    const b = pos[Math.min(samples - 1, i + 1)];
    return v3norm(v3sub(b, a));
  });
  const ups = [];
  let up = [0, 1, 0];
  if (Math.abs(v3dot(up, tangents[0])) > 0.92) up = [1, 0, 0];
  up = v3norm(v3sub(up, v3scale(tangents[0], v3dot(up, tangents[0]))));
  ups.push(up);
  for (let i = 1; i < samples; i++) {
    const tPrev = tangents[i - 1], tCur = tangents[i];
    const axis = v3cross(tPrev, tCur);
    const sinA = v3len(axis);
    if (sinA > 1e-6) {
      const k = v3scale(axis, 1 / sinA);
      const cosA = clamp(v3dot(tPrev, tCur), -1, 1);
      // Rodrigues rotation of previous up vector
      const kv = v3cross(k, ups[i - 1]);
      const kd = v3dot(k, ups[i - 1]);
      up = v3add(
        v3add(v3scale(ups[i - 1], cosA), v3scale(kv, sinA)),
        v3scale(k, kd * (1 - cosA))
      );
    } else {
      up = ups[i - 1];
    }
    up = v3norm(v3sub(up, v3scale(tCur, v3dot(up, tCur))));
    ups.push(up);
  }
  const rights = tangents.map((t, i) => v3norm(v3cross(t, ups[i])));
  return { pos, tangents, ups, rights };
}

function buildSiphonWyrm() {
  // 21-joint armature hierarchy (bind world positions; bind rotations = identity)
  const jointDefs = [
    { name: 'Root', parent: -1, bind: [0.00, 0.00, 0.00] },       // 0
    { name: 'Core', parent: 0, bind: [0.00, 1.52, 0.14] },        // 1
    { name: 'Head', parent: 1, bind: [0.00, 1.50, 0.78] },        // 2
    { name: 'TendrilL1', parent: 2, bind: [0.25, 1.39, 1.12] },   // 3
    { name: 'TendrilL2', parent: 3, bind: [0.54, 1.33, 1.62] },   // 4
    { name: 'TendrilL3', parent: 4, bind: [0.22, 1.27, 1.98] },   // 5
    { name: 'TendrilR1', parent: 2, bind: [-0.25, 1.39, 1.12] },  // 6
    { name: 'TendrilR2', parent: 6, bind: [-0.54, 1.33, 1.62] },  // 7
    { name: 'TendrilR3', parent: 7, bind: [-0.22, 1.27, 1.98] },  // 8
    { name: 'WingL1', parent: 1, bind: [0.38, 1.62, 0.22] },      // 9
    { name: 'WingL2', parent: 9, bind: [1.08, 1.68, 0.22] },      // 10
    { name: 'WingL3', parent: 10, bind: [1.72, 1.46, 0.06] },     // 11
    { name: 'WingR1', parent: 1, bind: [-0.38, 1.62, 0.22] },     // 12
    { name: 'WingR2', parent: 12, bind: [-1.08, 1.68, 0.22] },    // 13
    { name: 'WingR3', parent: 13, bind: [-1.72, 1.46, 0.06] },    // 14
    { name: 'Tail1', parent: 1, bind: [0.00, 1.50, -0.48] },      // 15
    { name: 'Tail2', parent: 15, bind: [0.20, 1.46, -1.24] },     // 16
    { name: 'Tail3', parent: 16, bind: [0.02, 1.25, -2.02] },     // 17
    { name: 'Tail4', parent: 17, bind: [-0.22, 0.66, -1.72] },    // 18
    { name: 'Tail5', parent: 18, bind: [-0.05, 0.12, -0.78] },    // 19
    { name: 'Tail6', parent: 19, bind: [0.10, 0.42, 0.08] },      // 20
  ];

  // Material geometry buckets
  const violetChitin = createBucket();
  const plumCarapace = createBucket();
  const darkMembrane = createBucket();
  const luminousMint = createBucket();
  const teamColor = createBucket();

  // ---------------------------------------------------------------------------
  // 1. CENTRAL KITE THORAX & CEPHALIC HOOD
  // ---------------------------------------------------------------------------
  // Dorsal violet chitin kite-hood + thoracic shield (Z from -0.56 to +1.34)
  {
    const stations = 18;
    const M = 18;
    const hoodRings = [];
    for (let i = 0; i < stations; i++) {
      const t = i / (stations - 1); // 0 = rear waist (-0.56), 1 = front rostrum (+1.34)
      const z = lerp(-0.56, 1.34, t);
      // Organic kite hood profile: narrow waist -> wide cobra/manta hood -> sleek rostrum
      const widthEnv = Math.sin(Math.pow(t, 0.72) * Math.PI);
      const halfW = 0.12 + 0.48 * widthEnv + (t > 0.55 ? 0.10 * Math.sin((t - 0.55) / 0.45 * Math.PI) : 0);
      const yCenter = 1.50 + 0.10 * Math.sin(t * Math.PI) - 0.10 * Math.pow(t, 2.4);
      const halfH = 0.08 + 0.25 * Math.sin(Math.pow(t, 0.8) * Math.PI);

      const pts = [];
      for (let m = 0; m < M; m++) {
        const ang = (m / M) * TAU; // 0 = +X, PI/2 = +Y (dorsal), PI = -X, 3PI/2 = -Y (ventral)
        const ca = Math.cos(ang), sa = Math.sin(ang);
        // Sculpted dorsal ridge keel + flared lateral hood brim + tucked belly
        const dorsalKeel = sa > 0 ? 0.15 * Math.pow(sa, 3.2) * Math.sin(t * Math.PI) : 0;
        const brimFlare = (1 - Math.abs(sa)) * 0.08 * widthEnv;
        const ventralTuck = sa < 0 ? 0.58 : 1.0;
        const x = ca * (halfW + brimFlare);
        const y = yCenter + sa * halfH * ventralTuck + dorsalKeel - Math.abs(ca) * 0.05 * widthEnv;
        pts.push([x, y, z]);
      }
      const bodyS = clamp((z + 0.56) / 1.90, 0, 1);
      hoodRings.push({
        pts,
        skin: chainWeights([15, 1, 1, 2, 2], bodyS),
        v: t,
      });
    }
    addLoft(violetChitin, hoodRings, {
      closed: true,
      capStart: true,
      capEnd: true,
      startTip: [0, 1.49, -0.60],
      endTip: [0, 1.38, 1.38],
    });
  }

  // Ventral Plum Visceral Pod & Ribbed Sternum beneath Thorax
  {
    const stations = 12, M = 14;
    const bellyRings = [];
    for (let i = 0; i < stations; i++) {
      const t = i / (stations - 1);
      const z = lerp(-0.46, 1.08, t);
      const env = Math.sin(t * Math.PI);
      const rib = 1 + 0.09 * Math.cos(t * Math.PI * 10);
      const rx = (0.08 + 0.30 * env) * rib;
      const ry = (0.06 + 0.19 * env) * rib;
      const yc = 1.38 - 0.05 * env;
      const pts = [];
      for (let m = 0; m < M; m++) {
        const a = (m / M) * TAU;
        pts.push([Math.cos(a) * rx, yc + Math.sin(a) * ry, z]);
      }
      bellyRings.push({ pts, skin: chainWeights([15, 1, 2], t), v: t });
    }
    addLoft(plumCarapace, bellyRings, {
      closed: true,
      capStart: true,
      capEnd: true,
      startTip: [0, 1.42, -0.50],
      endTip: [0, 1.36, 1.14],
    });
  }

  // Dorsal Chitin Crest Spines (3 swept-back kite dorsal fins along thorax)
  for (let c = 0; c < 3; c++) {
    const zBase = 0.62 - c * 0.36;
    const hScale = 1.0 - c * 0.14;
    const spineRings = [];
    const N = 5;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const w = (1 - t * 0.85) * 0.065 * hScale;
      const len = (1 - t * 0.65) * 0.18 * hScale;
      const y = 1.72 + t * 0.34 * hScale - c * 0.04;
      const zc = zBase - t * 0.16;
      const pts = [
        [0, y + 0.02, zc + len],
        [w, y, zc],
        [0, y - 0.02, zc - len],
        [-w, y, zc],
      ];
      spineRings.push({ pts, skin: chainWeights([1, 2], clamp((zBase + 0.3) / 1.1, 0, 1)), v: t });
    }
    addLoft(violetChitin, spineRings, {
      closed: true,
      capStart: true,
      capEnd: true,
      endTip: [0, 1.72 + 0.38 * hScale - c * 0.04, zBase - 0.22],
    });
  }

  // Luminous Mint Ventral Siphon Core Organ + 4 Compound Bio-Eyes
  {
    const coreRings = [];
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const z = lerp(-0.08, 0.58, t);
      const env = Math.sin(t * Math.PI);
      const rx = 0.04 + 0.17 * env;
      const ry = 0.03 + 0.09 * env;
      const pts = [];
      for (let m = 0; m < 12; m++) {
        const a = (m / 12) * TAU;
        pts.push([Math.cos(a) * rx, 1.24 + Math.sin(a) * ry, z]);
      }
      coreRings.push({ pts, skin: { j: [1, 0, 0, 0], w: [1, 0, 0, 0] }, v: t });
    }
    addLoft(luminousMint, coreRings, { closed: true, capStart: true, capEnd: true });

    // 2 pairs of glowing mint compound eyes along cephalic hood brow
    for (const side of [-1, 1]) {
      for (const [ez, ex, ey, er] of [
        [0.98, 0.23, 1.50, 0.048],
        [0.80, 0.33, 1.55, 0.036],
      ]) {
        const eyeRings = [];
        for (let i = 0; i < 6; i++) {
          const t = i / 5;
          const env = Math.sin(t * Math.PI);
          const pts = [];
          for (let m = 0; m < 8; m++) {
            const a = (m / 8) * TAU;
            pts.push([
              side * (ex + Math.cos(a) * er * 0.65 * env),
              ey + Math.sin(a) * er * 0.75 * env,
              ez + (t - 0.5) * er * 2.4,
            ]);
          }
          eyeRings.push({ pts, skin: { j: [2, 0, 0, 0], w: [1, 0, 0, 0] }, v: t });
        }
        addLoft(luminousMint, eyeRings, { closed: true, capStart: true, capEnd: true });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. VIOLET CHITIN KITE WINGS (Left & Right, exact Wingtip X = +/- 2.1900)
  // ---------------------------------------------------------------------------
  function wingSurfacePoint(side, s, cNorm, isUpper) {
    // s in [0, 1] from wing-root |x|=0.30 to razor kite wingtip |x|=2.1900
    const xAbs = lerp(0.30, 2.19, s);
    // Swept-forward manta/kite leading edge curving back to (2.19, 1.25, 0.00)
    const zLead = (1 - s) * (0.64 + 0.58 * s * (1 - 0.35 * s));
    // Three-lobed scalloped trailing edge tapering smoothly to 0 at s=1
    const scallop = Math.abs(Math.sin(s * Math.PI * 3.0)) * 0.16 * Math.sin(s * Math.PI);
    const zTrail = (1 - s) * (-0.56 - 0.28 * Math.sin(s * Math.PI * 0.85) + scallop);
    const z = lerp(zTrail, zLead, cNorm);

    // Graceful arch at mid-span (s~0.42) sweeping down to hovering wingtips at y=1.25
    const yBase = 1.56 + 0.20 * Math.sin(s * Math.PI * 0.82) - 0.31 * Math.pow(s, 1.55);
    const camber = Math.sin(cNorm * Math.PI) * 0.065 * (1 - 0.72 * s);
    // Raised chitin finger-ribs across chord
    const ribFlute = Math.cos(cNorm * Math.PI * 4) * 0.014 * Math.sin(cNorm * Math.PI) * (1 - s * 0.75);
    const leadSpar = Math.pow(cNorm, 3.0) * 0.036 * (1 - 0.82 * s);
    const halfThick = (0.012 + 0.034 * (1 - s) * Math.sin(Math.pow(cNorm, 0.7) * Math.PI) + leadSpar) * (1 - 0.86 * Math.pow(s, 4));
    const y = yBase + camber + (isUpper ? halfThick + ribFlute : -halfThick + ribFlute * 0.5);
    return [side * xAbs, y, z];
  }

  for (const side of [1, -1]) {
    const wingChain = side > 0 ? [1, 9, 10, 11] : [1, 12, 13, 14];
    const spanSteps = 20;
    const chordSteps = 10;
    const wingRings = [];

    for (let i = 0; i < spanSteps; i++) {
      const s = i / (spanSteps - 1);
      if (i === spanSteps - 1) {
        // Taper final ring right near exact wingtip (side * 2.19, 1.25, 0)
        const sNear = 0.985;
        const pts = [];
        for (let k = 0; k < chordSteps; k++) {
          pts.push(wingSurfacePoint(side, sNear, k / (chordSteps - 1), true));
        }
        for (let k = chordSteps - 2; k >= 1; k--) {
          pts.push(wingSurfacePoint(side, sNear, k / (chordSteps - 1), false));
        }
        wingRings.push({ pts, skin: chainWeights(wingChain, 1.0), v: 1.0 });
      } else {
        const pts = [];
        for (let k = 0; k < chordSteps; k++) {
          pts.push(wingSurfacePoint(side, s, k / (chordSteps - 1), true));
        }
        for (let k = chordSteps - 2; k >= 1; k--) {
          pts.push(wingSurfacePoint(side, s, k / (chordSteps - 1), false));
        }
        wingRings.push({ pts, skin: chainWeights(wingChain, s), v: s });
      }
    }

    addLoft(violetChitin, wingRings, {
      closed: true,
      capStart: true,
      capEnd: true,
      startTip: [side * 0.26, 1.56, 0.05],
      endTip: [side * 2.19, 1.25, 0.00], // Exact +/- 2.19 footprint wingtip!
    });

    // Leading-edge Wrist Chitin Claw Spur on each wing (s ~ 0.44)
    const spurBase = wingSurfacePoint(side, 0.44, 0.96, true);
    const spurRings = [];
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const r = (1 - t * 0.88) * 0.042;
      const c = [
        spurBase[0] + side * t * 0.14,
        spurBase[1] + t * 0.05,
        spurBase[2] + t * 0.24,
      ];
      const pts = [];
      for (let m = 0; m < 6; m++) {
        const a = (m / 6) * TAU;
        pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * 0.75, c[2]]);
      }
      spurRings.push({ pts, skin: chainWeights(wingChain, 0.44), v: t });
    }
    addLoft(plumCarapace, spurRings, {
      closed: true,
      capStart: true,
      capEnd: true,
      endTip: [spurBase[0] + side * 0.17, spurBase[1] + 0.06, spurBase[2] + 0.30],
    });
  }

  // ---------------------------------------------------------------------------
  // 3. SEGMENTED PLUM TAIL — Coiled Organic Kite Tail (Z=-2.19 apex & Y=0.00 coil)
  // ---------------------------------------------------------------------------
  const tailCtrl = [
    [0.00, 1.50, -0.46],
    [0.20, 1.48, -1.16],
    [0.08, 1.37, -1.82],
    [0.00, 1.25, -2.075], // Dorsal spine crest of somite reaches exact Z = -2.1900!
    [-0.22, 0.72, -1.76],
    [-0.14, 0.17, -1.10],
    [-0.02, 0.072, -0.62], // Ventral keel of coil touches exact Y = 0.0000!
    [0.12, 0.28, -0.08],
    [0.06, 0.52, 0.24],
  ];
  const tailChain = [1, 15, 16, 17, 18, 19, 20];
  const tailFrames = computeFrames(tailCtrl, 120);

  const sampleTailFrame = (s) => {
    const f = clamp(s, 0, 1) * (tailFrames.pos.length - 1);
    const i = Math.min(tailFrames.pos.length - 2, Math.floor(f));
    const u = f - i;
    return {
      p: v3lerp(tailFrames.pos[i], tailFrames.pos[i + 1], u),
      t: v3norm(v3lerp(tailFrames.tangents[i], tailFrames.tangents[i + 1], u)),
      up: v3norm(v3lerp(tailFrames.ups[i], tailFrames.ups[i + 1], u)),
      right: v3norm(v3lerp(tailFrames.rights[i], tailFrames.rights[i + 1], u)),
    };
  };

  // Continuous recessed DarkMembrane inner tail core connecting all somites
  {
    const coreSteps = 44, M = 10;
    const memRings = [];
    for (let i = 0; i < coreSteps; i++) {
      const s = i / (coreSteps - 1);
      const fr = sampleTailFrame(s);
      const rad = lerp(0.105, 0.026, Math.pow(s, 0.85));
      const pts = [];
      for (let m = 0; m < M; m++) {
        const a = (m / M) * TAU;
        const off = v3add(
          v3scale(fr.right, Math.cos(a) * rad * 1.08),
          v3scale(fr.up, Math.sin(a) * rad * 0.92)
        );
        pts.push(v3add(fr.p, off));
      }
      memRings.push({ pts, skin: chainWeights(tailChain, s), v: s });
    }
    addLoft(darkMembrane, memRings, { closed: true, capStart: true, capEnd: true });
  }

  // 11 Articulated Overlapping Plum Carapace Somites (ringed armor shells + dorsal spines)
  const numSomites = 11;
  for (let seg = 0; seg < numSomites; seg++) {
    const s0 = seg / numSomites * 0.92;
    const s1 = (seg + 0.86) / numSomites * 0.92;
    const taper = 1 - Math.pow(seg / numSomites, 0.88) * 0.68;
    const somiteRings = [];
    const subSteps = 5, M = 12;

    for (let k = 0; k < subSteps; k++) {
      const u = k / (subSteps - 1);
      const s = lerp(s0, s1, u);
      const fr = sampleTailFrame(s);
      // Flared overlapping bell-lip profile per segment
      const flare = 0.82 + 0.34 * Math.sin(Math.pow(u, 0.65) * Math.PI * 0.92);
      const rx = 0.145 * taper * flare;
      const ry = 0.118 * taper * flare;
      const pts = [];
      for (let m = 0; m < M; m++) {
        const a = (m / M) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        // Sharp dorsal spine tooth + lateral kite-pleuron ridges
        const dorsalTooth = sa > 0.5 ? Math.pow((sa - 0.5) / 0.5, 2.2) * 0.058 * taper * Math.sin(u * Math.PI) : 0;
        const pleuron = Math.pow(Math.abs(ca), 3.0) * 0.042 * taper * flare;
        const off = v3add(
          v3scale(fr.right, ca * (rx + pleuron)),
          v3scale(fr.up, sa * ry + dorsalTooth)
        );
        const pt = v3add(fr.p, off);
        // Clamp Z >= -2.19 so rear tail-crest sits flush within radius 2.19
        if (pt[2] < -2.19) pt[2] = -2.19;
        pts.push(pt);
      }
      somiteRings.push({ pts, skin: chainWeights(tailChain, s), v: u });
    }
    addLoft(plumCarapace, somiteRings, { closed: true, capStart: true, capEnd: true });
  }

  // Ensure exact Z = -2.1900 dorsal kite-tail barb on apex somite (around s = 0.375)
  {
    const fr = sampleTailFrame(0.375);
    const barbRings = [];
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const r = (1 - t * 0.82) * 0.045;
      const c = v3lerp(fr.p, [0.00, 1.25, -2.165], t);
      const pts = [];
      for (let m = 0; m < 6; m++) {
        const a = (m / 6) * TAU;
        pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, Math.max(-2.19, c[2])]);
      }
      barbRings.push({ pts, skin: chainWeights(tailChain, 0.375), v: t });
    }
    addLoft(plumCarapace, barbRings, {
      closed: true,
      capStart: true,
      capEnd: true,
      endTip: [0.00, 1.25, -2.19], // Exact Z = -2.1900 rear kite boundary!
    });
  }

  // Terminal Kite Caudal Fan + Luminous Mint Tail Stinger at end of coil (s = 0.91..1.0)
  {
    const fanRings = [];
    for (let i = 0; i < 8; i++) {
      const u = i / 7;
      const s = lerp(0.90, 1.0, u);
      const fr = sampleTailFrame(s);
      const fanWidth = Math.sin(u * Math.PI * 0.88) * 0.24 + 0.025 * (1 - u);
      const fanThick = 0.028 * (1 - 0.75 * u);
      const pts = [];
      for (let m = 0; m < 10; m++) {
        const a = (m / 10) * TAU;
        const off = v3add(
          v3scale(fr.right, Math.cos(a) * fanWidth),
          v3scale(fr.up, Math.sin(a) * fanThick)
        );
        pts.push(v3add(fr.p, off));
      }
      fanRings.push({ pts, skin: chainWeights(tailChain, s), v: u });
    }
    const endFr = sampleTailFrame(1.0);
    addLoft(violetChitin, fanRings, {
      closed: true,
      capStart: true,
      capEnd: true,
      endTip: v3add(endFr.p, v3scale(endFr.t, 0.14)),
    });

    // Glowing Mint Caudal Stinger Spine
    const stingRings = [];
    for (let i = 0; i < 6; i++) {
      const u = i / 5;
      const r = (1 - u * 0.85) * 0.032;
      const c = v3add(endFr.p, v3scale(endFr.t, u * 0.22));
      const pts = [];
      for (let m = 0; m < 8; m++) {
        const a = (m / 8) * TAU;
        const off = v3add(v3scale(endFr.right, Math.cos(a) * r), v3scale(endFr.up, Math.sin(a) * r));
        pts.push(v3add(c, off));
      }
      stingRings.push({ pts, skin: chainWeights(tailChain, 1.0), v: u });
    }
    addLoft(luminousMint, stingRings, {
      closed: true,
      capStart: true,
      capEnd: true,
      endTip: v3add(endFr.p, v3scale(endFr.t, 0.28)),
    });
  }

  // ---------------------------------------------------------------------------
  // 4. TWO LUMINOUS MINT SIPHON TENDRILS (+ Armored Plum Basal Sockets)
  // ---------------------------------------------------------------------------
  for (const side of [1, -1]) {
    const tendrilChain = side > 0 ? [2, 3, 4, 5] : [2, 6, 7, 8];

    // Armored Plum Socket Collar on Cephalic Maw
    const sockRings = [];
    for (let i = 0; i < 5; i++) {
      const u = i / 4;
      const r = lerp(0.088, 0.062, u) * (1 + 0.18 * Math.sin(u * Math.PI));
      const c = [side * lerp(0.20, 0.28, u), lerp(1.41, 1.38, u), lerp(1.04, 1.22, u)];
      const pts = [];
      for (let m = 0; m < 10; m++) {
        const a = (m / 10) * TAU;
        pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]]);
      }
      sockRings.push({ pts, skin: chainWeights(tendrilChain, u * 0.18), v: u });
    }
    addLoft(plumCarapace, sockRings, { closed: true, capStart: true, capEnd: true });

    // Sinuous Luminous Mint Siphon Tendril sweeping wide and converging to Z = +2.1900
    const tCtrl = [
      [side * 0.26, 1.38, 1.18],
      [side * 0.56, 1.34, 1.56],
      [side * 0.44, 1.29, 1.88],
      [side * 0.15, 1.26, 2.09],
      [side * 0.035, 1.25, 2.176],
    ];
    const tFrames = computeFrames(tCtrl, 32);
    const tendrilRings = [];

    for (let i = 0; i < 32; i++) {
      const s = i / 31;
      const p = tFrames.pos[i];
      const up = tFrames.ups[i];
      const right = tFrames.rights[i];
      // Pulsing bioluminescent ampulla nodes + flared siphon extractor cup near tip (s~0.86)
      const ampulla = 1 + 0.24 * Math.pow(Math.sin(s * Math.PI * 5), 2) * (1 - s * 0.5);
      const tipFlare = s > 0.78 ? Math.sin(((s - 0.78) / 0.22) * Math.PI) * 0.028 : 0;
      const baseR = lerp(0.052, 0.014, Math.pow(s, 0.75)) * ampulla + tipFlare;

      const pts = [];
      const M = 10;
      for (let m = 0; m < M; m++) {
        const a = (m / M) * TAU + s * 2.4 * side; // Subtle helical rifling along tendril
        const flute = 1 + 0.14 * Math.cos(3 * a);
        const off = v3add(
          v3scale(right, Math.cos(a) * baseR * flute),
          v3scale(up, Math.sin(a) * baseR * flute)
        );
        const pt = v3add(p, off);
        if (pt[2] > 2.19) pt[2] = 2.19;
        pts.push(pt);
      }
      tendrilRings.push({ pts, skin: chainWeights(tendrilChain, s), v: s });
    }
    addLoft(luminousMint, tendrilRings, {
      closed: true,
      capStart: true,
      capEnd: true,
      endTip: [side * 0.015, 1.25, 2.1899], // Exact radius 2.1900 front kite boundary!
    });
  }

  // ---------------------------------------------------------------------------
  // 5. SEPARATE TEAMCOLOR PANELS (7 Beveled Carapace Plates, Dedicated Mesh)
  // ---------------------------------------------------------------------------
  // A & B: Left & Right Dorsal Inner-Wing Kite Shoulder Panels (2 panels)
  // C & D: Left & Right Mid-Wing Chevron Trim Panels (2 panels)
  for (const side of [1, -1]) {
    const wingChain = side > 0 ? [1, 9, 10, 11] : [1, 12, 13, 14];
    const wingSkinFn = (pt) => {
      const s = clamp((Math.abs(pt[0]) - 0.30) / (2.19 - 0.30), 0, 1);
      return chainWeights(wingChain, s);
    };

    const panelDefs = [
      // Inner shoulder kite-shield panel
      [
        [0.10, 0.82],
        [0.34, 0.84],
        [0.42, 0.48],
        [0.26, 0.18],
        [0.08, 0.30],
      ],
      // Outer mid-wing chevron panel
      [
        [0.50, 0.80],
        [0.72, 0.78],
        [0.78, 0.44],
        [0.56, 0.32],
      ],
    ];

    for (const uvLoop of panelDefs) {
      const bot = [], top = [];
      for (const [s, c] of uvLoop) {
        const surf = wingSurfacePoint(side, s, c, true);
        bot.push([surf[0], surf[1] + 0.008, surf[2]]);
        top.push([surf[0], surf[1] + 0.032, surf[2]]);
      }
      addBeveledPanel(teamColor, top, bot, wingSkinFn);
    }
  }

  // E: Cephalic Hood Crown Chevron Panel (1 central dorsal head-shield panel)
  {
    const crownPts = [
      [0.00, 1.66, 1.12],
      [0.22, 1.68, 0.82],
      [0.15, 1.73, 0.56],
      [0.00, 1.76, 0.68],
      [-0.15, 1.73, 0.56],
      [-0.22, 1.68, 0.82],
    ];
    const bot = crownPts.map((p) => [p[0], p[1] + 0.006, p[2]]);
    const top = crownPts.map((p) => [p[0] * 0.92, p[1] + 0.030, p[2]]);
    addBeveledPanel(teamColor, top, bot, (pt) => chainWeights([1, 2], clamp((pt[2] - 0.3) / 0.8, 0, 1)));
  }

  // F & G: Paired Dorsal Tail-Shield Trim Panels along upper plum tail arch (2 panels)
  for (const side of [1, -1]) {
    const sVals = [0.04, 0.13, 0.22];
    const bot = [], top = [];
    for (const s of sVals) {
      const fr = sampleTailFrame(s);
      const pIn = v3add(fr.p, v3add(v3scale(fr.right, side * 0.045), v3scale(fr.up, 0.135)));
      bot.push(pIn);
      top.push(v3add(pIn, v3scale(fr.up, 0.024)));
    }
    for (let k = sVals.length - 1; k >= 0; k--) {
      const s = sVals[k];
      const fr = sampleTailFrame(s);
      const pOut = v3add(fr.p, v3add(v3scale(fr.right, side * 0.135), v3scale(fr.up, 0.088)));
      bot.push(pOut);
      top.push(v3add(pOut, v3scale(fr.up, 0.024)));
    }
    addBeveledPanel(teamColor, top, bot, () => chainWeights(tailChain, 0.13));
  }

  // ---------------------------------------------------------------------------
  // 6. EXACT FOOTPRINT & GROUND-PLANE CALIBRATION (Radius = 2.1900, minY = 0.0000)
  // ---------------------------------------------------------------------------
  const allBuckets = [violetChitin, plumCarapace, darkMembrane, luminousMint, teamColor];
  let minY = Infinity;
  for (const b of allBuckets) {
    for (let i = 0; i < b.pos.length; i += 3) {
      if (b.pos[i + 1] < minY) minY = b.pos[i + 1];
    }
  }
  // Shift geometry + bind Y offsets uniformly by -minY so lowest ventral coil point sits at exact Y = 0.0000
  for (const b of allBuckets) {
    for (let i = 0; i < b.pos.length; i += 3) {
      b.pos[i + 1] -= minY;
      if (Math.abs(b.pos[i + 1]) < 1e-7) b.pos[i + 1] = 0;
      const rXZ = Math.hypot(b.pos[i], b.pos[i + 2]);
      if (rXZ > 2.19) {
        const scale = 2.19 / rXZ;
        b.pos[i] *= scale;
        b.pos[i + 2] *= scale;
      }
    }
  }
  for (let j = 1; j < jointDefs.length; j++) {
    jointDefs[j].bind[1] -= minY;
  }

  // ---------------------------------------------------------------------------
  // 7. ANIMATION CLIPS: idle, hover, cast, death
  // ---------------------------------------------------------------------------
  const localBindPos = jointDefs.map((jd) => {
    if (jd.parent < 0) return [...jd.bind];
    const pb = jointDefs[jd.parent].bind;
    return [jd.bind[0] - pb[0], jd.bind[1] - pb[1], jd.bind[2] - pb[2]];
  });

  function sampleClip(duration, steps, evalFn) {
    const times = [];
    const tracks = new Map();
    for (let j = 0; j < jointDefs.length; j++) {
      tracks.set(j, { trans: [], rot: [], hasTrans: false, hasRot: false });
    }
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const t = u * duration;
      times.push(t);
      const pose = evalFn(u, t);
      for (let j = 0; j < jointDefs.length; j++) {
        const p = pose[j] || {};
        const dt = p.dt || [0, 0, 0];
        const rot = p.rot || [0, 0, 0];
        const tr = tracks.get(j);
        if (Math.hypot(dt[0], dt[1], dt[2]) > 1e-6) tr.hasTrans = true;
        if (Math.hypot(rot[0], rot[1], rot[2]) > 1e-6) tr.hasRot = true;
        tr.trans.push(
          localBindPos[j][0] + dt[0],
          localBindPos[j][1] + dt[1],
          localBindPos[j][2] + dt[2]
        );
        const q = quatFromEulerXYZ(rot[0], rot[1], rot[2]);
        tr.rot.push(q[0], q[1], q[2], q[3]);
      }
    }
    return { times, tracks };
  }

  // Clip 1: idle — hypnotic floating manta-kite breathing & coiled tail undulation (3.2s loop)
  const idleClip = sampleClip(3.2, 24, (u) => {
    const ph = u * TAU;
    const pose = {};
    // Subtle float bob; when Core dips slightly, lower tail tightens curl so minY stays >= 0
    const bob = Math.sin(ph);
    pose[1] = {
      dt: [0.02 * Math.sin(ph), 0.055 * bob + 0.04, 0.0],
      rot: [0.035 * Math.cos(ph), 0.025 * Math.sin(ph), -0.02 * Math.sin(ph)],
    };
    pose[2] = { rot: [-0.04 * Math.cos(ph), 0.03 * Math.sin(ph), 0] };
    // Traveling manta-ray wave across violet chitin wings
    for (const [sgn, j1, j2, j3] of [[1, 9, 10, 11], [-1, 12, 13, 14]]) {
      pose[j1] = { rot: [0.02 * Math.sin(ph), 0, sgn * 0.09 * Math.sin(ph - 0.3)] };
      pose[j2] = { rot: [0.03 * Math.sin(ph - 0.9), 0, sgn * 0.13 * Math.sin(ph - 1.0)] };
      pose[j3] = { rot: [0.04 * Math.sin(ph - 1.6), 0, sgn * 0.16 * Math.sin(ph - 1.7)] };
    }
    // Luminous mint siphon tendrils gentle sensory curl
    for (const [sgn, j1, j2, j3] of [[1, 3, 4, 5], [-1, 6, 7, 8]]) {
      pose[j1] = { rot: [0.05 * Math.sin(ph + 0.4), sgn * 0.07 * Math.cos(ph), 0] };
      pose[j2] = { rot: [0.07 * Math.cos(ph), sgn * 0.10 * Math.sin(ph - 0.6), 0] };
      pose[j3] = { rot: [-0.06 * Math.sin(ph - 0.8), -sgn * 0.11 * Math.cos(ph - 1.1), 0] };
    }
    // Coiled plum tail serpentine breathing
    pose[15] = { rot: [0.04 * Math.sin(ph - 0.4), 0.07 * Math.cos(ph), 0] };
    pose[16] = { rot: [0.05 * Math.sin(ph - 1.0), 0.09 * Math.cos(ph - 0.6), 0] };
    pose[17] = { rot: [0.06 - 0.05 * bob, 0.08 * Math.sin(ph - 1.2), 0] };
    pose[18] = { rot: [0.08 - 0.06 * bob, -0.07 * Math.cos(ph - 1.6), 0] };
    pose[19] = { rot: [0.06 * Math.cos(ph - 2.0), 0.08 * Math.sin(ph - 2.1), 0] };
    pose[20] = { rot: [0.09 * Math.sin(ph - 2.5), 0.10 * Math.cos(ph - 2.6), 0] };
    return pose;
  });

  // Clip 2: hover — active forward-banked propulsion flight (1.6s loop)
  const hoverClip = sampleClip(1.6, 20, (u) => {
    const ph = u * TAU;
    const pose = {};
    pose[1] = {
      dt: [0.03 * Math.sin(ph), 0.16 + 0.07 * Math.sin(ph), 0.05 * Math.cos(ph)],
      rot: [0.13 + 0.04 * Math.cos(ph), 0.04 * Math.sin(ph), -0.04 * Math.sin(ph)],
    };
    pose[2] = { rot: [-0.10 + 0.04 * Math.sin(ph), 0, 0] };
    for (const [sgn, j1, j2, j3] of [[1, 9, 10, 11], [-1, 12, 13, 14]]) {
      pose[j1] = { rot: [0.05 * Math.cos(ph), -sgn * 0.04 * Math.sin(ph), sgn * 0.20 * Math.sin(ph)] };
      pose[j2] = { rot: [0.07 * Math.cos(ph - 0.8), 0, sgn * 0.26 * Math.sin(ph - 0.85)] };
      pose[j3] = { rot: [0.08 * Math.cos(ph - 1.5), 0, sgn * 0.30 * Math.sin(ph - 1.65)] };
    }
    for (const [sgn, j1, j2, j3] of [[1, 3, 4, 5], [-1, 6, 7, 8]]) {
      pose[j1] = { rot: [-0.06 + 0.05 * Math.sin(ph), -sgn * 0.08, 0] };
      pose[j2] = { rot: [0.06 * Math.cos(ph - 0.7), sgn * 0.10 * Math.sin(ph), 0] };
      pose[j3] = { rot: [0.08 * Math.sin(ph - 1.2), -sgn * 0.08 * Math.cos(ph), 0] };
    }
    // Tail streams smoothly upward and drives propulsion wave
    pose[15] = { rot: [-0.14 + 0.06 * Math.sin(ph - 0.3), 0.10 * Math.cos(ph), 0] };
    pose[16] = { rot: [-0.12 + 0.08 * Math.sin(ph - 0.9), 0.13 * Math.cos(ph - 0.7), 0] };
    pose[17] = { rot: [0.22 + 0.09 * Math.sin(ph - 1.5), 0.12 * Math.cos(ph - 1.4), 0] };
    pose[18] = { rot: [0.18 + 0.10 * Math.sin(ph - 2.1), -0.11 * Math.cos(ph - 2.0), 0] };
    pose[19] = { rot: [0.14 * Math.sin(ph - 2.7), 0.14 * Math.cos(ph - 2.6), 0] };
    pose[20] = { rot: [0.16 * Math.sin(ph - 3.2), 0.15 * Math.cos(ph - 3.1), 0] };
    return pose;
  });

  // Clip 3: cast — rear coil charge -> siphon tendril convergence & energy channel around CastOrigin -> settle (2.0s)
  const castClip = sampleClip(2.0, 25, (u) => {
    const pose = {};
    const windup = smooth(u / 0.30) * (1 - smooth((u - 0.30) / 0.16));
    const channel = smooth((u - 0.28) / 0.14) * (1 - smooth((u - 0.74) / 0.26));
    const vib = channel * Math.sin(u * TAU * 7);

    pose[1] = {
      dt: [0, 0.24 * windup + 0.12 * channel, -0.18 * windup + 0.22 * channel],
      rot: [-0.26 * windup + 0.16 * channel, 0.02 * vib, 0],
    };
    pose[2] = {
      rot: [-0.12 * windup + 0.10 * channel + 0.025 * vib, 0, 0],
    };
    // Wings flare high in cobra-kite threat posture during windup, then cup forward to focus beam
    for (const [sgn, j1, j2, j3] of [[1, 9, 10, 11], [-1, 12, 13, 14]]) {
      pose[j1] = {
        rot: [
          -0.18 * windup + 0.20 * channel,
          -sgn * 0.18 * windup + sgn * 0.24 * channel,
          sgn * (0.30 * windup - 0.10 * channel + 0.04 * vib),
        ],
      };
      pose[j2] = {
        rot: [0, sgn * 0.16 * channel, sgn * (0.24 * windup - 0.16 * channel + 0.05 * vib)],
      };
      pose[j3] = {
        rot: [0, sgn * 0.14 * channel, sgn * (0.18 * windup - 0.22 * channel)],
      };
    }
    // Siphon tendrils spread wide on windup, then snap inward & spiral around CastOrigin
    for (const [sgn, j1, j2, j3] of [[1, 3, 4, 5], [-1, 6, 7, 8]]) {
      pose[j1] = {
        rot: [
          -0.22 * windup + 0.08 * channel,
          sgn * (0.36 * windup - 0.22 * channel + 0.05 * vib),
          sgn * 0.14 * channel,
        ],
      };
      pose[j2] = {
        rot: [
          0.14 * windup - 0.06 * channel + 0.04 * vib,
          sgn * (0.20 * windup + 0.26 * channel),
          -sgn * 0.18 * channel,
        ],
      };
      pose[j3] = {
        rot: [
          0.06 * vib,
          -sgn * 0.22 * channel,
          sgn * 0.15 * vib,
        ],
      };
    }
    // Segmented plum tail coils tightly under body during charge and whips cleanly on release
    pose[15] = { rot: [0.22 * windup - 0.18 * channel, 0, 0] };
    pose[16] = { rot: [0.26 * windup - 0.14 * channel, 0.05 * vib, 0] };
    pose[17] = { rot: [0.28 * windup + 0.14 * channel, 0, 0] };
    pose[18] = { rot: [0.24 * windup + 0.18 * channel, -0.05 * vib, 0] };
    pose[19] = { rot: [0.20 * windup + 0.12 * channel, 0, 0] };
    pose[20] = { rot: [0.18 * windup + 0.15 * channel, 0.06 * vib, 0] };
    return pose;
  });

  // Clip 4: death — bio-shock spasm -> spiraling buoyancy loss -> grounded remains on Y>=0 (2.2s)
  const deathClip = sampleClip(2.2, 24, (u) => {
    const pose = {};
    const spasm = smooth(u / 0.16) * (1 - smooth((u - 0.16) / 0.20));
    const fall = smooth((u - 0.16) / 0.56);
    const settle = smooth((u - 0.55) / 0.30);

    // Core drops cleanly so body & draped wings settle onto Y >= 0.02 without going underground
    pose[1] = {
      dt: [0.10 * fall, 0.16 * spasm - 1.18 * fall, -0.10 * spasm + 0.06 * fall],
      rot: [-0.28 * spasm + 0.18 * fall, 0.22 * fall, 0.26 * spasm - 0.20 * fall + 0.06 * settle],
    };
    pose[2] = {
      rot: [-0.24 * spasm + 0.32 * fall, -0.14 * fall, -0.12 * fall],
    };
    // Left & right wings flare in spasm, then wilt onto the ground plane without plunging < Y=0
    pose[9] = { rot: [0.10 * fall, 0.12 * fall, 0.34 * spasm - 0.10 * fall] };
    pose[10] = { rot: [0.06 * fall, 0, 0.22 * spasm - 0.06 * fall] };
    pose[11] = { rot: [0.04 * fall, 0, 0.16 * spasm + 0.08 * fall] };

    pose[12] = { rot: [0.08 * fall, -0.12 * fall, -0.34 * spasm - 0.14 * fall] };
    pose[13] = { rot: [0.05 * fall, 0, -0.22 * spasm - 0.10 * fall] };
    pose[14] = { rot: [0.04 * fall, 0, -0.16 * spasm - 0.04 * fall] };

    // Mint tendrils go limp along the ground
    for (const [sgn, j1, j2, j3] of [[1, 3, 4, 5], [-1, 6, 7, 8]]) {
      pose[j1] = { rot: [-0.25 * spasm + 0.18 * fall, sgn * 0.24 * fall, 0] };
      pose[j2] = { rot: [0.12 * fall, sgn * 0.16 * fall, 0] };
      pose[j3] = { rot: [-0.14 * fall, -sgn * 0.18 * fall, 0] };
    }

    // Coiled tail uncurls outward horizontally so ventral loop lifts relative to Core as Core drops!
    pose[15] = { rot: [-0.18 * fall, 0.16 * fall, 0] };
    pose[16] = { rot: [-0.10 * fall, 0.20 * fall, 0] };
    pose[17] = { rot: [-0.52 * fall, 0.14 * fall, 0] };
    pose[18] = { rot: [-0.62 * fall, -0.18 * fall, 0] };
    pose[19] = { rot: [-0.28 * fall, 0.12 * fall, 0] };
    pose[20] = { rot: [-0.16 * fall, 0.10 * fall, 0] };
    return pose;
  });

  return {
    jointDefs,
    localBindPos,
    primitives: [
      { name: 'VioletChitin', material: 0, bucket: violetChitin },
      { name: 'PlumCarapace', material: 1, bucket: plumCarapace },
      { name: 'DarkMembrane', material: 2, bucket: darkMembrane },
      { name: 'LuminousMint', material: 3, bucket: luminousMint },
    ],
    teamColorBucket: teamColor,
    clips: [
      { name: 'idle', data: idleClip },
      { name: 'hover', data: hoverClip },
      { name: 'cast', data: castClip },
      { name: 'death', data: deathClip },
    ],
  };
}

// Pack scene into binary glTF 2.0 (.glb)
function packGLB(model) {
  const chunks = [];
  let byteOffset = 0;
  const bufferViews = [];
  const accessors = [];

  function appendBuffer(typedArray, target) {
    const buf = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const pad = (4 - (buf.length % 4)) % 4;
    chunks.push(buf);
    if (pad > 0) chunks.push(Buffer.alloc(pad, 0));
    const bv = { buffer: 0, byteOffset, byteLength: buf.length };
    if (target !== undefined) bv.target = target;
    const bvIdx = bufferViews.length;
    bufferViews.push(bv);
    byteOffset += buf.length + pad;
    return bvIdx;
  }

  function addAccessor(typedArray, componentType, type, count, target, withMinMax) {
    const bvIdx = appendBuffer(typedArray, target);
    const acc = { bufferView: bvIdx, componentType, count, type };
    if (withMinMax) {
      const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
      const min = new Array(comps).fill(Infinity);
      const max = new Array(comps).fill(-Infinity);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < comps; c++) {
          const v = typedArray[i * comps + c];
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
      }
      acc.min = min;
      acc.max = max;
    }
    const idx = accessors.length;
    accessors.push(acc);
    return idx;
  }

  function packBucketPrimitive(bucket, materialIdx) {
    const vCount = bucket.pos.length / 3;
    const posArr = new Float32Array(bucket.pos);
    const normArr = new Float32Array(bucket.norm);
    const uvArr = new Float32Array(bucket.uv);
    const jointsArr = new Uint16Array(bucket.joints);
    const weightsArr = new Float32Array(bucket.weights);
    // Re-normalize weights in Float32 so sum === 1.0 within 1e-7
    for (let i = 0; i < vCount; i++) {
      const o = i * 4;
      const s = weightsArr[o] + weightsArr[o + 1] + weightsArr[o + 2] + weightsArr[o + 3];
      if (s > 0) {
        weightsArr[o] /= s; weightsArr[o + 1] /= s; weightsArr[o + 2] /= s; weightsArr[o + 3] /= s;
      } else {
        weightsArr[o] = 1; jointsArr[o] = 0;
      }
    }
    const idxArr = new Uint16Array(bucket.idx);

    return {
      attributes: {
        POSITION: addAccessor(posArr, 5126, 'VEC3', vCount, 34962, true),
        NORMAL: addAccessor(normArr, 5126, 'VEC3', vCount, 34962, false),
        TEXCOORD_0: addAccessor(uvArr, 5126, 'VEC2', vCount, 34962, false),
        JOINTS_0: addAccessor(jointsArr, 5123, 'VEC4', vCount, 34962, false),
        WEIGHTS_0: addAccessor(weightsArr, 5126, 'VEC4', vCount, 34962, false),
      },
      indices: addAccessor(idxArr, 5123, 'SCALAR', idxArr.length, 34963, false),
      material: materialIdx,
      mode: 4,
    };
  }

  // Materials
  const materials = [
    {
      name: 'VioletChitin',
      pbrMetallicRoughness: {
        baseColorFactor: [0.30, 0.13, 0.52, 1.0],
        metallicFactor: 0.18,
        roughnessFactor: 0.34,
      },
      emissiveFactor: [0.03, 0.01, 0.06],
    },
    {
      name: 'PlumCarapace',
      pbrMetallicRoughness: {
        baseColorFactor: [0.43, 0.12, 0.31, 1.0],
        metallicFactor: 0.10,
        roughnessFactor: 0.46,
      },
      emissiveFactor: [0.04, 0.01, 0.03],
    },
    {
      name: 'DarkMembrane',
      pbrMetallicRoughness: {
        baseColorFactor: [0.14, 0.05, 0.16, 1.0],
        metallicFactor: 0.04,
        roughnessFactor: 0.68,
      },
    },
    {
      name: 'LuminousMint',
      pbrMetallicRoughness: {
        baseColorFactor: [0.34, 0.98, 0.76, 1.0],
        metallicFactor: 0.05,
        roughnessFactor: 0.20,
      },
      emissiveFactor: [0.26, 0.95, 0.68],
    },
    {
      name: 'TeamColor',
      pbrMetallicRoughness: {
        baseColorFactor: [0.95, 0.74, 0.20, 1.0],
        metallicFactor: 0.15,
        roughnessFactor: 0.35,
      },
      extras: { teamColor: true },
    },
  ];

  const bodyPrimitives = model.primitives.map((p) => packBucketPrimitive(p.bucket, p.material));
  const teamPrimitive = packBucketPrimitive(model.teamColorBucket, 4);

  const meshes = [
    { name: 'SiphonWyrmBody', primitives: bodyPrimitives },
    { name: 'TeamColorPanels', primitives: [teamPrimitive] },
  ];

  // Node layout:
  // 0: SiphonWyrm (scene root at [0,0,0])
  // 1..21: Skeleton joints (Root..Tail6)
  // 22: CastOrigin anchor (child of Head joint node 3)
  // 23: SiphonWyrmBody skinned mesh node
  // 24: TeamColorPanels skinned mesh node
  const nodes = [];
  const J_OFFSET = 1;
  const CAST_ORIGIN_NODE = J_OFFSET + model.jointDefs.length;
  const BODY_MESH_NODE = CAST_ORIGIN_NODE + 1;
  const TEAM_MESH_NODE = CAST_ORIGIN_NODE + 2;

  nodes.push({
    name: 'SiphonWyrm',
    children: [J_OFFSET, BODY_MESH_NODE, TEAM_MESH_NODE],
    extras: { footprintRadius: 2.19, groundY: 0 },
  });

  for (let j = 0; j < model.jointDefs.length; j++) {
    const jd = model.jointDefs[j];
    const children = [];
    for (let k = 0; k < model.jointDefs.length; k++) {
      if (model.jointDefs[k].parent === j) children.push(J_OFFSET + k);
    }
    if (jd.name === 'Head') children.push(CAST_ORIGIN_NODE);
    const t = model.localBindPos[j];
    const node = {
      name: jd.name,
      translation: [t[0], t[1], t[2]],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    };
    if (children.length > 0) node.children = children;
    nodes.push(node);
  }

  // CastOrigin positioned right between converging luminous mint siphon tendrils ahead of the maw
  const headBind = model.jointDefs[2].bind;
  nodes.push({
    name: 'CastOrigin',
    translation: [0.00 - headBind[0], 1.26 - headBind[1], 2.02 - headBind[2]],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });

  nodes.push({ name: 'SiphonWyrmBody', mesh: 0, skin: 0 });
  nodes.push({ name: 'TeamColorPanels', mesh: 1, skin: 0, extras: { teamColor: true } });

  // Skin inverseBindMatrices (column-major 4x4, exact inverse of world bind translation)
  const ibmArr = new Float32Array(model.jointDefs.length * 16);
  const jointIndices = [];
  for (let j = 0; j < model.jointDefs.length; j++) {
    jointIndices.push(J_OFFSET + j);
    const b = model.jointDefs[j].bind;
    const o = j * 16;
    ibmArr[o + 0] = 1; ibmArr[o + 5] = 1; ibmArr[o + 10] = 1; ibmArr[o + 15] = 1;
    ibmArr[o + 12] = -b[0];
    ibmArr[o + 13] = -b[1];
    ibmArr[o + 14] = -b[2];
  }
  const ibmAcc = addAccessor(ibmArr, 5126, 'MAT4', model.jointDefs.length, undefined, false);
  const skins = [{
    name: 'SiphonWyrmArmature',
    skeleton: J_OFFSET,
    joints: jointIndices,
    inverseBindMatrices: ibmAcc,
  }];

  // Pack animations
  const animations = model.clips.map((clip) => {
    const timeArr = new Float32Array(clip.data.times);
    const inputAcc = addAccessor(timeArr, 5126, 'SCALAR', timeArr.length, undefined, true);
    const samplers = [];
    const channels = [];

    for (let j = 0; j < model.jointDefs.length; j++) {
      const tr = clip.data.tracks.get(j);
      const nodeIdx = J_OFFSET + j;
      if (tr.hasTrans || j === 1) {
        const outAcc = addAccessor(new Float32Array(tr.trans), 5126, 'VEC3', timeArr.length, undefined, false);
        const sIdx = samplers.length;
        samplers.push({ input: inputAcc, interpolation: 'LINEAR', output: outAcc });
        channels.push({ sampler: sIdx, target: { node: nodeIdx, path: 'translation' } });
      }
      if (tr.hasRot || j === 1) {
        const outAcc = addAccessor(new Float32Array(tr.rot), 5126, 'VEC4', timeArr.length, undefined, false);
        const sIdx = samplers.length;
        samplers.push({ input: inputAcc, interpolation: 'LINEAR', output: outAcc });
        channels.push({ sampler: sIdx, target: { node: nodeIdx, path: 'rotation' } });
      }
    }
    return { name: clip.name, samplers, channels };
  });

  const binChunk = Buffer.concat(chunks);
  const gltf = {
    asset: { version: '2.0', generator: 'generate_gnarl_siphon_wyrm.cjs' },
    scene: 0,
    scenes: [{ name: 'StarfallSiphonWyrm', nodes: [0] }],
    nodes,
    meshes,
    materials,
    skins,
    animations,
    buffers: [{ byteLength: binChunk.length }],
    bufferViews,
    accessors,
  };

  const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunk = jsonPad > 0 ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;

  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

function main() {
  const outPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, 'siphon_wyrm.glb');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const model = buildSiphonWyrm();
  const glb = packGLB(model);
  fs.writeFileSync(outPath, glb);
}

if (require.main === module) {
  main();
}

module.exports = { buildSiphonWyrm, packGLB };
