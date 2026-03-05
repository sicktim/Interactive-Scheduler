// db.js - PostgreSQL connection pool for the TPS import scripts.
// Connection targets the local tps_scheduler database using the app user.

import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://tps_admin:tps_local_dev@localhost:5432/tps_scheduler',
});

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
 * End the pool, flushing all connections. Call once at end of script.
 */
export async function close() {
  await pool.end();
}

export { pool };
