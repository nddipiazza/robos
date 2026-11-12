// Comprehensive independent binary GLB validator & determinism tester.
// Parses watchkeeper.glb, bastion_turret.glb, and dreadnought.glb directly from binary disk buffers.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSET_SPECS, OUTPUT_DIR, buildAllInMemory } from './build.mjs';
import { add3, cross3, len3, quatMul, quatNormalize, rotateVecByQuat, sub3 } from './math.mjs';

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`VALIDATION FAILED: ${msg}`);
  }
}

export function parseGLB(buf, label) {
  assert(buf.length >= 28, `${label}: buffer too small (${buf.length})`);
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const totalLen = buf.readUInt32LE(8);
  assert(magic === 0x46546c67, `${label}: invalid GLB magic 0x${magic.toString(16)}`);
  assert(version === 2, `${label}: expected GLB version 2, got ${version}`);
  assert(totalLen === buf.length, `${label}: header length ${totalLen} != buffer length ${buf.length}`);
  assert(totalLen % 4 === 0, `${label}: total length ${totalLen} not 4-byte aligned`);

  const jsonLen = buf.readUInt32LE(12);
  const jsonType = buf.readUInt32LE(16);
  assert(jsonType === 0x4e4f534a, `${label}: chunk 0 is not JSON`);
  assert(jsonLen % 4 === 0, `${label}: JSON chunk length not 4-byte aligned`);
  const jsonStr = buf.subarray(20, 20 + jsonLen).toString('utf8');
  const gltf = JSON.parse(jsonStr);

  const binHeaderOffset = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binHeaderOffset);
  const binType = buf.readUInt32LE(binHeaderOffset + 4);
  assert(binType === 0x004e4942, `${label}: chunk 1 is not BIN`);
  assert(binLen % 4 === 0, `${label}: BIN chunk length not 4-byte aligned`);
  assert(binHeaderOffset + 8 + binLen === totalLen, `${label}: chunk lengths do not sum to totalLen`);

  const binChunk = buf.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binLen);
  return { gltf, binChunk };
}

function readAccessor(gltf, binChunk, accIdx, label) {
  const acc = gltf.accessors[accIdx];
  assert(acc, `${label}: missing accessor ${accIdx}`);
  const bv = gltf.bufferViews[acc.bufferView];
  assert(bv, `${label}: missing bufferView ${acc.bufferView}`);
  assert(bv.byteOffset % 4 === 0, `${label}: bufferView ${acc.bufferView} byteOffset ${bv.byteOffset} not 4-byte aligned`);
  assert(bv.byteOffset + bv.byteLength <= binChunk.length, `${label}: bufferView ${acc.bufferView} out of bounds`);

  const numComps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
  assert(numComps, `${label}: unsupported accessor type ${acc.type}`);

  const slice = binChunk.subarray(bv.byteOffset + (acc.byteOffset || 0), bv.byteOffset + bv.byteLength);
  const copy = Buffer.from(slice); // ensure aligned ArrayBuffer for TypedArray view

  if (acc.componentType === 5126) {
    const arr = new Float32Array(copy.buffer, copy.byteOffset, acc.count * numComps);
    for (let i = 0; i < arr.length; i++) {
      assert(Number.isFinite(arr[i]), `${label}: NaN/Inf in accessor ${accIdx} at ${i}`);
    }
    if (acc.min && acc.max) {
      for (let c = 0; c < numComps; c++) {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < acc.count; i++) {
          const v = arr[i * numComps + c];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        assert(Math.abs(lo - acc.min[c]) <= 1e-5, `${label}: accessor ${accIdx} min[${c}] mismatch (${lo} vs ${acc.min[c]})`);
        assert(Math.abs(hi - acc.max[c]) <= 1e-5, `${label}: accessor ${accIdx} max[${c}] mismatch (${hi} vs ${acc.max[c]})`);
      }
    }
    return arr;
  }
  if (acc.componentType === 5123) {
    return new Uint16Array(copy.buffer, copy.byteOffset, acc.count * numComps);
  }
  if (acc.componentType === 5125) {
    return new Uint32Array(copy.buffer, copy.byteOffset, acc.count * numComps);
  }
  throw new Error(`${label}: unsupported componentType ${acc.componentType}`);
}

function sampleTrackLinear(times, values, numComps, isQuat, t) {
  if (t <= times[0]) {
    return Array.from(values.subarray(0, numComps));
  }
  const last = times.length - 1;
  if (t >= times[last]) {
    return Array.from(values.subarray(last * numComps, (last + 1) * numComps));
  }
  let idx = 0;
  while (idx < last - 1 && times[idx + 1] < t) idx++;
  const t0 = times[idx];
  const t1 = times[idx + 1];
  const alpha = (t - t0) / (t1 - t0);
  const v0 = values.subarray(idx * numComps, (idx + 1) * numComps);
  const v1 = values.subarray((idx + 1) * numComps, (idx + 2) * numComps);

  if (!isQuat) {
    return Array.from({ length: numComps }, (_, c) => v0[c] + (v1[c] - v0[c]) * alpha);
  }
  // Spherical linear interpolation (slerp) per glTF 2.0 spec
  let bx = v1[0], by = v1[1], bz = v1[2], bw = v1[3];
  let dot = v0[0] * bx + v0[1] * by + v0[2] * bz + v0[3] * bw;
  if (dot < 0) {
    dot = -dot;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  if (dot > 0.9995) {
    return quatNormalize([
      v0[0] + (bx - v0[0]) * alpha,
      v0[1] + (by - v0[1]) * alpha,
      v0[2] + (bz - v0[2]) * alpha,
      v0[3] + (bw - v0[3]) * alpha,
    ]);
  }
  const theta0 = Math.acos(Math.min(1, dot));
  const theta = theta0 * alpha;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return quatNormalize([
    s0 * v0[0] + s1 * bx,
    s0 * v0[1] + s1 * by,
    s0 * v0[2] + s1 * bz,
    s0 * v0[3] + s1 * bw,
  ]);
}

function evaluateSceneWorld(gltf, decodedMeshes, nodeOverrides = null) {
  const worldNodes = new Array(gltf.nodes.length);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let maxRadialXZ = 0;

  function visit(nIdx, pPos, pRot, pScale) {
    const gn = gltf.nodes[nIdx];
    const ov = nodeOverrides && nodeOverrides.get(nIdx);
    const lPos = (ov && ov.translation) || gn.translation || [0, 0, 0];
    const lRot = (ov && ov.rotation) || gn.rotation || [0, 0, 0, 1];
    const lScl = (ov && ov.scale) || gn.scale || [1, 1, 1];

    const scaledPos = [lPos[0] * pScale[0], lPos[1] * pScale[1], lPos[2] * pScale[2]];
    const wPos = add3(pPos, rotateVecByQuat(scaledPos, pRot));
    const wRot = quatMul(pRot, lRot);
    const wScale = [pScale[0] * lScl[0], pScale[1] * lScl[1], pScale[2] * lScl[2]];
    worldNodes[nIdx] = { name: gn.name, pos: wPos, rot: wRot, scale: wScale };

    if (gn.mesh !== undefined) {
      const mPrims = decodedMeshes[gn.mesh];
      for (const prim of mPrims) {
        const posArr = prim.positions;
        for (let i = 0; i < posArr.length; i += 3) {
          const sp = [posArr[i] * wScale[0], posArr[i + 1] * wScale[1], posArr[i + 2] * wScale[2]];
          const wp = add3(wPos, rotateVecByQuat(sp, wRot));
          if (wp[0] < minX) minX = wp[0];
          if (wp[1] < minY) minY = wp[1];
          if (wp[2] < minZ) minZ = wp[2];
          if (wp[0] > maxX) maxX = wp[0];
          if (wp[1] > maxY) maxY = wp[1];
          if (wp[2] > maxZ) maxZ = wp[2];
          const r = Math.hypot(wp[0], wp[2]);
          if (r > maxRadialXZ) maxRadialXZ = r;
        }
      }
    }
    if (gn.children) {
      for (const cIdx of gn.children) visit(cIdx, wPos, wRot, wScale);
    }
  }

  const scene = gltf.scenes[gltf.scene ?? 0];
  for (const rIdx of scene.nodes) {
    visit(rIdx, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
  }
  return { worldNodes, minX, minY, minZ, maxX, maxY, maxZ, maxRadialXZ };
}

export function validateAllAssets(dir = OUTPUT_DIR) {
  // 1. Determinism test: build twice in memory and compare against disk files
  const memRun1 = buildAllInMemory();
  const memRun2 = buildAllInMemory();

  const reports = [];

  for (let i = 0; i < ASSET_SPECS.length; i++) {
    const spec = ASSET_SPECS[i];
    const label = spec.fileName;
    const diskBuf = readFileSync(join(dir, spec.fileName));
    const diskHash = createHash('sha256').update(diskBuf).digest('hex');

    assert(memRun1[i].sha256 === memRun2[i].sha256, `${label}: non-deterministic in-memory builds!`);
    assert(Buffer.compare(memRun1[i].glbBuffer, memRun2[i].glbBuffer) === 0, `${label}: buffer mismatch between builds!`);
    assert(diskHash === memRun1[i].sha256, `${label}: disk GLB sha256 (${diskHash}) != fresh build (${memRun1[i].sha256})`);

    const { gltf, binChunk } = parseGLB(diskBuf, label);

    // 2. Material & TeamColor checks
    assert(Array.isArray(gltf.materials) && gltf.materials.length > 0, `${label}: no materials`);
    const teamMatIdx = gltf.materials.findIndex((m) => m.name === 'TeamColor');
    assert(teamMatIdx >= 0, `${label}: missing material named "TeamColor"`);
    const teamColorFactor = gltf.materials[teamMatIdx].pbrMetallicRoughness.baseColorFactor;
    assert(
      teamColorFactor[2] > teamColorFactor[0] * 2 && teamColorFactor[2] > teamColorFactor[1],
      `${label}: TeamColor material is not blue-dominant (${teamColorFactor})`,
    );

    // 3. Decode & validate all meshes/primitives
    let totalTris = 0;
    let teamColorMeshCount = 0;
    let teamColorTris = 0;

    const decodedMeshes = gltf.meshes.map((mesh, mIdx) => {
      const isTeamMesh = mesh.name === 'TeamColor' || mesh.name.startsWith('TeamColor_');
      if (isTeamMesh) teamColorMeshCount++;
      return mesh.primitives.map((prim, pIdx) => {
        const pLabel = `${label} mesh[${mIdx}:${mesh.name}].prim[${pIdx}]`;
        const positions = readAccessor(gltf, binChunk, prim.attributes.POSITION, `${pLabel}.POSITION`);
        const normals = readAccessor(gltf, binChunk, prim.attributes.NORMAL, `${pLabel}.NORMAL`);
        const indices = readAccessor(gltf, binChunk, prim.indices, `${pLabel}.indices`);
        const vCount = positions.length / 3;
        assert(normals.length === positions.length, `${pLabel}: normal count != position count`);
        assert(indices.length > 0 && indices.length % 3 === 0, `${pLabel}: invalid index count ${indices.length}`);

        for (let v = 0; v < vCount; v++) {
          const nl = Math.hypot(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]);
          assert(Math.abs(nl - 1) < 1e-3, `${pLabel}: non-unit normal at v=${v} (len=${nl})`);
        }
        for (let t = 0; t < indices.length; t += 3) {
          const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
          assert(i0 < vCount && i1 < vCount && i2 < vCount, `${pLabel}: index out of range`);
          assert(i0 !== i1 && i1 !== i2 && i0 !== i2, `${pLabel}: degenerate index triplet`);
          const a = [positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]];
          const b = [positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]];
          const c = [positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]];
          const area2 = len3(cross3(sub3(b, a), sub3(c, a)));
          assert(area2 > 1e-10, `${pLabel}: zero-area triangle at tri ${t / 3}`);
        }

        const tris = indices.length / 3;
        totalTris += tris;
        if (isTeamMesh || prim.material === teamMatIdx) {
          teamColorTris += tris;
        }
        return { positions, normals, indices, material: prim.material };
      });
    });

    assert(
      gltf.meshes.some((m) => m.name === 'TeamColor'),
      `${label}: missing primary mesh named "TeamColor"`,
    );
    assert(
      gltf.nodes.some((n) => n.name === 'TeamColor' && n.mesh !== undefined),
      `${label}: missing primary node named "TeamColor"`,
    );
    assert(teamColorTris >= 12, `${label}: TeamColor geometry too small (${teamColorTris} tris)`);

    // 4. Rest-pose bounds, Y-up floor zero, radius, and -Z facing anchors
    const rest = evaluateSceneWorld(gltf, decodedMeshes);
    assert(Math.abs(rest.minY) <= 1e-4, `${label}: rest-pose minY (${rest.minY}) != 0 (floor zero violated)`);
    assert(
      rest.maxRadialXZ >= spec.radius * 0.97 && rest.maxRadialXZ <= spec.radius * 1.005,
      `${label}: maxRadialXZ (${rest.maxRadialXZ}) outside [97%, 100.5%] of radius ${spec.radius}`,
    );
    assert(Math.abs((rest.minX + rest.maxX) * 0.5) < 0.05, `${label}: model off-center in X`);

    const nodeMap = new Map(rest.worldNodes.map((wn) => [wn.name, wn]));
    for (const anchorName of spec.requiredAnchors) {
      const aNode = nodeMap.get(anchorName);
      assert(aNode, `${label}: missing required anchor node "${anchorName}"`);
      assert(aNode.pos[2] < -spec.radius * 0.35, `${label}: anchor "${anchorName}" not facing forward -Z (z=${aNode.pos[2]})`);
      assert(aNode.pos[1] > 0.05, `${label}: anchor "${anchorName}" not above floor (y=${aNode.pos[1]})`);
    }
    const mLeft = nodeMap.get('MuzzleLeft');
    const mRight = nodeMap.get('MuzzleRight');
    const mCenter = nodeMap.get('Muzzle');
    assert(mLeft.pos[0] < -0.05, `${label}: MuzzleLeft.x (${mLeft.pos[0]}) should be < 0 (-X port side)`);
    assert(mRight.pos[0] > +0.05, `${label}: MuzzleRight.x (${mRight.pos[0]}) should be > 0 (+X starboard side)`);
    assert(Math.abs(mLeft.pos[0] + mRight.pos[0]) < 1e-3, `${label}: MuzzleLeft/MuzzleRight asymmetric in X`);
    assert(Math.abs(mCenter.pos[0]) < 1e-4, `${label}: Muzzle not centered on X=0`);
    if (spec.unitId === 'dreadnought') {
      const siegeMuzzle = nodeMap.get('SiegeMuzzle');
      assert(siegeMuzzle.pos[2] < -spec.radius * 0.85, `${label}: SiegeMuzzle not at bow tip (z=${siegeMuzzle.pos[2]})`);
    }

    // 5. Animation clip validation & floor-penetration check across sampled frames!
    assert(Array.isArray(gltf.animations), `${label}: missing animations array`);
    const animNames = gltf.animations.map((a) => a.name);
    for (const reqClip of spec.requiredClips) {
      assert(animNames.includes(reqClip), `${label}: missing required animation clip "${reqClip}"`);
    }

    const animStats = {};
    for (const anim of gltf.animations) {
      assert(anim.channels.length > 0, `${label}: animation "${anim.name}" has 0 channels`);
      let duration = 0;
      const decodedChannels = anim.channels.map((ch) => {
        const samp = anim.samplers[ch.sampler];
        const inBv = gltf.bufferViews[gltf.accessors[samp.input].bufferView];
        const outBv = gltf.bufferViews[gltf.accessors[samp.output].bufferView];
        assert(inBv.target === undefined, `${label}: anim "${anim.name}" input bufferView must omit target`);
        assert(outBv.target === undefined, `${label}: anim "${anim.name}" output bufferView must omit target`);

        const times = readAccessor(gltf, binChunk, samp.input, `${label}.${anim.name}.input`);
        const values = readAccessor(gltf, binChunk, samp.output, `${label}.${anim.name}.output`);
        assert(Math.abs(times[0]) < 1e-6, `${label}: anim "${anim.name}" does not start at t=0`);
        for (let k = 1; k < times.length; k++) {
          assert(times[k] > times[k - 1], `${label}: anim "${anim.name}" non-increasing keyframe time`);
        }
        if (times[times.length - 1] > duration) duration = times[times.length - 1];

        const isQuat = ch.target.path === 'rotation';
        const numComps = isQuat ? 4 : 3;
        if (isQuat) {
          for (let k = 0; k < times.length; k++) {
            const ql = Math.hypot(
              values[k * 4],
              values[k * 4 + 1],
              values[k * 4 + 2],
              values[k * 4 + 3],
            );
            assert(Math.abs(ql - 1) < 1e-3, `${label}: anim "${anim.name}" non-unit quaternion (len=${ql})`);
          }
        }
        return { nodeIdx: ch.target.node, path: ch.target.path, times, values, numComps, isQuat };
      });

      // Sample 17 frames across [0, duration] to verify actual motion & floor clearance!
      let minAnimY = Infinity;
      let endMinY = Infinity;
      let maxDeltaFromStart = 0;
      let startWorld = null;

      for (let step = 0; step <= 16; step++) {
        const t = (step / 16) * duration;
        const overrides = new Map();
        for (const dch of decodedChannels) {
          let rec = overrides.get(dch.nodeIdx);
          if (!rec) {
            rec = {};
            overrides.set(dch.nodeIdx, rec);
          }
          rec[dch.path] = sampleTrackLinear(dch.times, dch.values, dch.numComps, dch.isQuat, t);
        }
        const state = evaluateSceneWorld(gltf, decodedMeshes, overrides);
        if (state.minY < minAnimY) minAnimY = state.minY;
        if (step === 16) endMinY = state.minY;
        if (step === 0) {
          startWorld = state.worldNodes;
        } else {
          for (let n = 0; n < state.worldNodes.length; n++) {
            const dp = len3(sub3(state.worldNodes[n].pos, startWorld[n].pos));
            const dr = Math.hypot(
              state.worldNodes[n].rot[0] - startWorld[n].rot[0],
              state.worldNodes[n].rot[1] - startWorld[n].rot[1],
              state.worldNodes[n].rot[2] - startWorld[n].rot[2],
              Math.abs(state.worldNodes[n].rot[3]) - Math.abs(startWorld[n].rot[3]),
            );
            const delta = dp + dr;
            if (delta > maxDeltaFromStart) maxDeltaFromStart = delta;
          }
        }
      }

      assert(maxDeltaFromStart > 0.02, `${label}: anim "${anim.name}" has negligible motion (${maxDeltaFromStart})`);
      assert(minAnimY >= -0.04, `${label}: anim "${anim.name}" penetrates below floor Y=0 (minAnimY=${minAnimY})`);
      animStats[anim.name] = {
        duration: Math.round(duration * 1000) / 1000,
        minAnimY: Math.round(minAnimY * 10000) / 10000,
        endMinY: Math.round(endMinY * 10000) / 10000,
      };
    }

    reports.push({
      fileName: spec.fileName,
      byteLength: diskBuf.length,
      sha256: diskHash,
      totalTris,
      teamColorMeshCount,
      teamColorTris,
      restBounds: {
        x: [rest.minX, rest.maxX].map((v) => Math.round(v * 10000) / 10000),
        y: [rest.minY, rest.maxY].map((v) => Math.round(v * 10000) / 10000),
        z: [rest.minZ, rest.maxZ].map((v) => Math.round(v * 10000) / 10000),
        maxRadialXZ: Math.round(rest.maxRadialXZ * 10000) / 10000,
        targetRadius: spec.radius,
      },
      anchors: Object.fromEntries(
        spec.requiredAnchors.map((a) => [
          a,
          nodeMap.get(a).pos.map((v) => Math.round(v * 10000) / 10000),
        ]),
      ),
      animStats,
    });
  }

  return reports;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const reports = validateAllAssets();
  console.log('ALL VALIDATION & DETERMINISM CHECKS PASSED!');
  console.log(JSON.stringify(reports, null, 2));
}
