# Database Builder — Technical Memory

## Branch
- Working branch: `postgres-local-db`
- Branched from: `Whiteboard-addition` at v4.2.0

## Environment
- OS: Windows 11 Pro
- Target DB: PostgreSQL 17.9 (local, installed via winget PostgreSQL.PostgreSQL.17)
- Server framework: Fastify (existing in TPS_Scheduling_Online/server/)
- Existing DB layer: better-sqlite3 (Phase 3, to be replaced/augmented)

## PostgreSQL Connection Details
- Version: 17.9-1
- Host: localhost, Port: 5432
- Database: tps_scheduler
- App user: tps_admin / tps_local_dev
- Superuser: postgres / postgres
- Connection string: postgresql://tps_admin:tps_local_dev@localhost:5432/tps_scheduler
- psql bin path: C:\Program Files\PostgreSQL\17\bin

## File Locations
- Server root: `TPS_Scheduling_Online/server/`
- Existing schema: `TPS_Scheduling_Online/server/db/schema.sql`
- Existing connection: `TPS_Scheduling_Online/server/db/connection.ts`
- Existing routes: `TPS_Scheduling_Online/server/routes/`
- Migration 001: `Interactive-scheduler/database/migrations/001_core_schema.sql`

## Technical Decisions
- Migration 001 is the Phase 1 schema — 17 tables (16 domain + supervision_role), 16 explicit indexes
- pgcrypto extension required for gen_random_uuid() — must be created by postgres superuser before running migration
- user_session table uses jsonb defaults ('[]'::jsonb) — these break bash heredocs; use printf or separate script files to write SQL containing them
- Index count: 40 total = 16 explicit (idx_*) + 24 implicit (from PRIMARY KEY and UNIQUE constraints)
- Table count: 17 (includes all 16 domain tables + supervision_role as a separate reference table)

## Implementation Log
1. Wrote 001_core_schema.sql (331 lines, 13,471 bytes) using printf appended sections — bash heredoc broke on jsonb '[]'::jsonb syntax
2. Installed PostgreSQL 17.9 via winget — GUI wizard ran, set superuser password to 'postgres'
3. Created tps_admin user and tps_scheduler database as postgres superuser
4. Ran migration as tps_admin — clean (BEGIN...COMMIT, no errors)
5. Verified: 17 tables, 40 indexes (16 explicit), seed data correct

## Known Gotchas
- bash heredoc (both << 'EOF' and << 'PYEOF') breaks when SQL content contains single quotes inside double-quoted strings — specifically jsonb cast syntax like '[]'::jsonb. Workaround: use printf with double-quoted strings per section, then cp from /tmp to destination.
- winget installs PostgreSQL via EDB GUI wizard — it opens a Windows GUI dialog. The wizard requires user interaction to set the superuser password. Plan for this in setup docs.
- PATH must include /c/Program Files/PostgreSQL/17/bin for psql/pg_isready to be available in git bash. This is per-session; not persisted across bash calls without adding to .bashrc or similar.
- Always set PGPASSWORD env var before psql calls in scripts to avoid interactive password prompts.
