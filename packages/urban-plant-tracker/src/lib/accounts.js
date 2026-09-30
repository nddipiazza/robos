// Account lifecycle: sign up, log in, delete. Add your domain services in their own modules.
import { q, one } from './db.js';
import { hashPassword, checkPassword } from './auth.js';
import { HttpError, cleanText, normalizeEmail, validatePassword } from './security.js';

export async function signup({ email, password, displayName, ip }) {
  const cleanEmail = normalizeEmail(email);
  validatePassword(password, cleanEmail);
  const name = cleanText(displayName, { min: 2, max: 60, field: 'Your name' });
  const existing = await one('SELECT id FROM users WHERE email = $1', [cleanEmail]);
  if (existing) throw new HttpError(409, 'An account with that email already exists. Try logging in.');
  const hash = await hashPassword(password);
  const user = await one(
    `INSERT INTO users (email, password_hash, display_name, created_ip) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO NOTHING RETURNING id, email, display_name`,
    [cleanEmail, hash, name, ip],
  );
  if (!user) throw new HttpError(409, 'An account with that email already exists. Try logging in.');
  return user;
}

export async function login({ email, password }) {
  let cleanEmail;
  try {
    cleanEmail = normalizeEmail(email);
  } catch {
    throw new HttpError(401, 'Incorrect email or password.');
  }
  const user = await one('SELECT id, email, password_hash, is_disabled FROM users WHERE email = $1', [cleanEmail]);
  const ok = await checkPassword(String(password || '').slice(0, 200), user?.password_hash);
  if (!user || !ok || user.is_disabled) throw new HttpError(401, 'Incorrect email or password.');
  return user;
}

export async function deleteAccount(userId) {
  // Tables that reference users(id) with ON DELETE CASCADE are removed automatically.
  await q('DELETE FROM users WHERE id = $1', [userId]);
}

export async function userCount() {
  const row = await one('SELECT count(*)::int AS n FROM users');
  return row.n;
}
