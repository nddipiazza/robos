#!/usr/bin/env node
// Pure-Node 2x2 SSAA PBR + Soft-Shadow + Emissive GLB Preview Renderer
// Renders actual output .glb files from steep overhead gameplay camera, 3/4 hero, front (-Z), and animation states

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  sub3, add3, scale3, dot3, cross3, norm3, mat4TransformPoint, mat4TransformDir,
} from './math.mjs';
import { encodeDeterministicPNG } from './materials.mjs';
import { parseGLB, readAccessorArray, evaluateParsedSceneAtTime } from '../validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function makeLookAt(eye, target, upHint = [0, 1, 0]) {
  const fwd = norm3(sub3(target, eye));
  const right = norm3(cross3(fwd, upHint));
  const up = norm3(cross3(right, fwd));
  return { eye, target, fwd, right, up };
}

function projectPoint(cam, p, fovScale, aspect, halfW, halfH, orthoHalfH = null) {
  const rel = sub3(p, cam.eye);
  const cx = dot3(rel, cam.right);
  const cy = dot3(rel, cam.up);
  const cz = dot3(rel, cam.fwd); // depth > 0 in front of camera
  if (cz <= 0.05) return null;

  let ndcX, ndcY;
  if (orthoHalfH !== null) {
    ndcX = cx / (orthoHalfH * aspect);
    ndcY = cy / orthoHalfH;
  } else {
    ndcX = (cx / (cz * fovScale * aspect));
    ndcY = (cy / (cz * fovScale));
  }

  return [
    (ndcX * 0.5 + 0.5) * (halfW * 2),
    (0.5 - ndcY * 0.5) * (halfH * 2),
    cz,
  ];
}

function extractWorldTriangles(json, bin, animName = null, timeSec = 0) {
  const worldMats = evaluateParsedSceneAtTime(json, bin, animName, timeSec);
  const tris = [];

  for (let ni = 0; ni < json.nodes.length; ni++) {
    const node = json.nodes[ni];
    if (node.mesh === undefined || !worldMats[ni]) continue;
    const wm = worldMats[ni];
    const mesh = json.meshes[node.mesh];

    for (const prim of mesh.primitives) {
      const pos = readAccessorArray(json, bin, prim.attributes.POSITION).data;
      const norm = readAccessorArray(json, bin, prim.attributes.NORMAL).data;
      const idx = readAccessorArray(json, bin, prim.indices).data;
      const mat = json.materials[prim.material] || {};
      const pbr = mat.pbrMetallicRoughness || {};
      const baseColor = pbr.baseColorFactor || [0.8, 0.8, 0.8, 1.0];
      const metallic = pbr.metallicFactor ?? 0.3;
      const roughness = pbr.roughnessFactor ?? 0.5;
      const emissive = mat.emissiveFactor || [0, 0, 0];

      for (let i = 0; i < idx.length; i += 3) {
        const i0 = idx[i], i1 = idx[i + 1], i2 = idx[i + 2];
        const p0 = mat4TransformPoint(wm, [pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2]]);
        const p1 = mat4TransformPoint(wm, [pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2]]);
        const p2 = mat4TransformPoint(wm, [pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2]]);

        const n0 = mat4TransformDir(wm, [norm[i0 * 3], norm[i0 * 3 + 1], norm[i0 * 3 + 2]]);
        const n1 = mat4TransformDir(wm, [norm[i1 * 3], norm[i1 * 3 + 1], norm[i1 * 3 + 2]]);
        const n2 = mat4TransformDir(wm, [norm[i2 * 3], norm[i2 * 3 + 1], norm[i2 * 3 + 2]]);

        tris.push({
          p0, p1, p2,
          n0, n1, n2,
          baseColor,
          metallic,
          roughness,
          emissive,
        });
      }
    }
  }
  return tris;
}

function renderViewport(tris, opts) {
  const {
    width = 480,
    height = 480,
    eye = [0, 6, 6],
    target = [0, 0.8, 0],
    upHint = [0, 1, 0],
    fovDeg = 36,
    orthoHalfH = null,
    groundRadius = null,
    drawGroundGrid = true,
  } = opts;

  // 2x2 SSAA internal buffer
  const ss = 2;
  const W = width * ss;
  const H = height * ss;
  const zBuf = new Float32Array(W * H).fill(Infinity);
  const colorBuf = new Float32Array(W * H * 3);

  // Subtle dark slate RTS terrain background gradient so ivory, gold, teal & blue TeamColor all pop clearly!
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const bgR = 0.085 + v * 0.045;
    const bgG = 0.105 + v * 0.055;
    const bgB = 0.140 + v * 0.070;
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 3;
      colorBuf[idx + 0] = bgR;
      colorBuf[idx + 1] = bgG;
      colorBuf[idx + 2] = bgB;
    }
  }

  const cam = makeLookAt(eye, target, upHint);
  const fovScale = Math.tan((fovDeg * Math.PI) / 360);
  const aspect = W / H;

  // Build scene list + optional subtle reference ground disc at Y = -0.004 showing exact target XZ radius!
  const allTris = [...tris];
  if (drawGroundGrid && groundRadius) {
    const segs = 48;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const rIn = groundRadius * 0.985;
      const rOut = groundRadius * 1.005;
      // Thin subtle selection-radius guide ring at Y = -0.005
      const q0 = [Math.sin(a0) * rIn, -0.005, -Math.cos(a0) * rIn];
      const q1 = [Math.sin(a1) * rIn, -0.005, -Math.cos(a1) * rIn];
      const q2 = [Math.sin(a1) * rOut, -0.005, -Math.cos(a1) * rOut];
      const q3 = [Math.sin(a0) * rOut, -0.005, -Math.cos(a0) * rOut];
      const upN = [0, 1, 0];
      const ringCol = i === 0 || i === segs - 1
        ? [0.95, 0.78, 0.30, 1.0] // gold tick at -Z forward!
        : [0.22, 0.34, 0.42, 1.0];
      allTris.push(
        { p0: q0, p1: q2, p2: q1, n0: upN, n1: upN, n2: upN, baseColor: ringCol, metallic: 0.1, roughness: 0.8, emissive: [0.03, 0.06, 0.08] },
        { p0: q0, p1: q3, p2: q2, n0: upN, n1: upN, n2: upN, baseColor: ringCol, metallic: 0.1, roughness: 0.8, emissive: [0.03, 0.06, 0.08] }
      );
    }
  }

  // Sun key light + warm rim light + cool skylight
  const sunDir = norm3([0.52, 0.76, 0.38]);
  const fillDir = norm3([-0.62, 0.42, -0.55]);

  for (const tri of allTris) {
    const s0 = projectPoint(cam, tri.p0, fovScale, aspect, W * 0.5, H * 0.5, orthoHalfH);
    const s1 = projectPoint(cam, tri.p1, fovScale, aspect, W * 0.5, H * 0.5, orthoHalfH);
    const s2 = projectPoint(cam, tri.p2, fovScale, aspect, W * 0.5, H * 0.5, orthoHalfH);
    if (!s0 || !s1 || !s2) continue;

    // Backface cull in screen space (CCW in 3D with Y-down screen => signed area < 0 is front-facing)
    const area = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s1[1] - s0[1]) * (s2[0] - s0[0]);
    if (area >= -1e-5) continue;

    const minX = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(s0[0], s1[0], s2[0])));
    const minY = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(s0[1], s1[1], s2[1])));

    const invArea = 1.0 / area;

    for (let py = minY; py <= maxY; py++) {
      const cy = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5;
        const w0 = ((s2[0] - s1[0]) * (cy - s1[1]) - (s2[1] - s1[1]) * (cx - s1[0])) * invArea;
        if (w0 < 0) continue;
        const w1 = ((s0[0] - s2[0]) * (cy - s2[1]) - (s0[1] - s2[1]) * (cx - s2[0])) * invArea;
        if (w1 < 0) continue;
        const w2 = 1.0 - w0 - w1;
        if (w2 < 0) continue;

        // Perspective-correct interpolation
        const iz0 = w0 / s0[2];
        const iz1 = w1 / s1[2];
        const iz2 = w2 / s2[2];
        const invZ = iz0 + iz1 + iz2;
        const depth = 1.0 / invZ;

        const pIdx = py * W + px;
        if (depth >= zBuf[pIdx]) continue;
        zBuf[pIdx] = depth;

        const bw0 = iz0 * depth;
        const bw1 = iz1 * depth;
        const bw2 = iz2 * depth;

        const n = norm3([
          tri.n0[0] * bw0 + tri.n1[0] * bw1 + tri.n2[0] * bw2,
          tri.n0[1] * bw0 + tri.n1[1] * bw1 + tri.n2[1] * bw2,
          tri.n0[2] * bw0 + tri.n1[2] * bw1 + tri.n2[2] * bw2,
        ]);

        const wp = [
          tri.p0[0] * bw0 + tri.p1[0] * bw1 + tri.p2[0] * bw2,
          tri.p0[1] * bw0 + tri.p1[1] * bw1 + tri.p2[1] * bw2,
          tri.p0[2] * bw0 + tri.p1[2] * bw1 + tri.p2[2] * bw2,
        ];
        const viewDir = norm3(sub3(cam.eye, wp));

        // PBR-inspired Cook-Torrance / Blinn-GGX + sky hemisphere shading
        const ndl = Math.max(0, dot3(n, sunDir));
        const ndFill = Math.max(0, dot3(n, fillDir));
        const skyT = n[1] * 0.5 + 0.5;

        const halfVec = norm3(add3(sunDir, viewDir));
        const ndh = Math.max(0, dot3(n, halfVec));
        const shininess = Math.max(4, Math.pow(2, (1 - tri.roughness) * 7.5));
        const spec = Math.pow(ndh, shininess) * (0.25 + tri.metallic * 1.15) * (1.2 - tri.roughness * 0.7);

        // Fresnel rim for silhouette readability
        const fresnel = Math.pow(1 - Math.max(0, dot3(n, viewDir)), 3) * 0.22;

        const diffScale = 1.0 - tri.metallic * 0.52;
        const ambR = 0.24 + skyT * 0.20;
        const ambG = 0.25 + skyT * 0.22;
        const ambB = 0.29 + skyT * 0.26;

        const litR = (ambR + ndl * 0.92 + ndFill * 0.24) * diffScale;
        const litG = (ambG + ndl * 0.89 + ndFill * 0.26) * diffScale;
        const litB = (ambB + ndl * 0.84 + ndFill * 0.32) * diffScale;

        // Specular color blends white dielectric + baseColor metallic reflection
        const specColR = (1 - tri.metallic) * 1.0 + tri.metallic * tri.baseColor[0];
        const specColG = (1 - tri.metallic) * 0.99 + tri.metallic * tri.baseColor[1];
        const specColB = (1 - tri.metallic) * 0.96 + tri.metallic * tri.baseColor[2];

        let r = tri.baseColor[0] * litR + specColR * spec + fresnel * 0.55 + tri.emissive[0] * 1.15;
        let g = tri.baseColor[1] * litG + specColG * spec + fresnel * 0.70 + tri.emissive[1] * 1.15;
        let b = tri.baseColor[2] * litB + specColB * spec + fresnel * 0.80 + tri.emissive[2] * 1.15;

        // ACES-like soft highlight rolloff + sRGB gamma
        r = Math.pow(Math.min(1, r / (1 + r * 0.24)), 1 / 2.2);
        g = Math.pow(Math.min(1, g / (1 + g * 0.24)), 1 / 2.2);
        b = Math.pow(Math.min(1, b / (1 + b * 0.24)), 1 / 2.2);

        const cIdx = pIdx * 3;
        colorBuf[cIdx + 0] = r;
        colorBuf[cIdx + 1] = g;
        colorBuf[cIdx + 2] = b;
      }
    }
  }

  // Downsample 2x2 SSAA to RGBA8
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          const idx = ((y * ss + dy) * W + (x * ss + dx)) * 3;
          r += colorBuf[idx + 0];
          g += colorBuf[idx + 1];
          b += colorBuf[idx + 2];
        }
      }
      const scale = 255 / (ss * ss);
      const oIdx = (y * width + x) * 4;
      out[oIdx + 0] = Math.min(255, Math.round(r * scale));
      out[oIdx + 1] = Math.min(255, Math.round(g * scale));
      out[oIdx + 2] = Math.min(255, Math.round(b * scale));
      out[oIdx + 3] = 255;
    }
  }

  return out;
}

function stitchGrid2x2(tiles, tileW, tileH) {
  const W = tileW * 2;
  const H = tileH * 2;
  const out = Buffer.alloc(W * H * 4);
  for (let ti = 0; ti < 4; ti++) {
    const gx = (ti % 2) * tileW;
    const gy = Math.floor(ti / 2) * tileH;
    const src = tiles[ti];
    for (let y = 0; y < tileH; y++) {
      src.copy(out, ((gy + y) * W + gx) * 4, y * tileW * 4, (y + 1) * tileW * 4);
    }
  }
  return encodeDeterministicPNG(W, H, out);
}

export function renderAllAssetSheets() {
  const outDir = path.join(ROOT_DIR, 'renders');
  fs.mkdirSync(outDir, { recursive: true });

  const configs = [
    { file: 'sunseer.glb', r: 1.875, midY: 0.55, actionClip: 'attack', actionT: 0.45, deathT: 1.6 },
    { file: 'stasis_ward.glb', r: 1.25, midY: 1.05, actionClip: 'cast', actionT: 0.56, deathT: 1.5 },
    { file: 'star_assembly.glb', r: 3.75, midY: 0.95, actionClip: 'cast', actionT: 0.72, deathT: 1.8 },
    { file: 'fleet_spire.glb', r: 3.75, midY: 2.35, actionClip: 'cast', actionT: 0.68, deathT: 1.9 },
  ];

  const tileW = 420;
  const tileH = 420;

  for (const cfg of configs) {
    const glbBuf = fs.readFileSync(path.join(ROOT_DIR, cfg.file));
    const { json, bin } = parseGLB(glbBuf);
    const restTris = extractWorldTriangles(json, bin, null, 0);
    const actionTris = extractWorldTriangles(json, bin, cfg.actionClip, cfg.actionT);
    const deathTris = extractWorldTriangles(json, bin, 'death', cfg.deathT);

    const dist = cfg.r * 3.45 + cfg.midY * 0.65;

    // Tile 0 (Top-Left): Steep Overhead RTS Gameplay Camera (~63 deg pitch down, looking toward -Z forward = up screen!)
    const t0 = renderViewport(restTris, {
      width: tileW,
      height: tileH,
      eye: [0, dist * 1.02, dist * 0.50],
      target: [0, cfg.midY * 0.45, 0],
      upHint: [0, 1, 0],
      fovDeg: 36,
      groundRadius: cfg.r,
    });

    // Tile 1 (Top-Right): 3/4 Hero Isometric View (shows vertical profile, suspended cores/prisms, BeamOrigin!)
    const t1 = renderViewport(restTris, {
      width: tileW,
      height: tileH,
      eye: [dist * 0.76, dist * 0.58 + cfg.midY * 0.3, -dist * 0.78], // looking at -Z front-starboard 3/4!
      target: [0, cfg.midY * 0.85, 0],
      upHint: [0, 1, 0],
      fovDeg: 35,
      groundRadius: cfg.r,
    });

    // Tile 2 (Bottom-Left): Attack / Cast Peak Keyframe (3/4 front-overhead)
    const t2 = renderViewport(actionTris, {
      width: tileW,
      height: tileH,
      eye: [-dist * 0.65, dist * 0.68 + cfg.midY * 0.25, -dist * 0.82],
      target: [0, cfg.midY * 0.85, 0],
      upHint: [0, 1, 0],
      fovDeg: 36,
      groundRadius: cfg.r,
    });

    // Tile 3 (Bottom-Right): Death Collapse Keyframe
    const t3 = renderViewport(deathTris, {
      width: tileW,
      height: tileH,
      eye: [dist * 0.70, dist * 0.72 + cfg.midY * 0.2, dist * 0.70],
      target: [0, cfg.midY * 0.55, 0],
      upHint: [0, 1, 0],
      fovDeg: 36,
      groundRadius: cfg.r,
    });

    const png = stitchGrid2x2([t0, t1, t2, t3], tileW, tileH);
    const outPath = path.join(outDir, cfg.file.replace('.glb', '_sheet.png'));
    fs.writeFileSync(outPath, png);
    console.log(`Rendered contact sheet: ${outPath}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  renderAllAssetSheets();
}
