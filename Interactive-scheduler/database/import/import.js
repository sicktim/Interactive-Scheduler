// import.js - Fetch GAS batch API and load into PostgreSQL tps_scheduler database.
//
// Usage:
//   node import.js              -- import all sections from batch API
//   node import.js --roster-only  -- import only roster data
//
// Prerequisites:
//   npm install
//   PostgreSQL tps_scheduler database must exist with schema applied.

import { query, close } from './db.js';
import {
  parseFlyingEvents,
  parseGroundEvents,
  parseNAEvents,
  parseSupervisoryRows,
  parseFOAAuth,
  parseAcademics,
  isValidName,
} from './parsers.js';

const API_URL = 'https://script.google.com/macros/s/AKfycbyZNyrLxkW2vjbq8xpii43rWzYkkDvJTQ_KQCGMyErPZKqssL0XiA_UknwxOJ_XGzAt/exec';

const ROSTER_ONLY = process.argv.includes('--roster-only');

// ---------------------------------------------------------------------------
// Upsert SQL templates
// ---------------------------------------------------------------------------

const UPSERT_EVENT_SQL = `
  INSERT INTO scheduled_event (
    section, date, model, event_name, start_time, end_time,
    etd, eta, notes, is_readonly, is_cancelled, is_effective, is_partially_effective,
    natural_key, updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
  ON CONFLICT (natural_key) DO UPDATE SET
    model                = EXCLUDED.model,
    event_name           = EXCLUDED.event_name,
    start_time           = EXCLUDED.start_time,
    end_time             = EXCLUDED.end_time,
    etd                  = EXCLUDED.etd,
    eta                  = EXCLUDED.eta,
    notes                = EXCLUDED.notes,
    is_cancelled         = EXCLUDED.is_cancelled,
    is_effective         = EXCLUDED.is_effective,
    is_partially_effective = EXCLUDED.is_partially_effective,
    is_stale             = FALSE,
    updated_at           = now()
  RETURNING id
`;

const UPSERT_DATE_SQL = `
  INSERT INTO schedule_date (date, sheet_name, fetched_at)
  VALUES ($1, $2, now())
  ON CONFLICT (date) DO UPDATE SET
    sheet_name = EXCLUDED.sheet_name,
    fetched_at = now()
`;

const DELETE_PERSONNEL_SQL = `
  DELETE FROM event_personnel WHERE event_id = $1 AND is_original = TRUE
`;

const INSERT_PERSONNEL_SQL = `
  INSERT INTO event_personnel (event_id, person_name, position, is_original)
  VALUES ($1, $2, $3, TRUE)
  ON CONFLICT (event_id, person_name) DO NOTHING
`;

const UPSERT_ROSTER_SQL = `
  INSERT INTO roster_person (display_name, category_id, sort_order, is_active, updated_at)
  VALUES ($1, $2, $3, TRUE, now())
  ON CONFLICT (display_name, category_id) DO UPDATE SET
    sort_order = EXCLUDED.sort_order,
    is_active  = TRUE,
    updated_at = now()
`;

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Upsert a single parsed event and its personnel into the database.
 * Returns a counts object: { events: 1, personnel: N }.
 */
async function upsertEvent(ev) {
  const result = await query(UPSERT_EVENT_SQL, [
    ev.section,
    ev.date,       // ISO date string e.g. "2026-03-05"
    ev.model,
    ev.eventName,
    ev.startTime,
    ev.endTime,
    ev.etd,
    ev.eta,
    ev.notes,
    ev.isReadonly,
    ev.isCancelled,
    ev.isEffective,
    ev.isPartiallyEffective,
    ev.naturalKey,
  ]);

  const eventId = result.rows[0].id;

  // Replace personnel: delete original rows, re-insert fresh
  await query(DELETE_PERSONNEL_SQL, [eventId]);

  let personnelCount = 0;
  for (const p of ev.personnel) {
    if (p && p.name && isValidName(p.name)) {
      await query(INSERT_PERSONNEL_SQL, [eventId, p.name, p.position]);
      personnelCount++;
    }
  }

  return { events: 1, personnel: personnelCount };
}

/**
 * Import a single day's data from the parsed batch response.
 * Returns section counts for progress reporting.
 */
async function importDay(dayData) {
  const { isoDate, name, data } = dayData;

  // Upsert the schedule_date row
  await query(UPSERT_DATE_SQL, [isoDate, name]);

  const counts = {
    flying: 0,
    ground: 0,
    na: 0,
    academics: 0,
    supervision: 0,
    personnel: 0,
  };

  // Flying
  if (data.flying && !ROSTER_ONLY) {
    const events = parseFlyingEvents(data.flying, isoDate);
    for (const ev of events) {
      ev.date = isoDate;
      const c = await upsertEvent(ev);
      counts.flying++;
      counts.personnel += c.personnel;
    }
  }

  // Ground
  if (data.ground && !ROSTER_ONLY) {
    const events = parseGroundEvents(data.ground, isoDate);
    for (const ev of events) {
      ev.date = isoDate;
      const c = await upsertEvent(ev);
      counts.ground++;
      counts.personnel += c.personnel;
    }
  }

  // NA
  if (data.na && !ROSTER_ONLY) {
    const events = parseNAEvents(data.na, isoDate);
    for (const ev of events) {
      ev.date = isoDate;
      const c = await upsertEvent(ev);
      counts.na++;
      counts.personnel += c.personnel;
    }
  }

  // Academics
  if (data.academics && !ROSTER_ONLY) {
    const events = parseAcademics(data.academics, isoDate);
    for (const ev of events) {
      ev.date = isoDate;
      const c = await upsertEvent(ev);
      counts.academics++;
      counts.personnel += c.personnel;
    }
  }

  // Supervision: duty shifts + FOA/AUTH footer
  if (data.supervision && !ROSTER_ONLY) {
    const dutyEvents = parseSupervisoryRows(data.supervision, isoDate);
    const foaAuthEvents = parseFOAAuth(data.supervision, isoDate);
    const allSupervision = [...dutyEvents, ...foaAuthEvents];
    for (const ev of allSupervision) {
      ev.date = isoDate;
      const c = await upsertEvent(ev);
      counts.supervision++;
      counts.personnel += c.personnel;
    }
  }

  return counts;
}

/**
 * Import roster data from the GAS roster endpoint.
 * Roster response shape: { roster: { "FTC-A": ["Name1", "Name2", ...], ... } }
 */
async function importRoster(rosterJson) {
  const roster = rosterJson.roster;
  if (!roster) {
    console.error('Roster response missing .roster field');
    return 0;
  }

  let count = 0;
  for (const [categoryId, names] of Object.entries(roster)) {
    if (!Array.isArray(names)) continue;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (!name || !name.trim()) continue;
      try {
        await query(UPSERT_ROSTER_SQL, [name.trim(), categoryId, i]);
        count++;
      } catch (err) {
        // Category FK violation means an unknown category from the API -- skip
        if (err.code === '23503') {
          console.warn(`  Skipping roster person "${name}" -- category "${categoryId}" not in personnel_category table`);
        } else {
          throw err;
        }
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startMs = Date.now();
  console.log('TPS Scheduler -- GAS API import starting');
  console.log('Mode:', ROSTER_ONLY ? 'roster-only' : 'full import');
  console.log('');

  // Fetch roster and batch in parallel
  console.log('Fetching from GAS API...');
  const [rosterRes, batchRes] = await Promise.all([
    fetch(`${API_URL}?type=roster`),
    fetch(`${API_URL}?type=batch`),
  ]);

  if (!rosterRes.ok) throw new Error(`Roster fetch failed: ${rosterRes.status} ${rosterRes.statusText}`);
  if (!batchRes.ok) throw new Error(`Batch fetch failed: ${batchRes.status} ${batchRes.statusText}`);

  const rosterJson = await rosterRes.json();
  const batchJson = await batchRes.json();

  if (rosterJson.error) throw new Error(`Roster API error: ${rosterJson.message}`);
  if (batchJson.error) throw new Error(`Batch API error: ${batchJson.message}`);

  const meta = batchJson.metadata || {};
  console.log(`Batch: ${meta.daysIncluded ?? batchJson.days.length} days, cache: ${meta.cacheStatus ?? 'unknown'}`);
  console.log('');

  // Import roster
  console.log('Importing roster...');
  const rosterCount = await importRoster(rosterJson);
  console.log(`  Roster: ${rosterCount} persons upserted`);
  console.log('');

  if (ROSTER_ONLY) {
    console.log('--roster-only flag set, skipping event import.');
    await close();
    return;
  }

  // Import each day
  const totalCounts = { flying: 0, ground: 0, na: 0, academics: 0, supervision: 0, personnel: 0 };
  let daysProcessed = 0;

  for (const dayData of batchJson.days) {
    const counts = await importDay(dayData);
    daysProcessed++;
    totalCounts.flying += counts.flying;
    totalCounts.ground += counts.ground;
    totalCounts.na += counts.na;
    totalCounts.academics += counts.academics;
    totalCounts.supervision += counts.supervision;
    totalCounts.personnel += counts.personnel;

    const total = counts.flying + counts.ground + counts.na + counts.academics + counts.supervision;
    console.log(
      `Day ${dayData.isoDate} (${dayData.name}): ` +
      `${counts.flying} flying, ${counts.ground} ground, ${counts.na} NA, ` +
      `${counts.academics} academics, ${counts.supervision} supervision  [${total} events]`
    );
  }

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  const totalEvents = totalCounts.flying + totalCounts.ground + totalCounts.na + totalCounts.academics + totalCounts.supervision;

  console.log('');
  console.log('=== Import Summary ===');
  console.log(`Days processed:    ${daysProcessed}`);
  console.log(`Flying events:     ${totalCounts.flying}`);
  console.log(`Ground events:     ${totalCounts.ground}`);
  console.log(`NA events:         ${totalCounts.na}`);
  console.log(`Academics events:  ${totalCounts.academics}`);
  console.log(`Supervision events:${totalCounts.supervision}`);
  console.log(`Total events:      ${totalEvents}`);
  console.log(`Personnel rows:    ${totalCounts.personnel}`);
  console.log(`Elapsed:           ${elapsedSec}s`);
  console.log('');
  console.log('Import complete.');

  await close();
}

main().catch(err => {
  console.error('Import failed:', err);
  close().catch(() => {});
  process.exit(1);
});
