// Zero-dependency headless Chrome WebGL2 GLB contact-sheet renderer for visual inspection.
// Loads the generated .glb files directly from disk, enables strict CCW backface culling,
// renders close-up 3/4 views + true -56 deg RTS zoom views + animation pose strips,
// and cleans up its temporary browser profile inside OUTPUT_DIR.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ASSET_SPECS, OUTPUT_DIR } from './build.mjs';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findBrowser() {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error('No headless Chromium browser found for preview rendering');
}

const HTML_PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: #14181f;
    color: #e2e8f0;
    font-family: Segoe UI, system-ui, sans-serif;
    overflow: hidden;
  }
  #sheet {
    display: block;
    width: 1920px;
    height: 1360px;
  }
</style>
</head>
<body>
<canvas id="sheet" width="1920" height="1360"></canvas>
<script type="module">
const ASSETS = [
  { file: '/watchkeeper.glb', title: 'watchkeeper.glb (r = 1.5625)', radius: 1.5625, poseClip: 'cast', poseTime: 0.85 },
  { file: '/bastion_turret.glb', title: 'bastion_turret.glb (r = 2.03125)', radius: 2.03125, poseClip: 'attack', poseTime: 0.12 },
  { file: '/dreadnought.glb', title: 'dreadnought.glb (r = 3.125)', radius: 3.125, poseClip: 'cast', poseTime: 0.75 },
];

function parseGLB(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const jsonLen = dv.getUint32(12, true);
  const jsonBytes = new Uint8Array(arrayBuffer, 20, jsonLen);
  const gltf = JSON.parse(new TextDecoder().decode(jsonBytes));
  const binOffset = 20 + jsonLen + 8;
  const binLen = dv.getUint32(20 + jsonLen, true);
  const binBuffer = arrayBuffer.slice(binOffset, binOffset + binLen);
  return { gltf, binBuffer };
}

function readAcc(gltf, binBuffer, idx) {
  const acc = gltf.accessors[idx];
  const bv = gltf.bufferViews[acc.bufferView];
  const byteOffset = bv.byteOffset + (acc.byteOffset || 0);
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  if (acc.componentType === 5126) return new Float32Array(binBuffer, byteOffset, acc.count * comps);
  if (acc.componentType === 5123) return new Uint16Array(binBuffer, byteOffset, acc.count * comps);
  if (acc.componentType === 5125) return new Uint32Array(binBuffer, byteOffset, acc.count * comps);
  throw new Error('Unsupported componentType ' + acc.componentType);
}

// Matrix & Quat helpers
function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}
function mat4Mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
function mat4FromTRS(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m = new Float32Array(16);
  m[0] = (1 - (yy + zz)) * s[0];
  m[1] = (xy + wz) * s[0];
  m[2] = (xz - wy) * s[0];
  m[4] = (xy - wz) * s[1];
  m[5] = (1 - (xx + zz)) * s[1];
  m[6] = (yz + wx) * s[1];
  m[8] = (xz + wy) * s[2];
  m[9] = (yz - wx) * s[2];
  m[10] = (1 - (xx + yy)) * s[2];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}
function mat4Perspective(fovRad, aspect, near, far) {
  const f = 1 / Math.tan(fovRad * 0.5);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}
function mat4LookAt(eye, target, up) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  let xl = Math.hypot(xx, xy, xz); xx /= xl; xy /= xl; xz /= xl;
  let yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx;
  m[4] = xy; m[5] = yy; m[6] = zy;
  m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

function sampleAnim(gltf, binBuffer, clipName, t) {
  const overrides = new Map();
  const anim = (gltf.animations || []).find((a) => a.name === clipName);
  if (!anim) return overrides;
  for (const ch of anim.channels) {
    const samp = anim.samplers[ch.sampler];
    const times = readAcc(gltf, binBuffer, samp.input);
    const vals = readAcc(gltf, binBuffer, samp.output);
    const isQ = ch.target.path === 'rotation';
    const comps = isQ ? 4 : 3;
    let idx = 0;
    while (idx < times.length - 2 && times[idx + 1] < t) idx++;
    const t0 = times[idx], t1 = times[idx + 1];
    const a = Math.max(0, Math.min(1, (t - t0) / Math.max(1e-6, t1 - t0)));
    const v0 = vals.subarray(idx * comps, (idx + 1) * comps);
    const v1 = vals.subarray((idx + 1) * comps, (idx + 2) * comps);
    let out;
    if (!isQ) {
      out = [v0[0] + (v1[0] - v0[0]) * a, v0[1] + (v1[1] - v0[1]) * a, v0[2] + (v1[2] - v0[2]) * a];
    } else {
      let bx = v1[0], by = v1[1], bz = v1[2], bw = v1[3];
      let d = v0[0]*bx + v0[1]*by + v0[2]*bz + v0[3]*bw;
      if (d < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
      out = [v0[0]+(bx-v0[0])*a, v0[1]+(by-v0[1])*a, v0[2]+(bz-v0[2])*a, v0[3]+(bw-v0[3])*a];
      const l = Math.hypot(...out);
      out = out.map((v) => v / l);
    }
    if (!overrides.has(ch.target.node)) overrides.set(ch.target.node, {});
    overrides.get(ch.target.node)[ch.target.path] = out;
  }
  return overrides;
}

// Offscreen WebGL2 renderer
const glCanvas = document.createElement('canvas');
glCanvas.width = 640;
glCanvas.height = 420;
const gl = glCanvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });

const VS = \`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
uniform mat4 uMVP;
uniform mat4 uModel;
out vec3 vWorldPos;
out vec3 vNormal;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(uModel) * aNrm);
  gl_Position = uMVP * vec4(aPos, 1.0);
}\`;

const FS = \`#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNormal;
uniform vec3 uCamPos;
uniform vec4 uBaseColor;
uniform float uMetallic;
uniform float uRoughness;
uniform vec3 uEmissive;
out vec4 fragColor;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  // Starfall Command directional sunlight + rim fill
  vec3 L1 = normalize(vec3(0.48, 0.79, 0.38));
  vec3 L2 = normalize(vec3(-0.62, 0.45, -0.64));
  vec3 H1 = normalize(V + L1);

  float ndl1 = max(dot(N, L1), 0.0);
  float ndl2 = max(dot(N, L2), 0.0);
  float ndh1 = max(dot(N, H1), 0.0);

  vec3 f0 = mix(vec3(0.04), uBaseColor.rgb, uMetallic);
  vec3 diffuseAlbedo = uBaseColor.rgb * (1.0 - uMetallic * 0.72);
  float shininess = mix(96.0, 8.0, clamp(uRoughness, 0.08, 1.0));
  vec3 spec = f0 * pow(ndh1, shininess) * mix(1.4, 0.2, uRoughness);

  // Sky-ground hemisphere ambient matching RTSWorld3D
  float hemi = N.y * 0.5 + 0.5;
  vec3 ambient = mix(vec3(0.11, 0.10, 0.11), vec3(0.34, 0.39, 0.48), hemi) * (uBaseColor.rgb * 0.85 + f0 * 0.35);

  vec3 col = ambient
    + (diffuseAlbedo * 1.15 + spec) * ndl1 * vec3(1.0, 0.95, 0.86)
    + diffuseAlbedo * ndl2 * vec3(0.32, 0.42, 0.58)
    + uEmissive * 1.35;

  col = pow(aces(col), vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}\`;

function compileShader(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}
const prog = gl.createProgram();
gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);

const loc = {
  uMVP: gl.getUniformLocation(prog, 'uMVP'),
  uModel: gl.getUniformLocation(prog, 'uModel'),
  uCamPos: gl.getUniformLocation(prog, 'uCamPos'),
  uBaseColor: gl.getUniformLocation(prog, 'uBaseColor'),
  uMetallic: gl.getUniformLocation(prog, 'uMetallic'),
  uRoughness: gl.getUniformLocation(prog, 'uRoughness'),
  uEmissive: gl.getUniformLocation(prog, 'uEmissive'),
};

// Build ground ring + forward -Z arrow helper geometry in WebGL
function createRingMesh(rInner, rOuter, segs = 64) {
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const base = pos.length / 3;
    pos.push(
      Math.cos(a0) * rInner, 0.005, Math.sin(a0) * rInner,
      Math.cos(a0) * rOuter, 0.005, Math.sin(a0) * rOuter,
      Math.cos(a1) * rOuter, 0.005, Math.sin(a1) * rOuter,
      Math.cos(a1) * rInner, 0.005, Math.sin(a1) * rInner,
    );
    for (let k = 0; k < 4; k++) nrm.push(0, 1, 0);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return uploadPrim(new Float32Array(pos), new Float32Array(nrm), new Uint16Array(idx));
}

function createArrowZ(r) {
  // Forward -Z indicator triangle outside ring
  const z0 = -(r + 0.12), z1 = -(r + 0.45);
  const pos = new Float32Array([
    -0.22, 0.005, z0,
    +0.22, 0.005, z0,
     0.00, 0.005, z1,
  ]);
  const nrm = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const idx = new Uint16Array([0, 1, 2]);
  return uploadPrim(pos, nrm, idx);
}

function createFloorQuad(halfSize = 8) {
  const pos = new Float32Array([
    -halfSize, -0.002, -halfSize,
    -halfSize, -0.002, +halfSize,
    +halfSize, -0.002, +halfSize,
    +halfSize, -0.002, -halfSize,
  ]);
  const nrm = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);
  return uploadPrim(pos, nrm, idx);
}

function uploadPrim(pos, nrm, idx) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bPos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bPos);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const bNrm = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bNrm);
  gl.bufferData(gl.ARRAY_BUFFER, nrm, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  const bIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return {
    vao,
    count: idx.length,
    indexType: idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
  };
}

const floorGpu = createFloorQuad(16);

function prepareAssetGpu(gltf, binBuffer) {
  const gpuMeshes = gltf.meshes.map((m) =>
    m.primitives.map((p) => {
      const pos = readAcc(gltf, binBuffer, p.attributes.POSITION);
      const nrm = readAcc(gltf, binBuffer, p.attributes.NORMAL);
      const idx = readAcc(gltf, binBuffer, p.indices);
      return { ...uploadPrim(pos, nrm, idx), mat: p.material };
    }),
  );
  return gpuMeshes;
}

function renderView({ gltf, binBuffer, gpuMeshes, radius, eye, target, fovDeg = 40, clip = null, time = 0, bg = [0.11, 0.13, 0.16] }) {
  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  gl.clearColor(bg[0], bg[1], bg[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CCW);

  gl.useProgram(prog);
  gl.uniform3fv(loc.uCamPos, eye);

  const proj = mat4Perspective((fovDeg * Math.PI) / 180, glCanvas.width / glCanvas.height, 0.1, 200);
  const view = mat4LookAt(eye, target, [0, 1, 0]);
  const vp = mat4Mul(proj, view);
  const ident = mat4Identity();

  // Draw floor
  gl.uniformMatrix4fv(loc.uModel, false, ident);
  gl.uniformMatrix4fv(loc.uMVP, false, vp);
  gl.uniform4f(loc.uBaseColor, 0.055, 0.068, 0.052, 1);
  gl.uniform1f(loc.uMetallic, 0.0);
  gl.uniform1f(loc.uRoughness, 0.95);
  gl.uniform3f(loc.uEmissive, 0, 0, 0);
  gl.bindVertexArray(floorGpu.vao);
  gl.drawElements(gl.TRIANGLES, floorGpu.count, floorGpu.indexType, 0);

  // Draw exact selection radius ring + forward -Z arrow
  const ring = createRingMesh(radius - 0.045, radius + 0.025);
  const arrow = createArrowZ(radius);
  gl.uniform4f(loc.uBaseColor, 0.12, 0.65, 0.35, 1);
  gl.uniform3f(loc.uEmissive, 0.08, 0.45, 0.22);
  gl.bindVertexArray(ring.vao);
  gl.drawElements(gl.TRIANGLES, ring.count, ring.indexType, 0);
  gl.uniform4f(loc.uBaseColor, 0.25, 0.85, 0.98, 1);
  gl.uniform3f(loc.uEmissive, 0.15, 0.55, 0.75);
  gl.bindVertexArray(arrow.vao);
  gl.drawElements(gl.TRIANGLES, arrow.count, arrow.indexType, 0);

  const overrides = clip ? sampleAnim(gltf, binBuffer, clip, time) : new Map();

  function drawNode(nIdx, parentMat) {
    const n = gltf.nodes[nIdx];
    const ov = overrides.get(nIdx) || {};
    const t = ov.translation || n.translation || [0, 0, 0];
    const r = ov.rotation || n.rotation || [0, 0, 0, 1];
    const s = ov.scale || n.scale || [1, 1, 1];
    const worldMat = mat4Mul(parentMat, mat4FromTRS(t, r, s));

    if (n.mesh !== undefined) {
      const mvp = mat4Mul(vp, worldMat);
      gl.uniformMatrix4fv(loc.uModel, false, worldMat);
      gl.uniformMatrix4fv(loc.uMVP, false, mvp);
      for (const prim of gpuMeshes[n.mesh]) {
        const mat = gltf.materials[prim.mat];
        const pbr = mat.pbrMetallicRoughness;
        const bc = pbr.baseColorFactor || [1, 1, 1, 1];
        const em = mat.emissiveFactor || [0, 0, 0];
        gl.uniform4fv(loc.uBaseColor, bc);
        gl.uniform1f(loc.uMetallic, pbr.metallicFactor ?? 0.2);
        gl.uniform1f(loc.uRoughness, pbr.roughnessFactor ?? 0.6);
        gl.uniform3fv(loc.uEmissive, em);
        gl.bindVertexArray(prim.vao);
        gl.drawElements(gl.TRIANGLES, prim.count, prim.indexType, 0);
      }
    }
    if (n.children) {
      for (const c of n.children) drawNode(c, worldMat);
    }
  }

  const scene = gltf.scenes[gltf.scene ?? 0];
  for (const rIdx of scene.nodes) drawNode(rIdx, ident);
}

const sheet = document.getElementById('sheet');
const ctx = sheet.getContext('2d');
ctx.fillStyle = '#0f131a';
ctx.fillRect(0, 0, sheet.width, sheet.height);

function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

for (let row = 0; row < ASSETS.length; row++) {
  const item = ASSETS[row];
  const buf = b64ToArrayBuffer(window.__GLB_B64[item.file]);
  const { gltf, binBuffer } = parseGLB(buf);
  const gpuMeshes = prepareAssetGpu(gltf, binBuffer);
  const r = item.radius;

  // 3 columns per asset:
  // Col 0: Close-up Hero 3/4 Front-Port View (showing -Z bow/muzzles, dorsal details, floor zero)
  // Col 1: Starfall Command RTS Camera Pitch (-56 deg looking down toward -Z/+X!)
  // Col 2: Animated Action Pose (cast / attack) + Rear-Starboard 3/4 angle
  const views = [
    {
      subtitle: 'Hero 3/4 Front (-Z Forward, Floor Y=0)',
      eye: [-r * 1.55, r * 1.15, -r * 1.85],
      target: [0, r * 0.34, 0],
      fovDeg: 38,
      clip: null,
      time: 0,
    },
    {
      subtitle: 'Starfall RTS Camera (-56° Pitch, 42° FOV, Facing -Z)',
      eye: [r * 0.65, r * 3.45, r * 2.32],
      target: [0, r * 0.16, -r * 0.08],
      fovDeg: 42,
      clip: item.file.includes('turret') ? 'idle' : 'hover',
      time: 0.45,
    },
    {
      subtitle: \`Animated "\${item.poseClip}" (t=\${item.poseTime}s)\`,
      eye: [r * 1.65, r * 1.25, -r * 1.70],
      target: [0, r * 0.38, 0],
      fovDeg: 38,
      clip: item.poseClip,
      time: item.poseTime,
    },
  ];

  for (let col = 0; col < 3; col++) {
    const v = views[col];
    renderView({ gltf, binBuffer, gpuMeshes, radius: r, ...v });
    const x = 16 + col * 634;
    const y = 44 + row * 442;
    ctx.drawImage(glCanvas, x, y, 620, 404);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 620, 404);

    ctx.fillStyle = 'rgba(15, 19, 26, 0.82)';
    ctx.fillRect(x + 8, y + 8, 410, 48);
    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 16px Segoe UI, sans-serif';
    ctx.fillText(item.title, x + 16, y + 28);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px Segoe UI, sans-serif';
    ctx.fillText(v.subtitle, x + 16, y + 48);
  }
}

ctx.fillStyle = '#f8fafc';
ctx.font = 'bold 20px Segoe UI, sans-serif';
ctx.fillText('Starfall Command — Meridian Air, Turret & Capital GLB Verification Sheet (Strict CCW Culling + Exact Radii)', 20, 30);
window.__RENDER_DONE = true;
</script>
</body>
</html>`;

export async function renderPreviewSheet() {
  const browser = findBrowser();
  const previewPath = join(OUTPUT_DIR, 'preview_sheet.png');
  const tmpProfile = join(OUTPUT_DIR, '.chrome-preview-profile');
  const tmpHtml = join(OUTPUT_DIR, '.preview-render.html');
  mkdirSync(tmpProfile, { recursive: true });

  const b64Obj = Object.fromEntries(
    ASSET_SPECS.map((s) => [`/${s.fileName}`, readFileSync(join(OUTPUT_DIR, s.fileName)).toString('base64')]),
  );
  const fullHtml = HTML_PAGE.replace(
    '<script type="module">',
    `<script>window.__GLB_B64 = ${JSON.stringify(b64Obj)};</script>\n<script type="module">`,
  );
  writeFileSync(tmpHtml, fullHtml, 'utf8');

  try {
    execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu-sandbox',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-angle=d3d11',
        '--window-size=1920,1360',
        '--hide-scrollbars',
        `--user-data-dir=${tmpProfile}`,
        `--screenshot=${previewPath}`,
        pathToFileURL(tmpHtml).href,
      ],
      { stdio: 'pipe', timeout: 15000 },
    );
  } finally {
    rmSync(tmpHtml, { force: true });
    rmSync(tmpProfile, { recursive: true, force: true });
  }
  return previewPath;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = await renderPreviewSheet();
  console.log(`Rendered preview sheet to ${out}`);
}
