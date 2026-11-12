// Procedural Hard-Surface 3D Mesh Builder for Starfall Command — Meridian
// Guarantees outward CCW winding, unit-length normals, zero degenerate triangles,
// and exact mirror symmetry.

import {
  add3,
  cleanZero,
  cross3,
  dot3,
  lerp3,
  mat3DeterminantFromMat4,
  mat4FromTRS,
  mat4TransformNormal,
  mat4TransformPoint,
  norm3,
  quatIdentity,
  scale3,
  sub3,
} from "./math.mjs";

export class MeshPart {
  constructor(name = "Mesh") {
    this.name = name;
    /** @type {Map<string, {positions: number[], normals: number[], indices: number[]}>} */
    this.buckets = new Map();
  }

  _bucket(materialKey) {
    let b = this.buckets.get(materialKey);
    if (!b) {
      b = { positions: [], normals: [], indices: [] };
      this.buckets.set(materialKey, b);
    }
    return b;
  }

  isEmpty() {
    for (const b of this.buckets.values()) {
      if (b.indices.length > 0) return false;
    }
    return true;
  }

  // Emit a single flat-shaded or custom-normal triangle with automatic degeneracy guard.
  addTri(materialKey, p0, p1, p2, n0 = null, n1 = null, n2 = null) {
    const e1 = sub3(p1, p0);
    const e2 = sub3(p2, p0);
    const fnRaw = cross3(e1, e2);
    const area2 = Math.hypot(fnRaw[0], fnRaw[1], fnRaw[2]);
    if (area2 < 1e-8) return; // Skip degenerate triangle cleanly

    const fn = [
      cleanZero(fnRaw[0] / area2),
      cleanZero(fnRaw[1] / area2),
      cleanZero(fnRaw[2] / area2),
    ];

    let vn0 = n0 ? norm3(n0) : fn;
    let vn1 = n1 ? norm3(n1) : fn;
    let vn2 = n2 ? norm3(n2) : fn;

    // Ensure custom vertex normals never oppose the geometric face normal
    if (dot3( add3(add3(vn0, vn1), vn2), fn ) < 0) {
      vn0 = fn;
      vn1 = fn;
      vn2 = fn;
    }

    const b = this._bucket(materialKey);
    const base = b.positions.length / 3;
    b.positions.push(
      cleanZero(p0[0]), cleanZero(p0[1]), cleanZero(p0[2]),
      cleanZero(p1[0]), cleanZero(p1[1]), cleanZero(p1[2]),
      cleanZero(p2[0]), cleanZero(p2[1]), cleanZero(p2[2]),
    );
    b.normals.push(
      vn0[0], vn0[1], vn0[2],
      vn1[0], vn1[1], vn1[2],
      vn2[0], vn2[1], vn2[2],
    );
    b.indices.push(base, base + 1, base + 2);
  }

  // Emit a quad (p0, p1, p2, p3) in CCW order as seen from outside.
  // Uses mirror-aware diagonal selection so symmetric quads triangulate symmetrically.
  addQuad(materialKey, p0, p1, p2, p3, n0 = null, n1 = null, n2 = null, n3 = null) {
    const cx = (p0[0] + p1[0] + p2[0] + p3[0]) * 0.25;
    if (cx >= -1e-9) {
      this.addTri(materialKey, p0, p1, p2, n0, n1, n2);
      this.addTri(materialKey, p0, p2, p3, n0, n2, n3);
    } else {
      this.addTri(materialKey, p0, p1, p3, n0, n1, n3);
      this.addTri(materialKey, p1, p2, p3, n1, n2, n3);
    }
  }

  // Merge another MeshPart transformed by a 4x4 matrix (handles negative determinant / mirroring!)
  mergeTransformed(other, mat4, materialOverride = null) {
    const det = mat3DeterminantFromMat4(mat4);
    const flipWinding = det < 0;

    for (const [matKey, b] of other.buckets.entries()) {
      const targetMat = materialOverride || matKey;
      const tb = this._bucket(targetMat);
      const base = tb.positions.length / 3;
      const vCount = b.positions.length / 3;

      for (let i = 0; i < vCount; i++) {
        const tp = mat4TransformPoint(mat4, [
          b.positions[i * 3],
          b.positions[i * 3 + 1],
          b.positions[i * 3 + 2],
        ]);
        const tn = mat4TransformNormal(mat4, [
          b.normals[i * 3],
          b.normals[i * 3 + 1],
          b.normals[i * 3 + 2],
        ]);
        tb.positions.push(tp[0], tp[1], tp[2]);
        tb.normals.push(tn[0], tn[1], tn[2]);
      }

      for (let i = 0; i < b.indices.length; i += 3) {
        const i0 = base + b.indices[i];
        const i1 = base + b.indices[i + 1];
        const i2 = base + b.indices[i + 2];
        if (flipWinding) {
          tb.indices.push(i0, i2, i1);
        } else {
          tb.indices.push(i0, i1, i2);
        }
      }
    }
    return this;
  }

  mergeTRS(other, t = [0, 0, 0], q = quatIdentity(), s = [1, 1, 1], materialOverride = null) {
    return this.mergeTransformed(other, mat4FromTRS(t, q, s), materialOverride);
  }

  // Produce a mirrored copy across X = 0 (x -> -x) with corrected winding and normals.
  cloneMirroredX(newName = `${this.name}_Mirrored`) {
    const out = new MeshPart(newName);
    const mirrorMat = mat4FromTRS([0, 0, 0], quatIdentity(), [-1, 1, 1]);
    out.mergeTransformed(this, mirrorMat);
    return out;
  }

  // Weld identical (position + normal) vertices per bucket to reduce vertex count while preserving sharp edges.
  optimize() {
    for (const [matKey, b] of this.buckets.entries()) {
      const map = new Map();
      const newPos = [];
      const newNorm = [];
      const newIdx = [];

      const remap = (oldIdx) => {
        const px = cleanZero(Math.fround(b.positions[oldIdx * 3]));
        const py = cleanZero(Math.fround(b.positions[oldIdx * 3 + 1]));
        const pz = cleanZero(Math.fround(b.positions[oldIdx * 3 + 2]));
        const nx = cleanZero(Math.fround(b.normals[oldIdx * 3]));
        const ny = cleanZero(Math.fround(b.normals[oldIdx * 3 + 1]));
        const nz = cleanZero(Math.fround(b.normals[oldIdx * 3 + 2]));
        const key = `${px.toFixed(5)},${py.toFixed(5)},${pz.toFixed(5)}|${nx.toFixed(4)},${ny.toFixed(4)},${nz.toFixed(4)}`;
        let ni = map.get(key);
        if (ni === undefined) {
          ni = newPos.length / 3;
          const un = norm3([nx, ny, nz]);
          newPos.push(px, py, pz);
          newNorm.push(un[0], un[1], un[2]);
          map.set(key, ni);
        }
        return ni;
      };

      for (let i = 0; i < b.indices.length; i += 3) {
        const a = remap(b.indices[i]);
        const c = remap(b.indices[i + 1]);
        const d = remap(b.indices[i + 2]);
        if (a !== c && c !== d && a !== d) {
          newIdx.push(a, c, d);
        }
      }

      this.buckets.set(matKey, {
        positions: newPos,
        normals: newNorm,
        indices: newIdx,
      });
    }
    return this;
  }
}

// ============================================================================
// High-level Procedural Hard-Surface Primitives
// ============================================================================

/**
 * Loft ordered 3D ring cross-sections.
 * Convention: when stepping from sections[s] to sections[s+1] along the loft direction D,
 * each ring's vertices are ordered CCW when looking opposite D (e.g., for lofting from -Z to +Z,
 * rings are CCW in XY when viewed from +Z: [+x, 0] -> [0, +y] -> [-x, 0] -> [0, -y]).
 */
export function addLoft(
  part,
  materialKey,
  sections,
  {
    capStart = true,
    capEnd = true,
    capStartMat = null,
    capEndMat = null,
    panelMaterials = null, // optional map or callback (secIdx, segIdx) => matKey
    smoothRadial = false,
  } = {},
) {
  if (sections.length < 2) return part;
  const ringLen = sections[0].length;

  for (let s = 0; s < sections.length - 1; s++) {
    const rA = sections[s];
    const rB = sections[s + 1];

    let radialNormalsA = null;
    let radialNormalsB = null;
    if (smoothRadial) {
      radialNormalsA = new Array(ringLen).fill(null).map(() => [0, 0, 0]);
      radialNormalsB = new Array(ringLen).fill(null).map(() => [0, 0, 0]);
      for (let i = 0; i < ringLen; i++) {
        const j = (i + 1) % ringLen;
        const fn = norm3(
          add3(
            cross3(sub3(rA[j], rA[i]), sub3(rB[j], rA[i])),
            cross3(sub3(rB[j], rA[i]), sub3(rB[i], rA[i])),
          ),
        );
        radialNormalsA[i] = add3(radialNormalsA[i], fn);
        radialNormalsA[j] = add3(radialNormalsA[j], fn);
        radialNormalsB[i] = add3(radialNormalsB[i], fn);
        radialNormalsB[j] = add3(radialNormalsB[j], fn);
      }
      radialNormalsA = radialNormalsA.map(norm3);
      radialNormalsB = radialNormalsB.map(norm3);
    }

    for (let i = 0; i < ringLen; i++) {
      const j = (i + 1) % ringLen;
      const mat = panelMaterials ? panelMaterials(s, i) || materialKey : materialKey;
      if (smoothRadial) {
        part.addQuad(
          mat,
          rA[i], rA[j], rB[j], rB[i],
          radialNormalsA[i], radialNormalsA[j], radialNormalsB[j], radialNormalsB[i],
        );
      } else {
        part.addQuad(mat, rA[i], rA[j], rB[j], rB[i]);
      }
    }
  }

  if (capStart) {
    addRingCap(part, capStartMat || materialKey, sections[0], true);
  }
  if (capEnd) {
    addRingCap(part, capEndMat || materialKey, sections[sections.length - 1], false);
  }
  return part;
}

export function addRingCap(part, materialKey, ring, reverseWinding = false) {
  const n = ring.length;
  if (n < 3) return;
  for (let i = 1; i < n - 1; i++) {
    const j = i + 1;
    if (reverseWinding) {
      part.addTri(materialKey, ring[0], ring[j], ring[i]);
    } else {
      part.addTri(materialKey, ring[0], ring[i], ring[j]);
    }
  }
}

// Helper: generate an N-sided symmetric octagonal/polygonal cross-section in XY at a given Z.
// Returns 8 points ordered CCW in XY: right-bottom -> right-top -> top-right -> top-left -> left-top -> left-bottom -> bottom-left -> bottom-right.
export function octProfileZ(z, {
  halfW,
  yBot,
  yTop,
  yMid = null,
  topHalfW = null,
  botHalfW = null,
  sideInset = 0.0,
}) {
  const ym = yMid !== null ? yMid : (yBot + yTop) * 0.5;
  const tw = topHalfW !== null ? topHalfW : halfW * 0.62;
  const bw = botHalfW !== null ? botHalfW : halfW * 0.68;
  const sw = halfW;
  const yUpper = ym + (yTop - ym) * (1 - sideInset * 0.35);
  const yLower = ym - (ym - yBot) * (1 - sideInset * 0.35);
  return [
    [sw, yLower, z],
    [sw * (1 - sideInset), yUpper, z],
    [tw, yTop, z],
    [-tw, yTop, z],
    [-sw * (1 - sideInset), yUpper, z],
    [-sw, yLower, z],
    [-bw, yBot, z],
    [bw, yBot, z],
  ];
}

// Chamfered / beveled hard-surface box centered at `center` with full extents `size = [wx, hy, dz]`
export function addBeveledBox(
  part,
  materialKey,
  center,
  size,
  { bevel = 0.03, topMat = null, botMat = null } = {},
) {
  const [cx, cy, cz] = center;
  const hx = size[0] * 0.5;
  const hy = size[1] * 0.5;
  const hz = size[2] * 0.5;
  const b = Math.min(bevel, hx * 0.45, hy * 0.45, hz * 0.45);

  if (b <= 0.016) {
    // Clean 12-triangle hard-surface prism for trim bars, louvers, skids, and rails
    const s0 = [
      [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy + hy, cz - hz],
      [cx - hx, cy + hy, cz - hz],
      [cx - hx, cy - hy, cz - hz],
    ];
    const s1 = [
      [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy + hy, cz + hz],
      [cx - hx, cy + hy, cz + hz],
      [cx - hx, cy - hy, cz + hz],
    ];
    return addLoft(part, materialKey, [s0, s1], {
      panelMaterials: (_, seg) => {
        if (seg === 1 && topMat) return topMat;
        if (seg === 3 && botMat) return botMat;
        return materialKey;
      },
    });
  }

  const mkRing = (z, shrink) => {
    const xOut = Math.max(1e-4, hx - shrink);
    const yOut = Math.max(1e-4, hy - shrink);
    const cb = Math.min(b, xOut * 0.45, yOut * 0.45);
    return [
      [cx + xOut, cy - yOut + cb, z],
      [cx + xOut, cy + yOut - cb, z],
      [cx + xOut - cb, cy + yOut, z],
      [cx - xOut + cb, cy + yOut, z],
      [cx - xOut, cy + yOut - cb, z],
      [cx - xOut, cy - yOut + cb, z],
      [cx - xOut + cb, cy - yOut, z],
      [cx + xOut - cb, cy - yOut, z],
    ];
  };

  // Medium blocks use 28-tri chamfered profile; large hero blocks (>0.04 bevel) use full 3-axis bevel
  const sections =
    b >= 0.04
      ? [
          mkRing(cz - hz, b),
          mkRing(cz - hz + b, 0),
          mkRing(cz + hz - b, 0),
          mkRing(cz + hz, b),
        ]
      : [mkRing(cz - hz, 0), mkRing(cz + hz, 0)];

  return addLoft(part, materialKey, sections, {
    panelMaterials: (_, seg) => {
      if (seg === 2 && topMat) return topMat;
      if (seg === 6 && botMat) return botMat;
      return materialKey;
    },
  });
}

/**
 * Extrude a 2D polygon in the XZ plane vertically along Y from yBot to yTop, with optional top/bottom bevel!
 * Polygon vertices `polyXZ = [[x, z], ...]` can be either CW or CCW; winding is auto-normalized!
 */
export function addExtrudedPolygonY(
  part,
  materialKey,
  polyXZ,
  yBot,
  yTop,
  {
    bevelTop = 0.0,
    bevelBot = 0.0,
    insetTop = 0.0,
    insetBot = 0.0,
    topMat = null,
    botMat = null,
    capBot = true,
    capTop = true,
  } = {},
) {
  // Signed area in XZ to enforce consistent loop orientation around +Y:
  // When lofting from yBot to yTop (+Y), cross(rA[j]-rA[i], rB[j]-rA[i]) points outward
  // when (z_j - z_i) gives +X for +Z step: let's check!
  // Suppose rA[0]=[1, y0, 0], rA[1]=[0, y0, -1]:
  // e1 = rA[1]-rA[0] = [-1, 0, -1], e2 = [0, +dy, 0] -> cross(e1, e2) = [+dy, 0, -dy] -> OUTWARD!
  // Let's check signed shoelace sum sum(x_i * z_{i+1} - z_i * x_{i+1}) for (1,0)->(0,-1)->(-1,0)->(0,1):
  // (1*(-1) - 0) + (0 - (-1)*(-1)) + ... = -1 - 1 - 1 - 1 = -4 < 0.
  let area2 = 0;
  for (let i = 0; i < polyXZ.length; i++) {
    const [x0, z0] = polyXZ[i];
    const [x1, z1] = polyXZ[(i + 1) % polyXZ.length];
    area2 += x0 * z1 - z0 * x1;
  }
  const pts = area2 < 0 ? polyXZ.slice() : polyXZ.slice().reverse();

  // Compute centroid for clean inset scaling on beveled caps
  let cx = 0, cz = 0;
  for (const [x, z] of pts) {
    cx += x;
    cz += z;
  }
  cx /= pts.length;
  cz /= pts.length;

  const makeRing = (y, insetAmount) => {
    if (Math.abs(insetAmount) < 1e-6) {
      return pts.map(([x, z]) => [x, y, z]);
    }
    return pts.map(([x, z]) => {
      const dx = x - cx;
      const dz = z - cz;
      const len = Math.hypot(dx, dz) || 1;
      const scale = Math.max(0.15, (len - insetAmount) / len);
      return [cx + dx * scale, y, cz + dz * scale];
    });
  };

  const sections = [];
  if (bevelBot > 1e-5) {
    sections.push(makeRing(yBot, insetBot > 0 ? insetBot : bevelBot));
    sections.push(makeRing(yBot + bevelBot, 0));
  } else {
    sections.push(makeRing(yBot, insetBot));
  }

  if (bevelTop > 1e-5) {
    sections.push(makeRing(yTop - bevelTop, 0));
    sections.push(makeRing(yTop, insetTop > 0 ? insetTop : bevelTop));
  } else {
    sections.push(makeRing(yTop, insetTop));
  }

  return addLoft(part, materialKey, sections, {
    capStart: capBot,
    capEnd: capTop,
    capStartMat: botMat || materialKey,
    capEndMat: topMat || materialKey,
  });
}

/**
 * Cylinder / cone frustum along arbitrary axis from `pStart` to `pEnd`.
 */
export function addFrustum(
  part,
  materialKey,
  pStart,
  pEnd,
  rStart,
  rEnd,
  segments = 12,
  {
    capStart = true,
    capEnd = true,
    capStartMat = null,
    capEndMat = null,
    smooth = false,
    twistRad = 0,
  } = {},
) {
  const axis = sub3(pEnd, pStart);
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (len < 1e-6) return part;
  const fwd = scale3(axis, 1 / len);

  // Deterministic orthonormal basis (u, v, fwd) with u x v = fwd
  const upRef = Math.abs(fwd[1]) < 0.92 ? [0, 1, 0] : [0, 0, 1];
  const u = norm3(cross3(upRef, fwd));
  const v = norm3(cross3(fwd, u)); // check: u x v = u x (fwd x u) = fwd!

  const makeRing = (center, r, angleOffset) => {
    const ring = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2 + angleOffset;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      ring.push([
        center[0] + (u[0] * ca + v[0] * sa) * r,
        center[1] + (u[1] * ca + v[1] * sa) * r,
        center[2] + (u[2] * ca + v[2] * sa) * r,
      ]);
    }
    return ring;
  };

  const s0 = makeRing(pStart, rStart, twistRad);
  const s1 = makeRing(pEnd, rEnd, twistRad);
  return addLoft(part, materialKey, [s0, s1], {
    capStart: capStart && rStart > 1e-5,
    capEnd: capEnd && rEnd > 1e-5,
    capStartMat,
    capEndMat,
    smoothRadial: smooth,
  });
}

/**
 * Hollow cylindrical tube / nozzle / barrel shroud from `pStart` to `pEnd` with outer & inner walls!
 */
export function addHollowTube(
  part,
  outerMat,
  innerMat,
  rimMat,
  pStart,
  pEnd,
  rOuterStart,
  rOuterEnd,
  rInnerStart,
  rInnerEnd,
  segments = 12,
  { smooth = false, angleOffset = 0, recessedCoreMat = null, coreDepthFrac = 0.65 } = {},
) {
  const axis = sub3(pEnd, pStart);
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (len < 1e-6) return part;
  const fwd = scale3(axis, 1 / len);
  const upRef = Math.abs(fwd[1]) < 0.92 ? [0, 1, 0] : [0, 0, 1];
  const u = norm3(cross3(upRef, fwd));
  const v = norm3(cross3(fwd, u));

  const ringAt = (center, r) => {
    const out = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2 + angleOffset;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      out.push([
        center[0] + (u[0] * ca + v[0] * sa) * r,
        center[1] + (u[1] * ca + v[1] * sa) * r,
        center[2] + (u[2] * ca + v[2] * sa) * r,
      ]);
    }
    return out;
  };

  const pCore = lerp3(pStart, pEnd, 1 - coreDepthFrac);
  const rInnerCore = rInnerStart + (rInnerEnd - rInnerStart) * (1 - coreDepthFrac);

  const out0 = ringAt(pStart, rOuterStart);
  const out1 = ringAt(pEnd, rOuterEnd);
  const in1 = ringAt(pEnd, rInnerEnd);
  const inCore = ringAt(pCore, rInnerCore);

  // Outer wall (pStart -> pEnd) + back cap at pStart
  addLoft(part, outerMat, [out0, out1], {
    capStart: true,
    capEnd: false,
    smoothRadial: smooth,
  });

  // Front annulus rim at pEnd (out1 -> in1)
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    part.addQuad(rimMat, out1[i], out1[j], in1[j], in1[i]);
  }

  // Inner bore wall (in1 -> inCore): stepping from pEnd toward pStart, so reverse ring order or loft in1 -> inCore with inward normals!
  // Check: from in1 (at pEnd) to inCore (toward pStart, direction -fwd):
  // For inward normals (pointing toward center), cross((in1[j]-in1[i]), (inCore[j]-in1[i])):
  // tangent1 is +theta, tangent2 is -fwd -> (+theta) x (-fwd) = -radial = INWARD!
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    part.addQuad(innerMat, in1[i], in1[j], inCore[j], inCore[i]);
  }

  // Inner recessed bulkhead / glowing core disc facing +fwd
  addRingCap(part, recessedCoreMat || innerMat, inCore, false);
  return part;
}

/**
 * Torus (full or partial arc) in the XZ plane (revolved around Y axis) centered at `center`.
 */
export function addTorusY(
  part,
  materialKey,
  center,
  majorR,
  minorR,
  radialSegs = 24,
  tubularSegs = 12,
  {
    arcStart = 0,
    arcSweep = Math.PI * 2,
    smooth = true,
    capEnds = false,
    scaleY = 1.0,
  } = {},
) {
  const isClosed = Math.abs(arcSweep - Math.PI * 2) < 1e-5;
  const ringCount = isClosed ? radialSegs : radialSegs + 1;

  const rings = [];
  const ringNormals = [];

  for (let i = 0; i < ringCount; i++) {
    const t = isClosed ? i / radialSegs : i / radialSegs;
    const phi = arcStart + t * arcSweep;
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);

    // Center of tube at angle phi: [majorR * cp, 0, majorR * sp]
    // Note: as phi increases (0 -> pi/2: +X -> +Z), tangent D = [-sp, 0, cp].
    // Radial out R = [cp, 0, sp], Up = [0, 1, 0].
    // Check R x Up = [cp, 0, sp] x [0, 1, 0] = [-sp, 0, cp] = +D!
    // Wait: in addLoft, stepping along +D requires ring vertices CCW when looking toward -D:
    // basis (u, v) with u x v = +D -> u = R, v = Up -> u x v = +D!
    const ring = [];
    const norms = [];
    for (let j = 0; j < tubularSegs; j++) {
      const theta = (j / tubularSegs) * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);

      const r = majorR + minorR * ct;
      const px = center[0] + r * cp;
      const py = center[1] + minorR * st * scaleY;
      const pz = center[2] + r * sp;
      ring.push([px, py, pz]);

      const nx = ct * cp;
      const ny = st / scaleY;
      const nz = ct * sp;
      norms.push(norm3([nx, ny, nz]));
    }
    rings.push(ring);
    ringNormals.push(norms);
  }

  const loopCount = isClosed ? radialSegs : radialSegs;
  for (let i = 0; i < loopCount; i++) {
    const ni = isClosed ? (i + 1) % radialSegs : i + 1;
    for (let j = 0; j < tubularSegs; j++) {
      const nj = (j + 1) % tubularSegs;
      if (smooth) {
        part.addQuad(
          materialKey,
          rings[i][j], rings[i][nj], rings[ni][nj], rings[ni][j],
          ringNormals[i][j], ringNormals[i][nj], ringNormals[ni][nj], ringNormals[ni][j],
        );
      } else {
        part.addQuad(materialKey, rings[i][j], rings[i][nj], rings[ni][nj], rings[ni][j]);
      }
    }
  }

  if (!isClosed && capEnds) {
    addRingCap(part, materialKey, rings[0], true);
    addRingCap(part, materialKey, rings[rings.length - 1], false);
  }
  return part;
}
