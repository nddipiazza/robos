// Deterministic hard-surface procedural geometry toolkit.
// Right-handed Y-up, -Z forward. Guaranteed unit Float32 normals and CCW outward winding.

import {
  TAU,
  add3,
  cross3,
  dot3,
  len3,
  norm3,
  quatFromEulerDeg,
  rotateVecByQuat,
  scale3,
  sub3,
} from './math.mjs';

function norm3f32(v) {
  const f = new Float32Array(v);
  const l = Math.hypot(f[0], f[1], f[2]);
  if (l < 1e-12) return [0, 1, 0];
  const out = new Float32Array([f[0] / l, f[1] / l, f[2] / l]);
  return [out[0], out[1], out[2]];
}

export class PrimBuilder {
  constructor(material = 0) {
    this.material = material;
    this.positions = []; // flat [x,y,z,...]
    this.normals = [];   // flat [nx,ny,nz,...]
    this.indices = [];   // flat [i0,i1,i2,...]
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  addVertex(p, n) {
    const idx = this.positions.length / 3;
    const nf = norm3f32(n);
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(nf[0], nf[1], nf[2]);
    return idx;
  }

  addTri(p0, p1, p2, outwardHint = null) {
    let a = p0;
    let b = p1;
    let c = p2;
    let nRaw = cross3(sub3(b, a), sub3(c, a));
    const area2 = len3(nRaw);
    if (area2 < 1e-9) return; // skip degenerate triangle
    if (outwardHint && dot3(nRaw, outwardHint) < 0) {
      const tmp = b;
      b = c;
      c = tmp;
      nRaw = scale3(nRaw, -1);
    }
    const n = norm3f32(nRaw);
    const i0 = this.addVertex(a, n);
    const i1 = this.addVertex(b, n);
    const i2 = this.addVertex(c, n);
    this.indices.push(i0, i1, i2);
  }

  addSmoothTri(p0, p1, p2, n0, n1, n2, outwardHint = null) {
    let a = p0, b = p1, c = p2;
    let na = n0, nb = n1, nc = n2;
    const nRaw = cross3(sub3(b, a), sub3(c, a));
    if (len3(nRaw) < 1e-9) return;
    const hint = outwardHint || add3(add3(na, nb), nc);
    if (dot3(nRaw, hint) < 0) {
      [b, c] = [c, b];
      [nb, nc] = [nc, nb];
    }
    const i0 = this.addVertex(a, na);
    const i1 = this.addVertex(b, nb);
    const i2 = this.addVertex(c, nc);
    this.indices.push(i0, i1, i2);
  }

  addQuad(p0, p1, p2, p3, outwardHint = null) {
    this.addTri(p0, p1, p2, outwardHint);
    this.addTri(p0, p2, p3, outwardHint);
  }

  append(other) {
    const base = this.vertexCount;
    for (let i = 0; i < other.positions.length; i++) {
      this.positions.push(other.positions[i]);
      this.normals.push(other.normals[i]);
    }
    for (let i = 0; i < other.indices.length; i++) {
      this.indices.push(base + other.indices[i]);
    }
    return this;
  }

  clone() {
    const c = new PrimBuilder(this.material);
    c.positions = this.positions.slice();
    c.normals = this.normals.slice();
    c.indices = this.indices.slice();
    return c;
  }
}

export function transformPrim(prim, { pos = [0, 0, 0], rotDeg = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const out = new PrimBuilder(prim.material);
  const q = quatFromEulerDeg(rotDeg[0] || 0, rotDeg[1] || 0, rotDeg[2] || 0);
  const [sx, sy, sz] = Array.isArray(scale) ? scale : [scale, scale, scale];
  const detSign = Math.sign(sx * sy * sz) || 1;
  const invSx = Math.abs(sx) > 1e-8 ? 1 / sx : 1;
  const invSy = Math.abs(sy) > 1e-8 ? 1 / sy : 1;
  const invSz = Math.abs(sz) > 1e-8 ? 1 / sz : 1;

  for (let i = 0; i < prim.positions.length; i += 3) {
    const scaled = [prim.positions[i] * sx, prim.positions[i + 1] * sy, prim.positions[i + 2] * sz];
    const rotated = rotateVecByQuat(scaled, q);
    out.positions.push(rotated[0] + pos[0], rotated[1] + pos[1], rotated[2] + pos[2]);

    const nScaled = [
      prim.normals[i] * invSx * detSign,
      prim.normals[i + 1] * invSy * detSign,
      prim.normals[i + 2] * invSz * detSign,
    ];
    const nRot = norm3f32(rotateVecByQuat(nScaled, q));
    out.normals.push(nRot[0], nRot[1], nRot[2]);
  }

  if (detSign < 0) {
    for (let i = 0; i < prim.indices.length; i += 3) {
      out.indices.push(prim.indices[i], prim.indices[i + 2], prim.indices[i + 1]);
    }
  } else {
    out.indices = prim.indices.slice();
  }
  return out;
}

export function mirrorPrimX(prim) {
  return transformPrim(prim, { scale: [-1, 1, 1] });
}

// True 26-face chamfered / beveled rectangular armor block centered at origin
export function bevelBox(sx, sy, sz, bevel = 0.035, material = 0) {
  const p = new PrimBuilder(material);
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const b = Math.min(bevel, hx * 0.42, hy * 0.42, hz * 0.42);

  if (b <= 1e-5) {
    const x0 = -hx, x1 = hx, y0 = -hy, y1 = hy, z0 = -hz, z1 = hz;
    p.addQuad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
    p.addQuad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]);
    p.addQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    p.addQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    p.addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    p.addQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    return p;
  }

  const ix = hx - b;
  const iy = hy - b;
  const iz = hz - b;

  // Corner vertex helper: (sxSign, sySign, szSign, expandAxis: 0|1|2)
  const cv = (xs, ys, zs, axis) => [
    xs * (axis === 0 ? hx : ix),
    ys * (axis === 1 ? hy : iy),
    zs * (axis === 2 ? hz : iz),
  ];

  // 6 primary faces
  for (const s of [-1, 1]) {
    p.addQuad(cv(-1, s, -1, 1), cv(-1, s, 1, 1), cv(1, s, 1, 1), cv(1, s, -1, 1), [0, s, 0]);
    p.addQuad(cv(s, -1, -1, 0), cv(s, 1, -1, 0), cv(s, 1, 1, 0), cv(s, -1, 1, 0), [s, 0, 0]);
    p.addQuad(cv(-1, -1, s, 2), cv(1, -1, s, 2), cv(1, 1, s, 2), cv(-1, 1, s, 2), [0, 0, s]);
  }

  // 12 edge bevels
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      // Edge parallel to X (between Y=s1 and Z=s2)
      p.addQuad(cv(-1, s1, s2, 1), cv(1, s1, s2, 1), cv(1, s1, s2, 2), cv(-1, s1, s2, 2), [0, s1, s2]);
      // Edge parallel to Y (between X=s1 and Z=s2)
      p.addQuad(cv(s1, -1, s2, 0), cv(s1, 1, s2, 0), cv(s1, 1, s2, 2), cv(s1, -1, s2, 2), [s1, 0, s2]);
      // Edge parallel to Z (between X=s1 and Y=s2)
      p.addQuad(cv(s1, s2, -1, 0), cv(s1, s2, -1, 1), cv(s1, s2, 1, 1), cv(s1, s2, 1, 0), [s1, s2, 0]);
    }
  }

  // 8 corner bevel triangles
  for (const xs of [-1, 1]) {
    for (const ys of [-1, 1]) {
      for (const zs of [-1, 1]) {
        p.addTri(cv(xs, ys, zs, 0), cv(xs, ys, zs, 1), cv(xs, ys, zs, 2), [xs, ys, zs]);
      }
    }
  }
  return p;
}

// Loft closed cross-section stations (each station has N 3D points ordered consistently around its centroid).
export function loftStations(stations, material = 0, { capStart = true, capEnd = true } = {}) {
  const p = new PrimBuilder(material);
  const m = stations.length;
  if (m < 2) return p;
  const n = stations[0].length;

  const centroid = (ring) => {
    let cx = 0, cy = 0, cz = 0;
    for (const pt of ring) {
      cx += pt[0];
      cy += pt[1];
      cz += pt[2];
    }
    return [cx / ring.length, cy / ring.length, cz / ring.length];
  };

  const centers = stations.map(centroid);

  for (let s = 0; s < m - 1; s++) {
    const r0 = stations[s];
    const r1 = stations[s + 1];
    const midC = scale3(add3(centers[s], centers[s + 1]), 0.5);
    for (let i = 0; i < n; i++) {
      const inext = (i + 1) % n;
      const a = r0[i];
      const b = r0[inext];
      const c = r1[inext];
      const d = r1[i];
      const fMid = scale3(add3(add3(a, b), add3(c, d)), 0.25);
      const outward = sub3(fMid, midC);
      p.addQuad(a, b, c, d, outward);
    }
  }

  if (capStart) {
    const r0 = stations[0];
    const c0 = centers[0];
    const c1 = centers[1];
    const startOut = sub3(c0, c1);
    for (let i = 1; i < n - 1; i++) {
      p.addTri(r0[0], r0[i], r0[i + 1], startOut);
    }
  }

  if (capEnd) {
    const rm = stations[m - 1];
    const cm = centers[m - 1];
    const cprev = centers[m - 2];
    const endOut = sub3(cm, cprev);
    for (let i = 1; i < n - 1; i++) {
      p.addTri(rm[0], rm[i], rm[i + 1], endOut);
    }
  }

  return p;
}

// Helper to create an 8-point chined cross-section at a given Z station for hulls/fuselages/turrets
// Profile has flat top deck, angled upper armor slope, vertical/sloped side belt, lower chine, flat keel.
export function chinedSection({
  z,
  yCenter = 0,
  halfHeight = 0.5,
  topHalfW = 0.4,
  midHalfW = 0.6,
  botHalfW = 0.35,
  upperSplit = 0.35,
  lowerSplit = -0.35,
  xOffset = 0,
}) {
  const yTop = yCenter + halfHeight;
  const yUp = yCenter + halfHeight * upperSplit;
  const yLo = yCenter + halfHeight * lowerSplit;
  const yBot = yCenter - halfHeight;
  return [
    [xOffset - topHalfW, yTop, z],
    [xOffset + topHalfW, yTop, z],
    [xOffset + midHalfW, yUp, z],
    [xOffset + midHalfW * 0.96, yLo, z],
    [xOffset + botHalfW, yBot, z],
    [xOffset - botHalfW, yBot, z],
    [xOffset - midHalfW * 0.96, yLo, z],
    [xOffset - midHalfW, yUp, z],
  ];
}

// Deterministic 2D ear-clipping triangulation for arbitrary simple polygons [[x, z], ...]
function triangulatePolygon2D(pts) {
  const n = pts.length;
  if (n < 3) return [];
  // Ensure positive signed area in 2D
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    area += x0 * y1 - x1 * y0;
  }
  const indices = Array.from({ length: n }, (_, i) => (area >= 0 ? i : n - 1 - i));
  const tris = [];

  const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p, a, b, c) => {
    const c1 = cross2(a, b, p);
    const c2 = cross2(b, c, p);
    const c3 = cross2(c, a, p);
    return c1 >= -1e-9 && c2 >= -1e-9 && c3 >= -1e-9;
  };

  let guard = 0;
  while (indices.length > 3 && guard < n * n + 16) {
    guard++;
    let clipped = false;
    const m = indices.length;
    for (let i = 0; i < m; i++) {
      const iPrev = indices[(i - 1 + m) % m];
      const iCurr = indices[i];
      const iNext = indices[(i + 1) % m];
      const a = pts[iPrev];
      const b = pts[iCurr];
      const c = pts[iNext];
      if (cross2(a, b, c) <= 1e-9) continue;
      let containsAny = false;
      for (let j = 0; j < m; j++) {
        const idx = indices[j];
        if (idx === iPrev || idx === iCurr || idx === iNext) continue;
        if (inTri(pts[idx], a, b, c)) {
          containsAny = true;
          break;
        }
      }
      if (!containsAny) {
        tris.push([iPrev, iCurr, iNext]);
        indices.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) break;
  }
  if (indices.length === 3) {
    tris.push([indices[0], indices[1], indices[2]]);
  }
  return tris;
}

// Extrude a 2D XZ polygon vertically from yBot to yTop with optional top inset/taper & offset
export function extrudePolygonY(
  polyXZ,
  yBot,
  yTop,
  material = 0,
  { scaleTopX = 1, scaleTopZ = 1, offsetTopX = 0, offsetTopZ = 0 } = {},
) {
  const p = new PrimBuilder(material);
  const n = polyXZ.length;
  if (n < 3) return p;

  let cx = 0, cz = 0;
  for (const [x, z] of polyXZ) {
    cx += x;
    cz += z;
  }
  cx /= n;
  cz /= n;

  // Compute signed area so we know outward side normal direction in XZ
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = polyXZ[i];
    const [x1, z1] = polyXZ[(i + 1) % n];
    signedArea += x0 * z1 - x1 * z0;
  }
  const areaSign = signedArea >= 0 ? 1 : -1;

  const botPts = polyXZ.map(([x, z]) => [x, yBot, z]);
  const topPts = polyXZ.map(([x, z]) => [
    cx + (x - cx) * scaleTopX + offsetTopX,
    yTop,
    cz + (z - cz) * scaleTopZ + offsetTopZ,
  ]);

  const tris = triangulatePolygon2D(polyXZ);
  for (const [i0, i1, i2] of tris) {
    p.addTri(topPts[i0], topPts[i1], topPts[i2], [0, 1, 0]);
    p.addTri(botPts[i0], botPts[i2], botPts[i1], [0, -1, 0]);
  }

  for (let i = 0; i < n; i++) {
    const inext = (i + 1) % n;
    const dx = polyXZ[inext][0] - polyXZ[i][0];
    const dz = polyXZ[inext][1] - polyXZ[i][1];
    // For positive signedArea (x0*z1 - x1*z0 > 0), outward 2D normal is (dz, -dx)
    const outHint = [dz * areaSign, (scaleTopX < 1 || scaleTopZ < 1) ? 0.2 : 0, -dx * areaSign];
    p.addQuad(botPts[i], botPts[inext], topPts[inext], topPts[i], outHint);
  }

  return p;
}

// Revolve a 2D (radius, y) profile around the +Y axis.
// Profile goes from start to end; outward normal follows the right-hand perpendicular of segment (dr, dy):
// When tracing exterior from bottom (y0) upward (y1), outward radial direction is (+dy, -dr).
export function latheY(profileRY, segments = 16, material = 0, { smooth = true } = {}) {
  const p = new PrimBuilder(material);
  const rings = profileRY.length;
  if (rings < 2) return p;

  for (let r = 0; r < rings - 1; r++) {
    const [r0, y0] = profileRY[r];
    const [r1, y1] = profileRY[r + 1];
    const dr = r1 - r0;
    const dy = y1 - y0;
    if (Math.hypot(dr, dy) < 1e-8) continue;

    // Outward 2D normal in (radial, y) plane assuming counter-clockwise profile trace around interior
    const nr = dy;
    const ny = -dr;

    for (let s = 0; s < segments; s++) {
      const a0 = (s / segments) * TAU;
      const a1 = ((s + 1) / segments) * TAU;
      const am = ((s + 0.5) / segments) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const cm = Math.cos(am), sm = Math.sin(am);

      const p00 = [r0 * c0, y0, r0 * s0];
      const p10 = [r0 * c1, y0, r0 * s1];
      const p11 = [r1 * c1, y1, r1 * s1];
      const p01 = [r1 * c0, y1, r1 * s0];
      const hint = [nr * cm, ny, nr * sm];

      if (smooth && Math.abs(nr) > 1e-5) {
        const n0 = norm3f32([nr * c0, ny, nr * s0]);
        const n1 = norm3f32([nr * c1, ny, nr * s1]);
        if (r0 > 1e-6) {
          p.addSmoothTri(p00, p10, p11, n0, n1, n1, hint);
        }
        if (r1 > 1e-6) {
          p.addSmoothTri(p00, p11, p01, n0, n1, n0, hint);
        }
      } else {
        if (r0 > 1e-6) p.addTri(p00, p10, p11, hint);
        if (r1 > 1e-6) p.addTri(p00, p11, p01, hint);
      }
    }
  }
  return p;
}

// Solid cylinder / cone / frustum along +Y centered at origin (y from -h/2 to +h/2)
export function cylinderY(rTop, rBot, height, segments = 14, material = 0, { smooth = true } = {}) {
  const hh = height * 0.5;
  const profile = [];
  if (rBot > 1e-6) profile.push([0, -hh], [rBot, -hh]);
  else profile.push([0, -hh]);

  if (rTop > 1e-6) profile.push([rTop, hh], [0, hh]);
  else profile.push([0, hh]);

  return latheY(profile, segments, material, { smooth });
}

// Ducted shroud / annular barrel along Z (from -length/2 to +length/2) with inner bore!
// Bell-mouth intake at -Z, armored outer sleeve, recessed fan/exhaust bore!
export function ductedShroudZ({
  outerRFront,
  outerRMid,
  outerRBack,
  innerR,
  length,
  lipDepth = 0.14,
  segments = 16,
  material = 0,
  smooth = false,
}) {
  const hl = length * 0.5;
  // Build around +Y first (y = -hl is front -Z after +90 deg X rotation? Let's verify:
  // rotX(+90): (x, y, z) -> (x, -z, +y). So +y maps to +z, and -y maps to -z (FRONT)!)
  // Trace exterior CCW so (dy, -dr) points outward:
  // Start inside bore at back (+hl), go forward along inner bore (r = innerR, y: +hl -> -hl):
  // dy < 0, dr = 0 -> (nr = dy < 0) points INWARD toward axis!
  // Round front intake lip (-hl): innerR -> outerRFront
  // Go backward along exterior (-hl -> 0 -> +hl): dy > 0 -> nr > 0 points OUTWARD!
  // Close back rim (+hl): outerRBack -> innerR: dr < 0, dy = 0 -> ny = -dr > 0 (+Z)!
  const profile = [
    [innerR, hl],
    [innerR, -hl + lipDepth],
    [(innerR + outerRFront) * 0.5, -hl],
    [outerRFront, -hl + lipDepth * 0.7],
    [outerRMid, 0],
    [outerRBack, hl],
    [innerR, hl],
  ];
  const lathed = latheY(profile, segments, material, { smooth });
  return transformPrim(lathed, { rotDeg: [90, 0, 0] });
}

// True concave parabolic radar/sensor dish facing +Y (can be tilted/rotated as needed)
export function sensorDishY({
  radius,
  thickness = 0.12,
  rimWidth = 0.08,
  dishDepth = 0.11,
  segments = 20,
  dishMat = 0,
  rimMat = 0,
  coreMat = 0,
}) {
  const rInner = Math.max(0.08, radius - rimWidth);
  // Main dish body + concave interior
  const bodyProfile = [
    [0, -thickness * 0.6],
    [radius * 0.55, -thickness * 0.55],
    [radius, -thickness * 0.1],
    [radius, thickness * 0.55],
    [rInner, thickness * 0.55],
    [rInner * 0.55, thickness * 0.55 - dishDepth * 0.72],
    [0, thickness * 0.55 - dishDepth],
  ];
  const dish = latheY(bodyProfile, segments, dishMat, { smooth: true });
  const rim = latheY(
    [
      [rInner * 0.98, thickness * 0.50],
      [radius * 1.01, thickness * 0.50],
      [radius * 1.01, thickness * 0.64],
      [rInner * 0.98, thickness * 0.64],
      [rInner * 0.98, thickness * 0.50],
    ],
    segments,
    rimMat,
    { smooth: false },
  );
  const horn = cylinderY(radius * 0.12, radius * 0.16, dishDepth + 0.14, 10, coreMat, { smooth: true });
  const hornPlaced = transformPrim(horn, { pos: [0, thickness * 0.55 - dishDepth * 0.35 + 0.05, 0] });
  return [dish, rim, hornPlaced];
}

// Recessed armor channel + inset TeamColor plate!
// Creates a raised dark-armor bezel frame with a dark recessed floor AND returns { framePrims, teamPrim }
// Facing +Y by default (width along X, length along Z), transformable to any orientation!
export function recessedTeamPlate({
  width,
  length,
  frameHeight = 0.09,
  border = 0.065,
  plateThickness = 0.048,
  bezelMat,
  floorMat,
  teamMat,
  pos = [0, 0, 0],
  rotDeg = [0, 0, 0],
}) {
  const hw = width * 0.5;
  const hl = length * 0.5;
  const b = Math.min(border, width * 0.25, length * 0.25);
  const innerW = width - b * 2;
  const innerL = length - b * 2;

  const framePrims = [];
  // Dark floor slab
  framePrims.push(
    transformPrim(bevelBox(width, frameHeight * 0.38, length, 0.012, floorMat), {
      pos: [0, frameHeight * 0.19, 0],
    }),
  );
  // 4 raised beveled armor walls framing the recessed trough
  // Left & Right long walls
  for (const sx of [-1, 1]) {
    framePrims.push(
      transformPrim(bevelBox(b, frameHeight, length, 0.015, bezelMat), {
        pos: [sx * (hw - b * 0.5), frameHeight * 0.5, 0],
      }),
    );
  }
  // Front & Back end caps
  for (const sz of [-1, 1]) {
    framePrims.push(
      transformPrim(bevelBox(innerW, frameHeight, b, 0.015, bezelMat), {
        pos: [0, frameHeight * 0.5, sz * (hl - b * 0.5)],
      }),
    );
  }

  // Recessed blue TeamColor plate nestled inside the bezel (top sits slightly below frameHeight!)
  const plateY = frameHeight * 0.34 + plateThickness * 0.5;
  const rawTeam = transformPrim(
    bevelBox(innerW * 0.97, plateThickness, innerL * 0.985, 0.014, teamMat),
    { pos: [0, plateY, 0] },
  );

  return {
    framePrims: framePrims.map((fp) => transformPrim(fp, { pos, rotDeg })),
    teamPrim: transformPrim(rawTeam, { pos, rotDeg }),
  };
}

// Group an array of PrimBuilders by material index into merged PrimBuilders
export function mergePrimsByMaterial(prims) {
  const byMat = new Map();
  for (const p of prims) {
    if (!p || p.indices.length === 0) continue;
    let bucket = byMat.get(p.material);
    if (!bucket) {
      bucket = new PrimBuilder(p.material);
      byMat.set(p.material, bucket);
    }
    bucket.append(p);
  }
  return Array.from(byMat.keys())
    .sort((a, b) => a - b)
    .map((k) => byMat.get(k));
}

// Compute world-space rest-pose bounds & radial XZ stats of a scene node tree
export function computeSceneBounds(nodes, rootIndices) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let maxRadialXZ = 0;

  function visit(nodeIdx, parentPos, parentRot, parentScale) {
    const node = nodes[nodeIdx];
    const lPos = node.translation || [0, 0, 0];
    const lRot = node.rotation || [0, 0, 0, 1];
    const lScl = node.scale || [1, 1, 1];

    const scaledLocal = [lPos[0] * parentScale[0], lPos[1] * parentScale[1], lPos[2] * parentScale[2]];
    const wPos = add3(parentPos, rotateVecByQuat(scaledLocal, parentRot));
    const wRot = [
      parentRot[3] * lRot[0] + parentRot[0] * lRot[3] + parentRot[1] * lRot[2] - parentRot[2] * lRot[1],
      parentRot[3] * lRot[1] - parentRot[0] * lRot[2] + parentRot[1] * lRot[3] + parentRot[2] * lRot[0],
      parentRot[3] * lRot[2] + parentRot[0] * lRot[1] - parentRot[1] * lRot[0] + parentRot[2] * lRot[3],
      parentRot[3] * lRot[3] - parentRot[0] * lRot[0] - parentRot[1] * lRot[1] - parentRot[2] * lRot[2],
    ];
    const wScale = [parentScale[0] * lScl[0], parentScale[1] * lScl[1], parentScale[2] * lScl[2]];

    if (node.prims) {
      for (const prim of node.prims) {
        for (let i = 0; i < prim.positions.length; i += 3) {
          const sp = [
            prim.positions[i] * wScale[0],
            prim.positions[i + 1] * wScale[1],
            prim.positions[i + 2] * wScale[2],
          ];
          const wp = add3(wPos, rotateVecByQuat(sp, wRot));
          if (wp[0] < minX) minX = wp[0];
          if (wp[1] < minY) minY = wp[1];
          if (wp[2] < minZ) minZ = wp[2];
          if (wp[0] > maxX) maxX = wp[0];
          if (wp[1] > maxY) maxY = wp[1];
          if (wp[2] > maxZ) maxZ = wp[2];
          const rXZ = Math.hypot(wp[0], wp[2]);
          if (rXZ > maxRadialXZ) maxRadialXZ = rXZ;
        }
      }
    }

    if (node.children) {
      for (const childIdx of node.children) {
        visit(childIdx, wPos, wRot, wScale);
      }
    }
  }

  for (const rIdx of rootIndices) {
    visit(rIdx, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
  }

  return { minX, minY, minZ, maxX, maxY, maxZ, maxRadialXZ };
}

// Compute exact world-space minY when given a map/object of nodeName -> { translation?, rotation?, scale? }
export function computePosedMinY(sceneBuilder, overridesByName = {}) {
  const { nodes, rootIndices } = sceneBuilder;
  let minY = Infinity;

  function visit(nodeIdx, parentPos, parentRot, parentScale) {
    const node = nodes[nodeIdx];
    const ov = overridesByName[node.name] || {};
    const lPos = ov.translation || node.translation || [0, 0, 0];
    const lRot = ov.rotation || node.rotation || [0, 0, 0, 1];
    const lScl = ov.scale || node.scale || [1, 1, 1];

    const scaledLocal = [lPos[0] * parentScale[0], lPos[1] * parentScale[1], lPos[2] * parentScale[2]];
    const wPos = add3(parentPos, rotateVecByQuat(scaledLocal, parentRot));
    const wRot = [
      parentRot[3] * lRot[0] + parentRot[0] * lRot[3] + parentRot[1] * lRot[2] - parentRot[2] * lRot[1],
      parentRot[3] * lRot[1] - parentRot[0] * lRot[2] + parentRot[1] * lRot[3] + parentRot[2] * lRot[0],
      parentRot[3] * lRot[2] + parentRot[0] * lRot[1] - parentRot[1] * lRot[0] + parentRot[2] * lRot[3],
      parentRot[3] * lRot[3] - parentRot[0] * lRot[0] - parentRot[1] * lRot[1] - parentRot[2] * lRot[2],
    ];
    const wScale = [parentScale[0] * lScl[0], parentScale[1] * lScl[1], parentScale[2] * lScl[2]];

    if (node.prims) {
      for (const prim of node.prims) {
        for (let i = 0; i < prim.positions.length; i += 3) {
          const sp = [
            prim.positions[i] * wScale[0],
            prim.positions[i + 1] * wScale[1],
            prim.positions[i + 2] * wScale[2],
          ];
          const wp = add3(wPos, rotateVecByQuat(sp, wRot));
          if (wp[1] < minY) minY = wp[1];
        }
      }
    }
    for (const cIdx of node.children) {
      visit(cIdx, wPos, wRot, wScale);
    }
  }

  for (const rIdx of rootIndices) {
    visit(rIdx, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
  }
  return minY;
}

// Return an adjusted translation [x, y, z] for `bodyNodeName` so the posed scene's lowest vertex sits at `targetMinY`
export function groundedTranslation(sceneBuilder, bodyNodeName, candidatePos, overridesByName = {}, targetMinY = 0) {
  const merged = {
    ...overridesByName,
    [bodyNodeName]: {
      ...(overridesByName[bodyNodeName] || {}),
      translation: candidatePos,
    },
  };
  const currentMinY = computePosedMinY(sceneBuilder, merged);
  return [candidatePos[0], candidatePos[1] + (targetMinY - currentMinY), candidatePos[2]];
}

// Uniformly calibrate a scene node tree so that:
// 1. Lowest vertex sits at Y = 0.000000 (floor zero)
// 2. X/Z center is balanced on X = 0, Z centered, and maxRadialXZ === targetRadius * fillFactor
export function calibrateSceneToRadius(nodes, rootIndices, targetRadius, fillFactor = 0.992) {
  const b0 = computeSceneBounds(nodes, rootIndices);
  const cz = (b0.minZ + b0.maxZ) * 0.5;
  const cx = (b0.minX + b0.maxX) * 0.5;

  // First shift root children (or root translation) so XZ is centered and minY === 0 before scaling
  // Recompute radialXZ around (cx, cz)
  let centeredRadialXZ = 0;
  function measureCentered(nodeIdx, parentPos, parentRot, parentScale) {
    const node = nodes[nodeIdx];
    const lPos = node.translation || [0, 0, 0];
    const lRot = node.rotation || [0, 0, 0, 1];
    const lScl = node.scale || [1, 1, 1];
    const scaledLocal = [lPos[0] * parentScale[0], lPos[1] * parentScale[1], lPos[2] * parentScale[2]];
    const wPos = add3(parentPos, rotateVecByQuat(scaledLocal, parentRot));
    const wRot = [
      parentRot[3] * lRot[0] + parentRot[0] * lRot[3] + parentRot[1] * lRot[2] - parentRot[2] * lRot[1],
      parentRot[3] * lRot[1] - parentRot[0] * lRot[2] + parentRot[1] * lRot[3] + parentRot[2] * lRot[0],
      parentRot[3] * lRot[2] + parentRot[0] * lRot[1] + parentRot[2] * lRot[3] - parentRot[1] * lRot[0],
      parentRot[3] * lRot[3] - parentRot[0] * lRot[0] - parentRot[1] * lRot[1] - parentRot[2] * lRot[2],
    ];
    const wScale = [parentScale[0] * lScl[0], parentScale[1] * lScl[1], parentScale[2] * lScl[2]];
    if (node.prims) {
      for (const prim of node.prims) {
        for (let i = 0; i < prim.positions.length; i += 3) {
          const sp = [
            prim.positions[i] * wScale[0],
            prim.positions[i + 1] * wScale[1],
            prim.positions[i + 2] * wScale[2],
          ];
          const wp = add3(wPos, rotateVecByQuat(sp, wRot));
          const r = Math.hypot(wp[0] - cx, wp[2] - cz);
          if (r > centeredRadialXZ) centeredRadialXZ = r;
        }
      }
    }
    if (node.children) {
      for (const c of node.children) measureCentered(c, wPos, wRot, wScale);
    }
  }
  for (const rIdx of rootIndices) {
    measureCentered(rIdx, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
  }

  const s = (targetRadius * fillFactor) / centeredRadialXZ;

  // Bake uniform scale `s` into all node local translations AND vertex positions (keeping node.scale = [1,1,1]!)
  // Baking `s` into translations + vertex positions (plus animation translation tracks!) is much cleaner than
  // leaving non-unit root scale, because every anchor and mesh coordinate is in true world meters!
  for (const rIdx of rootIndices) {
    const rNode = nodes[rIdx];
    const t = rNode.translation || [0, 0, 0];
    rNode.translation = [t[0] - cx, t[1] - b0.minY, t[2] - cz];
  }

  for (const node of nodes) {
    if (node.translation) {
      node.translation = [
        node.translation[0] * s,
        node.translation[1] * s,
        node.translation[2] * s,
      ];
    }
    if (node.prims) {
      for (const prim of node.prims) {
        for (let i = 0; i < prim.positions.length; i++) {
          prim.positions[i] *= s;
        }
      }
    }
  }

  // Final Float32 floor snap so Float32 minY is 0.000000
  const b1 = computeSceneBounds(nodes, rootIndices);
  if (Math.abs(b1.minY) > 1e-7) {
    for (const rIdx of rootIndices) {
      const rNode = nodes[rIdx];
      const t = rNode.translation || [0, 0, 0];
      rNode.translation = [t[0], t[1] - b1.minY, t[2]];
    }
  }

  return s;
}
