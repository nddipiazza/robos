import { add3, cross3, dot3, len3, lerp3, norm3, rotateVecByQuat, scale3, sub3 } from './math.js';

// Part holds triangles grouped by material name so sub-assemblies can be transformed,
// cloned, and mirrored (with automatic winding reversal on negative-determinant scales)
// before merging into a glTF node's MeshBuilder.
export class Part {
  constructor() {
    // Map<materialName, Array<{ p: [[x,y,z],[x,y,z],[x,y,z]], uv: [[u,v],[u,v],[u,v]] }>>
    this.trisByMat = new Map();
  }

  _list(mat) {
    let list = this.trisByMat.get(mat);
    if (!list) {
      list = [];
      this.trisByMat.set(mat, list);
    }
    return list;
  }

  addTri(mat, p0, p1, p2, uv0 = [0, 0], uv1 = [1, 0], uv2 = [1, 1]) {
    const e1 = sub3(p1, p0);
    const e2 = sub3(p2, p0);
    const c = cross3(e1, e2);
    if (len3(c) < 1e-10) return this; // skip degenerate
    this._list(mat).push({
      p: [[...p0], [...p1], [...p2]],
      uv: [[...uv0], [...uv1], [...uv2]],
    });
    return this;
  }

  // CCW quad (p0 -> p1 -> p2 -> p3) viewed from outside
  addQuad(mat, p0, p1, p2, p3, uvScale = 0.5) {
    const uLen = Math.max(0.01, len3(sub3(p1, p0)) * uvScale);
    const vLen = Math.max(0.01, len3(sub3(p3, p0)) * uvScale);
    this.addTri(mat, p0, p1, p2, [0, 0], [uLen, 0], [uLen, vLen]);
    this.addTri(mat, p0, p2, p3, [0, 0], [uLen, vLen], [0, vLen]);
    return this;
  }

  merge(other) {
    for (const [mat, tris] of other.trisByMat.entries()) {
      const dst = this._list(mat);
      for (const t of tris) {
        dst.push({
          p: [[...t.p[0]], [...t.p[1]], [...t.p[2]]],
          uv: [[...t.uv[0]], [...t.uv[1]], [...t.uv[2]]],
        });
      }
    }
    return this;
  }

  clone() {
    const copy = new Part();
    copy.merge(this);
    return copy;
  }

  translate(dx = 0, dy = 0, dz = 0) {
    for (const tris of this.trisByMat.values()) {
      for (const t of tris) {
        for (let i = 0; i < 3; i++) {
          t.p[i][0] += dx;
          t.p[i][1] += dy;
          t.p[i][2] += dz;
        }
      }
    }
    return this;
  }

  rotateQuat(q) {
    for (const tris of this.trisByMat.values()) {
      for (const t of tris) {
        for (let i = 0; i < 3; i++) {
          t.p[i] = rotateVecByQuat(t.p[i], q);
        }
      }
    }
    return this;
  }

  rotateX(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    for (const tris of this.trisByMat.values()) {
      for (const t of tris) {
        for (let i = 0; i < 3; i++) {
          const y = t.p[i][1];
          const z = t.p[i][2];
          t.p[i][1] = y * c - z * s;
          t.p[i][2] = y * s + z * c;
        }
      }
    }
    return this;
  }

  rotateY(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    for (const tris of this.trisByMat.values()) {
      for (const t of tris) {
        for (let i = 0; i < 3; i++) {
          const x = t.p[i][0];
          const z = t.p[i][2];
          t.p[i][0] = x * c + z * s;
          t.p[i][2] = -x * s + z * c;
        }
      }
    }
    return this;
  }

  rotateZ(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    for (const tris of this.trisByMat.values()) {
      for (const t of tris) {
        for (let i = 0; i < 3; i++) {
          const x = t.p[i][0];
          const y = t.p[i][1];
          t.p[i][0] = x * c - y * s;
          t.p[i][1] = x * s + y * c;
        }
      }
    }
    return this;
  }

  scale(sx = 1, sy = 1, sz = 1) {
    const flip = sx * sy * sz < 0;
    for (const tris of this.trisByMat.values()) {
      for (const t of tris) {
        for (let i = 0; i < 3; i++) {
          t.p[i][0] *= sx;
          t.p[i][1] *= sy;
          t.p[i][2] *= sz;
        }
        if (flip) {
          const tmpP = t.p[1];
          t.p[1] = t.p[2];
          t.p[2] = tmpP;
          const tmpUV = t.uv[1];
          t.uv[1] = t.uv[2];
          t.uv[2] = tmpUV;
        }
      }
    }
    return this;
  }

  mirrorX() {
    return this.clone().scale(-1, 1, 1);
  }

  mirrorZ() {
    return this.clone().scale(1, 1, -1);
  }

  // Convert into indexed glTF primitive buffers per material with crisp flat normals
  buildPrimitives() {
    const primitives = [];
    for (const [material, tris] of this.trisByMat.entries()) {
      if (tris.length === 0) continue;
      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];
      let vertIndex = 0;
      for (const t of tris) {
        const [p0, p1, p2] = t.p;
        const n = norm3(cross3(sub3(p1, p0), sub3(p2, p0)));
        positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
        normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
        uvs.push(t.uv[0][0], t.uv[0][1], t.uv[1][0], t.uv[1][1], t.uv[2][0], t.uv[2][1]);
        indices.push(vertIndex, vertIndex + 1, vertIndex + 2);
        vertIndex += 3;
      }
      primitives.push({
        material,
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: vertIndex > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
      });
    }
    return primitives;
  }
}

// --- 2D Polygon Ear-Clipping Helper ---

function signedArea2D(pts) {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area * 0.5;
}

function cross2D(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTri2D(p, a, b, c, sign) {
  const c1 = cross2D(a, b, p) * sign;
  const c2 = cross2D(b, c, p) * sign;
  const c3 = cross2D(c, a, p) * sign;
  return c1 >= -1e-9 && c2 >= -1e-9 && c3 >= -1e-9;
}

// Triangulates a simple 2D polygon (convex or concave) preserving its input winding sign (+1 or -1)
function triangulate2D(pts) {
  const n = pts.length;
  if (n < 3) return [];
  const area = signedArea2D(pts);
  const sign = area >= 0 ? 1 : -1;
  const avail = Array.from({ length: n }, (_, i) => i);
  const tris = [];
  let guard = n * n * 2 + 16;

  while (avail.length > 3 && guard-- > 0) {
    let earFound = false;
    const m = avail.length;
    for (let i = 0; i < m; i++) {
      const iPrev = avail[(i - 1 + m) % m];
      const iCurr = avail[i];
      const iNext = avail[(i + 1) % m];
      const a = pts[iPrev];
      const b = pts[iCurr];
      const c = pts[iNext];
      if (cross2D(a, b, c) * sign <= 1e-9) continue;

      let containsOther = false;
      for (let j = 0; j < m; j++) {
        const idx = avail[j];
        if (idx === iPrev || idx === iCurr || idx === iNext) continue;
        if (pointInTri2D(pts[idx], a, b, c, sign)) {
          containsOther = true;
          break;
        }
      }
      if (!containsOther) {
        tris.push([iPrev, iCurr, iNext]);
        avail.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) {
      // Fallback fan for near-collinear edge cases
      tris.push([avail[0], avail[1], avail[2]]);
      avail.splice(1, 1);
    }
  }
  if (avail.length === 3) {
    tris.push([avail[0], avail[1], avail[2]]);
  }
  return tris;
}

// --- High-Level Hard-Surface Primitives ---

// Axis-aligned box using explicit [x0..x1], [y0..y1], [z0..z1] bounds
export function boxBounds(mat, x0, x1, y0, y1, z0, z1, opts = {}) {
  const p = new Part();
  const lx = Math.min(x0, x1), hx = Math.max(x0, x1);
  const ly = Math.min(y0, y1), hy = Math.max(y0, y1);
  const lz = Math.min(z0, z1), hz = Math.max(z0, z1);

  // Front (-Z)
  p.addQuad(mat, [hx, ly, lz], [lx, ly, lz], [lx, hy, lz], [hx, hy, lz]);
  // Back (+Z)
  p.addQuad(mat, [lx, ly, hz], [hx, ly, hz], [hx, hy, hz], [lx, hy, hz]);
  // Right (+X)
  p.addQuad(mat, [hx, ly, hz], [hx, ly, lz], [hx, hy, lz], [hx, hy, hz]);
  // Left (-X)
  p.addQuad(mat, [lx, ly, lz], [lx, ly, hz], [lx, hy, hz], [lx, hy, lz]);
  // Top (+Y)
  if (opts.capTop !== false) {
    p.addQuad(mat, [lx, hy, hz], [hx, hy, hz], [hx, hy, lz], [lx, hy, lz]);
  }
  // Bottom (-Y)
  if (opts.capBottom !== false) {
    p.addQuad(mat, [lx, ly, lz], [hx, ly, lz], [hx, ly, hz], [lx, ly, hz]);
  }
  return p;
}

// Box specified by width (X), [y0..y1] vertical span, depth (Z), centered at (cx, cz)
export function boxY(mat, w, y0, y1, d, cx = 0, cz = 0, opts = {}) {
  return boxBounds(mat, cx - w * 0.5, cx + w * 0.5, y0, y1, cz - d * 0.5, cz + d * 0.5, opts);
}

// Centered box (cx, cy, cz)
export function box(mat, w, h, d, cx = 0, cy = 0, cz = 0, opts = {}) {
  return boxBounds(
    mat,
    cx - w * 0.5,
    cx + w * 0.5,
    cy - h * 0.5,
    cy + h * 0.5,
    cz - d * 0.5,
    cz + d * 0.5,
    opts
  );
}

// Extrude a 2D polygon in XZ plane vertically from y0 to y1 (y1 > y0),
// with optional top polygon override or uniform top scale/offset for sloped glacis walls!
export function extrudePolyY(mat, polyXZ, y0, y1, opts = {}) {
  const p = new Part();
  const ly = Math.min(y0, y1);
  const hy = Math.max(y0, y1);
  let bot = polyXZ.map((pt) => [pt[0], pt[1]]);
  let top = opts.topPolyXZ
    ? opts.topPolyXZ.map((pt) => [pt[0], pt[1]])
    : bot.map((pt) => [pt[0], pt[1]]);

  // Ensure signedArea2D < 0 so side quads and +Y top cap point outward
  if (signedArea2D(bot) > 0) {
    bot.reverse();
    top.reverse();
  }

  if (!opts.topPolyXZ && (opts.scaleTopX !== undefined || opts.scaleTopZ !== undefined || opts.scaleTop !== undefined || opts.offsetTop)) {
    let cx = 0, cz = 0;
    for (const pt of bot) {
      cx += pt[0];
      cz += pt[1];
    }
    cx /= bot.length;
    cz /= bot.length;
    const sx = opts.scaleTopX ?? opts.scaleTop ?? 1;
    const sz = opts.scaleTopZ ?? opts.scaleTop ?? 1;
    const ox = opts.offsetTop ? opts.offsetTop[0] : 0;
    const oz = opts.offsetTop ? opts.offsetTop[1] : 0;
    top = bot.map((pt) => [cx + (pt[0] - cx) * sx + ox, cz + (pt[1] - cz) * sz + oz]);
  }

  const n = bot.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const b0 = [bot[i][0], ly, bot[i][1]];
    const b1 = [bot[j][0], ly, bot[j][1]];
    const t1 = [top[j][0], hy, top[j][1]];
    const t0 = [top[i][0], hy, top[i][1]];
    p.addQuad(mat, b0, b1, t1, t0);
  }

  if (opts.capTop !== false) {
    const topTris = triangulate2D(top);
    for (const [i0, i1, i2] of topTris) {
      p.addTri(
        mat,
        [top[i0][0], hy, top[i0][1]],
        [top[i1][0], hy, top[i1][1]],
        [top[i2][0], hy, top[i2][1]],
        [top[i0][0] * 0.25, top[i0][1] * 0.25],
        [top[i1][0] * 0.25, top[i1][1] * 0.25],
        [top[i2][0] * 0.25, top[i2][1] * 0.25]
      );
    }
  }

  if (opts.capBottom !== false) {
    const botTris = triangulate2D(bot);
    for (const [i0, i1, i2] of botTris) {
      p.addTri(
        mat,
        [bot[i0][0], ly, bot[i0][1]],
        [bot[i2][0], ly, bot[i2][1]],
        [bot[i1][0], ly, bot[i1][1]],
        [bot[i0][0] * 0.25, bot[i0][1] * 0.25],
        [bot[i2][0] * 0.25, bot[i2][1] * 0.25],
        [bot[i1][0] * 0.25, bot[i1][1] * 0.25]
      );
    }
  }
  return p;
}

// Extrude a 2D polygon in XY plane along Z from z0 (front) to z1 (back, z1 > z0)
export function extrudePolyZ(mat, polyXY, z0, z1, opts = {}) {
  const p = new Part();
  const lz = Math.min(z0, z1);
  const hz = Math.max(z0, z1);
  let front = polyXY.map((pt) => [pt[0], pt[1]]);
  // Standard CCW in XY has signedArea2D > 0
  if (signedArea2D(front) < 0) {
    front.reverse();
  }
  const back = opts.backPolyXY
    ? (() => {
        const b = opts.backPolyXY.map((pt) => [pt[0], pt[1]]);
        if (signedArea2D(b) < 0) b.reverse();
        return b;
      })()
    : front.map((pt) => [pt[0], pt[1]]);

  const n = front.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const f0 = [front[i][0], front[i][1], lz];
    const f1 = [front[j][0], front[j][1], lz];
    const b1 = [back[j][0], back[j][1], hz];
    const b0 = [back[i][0], back[i][1], hz];
    p.addQuad(mat, f0, f1, b1, b0);
  }

  if (opts.capFront !== false) {
    const tris = triangulate2D(front);
    for (const [i0, i1, i2] of tris) {
      // Front faces -Z, so reverse CCW XY triangle
      p.addTri(
        mat,
        [front[i0][0], front[i0][1], lz],
        [front[i2][0], front[i2][1], lz],
        [front[i1][0], front[i1][1], lz],
        [front[i0][0] * 0.25, front[i0][1] * 0.25],
        [front[i2][0] * 0.25, front[i2][1] * 0.25],
        [front[i1][0] * 0.25, front[i1][1] * 0.25]
      );
    }
  }

  if (opts.capBack !== false) {
    const tris = triangulate2D(back);
    for (const [i0, i1, i2] of tris) {
      // Back faces +Z
      p.addTri(
        mat,
        [back[i0][0], back[i0][1], hz],
        [back[i1][0], back[i1][1], hz],
        [back[i2][0], back[i2][1], hz],
        [back[i0][0] * 0.25, back[i0][1] * 0.25],
        [back[i1][0] * 0.25, back[i1][1] * 0.25],
        [back[i2][0] * 0.25, back[i2][1] * 0.25]
      );
    }
  }
  return p;
}

// Helper returning 8-point chamfered rectangle polygon in XZ
export function chamferRectPoly(w, d, chamfer, cx = 0, cz = 0) {
  const hw = w * 0.5;
  const hd = d * 0.5;
  const c = Math.min(chamfer, hw * 0.9, hd * 0.9);
  // Ordered so signedArea2D < 0
  return [
    [cx + hw, cz - hd + c],
    [cx + hw - c, cz - hd],
    [cx - hw + c, cz - hd],
    [cx - hw, cz - hd + c],
    [cx - hw, cz + hd - c],
    [cx - hw + c, cz + hd],
    [cx + hw - c, cz + hd],
    [cx + hw, cz + hd - c],
  ];
}

// Chamfered armored block from y0 to y1 with optional top inset (sloped glacis sides)
export function chamferBoxY(mat, w, d, y0, y1, chamfer = 0.35, topInset = 0, cx = 0, cz = 0, opts = {}) {
  const bot = chamferRectPoly(w, d, chamfer, cx, cz);
  const tw = Math.max(0.1, w - topInset * 2);
  const td = Math.max(0.1, d - topInset * 2);
  const tc = Math.max(0.02, chamfer * Math.min(tw / w, td / d));
  const topOffsetZ = opts.topOffsetZ ?? 0;
  const topOffsetX = opts.topOffsetX ?? 0;
  const top = chamferRectPoly(tw, td, tc, cx + topOffsetX, cz + topOffsetZ);
  return extrudePolyY(mat, bot, y0, y1, { ...opts, topPolyXZ: top });
}

// Regular N-sided frustum/cylinder along Y
export function frustumY(mat, sides, rBottom, rTop, y0, y1, cx = 0, cz = 0, rotOffset = 0, opts = {}) {
  const bot = [];
  const top = [];
  for (let i = 0; i < sides; i++) {
    const a = rotOffset + (i / sides) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = -Math.sin(a); // signedArea2D < 0
    bot.push([cx + rBottom * ca, cz + rBottom * sa]);
    top.push([cx + rTop * ca, cz + rTop * sa]);
  }
  return extrudePolyY(mat, bot, y0, y1, { ...opts, topPolyXZ: top });
}

// Frustum/cylinder oriented along Z from z0 (front) to z1 (back, z1 > z0)
export function cylinderZ(mat, sides, rFront, rBack, z0, z1, cx = 0, cy = 0, rotOffset = 0, opts = {}) {
  const front = [];
  const back = [];
  for (let i = 0; i < sides; i++) {
    const a = rotOffset + (i / sides) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    front.push([cx + rFront * ca, cy + rFront * sa]);
    back.push([cx + rBack * ca, cy + rBack * sa]);
  }
  return extrudePolyZ(mat, front, z0, z1, { ...opts, backPolyXY: back });
}

// Hollow tube/collar along Z from z0 (front) to z1 (back, z1 > z0)
export function tubeZ(mat, sides, rOuter, rInner, z0, z1, cx = 0, cy = 0, rotOffset = 0) {
  const p = new Part();
  const lz = Math.min(z0, z1);
  const hz = Math.max(z0, z1);
  for (let i = 0; i < sides; i++) {
    const a0 = rotOffset + (i / sides) * Math.PI * 2;
    const a1 = rotOffset + ((i + 1) / sides) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);

    const of0 = [cx + rOuter * c0, cy + rOuter * s0, lz];
    const of1 = [cx + rOuter * c1, cy + rOuter * s1, lz];
    const ob1 = [cx + rOuter * c1, cy + rOuter * s1, hz];
    const ob0 = [cx + rOuter * c0, cy + rOuter * s0, hz];

    const if0 = [cx + rInner * c0, cy + rInner * s0, lz];
    const if1 = [cx + rInner * c1, cy + rInner * s1, lz];
    const ib1 = [cx + rInner * c1, cy + rInner * s1, hz];
    const ib0 = [cx + rInner * c0, cy + rInner * s0, hz];

    // Outer wall
    p.addQuad(mat, of0, of1, ob1, ob0);
    // Inner wall (facing inward)
    p.addQuad(mat, if1, if0, ib0, ib1);
    // Front ring (-Z)
    p.addQuad(mat, of1, of0, if0, if1);
    // Back ring (+Z)
    p.addQuad(mat, ob0, ob1, ib1, ib0);
  }
  return p;
}

// 3D structural strut connecting arbitrary points p0 -> p1
export function strut(mat, p0, p1, thickness = 0.08, sides = 4) {
  const p = new Part();
  const dir = sub3(p1, p0);
  const L = len3(dir);
  if (L < 1e-6) return p;
  const fwd = scale3(dir, 1 / L);
  const ref = Math.abs(fwd[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const right = norm3(cross3(ref, fwd));
  const up = norm3(cross3(fwd, right));
  const r = thickness * 0.5;

  const ring0 = [];
  const ring1 = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    const off = add3(scale3(right, Math.cos(a) * r), scale3(up, Math.sin(a) * r));
    ring0.push(add3(p0, off));
    ring1.push(add3(p1, off));
  }

  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    // Check cross((ring0[j]-ring0[i]), (ring1[j]-ring0[i])) = off_delta x fwd -> points outward!
    p.addQuad(mat, ring0[i], ring0[j], ring1[j], ring1[i]);
  }
  // End caps
  for (let i = 1; i < sides - 1; i++) {
    p.addTri(mat, ring0[0], ring0[i + 1], ring0[i]);
    p.addTri(mat, ring1[0], ring1[i], ring1[i + 1]);
  }
  return p;
}

// Concave parabolic reflector dish centered at origin, facing -Z (concave face looks toward -Z,
// convex backing faces +Z). Supports circular (radiusX === radiusY) or slim elliptical (radiusX > radiusY) dishes!
export function parabolicDish(opts = {}) {
  const {
    radiusX = 1.3,
    radiusY = 1.3,
    depth = 0.42,
    shellThickness = 0.08,
    radialSegs = 16,
    ringSegs = 4,
    frontMat = 'DishReflector',
    backMat = 'ArmorDark',
    rimMat = 'ArmorMid',
    ribMat = 'SteelStructure',
    teamStripeBand = true,
  } = opts;

  const p = new Part();

  // Surface helper: at normalized polar coords (u in [0..1], theta in [0..2PI])
  // At u=0 (center), z = 0 (back of bowl); at u=1 (rim), z = -depth (curves forward toward -Z!)
  function frontPt(u, theta) {
    const x = radiusX * u * Math.cos(theta);
    const y = radiusY * u * Math.sin(theta);
    const z = -depth * u * u;
    return [x, y, z];
  }

  function backPt(u, theta) {
    const x = radiusX * u * Math.cos(theta);
    const y = radiusY * u * Math.sin(theta);
    const z = -depth * u * u + shellThickness * (1.15 - 0.35 * u);
    return [x, y, z];
  }

  for (let r = 0; r < ringSegs; r++) {
    const u0 = r / ringSegs;
    const u1 = (r + 1) / ringSegs;

    for (let s = 0; s < radialSegs; s++) {
      const a0 = (s / radialSegs) * Math.PI * 2;
      const a1 = ((s + 1) / radialSegs) * Math.PI * 2;

      const f00 = frontPt(u0, a0);
      const f10 = frontPt(u1, a0);
      const f11 = frontPt(u1, a1);
      const f01 = frontPt(u0, a1);

      const b00 = backPt(u0, a0);
      const b10 = backPt(u1, a0);
      const b11 = backPt(u1, a1);
      const b01 = backPt(u0, a1);

      // Front concave surface faces -Z:
      // At a0=0 (right +X), a1=dTheta (+X,+Y): (f10 - f00) is +X, (f11 - f00) is (+X,+Y) -> cross is +Z,
      // so reverse order for -Z normal!
      if (r === 0) {
        p.addTri(frontMat, f00, f11, f10, [0.5, 0.5], [u1, 0], [u1, 1]);
      } else {
        p.addQuad(frontMat, f00, f01, f11, f10);
      }

      // Back convex shell faces +Z (with TeamColor dorsal band on upper/outer back sectors)
      const midA = 0.5 * (a0 + a1);
      const isStripe =
        teamStripeBand &&
        r >= ringSegs - 2 &&
        (Math.abs(Math.sin(midA)) > 0.65);
      const bMat = isStripe ? 'TeamColor' : backMat;

      if (r === 0) {
        p.addTri(bMat, b00, b10, b11, [0.5, 0.5], [u1, 0], [u1, 1]);
      } else {
        p.addQuad(bMat, b00, b10, b11, b01);
      }

      // Outer rim bevel at r === ringSegs - 1
      if (r === ringSegs - 1) {
        p.addQuad(rimMat, f10, f11, b11, b10);
      }
    }
  }

  // Add 4 crisp structural ribs on the rear (+Z) of the dish
  const ribAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
  for (const ang of ribAngles) {
    const pStart = add3(backPt(0.18, ang), [0, 0, 0.03]);
    const pMid = add3(backPt(0.58, ang), [0, 0, 0.05]);
    const pEnd = add3(backPt(0.95, ang), [0, 0, 0.02]);
    p.merge(strut(ribMat, pStart, pMid, 0.065, 4));
    p.merge(strut(ribMat, pMid, pEnd, 0.055, 4));
  }

  return p;
}
