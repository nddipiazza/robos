// Procedural hard-surface & curved-loft geometry builders for Aurelian Concord assets
import {
  TAU, add3, sub3, scale3, lerp3, dot3, cross3, len3, norm3,
  rotX3, rotY3, rotZ3, mat4TransformPoint, cleanFloat,
} from './math.mjs';

export class PartBuilder {
  constructor(name = 'mesh') {
    this.name = name;
    // Map<materialIndex, Array<{ p: [[x,y,z]*3], uv: [[u,v]*3], group: number }>>
    this.byMat = new Map();
    this._smoothGroupCounter = 1;
  }

  nextSmoothGroup() {
    return this._smoothGroupCounter++;
  }

  addTri(mat, p0, p1, p2, uv0 = [0, 0], uv1 = [1, 0], uv2 = [0.5, 1], smoothGroup = 0) {
    const e1 = sub3(p1, p0);
    const e2 = sub3(p2, p0);
    const n = cross3(e1, e2);
    if (len3(n) < 1e-10) return; // skip degenerate triangles
    let list = this.byMat.get(mat);
    if (!list) {
      list = [];
      this.byMat.set(mat, list);
    }
    list.push({
      p: [[...p0], [...p1], [...p2]],
      uv: [[...uv0], [...uv1], [...uv2]],
      group: smoothGroup,
    });
  }

  // Quad with CCW vertices (p0, p1, p2, p3) viewed from outside
  addQuad(mat, p0, p1, p2, p3, uvRect = [0, 0, 1, 1], smoothGroup = 0) {
    const [u0, v0, u1, v1] = uvRect;
    this.addTri(mat, p0, p1, p2, [u0, v0], [u1, v0], [u1, v1], smoothGroup);
    this.addTri(mat, p0, p2, p3, [u0, v0], [u1, v1], [u0, v1], smoothGroup);
  }

  merge(other, transformFn = null, flipWinding = false) {
    const groupOffset = this._smoothGroupCounter;
    this._smoothGroupCounter += other._smoothGroupCounter + 1;
    for (const [mat, tris] of other.byMat.entries()) {
      for (const t of tris) {
        const p0 = transformFn ? transformFn(t.p[0]) : t.p[0];
        const p1 = transformFn ? transformFn(t.p[1]) : t.p[1];
        const p2 = transformFn ? transformFn(t.p[2]) : t.p[2];
        const grp = t.group === 0 ? 0 : t.group + groupOffset;
        if (flipWinding) {
          this.addTri(mat, p0, p2, p1, t.uv[0], t.uv[2], t.uv[1], grp);
        } else {
          this.addTri(mat, p0, p1, p2, t.uv[0], t.uv[1], t.uv[2], grp);
        }
      }
    }
    return this;
  }

  mirrorX(other) {
    return this.merge(other, (p) => [-p[0], p[1], p[2]], true);
  }

  rotateY(other, angle) {
    return this.merge(other, (p) => rotY3(p, angle), false);
  }

  translate(dx, dy, dz) {
    for (const tris of this.byMat.values()) {
      for (const t of tris) {
        for (let k = 0; k < 3; k++) {
          t.p[k][0] += dx;
          t.p[k][1] += dy;
          t.p[k][2] += dz;
        }
      }
    }
    return this;
  }

  transformMatrix(m) {
    // Check 3x3 determinant to preserve outward winding
    const det =
      m[0] * (m[5] * m[10] - m[6] * m[9]) -
      m[4] * (m[1] * m[10] - m[2] * m[9]) +
      m[8] * (m[1] * m[6] - m[2] * m[5]);
    const flip = det < 0;
    for (const tris of this.byMat.values()) {
      for (const t of tris) {
        t.p[0] = mat4TransformPoint(m, t.p[0]);
        t.p[1] = mat4TransformPoint(m, t.p[1]);
        t.p[2] = mat4TransformPoint(m, t.p[2]);
        if (flip) {
          const tmpP = t.p[1]; t.p[1] = t.p[2]; t.p[2] = tmpP;
          const tmpUV = t.uv[1]; t.uv[1] = t.uv[2]; t.uv[2] = tmpUV;
        }
      }
    }
    return this;
  }

  triangleCount() {
    let total = 0;
    for (const tris of this.byMat.values()) total += tris.length;
    return total;
  }

  // Compile into deterministic glTF primitives with crease-angle normal smoothing
  buildPrimitives(creaseAngleDeg = 34) {
    const cosCrease = Math.cos((creaseAngleDeg * Math.PI) / 180);
    const sortedMats = [...this.byMat.keys()].sort((a, b) => a - b);
    const primitives = [];

    for (const mat of sortedMats) {
      const tris = this.byMat.get(mat);
      if (!tris || tris.length === 0) continue;

      const faceNormals = tris.map((t) => norm3(cross3(sub3(t.p[1], t.p[0]), sub3(t.p[2], t.p[0]))));

      // Spatial bucket by quantized position for crease-angle normal averaging within matching smoothGroup
      const posMap = new Map();
      const keyOf = (p, grp) =>
        `${grp}:${Math.round(p[0] * 10000)},${Math.round(p[1] * 10000)},${Math.round(p[2] * 10000)}`;

      for (let ti = 0; ti < tris.length; ti++) {
        const grp = tris[ti].group;
        if (grp === 0) continue;
        for (let k = 0; k < 3; k++) {
          const key = keyOf(tris[ti].p[k], grp);
          let arr = posMap.get(key);
          if (!arr) {
            arr = [];
            posMap.set(key, arr);
          }
          arr.push(ti);
        }
      }

      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];
      const vertDedup = new Map();

      for (let ti = 0; ti < tris.length; ti++) {
        const t = tris[ti];
        const fn = faceNormals[ti];

        for (let k = 0; k < 3; k++) {
          const p = t.p[k];
          const uv = t.uv[k];
          let vn = fn;

          if (t.group !== 0) {
            const neighbors = posMap.get(keyOf(p, t.group));
            if (neighbors && neighbors.length > 1) {
              let sx = 0, sy = 0, sz = 0;
              for (const nti of neighbors) {
                const nfn = faceNormals[nti];
                if (dot3(fn, nfn) >= cosCrease) {
                  sx += nfn[0];
                  sy += nfn[1];
                  sz += nfn[2];
                }
              }
              vn = norm3([sx, sy, sz]);
            }
          }

          const px = cleanFloat(Math.fround(p[0]));
          const py = cleanFloat(Math.fround(p[1]));
          const pz = cleanFloat(Math.fround(p[2]));
          const nx = cleanFloat(Math.fround(vn[0]));
          const ny = cleanFloat(Math.fround(vn[1]));
          const nz = cleanFloat(Math.fround(vn[2]));
          // Re-normalize in Float32 so glTF validator sees exact unit normals
          const nl = Math.hypot(nx, ny, nz) || 1;
          const fnx = cleanFloat(Math.fround(nx / nl));
          const fny = cleanFloat(Math.fround(ny / nl));
          const fnz = cleanFloat(Math.fround(nz / nl));
          const u = cleanFloat(Math.fround(uv[0]));
          const v = cleanFloat(Math.fround(uv[1]));

          const vKey = `${px},${py},${pz}|${fnx},${fny},${fnz}|${u},${v}`;
          let idx = vertDedup.get(vKey);
          if (idx === undefined) {
            idx = positions.length / 3;
            vertDedup.set(vKey, idx);
            positions.push(px, py, pz);
            normals.push(fnx, fny, fnz);
            uvs.push(u, v);
          }
          indices.push(idx);
        }
      }

      // Filter any triangle collapsed by Float32 rounding
      const cleanIndices = [];
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        if (a === b || b === c || a === c) continue;
        cleanIndices.push(a, b, c);
      }

      if (cleanIndices.length > 0) {
        primitives.push({
          material: mat,
          positions: new Float32Array(positions),
          normals: new Float32Array(normals),
          uvs: new Float32Array(uvs),
          indices: positions.length / 3 > 65535
            ? new Uint32Array(cleanIndices)
            : new Uint16Array(cleanIndices),
        });
      }
    }

    return primitives;
  }
}

// Ensure 2D polygon [x, z] is oriented so top cap (+Y) is CCW when viewed from +Y
export function ensureCCW_XZ(polyXZ) {
  let area2 = 0;
  for (let i = 0; i < polyXZ.length; i++) {
    const a = polyXZ[i];
    const b = polyXZ[(i + 1) % polyXZ.length];
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  // In (X, Z) with +Y up, cross([dx1,0,dz1], [dx2,0,dz2]).y < 0 when standard 2D area2 > 0
  // Wait: earlier check: p0=[1,1], p1=[1,-1], p2=[-1,-1], p3=[-1,1] gave +Y normal and area2 = -8 < 0!
  return area2 < 0 ? polyXZ.map((p) => [...p]) : [...polyXZ].reverse().map((p) => [...p]);
}

// Ensure 2D profile [rx, uy] is standard CCW in (R, U) plane (area2 > 0)
export function ensureCCW_RU(profileRU) {
  let area2 = 0;
  for (let i = 0; i < profileRU.length; i++) {
    const a = profileRU[i];
    const b = profileRU[(i + 1) % profileRU.length];
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  return area2 > 0 ? profileRU.map((p) => [...p]) : [...profileRU].reverse().map((p) => [...p]);
}

function insetPolyXZ(poly, inset) {
  if (Math.abs(inset) < 1e-6) return poly.map((p) => [...p]);
  const n = poly.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const curr = poly[i];
    const next = poly[(i + 1) % n];
    const e1 = norm3([curr[0] - prev[0], 0, curr[1] - prev[1]]);
    const e2 = norm3([next[0] - curr[0], 0, next[1] - curr[1]]);
    // For area2 < 0 loop (p0=[1,1]->p1=[1,-1] has e=[0,0,-1], inward is [-1,0,0] = [e.z, 0, -e.x])
    const in1 = [e1[2], -e1[0]];
    const in2 = [e2[2], -e2[0]];
    let bx = in1[0] + in2[0];
    let bz = in1[1] + in2[1];
    const bl = Math.hypot(bx, bz);
    if (bl < 1e-6) {
      out.push([curr[0] + in1[0] * inset, curr[1] + in1[1] * inset]);
    } else {
      bx /= bl; bz /= bl;
      const cosHalf = Math.max(0.45, bx * in1[0] + bz * in1[1]);
      const d = inset / cosHalf;
      out.push([curr[0] + bx * d, curr[1] + bz * d]);
    }
  }
  return out;
}

function fanCapXZ(part, mat, ring3D, reverse = false, uvScale = 0.25) {
  let cx = 0, cy = 0, cz = 0;
  for (const p of ring3D) {
    cx += p[0]; cy += p[1]; cz += p[2];
  }
  const c = [cx / ring3D.length, cy / ring3D.length, cz / ring3D.length];
  const cu = [0.5 + c[0] * uvScale, 0.5 + c[2] * uvScale];
  for (let i = 0; i < ring3D.length; i++) {
    const a = ring3D[i];
    const b = ring3D[(i + 1) % ring3D.length];
    const uva = [0.5 + a[0] * uvScale, 0.5 + a[2] * uvScale];
    const uvb = [0.5 + b[0] * uvScale, 0.5 + b[2] * uvScale];
    if (reverse) {
      part.addTri(mat, c, b, a, cu, uvb, uva, 0);
    } else {
      part.addTri(mat, c, a, b, cu, uva, uvb, 0);
    }
  }
}

/**
 * Extrude a 2D [x, z] polygon from yBottom to yTop with beveled top & bottom chamfers.
 * Supports distinct materials for main body, bevel trim, and top inset cap!
 */
export function addBeveledPolygon(part, polyInput, opts = {}) {
  const {
    yBottom = 0,
    yTop = 1,
    bevelTop = 0.08,
    bevelBottom = 0.04,
    matSide = 0,
    matBevel = matSide,
    matTop = matSide,
    matBottom = matSide,
    capBottom = true,
    capTop = true,
    smoothSides = false,
  } = opts;

  const basePoly = ensureCCW_XZ(polyInput);
  const h = yTop - yBottom;
  const bt = Math.min(bevelTop, h * 0.45);
  const bb = Math.min(bevelBottom, h * 0.45);

  const rings = [];
  if (bb > 1e-5) {
    rings.push({ poly: insetPolyXZ(basePoly, bb), y: yBottom, matNext: matBevel });
    rings.push({ poly: basePoly, y: yBottom + bb, matNext: matSide });
  } else {
    rings.push({ poly: basePoly, y: yBottom, matNext: matSide });
  }

  if (bt > 1e-5) {
    rings.push({ poly: basePoly, y: yTop - bt, matNext: matBevel });
    rings.push({ poly: insetPolyXZ(basePoly, bt), y: yTop, matNext: matTop });
  } else {
    rings.push({ poly: basePoly, y: yTop, matNext: matTop });
  }

  const grp = smoothSides ? part.nextSmoothGroup() : 0;
  const n = basePoly.length;

  for (let r = 0; r < rings.length - 1; r++) {
    const r0 = rings[r];
    const r1 = rings[r + 1];
    const mat = r0.matNext;
    for (let i = 0; i < n; i++) {
      const inext = (i + 1) % n;
      const p00 = [r0.poly[i][0], r0.y, r0.poly[i][1]];
      const p10 = [r0.poly[inext][0], r0.y, r0.poly[inext][1]];
      const p11 = [r1.poly[inext][0], r1.y, r1.poly[inext][1]];
      const p01 = [r1.poly[i][0], r1.y, r1.poly[i][1]];
      // Check outward: p00->p10 goes along edge (+Y CCW), p00->p01 goes +Y:
      // Wait: for p0=[1,1], p1=[1,-1]: p10-p00=[0,0,-2], p01-p00=[0,+h,0]
      // cross([0,0,-2], [0,h,0]) = [+2h, 0, 0] (+X outward!). So (p00, p10, p11, p01) is exact!
      part.addQuad(mat, p00, p10, p11, p01, [i / n, r / rings.length, (i + 1) / n, (r + 1) / rings.length], grp);
    }
  }

  if (capTop) {
    const topRing = rings[rings.length - 1].poly.map((p) => [p[0], yTop, p[1]]);
    fanCapXZ(part, matTop, topRing, false);
  }
  if (capBottom) {
    const botRing = rings[0].poly.map((p) => [p[0], yBottom, p[1]]);
    fanCapXZ(part, matBottom, botRing, true);
  }
}

/**
 * Sweep a 2D profile (in [right, up] plane) along a 3D spine of stations:
 * stations: Array<{ pos: [x,y,z], up?: [x,y,z], tangent?: [x,y,z], sx?: number, sy?: number, roll?: number }>
 * edgeMaterials?: optional array of material index per profile edge j
 */
export function addSweepLoft(part, stations, profileInput, opts = {}) {
  const {
    matBody = 0,
    edgeMaterials = null,
    matCapStart = matBody,
    matCapEnd = matBody,
    capStart = true,
    capEnd = true,
    closedLoop = false,
    smooth = true,
  } = opts;

  const profile = ensureCCW_RU(profileInput);
  const m = profile.length;
  const sCount = stations.length;
  const grp = smooth ? part.nextSmoothGroup() : 0;

  const worldRings = [];
  for (let i = 0; i < sCount; i++) {
    const st = stations[i];
    let tang = st.tangent;
    if (!tang) {
      if (closedLoop) {
        const prev = stations[(i - 1 + sCount) % sCount].pos;
        const next = stations[(i + 1) % sCount].pos;
        tang = norm3(sub3(next, prev));
      } else if (i === 0) {
        tang = norm3(sub3(stations[1].pos, st.pos));
      } else if (i === sCount - 1) {
        tang = norm3(sub3(st.pos, stations[i - 1].pos));
      } else {
        tang = norm3(sub3(stations[i + 1].pos, stations[i - 1].pos));
      }
    } else {
      tang = norm3(tang);
    }

    let upHint = st.up ? norm3(st.up) : [0, 1, 0];
    if (Math.abs(dot3(tang, upHint)) > 0.96) {
      upHint = [0, 0, 1];
      if (Math.abs(dot3(tang, upHint)) > 0.96) upHint = [1, 0, 0];
    }

    let right = norm3(cross3(tang, upHint));
    let up = norm3(cross3(right, tang));

    if (st.roll) {
      const c = Math.cos(st.roll);
      const s = Math.sin(st.roll);
      const r2 = add3(scale3(right, c), scale3(up, s));
      const u2 = add3(scale3(right, -s), scale3(up, c));
      right = r2;
      up = u2;
    }

    const sx = st.sx ?? 1;
    const sy = st.sy ?? 1;

    const ring = profile.map(([rx, uy]) =>
      add3(st.pos, add3(scale3(right, rx * sx), scale3(up, uy * sy)))
    );
    worldRings.push(ring);
  }

  const segLimit = closedLoop ? sCount : sCount - 1;
  for (let i = 0; i < segLimit; i++) {
    const nextI = (i + 1) % sCount;
    const r0 = worldRings[i];
    const r1 = worldRings[nextI];
    const v0 = i / segLimit;
    const v1 = (i + 1) / segLimit;

    for (let j = 0; j < m; j++) {
      const nextJ = (j + 1) % m;
      const mat = edgeMaterials ? edgeMaterials[j % edgeMaterials.length] : matBody;
      const edgeGrp = edgeMaterials ? grp + j * 1000 : grp;
      const a0 = r0[j];
      const a1 = r0[nextJ];
      const b0 = r1[j];
      const b1 = r1[nextJ];
      // Verified outward normal: cross(b0 - a0, a1 - a0) points strictly outward!
      part.addQuad(mat, a0, b0, b1, a1, [j / m, v0, (j + 1) / m, v1], edgeGrp);
    }
  }

  if (!closedLoop && capStart) {
    const r0 = worldRings[0];
    const sx = stations[0].sx ?? 1;
    const sy = stations[0].sy ?? 1;
    if (sx > 1e-4 && sy > 1e-4) {
      let cx = 0, cy = 0, cz = 0;
      for (const p of r0) { cx += p[0]; cy += p[1]; cz += p[2]; }
      const c = [cx / m, cy / m, cz / m];
      for (let j = 0; j < m; j++) {
        part.addTri(matCapStart, c, r0[j], r0[(j + 1) % m], [0.5, 0.5], [0, 0], [1, 0], 0);
      }
    }
  }

  if (!closedLoop && capEnd) {
    const rLast = worldRings[sCount - 1];
    const sx = stations[sCount - 1].sx ?? 1;
    const sy = stations[sCount - 1].sy ?? 1;
    if (sx > 1e-4 && sy > 1e-4) {
      let cx = 0, cy = 0, cz = 0;
      for (const p of rLast) { cx += p[0]; cy += p[1]; cz += p[2]; }
      const c = [cx / m, cy / m, cz / m];
      for (let j = 0; j < m; j++) {
        part.addTri(matCapEnd, c, rLast[(j + 1) % m], rLast[j], [0.5, 0.5], [1, 0], [0, 0], 0);
      }
    }
  }
}

// Common reusable 2D cross-section profiles in (R, U) plane
export function profileChamferRect(halfW, halfH, chamfer = 0.04) {
  const c = Math.min(chamfer, halfW * 0.45, halfH * 0.45);
  return [
    [halfW, -halfH + c],
    [halfW, halfH - c],
    [halfW - c, halfH],
    [-halfW + c, halfH],
    [-halfW, halfH - c],
    [-halfW, -halfH + c],
    [-halfW + c, -halfH],
    [halfW - c, -halfH],
  ];
}

// Wing / spire blade cross-section with top ridge & bottom keel (8 edges)
export function profileBlade(halfW, topH, botH) {
  return [
    [halfW, 0],
    [halfW * 0.52, topH * 0.72],
    [0, topH],
    [-halfW * 0.52, topH * 0.72],
    [-halfW, 0],
    [-halfW * 0.52, -botH * 0.72],
    [0, -botH],
    [halfW * 0.52, -botH * 0.72],
  ];
}

// Regular polygon in XZ plane
export function regularPolygonXZ(sides, radiusX, radiusZ = radiusX, phaseRad = 0, centerX = 0, centerZ = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = phaseRad - (i / sides) * TAU; // negative angle so +Y normal is CCW in XZ
    pts.push([centerX + Math.cos(a) * radiusX, centerZ + Math.sin(a) * radiusZ]);
  }
  return pts;
}

// Faceted jewel / bipyramid crystal with equatorial girdle band
export function addFacetedCrystal(part, opts = {}) {
  const {
    center = [0, 0, 0],
    sides = 6,
    radiusX = 0.4,
    radiusZ = 0.4,
    upperH = 0.65,
    lowerH = 0.65,
    girdleH = 0.08,
    phase = 0,
    matCrystal = 5,
    matGirdle = 1,
  } = opts;

  const [cx, cy, cz] = center;
  const topApex = [cx, cy + upperH, cz];
  const botApex = [cx, cy - lowerH, cz];
  const gHalf = girdleH * 0.5;

  const upperRing = [];
  const lowerRing = [];
  for (let i = 0; i < sides; i++) {
    const a = phase - (i / sides) * TAU;
    const x = cx + Math.cos(a) * radiusX;
    const z = cz + Math.sin(a) * radiusZ;
    upperRing.push([x, cy + gHalf, z]);
    lowerRing.push([x, cy - gHalf, z]);
  }

  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    // Upper pyramid facets (flat shaded for crisp gem reflections: group=0)
    part.addTri(matCrystal, upperRing[i], upperRing[next], topApex, [0, 0], [1, 0], [0.5, 1], 0);
    // Equatorial girdle band
    if (girdleH > 1e-4) {
      part.addQuad(matGirdle, lowerRing[i], lowerRing[next], upperRing[next], upperRing[i], [0, 0, 1, 1], 0);
    }
    // Lower pyramid facets
    part.addTri(matCrystal, lowerRing[next], lowerRing[i], botApex, [1, 0], [0, 0], [0.5, 1], 0);
  }
}

// Circular or split circular arc ring in XZ plane (around Y axis) using sweepLoft
export function addCircularArc(part, opts = {}) {
  const {
    center = [0, 0, 0],
    radius = 1.0,
    angleStart = 0,       // radians around Y, 0 = -Z forward: x = sin(a)*R, z = -cos(a)*R
    angleEnd = TAU,
    segments = 24,
    profile = profileChamferRect(0.08, 0.06, 0.015),
    matBody = 1,
    edgeMaterials = null,
    matCaps = matBody,
    closed = false,
    tiltX = 0,
    tiltZ = 0,
  } = opts;

  const stations = [];
  const count = closed ? segments : segments + 1;
  for (let i = 0; i < count; i++) {
    const t = i / segments;
    const a = angleStart + (angleEnd - angleStart) * t;
    let localPos = [Math.sin(a) * radius, 0, -Math.cos(a) * radius];
    let localUp = [0, 1, 0];
    if (tiltX !== 0) {
      localPos = rotX3(localPos, tiltX);
      localUp = rotX3(localUp, tiltX);
    }
    if (tiltZ !== 0) {
      localPos = rotZ3(localPos, tiltZ);
      localUp = rotZ3(localUp, tiltZ);
    }
    stations.push({
      pos: add3(center, localPos),
      up: localUp,
    });
  }

  addSweepLoft(part, stations, profile, {
    matBody,
    edgeMaterials,
    matCapStart: matCaps,
    matCapEnd: matCaps,
    capStart: !closed,
    capEnd: !closed,
    closedLoop: closed,
    smooth: true,
  });
}
