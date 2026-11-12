'use strict';
const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const TAU = Math.PI * 2;

// --- Math & Transform Helpers ---
const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
};

function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function quatNormalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

// Intrinsic Y-X-Z order (yaw Y, then pitch X, then roll Z) for intuitive joint posing
function eulerQ(rx = 0, ry = 0, rz = 0) {
  const qx = [Math.sin(rx * 0.5), 0, 0, Math.cos(rx * 0.5)];
  const qy = [0, Math.sin(ry * 0.5), 0, Math.cos(ry * 0.5)];
  const qz = [0, 0, Math.sin(rz * 0.5), Math.cos(rz * 0.5)];
  return quatNormalize(quatMul(quatMul(qy, qx), qz));
}

function rotQuat3(p, q) {
  const u = [q[0], q[1], q[2]], s = q[3];
  const d = dot3(u, p), c = cross3(u, p);
  return [
    2 * d * u[0] + (s * s - dot3(u, u)) * p[0] + 2 * s * c[0],
    2 * d * u[1] + (s * s - dot3(u, u)) * p[1] + 2 * s * c[1],
    2 * d * u[2] + (s * s - dot3(u, u)) * p[2] + 2 * s * c[2],
  ];
}

function xformPt(p, trs) {
  if (!trs) return p;
  let v = [
    p[0] * (trs.s ? trs.s[0] : 1),
    p[1] * (trs.s ? trs.s[1] : 1),
    p[2] * (trs.s ? trs.s[2] : 1),
  ];
  if (trs.r) v = rotQuat3(v, trs.r);
  if (trs.t) v = add3(v, trs.t);
  return v;
}

// --- Low-Poly Faceted Mesh Builder ---
function createMesh() {
  return { pos: [], norm: [], uv: [], idx: [] };
}

function addTri(m, a, b, c, ua = [0, 0], ub = [1, 0], uc = [0.5, 1]) {
  const ab = sub3(b, a), ac = sub3(c, a), cr = cross3(ab, ac);
  const len = Math.hypot(cr[0], cr[1], cr[2]);
  if (len < 1e-10) return;
  const n = [cr[0] / len, cr[1] / len, cr[2] / len];
  const base = m.pos.length / 3;
  m.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  m.norm.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
  m.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  m.idx.push(base, base + 1, base + 2);
}

function addQuad(m, a, b, c, d) {
  addTri(m, a, b, c, [0, 0], [1, 0], [1, 1]);
  addTri(m, a, c, d, [0, 0], [1, 1], [0, 1]);
}

function mergeTransformed(dst, src, trs) {
  const base = dst.pos.length / 3;
  const q = trs && trs.r ? trs.r : null;
  const s = trs && trs.s ? trs.s : [1, 1, 1];
  const flip = s[0] * s[1] * s[2] < 0;
  for (let i = 0; i < src.pos.length; i += 3) {
    const p = xformPt([src.pos[i], src.pos[i + 1], src.pos[i + 2]], trs);
    let n = [src.norm[i] / s[0], src.norm[i + 1] / s[1], src.norm[i + 2] / s[2]];
    if (q) n = rotQuat3(n, q);
    if (flip) n = scale3(n, -1);
    n = norm3(n);
    dst.pos.push(p[0], p[1], p[2]);
    dst.norm.push(n[0], n[1], n[2]);
  }
  for (let i = 0; i < src.uv.length; i++) dst.uv.push(src.uv[i]);
  for (let i = 0; i < src.idx.length; i += 3) {
    if (flip) dst.idx.push(base + src.idx[i], base + src.idx[i + 2], base + src.idx[i + 1]);
    else dst.idx.push(base + src.idx[i], base + src.idx[i + 1], base + src.idx[i + 2]);
  }
}

// Loft cross-section rings with automatic outward winding check
function addLoft(m, rings, capStart = true, capEnd = true, trs = null) {
  const tmp = createMesh();
  const K = rings.length, N = rings[0].length;
  const centroids = rings.map((r) => {
    let sx = 0, sy = 0, sz = 0;
    for (const p of r) { sx += p[0]; sy += p[1]; sz += p[2]; }
    return [sx / N, sy / N, sz / N];
  });
  let orient = 0;
  for (let k = 0; k < K - 1; k++) {
    const cm = scale3(add3(centroids[k], centroids[k + 1]), 0.5);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const p00 = rings[k][i], p01 = rings[k][j], p11 = rings[k + 1][j];
      const mid = scale3(add3(add3(p00, p01), add3(p11, rings[k + 1][i])), 0.25);
      orient += dot3(cross3(sub3(p01, p00), sub3(p11, p00)), sub3(mid, cm));
    }
  }
  const R = orient < 0 ? rings.map((r) => r.slice().reverse()) : rings;
  for (let k = 0; k < K - 1; k++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      addQuad(tmp, R[k][i], R[k][j], R[k + 1][j], R[k + 1][i]);
    }
  }
  if (capStart) {
    const c0 = centroids[0];
    for (let i = 0; i < N; i++) addTri(tmp, c0, R[0][(i + 1) % N], R[0][i]);
  }
  if (capEnd) {
    const c1 = centroids[K - 1];
    for (let i = 0; i < N; i++) addTri(tmp, c1, R[K - 1][i], R[K - 1][(i + 1) % N]);
  }
  mergeTransformed(m, tmp, trs);
}

// Extrude 2D XZ polygon from y0 to y1 with optional top scale & offset
function addExtrudeXZ(m, polyXZ, y0, y1, sx = 1, sz = 1, ox = 0, oz = 0, trs = null) {
  let area = 0;
  for (let i = 0; i < polyXZ.length; i++) {
    const a = polyXZ[i], b = polyXZ[(i + 1) % polyXZ.length];
    area += a[0] * b[1] - a[1] * b[0];
  }
  const pts = area > 0 ? polyXZ.slice().reverse() : polyXZ;
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cz += p[1]; }
  cx /= pts.length; cz /= pts.length;
  const bot = pts.map(([x, z]) => [x, y0, z]);
  const top = pts.map(([x, z]) => [cx + (x - cx) * sx + ox, y1, cz + (z - cz) * sz + oz]);
  addLoft(m, [bot, top], true, true, trs);
}

// Tapered box / trapezoid prism
function addBox(m, wx, hy, dz, trs = null, topSx = 1, topSz = 1, topOx = 0, topOz = 0) {
  const x = wx * 0.5, z = dz * 0.5;
  addExtrudeXZ(m, [[-x, -z], [-x, z], [x, z], [x, -z]], -hy * 0.5, hy * 0.5, topSx, topSz, topOx, topOz, trs);
}

// Point-to-point tapered prism/cylinder
function addTube(m, p0, p1, r0, r1, sides = 8, cap0 = true, cap1 = true) {
  const dir = sub3(p1, p0), len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len < 1e-6) return;
  const up = [dir[0] / len, dir[1] / len, dir[2] / len];
  const ref = Math.abs(up[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
  const tangent = norm3(cross3(ref, up));
  const bitan = cross3(up, tangent);
  const ring0 = [], ring1 = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const rad = [tangent[0] * ca + bitan[0] * sa, tangent[1] * ca + bitan[1] * sa, tangent[2] * ca + bitan[2] * sa];
    ring0.push(add3(p0, scale3(rad, r0)));
    ring1.push(add3(p1, scale3(rad, r1)));
  }
  addLoft(m, [ring0, ring1], cap0, cap1);
}

// Double-sided or thickened shell between open curves (for hoods & ballistic mantles)
function addThickSheet(m, rows, thickness = 0.018) {
  const R = rows.length, C = rows[0].length;
  const normals = rows.map((row, r) =>
    row.map((p, c) => {
      const pL = row[Math.max(0, c - 1)], pR = row[Math.min(C - 1, c + 1)];
      const pU = rows[Math.max(0, r - 1)][c], pD = rows[Math.min(R - 1, r + 1)][c];
      return norm3(cross3(sub3(pR, pL), sub3(pD, pU)));
    })
  );
  const half = thickness * 0.5;
  const front = rows.map((row, r) => row.map((p, c) => add3(p, scale3(normals[r][c], half))));
  const back = rows.map((row, r) => row.map((p, c) => add3(p, scale3(normals[r][c], -half))));
  for (let r = 0; r < R - 1; r++) {
    for (let c = 0; c < C - 1; c++) {
      addQuad(m, front[r][c], front[r][c + 1], front[r + 1][c + 1], front[r + 1][c]);
      addQuad(m, back[r][c + 1], back[r][c], back[r + 1][c], back[r + 1][c + 1]);
    }
  }
  for (let c = 0; c < C - 1; c++) {
    addQuad(m, back[0][c], front[0][c], front[0][c + 1], back[0][c + 1]);
    addQuad(m, front[R - 1][c], back[R - 1][c], back[R - 1][c + 1], front[R - 1][c + 1]);
  }
  for (let r = 0; r < R - 1; r++) {
    addQuad(m, back[r][0], back[r + 1][0], front[r + 1][0], front[r][0]);
    addQuad(m, front[r][C - 1], front[r + 1][C - 1], back[r + 1][C - 1], back[r][C - 1]);
  }
}

// Revolved polygonal profile around Y (supports recessed hollow pits cleanly)
function addSweepProfile(m, profileRY, sides, angleOffset = 0, cx = 0, cz = 0, sx = 1, sz = 1) {
  const rings = profileRY.map(([r, y]) => {
    const ring = [];
    for (let i = 0; i < sides; i++) {
      const a = angleOffset + (i / sides) * TAU;
      ring.push([cx + Math.sin(a) * r * sx, y, cz + Math.cos(a) * r * sz]);
    }
    return ring;
  });
  for (let k = 0; k < rings.length - 1; k++) {
    const r0 = profileRY[k][0], r1 = profileRY[k + 1][0];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      if (r0 < 1e-5 && r1 > 1e-5) {
        addTri(m, rings[k][0], rings[k + 1][j], rings[k + 1][i]);
      } else if (r1 < 1e-5 && r0 > 1e-5) {
        addTri(m, rings[k][i], rings[k][j], rings[k + 1][0]);
      } else if (r0 > 1e-5 || r1 > 1e-5) {
        addQuad(m, rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]);
      }
    }
  }
}

function octRing(rx, y, rz, oy = 0, oz = 0) {
  const c = 0.7071;
  return [
    [0, y + oy, rz + oz],
    [rx * c, y + oy * 0.7, rz * c + oz],
    [rx, y, oz],
    [rx * c, y - oy * 0.7, -rz * c + oz],
    [0, y - oy, -rz + oz],
    [-rx * c, y - oy * 0.7, -rz * c + oz],
    [-rx, y, oz],
    [-rx * c, y + oy * 0.7, rz * c + oz],
  ];
}

// ============================================================================
// MODEL 1: shade_agent.glb (Slim covert scout, hooded ballistic mantle,
//          long canister rifle, blue separate TeamColor, muzzle, radius 0.94)
// ============================================================================
function buildShadeAgent() {
  const materials = [
    { name: 'CharcoalArmor', baseColorFactor: [0.115, 0.128, 0.148, 1], metallicFactor: 0.40, roughnessFactor: 0.46 },
    { name: 'BallisticMantle', baseColorFactor: [0.066, 0.075, 0.092, 1], metallicFactor: 0.08, roughnessFactor: 0.80, doubleSided: true },
    { name: 'WeaponAlloy', baseColorFactor: [0.235, 0.262, 0.300, 1], metallicFactor: 0.80, roughnessFactor: 0.32 },
    { name: 'TeamColor', baseColorFactor: [0.075, 0.410, 0.945, 1], metallicFactor: 0.24, roughnessFactor: 0.38 },
    { name: 'SensorGlow', baseColorFactor: [0.22, 0.82, 1.0, 1], emissiveFactor: [0.20, 0.76, 1.0], metallicFactor: 0.10, roughnessFactor: 0.20 },
  ];
  const MAT = { ARMOR: 0, MANTLE: 1, ALLOY: 2, TEAM: 3, GLOW: 4 };

  const nodes = [];
  const meshes = [];
  function addNode(def) {
    const id = nodes.length;
    nodes.push(def);
    return id;
  }
  function attachMesh(name, matIndex, meshData) {
    const id = meshes.length;
    meshes.push({ name, matIndex, data: meshData });
    return id;
  }

  // --- Pelvis & Belt ---
  const mPelvis = createMesh();
  addLoft(mPelvis, [
    octRing(0.115, -0.07, 0.085),
    octRing(0.145, 0.00, 0.105),
    octRing(0.132, 0.07, 0.095),
  ]);
  // Tactical covert side utility pods
  addBox(mPelvis, 0.05, 0.09, 0.10, { t: [0.15, 0.01, -0.01], r: eulerQ(0, 0, -0.12) }, 0.85, 0.85);
  addBox(mPelvis, 0.05, 0.09, 0.10, { t: [-0.15, 0.01, -0.01], r: eulerQ(0, 0, 0.12) }, 0.85, 0.85);
  addBox(mPelvis, 0.09, 0.08, 0.05, { t: [0, 0.01, -0.115] }, 0.85, 0.85);

  // --- Spine / Slim Torso & Covert Carapace ---
  const mSpine = createMesh();
  addLoft(mSpine, [
    octRing(0.118, 0.00, 0.085),
    octRing(0.126, 0.12, 0.092),
    octRing(0.178, 0.26, 0.122, 0, 0.012),
    octRing(0.188, 0.37, 0.120, 0, 0.008),
    octRing(0.135, 0.43, 0.095),
  ]);
  // Angular sternum armor & dorsal stealth field pack
  addExtrudeXZ(
    mSpine,
    [[-0.12, 0.09], [0, 0.145], [0.12, 0.09], [0.14, 0.04], [-0.14, 0.04]],
    0.18, 0.37, 0.82, 0.85
  );
  addBox(mSpine, 0.17, 0.23, 0.085, { t: [0, 0.28, -0.135], r: eulerQ(0.06, 0, 0) }, 0.82, 0.75);

  // Chest Sensor & Chest TeamColor
  const mChestGlow = createMesh();
  addBox(mChestGlow, 0.032, 0.14, 0.025, { t: [0, 0.28, -0.182] }, 0.8, 0.8);
  addBox(mChestGlow, 0.055, 0.024, 0.02, { t: [0, 0.31, 0.142], r: eulerQ(-0.1, 0, 0) });

  const mTeamChest = createMesh();
  // Twin angled chest chevron panels
  addBox(mTeamChest, 0.068, 0.032, 0.016, { t: [0.068, 0.265, 0.132], r: eulerQ(-0.12, 0.28, -0.24) });
  addBox(mTeamChest, 0.068, 0.032, 0.016, { t: [-0.068, 0.265, 0.132], r: eulerQ(-0.12, -0.28, 0.24) });

  // --- Ballistic Mantle Shoulders & Collar ---
  const mMantleYoke = createMesh();
  // Sculpted armored mantle yoke draping over both shoulders
  const yokeRows = [
    [[-0.35, -0.07, 0.11], [-0.20, 0.02, 0.145], [0.0, 0.00, 0.155], [0.20, 0.02, 0.145], [0.35, -0.07, 0.11]],
    [[-0.36, -0.01, 0.01], [-0.22, 0.075, 0.03], [0.0, 0.065, 0.03], [0.22, 0.075, 0.03], [0.36, -0.01, 0.01]],
    [[-0.34, -0.06, -0.12], [-0.21, 0.045, -0.14], [0.0, 0.045, -0.16], [0.21, 0.045, -0.14], [0.34, -0.06, -0.12]],
  ];
  addThickSheet(mMantleYoke, yokeRows, 0.026);
  // High upturned ballistic collar around neck
  addLoft(mMantleYoke, [
    [[-0.13, 0.02, 0.07], [-0.14, 0.02, -0.06], [0, 0.02, -0.13], [0.14, 0.02, -0.06], [0.13, 0.02, 0.07]],
    [[-0.15, 0.10, 0.06], [-0.16, 0.11, -0.08], [0, 0.12, -0.15], [0.16, 0.11, -0.08], [0.15, 0.10, 0.06]],
  ], false, false);

  // Separate Blue TeamColor Shoulder Mantle Panels (highly readable from RTS top-down!)
  const mTeamMantleL = createMesh();
  addExtrudeXZ(
    mTeamMantleL,
    [[0.15, -0.09], [0.33, -0.06], [0.355, 0.03], [0.31, 0.10], [0.16, 0.08]],
    0.048, 0.066, 0.92, 0.92, 0, 0,
    { r: eulerQ(0.04, 0, -0.26), t: [0.01, 0.055, 0] }
  );
  const mTeamMantleR = createMesh();
  addExtrudeXZ(
    mTeamMantleR,
    [[-0.16, 0.08], [-0.31, 0.10], [-0.355, 0.03], [-0.33, -0.06], [-0.15, -0.09]],
    0.048, 0.066, 0.92, 0.92, 0, 0,
    { r: eulerQ(0.04, 0, 0.26), t: [-0.01, 0.055, 0] }
  );

  // --- MantleBack (Split covert ballistic cloak hanging down back) ---
  const mMantleBack = createMesh();
  // Left cloak wing (+X)
  addThickSheet(mMantleBack, [
    [[0.02, 0.02, 0.01], [0.14, 0.02, 0.00], [0.26, -0.01, 0.02]],
    [[0.03, -0.24, -0.06], [0.16, -0.24, -0.08], [0.29, -0.26, -0.04]],
    [[0.045, -0.52, -0.13], [0.18, -0.53, -0.15], [0.30, -0.55, -0.10]],
    [[0.07, -0.76, -0.18], [0.21, -0.80, -0.20], [0.26, -0.73, -0.15]],
  ], 0.018);
  // Right cloak wing (-X)
  addThickSheet(mMantleBack, [
    [[-0.26, -0.01, 0.02], [-0.14, 0.02, 0.00], [-0.02, 0.02, 0.01]],
    [[-0.29, -0.26, -0.04], [-0.16, -0.24, -0.08], [-0.03, -0.24, -0.06]],
    [[-0.30, -0.55, -0.10], [-0.18, -0.53, -0.15], [-0.045, -0.52, -0.13]],
    [[-0.26, -0.73, -0.15], [-0.21, -0.80, -0.20], [-0.07, -0.76, -0.18]],
  ], 0.018);

  const mTeamMantleBack = createMesh();
  addBox(mTeamMantleBack, 0.052, 0.56, 0.016, { t: [0.165, -0.36, -0.132], r: eulerQ(-0.23, 0, -0.05) }, 0.72, 0.9);
  addBox(mTeamMantleBack, 0.052, 0.56, 0.016, { t: [-0.165, -0.36, -0.132], r: eulerQ(-0.23, 0, 0.05) }, 0.72, 0.9);

  // --- Helmet, Visor & Overhanging Sculpted Hood (Neck node at world Y = 1.46) ---
  const mHelmet = createMesh();
  addLoft(mHelmet, [
    octRing(0.068, -0.02, 0.068),
    octRing(0.096, 0.07, 0.112, -0.01, 0.015),
    octRing(0.104, 0.18, 0.126, 0.0, 0.012),
    octRing(0.095, 0.28, 0.118, 0.01, -0.008),
    octRing(0.052, 0.34, 0.072, 0, -0.015),
  ]);
  // Angular mandible faceplate
  addBox(mHelmet, 0.092, 0.095, 0.065, { t: [0, 0.095, 0.098], r: eulerQ(-0.18, 0, 0) }, 1.1, 0.8);

  const mVisor = createMesh();
  // V-slit recon optical visor + top sensor eye
  addBox(mVisor, 0.088, 0.030, 0.025, { t: [0.038, 0.182, 0.124], r: eulerQ(0.06, -0.24, -0.10) });
  addBox(mVisor, 0.088, 0.030, 0.025, { t: [-0.038, 0.182, 0.124], r: eulerQ(0.06, 0.24, 0.10) });
  addBox(mVisor, 0.028, 0.018, 0.022, { t: [0, 0.228, 0.122] });

  // Sculpted angular ballistic hood arching around & above helmet (peaks at Y_local = 0.42 -> Y_world = 1.88)
  const mHood = createMesh();
  const hoodRows = [
    [[-0.125, 0.02, 0.09], [-0.145, 0.16, 0.105], [-0.125, 0.31, 0.135], [0, 0.365, 0.175], [0.125, 0.31, 0.135], [0.145, 0.16, 0.105], [0.125, 0.02, 0.09]],
    [[-0.142, 0.01, -0.01], [-0.165, 0.17, -0.01], [-0.142, 0.33, 0.01], [0, 0.408, 0.02], [0.142, 0.33, 0.01], [0.165, 0.17, -0.01], [0.142, 0.01, -0.01]],
    [[-0.125, 0.00, -0.13], [-0.142, 0.15, -0.155], [-0.11, 0.29, -0.145], [0, 0.355, -0.155], [0.11, 0.29, -0.145], [0.142, 0.15, -0.155], [0.125, 0.00, -0.13]],
  ];
  addThickSheet(mHood, hoodRows, 0.020);

  const mTeamHood = createMesh();
  // Dorsal hood crest stripe (top at Y_local = 0.420 -> exact Y_world = 1.880)
  addExtrudeXZ(
    mTeamHood,
    [[-0.028, -0.12], [-0.022, 0.14], [0, 0.168], [0.022, 0.14], [0.028, -0.12]],
    0.388, 0.420, 0.80, 0.96, 0, -0.01,
    { r: eulerQ(-0.08, 0, 0) }
  );

  // --- Arms ---
  function buildUpperArm(side) {
    const m = createMesh();
    addTube(m, [0, 0.02, 0], [0, -0.25, 0], 0.062, 0.048, 8);
    addBox(m, 0.085, 0.13, 0.095, { t: [side * 0.018, -0.07, 0] }, 0.85, 0.85);
    return m;
  }
  function buildForearm(side) {
    const m = createMesh();
    addTube(m, [0, 0.02, 0], [0, -0.22, 0.04], 0.050, 0.038, 8);
    // Gauntlet cuff + hand
    addBox(m, 0.072, 0.12, 0.078, { t: [side * 0.01, -0.11, 0.02], r: eulerQ(-0.18, 0, 0) }, 0.85, 0.88);
    addBox(m, 0.052, 0.075, 0.065, { t: [0, -0.23, 0.05] }, 0.85, 0.85);
    return m;
  }

  // --- Long Canister Rifle (1.20m covert precision canister rifle) ---
  const mRifleAlloy = createMesh();
  const mRifleShroud = createMesh();
  const mRifleGlow = createMesh();
  const mTeamRifle = createMesh();

  // Skeletonized tactical buttstock (-0.42 to -0.12)
  addBox(mRifleShroud, 0.042, 0.105, 0.14, { t: [0, -0.015, -0.35] }, 0.85, 0.9);
  addTube(mRifleAlloy, [0, 0.018, -0.34], [0, 0.022, -0.10], 0.018, 0.022, 6);
  addTube(mRifleAlloy, [0, -0.042, -0.34], [0, -0.018, -0.12], 0.015, 0.018, 6);
  // Pistol grip & trigger guard
  addBox(mRifleShroud, 0.038, 0.115, 0.052, { t: [0, -0.075, -0.07], r: eulerQ(0.28, 0, 0) }, 0.85, 0.85);

  // Main angular receiver (-0.12 to +0.20)
  addBox(mRifleShroud, 0.068, 0.095, 0.32, { t: [0, 0.015, 0.04] }, 0.82, 0.96);
  addBox(mRifleAlloy, 0.050, 0.032, 0.36, { t: [0, 0.068, 0.05] }, 0.85, 0.98);

  // Precision covert recon optic scope (+top)
  addTube(mRifleAlloy, [0, 0.108, -0.06], [0, 0.108, 0.17], 0.026, 0.030, 8);
  addBox(mRifleShroud, 0.042, 0.035, 0.14, { t: [0, 0.085, 0.05] });
  addTube(mRifleGlow, [0, 0.108, 0.170], [0, 0.108, 0.176], 0.022, 0.022, 8);
  addTube(mRifleGlow, [0, 0.108, -0.066], [0, 0.108, -0.060], 0.019, 0.019, 8);

  // Signature Under-Slung Pressurized Tactical Canister (z = 0.04 to 0.38)
  addTube(mRifleAlloy, [0, -0.058, 0.03], [0, -0.058, 0.075], 0.044, 0.044, 10);
  addTube(mRifleGlow, [0, -0.058, 0.075], [0, -0.058, 0.335], 0.039, 0.039, 10);
  addTube(mRifleAlloy, [0, -0.058, 0.335], [0, -0.058, 0.385], 0.044, 0.038, 10);
  // Protective alloy cage bars around canister
  addBox(mRifleAlloy, 0.014, 0.014, 0.30, { t: [0.041, -0.058, 0.205] });
  addBox(mRifleAlloy, 0.014, 0.014, 0.30, { t: [-0.041, -0.058, 0.205] });
  addBox(mRifleAlloy, 0.016, 0.014, 0.30, { t: [0, -0.100, 0.205] });

  // Extended Long Barrel Shroud & Fluted Barrel (z = +0.20 to +0.755)
  addBox(mRifleShroud, 0.058, 0.068, 0.36, { t: [0, 0.024, 0.37] }, 0.80, 0.96);
  addTube(mRifleAlloy, [0, 0.028, 0.20], [0, 0.028, 0.65], 0.019, 0.016, 8);
  // Suppressor / angular muzzle stabilizer brake (z = 0.61 to 0.755)
  addTube(mRifleAlloy, [0, 0.028, 0.61], [0, 0.028, 0.755], 0.027, 0.023, 8);
  addBox(mRifleGlow, 0.060, 0.012, 0.12, { t: [0, 0.028, 0.67] });

  // Separate Blue TeamColor Rifle Shroud Panels
  addBox(mTeamRifle, 0.012, 0.040, 0.31, { t: [0.033, 0.026, 0.35] }, 0.9, 0.92);
  addBox(mTeamRifle, 0.012, 0.040, 0.31, { t: [-0.033, 0.026, 0.35] }, 0.9, 0.92);
  addBox(mTeamRifle, 0.040, 0.012, 0.26, { t: [0, 0.062, 0.35] }, 0.85, 0.92);

  // --- Legs (Slim sculpted recon thigh, greave, knee guard, flat boot on Y = 0) ---
  function buildThigh(side) {
    const m = createMesh();
    addLoft(m, [
      octRing(0.082, 0.03, 0.082),
      octRing(0.076, -0.18, 0.078),
      octRing(0.060, -0.43, 0.064),
    ]);
    addBox(m, 0.055, 0.24, 0.085, { t: [side * 0.052, -0.17, 0.01], r: eulerQ(0, 0, side * -0.06) }, 0.82, 0.88);
    return m;
  }
  function buildShin() {
    const m = createMesh();
    addLoft(m, [
      octRing(0.062, 0.03, 0.065),
      octRing(0.066, -0.12, 0.072, 0, 0.008),
      octRing(0.046, -0.39, 0.052),
    ]);
    // Angular knee guard
    addBox(m, 0.078, 0.095, 0.052, { t: [0, -0.01, 0.058], r: eulerQ(0.15, 0, 0) }, 0.78, 0.80);
    return m;
  }
  function buildShinTeam(side) {
    const m = createMesh();
    addBox(m, 0.016, 0.21, 0.048, { t: [side * 0.058, -0.19, 0.012], r: eulerQ(0.03, 0, side * 0.05) }, 0.85, 0.85);
    return m;
  }
  function buildBoot() {
    const m = createMesh();
    // Ankle at local [0,0,0], flat sole bottom at exact y = -0.060
    addExtrudeXZ(
      m,
      [[-0.052, -0.065], [-0.056, 0.09], [-0.038, 0.165], [0.038, 0.165], [0.056, 0.09], [0.052, -0.065]],
      -0.060, -0.018, 0.92, 0.94, 0, -0.008
    );
    addExtrudeXZ(
      m,
      [[-0.046, -0.055], [-0.048, 0.07], [-0.030, 0.135], [0.030, 0.135], [0.048, 0.07], [0.046, -0.055]],
      -0.020, 0.032, 0.82, 0.76, 0, -0.025
    );
    return m;
  }

  // --- Assemble Node Tree ---
  // Rest pose coordinates carefully chosen so:
  // - Boots sit flat at exact Y = 0.000 (0.94 - 0.04 - 0.44 - 0.40 - 0.06 = 0.000)
  // - Hood crest top sits at exact Y = 1.880 (0.94 + 0.06 + 0.46 + 0.42 = 1.880)
  // - Rifle muzzle anchor sits at world ~[-0.02, 1.17, 0.931] -> XZ radius ~0.933 <= 0.94!
  const restArmR = eulerQ(-0.42, 0.10, 0.08);
  const restForeR = eulerQ(-1.02, 0.12, 0.05);
  const restRifle = eulerQ(1.44, 0.16, -0.12);
  const restArmL = eulerQ(-0.62, -0.46, -0.34);
  const restForeL = eulerQ(-0.88, -0.22, 0.12);

  const nRoot = addNode({ name: 'ShadeAgent', extras: { radius: 0.94 }, children: [] });
  const nPelvis = addNode({ name: 'Pelvis', translation: [0, 0.94, 0], mesh: attachMesh('PelvisMesh', MAT.ARMOR, mPelvis), children: [] });
  const nSpine = addNode({ name: 'Spine', translation: [0, 0.06, 0], mesh: attachMesh('SpineMesh', MAT.ARMOR, mSpine), children: [] });
  const nTeamChest = addNode({ name: 'TeamColor_Chest', mesh: attachMesh('TeamColor_Chest', MAT.TEAM, mTeamChest) });
  const nChestGlow = addNode({ name: 'ChestSensor', mesh: attachMesh('ChestSensor', MAT.GLOW, mChestGlow) });

  const nMantle = addNode({ name: 'MantleShoulders', translation: [0, 0.40, 0], mesh: attachMesh('MantleShoulders', MAT.MANTLE, mMantleYoke), children: [] });
  const nTeamMantleL = addNode({ name: 'TeamColor_MantleL', mesh: attachMesh('TeamColor_MantleL', MAT.TEAM, mTeamMantleL) });
  const nTeamMantleR = addNode({ name: 'TeamColor_MantleR', mesh: attachMesh('TeamColor_MantleR', MAT.TEAM, mTeamMantleR) });
  const nMantleBack = addNode({ name: 'MantleBack', translation: [0, -0.02, -0.15], mesh: attachMesh('MantleBack', MAT.MANTLE, mMantleBack), children: [] });
  const nTeamMantleBack = addNode({ name: 'TeamColor_MantleBack', mesh: attachMesh('TeamColor_MantleBack', MAT.TEAM, mTeamMantleBack) });

  const nNeck = addNode({ name: 'Neck', translation: [0, 0.46, 0.02], mesh: attachMesh('HelmetMesh', MAT.ARMOR, mHelmet), children: [] });
  const nVisor = addNode({ name: 'Visor', mesh: attachMesh('VisorMesh', MAT.GLOW, mVisor) });
  const nHood = addNode({ name: 'Hood', mesh: attachMesh('HoodMesh', MAT.MANTLE, mHood) });
  const nTeamHood = addNode({ name: 'TeamColor_HoodCrest', mesh: attachMesh('TeamColor_HoodCrest', MAT.TEAM, mTeamHood) });

  const nShoulderR = addNode({ name: 'ShoulderR', translation: [-0.215, 0.35, -0.01], rotation: restArmR, mesh: attachMesh('UpperArmR', MAT.ARMOR, buildUpperArm(-1)), children: [] });
  const nForearmR = addNode({ name: 'ForearmR', translation: [-0.01, -0.25, 0], rotation: restForeR, mesh: attachMesh('ForearmR', MAT.ARMOR, buildForearm(-1)), children: [] });

  const nRifle = addNode({ name: 'CanisterRifle', translation: [0.06, -0.22, 0.06], rotation: restRifle, mesh: attachMesh('RifleAlloy', MAT.ALLOY, mRifleAlloy), children: [] });
  const nRifleShroud = addNode({ name: 'RifleShroud', mesh: attachMesh('RifleShroud', MAT.ARMOR, mRifleShroud) });
  const nRifleGlow = addNode({ name: 'CanisterCore', mesh: attachMesh('CanisterCore', MAT.GLOW, mRifleGlow) });
  const nTeamRifle = addNode({ name: 'TeamColor_Rifle', mesh: attachMesh('TeamColor_Rifle', MAT.TEAM, mTeamRifle) });
  const nMuzzle = addNode({ name: 'Muzzle', translation: [0, 0.028, 0.758], extras: { anchor: 'muzzle' } });

  const nShoulderL = addNode({ name: 'ShoulderL', translation: [0.215, 0.35, 0.02], rotation: restArmL, mesh: attachMesh('UpperArmL', MAT.ARMOR, buildUpperArm(1)), children: [] });
  const nForearmL = addNode({ name: 'ForearmL', translation: [0.01, -0.25, 0], rotation: restForeL, mesh: attachMesh('ForearmL', MAT.ARMOR, buildForearm(1)), children: [] });

  const nThighL = addNode({ name: 'ThighL', translation: [0.108, -0.04, 0.04], mesh: attachMesh('ThighL', MAT.ARMOR, buildThigh(1)), children: [] });
  const nShinL = addNode({ name: 'ShinL', translation: [0.018, -0.44, 0.03], mesh: attachMesh('ShinL', MAT.ARMOR, buildShin()), children: [] });
  const nTeamShinL = addNode({ name: 'TeamColor_ShinL', mesh: attachMesh('TeamColor_ShinL', MAT.TEAM, buildShinTeam(1)) });
  const nFootL = addNode({ name: 'FootL', translation: [0, -0.40, 0.01], rotation: eulerQ(0, 0.08, 0), mesh: attachMesh('FootL', MAT.ARMOR, buildBoot()) });

  const nThighR = addNode({ name: 'ThighR', translation: [-0.108, -0.04, -0.04], mesh: attachMesh('ThighR', MAT.ARMOR, buildThigh(-1)), children: [] });
  const nShinR = addNode({ name: 'ShinR', translation: [-0.018, -0.44, -0.03], mesh: attachMesh('ShinR', MAT.ARMOR, buildShin()), children: [] });
  const nTeamShinR = addNode({ name: 'TeamColor_ShinR', mesh: attachMesh('TeamColor_ShinR', MAT.TEAM, buildShinTeam(-1)) });
  const nFootR = addNode({ name: 'FootR', translation: [0, -0.40, -0.01], rotation: eulerQ(0, -0.14, 0), mesh: attachMesh('FootR', MAT.ARMOR, buildBoot()) });

  nodes[nRoot].children.push(nPelvis);
  nodes[nPelvis].children.push(nSpine, nThighL, nThighR);
  nodes[nSpine].children.push(nTeamChest, nChestGlow, nMantle, nNeck, nShoulderR, nShoulderL);
  nodes[nMantle].children.push(nTeamMantleL, nTeamMantleR, nMantleBack);
  nodes[nMantleBack].children.push(nTeamMantleBack);
  nodes[nNeck].children.push(nVisor, nHood, nTeamHood);
  nodes[nShoulderR].children.push(nForearmR);
  nodes[nForearmR].children.push(nRifle);
  nodes[nRifle].children.push(nRifleShroud, nRifleGlow, nTeamRifle, nMuzzle);
  nodes[nShoulderL].children.push(nForearmL);
  nodes[nThighL].children.push(nShinL);
  nodes[nShinL].children.push(nTeamShinL, nFootL);
  nodes[nThighR].children.push(nShinR);
  nodes[nShinR].children.push(nTeamShinR, nFootR);

  // --- Animations: idle, walk, attack, cast, death ---
  const animations = [];

  // 1. IDLE (2.4s covert recon scan & breath loop)
  {
    const T = [0, 0.6, 1.2, 1.8, 2.4];
    animations.push({
      name: 'idle',
      tracks: [
        { node: nPelvis, path: 'translation', times: T, values: [
          [0, 0.94, 0], [0, 0.928, 0.005], [0, 0.942, 0], [0, 0.930, -0.004], [0, 0.94, 0],
        ] },
        { node: nSpine, path: 'rotation', times: T, values: [
          eulerQ(0.03, 0, 0), eulerQ(0.055, 0.05, 0), eulerQ(0.025, 0, 0), eulerQ(0.05, -0.06, 0), eulerQ(0.03, 0, 0),
        ] },
        { node: nNeck, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0), eulerQ(-0.03, 0.18, 0.02), eulerQ(0.02, 0.02, 0), eulerQ(-0.02, -0.20, -0.02), eulerQ(0, 0, 0),
        ] },
        { node: nShoulderR, path: 'rotation', times: T, values: [
          restArmR, eulerQ(-0.45, 0.12, 0.08), eulerQ(-0.41, 0.10, 0.08), eulerQ(-0.44, 0.08, 0.08), restArmR,
        ] },
        { node: nShoulderL, path: 'rotation', times: T, values: [
          restArmL, eulerQ(-0.65, -0.45, -0.34), eulerQ(-0.61, -0.46, -0.34), eulerQ(-0.64, -0.48, -0.34), restArmL,
        ] },
        { node: nMantleBack, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0), eulerQ(0.04, 0.02, 0.015), eulerQ(-0.01, 0, 0), eulerQ(0.045, -0.02, -0.015), eulerQ(0, 0, 0),
        ] },
      ],
    });
  }

  // 2. WALK (0.96s agile tactical covert stride loop)
  {
    const N = 9, dur = 0.96;
    const T = [], pelT = [], pelR = [], spR = [], nkR = [], thL = [], shL = [], ftL = [], thR = [], shR = [], ftR = [], arR = [], arL = [], mbR = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), a = u * TAU;
      T.push(+(u * dur).toFixed(4));
      const s = Math.sin(a), c = Math.cos(a), c2 = Math.cos(2 * a);
      pelT.push([0.018 * c, 0.915 + 0.032 * Math.abs(s), 0]);
      pelR.push(eulerQ(0.04, -0.10 * s, 0.03 * c));
      spR.push(eulerQ(0.16 + 0.02 * c2, 0.12 * s, -0.02 * c));
      nkR.push(eulerQ(-0.10, -0.08 * s, 0));

      const swingL = -0.52 * s;
      const kneeL = Math.max(0.06, 0.62 * Math.max(0, -c) + 0.14 * Math.max(0, s));
      thL.push(eulerQ(swingL, 0, 0));
      shL.push(eulerQ(kneeL, 0, 0));
      ftL.push(eulerQ(-0.35 * swingL - 0.3 * kneeL, 0.08, 0));

      const swingR = 0.52 * s;
      const kneeR = Math.max(0.06, 0.62 * Math.max(0, c) + 0.14 * Math.max(0, -s));
      thR.push(eulerQ(swingR, 0, 0));
      shR.push(eulerQ(kneeR, 0, 0));
      ftR.push(eulerQ(-0.35 * swingR - 0.3 * kneeR, -0.14, 0));

      arR.push(eulerQ(-0.50 + 0.07 * s, 0.12 - 0.06 * s, 0.08));
      arL.push(eulerQ(-0.68 + 0.07 * s, -0.44 - 0.06 * s, -0.34));
      mbR.push(eulerQ(-0.22 - 0.08 * Math.abs(s), -0.05 * s, 0.03 * c));
    }
    animations.push({
      name: 'walk',
      tracks: [
        { node: nPelvis, path: 'translation', times: T, values: pelT },
        { node: nPelvis, path: 'rotation', times: T, values: pelR },
        { node: nSpine, path: 'rotation', times: T, values: spR },
        { node: nNeck, path: 'rotation', times: T, values: nkR },
        { node: nThighL, path: 'rotation', times: T, values: thL },
        { node: nShinL, path: 'rotation', times: T, values: shL },
        { node: nFootL, path: 'rotation', times: T, values: ftL },
        { node: nThighR, path: 'rotation', times: T, values: thR },
        { node: nShinR, path: 'rotation', times: T, values: shR },
        { node: nFootR, path: 'rotation', times: T, values: ftR },
        { node: nShoulderR, path: 'rotation', times: T, values: arR },
        { node: nShoulderL, path: 'rotation', times: T, values: arL },
        { node: nMantleBack, path: 'rotation', times: T, values: mbR },
      ],
    });
  }

  // 3. ATTACK (0.95s snap-aim, canister discharge recoil kick, stabilization)
  {
    const T = [0, 0.20, 0.28, 0.44, 0.70, 0.95];
    animations.push({
      name: 'attack',
      tracks: [
        { node: nPelvis, path: 'translation', times: T, values: [
          [0, 0.94, 0], [0, 0.915, 0.02], [0, 0.91, -0.035], [0, 0.918, -0.015], [0, 0.932, 0], [0, 0.94, 0],
        ] },
        { node: nSpine, path: 'rotation', times: T, values: [
          eulerQ(0.03, 0, 0),
          eulerQ(0.14, -0.16, 0),
          eulerQ(-0.06, -0.20, 0.03),
          eulerQ(0.09, -0.14, 0.01),
          eulerQ(0.05, -0.05, 0),
          eulerQ(0.03, 0, 0),
        ] },
        { node: nNeck, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0),
          eulerQ(-0.08, 0.16, -0.08),
          eulerQ(-0.16, 0.18, -0.10),
          eulerQ(-0.06, 0.14, -0.06),
          eulerQ(-0.02, 0.05, 0),
          eulerQ(0, 0, 0),
        ] },
        { node: nShoulderR, path: 'rotation', times: T, values: [
          restArmR,
          eulerQ(-0.88, 0.20, 0.06),
          eulerQ(-1.08, 0.22, 0.10),
          eulerQ(-0.84, 0.18, 0.06),
          eulerQ(-0.56, 0.12, 0.07),
          restArmR,
        ] },
        { node: nForearmR, path: 'rotation', times: T, values: [
          restForeR,
          eulerQ(-0.72, 0.08, 0.04),
          eulerQ(-0.86, 0.10, 0.06),
          eulerQ(-0.74, 0.08, 0.04),
          eulerQ(-0.92, 0.10, 0.05),
          restForeR,
        ] },
        { node: nRifle, path: 'translation', times: T, values: [
          [0.06, -0.22, 0.06],
          [0.05, -0.20, 0.07],
          [0.05, -0.19, -0.01],
          [0.05, -0.20, 0.05],
          [0.06, -0.21, 0.06],
          [0.06, -0.22, 0.06],
        ] },
        { node: nShoulderL, path: 'rotation', times: T, values: [
          restArmL,
          eulerQ(-1.02, -0.48, -0.28),
          eulerQ(-1.18, -0.50, -0.26),
          eulerQ(-0.98, -0.47, -0.28),
          eulerQ(-0.75, -0.46, -0.32),
          restArmL,
        ] },
        { node: nMantleBack, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0), eulerQ(-0.08, 0, 0), eulerQ(-0.24, 0.05, 0), eulerQ(-0.10, 0.02, 0), eulerQ(-0.02, 0, 0), eulerQ(0, 0, 0),
        ] },
      ],
    });
  }

  // 4. CAST (1.30s covert tactical cloak/beacon deployment gesture)
  {
    const T = [0, 0.28, 0.56, 0.86, 1.30];
    animations.push({
      name: 'cast',
      tracks: [
        { node: nPelvis, path: 'translation', times: T, values: [
          [0, 0.94, 0], [0, 0.90, -0.02], [0, 0.96, 0.03], [0, 0.95, 0.02], [0, 0.94, 0],
        ] },
        { node: nSpine, path: 'rotation', times: T, values: [
          eulerQ(0.03, 0, 0),
          eulerQ(0.12, -0.18, 0),
          eulerQ(-0.10, 0.22, -0.04),
          eulerQ(-0.04, 0.16, -0.02),
          eulerQ(0.03, 0, 0),
        ] },
        { node: nNeck, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0),
          eulerQ(0.12, 0.10, 0),
          eulerQ(-0.20, -0.14, 0.04),
          eulerQ(-0.12, -0.10, 0.02),
          eulerQ(0, 0, 0),
        ] },
        // Right arm tucks canister rifle securely at side
        { node: nShoulderR, path: 'rotation', times: T, values: [
          restArmR,
          eulerQ(-0.20, -0.15, -0.10),
          eulerQ(-0.12, -0.22, -0.16),
          eulerQ(-0.18, -0.18, -0.12),
          restArmR,
        ] },
        // Left arm taps visor transponder, then sweeps outward/forward casting covert pulse
        { node: nShoulderL, path: 'rotation', times: T, values: [
          restArmL,
          eulerQ(-1.45, -0.35, -0.20),
          eulerQ(-1.68, 0.18, 0.32),
          eulerQ(-1.42, 0.12, 0.24),
          restArmL,
        ] },
        { node: nForearmL, path: 'rotation', times: T, values: [
          restForeL,
          eulerQ(-1.45, -0.30, 0.20),
          eulerQ(-0.22, 0.05, 0),
          eulerQ(-0.30, 0.05, 0),
          restForeL,
        ] },
        { node: nMantleBack, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0), eulerQ(-0.06, 0, 0), eulerQ(-0.34, -0.08, 0), eulerQ(-0.22, -0.05, 0), eulerQ(0, 0, 0),
        ] },
      ],
    });
  }

  // 5. DEATH (1.20s impact stagger -> drop to knee -> collapse cleanly onto Y = 0 ground)
  {
    const T = [0, 0.20, 0.52, 0.88, 1.20];
    animations.push({
      name: 'death',
      tracks: [
        { node: nPelvis, path: 'translation', times: T, values: [
          [0, 0.94, 0],
          [0, 0.89, -0.08],
          [0.03, 0.48, -0.12],
          [0.06, 0.15, 0.05],
          [0.06, 0.14, 0.06],
        ] },
        { node: nPelvis, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0),
          eulerQ(-0.22, 0.12, -0.06),
          eulerQ(0.45, 0.20, -0.22),
          eulerQ(1.42, 0.28, -0.35),
          eulerQ(1.46, 0.30, -0.38),
        ] },
        { node: nSpine, path: 'rotation', times: T, values: [
          eulerQ(0.03, 0, 0),
          eulerQ(-0.28, 0.15, 0.08),
          eulerQ(0.26, -0.10, -0.12),
          eulerQ(0.12, -0.08, -0.08),
          eulerQ(0.10, -0.08, -0.08),
        ] },
        { node: nNeck, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0),
          eulerQ(-0.32, -0.18, 0.10),
          eulerQ(0.28, 0.14, -0.12),
          eulerQ(-0.18, 0.38, -0.15),
          eulerQ(-0.20, 0.42, -0.16),
        ] },
        { node: nShoulderR, path: 'rotation', times: T, values: [
          restArmR,
          eulerQ(-0.75, -0.25, -0.35),
          eulerQ(-0.55, -0.18, -0.45),
          eulerQ(-0.25, -0.10, -0.65),
          eulerQ(-0.22, -0.10, -0.68),
        ] },
        { node: nForearmR, path: 'rotation', times: T, values: [
          restForeR, eulerQ(-0.65, 0, 0), eulerQ(-0.50, 0, 0), eulerQ(-0.28, 0, 0), eulerQ(-0.25, 0, 0),
        ] },
        { node: nShoulderL, path: 'rotation', times: T, values: [
          restArmL,
          eulerQ(-0.85, 0.20, 0.42),
          eulerQ(-1.05, 0.12, 0.50),
          eulerQ(-0.40, 0.15, 0.72),
          eulerQ(-0.36, 0.15, 0.75),
        ] },
        { node: nForearmL, path: 'rotation', times: T, values: [
          restForeL, eulerQ(-0.50, 0, 0), eulerQ(-0.65, 0, 0), eulerQ(-0.25, 0, 0), eulerQ(-0.22, 0, 0),
        ] },
        { node: nThighL, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0), eulerQ(-0.18, 0, 0.06), eulerQ(-0.95, 0.10, 0.12), eulerQ(-0.12, 0.08, 0.18), eulerQ(-0.10, 0.08, 0.20),
        ] },
        { node: nShinL, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0), eulerQ(0.28, 0, 0), eulerQ(1.45, 0, 0), eulerQ(0.25, 0, 0), eulerQ(0.20, 0, 0),
        ] },
        { node: nThighR, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0), eulerQ(0.15, 0, -0.06), eulerQ(-0.25, -0.12, -0.10), eulerQ(0.08, -0.10, -0.14), eulerQ(0.10, -0.10, -0.15),
        ] },
        { node: nShinR, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0), eulerQ(0.22, 0, 0), eulerQ(1.55, 0, 0), eulerQ(0.32, 0, 0), eulerQ(0.28, 0, 0),
        ] },
        { node: nMantleBack, path: 'rotation', times: T, values: [
          eulerQ(0, 0, 0), eulerQ(-0.35, 0, 0), eulerQ(-0.18, 0, 0), eulerQ(-0.08, 0, 0), eulerQ(-0.05, 0, 0),
        ] },
      ],
    });
  }

  return { materials, meshes, nodes, rootNodes: [nRoot], animations };
}

// ============================================================================
// MODEL 2: specter_academy.glb (Angular research bunker with recessed antenna
//          tower, brushed dark alloy, separate TeamColor, radius 3.75, idle)
// ============================================================================
function buildSpecterAcademy() {
  const materials = [
    { name: 'BrushedDarkAlloy', baseColorFactor: [0.138, 0.154, 0.182, 1], metallicFactor: 0.74, roughnessFactor: 0.34 },
    { name: 'DarkBunkerPlating', baseColorFactor: [0.064, 0.072, 0.088, 1], metallicFactor: 0.46, roughnessFactor: 0.62 },
    { name: 'MachinedSteelTrim', baseColorFactor: [0.275, 0.308, 0.358, 1], metallicFactor: 0.84, roughnessFactor: 0.28 },
    { name: 'TeamColor', baseColorFactor: [0.075, 0.410, 0.945, 1], metallicFactor: 0.24, roughnessFactor: 0.38 },
    { name: 'TelemetryGlow', baseColorFactor: [0.22, 0.84, 1.0, 1], emissiveFactor: [0.20, 0.78, 1.0], metallicFactor: 0.10, roughnessFactor: 0.20 },
  ];
  const MAT = { ALLOY: 0, DARK: 1, TRIM: 2, TEAM: 3, GLOW: 4 };

  const nodes = [];
  const meshes = [];
  const addNode = (def) => (nodes.push(def), nodes.length - 1);
  const attachMesh = (name, matIndex, data) => (meshes.push({ name, matIndex, data }), meshes.length - 1);

  const mHull = createMesh();
  const mDark = createMesh();
  const mTrim = createMesh();
  const mTeamBase = createMesh();
  const mGlowBase = createMesh();

  // 1. Chamfered Octagonal Foundation Plinth (Y = 0.000 to 0.42, radius <= 3.74)
  addSweepProfile(mDark, [
    [0.00, 0.00],
    [3.52, 0.00],
    [3.52, 0.24],
    [3.32, 0.42],
    [0.00, 0.42],
  ], 8, Math.PI / 8);

  // 4 Cardinal Armored Stabilizer Bastions reaching exact horizontal radius 3.74
  for (let i = 0; i < 4; i++) {
    const rot = eulerQ(0, i * (Math.PI * 0.5), 0);
    // Outer bevel tip at z = 3.74, corners at [±0.52, 3.68] -> hypot(0.52, 3.68) = 3.716 <= 3.75
    addExtrudeXZ(
      mHull,
      [[-0.86, 2.55], [-0.52, 3.68], [0, 3.74], [0.52, 3.68], [0.86, 2.55]],
      0.00, 0.54, 0.84, 0.92, 0, -0.10,
      { r: rot }
    );
    addExtrudeXZ(
      mTrim,
      [[-0.64, 2.75], [-0.38, 3.56], [0.38, 3.56], [0.64, 2.75]],
      0.52, 0.64, 0.86, 0.88, 0, -0.06,
      { r: rot }
    );
    // Separate Blue TeamColor Bastion Plates
    addExtrudeXZ(
      mTeamBase,
      [[-0.44, 2.92], [-0.28, 3.48], [0.28, 3.48], [0.44, 2.92]],
      0.64, 0.71, 0.88, 0.90, 0, -0.03,
      { r: rot }
    );
  }

  // 2. Main Angular Sloped Bunker Hull with Genuine Open Recessed Octagonal Silo Well!
  // Centered slightly rear at z = -0.18 so front command portal (+Z) has dramatic depth.
  // Outer wall slopes from r=3.18 (Y=0.40) to r=2.56 (Y=2.48), rises to silo parapet r=1.56 (Y=2.68),
  // then drops deep inside the bunker to sunken silo floor at Y=1.02 (r=1.04 -> 0)!
  const siloZ = -0.18;
  addSweepProfile(mHull, [
    [0.00, 0.40],
    [3.18, 0.40],
    [2.56, 2.48],
    [1.56, 2.68],
    [1.42, 2.68],
    [1.04, 1.02],
    [0.00, 1.02],
  ], 8, Math.PI / 8, 0, siloZ);

  // Dark recessed armor lining & floor grate inside the sunken antenna silo well
  addSweepProfile(mDark, [
    [1.40, 2.64],
    [1.05, 1.04],
    [0.00, 1.04],
  ], 8, Math.PI / 8, 0, siloZ);

  // 4 Machined Alloy Structural Silo Collar Buttresses framing the recessed tower pit
  for (let i = 0; i < 4; i++) {
    const a = (i + 0.5) * (Math.PI * 0.5);
    addExtrudeXZ(
      mTrim,
      [[-0.16, 0.92], [-0.13, 1.62], [0.13, 1.62], [0.16, 0.92]],
      1.06, 2.86, 0.80, 0.78, 0, 0.14,
      { t: [0, 0, siloZ], r: eulerQ(0, a, 0) }
    );
  }

  // 3. East & West Angular Stealth Research Vault Wings (±X)
  for (const side of [-1, 1]) {
    addExtrudeXZ(
      mHull,
      [
        [side * 1.65, -1.68],
        [side * 3.16, -1.24],
        [side * 3.24, 0.96],
        [side * 1.65, 1.48],
      ],
      0.40, 2.28, 0.78, 0.84, -side * 0.18, -0.05
    );
    // Lab armored roof louver ribs
    for (let k = -1; k <= 1; k++) {
      addBox(mTrim, 0.86, 0.12, 0.22, { t: [side * 2.32, 2.30, -0.12 + k * 0.58], r: eulerQ(0, 0, side * 0.06) }, 0.86, 0.86);
    }
    // Glowing cyan covert laboratory observation slits on wing flanks
    addBox(mGlowBase, 0.08, 0.11, 1.48, { t: [side * 3.04, 1.32, -0.14], r: eulerQ(0, 0, side * 0.26) });

    // Large Bold Separate Blue TeamColor Roof Chevrons on East & West Lab Wings
    addExtrudeXZ(
      mTeamBase,
      [
        [side * 1.72, -1.28],
        [side * 2.74, -0.92],
        [side * 2.80, 0.68],
        [side * 1.72, 1.04],
      ],
      2.28, 2.36, 0.92, 0.92
    );
  }

  // 4. Front Covert Ops Command Portal & Blast Bay (+Z)
  addExtrudeXZ(
    mHull,
    [[-1.62, 1.55], [-1.18, 3.18], [1.18, 3.18], [1.62, 1.55]],
    0.40, 2.18, 0.80, 0.84, 0, -0.16
  );
  // Recessed dark blast door & armored portal frame
  addBox(mDark, 1.24, 1.32, 0.26, { t: [0, 1.06, 2.94], r: eulerQ(-0.14, 0, 0) }, 0.86, 0.9);
  addBox(mTrim, 1.56, 0.18, 0.36, { t: [0, 1.82, 2.92], r: eulerQ(-0.14, 0, 0) }, 0.88, 0.9);
  addBox(mGlowBase, 1.12, 0.09, 0.14, { t: [0, 1.66, 3.02], r: eulerQ(-0.14, 0, 0) });
  // Front roof TeamColor Command Chevron
  addExtrudeXZ(
    mTeamBase,
    [[-1.08, 1.82], [-0.76, 2.76], [0, 2.92], [0.76, 2.76], [1.08, 1.82], [0, 2.02]],
    2.18, 2.27, 0.94, 0.94
  );

  // 5. Rear Cipher & Cryo Data-Core Vault (-Z)
  addExtrudeXZ(
    mHull,
    [[-1.52, -1.65], [-1.06, -3.22], [1.06, -3.22], [1.52, -1.65]],
    0.40, 2.56, 0.78, 0.82, 0, 0.16
  );
  for (const xOff of [-0.56, 0, 0.56]) {
    addBox(mTrim, 0.16, 0.86, 0.44, { t: [xOff, 1.96, -2.96], r: eulerQ(0.22, 0, 0) }, 0.8, 0.85);
  }
  addBox(mGlowBase, 1.24, 0.10, 0.12, { t: [0, 1.28, -3.10], r: eulerQ(0.22, 0, 0) });
  addExtrudeXZ(
    mTeamBase,
    [[-0.92, -2.78], [-0.98, -1.96], [0.98, -1.96], [0.92, -2.78]],
    2.56, 2.64, 0.90, 0.90
  );

  // 6. Recessed Antenna Tower Core Mast (rises from sunken well floor Y=1.02 through open silo!)
  addSweepProfile(mTrim, [
    [0.52, 1.02],
    [0.44, 1.85],
    [0.34, 2.95],
    [0.24, 4.05],
    [0.00, 4.05],
  ], 8, 0, 0, siloZ);
  // Glowing vertical wave-guide conduits along recessed tower base inside well
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI * 0.5);
    addBox(mGlowBase, 0.08, 1.65, 0.08, {
      t: [Math.sin(a) * 0.44, 1.92, siloZ + Math.cos(a) * 0.44],
    });
  }

  // --- Animated Tower Sub-Assemblies ---
  // A. SiloPulseRing (glowing octagonal telemetry containment ring inside the recessed pit)
  const mPulseRing = createMesh();
  addSweepProfile(mPulseRing, [
    [0.86, -0.06],
    [0.92, 0.00],
    [0.86, 0.06],
    [0.72, 0.06],
    [0.68, 0.00],
    [0.72, -0.06],
    [0.86, -0.06],
  ], 8, Math.PI / 8);

  // B. TowerCollar (counter-rotating hexagonal covert cipher ring above silo rim, Y = 3.18)
  const mCollarAlloy = createMesh();
  const mCollarGlow = createMesh();
  const mTeamCollar = createMesh();
  addSweepProfile(mCollarAlloy, [
    [0.42, -0.22],
    [0.76, -0.10],
    [0.76, 0.12],
    [0.44, 0.24],
    [0.34, 0.24],
    [0.34, -0.22],
    [0.42, -0.22],
  ], 6);
  for (let i = 0; i < 3; i++) {
    const rot = eulerQ(0, (i * TAU) / 3, 0);
    addExtrudeXZ(mCollarAlloy, [[-0.14, 0.62], [-0.09, 1.16], [0.09, 1.16], [0.14, 0.62]], -0.10, 0.12, 0.8, 0.9, 0, 0, { r: rot });
    addBox(mCollarGlow, 0.12, 0.07, 0.12, { t: [Math.sin((i * TAU) / 3) * 1.12, 0.01, Math.cos((i * TAU) / 3) * 1.12] });
    addBox(mTeamCollar, 0.19, 0.055, 0.42, { r: rot, t: [Math.sin((i * TAU) / 3) * 0.88, 0.145, Math.cos((i * TAU) / 3) * 0.88] }, 0.85, 0.9);
  }

  // C. TowerArray (360-degree rotating covert phased-array radar & transceiver spire, Y = 4.12 -> top 5.42)
  const mArrayAlloy = createMesh();
  const mArrayTrim = createMesh();
  const mArrayGlow = createMesh();
  const mTeamArray = createMesh();

  // Central transceiver housing
  addBox(mArrayAlloy, 0.56, 0.54, 0.66, { t: [0, 0, 0] }, 0.82, 0.84);
  // Swept angular phased-array radar wings (span 2.16)
  for (const side of [-1, 1]) {
    addExtrudeXZ(
      mArrayAlloy,
      [
        [side * 0.24, -0.22],
        [side * 1.08, 0.08],
        [side * 1.04, 0.32],
        [side * 0.24, 0.18],
      ],
      -0.28, 0.28, 0.88, 0.86, 0, 0,
      { r: eulerQ(-0.14, 0, 0) }
    );
    // Glowing phased-array sensor slats on dish face
    addBox(mArrayGlow, 0.68, 0.09, 0.06, { t: [side * 0.66, 0.08, 0.22], r: eulerQ(-0.14, side * -0.28, 0) });
    addBox(mArrayGlow, 0.68, 0.09, 0.06, { t: [side * 0.66, -0.09, 0.20], r: eulerQ(-0.14, side * -0.28, 0) });
    // Separate Blue TeamColor Array Wing Panels
    addExtrudeXZ(
      mTeamArray,
      [
        [side * 0.34, -0.14],
        [side * 0.98, 0.10],
        [side * 0.95, 0.24],
        [side * 0.34, 0.10],
      ],
      0.27, 0.33, 0.92, 0.92, 0, 0,
      { r: eulerQ(-0.14, 0, 0) }
    );
  }
  // Tall precision covert comms spire (reaches Y_world = 4.12 + 1.30 = 5.42)
  addTube(mArrayTrim, [0, 0.24, -0.06], [0, 1.24, -0.06], 0.09, 0.028, 6);
  addTube(mArrayGlow, [0, 1.18, -0.06], [0, 1.30, -0.06], 0.048, 0.018, 6);

  // --- Assemble Node Hierarchy ---
  const nRoot = addNode({ name: 'SpecterAcademy', extras: { radius: 3.75 }, children: [] });
  const nHull = addNode({ name: 'BunkerHull', mesh: attachMesh('BunkerHull', MAT.ALLOY, mHull) });
  const nDark = addNode({ name: 'BunkerPlating', mesh: attachMesh('BunkerPlating', MAT.DARK, mDark) });
  const nTrim = addNode({ name: 'BunkerTrim', mesh: attachMesh('BunkerTrim', MAT.TRIM, mTrim) });
  const nTeamBase = addNode({ name: 'TeamColor_BunkerPanels', mesh: attachMesh('TeamColor_BunkerPanels', MAT.TEAM, mTeamBase) });
  const nGlowBase = addNode({ name: 'BunkerTelemetry', mesh: attachMesh('BunkerTelemetry', MAT.GLOW, mGlowBase) });

  const nPulseRing = addNode({ name: 'SiloPulseRing', translation: [0, 1.48, siloZ], mesh: attachMesh('SiloPulseRing', MAT.GLOW, mPulseRing) });
  const nCollar = addNode({ name: 'TowerCollar', translation: [0, 3.18, siloZ], mesh: attachMesh('TowerCollar', MAT.ALLOY, mCollarAlloy), children: [] });
  const nCollarGlow = addNode({ name: 'TowerCollarGlow', mesh: attachMesh('TowerCollarGlow', MAT.GLOW, mCollarGlow) });
  const nTeamCollar = addNode({ name: 'TeamColor_TowerCollar', mesh: attachMesh('TeamColor_TowerCollar', MAT.TEAM, mTeamCollar) });

  const nArray = addNode({ name: 'TowerArray', translation: [0, 4.12, siloZ], mesh: attachMesh('TowerArray', MAT.ALLOY, mArrayAlloy), children: [] });
  const nArrayTrim = addNode({ name: 'TowerSpire', mesh: attachMesh('TowerSpire', MAT.TRIM, mArrayTrim) });
  const nArrayGlow = addNode({ name: 'TowerArrayGlow', mesh: attachMesh('TowerArrayGlow', MAT.GLOW, mArrayGlow) });
  const nTeamArray = addNode({ name: 'TeamColor_TowerArray', mesh: attachMesh('TeamColor_TowerArray', MAT.TEAM, mTeamArray) });

  nodes[nCollar].children.push(nCollarGlow, nTeamCollar);
  nodes[nArray].children.push(nArrayTrim, nArrayGlow, nTeamArray);
  nodes[nRoot].children.push(nHull, nDark, nTrim, nTeamBase, nGlowBase, nPulseRing, nCollar, nArray);

  // --- Animation: idle (3.6s continuous 360-deg phased-array scan, counter-rotating collar, silo pulse) ---
  const steps = 9, dur = 3.6;
  const T = [], arrR = [], colR = [], colT = [], pulseT = [], pulseS = [];
  for (let i = 0; i < steps; i++) {
    const u = i / (steps - 1), ang = u * TAU;
    T.push(+(u * dur).toFixed(4));
    arrR.push([0, Math.sin(ang * 0.5), 0, Math.cos(ang * 0.5)]);
    colR.push([0, -Math.sin(ang * 0.5), 0, Math.cos(ang * 0.5)]);
    colT.push([0, 3.18 + 0.05 * Math.sin(ang), siloZ]);
    pulseT.push([0, 1.56 + 0.36 * Math.sin(ang), siloZ]);
    const sc = 1 + 0.04 * Math.sin(ang * 2);
    pulseS.push([sc, 1, sc]);
  }

  const animations = [{
    name: 'idle',
    tracks: [
      { node: nArray, path: 'rotation', times: T, values: arrR },
      { node: nCollar, path: 'rotation', times: T, values: colR },
      { node: nCollar, path: 'translation', times: T, values: colT },
      { node: nPulseRing, path: 'translation', times: T, values: pulseT },
      { node: nPulseRing, path: 'scale', times: T, values: pulseS },
    ],
  }];

  return { materials, meshes, nodes, rootNodes: [nRoot], animations };
}

// ============================================================================
// Spec-Compliant glTF 2.0 Binary (.glb) Packer
// ============================================================================
function packGLB(sceneDef) {
  const chunks = [];
  let byteOffset = 0;
  const bufferViews = [];
  const accessors = [];

  function pushBytes(buf, target) {
    const pad = (4 - (buf.length % 4)) % 4;
    const aligned = pad ? Buffer.concat([buf, Buffer.alloc(pad)]) : buf;
    const bv = { buffer: 0, byteOffset, byteLength: buf.length };
    if (target) bv.target = target;
    const id = bufferViews.length;
    bufferViews.push(bv);
    chunks.push(aligned);
    byteOffset += aligned.length;
    return id;
  }

  function addFloatAccessor(flatValues, type, width, target, withBounds = false) {
    const f32 = new Float32Array(flatValues.length);
    for (let i = 0; i < flatValues.length; i++) f32[i] = flatValues[i];
    const count = f32.length / width;
    const bv = pushBytes(Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength), target);
    const acc = { bufferView: bv, componentType: 5126, count, type };
    if (withBounds) {
      const min = Array(width).fill(Infinity), max = Array(width).fill(-Infinity);
      for (let i = 0; i < count; i++) {
        for (let w = 0; w < width; w++) {
          const v = f32[i * width + w];
          if (v < min[w]) min[w] = v;
          if (v > max[w]) max[w] = v;
        }
      }
      acc.min = min;
      acc.max = max;
    }
    accessors.push(acc);
    return accessors.length - 1;
  }

  function addIndexAccessor(indices) {
    const u16 = new Uint16Array(indices);
    let min = 65535, max = 0;
    for (let i = 0; i < u16.length; i++) {
      if (u16[i] < min) min = u16[i];
      if (u16[i] > max) max = u16[i];
    }
    const bv = pushBytes(Buffer.from(u16.buffer, u16.byteOffset, u16.byteLength), 34963);
    accessors.push({ bufferView: bv, componentType: 5123, count: u16.length, type: 'SCALAR', min: [min], max: [max] });
    return accessors.length - 1;
  }

  const gltfMaterials = sceneDef.materials.map((m) => {
    const mat = {
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: m.baseColorFactor,
        metallicFactor: m.metallicFactor,
        roughnessFactor: m.roughnessFactor,
      },
    };
    if (m.emissiveFactor) mat.emissiveFactor = m.emissiveFactor;
    if (m.doubleSided) mat.doubleSided = true;
    return mat;
  });

  const gltfMeshes = sceneDef.meshes.map((m) => ({
    name: m.name,
    primitives: [{
      attributes: {
        POSITION: addFloatAccessor(m.data.pos, 'VEC3', 3, 34962, true),
        NORMAL: addFloatAccessor(m.data.norm, 'VEC3', 3, 34962, false),
        TEXCOORD_0: addFloatAccessor(m.data.uv, 'VEC2', 2, 34962, false),
      },
      indices: addIndexAccessor(m.data.idx),
      material: m.matIndex,
    }],
  }));

  const gltfNodes = sceneDef.nodes.map((n) => {
    const out = { name: n.name };
    if (n.translation) out.translation = n.translation;
    if (n.rotation) out.rotation = quatNormalize(n.rotation);
    if (n.scale) out.scale = n.scale;
    if (n.mesh !== undefined) out.mesh = n.mesh;
    if (n.children && n.children.length) out.children = n.children;
    if (n.extras) out.extras = n.extras;
    return out;
  });

  const timeAccessorCache = new Map();
  function getTimeAccessor(times) {
    const key = times.join(',');
    if (timeAccessorCache.has(key)) return timeAccessorCache.get(key);
    const id = addFloatAccessor(times, 'SCALAR', 1, 0, true);
    timeAccessorCache.set(key, id);
    return id;
  }

  const gltfAnimations = sceneDef.animations.map((anim) => {
    const samplers = [];
    const channels = [];
    for (const tr of anim.tracks) {
      const input = getTimeAccessor(tr.times);
      const isRot = tr.path === 'rotation';
      const vals = tr.values.map((v) => (isRot ? quatNormalize(v) : v.slice()));
      if (isRot) {
        for (let i = 1; i < vals.length; i++) {
          const p = vals[i - 1], c = vals[i];
          if (p[0] * c[0] + p[1] * c[1] + p[2] * c[2] + p[3] * c[3] < 0) {
            vals[i] = [-c[0], -c[1], -c[2], -c[3]];
          }
        }
      }
      const flat = [];
      for (const v of vals) for (const x of v) flat.push(x);
      const output = addFloatAccessor(flat, isRot ? 'VEC4' : 'VEC3', isRot ? 4 : 3, 0, false);
      const samplerIndex = samplers.length;
      samplers.push({ input, interpolation: 'LINEAR', output });
      channels.push({ sampler: samplerIndex, target: { node: tr.node, path: tr.path } });
    }
    return { name: anim.name, channels, samplers };
  });

  const rootExtras = sceneDef.nodes[sceneDef.rootNodes[0]].extras;
  const gltf = {
    asset: { version: '2.0', generator: 'StarfallMeridianSpecterGenerator/1.0' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: sceneDef.rootNodes, ...(rootExtras ? { extras: rootExtras } : {}) }],
    nodes: gltfNodes,
    meshes: gltfMeshes,
    materials: gltfMaterials,
    animations: gltfAnimations,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunk = jsonPad ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;
  const binChunk = Buffer.concat(chunks);

  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonChunk.length, 0);
  jsonHdr.writeUInt32LE(0x4e4f534a, 4);

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(binChunk.length, 0);
  binHdr.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHdr, jsonChunk, binHdr, binChunk]);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const shadeBuf = packGLB(buildShadeAgent());
  const academyBuf = packGLB(buildSpecterAcademy());
  const shadePath = path.join(OUT_DIR, 'shade_agent.glb');
  const academyPath = path.join(OUT_DIR, 'specter_academy.glb');
  fs.writeFileSync(shadePath, shadeBuf);
  fs.writeFileSync(academyPath, academyBuf);
  console.log(`Wrote ${shadePath} (${shadeBuf.length} bytes)`);
  console.log(`Wrote ${academyPath} (${academyBuf.length} bytes)`);
}

if (require.main === module) main();
module.exports = { buildShadeAgent, buildSpecterAcademy, packGLB };
