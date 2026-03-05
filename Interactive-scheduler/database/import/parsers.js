// parsers.js - Server-side mirrors of the app batch-data parsing functions.
// Mirrors transformBatchData() in interactive-scheduler.html exactly.
// See Interactive-scheduler/database/database-structure.md for field-by-field docs.

/**
 * Reject strings that are notes, not person names.
 * Mirrors isValidName() in the HTML app (~line 2790).
 *
 * Rejects: non-strings, empty/whitespace, length > 25, "TRUE"/"FALSE", more than 4 words.
 */
export function isValidName(str) {
  if (!str || typeof str !== 'string') return false;
  const t = str.trim();
  if (!t || t.length > 25) return false;
  if (t === 'FALSE' || t === 'TRUE') return false;
  if (t.split(/\s+/).length > 4) return false;
  return true;
}

/**
 * Build the natural key: date|section|eventName|startTime|model
 * All components trimmed. null/empty become empty string (never null in the key).
 */
export function buildNaturalKey(date, section, eventName, startTime, model) {
  const d = (date || '').trim();
  const s = (section || '').trim();
  const e = (eventName || '').trim();
  const t = (startTime || '').trim();
  const m = (model || '').trim();
  return [d, s, e, t, m].join('|');
}

/**
 * Parse flying section rows for one day.
 *
 * Column layout (18 columns):
 *   0: model, 1: briefStart (startTime), 2: ETD, 3: ETA, 4: debriefEnd (endTime),
 *   5: eventName, 6-13: crew slots (8), 14: notes,
 *   15: Effective, 16: CX/Non-E (isCancelled), 17: Partially Effective
 */
export function parseFlyingEvents(rows, date) {
  if (!rows) return [];
  const results = [];
  rows.forEach(row => {
    const briefTime = row[1];
    const eventName = row[5];
    const model = (row[0] || '').trim();
    // Skip header row and truly empty rows
    if (eventName === 'Event') return;
    if (!briefTime && !eventName && !model) return;
    const crew = row.slice(6, 14).filter(isValidName).map((c, idx) => ({ name: c.trim(), position: idx }));
    const cxField = row[16];
    const isCancelled = cxField === 'TRUE' || cxField === true || cxField === 'CX';
    const isEffective = row[15] === 'TRUE' || row[15] === true;
    const isPartiallyEffective = row[17] === 'TRUE' || row[17] === true;
    const resolvedName = (eventName || model || 'Unnamed Event').trim();
    const startTime = (briefTime || '').trim() || null;
    const endTime = (row[4] || '').trim() || null;
    const etd = (row[2] || '').trim() || null;
    const eta = (row[3] || '').trim() || null;
    const notes = (row[14] && row[14] !== 'FALSE') ? row[14] : null;
    results.push({
      naturalKey: buildNaturalKey(date, 'Flying', resolvedName, startTime, model),
      section: 'Flying',
      model: model || null,
      eventName: resolvedName,
      startTime,
      endTime,
      etd,
      eta,
      notes,
      isReadonly: false,
      isCancelled,
      isEffective,
      isPartiallyEffective,
      personnel: crew,
    });
  });
  return results;
}

/**
 * Parse ground section rows for one day.
 *
 * Column layout (17 columns):
 *   0: eventName, 1: startTime, 2: endTime, 3-12: 10 personnel slots,
 *   13: notes, 14: Effective, 15: CX/Non-E, 16: Partially Effective
 */
export function parseGroundEvents(rows, date) {
  if (!rows) return [];
  const results = [];
  rows.forEach(row => {
    const evName = row[0];
    const start = row[1];
    // Skip header row ('Events') and padding rows (empty name and no start)
    if (evName === 'Events') return;
    if (!evName && !start) return;
    const people = row.slice(3, 13).filter(isValidName).map((p, idx) => ({ name: p.trim(), position: idx }));
    const cxGround = row[15];
    const isCancelled = cxGround === 'TRUE' || cxGround === true || cxGround === 'CX';
    const isEffective = row[14] === 'TRUE' || row[14] === true;
    const isPartiallyEffective = row[16] === 'TRUE' || row[16] === true;
    const resolvedName = (evName || 'Unnamed Event').trim();
    const startTime = (start || '').trim() || null;
    const endTime = (row[2] || '').trim() || null;
    const notes = (row[13] && row[13] !== 'FALSE') ? row[13] : null;
    results.push({
      naturalKey: buildNaturalKey(date, 'Ground', resolvedName, startTime, null),
      section: 'Ground',
      model: null,
      eventName: resolvedName,
      startTime,
      endTime,
      etd: null,
      eta: null,
      notes,
      isReadonly: false,
      isCancelled,
      isEffective,
      isPartiallyEffective,
      personnel: people,
    });
  });
  return results;
}

/**
 * Parse NA section rows for one day.
 *
 * Column layout (14 columns):
 *   0: reason (eventName), 1: startTime, 2: endTime, 3-12: personnel slots, 13: notes
 *
 * NA reason strings may have trailing whitespace (e.g. "NA ") -- trimmed on ingest (D11).
 */
export function parseNAEvents(rows, date) {
  if (!rows) return [];
  const results = [];
  rows.forEach(row => {
    const reason = row[0];
    const start = row[1];
    // Skip header ('Reason') and padding (no reason or no start)
    if (!reason || !start || reason === 'Reason') return;
    const people = row.slice(3).filter(isValidName).map((p, idx) => ({ name: p.trim(), position: idx }));
    const resolvedReason = reason.trim();
    const startTime = (start || '').trim() || null;
    const endTime = (row[2] || '').trim() || null;
    results.push({
      naturalKey: buildNaturalKey(date, 'NA', resolvedReason, startTime, null),
      section: 'NA',
      model: null,
      eventName: resolvedReason,
      startTime,
      endTime,
      etd: null,
      eta: null,
      notes: null,
      isReadonly: false,
      isCancelled: false,
      isEffective: false,
      isPartiallyEffective: false,
      personnel: people,
    });
  });
  return results;
}

/**
 * Parse supervision duty-shift rows for one day (excludes FOA/AUTH footer row).
 *
 * Structure: row[0]=duty role name, then triplets (person, startTime, endTime).
 * Each valid person+shift becomes one event record.
 * Footer row (row[9]==='FOA') is skipped here -- handled by parseFOAAuth().
 */
export function parseSupervisoryRows(rows, date) {
  if (!rows) return [];
  const results = [];
  rows.forEach(row => {
    // Skip FOA/AUTH footer row
    if (row[9] === 'FOA') return;
    const duty = row[0];
    if (!duty || duty === 'Supervision' || !duty.trim()) return;
    // Triplet loop: i=person position, i+1=startTime, i+2=endTime
    for (let i = 1; i < row.length - 2; i += 3) {
      const poc = row[i];
      if (poc && poc.trim() && isValidName(poc)) {
        const startTime = (row[i + 1] || '').trim() || null;
        const endTime = (row[i + 2] || '').trim() || null;
        const dutyName = duty.trim();
        results.push({
          naturalKey: buildNaturalKey(date, 'Supervision', dutyName, startTime, null),
          section: 'Supervision',
          model: null,
          eventName: dutyName,
          startTime,
          endTime,
          etd: null,
          eta: null,
          notes: null,
          isReadonly: false,
          isCancelled: false,
          isEffective: false,
          isPartiallyEffective: false,
          personnel: [{ name: poc.trim(), position: 0 }],
        });
      }
    }
  });
  return results;
}

/**
 * Parse FOA and AUTH from the supervision footer row.
 * Detected by row[9] === 'FOA'. row[10]=FOA person, row[13]=AUTH person.
 * Returns up to 2 event records (one each for FOA and AUTH).
 */
export function parseFOAAuth(rows, date) {
  if (!rows) return [];
  const results = [];
  const footerRow = rows.find(row => row[9] === 'FOA');
  if (!footerRow) return results;
  const foaPerson = (footerRow[10] && footerRow[10].trim()) ? footerRow[10].trim() : null;
  const authPerson = (footerRow[13] && footerRow[13].trim()) ? footerRow[13].trim() : null;
  if (foaPerson && isValidName(foaPerson)) {
    results.push({
      naturalKey: buildNaturalKey(date, 'Supervision', 'FOA', null, null),
      section: 'Supervision',
      model: null,
      eventName: 'FOA',
      startTime: null,
      endTime: null,
      etd: null,
      eta: null,
      notes: null,
      isReadonly: false,
      isCancelled: false,
      isEffective: false,
      isPartiallyEffective: false,
      personnel: [{ name: foaPerson, position: 0 }],
    });
  }
  if (authPerson && isValidName(authPerson)) {
    results.push({
      naturalKey: buildNaturalKey(date, 'Supervision', 'AUTH', null, null),
      section: 'Supervision',
      model: null,
      eventName: 'AUTH',
      startTime: null,
      endTime: null,
      etd: null,
      eta: null,
      notes: null,
      isReadonly: false,
      isCancelled: false,
      isEffective: false,
      isPartiallyEffective: false,
      personnel: [{ name: authPerson, position: 0 }],
    });
  }
  return results;
}

/**
 * Parse academics section rows for one day.
 *
 * Column layout (3 columns): 0=groupName, 1=startTime, 2=endTime.
 * Fixed 3 data rows after header. Empty times = not scheduled that day (stored as NULL).
 * No personnel in raw data (roster membership pulled at display time).
 */
export function parseAcademics(rows, date) {
  if (!rows) return [];
  const results = [];
  rows.forEach(row => {
    const group = row[0];
    const start = row[1];
    // Skip header ('Academics') and rows with no group or no start time
    if (!group || !start || group === 'Academics') return;
    const resolvedGroup = group.trim();
    const eventName = resolvedGroup + ' Academics';
    const startTime = (start || '').trim() || null;
    const endTime = (row[2] || '').trim() || null;
    results.push({
      naturalKey: buildNaturalKey(date, 'Academics', eventName, startTime, null),
      section: 'Academics',
      model: null,
      eventName,
      startTime,
      endTime,
      etd: null,
      eta: null,
      notes: null,
      isReadonly: true,
      isCancelled: false,
      isEffective: false,
      isPartiallyEffective: false,
      personnel: [],
    });
  });
  return results;
}
