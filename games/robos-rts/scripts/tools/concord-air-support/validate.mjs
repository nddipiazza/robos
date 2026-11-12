#!/usr/bin/env node
// Comprehensive offline glTF 2.0 binary/schema/bounds/animation/determinism validator
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  lerp3, quatSlerp, quatNormalize, mat4Identity, mat4FromTRS, mat4Mul, mat4TransformPoint, mat4TransformDir,
} from './src/math.mjs';
import { buildAllAssetsInMemory, writeAllAssets } from './build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ASSET_SPECS = [
  {
    filename: 'sunseer.glb',
    targetXZRadius: 1.875,
    maxTriangles: 6000,
    requiredIdleClips: ['hover', 'idle'],
    requiredActionClips: ['attack'],
    requiredSockets: ['BeamOrigin'],
  },
  {
    filename: 'stasis_ward.glb',
    targetXZRadius: 1.25,
    maxTriangles: 6000,
    requiredIdleClips: ['hover', 'idle'],
    requiredActionClips: ['cast'],
    requiredSockets: [],
  },
  {
    filename: 'star_assembly.glb',
    targetXZRadius: 3.75,
    maxTriangles: 6000,
    requiredIdleClips: ['idle'],
    requiredActionClips: ['cast'],
    requiredSockets: [],
  },
  {
    filename: 'fleet_spire.glb',
    targetXZRadius: 3.75,
    maxTriangles: 6000,
    requiredIdleClips: ['idle'],
    requiredActionClips: ['cast'],
    requiredSockets: [],
  },
];

export function parseGLB(buffer) {
  if (buffer.length < 28) {
    throw new Error(`GLB buffer too short (${buffer.length} bytes)`);
  }
  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  const totalLen = buffer.readUInt32LE(8);
  if (magic !== 0x46546c67) throw new Error(`Invalid GLB magic: 0x${magic.toString(16)}`);
  if (version !== 2) throw new Error(`Unsupported GLB version: ${version}`);
  if (totalLen !== buffer.length) {
    throw new Error(`GLB header length (${totalLen}) !== file length (${buffer.length})`);
  }

  const jsonChunkLen = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a) throw new Error('First GLB chunk must be JSON');
  if (jsonChunkLen % 4 !== 0) throw new Error('JSON chunk length not 4-byte aligned');

  const jsonSlice = buffer.subarray(20, 20 + jsonChunkLen);
  const json = JSON.parse(jsonSlice.toString('utf8'));

  const binHeaderOffset = 20 + jsonChunkLen;
  const binChunkLen = buffer.readUInt32LE(binHeaderOffset);
  const binChunkType = buffer.readUInt32LE(binHeaderOffset + 4);
  if (binChunkType !== 0x004e4942) throw new Error('Second GLB chunk must be BIN');
  if (binChunkLen % 4 !== 0) throw new Error('BIN chunk length not 4-byte aligned');
  if (binHeaderOffset + 8 + binChunkLen !== buffer.length) {
    throw new Error('Trailing bytes after BIN chunk');
  }

  const bin = buffer.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binChunkLen);
  return { json, bin };
}

export function readAccessorArray(json, bin, accIdx) {
  const acc = json.accessors[accIdx];
  if (!acc) throw new Error(`Missing accessor ${accIdx}`);
  const bv = json.bufferViews[acc.bufferView];
  if (!bv) throw new Error(`Missing bufferView ${acc.bufferView}`);

  const compCountMap = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const comps = compCountMap[acc.type];
  if (!comps) throw new Error(`Unsupported accessor type: ${acc.type}`);

  const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const elemCount = acc.count * comps;

  let TypedCtor;
  let bytesPerComp;
  switch (acc.componentType) {
    case 5126: TypedCtor = Float32Array; bytesPerComp = 4; break;
    case 5125: TypedCtor = Uint32Array; bytesPerComp = 4; break;
    case 5123: TypedCtor = Uint16Array; bytesPerComp = 2; break;
    case 5121: TypedCtor = Uint8Array; bytesPerComp = 1; break;
    default: throw new Error(`Unsupported componentType: ${acc.componentType}`);
  }

  const byteLen = elemCount * bytesPerComp;
  if (byteOffset + byteLen > bin.length) {
    throw new Error(`Accessor ${accIdx} reads past BIN buffer`);
  }
  const alignedCopy = Buffer.alloc(byteLen);
  bin.copy(alignedCopy, 0, byteOffset, byteOffset + byteLen);
  return {
    accessor: acc,
    bufferView: bv,
    comps,
    data: new TypedCtor(alignedCopy.buffer, alignedCopy.byteOffset, elemCount),
  };
}

export function evaluateSceneAtTime(json, animIndex = null, timeSec = 0) {
  const nodeTRS = json.nodes.map((n) => ({
    t: n.translation ? [...n.translation] : [0, 0, 0],
    r: n.rotation ? [...n.rotation] : [0, 0, 0, 1],
    s: n.scale ? [...n.scale] : [1, 1, 1],
  }));

  if (animIndex !== null && json.animations && json.animations[animIndex]) {
    throw new Error('Use evaluateParsedSceneAtTime with bin');
  }
  return nodeTRS;
}

export function evaluateParsedSceneAtTime(json, bin, animName = null, timeSec = 0) {
  const nodeTRS = json.nodes.map((n) => ({
    t: n.translation ? [...n.translation] : [0, 0, 0],
    r: n.rotation ? [...n.rotation] : [0, 0, 0, 1],
    s: n.scale ? [...n.scale] : [1, 1, 1],
  }));

  if (animName !== null && json.animations) {
    const anim = json.animations.find((a) => a.name === animName);
    if (anim) {
      for (const ch of anim.channels) {
        const samp = anim.samplers[ch.sampler];
        const times = readAccessorArray(json, bin, samp.input).data;
        const out = readAccessorArray(json, bin, samp.output);
        const targetNode = ch.target.node;
        const pathName = ch.target.path;

        let idx0 = 0;
        let idx1 = 0;
        let alpha = 0;
        if (timeSec <= times[0] || times.length === 1) {
          idx0 = 0; idx1 = 0; alpha = 0;
        } else if (timeSec >= times[times.length - 1]) {
          idx0 = times.length - 1; idx1 = idx0; alpha = 0;
        } else {
          for (let k = 0; k < times.length - 1; k++) {
            if (timeSec >= times[k] && timeSec <= times[k + 1]) {
              idx0 = k;
              idx1 = k + 1;
              const span = times[k + 1] - times[k];
              alpha = span > 1e-8 ? (timeSec - times[k]) / span : 0;
              break;
            }
          }
        }

        if (samp.interpolation === 'STEP') alpha = 0;

        if (pathName === 'rotation') {
          const q0 = [out.data[idx0 * 4], out.data[idx0 * 4 + 1], out.data[idx0 * 4 + 2], out.data[idx0 * 4 + 3]];
          const q1 = [out.data[idx1 * 4], out.data[idx1 * 4 + 1], out.data[idx1 * 4 + 2], out.data[idx1 * 4 + 3]];
          nodeTRS[targetNode].r = quatSlerp(q0, q1, alpha);
        } else {
          const v0 = [out.data[idx0 * 3], out.data[idx0 * 3 + 1], out.data[idx0 * 3 + 2]];
          const v1 = [out.data[idx1 * 3], out.data[idx1 * 3 + 1], out.data[idx1 * 3 + 2]];
          const v = lerp3(v0, v1, alpha);
          if (pathName === 'translation') nodeTRS[targetNode].t = v;
          else if (pathName === 'scale') nodeTRS[targetNode].s = v;
        }
      }
    }
  }

  const worldMats = new Array(json.nodes.length).fill(null);
  const scene = json.scenes[json.scene ?? 0];

  const visit = (nodeIdx, parentMat, visitedSet) => {
    if (visitedSet.has(nodeIdx)) throw new Error(`Cycle detected at node ${nodeIdx}`);
    const nextSet = new Set(visitedSet);
    nextSet.add(nodeIdx);
    const trs = nodeTRS[nodeIdx];
    const local = mat4FromTRS(trs.t, trs.r, trs.s);
    const world = mat4Mul(parentMat, local);
    worldMats[nodeIdx] = world;
    const children = json.nodes[nodeIdx].children || [];
    for (const c of children) visit(c, world, nextSet);
  };

  for (const rootIdx of scene.nodes) {
    visit(rootIdx, mat4Identity(), new Set());
  }

  return worldMats;
}

function validateSingleGLB(buffer, spec) {
  const errors = [];
  const assert = (cond, msg) => { if (!cond) errors.push(msg); };

  const { json, bin } = parseGLB(buffer);

  // 1. Top-level schema checks
  assert(json.asset && json.asset.version === '2.0', 'asset.version must be "2.0"');
  assert(Array.isArray(json.scenes) && json.scenes.length >= 1, 'Missing scenes');
  assert(Array.isArray(json.nodes) && json.nodes.length >= 2, 'Missing nodes');
  assert(Array.isArray(json.meshes) && json.meshes.length >= 1, 'Missing meshes');
  assert(Array.isArray(json.materials) && json.materials.length >= 4, 'Missing Concord materials');
  assert(Array.isArray(json.buffers) && json.buffers.length === 1, 'Must have 1 binary buffer');
  assert(json.buffers[0].byteLength === bin.length, 'buffer[0].byteLength mismatch with BIN chunk');

  // 2. Material checks (Ivory, Gold, Teal emissive, opaque TeamColor)
  const teamMat = json.materials.find((m) => m.name === 'TeamColor');
  assert(Boolean(teamMat), 'Missing required "TeamColor" material');
  if (teamMat) {
    assert((teamMat.alphaMode || 'OPAQUE') === 'OPAQUE', 'TeamColor material must be OPAQUE');
  }
  const hasEmissiveTeal = json.materials.some(
    (m) => Array.isArray(m.emissiveFactor) && m.emissiveFactor[1] > 0.5 && m.emissiveFactor[2] > 0.5
  );
  assert(hasEmissiveTeal, 'Missing luminous teal emissive material');

  // 3. Embedded image checks (if present, verify PNG header & no external URIs)
  if (json.images) {
    for (let i = 0; i < json.images.length; i++) {
      const img = json.images[i];
      assert(!img.uri, `Image ${i} uses external URI (must be self-contained offline GLB)`);
      const bv = json.bufferViews[img.bufferView];
      assert(Boolean(bv), `Image ${i} missing bufferView`);
      if (bv) {
        const sig = bin.subarray(bv.byteOffset, bv.byteOffset + 8);
        assert(
          sig[0] === 137 && sig[1] === 80 && sig[2] === 78 && sig[3] === 71,
          `Image ${i} is not a valid PNG`
        );
      }
    }
  }

  // 4. BufferViews & Accessors strict validation
  for (let i = 0; i < json.bufferViews.length; i++) {
    const bv = json.bufferViews[i];
    assert(bv.buffer === 0, `bufferView ${i} invalid buffer index`);
    assert((bv.byteOffset ?? 0) % 4 === 0, `bufferView ${i} byteOffset (${bv.byteOffset}) not 4-byte aligned`);
    assert(bv.byteOffset + bv.byteLength <= bin.length, `bufferView ${i} exceeds buffer bounds`);
  }

  for (let i = 0; i < json.accessors.length; i++) {
    const { accessor, comps, data } = readAccessorArray(json, bin, i);
    assert(accessor.count > 0, `Accessor ${i} has count 0`);
    for (let k = 0; k < data.length; k++) {
      if (!Number.isFinite(data[k])) {
        errors.push(`Accessor ${i} contains non-finite value at ${k}`);
        break;
      }
    }
    if (accessor.min && accessor.max) {
      for (let c = 0; c < comps; c++) {
        let minV = Infinity, maxV = -Infinity;
        for (let r = 0; r < accessor.count; r++) {
          const v = data[r * comps + c];
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
        assert(Math.abs(minV - accessor.min[c]) <= 1e-5, `Accessor ${i} min[${c}] mismatch (${minV} vs ${accessor.min[c]})`);
        assert(Math.abs(maxV - accessor.max[c]) <= 1e-5, `Accessor ${i} max[${c}] mismatch (${maxV} vs ${accessor.max[c]})`);
      }
    }
  }

  // 5. Rest-pose world bounds, normals, triangle count & TeamColor usage
  const restWorld = evaluateParsedSceneAtTime(json, bin, null, 0);
  let totalTris = 0;
  let teamColorTris = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let xzRadius = 0;

  const restVertexSamples = [];

  for (let ni = 0; ni < json.nodes.length; ni++) {
    const node = json.nodes[ni];
    if (node.rotation) {
      const ql = Math.hypot(...node.rotation);
      assert(Math.abs(ql - 1) < 1e-3, `Node ${node.name} non-unit quaternion (${ql})`);
    }
    if (node.mesh === undefined || !restWorld[ni]) continue;

    const mesh = json.meshes[node.mesh];
    const wm = restWorld[ni];
    for (const prim of mesh.primitives) {
      const pos = readAccessorArray(json, bin, prim.attributes.POSITION).data;
      const norm = readAccessorArray(json, bin, prim.attributes.NORMAL).data;
      const idx = readAccessorArray(json, bin, prim.indices).data;
      const vCount = pos.length / 3;

      assert(idx.length % 3 === 0, `Mesh ${mesh.name} indices not multiple of 3`);
      const tris = idx.length / 3;
      totalTris += tris;
      if (json.materials[prim.material]?.name === 'TeamColor') {
        teamColorTris += tris;
      }

      for (let k = 0; k < idx.length; k++) {
        if (idx[k] >= vCount) {
          errors.push(`Mesh ${mesh.name} index out of bounds (${idx[k]} >= ${vCount})`);
          break;
        }
      }

      for (let v = 0; v < vCount; v++) {
        const nl = Math.hypot(norm[v * 3], norm[v * 3 + 1], norm[v * 3 + 2]);
        if (Math.abs(nl - 1) > 2e-3) {
          errors.push(`Mesh ${mesh.name} non-unit normal at vertex ${v} (len=${nl})`);
          break;
        }
        const wp = mat4TransformPoint(wm, [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
        if (wp[0] < minX) minX = wp[0];
        if (wp[1] < minY) minY = wp[1];
        if (wp[2] < minZ) minZ = wp[2];
        if (wp[0] > maxX) maxX = wp[0];
        if (wp[1] > maxY) maxY = wp[1];
        if (wp[2] > maxZ) maxZ = wp[2];
        const r = Math.hypot(wp[0], wp[2]);
        if (r > xzRadius) xzRadius = r;

        if (v % 5 === 0) {
          restVertexSamples.push({ nodeIdx: ni, local: [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], restWorld: wp });
        }
      }
    }
  }

  assert(totalTris > 300 && totalTris < spec.maxTriangles, `Triangle count ${totalTris} out of budget (< ${spec.maxTriangles})`);
  assert(teamColorTris >= 16, `Insufficient TeamColor geometry (${teamColorTris} tris)`);
  assert(Math.abs(minY - 0) <= 1e-4, `minY (${minY.toFixed(6)}) must be 0`);
  assert(
    Math.abs(xzRadius - spec.targetXZRadius) <= 2e-3,
    `xzRadius (${xzRadius.toFixed(5)}) !== target (${spec.targetXZRadius})`
  );

  // 6. Required sockets (e.g., BeamOrigin under nose on Sunseer, facing -Z)
  for (const sockName of spec.requiredSockets) {
    const sIdx = json.nodes.findIndex((n) => n.name === sockName);
    assert(sIdx !== -1, `Missing required socket node "${sockName}"`);
    if (sIdx !== -1) {
      const wm = restWorld[sIdx];
      const sp = mat4TransformPoint(wm, [0, 0, 0]);
      const fwd = mat4TransformDir(wm, [0, 0, -1]);
      assert(sp[2] < -0.75, `${sockName} z (${sp[2].toFixed(3)}) is not under forward -Z nose`);
      assert(sp[1] > 0.05 && sp[1] < maxY * 0.75, `${sockName} y (${sp[1].toFixed(3)}) is not under the nose`);
      assert(fwd[2] < -0.95, `${sockName} forward vector does not point -Z (${fwd.map((x) => x.toFixed(2))})`);
    }
  }

  // 7. Animation clips validation
  assert(Array.isArray(json.animations) && json.animations.length >= 3, 'Must have >= 3 animation clips');
  const animNames = (json.animations || []).map((a) => a.name);

  for (const req of spec.requiredIdleClips) {
    assert(animNames.includes(req), `Missing expected idle/hover clip "${req}"`);
  }
  for (const req of spec.requiredActionClips) {
    assert(animNames.includes(req), `Missing expected attack/cast clip "${req}"`);
  }
  assert(animNames.includes('death'), 'Missing required "death" clip');

  for (const anim of json.animations || []) {
    assert(anim.channels.length > 0, `Animation "${anim.name}" has 0 channels`);

    // Check animation bufferViews do NOT set GPU vertex buffer target (strict glTF 2.0 rule)
    let duration = 0;
    let directlyTargetsMeshNode = false;

    for (const ch of anim.channels) {
      const samp = anim.samplers[ch.sampler];
      const inRes = readAccessorArray(json, bin, samp.input);
      const outRes = readAccessorArray(json, bin, samp.output);
      assert(inRes.bufferView.target === undefined, `Animation "${anim.name}" input bufferView must not set target`);
      assert(outRes.bufferView.target === undefined, `Animation "${anim.name}" output bufferView must not set target`);
      assert(Math.abs(inRes.data[0] - 0) <= 1e-5, `Animation "${anim.name}" must start at t=0`);

      for (let k = 1; k < inRes.data.length; k++) {
        assert(inRes.data[k] > inRes.data[k - 1], `Animation "${anim.name}" timestamps not strictly increasing`);
      }
      if (inRes.data[inRes.data.length - 1] > duration) {
        duration = inRes.data[inRes.data.length - 1];
      }
      assert(inRes.accessor.count === outRes.accessor.count, `Animation "${anim.name}" input/output count mismatch`);

      const targetNode = json.nodes[ch.target.node];
      assert(Boolean(targetNode), `Animation "${anim.name}" invalid target node`);
      if (targetNode && targetNode.mesh !== undefined) {
        directlyTargetsMeshNode = true;
      }
    }

    assert(directlyTargetsMeshNode, `Animation "${anim.name}" does not directly animate any visible mesh node`);

    // Evaluate motion across 5 sample times to confirm visible vertices actually move!
    let maxDisplacement = 0;
    let minAnimY = Infinity;
    for (const frac of [0.2, 0.4, 0.6, 0.8, 1.0]) {
      const t = duration * frac;
      const wmAtT = evaluateParsedSceneAtTime(json, bin, anim.name, t);
      for (const s of restVertexSamples) {
        const pNow = mat4TransformPoint(wmAtT[s.nodeIdx], s.local);
        const d = Math.hypot(pNow[0] - s.restWorld[0], pNow[1] - s.restWorld[1], pNow[2] - s.restWorld[2]);
        if (d > maxDisplacement) maxDisplacement = d;
        if (pNow[1] < minAnimY) minAnimY = pNow[1];
      }
    }
    assert(
      maxDisplacement > 0.05,
      `Animation "${anim.name}" fails visible motion check (maxDisplacement=${maxDisplacement.toFixed(4)})`
    );
    assert(
      minAnimY >= -0.03,
      `Animation "${anim.name}" dips below ground Y=0 (minAnimY=${minAnimY.toFixed(4)})`
    );
  }

  return {
    filename: spec.filename,
    ok: errors.length === 0,
    errors,
    stats: {
      bytes: buffer.length,
      triangles: totalTris,
      teamColorTriangles: teamColorTris,
      xzRadius,
      minY,
      aabb: {
        x: [minX, maxX],
        y: [minY, maxY],
        z: [minZ, maxZ],
      },
      animations: animNames,
    },
  };
}

export function runFullValidation(baseDir = __dirname) {
  console.log('=== Starfall Command: Aurelian Concord GLB Validator ===\n');
  let allPassed = true;

  // 1. Validate on-disk GLB files
  const diskBuffers = new Map();
  for (const spec of ASSET_SPECS) {
    const filePath = path.join(baseDir, spec.filename);
    if (!fs.existsSync(filePath)) {
      console.error(`[FAIL] Missing file: ${filePath}`);
      allPassed = false;
      continue;
    }
    const buf = fs.readFileSync(filePath);
    diskBuffers.set(spec.filename, buf);

    const res = validateSingleGLB(buf, spec);
    if (!res.ok) {
      allPassed = false;
      console.error(`[FAIL] ${spec.filename}:`);
      for (const err of res.errors) console.error(`   x ${err}`);
    } else {
      const s = res.stats;
      console.log(
        `[PASS] ${spec.filename.padEnd(18)} | tris: ${String(s.triangles).padStart(4)}/<6000 ` +
        `(TeamColor: ${String(s.teamColorTriangles).padStart(3)}) | ` +
        `xzRadius: ${s.xzRadius.toFixed(4)} (target ${spec.targetXZRadius}) | ` +
        `minY: ${s.minY.toFixed(5)} | H: ${s.aabb.y[1].toFixed(2)}m | clips: [${s.animations.join(', ')}]`
      );
    }
  }

  // 2. Two-build byte-for-byte determinism check (Build A vs Build B vs On-Disk)
  console.log('\n--- Deterministic Two-Build Verification ---');
  const tmpDirA = path.join(baseDir, '.verify-build-a');
  const tmpDirB = path.join(baseDir, '.verify-build-b');
  try {
    const buildA = writeAllAssets(tmpDirA);
    const buildB = writeAllAssets(tmpDirB);

    for (let i = 0; i < ASSET_SPECS.length; i++) {
      const name = ASSET_SPECS[i].filename;
      const bytesA = fs.readFileSync(path.join(tmpDirA, name));
      const bytesB = fs.readFileSync(path.join(tmpDirB, name));
      const bytesDisk = diskBuffers.get(name);

      const hashA = crypto.createHash('sha256').update(bytesA).digest('hex');
      const hashB = crypto.createHash('sha256').update(bytesB).digest('hex');
      const hashDisk = bytesDisk ? crypto.createHash('sha256').update(bytesDisk).digest('hex') : 'MISSING';

      const matchAB = Buffer.compare(bytesA, bytesB) === 0 && hashA === hashB;
      const matchDisk = bytesDisk && Buffer.compare(bytesA, bytesDisk) === 0 && hashA === hashDisk;

      if (matchAB && matchDisk && buildA[i].sha256 === buildB[i].sha256) {
        console.log(`[PASS] ${name.padEnd(18)} byte-identical across 2 clean builds & output (${bytesA.length} B, sha256=${hashA.slice(0, 16)}...)`);
      } else {
        allPassed = false;
        console.error(`[FAIL] ${name} determinism mismatch! A=${hashA} B=${hashB} Disk=${hashDisk}`);
      }
    }
  } finally {
    fs.rmSync(tmpDirA, { recursive: true, force: true });
    fs.rmSync(tmpDirB, { recursive: true, force: true });
  }

  if (!allPassed) {
    console.error('\nVALIDATION FAILED.');
    process.exitCode = 1;
  } else {
    console.log('\nALL SCHEMA, BOUNDS, TRIANGLE, SOCKET, ANIMATION & DETERMINISM CHECKS PASSED.');
  }
  return allPassed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runFullValidation(__dirname);
}
