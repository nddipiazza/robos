// Account lifecycle against a real (embedded) Postgres via PGlite.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
const db = await import('../../src/lib/db.js');
const accounts = await import('../../src/lib/accounts.js');
const { createSession, userForToken } = await import('../../src/lib/auth.js');
const { rateLimit } = await import('../../src/lib/security.js');

after(() => db.__resetForTests());

test('signup, duplicate protection, login and delete', async () => {
  const u = await accounts.signup({ email: 'Jess@Example.com', password: 'correct-horse-battery', displayName: 'Jess' });
  await assert.rejects(() => accounts.signup({ email: 'jess@example.com', password: 'correct-horse-battery', displayName: 'Jess' }), /already exists/);
  await assert.rejects(() => accounts.login({ email: 'jess@example.com', password: 'wrong-password-123' }), /Incorrect/);
  const logged = await accounts.login({ email: 'jess@example.com', password: 'correct-horse-battery' });
  assert.equal(logged.id, u.id);
  const { token } = await createSession(u.id);
  assert.equal((await userForToken(token)).email, 'jess@example.com');
  await accounts.deleteAccount(u.id);
  assert.equal(await userForToken(token), null);
});

test('rate limits block after the limit within the window', async () => {
  const req = { headers: new Headers() };
  for (let i = 0; i < 3; i++) await rateLimit('t:rl', 3, 60, req);
  await assert.rejects(() => rateLimit('t:rl', 3, 60, req), /Too many/);
});
