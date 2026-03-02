# Interface Contracts — Shared Data Shapes & API Specs

> **Owner**: `backend-api-architect`
> **Last updated**: 2026-02-17
> **Read by**: ALL agents before working with data that crosses agent boundaries

This is the single source of truth for all data shapes flowing between the backend API, frontend UI, and test verification. When the code and this document disagree, **this document is the spec** — file a NEED handoff to fix the code, or update this document if the code is intentionally ahead.

---

## Table of Contents

1. [ScheduleEvent — Core Event Model](#1-scheduleevent--core-event-model)
2. [Roster & Personnel Model](#2-roster--personnel-model)
3. [Change Tracking Model](#3-change-tracking-model)
4. [Net Instructions Model](#4-net-instructions-model)
5. [Batch API Response](#5-batch-api-response)
6. [Event Classification](#6-event-classification)
7. [Merge Logic Contract](#7-merge-logic-contract)
8. [Persistence / localStorage](#8-persistence--localstorage)
9. [Color Scheme Contract](#9-color-scheme-contract)

---

## 1. ScheduleEvent — Core Event Model

The fundamental unit of data in the scheduler. Every event displayed on the timeline or rainbow view is a `ScheduleEvent`.

```typescript
interface ScheduleEvent {
  id: string;                      // Session-unique UUID via mkId()
  section: EventSection;           // Which schedule section this event belongs to
  date: string;                    // ISO date: "YYYY-MM-DD"
  model: string | null;            // Aircraft model (Flying events) or null
  eventName: string;               // Event title/name
  startTime: string;               // "HH:MM" format
  endTime: string | null;          // "HH:MM" format or null
  etd: string | null;              // Estimated Time of Departure (Flying only)
  eta: string | null;              // Estimated Time of Arrival (Flying only)
  personnel: string[];             // Current crew/personnel assigned
  originalPersonnel: string[];     // Original crew (for change tracking)
  notes: string | null;            // Freeform notes/metadata
  readonly: boolean;               // true for Supervision & Academics
}

type EventSection = 'Flying' | 'Ground' | 'NA' | 'Supervision' | 'Academics';
```

**Key behaviors:**
- `id` is regenerated each session — not stable across reloads
- `personnel` vs `originalPersonnel` diverge when user makes reassignments
- `readonly` events are included in conflict detection but cannot be edited
- Empty `personnel` arrays are valid (since v3.2)

**Natural key** (session-independent identity):
```typescript
const eventNaturalKey = (ev: ScheduleEvent): string =>
  `${ev.date}|${ev.section}|${ev.eventName}|${ev.startTime || ''}|${ev.model || ''}`;
```

---

## 2. Roster & Personnel Model

Defines how personnel are organized into training categories.

```typescript
type Roster = Record<string, string[]>;
// Maps category name → array of personnel names

type RosterCategory =
  | 'FTC-A'               // Fighter Training Course - Alpha
  | 'FTC-B'               // Fighter Training Course - Bravo
  | 'STC-A'               // Support Training Course - Alpha
  | 'STC-B'               // Support Training Course - Bravo
  | 'Staff IP'            // Staff - Instructor Pilot
  | 'Staff IFTE/ICSO'     // Staff - Instructor Flight Test Engineer / CSO
  | 'Staff STC'           // Staff - Support Training Course instructor
  | 'Attached/Support';   // Support personnel
```

**Name format:** Last name with optional first initial — e.g., `"Major, K"`, `"Bertke, F"`, `"Borek"`

**Name filtering** (`isValidName`):
- Rejects strings > 25 characters (likely notes, not names)
- Rejects strings with > 4 words
- Rejects literal `"FALSE"` and `"TRUE"` (spreadsheet artifacts)

---

## 3. Change Tracking Model

Records individual personnel add/remove operations for undo and net-change display.

```typescript
interface Change {
  type: 'add' | 'remove';         // What happened
  person: string;                  // Who was added/removed
  date: string;                    // ISO date of the event
  eventSection: string;            // Section of the event
  eventModel: string | null;       // Aircraft model (if Flying)
  eventName: string;               // Event name
  eventTime: string;               // "HH:MM" start time
  eventId: string;                 // Session-unique event ID
}
```

**Key behaviors:**
- Changes are appended (never mutated) — the array is the audit trail
- `computeNetChanges()` is a pure function over this array (display-only, non-destructive)
- Undo removes from the end of the array

---

## 4. Net Instructions Model

Collapsed view of raw changes for human-readable display.

```typescript
interface EventMeta {
  eventId: string;
  eventName: string;
  eventModel: string | null;
  eventTime: string;
  eventSection: string;
  date: string;
}

interface NetInstruction {
  type: 'add' | 'remove' | 'move';  // 'move' = paired add+remove
  persons: string[];                  // People affected (can be multiple)
  date: string;                       // ISO date
  source: EventMeta | null;           // null for 'add' type
  target: EventMeta | null;           // null for 'remove' type
  rawIndices: number[];               // Indices into original Change[] array
  firstIndex: number;                 // Min index for sorting
}
```

**Collapsing rules:**
- Matching add+remove for the same person on the same date → `'move'`
- Net-zero operations (add then remove from same event) → eliminated
- Multiple people with identical source/target → grouped into one instruction

---

## 5. Batch API Response

The GAS backend returns this shape from the batch endpoint.

```typescript
interface BatchResponse {
  metadata: {
    'current-as-of': string;       // ISO timestamp of data freshness
    daysIncluded: number;          // Number of schedule days
    cacheStatus: string;           // 'hit' | 'miss'
    processingTime: string;        // e.g., "28.80s"
  };
  days: BatchDay[];
  error?: boolean;
  message?: string;
}

interface BatchDay {
  name: string;                    // Human display: "Tue 10 Feb"
  isoDate: string;                 // "2026-02-10"
  structureUsed: string;           // "current" or version name
  data: BatchDayData;
}

interface BatchDayData {
  flying?: string[][];             // Array of flying event rows
  ground?: string[][];             // Array of ground event rows
  na?: string[][];                 // Array of N/A rows
  supervision?: string[][];        // Array of supervision rows
  academics?: string[][];          // Array of academics rows
}
```

### Row Formats

**Flying event row** (19 columns):
```
Index  Field                Example
[0]    Model                "C-12"
[1]    Brief/Start time     "08:00"
[2]    ETD                  "08:00"
[3]    ETA                  "10:00"
[4]    Debrief/End time     "10:00"
[5]    Event name           "CPT"
[6]    Lead crew member     "Major, K"
[7-13] Additional crew      "Bertke, F", "", ...
[14]   (unused)             ""
[15]   Notes                ""
[16]   Effective            "FALSE"
[17]   CX/Non-Effective     "FALSE"
[18]   Partially Effective  "FALSE"
```

**Ground event row** (similar structure, no model/ETD/ETA)

**Supervision event row** (shift-based):
```
Index  Field                Example
[0]    Duty name            "SOF"
[1]    Shift 1 person       "Borek"
[2]    Shift 1 start        "07:30"
[3]    Shift 1 end          "12:00"
[4]    Secondary ID         "411th"
[5]    Shift 2 start        "12:00"
[6]    Shift 2 end          "16:30"
[7-13] Additional shifts    ...
[14]   AUTH personnel        "Patel"
```

**Frontend pipeline:**
```
BatchResponse → transformBatchData(batchJson, roster) → ScheduleEvent[]
                → mergeDuplicateEvents(events, roster) → ScheduleEvent[] (consolidated)
                → setAllEvents(merged)
```

---

## 6. Event Classification

Maps events to training categories for color-coding and grouping.

```typescript
type EventClass = 'A-Class' | 'B-Class' | 'Staff' | 'Other';

function classifyEvent(ev: ScheduleEvent, roster: Roster): EventClass;
```

**Classification rules (in priority order):**

1. **Staff** — Event name contains any staff keyword:
   `MSN QUAL, NVG QUAL, CHECKRIDE, CURRENCY, FERRY FLIGHT, CHASE, CADET, NAVY, HI AOA, UPGRADE, VISTA UPG, FORM UPG, UPG`
   - **Exception**: Events matching `"P/S "` pattern are excluded from Staff classification

2. **A-Class** — Crew contains FTC-A or STC-A trainees AND count(A) > count(B)

3. **B-Class** — Crew contains FTC-B or STC-B trainees AND count(B) > count(A)

4. **Other** — Default for staff-led, mixed, or unclassifiable events

---

## 7. Merge Logic Contract

Defines how duplicate spreadsheet rows get consolidated into single events.

```typescript
function mergeDuplicateEvents(events: ScheduleEvent[], roster: Roster): ScheduleEvent[];
```

**Non-mergeable events** (pass through unchanged):
- `readonly === true` (Supervision, Academics)
- `section === 'NA'`

**Merge grouping key:**
- Flying: `date||section||model||eventName||startTime||endTime||etd||eta`
- Ground: `date||section||eventName||startTime||endTime`

**Within each group:**
- Sub-groups by lead `personnel[0]`
- Single lead → merge all crew into one event
- Multiple leads → sub-group by lead (staff leads prioritized)
- Notes combined with `"; "` separator
- First available etd/eta/endTime wins

---

## 8. Persistence / localStorage

How the app saves and restores state across page reloads.

**Storage keys:**
| Key | Contents |
|-----|----------|
| `'tps-scheduler-state'` | Selection + change state |
| `'tps-scheduler-working'` | Full working copy |
| `'tps-scheduler-theme'` | Theme preference (`'dark'` or `'light'`) |

```typescript
interface SavedState {
  changes: Change[];
  selectedIds: Set<string>;        // (serialized as array)
  selectedKeys: string[];          // eventNaturalKey for cross-session matching
  naCats: Set<string>;             // Selected NA categories (serialized as array)
  savedAt: string;                 // ISO timestamp
}

interface WorkingCopyData {
  workingEvents: ScheduleEvent[];  // Current working version of events
  changes: Change[];               // All recorded changes
  allEvents: ScheduleEvent[];      // Original unmodified events
  roster: Roster;                  // Complete roster
  dates: string[];                 // All schedule dates
  selectedIds: Set<string>;        // Selected event IDs (serialized as array)
  naCats: Set<string>;             // Selected NA categories (serialized as array)
  savedAt: string;                 // ISO timestamp
}
```

**Note:** `Set` types are serialized as arrays in JSON and reconstructed on load.

---

## 9. Color Scheme Contract

Maps roster categories to UI colors. Source of truth: `color-scheme.png` in project root.

| Category | Color Name | Usage |
|----------|-----------|-------|
| FTC-A | Purple | Event cards, personnel chips |
| FTC-B | Orange | Event cards, personnel chips |
| STC-A | Purple | Event cards, personnel chips |
| STC-B | Orange | Event cards, personnel chips |
| Staff IP | Green | Personnel chips |
| Staff IFTE/ICSO | Indigo | Personnel chips |
| Staff STC | Blue | Personnel chips |
| Attached/Support | Slate | Personnel chips |

**Event card colors** are determined by `classifyEvent()`:
- A-Class → Purple tones
- B-Class → Orange tones
- Staff → Green tones
- Other → Neutral/gray tones

---

## Contract Change Log

| Date | Contract | Change | By |
|------|----------|--------|----|
| 2026-02-17 | All | Initial documentation of existing data shapes | project setup |

<!-- When updating a contract, add a row to this table and update "Last updated" at the top -->
