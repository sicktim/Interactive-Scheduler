import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

/** Get or create the SQLite database connection */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = join(__dirname, '..', 'tps.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  // Enforce foreign key constraints
  db.pragma('foreign_keys = ON');

  return db;
}

/** Initialize the database: run schema + seed if tables don't exist */
export function initDb(): Database.Database {
  const database = getDb();

  // Check if tables already exist (idempotent init)
  const tableCheck = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='personnel_category'")
    .get();

  if (!tableCheck) {
    console.log('[db] Initializing database schema...');
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');

    // Execute schema — split on semicolons to handle multiple statements
    // but filter out PRAGMA statements (already set above)
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('PRAGMA'));

    const transaction = database.transaction(() => {
      for (const stmt of statements) {
        database.exec(stmt + ';');
      }
    });
    transaction();
    console.log('[db] Schema created successfully.');

    // Run seed data
    console.log('[db] Seeding reference data...');
    const seed = readFileSync(join(__dirname, 'seed.sql'), 'utf-8');
    database.exec(seed);
    console.log('[db] Seed data loaded.');
  } else {
    console.log('[db] Database already initialized, skipping schema/seed.');
  }

  return database;
}

/** Close the database connection (for graceful shutdown) */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[db] Connection closed.');
  }
}
