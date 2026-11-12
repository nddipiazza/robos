// Deterministic 3D vector, quaternion, and 4x4 matrix math utilities.
// Zero external dependencies; normalizes -0 to +0 for deterministic binary output.

export function cleanZero(x) {
  return Math.abs(x) < 1e-12 ? 0 : x;
}

export function f32(x) {
  const v = Math.fround(x);
  return v === 0 ? 0 : v;
}

export function vec3(x = 0, y = 0, z = 0) {
  return [cleanZero(x), cleanZero(y), cleanZero(z)];
}

export function add3(a, b) {
  return [cleanZero(a[0] + b[0]), cleanZero(a[1] + b[1]), cleanZero(a[2] + b[2])];
}

export function sub3(a, b) {
  return [cleanZero(a[0] - b[0]), cleanZero(a[1] - b[1]), cleanZero(a[2] - b[2])];
}

export function scale3(a, s) {
  return [cleanZero(a[0] * s), cleanZero(a[1] * s), cleanZero(a[2] * s)];
}

export function lerp3(a, b, t) {
  return [
    cleanZero(a[0] + (b[0] - a[0]) * t),
    cleanZero(a[1] + (b[1] - a[1]) * t),
    cleanZero(a[2] + (b[2] - a[2]) * t),
  ];
}

export function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a, b) {
  return [
    cleanZero(a[1] * b[2] - a[2] * b[1]),
    cleanZero(a[2] * b[0] - a[0] * b[2]),
    cleanZero(a[0] * b[1] - a[1] * b[0]),
  ];
}

export function len3(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

export function norm3(a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  if (l < 1e-12) return [0, 1, 0];
  return [cleanZero(a[0] / l), cleanZero(a[1] / l), cleanZero(a[2] / l)];
}

export function quatIdentity() {
  return [0, 0, 0, 1];
}

export function quatNormalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  if (l < 1e-12) return [0, 0, 0, 1];
  return [cleanZero(q[0] / l), cleanZero(q[1] / l), cleanZero(q[2] / l), cleanZero(q[3] / l)];
}

export function quatFromAxisAngle(axis, rad) {
  const n = norm3(axis);
  const half = rad * 0.5;
  const s = Math.sin(half);
  return quatNormalize([n[0] * s, n[1] * s, n[2] * s, Math.cos(half)]);
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

// Intrinsic XYZ or YXZ Euler helper: yaw (Y), pitch (X), roll (Z)
export function quatFromEulerYXZ(yawY = 0, pitchX = 0, rollZ = 0) {
  const qy = quatFromAxisAngle([0, 1, 0], yawY);
  const qx = quatFromAxisAngle([1, 0, 0], pitchX);
  const qz = quatFromAxisAngle([0, 0, 1], rollZ);
  return quatMul(quatMul(qy, qx), qz);
}

export function rotateVec3ByQuat(v, q) {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    cleanZero(vx + qw * tx + (qy * tz - qz * ty)),
    cleanZero(vy + qw * ty + (qz * tx - qx * tz)),
    cleanZero(vz + qw * tz + (qx * ty - qy * tx)),
  ];
}

// Column-major 4x4 matrices (glTF standard)
export function mat4Identity() {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

export function mat4FromTRS(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    cleanZero((1 - (yy + zz)) * sx), cleanZero((xy + wz) * sx), cleanZero((xz - wy) * sx), 0,
    cleanZero((xy - wz) * sy), cleanZero((1 - (xx + zz)) * sy), cleanZero((yz + wx) * sy), 0,
    cleanZero((xz + wy) * sz), cleanZero((yz - wx) * sz), cleanZero((1 - (xx + yy)) * sz), 0,
    cleanZero(t[0]), cleanZero(t[1]), cleanZero(t[2]), 1,
  ];
}

export function mat4Mul(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = cleanZero(sum);
    }
  }
  return out;
}

export function mat4TransformPoint(m, p) {
  const [x, y, z] = p;
  return [
    cleanZero(m[0] * x + m[4] * y + m[8] * z + m[12]),
    cleanZero(m[1] * x + m[5] * y + m[9] * z + m[13]),
    cleanZero(m[2] * x + m[6] * y + m[10] * z + m[14]),
  ];
}

export function mat3DeterminantFromMat4(m) {
  const a00 = m[0], a01 = m[4], a02 = m[8];
  const a10 = m[1], a11 = m[5], a12 = m[9];
  const a20 = m[2], a21 = m[6], a22 = m[10];
  return (
    a00 * (a11 * a22 - a12 * a21) -
    a01 * (a10 * a22 - a12 * a20) +
    a02 * (a10 * a21 - a11 * a20)
  );
}

export function mat4TransformNormal(m, n) {
  // Inverse-transpose of upper-left 3x3
  const a00 = m[0], a01 = m[4], a02 = m[8];
  const a10 = m[1], a11 = m[5], a12 = m[9];
  const a20 = m[2], a21 = m[6], a22 = m[10];

  const c00 = a11 * a22 - a12 * a21;
  const c01 = -(a10 * a22 - a12 * a20);
  const c02 = a10 * a21 - a11 * a20;

  const c10 = -(a01 * a22 - a02 * a21);
  const c11 = a00 * a22 - a02 * a20;
  const c12 = -(a00 * a21 - a01 * a20);

  const c20 = a01 * a12 - a02 * a11;
  const c21 = -(a00 * a12 - a02 * a10);
  const c22 = a00 * a11 - a01 * a10;

  const det = a00 * c00 + a01 * c01 + a02 * c02;
  if (Math.abs(det) < 1e-12) return [0, 1, 0];
  const invDet = 1 / det;

  // Cofactor matrix divided by det IS already transpose(inverse(M3))!
  const nx = (c00 * n[0] + c01 * n[1] + c02 * n[2]) * invDet;
  const ny = (c10 * n[0] + c11 * n[1] + c12 * n[2]) * invDet;
  const nz = (c20 * n[0] + c21 * n[1] + c22 * n[2]) * invDet;
  return norm3([nx, ny, nz]);
}

export const DEG = Math.PI / 180;
