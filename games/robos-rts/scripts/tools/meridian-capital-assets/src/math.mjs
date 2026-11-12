// Deterministic 3D vector, matrix, and quaternion math utilities (right-handed, Y-up, -Z forward).

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(t) {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

export function vec3(x = 0, y = 0, z = 0) {
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

// Quaternion [x, y, z, w]
export function quatIdentity() {
  return [0, 0, 0, 1];
}

export function quatNormalize(q) {
  // Normalize in Float32 precision so binary accessor checks always see unit length
  const f = new Float32Array(q);
  const l = Math.hypot(f[0], f[1], f[2], f[3]);
  if (l < 1e-12) return [0, 0, 0, 1];
  const out = new Float32Array([f[0] / l, f[1] / l, f[2] / l, f[3] / l]);
  return [out[0], out[1], out[2], out[3]];
}

export function quatFromAxisAngle(axis, rad) {
  const n = norm3(axis);
  const half = rad * 0.5;
  const s = Math.sin(half);
  const c = Math.cos(half);
  return quatNormalize([n[0] * s, n[1] * s, n[2] * s, c]);
}

export function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return quatNormalize([
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]);
}

// Intrinsic XYZ / pitch(X), yaw(Y), roll(Z) composition: q = qY * qX * qZ
export function quatFromEulerDeg(pitchDeg = 0, yawDeg = 0, rollDeg = 0) {
  const qx = quatFromAxisAngle([1, 0, 0], pitchDeg * DEG);
  const qy = quatFromAxisAngle([0, 1, 0], yawDeg * DEG);
  const qz = quatFromAxisAngle([0, 0, 1], rollDeg * DEG);
  return quatMul(qy, quatMul(qx, qz));
}

export function rotateVecByQuat(v, q) {
  const [qx, qy, qz, qw] = q;
  const uv = cross3([qx, qy, qz], v);
  const uuv = cross3([qx, qy, qz], uv);
  return [
    v[0] + 2 * (qw * uv[0] + uuv[0]),
    v[1] + 2 * (qw * uv[1] + uuv[1]),
    v[2] + 2 * (qw * uv[2] + uuv[2]),
  ];
}

// Ensure consecutive quaternion keyframes stay in the same hemisphere for glTF LINEAR slerp
export function alignQuatTrack(quats) {
  const out = [];
  for (let i = 0; i < quats.length; i++) {
    let q = quatNormalize(quats[i]);
    if (i > 0) {
      const prev = out[i - 1];
      const d = prev[0] * q[0] + prev[1] * q[1] + prev[2] * q[2] + prev[3] * q[3];
      if (d < 0) {
        q = quatNormalize([-q[0], -q[1], -q[2], -q[3]]);
      }
    }
    out.push(q);
  }
  return out;
}
