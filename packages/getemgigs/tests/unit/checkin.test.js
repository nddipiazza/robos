import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCodeSecret, makeCode, parseCode, verifyCode, extractCode, windowState, CODE_STEP_SEC } from '../../src/lib/checkin.js';

const ID = '0b7c2f1e-1111-4a2b-9c3d-222233334444';

test('codes round-trip through a scanned URL', () => {
  const secret = newCodeSecret();
  const { code } = makeCode(ID, secret);
  assert.equal(extractCode(`https://www.getemgigs.com/scan/${code}`), code);
  const p = parseCode(`https://www.getemgigs.com/scan/${code}`);
  assert.equal(p.attendanceId, ID);
  assert.equal(verifyCode(p, secret), 'ok');
});

test('codes rotate and expire after ~90 seconds', () => {
  const secret = newCodeSecret();
  const t0 = 1_800_000_000_000;
  const a = makeCode(ID, secret, t0).code;
  const b = makeCode(ID, secret, t0 + CODE_STEP_SEC * 1000).code;
  assert.notEqual(a, b);
  assert.equal(verifyCode(parseCode(a), secret, t0 + 60_000), 'ok');
  assert.equal(verifyCode(parseCode(a), secret, t0 + 150_000), 'expired');
});

test('tampered or foreign codes are invalid', () => {
  const secret = newCodeSecret();
  const { code } = makeCode(ID, secret);
  assert.equal(verifyCode(parseCode(code), newCodeSecret()), 'invalid');
  const chars = code.split('');
  chars[30] = chars[30] === 'A' ? 'B' : 'A';
  assert.equal(verifyCode(parseCode(chars.join('')), secret), 'invalid');
  assert.equal(parseCode('https://evil.example/not-a-code'), null);
});

test('check-in window runs from doors (1h before) to 5h after start', () => {
  const start = new Date('2026-10-02T01:00:00Z');
  assert.equal(windowState(start, new Date('2026-10-01T23:30:00Z')).open, false);
  assert.equal(windowState(start, new Date('2026-10-02T00:30:00Z')).open, true);
  assert.equal(windowState(start, new Date('2026-10-02T06:30:00Z')).open, false);
});
