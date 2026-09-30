// Idempotent schema: every statement is safe to re-run on each cold start.
// Add your own tables below the platform tables; reference users(id) ON DELETE CASCADE so
// account deletion removes a user's data.

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    created_ip text,
    is_disabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    count int NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id bigserial PRIMARY KEY,
    user_id uuid,
    ip text,
    action text NOT NULL,
    detail text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  // ---- app tables go here ----
];

/** Optional seed step run once after the schema is created. */
export async function seed(/* query */) {}
