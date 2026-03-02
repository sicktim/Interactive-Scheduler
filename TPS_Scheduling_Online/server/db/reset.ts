/**
 * Reset script — drops and recreates the database.
 * Usage: npm run db:reset (from server directory)
 */
import { unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initDb, closeDb } from './connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'tps.db');

// Delete existing database file
if (existsSync(dbPath)) {
  console.log('[reset] Removing existing database...');
  unlinkSync(dbPath);
  // Also remove WAL and SHM files if they exist
  if (existsSync(dbPath + '-wal')) unlinkSync(dbPath + '-wal');
  if (existsSync(dbPath + '-shm')) unlinkSync(dbPath + '-shm');
}

// Recreate from schema + seed
console.log('[reset] Creating fresh database...');
initDb();
closeDb();
console.log('[reset] Done. Database reset to clean state.');
