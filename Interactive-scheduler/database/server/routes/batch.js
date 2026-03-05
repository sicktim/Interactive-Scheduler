// routes/batch.js - GET /api/batch
//
// Reconstructs the GAS-compatible batch response from the PostgreSQL database.
// The app's transformBatchData() expects raw row arrays, not parsed objects.
// This route builds those raw arrays from the normalized database data.
//
// Section raw row formats (see database-structure.md for full docs):
//
//   Flying (18 cols per row, plus a header row at index 0):
//     [model, briefStart, etd, eta, debriefEnd, eventName, c1..c8, notes, eff, cx, pe]
//
//   Ground (17 cols per row, plus a header row at index 0):
//     [eventName, start, end, p1..p10, notes, eff, cx, pe]
//
//   NA (14 cols per row, plus a header row at index 0):
//     [reason, start, end, p1..p10, notes]
//
//   Supervision (variable cols, one row per duty role, footer row at end):
//     Duty rows: [duty, person1, start1, end1, person2, start2, end2, ...]
//     Footer row: positions 0-8 empty, position 9="FOA", 10=foaPerson, 11-12 empty,
//                 13=authPerson  (detected by app via row[9]==="FOA")
//
//   Academics (3 cols per row, plus a header row at index 0):
//     [groupName, start, end]

import { query } from "../db.js";

// Canonical duty order matching the app's SUPERVISION_ROLE_ORDER constant
const DUTY_ORDER = [
  "SOF", "OS", "ODO", "F-16 FDO", "T-38 TDO", "C-12 TDO", "A-29 ADO",
  "Other (As Req'd)",
];

// The import parsers append " Academics" to the group name when building event_name.
// The raw GAS row format has just the group prefix (e.g. "Alpha FTC").
// Invert the mapping here so we can strip the suffix for the API response.
const ACAD_STRIP_SUFFIX = " Academics";

/**
 * Build flying raw rows for one date.
 * Row: [model, briefStart, etd, eta, debriefEnd, eventName, c1..c8, notes, eff, cx, pe]
 */
async function buildFlyingRows(date) {
  const result = await query(
    `SELECT
      se.model,
      se.start_time,
      se.etd,
      se.eta,
      se.end_time,
      se.event_name,
      se.notes,
      se.is_effective,
      se.is_cancelled,
      se.is_partially_effective,
      COALESCE(
        array_agg(ep.person_name ORDER BY ep.position)
          FILTER (WHERE ep.person_name IS NOT NULL),
        ARRAY[]::text[]
      ) AS crew
    FROM scheduled_event se
    LEFT JOIN event_personnel ep ON ep.event_id = se.id
    WHERE se.date = $1
      AND se.section = 'Flying'
      AND se.is_stale = FALSE
    GROUP BY se.id
    ORDER BY se.start_time NULLS LAST, se.event_name`,
    [date]
  );

  // Header row — parser skips rows where row[5] === 'Event'
  const rows = [
    ["Model","Brief","ETD","ETA","Debrief","Event","C1","C2","C3","C4","C5","C6","C7","C8",
     "Notes","Effective","CX/Non-E","Partially E"],
  ];

  for (const ev of result.rows) {
    const crew = ev.crew || [];
    // Pad to exactly 8 crew slots (cols 6-13)
    const paddedCrew = Array.from({ length: 8 }, (_, i) => crew[i] || "");
    rows.push([
      ev.model || "",
      ev.start_time || "",
      ev.etd || "",
      ev.eta || "",
      ev.end_time || "",
      ev.event_name,
      ...paddedCrew,
      ev.notes || "",
      ev.is_effective ? "TRUE" : "FALSE",
      ev.is_cancelled ? "TRUE" : "FALSE",
      ev.is_partially_effective ? "TRUE" : "FALSE",
    ]);
  }

  return rows;
}

/**
 * Build ground raw rows for one date.
 * Row: [eventName, start, end, p1..p10, notes, eff, cx, pe]
 */
async function buildGroundRows(date) {
  const result = await query(
    `SELECT
      se.event_name,
      se.start_time,
      se.end_time,
      se.notes,
      se.is_effective,
      se.is_cancelled,
      se.is_partially_effective,
      COALESCE(
        array_agg(ep.person_name ORDER BY ep.position)
          FILTER (WHERE ep.person_name IS NOT NULL),
        ARRAY[]::text[]
      ) AS people
    FROM scheduled_event se
    LEFT JOIN event_personnel ep ON ep.event_id = se.id
    WHERE se.date = $1
      AND se.section = 'Ground'
      AND se.is_stale = FALSE
    GROUP BY se.id
    ORDER BY se.start_time NULLS LAST, se.event_name`,
    [date]
  );

  // Header row — parser skips rows where row[0] === 'Events'
  const rows = [
    ["Events","Start","End","P1","P2","P3","P4","P5","P6","P7","P8","P9","P10",
     "Notes","Effective","CX/Non-E","Partially E"],
  ];

  for (const ev of result.rows) {
    const people = ev.people || [];
    const paddedPeople = Array.from({ length: 10 }, (_, i) => people[i] || "");
    rows.push([
      ev.event_name,
      ev.start_time || "",
      ev.end_time || "",
      ...paddedPeople,
      ev.notes || "",
      ev.is_effective ? "TRUE" : "FALSE",
      ev.is_cancelled ? "TRUE" : "FALSE",
      ev.is_partially_effective ? "TRUE" : "FALSE",
    ]);
  }

  return rows;
}

/**
 * Build NA raw rows for one date.
 * Row: [reason, start, end, p1..p10, notes]
 */
async function buildNaRows(date) {
  const result = await query(
    `SELECT
      se.event_name,
      se.start_time,
      se.end_time,
      COALESCE(
        array_agg(ep.person_name ORDER BY ep.position)
          FILTER (WHERE ep.person_name IS NOT NULL),
        ARRAY[]::text[]
      ) AS people
    FROM scheduled_event se
    LEFT JOIN event_personnel ep ON ep.event_id = se.id
    WHERE se.date = $1
      AND se.section = 'NA'
      AND se.is_stale = FALSE
    GROUP BY se.id
    ORDER BY se.start_time NULLS LAST, se.event_name`,
    [date]
  );

  // Header row — parser skips rows where row[0] === 'Reason'
  const rows = [
    ["Reason","Start","End","P1","P2","P3","P4","P5","P6","P7","P8","P9","P10","Notes"],
  ];

  for (const ev of result.rows) {
    const people = ev.people || [];
    // Pad to 10 structural person slots to match raw GAS format
    const paddedPeople = Array.from({ length: 10 }, (_, i) => people[i] || "");
    rows.push([
      ev.event_name,
      ev.start_time || "",
      ev.end_time || "",
      ...paddedPeople,
      "",  // notes column (always empty in current data)
    ]);
  }

  return rows;
}

/**
 * Build supervision raw rows for one date.
 *
 * Duty rows: [duty, person1, start1, end1, person2, start2, end2, ...]
 * Multiple shifts for the same duty are packed as consecutive triplets.
 *
 * FOA/AUTH footer row at end:
 *   [_, _, _, _, _, _, _, _, _, "FOA", foaPerson, "", "", authPerson]
 *   positions: 0-8 empty, 9="FOA", 10=foaPerson, 11="", 12="", 13=authPerson
 *   App parser detects via row[9] === "FOA"
 */
async function buildSupervisionRows(date) {
  const result = await query(
    `SELECT
      se.event_name,
      se.start_time,
      se.end_time,
      ep.person_name
    FROM scheduled_event se
    LEFT JOIN event_personnel ep ON ep.event_id = se.id
    WHERE se.date = $1
      AND se.section = 'Supervision'
      AND se.is_stale = FALSE
    ORDER BY se.event_name, se.start_time NULLS LAST`,
    [date]
  );

  // Separate FOA/AUTH from regular duty shifts
  const dutyShifts = new Map();  // duty -> [ {person, start, end}, ... ]
  let foaPerson = "";
  let authPerson = "";

  for (const row of result.rows) {
    if (row.event_name === "FOA") {
      foaPerson = row.person_name || "";
      continue;
    }
    if (row.event_name === "AUTH") {
      authPerson = row.person_name || "";
      continue;
    }
    if (!dutyShifts.has(row.event_name)) {
      dutyShifts.set(row.event_name, []);
    }
    dutyShifts.get(row.event_name).push({
      person: row.person_name || "",
      start: row.start_time || "",
      end: row.end_time || "",
    });
  }

  const rows = [];
  const emitted = new Set();

  // Emit duties in canonical order first
  for (const duty of DUTY_ORDER) {
    const shifts = dutyShifts.get(duty);
    if (!shifts || shifts.length === 0) continue;
    emitted.add(duty);
    const row = [duty];
    for (const s of shifts) {
      row.push(s.person, s.start, s.end);
    }
    rows.push(row);
  }

  // Emit any duties not in DUTY_ORDER (defensive)
  for (const [duty, shifts] of dutyShifts) {
    if (emitted.has(duty)) continue;
    const row = [duty];
    for (const s of shifts) {
      row.push(s.person, s.start, s.end);
    }
    rows.push(row);
  }

  // Footer row: app detects row[9] === "FOA", reads row[10] for FOA person, row[13] for AUTH person
  rows.push(["", "", "", "", "", "", "", "", "", "FOA", foaPerson, "", "", authPerson]);

  return rows;
}

/**
 * Build academics raw rows for one date.
 * Row: [groupName, start, end]
 *
 * The DB stores event_name as "Alpha FTC Academics" (appended by parsers.js).
 * Raw format needs just "Alpha FTC" — the app appends " Academics" itself.
 */
async function buildAcademicsRows(date) {
  const result = await query(
    `SELECT se.event_name, se.start_time, se.end_time
    FROM scheduled_event se
    WHERE se.date = $1
      AND se.section = 'Academics'
      AND se.is_stale = FALSE
    ORDER BY se.event_name`,
    [date]
  );

  // Header row — parser skips rows where row[0] === 'Academics'
  const rows = [["Academics", "", ""]];

  for (const ev of result.rows) {
    // Strip " Academics" suffix to restore the raw group name
    const groupName = ev.event_name.endsWith(ACAD_STRIP_SUFFIX)
      ? ev.event_name.slice(0, -ACAD_STRIP_SUFFIX.length)
      : ev.event_name;
    rows.push([groupName, ev.start_time || "", ev.end_time || ""]);
  }

  return rows;
}

export async function batchRoutes(fastify) {
  fastify.get("/batch", async (request, reply) => {
    const startMs = Date.now();

    try {
      const datesResult = await query(
        `SELECT date, sheet_name FROM schedule_date ORDER BY date ASC`
      );

      if (datesResult.rows.length === 0) {
        return reply.status(404).send({
          error: true,
          message: "No schedule dates in database. Run the import script first.",
        });
      }

      // Build all days in parallel
      const days = await Promise.all(
        datesResult.rows.map(async (dateRow) => {
          // pg returns date columns as JS Date objects; convert to ISO string
          const isoDate =
            dateRow.date instanceof Date
              ? dateRow.date.toISOString().split("T")[0]
              : String(dateRow.date).split("T")[0];

          const [flying, ground, na, supervision, academics] = await Promise.all([
            buildFlyingRows(isoDate),
            buildGroundRows(isoDate),
            buildNaRows(isoDate),
            buildSupervisionRows(isoDate),
            buildAcademicsRows(isoDate),
          ]);

          return {
            name: dateRow.sheet_name,
            isoDate,
            structureUsed: "current",
            data: {
              supervision,
              flying,
              ground,
              na,
              academics,
              personnelNotes: [],
            },
          };
        })
      );

      const elapsed = ((Date.now() - startMs) / 1000).toFixed(2) + "s";

      return reply.send({
        metadata: {
          "current-as-of": new Date().toISOString(),
          daysIncluded: days.length,
          cacheStatus: "db",
          cacheHits: days.length,
          cacheMisses: 0,
          processingTime: elapsed,
        },
        days,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: true,
        message: "Failed to build batch response: " + err.message,
      });
    }
  });
}
