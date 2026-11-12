// Deterministic 3D vector, matrix, and quaternion math utilities (right-handed, Y-up, -Z forward).

export const DEG2RAD = Math.PI / 180;

export function v3(x = 0, y = 0, z = 0) {
  return [x, y, z];
}

export function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale3(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function len3(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

export function norm3(a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  if (l < 1e-12) return [0, 1, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
}

// glTF quaternion format: [x, y, z, w]
export function quatIdentity() {
  return [0, 0, 0, 1];
}

export function quatNormalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  if (l < 1e-12) return [0, 0, 0, 1];
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function quatFromAxisAngle(axis, rad) {
  const n = norm3(axis);
  const half = rad * 0.5;
  const s = Math.sin(half);
  return quatNormalize([n[0] * s, n[1] * s, n[2] * s, Math.cos(half)]);
}

export function quatMul(a, b) {
  return quatNormalize([
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]);
}

// Intrinsic Y-X-Z Euler angles (yaw around Y, pitch around X, roll around Z) in radians
export function quatFromEulerYXZ(yaw = 0, pitch = 0, roll = 0) {
  const qy = quatFromAxisAngle([0, 1, 0], yaw);
  const qx = quatFromAxisAngle([1, 0, 0], pitch);
  const qz = quatFromAxisAngle([0, 0, 1], roll);
  return quatMul(quatMul(qy, qx), qz);
}

export function rotateVecByQuat(v, q) {
  const qv = [q[0], q[1], q[2]];
  const uv = cross3(qv, v);
  const uuv = cross3(qv, uv);
  return [
    v[0] + 2 * (q[3] * uv[0] + uuv[0]),
    v[1] + 2 * (q[3] * uv[1] + uuv[1]),
    v[2] + 2 * (q[3] * uv[2] + uuv[2]),
  ];
}

// Generate 9 continuous quaternion keyframes for a full 360-degree spin around axis
// Ensuring positive dot product between adjacent keyframes for smooth SLERP/LERP in all engines.
export function fullSpinKeyframes(duration, axis = [0, 1, 0], direction = 1) {
  const steps = 8;
  const times = [];
  const values = [];
  const n = norm3(axis);
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const t = (duration * i) / steps;
    const angle = direction * ((Math.PI * 2 * i) / steps);
    const half = angle * 0.5;
    const s = Math.sin(half);
    let q = quatNormalize([n[0] * s, n[1] * s, n[2] * s, Math.cos(half)]);
    if (prev) {
      const dot = prev[0] * q[0] + prev[1] * q[1] + prev[2] * q[2] + prev[3] * q[3];
      if (dot < 0) {
        q = [-q[0], -q[1], -q[2], -q[3]];
      }
    }
    prev = q;
    times.push(t);
    values.push(q);
  }
  return { times, values };
}

// Ensure consecutive quaternions lie on the same hemisphere so SLERP never flips the long way
export function ensureQuatContinuity(quats) {
  const out = [];
  for (let i = 0; i < quats.length; i++) {
    let q = quatNormalize(quats[i]);
    if (i > 0) {
      const p = out[i - 1];
      const dot = p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3];
      if (dot < 0) {
        q = [-q[0], -q[1], -q[2], -q[3]];
      }
    }
    out.push(q);
  }
  return out;
}

export function srgbToLinear(c) {
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToLinearRgba(hex, alpha = 1.0) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [
    Number(srgbToLinear(r).toFixed(6)),
    Number(srgbToLinear(g).toFixed(6)),
    Number(srgbToLinear(b).toFixed(6)),
    alpha,
  ];
}
