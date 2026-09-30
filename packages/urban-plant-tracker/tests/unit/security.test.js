import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, validatePassword, cleanText, toCents, assertHuman, HttpError } from '../../src/lib/security.js';

test('emails are normalized and disposable domains rejected', () => {
  assert.equal(normalizeEmail('  Fan@Example.COM '), 'fan@example.com');
  assert.throws(() => normalizeEmail('nope'), HttpError);
  assert.throws(() => normalizeEmail('x@mailinator.com'), /Disposable/);
});

test('passwords need length, not be common, not contain the email name', () => {
  assert.throws(() => validatePassword('short'), /10 characters/);
  assert.throws(() => validatePassword('password123'), /common/);
  assert.throws(() => validatePassword('jessrivera-rocks-2026', 'jessrivera@example.com'), /email/);
  assert.equal(validatePassword('correct-horse-battery', 'jess@example.com'), 'correct-horse-battery');
});

test('text is trimmed, control chars stripped, and length enforced', () => {
  assert.equal(cleanText('  hi\u0000 there  '), 'hi there');
  assert.throws(() => cleanText('a'.repeat(11), { max: 10 }), /at most 10/);
  assert.throws(() => cleanText('', { min: 1, field: 'Name' }), /Name is required/);
});

test('money converts to cents within bounds', () => {
  assert.equal(toCents('25'), 2500);
  assert.equal(toCents(12.5), 1250);
  assert.throws(() => toCents(5, { min: 1000 }), HttpError);
});

test('honeypot and instant submits are rejected', () => {
  const req = { headers: new Headers() };
  assert.throws(() => assertHuman({ website: 'spam', formStartedAt: 1 }, req), /rejected/);
  assert.throws(() => assertHuman({ formStartedAt: Date.now() }, req), /rejected/);
  assert.doesNotThrow(() => assertHuman({ formStartedAt: Date.now() - 5000 }, req));
});
