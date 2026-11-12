import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSET_SPECS, generateAllBuffers } from './generate.js';
import { add3, quatMul, quatNormalize, rotateVecByQuat } from './src/math.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function parseGlb(buffer) {
  assert(buffer.length >= 28, 'GLB buffer too short');
  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  const totalLength = buffer.readUInt32LE(8);
  assert.equal(magic, 0x46546c67, 'Invalid GLB magic');
  assert.equal(version, 2, 'Invalid GLB version');
  assert.equal(totalLength, buffer.length, 'GLB header length mismatch');

  const jsonLen = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  assert.equal(jsonType, 0x4e4f534a, 'Invalid JSON chunk type');
  assert.equal(jsonLen % 4, 0, 'JSON chunk not 4-byte aligned');

  const jsonStr = buffer.subarray(20, 20 + jsonLen).toString('utf8');
  const json = JSON.parse(jsonStr);

  const binHeaderPos = 20 + jsonLen;
  const binLen = buffer.readUInt32LE(binHeaderPos);
  const binType = buffer.readUInt32LE(binHeaderPos + 4);
  assert.equal(binType, 0x004e4942, 'Invalid BIN chunk type');
  assert.equal(binLen % 4, 0, 'BIN chunk not 4-byte aligned');
  assert.equal(binHeaderPos + 8 + binLen, buffer.length, 'Trailing bytes after BIN chunk');

  const bin = buffer.subarray(binHeaderPos + 8, binHeaderPos + 8 + binLen);
  return { json, bin };
}

export function readAccessorTyped(json, bin, accIdx) {
  const acc = json.accessors[accIdx];
  const bv = json.bufferViews[acc.bufferView];
  const byteOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  assert.equal(byteOffset % 4, 0, `Accessor ${accIdx} byteOffset not 4-byte aligned`);
  const numComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  assert(numComp, `Unsupported accessor type ${acc.type}`);
  const elemCount = acc.count * numComp;
  const slice = bin.subarray(
    byteOffset,
    byteOffset + elemCount * (acc.componentType === 5123 ? 2 : 4)
  );
  const ab = slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
  if (acc.componentType === 5126) return new Float32Array(ab);
  if (acc.componentType === 5123) return new Uint16Array(ab);
  if (acc.componentType === 5125) return new Uint32Array(ab);
  throw new Error(`Unsupported componentType ${acc.componentType}`);
}

function slerpQuat(a, b, t) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    dot = -dot;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (dot > 0.9995) {
    return quatNormalize([
      a[0] + t * (bx - a[0]),
      a[1] + t * (by - a[1]),
      a[2] + t * (bz - a[2]),
      a[3] + t * (bw - a[3]),
    ]);
  }
  const theta0 = Math.acos(Math.min(1, dot));
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return quatNormalize([
    s0 * a[0] + s1 * bx,
    s0 * a[1] + s1 * by,
    s0 * a[2] + s1 * bz,
    s0 * a[3] + s1 * bw,
  ]);
}

export function evaluateScenePose(json, bin, animName = null, time = 0) {
  const nodeTRS = json.nodes.map((n) => ({
    name: n.name,
    translation: n.translation ? [...n.translation] : [0, 0, 0],
    rotation: n.rotation ? [...n.rotation] : [0, 0, 0, 1],
    scale: n.scale ? [...n.scale] : [1, 1, 1],
  }));

  if (animName && json.animations) {
    const anim = json.animations.find((a) => a.name === animName);
    if (anim) {
      for (const ch of anim.channels) {
        const sampler = anim.samplers[ch.sampler];
        const times = readAccessorTyped(json, bin, sampler.input);
        const vals = readAccessorTyped(json, bin, sampler.output);
        const nKeys = times.length;
        let k0 = 0;
        let k1 = 0;
        let alpha = 0;
        if (time <= times[0]) {
          k0 = 0;
          k1 = 0;
          alpha = 0;
        } else if (time >= times[nKeys - 1]) {
          k0 = nKeys - 1;
          k1 = nKeys - 1;
          alpha = 0;
        } else {
          for (let i = 0; i < nKeys - 1; i++) {
            if (time >= times[i] && time <= times[i + 1]) {
              k0 = i;
              k1 = i + 1;
              alpha = (time - times[i]) / Math.max(1e-9, times[i + 1] - times[i]);
              break;
            }
          }
        }
        const target = nodeTRS[ch.target.node];
        if (ch.target.path === 'rotation') {
          const q0 = [vals[k0 * 4], vals[k0 * 4 + 1], vals[k0 * 4 + 2], vals[k0 * 4 + 3]];
          const q1 = [vals[k1 * 4], vals[k1 * 4 + 1], vals[k1 * 4 + 2], vals[k1 * 4 + 3]];
          target.rotation = sampler.interpolation === 'STEP' ? q0 : slerpQuat(q0, q1, alpha);
        } else {
          const v0 = [vals[k0 * 3], vals[k0 * 3 + 1], vals[k0 * 3 + 2]];
          const v1 = [vals[k1 * 3], vals[k1 * 3 + 1], vals[k1 * 3 + 2]];
          const v =
            sampler.interpolation === 'STEP'
              ? v0
              : [
                  v0[0] + (v1[0] - v0[0]) * alpha,
                  v0[1] + (v1[1] - v0[1]) * alpha,
                  v0[2] + (v1[2] - v0[2]) * alpha,
                ];
          target[ch.target.path] = v;
        }
      }
    }
  }

  // Compute world transforms for all nodes in scene 0
  const worldTransforms = new Array(json.nodes.length);
  function visit(nodeIdx, parentPos, parentRot, parentScale) {
    const trs = nodeTRS[nodeIdx];
    const scaledLocalPos = [
      trs.translation[0] * parentScale[0],
      trs.translation[1] * parentScale[1],
      trs.translation[2] * parentScale[2],
    ];
    const wPos = add3(parentPos, rotateVecByQuat(scaledLocalPos, parentRot));
    const wRot = quatMul(parentRot, trs.rotation);
    const wScale = [
      parentScale[0] * trs.scale[0],
      parentScale[1] * trs.scale[1],
      parentScale[2] * trs.scale[2],
    ];
    worldTransforms[nodeIdx] = {
      name: trs.name,
      position: wPos,
      rotation: wRot,
      scale: wScale,
      local: trs,
    };
    const nodeJson = json.nodes[nodeIdx];
    if (nodeJson.children) {
      for (const chIdx of nodeJson.children) {
        visit(chIdx, wPos, wRot, wScale);
      }
    }
  }

  for (const rootIdx of json.scenes[json.scene ?? 0].nodes) {
    visit(rootIdx, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
  }
  return worldTransforms;
}

export function computeWorldBounds(json, bin, worldTransforms) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let maxXZRadius = 0;
  let totalTriangles = 0;

  for (let nIdx = 0; nIdx < json.nodes.length; nIdx++) {
    const node = json.nodes[nIdx];
    const wt = worldTransforms[nIdx];
    if (node.mesh === undefined || !wt) continue;
    const mesh = json.meshes[node.mesh];
    for (const prim of mesh.primitives) {
      const pos = readAccessorTyped(json, bin, prim.attributes.POSITION);
      const norm = readAccessorTyped(json, bin, prim.attributes.NORMAL);
      const idx = readAccessorTyped(json, bin, prim.indices);
      assert.equal(idx.length % 3, 0, 'Triangle index count must be divisible by 3');
      totalTriangles += idx.length / 3;

      const vCount = pos.length / 3;
      for (let i = 0; i < idx.length; i++) {
        assert(idx[i] < vCount, `Out-of-range vertex index ${idx[i]} >= ${vCount}`);
      }
      for (let v = 0; v < vCount; v++) {
        const nl = Math.hypot(norm[v * 3], norm[v * 3 + 1], norm[v * 3 + 2]);
        assert(Math.abs(nl - 1.0) < 1e-3, `Non-unit normal length ${nl}`);

        const scaled = [
          pos[v * 3] * wt.scale[0],
          pos[v * 3 + 1] * wt.scale[1],
          pos[v * 3 + 2] * wt.scale[2],
        ];
        const wp = add3(wt.position, rotateVecByQuat(scaled, wt.rotation));
        if (wp[0] < minX) minX = wp[0];
        if (wp[0] > maxX) maxX = wp[0];
        if (wp[1] < minY) minY = wp[1];
        if (wp[1] > maxY) maxY = wp[1];
        if (wp[2] < minZ) minZ = wp[2];
        if (wp[2] > maxZ) maxZ = wp[2];
        const rXZ = Math.hypot(wp[0], wp[2]);
        if (rXZ > maxXZRadius) maxXZRadius = rXZ;
      }
    }
  }

  return { minX, maxX, minY, maxY, minZ, maxZ, maxXZRadius, totalTriangles };
}

function validateAccessorSchema(json, bin) {
  for (let i = 0; i < json.accessors.length; i++) {
    const acc = json.accessors[i];
    const bv = json.bufferViews[acc.bufferView];
    assert(bv.byteOffset + bv.byteLength <= json.buffers[0].byteLength, 'BufferView exceeds buffer');
    if (acc.min && acc.max && acc.componentType === 5126) {
      const arr = readAccessorTyped(json, bin, i);
      const numComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
      for (let c = 0; c < numComp; c++) {
        let lo = Infinity, hi = -Infinity;
        for (let k = 0; k < acc.count; k++) {
          const v = arr[k * numComp + c];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        assert(Math.abs(lo - acc.min[c]) <= 1e-5, `Accessor ${i} min mismatch`);
        assert(Math.abs(hi - acc.max[c]) <= 1e-5, `Accessor ${i} max mismatch`);
      }
    }
  }

  if (json.animations) {
    for (const anim of json.animations) {
      for (const ch of anim.channels) {
        const node = json.nodes[ch.target.node];
        assert(node.matrix === undefined, `Animated node "${node.name}" must not define matrix`);
        const sampler = anim.samplers[ch.sampler];
        const inBv = json.bufferViews[json.accessors[sampler.input].bufferView];
        const outBv = json.bufferViews[json.accessors[sampler.output].bufferView];
        assert.equal(inBv.target, undefined, 'Animation input bufferView must omit target');
        assert.equal(outBv.target, undefined, 'Animation output bufferView must omit target');

        const times = readAccessorTyped(json, bin, sampler.input);
        assert(Math.abs(times[0]) < 1e-6, `Animation "${anim.name}" should start at t=0`);
        for (let t = 1; t < times.length; t++) {
          assert(times[t] > times[t - 1], `Animation "${anim.name}" times not strictly increasing`);
        }

        if (ch.target.path === 'rotation') {
          const qArr = readAccessorTyped(json, bin, sampler.output);
          for (let k = 0; k < qArr.length; k += 4) {
            const ql = Math.hypot(qArr[k], qArr[k + 1], qArr[k + 2], qArr[k + 3]);
            assert(Math.abs(ql - 1.0) < 1e-3, `Non-unit animation quaternion length ${ql}`);
          }
        }
      }
    }
  }
}

export function runValidation(assetDir = __dirname) {
  console.log('Running Meridian Starfall Command GLB & Determinism Validation...');
  const freshRun = generateAllBuffers();

  for (const spec of ASSET_SPECS) {
    const filePath = path.join(assetDir, spec.filename);
    assert(fs.existsSync(filePath), `Missing deliverable GLB: ${filePath}`);
    const diskBuf = fs.readFileSync(filePath);
    const diskSha = crypto.createHash('sha256').update(diskBuf).digest('hex');

    const freshItem = freshRun.find((x) => x.filename === spec.filename);
    assert.equal(
      diskSha,
      freshItem.sha256,
      `Determinism check failed for ${spec.filename}: SHA-256 mismatch!`
    );

    const { json, bin } = parseGlb(diskBuf);
    validateAccessorSchema(json, bin);

    const matNames = json.materials.map((m) => m.name);
    assert(matNames.includes('TeamColor'), `${spec.filename} missing TeamColor material`);
    assert(matNames.includes('ArmorDark'), `${spec.filename} missing ArmorDark material`);

    const restWT = evaluateScenePose(json, bin, null, 0);
    const bounds = computeWorldBounds(json, bin, restWT);

    // Floor Y = 0 check
    assert(
      Math.abs(bounds.minY - 0.0) <= 1e-5,
      `${spec.filename} floor Y must be 0.0, got ${bounds.minY}`
    );
    // Footprint radius check
    assert(
      bounds.maxXZRadius <= spec.targetRadius + 1e-4,
      `${spec.filename} exceeds target radius ${spec.targetRadius}: got ${bounds.maxXZRadius}`
    );
    assert(
      bounds.maxXZRadius >= spec.targetRadius * 0.94,
      `${spec.filename} undersized footprint for target radius ${spec.targetRadius}: got ${bounds.maxXZRadius}`
    );

    const animNames = (json.animations ?? []).map((a) => a.name);

    if (spec.filename === 'fortified_hub.glb') {
      assert(animNames.includes('idle'), 'fortified_hub missing idle animation');
      assert(animNames.includes('attack'), 'fortified_hub missing attack animation');
      assert(animNames.includes('death'), 'fortified_hub missing death animation');

      const muzzleIdx = json.nodes.findIndex((n) => n.name === 'Muzzle');
      assert(muzzleIdx >= 0, 'fortified_hub missing Muzzle anchor node');
      const muzzleWT = restWT[muzzleIdx];
      assert(
        muzzleWT.position[2] < -3.2 && Math.abs(muzzleWT.position[0]) < 1e-4 && muzzleWT.position[1] > 3.8,
        `Unexpected Muzzle world position: ${JSON.stringify(muzzleWT.position)}`
      );
      const muzzleFwd = rotateVecByQuat([0, 0, -1], muzzleWT.rotation);
      assert(
        Math.abs(muzzleFwd[2] + 1.0) < 1e-4,
        `Muzzle local -Z should face world -Z, got ${JSON.stringify(muzzleFwd)}`
      );

      // Verify attack recoil moves Muzzle / CannonBarrels backward (+Z) at peak recoil (t = 0.08s)
      const atkWT = evaluateScenePose(json, bin, 'attack', 0.08);
      const recoilDeltaZ = atkWT[muzzleIdx].position[2] - muzzleWT.position[2];
      assert(recoilDeltaZ > 0.35, `Expected positive +Z cannon recoil, got ${recoilDeltaZ}`);
    }

    if (spec.filename === 'operations_hub.glb') {
      assert(animNames.includes('idle'), 'operations_hub missing idle animation');
      assert(animNames.includes('death'), 'operations_hub missing death animation');
      assert(matNames.includes('DishReflector'), 'operations_hub missing DishReflector');

      // Check 360-deg dish rotation at quarter-turn t = 1.5s (of 6.0s)
      const dishIdx = json.nodes.findIndex((n) => n.name === 'DishYaw');
      const qWT = evaluateScenePose(json, bin, 'idle', 1.5);
      const fwd90 = rotateVecByQuat([0, 0, -1], qWT[dishIdx].rotation);
      assert(Math.abs(Math.abs(fwd90[0]) - 1.0) < 0.02, 'DishYaw should rotate 90 deg at quarter-period');
    }

    if (spec.filename === 'radar_beacon.glb') {
      assert(animNames.includes('idle'), 'radar_beacon missing idle animation');
      const dishIdx = json.nodes.findIndex((n) => n.name === 'RadarDishYaw');
      const qWT = evaluateScenePose(json, bin, 'idle', 1.0);
      const fwd90 = rotateVecByQuat([0, 0, -1], qWT[dishIdx].rotation);
      assert(Math.abs(Math.abs(fwd90[0]) - 1.0) < 0.02, 'RadarDishYaw should rotate 90 deg at quarter-period');
    }

    if (spec.filename === 'vehicle_armory.glb') {
      assert(matNames.includes('SteelStructure'), 'vehicle_armory missing SteelStructure ribs');
      const widthX = bounds.maxX - bounds.minX;
      const depthZ = bounds.maxZ - bounds.minZ;
      assert(depthZ > widthX * 1.2, `vehicle_armory should have rectangular footprint, got ${widthX.toFixed(2)}x${depthZ.toFixed(2)}`);
    }

    // Check full idle sweep stays within targetRadius and on/above floor Y=0
    if (animNames.includes('idle')) {
      const idleAnim = json.animations.find((a) => a.name === 'idle');
      let maxTime = 0;
      for (const s of idleAnim.samplers) {
        const tMax = json.accessors[s.input].max[0];
        if (tMax > maxTime) maxTime = tMax;
      }
      for (let step = 0; step <= 16; step++) {
        const t = (maxTime * step) / 16;
        const wt = evaluateScenePose(json, bin, 'idle', t);
        const b = computeWorldBounds(json, bin, wt);
        assert(
          b.maxXZRadius <= spec.targetRadius + 1e-3,
          `${spec.filename} idle at t=${t.toFixed(2)} exceeds radius ${spec.targetRadius}: ${b.maxXZRadius}`
        );
        assert(
          b.minY >= -1e-4,
          `${spec.filename} idle at t=${t.toFixed(2)} dips below Y=0: ${b.minY}`
        );
      }
    }

    console.log(
      `  [PASS] ${spec.filename.padEnd(20)} | tris=${String(bounds.totalTriangles).padStart(4)} | R_XZ=${bounds.maxXZRadius.toFixed(3)}/${spec.targetRadius} | X=[${bounds.minX.toFixed(2)},${bounds.maxX.toFixed(2)}] Y=[${bounds.minY.toFixed(2)},${bounds.maxY.toFixed(2)}] Z=[${bounds.minZ.toFixed(2)},${bounds.maxZ.toFixed(2)}] | anims=[${animNames.join(',')}]`
    );
  }

  console.log('All GLB schema, geometry, anchor, animation, footprint, and determinism checks PASSED!');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runValidation(__dirname);
}
