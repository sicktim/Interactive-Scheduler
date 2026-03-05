# TPS Interactive Scheduler -- Database Structure

> Living document -- updated as requirements evolve.
> Version: 1.1 (2026-03-05)

---

## Overview

This document defines a PostgreSQL database that **fully replaces all localStorage** in the Interactive Scheduler application. Every piece of state the app currently reads from or writes to `localStorage` has a corresponding table or column.

The database serves three roles:

1. **Canonical data store** -- Events, roster, and supervision data imported from the Google Apps Script (GAS) API live here instead of being held only in ephemeral React state.
2. **Working state persistence** -- User edits (personnel moves, event edits, cancellations, custom events, placeholders, highlights) are saved to the database instead of `localStorage`.
3. **Multi-user collaboration foundation** -- Per-user selections, theme preferences, and change tracking are isolated by user, enabling future real-time collaboration via PostgreSQL `LISTEN/NOTIFY`.

### What It Replaces

| localStorage Key | Replacement |
|---|---|
| `tps-scheduler-state` | `user_session` table (selectedIds, naCats, selectAllActive) |
| `tps-scheduler-working` | `working_event` + `event_change` + `user_session` tables |
| `tps-scheduler-custom-events` | `custom_event` table |
| `tps-scheduler-highlights` | `cell_highlight` table |
| `tps-duty-assignments` | `duty_assignment` table |
| `tps-scheduler-theme` | `user_preference` table |

---

## Raw Data Structure (GAS API Batch Response)

The GAS API returns a batch JSON object when called with `?type=batch`. This section documents its exact shape, field by field, as the source of truth for what the database must ingest.

### Top-Level Metadata

| Field | Type | Example | Notes |
|---|---|---|---|
| `current-as-of` | string (ISO 8601 UTC) | `"2026-02-27T12:34:56.000Z"` | Timestamp of batch generation |
| `daysIncluded` | number | `10` | Total days in batch |
| `cacheStatus` | string | `"hit"` or `"miss"` | GAS server-side cache status |
| `cacheHits` | number | `8` | Number of days served from cache |
| `cacheMisses` | number | `2` | Number of days fetched fresh |
| `processingTime` | string | `"2.28s"` | Total processing time (string with "s" suffix) |

**Database implication:** Metadata is not stored in a table. The `schedule_date.fetched_at` timestamp provides per-day freshness tracking. A future `batch_import_log` table could capture these fields for diagnostics.

### Day Structure

The batch contains an array of 10 day objects (skips weekends). Each day:

```json
{
  "name": "Fri 27 Feb",
  "isoDate": "2026-02-27",
  "structureUsed": "current",
  "data": {
    "supervision": ["..."],
    "flying": ["..."],
    "ground": ["..."],
    "na": ["..."],
    "academics": ["..."],
    "personnelNotes": ["..."]
  }
}
```

| Field | Maps To | Notes |
|---|---|---|
| `name` | `schedule_date.sheet_name` | Display label (e.g., "Fri 27 Feb") |
| `isoDate` | `schedule_date.date` | ISO date string, becomes PK |
| `structureUsed` | Not stored | Always "current" in current data |
| `data` | Parsed into `scheduled_event` + children | Six sub-arrays, each parsed differently |

### Section: Supervision (9 rows x 14-15 columns)

Each day has 9 supervision rows. Rows 0-7 are duty roles; row 8 is the FOA/AUTH footer.

**Duty rows (0-7) -- triplet structure:**

| Position | Content | Example |
|---|---|---|
| 0 | Duty role name | `"SOF"`, `"F-16 FDO"` |
| 1-3 | Shift 1: person, startTime, endTime | `"Harms, J"`, `"06:00"`, `"12:00"` |
| 4-6 | Shift 2: person, startTime, endTime | `"Smith, K"`, `"12:00"`, `"18:00"` |
| 7-9 | Shift 3: person, startTime, endTime | Often empty |
| 10-13 | Special duty: type, start, end, notes | `"COVER 416th"`, `"06:00"`, `"18:00"`, `""` |

**Duty roles in order:** SOF, OS, ODO, F-16 FDO, T-38 TDO, C-12 TDO, A-29 ADO, Other (As Req'd).

C-12 TDO, A-29 ADO, and Other are frequently all-empty.

Squadron IDs ("416th", "411th") appear in person name positions -- these are organizational identifiers, not people.

**FOA/AUTH footer (row 8, 15 elements):**

| Position | Content |
|---|---|
| 0 | Role label (e.g., "SOF" -- reused from structure) |
| 1-9 | Various (often empty) |
| 10 | `"FOA"` literal marker |
| 11-12 | Empty |
| 13 | `"AUTH"` literal marker |
| 14 | AUTH person name (always filled) |

**Parser behavior:** The supervision parser iterates triplets with `i=1; i<row.length-2; i+=3`. FOA/AUTH detection checks `row[9]==='FOA'` (note: position 9, not 10 -- zero-indexed from the trimmed row).

### Section: Flying (81 rows x 18 columns)

Row 0 is a header row (skipped by parser). Data rows (1-80):

| Column | Field | Type | Notes |
|---|---|---|---|
| 0 | model | string | Aircraft type: T-38, F-16, C-12, LJ-25, GLIDER, FS SIM A, etc. (17 distinct values + empty). **Trailing whitespace common** (e.g., `"F-16 "` vs `"F-16"`) |
| 1 | briefStart | string | HH:MM format |
| 2 | ETD | string | HH:MM -- mapped to `etd` |
| 3 | ETA | string | HH:MM -- mapped to `eta` |
| 4 | debriefEnd | string | HH:MM format |
| 5 | eventName | string | |
| 6-13 | crew slots 1-8 | string | **8 crew slots**. Names or empty. See Data Quality for anomalies |
| 14 | notes | string | |
| 15 | Effective | string | `"TRUE"` or `"FALSE"` (string, not boolean) |
| 16 | CX/Non-E | string | `"TRUE"` or `"FALSE"` -- maps to `is_cancelled` |
| 17 | Partially E | string | `"TRUE"` or `"FALSE"` -- always FALSE in current data |

**Multi-row events:** 171 cases across the 10-day batch where the same event spans multiple consecutive rows (one per crew member). The flying parser merges these into a single event by accumulating crew from consecutive rows sharing the same event identity.

**Time mapping:** briefStart -> startTime, debriefEnd -> endTime. ETD/ETA are stored separately.

### Section: Ground (61 rows x 17 columns)

Row 0 is a header row (skipped by parser). Data rows (1-60):

| Column | Field | Type | Notes |
|---|---|---|---|
| 0 | eventName | string | |
| 1 | startTime | string | HH:MM format |
| 2 | endTime | string | HH:MM format |
| 3-12 | personnel slots 1-10 | string | **10 personnel slots** (parser uses `row.slice(3, 13)`) |
| 13 | notes | string | Currently empty in all data |
| 14 | Effective | string | `"TRUE"` or `"FALSE"` |
| 15 | CX/Non-E | string | `"TRUE"` or `"FALSE"` |
| 16 | Partially E | string | `"TRUE"` or `"FALSE"` -- only 1 event TRUE across entire dataset |

**Padding rows:** 34-48 padding rows per day have empty event names and are filtered out by the parser.

### Section: NA (61 rows x 14 columns)

Row 0 is a header row (skipped by parser). Data rows (1-60):

| Column | Field | Type | Notes |
|---|---|---|---|
| 0 | reason | string | Category (39 unique values: Med, NA, Appt, Meeting, etc.). **Trailing whitespace** (e.g., `"NA "`) |
| 1 | startTime | string | HH:MM format. No all-day events; all have explicit times |
| 2 | endTime | string | HH:MM format |
| 3 | primary person | string | Main person for this NA entry |
| 4-12 | additional person slots | string | Structural support for up to 10 persons with alternate time slots. **All empty in current data** |
| 13 | notes | string | 1.4% fill rate (rare) |

**Parser behavior:** Uses variable-length `row.slice(3)` for personnel, then filters through `isValidName()`.

**Volume:** 74 real events across 10 days, 526 padding rows.

### Section: Academics (4 rows x 3 columns)

Row 0 is a header row (skipped by parser). Always exactly 3 data rows:

| Row | Group Name | Maps To Category |
|---|---|---|
| 1 | Alpha FTC | FTC-A |
| 2 | Alpha STC | STC-A |
| 3 | Bravo FTC | FTC-B |

Each row: `[groupName, startTime, endTime]`. Empty times (`""`, `""`) mean not scheduled that day.

**No personnel in the raw data.** The app maps group names to roster categories via `groupMap` and pulls ALL members of that category to display.

**Readonly section:** Academics events have `is_readonly = true`.

### Section: personnelNotes (10 category groups per day, nested arrays)

**Not currently consumed by the app.** Roster comes from the separate `?type=roster` endpoint. Documented here because the database could store this data for daily availability tracking.

**Structure:** 10 category groups, each containing a header row + person rows.

Categories in order: FTC-B, FTC-A, Staff IP, Staff IFTE/ICSO, Attached/Support, STC-B, STC-A, Staff STC, Future Category 1, Future Category 2.

Each group:
```
Header: [categoryName, "Pucks", "Occupied Times", "Notes"]
Person: [name, puckCount, occupiedTimeRanges, notes]
```

| Field | Example | Notes |
|---|---|---|
| name | `"Bertke, F"` | Placeholder rows use `"."` as name |
| puckCount | `"3"` | Number of pucks (string) |
| occupiedTimeRanges | `"07:00-11:30,13:00-15:00"` | Comma-separated HH:MM-HH:MM ranges |
| notes | `"TDY"`, `"LV"`, `"Course Prep"` | Encodes availability/status |

**Database potential:** This data could populate a `daily_personnel_status` table for availability tracking, supporting conflict detection and workload analysis. The "Future Category 1/2" groups indicate the spreadsheet structure is pre-allocated for expansion.

---

## Data Quality

Known issues in the raw API data that the parser and database must handle.

### Name Anomalies

| Issue | Example | Frequency | Handling |
|---|---|---|---|
| Asterisk suffix | `"Clements, J *"` | Occasional | Stored verbatim; roster matching must strip or account for suffix |
| Question marks | `"Sally?"` | Rare | Stored verbatim |
| Operational notes in crew slots | Squadron IDs in supervision | Common in supervision | `isValidName()` filters most; supervision parser handles differently |
| Placeholder dots | `"."` in personnelNotes | Every category group | Filtered by parser (personnelNotes not consumed) |

### Time Anomalies

| Issue | Example | Frequency | Handling |
|---|---|---|---|
| Corrupted times | `"09:0"` (missing digit) | Rare (NA section) | Stored verbatim; app should validate/correct display-side |
| Empty times | `""` for Academics | Common | Stored as NULL in database |

### Whitespace Issues

| Issue | Example | Frequency | Handling |
|---|---|---|---|
| Trailing space on model | `"F-16 "` vs `"F-16"` | Common in flying | **Trim on ingest.** natural_key must use trimmed values |
| Trailing space on NA reason | `"NA "` vs `"NA"` | Common in NA | **Trim on ingest** |

### Boolean-as-String

| Issue | Example | Notes |
|---|---|---|
| TRUE/FALSE strings | `"TRUE"`, `"FALSE"` in Effective/CX columns | Parser converts to boolean. `isValidName()` also rejects these as crew names |

### Padding Rows

| Section | Padding Per Day | Notes |
|---|---|---|
| Flying | ~0 (rows are dense) | Multi-row events, not padding |
| Ground | 34-48 rows | Empty eventName indicates padding |
| NA | ~52 rows | Empty reason indicates padding |
| Academics | 0 | Fixed 3 rows always |

---

## Data Flow

### Normal Startup (Existing Working State)

```
Browser opens
  -> API: GET /api/session (check for saved working state)
  -> If working state exists in DB:
       Load working_event[], event_change[], user_session
       -> Go directly to Scheduler View
  -> Else:
       -> API: GET /api/refresh (triggers GAS fetch + upsert)
       -> Load events from scheduled_event[]
       -> Check user_session for saved selections
       -> Go to Event Selection or Scheduler View
```

### "Refresh from Whiteboard" Flow

```
User clicks Refresh
  -> API: POST /api/refresh?mode=full|quick
  -> Server fetches GAS ?type=batch and ?type=roster
  -> Server parses batch data using same parser logic
  -> UPSERT into scheduled_event:
       - Match by natural key (date + section + eventName + startTime + model)
       - Update existing rows
       - Insert new rows
       - Mark removed rows as stale (soft delete)
  -> UPSERT into roster_person:
       - Reconcile person names with categories
  -> Clear working_event[] for this user
  -> Restore selections by natural key matching
  -> Return fresh data to client
```

### Edit Flow (During Session)

```
User makes an edit (drag person, edit event, etc.)
  -> Client writes to React state (unchanged)
  -> Client calls API: POST /api/working-event/save
       { workingEvents, changes }
  -> Server upserts working_event[] rows
  -> Server appends to event_change[]
  -> Server updates user_session.saved_at
```

---

## Entity Map

### Source Entities (from GAS API -- global, shared)

#### `scheduled_event` -- Normalized Event

Replaces: the `allEvents` array in React state, populated by `transformBatchData()`.

| App Field | DB Column | Type | Notes |
|---|---|---|---|
| `id` (session-scoped "evt-N") | `id` (UUID) | `uuid` | Stable across sessions; replaces mkId() |
| `section` | `section` | `text` | 'Flying', 'Ground', 'NA', 'Supervision', 'Academics' |
| `date` | `date` | `date` | ISO YYYY-MM-DD |
| `model` | `model` | `text NULL` | Aircraft type; null for non-Flying. **Trimmed on ingest** |
| `eventName` | `event_name` | `text` | Duty name, event name, NA reason. **Trimmed on ingest** |
| `startTime` | `start_time` | `text NULL` | 'HH:MM'; null for FOA/AUTH events and unscheduled Academics |
| `endTime` | `end_time` | `text NULL` | 'HH:MM' |
| `etd` | `etd` | `text NULL` | Flying only (Estimated Time of Departure) |
| `eta` | `eta` | `text NULL` | Flying only (Estimated Time of Arrival) |
| `personnel` | *(junction table)* | -- | See `event_personnel` |
| `originalPersonnel` | *(junction table)* | -- | See `event_personnel.is_original` |
| `notes` | `notes` | `text NULL` | |
| `readonly` | `is_readonly` | `boolean` | true for Academics; false for others |
| `cancelled` | `is_cancelled` | `boolean` | CX/Non-E flag from spreadsheet |
| `effective` | `is_effective` | `boolean` | Flying/Ground only |
| `partiallyEffective` | `is_partially_effective` | `boolean` | Flying/Ground only (only 1 TRUE across entire current dataset) |
| `isCustom` | *(separate table)* | -- | See `custom_event` |
| *(derived)* | `natural_key` | `text` | Computed: `date\|section\|eventName\|startTime\|model` (all values trimmed) |
| *(new)* | `source_hash` | `text NULL` | Hash of raw API row for upsert diffing |
| *(new)* | `is_stale` | `boolean` | true when removed during refresh |
| *(new)* | `created_at` | `timestamptz` | |
| *(new)* | `updated_at` | `timestamptz` | |
| *(new)* | `updated_by` | `uuid NULL` | FK to app_user |


**Raw column counts by section (before parsing):**
- Flying: 18 columns (model + 4 times + eventName + 8 crew + notes + 3 status flags)
- Ground: 17 columns (eventName + 2 times + 10 personnel + notes + 3 status flags)
- NA: 14 columns (reason + 2 times + 10 person slots + notes)
- Supervision: 14-15 columns (role + up to 3 shift triplets + special duty quad)
- Academics: 3 columns (groupName + 2 times)

#### `event_personnel` -- Crew Assignments on Source Events

Replaces: the `personnel[]` and `originalPersonnel[]` arrays on each event object.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `event_id` | `uuid` | FK to scheduled_event |
| `person_name` | `text` | Display name as received from API (e.g., "Larsen, R"). Stored after `isValidName()` filtering |
| `position` | `smallint` | 0-based index in the crew array (preserves ordering) |
| `is_original` | `boolean` | true = from API; false = user-added during working session |

**Why `person_name` and not a FK to a person table?** The GAS API returns display names, not IDs. The same person may appear as "Harms, J *" (with asterisk). Until a master person registry is built, we store names verbatim and match via the roster for category/color lookups.


**Slot counts by section:**
- Flying events: up to 8 personnel per raw row (after multi-row merge, a single event can have more than 8)
- Ground events: up to 10 personnel
- NA events: up to 10 structurally, typically 1 in practice (all additional slots empty in current data)
- Supervision events: 1 person per shift (up to 3 shifts per role)
- Academics: 0 from raw data (entire category membership pulled at display time from roster)

#### `roster_person` -- Personnel Roster

Replaces: the `roster` object in React state (`{ "FTC-A": ["Bertke, F", ...], ... }`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `display_name` | `text` | Name as shown in UI |
| `category_id` | `text` | One of the 8 personnel categories |
| `sort_order` | `smallint` | Position within category (preserves spreadsheet order) |
| `is_active` | `boolean` | Soft delete for people removed in a roster refresh |
| `updated_at` | `timestamptz` | |

#### `schedule_date` -- Active Schedule Dates

Replaces: the `dates` array in React state.

| Column | Type | Notes |
|---|---|---|
| `date` | `date` | PK -- ISO date |
| `sheet_name` | `text` | Display label from GAS (e.g., "Tue 3 Feb") |
| `fetched_at` | `timestamptz` | When this date's data was last refreshed |

---

### Working Entities (per-user editable state)

#### `working_event` -- Modified Event Snapshot

Replaces: the `workingEvents` array saved in `tps-scheduler-working`.

All fields from `scheduled_event` plus `user_id`, `source_event_id`, `is_custom`, and `saved_at`.

#### `working_event_personnel` -- Crew on Working Events

Same shape as `event_personnel` but references `working_event`.

#### `working_event_placeholder` -- Placeholder Slots

Replaces: the `placeholders[]` array on each event (`{ id, role, filledBy }`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `working_event_id` | `uuid` | FK to working_event |
| `role` | `text` | 'IP', 'IFTE/ICSO', 'Staff STC', 'FTC-A', 'FTC-B', 'STC-A', 'STC-B', 'Generic' |
| `filled_by` | `text NULL` | Person name who was dropped onto this slot |

---

### Change Tracking

#### `event_change` -- Raw Change Log

Replaces: the `changes[]` array. Stores raw changes (not net changes). 6 change types: `add`, `remove`, `event-cancel`, `event-edit`, `event-status`, `event-delete`. Each type uses a different subset of the nullable columns (person, before_json/after_json, cancelled_before/after, status_field/before/after).

---

### Custom Events

#### `custom_event` -- User-Created Events

Replaces: `tps-scheduler-custom-events`. Same event fields as `scheduled_event` plus `created_by` and `is_deleted` (soft delete).

---

### Duty Assignments

#### `duty_assignment` -- FOA/AUTH Duty Pucks

Replaces: `tps-duty-assignments`. Per user, per day, per slot ('foa'/'auth'), with person_name and position for ordering.

---

### Cell Highlights

#### `cell_highlight` -- Whiteboard Color Annotations

Replaces: `tps-scheduler-highlights`. Maps `event_id:field` to a `color_key` ('yellow', 'ftca', 'ftcb'). Per user.

---

### User & Session State

#### `app_user`, `user_session`, `user_preference`

`user_session` stores selectedIds, selectedKeys, naCats, selectAllActive as JSONB arrays. `user_preference` stores theme ('dark'/'light') and default_view.

---

## Schema

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- REFERENCE DATA

CREATE TABLE personnel_category (
    id text PRIMARY KEY, display_name text NOT NULL, sort_order smallint NOT NULL,
    is_staff boolean NOT NULL DEFAULT FALSE, is_student boolean NOT NULL DEFAULT FALSE,
    color_bg text NOT NULL, color_text text NOT NULL
);

CREATE TABLE event_section (
    id text PRIMARY KEY, display_name text NOT NULL, badge_code text NOT NULL,
    badge_color text NOT NULL, sort_order smallint NOT NULL,
    is_readonly boolean NOT NULL DEFAULT FALSE
);

CREATE TABLE supervision_role (
    id text PRIMARY KEY, display_name text NOT NULL, sort_order smallint NOT NULL
);

-- USERS

CREATE TABLE app_user (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL UNIQUE, display_name text NOT NULL,
    is_active boolean NOT NULL DEFAULT TRUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_preference (
    user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
    theme text NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    default_view text NULL CHECK (default_view IS NULL OR default_view IN ('timeline', 'whiteboard', 'rainbow')),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ROSTER

CREATE TABLE roster_person (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name text NOT NULL,
    category_id text NOT NULL REFERENCES personnel_category(id),
    sort_order smallint NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT TRUE,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (display_name, category_id)
);

-- SCHEDULE DATES

CREATE TABLE schedule_date (
    date date PRIMARY KEY, sheet_name text NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now()
);

-- SCHEDULED EVENTS

CREATE TABLE scheduled_event (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    section text NOT NULL REFERENCES event_section(id),
    date date NOT NULL REFERENCES schedule_date(date),
    model text NULL, event_name text NOT NULL,
    start_time text NULL, end_time text NULL,
    etd text NULL, eta text NULL, notes text NULL,
    is_readonly boolean NOT NULL DEFAULT FALSE,
    is_cancelled boolean NOT NULL DEFAULT FALSE,
    is_effective boolean NOT NULL DEFAULT FALSE,
    is_partially_effective boolean NOT NULL DEFAULT FALSE,
    natural_key text NOT NULL UNIQUE,
    source_hash text NULL,
    is_stale boolean NOT NULL DEFAULT FALSE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NULL REFERENCES app_user(id)
);

CREATE TABLE event_personnel (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES scheduled_event(id) ON DELETE CASCADE,
    person_name text NOT NULL, position smallint NOT NULL,
    is_original boolean NOT NULL DEFAULT TRUE,
    UNIQUE (event_id, person_name)
);

-- CUSTOM EVENTS

CREATE TABLE custom_event (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by uuid NOT NULL REFERENCES app_user(id),
    section text NOT NULL REFERENCES event_section(id),
    date date NOT NULL, model text NULL, event_name text NOT NULL,
    start_time text NULL, end_time text NULL,
    etd text NULL, eta text NULL, notes text NULL,
    is_deleted boolean NOT NULL DEFAULT FALSE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- WORKING STATE

CREATE TABLE working_event (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    source_event_id uuid NULL REFERENCES scheduled_event(id),
    section text NOT NULL, date date NOT NULL,
    model text NULL, event_name text NOT NULL,
    start_time text NULL, end_time text NULL,
    etd text NULL, eta text NULL, notes text NULL,
    is_readonly boolean NOT NULL DEFAULT FALSE,
    is_cancelled boolean NOT NULL DEFAULT FALSE,
    is_effective boolean NOT NULL DEFAULT FALSE,
    is_partially_effective boolean NOT NULL DEFAULT FALSE,
    is_custom boolean NOT NULL DEFAULT FALSE,
    saved_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE working_event_personnel (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    working_event_id uuid NOT NULL REFERENCES working_event(id) ON DELETE CASCADE,
    person_name text NOT NULL, position smallint NOT NULL
);

CREATE TABLE working_event_placeholder (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    working_event_id uuid NOT NULL REFERENCES working_event(id) ON DELETE CASCADE,
    role text NOT NULL, filled_by text NULL
);

-- CHANGE TRACKING

CREATE TABLE event_change (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    sequence integer NOT NULL,
    change_type text NOT NULL CHECK (change_type IN ('add','remove','event-cancel','event-edit','event-status','event-delete')),
    event_id text NULL, event_name text NULL, event_model text NULL,
    event_time text NULL, event_section text NULL, date date NULL,
    person text NULL,
    before_json jsonb NULL, after_json jsonb NULL,
    cancelled_before boolean NULL, cancelled_after boolean NULL,
    status_field text NULL, status_before boolean NULL, status_after boolean NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- DUTY ASSIGNMENTS

CREATE TABLE duty_assignment (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    date date NOT NULL,
    slot text NOT NULL CHECK (slot IN ('foa', 'auth')),
    person_name text NOT NULL, position smallint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, date, slot, person_name)
);

-- CELL HIGHLIGHTS

CREATE TABLE cell_highlight (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    event_id text NOT NULL, field text NOT NULL, color_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, event_id, field)
);

-- USER SESSION

CREATE TABLE user_session (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    selected_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    selected_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
    na_cats jsonb NOT NULL DEFAULT '[]'::jsonb,
    select_all_active boolean NOT NULL DEFAULT FALSE,
    has_working_state boolean NOT NULL DEFAULT FALSE,
    saved_at timestamptz NOT NULL DEFAULT now()
);
```

---

## Indexes

```sql
CREATE INDEX idx_event_date ON scheduled_event(date);
CREATE INDEX idx_event_date_section ON scheduled_event(date, section);
CREATE INDEX idx_event_not_stale ON scheduled_event(date) WHERE is_stale = FALSE;
CREATE INDEX idx_event_personnel_name ON event_personnel(person_name);
CREATE INDEX idx_event_personnel_event ON event_personnel(event_id);
CREATE INDEX idx_roster_category ON roster_person(category_id);
CREATE INDEX idx_roster_name ON roster_person(display_name);
CREATE INDEX idx_working_event_user ON working_event(user_id);
CREATE INDEX idx_working_event_user_date ON working_event(user_id, date);
CREATE INDEX idx_working_personnel_event ON working_event_personnel(working_event_id);
CREATE INDEX idx_working_placeholder_event ON working_event_placeholder(working_event_id);
CREATE INDEX idx_change_user_seq ON event_change(user_id, sequence);
CREATE INDEX idx_custom_event_user ON custom_event(created_by);
CREATE INDEX idx_custom_event_date ON custom_event(date);
CREATE INDEX idx_duty_user_date ON duty_assignment(user_id, date);
CREATE INDEX idx_highlight_user ON cell_highlight(user_id);
```

---

## Refresh Strategy

### Full Refresh (`mode=full`)

1. Server adds `&refresh=true` to GAS API URL to bypass Google cache.
2. Fetches `?type=roster` and `?type=batch` in parallel.
3. Parses using `transformBatchData()` logic (ported to server-side).
4. Computes `natural_key` = `date|section|eventName|startTime|model` **(all values trimmed)**.
5. Upserts `scheduled_event` via `ON CONFLICT (natural_key) DO UPDATE`.
6. Marks missing events as stale (`is_stale = TRUE`).
7. Replaces `event_personnel` rows per event.
8. Upserts `roster_person` and `schedule_date` rows.
9. Clears user's working state tables.
10. Restores selections via `selected_keys` matching.


### Parser Behaviors (Server-Side)

The server must replicate the client-side parser logic. Key behaviors per section:

#### Flying Parser
- **Skips row 0** (header row).
- **Multi-row merge:** When consecutive rows share the same event identity (model + eventName + times), the parser accumulates crew from each row into one event. 171 multi-row cases across 10 days in current data.
- **8 crew slots** at columns 6-13. Each filtered through `isValidName()`.
- **Time mapping:** col 1 (briefStart) -> startTime, col 4 (debriefEnd) -> endTime. cols 2-3 -> etd/eta.
- **Trim model names** to avoid `"F-16 "` vs `"F-16"` natural_key collisions.
- **Boolean conversion:** cols 15-17 are `"TRUE"`/`"FALSE"` strings, converted to boolean.
- **Fallback eventName:** If eventName is empty, falls back to model or `"Unnamed Event"`.

#### Ground Parser
- **Skips row 0** (header row).
- **10 personnel slots** at columns 3-12 (`row.slice(3, 13)`). Each filtered through `isValidName()`.
- **Padding filter:** Rows with empty eventName (col 0) are skipped. 34-48 padding rows per day.
- **Notes** at col 13 (currently always empty in data).

#### NA Parser
- **Skips row 0** (header row).
- **Variable-length personnel** via `row.slice(3)`. Filtered through `isValidName()`.
- **Padding filter:** Rows with empty reason (col 0) are skipped. ~52 padding rows per day.
- **1 person typical:** Although structure supports up to 10, all additional slots are empty in current data.

#### Supervision Parser
- **Triplet iteration:** `for (i=1; i<row.length-2; i+=3)` extracts person, startTime, endTime.
- **FOA/AUTH detection:** Row 8 detected by `row[9]==='FOA'`. AUTH person at position 14 (always filled).
- **Creates one event per shift** (not one per role). A role with 2 shifts becomes 2 events.

#### Academics Parser
- **Fixed 3 events:** Alpha FTC, Alpha STC, Bravo FTC.
- **No personnel in raw data.** Uses `groupMap` to look up roster category, pulls ALL members.
- **Empty times** = not scheduled that day. Stored as NULL.

#### isValidName() Filter
Rejects values that are not real person names:
- Empty string or whitespace
- Length > 25 characters
- More than 4 words (spaces)
- Exact string `"TRUE"` or `"FALSE"`

### Incremental Save (During Editing)

Client POSTs changed working events. Server upserts specific rows and appends change log entries.

---

## Per-User State

**Global:** `personnel_category`, `event_section`, `supervision_role`, `roster_person`, `schedule_date`, `scheduled_event`, `event_personnel`.

**Per-User:** `app_user`, `user_preference`, `user_session`, `working_event` + personnel + placeholders, `event_change`, `duty_assignment`, `cell_highlight`, `custom_event`.

---

## Seed Data

```sql
INSERT INTO personnel_category VALUES
    ('FTC-A','FTC-A',1,FALSE,TRUE,'#7c3aed','#f3e8ff'),
    ('FTC-B','FTC-B',2,FALSE,TRUE,'#ea580c','#fff7ed'),
    ('STC-A','STC-A',3,FALSE,TRUE,'#9333ea','#fae8ff'),
    ('STC-B','STC-B',4,FALSE,TRUE,'#f97316','#ffedd5'),
    ('Staff IP','Staff IP',5,TRUE,FALSE,'#16a34a','#dcfce7'),
    ('Staff IFTE/ICSO','Staff IFTE/ICSO',6,TRUE,FALSE,'#4338ca','#e0e7ff'),
    ('Staff STC','Staff STC',7,TRUE,FALSE,'#2563eb','#dbeafe'),
    ('Attached/Support','Attached/Support',8,FALSE,FALSE,'#64748b','#f1f5f9');

INSERT INTO event_section VALUES
    ('Supervision','Supervision','SP','#d97706',1,FALSE),
    ('Flying','Flying','FLT','#3b82f6',2,FALSE),
    ('Ground','Ground','GND','#16a34a',3,FALSE),
    ('NA','NA','N/A','#475569',4,FALSE),
    ('Academics','Academics','ACD','#7c3aed',5,TRUE);

INSERT INTO supervision_role VALUES
    ('SOF','SOF',1),('OS','OS',2),('ODO','ODO',3),
    ('F-16 FDO','F-16 FDO',4),('T-38 TDO','T-38 TDO',5),
    ('C-12 TDO','C-12 TDO',6),('A-29 ADO','A-29 ADO',7),
    ('Other (As Req''d)','Other (As Req''d)',8);
```

---

## Relationship to Existing Phase 3 Schema

The existing `TPS_Scheduling_Online/server/db/schema.sql` is a future-looking schema with curriculum management, aircraft tracking, student completion, and prerequisite chains. This schema faithfully supports the current app. When systems converge, Phase 3 layers can be added atop this schema.

---

## Design Decisions Log

### D1: person_name (text) vs person FK (uuid)
Use `person_name` text throughout. GAS API returns display names with anomalies (asterisks, question marks). Future: add `person_id` columns via migration.

### D2: Separate working_event table
Working state in separate table mirrors app's `allEvents`/`workingEvents` split. Essential for undo/refresh/diff.

### D3: natural_key as materialized UNIQUE column
Enables ON CONFLICT upsert and selection restoration. Only changes during refresh. **All component values must be trimmed** to avoid whitespace-induced collisions.

### D4: JSONB for session arrays
`selected_ids`, `na_cats`, `selected_keys` are small arrays always read/written whole. JSONB simpler than junction tables.

### D5: event_change.event_id as text
No FK -- changes reference events that may be deleted/cleared.

### D6: source_hash for change detection
Avoids unnecessary UPDATEs and NOTIFY noise during refresh.

### D7: Soft delete (is_stale) for events
Preserves integrity for change log references and handles temporary API gaps.

### D8: No mergeDuplicateEvents in database
Store events exactly as parsed (after multi-row flying merge). Merge logic disabled in app (v3.7.0).

### D9: Times as text, not TIME type
'HH:MM' strings match app format. Avoids timezone issues. Lexicographic sort works. Corrupted times like "09:0" stored verbatim rather than rejected.

### D10: natural_key uniqueness risk
Two events with same key would conflict. Known issue. Future: add sequence tiebreaker.


### D11: Trim on ingest (v1.1)
Model names and NA reasons have trailing whitespace in raw data. Server-side parsers must `.trim()` these values before computing natural_key and storing. Prevents duplicate entries from whitespace variants.

### D12: personnelNotes not stored (v1.1)
The personnelNotes section of the batch response is not consumed by the app and has no corresponding table. It contains daily availability data (occupied time ranges, status notes) that could support future features. When needed, a `daily_personnel_status` table can be added without schema changes to existing tables.

---

## Open Considerations

### personnelNotes as Future Data Source
The personnelNotes section provides per-person, per-day availability data including:
- Puck counts (number of assigned events)
- Occupied time ranges (comma-separated HH:MM-HH:MM)
- Status notes (TDY, LV, APPT, NA, Course Prep)

This could power:
- Automated conflict detection (person already occupied during proposed time)
- Workload balancing (puck counts across personnel)
- Availability filtering in the Picker component

A potential `daily_personnel_status` table:
```sql
-- NOT YET IMPLEMENTED -- for future consideration
CREATE TABLE daily_personnel_status (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_name text NOT NULL,
    date date NOT NULL,
    puck_count smallint NOT NULL DEFAULT 0,
    occupied_ranges text NULL,  -- "07:00-11:30,13:00-15:00"
    status_note text NULL,      -- "TDY", "LV", etc.
    category_id text NOT NULL REFERENCES personnel_category(id),
    fetched_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (person_name, date)
);
```

### Batch Import Diagnostics
The top-level metadata (cacheStatus, processingTime, etc.) is not stored. A `batch_import_log` table could track import history for debugging refresh issues.

---

## Change History

| Date | Version | Changes |
|---|---|---|
| 2026-03-05 | 1.0 | Initial schema. 16 tables. 6 localStorage keys replaced. 16 indexes. 10 design decisions. |
| 2026-03-05 | 1.1 | Added Raw Data Structure section (full GAS API batch shape). Added Data Quality section (name anomalies, time corruption, whitespace, padding rows). Updated Entity Map with corrected column counts per section (flying: 8 crew, ground: 10 personnel, NA: 10 structural slots). Added detailed parser behaviors to Refresh Strategy. Documented personnelNotes section and future table design. Added D11 (trim on ingest) and D12 (personnelNotes deferred). Moved document to `Interactive-scheduler/database/` directory. |


---

## File Location Notes

- **Canonical location:** `Interactive-scheduler/database/database-structure.md`
- **Previous location:** `Interactive-scheduler/docs/database-structure.md` (should be removed)
