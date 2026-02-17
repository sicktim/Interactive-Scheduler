# Duplicate Event Merging — Design & Implementation

## 1. Reasoning & Analysis

### The Problem
In the source spreadsheet ("whiteboard"), when an event has more crew than available column slots in a single row, schedulers duplicate the entire row and add overflow personnel to the new row. The instructor/lead is repeated in position 1 of every row. Students differ between rows.

From the whiteboard screenshot:
```
Airmanship Lecture | 08:00 | 10:00 | Payne | Knoerr S | Peterson R | Morrison J | Martinez P | Pessolanc | Ore | Novack R | Rogers | Orfitelli N
Airmanship Lecture | 08:00 | 10:00 | Payne | Dobbs D  | (blank)    | (blank)    | ...
```

Both rows represent the SAME event. After parsing, they become two separate event objects with different IDs. The merged result should be a single event with all unique crew members combined.

### Merge Criteria by Section

#### Flying Events
**Group key:** `date + section + model + eventName + startTime + endTime + etd + eta`
**Additional condition:** `personnel[0]` (lead instructor) must match

Rationale: Flying events have rich identifying data. Two flying events with the same model, name, brief time, ETD, ETA, and debrief end are extremely likely to be the same event if they also share the same lead instructor. This is the most restrictive matching — which is good, because flying events are safety-critical and we do NOT want to accidentally merge two genuinely separate sorties.

Example of legitimate non-duplicates: Two T-38 "LOW L/D P/S CHASE" sorties at the same time but with different instructors (Heary vs. Vantiger). These have different `personnel[0]`, so they will NOT be merged. This is correct — they are separate chase flights with separate crews.

#### Ground Events
**Group key:** `date + section + eventName + startTime + endTime`
**Additional condition:** `personnel[0]` (lead) must match

Rationale: Ground events have fewer distinguishing fields (no model, no ETD/ETA). The event name + time window + date is already quite specific. Adding the lead instructor check prevents merging two genuinely different sections of the same course that happen to run at the same time (e.g., two instructors each running "PIO SIM" for different student groups).

#### NA Events — DO NOT MERGE
Rationale: NA entries represent individual unavailabilities. Two people can independently be "TDY" at the same time — these are NOT the same event. The spreadsheet does NOT use the overflow-row pattern for NAs because NA rows don't have the same column-slot limitation. Each NA row is a distinct reason with its own people.

#### Readonly Events (Supervision, Academics) — DO NOT MERGE
Rationale: These are auto-generated from different data structures and should not have duplicates. Even if they did, merging readonly events would be harmless but adds risk for no benefit.

### Corner Cases Analyzed

#### 1. Two sections of the same course, same time, different instructors
**Example:** "PIO SIM (FS Sim A)" at 08:00-09:00 with McCafferty, vs "PIO SIM (FS Sim B)" at 08:00-09:00 with Slaughter
**Decision:** These have different event names ("FS Sim A" vs "FS Sim B"), so they won't match the group key. Safe.

But what about: Two sections named identically, same time, different instructors?
**Decision:** The `personnel[0]` check prevents this. Different instructors → different groups → no merge. This is the critical safety valve.

#### 2. Same instructor, same event name, different times
**Example:** "Airmanship Lecture" 08:00-10:00 and "Airmanship Lecture" 13:00-15:00
**Decision:** Different `startTime`/`endTime` → different group key → no merge. Correct.

#### 3. Three or more duplicate rows (not just two)
**Example:** A massive lecture with 20+ students spanning 3 rows, each starting with the same instructor.
**Decision:** The algorithm groups ALL events with the same key, not just pairs. If 3 rows share the same key + lead, all 3 merge into one event. The merging loops through all events in a group, combining personnel from each.

#### 4. The "lead" appearing in all duplicate rows
**Observation from screenshots:** The instructor (Payne) appears in `personnel[0]` of BOTH the original and overflow rows. After merging, Payne should appear exactly ONCE in the combined personnel list.
**Decision:** Use a Set or deduplication when combining personnel. The merged event's personnel is the union of all unique names across all duplicate rows.

#### 5. Personnel ordering after merge
**Decision:** Preserve the lead (personnel[0]) from the first event in position 0. Then append all other unique names in the order they appear across the remaining events. This maintains the instructor-first convention.

#### 6. originalPersonnel field
**Decision:** The merged event's `originalPersonnel` should be the combined deduplicated list (same as `personnel`). This is the "ground truth" for undo/reset — it should reflect the full crew as if the event were a single row.

#### 7. Event ID
**Decision:** Use the first event's ID. Discard IDs from subsequent duplicates. Since IDs are generated sequentially (`evt-1`, `evt-2`, ...) and used for selection/tracking, keeping the first one is the cleanest approach. Any `selectedIds` in localStorage that reference discarded IDs will simply not match — this is acceptable since the user would re-select events anyway when data changes.

#### 8. Notes field
**Decision:** Merge notes from all duplicate rows. If only one row has notes, use that. If multiple rows have different notes, concatenate with "; " separator. If all rows have the same notes, use it once. In practice, overflow rows rarely have notes (they're just crew overflow), so usually the first row's notes win.

#### 9. Empty crew after isValidName filtering
**Scenario:** A duplicate row has zero valid crew members (all columns were blank or contained notes that got filtered).
**Decision:** Still merge it — it just contributes nothing to the personnel list. The group key still matches, so it's consumed. This prevents phantom empty events from appearing.

#### 10. Order sensitivity
**Scenario:** Are duplicate rows always adjacent in the data? In the spreadsheet, yes — overflow rows immediately follow the original. But after API transformation, order within a day is preserved but across days it doesn't matter (we group by date in the key).
**Decision:** The algorithm doesn't depend on adjacency. It groups ALL events with the same key regardless of position in the array. This is more robust than an adjacency-based approach.

#### 11. What if personnel[0] is empty or undefined?
**Scenario:** A row where isValidName filtered out the first person, or the instructor column was blank.
**Decision:** If `personnel.length === 0`, the event has no lead. Use an empty string as the lead component of the key. Two events with no lead and the same name/time would merge — which is probably correct (they're likely the same empty placeholder). However, this is an extremely unlikely edge case since `transformBatchData` already skips flying rows with zero crew.

#### 12. Case sensitivity and whitespace in names
**Scenario:** "Payne" vs "payne" or "Payne " vs "Payne"
**Decision:** Names are already `.trim()`'d during parsing. Case sensitivity: names from the spreadsheet should be consistent, but we'll do a case-sensitive match. If TPS schedulers are consistent (which they are — this is military scheduling), case won't be an issue.

#### 13. Flying events: what if ETD/ETA are null on one row but present on another?
**Scenario:** Overflow row might have blank ETD/ETA columns.
**Decision:** Normalize nulls to empty string in the group key so `null === null` works. For the merged event, prefer the non-null value from any row.

---

## 2. The Function

```javascript
/**
 * Merges duplicate event rows into single events.
 *
 * In the source spreadsheet, when an event has more crew than available columns,
 * schedulers duplicate the row. This function detects and merges those duplicates.
 *
 * Merge criteria:
 * - Flying:  date + section + model + eventName + startTime + endTime + etd + eta + personnel[0]
 * - Ground:  date + section + eventName + startTime + endTime + personnel[0]
 * - NA:      never merged (individual unavailabilities)
 * - Readonly: never merged (Supervision, Academics)
 *
 * @param {Array} events - Array of parsed event objects from transformBatchData or transformSheetReturn
 * @returns {Array} New array with duplicates merged; non-duplicate events pass through unchanged
 */
const mergeDuplicateEvents = (events) => {
    if (!events || events.length === 0) return events;

    // Separate events into mergeable and non-mergeable
    const mergeableEvents = [];
    const passThroughEvents = [];

    events.forEach(ev => {
        if (ev.readonly || ev.section === 'NA' || ev.section === 'Supervision' || ev.section === 'Academics') {
            passThroughEvents.push(ev);
        } else {
            mergeableEvents.push(ev);
        }
    });

    // Build group keys for mergeable events
    const groups = new Map(); // key -> [events]

    mergeableEvents.forEach(ev => {
        const lead = (ev.personnel && ev.personnel.length > 0) ? ev.personnel[0] : '';
        let key;

        if (ev.section === 'Flying') {
            // Flying: rich key with model, ETD, ETA
            key = [
                ev.date,
                ev.section,
                (ev.model || '').trim(),
                (ev.eventName || '').trim(),
                (ev.startTime || ''),
                (ev.endTime || ''),
                (ev.etd || ''),
                (ev.eta || ''),
                lead
            ].join('||');
        } else {
            // Ground (and any future non-flying, non-NA editable sections)
            key = [
                ev.date,
                ev.section,
                (ev.eventName || '').trim(),
                (ev.startTime || ''),
                (ev.endTime || ''),
                lead
            ].join('||');
        }

        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(ev);
    });

    // Merge each group
    const mergedEvents = [];

    groups.forEach((group) => {
        if (group.length === 1) {
            // No duplicates — pass through as-is
            mergedEvents.push(group[0]);
            return;
        }

        // Multiple events in this group — merge them
        const primary = group[0]; // First event is the "primary" — keeps its ID

        // Combine personnel: lead first, then all unique others in order of appearance
        const lead = (primary.personnel && primary.personnel.length > 0) ? primary.personnel[0] : null;
        const seen = new Set();
        const combinedPersonnel = [];

        if (lead) {
            combinedPersonnel.push(lead);
            seen.add(lead);
        }

        // Add all non-lead personnel from all rows, preserving order of first appearance
        group.forEach(ev => {
            (ev.personnel || []).forEach(person => {
                if (!seen.has(person)) {
                    combinedPersonnel.push(person);
                    seen.add(person);
                }
            });
        });

        // Merge notes: collect unique non-null notes
        const noteSet = new Set();
        group.forEach(ev => {
            if (ev.notes && ev.notes.trim()) {
                noteSet.add(ev.notes.trim());
            }
        });
        const mergedNotes = noteSet.size > 0 ? [...noteSet].join('; ') : primary.notes;

        // For flying events, prefer non-null values for ETD/ETA/endTime
        // (overflow rows might have blank time fields)
        let mergedEtd = primary.etd;
        let mergedEta = primary.eta;
        let mergedEndTime = primary.endTime;
        if (primary.section === 'Flying') {
            group.forEach(ev => {
                if (!mergedEtd && ev.etd) mergedEtd = ev.etd;
                if (!mergedEta && ev.eta) mergedEta = ev.eta;
                if (!mergedEndTime && ev.endTime) mergedEndTime = ev.endTime;
            });
        }

        // Build the merged event
        const merged = {
            ...primary,
            etd: mergedEtd,
            eta: mergedEta,
            endTime: mergedEndTime,
            personnel: combinedPersonnel,
            originalPersonnel: [...combinedPersonnel],
            notes: mergedNotes,
        };

        mergedEvents.push(merged);
    });

    // Reconstruct the full event list, preserving original ordering
    // Strategy: replace the first occurrence of each group with the merged event,
    // remove subsequent occurrences
    const mergedById = new Map(); // primary event ID -> merged event
    const removedIds = new Set(); // IDs of events that were consumed by merging

    groups.forEach((group) => {
        if (group.length <= 1) return;
        const primaryId = group[0].id;
        // Find the merged event for this group
        const merged = mergedEvents.find(e => e.id === primaryId);
        mergedById.set(primaryId, merged);
        // Mark all non-primary events for removal
        for (let i = 1; i < group.length; i++) {
            removedIds.add(group[i].id);
        }
    });

    // Rebuild the array maintaining original order
    const result = [];
    events.forEach(ev => {
        if (removedIds.has(ev.id)) {
            // This event was merged into another — skip it
            return;
        }
        if (mergedById.has(ev.id)) {
            // This is the primary of a merged group — use the merged version
            result.push(mergedById.get(ev.id));
        } else {
            // Not involved in merging — pass through
            result.push(ev);
        }
    });

    return result;
};
```

---

## 3. Integration Instructions

### Where to call it

The function should be called **immediately after** events are produced by either `transformBatchData` or `transformSheetReturn`, and **before** the events are stored in React state via `setAllEvents`.

There are exactly **two integration points**:

#### Integration Point 1: API data path (line ~1935)

In the `App` component's `useEffect` loader, after `transformBatchData`:

```javascript
// BEFORE (line 1935):
loadedEvents = transformBatchData(batchJson, loadedRoster);

// AFTER:
loadedEvents = mergeDuplicateEvents(transformBatchData(batchJson, loadedRoster));
```

#### Integration Point 2: Sample data fallback path (line ~1098-1102)

In `buildSampleEvents()`:

```javascript
// BEFORE:
const buildSampleEvents = () => {
    const events = [];
    events.push(...transformSheetReturn(SAMPLE_SHEET, '2026-02-03'));
    events.push(...transformSheetReturn(SAMPLE_SHEET, '2026-02-04'));
    return events;
};

// AFTER:
const buildSampleEvents = () => {
    const events = [];
    events.push(...transformSheetReturn(SAMPLE_SHEET, '2026-02-03'));
    events.push(...transformSheetReturn(SAMPLE_SHEET, '2026-02-04'));
    return mergeDuplicateEvents(events);
};
```

### Where to place the function definition

Place `mergeDuplicateEvents` in the **DATA TRANSFORMATION** section, immediately after `transformBatchData` (after line 937, before the **CONFLICT DETECTION** section that starts at line 939). This keeps all data transformation logic together.

### No other changes needed

- Conflict detection runs on the merged events automatically (it just reads `allEvents`).
- The selection screen, scheduler view, change tracking, and localStorage all work with event IDs — the merged events keep the primary's ID, so everything flows through.
- `originalPersonnel` on merged events reflects the full combined crew, so undo/reset works correctly.

---

## 4. Test Scenarios

### Scenario 1: Ground event with overflow rows (from whiteboard screenshot)

**Input events (after transform):**
```javascript
[
  {
    id: 'evt-20', section: 'Ground', date: '2026-02-05',
    model: null, eventName: 'Airmanship Lecture',
    startTime: '08:00', endTime: '10:00',
    etd: null, eta: null,
    personnel: ['Payne', 'Knoerr, S', 'Peterson, R', 'Morrison, J', 'Martinez, P', 'Pessolano, C', 'Ore'],
    originalPersonnel: ['Payne', 'Knoerr, S', 'Peterson, R', 'Morrison, J', 'Martinez, P', 'Pessolano, C', 'Ore'],
    notes: null, readonly: false
  },
  {
    id: 'evt-21', section: 'Ground', date: '2026-02-05',
    model: null, eventName: 'Airmanship Lecture',
    startTime: '08:00', endTime: '10:00',
    etd: null, eta: null,
    personnel: ['Payne', 'Novack, R', 'Rogers', 'Orfitelli, N', 'Dobbs, D'],
    originalPersonnel: ['Payne', 'Novack, R', 'Rogers', 'Orfitelli, N', 'Dobbs, D'],
    notes: null, readonly: false
  }
]
```

**Expected output:**
```javascript
[
  {
    id: 'evt-20',  // keeps first event's ID
    section: 'Ground', date: '2026-02-05',
    model: null, eventName: 'Airmanship Lecture',
    startTime: '08:00', endTime: '10:00',
    etd: null, eta: null,
    personnel: ['Payne', 'Knoerr, S', 'Peterson, R', 'Morrison, J', 'Martinez, P', 'Pessolano, C', 'Ore', 'Novack, R', 'Rogers', 'Orfitelli, N', 'Dobbs, D'],
    originalPersonnel: ['Payne', 'Knoerr, S', 'Peterson, R', 'Morrison, J', 'Martinez, P', 'Pessolano, C', 'Ore', 'Novack, R', 'Rogers', 'Orfitelli, N', 'Dobbs, D'],
    notes: null, readonly: false
  }
]
```

Payne appears once. evt-21 is consumed. 11 total crew in merged event.

---

### Scenario 2: Flying events — legitimately separate (same name/time, different instructor)

**Input events:**
```javascript
[
  {
    id: 'evt-4', section: 'Flying', date: '2026-02-03',
    model: 'T-38', eventName: 'LOW L/D P/S CHASE',
    startTime: '09:30', endTime: '13:30',
    etd: '11:30', eta: '12:30',
    personnel: ['Heary', 'Reed, C'],
    originalPersonnel: ['Heary', 'Reed, C'],
    notes: null, readonly: false
  },
  {
    id: 'evt-5', section: 'Flying', date: '2026-02-03',
    model: 'T-38', eventName: 'LOW L/D P/S CHASE',
    startTime: '09:30', endTime: '13:30',
    etd: '11:30', eta: '12:30',
    personnel: ['Vantiger', 'Roberts, J'],
    originalPersonnel: ['Vantiger', 'Roberts, J'],
    notes: null, readonly: false
  }
]
```

**Expected output:** Unchanged — both events remain separate. Different `personnel[0]` (Heary vs. Vantiger) means different group key. These are genuinely separate chase flights.

---

### Scenario 3: NA events — never merged

**Input events:**
```javascript
[
  {
    id: 'evt-10', section: 'NA', date: '2026-02-03',
    eventName: 'TDY', startTime: '07:00', endTime: '17:00',
    personnel: ['Smith, K'], ...
  },
  {
    id: 'evt-11', section: 'NA', date: '2026-02-03',
    eventName: 'TDY', startTime: '07:00', endTime: '17:00',
    personnel: ['Patel'], ...
  }
]
```

**Expected output:** Unchanged — both NA events remain separate. Different people with the same NA reason are not duplicates.

---

### Scenario 4: Three-row overflow (large event)

**Input events:**
```javascript
[
  { id: 'evt-30', section: 'Ground', date: '2026-02-05',
    eventName: 'C-172 Ground School', startTime: '10:00', endTime: '11:00',
    personnel: ['Payne', 'Knoerr, S', 'Peterson, R', 'Morrison, J', 'Martinez, P', 'Pessolano, C', 'Ore'],
    ... },
  { id: 'evt-31', section: 'Ground', date: '2026-02-05',
    eventName: 'C-172 Ground School', startTime: '10:00', endTime: '11:00',
    personnel: ['Payne', 'Orfitelli, N', 'Dobbs, D', 'Pope, D', 'Sternat, N', 'Ryan, J'],
    ... },
  { id: 'evt-32', section: 'Ground', date: '2026-02-05',
    eventName: 'C-172 Ground School', startTime: '10:00', endTime: '11:00',
    personnel: ['Payne', 'Novack, R', 'Rogers'],
    ... }
]
```

**Expected output:** One event (id: evt-30) with all unique personnel combined:
`['Payne', 'Knoerr, S', 'Peterson, R', 'Morrison, J', 'Martinez, P', 'Pessolano, C', 'Ore', 'Orfitelli, N', 'Dobbs, D', 'Pope, D', 'Sternat, N', 'Ryan, J', 'Novack, R', 'Rogers']`

---

### Scenario 5: Notes merging

**Input events:**
```javascript
[
  { id: 'evt-40', section: 'Ground', eventName: 'Briefing', startTime: '07:00', endTime: '08:00',
    date: '2026-02-03', personnel: ['Borek', 'Smith'], notes: 'Room 204', ... },
  { id: 'evt-41', section: 'Ground', eventName: 'Briefing', startTime: '07:00', endTime: '08:00',
    date: '2026-02-03', personnel: ['Borek', 'Jones'], notes: null, ... }
]
```

**Expected output:** Merged event with `notes: 'Room 204'` (non-null note wins).

If both had different notes:
```
evt-40 notes: 'Room 204'
evt-41 notes: 'Bring laptop'
```
Result: `notes: 'Room 204; Bring laptop'`

---

### Scenario 6: Same event name, different dates — no merge

**Input:**
```javascript
[
  { section: 'Ground', date: '2026-02-03', eventName: 'Airmanship Lecture',
    startTime: '08:00', endTime: '10:00', personnel: ['Payne', 'Student A'], ... },
  { section: 'Ground', date: '2026-02-04', eventName: 'Airmanship Lecture',
    startTime: '08:00', endTime: '10:00', personnel: ['Payne', 'Student B'], ... }
]
```

**Expected output:** Unchanged — different dates produce different group keys.

---

### Scenario 7: Empty overflow row (zero crew after filtering)

**Input:**
```javascript
[
  { id: 'evt-50', section: 'Ground', eventName: 'Lecture', startTime: '08:00', endTime: '10:00',
    date: '2026-02-03', personnel: ['Payne', 'Student A', 'Student B'], ... },
  { id: 'evt-51', section: 'Ground', eventName: 'Lecture', startTime: '08:00', endTime: '10:00',
    date: '2026-02-03', personnel: [], ... }
]
```

**Expected output:** These will NOT merge because the empty event has `personnel[0] = undefined` (lead = `''`), while the first has lead = `'Payne'`. The empty event becomes a standalone event with no crew. This is correct behavior — if all crew was filtered out, it's safer to leave it as a separate (empty) event than to assume it belongs to the nearby event with the same name. In practice, `transformBatchData` already skips flying rows with zero crew (`if (crew.length === 0) return`), so this case mainly applies to ground events where zero-crew rows are allowed through.

**Alternative consideration:** If we wanted to handle the case where the overflow row only kept the instructor (who then got deduplicated away), we could check if `personnel.length <= 1 && personnel[0] matches another event's lead`. But this adds complexity for an edge case that the existing `isValidName` filter already handles well. The current approach is safe.

---

### Scenario 8: Readonly events pass through untouched

**Input:**
```javascript
[
  { section: 'Supervision', eventName: 'SOF', readonly: true, ... },
  { section: 'Academics', eventName: 'Alpha FTC Academics', readonly: true, ... }
]
```

**Expected output:** Unchanged. Readonly events are never merged.

---

## 5. Summary of Design Decisions

| Decision | Rationale |
|----------|-----------|
| Group key includes `personnel[0]` | Prevents merging legitimately separate events (different instructors) |
| Flying key includes model + ETD + ETA | Maximally restrictive — flying events have rich metadata |
| NA events excluded from merging | Individual unavailabilities are never overflow duplicates |
| Readonly events excluded | Supervision/Academics are auto-generated, no overflow pattern |
| Lead preserved in position 0 | Maintains instructor-first convention for display and conflict logic |
| Personnel deduplicated by exact string | Names already trimmed during parsing; consistent casing from military scheduling |
| Notes merged with "; " separator | Preserves all information; in practice, overflow rows rarely have notes |
| First event's ID used | Cleanest approach; discarded IDs simply stop matching selection sets |
| originalPersonnel set to combined list | Enables correct undo/reset behavior for the merged event |
| Order-independent grouping | More robust than adjacency-based; handles any event ordering |
| Original array order preserved | Merged event appears at the position of the first duplicate; subsequent duplicates removed |
