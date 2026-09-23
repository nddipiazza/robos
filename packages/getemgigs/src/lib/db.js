// Database access layer.
// Production (Vercel): Neon serverless Postgres over HTTP, configured via DATABASE_URL.
// Local dev / unit tests: embedded PGlite (real Postgres compiled to WASM), no setup needed.

import { SCHEMA, SEED_VENUES } from './schema.js';

let driverPromise = null;
let schemaPromise = null;

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || '';
}

async function createDriver() {
  const url = databaseUrl();
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    return {
      kind: 'neon',
      async query(text, params = []) {
        const rows = await sql.query(text, params);
        return rows;
      },
    };
  }
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('DATABASE_URL is not configured for production.');
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = process.env.PGLITE_DIR || undefined; // undefined => in-memory
  const db = new PGlite(dataDir);
  await db.waitReady;
  return {
    kind: 'pglite',
    async query(text, params = []) {
      const res = await db.query(text, params);
      return res.rows;
    },
    async close() {
      await db.close();
    },
  };
}

async function driver() {
  if (!driverPromise) {
    // Share across hot reloads in dev.
    const g = globalThis;
    if (!g.__ggDriver) g.__ggDriver = createDriver();
    driverPromise = g.__ggDriver;
  }
  return driverPromise;
}

async function ensureSchema() {
  if (!schemaPromise) {
    const g = globalThis;
    if (!g.__ggSchema) {
      g.__ggSchema = (async () => {
        const d = await driver();
        for (const stmt of SCHEMA) {
          await d.query(stmt);
        }
        const [{ n }] = await d.query('SELECT count(*)::int AS n FROM venues');
        if (n === 0) {
          for (const v of SEED_VENUES) {
            await d.query(
              `INSERT INTO venues (name, address, city, lat, lon, capacity, stay_to_play)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [v.name, v.address, v.city, v.lat, v.lon, v.capacity, v.stayToPlay],
            );
          }
        }
      })().catch((err) => {
        g.__ggSchema = null;
        throw err;
      });
    }
    schemaPromise = g.__ggSchema;
  }
  try {
    return await schemaPromise;
  } catch (err) {
    schemaPromise = null;
    throw err;
  }
}

/** Run a parameterized query and return rows. */
export async function q(text, params = []) {
  await ensureSchema();
  const d = await driver();
  return d.query(text, params);
}

/** Run a query and return the first row or null. */
export async function one(text, params = []) {
  const rows = await q(text, params);
  return rows[0] || null;
}

export async function dbKind() {
  const d = await driver();
  return d.kind;
}

/** Test helper: reset module-level state (PGlite only). */
export async function __resetForTests() {
  const g = globalThis;
  if (g.__ggDriver) {
    const d = await g.__ggDriver;
    if (d.close) await d.close();
  }
  g.__ggDriver = null;
  g.__ggSchema = null;
  driverPromise = null;
  schemaPromise = null;
}
