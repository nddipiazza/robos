#!/usr/bin/env node
'use strict';

/**
 * Starfall Command Workshop — Meridian Factory Unit Asset Generator
 * Self-contained, zero-dependency, 100% deterministic glTF 2.0 Binary (.glb) generator.
 *
 * Units generated (Y-up, floor = 0, facing -Z):
 *   1. cinder_runner.glb          (radius 1.5625) - Compact tracked flame buggy
 *   2. cinder_guard.glb           (radius 1.5625) - Folded upright walker with big flame shrouds
 *   3. sentinel_mine.glb          (radius 1.25)   - Squat pod on articulated compact legs
 *   4. sentinel_mine_armed.glb    (radius 1.25)   - Mostly buried body, visible sensor/launch rings
 *   5. vortex_rover.glb           (radius 1.875)  - Low fast wheeled missile buggy, narrow tracking launcher
 *   6. atlas_walker.glb           (radius 2.03125)- Hulking 2-legged walker, 4 shoulder missile pods + paired ground cannons
 *   7. atlas_walker_precision.glb (radius 2.03125)- Shared Atlas body, replaces shoulder pods with 2 long heavy guns
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const OUTPUT_DIR = process.argv[2] || __dirname;

// ============================================================================
// 1. DETERMINISTIC LINEAR ALGEBRA & QUATERNION / IK UTILITIES
// ============================================================================

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function v3Add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function v3Sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function v3Scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function v3Lerp(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function v3Dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function v3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function v3Len(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function v3Norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
}

function quatIdentity() {
  return [0, 0, 0, 1];
}

function quatNorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  if (l < 1e-12) return [0, 0, 0, 1];
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

function quatConj(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

function quatMul(a, b) {
  return quatNorm([
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]);
}

function quatAxisAngle(axis, rad) {
  const n = v3Norm(axis);
  const h = rad * 0.5;
  const s = Math.sin(h);
  return quatNorm([n[0] * s, n[1] * s, n[2] * s, Math.cos(h)]);
}

// Intrinsic Y (yaw) -> X (pitch) -> Z (roll)
function quatYXZ(rx, ry, rz) {
  const qy = quatAxisAngle([0, 1, 0], ry);
  const qx = quatAxisAngle([1, 0, 0], rx);
  const qz = quatAxisAngle([0, 0, 1], rz);
  return quatMul(quatMul(qy, qx), qz);
}

function quatRotateVec(q, v) {
  const qv = [q[0], q[1], q[2]];
  const uv = v3Cross(qv, v);
  const uuv = v3Cross(qv, uv);
  return [
    v[0] + 2 * (q[3] * uv[0] + uuv[0]),
    v[1] + 2 * (q[3] * uv[1] + uuv[1]),
    v[2] + 2 * (q[3] * uv[2] + uuv[2]),
  ];
}

function quatSlerp(a, b, t) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    dot = -dot;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  if (dot > 0.9995) {
    return quatNorm([
      lerp(a[0], bx, t),
      lerp(a[1], by, t),
      lerp(a[2], bz, t),
      lerp(a[3], bw, t),
    ]);
  }
  const theta0 = Math.acos(clamp(dot, -1, 1));
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return quatNorm([
    s0 * a[0] + s1 * bx,
    s0 * a[1] + s1 * by,
    s0 * a[2] + s1 * bz,
    s0 * a[3] + s1 * bw,
  ]);
}

function mat4Identity() {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function mat4FromTRS(t, q, s) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const sx = s[0], sy = s[1], sz = s[2];
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx,       (xz - wy) * sx,       0,
    (xy - wz) * sy,       (1 - (xx + zz)) * sy, (yz + wx) * sy,       0,
    (xz + wy) * sz,       (yz - wx) * sz,       (1 - (xx + yy)) * sz, 0,
    t[0],                 t[1],                 t[2],                 1,
  ];
}

function mat4Mul(a, b) {
  const out = new Array(16);
  for (let col = 0; col < 4; col++) {
    const b0 = b[col * 4 + 0];
    const b1 = b[col * 4 + 1];
    const b2 = b[col * 4 + 2];
    const b3 = b[col * 4 + 3];
    out[col * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

function mat4TransformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8]  * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9]  * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

function mat4Det3x3(m) {
  return (
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[4] * (m[1] * m[10] - m[2] * m[9]) +
    m[8] * (m[1] * m[6]  - m[2] * m[5])
  );
}

function mat4TransformNormal(m, n) {
  // Inverse transpose of upper-left 3x3
  const a00 = m[0], a01 = m[4], a02 = m[8];
  const a10 = m[1], a11 = m[5], a12 = m[9];
  const a20 = m[2], a21 = m[6], a22 = m[10];
  const c00 = a11 * a22 - a12 * a21;
  const c01 = a12 * a20 - a10 * a22;
  const c02 = a10 * a21 - a11 * a20;
  const c10 = a02 * a21 - a01 * a22;
  const c11 = a00 * a22 - a02 * a20;
  const c12 = a01 * a20 - a00 * a21;
  const c20 = a01 * a12 - a02 * a11;
  const c21 = a02 * a10 - a00 * a12;
  const c22 = a00 * a11 - a01 * a10;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  const s = det < 0 ? -1 : 1;
  return v3Norm([
    (c00 * n[0] + c01 * n[1] + c02 * n[2]) * s,
    (c10 * n[0] + c11 * n[1] + c12 * n[2]) * s,
    (c20 * n[0] + c21 * n[1] + c22 * n[2]) * s,
  ]);
}

/**
 * Exact 3D Analytical 2-Bone Leg IK Solver with World Foot-Orientation Lock.
 * Upper segment along [0, -L1, 0], Lower segment along [0, -L2, 0], Foot sole at [0, -footH, 0].
 * bendSign = +1 for forward-knee (humanoid/walker), -1 for reverse-knee (digitigrade mech).
 */
function solveTwoBoneLegIK(cfg) {
  const {
    pelvisPos,
    pelvisRot,
    hipOffset,
    L1,
    L2,
    footH,
    soleWorldPos,
    footWorldRot,
    bendSign = 1,
  } = cfg;

  const hipWorld = v3Add(pelvisPos, quatRotateVec(pelvisRot, hipOffset));
  const ankleWorld = v3Add(soleWorldPos, quatRotateVec(footWorldRot, [0, footH, 0]));
  const diffWorld = v3Sub(ankleWorld, hipWorld);
  const diffLocal = quatRotateVec(quatConj(pelvisRot), diffWorld);

  const rawDist = v3Len(diffLocal);
  const minD = Math.abs(L1 - L2) + 0.015;
  const maxD = L1 + L2 - 0.015;
  const d = clamp(rawDist, minD, maxD);
  const u = rawDist > 1e-8 ? v3Scale(diffLocal, 1 / rawDist) : [0, -1, 0];

  const cosKneeInt = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  const kneeBend = Math.PI - Math.acos(cosKneeInt);
  const cosHipTri = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const hipTri = Math.acos(cosHipTri);

  // Decompose u = Rz(rollZ) * Rx(basePitch) * [0, -1, 0]
  const basePitch = Math.asin(clamp(-u[2], -1, 1));
  const rollZ = Math.atan2(u[0], Math.max(1e-6, -u[1]));

  const hipPitch = basePitch + bendSign * hipTri;
  const kneePitch = -bendSign * kneeBend;

  const qHip = quatMul(quatAxisAngle([0, 0, 1], rollZ), quatAxisAngle([1, 0, 0], hipPitch));
  const qKnee = quatAxisAngle([1, 0, 0], kneePitch);

  const qLegWorld = quatMul(pelvisRot, quatMul(qHip, qKnee));
  const qAnkle = quatMul(quatConj(qLegWorld), footWorldRot);

  return { qHip, qKnee, qAnkle };
}

// ============================================================================
// 2. MERIDIAN FACTORY MATERIAL PALETTE
// ============================================================================

const MATERIALS = [
  {
    name: 'Graphite_Primary',
    pbrMetallicRoughness: {
      baseColorFactor: [0.21, 0.23, 0.26, 1.0],
      metallicFactor: 0.52,
      roughnessFactor: 0.46,
    },
  },
  {
    name: 'Graphite_Dark',
    pbrMetallicRoughness: {
      baseColorFactor: [0.095, 0.105, 0.12, 1.0],
      metallicFactor: 0.62,
      roughnessFactor: 0.62,
    },
  },
  {
    name: 'Steel_Trim',
    pbrMetallicRoughness: {
      baseColorFactor: [0.46, 0.49, 0.54, 1.0],
      metallicFactor: 0.84,
      roughnessFactor: 0.30,
    },
  },
  {
    name: 'Amber_Caution',
    pbrMetallicRoughness: {
      baseColorFactor: [0.96, 0.63, 0.07, 1.0],
      metallicFactor: 0.18,
      roughnessFactor: 0.40,
    },
    emissiveFactor: [0.09, 0.045, 0.0],
  },
  {
    name: 'Amber_Glow',
    pbrMetallicRoughness: {
      baseColorFactor: [1.0, 0.76, 0.20, 1.0],
      metallicFactor: 0.08,
      roughnessFactor: 0.22,
    },
    emissiveFactor: [0.96, 0.54, 0.06],
  },
  {
    name: 'TeamColor',
    pbrMetallicRoughness: {
      baseColorFactor: [0.11, 0.50, 0.98, 1.0],
      metallicFactor: 0.22,
      roughnessFactor: 0.34,
    },
    emissiveFactor: [0.03, 0.11, 0.25],
  },
];

const MAT = Object.fromEntries(MATERIALS.map((m, i) => [m.name, i]));

// ============================================================================
// 3. PROCEDURAL HARD-SURFACE GEOMETRY BUILDER
// ============================================================================

class MeshAccumulator {
  constructor() {
    this.byMat = new Map();
    this.transformStack = [mat4Identity()];
  }

  pushTransform(m) {
    const top = this.transformStack[this.transformStack.length - 1];
    this.transformStack.push(mat4Mul(top, m));
  }

  pushTRS(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
    this.pushTransform(mat4FromTRS(t, q, s));
  }

  popTransform() {
    if (this.transformStack.length > 1) this.transformStack.pop();
  }

  withTRS(t, q, s, fn) {
    this.pushTRS(t, q, s);
    try {
      fn(this);
    } finally {
      this.popTransform();
    }
  }

  _bucket(matIdx) {
    let b = this.byMat.get(matIdx);
    if (!b) {
      b = { positions: [], normals: [], uvs: [], indices: [] };
      this.byMat.set(matIdx, b);
    }
    return b;
  }

  isEmpty() {
    for (const b of this.byMat.values()) {
      if (b.indices.length > 0) return false;
    }
    return true;
  }

  addTri(p0, p1, p2, matIdx, uv0 = [0, 0], uv1 = [1, 0], uv2 = [1, 1], customNormals = null) {
    const m = this.transformStack[this.transformStack.length - 1];
    const flip = mat4Det3x3(m) < 0;
    const tp0 = mat4TransformPoint(m, p0);
    const tp1 = mat4TransformPoint(m, flip ? p2 : p1);
    const tp2 = mat4TransformPoint(m, flip ? p1 : p2);

    const e1 = v3Sub(tp1, tp0);
    const e2 = v3Sub(tp2, tp0);
    const cross = v3Cross(e1, e2);
    const area2 = v3Len(cross);
    if (area2 < 1e-10) return;
    const fn = v3Scale(cross, 1 / area2);

    let n0 = fn, n1 = fn, n2 = fn;
    if (customNormals) {
      const cn0 = mat4TransformNormal(m, customNormals[0]);
      const cn1 = mat4TransformNormal(m, customNormals[flip ? 2 : 1]);
      const cn2 = mat4TransformNormal(m, customNormals[flip ? 1 : 2]);
      if (v3Dot(cn0, fn) > 0.05 && v3Dot(cn1, fn) > 0.05 && v3Dot(cn2, fn) > 0.05) {
        n0 = cn0; n1 = cn1; n2 = cn2;
      }
    }

    const tuv0 = uv0;
    const tuv1 = flip ? uv2 : uv1;
    const tuv2 = flip ? uv1 : uv2;

    const b = this._bucket(matIdx);
    const base = b.positions.length / 3;
    b.positions.push(tp0[0], tp0[1], tp0[2], tp1[0], tp1[1], tp1[2], tp2[0], tp2[1], tp2[2]);
    b.normals.push(n0[0], n0[1], n0[2], n1[0], n1[1], n1[2], n2[0], n2[1], n2[2]);
    b.uvs.push(tuv0[0], tuv0[1], tuv1[0], tuv1[1], tuv2[0], tuv2[1]);
    b.indices.push(base, base + 1, base + 2);
  }

  // Quad p0 -> p1 -> p2 -> p3 in CCW order viewed from outside
  addQuad(p0, p1, p2, p3, matIdx) {
    const u = v3Len(v3Sub(p1, p0));
    const v = v3Len(v3Sub(p3, p0));
    this.addTri(p0, p1, p2, matIdx, [0, 0], [u, 0], [u, v]);
    this.addTri(p0, p2, p3, matIdx, [0, 0], [u, v], [0, v]);
  }

  /**
   * Lofted multi-section prism.
   * Each section is an array of 3D points [p_0, ..., p_{N-1}] ordered CCW when viewed from the +end cap.
   */
  addLoft(sections, matIdx, capStart = true, capEnd = true, capMatStart = matIdx, capMatEnd = matIdx) {
    const nSec = sections.length;
    if (nSec < 2) return;
    const nPts = sections[0].length;
    for (let s = 0; s < nSec - 1; s++) {
      const A = sections[s];
      const B = sections[s + 1];
      for (let i = 0; i < nPts; i++) {
        const j = (i + 1) % nPts;
        this.addQuad(A[i], A[j], B[j], B[i], matIdx);
      }
    }
    if (capStart) {
      const S = sections[0];
      const c = S.reduce((acc, p) => v3Add(acc, p), [0, 0, 0]).map((v) => v / nPts);
      for (let i = 0; i < nPts; i++) {
        const j = (i + 1) % nPts;
        this.addTri(c, S[j], S[i], capMatStart);
      }
    }
    if (capEnd) {
      const E = sections[nSec - 1];
      const c = E.reduce((acc, p) => v3Add(acc, p), [0, 0, 0]).map((v) => v / nPts);
      for (let i = 0; i < nPts; i++) {
        const j = (i + 1) % nPts;
        this.addTri(c, E[i], E[j], capMatEnd);
      }
    }
  }

  /**
   * 8-point chamfered rectangle in XZ plane at height y (CCW when viewed from +Y).
   */
  static chamferRectXZ(cx, y, cz, hx, hz, ch = 0.04) {
    const c = Math.min(ch, hx * 0.48, hz * 0.48);
    return [
      [cx - hx + c, y, cz + hz],
      [cx + hx - c, y, cz + hz],
      [cx + hx,     y, cz + hz - c],
      [cx + hx,     y, cz - hz + c],
      [cx + hx - c, y, cz - hz],
      [cx - hx + c, y, cz - hz],
      [cx - hx,     y, cz - hz + c],
      [cx - hx,     y, cz + hz - c],
    ];
  }

  /**
   * 8-point chamfered rectangle in XY plane at z (CCW when viewed from +Z; so for -Z extrusion, order reversed or z decreasing).
   * Note: viewed from +Z, +X is right, +Y is up -> CCW is (+x,-y)->(+x,+y)->(-x,+y)->(-x,-y).
   */
  static chamferRectXY(cx, cy, z, hx, hy, ch = 0.04) {
    const c = Math.min(ch, hx * 0.48, hy * 0.48);
    return [
      [cx - hx + c, cy - hy,     z],
      [cx + hx - c, cy - hy,     z],
      [cx + hx,     cy - hy + c, z],
      [cx + hx,     cy + hy - c, z],
      [cx + hx - c, cy + hy,     z],
      [cx - hx + c, cy + hy,     z],
      [cx - hx,     cy + hy - c, z],
      [cx - hx,     cy - hy + c, z],
    ];
  }

  /**
   * Beveled industrial armor block centered at (cx, cy, cz) with full widths (sx, sy, sz).
   */
  addBeveledBox(cx, cy, cz, sx, sy, sz, bevel = 0.035, matIdx = MAT.Graphite_Primary) {
    const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
    const b = Math.min(bevel, hx * 0.42, hy * 0.42, hz * 0.42);
    if (b <= 1e-4) {
      const s0 = MeshAccumulator.chamferRectXZ(cx, cy - hy, cz, hx, hz, 0.0005);
      const s1 = MeshAccumulator.chamferRectXZ(cx, cy + hy, cz, hx, hz, 0.0005);
      this.addLoft([s0, s1], matIdx, true, true);
      return;
    }
    const secs = [
      MeshAccumulator.chamferRectXZ(cx, cy - hy,     cz, Math.max(0.002, hx - b), Math.max(0.002, hz - b), b * 0.8),
      MeshAccumulator.chamferRectXZ(cx, cy - hy + b, cz, hx, hz, b),
      MeshAccumulator.chamferRectXZ(cx, cy + hy - b, cz, hx, hz, b),
      MeshAccumulator.chamferRectXZ(cx, cy + hy,     cz, Math.max(0.002, hx - b), Math.max(0.002, hz - b), b * 0.8),
    ];
    this.addLoft(secs, matIdx, true, true);
  }

  /**
   * Sloped / tapered armor hull along Z (from zBack > zFront or z0 < z1).
   * Slices provided from rear (+Z max) to front (-Z min): to preserve outward CCW normals,
   * order slices from smaller Z (front) to larger Z (back)!
   */
  addHullAlongZ(slices, matIdx, capFront = true, capBack = true) {
    // Sort or require slices ordered from min Z to max Z
    const ordered = slices.slice().sort((a, b) => a.z - b.z);
    const secs = ordered.map((s) =>
      MeshAccumulator.chamferRectXY(s.cx || 0, s.cy || 0, s.z, s.hx, s.hy, s.ch ?? 0.04)
    );
    this.addLoft(secs, matIdx, capFront, capBack);
  }

  /**
   * Cylinder / frustum from p0 to p1 with optional recessed bore on p1 end.
   */
  addCylinder(p0, p1, r0, r1, segs = 12, matIdx = MAT.Steel_Trim, cap0 = true, cap1 = true) {
    const axis = v3Sub(p1, p0);
    const len = v3Len(axis);
    if (len < 1e-6) return;
    const w = v3Scale(axis, 1 / len);
    const ref = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = v3Norm(v3Cross(ref, w));
    const v = v3Cross(w, u);

    const ring0 = [];
    const ring1 = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const dir = [u[0] * ca + v[0] * sa, u[1] * ca + v[1] * sa, u[2] * ca + v[2] * sa];
      ring0.push(v3Add(p0, v3Scale(dir, r0)));
      ring1.push(v3Add(p1, v3Scale(dir, r1)));
    }
    this.addLoft([ring0, ring1], matIdx, cap0 && r0 > 1e-4, cap1 && r1 > 1e-4);
  }

  /**
   * Hollow cylindrical barrel / launch collar from p0 (breech/base) to p1 (muzzle/rim)
   * with physical recessed bore depth and optional inner core material!
   */
  addHollowBarrel(p0, p1, outerR0, outerR1, innerR, boreDepth, segs = 12, outerMat = MAT.Steel_Trim, innerMat = MAT.Graphite_Dark) {
    const axis = v3Sub(p1, p0);
    const len = v3Len(axis);
    if (len < 1e-6) return;
    const w = v3Scale(axis, 1 / len);
    const ref = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = v3Norm(v3Cross(ref, w));
    const v = v3Cross(w, u);
    const dBore = Math.min(boreDepth, len * 0.85);
    const pBore = v3Sub(p1, v3Scale(w, dBore));

    const rOut0 = [], rOut1 = [], rIn1 = [], rIn0 = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const dir = [u[0] * ca + v[0] * sa, u[1] * ca + v[1] * sa, u[2] * ca + v[2] * sa];
      rOut0.push(v3Add(p0, v3Scale(dir, outerR0)));
      rOut1.push(v3Add(p1, v3Scale(dir, outerR1)));
      rIn1.push(v3Add(p1, v3Scale(dir, innerR)));
      rIn0.push(v3Add(pBore, v3Scale(dir, innerR * 0.92)));
    }

    // Outer wall + base cap
    this.addLoft([rOut0, rOut1], outerMat, true, false);
    // Front muzzle rim annulus + inner bore wall + inner bore cap
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      this.addQuad(rOut1[i], rOut1[j], rIn1[j], rIn1[i], outerMat);
      this.addQuad(rIn1[i], rIn1[j], rIn0[j], rIn0[i], MAT.Graphite_Dark);
      this.addTri(pBore, rIn0[i], rIn0[j], innerMat);
    }
  }

  /**
   * Concentric polygonal ring (annulus extruded vertically from y0 to y1).
   */
  addRingY(cx, cz, y0, y1, rInner, rOuter, segs = 16, matIdx = MAT.Graphite_Primary, bevel = 0.015) {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU;
      const a1 = ((i + 1) / segs) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);

      const bi0 = [cx + c0 * rInner, y0, cz + s0 * rInner];
      const bi1 = [cx + c1 * rInner, y0, cz + s1 * rInner];
      const bo0 = [cx + c0 * rOuter, y0, cz + s0 * rOuter];
      const bo1 = [cx + c1 * rOuter, y0, cz + s1 * rOuter];

      const ti0 = [cx + c0 * (rInner + bevel), y1, cz + s0 * (rInner + bevel)];
      const ti1 = [cx + c1 * (rInner + bevel), y1, cz + s1 * (rInner + bevel)];
      const to0 = [cx + c0 * (rOuter - bevel), y1, cz + s0 * (rOuter - bevel)];
      const to1 = [cx + c1 * (rOuter - bevel), y1, cz + s1 * (rOuter - bevel)];

      // Outer wall (+normal outward: viewed from outside, a1 is left of a0? Let's check:
      // At a0=0 (+X), a1>0 (+Z): bo0=(R,y0,0), bo1=(R,y0,+z). (bo1-bo0)x(to0-bo0) = (0,0,+z)x(0,+y,0) = (-zy,0,0) = -X!
      // So outward normal +X needs bo1 -> bo0 -> to0 -> to1!)
      this.addQuad(bo1, bo0, to0, to1, matIdx);
      // Inner wall (normal -X inward: bi0 -> bi1 -> ti1 -> ti0)
      this.addQuad(bi0, bi1, ti1, ti0, matIdx);
      // Top face (+Y normal: to1 -> to0 -> ti0 -> ti1)
      this.addQuad(to1, to0, ti0, ti1, matIdx);
      // Bottom face (-Y normal: bo0 -> bo1 -> bi1 -> bi0)
      this.addQuad(bo0, bo1, bi1, bi0, matIdx);
    }
  }

  /**
   * Arc segment of a ring (from angleStart to angleEnd, radians in XZ plane).
   */
  addArcPlateY(cx, cz, y0, y1, rInner, rOuter, aStart, aEnd, segs = 6, matIdx = MAT.TeamColor) {
    const ptsBotIn = [], ptsBotOut = [], ptsTopIn = [], ptsTopOut = [];
    for (let i = 0; i <= segs; i++) {
      const a = lerp(aStart, aEnd, i / segs);
      const ca = Math.cos(a), sa = Math.sin(a);
      ptsBotIn.push([cx + ca * rInner, y0, cz + sa * rInner]);
      ptsBotOut.push([cx + ca * rOuter, y0, cz + sa * rOuter]);
      ptsTopIn.push([cx + ca * (rInner + 0.012), y1, cz + sa * (rInner + 0.012)]);
      ptsTopOut.push([cx + ca * (rOuter - 0.012), y1, cz + sa * (rOuter - 0.012)]);
    }
    for (let i = 0; i < segs; i++) {
      this.addQuad(ptsBotOut[i + 1], ptsBotOut[i], ptsTopOut[i], ptsTopOut[i + 1], matIdx);
      this.addQuad(ptsBotIn[i], ptsBotIn[i + 1], ptsTopIn[i + 1], ptsTopIn[i], matIdx);
      this.addQuad(ptsTopOut[i + 1], ptsTopOut[i], ptsTopIn[i], ptsTopIn[i + 1], matIdx);
      this.addQuad(ptsBotOut[i], ptsBotOut[i + 1], ptsBotIn[i + 1], ptsBotIn[i], matIdx);
    }
    // Start & end caps
    this.addQuad(ptsBotOut[0], ptsBotIn[0], ptsTopIn[0], ptsTopOut[0], matIdx);
    this.addQuad(ptsBotIn[segs], ptsBotOut[segs], ptsTopOut[segs], ptsTopIn[segs], matIdx);
  }

  /**
   * Raised caution hazard bar row (alternating Amber_Caution & Graphite_Dark blocks).
   */
  addCautionRowZ(cx, cy, zStart, zEnd, widthX, heightY, count = 5) {
    const step = (zEnd - zStart) / count;
    for (let i = 0; i < count; i++) {
      const zc = zStart + (i + 0.5) * step;
      const mat = i % 2 === 0 ? MAT.Amber_Caution : MAT.Graphite_Dark;
      this.addBeveledBox(cx, cy, zc, widthX, heightY, Math.abs(step) * 0.92, 0.008, mat);
    }
  }

  addCautionRowX(xStart, xEnd, cy, cz, heightY, depthZ, count = 5) {
    const step = (xEnd - xStart) / count;
    for (let i = 0; i < count; i++) {
      const xc = xStart + (i + 0.5) * step;
      const mat = i % 2 === 0 ? MAT.Amber_Caution : MAT.Graphite_Dark;
      this.addBeveledBox(xc, cy, cz, Math.abs(step) * 0.92, heightY, depthZ, 0.008, mat);
    }
  }

  /**
   * Off-road spoked rover wheel centered at (0,0,0), axle along X, outer radius R.
   */
  addRoverWheel(radius, width, segs = 16) {
    const hw = width * 0.5;
    // Main tire carcass
    this.addCylinder([-hw * 0.88, 0, 0], [hw * 0.88, 0, 0], radius * 0.94, radius * 0.94, segs, MAT.Graphite_Dark);
    this.addCylinder([-hw, 0, 0], [-hw * 0.84, 0, 0], radius * 0.80, radius * 0.94, segs, MAT.Graphite_Dark);
    this.addCylinder([hw * 0.84, 0, 0], [hw, 0, 0], radius * 0.94, radius * 0.80, segs, MAT.Graphite_Dark);

    // Aggressive off-road tread lugs around perimeter (touching exact `radius`!)
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU;
      const q = quatAxisAngle([1, 0, 0], a);
      this.withTRS([0, 0, 0], q, [1, 1, 1], (b) => {
        b.addBeveledBox(0, radius * 0.955, 0, width * 0.86, radius * 0.09, radius * 0.20, 0.0, MAT.Graphite_Dark);
      });
    }

    // Recessed Steel_Trim rim & 6 spokes on both sides
    this.addCylinder([-hw * 0.92, 0, 0], [hw * 0.92, 0, 0], radius * 0.56, radius * 0.56, 12, MAT.Graphite_Primary);
    for (let s = 0; s < 6; s++) {
      const q = quatAxisAngle([1, 0, 0], (s / 6) * TAU);
      this.withTRS([0, 0, 0], q, [1, 1, 1], (b) => {
        b.addBeveledBox(hw * 0.86, radius * 0.28, 0, 0.04, radius * 0.48, 0.055, 0.008, MAT.Steel_Trim);
        b.addBeveledBox(-hw * 0.86, radius * 0.28, 0, 0.04, radius * 0.48, 0.055, 0.008, MAT.Steel_Trim);
      });
    }
    // Center hubcap + amber lug ring
    this.addCylinder([-hw * 1.02, 0, 0], [hw * 1.02, 0, 0], radius * 0.22, radius * 0.22, 10, MAT.Steel_Trim);
    this.addCylinder([hw * 1.00, 0, 0], [hw * 1.05, 0, 0], radius * 0.11, radius * 0.11, 8, MAT.Amber_Caution);
    this.addCylinder([-hw * 1.05, 0, 0], [-hw * 1.00, 0, 0], radius * 0.11, radius * 0.11, 8, MAT.Amber_Caution);
  }
}

// ============================================================================
// 4. SCENE GRAPH & DETERMINISTIC GLB SERIALIZER
// ============================================================================

class SceneBuilder {
  constructor(unitName) {
    this.unitName = unitName;
    this.nodes = [];
    this.nodeByName = new Map();
    this.animations = [];
  }

  addNode(name, parentIdx = null, opts = {}) {
    if (this.nodeByName.has(name)) {
      throw new Error(`Duplicate node name "${name}" in ${this.unitName}`);
    }
    const idx = this.nodes.length;
    const node = {
      idx,
      name,
      parentIdx,
      children: [],
      translation: opts.translation ? opts.translation.slice() : [0, 0, 0],
      rotation: opts.rotation ? quatNorm(opts.rotation) : [0, 0, 0, 1],
      scale: opts.scale ? opts.scale.slice() : [1, 1, 1],
      geo: new MeshAccumulator(),
      teamGeo: new MeshAccumulator(),
      isTeamNode: Boolean(opts.isTeamNode),
    };
    this.nodes.push(node);
    this.nodeByName.set(name, node);
    if (parentIdx !== null) {
      this.nodes[parentIdx].children.push(idx);
    }
    return node;
  }

  addMuzzle(name, parentIdx, pos) {
    return this.addNode(name, parentIdx, { translation: pos });
  }

  /**
   * Finalizes companion TeamColor child nodes for any node whose `teamGeo` is populated,
   * ensuring TeamColor plates have BOTH material name "TeamColor" AND node/mesh name "TeamColor_*".
   */
  finalizeTeamColorNodes() {
    const initialCount = this.nodes.length;
    for (let i = 0; i < initialCount; i++) {
      const n = this.nodes[i];
      if (!n.teamGeo.isEmpty()) {
        const tcName = n.name.startsWith('TeamColor') ? `${n.name}_Plates` : `TeamColor_${n.name}`;
        const tcNode = this.addNode(tcName, n.idx, { isTeamNode: true });
        tcNode.geo = n.teamGeo;
        n.teamGeo = new MeshAccumulator();
      }
    }
  }

  /**
   * Evaluates world-space minimum Y across all geometry given a map of node TRS overrides.
   */
  computePosedMinY(overridesMap) {
    const worldMats = new Array(this.nodes.length);
    const visit = (idx, parentMat) => {
      const n = this.nodes[idx];
      const ov = overridesMap.get(n.name);
      const t = ov ? ov.t : n.translation;
      const r = ov ? ov.r : n.rotation;
      const s = ov ? ov.s : n.scale;
      const wm = mat4Mul(parentMat, mat4FromTRS(t, r, s));
      worldMats[idx] = wm;
      for (const c of n.children) visit(c, wm);
    };
    for (const n of this.nodes) {
      if (n.parentIdx === null) visit(n.idx, mat4Identity());
    }

    let minY = Infinity;
    for (const n of this.nodes) {
      const wm = worldMats[n.idx];
      for (const b of [n.geo, n.teamGeo]) {
        for (const bucket of b.byMat.values()) {
          const pos = bucket.positions;
          for (let i = 0; i < pos.length; i += 3) {
            const wy = wm[1] * pos[i] + wm[5] * pos[i + 1] + wm[9] * pos[i + 2] + wm[13];
            if (wy < minY) minY = wy;
          }
        }
      }
    }
    return minY;
  }

  /**
   * Add an animation clip built by sampling a procedural pose function at uniform frame intervals,
   * guaranteeing smooth trajectories, shortest-arc SLERP, physical floor contact (minY >= 0),
   * and exact loop closure when loop=true.
   */
  addSampledClip(clipName, duration, fps, animatedNodeNames, poseFn, loop = false) {
    const steps = Math.max(2, Math.round(duration * fps));
    const times = [];
    for (let s = 0; s <= steps; s++) {
      times.push((s / steps) * duration);
    }

    const nodeList = animatedNodeNames.includes('Root')
      ? animatedNodeNames
      : ['Root', ...animatedNodeNames];

    const tracks = new Map();
    for (const name of nodeList) {
      const node = this.nodeByName.get(name);
      if (!node) throw new Error(`Clip "${clipName}" references missing node "${name}"`);
      tracks.set(name, {
        node,
        T: [],
        R: [],
        S: [],
      });
    }

    for (let s = 0; s <= steps; s++) {
      const isLast = s === steps;
      const u = isLast && loop ? 0 : s / steps;
      const t = times[s];
      const overrides = poseFn(u, t, duration) || {};
      const frameMap = new Map();

      for (const [name, trk] of tracks.entries()) {
        const ov = overrides[name] || {};
        const trans = ov.t ? ov.t.slice() : trk.node.translation.slice();
        let rot = ov.r ? quatNorm(ov.r) : trk.node.rotation.slice();
        const scl = ov.s ? ov.s.slice() : trk.node.scale.slice();

        // Enforce quaternion hemisphere continuity for shortest-path SLERP
        if (trk.R.length > 0) {
          const prev = trk.R[trk.R.length - 1];
          if (prev[0] * rot[0] + prev[1] * rot[1] + prev[2] * rot[2] + prev[3] * rot[3] < 0) {
            rot = [-rot[0], -rot[1], -rot[2], -rot[3]];
          }
        }
        frameMap.set(name, { t: trans, r: rot, s: scl });
      }

      // Enforce physical floor support at Y = 0 so collapsed/animated parts never sink below floor 0
      const posedMinY = this.computePosedMinY(frameMap);
      if (posedMinY < -1e-4 && frameMap.has('Root')) {
        frameMap.get('Root').t[1] += -posedMinY;
      }

      for (const [name, trk] of tracks.entries()) {
        const f = frameMap.get(name);
        trk.T.push(f.t);
        trk.R.push(f.r);
        trk.S.push(f.s);
      }
    }

    const channels = [];
    for (const trk of tracks.values()) {
      const baseT = trk.node.translation;
      const baseR = trk.node.rotation;
      const baseS = trk.node.scale;

      const hasT = trk.T.some((v) => v3Len(v3Sub(v, baseT)) > 1e-5);
      const hasR = trk.R.some((q) => 1 - Math.abs(q[0] * baseR[0] + q[1] * baseR[1] + q[2] * baseR[2] + q[3] * baseR[3]) > 1e-6);
      const hasS = trk.S.some((v) => v3Len(v3Sub(v, baseS)) > 1e-5);

      if (hasT) channels.push({ nodeIdx: trk.node.idx, path: 'translation', values: trk.T });
      if (hasR) channels.push({ nodeIdx: trk.node.idx, path: 'rotation', values: trk.R });
      if (hasS) channels.push({ nodeIdx: trk.node.idx, path: 'scale', values: trk.S });
    }

    // Ensure at least one channel exists per clip
    if (channels.length === 0) {
      const root = this.nodes[0];
      channels.push({
        nodeIdx: root.idx,
        path: 'translation',
        values: times.map(() => root.translation.slice()),
      });
    }

    this.animations.push({ name: clipName, times, channels });
  }

  /**
   * Computes rest-pose world bounds for verification before serialization.
   */
  computeRestBounds() {
    const worldMats = new Array(this.nodes.length);
    const visit = (idx, parentMat) => {
      const n = this.nodes[idx];
      const local = mat4FromTRS(n.translation, n.rotation, n.scale);
      const wm = mat4Mul(parentMat, local);
      worldMats[idx] = wm;
      for (const c of n.children) visit(c, wm);
    };
    for (const n of this.nodes) {
      if (n.parentIdx === null) visit(n.idx, mat4Identity());
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let maxXZR = 0;
    let triCount = 0;

    for (const n of this.nodes) {
      const wm = worldMats[n.idx];
      for (const b of [n.geo, n.teamGeo]) {
        for (const bucket of b.byMat.values()) {
          const pos = bucket.positions;
          triCount += bucket.indices.length / 3;
          for (let i = 0; i < pos.length; i += 3) {
            const wp = mat4TransformPoint(wm, [pos[i], pos[i + 1], pos[i + 2]]);
            if (wp[0] < minX) minX = wp[0];
            if (wp[0] > maxX) maxX = wp[0];
            if (wp[1] < minY) minY = wp[1];
            if (wp[1] > maxY) maxY = wp[1];
            if (wp[2] < minZ) minZ = wp[2];
            if (wp[2] > maxZ) maxZ = wp[2];
            const r = Math.hypot(wp[0], wp[2]);
            if (r > maxXZR) maxXZR = r;
          }
        }
      }
    }
    return { minX, maxX, minY, maxY, minZ, maxZ, maxXZR, triCount };
  }

  toGLB() {
    this.finalizeTeamColorNodes();

    const bufferViews = [];
    const accessors = [];
    const binChunks = [];
    let byteOffset = 0;

    const appendBytes = (buf, target) => {
      const pad = (4 - (buf.length % 4)) % 4;
      const aligned = pad > 0 ? Buffer.concat([buf, Buffer.alloc(pad, 0)]) : buf;
      const bv = { buffer: 0, byteOffset, byteLength: buf.length };
      if (target !== undefined) bv.target = target;
      const bvIdx = bufferViews.length;
      bufferViews.push(bv);
      binChunks.push(aligned);
      byteOffset += aligned.length;
      return bvIdx;
    };

    const addFloatAccessor = (floats, numComp, typeStr, target, includeMinMax = false) => {
      const f32 = new Float32Array(floats.length);
      for (let i = 0; i < floats.length; i++) f32[i] = floats[i];
      const count = f32.length / numComp;
      const bvIdx = appendBytes(Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength), target);
      const acc = {
        bufferView: bvIdx,
        componentType: 5126, // FLOAT
        count,
        type: typeStr,
      };
      if (includeMinMax) {
        const min = new Array(numComp).fill(Infinity);
        const max = new Array(numComp).fill(-Infinity);
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < numComp; c++) {
            const v = f32[i * numComp + c];
            if (v < min[c]) min[c] = v;
            if (v > max[c]) max[c] = v;
          }
        }
        acc.min = min;
        acc.max = max;
      }
      const accIdx = accessors.length;
      accessors.push(acc);
      return accIdx;
    };

    const addIndexAccessor = (indices) => {
      let maxIdx = 0;
      for (let i = 0; i < indices.length; i++) if (indices[i] > maxIdx) maxIdx = indices[i];
      const useU32 = maxIdx > 65534;
      const arr = useU32 ? new Uint32Array(indices) : new Uint16Array(indices);
      const bvIdx = appendBytes(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), 34963);
      const accIdx = accessors.length;
      accessors.push({
        bufferView: bvIdx,
        componentType: useU32 ? 5125 : 5123,
        count: arr.length,
        type: 'SCALAR',
        min: [0],
        max: [maxIdx],
      });
      return accIdx;
    };

    const meshes = [];
    const gltfNodes = [];

    for (const n of this.nodes) {
      let meshIdx = undefined;
      if (!n.geo.isEmpty()) {
        const primitives = [];
        const sortedMats = Array.from(n.geo.byMat.keys()).sort((a, b) => a - b);
        for (const matIdx of sortedMats) {
          const b = n.geo.byMat.get(matIdx);
          if (!b || b.indices.length === 0) continue;
          // Re-normalize float32 normals strictly
          const normF = new Array(b.normals.length);
          for (let i = 0; i < b.normals.length; i += 3) {
            const nx = Math.fround(b.normals[i]);
            const ny = Math.fround(b.normals[i + 1]);
            const nz = Math.fround(b.normals[i + 2]);
            const l = Math.hypot(nx, ny, nz) || 1;
            normF[i] = nx / l;
            normF[i + 1] = ny / l;
            normF[i + 2] = nz / l;
          }
          const posAcc = addFloatAccessor(b.positions, 3, 'VEC3', 34962, true);
          const nrmAcc = addFloatAccessor(normF, 3, 'VEC3', 34962, false);
          const uvAcc = addFloatAccessor(b.uvs, 2, 'VEC2', 34962, false);
          const idxAcc = addIndexAccessor(b.indices);
          primitives.push({
            attributes: {
              POSITION: posAcc,
              NORMAL: nrmAcc,
              TEXCOORD_0: uvAcc,
            },
            indices: idxAcc,
            material: n.isTeamNode ? MAT.TeamColor : matIdx,
          });
        }
        if (primitives.length > 0) {
          meshIdx = meshes.length;
          meshes.push({
            name: `${n.name}_Mesh`,
            primitives,
          });
        }
      }

      const gn = {
        name: n.name,
        translation: n.translation.map((v) => Number(v.toFixed(6))),
        rotation: quatNorm(n.rotation).map((v) => Number(v.toFixed(7))),
        scale: n.scale.map((v) => Number(v.toFixed(6))),
      };
      // Re-normalize quantized rotation in float32
      const qn = quatNorm(gn.rotation);
      gn.rotation = [Math.fround(qn[0]), Math.fround(qn[1]), Math.fround(qn[2]), Math.fround(qn[3])];
      if (n.children.length > 0) gn.children = n.children.slice();
      if (meshIdx !== undefined) gn.mesh = meshIdx;
      gltfNodes.push(gn);
    }

    const gltfAnimations = [];
    for (const anim of this.animations) {
      const timeAcc = addFloatAccessor(anim.times, 1, 'SCALAR', undefined, true);
      const samplers = [];
      const channels = [];
      for (const ch of anim.channels) {
        let flat = [];
        let numComp = 3;
        let typeStr = 'VEC3';
        if (ch.path === 'rotation') {
          numComp = 4;
          typeStr = 'VEC4';
          for (const q of ch.values) {
            const qn = quatNorm(q);
            flat.push(qn[0], qn[1], qn[2], qn[3]);
          }
        } else {
          for (const v of ch.values) {
            flat.push(v[0], v[1], v[2]);
          }
        }
        const outAcc = addFloatAccessor(flat, numComp, typeStr, undefined, false);
        const sIdx = samplers.length;
        samplers.push({
          input: timeAcc,
          interpolation: 'LINEAR',
          output: outAcc,
        });
        channels.push({
          sampler: sIdx,
          target: {
            node: ch.nodeIdx,
            path: ch.path,
          },
        });
      }
      gltfAnimations.push({
        name: anim.name,
        samplers,
        channels,
      });
    }

    const rootNodes = this.nodes.filter((n) => n.parentIdx === null).map((n) => n.idx);

    const gltf = {
      asset: {
        version: '2.0',
        generator: 'Starfall-Meridian-Factory-Deterministic-Generator-1.0',
      },
      scene: 0,
      scenes: [
        {
          name: `${this.unitName}_Scene`,
          nodes: rootNodes,
        },
      ],
      nodes: gltfNodes,
      materials: MATERIALS,
      meshes,
      animations: gltfAnimations,
      bufferViews,
      accessors,
      buffers: [
        {
          byteLength: byteOffset,
        },
      ],
    };

    const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
    const jsonChunk = jsonPad > 0 ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;
    const binChunk = Buffer.concat(binChunks);

    const totalLen = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); // "glTF"
    header.writeUInt32LE(2, 4);          // version 2
    header.writeUInt32LE(totalLen, 8);

    const jsonHdr = Buffer.alloc(8);
    jsonHdr.writeUInt32LE(jsonChunk.length, 0);
    jsonHdr.writeUInt32LE(0x4e4f534a, 4); // "JSON"

    const binHdr = Buffer.alloc(8);
    binHdr.writeUInt32LE(binChunk.length, 0);
    binHdr.writeUInt32LE(0x004e4942, 4); // "BIN\0"

    return Buffer.concat([header, jsonHdr, jsonChunk, binHdr, binChunk]);
  }
}

// ============================================================================
// 5. SHARED MERIDIAN FACTORY MODULAR SUB-ASSEMBLIES
// ============================================================================

/**
 * Shared Cinder Equipment (used identically on `cinder_runner` and `cinder_guard`):
 *  - Core Workshop Cab & Twin Promethium Fuel Canisters
 *  - Articulated Track Pod (doubles as upright walker leg!)
 *  - Heavy Flame Shroud Plate (tucked on runner, unfolded wide on guard!)
 *  - Dorsal Twin Flame Projector Turret + Muzzle_Main / Muzzle_Flame_L / Muzzle_Flame_R
 */
function populateCinderCoreChassis(chassisNode) {
  const g = chassisNode.geo;
  const tc = chassisNode.teamGeo;

  // Main faceted industrial hull (-Z prow to +Z fuel cradle)
  g.addHullAlongZ([
    { z: -1.16, cx: 0, cy: 0.02, hx: 0.34, hy: 0.14, ch: 0.05 },
    { z: -0.82, cx: 0, cy: 0.08, hx: 0.54, hy: 0.24, ch: 0.07 },
    { z: -0.15, cx: 0, cy: 0.12, hx: 0.58, hy: 0.28, ch: 0.08 },
    { z:  0.55, cx: 0, cy: 0.10, hx: 0.56, hy: 0.26, ch: 0.08 },
    { z:  1.06, cx: 0, cy: 0.06, hx: 0.46, hy: 0.20, ch: 0.06 },
  ], MAT.Graphite_Primary);

  // Dark undercarriage skid frame & hip axle spine
  g.addBeveledBox(0, -0.14, -0.05, 0.96, 0.16, 1.72, 0.03, MAT.Graphite_Dark);
  g.addCylinder([-0.74, -0.08, -0.35], [0.74, -0.08, -0.35], 0.11, 0.11, 10, MAT.Steel_Trim);
  g.addCylinder([-0.74, -0.08,  0.42], [0.74, -0.08,  0.42], 0.11, 0.11, 10, MAT.Steel_Trim);

  // Front bash bumper + Amber_Caution hazard bar + glowing cockpit visor
  g.addBeveledBox(0, -0.04, -1.21, 0.72, 0.15, 0.14, 0.03, MAT.Steel_Trim);
  g.addCautionRowX(-0.32, 0.32, -0.04, -1.27, 0.10, 0.05, 5);
  g.addBeveledBox(0, 0.19, -0.90, 0.62, 0.09, 0.22, 0.02, MAT.Amber_Glow);
  g.addBeveledBox(0, 0.25, -0.86, 0.68, 0.05, 0.26, 0.015, MAT.Graphite_Dark);

  // Bold readable TeamColor dorsal prow chevron & side cowls
  tc.addHullAlongZ([
    { z: -1.04, cx: 0, cy: 0.16, hx: 0.24, hy: 0.035, ch: 0.02 },
    { z: -0.52, cx: 0, cy: 0.33, hx: 0.44, hy: 0.045, ch: 0.03 },
    { z: -0.26, cx: 0, cy: 0.38, hx: 0.46, hy: 0.045, ch: 0.03 },
  ], MAT.TeamColor);
  for (const sx of [-1, 1]) {
    tc.addBeveledBox(sx * 0.56, 0.18, 0.02, 0.08, 0.20, 0.64, 0.02, MAT.TeamColor);
  }

  // Twin Rear Pressurized Promethium Fuel Canisters (shared iconic workshop silhouette)
  for (const sx of [-1, 1]) {
    const tx = sx * 0.28;
    g.addCylinder([tx, 0.26, 0.38], [tx, 0.36, 1.18], 0.21, 0.20, 12, MAT.Graphite_Dark);
    // Amber pressure bands around fuel drums
    g.addCylinder([tx, 0.285, 0.58], [tx, 0.30, 0.70], 0.222, 0.222, 12, MAT.Amber_Caution);
    g.addCylinder([tx, 0.325, 0.90], [tx, 0.34, 1.02], 0.215, 0.215, 12, MAT.Amber_Caution);
    // Rear pressure cap & glow gauge
    g.addCylinder([tx, 0.36, 1.18], [tx, 0.37, 1.25], 0.14, 0.11, 10, MAT.Steel_Trim);
    g.addCylinder([tx, 0.37, 1.25], [tx, 0.375, 1.28], 0.06, 0.06, 8, MAT.Amber_Glow);
    // Feed manifold pipe into turret deck
    g.addCylinder([tx, 0.38, 0.42], [sx * 0.18, 0.42, 0.05], 0.045, 0.045, 8, MAT.Steel_Trim);
  }
}

/**
 * Shared Cinder Twin Flame Projector Turret.
 */
function buildCinderTurret(scene, parentIdx, basePos) {
  const yawNode = scene.addNode('Turret_Yaw', parentIdx, { translation: basePos });
  yawNode.geo.addCylinder([0, -0.04, 0], [0, 0.12, 0], 0.38, 0.34, 12, MAT.Graphite_Dark);
  yawNode.geo.addBeveledBox(0, 0.18, 0.06, 0.62, 0.22, 0.58, 0.04, MAT.Graphite_Primary);
  yawNode.teamGeo.addBeveledBox(0, 0.31, 0.08, 0.50, 0.07, 0.46, 0.025, MAT.TeamColor);

  const pitchNode = scene.addNode('Projector_Pitch', yawNode.idx, { translation: [0, 0.20, -0.06] });
  const pg = pitchNode.geo;

  // Breech manifold & caution collar
  pg.addBeveledBox(0, 0, -0.10, 0.58, 0.22, 0.36, 0.035, MAT.Graphite_Primary);
  pg.addBeveledBox(0, 0.13, -0.12, 0.44, 0.06, 0.24, 0.015, MAT.Amber_Caution);

  // Twin heavy perforated flame projector barrels + pilot igniter
  for (const sx of [-1, 1]) {
    const bx = sx * 0.175;
    pg.addCylinder([bx, 0.01, -0.24], [bx, 0.01, -0.78], 0.105, 0.095, 10, MAT.Steel_Trim);
    // Thermal shroud rings
    pg.addCylinder([bx, 0.01, -0.44], [bx, 0.01, -0.52], 0.118, 0.118, 10, MAT.Graphite_Dark);
    pg.addCylinder([bx, 0.01, -0.64], [bx, 0.01, -0.72], 0.115, 0.115, 10, MAT.Amber_Caution);
    // Flared nozzle + glowing thermal core
    pg.addHollowBarrel([bx, 0.01, -0.78], [bx, 0.01, -0.98], 0.095, 0.125, 0.075, 0.14, 10, MAT.Graphite_Dark, MAT.Amber_Glow);
  }
  // Underslung pilot flame igniter rod
  pg.addCylinder([0, -0.09, -0.25], [0, -0.08, -0.96], 0.03, 0.022, 8, MAT.Steel_Trim);
  pg.addCylinder([0, -0.08, -0.96], [0, -0.07, -1.04], 0.028, 0.016, 8, MAT.Amber_Glow);

  scene.addMuzzle('Muzzle_Main', pitchNode.idx, [0, 0.01, -1.02]);
  scene.addMuzzle('Muzzle_Flame_L', pitchNode.idx, [-0.175, 0.01, -1.00]);
  scene.addMuzzle('Muzzle_Flame_R', pitchNode.idx, [0.175, 0.01, -1.00]);

  return { yawNode, pitchNode };
}

/**
 * Shared Cinder Flame Shroud Assembly (side = -1 for Left, +1 for Right).
 * Large faceted industrial heat-shield wing with bold TeamColor outer plates & Amber_Caution blast baffles.
 */
function populateCinderShroud(shroudNode, side) {
  const g = shroudNode.geo;
  const tc = shroudNode.teamGeo;

  // Hinge arm
  g.addBeveledBox(side * 0.10, 0, 0, 0.24, 0.16, 0.24, 0.025, MAT.Steel_Trim);

  // Main curved/angled heavy blast shroud wing
  g.addHullAlongZ([
    { z: -0.68, cx: side * 0.20, cy: -0.02, hx: 0.08, hy: 0.36, ch: 0.03 },
    { z: -0.22, cx: side * 0.25, cy:  0.02, hx: 0.10, hy: 0.48, ch: 0.04 },
    { z:  0.32, cx: side * 0.23, cy:  0.04, hx: 0.09, hy: 0.44, ch: 0.04 },
    { z:  0.66, cx: side * 0.18, cy:  0.02, hx: 0.07, hy: 0.30, ch: 0.03 },
  ], MAT.Graphite_Primary);

  // Broad TeamColor outer & upper beveled shield plate (super readable from RTS camera!)
  tc.addHullAlongZ([
    { z: -0.56, cx: side * 0.27, cy: 0.08, hx: 0.045, hy: 0.26, ch: 0.02 },
    { z: -0.10, cx: side * 0.33, cy: 0.12, hx: 0.05,  hy: 0.35, ch: 0.025 },
    { z:  0.42, cx: side * 0.30, cy: 0.12, hx: 0.045, hy: 0.30, ch: 0.02 },
  ], MAT.TeamColor);
  // Upper dorsal crest TeamColor strip (visible even when shroud is vertical!)
  tc.addBeveledBox(side * 0.23, 0.50, -0.02, 0.15, 0.08, 0.86, 0.02, MAT.TeamColor);

  // Leading-edge Amber_Caution blast-deflector bezel & thermal glow louver
  g.addBeveledBox(side * 0.20, 0.0, -0.71, 0.13, 0.62, 0.08, 0.02, MAT.Amber_Caution);
  g.addBeveledBox(side * 0.15, 0.02, -0.45, 0.05, 0.42, 0.10, 0.015, MAT.Amber_Glow);
  g.addBeveledBox(side * 0.21, -0.44, -0.05, 0.14, 0.08, 0.92, 0.02, MAT.Graphite_Dark);
}

/**
 * Shared Cinder Track Pod (in horizontal track-frame space: bottom of treads at y = -0.22, length along Z).
 */
function populateCinderTrackPod(podNode, side, wheelNodes = []) {
  const g = podNode.geo;
  const tc = podNode.teamGeo;

  // Armored outer track fender & inner bogie beam
  g.addBeveledBox(0, 0.05, 0, 0.36, 0.22, 1.92, 0.04, MAT.Graphite_Primary);
  tc.addBeveledBox(side * 0.16, 0.14, -0.05, 0.08, 0.09, 1.10, 0.02, MAT.TeamColor);
  g.addBeveledBox(side * 0.18, 0.04, -0.78, 0.07, 0.12, 0.24, 0.015, MAT.Amber_Caution);

  // Continuous caterpillar track belt (bottom strictly flat at local y = -0.22!)
  const treadProfile = [
    { z: -1.11, cy:  0.02, hy: 0.13, hx: 0.18 },
    { z: -0.88, cy: -0.03, hy: 0.19, hx: 0.195 },
    { z:  0.00, cy: -0.03, hy: 0.19, hx: 0.195 },
    { z:  0.86, cy: -0.03, hy: 0.19, hx: 0.195 },
    { z:  1.09, cy:  0.02, hy: 0.13, hx: 0.18 },
  ];
  g.addHullAlongZ(treadProfile, MAT.Graphite_Dark);

  // Raised steel grouser cleats along bottom & nose (bottom at y = -0.24!)
  for (let i = -4; i <= 4; i++) {
    g.addBeveledBox(0, -0.23, i * 0.20, 0.39, 0.02, 0.07, 0.004, MAT.Steel_Trim);
    g.addBeveledBox(0, 0.17, i * 0.20, 0.39, 0.02, 0.07, 0.004, MAT.Steel_Trim);
  }

  // Spinning bogie/sprocket wheels if wheelNodes provided
  for (const wn of wheelNodes) {
    wn.geo.addCylinder([-0.20, 0, 0], [0.20, 0, 0], 0.15, 0.15, 10, MAT.Steel_Trim);
    wn.geo.addBeveledBox(side * 0.205, 0, 0, 0.03, 0.24, 0.06, 0.006, MAT.Graphite_Dark);
    wn.geo.addBeveledBox(side * 0.205, 0, 0, 0.03, 0.06, 0.24, 0.006, MAT.Graphite_Dark);
  }
}

// ============================================================================
// 6. UNIT 1: CINDER_RUNNER (Radius 1.5625)
// ============================================================================

function buildCinderRunner() {
  const scene = new SceneBuilder('cinder_runner');
  const root = scene.addNode('Root', null);

  // Track pod bottom cleats at podLocal y = -0.24 -> Chassis at y = 0.42, TrackPods at y = -0.18 => world minY = 0.000!
  const chassis = scene.addNode('Chassis', root.idx, { translation: [0, 0.42, -0.04] });
  populateCinderCoreChassis(chassis);

  const trackX = 0.83;
  const wheelNames = [];
  for (const [side, tag] of [[-1, 'L'], [1, 'R']]) {
    const pod = scene.addNode(`TrackPod_${tag}`, chassis.idx, {
      translation: [side * trackX, -0.18, 0.02],
    });
    const wNodes = [];
    for (const [wi, wz] of [[-0.78, 1], [0.0, 2], [0.76, 3]].map(([z, idx]) => [idx, z])) {
      const wn = scene.addNode(`Wheel_${tag}${wi}`, pod.idx, { translation: [0, -0.04, wz] });
      wNodes.push(wn);
      wheelNames.push(wn.name);
    }
    populateCinderTrackPod(pod, side, wNodes);

    // Folded compactly along upper flanks in runner mode!
    const shroud = scene.addNode(`Shroud_${tag}`, chassis.idx, {
      translation: [side * 0.56, 0.22, 0.16],
      rotation: quatYXZ(0.06, side * -0.12, side * -1.18),
    });
    populateCinderShroud(shroud, side);
  }

  buildCinderTurret(scene, chassis.idx, [0, 0.34, -0.16]);

  const animNodes = [
    'Chassis', 'TrackPod_L', 'TrackPod_R', 'Shroud_L', 'Shroud_R',
    'Turret_Yaw', 'Projector_Pitch', ...wheelNames,
  ];

  // IDLE (loop)
  scene.addSampledClip('idle', 2.0, 24, animNodes, (u) => {
    const th = u * TAU;
    return {
      Chassis: {
        t: [0, 0.42 + 0.012 * Math.sin(th * 2), -0.04],
        r: quatYXZ(0.01 * Math.sin(th), 0, 0.012 * Math.cos(th * 2)),
      },
      TrackPod_L: { t: [-trackX, -0.18 - 0.012 * Math.sin(th * 2), 0.02] },
      TrackPod_R: { t: [ trackX, -0.18 - 0.012 * Math.sin(th * 2), 0.02] },
      Turret_Yaw: { r: quatYXZ(0, 0.11 * Math.sin(th), 0) },
      Projector_Pitch: { r: quatYXZ(0.03 * Math.sin(th * 2), 0, 0) },
    };
  }, true);

  // WALK (drive loop)
  scene.addSampledClip('walk', 0.8, 30, animNodes, (u) => {
    const th = u * TAU;
    const spin = quatYXZ(-th, 0, 0);
    const bounce = 0.022 * Math.sin(th * 2);
    const out = {
      Chassis: {
        t: [0, 0.42 + bounce, -0.04],
        r: quatYXZ(-0.035 + 0.02 * Math.cos(th * 2), 0, 0.02 * Math.sin(th)),
      },
      TrackPod_L: {
        t: [-trackX, -0.18 - bounce, 0.02],
        r: quatYXZ(0.035, 0, 0),
      },
      TrackPod_R: {
        t: [trackX, -0.18 - bounce, 0.02],
        r: quatYXZ(0.035, 0, 0),
      },
      Turret_Yaw: { r: quatYXZ(0, 0.05 * Math.sin(th), 0) },
    };
    for (const wn of wheelNames) out[wn] = { r: spin };
    return out;
  }, true);

  // ATTACK (pressurized twin flame burst)
  scene.addSampledClip('attack', 1.1, 30, animNodes, (u) => {
    const env = smoothstep(0.0, 0.14, u) * (1 - smoothstep(0.76, 1.0, u));
    const vib = Math.sin(u * TAU * 7) * 0.028 * env;
    return {
      Chassis: {
        t: [0, 0.42 - 0.015 * env, -0.04 + 0.05 * env],
        r: quatYXZ(0.055 * env, 0, 0),
      },
      TrackPod_L: { t: [-trackX, -0.18 + 0.015 * env, 0.02 - 0.05 * env], r: quatYXZ(-0.055 * env, 0, 0) },
      TrackPod_R: { t: [ trackX, -0.18 + 0.015 * env, 0.02 - 0.05 * env], r: quatYXZ(-0.055 * env, 0, 0) },
      Shroud_L: {
        t: [-0.56 - 0.06 * env, 0.22 + 0.03 * env, 0.16],
        r: quatYXZ(0.06, 0.12, 1.18 - 0.18 * env),
      },
      Shroud_R: {
        t: [0.56 + 0.06 * env, 0.22 + 0.03 * env, 0.16],
        r: quatYXZ(0.06, -0.12, -1.18 + 0.18 * env),
      },
      Projector_Pitch: {
        t: [0, 0.20, -0.06 + (0.07 + vib) * env],
        r: quatYXZ(-0.05 * env, 0, 0),
      },
    };
  }, false);

  // CAST (wide thermal napalm arc sweep)
  scene.addSampledClip('cast', 1.5, 30, animNodes, (u) => {
    const env = smoothstep(0.0, 0.18, u) * (1 - smoothstep(0.80, 1.0, u));
    const sweep = Math.sin(((u - 0.15) / 0.7) * TAU) * 0.48 * env;
    return {
      Chassis: {
        t: [0, 0.42 - 0.03 * env, -0.04 + 0.04 * env],
        r: quatYXZ(0.04 * env, sweep * 0.15, 0),
      },
      TrackPod_L: { t: [-trackX, -0.18 + 0.03 * env, 0.02] },
      TrackPod_R: { t: [ trackX, -0.18 + 0.03 * env, 0.02] },
      Shroud_L: { r: quatYXZ(0.06, 0.22 * env, 1.18 - 0.35 * env) },
      Shroud_R: { r: quatYXZ(0.06, -0.22 * env, -1.18 + 0.35 * env) },
      Turret_Yaw: { r: quatYXZ(0, sweep, 0) },
      Projector_Pitch: {
        t: [0, 0.20, -0.06 + 0.06 * env],
        r: quatYXZ(0.14 * env, 0, 0),
      },
    };
  }, false);

  // MORPH (fold tracks down into upright walker legs & deploy big flame shrouds -> matches cinder_guard!)
  scene.addSampledClip('morph', 1.6, 30, animNodes, (u) => {
    const s = smoothstep(0.05, 0.92, u);
    const hop = Math.sin(s * Math.PI) * 0.08;
    return {
      Chassis: {
        t: [0, lerp(0.42, 1.30, s) + hop, lerp(-0.04, 0.08, s)],
        r: quatYXZ(lerp(0, 0.38, s), 0, 0),
      },
      TrackPod_L: {
        t: [lerp(-trackX, -0.78, s), lerp(-0.18, -0.24, s), lerp(0.02, -0.08, s)],
        r: quatYXZ(lerp(0, -1.42, s), 0, lerp(0, -0.10, s)),
      },
      TrackPod_R: {
        t: [lerp(trackX, 0.78, s), lerp(-0.18, -0.24, s), lerp(0.02, -0.08, s)],
        r: quatYXZ(lerp(0, -1.42, s), 0, lerp(0, 0.10, s)),
      },
      Shroud_L: {
        t: [lerp(-0.56, -0.72, s), lerp(0.22, 0.32, s), lerp(0.16, -0.28, s)],
        r: quatSlerp(quatYXZ(0.06, 0.12, 1.18), quatYXZ(-0.38, 0.26, 0.10), s),
      },
      Shroud_R: {
        t: [lerp(0.56, 0.72, s), lerp(0.22, 0.32, s), lerp(0.16, -0.28, s)],
        r: quatSlerp(quatYXZ(0.06, -0.12, -1.18), quatYXZ(-0.38, -0.26, -0.10), s),
      },
      Projector_Pitch: {
        r: quatYXZ(lerp(0, -0.36, s), 0, 0),
      },
    };
  }, false);

  // DEATH (fuel rupture pop + track blowout collapse on floor)
  scene.addSampledClip('death', 1.4, 30, animNodes, (u) => {
    const pop = Math.sin(clamp(u / 0.32, 0, 1) * Math.PI) * 0.26;
    const fall = smoothstep(0.20, 0.82, u);
    return {
      Chassis: {
        t: [0.06 * fall, lerp(0.42, 0.28, fall) + pop, -0.04 + 0.10 * fall],
        r: quatYXZ(-0.14 * fall, 0.18 * fall, 0.28 * fall),
      },
      TrackPod_L: {
        t: [-trackX - 0.12 * fall, lerp(-0.18, -0.02, fall), 0.02],
        r: quatYXZ(0.08 * fall, 0.12 * fall, 0.36 * fall),
      },
      TrackPod_R: {
        t: [trackX + 0.18 * fall, lerp(-0.18, 0.04, fall), 0.02 + 0.08 * fall],
        r: quatYXZ(-0.12 * fall, -0.22 * fall, -0.68 * fall),
      },
      Shroud_L: { r: quatYXZ(0.25 * fall, 0.30 * fall, 1.35) },
      Shroud_R: { r: quatYXZ(0.18 * fall, -0.35 * fall, -0.75) },
      Turret_Yaw: { r: quatYXZ(0, -0.52 * fall, 0) },
      Projector_Pitch: { r: quatYXZ(-0.28 * fall, 0, 0.14 * fall) },
    };
  }, false);

  return scene;
}

// ============================================================================
// 7. UNIT 2: CINDER_GUARD (Radius 1.5625)
// ============================================================================

function buildCinderGuard() {
  const scene = new SceneBuilder('cinder_guard');
  const root = scene.addNode('Root', null);

  // Upright walker IK parameters
  const L1 = 0.62;
  const L2 = 0.62;
  const footH = 0.12;
  const pelvisRest = [0, 1.24, 0.06];
  const hipOffL = [-0.68, -0.10, -0.02];
  const hipOffR = [ 0.68, -0.10, -0.02];
  const soleRestL = [-0.82, 0.0, -0.04];
  const soleRestR = [ 0.82, 0.0, -0.04];

  const pelvis = scene.addNode('Pelvis', root.idx, { translation: pelvisRest });
  pelvis.geo.addBeveledBox(0, -0.06, 0, 1.18, 0.24, 0.56, 0.04, MAT.Graphite_Dark);
  pelvis.geo.addBeveledBox(0, -0.08, -0.28, 0.52, 0.18, 0.12, 0.025, MAT.Amber_Caution);

  // Same Cinder Core Chassis tilted upright on Pelvis!
  const torso = scene.addNode('Chassis_Upright', pelvis.idx, {
    translation: [0, 0.26, 0.06],
    rotation: quatYXZ(0.42, 0, 0),
  });
  populateCinderCoreChassis(torso);

  // Same Twin Flame Projector Turret counter-pitched level (-Z forward!)
  const { pitchNode } = buildCinderTurret(scene, torso.idx, [0, 0.34, -0.18]);
  pitchNode.rotation = quatYXZ(-0.42, 0, 0);

  // Big Flame Shrouds unfolded wide & forward around the elevated flame turret!
  for (const [side, tag] of [[-1, 'L'], [1, 'R']]) {
    const arm = scene.addNode(`ShroudArm_${tag}`, torso.idx, {
      translation: [side * 0.72, 0.24, -0.26],
      rotation: quatYXZ(-0.42, side * -0.22, side * -0.06),
    });
    arm.geo.addCylinder([-side * 0.16, -0.04, 0.16], [side * 0.12, 0, 0], 0.065, 0.065, 8, MAT.Steel_Trim);
    populateCinderShroud(arm, side);
    // Extra unfolded inner heat-shield wing extension (making the big flame shrouds unmistakable!)
    arm.geo.addBeveledBox(side * 0.22, -0.46, -0.10, 0.12, 0.28, 0.84, 0.03, MAT.Graphite_Primary);
    arm.teamGeo.addBeveledBox(side * 0.29, -0.44, -0.10, 0.05, 0.20, 0.68, 0.02, MAT.TeamColor);
    arm.geo.addCautionRowY ? null : arm.geo.addBeveledBox(side * 0.22, -0.46, -0.53, 0.13, 0.24, 0.07, 0.015, MAT.Amber_Caution);
  }

  // Folded Track-Walker Legs (each leg shows the folded halves of the same track pod + heavy floor cleat!)
  const restIKL = solveTwoBoneLegIK({
    pelvisPos: pelvisRest, pelvisRot: quatIdentity(), hipOffset: hipOffL,
    L1, L2, footH, soleWorldPos: soleRestL, footWorldRot: quatIdentity(), bendSign: 1,
  });
  const restIKR = solveTwoBoneLegIK({
    pelvisPos: pelvisRest, pelvisRot: quatIdentity(), hipOffset: hipOffR,
    L1, L2, footH, soleWorldPos: soleRestR, footWorldRot: quatIdentity(), bendSign: 1,
  });

  for (const [side, tag, hipOff, ik] of [
    [-1, 'L', hipOffL, restIKL],
    [ 1, 'R', hipOffR, restIKR],
  ]) {
    const hip = scene.addNode(`Hip_${tag}`, pelvis.idx, { translation: hipOff, rotation: ik.qHip });
    // Upper folded track half
    hip.geo.addBeveledBox(side * 0.08, -L1 * 0.5, 0.02, 0.36, L1 * 0.94, 0.42, 0.04, MAT.Graphite_Primary);
    hip.geo.addBeveledBox(side * 0.08, -L1 * 0.5, 0.22, 0.38, L1 * 0.88, 0.12, 0.02, MAT.Graphite_Dark);
    hip.teamGeo.addBeveledBox(side * 0.27, -L1 * 0.45, 0.0, 0.06, L1 * 0.62, 0.28, 0.02, MAT.TeamColor);
    hip.geo.addCylinder([-0.14, 0, 0], [0.22 * side, 0, 0], 0.11, 0.11, 10, MAT.Steel_Trim);

    const knee = scene.addNode(`Knee_${tag}`, hip.idx, { translation: [0, -L1, 0], rotation: ik.qKnee });
    // Knee sprocket & lower folded track half
    knee.geo.addCylinder([-0.18, 0, 0], [0.24, 0, 0], 0.14, 0.14, 10, MAT.Steel_Trim);
    knee.geo.addBeveledBox(side * 0.08, -L2 * 0.5, -0.02, 0.36, L2 * 0.92, 0.40, 0.035, MAT.Graphite_Primary);
    knee.geo.addBeveledBox(side * 0.08, -L2 * 0.5, -0.20, 0.38, L2 * 0.84, 0.12, 0.02, MAT.Graphite_Dark);
    knee.geo.addBeveledBox(side * 0.08, -L2 * 0.25, -0.24, 0.28, 0.12, 0.06, 0.015, MAT.Amber_Caution);

    const ankle = scene.addNode(`Ankle_${tag}`, knee.idx, { translation: [0, -L2, 0], rotation: ik.qAnkle });
    // Wide armored stabilizer foot pad (bottom strictly at y = -footH = -0.12!)
    ankle.geo.addHullAlongZ([
      { z: -0.36, cx: side * 0.06, cy: -footH + 0.04, hx: 0.24, hy: 0.04, ch: 0.02 },
      { z: -0.08, cx: side * 0.06, cy: -footH + 0.06, hx: 0.28, hy: 0.06, ch: 0.025 },
      { z:  0.28, cx: side * 0.06, cy: -footH + 0.05, hx: 0.25, hy: 0.05, ch: 0.02 },
    ], MAT.Graphite_Dark);
    ankle.geo.addBeveledBox(side * 0.06, -footH + 0.04, -0.35, 0.34, 0.05, 0.08, 0.01, MAT.Steel_Trim);
  }

  const animNodes = [
    'Pelvis', 'Chassis_Upright', 'Turret_Yaw', 'Projector_Pitch',
    'ShroudArm_L', 'ShroudArm_R', 'Hip_L', 'Knee_L', 'Ankle_L', 'Hip_R', 'Knee_R', 'Ankle_R',
  ];

  const solvePoseIK = (pPos, pRot, soleL, footRotL, soleR, footRotR) => {
    const ikL = solveTwoBoneLegIK({
      pelvisPos: pPos, pelvisRot: pRot, hipOffset: hipOffL,
      L1, L2, footH, soleWorldPos: soleL, footWorldRot: footRotL, bendSign: 1,
    });
    const ikR = solveTwoBoneLegIK({
      pelvisPos: pPos, pelvisRot: pRot, hipOffset: hipOffR,
      L1, L2, footH, soleWorldPos: soleR, footWorldRot: footRotR, bendSign: 1,
    });
    return {
      Pelvis: { t: pPos, r: pRot },
      Hip_L: { r: ikL.qHip }, Knee_L: { r: ikL.qKnee }, Ankle_L: { r: ikL.qAnkle },
      Hip_R: { r: ikR.qHip }, Knee_R: { r: ikR.qKnee }, Ankle_R: { r: ikR.qAnkle },
    };
  };

  // IDLE (loop with feet pinned at Y = 0!)
  scene.addSampledClip('idle', 2.2, 24, animNodes, (u) => {
    const th = u * TAU;
    const pPos = [0.02 * Math.sin(th), 1.24 + 0.03 * Math.sin(th * 2), 0.06];
    const pRot = quatYXZ(0.015 * Math.cos(th * 2), 0.03 * Math.sin(th), 0);
    return {
      ...solvePoseIK(pPos, pRot, soleRestL, quatIdentity(), soleRestR, quatIdentity()),
      Turret_Yaw: { r: quatYXZ(0, 0.12 * Math.sin(th), 0) },
      ShroudArm_L: { r: quatYXZ(-0.42, 0.22 + 0.04 * Math.sin(th * 2), 0.06) },
      ShroudArm_R: { r: quatYXZ(-0.42, -0.22 - 0.04 * Math.sin(th * 2), -0.06) },
    };
  }, true);

  // WALK (heavy bipedal stride loop, feet grounded at Y = 0 during stance!)
  scene.addSampledClip('walk', 1.1, 30, animNodes, (u) => {
    const stride = 0.34;
    const stepH = 0.20;
    const footCycle = (phase) => {
      const p = phase % 1;
      if (p < 0.5) {
        // Stance: flat on Y = 0, moving from -stride to +stride
        const s = p / 0.5;
        return { z: lerp(-stride, stride, s), y: 0.0, pitch: 0 };
      }
      // Swing: lifting from +stride back to -stride
      const s = (p - 0.5) / 0.5;
      return {
        z: lerp(stride, -stride, s),
        y: Math.sin(s * Math.PI) * stepH,
        pitch: -0.18 * Math.sin(s * Math.PI),
      };
    };
    const fL = footCycle(u);
    const fR = footCycle(u + 0.5);
    const th = u * TAU;
    const pPos = [-0.05 * Math.cos(th), 1.20 + 0.045 * Math.abs(Math.sin(th)), 0.06];
    const pRot = quatYXZ(-0.04, 0.07 * Math.cos(th), 0.04 * Math.cos(th));
    return {
      ...solvePoseIK(
        pPos, pRot,
        [-0.82, fL.y, -0.04 + fL.z], quatYXZ(fL.pitch, 0, 0),
        [ 0.82, fR.y, -0.04 + fR.z], quatYXZ(fR.pitch, 0, 0)
      ),
      Chassis_Upright: { r: quatYXZ(0.42, -0.08 * Math.cos(th), 0) },
      ShroudArm_L: { r: quatYXZ(-0.42 + 0.05 * Math.sin(th), 0.22, 0.06) },
      ShroudArm_R: { r: quatYXZ(-0.42 - 0.05 * Math.sin(th), -0.22, -0.06) },
    };
  }, true);

  // ATTACK (braced flame blast with shroud focus)
  scene.addSampledClip('attack', 1.2, 30, animNodes, (u) => {
    const env = smoothstep(0.0, 0.16, u) * (1 - smoothstep(0.76, 1.0, u));
    const vib = Math.sin(u * TAU * 7) * 0.03 * env;
    const pPos = [0, 1.24 - 0.07 * env, 0.06 + 0.08 * env];
    const pRot = quatYXZ(0.06 * env, 0, 0);
    return {
      ...solvePoseIK(pPos, pRot, soleRestL, quatIdentity(), soleRestR, quatIdentity()),
      ShroudArm_L: { r: quatYXZ(-0.42, 0.22 - 0.16 * env, 0.06) },
      ShroudArm_R: { r: quatYXZ(-0.42, -0.22 + 0.16 * env, -0.06) },
      Projector_Pitch: {
        t: [0, 0.20, -0.06 + (0.08 + vib) * env],
        r: quatYXZ(-0.46, 0, 0),
      },
    };
  }, false);

  // CAST (shroud blast-shield slam -> wide thermal surge)
  scene.addSampledClip('cast', 1.6, 30, animNodes, (u) => {
    const slam = smoothstep(0.0, 0.25, u) * (1 - smoothstep(0.45, 0.65, u));
    const surge = smoothstep(0.45, 0.65, u) * (1 - smoothstep(0.84, 1.0, u));
    const pPos = [0, 1.24 - 0.10 * slam + 0.05 * surge, 0.06 + 0.09 * surge];
    const pRot = quatYXZ(0.10 * surge - 0.04 * slam, 0, 0);
    return {
      ...solvePoseIK(pPos, pRot, soleRestL, quatIdentity(), soleRestR, quatIdentity()),
      ShroudArm_L: { r: quatYXZ(-0.42, 0.22 - 0.52 * slam + 0.34 * surge, 0.06) },
      ShroudArm_R: { r: quatYXZ(-0.42, -0.22 + 0.52 * slam - 0.34 * surge, -0.06) },
      Projector_Pitch: {
        t: [0, 0.20, -0.06 + 0.10 * surge],
        r: quatYXZ(-0.42 + 0.20 * surge, 0, 0),
      },
    };
  }, false);

  // MORPH (fold upright walker down into compact tracked cinder_runner posture!)
  scene.addSampledClip('morph', 1.6, 30, animNodes, (u) => {
    const s = smoothstep(0.05, 0.92, u);
    const pPos = [0, lerp(1.24, 0.50, s), lerp(0.06, -0.02, s)];
    const pRot = quatYXZ(lerp(0, -0.34, s), 0, 0);
    const soleL = [-0.84, 0, lerp(-0.04, -0.28, s)];
    const soleR = [ 0.84, 0, lerp(-0.04, -0.28, s)];
    return {
      ...solvePoseIK(pPos, pRot, soleL, quatIdentity(), soleR, quatIdentity()),
      Chassis_Upright: {
        t: [0, lerp(0.26, 0.04, s), 0.06],
        r: quatYXZ(lerp(0.42, 0.34, s), 0, 0),
      },
      ShroudArm_L: {
        t: [lerp(-0.66, -0.54, s), 0.24, lerp(-0.26, 0.14, s)],
        r: quatSlerp(quatYXZ(-0.42, 0.22, 0.06), quatYXZ(0.05, 0.12, 1.18), s),
      },
      ShroudArm_R: {
        t: [lerp(0.66, 0.54, s), 0.24, lerp(-0.26, 0.14, s)],
        r: quatSlerp(quatYXZ(-0.42, -0.22, -0.06), quatYXZ(0.05, -0.12, -1.18), s),
      },
      Projector_Pitch: { r: quatYXZ(lerp(-0.42, 0, s), 0, 0) },
    };
  }, false);

  // DEATH (hydraulic knee collapse onto Y >= 0)
  scene.addSampledClip('death', 1.5, 30, animNodes, (u) => {
    const stag = smoothstep(0.0, 0.35, u);
    const drop = smoothstep(0.30, 0.88, u);
    const pPos = [0.08 * drop, lerp(1.24, 0.54, drop) + 0.06 * stag * (1 - drop), lerp(0.06, 0.22, drop)];
    const pRot = quatYXZ(lerp(0, -0.68, drop) + 0.16 * stag * (1 - drop), 0.16 * drop, 0.18 * drop);
    const soleL = [-0.86, 0, lerp(-0.04, -0.18, drop)];
    const soleR = [ 0.88, 0, lerp(-0.04, 0.16, drop)];
    return {
      ...solvePoseIK(pPos, pRot, soleL, quatIdentity(), soleR, quatIdentity()),
      ShroudArm_L: { r: quatYXZ(-0.22, 0.55 * drop + 0.22, 0.35 * drop) },
      ShroudArm_R: { r: quatYXZ(-0.22, -0.45 * drop - 0.22, -0.45 * drop) },
      Turret_Yaw: { r: quatYXZ(0, 0.42 * drop, 0) },
    };
  }, false);

  return scene;
}

// ============================================================================
// 8. SHARED SENTINEL MINE RINGS & POD CROWN (Radius 1.25)
// ============================================================================

function buildSentinelRings(scene, parentIdx, baseY, ringScale = 1.0) {
  // Visible Rotating Sensor Ring (prominent TeamColor blue arc plates + Amber_Glow optics!)
  const sensorRing = scene.addNode('Sensor_Ring', parentIdx, { translation: [0, baseY, 0] });
  const rIn = 0.50 * ringScale;
  const rOut = 0.84 * ringScale;
  sensorRing.geo.addRingY(0, 0, 0, 0.10, rIn, rOut, 16, MAT.Graphite_Primary, 0.015);

  // 4 broad TeamColor blue arc plates around upper sensor ring (readable at RTS zoom!)
  for (let q = 0; q < 4; q++) {
    const centerA = (q / 4) * TAU + Math.PI * 0.25;
    sensorRing.teamGeo.addArcPlateY(0, 0, 0.03, 0.135, rIn + 0.03, rOut - 0.02, centerA - 0.50, centerA + 0.50, 5, MAT.TeamColor);
  }
  // 4 cardinal Amber_Glow optical sensor pods
  for (let q = 0; q < 4; q++) {
    const a = (q / 4) * TAU;
    const rot = quatAxisAngle([0, 1, 0], -a);
    sensorRing.geo.withTRS([Math.cos(a) * (rOut - 0.05), 0.08, Math.sin(a) * (rOut - 0.05)], rot, [1, 1, 1], (b) => {
      b.addBeveledBox(0, 0, 0, 0.14, 0.11, 0.14, 0.02, MAT.Steel_Trim);
      b.addBeveledBox(0.05, 0.01, 0, 0.06, 0.065, 0.08, 0.01, MAT.Amber_Glow);
    });
  }

  // Visible Inner Launch Ring & Ordnance Tube
  const launchRing = scene.addNode('Launch_Ring', parentIdx, { translation: [0, baseY + 0.05, 0] });
  launchRing.geo.addRingY(0, 0, 0, 0.13, 0.25 * ringScale, 0.46 * ringScale, 16, MAT.Steel_Trim, 0.014);
  for (let i = 0; i < 8; i++) {
    if (i % 2 === 0) {
      const a0 = (i / 8) * TAU;
      launchRing.geo.addArcPlateY(0, 0, 0.05, 0.145, 0.30 * ringScale, 0.45 * ringScale, a0, a0 + 0.32, 3, MAT.Amber_Caution);
    }
  }
  // Recessed dark launch tube interior
  launchRing.geo.addCylinder([0, -0.02, 0], [0, 0.03, 0], 0.25 * ringScale, 0.25 * ringScale, 12, MAT.Graphite_Dark);

  // Armed Warhead Seeker Core inside Launch Ring
  const warhead = scene.addNode('Warhead_Core', launchRing.idx, { translation: [0, 0.03, 0] });
  warhead.geo.addCylinder([0, 0, 0], [0, 0.11, 0], 0.19 * ringScale, 0.08 * ringScale, 12, MAT.Graphite_Primary);
  warhead.geo.addCylinder([0, 0.11, 0], [0, 0.15, 0], 0.08 * ringScale, 0.03 * ringScale, 10, MAT.Amber_Glow);

  scene.addMuzzle('Muzzle_Main', launchRing.idx, [0, 0.16, -0.04]);
  scene.addMuzzle('Muzzle_Launch', launchRing.idx, [0, 0.16, 0]);

  return { sensorRing, launchRing, warhead };
}

// ============================================================================
// 9. UNIT 3: SENTINEL_MINE (Radius 1.25)
// ============================================================================

function buildSentinelMine() {
  const scene = new SceneBuilder('sentinel_mine');
  const root = scene.addNode('Root', null);

  const pod = scene.addNode('Pod_Body', root.idx, { translation: [0, 0.46, 0] });
  const pg = pod.geo;

  // Squat octagonal ordnance canister
  pg.addCylinder([0, -0.20, 0], [0, -0.12, 0], 0.56, 0.72, 12, MAT.Graphite_Dark);
  pg.addCylinder([0, -0.12, 0], [0,  0.14, 0], 0.72, 0.74, 12, MAT.Graphite_Primary);
  pg.addCylinder([0,  0.14, 0], [0,  0.24, 0], 0.74, 0.64, 12, MAT.Graphite_Primary);

  // Mid-band Amber_Caution hazard ring + clear -Z front directional visor
  for (let i = 0; i < 12; i += 2) {
    const a0 = (i / 12) * TAU;
    pg.addArcPlateY(0, 0, -0.04, 0.06, 0.71, 0.76, a0, a0 + 0.28, 2, MAT.Amber_Caution);
  }
  // Forward -Z seeker housing (defines clear -Z front!)
  pg.addBeveledBox(0, 0.03, -0.78, 0.34, 0.16, 0.18, 0.025, MAT.Steel_Trim);
  pg.addBeveledBox(0, 0.03, -0.87, 0.22, 0.08, 0.06, 0.015, MAT.Amber_Glow);
  // Cardinal bumper fins for clean circular footprint (~1.22 radius)
  pg.addBeveledBox(0, -0.02, -0.96, 0.18, 0.10, 0.30, 0.02, MAT.Graphite_Dark);
  pg.addBeveledBox(0, -0.02,  0.96, 0.22, 0.10, 0.30, 0.02, MAT.Graphite_Dark);

  buildSentinelRings(scene, pod.idx, 0.22, 0.86);

  // 4 Articulated Compact Legs at +-42 deg from -Z and +Z (foot tips land cleanly at Y = 0.000, radius = 1.225 <= 1.25!)
  const legDefs = [
    { name: 'FL', yaw:  0.74, sx: -1, sz: -1 },
    { name: 'FR', yaw: -0.74, sx:  1, sz: -1 },
    { name: 'BL', yaw:  Math.PI - 0.74, sx: -1, sz: 1 },
    { name: 'BR', yaw: -Math.PI + 0.74, sx:  1, sz: 1 },
  ];

  for (const ld of legDefs) {
    // Local frame rotated so -Z points radially outward along leg!
    const coxa = scene.addNode(`Leg_Coxa_${ld.name}`, pod.idx, {
      rotation: quatAxisAngle([0, 1, 0], ld.yaw),
    });
    coxa.geo.addBeveledBox(0, -0.04, -0.68, 0.20, 0.16, 0.22, 0.025, MAT.Steel_Trim);

    const femur = scene.addNode(`Leg_Femur_${ld.name}`, coxa.idx, {
      translation: [0, -0.04, -0.74],
      rotation: quatYXZ(0.32, 0, 0), // pitches slightly upward-outward
    });
    femur.geo.addBeveledBox(0, 0, -0.17, 0.15, 0.13, 0.36, 0.025, MAT.Graphite_Primary);
    femur.teamGeo.addBeveledBox(0, 0.075, -0.17, 0.12, 0.035, 0.26, 0.01, MAT.TeamColor);

    // At femur end (z = -0.32 in femur): world radial = 0.74 + 0.32*cos(0.32) = 1.043, world Y = 0.42 + 0.32*sin(0.32) = 0.520
    const tibia = scene.addNode(`Leg_Tibia_${ld.name}`, femur.idx, {
      translation: [0, 0, -0.32],
      rotation: quatYXZ(-0.32, 0, 0), // levels horizontal frame; tibia goes down to Y = 0.000!
    });
    // From y = 0 down to y = -0.52066 (exact world Y = 0.000!), radial out to -0.18 -> total radial <= 1.235 <= 1.25!
    tibia.geo.addCylinder([0, 0.02, 0], [0, -0.46, -0.09], 0.075, 0.055, 8, MAT.Graphite_Dark);
    tibia.geo.addBeveledBox(0, -0.22, -0.05, 0.14, 0.36, 0.14, 0.02, MAT.Graphite_Primary);
    tibia.geo.addBeveledBox(0, -0.14, -0.11, 0.11, 0.10, 0.04, 0.01, MAT.Amber_Caution);
    // Spade anchor foot resting strictly at local y = -0.52066 => world Y = 0.000!
    tibia.geo.addBeveledBox(0, -0.49066, -0.09, 0.17, 0.06, 0.18, 0.012, MAT.Steel_Trim);
  }

  const animNodes = [
    'Pod_Body', 'Sensor_Ring', 'Launch_Ring', 'Warhead_Core',
    'Leg_Coxa_FL', 'Leg_Femur_FL', 'Leg_Tibia_FL',
    'Leg_Coxa_FR', 'Leg_Femur_FR', 'Leg_Tibia_FR',
    'Leg_Coxa_BL', 'Leg_Femur_BL', 'Leg_Tibia_BL',
    'Leg_Coxa_BR', 'Leg_Femur_BR', 'Leg_Tibia_BR',
  ];

  // IDLE (loop)
  scene.addSampledClip('idle', 2.0, 24, animNodes, (u) => {
    const th = u * TAU;
    const dy = 0.022 * Math.sin(th * 2);
    const fComp = dy * 2.1;
    const out = {
      Pod_Body: { t: [0, 0.46 + dy, 0] },
      Sensor_Ring: { r: quatAxisAngle([0, 1, 0], th) },
      Warhead_Core: { t: [0, 0.03 + 0.015 * Math.sin(th * 2), 0] },
    };
    for (const ld of legDefs) {
      out[`Leg_Femur_${ld.name}`] = { r: quatYXZ(0.32 - fComp, 0, 0) };
      out[`Leg_Tibia_${ld.name}`] = { r: quatYXZ(-0.32 + fComp, 0, 0) };
    }
    return out;
  }, true);

  // WALK (brisk 4-legged diagonal scuttle loop)
  scene.addSampledClip('walk', 0.65, 30, animNodes, (u) => {
    const th = u * TAU;
    const out = {
      Pod_Body: {
        t: [0, 0.46 + 0.025 * Math.abs(Math.sin(th)), 0],
        r: quatYXZ(0.04 * Math.sin(th), 0.06 * Math.cos(th), 0.04 * Math.cos(th)),
      },
      Sensor_Ring: { r: quatAxisAngle([0, 1, 0], th) },
    };
    for (const [idx, ld] of legDefs.entries()) {
      // Diagonal pairs: FL(0)+BR(3) vs FR(1)+BL(2)
      const ph = (idx === 0 || idx === 3) ? u : (u + 0.5) % 1;
      const swing = ph < 0.5 ? Math.sin((ph / 0.5) * Math.PI) : 0;
      const stride = Math.cos(ph * TAU) * 0.16 * (-ld.sx);
      out[`Leg_Coxa_${ld.name}`] = { r: quatAxisAngle([0, 1, 0], ld.yaw + stride) };
      out[`Leg_Femur_${ld.name}`] = { r: quatYXZ(0.32 + 0.34 * swing, 0, 0) };
      out[`Leg_Tibia_${ld.name}`] = { r: quatYXZ(-0.32 - 0.18 * swing, 0, 0) };
    }
    return out;
  }, true);

  // ATTACK (proximity pounce & warhead trigger)
  scene.addSampledClip('attack', 0.95, 30, animNodes, (u) => {
    const crouch = smoothstep(0.0, 0.22, u) * (1 - smoothstep(0.25, 0.40, u));
    const leap = Math.sin(clamp((u - 0.25) / 0.50, 0, 1) * Math.PI);
    const out = {
      Pod_Body: {
        t: [0, 0.46 - 0.10 * crouch + 0.30 * leap, -0.22 * leap],
        r: quatYXZ(-0.18 * leap + 0.06 * crouch, 0, 0),
      },
      Sensor_Ring: { r: quatAxisAngle([0, 1, 0], u * TAU * 2) },
      Warhead_Core: { t: [0, 0.03 + 0.14 * leap, 0] },
    };
    for (const ld of legDefs) {
      out[`Leg_Femur_${ld.name}`] = { r: quatYXZ(0.32 + 0.28 * crouch - 0.42 * leap, 0, 0) };
      out[`Leg_Tibia_${ld.name}`] = { r: quatYXZ(-0.32 - 0.28 * crouch + 0.52 * leap, 0, 0) };
    }
    return out;
  }, false);

  // CAST (high-stance 360 sensor ping)
  scene.addSampledClip('cast', 1.4, 30, animNodes, (u) => {
    const env = smoothstep(0.0, 0.22, u) * (1 - smoothstep(0.78, 1.0, u));
    const out = {
      Pod_Body: { t: [0, 0.46 + 0.14 * env, 0] },
      Sensor_Ring: { r: quatAxisAngle([0, 1, 0], u * TAU * 2) },
      Launch_Ring: { t: [0, 0.27 + 0.04 * env, 0] },
      Warhead_Core: { t: [0, 0.03 + 0.08 * env, 0] },
    };
    for (const ld of legDefs) {
      out[`Leg_Femur_${ld.name}`] = { r: quatYXZ(0.32 - 0.38 * env, 0, 0) };
      out[`Leg_Tibia_${ld.name}`] = { r: quatYXZ(-0.32 + 0.38 * env, 0, 0) };
    }
    return out;
  }, false);

  // MORPH (burrow & anchor into sentinel_mine_armed low-profile configuration!)
  scene.addSampledClip('morph', 1.3, 30, animNodes, (u) => {
    const dig = Math.sin(u * TAU * 4) * 0.08 * (1 - smoothstep(0.65, 1.0, u));
    const s = smoothstep(0.08, 0.92, u);
    const femAng = lerp(0.32, 0.95, s);
    const out = {
      Pod_Body: {
        t: [0, lerp(0.46, 0.24, s), 0],
      },
      Sensor_Ring: { r: quatAxisAngle([0, 1, 0], u * TAU) },
    };
    for (const ld of legDefs) {
      out[`Leg_Coxa_${ld.name}`] = { r: quatAxisAngle([0, 1, 0], ld.yaw + dig) };
      out[`Leg_Femur_${ld.name}`] = { r: quatYXZ(femAng, 0, 0) };
      out[`Leg_Tibia_${ld.name}`] = { r: quatYXZ(-femAng, 0, 0) };
    }
    return out;
  }, false);

  // DEATH (detonation pop & splayed collapse onto Y >= 0)
  scene.addSampledClip('death', 1.1, 30, animNodes, (u) => {
    const pop = Math.sin(clamp(u / 0.28, 0, 1) * Math.PI) * 0.22;
    const fall = smoothstep(0.22, 0.85, u);
    const out = {
      Pod_Body: {
        t: [0.03 * fall, lerp(0.46, 0.22, fall) + pop, 0.04 * fall],
        r: quatYXZ(-0.14 * fall, 0.22 * fall, 0.16 * fall),
      },
      Warhead_Core: { t: [0, 0.03 - 0.05 * fall + 0.12 * pop, 0] },
    };
    for (const ld of legDefs) {
      out[`Leg_Femur_${ld.name}`] = { r: quatYXZ(lerp(0.32, 0.52, fall), 0, 0) };
      out[`Leg_Tibia_${ld.name}`] = { r: quatYXZ(lerp(-0.32, 0.68, fall), 0, 0) };
    }
    return out;
  }, false);

  return scene;
}

// ============================================================================
// 10. UNIT 4: SENTINEL_MINE_ARMED (Radius 1.25)
// ============================================================================

function buildSentinelMineArmed() {
  const scene = new SceneBuilder('sentinel_mine_armed');
  const root = scene.addNode('Root', null);

  // Ground-flush perimeter anchor collar right on Y = 0.000 (radius = 1.23 <= 1.25!)
  const collar = scene.addNode('Ground_Collar', root.idx, { translation: [0, 0, 0] });
  collar.geo.addRingY(0, 0, 0.0, 0.065, 0.78, 1.22, 20, MAT.Graphite_Dark, 0.02);

  // Alternating Amber_Caution hazard segments around surface rim
  for (let i = 0; i < 12; i += 2) {
    const a0 = (i / 12) * TAU;
    collar.geo.addArcPlateY(0, 0, 0.045, 0.082, 0.88, 1.15, a0, a0 + 0.28, 3, MAT.Amber_Caution);
  }

  // 4 Entrenched Surface Anchor Claws at +-42 deg (matching sentinel_mine leg positions, max R = 1.235 <= 1.25!)
  for (const yaw of [0.74, -0.74, Math.PI - 0.74, -Math.PI + 0.74]) {
    collar.geo.withTRS([0, 0, 0], quatAxisAngle([0, 1, 0], yaw), [1, 1, 1], (b) => {
      b.addBeveledBox(0, 0.045, -1.06, 0.22, 0.09, 0.34, 0.02, MAT.Steel_Trim);
      b.addBeveledBox(0, 0.095, -0.98, 0.16, 0.05, 0.18, 0.012, MAT.Graphite_Primary);
    });
  }

  // Forward -Z directional optical beacon flush on ground rim
  collar.geo.addBeveledBox(0, 0.06, -1.06, 0.28, 0.09, 0.22, 0.02, MAT.Steel_Trim);
  collar.geo.addBeveledBox(0, 0.08, -1.14, 0.18, 0.05, 0.06, 0.01, MAT.Amber_Glow);

  // Mostly buried pod body: only upper ~25% crown sits above Y = 0.000!
  const buriedBody = scene.addNode('Buried_Pod_Crown', root.idx, { translation: [0, 0, 0] });
  buriedBody.geo.addCylinder([0, 0.0, 0], [0, 0.10, 0], 0.82, 0.76, 16, MAT.Graphite_Primary);
  buriedBody.geo.addCylinder([0, 0.10, 0], [0, 0.17, 0], 0.76, 0.66, 16, MAT.Graphite_Primary);

  // Prominent Visible Sensor Ring & Inner Launch Ring above ground!
  buildSentinelRings(scene, buriedBody.idx, 0.13, 0.96);

  const animNodes = ['Ground_Collar', 'Buried_Pod_Crown', 'Sensor_Ring', 'Launch_Ring', 'Warhead_Core'];

  // IDLE (continuous 360 surveillance scan loop)
  scene.addSampledClip('idle', 2.4, 24, animNodes, (u) => {
    const th = u * TAU;
    return {
      Sensor_Ring: { r: quatAxisAngle([0, 1, 0], th) },
      Warhead_Core: { t: [0, 0.03 + 0.02 * Math.sin(th * 2), 0] },
    };
  }, true);

  // ATTACK (pop-up warhead ordnance launch & reload)
  scene.addSampledClip('attack', 1.0, 30, animNodes, (u) => {
    const fire = smoothstep(0.05, 0.18, u) * (1 - smoothstep(0.28, 0.75, u));
    const shudder = Math.sin(u * TAU * 6) * 0.018 * (1 - u);
    return {
      Buried_Pod_Crown: { t: [0, Math.max(0, 0.04 * fire + shudder), 0] },
      Sensor_Ring: { r: quatAxisAngle([0, 1, 0], u * TAU * 2) },
      Launch_Ring: { t: [0, 0.18 + 0.06 * fire, 0] },
      Warhead_Core: { t: [0, 0.03 + 0.42 * fire, 0] },
    };
  }, false);

  // CAST (rapid radar lock sweep)
  scene.addSampledClip('cast', 1.4, 30, animNodes, (u) => {
    const env = smoothstep(0.0, 0.20, u) * (1 - smoothstep(0.80, 1.0, u));
    return {
      Buried_Pod_Crown: { t: [0, 0.06 * env, 0] },
      Sensor_Ring: {
        t: [0, 0.13 + 0.05 * env, 0],
        r: quatAxisAngle([0, 1, 0], u * TAU * 2),
      },
      Launch_Ring: { t: [0, 0.18 + 0.07 * env, 0] },
    };
  }, false);

  // MORPH (unburrow pod body upward out of ground collar!)
  scene.addSampledClip('morph', 1.3, 30, animNodes, (u) => {
    const s = smoothstep(0.06, 0.92, u);
    return {
      Buried_Pod_Crown: {
        t: [0, lerp(0, 0.38, s), 0],
        s: [lerp(1, 0.90, s), lerp(1, 2.2, s), lerp(1, 0.90, s)],
      },
      Sensor_Ring: { r: quatAxisAngle([0, 1, 0], u * TAU) },
    };
  }, false);

  // DEATH (blown-out emplaced husk resting cleanly on Y >= 0)
  scene.addSampledClip('death', 1.1, 30, animNodes, (u) => {
    const pop = Math.sin(clamp(u / 0.25, 0, 1) * Math.PI) * 0.28;
    const fall = smoothstep(0.25, 0.85, u);
    return {
      Sensor_Ring: {
        t: [0.04 * fall, 0.13 - 0.04 * fall + pop * 0.4, 0],
        r: quatYXZ(0.10 * fall, 0.7 * fall, -0.08 * fall),
      },
      Launch_Ring: {
        t: [0, 0.18 - 0.05 * fall + pop, 0],
        r: quatYXZ(-0.12 * fall, 0, 0.10 * fall),
      },
      Warhead_Core: {
        t: [0, 0.03 + pop * 1.4 - 0.08 * fall, 0],
        s: [lerp(1, 0.3, fall), lerp(1, 0.3, fall), lerp(1, 0.3, fall)],
      },
    };
  }, false);

  return scene;
}

// ============================================================================
// 11. UNIT 5: VORTEX_ROVER (Radius 1.875)
// ============================================================================

function buildVortexRover() {
  const scene = new SceneBuilder('vortex_rover');
  const root = scene.addNode('Root', null);

  const wheelR = 0.44;
  // Sprung low-profile strike buggy hull
  const hull = scene.addNode('Rover_Hull', root.idx, { translation: [0, 0.44, 0] });
  const hg = hull.geo;
  const htc = hull.teamGeo;

  // Sleek low wedge hull (-Z nose at -1.78 to +Z diffuser tail at +1.70; max hypot <= 1.855 <= 1.875!)
  hg.addHullAlongZ([
    { z: -1.76, cx: 0, cy: -0.06, hx: 0.30, hy: 0.08, ch: 0.04 },
    { z: -1.35, cx: 0, cy:  0.00, hx: 0.54, hy: 0.15, ch: 0.06 },
    { z: -0.60, cx: 0, cy:  0.08, hx: 0.68, hy: 0.22, ch: 0.08 },
    { z:  0.35, cx: 0, cy:  0.10, hx: 0.70, hy: 0.24, ch: 0.08 },
    { z:  1.25, cx: 0, cy:  0.08, hx: 0.58, hy: 0.20, ch: 0.07 },
    { z:  1.68, cx: 0, cy:  0.05, hx: 0.42, hy: 0.13, ch: 0.05 },
  ], MAT.Graphite_Primary);

  // Dark skid belly & side aero skirts
  hg.addBeveledBox(0, -0.14, -0.05, 0.96, 0.12, 2.75, 0.03, MAT.Graphite_Dark);
  // Front nose skid + Amber_Caution bumper + twin Amber_Glow headlights
  hg.addBeveledBox(0, -0.10, -1.78, 0.56, 0.09, 0.14, 0.02, MAT.Steel_Trim);
  hg.addCautionRowX(-0.26, 0.26, -0.05, -1.82, 0.07, 0.05, 5);
  for (const sx of [-1, 1]) {
    hg.addBeveledBox(sx * 0.34, 0.01, -1.52, 0.18, 0.055, 0.14, 0.015, MAT.Amber_Glow);
    // Side radiator intake pods
    hg.addBeveledBox(sx * 0.74, 0.06, 0.02, 0.18, 0.24, 0.92, 0.035, MAT.Graphite_Dark);
    hg.addBeveledBox(sx * 0.76, 0.06, -0.45, 0.14, 0.18, 0.06, 0.015, MAT.Amber_Caution);
  }

  // Broad readable TeamColor blue hood wedge, side-pod chevrons, and rear wing!
  htc.addHullAlongZ([
    { z: -1.56, cx: 0, cy: 0.04, hx: 0.24, hy: 0.035, ch: 0.02 },
    { z: -0.92, cx: 0, cy: 0.19, hx: 0.46, hy: 0.04,  ch: 0.03 },
    { z: -0.35, cx: 0, cy: 0.30, hx: 0.50, hy: 0.04,  ch: 0.03 },
  ], MAT.TeamColor);
  for (const sx of [-1, 1]) {
    htc.addBeveledBox(sx * 0.77, 0.19, 0.02, 0.16, 0.07, 0.88, 0.02, MAT.TeamColor);
    htc.addBeveledBox(sx * 0.46, 0.31, 0.92, 0.24, 0.05, 0.76, 0.02, MAT.TeamColor);
  }

  // Armored dark canopy & rear twin exhausts + low fast rear wing
  hg.addHullAlongZ([
    { z: -0.82, cx: 0, cy: 0.24, hx: 0.36, hy: 0.06, ch: 0.03 },
    { z: -0.32, cx: 0, cy: 0.36, hx: 0.44, hy: 0.12, ch: 0.04 },
    { z:  0.18, cx: 0, cy: 0.36, hx: 0.40, hy: 0.11, ch: 0.04 },
  ], MAT.Graphite_Dark);
  hg.addBeveledBox(0, 0.32, -0.76, 0.56, 0.07, 0.16, 0.02, MAT.Amber_Glow);

  // Rear spoiler + twin turbo exhaust nozzles
  hg.addBeveledBox(0, 0.34, 1.56, 1.08, 0.055, 0.26, 0.02, MAT.Graphite_Primary);
  htc.addBeveledBox(0, 0.375, 1.56, 0.96, 0.03, 0.22, 0.01, MAT.TeamColor);
  htc.addBeveledBox(-0.56, 0.34, 1.56, 0.06, 0.18, 0.30, 0.015, MAT.TeamColor);
  htc.addBeveledBox( 0.56, 0.34, 1.56, 0.06, 0.18, 0.30, 0.015, MAT.TeamColor);
  for (const sx of [-1, 1]) {
    hg.addHollowBarrel([sx * 0.22, 0.04, 1.52], [sx * 0.22, 0.04, 1.76], 0.09, 0.10, 0.065, 0.12, 10, MAT.Steel_Trim, MAT.Amber_Glow);
  }

  // 4 Double-Wishbone Suspension Arms + Treaded Off-Road Wheels (resting strictly at Y = 0.000!)
  // Corner radial distance: x=1.00+0.14=1.14, z=1.00+0.44=1.44 -> hypot(1.14, 1.44) = 1.836 <= 1.875!
  const wheelZ = 1.00;
  const wheelDefs = [
    { tag: 'FL', sx: -1, x: -0.98, z: -wheelZ, steer: true },
    { tag: 'FR', sx:  1, x:  0.98, z: -wheelZ, steer: true },
    { tag: 'RL', sx: -1, x: -1.01, z:  wheelZ, steer: false },
    { tag: 'RR', sx:  1, x:  1.01, z:  wheelZ, steer: false },
  ];

  for (const wd of wheelDefs) {
    const susp = scene.addNode(`Susp_${wd.tag}`, hull.idx, { translation: [wd.sx * 0.52, 0.0, wd.z] });
    const armLen = Math.abs(wd.x) - 0.52;
    susp.geo.addBeveledBox(wd.sx * armLen * 0.5, 0.05, 0, armLen, 0.07, 0.22, 0.015, MAT.Steel_Trim);
    susp.geo.addBeveledBox(wd.sx * armLen * 0.5, -0.06, 0, armLen, 0.06, 0.18, 0.015, MAT.Graphite_Dark);
    // Coilover shock strut
    susp.geo.addCylinder([wd.sx * 0.10, 0.22, 0], [wd.sx * (armLen * 0.8), -0.02, 0], 0.045, 0.04, 8, MAT.Amber_Caution);

    const steer = scene.addNode(`Steer_${wd.tag}`, susp.idx, { translation: [wd.sx * armLen, 0, 0] });
    const wheel = scene.addNode(`Wheel_${wd.tag}`, steer.idx);
    wheel.geo.addRoverWheel(wheelR, 0.28, 16);
  }

  // Signature Narrow Tracking Missile Launcher (sleek dorsal columnar gimbal pod!)
  const yawPod = scene.addNode('Launcher_Yaw', hull.idx, { translation: [0, 0.42, 0.28] });
  yawPod.geo.addCylinder([0, -0.08, 0], [0, 0.14, 0], 0.26, 0.20, 12, MAT.Steel_Trim);
  yawPod.geo.addBeveledBox(0, 0.20, 0.02, 0.34, 0.20, 0.36, 0.03, MAT.Graphite_Dark);

  const pitchPod = scene.addNode('Launcher_Pitch', yawPod.idx, { translation: [0, 0.30, 0] });
  const slidePod = scene.addNode('Launcher_Slide', pitchPod.idx);
  const lg = slidePod.geo;
  const ltc = slidePod.teamGeo;

  // Narrow blade-like tracking launcher casing (width only 0.36, height 0.56, length 1.36 -> super sleek!)
  lg.addHullAlongZ([
    { z: -0.72, cx: 0, cy: 0.16, hx: 0.18, hy: 0.27, ch: 0.04 },
    { z: -0.10, cx: 0, cy: 0.18, hx: 0.20, hy: 0.29, ch: 0.05 },
    { z:  0.54, cx: 0, cy: 0.18, hx: 0.18, hy: 0.26, ch: 0.04 },
    { z:  0.70, cx: 0, cy: 0.18, hx: 0.14, hy: 0.20, ch: 0.03 },
  ], MAT.Graphite_Primary);

  // Dorsal & flank TeamColor spine plates on narrow tracking launcher
  ltc.addBeveledBox(0, 0.48, -0.06, 0.24, 0.06, 1.12, 0.02, MAT.TeamColor);
  ltc.addBeveledBox(-0.20, 0.20, -0.05, 0.04, 0.26, 0.88, 0.015, MAT.TeamColor);
  ltc.addBeveledBox( 0.20, 0.20, -0.05, 0.04, 0.26, 0.88, 0.015, MAT.TeamColor);

  // Front Amber_Caution aperture frame + 3 stacked vertical precision missile tubes!
  lg.addBeveledBox(0, 0.16, -0.73, 0.34, 0.52, 0.06, 0.015, MAT.Amber_Caution);
  lg.addBeveledBox(0, 0.16, -0.75, 0.26, 0.44, 0.05, 0.01, MAT.Graphite_Dark);

  const tubeYs = [0.30, 0.16, 0.02];
  for (const ty of tubeYs) {
    lg.addHollowBarrel([0, ty, -0.58], [0, ty, -0.77], 0.065, 0.065, 0.05, 0.14, 10, MAT.Steel_Trim, MAT.Graphite_Dark);
    // Missile seeker tip recessed inside tube
    lg.addCylinder([0, ty, -0.68], [0, ty, -0.75], 0.038, 0.014, 8, MAT.Amber_Glow);
  }

  // Side-mounted optical target-tracking sensor pod
  lg.addBeveledBox(0.24, 0.30, -0.34, 0.12, 0.14, 0.38, 0.02, MAT.Steel_Trim);
  lg.addCylinder([0.24, 0.30, -0.52], [0.24, 0.30, -0.58], 0.048, 0.048, 10, MAT.Amber_Glow);

  scene.addMuzzle('Muzzle_Main', slidePod.idx, [0, 0.16, -0.80]);
  scene.addMuzzle('Muzzle_Missile_1', slidePod.idx, [0, 0.30, -0.80]);
  scene.addMuzzle('Muzzle_Missile_2', slidePod.idx, [0, 0.16, -0.80]);
  scene.addMuzzle('Muzzle_Missile_3', slidePod.idx, [0, 0.02, -0.80]);

  const animNodes = [
    'Rover_Hull', 'Launcher_Yaw', 'Launcher_Pitch', 'Launcher_Slide',
    'Susp_FL', 'Steer_FL', 'Wheel_FL',
    'Susp_FR', 'Steer_FR', 'Wheel_FR',
    'Susp_RL', 'Steer_RL', 'Wheel_RL',
    'Susp_RR', 'Steer_RR', 'Wheel_RR',
  ];

  // IDLE (active narrow tracking launcher scanning + subtle engine vibration, wheels pinned to Y=0!)
  scene.addSampledClip('idle', 2.2, 24, animNodes, (u) => {
    const th = u * TAU;
    const dy = 0.012 * Math.sin(th * 2);
    return {
      Rover_Hull: { t: [0, 0.44 + dy, 0] },
      Susp_FL: { t: [-0.52, -dy, -wheelZ] },
      Susp_FR: { t: [ 0.52, -dy, -wheelZ] },
      Susp_RL: { t: [-0.52, -dy,  wheelZ] },
      Susp_RR: { t: [ 0.52, -dy,  wheelZ] },
      Launcher_Yaw: { r: quatYXZ(0, 0.30 * Math.sin(th), 0) },
      Launcher_Pitch: { r: quatYXZ(0.08 + 0.06 * Math.sin(th * 2), 0, 0) },
    };
  }, true);

  // WALK (fast rover wheel spin + suspension articulation loop!)
  scene.addSampledClip('walk', 0.65, 30, animNodes, (u) => {
    const th = u * TAU;
    const spin = quatYXZ(-th, 0, 0);
    const bounce = 0.028 * Math.sin(th * 2);
    const steerAng = 0.07 * Math.sin(th);
    return {
      Rover_Hull: {
        t: [0, 0.44 + bounce, 0],
        r: quatYXZ(-0.025 + 0.018 * Math.cos(th * 2), 0, 0.025 * Math.sin(th)),
      },
      Susp_FL: { t: [-0.52, -bounce, -wheelZ] },
      Susp_FR: { t: [ 0.52, -bounce, -wheelZ] },
      Susp_RL: { t: [-0.52, -bounce,  wheelZ] },
      Susp_RR: { t: [ 0.52, -bounce,  wheelZ] },
      Steer_FL: { r: quatYXZ(0, steerAng, 0) },
      Steer_FR: { r: quatYXZ(0, steerAng, 0) },
      Wheel_FL: { r: spin },
      Wheel_FR: { r: spin },
      Wheel_RL: { r: spin },
      Wheel_RR: { r: spin },
      Launcher_Yaw: { r: quatYXZ(0, -0.08 * Math.sin(th), 0) },
      Launcher_Pitch: { r: quatYXZ(0.05, 0, 0) },
    };
  }, true);

  // ATTACK (3-missile rapid tracking salvo with suspension squat!)
  scene.addSampledClip('attack', 1.15, 30, animNodes, (u) => {
    const env = smoothstep(0.0, 0.14, u) * (1 - smoothstep(0.80, 1.0, u));
    const k1 = Math.exp(-Math.pow((u - 0.22) / 0.06, 2));
    const k2 = Math.exp(-Math.pow((u - 0.42) / 0.06, 2));
    const k3 = Math.exp(-Math.pow((u - 0.62) / 0.06, 2));
    const kick = Math.max(k1, k2, k3);
    const squat = 0.035 * env + 0.025 * kick;
    return {
      Rover_Hull: {
        t: [0, 0.44 - squat, 0.06 * env + 0.04 * kick],
        r: quatYXZ(0.045 * env + 0.03 * kick, 0, 0),
      },
      Susp_FL: { t: [-0.52, squat - 0.04 * env, -wheelZ] },
      Susp_FR: { t: [ 0.52, squat - 0.04 * env, -wheelZ] },
      Susp_RL: { t: [-0.52, squat + 0.04 * env,  wheelZ] },
      Susp_RR: { t: [ 0.52, squat + 0.04 * env,  wheelZ] },
      Launcher_Pitch: { r: quatYXZ(0.16 * env, 0, 0) },
      Launcher_Slide: { t: [0, 0, 0.16 * kick] },
    };
  }, false);

  // CAST (laser target-lock sweep & high-angle overdrive salvo)
  scene.addSampledClip('cast', 1.5, 30, animNodes, (u) => {
    const lock = smoothstep(0.0, 0.30, u) * (1 - smoothstep(0.75, 1.0, u));
    const fire = smoothstep(0.45, 0.58, u) * (1 - smoothstep(0.68, 0.90, u));
    return {
      Rover_Hull: {
        t: [0, 0.44 - 0.04 * lock, 0.08 * fire],
        r: quatYXZ(0.06 * fire, 0, 0),
      },
      Susp_FL: { t: [-0.52, 0.04 * lock, -wheelZ] },
      Susp_FR: { t: [ 0.52, 0.04 * lock, -wheelZ] },
      Susp_RL: { t: [-0.52, 0.04 * lock,  wheelZ] },
      Susp_RR: { t: [ 0.52, 0.04 * lock,  wheelZ] },
      Steer_FL: { r: quatYXZ(0, -0.22 * lock, 0) },
      Steer_FR: { r: quatYXZ(0,  0.22 * lock, 0) },
      Launcher_Yaw: { r: quatYXZ(0, Math.sin(u * TAU) * 0.28 * (1 - fire), 0) },
      Launcher_Pitch: { r: quatYXZ(0.36 * lock, 0, 0) },
      Launcher_Slide: { t: [0, 0, 0.22 * fire] },
    };
  }, false);

  // DEATH (axle snap & roll onto ground Y >= 0)
  scene.addSampledClip('death', 1.4, 30, animNodes, (u) => {
    const pop = Math.sin(clamp(u / 0.28, 0, 1) * Math.PI) * 0.22;
    const fall = smoothstep(0.22, 0.85, u);
    return {
      Rover_Hull: {
        t: [-0.08 * fall, lerp(0.44, 0.28, fall) + pop, 0.12 * fall],
        r: quatYXZ(-0.08 * fall, 0.18 * fall, 0.24 * fall),
      },
      Susp_FL: { r: quatYXZ(0, 0, 0.52 * fall) },
      Susp_RL: { r: quatYXZ(0, 0, 0.44 * fall) },
      Susp_FR: { r: quatYXZ(0, 0, -0.35 * fall) },
      Susp_RR: { r: quatYXZ(0, 0, -0.32 * fall) },
      Launcher_Yaw: { r: quatYXZ(0, -0.78 * fall, 0) },
      Launcher_Pitch: { r: quatYXZ(-0.34 * fall, 0, 0.28 * fall) },
    };
  }, false);

  return scene;
}

// ============================================================================
// 12. SHARED ATLAS WALKER BODY (Radius 2.03125 — 100% shared 1:1!)
// ============================================================================

function buildAtlasSharedBody(scene) {
  const root = scene.addNode('Root', null);

  // Hulking Bipedal Mech IK Parameters (reverse-joint/armored digitigrade or heavy forward mech)
  const L1 = 0.88;
  const L2 = 0.86;
  const footH = 0.16;
  const pelvisRest = [0, 1.72, 0.06];
  const hipOffL = [-0.84, -0.12, 0.0];
  const hipOffR = [ 0.84, -0.12, 0.0];
  const soleRestL = [-0.96, 0.0, 0.02];
  const soleRestR = [ 0.96, 0.0, 0.02];

  // Pelvis & armored hip block
  const pelvis = scene.addNode('Pelvis', root.idx, { translation: pelvisRest });
  pelvis.geo.addBeveledBox(0, -0.06, 0.0, 1.44, 0.34, 0.78, 0.05, MAT.Graphite_Dark);
  pelvis.geo.addBeveledBox(0, -0.14, -0.38, 0.62, 0.32, 0.22, 0.04, MAT.Graphite_Primary);
  pelvis.geo.addCautionRowX(-0.26, 0.26, -0.16, -0.50, 0.12, 0.05, 5);
  pelvis.teamGeo.addBeveledBox(0, 0.06, -0.40, 0.54, 0.14, 0.14, 0.025, MAT.TeamColor);
  pelvis.geo.addCylinder([-0.92, -0.12, 0], [0.92, -0.12, 0], 0.16, 0.16, 12, MAT.Steel_Trim);

  // Hulking Two-Legged Walker Limbs (identical 1:1 on both Atlas variants!)
  const restIKL = solveTwoBoneLegIK({
    pelvisPos: pelvisRest, pelvisRot: quatIdentity(), hipOffset: hipOffL,
    L1, L2, footH, soleWorldPos: soleRestL, footWorldRot: quatIdentity(), bendSign: 1,
  });
  const restIKR = solveTwoBoneLegIK({
    pelvisPos: pelvisRest, pelvisRot: quatIdentity(), hipOffset: hipOffR,
    L1, L2, footH, soleWorldPos: soleRestR, footWorldRot: quatIdentity(), bendSign: 1,
  });

  for (const [side, tag, hipOff, ik] of [
    [-1, 'L', hipOffL, restIKL],
    [ 1, 'R', hipOffR, restIKR],
  ]) {
    const hip = scene.addNode(`Hip_${tag}`, pelvis.idx, { translation: hipOff, rotation: ik.qHip });
    const hg = hip.geo;
    // Heavy armored thigh + hydraulic piston
    hg.addCylinder([-0.20, 0, 0], [0.20, 0, 0], 0.19, 0.19, 12, MAT.Steel_Trim);
    hg.addBeveledBox(side * 0.10, -L1 * 0.48, 0.0, 0.48, L1 * 0.90, 0.52, 0.05, MAT.Graphite_Primary);
    hg.addCylinder([side * 0.10, -0.14, 0.24], [side * 0.10, -L1 + 0.10, 0.22], 0.075, 0.065, 8, MAT.Steel_Trim);
    hip.teamGeo.addBeveledBox(side * 0.35, -L1 * 0.45, -0.02, 0.07, L1 * 0.62, 0.34, 0.02, MAT.TeamColor);

    const knee = scene.addNode(`Knee_${tag}`, hip.idx, { translation: [0, -L1, 0], rotation: ik.qKnee });
    const kg = knee.geo;
    // Heavy knee drum, knee guard, & thick armored shin greave
    kg.addCylinder([-0.24, 0, 0], [0.28 * side, 0, 0], 0.18, 0.18, 12, MAT.Steel_Trim);
    kg.addBeveledBox(side * 0.10, 0.06, -0.26, 0.40, 0.28, 0.16, 0.035, MAT.Graphite_Primary);
    kg.addBeveledBox(side * 0.10, 0.06, -0.35, 0.30, 0.12, 0.05, 0.015, MAT.Amber_Caution);
    kg.addBeveledBox(side * 0.10, -L2 * 0.50, 0.02, 0.50, L2 * 0.88, 0.54, 0.05, MAT.Graphite_Primary);
    kg.addBeveledBox(side * 0.10, -L2 * 0.52, 0.28, 0.36, L2 * 0.72, 0.14, 0.03, MAT.Graphite_Dark);
    knee.teamGeo.addBeveledBox(side * 0.12, -L2 * 0.42, -0.26, 0.36, L2 * 0.50, 0.07, 0.02, MAT.TeamColor);
    knee.teamGeo.addBeveledBox(side * 0.36, -L2 * 0.48, 0.0, 0.06, L2 * 0.56, 0.36, 0.02, MAT.TeamColor);

    const ankle = scene.addNode(`Ankle_${tag}`, knee.idx, { translation: [0, -L2, 0], rotation: ik.qAnkle });
    const ag = ankle.geo;
    // Wide 3-toed siege mech foot planted rock-solid at local y = -footH = -0.16!
    ag.addBeveledBox(side * 0.10, -0.07, -0.02, 0.52, 0.18, 0.54, 0.03, MAT.Graphite_Dark);
    // Two heavy front toes (-Z) + rear stabilizer spur (+Z)
    for (const tx of [-0.15, 0.15]) {
      ag.addHullAlongZ([
        { z: -0.58, cx: side * 0.10 + tx, cy: -footH + 0.045, hx: 0.11, hy: 0.045, ch: 0.015 },
        { z: -0.24, cx: side * 0.10 + tx, cy: -footH + 0.08,  hx: 0.13, hy: 0.08,  ch: 0.02 },
      ], MAT.Steel_Trim);
    }
    ag.addHullAlongZ([
      { z: 0.20, cx: side * 0.10, cy: -footH + 0.07, hx: 0.18, hy: 0.07, ch: 0.02 },
      { z: 0.50, cx: side * 0.10, cy: -footH + 0.04, hx: 0.14, hy: 0.04, ch: 0.015 },
    ], MAT.Steel_Trim);
  }

  // Hulking Armored Upper Torso
  const torsoYaw = scene.addNode('Torso_Yaw', pelvis.idx, { translation: [0, 0.20, 0] });
  const torso = scene.addNode('Torso_Pitch', torsoYaw.idx, { translation: [0, 0.12, 0] });
  const tg = torso.geo;
  const ttc = torso.teamGeo;

  // Waist turntable
  torsoYaw.geo.addCylinder([0, -0.08, 0], [0, 0.14, 0], 0.56, 0.62, 14, MAT.Steel_Trim);

  // Massive forward-jutting Workshop Command Carapace (-Z prow)
  tg.addHullAlongZ([
    { z: -1.14, cx: 0, cy: 0.44, hx: 0.48, hy: 0.22, ch: 0.06 },
    { z: -0.68, cx: 0, cy: 0.52, hx: 0.84, hy: 0.42, ch: 0.09 },
    { z:  0.05, cx: 0, cy: 0.58, hx: 0.94, hy: 0.48, ch: 0.10 },
    { z:  0.76, cx: 0, cy: 0.56, hx: 0.82, hy: 0.44, ch: 0.09 },
    { z:  1.16, cx: 0, cy: 0.50, hx: 0.60, hy: 0.32, ch: 0.07 },
  ], MAT.Graphite_Primary);

  // Command visor slit (-Z) + Amber_Caution chin hazard plate
  tg.addBeveledBox(0, 0.52, -1.10, 0.78, 0.12, 0.18, 0.025, MAT.Amber_Glow);
  tg.addBeveledBox(0, 0.61, -1.06, 0.86, 0.07, 0.24, 0.02, MAT.Graphite_Dark);
  tg.addCautionRowX(-0.38, 0.38, 0.26, -1.04, 0.11, 0.06, 7);

  // Broad Dorsal & Chest TeamColor Blue Plates (crystal-clear at RTS zoom!)
  ttc.addHullAlongZ([
    { z: -0.92, cx: 0, cy: 0.68, hx: 0.38, hy: 0.05, ch: 0.02 },
    { z: -0.35, cx: 0, cy: 0.98, hx: 0.62, hy: 0.06, ch: 0.03 },
    { z:  0.42, cx: 0, cy: 1.06, hx: 0.66, hy: 0.06, ch: 0.03 },
  ], MAT.TeamColor);
  for (const sx of [-1, 1]) {
    ttc.addBeveledBox(sx * 0.64, 0.68, -0.58, 0.38, 0.28, 0.44, 0.03, MAT.TeamColor);
  }

  // Rear Fusion Reactor Pack & Twin Exhaust Stacks (+Z)
  tg.addBeveledBox(0, 0.56, 1.24, 0.92, 0.56, 0.36, 0.05, MAT.Graphite_Dark);
  for (const sx of [-1, 1]) {
    tg.addCylinder([sx * 0.28, 0.52, 1.38], [sx * 0.28, 0.52, 1.46], 0.14, 0.12, 10, MAT.Amber_Glow);
    tg.addHollowBarrel([sx * 0.32, 0.80, 1.18], [sx * 0.32, 1.18, 1.30], 0.11, 0.12, 0.08, 0.18, 10, MAT.Steel_Trim, MAT.Graphite_Dark);
  }

  // Central forward muzzle reference
  scene.addMuzzle('Muzzle_Main', torso.idx, [0, 0.38, -1.58]);

  // PAIRED GROUND CANNONS (slung on heavy left & right cheek/flank gimbals — shared by both Atlas variants!)
  for (const [side, tag] of [[-1, 'L'], [1, 'R']]) {
    const mount = scene.addNode(`GroundCannon_Mount_${tag}`, torso.idx, {
      translation: [side * 1.06, 0.34, -0.10],
    });
    mount.geo.addCylinder([-side * 0.18, 0, 0], [side * 0.14, 0, 0], 0.16, 0.16, 10, MAT.Steel_Trim);
    mount.geo.addBeveledBox(side * 0.14, 0, -0.08, 0.34, 0.36, 0.66, 0.04, MAT.Graphite_Primary);
    mount.teamGeo.addBeveledBox(side * 0.31, 0.06, -0.08, 0.06, 0.24, 0.52, 0.02, MAT.TeamColor);
    mount.geo.addBeveledBox(side * 0.14, 0.18, -0.34, 0.28, 0.08, 0.14, 0.015, MAT.Amber_Caution);

    const barrel = scene.addNode(`GroundCannon_Barrel_${tag}`, mount.idx, {
      translation: [side * 0.14, -0.02, -0.38],
    });
    // Twin over-under ground cannon barrels (extending to world z = 0.06 - 0.10 - 0.38 - 1.08 = -1.50; hypot(1.20, 1.50) = 1.92 <= 2.03125!)
    barrel.geo.addBeveledBox(0, 0, -0.18, 0.24, 0.26, 0.36, 0.025, MAT.Graphite_Dark);
    barrel.geo.addHollowBarrel([0,  0.065, -0.32], [0,  0.065, -1.08], 0.065, 0.060, 0.040, 0.16, 10, MAT.Steel_Trim, MAT.Graphite_Dark);
    barrel.geo.addHollowBarrel([0, -0.065, -0.32], [0, -0.065, -1.08], 0.065, 0.060, 0.040, 0.16, 10, MAT.Steel_Trim, MAT.Graphite_Dark);
    // Muzzle clamp
    barrel.geo.addBeveledBox(0, 0, -0.96, 0.16, 0.28, 0.12, 0.015, MAT.Steel_Trim);

    scene.addMuzzle(`Muzzle_Cannon_${tag}`, barrel.idx, [0, 0, -1.10]);
  }

  // Heavy Left & Right Shoulder Pylons (mount point for either 4 Missile Pods or 2 Long Heavy Guns!)
  const pylonL = scene.addNode('Shoulder_Pylon_L', torso.idx, { translation: [-0.82, 0.96, 0.10] });
  const pylonR = scene.addNode('Shoulder_Pylon_R', torso.idx, { translation: [ 0.82, 0.96, 0.10] });
  for (const [side, pyl] of [[-1, pylonL], [1, pylonR]]) {
    pyl.geo.addBeveledBox(side * 0.06, 0.08, 0, 0.42, 0.24, 0.56, 0.04, MAT.Steel_Trim);
  }

  // Helper for shared bipedal IK pose evaluation
  const solveAtlasIK = (pPos, pRot, soleL, footRotL, soleR, footRotR) => {
    const ikL = solveTwoBoneLegIK({
      pelvisPos: pPos, pelvisRot: pRot, hipOffset: hipOffL,
      L1, L2, footH, soleWorldPos: soleL, footWorldRot: footRotL, bendSign: 1,
    });
    const ikR = solveTwoBoneLegIK({
      pelvisPos: pPos, pelvisRot: pRot, hipOffset: hipOffR,
      L1, L2, footH, soleWorldPos: soleR, footWorldRot: footRotR, bendSign: 1,
    });
    return {
      Pelvis: { t: pPos, r: pRot },
      Hip_L: { r: ikL.qHip }, Knee_L: { r: ikL.qKnee }, Ankle_L: { r: ikL.qAnkle },
      Hip_R: { r: ikR.qHip }, Knee_R: { r: ikR.qKnee }, Ankle_R: { r: ikR.qAnkle },
    };
  };

  const baseAnimNodes = [
    'Pelvis', 'Hip_L', 'Knee_L', 'Ankle_L', 'Hip_R', 'Knee_R', 'Ankle_R',
    'Torso_Yaw', 'Torso_Pitch',
    'GroundCannon_Mount_L', 'GroundCannon_Barrel_L',
    'GroundCannon_Mount_R', 'GroundCannon_Barrel_R',
    'Shoulder_Pylon_L', 'Shoulder_Pylon_R',
  ];

  return {
    pelvisRest,
    soleRestL,
    soleRestR,
    pylonL,
    pylonR,
    solveAtlasIK,
    baseAnimNodes,
  };
}

/**
 * Shared walk & death trajectories for both Atlas walkers so their shared bodies move identically!
 */
function addAtlasSharedWalk(scene, atlas, extraNodes, walkExtraFn) {
  const allNodes = [...atlas.baseAnimNodes, ...extraNodes];
  const { pelvisRest, soleRestL, soleRestR, solveAtlasIK } = atlas;

  // WALK (heavy 1.4s earth-shaking bipedal mech stride, feet pinned to Y=0 during stance!)
  scene.addSampledClip('walk', 1.4, 30, allNodes, (u) => {
    const stride = 0.48;
    const stepH = 0.28;
    const footCycle = (phase) => {
      const p = phase % 1;
      if (p < 0.5) {
        const s = p / 0.5;
        return { z: lerp(-stride, stride, s), y: 0.0, pitch: 0 };
      }
      const s = (p - 0.5) / 0.5;
      return {
        z: lerp(stride, -stride, s),
        y: Math.sin(s * Math.PI) * stepH,
        pitch: -0.20 * Math.sin(s * Math.PI),
      };
    };
    const fL = footCycle(u);
    const fR = footCycle(u + 0.5);
    const th = u * TAU;
    // Heavy stomp compression at each footstrike (u=0 and u=0.5)
    const stomp = -0.045 * Math.pow(Math.cos(th), 4);
    const pPos = [
      -0.08 * Math.cos(th),
      pelvisRest[1] - 0.05 + 0.055 * Math.abs(Math.sin(th)) + stomp,
      pelvisRest[2],
    ];
    const pRot = quatYXZ(-0.03, 0.065 * Math.cos(th), 0.045 * Math.cos(th));
    return {
      ...solveAtlasIK(
        pPos, pRot,
        [soleRestL[0], fL.y, soleRestL[2] + fL.z], quatYXZ(fL.pitch, 0, 0),
        [soleRestR[0], fR.y, soleRestR[2] + fR.z], quatYXZ(fR.pitch, 0, 0)
      ),
      Torso_Yaw: { r: quatYXZ(0, -0.095 * Math.cos(th), 0) },
      Torso_Pitch: { r: quatYXZ(0.025 * Math.sin(th * 2), 0, 0) },
      GroundCannon_Mount_L: { r: quatYXZ(0.05 * Math.sin(th), 0, 0) },
      GroundCannon_Mount_R: { r: quatYXZ(-0.05 * Math.sin(th), 0, 0) },
      ...(walkExtraFn ? walkExtraFn(u, th) : {}),
    };
  }, true);
}

function addAtlasSharedDeath(scene, atlas, extraNodes, deathExtraFn) {
  const allNodes = [...atlas.baseAnimNodes, ...extraNodes];
  const { pelvisRest, soleRestL, soleRestR, solveAtlasIK } = atlas;

  // DEATH (reactor shock -> knee buckle -> heavy crash onto Y >= 0)
  scene.addSampledClip('death', 1.8, 30, allNodes, (u) => {
    const jolt = smoothstep(0.0, 0.22, u) * (1 - smoothstep(0.22, 0.50, u));
    const fall = smoothstep(0.24, 0.88, u);
    const pPos = [
      0.10 * fall,
      lerp(pelvisRest[1], 0.72, fall) + 0.08 * jolt,
      lerp(pelvisRest[2], 0.28, fall),
    ];
    const pRot = quatYXZ(0.18 * jolt - 0.56 * fall, 0.14 * fall, 0.18 * fall);
    const soleL = [soleRestL[0] - 0.06 * fall, 0.0, soleRestL[2] - 0.22 * fall];
    const soleR = [soleRestR[0] + 0.08 * fall, 0.0, soleRestR[2] + 0.24 * fall];
    return {
      ...solveAtlasIK(pPos, pRot, soleL, quatIdentity(), soleR, quatIdentity()),
      Torso_Yaw: { r: quatYXZ(0, -0.26 * fall, 0) },
      Torso_Pitch: { r: quatYXZ(0.22 * jolt - 0.22 * fall, 0, 0.10 * fall) },
      GroundCannon_Mount_L: { r: quatYXZ(-0.22 * fall, 0, 0) },
      GroundCannon_Mount_R: { r: quatYXZ(-0.16 * fall, 0, 0) },
      ...(deathExtraFn ? deathExtraFn(u, jolt, fall) : {}),
    };
  }, false);
}

// ============================================================================
// 13. UNIT 6: ATLAS_WALKER (Radius 2.03125 — 4 Shoulder Missile Pods + Paired Ground Cannons)
// ============================================================================

function populateAtlasMissilePod(podNode, side) {
  const g = podNode.geo;
  const tc = podNode.teamGeo;

  // Armored octagonal Meridian 6-cell missile pod casing
  g.addHullAlongZ([
    { z: -0.48, cx: 0, cy: 0.22, hx: 0.23, hy: 0.24, ch: 0.045 },
    { z: -0.10, cx: 0, cy: 0.23, hx: 0.25, hy: 0.26, ch: 0.055 },
    { z:  0.38, cx: 0, cy: 0.22, hx: 0.24, hy: 0.25, ch: 0.050 },
    { z:  0.52, cx: 0, cy: 0.21, hx: 0.19, hy: 0.20, ch: 0.040 },
  ], MAT.Graphite_Primary);

  // Broad TeamColor dorsal & outer armor plate on each of the 4 pods!
  tc.addBeveledBox(0, 0.50, -0.04, 0.40, 0.06, 0.78, 0.02, MAT.TeamColor);
  tc.addBeveledBox(side * 0.25, 0.24, -0.04, 0.05, 0.34, 0.70, 0.02, MAT.TeamColor);

  // Front Amber_Caution blast bezel + recessed dark 2x3 missile tube matrix!
  g.addBeveledBox(0, 0.22, -0.49, 0.44, 0.44, 0.05, 0.015, MAT.Amber_Caution);
  g.addBeveledBox(0, 0.22, -0.51, 0.36, 0.36, 0.04, 0.01, MAT.Graphite_Dark);

  for (const mx of [-0.09, 0.09]) {
    for (const my of [0.10, 0.22, 0.34]) {
      g.addHollowBarrel([mx, my, -0.38], [mx, my, -0.53], 0.048, 0.048, 0.036, 0.10, 8, MAT.Steel_Trim, MAT.Graphite_Dark);
      g.addCylinder([mx, my, -0.46], [mx, my, -0.51], 0.028, 0.010, 8, MAT.Amber_Glow);
    }
  }
  // Rear exhaust vent
  g.addBeveledBox(0, 0.21, 0.53, 0.30, 0.30, 0.05, 0.01, MAT.Graphite_Dark);
}

function buildAtlasWalker() {
  const scene = new SceneBuilder('atlas_walker');
  const atlas = buildAtlasSharedBody(scene);

  // 4 Distinct Shoulder Missile Pods (2 per shoulder: Inner elevated + Outer flanked!)
  // Check radial bounds: Outer pod at x = +-0.82 +- 0.56 = +-1.38, halfWidth 0.25 -> max |x| = 1.63, z in [-0.42, +0.68] -> hypot(1.63, 0.68) = 1.77 <= 2.03125!
  // Also wide armored shoulder shield wing out to x = +-1.84, z = 0.10 -> hypot(1.84, 0.65) = 1.95 <= 2.03125!
  const podDefs = [
    { name: 'MissilePod_L1', muzzle: 'Muzzle_Missile_L1', pylon: atlas.pylonL, side: -1, pos: [ 0.04, 0.22, -0.04], outer: false },
    { name: 'MissilePod_L2', muzzle: 'Muzzle_Missile_L2', pylon: atlas.pylonL, side: -1, pos: [-0.52, 0.08,  0.04], outer: true },
    { name: 'MissilePod_R1', muzzle: 'Muzzle_Missile_R1', pylon: atlas.pylonR, side:  1, pos: [-0.04, 0.22, -0.04], outer: false },
    { name: 'MissilePod_R2', muzzle: 'Muzzle_Missile_R2', pylon: atlas.pylonR, side:  1, pos: [ 0.52, 0.08,  0.04], outer: true },
  ];

  const podNames = [];
  for (const pd of podDefs) {
    const pod = scene.addNode(pd.name, pd.pylon.idx, { translation: pd.pos });
    populateAtlasMissilePod(pod, pd.side);
    if (pd.outer) {
      // Outer shoulder armor pauldron attached rigidly to outer pod
      pod.geo.addBeveledBox(pd.side * 0.42, 0.02, 0.0, 0.22, 0.44, 0.88, 0.04, MAT.Graphite_Primary);
      pod.teamGeo.addBeveledBox(pd.side * 0.54, 0.06, 0.0, 0.06, 0.32, 0.70, 0.02, MAT.TeamColor);
      pod.geo.addBeveledBox(pd.side * 0.42, 0.02, -0.45, 0.20, 0.34, 0.06, 0.015, MAT.Amber_Caution);
    }
    scene.addMuzzle(pd.muzzle, pod.idx, [0, 0.22, -0.56]);
    podNames.push(pd.name);
  }

  const allNodes = [...atlas.baseAnimNodes, ...podNames];
  const { pelvisRest, soleRestL, soleRestR, solveAtlasIK } = atlas;

  // IDLE (loop)
  scene.addSampledClip('idle', 2.6, 24, allNodes, (u) => {
    const th = u * TAU;
    const pPos = [0.025 * Math.sin(th), pelvisRest[1] + 0.035 * Math.sin(th * 2), pelvisRest[2]];
    const pRot = quatYXZ(0.015 * Math.cos(th * 2), 0.035 * Math.sin(th), 0);
    return {
      ...solveAtlasIK(pPos, pRot, soleRestL, quatIdentity(), soleRestR, quatIdentity()),
      Torso_Yaw: { r: quatYXZ(0, 0.06 * Math.sin(th), 0) },
      MissilePod_L1: { r: quatYXZ(0.03 * Math.sin(th * 2), 0, 0) },
      MissilePod_L2: { r: quatYXZ(0.03 * Math.sin(th * 2 + 0.5), 0, 0) },
      MissilePod_R1: { r: quatYXZ(0.03 * Math.sin(th * 2 + 0.3), 0, 0) },
      MissilePod_R2: { r: quatYXZ(0.03 * Math.sin(th * 2 + 0.8), 0, 0) },
    };
  }, true);

  // WALK (loop)
  addAtlasSharedWalk(scene, atlas, podNames, (u, th) => ({
    MissilePod_L1: { r: quatYXZ(0.03 * Math.cos(th * 2), 0, 0) },
    MissilePod_R1: { r: quatYXZ(0.03 * Math.cos(th * 2), 0, 0) },
  }));

  // ATTACK (alternating heavy paired ground cannons + 4-pod staggered missile salvo!)
  scene.addSampledClip('attack', 1.3, 30, allNodes, (u) => {
    const env = smoothstep(0.0, 0.14, u) * (1 - smoothstep(0.80, 1.0, u));
    const cL = Math.max(
      Math.exp(-Math.pow((u - 0.18) / 0.06, 2)),
      Math.exp(-Math.pow((u - 0.54) / 0.06, 2))
    );
    const cR = Math.max(
      Math.exp(-Math.pow((u - 0.36) / 0.06, 2)),
      Math.exp(-Math.pow((u - 0.72) / 0.06, 2))
    );
    const pKick = (t0) => Math.exp(-Math.pow((u - t0) / 0.065, 2));
    const pPos = [0, pelvisRest[1] - 0.06 * env, pelvisRest[2] + 0.08 * env];
    const pRot = quatYXZ(0.05 * env, 0, 0);
    return {
      ...solveAtlasIK(pPos, pRot, soleRestL, quatIdentity(), soleRestR, quatIdentity()),
      Torso_Yaw: { r: quatYXZ(0, 0.05 * (cL - cR), 0) },
      Torso_Pitch: { r: quatYXZ(0.06 * env + 0.04 * Math.max(cL, cR), 0, 0) },
      GroundCannon_Barrel_L: { t: [-0.14, -0.02, -0.38 + 0.24 * cL] },
      GroundCannon_Barrel_R: { t: [ 0.14, -0.02, -0.38 + 0.24 * cR] },
      MissilePod_L1: { t: [ 0.04, 0.22, -0.04 + 0.14 * pKick(0.24)], r: quatYXZ(0.10 * env, 0, 0) },
      MissilePod_R1: { t: [-0.04, 0.22, -0.04 + 0.14 * pKick(0.38)], r: quatYXZ(0.10 * env, 0, 0) },
      MissilePod_L2: { t: [-0.52, 0.08,  0.04 + 0.14 * pKick(0.52)], r: quatYXZ(0.10 * env, 0, 0) },
      MissilePod_R2: { t: [ 0.52, 0.08,  0.04 + 0.14 * pKick(0.66)], r: quatYXZ(0.10 * env, 0, 0) },
    };
  }, false);

  // CAST (saturation barrage: deep crouch, all 4 shoulder missile pods elevate 26 deg & ripple-fire!)
  scene.addSampledClip('cast', 1.8, 30, allNodes, (u) => {
    const env = smoothstep(0.0, 0.20, u) * (1 - smoothstep(0.82, 1.0, u));
    const salvo = smoothstep(0.28, 0.38, u) * (1 - smoothstep(0.72, 0.88, u));
    const rip = (ph) => Math.max(0, Math.sin((u * 5 + ph) * TAU)) * salvo;
    const pPos = [0, pelvisRest[1] - 0.14 * env, pelvisRest[2] + 0.12 * salvo];
    const pRot = quatYXZ(0.08 * salvo, 0, 0);
    return {
      ...solveAtlasIK(pPos, pRot, soleRestL, quatIdentity(), soleRestR, quatIdentity()),
      Torso_Pitch: { r: quatYXZ(0.12 * env + 0.08 * salvo, 0, 0) },
      Shoulder_Pylon_L: { r: quatYXZ(0.32 * env, 0.08 * env, 0) },
      Shoulder_Pylon_R: { r: quatYXZ(0.32 * env, -0.08 * env, 0) },
      MissilePod_L1: { t: [ 0.04, 0.22, -0.04 + 0.16 * rip(0.00)], r: quatYXZ(0.12 * env, 0, 0) },
      MissilePod_L2: { t: [-0.52, 0.08,  0.04 + 0.16 * rip(0.25)], r: quatYXZ(0.12 * env, 0, 0) },
      MissilePod_R1: { t: [-0.04, 0.22, -0.04 + 0.16 * rip(0.50)], r: quatYXZ(0.12 * env, 0, 0) },
      MissilePod_R2: { t: [ 0.52, 0.08,  0.04 + 0.16 * rip(0.75)], r: quatYXZ(0.12 * env, 0, 0) },
    };
  }, false);

  // MORPH (shoulder pod rack stowage & reconfiguration toward atlas_walker_precision!)
  scene.addSampledClip('morph', 1.6, 30, allNodes, (u) => {
    const s = smoothstep(0.06, 0.92, u);
    const pPos = [0, pelvisRest[1] - 0.10 * Math.sin(s * Math.PI), pelvisRest[2]];
    return {
      ...solveAtlasIK(pPos, quatIdentity(), soleRestL, quatIdentity(), soleRestR, quatIdentity()),
      Shoulder_Pylon_L: { r: quatYXZ(-0.18 * Math.sin(s * Math.PI), 0, 0) },
      Shoulder_Pylon_R: { r: quatYXZ(-0.18 * Math.sin(s * Math.PI), 0, 0) },
      MissilePod_L2: {
        t: [lerp(-0.52, -0.10, s), lerp(0.08, 0.20, s), lerp(0.04, -0.25, s)],
        s: [lerp(1, 0.55, s), lerp(1, 0.65, s), lerp(1, 1.85, s)],
      },
      MissilePod_R2: {
        t: [lerp(0.52, 0.10, s), lerp(0.08, 0.20, s), lerp(0.04, -0.25, s)],
        s: [lerp(1, 0.55, s), lerp(1, 0.65, s), lerp(1, 1.85, s)],
      },
      MissilePod_L1: {
        t: [0.04, 0.22, lerp(-0.04, -0.35, s)],
        s: [lerp(1, 0.65, s), lerp(1, 0.70, s), lerp(1, 2.2, s)],
      },
      MissilePod_R1: {
        t: [-0.04, 0.22, lerp(-0.04, -0.35, s)],
        s: [lerp(1, 0.65, s), lerp(1, 0.70, s), lerp(1, 2.2, s)],
      },
    };
  }, false);

  // DEATH
  addAtlasSharedDeath(scene, atlas, podNames, (u, jolt, fall) => ({
    MissilePod_L2: { r: quatYXZ(-0.18 * fall, 0, 0.26 * fall) },
    MissilePod_R2: { r: quatYXZ(-0.15 * fall, 0, -0.28 * fall) },
  }));

  return scene;
}

// ============================================================================
// 14. UNIT 7: ATLAS_WALKER_PRECISION (Radius 2.03125 — Shared Body + Two Long Heavy Guns)
// ============================================================================

function buildAtlasHeavyShoulderGun(scene, pylonNode, side, tag) {
  // Gimballing elevation cradle on Shoulder_Pylon_L/R (world x = +-0.86, world z = +0.16)
  const cradle = scene.addNode(`HeavyGun_Cradle_${tag}`, pylonNode.idx, {
    translation: [side * 0.04, 0.20, 0.0],
  });
  const cg = cradle.geo;
  const ctc = cradle.teamGeo;

  // Massive Counterweight Breech & Recoil Rail Housing (from z = +1.44 back behind shoulder to z = -0.58 forward!)
  cg.addHullAlongZ([
    { z: -0.60, cx: 0, cy: 0.16, hx: 0.21, hy: 0.18, ch: 0.04 },
    { z:  0.10, cx: 0, cy: 0.20, hx: 0.26, hy: 0.24, ch: 0.05 },
    { z:  0.95, cx: 0, cy: 0.20, hx: 0.25, hy: 0.23, ch: 0.05 },
    { z:  1.42, cx: 0, cy: 0.19, hx: 0.19, hy: 0.18, ch: 0.04 },
  ], MAT.Graphite_Primary);

  // Broad TeamColor dorsal & outer breech plates
  ctc.addBeveledBox(0, 0.46, 0.22, 0.38, 0.06, 1.38, 0.02, MAT.TeamColor);
  ctc.addBeveledBox(side * 0.26, 0.22, 0.24, 0.05, 0.30, 1.24, 0.02, MAT.TeamColor);

  // Amber_Caution recoil track & rear capacitor glow core
  cg.addCautionRowZ(side * 0.24, 0.02, -0.50, 0.40, 0.06, 0.09, 5);
  cg.addCylinder([0, 0.19, 1.42], [0, 0.19, 1.50], 0.11, 0.09, 10, MAT.Amber_Glow);

  // Long Heavy Recoiling Barrel Assembly (stretching far forward to local z = -1.90 => world z = 0.16 - 1.90 = -1.74!
  // Check exact radial distance at muzzle brake outer corner: hypot(1.00, 1.74) = 2.007 <= 2.03125!)
  const barrel = scene.addNode(`HeavyGun_Barrel_${tag}`, cradle.idx, {
    translation: [0, 0.16, 0],
  });
  const bg = barrel.geo;
  const btc = barrel.teamGeo;

  // Forward armored rail-shroud jacket + TeamColor dorsal barrel fin + glowing Amber_Glow charge rails!
  bg.addBeveledBox(0, 0.02, -0.94, 0.26, 0.24, 0.86, 0.03, MAT.Graphite_Dark);
  btc.addBeveledBox(0, 0.155, -0.94, 0.18, 0.04, 0.78, 0.012, MAT.TeamColor);
  bg.addBeveledBox(-0.14, 0.02, -0.96, 0.03, 0.055, 0.76, 0.008, MAT.Amber_Glow);
  bg.addBeveledBox( 0.14, 0.02, -0.96, 0.03, 0.055, 0.76, 0.008, MAT.Amber_Glow);

  // Long heavy machined Steel_Trim precision cannon barrel + under-barrel hydraulic recuperator rod!
  bg.addCylinder([0, 0.03, -0.50], [0, 0.03, -1.72], 0.095, 0.085, 12, MAT.Steel_Trim);
  bg.addCylinder([0, -0.09, -0.50], [0, -0.09, -1.44], 0.048, 0.042, 8, MAT.Steel_Trim);
  bg.addCylinder([0, 0.03, -1.42], [0, 0.03, -1.52], 0.11, 0.11, 10, MAT.Amber_Caution);

  // Wide multi-baffle precision artillery muzzle brake at tip (z = -1.70 to -1.90)
  bg.addBeveledBox(0, 0.03, -1.79, 0.27, 0.20, 0.20, 0.025, MAT.Steel_Trim);
  bg.addHollowBarrel([0, 0.03, -1.70], [0, 0.03, -1.90], 0.09, 0.09, 0.058, 0.16, 10, MAT.Graphite_Dark, MAT.Amber_Glow);

  scene.addMuzzle(`Muzzle_HeavyGun_${tag}`, barrel.idx, [0, 0.03, -1.92]);

  return { cradle, barrel };
}

function buildAtlasWalkerPrecision() {
  const scene = new SceneBuilder('atlas_walker_precision');
  const atlas = buildAtlasSharedBody(scene);

  // Outer compact stabilizer fins on shoulders so silhouette stays cohesive while showcasing the 2 long heavy guns!
  for (const [side, pyl] of [[-1, atlas.pylonL], [1, atlas.pylonR]]) {
    pyl.geo.addBeveledBox(side * 0.42, 0.10, 0.04, 0.22, 0.30, 0.56, 0.035, MAT.Graphite_Primary);
    pyl.teamGeo.addBeveledBox(side * 0.53, 0.12, 0.04, 0.05, 0.22, 0.44, 0.015, MAT.TeamColor);
  }

  buildAtlasHeavyShoulderGun(scene, atlas.pylonL, -1, 'L');
  buildAtlasHeavyShoulderGun(scene, atlas.pylonR,  1, 'R');

  const gunNodes = [
    'HeavyGun_Cradle_L', 'HeavyGun_Barrel_L',
    'HeavyGun_Cradle_R', 'HeavyGun_Barrel_R',
  ];
  const allNodes = [...atlas.baseAnimNodes, ...gunNodes];
  const { pelvisRest, soleRestL, soleRestR, solveAtlasIK } = atlas;

  // IDLE (poised sniper-walker stance loop)
  scene.addSampledClip('idle', 2.6, 24, allNodes, (u) => {
    const th = u * TAU;
    const pPos = [0.02 * Math.sin(th), pelvisRest[1] + 0.03 * Math.sin(th * 2), pelvisRest[2]];
    const pRot = quatYXZ(0.012 * Math.cos(th * 2), 0.03 * Math.sin(th), 0);
    return {
      ...solveAtlasIK(pPos, pRot, soleRestL, quatIdentity(), soleRestR, quatIdentity()),
      Torso_Yaw: { r: quatYXZ(0, 0.05 * Math.sin(th), 0) },
      HeavyGun_Cradle_L: { r: quatYXZ(0.025 * Math.sin(th * 2), 0, 0) },
      HeavyGun_Cradle_R: { r: quatYXZ(0.025 * Math.sin(th * 2 + 0.4), 0, 0) },
    };
  }, true);

  // WALK (loop)
  addAtlasSharedWalk(scene, atlas, gunNodes, (u, th) => ({
    HeavyGun_Cradle_L: { r: quatYXZ(-0.035 * Math.sin(th * 2), 0, 0) },
    HeavyGun_Cradle_R: { r: quatYXZ(-0.035 * Math.sin(th * 2), 0, 0) },
  }));

  // ATTACK (powerful alternating long-barrel heavy gun recoil + recuperator return + ground cannon support!)
  scene.addSampledClip('attack', 1.4, 30, allNodes, (u) => {
    const env = smoothstep(0.0, 0.12, u) * (1 - smoothstep(0.82, 1.0, u));
    // Sharp recoil impulse + smooth hydraulic recuperator return
    const recoilCurve = (u0) => {
      if (u < u0) return 0;
      const dt = (u - u0) / 0.34;
      if (dt > 1) return 0;
      return Math.sin(Math.pow(dt, 0.45) * Math.PI);
    };
    const rL = recoilCurve(0.12);
    const rR = recoilCurve(0.46);
    const shock = Math.max(rL, rR);
    const pPos = [0, pelvisRest[1] - 0.07 * env - 0.04 * shock, pelvisRest[2] + 0.09 * shock];
    const pRot = quatYXZ(0.07 * shock, 0, 0);
    return {
      ...solveAtlasIK(pPos, pRot, soleRestL, quatIdentity(), soleRestR, quatIdentity()),
      Torso_Yaw: { r: quatYXZ(0, 0.085 * (rL - rR), 0) },
      Torso_Pitch: { r: quatYXZ(0.09 * shock, 0, 0) },
      HeavyGun_Cradle_L: { r: quatYXZ(0.06 * rL, 0, 0) },
      HeavyGun_Cradle_R: { r: quatYXZ(0.06 * rR, 0, 0) },
      HeavyGun_Barrel_L: { t: [0, 0.16, 0.44 * rL] },
      HeavyGun_Barrel_R: { t: [0, 0.16, 0.44 * rR] },
      GroundCannon_Barrel_L: { t: [-0.14, -0.02, -0.38 + 0.16 * rR] },
      GroundCannon_Barrel_R: { t: [ 0.14, -0.02, -0.38 + 0.16 * rL] },
    };
  }, false);

  // CAST (precision siege rail-shot: deep braced lock -> dual synchronized heavy-gun mega recoil!)
  scene.addSampledClip('cast', 1.9, 30, allNodes, (u) => {
    const brace = smoothstep(0.0, 0.25, u) * (1 - smoothstep(0.82, 1.0, u));
    const blast = u < 0.42 ? 0 : u > 0.88 ? 0 : Math.sin(Math.pow((u - 0.42) / 0.46, 0.40) * Math.PI);
    const pPos = [0, pelvisRest[1] - 0.14 * brace - 0.06 * blast, pelvisRest[2] + 0.18 * blast];
    const pRot = quatYXZ(0.14 * blast - 0.03 * brace, 0, 0);
    return {
      ...solveAtlasIK(pPos, pRot, soleRestL, quatIdentity(), soleRestR, quatIdentity()),
      Torso_Pitch: { r: quatYXZ(0.14 * blast - 0.04 * brace, 0, 0) },
      HeavyGun_Cradle_L: { r: quatYXZ(0.08 * blast, -0.02 * brace, 0) },
      HeavyGun_Cradle_R: { r: quatYXZ(0.08 * blast,  0.02 * brace, 0) },
      HeavyGun_Barrel_L: { t: [0, 0.16, -0.06 * brace + 0.56 * blast] },
      HeavyGun_Barrel_R: { t: [0, 0.16, -0.06 * brace + 0.56 * blast] },
      GroundCannon_Barrel_L: { t: [-0.14, -0.02, -0.38 + 0.22 * blast] },
      GroundCannon_Barrel_R: { t: [ 0.14, -0.02, -0.38 + 0.22 * blast] },
    };
  }, false);

  // MORPH (retract long heavy barrels back into shoulder pylons toward atlas_walker pod profile!)
  scene.addSampledClip('morph', 1.6, 30, allNodes, (u) => {
    const s = smoothstep(0.06, 0.92, u);
    const pPos = [0, pelvisRest[1] - 0.10 * Math.sin(s * Math.PI), pelvisRest[2]];
    return {
      ...solveAtlasIK(pPos, quatIdentity(), soleRestL, quatIdentity(), soleRestR, quatIdentity()),
      HeavyGun_Barrel_L: {
        t: [0, 0.16, lerp(0, 0.85, s)],
        s: [1, 1, lerp(1, 0.35, s)],
      },
      HeavyGun_Barrel_R: {
        t: [0, 0.16, lerp(0, 0.85, s)],
        s: [1, 1, lerp(1, 0.35, s)],
      },
      HeavyGun_Cradle_L: {
        t: [lerp(-0.04, -0.22, s), 0.20, lerp(0, -0.22, s)],
        s: [lerp(1, 1.45, s), lerp(1, 1.15, s), lerp(1, 0.52, s)],
      },
      HeavyGun_Cradle_R: {
        t: [lerp(0.04, 0.22, s), 0.20, lerp(0, -0.22, s)],
        s: [lerp(1, 1.45, s), lerp(1, 1.15, s), lerp(1, 0.52, s)],
      },
    };
  }, false);

  // DEATH
  addAtlasSharedDeath(scene, atlas, gunNodes, (u, jolt, fall) => ({
    HeavyGun_Cradle_L: { r: quatYXZ(-0.24 * fall + 0.14 * jolt, 0, 0.08 * fall) },
    HeavyGun_Cradle_R: { r: quatYXZ(-0.20 * fall + 0.14 * jolt, 0, -0.08 * fall) },
  }));

  return scene;
}

// ============================================================================
// 15. MAIN GENERATOR ENTRYPOINT
// ============================================================================

const UNIT_SPECS = [
  { name: 'cinder_runner',          radius: 1.5625,  build: buildCinderRunner },
  { name: 'cinder_guard',           radius: 1.5625,  build: buildCinderGuard },
  { name: 'sentinel_mine',          radius: 1.25,    build: buildSentinelMine },
  { name: 'sentinel_mine_armed',    radius: 1.25,    build: buildSentinelMineArmed },
  { name: 'vortex_rover',           radius: 1.875,   build: buildVortexRover },
  { name: 'atlas_walker',           radius: 2.03125, build: buildAtlasWalker },
  { name: 'atlas_walker_precision', radius: 2.03125, build: buildAtlasWalkerPrecision },
];

function generateAll(outDir = OUTPUT_DIR) {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];

  for (const spec of UNIT_SPECS) {
    const scene = spec.build();
    const bounds = scene.computeRestBounds();
    const glb = scene.toGLB();
    const outPath = path.join(outDir, `${spec.name}.glb`);
    fs.writeFileSync(outPath, glb);
    const sha256 = crypto.createHash('sha256').update(glb).digest('hex');

    results.push({
      name: spec.name,
      file: `${spec.name}.glb`,
      targetRadius: spec.radius,
      actualXZRadius: Number(bounds.maxXZR.toFixed(5)),
      radiusFillPct: Number(((bounds.maxXZR / spec.radius) * 100).toFixed(2)),
      minY: Number(bounds.minY.toFixed(5)),
      maxY: Number(bounds.maxY.toFixed(5)),
      widthX: Number((bounds.maxX - bounds.minX).toFixed(5)),
      depthZ: Number((bounds.maxZ - bounds.minZ).toFixed(5)),
      triangles: bounds.triCount,
      clips: scene.animations.map((a) => a.name),
      muzzles: scene.nodes.filter((n) => n.name.startsWith('Muzzle')).map((n) => n.name),
      bytes: glb.length,
      sha256,
    });
  }

  return results;
}

if (require.main === module) {
  const summary = generateAll(OUTPUT_DIR);
  console.log('Starfall Meridian Factory GLB Generation Complete:');
  for (const r of summary) {
    console.log(
      `  - ${r.file.padEnd(28)} | R=${r.actualXZRadius}/${r.targetRadius} (${r.radiusFillPct}%) | ` +
      `Y=[${r.minY}, ${r.maxY}] | tris=${r.triangles} | clips=[${r.clips.join(',')}] | ` +
      `${(r.bytes / 1024).toFixed(1)} KB | sha256=${r.sha256.slice(0, 12)}`
    );
  }
}

module.exports = { generateAll, UNIT_SPECS, OUTPUT_DIR };
