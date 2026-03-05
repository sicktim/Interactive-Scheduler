// db.js - PostgreSQL connection pool for the local API server.
// Same connection pattern as import/db.js, reads from env or falls back to default.

import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL ||
  'postgresql://tps_admin:tps_local_dev@localhost:5432/tps_scheduler';

const pool = new Pool({ connectionString });

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

/**
 * Execute a parameterized query against the pool.
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<import('pg').QueryResult>}
 */
export async function query(sql, params = []) {
  return pool.query(sql, params);
}

/**
 * End the pool, flushing all connections.
 */
export async function close() {
  await pool.end();
}

export { pool };
