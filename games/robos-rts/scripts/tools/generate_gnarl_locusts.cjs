'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = __dirname;
const TAU = Math.PI * 2;

// --- Basic Vector & Quaternion Math ---
const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a) => {
  const l = len3(a);
  return l > 1e-10 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Intrinsic XYZ Euler -> unit quaternion [x, y, z, w]
function quatEuler(rx = 0, ry = 0, rz = 0) {
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

function rotateByQuat(v, q) {
  const ux = q[0], uy = q[1], uz = q[2], s = q[3];
  const d = 2 * (ux * v[0] + uy * v[1] + uz * v[2]);
  const c = s * s - (ux * ux + uy * uy + uz * uz);
  const cx = uy * v[2] - uz * v[1];
  const cy = uz * v[0] - ux * v[2];
  const cz = ux * v[1] - uy * v[0];
  return [
    d * ux + c * v[0] + 2 * s * cx,
    d * uy + c * v[1] + 2 * s * cy,
    d * uz + c * v[2] + 2 * s * cz,
  ];
}

// --- Procedural Mesh Builders ---
function createEmptyMesh() {
  return { pos: [], norm: [], idx: [] };
}

function computeSmoothNormals(pos, idx) {
  const norm = new Float64Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const i0 = idx[i] * 3, i1 = idx[i + 1] * 3, i2 = idx[i + 2] * 3;
    const ax = pos[i1] - pos[i0], ay = pos[i1 + 1] - pos[i0 + 1], az = pos[i1 + 2] - pos[i0 + 2];
    const bx = pos[i2] - pos[i0], by = pos[i2 + 1] - pos[i0 + 1], bz = pos[i2 + 2] - pos[i0 + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    norm[i0] += nx; norm[i0 + 1] += ny; norm[i0 + 2] += nz;
    norm[i1] += nx; norm[i1 + 1] += ny; norm[i1 + 2] += nz;
    norm[i2] += nx; norm[i2 + 1] += ny; norm[i2 + 2] += nz;
  }
  const out = new Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const l = Math.hypot(norm[i], norm[i + 1], norm[i + 2]);
    if (l > 1e-10) {
      out[i] = norm[i] / l; out[i + 1] = norm[i + 1] / l; out[i + 2] = norm[i + 2] / l;
    } else {
      out[i] = 0; out[i + 1] = 1; out[i + 2] = 0;
    }
  }
  return out;
}

function mergeMeshes(meshes) {
  const out = createEmptyMesh();
  for (const m of meshes) {
    if (!m || m.idx.length === 0) continue;
    const base = out.pos.length / 3;
    for (let i = 0; i < m.pos.length; i++) out.pos.push(m.pos[i]);
    const norms = m.norm && m.norm.length === m.pos.length ? m.norm : computeSmoothNormals(m.pos, m.idx);
    for (let i = 0; i < norms.length; i++) out.norm.push(norms[i]);
    for (let i = 0; i < m.idx.length; i += 3) {
      const a = m.idx[i], b = m.idx[i + 1], c = m.idx[i + 2];
      const ax = m.pos[b * 3] - m.pos[a * 3], ay = m.pos[b * 3 + 1] - m.pos[a * 3 + 1], az = m.pos[b * 3 + 2] - m.pos[a * 3 + 2];
      const bx = m.pos[c * 3] - m.pos[a * 3], by = m.pos[c * 3 + 1] - m.pos[a * 3 + 1], bz = m.pos[c * 3 + 2] - m.pos[a * 3 + 2];
      const area2 = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
      if (area2 > 1e-9) out.idx.push(base + a, base + b, base + c);
    }
  }
  return out;
}

function transformMesh(m, translate = [0, 0, 0], euler = [0, 0, 0], scale = [1, 1, 1]) {
  const q = quatEuler(euler[0], euler[1], euler[2]);
  const pos = new Array(m.pos.length);
  const norm = new Array(m.pos.length);
  const srcNorm = m.norm && m.norm.length === m.pos.length ? m.norm : computeSmoothNormals(m.pos, m.idx);
  const flip = scale[0] * scale[1] * scale[2] < 0;
  for (let i = 0; i < m.pos.length; i += 3) {
    const sp = [m.pos[i] * scale[0], m.pos[i + 1] * scale[1], m.pos[i + 2] * scale[2]];
    const rp = rotateByQuat(sp, q);
    pos[i] = rp[0] + translate[0];
    pos[i + 1] = rp[1] + translate[1];
    pos[i + 2] = rp[2] + translate[2];
    const sn = [
      srcNorm[i] / (scale[0] || 1),
      srcNorm[i + 1] / (scale[1] || 1),
      srcNorm[i + 2] / (scale[2] || 1),
    ];
    const rn = norm3(rotateByQuat(sn, q));
    norm[i] = rn[0]; norm[i + 1] = rn[1]; norm[i + 2] = rn[2];
  }
  const idx = new Array(m.idx.length);
  for (let i = 0; i < m.idx.length; i += 3) {
    idx[i] = m.idx[i];
    idx[i + 1] = flip ? m.idx[i + 2] : m.idx[i + 1];
    idx[i + 2] = flip ? m.idx[i + 1] : m.idx[i + 2];
  }
  return { pos, norm, idx };
}

function mirrorMeshX(m) {
  return transformMesh(m, [0, 0, 0], [0, 0, 0], [-1, 1, 1]);
}

// Closed watertight organic loft along spineFunc(t) for t in [0, 1]
// spineFunc(t) => { p: [x,y,z], rx, ry, up?: [x,y,z], shape?: (theta, t) => [sx, sy] }
function loftOrganic(rings, segs, spineFunc) {
  const pos = [];
  const idx = [];
  const samples = [];
  for (let i = 0; i <= rings; i++) {
    samples.push(spineFunc(i / rings));
  }
  const frames = [];
  for (let i = 0; i <= rings; i++) {
    const pPrev = samples[Math.max(0, i - 1)].p;
    const pNext = samples[Math.min(rings, i + 1)].p;
    let tang = norm3(sub3(pNext, pPrev));
    let upRef = samples[i].up || [0, 1, 0];
    if (Math.abs(dot3(tang, upRef)) > 0.96) upRef = [0, 0, 1];
    if (Math.abs(dot3(tang, upRef)) > 0.96) upRef = [1, 0, 0];
    const right = norm3(cross3(upRef, tang));
    const up = norm3(cross3(tang, right));
    frames.push({ right, up, tang });
  }

  // Start pole (t = 0)
  const s0 = samples[0];
  pos.push(s0.p[0], s0.p[1], s0.p[2]); // index 0

  // Interior rings 1 .. rings - 1
  for (let i = 1; i < rings; i++) {
    const t = i / rings;
    const s = samples[i];
    const f = frames[i];
    const rx = Math.max(0.002, s.rx);
    const ry = Math.max(0.002, s.ry);
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * TAU;
      let cx = Math.cos(th), cy = Math.sin(th);
      if (s.shape) {
        const mod = s.shape(th, t);
        cx = mod[0]; cy = mod[1];
      }
      const vx = s.p[0] + f.right[0] * rx * cx + f.up[0] * ry * cy;
      const vy = s.p[1] + f.right[1] * rx * cx + f.up[1] * ry * cy;
      const vz = s.p[2] + f.right[2] * rx * cx + f.up[2] * ry * cy;
      pos.push(vx, vy, vz);
    }
  }

  // End pole (t = 1)
  const sN = samples[rings];
  const endPoleIdx = pos.length / 3;
  pos.push(sN.p[0], sN.p[1], sN.p[2]);

  // Cap 0 fan: outward normal -tang
  for (let j = 0; j < segs; j++) {
    const jNext = (j + 1) % segs;
    idx.push(0, 1 + jNext, 1 + j);
  }
  // Body quads
  for (let i = 1; i < rings - 1; i++) {
    const r0 = 1 + (i - 1) * segs;
    const r1 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const jNext = (j + 1) % segs;
      idx.push(r0 + j, r0 + jNext, r1 + jNext);
      idx.push(r0 + j, r1 + jNext, r1 + j);
    }
  }
  // Cap N fan: outward normal +tang
  const lastRing = 1 + (rings - 2) * segs;
  for (let j = 0; j < segs; j++) {
    const jNext = (j + 1) % segs;
    idx.push(endPoleIdx, lastRing + j, lastRing + jNext);
  }

  return { pos, norm: computeSmoothNormals(pos, idx), idx };
}

// Solid 3D curved carapace / TeamColor armor panel from surface grid(u, v) -> { p, n }
// u in [0, 1] (left -X to right +X or inner to outer), v in [0, 1] (back -Z to front +Z)
function buildSolidPlate(nu, nv, thickness, surfFn) {
  const pos = [];
  const idx = [];
  const cols = nu + 1, rows = nv + 1;
  const grid = [];
  for (let iv = 0; iv <= nv; iv++) {
    const v = iv / nv;
    for (let iu = 0; iu <= nu; iu++) {
      const u = iu / nu;
      grid.push(surfFn(u, v));
    }
  }
  // Top vertices (offset +thickness) and Bottom vertices (offset 0)
  for (let k = 0; k < grid.length; k++) {
    const { p, n } = grid[k];
    pos.push(p[0] + n[0] * thickness, p[1] + n[1] * thickness, p[2] + n[2] * thickness);
  }
  const botBase = grid.length;
  for (let k = 0; k < grid.length; k++) {
    const { p } = grid[k];
    pos.push(p[0], p[1], p[2]);
  }

  // Determine natural orientation from center cell
  const c0 = grid[0].p, cu = grid[1].p, cv = grid[cols].p;
  const testN = cross3(sub3(cv, c0), sub3(cu, c0));
  const flip = dot3(testN, grid[0].n) < 0;
  const pushTri = (a, b, c) => (flip ? idx.push(a, c, b) : idx.push(a, b, c));

  // Top surface (+n) & Bottom surface (-n)
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = iv * cols + iu;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      pushTri(a, c, d);
      pushTri(a, d, b);
      pushTri(botBase + a, botBase + d, botBase + c);
      pushTri(botBase + a, botBase + b, botBase + d);
    }
  }

  // Perimeter side walls
  const addRimQuad = (t0, t1) => {
    pushTri(t0, t1, botBase + t1);
    pushTri(t0, botBase + t1, botBase + t0);
  };
  for (let iu = 0; iu < nu; iu++) addRimQuad(iu, iu + 1);
  for (let iv = 0; iv < nv; iv++) addRimQuad(iv * cols + nu, (iv + 1) * cols + nu);
  for (let iu = nu; iu > 0; iu--) addRimQuad(nv * cols + iu, nv * cols + iu - 1);
  for (let iv = nv; iv > 0; iv--) addRimQuad(iv * cols, (iv - 1) * cols);

  return { pos, norm: computeSmoothNormals(pos, idx), idx };
}

// Chitin carapace cross-section: domed dorsal arch, scalloped rim, flatter belly
function carapaceShape(scallops = 3, arch = 0.28) {
  return (th) => {
    const c = Math.cos(th), s = Math.sin(th);
    const upper = s >= 0 ? Math.pow(s, 0.78) * (1 + 0.06 * Math.cos(th * scallops)) : s * 0.42;
    const wide = c * (1 + (s > -0.2 ? 0.08 * Math.exp(-Math.pow((s - 0.15) * 3, 2)) : 0));
    return [wide, upper + arch * (1 - c * c) * 0.25];
  };
}

// Curved horn / mandible / claw builder from p0 -> pMid -> pTip
function buildCurvedHorn(p0, pMid, pTip, rBase, rMid, rings = 10, segs = 8) {
  return loftOrganic(rings, segs, (t) => {
    const u = 1 - t;
    const p = [
      u * u * p0[0] + 2 * u * t * pMid[0] + t * t * pTip[0],
      u * u * p0[1] + 2 * u * t * pMid[1] + t * t * pTip[1],
      u * u * p0[2] + 2 * u * t * pMid[2] + t * t * pTip[2],
    ];
    const r = t < 0.45
      ? lerp(rBase * 0.65, rMid, smoothstep(0, 0.45, t))
      : lerp(rMid, 0.004, Math.pow((t - 0.45) / 0.55, 0.85));
    return { p, rx: r * 1.05, ry: r * 0.85 };
  });
}

// --- Shared Materials Palette ---
function buildMaterials(includeWings) {
  const mats = [
    {
      name: 'DarkPlum',
      pbrMetallicRoughness: {
        baseColorFactor: [0.22, 0.082, 0.265, 1.0],
        metallicFactor: 0.10,
        roughnessFactor: 0.35,
      },
    },
    {
      name: 'DeepChitin',
      pbrMetallicRoughness: {
        baseColorFactor: [0.105, 0.044, 0.132, 1.0],
        metallicFactor: 0.14,
        roughnessFactor: 0.54,
      },
    },
    {
      name: 'TeamColor',
      pbrMetallicRoughness: {
        baseColorFactor: [0.18, 0.78, 0.95, 1.0],
        metallicFactor: 0.08,
        roughnessFactor: 0.30,
      },
    },
    {
      name: 'BioGlow',
      pbrMetallicRoughness: {
        baseColorFactor: [0.72, 0.98, 0.22, 1.0],
        metallicFactor: 0.0,
        roughnessFactor: 0.24,
      },
      emissiveFactor: [0.44, 0.74, 0.09],
    },
  ];
  if (includeWings) {
    mats.push({
      name: 'WingMembrane',
      pbrMetallicRoughness: {
        baseColorFactor: [0.68, 0.48, 0.78, 0.56],
        metallicFactor: 0.16,
        roughnessFactor: 0.20,
      },
      emissiveFactor: [0.05, 0.025, 0.07],
      alphaMode: 'BLEND',
      doubleSided: true,
    });
  }
  return mats;
}

const MAT_PLUM = 0;
const MAT_DEEP = 1;
const MAT_TEAM = 2;
const MAT_GLOW = 3;
const MAT_WING = 4;

// --- Scene Graph Assembly & Exact Radius Calibration ---
class SceneBuilder {
  constructor(includeWings = false) {
    this.materials = buildMaterials(includeWings);
    this.nodes = [];
    this.meshes = [];
    this.animations = [];
    this.nodeIndexByName = new Map();
  }

  addNode(name, parentIdx = null, opts = {}) {
    const idx = this.nodes.length;
    const node = {
      name,
      translation: opts.translation ? [...opts.translation] : [0, 0, 0],
      rotation: opts.rotation ? [...opts.rotation] : [0, 0, 0, 1],
      scale: opts.scale ? [...opts.scale] : [1, 1, 1],
      children: [],
      meshIdx: null,
    };
    if (opts.mesh && opts.mesh.idx.length > 0) {
      const mIdx = this.meshes.length;
      this.meshes.push({ name: `${name}_Mesh`, geo: opts.mesh, material: opts.material ?? MAT_PLUM });
      node.meshIdx = mIdx;
    }
    this.nodes.push(node);
    this.nodeIndexByName.set(name, idx);
    if (parentIdx !== null) {
      this.nodes[parentIdx].children.push(idx);
    }
    return idx;
  }

  addAnimation(name, tracks) {
    // tracks: [{ node: 'Body', path: 'translation'|'rotation'|'scale', times: [...], values: [[...], ...] }]
    this.animations.push({ name, tracks });
  }

  computeWorldVertices() {
    const out = [];
    const visit = (nIdx, pTrans, pRot, pScale) => {
      const n = this.nodes[nIdx];
      const scaledLocal = [
        n.translation[0] * pScale[0],
        n.translation[1] * pScale[1],
        n.translation[2] * pScale[2],
      ];
      const wTrans = add3(pTrans, rotateByQuat(scaledLocal, pRot));
      // Multiply quaternions pRot * n.rotation
      const a = pRot, b = n.rotation;
      const wRot = [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
      ];
      const wScale = [pScale[0] * n.scale[0], pScale[1] * n.scale[1], pScale[2] * n.scale[2]];

      if (n.meshIdx !== null) {
        const pos = this.meshes[n.meshIdx].geo.pos;
        for (let i = 0; i < pos.length; i += 3) {
          const sv = [pos[i] * wScale[0], pos[i + 1] * wScale[1], pos[i + 2] * wScale[2]];
          const rv = rotateByQuat(sv, wRot);
          out.push([wTrans[0] + rv[0], wTrans[1] + rv[1], wTrans[2] + rv[2]]);
        }
      }
      for (const c of n.children) visit(c, wTrans, wRot, wScale);
    };
    visit(0, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
    return out;
  }

  // Exact linear calibration so horizontal footprint & centering match targetRadius cleanly
  calibrate(targetRadius, groundOnZero = true) {
    const bodyIdx = this.nodes[0].children[0];
    // 1. Center XZ (and ground Y=0 if grounded) via Body offset while Root stays strictly [0,0,0]
    let verts = this.computeWorldVertices();
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const v of verts) {
      if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
      if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
    }
    const dx = -0.5 * (minX + maxX);
    const dz = -0.5 * (minZ + maxZ);
    const dy = groundOnZero ? -minY : 0;

    const shiftBody = (ox, oy, oz) => {
      const bNode = this.nodes[bodyIdx];
      bNode.translation[0] += ox;
      bNode.translation[1] += oy;
      bNode.translation[2] += oz;
      for (const anim of this.animations) {
        for (const tr of anim.tracks) {
          if (this.nodeIndexByName.get(tr.node) === bodyIdx && tr.path === 'translation') {
            for (const val of tr.values) {
              val[0] += ox; val[1] += oy; val[2] += oz;
            }
          }
        }
      }
    };
    shiftBody(dx, dy, dz);

    // 2. Measure exact horizontal radius from origin & scale uniformly by k
    verts = this.computeWorldVertices();
    let maxR = 0;
    for (const v of verts) {
      const r = Math.hypot(v[0], v[2]);
      if (r > maxR) maxR = r;
    }
    const k = targetRadius / maxR;

    // Uniformly scale all mesh vertex positions, non-root node translations, and translation keyframes
    for (const m of this.meshes) {
      for (let i = 0; i < m.geo.pos.length; i++) m.geo.pos[i] *= k;
    }
    for (let i = 1; i < this.nodes.length; i++) {
      this.nodes[i].translation[0] *= k;
      this.nodes[i].translation[1] *= k;
      this.nodes[i].translation[2] *= k;
    }
    for (const anim of this.animations) {
      for (const tr of anim.tracks) {
        if (tr.path === 'translation') {
          for (const val of tr.values) {
            val[0] *= k; val[1] *= k; val[2] *= k;
          }
        }
      }
    }
    // Ensure exact Root = [0, 0, 0]
    this.nodes[0].translation = [0, 0, 0];
  }

  toGLB() {
    const bufferViews = [];
    const accessors = [];
    const chunks = [];
    let byteOffset = 0;

    const appendBin = (typedArr, target) => {
      const raw = Buffer.from(typedArr.buffer, typedArr.byteOffset, typedArr.byteLength);
      const pad = (4 - (raw.length % 4)) % 4;
      const buf = pad > 0 ? Buffer.concat([raw, Buffer.alloc(pad, 0)]) : raw;
      const bv = { buffer: 0, byteOffset, byteLength: raw.length };
      if (target !== undefined) bv.target = target;
      const bvIdx = bufferViews.length;
      bufferViews.push(bv);
      chunks.push(buf);
      byteOffset += buf.length;
      return bvIdx;
    };

    const addAccessor = (typedArr, componentType, count, type, target, includeMinMax = true) => {
      const bvIdx = appendBin(typedArr, target);
      const comps = type === 'SCALAR' ? 1 : type === 'VEC3' ? 3 : 4;
      const acc = { bufferView: bvIdx, componentType, count, type };
      if (includeMinMax && count > 0) {
        const min = new Array(comps).fill(Infinity);
        const max = new Array(comps).fill(-Infinity);
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < comps; c++) {
            const v = typedArr[i * comps + c];
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

    const gltfMeshes = this.meshes.map((m) => {
      const vCount = m.geo.pos.length / 3;
      const posArr = new Float32Array(m.geo.pos);
      const normArr = new Float32Array(vCount * 3);
      for (let i = 0; i < vCount; i++) {
        const nx = m.geo.norm[i * 3], ny = m.geo.norm[i * 3 + 1], nz = m.geo.norm[i * 3 + 2];
        const l = Math.hypot(nx, ny, nz) || 1;
        normArr[i * 3] = nx / l;
        normArr[i * 3 + 1] = ny / l;
        normArr[i * 3 + 2] = nz / l;
      }
      const idxArr = new Uint16Array(m.geo.idx);
      const posAcc = addAccessor(posArr, 5126, vCount, 'VEC3', 34962, true);
      const normAcc = addAccessor(normArr, 5126, vCount, 'VEC3', 34962, false);
      const idxAcc = addAccessor(idxArr, 5123, idxArr.length, 'SCALAR', 34963, true);
      return {
        name: m.name,
        primitives: [{ attributes: { POSITION: posAcc, NORMAL: normAcc }, indices: idxAcc, material: m.material }],
      };
    });

    const gltfNodes = this.nodes.map((n) => {
      const out = {
        name: n.name,
        translation: n.translation,
        rotation: n.rotation,
        scale: n.scale,
      };
      if (n.meshIdx !== null) out.mesh = n.meshIdx;
      if (n.children.length > 0) out.children = n.children;
      return out;
    });

    const gltfAnimations = this.animations.map((anim) => {
      const samplers = [];
      const channels = [];
      for (const tr of anim.tracks) {
        const targetNode = this.nodeIndexByName.get(tr.node);
        if (targetNode === undefined) throw new Error(`Unknown animation target node: ${tr.node}`);
        const tArr = new Float32Array(tr.times);
        const comps = tr.path === 'rotation' ? 4 : 3;
        const vArr = new Float32Array(tr.values.length * comps);
        for (let i = 0; i < tr.values.length; i++) {
          let val = tr.values[i];
          if (tr.path === 'rotation') {
            const l = Math.hypot(val[0], val[1], val[2], val[3]) || 1;
            val = [val[0] / l, val[1] / l, val[2] / l, val[3] / l];
          }
          for (let c = 0; c < comps; c++) vArr[i * comps + c] = val[c];
        }
        const inAcc = addAccessor(tArr, 5126, tArr.length, 'SCALAR', undefined, true);
        const outAcc = addAccessor(vArr, 5126, tr.values.length, comps === 4 ? 'VEC4' : 'VEC3', undefined, false);
        const sampIdx = samplers.length;
        samplers.push({ input: inAcc, interpolation: 'LINEAR', output: outAcc });
        channels.push({ sampler: sampIdx, target: { node: targetNode, path: tr.path } });
      }
      return { name: anim.name, samplers, channels };
    });

    const gltf = {
      asset: { version: '2.0', generator: 'Starfall Command Gnarl Locust Generator' },
      scene: 0,
      scenes: [{ name: 'Scene', nodes: [0] }],
      nodes: gltfNodes,
      materials: this.materials,
      meshes: gltfMeshes,
      accessors,
      bufferViews,
      buffers: [{ byteLength: byteOffset }],
      animations: gltfAnimations,
    };

    const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
    const jsonChunk = jsonPad > 0 ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;
    const binChunk = Buffer.concat(chunks);

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

    return Buffer.concat([header, jsonHdr, jsonChunk, binHdr, binChunk]);
  }
}

// ============================================================================
// MODEL 1: LOCUST BROODER (radius 2.18)
// Broad low organic siege carrier with bright paired brood sacs
// Animations: idle, walk, cast, burrow, surface, death
// ============================================================================
function buildLocustBrooder() {
  const sb = new SceneBuilder(false);
  const root = sb.addNode('Root');

  // Broad, low dorsal siege carapace shell
  const thoraxShell = loftOrganic(20, 24, (t) => {
    const z = lerp(-0.92, 1.02, t);
    const env = Math.sin(Math.pow(t, 0.85) * Math.PI);
    const rib = 1 + 0.045 * Math.sin(t * Math.PI * 7);
    return {
      p: [0, 0.06 + 0.14 * Math.sin(t * Math.PI) - 0.05 * t, z],
      rx: (0.48 + 1.12 * Math.pow(env, 0.65)) * rib,
      ry: (0.20 + 0.34 * Math.pow(env, 0.75)) * rib,
      shape: carapaceShape(4, 0.24),
    };
  });

  // Gnarled lateral flange shields over leg sockets
  const leftFlange = buildSolidPlate(6, 10, 0.065, (u, v) => {
    const z = lerp(-0.82, 0.82, v);
    const flare = Math.sin(v * Math.PI);
    const x = lerp(0.72, 1.56 + 0.18 * flare, u);
    const y = 0.20 + 0.16 * (1 - u) + 0.08 * flare - 0.18 * u * u + 0.025 * Math.sin(v * Math.PI * 5);
    return { p: [x, y, z], n: norm3([0.28 * u, 1.0, 0.05 * Math.cos(v * Math.PI)]) };
  });
  const dorsalHorns = [];
  for (let i = 0; i < 4; i++) {
    const z = -0.35 + i * 0.34;
    const s = 1 - i * 0.12;
    const hL = buildCurvedHorn([0.26 * s, 0.36, z], [0.42 * s, 0.56, z - 0.08], [0.48 * s, 0.62, z - 0.22], 0.08, 0.055, 7, 7);
    dorsalHorns.push(hL, mirrorMeshX(hL));
  }
  const bodyMesh = mergeMeshes([thoraxShell, leftFlange, mirrorMeshX(leftFlange), ...dorsalHorns]);
  const body = sb.addNode('Body', root, { translation: [0, 0.50, 0.04], mesh: bodyMesh, material: MAT_PLUM });

  // Heavy segmented dark underbelly
  const bellyMesh = loftOrganic(14, 16, (t) => {
    const z = lerp(-1.35, 1.08, t);
    const env = Math.sin(t * Math.PI);
    const seg = 1 + 0.06 * Math.sin(t * Math.PI * 9);
    return {
      p: [0, -0.16 + 0.04 * Math.cos(t * Math.PI * 2), z],
      rx: (0.28 + 0.86 * env) * seg,
      ry: (0.12 + 0.22 * env) * seg,
    };
  });
  sb.addNode('Underbelly', body, { mesh: bellyMesh, material: MAT_DEEP });

  // Separate TeamColor armor panels on carapace shoulders & central spine
  const flankPanelL = buildSolidPlate(5, 8, 0.036, (u, v) => {
    const z = lerp(-0.56, 0.68, v);
    const flare = Math.sin(v * Math.PI);
    const x = lerp(0.92, 1.44 + 0.14 * flare, u);
    const y = 0.26 + 0.14 * (1 - u) + 0.075 * flare - 0.15 * u * u;
    return { p: [x, y, z], n: norm3([0.30 * u, 1.0, 0]) };
  });
  const spineMedallion = buildSolidPlate(6, 6, 0.038, (u, v) => {
    const su = (u - 0.5) * 2;
    const z = lerp(-0.18, 0.72, v);
    const w = 0.36 * (1 - 0.55 * v) * (0.65 + 0.35 * Math.sin(v * Math.PI));
    const x = su * w;
    const y = 0.48 + 0.06 * Math.sin(v * Math.PI) - 0.08 * su * su;
    return { p: [x, y, z], n: norm3([0.22 * su, 1.0, 0.08]) };
  });
  sb.addNode('Body_TeamColor', body, {
    mesh: mergeMeshes([flankPanelL, mirrorMeshX(flankPanelL), spineMedallion]),
    material: MAT_TEAM,
  });

  // Broad shovel-prow Cephalon (+Z front)
  const cephHood = loftOrganic(14, 18, (t) => {
    const z = lerp(-0.12, 0.88, t);
    const env = Math.sin(Math.pow(t, 0.62) * Math.PI * 0.94 + 0.12);
    return {
      p: [0, 0.06 - 0.24 * t * t, z],
      rx: 0.22 + 0.88 * Math.pow(1 - t * 0.72, 0.65) * env,
      ry: 0.10 + 0.25 * (1 - t * 0.68),
      shape: carapaceShape(3, 0.18),
    };
  });
  const prowHorn = buildCurvedHorn([0, 0.16, 0.36], [0, 0.26, 0.72], [0, 0.14, 1.02], 0.11, 0.075, 8, 8);
  const cephalon = sb.addNode('Cephalon', body, {
    translation: [0, -0.02, 0.94],
    mesh: mergeMeshes([cephHood, prowHorn]),
    material: MAT_PLUM,
  });

  // Cephalon TeamColor chevron panels
  const cephTeamL = buildSolidPlate(4, 5, 0.034, (u, v) => {
    const z = lerp(0.06, 0.58, v);
    const x = lerp(0.18, 0.64 * (1 - 0.45 * v), u);
    const y = 0.22 - 0.16 * v * v - 0.08 * u;
    return { p: [x, y, z], n: norm3([0.32, 0.92, 0.22]) };
  });
  sb.addNode('Cephalon_TeamColor', cephalon, {
    mesh: mergeMeshes([cephTeamL, mirrorMeshX(cephTeamL)]),
    material: MAT_TEAM,
  });

  // Glowing compound eyes
  const eyeOuter = loftOrganic(6, 8, (t) => ({
    p: [0.54, 0.02, lerp(0.30, 0.52, t)],
    rx: 0.065 * Math.sin(t * Math.PI),
    ry: 0.055 * Math.sin(t * Math.PI),
  }));
  const eyeInner = transformMesh(eyeOuter, [-0.14, 0.03, 0.14], [0, 0, 0], [0.8, 0.8, 0.8]);
  const eyePair = mergeMeshes([eyeOuter, eyeInner]);
  sb.addNode('Eyes', cephalon, { mesh: mergeMeshes([eyePair, mirrorMeshX(eyePair)]), material: MAT_GLOW });

  // Heavy digging mandibles (reach front Z = +2.18 boundary)
  const mandGeoL = mergeMeshes([
    buildCurvedHorn([0, 0, 0], [0.22, -0.06, 0.36], [0.05, -0.08, 0.72], 0.13, 0.095, 10, 8),
    buildCurvedHorn([0.10, -0.02, 0.22], [0.02, -0.03, 0.36], [-0.05, -0.05, 0.46], 0.055, 0.04, 6, 6),
  ]);
  sb.addNode('Mandible_L', cephalon, { translation: [0.38, -0.14, 0.52], mesh: mandGeoL, material: MAT_DEEP });
  sb.addNode('Mandible_R', cephalon, { translation: [-0.38, -0.14, 0.52], mesh: mirrorMeshX(mandGeoL), material: MAT_DEEP });

  // BRIGHT PAIRED BROOD SACS (prominent bioluminescent dorsal-posterior gestation pods)
  const buildBroodSacMesh = () => {
    const mainSac = loftOrganic(18, 20, (t) => {
      const z = lerp(-0.72, 0.68, t);
      const env = Math.sin(Math.pow(t, 0.88) * Math.PI);
      const lobe = 1 + 0.075 * Math.sin(t * Math.PI * 5);
      return {
        p: [0, 0.16 * Math.sin(t * Math.PI) + 0.06 * (1 - t), z],
        rx: 0.50 * Math.pow(env, 0.68) * lobe,
        ry: 0.44 * Math.pow(env, 0.70) * lobe,
        shape: (th) => {
          const c = Math.cos(th), s = Math.sin(th);
          const rib = 1 + 0.05 * Math.cos(th * 4);
          return [c * rib, (s > 0 ? Math.pow(s, 0.85) * 1.12 : s * 0.72) * rib];
        },
      };
    });
    // Raised dorsal spawn-pustules on sac crest
    const pustules = [];
    for (let i = 0; i < 3; i++) {
      const pz = -0.34 + i * 0.34;
      const py = 0.42 + (i === 1 ? 0.08 : 0.02);
      const r = i === 1 ? 0.17 : 0.13;
      pustules.push(loftOrganic(7, 10, (t) => ({
        p: [0.04 * (i - 1), py - 0.08 + 0.18 * t, pz],
        rx: r * Math.sin(t * Math.PI),
        ry: r * Math.sin(t * Math.PI),
      })));
    }
    return mergeMeshes([mainSac, ...pustules]);
  };
  const sacMeshL = buildBroodSacMesh();
  sb.addNode('BroodSac_L', body, {
    translation: [0.74, 0.34, -0.64],
    rotation: quatEuler(0.06, 0.18, -0.14),
    mesh: sacMeshL,
    material: MAT_GLOW,
  });
  sb.addNode('BroodSac_R', body, {
    translation: [-0.74, 0.34, -0.64],
    rotation: quatEuler(0.06, -0.18, 0.14),
    mesh: mirrorMeshX(sacMeshL),
    material: MAT_GLOW,
  });

  // Dark plum chitin calyx claws cradling each brood sac
  const cradleClawsL = mergeMeshes([
    buildCurvedHorn([0.22, -0.18, 0.42], [0.56, 0.10, 0.38], [0.40, 0.44, 0.28], 0.095, 0.065, 9, 7),
    buildCurvedHorn([0.26, -0.20, -0.02], [0.60, 0.12, -0.04], [0.42, 0.48, -0.06], 0.105, 0.07, 9, 7),
    buildCurvedHorn([0.20, -0.18, -0.44], [0.52, 0.08, -0.46], [0.36, 0.40, -0.40], 0.09, 0.06, 9, 7),
    buildCurvedHorn([-0.16, -0.14, -0.52], [-0.28, 0.14, -0.68], [-0.12, 0.40, -0.60], 0.085, 0.055, 8, 7),
  ]);
  sb.addNode('SacCradle_L', body, {
    translation: [0.74, 0.30, -0.64],
    rotation: quatEuler(0.06, 0.18, -0.14),
    mesh: cradleClawsL,
    material: MAT_PLUM,
  });
  sb.addNode('SacCradle_R', body, {
    translation: [-0.74, 0.30, -0.64],
    rotation: quatEuler(0.06, -0.18, 0.14),
    mesh: mirrorMeshX(cradleClawsL),
    material: MAT_PLUM,
  });

  // Broad armored posterior tail fan + cerci (-Z rear boundary)
  const tailShield = loftOrganic(12, 16, (t) => {
    const z = lerp(0.10, -0.78, t);
    const env = Math.sin(Math.pow(t, 0.7) * Math.PI * 0.92 + 0.15);
    return {
      p: [0, 0.02 - 0.12 * t, z],
      rx: 0.92 * (1 - 0.55 * t) * env,
      ry: 0.22 * (1 - 0.55 * t),
      shape: carapaceShape(3, 0.16),
    };
  });
  const cercusL = buildCurvedHorn([0.38, -0.02, -0.34], [0.52, 0.04, -0.64], [0.28, 0.02, -0.90], 0.085, 0.055, 8, 7);
  const tail = sb.addNode('Tail', body, {
    translation: [0, -0.08, -1.28],
    mesh: mergeMeshes([tailShield, cercusL, mirrorMeshX(cercusL)]),
    material: MAT_PLUM,
  });
  const tailTeamL = buildSolidPlate(4, 5, 0.032, (u, v) => {
    const z = lerp(-0.10, -0.56, v);
    const x = lerp(0.14, 0.56 * (1 - 0.45 * v), u);
    const y = 0.15 - 0.10 * v - 0.06 * u;
    return { p: [x, y, z], n: norm3([0.24, 0.95, -0.18]) };
  });
  sb.addNode('Tail_TeamColor', tail, {
    mesh: mergeMeshes([tailTeamL, mirrorMeshX(tailTeamL)]),
    material: MAT_TEAM,
  });

  // Six heavy siege carrier legs planted on Y = 0
  // Hip at [hx, hy, hz] on Body (Body y=0.50 -> world hip y = 0.50 + hy)
  const legDefs = [
    { tag: 'FL', hip: [1.08, -0.14, 0.66], knee: [0.56, 0.28, 0.34], foot: [0.74, -0.36, 0.50], spade: 1.25 },
    { tag: 'ML', hip: [1.24, -0.14, -0.06], knee: [0.64, 0.30, -0.02], foot: [0.80, -0.36, -0.04], spade: 1.05 },
    { tag: 'BL', hip: [1.08, -0.16, -0.84], knee: [0.54, 0.28, -0.30], foot: [0.68, -0.34, -0.44], spade: 1.0 },
  ];
  for (const ld of legDefs) {
    const femurL = mergeMeshes([
      buildCurvedHorn([0, 0, 0], mul3(ld.knee, 0.55), ld.knee, 0.16, 0.135, 9, 9),
      // Armored knee spur
      buildCurvedHorn(mul3(ld.knee, 0.78), add3(ld.knee, [0.06, 0.16, 0]), add3(ld.knee, [0.14, 0.24, 0]), 0.08, 0.05, 6, 6),
    ]);
    const shinRel = sub3(ld.foot, ld.knee);
    const shinMid = [shinRel[0] * 0.65 + 0.08, shinRel[1] * 0.42 + 0.10, shinRel[2] * 0.65];
    const shinL = mergeMeshes([
      buildCurvedHorn([0, 0, 0], shinMid, shinRel, 0.135 * ld.spade, 0.095 * ld.spade, 10, 9),
      // Twin grounded tarsal spade claws right at foot level (shinRel[1])
      buildCurvedHorn(add3(shinRel, [-0.05, 0.06, 0.04]), add3(shinRel, [0.06, 0.02, 0.10 * ld.spade]), add3(shinRel, [0.10, 0.005, 0.16 * ld.spade]), 0.055 * ld.spade, 0.035, 6, 6),
      buildCurvedHorn(add3(shinRel, [-0.05, 0.06, -0.04]), add3(shinRel, [0.06, 0.02, -0.08 * ld.spade]), add3(shinRel, [0.10, 0.005, -0.13 * ld.spade]), 0.05 * ld.spade, 0.032, 6, 6),
    ]);

    const hipL = sb.addNode(`Leg_${ld.tag}`, body, { translation: ld.hip, mesh: femurL, material: MAT_PLUM });
    sb.addNode(`Shin_${ld.tag}`, hipL, { translation: ld.knee, mesh: shinL, material: MAT_DEEP });

    const rTag = ld.tag.replace('L', 'R');
    const rHipPos = [-ld.hip[0], ld.hip[1], ld.hip[2]];
    const rKneePos = [-ld.knee[0], ld.knee[1], ld.knee[2]];
    const hipR = sb.addNode(`Leg_${rTag}`, body, { translation: rHipPos, mesh: mirrorMeshX(femurL), material: MAT_PLUM });
    sb.addNode(`Shin_${rTag}`, hipR, { translation: rKneePos, mesh: mirrorMeshX(shinL), material: MAT_DEEP });
  }

  // --- BROODER ANIMATIONS: idle, walk, cast, burrow, surface, death ---
  const baseBodyY = 0.50, baseBodyZ = 0.04;
  const sacRotL = [0.06, 0.18, -0.14], sacRotR = [0.06, -0.18, 0.14];
  const legNames = ['FL', 'FR', 'ML', 'MR', 'BL', 'BR'];

  // 1. idle (2.4s seamless loop)
  {
    const N = 12, dur = 2.4;
    const times = Array.from({ length: N + 1 }, (_, i) => +(i * dur / N).toFixed(4));
    const bodyT = [], bodyR = [], sacSL = [], sacSR = [], mandL = [], mandR = [], tailR = [];
    const legR = Object.fromEntries(legNames.map((n) => [n, []]));
    for (let i = 0; i <= N; i++) {
      const ph = (i / N) * TAU;
      const breath = Math.sin(ph);
      bodyT.push([0, baseBodyY + 0.024 * breath, baseBodyZ]);
      bodyR.push(quatEuler(0.015 * Math.sin(ph), 0, 0.012 * Math.sin(ph * 2)));
      const pL = 1 + 0.055 * Math.sin(ph), pR = 1 + 0.055 * Math.sin(ph + 1.2);
      sacSL.push([pL, 1 + 0.07 * Math.sin(ph), pL]);
      sacSR.push([pR, 1 + 0.07 * Math.sin(ph + 1.2), pR]);
      mandL.push(quatEuler(0, 0.09 * (0.5 + 0.5 * Math.sin(ph * 2)), 0));
      mandR.push(quatEuler(0, -0.09 * (0.5 + 0.5 * Math.sin(ph * 2)), 0));
      tailR.push(quatEuler(-0.03 * breath, 0.02 * Math.sin(ph), 0));
      // Subtle hip counter-flex keeps feet grounded during breathing
      for (const ln of legNames) {
        const sgn = ln.endsWith('L') ? 1 : -1;
        legR[ln].push(quatEuler(0, 0, sgn * 0.032 * breath));
      }
    }
    sb.addAnimation('idle', [
      { node: 'Body', path: 'translation', times, values: bodyT },
      { node: 'Body', path: 'rotation', times, values: bodyR },
      { node: 'BroodSac_L', path: 'scale', times, values: sacSL },
      { node: 'BroodSac_R', path: 'scale', times, values: sacSR },
      { node: 'Mandible_L', path: 'rotation', times, values: mandL },
      { node: 'Mandible_R', path: 'rotation', times, values: mandR },
      { node: 'Tail', path: 'rotation', times, values: tailR },
      ...legNames.map((ln) => ({ node: `Leg_${ln}`, path: 'rotation', times, values: legR[ln] })),
    ]);
  }

  // 2. walk (1.2s heavy tripod siege gait)
  {
    const N = 16, dur = 1.2;
    const times = Array.from({ length: N + 1 }, (_, i) => +(i * dur / N).toFixed(4));
    const bodyT = [], bodyR = [], sacRL = [], sacRR = [];
    const legR = Object.fromEntries(legNames.map((n) => [n, []]));
    const shinR = Object.fromEntries(legNames.map((n) => [n, []]));
    const tripodPhase = { FL: 0, MR: 0, BL: 0, FR: 0.5, ML: 0.5, BR: 0.5 };
    for (let i = 0; i <= N; i++) {
      const u = (i / N) % 1;
      const ph = (i / N) * TAU;
      bodyT.push([0.03 * Math.sin(ph), baseBodyY + 0.028 * Math.abs(Math.sin(ph)), baseBodyZ]);
      bodyR.push(quatEuler(0.02 * Math.sin(ph * 2), 0.035 * Math.sin(ph), -0.032 * Math.sin(ph)));
      sacRL.push(quatEuler(sacRotL[0] + 0.04 * Math.sin(ph * 2 - 0.6), sacRotL[1], sacRotL[2] + 0.04 * Math.sin(ph)));
      sacRR.push(quatEuler(sacRotR[0] + 0.04 * Math.sin(ph * 2 - 0.6), sacRotR[1], sacRotR[2] + 0.04 * Math.sin(ph)));

      for (const ln of legNames) {
        const sgn = ln.endsWith('L') ? 1 : -1;
        const p = (u + tripodPhase[ln]) % 1;
        // Stance p in [0, 0.5]: sweeps front (+1) to back (-1) on ground; Swing p in [0.5, 1): lifts and swings forward
        const stride = p < 0.5 ? lerp(1, -1, p * 2) : lerp(-1, 1, (p - 0.5) * 2);
        const lift = p >= 0.5 ? Math.sin((p - 0.5) * 2 * Math.PI) : 0;
        legR[ln].push(quatEuler(0, -sgn * 0.22 * stride, sgn * 0.20 * lift));
        shinR[ln].push(quatEuler(0, 0, -sgn * 0.18 * lift));
      }
    }
    sb.addAnimation('walk', [
      { node: 'Body', path: 'translation', times, values: bodyT },
      { node: 'Body', path: 'rotation', times, values: bodyR },
      { node: 'BroodSac_L', path: 'rotation', times, values: sacRL },
      { node: 'BroodSac_R', path: 'rotation', times, values: sacRR },
      ...legNames.map((ln) => ({ node: `Leg_${ln}`, path: 'rotation', times, values: legR[ln] })),
      ...legNames.map((ln) => ({ node: `Shin_${ln}`, path: 'rotation', times, values: shinR[ln] })),
    ]);
  }

  // 3. cast (1.6s brood spawn ejection sequence)
  {
    const times = [0, 0.32, 0.62, 0.82, 1.04, 1.32, 1.6];
    sb.addAnimation('cast', [
      {
        node: 'Body', path: 'translation', times,
        values: [
          [0, baseBodyY, baseBodyZ],
          [0, baseBodyY - 0.09, baseBodyZ - 0.06],
          [0, baseBodyY + 0.14, baseBodyZ + 0.04],
          [0, baseBodyY + 0.06, baseBodyZ - 0.04],
          [0, baseBodyY + 0.16, baseBodyZ + 0.05],
          [0, baseBodyY - 0.03, baseBodyZ],
          [0, baseBodyY, baseBodyZ],
        ],
      },
      {
        node: 'Body', path: 'rotation', times,
        values: [
          quatEuler(0, 0, 0),
          quatEuler(0.11, 0, 0),
          quatEuler(-0.14, 0, 0.03),
          quatEuler(-0.06, 0, -0.03),
          quatEuler(-0.16, 0, 0),
          quatEuler(0.04, 0, 0),
          quatEuler(0, 0, 0),
        ],
      },
      {
        node: 'BroodSac_L', path: 'scale', times,
        values: [
          [1, 1, 1], [1.18, 1.24, 1.14], [1.30, 1.38, 1.22],
          [0.86, 0.82, 0.90], [1.26, 1.34, 1.18], [0.92, 0.90, 0.95], [1, 1, 1],
        ],
      },
      {
        node: 'BroodSac_R', path: 'scale', times,
        values: [
          [1, 1, 1], [1.14, 1.18, 1.12], [0.92, 0.88, 0.94],
          [1.30, 1.38, 1.22], [0.85, 0.80, 0.88], [0.96, 0.95, 0.98], [1, 1, 1],
        ],
      },
      {
        node: 'SacCradle_L', path: 'rotation', times,
        values: [
          quatEuler(...sacRotL),
          quatEuler(sacRotL[0], sacRotL[1], sacRotL[2] - 0.22),
          quatEuler(sacRotL[0] - 0.08, sacRotL[1], sacRotL[2] - 0.34),
          quatEuler(...sacRotL),
          quatEuler(sacRotL[0] - 0.08, sacRotL[1], sacRotL[2] - 0.32),
          quatEuler(...sacRotL),
          quatEuler(...sacRotL),
        ],
      },
      {
        node: 'SacCradle_R', path: 'rotation', times,
        values: [
          quatEuler(...sacRotR),
          quatEuler(sacRotR[0], sacRotR[1], sacRotR[2] + 0.18),
          quatEuler(...sacRotR),
          quatEuler(sacRotR[0] - 0.08, sacRotR[1], sacRotR[2] + 0.34),
          quatEuler(...sacRotR),
          quatEuler(...sacRotR),
          quatEuler(...sacRotR),
        ],
      },
      {
        node: 'Mandible_L', path: 'rotation', times,
        values: [0, 0.34, 0.42, 0.28, 0.44, 0.10, 0].map((a) => quatEuler(0, a, 0)),
      },
      {
        node: 'Mandible_R', path: 'rotation', times,
        values: [0, -0.34, -0.42, -0.28, -0.44, -0.10, 0].map((a) => quatEuler(0, a, 0)),
      },
    ]);
  }

  // 4. burrow (1.5s excavation plunge underground)
  {
    const times = [0, 0.25, 0.55, 0.85, 1.18, 1.5];
    sb.addAnimation('burrow', [
      {
        node: 'Body', path: 'translation', times,
        values: [
          [0, baseBodyY, baseBodyZ],
          [0.04, baseBodyY + 0.05, baseBodyZ - 0.08],
          [-0.05, baseBodyY - 0.32, baseBodyZ + 0.10],
          [0.04, baseBodyY - 0.86, baseBodyZ + 0.16],
          [-0.02, baseBodyY - 1.38, baseBodyZ + 0.08],
          [0, baseBodyY - 1.68, baseBodyZ],
        ],
      },
      {
        node: 'Body', path: 'rotation', times,
        values: [
          quatEuler(0, 0, 0),
          quatEuler(-0.10, 0.05, 0.04),
          quatEuler(0.32, -0.07, -0.06),
          quatEuler(0.38, 0.06, 0.05),
          quatEuler(0.22, -0.04, -0.03),
          quatEuler(0.08, 0, 0),
        ],
      },
      {
        node: 'Leg_FL', path: 'rotation', times,
        values: [
          quatEuler(0, 0, 0), quatEuler(0.25, -0.35, 0.32), quatEuler(-0.20, 0.30, -0.18),
          quatEuler(0.25, -0.35, 0.30), quatEuler(-0.15, 0.25, -0.22), quatEuler(0, 0.20, -0.30),
        ],
      },
      {
        node: 'Leg_FR', path: 'rotation', times,
        values: [
          quatEuler(0, 0, 0), quatEuler(-0.20, -0.30, 0.18), quatEuler(0.25, 0.35, -0.32),
          quatEuler(-0.20, -0.30, 0.18), quatEuler(0.25, 0.35, -0.30), quatEuler(0, -0.20, 0.30),
        ],
      },
      {
        node: 'BroodSac_L', path: 'scale', times,
        values: [[1, 1, 1], [1.05, 1.05, 1.05], [0.92, 0.86, 0.95], [0.85, 0.78, 0.90], [0.82, 0.75, 0.88], [0.82, 0.75, 0.88]],
      },
      {
        node: 'BroodSac_R', path: 'scale', times,
        values: [[1, 1, 1], [1.05, 1.05, 1.05], [0.92, 0.86, 0.95], [0.85, 0.78, 0.90], [0.82, 0.75, 0.88], [0.82, 0.75, 0.88]],
      },
    ]);
  }

  // 5. surface (1.5s eruption out of ground into ready stance)
  {
    const times = [0, 0.28, 0.62, 0.92, 1.22, 1.5];
    sb.addAnimation('surface', [
      {
        node: 'Body', path: 'translation', times,
        values: [
          [0, baseBodyY - 1.68, baseBodyZ - 0.12],
          [0.04, baseBodyY - 0.92, baseBodyZ - 0.04],
          [-0.03, baseBodyY + 0.18, baseBodyZ + 0.06],
          [0, baseBodyY - 0.05, baseBodyZ],
          [0, baseBodyY + 0.02, baseBodyZ],
          [0, baseBodyY, baseBodyZ],
        ],
      },
      {
        node: 'Body', path: 'rotation', times,
        values: [
          quatEuler(-0.36, 0, 0),
          quatEuler(-0.38, 0.06, -0.05),
          quatEuler(-0.16, -0.04, 0.04),
          quatEuler(0.08, 0, 0),
          quatEuler(-0.02, 0, 0),
          quatEuler(0, 0, 0),
        ],
      },
      {
        node: 'Leg_FL', path: 'rotation', times,
        values: [
          quatEuler(0, 0.25, -0.35), quatEuler(0.22, -0.32, 0.30), quatEuler(0, -0.18, 0.26),
          quatEuler(0, 0.05, -0.06), quatEuler(0, 0, 0), quatEuler(0, 0, 0),
        ],
      },
      {
        node: 'Leg_FR', path: 'rotation', times,
        values: [
          quatEuler(0, -0.25, 0.35), quatEuler(0.22, 0.32, -0.30), quatEuler(0, 0.18, -0.26),
          quatEuler(0, -0.05, 0.06), quatEuler(0, 0, 0), quatEuler(0, 0, 0),
        ],
      },
      {
        node: 'BroodSac_L', path: 'scale', times,
        values: [[0.82, 0.75, 0.88], [0.90, 0.86, 0.94], [1.14, 1.18, 1.10], [0.96, 0.94, 0.98], [1.02, 1.03, 1.01], [1, 1, 1]],
      },
      {
        node: 'BroodSac_R', path: 'scale', times,
        values: [[0.82, 0.75, 0.88], [0.90, 0.86, 0.94], [1.14, 1.18, 1.10], [0.96, 0.94, 0.98], [1.02, 1.03, 1.01], [1, 1, 1]],
      },
    ]);
  }

  // 6. death (1.6s sac rupture & heavy carapace collapse)
  {
    const times = [0, 0.24, 0.56, 0.92, 1.25, 1.6];
    sb.addAnimation('death', [
      {
        node: 'Body', path: 'translation', times,
        values: [
          [0, baseBodyY, baseBodyZ],
          [0, baseBodyY + 0.14, baseBodyZ - 0.06],
          [0.06, baseBodyY - 0.14, baseBodyZ - 0.04],
          [0.08, baseBodyY - 0.26, baseBodyZ - 0.02],
          [0.08, baseBodyY - 0.27, baseBodyZ - 0.02],
          [0.08, baseBodyY - 0.27, baseBodyZ - 0.02],
        ],
      },
      {
        node: 'Body', path: 'rotation', times,
        values: [
          quatEuler(0, 0, 0),
          quatEuler(-0.18, 0.05, 0.06),
          quatEuler(0.08, -0.06, -0.14),
          quatEuler(0.11, -0.08, -0.18),
          quatEuler(0.10, -0.08, -0.17),
          quatEuler(0.10, -0.08, -0.17),
        ],
      },
      {
        node: 'BroodSac_L', path: 'scale', times,
        values: [[1, 1, 1], [1.24, 1.28, 1.16], [0.68, 0.50, 0.76], [0.54, 0.36, 0.66], [0.52, 0.34, 0.65], [0.52, 0.34, 0.65]],
      },
      {
        node: 'BroodSac_R', path: 'scale', times,
        values: [[1, 1, 1], [1.18, 1.22, 1.12], [1.22, 1.24, 1.14], [0.56, 0.38, 0.68], [0.52, 0.34, 0.65], [0.52, 0.34, 0.65]],
      },
      ...legNames.map((ln) => {
        const sgn = ln.endsWith('L') ? 1 : -1;
        return {
          node: `Leg_${ln}`, path: 'rotation', times,
          values: [
            quatEuler(0, 0, 0),
            quatEuler(0, -sgn * 0.18, sgn * 0.25),
            quatEuler(0, sgn * 0.12, sgn * 0.42),
            quatEuler(0, sgn * 0.20, sgn * 0.54),
            quatEuler(0, sgn * 0.16, sgn * 0.50),
            quatEuler(0, sgn * 0.18, sgn * 0.52),
          ],
        };
      }),
      ...legNames.map((ln) => {
        const sgn = ln.endsWith('L') ? 1 : -1;
        return {
          node: `Shin_${ln}`, path: 'rotation', times,
          values: [
            quatEuler(0, 0, 0),
            quatEuler(0, 0, -sgn * 0.20),
            quatEuler(0, 0, sgn * 0.36),
            quatEuler(0, 0, sgn * 0.52),
            quatEuler(0, 0, sgn * 0.46),
            quatEuler(0, 0, sgn * 0.50),
          ],
        };
      }),
    ]);
  }

  sb.calibrate(2.18, true);
  return sb;
}

// ============================================================================
// SHARED SMALL GNARL LOCUST ANATOMY (used for BOTH flying & landed forms!)
// ============================================================================
function buildSharedSmallLocustParts() {
  // Prothorax / Pterothorax carapace
  const thorax = loftOrganic(14, 16, (t) => {
    const z = lerp(-0.28, 0.30, t);
    const env = Math.sin(Math.pow(t, 0.85) * Math.PI);
    const pronotum = t > 0.45 ? 0.04 * Math.sin(((t - 0.45) / 0.55) * Math.PI) : 0;
    return {
      p: [0, 0.03 + 0.05 * Math.sin(t * Math.PI) + pronotum, z],
      rx: 0.08 + 0.15 * Math.pow(env, 0.7),
      ry: 0.07 + 0.14 * Math.pow(env, 0.72),
      shape: carapaceShape(3, 0.20),
    };
  });
  const thoraxBelly = loftOrganic(10, 12, (t) => {
    const z = lerp(-0.24, 0.26, t);
    const env = Math.sin(t * Math.PI);
    return { p: [0, -0.05, z], rx: 0.05 + 0.11 * env, ry: 0.04 + 0.07 * env };
  });
  const thoraxTeamL = buildSolidPlate(4, 6, 0.018, (u, v) => {
    const z = lerp(-0.18, 0.22, v);
    const flare = Math.sin(v * Math.PI);
    const x = lerp(0.06, 0.19 + 0.03 * flare, u);
    const y = 0.14 + 0.04 * flare - 0.08 * u * u;
    return { p: [x, y, z], n: norm3([0.45 * u, 1.0, 0]) };
  });

  // Angular predatory locust Head + swept antennae + mandibles + eyes
  const headCap = loftOrganic(10, 14, (t) => {
    const z = lerp(-0.04, 0.28, t);
    const env = Math.sin(Math.pow(t, 0.68) * Math.PI * 0.94 + 0.10);
    return {
      p: [0, 0.02 - 0.07 * t * t, z],
      rx: 0.05 + 0.115 * (1 - 0.55 * t) * env,
      ry: 0.05 + 0.095 * (1 - 0.50 * t) * env,
      shape: carapaceShape(2, 0.15),
    };
  });
  const antL = buildCurvedHorn([0.055, 0.065, 0.18], [0.16, 0.16, 0.34], [0.22, 0.12, 0.52], 0.020, 0.013, 9, 6);
  const headTeam = buildSolidPlate(4, 4, 0.015, (u, v) => {
    const su = (u - 0.5) * 2;
    const z = lerp(0.02, 0.19, v);
    const x = su * 0.065 * (1 - 0.45 * v);
    const y = 0.10 - 0.04 * v - 0.025 * su * su;
    return { p: [x, y, z], n: norm3([0.2 * su, 0.95, 0.25]) };
  });
  const eyeL = loftOrganic(6, 8, (t) => ({
    p: [0.105, 0.025, lerp(0.08, 0.20, t)],
    rx: 0.036 * Math.sin(t * Math.PI),
    ry: 0.042 * Math.sin(t * Math.PI),
  }));
  const mandL = buildCurvedHorn([0, 0, 0], [0.05, -0.025, 0.09], [0.01, -0.035, 0.17], 0.032, 0.022, 7, 6);

  // Segmented tapering locust Abdomen + cerci + dorsal TeamColor stripe
  const abdomen = loftOrganic(16, 16, (t) => {
    const z = lerp(0.04, -0.62, t);
    const env = Math.sin(Math.pow(t, 0.68) * Math.PI * 0.96 + 0.08);
    const seg = 1 + 0.065 * Math.sin(t * Math.PI * 6);
    return {
      p: [0, 0.02 * Math.sin(t * Math.PI) - 0.045 * t * t, z],
      rx: 0.145 * env * seg,
      ry: 0.13 * env * seg,
      shape: carapaceShape(2, 0.16),
    };
  });
  const cercL = buildCurvedHorn([0.035, -0.02, -0.54], [0.065, 0.0, -0.63], [0.045, 0.01, -0.70], 0.018, 0.012, 6, 6);
  const abdTeam = buildSolidPlate(4, 7, 0.016, (u, v) => {
    const su = (u - 0.5) * 2;
    const z = lerp(-0.08, -0.46, v);
    const w = 0.075 * (1 - 0.52 * v);
    const x = su * w;
    const y = 0.125 * (1 - 0.35 * v) - 0.03 * su * su;
    return { p: [x, y, z], n: norm3([0.3 * su, 1.0, -0.1]) };
  });
  const spiracleL = mergeMeshes([0, 1, 2].map((i) => loftOrganic(5, 6, (t) => ({
    p: [0.125 - i * 0.022, 0.01 - i * 0.01, lerp(-0.14 - i * 0.13, -0.19 - i * 0.13, t)],
    rx: 0.018 * Math.sin(t * Math.PI),
    ry: 0.016 * Math.sin(t * Math.PI),
  }))));

  // Articulated Insect Wing pair builder (Left side extending +X; mirrored for Right -X)
  const buildWing = (span, chord, sweepZ, withStigma) => {
    // Leading-edge costal spar + branching chitin veins (DarkPlum)
    const spar = buildCurvedHorn(
      [0, 0, 0],
      [span * 0.52, 0.022, sweepZ * 0.35 + chord * 0.12],
      [span * 0.98, 0.005, sweepZ + chord * 0.04],
      0.024, 0.015, 10, 7
    );
    const vein1 = buildCurvedHorn(
      [span * 0.16, 0.004, 0],
      [span * 0.54, 0.012, sweepZ * 0.55 - chord * 0.26],
      [span * 0.86, 0.0, sweepZ - chord * 0.34],
      0.014, 0.009, 7, 6
    );
    const vein2 = buildCurvedHorn(
      [span * 0.08, 0.002, -chord * 0.08],
      [span * 0.36, 0.006, sweepZ * 0.45 - chord * 0.54],
      [span * 0.58, -0.004, sweepZ * 0.80 - chord * 0.68],
      0.012, 0.008, 6, 6
    );
    // Cambered translucent airfoil membrane (WingMembrane)
    const blade = buildSolidPlate(8, 6, 0.006, (u, v) => {
      // u along span [0, 1], v from trailing edge (0) to leading edge (1)
      const x = u * span;
      const tipTaper = Math.sin(Math.pow(u, 0.62) * Math.PI * 0.96 + 0.08);
      const leZ = sweepZ * u * u + chord * 0.12 * Math.sin(u * Math.PI);
      const teZ = leZ - chord * tipTaper;
      const z = lerp(teZ, leZ, v);
      const camber = 0.018 * Math.sin(v * Math.PI) * Math.sin(u * Math.PI);
      return { p: [x, camber, z], n: [0, 1, 0] };
    });
    const stigma = withStigma
      ? buildSolidPlate(3, 3, 0.011, (u, v) => {
        const x = lerp(span * 0.06, span * 0.28, u);
        const z = lerp(-chord * 0.16, chord * 0.08, v);
        return { p: [x, 0.008, z], n: [0, 1, 0] };
      })
      : null;
    return { frame: mergeMeshes([spar, vein1, vein2]), blade, stigma };
  };

  return {
    thoraxMesh: thorax,
    thoraxBelly,
    thoraxTeam: mergeMeshes([thoraxTeamL, mirrorMeshX(thoraxTeamL)]),
    headMesh: mergeMeshes([headCap, antL, mirrorMeshX(antL)]),
    headTeam,
    eyesMesh: mergeMeshes([eyeL, mirrorMeshX(eyeL)]),
    mandL,
    abdomenMesh: mergeMeshes([abdomen, cercL, mirrorMeshX(cercL)]),
    abdTeam,
    spiracles: mergeMeshes([spiracleL, mirrorMeshX(spiracleL)]),
    foreWingL: buildWing(0.82, 0.24, -0.08, true),
    hindWingL: buildWing(0.66, 0.30, -0.22, false),
  };
}

// Helper to add the 6 insect legs in either tucked-flight or planted-ground pose
function attachSmallLocustLegs(sb, body, planted) {
  const configs = planted
    ? [
      { tag: 'FL', hip: [0.13, -0.05, 0.18], knee: [0.22, 0.14, 0.16], foot: [0.34, -0.29, 0.28], rF: 0.032 },
      { tag: 'ML', hip: [0.15, -0.05, -0.01], knee: [0.30, 0.16, 0.01], foot: [0.54, -0.29, 0.02], rF: 0.035 },
      // Iconic enlarged jumping locust hind femur & long serrated tibia!
      { tag: 'BL', hip: [0.14, -0.04, -0.18], knee: [0.28, 0.28, -0.20], foot: [0.48, -0.30, -0.36], rF: 0.054 },
    ]
    : [
      { tag: 'FL', hip: [0.12, -0.05, 0.18], knee: [0.14, -0.08, 0.18], foot: [0.06, -0.22, 0.28], rF: 0.030 },
      { tag: 'ML', hip: [0.14, -0.05, -0.01], knee: [0.18, -0.08, -0.04], foot: [0.09, -0.23, -0.12], rF: 0.033 },
      { tag: 'BL', hip: [0.13, -0.04, -0.18], knee: [0.19, 0.06, -0.32], foot: [0.11, -0.22, -0.54], rF: 0.050 },
    ];

  for (const cfg of configs) {
    const femL = buildCurvedHorn([0, 0, 0], mul3(cfg.knee, 0.52), cfg.knee, cfg.rF, cfg.rF * 0.78, 8, 8);
    const shinRel = sub3(cfg.foot, cfg.knee);
    const shinMid = [shinRel[0] * 0.55 + 0.02, shinRel[1] * 0.45 + 0.03, shinRel[2] * 0.55];
    const shinParts = [buildCurvedHorn([0, 0, 0], shinMid, shinRel, cfg.rF * 0.68, 0.016, 8, 7)];
    if (planted) {
      shinParts.push(
        buildCurvedHorn(add3(shinRel, [0, 0.02, 0]), add3(shinRel, [0.03, 0.008, 0.035]), add3(shinRel, [0.045, 0.002, 0.055]), 0.016, 0.010, 5, 5),
        buildCurvedHorn(add3(shinRel, [0, 0.02, 0]), add3(shinRel, [0.03, 0.008, -0.03]), add3(shinRel, [0.045, 0.002, -0.048]), 0.015, 0.010, 5, 5),
      );
    }
    const shinL = mergeMeshes(shinParts);

    const hipL = sb.addNode(`Leg_${cfg.tag}`, body, { translation: cfg.hip, mesh: femL, material: MAT_PLUM });
    sb.addNode(`Shin_${cfg.tag}`, hipL, { translation: cfg.knee, mesh: shinL, material: MAT_DEEP });

    const rTag = cfg.tag.replace('L', 'R');
    const hipR = sb.addNode(`Leg_${rTag}`, body, {
      translation: [-cfg.hip[0], cfg.hip[1], cfg.hip[2]],
      mesh: mirrorMeshX(femL),
      material: MAT_PLUM,
    });
    sb.addNode(`Shin_${rTag}`, hipR, {
      translation: [-cfg.knee[0], cfg.knee[1], cfg.knee[2]],
      mesh: mirrorMeshX(shinL),
      material: MAT_DEEP,
    });
  }
}

function attachLocustCore(sb, parts, bodyY, bodyZ) {
  const root = sb.addNode('Root');
  const body = sb.addNode('Body', root, {
    translation: [0, bodyY, bodyZ],
    mesh: parts.thoraxMesh,
    material: MAT_PLUM,
  });
  sb.addNode('Thorax_Belly', body, { mesh: parts.thoraxBelly, material: MAT_DEEP });
  sb.addNode('Thorax_TeamColor', body, { mesh: parts.thoraxTeam, material: MAT_TEAM });

  const head = sb.addNode('Head', body, {
    translation: [0, 0.02, 0.28],
    mesh: parts.headMesh,
    material: MAT_PLUM,
  });
  sb.addNode('Head_TeamColor', head, { mesh: parts.headTeam, material: MAT_TEAM });
  sb.addNode('Eyes', head, { mesh: parts.eyesMesh, material: MAT_GLOW });
  sb.addNode('Mandible_L', head, { translation: [0.055, -0.04, 0.20], mesh: parts.mandL, material: MAT_DEEP });
  sb.addNode('Mandible_R', head, { translation: [-0.055, -0.04, 0.20], mesh: mirrorMeshX(parts.mandL), material: MAT_DEEP });

  const abdomen = sb.addNode('Abdomen', body, {
    translation: [0, -0.01, -0.24],
    mesh: parts.abdomenMesh,
    material: MAT_PLUM,
  });
  sb.addNode('Abdomen_TeamColor', abdomen, { mesh: parts.abdTeam, material: MAT_TEAM });
  sb.addNode('Spiracles', abdomen, { mesh: parts.spiracles, material: MAT_GLOW });

  return { root, body, head, abdomen };
}

function attachWingPair(sb, body, parts, rotFL, rotFR, rotBL, rotBR) {
  const addW = (name, wPart, mirror, pos, rot) => {
    const frame = mirror ? mirrorMeshX(wPart.frame) : wPart.frame;
    const blade = mirror ? mirrorMeshX(wPart.blade) : wPart.blade;
    const wNode = sb.addNode(name, body, { translation: pos, rotation: rot, mesh: frame, material: MAT_PLUM });
    sb.addNode(`${name}_Membrane`, wNode, { mesh: blade, material: MAT_WING });
    if (wPart.stigma) {
      const stig = mirror ? mirrorMeshX(wPart.stigma) : wPart.stigma;
      sb.addNode(`${name}_TeamColor`, wNode, { mesh: stig, material: MAT_TEAM });
    }
    return wNode;
  };
  addW('Wing_FL', parts.foreWingL, false, [0.125, 0.11, 0.08], rotFL);
  addW('Wing_FR', parts.foreWingL, true, [-0.125, 0.11, 0.08], rotFR);
  addW('Wing_BL', parts.hindWingL, false, [0.115, 0.095, -0.07], rotBL);
  addW('Wing_BR', parts.hindWingL, true, [-0.115, 0.095, -0.07], rotBR);
}

// ============================================================================
// MODEL 2: LOCUST FLYING (radius 0.9375)
// Silhouette of a small chitin insect with animated wing pairs
// Animations: idle, hover, swoop, death
// ============================================================================
function buildLocustFlying() {
  const sb = new SceneBuilder(true);
  const parts = buildSharedSmallLocustParts();
  const baseY = 0.50, baseZ = 0.04;
  const { body } = attachLocustCore(sb, parts, baseY, baseZ);

  // Streamlined dormant spit-gland buds tucked low on flying prothorax
  const budL = loftOrganic(7, 8, (t) => ({
    p: [0.065, 0.145 + 0.015 * Math.sin(t * Math.PI), lerp(-0.04, 0.18, t)],
    rx: 0.036 * Math.sin(t * Math.PI),
    ry: 0.028 * Math.sin(t * Math.PI),
  }));
  sb.addNode('SpitBuds', body, { mesh: mergeMeshes([budL, mirrorMeshX(budL)]), material: MAT_GLOW });

  // Outstretched animated wing pairs spanning to radius 0.9375
  attachWingPair(
    sb, body, parts,
    quatEuler(0.10, -0.04, 0.18),
    quatEuler(0.10, 0.04, -0.18),
    quatEuler(0.06, -0.26, 0.08),
    quatEuler(0.06, 0.26, -0.08)
  );
  attachSmallLocustLegs(sb, body, false);

  // --- FLYING ANIMATIONS: idle, hover, swoop, death ---
  // 1. idle (0.8s loop: 4 crisp wingbeat cycles + gentle airborne bob)
  {
    const N = 24, dur = 0.8;
    const times = Array.from({ length: N + 1 }, (_, i) => +(i * dur / N).toFixed(4));
    const bodyT = [], bodyR = [], abdR = [], wFL = [], wFR = [], wBL = [], wBR = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const slow = u * TAU;
      const beat = u * TAU * 4;
      bodyT.push([0, baseY + 0.032 * Math.sin(slow), baseZ]);
      bodyR.push(quatEuler(-0.06 + 0.03 * Math.cos(slow), 0, 0.02 * Math.sin(slow)));
      abdR.push(quatEuler(-0.06 + 0.05 * Math.sin(slow - 0.6), 0, 0));
      const flapF = 0.56 * Math.sin(beat), pitchF = 0.22 * Math.cos(beat);
      const flapB = 0.62 * Math.sin(beat - 0.85), pitchB = 0.24 * Math.cos(beat - 0.85);
      wFL.push(quatEuler(0.10 + pitchF, -0.04, 0.18 + flapF));
      wFR.push(quatEuler(0.10 + pitchF, 0.04, -0.18 - flapF));
      wBL.push(quatEuler(0.06 + pitchB, -0.26, 0.08 + flapB));
      wBR.push(quatEuler(0.06 + pitchB, 0.26, -0.08 - flapB));
    }
    sb.addAnimation('idle', [
      { node: 'Body', path: 'translation', times, values: bodyT },
      { node: 'Body', path: 'rotation', times, values: bodyR },
      { node: 'Abdomen', path: 'rotation', times, values: abdR },
      { node: 'Wing_FL', path: 'rotation', times, values: wFL },
      { node: 'Wing_FR', path: 'rotation', times, values: wFR },
      { node: 'Wing_BL', path: 'rotation', times, values: wBL },
      { node: 'Wing_BR', path: 'rotation', times, values: wBR },
    ]);
  }

  // 2. hover (1.0s active station-keeping hover with figure-8 wing strokes & target scan)
  {
    const N = 30, dur = 1.0;
    const times = Array.from({ length: N + 1 }, (_, i) => +(i * dur / N).toFixed(4));
    const bodyT = [], bodyR = [], headR = [], abdR = [], wFL = [], wFR = [], wBL = [], wBR = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const slow = u * TAU;
      const beat = u * TAU * 5;
      bodyT.push([0.04 * Math.sin(slow), baseY + 0.048 * Math.sin(slow * 2), baseZ - 0.02 * Math.cos(slow)]);
      bodyR.push(quatEuler(-0.18 + 0.04 * Math.sin(slow * 2), 0.06 * Math.sin(slow), -0.05 * Math.cos(slow)));
      headR.push(quatEuler(0.14, 0.16 * Math.sin(slow), 0));
      abdR.push(quatEuler(-0.14 + 0.08 * Math.sin(slow * 2 - 0.8), 0, 0));
      const flapF = 0.72 * Math.sin(beat), pitchF = 0.34 * Math.cos(beat);
      const flapB = 0.76 * Math.sin(beat - 0.9), pitchB = 0.32 * Math.cos(beat - 0.9);
      wFL.push(quatEuler(0.16 + pitchF, -0.06 + 0.14 * Math.cos(beat), 0.16 + flapF));
      wFR.push(quatEuler(0.16 + pitchF, 0.06 - 0.14 * Math.cos(beat), -0.16 - flapF));
      wBL.push(quatEuler(0.12 + pitchB, -0.24 + 0.12 * Math.cos(beat - 0.9), 0.08 + flapB));
      wBR.push(quatEuler(0.12 + pitchB, 0.24 - 0.12 * Math.cos(beat - 0.9), -0.08 - flapB));
    }
    sb.addAnimation('hover', [
      { node: 'Body', path: 'translation', times, values: bodyT },
      { node: 'Body', path: 'rotation', times, values: bodyR },
      { node: 'Head', path: 'rotation', times, values: headR },
      { node: 'Abdomen', path: 'rotation', times, values: abdR },
      { node: 'Wing_FL', path: 'rotation', times, values: wFL },
      { node: 'Wing_FR', path: 'rotation', times, values: wFR },
      { node: 'Wing_BL', path: 'rotation', times, values: wBL },
      { node: 'Wing_BR', path: 'rotation', times, values: wBR },
    ]);
  }

  // 3. swoop (1.1s predatory dive-strike & pull-up)
  {
    const times = [0, 0.18, 0.32, 0.56, 0.74, 0.92, 1.1];
    sb.addAnimation('swoop', [
      {
        node: 'Body', path: 'translation', times,
        values: [
          [0, baseY, baseZ],
          [0, baseY + 0.20, baseZ - 0.16],
          [0, baseY + 0.24, baseZ - 0.20],
          [0, baseY - 0.24, baseZ + 0.32],
          [0, baseY - 0.14, baseZ + 0.22],
          [0, baseY + 0.06, baseZ + 0.04],
          [0, baseY, baseZ],
        ],
      },
      {
        node: 'Body', path: 'rotation', times,
        values: [
          quatEuler(0, 0, 0),
          quatEuler(-0.26, 0, 0),
          quatEuler(0.42, 0, 0),
          quatEuler(0.32, 0, 0),
          quatEuler(-0.28, 0, 0),
          quatEuler(-0.08, 0, 0),
          quatEuler(0, 0, 0),
        ],
      },
      {
        node: 'Wing_FL', path: 'rotation', times,
        values: [
          quatEuler(0.10, -0.04, 0.18),
          quatEuler(-0.18, 0.12, 0.72),
          quatEuler(0.24, -0.58, 0.12),
          quatEuler(0.28, -0.64, -0.06),
          quatEuler(-0.26, 0.10, 0.64),
          quatEuler(0.12, -0.06, -0.22),
          quatEuler(0.10, -0.04, 0.18),
        ],
      },
      {
        node: 'Wing_FR', path: 'rotation', times,
        values: [
          quatEuler(0.10, 0.04, -0.18),
          quatEuler(-0.18, -0.12, -0.72),
          quatEuler(0.24, 0.58, -0.12),
          quatEuler(0.28, 0.64, 0.06),
          quatEuler(-0.26, -0.10, -0.64),
          quatEuler(0.12, 0.06, 0.22),
          quatEuler(0.10, 0.04, -0.18),
        ],
      },
      {
        node: 'Wing_BL', path: 'rotation', times,
        values: [
          quatEuler(0.06, -0.26, 0.08),
          quatEuler(-0.12, -0.08, 0.58),
          quatEuler(0.20, -0.68, 0.06),
          quatEuler(0.22, -0.72, -0.04),
          quatEuler(-0.22, -0.10, 0.54),
          quatEuler(0.08, -0.24, -0.18),
          quatEuler(0.06, -0.26, 0.08),
        ],
      },
      {
        node: 'Wing_BR', path: 'rotation', times,
        values: [
          quatEuler(0.06, 0.26, -0.08),
          quatEuler(-0.12, 0.08, -0.58),
          quatEuler(0.20, 0.68, -0.06),
          quatEuler(0.22, 0.72, 0.04),
          quatEuler(-0.22, 0.10, -0.54),
          quatEuler(0.08, 0.24, 0.18),
          quatEuler(0.06, 0.26, -0.08),
        ],
      },
      {
        node: 'Mandible_L', path: 'rotation', times,
        values: [0, 0.12, 0.36, 0.42, 0.16, 0.04, 0].map((a) => quatEuler(0, a, 0)),
      },
      {
        node: 'Mandible_R', path: 'rotation', times,
        values: [0, -0.12, -0.36, -0.42, -0.16, -0.04, 0].map((a) => quatEuler(0, a, 0)),
      },
    ]);
  }

  // 4. death (1.2s mid-air tumble & crash onto ground plane)
  {
    const times = [0, 0.20, 0.48, 0.76, 0.98, 1.2];
    sb.addAnimation('death', [
      {
        node: 'Body', path: 'translation', times,
        values: [
          [0, baseY, baseZ],
          [0.05, baseY + 0.08, baseZ - 0.06],
          [0.10, baseY - 0.18, baseZ - 0.02],
          [0.08, 0.14, baseZ + 0.04],
          [0.08, 0.12, baseZ + 0.04],
          [0.08, 0.12, baseZ + 0.04],
        ],
      },
      {
        node: 'Body', path: 'rotation', times,
        values: [
          quatEuler(0, 0, 0),
          quatEuler(-0.32, 0.25, 0.55),
          quatEuler(0.45, 0.52, 1.55),
          quatEuler(0.14, 0.68, 2.52),
          quatEuler(0.08, 0.70, 2.65),
          quatEuler(0.08, 0.70, 2.65),
        ],
      },
      {
        node: 'Wing_FL', path: 'rotation', times,
        values: [
          quatEuler(0.10, -0.04, 0.18), quatEuler(0.42, -0.28, 0.68), quatEuler(0.18, -0.52, -0.25),
          quatEuler(0.08, -0.46, 0.10), quatEuler(0.08, -0.48, 0.06), quatEuler(0.08, -0.48, 0.06),
        ],
      },
      {
        node: 'Wing_FR', path: 'rotation', times,
        values: [
          quatEuler(0.10, 0.04, -0.18), quatEuler(-0.24, 0.36, -0.12), quatEuler(0.22, 0.58, 0.28),
          quatEuler(0.12, 0.54, -0.08), quatEuler(0.12, 0.56, -0.05), quatEuler(0.12, 0.56, -0.05),
        ],
      },
      {
        node: 'Abdomen', path: 'rotation', times,
        values: [0, 0.24, -0.28, 0.22, 0.18, 0.18].map((a) => quatEuler(a, 0, 0)),
      },
    ]);
  }

  sb.calibrate(0.9375, false);
  return sb;
}

// ============================================================================
// MODEL 3: LOCUST LANDED (radius 0.9375, with Muzzle anchor)
// Same small insect with folded wings and raised spit organs
// Animations: idle, walk, attack, death
// ============================================================================
function buildLocustLanded() {
  const sb = new SceneBuilder(true);
  const parts = buildSharedSmallLocustParts();
  const baseY = 0.345, baseZ = 0.06;
  const { body } = attachLocustCore(sb, parts, baseY, baseZ);

  // Folded wings tucked roof-like along the abdomen flanks (tips reach rear radius)
  attachWingPair(
    sb, body, parts,
    quatEuler(0.16, -1.42, -0.34),
    quatEuler(0.16, 1.42, 0.34),
    quatEuler(0.12, -1.46, -0.40),
    quatEuler(0.12, 1.46, 0.40)
  );

  // 6 planted insect legs on Y = 0
  attachSmallLocustLegs(sb, body, true);

  // RAISED SPIT ORGANS + MUZZLE ANCHOR
  // Twin glowing bioluminescent acid chambers elevated over prothorax + convergent spit siphon
  const spitSacL = loftOrganic(12, 12, (t) => {
    const u = 1 - t;
    const p = [
      u * u * 0.10 + 2 * u * t * 0.14 + t * t * 0.055,
      u * u * 0.02 + 2 * u * t * 0.26 + t * t * 0.34,
      u * u * (-0.06) + 2 * u * t * 0.04 + t * t * 0.28,
    ];
    const env = Math.sin(Math.pow(t, 0.78) * Math.PI);
    const lobe = 1 + 0.08 * Math.sin(t * Math.PI * 4);
    return { p, rx: 0.082 * Math.pow(env, 0.7) * lobe, ry: 0.078 * Math.pow(env, 0.7) * lobe };
  });
  const orificeGlow = loftOrganic(6, 10, (t) => ({
    p: [0, 0.34, lerp(0.32, 0.48, t)],
    rx: lerp(0.052, 0.036, t) * Math.sin(Math.pow(t, 0.5) * Math.PI * 0.92 + 0.15),
    ry: lerp(0.048, 0.034, t) * Math.sin(Math.pow(t, 0.5) * Math.PI * 0.92 + 0.15),
  }));

  // Chitinous dorsal turret struts & forward spit nozzle sheath
  const strutL = buildCurvedHorn([0.11, -0.02, -0.08], [0.18, 0.22, 0.02], [0.09, 0.37, 0.26], 0.042, 0.030, 9, 7);
  const nozzleSheath = loftOrganic(10, 12, (t) => ({
    p: [0, 0.34, lerp(0.18, 0.46, t)],
    rx: lerp(0.095, 0.048, t) * (t < 0.12 ? t / 0.12 : 1),
    ry: lerp(0.082, 0.044, t) * (t < 0.12 ? t / 0.12 : 1),
  }));

  const spitOrgan = sb.addNode('SpitOrgan', body, {
    translation: [0, 0.12, 0.10],
    mesh: mergeMeshes([strutL, mirrorMeshX(strutL), nozzleSheath]),
    material: MAT_PLUM,
  });
  sb.addNode('SpitSacs', spitOrgan, {
    mesh: mergeMeshes([spitSacL, mirrorMeshX(spitSacL), orificeGlow]),
    material: MAT_GLOW,
  });
  // Required Muzzle anchor positioned right at the firing orifice of the raised spit organs (+Z forward)
  sb.addNode('Muzzle', spitOrgan, { translation: [0, 0.34, 0.50] });

  // --- LANDED ANIMATIONS: idle, walk, attack, death ---
  const legNames = ['FL', 'FR', 'ML', 'MR', 'BL', 'BR'];

  // 1. idle (1.8s predatory crouch breathing & pressurized spit organ pulse)
  {
    const N = 12, dur = 1.8;
    const times = Array.from({ length: N + 1 }, (_, i) => +(i * dur / N).toFixed(4));
    const bodyT = [], spitR = [], spitS = [], mandL = [], mandR = [], wFL = [], wFR = [];
    const legR = Object.fromEntries(legNames.map((n) => [n, []]));
    for (let i = 0; i <= N; i++) {
      const ph = (i / N) * TAU;
      const b = Math.sin(ph);
      bodyT.push([0, baseY + 0.014 * b, baseZ]);
      spitR.push(quatEuler(-0.04 * b, 0.04 * Math.sin(ph * 2), 0));
      const sp = 1 + 0.065 * (0.5 + 0.5 * Math.sin(ph * 2));
      spitS.push([sp, sp, 1 + 0.03 * Math.sin(ph * 2)]);
      mandL.push(quatEuler(0, 0.10 * (0.5 + 0.5 * Math.sin(ph * 2)), 0));
      mandR.push(quatEuler(0, -0.10 * (0.5 + 0.5 * Math.sin(ph * 2)), 0));
      const flick = Math.pow(Math.max(0, Math.sin(ph * 2)), 6) * 0.08;
      wFL.push(quatEuler(0.16 + flick, -1.42 + flick * 0.5, -0.34));
      wFR.push(quatEuler(0.16 + flick, 1.42 - flick * 0.5, 0.34));
      for (const ln of legNames) {
        const sgn = ln.endsWith('L') ? 1 : -1;
        legR[ln].push(quatEuler(0, 0, sgn * 0.028 * b));
      }
    }
    sb.addAnimation('idle', [
      { node: 'Body', path: 'translation', times, values: bodyT },
      { node: 'SpitOrgan', path: 'rotation', times, values: spitR },
      { node: 'SpitSacs', path: 'scale', times, values: spitS },
      { node: 'Mandible_L', path: 'rotation', times, values: mandL },
      { node: 'Mandible_R', path: 'rotation', times, values: mandR },
      { node: 'Wing_FL', path: 'rotation', times, values: wFL },
      { node: 'Wing_FR', path: 'rotation', times, values: wFR },
      ...legNames.map((ln) => ({ node: `Leg_${ln}`, path: 'rotation', times, values: legR[ln] })),
    ]);
  }

  // 2. walk (0.9s skittering 6-leg tripod run)
  {
    const N = 16, dur = 0.9;
    const times = Array.from({ length: N + 1 }, (_, i) => +(i * dur / N).toFixed(4));
    const bodyT = [], bodyR = [], spitR = [];
    const legR = Object.fromEntries(legNames.map((n) => [n, []]));
    const shinR = Object.fromEntries(legNames.map((n) => [n, []]));
    const tripod = { FL: 0, MR: 0, BL: 0, FR: 0.5, ML: 0.5, BR: 0.5 };
    for (let i = 0; i <= N; i++) {
      const u = (i / N) % 1;
      const ph = (i / N) * TAU;
      bodyT.push([0.016 * Math.sin(ph), baseY + 0.018 * Math.abs(Math.sin(ph)), baseZ]);
      bodyR.push(quatEuler(0.025 * Math.sin(ph * 2), 0.05 * Math.sin(ph), -0.04 * Math.sin(ph)));
      spitR.push(quatEuler(-0.025 * Math.sin(ph * 2), -0.04 * Math.sin(ph), 0));
      for (const ln of legNames) {
        const sgn = ln.endsWith('L') ? 1 : -1;
        const p = (u + tripod[ln]) % 1;
        const stride = p < 0.5 ? lerp(1, -1, p * 2) : lerp(-1, 1, (p - 0.5) * 2);
        const lift = p >= 0.5 ? Math.sin((p - 0.5) * 2 * Math.PI) : 0;
        legR[ln].push(quatEuler(0, -sgn * 0.26 * stride, sgn * 0.24 * lift));
        shinR[ln].push(quatEuler(0, 0, -sgn * 0.20 * lift));
      }
    }
    sb.addAnimation('walk', [
      { node: 'Body', path: 'translation', times, values: bodyT },
      { node: 'Body', path: 'rotation', times, values: bodyR },
      { node: 'SpitOrgan', path: 'rotation', times, values: spitR },
      ...legNames.map((ln) => ({ node: `Leg_${ln}`, path: 'rotation', times, values: legR[ln] })),
      ...legNames.map((ln) => ({ node: `Shin_${ln}`, path: 'rotation', times, values: shinR[ln] })),
    ]);
  }

  // 3. attack (0.95s pressurized acid charge, forward whip fire & recoil)
  {
    const times = [0, 0.28, 0.40, 0.56, 0.76, 0.95];
    sb.addAnimation('attack', [
      {
        node: 'Body', path: 'translation', times,
        values: [
          [0, baseY, baseZ],
          [0, baseY + 0.04, baseZ - 0.07],
          [0, baseY + 0.02, baseZ + 0.09],
          [0, baseY - 0.03, baseZ - 0.09],
          [0, baseY + 0.01, baseZ - 0.02],
          [0, baseY, baseZ],
        ],
      },
      {
        node: 'Body', path: 'rotation', times,
        values: [
          quatEuler(0, 0, 0),
          quatEuler(-0.16, 0, 0),
          quatEuler(0.12, 0, 0),
          quatEuler(-0.14, 0, 0),
          quatEuler(-0.03, 0, 0),
          quatEuler(0, 0, 0),
        ],
      },
      {
        node: 'SpitOrgan', path: 'rotation', times,
        values: [
          quatEuler(0, 0, 0),
          quatEuler(-0.22, 0, 0),
          quatEuler(0.18, 0, 0),
          quatEuler(-0.26, 0, 0),
          quatEuler(-0.06, 0, 0),
          quatEuler(0, 0, 0),
        ],
      },
      {
        node: 'SpitSacs', path: 'scale', times,
        values: [
          [1, 1, 1],
          [1.26, 1.30, 1.18],
          [0.74, 0.72, 0.86],
          [0.80, 0.78, 0.88],
          [0.95, 0.95, 0.98],
          [1, 1, 1],
        ],
      },
      {
        node: 'Wing_FL', path: 'rotation', times,
        values: [
          quatEuler(0.16, -1.42, -0.34), quatEuler(0.20, -1.36, -0.30), quatEuler(0.28, -1.16, -0.18),
          quatEuler(0.32, -1.10, -0.12), quatEuler(0.18, -1.38, -0.32), quatEuler(0.16, -1.42, -0.34),
        ],
      },
      {
        node: 'Wing_FR', path: 'rotation', times,
        values: [
          quatEuler(0.16, 1.42, 0.34), quatEuler(0.20, 1.36, 0.30), quatEuler(0.28, 1.16, 0.18),
          quatEuler(0.32, 1.10, 0.12), quatEuler(0.18, 1.38, 0.32), quatEuler(0.16, 1.42, 0.34),
        ],
      },
      {
        node: 'Mandible_L', path: 'rotation', times,
        values: [0, 0.32, 0.44, 0.22, 0.06, 0].map((a) => quatEuler(0, a, 0)),
      },
      {
        node: 'Mandible_R', path: 'rotation', times,
        values: [0, -0.32, -0.44, -0.22, -0.06, 0].map((a) => quatEuler(0, a, 0)),
      },
    ]);
  }

  // 4. death (1.2s spit-organ deflation, leg curl & collapse on ground)
  {
    const times = [0, 0.22, 0.52, 0.82, 1.02, 1.2];
    sb.addAnimation('death', [
      {
        node: 'Body', path: 'translation', times,
        values: [
          [0, baseY, baseZ],
          [0, baseY + 0.09, baseZ - 0.05],
          [0.05, 0.16, baseZ - 0.03],
          [0.07, 0.11, baseZ - 0.02],
          [0.07, 0.11, baseZ - 0.02],
          [0.07, 0.11, baseZ - 0.02],
        ],
      },
      {
        node: 'Body', path: 'rotation', times,
        values: [
          quatEuler(0, 0, 0),
          quatEuler(-0.24, 0.10, 0.18),
          quatEuler(0.12, -0.18, -1.15),
          quatEuler(0.08, -0.24, -1.48),
          quatEuler(0.08, -0.24, -1.45),
          quatEuler(0.08, -0.24, -1.46),
        ],
      },
      {
        node: 'SpitOrgan', path: 'rotation', times,
        values: [0, -0.20, 0.28, 0.36, 0.34, 0.35].map((a) => quatEuler(a, 0, 0)),
      },
      {
        node: 'SpitSacs', path: 'scale', times,
        values: [[1, 1, 1], [1.18, 1.20, 1.10], [0.62, 0.54, 0.72], [0.52, 0.44, 0.65], [0.52, 0.44, 0.65], [0.52, 0.44, 0.65]],
      },
      {
        node: 'Wing_FL', path: 'rotation', times,
        values: [
          quatEuler(0.16, -1.42, -0.34), quatEuler(0.32, -1.05, -0.05), quatEuler(0.24, -0.88, 0.12),
          quatEuler(0.18, -0.92, 0.08), quatEuler(0.18, -0.92, 0.08), quatEuler(0.18, -0.92, 0.08),
        ],
      },
      ...legNames.map((ln) => {
        const sgn = ln.endsWith('L') ? 1 : -1;
        return {
          node: `Leg_${ln}`, path: 'rotation', times,
          values: [
            quatEuler(0, 0, 0), quatEuler(0, -sgn * 0.20, sgn * 0.30), quatEuler(0, sgn * 0.15, -sgn * 0.45),
            quatEuler(0, sgn * 0.22, -sgn * 0.62), quatEuler(0, sgn * 0.18, -sgn * 0.56), quatEuler(0, sgn * 0.20, -sgn * 0.60),
          ],
        };
      }),
      ...legNames.map((ln) => {
        const sgn = ln.endsWith('L') ? 1 : -1;
        return {
          node: `Shin_${ln}`, path: 'rotation', times,
          values: [
            quatEuler(0, 0, 0), quatEuler(0, 0, -sgn * 0.25), quatEuler(0, 0, -sgn * 0.65),
            quatEuler(0, 0, -sgn * 0.85), quatEuler(0, 0, -sgn * 0.78), quatEuler(0, 0, -sgn * 0.82),
          ],
        };
      }),
    ]);
  }

  sb.calibrate(0.9375, true);
  return sb;
}

// ============================================================================
// CLI Entry Point
// ============================================================================
function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const targets = [
    { file: 'locust_brooder.glb', builder: buildLocustBrooder },
    { file: 'locust_flying.glb', builder: buildLocustFlying },
    { file: 'locust_landed.glb', builder: buildLocustLanded },
  ];

  for (const t of targets) {
    const sb = t.builder();
    const glb = sb.toGLB();
    const outPath = path.join(OUT_DIR, t.file);
    fs.writeFileSync(outPath, glb);

    const verts = sb.computeWorldVertices();
    let maxR = 0, minY = Infinity, maxY = -Infinity;
    for (const v of verts) {
      const r = Math.hypot(v[0], v[2]);
      if (r > maxR) maxR = r;
      if (v[1] < minY) minY = v[1];
      if (v[1] > maxY) maxY = v[1];
    }
    const tris = sb.meshes.reduce((s, m) => s + m.geo.idx.length / 3, 0);
    const anims = sb.animations.map((a) => a.name).join(', ');
    console.log(
      `${t.file}: ${glb.length} bytes | ${tris} tris | radius=${maxR.toFixed(4)} | y=[${minY.toFixed(4)}, ${maxY.toFixed(4)}] | anims=[${anims}]`
    );
  }
}

if (require.main === module) {
  main();
}

module.exports = { buildLocustBrooder, buildLocustFlying, buildLocustLanded };
