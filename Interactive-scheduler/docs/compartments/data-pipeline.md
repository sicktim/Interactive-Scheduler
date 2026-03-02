# Data Pipeline Compartment

> **Source file:** `Interactive-scheduler/interactive-scheduler.html` (8509 lines as of v3.8.0)
> **Last reviewed:** 2026-03-01

---

## Purpose

This compartment owns everything between the raw API response and the normalized event objects that enter React state. It fetches schedule and roster data from the Google Apps Script API (or falls back to embedded sample data), parses multiple raw array formats into a single unified event shape, optionally merges overflow duplicate rows, loads persisted custom events, and restores working state from localStorage on page load.

---

## Owner Boundaries

**This compartment IS responsible for:**

- API endpoint constants and `fetch()` calls (both `?type=roster` and `?type=batch`)
- All parsers: `transformBatchData()`, `transformSheetReturn()`, and their section-level sub-parsers (flying, ground, NA, supervision, academics)
- `isValidName()` — the crew-vs-notes filter applied to every crew array during parsing
- `mergeDuplicateEvents()` — the disabled (but preserved) whiteboard overflow-row merger
- `buildSampleEvents()` — offline fallback using embedded SAMPLE_SHEET and SAMPLE_ROSTER
- `mkId()` — monotonic ID generator for all parsed events
- `eventNaturalKey()` — cross-session event identity for selection restoration
- All localStorage read/write functions: `saveState`, `loadState`, `clearState`, `saveWorkingCopy`, `loadWorkingCopy`, `clearWorkingCopy`, `saveCustomEvents`, `loadCustomEvents`, `saveHighlights`, `loadHighlights`
- The full App-level load sequence in the startup `useEffect` and `refreshFromWhiteboard()` callback
- `foaAuthBadges` useMemo — extraction of FOA/AUTH supervision events for the whiteboard header display

**This compartment delegates to:**

- **Event Classification compartment** — `classifyEvent()`, `isStaff()`, `personCat()` run on parsed events but are not part of parsing itself
- **Conflict Detection compartment** — `detectConflicts()`, `overlap()`, `evStart()`, `evEnd()` consume the normalized event array but do not produce it
- **Layout compartment** — `buildFlyingLayout()`, `buildGroundLayout()`, `visualEnd()` consume events for rendering
- **Change Tracking compartment** — `computeNetChanges()`, `saveState()` (changes-only key) are out of scope here except where changes are persisted alongside working state in `saveWorkingCopy()`
- **React state** — `setAllEvents`, `setRoster`, `setDates`, `setScreen` are the handoff boundary; this compartment populates them, other compartments consume them

---

## Key Functions and Line References

### ID Generator

| Function | Line | Signature | Description |
|---|---|---|---|
| `mkId` | 2533 | `() => string` | Monotonically increments module-level `_eid` counter and returns `"evt-N"`. Session-scoped; IDs are NOT stable across page reloads. Use `eventNaturalKey()` for cross-session identity. |

### Name Filter

| Function | Line | Signature | Description |
|---|---|---|---|
| `isValidName` | 2584 | `(str) => boolean` | Returns `true` if `str` is a plausible crew member name. Rejects: falsy values, strings longer than 25 characters, strings with more than 4 words, and the literals `"FALSE"` and `"TRUE"`. Applied to every crew column slice during all parsers. |

**Rejection rules in detail (line 2584–2591):**
```js
if (!str || typeof str !== 'string') return false;
const t = str.trim();
if (!t || t.length > 25) return false;
if (t === 'FALSE' || t === 'TRUE') return false;
if (t.split(/\s+/).length > 4) return false;
return true;
```

### Structured Format Parser

| Function | Line | Signature | Description |
|---|---|---|---|
| `transformSheetReturn` | 2597 | `(sheet, date) => Event[]` | Parses the structured `sheet-return-v4.0.json` format into normalized events. Reads `sheet.schedule[]` — each item has a `section` string and a `details` object. Used only by `buildSampleEvents()` (the offline sample data path). |

**Section handling inside `transformSheetReturn` (lines 2603–2656):**

- `Supervision` and `Academics` (lines 2603–2614): sets `readonly: true`, `model: null`; `eventName` comes from `item.details.duty` (Supervision) or `item.details.eventName` (Academics)
- `Flying` (lines 2615–2628): `model` from `item.details.model`; `startTime` from `item.details.briefTime`; `endTime` from `item.details.debriefEnd`; `etd`, `eta` from `item.details`; filters `notes === 'FALSE'` to null
- `Ground` (lines 2629–2640): `model: null`; `startTime` from `item.details.startTime`; passes `notes` directly
- `NA` (lines 2641–2655): `eventName` from `item.details.reason`; additionally sets `cancelled: false`, `effective: false`, `partiallyEffective: false`

### Batch Format Parser

| Function | Line | Signature | Description |
|---|---|---|---|
| `transformBatchData` | 2661 | `(batchJson, roster) => Event[]` | Parses the raw array format returned by `?type=batch`. Iterates `batchJson.days[]` — each day has `isoDate` and `data: { flying, ground, na, supervision, academics }`. `roster` is required for the academics parser only (to expand group names into personnel lists). |

**Flying sub-parser (lines 2669–2700):**

Raw row column mapping:
- `row[0]` — model
- `row[1]` — briefTime (startTime)
- `row[2]` — etd
- `row[3]` — eta
- `row[4]` — debriefEnd (endTime)
- `row[5]` — eventName
- `row[6..13]` — crew (8 slots, sliced as `row.slice(6, 14)`, filtered by `isValidName`)
- `row[14]` — notes (suppressed if falsy or `"FALSE"`)
- `row[15]` — Effective flag (`"TRUE"` / `true`)
- `row[16]` — CX/Non-E flag (`"TRUE"` / `true` / `"CX"` → `cancelled: true`)
- `row[17]` — Partially Effective flag

Header row guard: `if (eventName === 'Event') return` skips the spreadsheet header row.
Empty row guard: `if (!briefTime && !eventName && !model) return` skips truly blank rows.
Fallback: `eventName: eventName || model || 'Unnamed Event'` (v3.8.0 — nameless events must display).

**Ground sub-parser (lines 2702–2729):**

Raw row column mapping:
- `row[0]` — eventName
- `row[1]` — startTime
- `row[2]` — endTime
- `row[3..12]` — crew (10 slots, sliced as `row.slice(3, 13)`, filtered by `isValidName`; expanded to 10 slots in v3.8.0, was previously `row.slice(3, 9)`)
- `row[13]` — notes
- `row[14]` — Effective flag
- `row[15]` — CX/Non-E flag
- `row[16]` — Partially Effective flag

Header row guard: `if (evName === 'Events') return`.
Empty row guard: `if (!evName && !start) return`.
Fallback: `eventName: evName || 'Unnamed Event'`.

**NA sub-parser (lines 2732–2751):**

Raw row column mapping:
- `row[0]` — reason (eventName)
- `row[1]` — startTime
- `row[2]` — endTime
- `row[3..]` — crew (open-ended, `row.slice(3)`, filtered by `isValidName`)

Header row guard: `if (!reason || !start || reason === 'Reason') return`.
Fixed fields: `cancelled: false`, `effective: false`, `partiallyEffective: false` (always false for NAs — they represent absences, not flight events that could be cancelled).

**Supervision sub-parser (lines 2755–2806, updated in T2):**

Raw row format (from `batch-output-extract.json`): each row is `[duty, poc1, start1, end1, poc2, start2, end2, ...]` — triplets of `[POC, startTime, endTime]` repeating after position 0. The last row in the supervision array is a special footer row for FOA/AUTH.

**FOA/AUTH footer row detection (implemented T2):** The footer row check runs BEFORE the empty-duty guard. Detection: `if (row[9] === 'FOA')`. When the footer row is detected:
- `row[10]` = FOA person name (may be empty)
- `row[13]` = AUTH person name (may be empty)
- If a person passes `isValidName()`, an event is emitted: `{ section: 'Supervision', eventName: 'FOA'|'AUTH', startTime: null, endTime: null, personnel: [personName] }`
- The row then returns early (skips the triplet loop)

Events with `startTime: null` render at the left edge of the supervision section (0% position, clamped to 4% minimum width). They fall into the 'FOA' and 'AUTH' role bands which are already in `SUPERVISION_ROLE_ORDER`.

Loop: `for (let i = 1; i < row.length - 2; i += 3)` iterates triplets. For each non-empty `poc` that passes `isValidName`, emits one event per assignment (a duty officer covering two time windows generates two separate events with the same `eventName` but different `startTime`/`endTime`).

Fields: `readonly: false`, `cancelled: false`, `model: null`.

**Downstream consumers of FOA/AUTH events:**
- `foaByDate` useMemo in `SchedulerView` (added T2) — scans `workingEvents`, builds `{ [date]: { foa: personName|null, auth: personName|null } }` map for timeline date bar chips
- `WhiteboardView` seeding effect (added T2) — seeds `dutyState` from parsed events when localStorage is empty for that day
- `foaAuthBadges` useMemo in `WhiteboardView` — finds FOA/AUTH events by regex on `eventName`; displays "All Day" for time since `startTime: null`; this useMemo is currently not rendered in JSX (dead code)

**Academics sub-parser (lines 2775–2792):**

Group name → roster category mapping (line 2776):
```js
{ 'Alpha FTC':'FTC-A', 'Alpha STC':'STC-A', 'Bravo FTC':'FTC-B', 'Bravo STC':'STC-B',
  'IP':'Staff IP', 'Staff STC':'Staff STC', 'IFTE/IWSO':'Staff IFTE/ICSO' }
```

Populates `personnel` from `roster[cat]` (entire category). Sets `readonly: true`. Header row guard: `if (!group || !start || group === 'Academics') return`.

### Duplicate Event Merger

| Function | Line | Signature | Description |
|---|---|---|---|
| `isStaff` | 2804 | `(name, roster) => boolean` | Returns true if `name` appears in any of the four staff roster categories. Helper used within `mergeDuplicateEvents`. |
| `mergeDuplicateEvents` | 2812 | `(events, roster) => Event[]` | **DISABLED via early return at line 2816.** Returns events unchanged. The full merge body (lines 2818–2960) is preserved for potential re-enable. |

**Disabled state (lines 2812–2816):**
```js
const mergeDuplicateEvents = (events, roster) => {
    // DISABLED: merge logic causes false positives...
    return events;
    // ...full body preserved below
```

**Preserved merge algorithm (lines 2818–2960):**

The body implements a two-phase approach documented in `fix-duplicate-merging.md`:

- **Phase 1 (lines 2830–2843):** Groups by base key WITHOUT `personnel[0]`. Flying key: `date|section|model|eventName|startTime|endTime|etd|eta`. Ground key: `date|section|eventName|startTime|endTime`. NA, Supervision, Academics, and `readonly` events are passed through without grouping.

- **Phase 2 (lines 2846–2950):** Within each base group, counts distinct `personnel[0]` leads.
  - 0 or 1 distinct leads → `mergeGroup()`: merge all events in the group into the first event. Combines personnel deduplicated with staff lead in position 0. Merges notes with `"; "`. For Flying, prefers non-null ETD/ETA/endTime from any row.
  - 2+ distinct leads → sub-group by `personnel[0]`, then `mergeGroup()` within each sub-group. Events with no lead attach to the first sub-group.

- **Reconstruction (lines 2953–2960):** Rebuilds the original ordering, substituting merged events, dropping consumed duplicates.

**Why it was disabled (v3.7.0):** Events with identical model/times/eventName but different crews (one with instructor, one empty) were incorrectly merged. Phase 2 saw `leads.size <= 1` (one lead from the non-empty event, zero leads from the empty event) and merged them. The correct behavior is to keep them separate — they represent distinct scheduling lines.

### Sample Data Fallback

| Object/Function | Line | Description |
|---|---|---|
| `SAMPLE_ROSTER` | 3597 | Hard-coded roster object with all 8 categories populated. Used as fallback when API is unavailable. |
| `SAMPLE_DATES` | 3599 | Array of 5 ISO date strings: `["2026-02-03","2026-02-04","2026-02-05","2026-02-06","2026-02-09"]` |
| `SAMPLE_SHEET` | 3601 | Hard-coded `{ schedule: [...] }` object in `transformSheetReturn` format. Contains representative Supervision, Flying, Ground, and NA events. |
| `buildSampleEvents` | 3628 | Calls `transformSheetReturn(SAMPLE_SHEET, date)` for both sample dates, concatenates, and passes through `mergeDuplicateEvents()` (which currently returns unchanged due to early return). Returns final event array. |

### localStorage Layer

All keys used:

| Constant | Line | Key String | Description |
|---|---|---|---|
| `STORAGE_KEY` | 2387 | `"tps-scheduler-state"` | Lightweight session state: selected event IDs (and their natural keys), NA categories, timestamp. Written on event selection changes. |
| `WORKING_STORAGE_KEY` | 3661 | `"tps-scheduler-working"` | Full working copy: all `workingEvents`, `allEvents`, `roster`, `dates`, `changes`, `selectedIds`, `naCats`. Written after every drag/drop or personnel change. |
| `CUSTOM_EVENTS_KEY` | 3725 | `"tps-scheduler-custom-events"` | Array of user-created custom events. Persists across sessions and API refreshes. |
| `HIGHLIGHT_STORAGE_KEY` | 3738 | `"tps-scheduler-highlights"` | Whiteboard cell highlight color map. Cleared by `clearWorkingCopy()`. |
| `THEME_KEY` | 8280 | `"tps-scheduler-theme"` | `"dark"` or `"light"`. Persists theme preference. |

**localStorage functions (lines 3642–3744):**

| Function | Line | Description |
|---|---|---|
| `saveState` | 3642 | Writes lightweight session state: `changes`, `selectedIds`, `selectedKeys` (natural keys), `naCats`, `savedAt`. Used for selection persistence across non-working-copy sessions. |
| `loadState` | 3704 | Reads and parses `STORAGE_KEY`. Returns `{ changes, selectedIds (Set), selectedKeys, naCats (Set), savedAt }` or null. |
| `clearState` | 3719 | Removes `STORAGE_KEY` and calls `clearWorkingCopy()`. |
| `saveWorkingCopy` | 3663 | Writes full working state to `WORKING_STORAGE_KEY`. Called after every edit in SchedulerView. Parameters: `workingEvents`, `changes`, `allEvents`, `roster`, `dates`, `selectedIds`, `naCats`. |
| `loadWorkingCopy` | 3680 | Reads and parses `WORKING_STORAGE_KEY`. Converts `selectedIds` and `naCats` back to Sets. Returns null if the data is missing or malformed. Validates presence of `workingEvents` and `allEvents`. |
| `clearWorkingCopy` | 3699 | Removes `WORKING_STORAGE_KEY` and `HIGHLIGHT_STORAGE_KEY`. Called before API refresh to discard stale local state. |
| `saveCustomEvents` | 3727 | Serializes and writes custom events array to `CUSTOM_EVENTS_KEY`. |
| `loadCustomEvents` | 3731 | Reads and parses `CUSTOM_EVENTS_KEY`. Returns empty array on any error or absence. |
| `loadHighlights` | 3739 | Reads and parses `HIGHLIGHT_STORAGE_KEY`. Returns `{}` on error. |
| `saveHighlights` | 3742 | Writes highlight map to `HIGHLIGHT_STORAGE_KEY`. |

### Cross-Session Identity

| Function | Line | Signature | Description |
|---|---|---|---|
| `eventNaturalKey` | 3640 | `(ev) => string` | Returns `"date|section|eventName|startTime|model"`. Used to match events across sessions where IDs (generated by `mkId`) differ. Written into `STORAGE_KEY.selectedKeys` on save, matched against freshly-parsed events on load. |

### FOA/AUTH Badge Derivation

| Function | Line | Context | Description |
|---|---|---|---|
| `foaAuthBadges` | 7391 | `useMemo` inside `WhiteboardView` component | Scans `workingEvents` for the active day. Finds the first event whose `eventName` matches `/\bFOA\b/i` for FOA, and `/\bAUTH.../i` for AUTH. Returns `{ foa: { time }, auth: { name } }` or `null` for each if not found. This is display-only derivation from already-parsed events — it does NOT parse the raw FOA/AUTH footer row from the supervision API data. |

---

## App-Level Load Sequence

The startup `useEffect` (lines 8361–8438) runs once on mount and executes this priority order:

1. **Check working copy** (`loadWorkingCopy()`, line 8365): If a full working copy exists with non-empty `workingEvents`, restore all state from it and go directly to `'scheduler'` screen. No API call.

2. **API fetch** (lines 8383–8401): Parallel fetch of `?type=roster` and `?type=batch`. On success: parse via `transformBatchData()`, pass through `mergeDuplicateEvents()` (currently a no-op), merge in custom events filtered to matching dates.

3. **Sample data fallback** (lines 8395–8400): On any API error, silently uses `SAMPLE_ROSTER`, `SAMPLE_DATES`, `buildSampleEvents()`.

4. **Custom events merge** (lines 8403–8406): `loadCustomEvents()`, filter to dates in `dateSet`, append to `loadedEvents`.

5. **Selection restoration** (lines 8415–8430): Check `loadState()` for `selectedKeys`. Match natural keys against freshly-loaded events. If any match, restore selection and go to `'scheduler'` screen.

6. **Event selection screen** (line 8432): Default path when no cached state or selections exist.

**Refresh callback** `refreshFromWhiteboard` (lines 8301–8359): Called by the UI refresh button. Clears working copy, re-fetches API data. Supports `mode='full'` (adds `&refresh=true` query param to force GAS cache bypass, ~30s) or `mode='quick'` (cached GAS response, <10s). Restores selections by natural key after refresh.

---

## Data Shapes

### API Input: Roster Response

```
GET ?type=roster
→ {
    roster: {
      "FTC-A":            string[],
      "FTC-B":            string[],
      "STC-A":            string[],
      "STC-B":            string[],
      "Staff IP":         string[],
      "Staff IFTE/ICSO":  string[],
      "Staff STC":        string[],
      "Attached/Support": string[],
    }
  }
```

Processed roster is filtered before state: empty categories (`v?.length > 0`) are removed. Result stored in `roster` React state.

### API Input: Batch Response

```
GET ?type=batch
→ {
    days: [
      {
        isoDate: "YYYY-MM-DD",
        data: {
          flying:     Array<row: any[]>,
          ground:     Array<row: any[]>,
          na:         Array<row: any[]>,
          supervision: Array<row: any[]>,
          academics:  Array<row: any[]>
        }
      }, ...
    ]
  }
```

Column layouts per section are documented in the sub-parser section above.

### Normalized Event Shape (output of both parsers)

All parsers produce objects conforming to this shape:

```js
{
  id:                  string,        // "evt-N", session-scoped, not stable
  section:             "Flying" | "Ground" | "NA" | "Supervision" | "Academics",
  date:                "YYYY-MM-DD",
  model:               string | null, // e.g. "F-16", "T-38"; null for non-flying sections
  eventName:           string,        // duty name, event name, NA reason, or group label
  startTime:           string | null, // "HH:MM" 24-hour
  endTime:             string | null, // "HH:MM" 24-hour
  etd:                 string | null, // Flying only; estimated time of departure
  eta:                 string | null, // Flying only; estimated time of arrival
  personnel:           string[],      // mutable working copy of crew
  originalPersonnel:   string[],      // immutable snapshot for undo/reset
  notes:               string | null,
  readonly:            boolean,       // true for Supervision (v3.8.0: false), Academics (always true)
  cancelled:           boolean,       // true if CX/Non-E column was checked
  effective:           boolean,       // true if Effective column was checked (Flying/Ground)
  partiallyEffective:  boolean,       // true if Partially Effective column was checked (Flying/Ground)
}
```

Note: `effective` and `partiallyEffective` are not present on `Supervision` events. `cancelled` is present on all sections but is always `false` for NA events by design.

### Custom Event Shape (localStorage, `CUSTOM_EVENTS_KEY`)

Custom events created via the `(+)` button conform to the same normalized shape above, plus:

```js
{
  isCustom: true,   // distinguishes from API-sourced events
  // ...all normalized event fields
}
```

Custom events are filtered to match `dateSet` (current batch dates) before being merged into `loadedEvents`.

---

## State Connections

This compartment writes to and reads from the following React state in `App`:

| State Variable | Set by | Read by |
|---|---|---|
| `allEvents` | `setAllEvents(loadedEvents)` on load/refresh | `EventSelectionScreen`, `SchedulerView`, conflict detection |
| `roster` | `setRoster(filtered)` on load/refresh | `EventSelectionScreen`, `SchedulerView`, picker, classification |
| `dates` | `setDates(loadedDates)` on load/refresh | `EventSelectionScreen`, `SchedulerView`, `RainbowView` |
| `selectedIds` | `setSelectedIds(matchedIds)` on selection restore | `EventSelectionScreen` (initial), `SchedulerView` |
| `naCats` | `setNaCats(...)` on selection restore | `EventSelectionScreen` (initial), `SchedulerView` |
| `screen` | `setScreen('loading'|'selection'|'scheduler')` | Top-level render branch |
| `progress` | `setProgress(string)` | `LoadingScreen` display |
| `error` | `setError(string)` | Error screen display |
| `cachedWorkingState` | `setCachedWorkingState(cached)` | `SchedulerView` — passed as prop for "Resume" vs fresh start |

---

## Cross-Compartment Dependencies

**Compartments that depend on the data pipeline:**

| Compartment | Dependency |
|---|---|
| **Event Classification** | `classifyEvent(ev, roster)` consumes normalized events and roster. Depends on `eventName`, `personnel`, and the `isStaff`/`personCat` helpers which require roster to be loaded. |
| **Conflict Detection** | `detectConflicts(allEvents)` consumes the full normalized event array. Depends on `startTime`, `endTime`, `personnel`, `date`, `cancelled` fields. Cancelled events are excluded from conflict detection. |
| **EventSelectionScreen** | Receives `allEvents`, `roster`, `dates` as props. Shows events grouped by date/class. Reads `section`, `eventName`, `model`, `startTime`, `personnel`. |
| **SchedulerView (Timeline)** | Consumes `workingEvents` (derived from `allEvents` + user edits). Layout engine reads `startTime`, `endTime`, `etd`, `eta`, `model`, `section`. |
| **RainbowView** | Reads `workingEvents` directly for per-person schedule rows. Needs `personnel`, `date`, `startTime`, `endTime`, `section`. |
| **WhiteboardView** | Reads `workingEvents` filtered by `activeDay` and `section`. Also derives `foaAuthBadges` by scanning Supervision event names. |
| **ChangeSummary / Change Tracking** | Change log entries reference `eventId`, `eventName`, `eventModel`, `eventTime`, `eventSection`, `date` — all fields from normalized events. |
| **Picker** | Uses `personCat(name, roster)` and `chipColor(name, roster)` which require the loaded `roster`. |

**What data pipeline depends on from other compartments:**

- Nothing at parse time. The data pipeline is the bottom of the dependency chain.
- `personCat` / `chipColor` (classification helpers, lines 2571–2581) are called in `classifyEvent`, not in parsers. Parsers themselves have zero cross-compartment dependencies.

---

## Bug History and Known Issues

### Fixed Bugs (chronological)

| Version | Issue | Fix |
|---|---|---|
| v2.0 | Scheduler notes ("Can we move up 30 mins due to...") parsed as crew members | `isValidName()` introduced: rejects strings >25 chars, >4 words, or exactly FALSE/TRUE |
| v2.0 | Events with no crew were silently dropped | Flying parser had `if (crew.length === 0) return;` guard — removed in v3.2 |
| v3.0 | Duplicate whiteboard overflow rows showed as separate events | `mergeDuplicateEvents()` introduced, groups by date+name+times+lead |
| v3.1 | Two genuinely separate T-38 flights merged (different instructors) | Two-phase merge: Phase 1 groups without `personnel[0]`, Phase 2 checks distinct leads |
| v3.2 | "P/S CHASE" student events classified as Staff due to CHASE keyword | `classifyEvent` gained `isStudentSyllabus` exclusion for "P/S " prefix (classification compartment, but caused by event naming from parser) |
| v3.2 | Empty flying events (model+times+name but no crew) not displayed | Removed `crew.length === 0` guard from flying sub-parser |
| v3.5 | STC-A/B NAs not shown on event selection screen | `naCategoriesAvailable` derived from roster instead of NA events (classification/selection compartment) |
| v3.7.0 | Merge logic caused false positives on events with same name/times but different crews (one empty, one with instructor) | `mergeDuplicateEvents()` disabled via early return; body preserved |
| v3.8.0 | Events without a name did not display | Flying parser fallback: `eventName: eventName || model || 'Unnamed Event'`; Ground parser: `eventName: evName || 'Unnamed Event'` |
| v3.8.0 | Cancelled events not flagged | `cancelled` field added; reads `CX/Non-E` column from raw flying (`row[16]`) and ground (`row[15]`) rows |
| v3.8.0 | Ground parser only captured 6 crew slots (rows 3–8) | Expanded to `row.slice(3, 13)` for 10 crew slots; notes moved from `row[10]` to `row[13]` |

### Known Open Issues

1. **FOA/AUTH not reading from footer row:** FIXED in T2. The supervision footer row is now detected by `row[9] === 'FOA'` before the empty-duty guard. FOA person extracted from `row[10]`, AUTH person from `row[13]`. Both emitted as Supervision events with `eventName: 'FOA'`/`'AUTH'`, `startTime: null`, `endTime: null`, `personnel: [personName]`. These events feed `foaByDate` (timeline chips) and seed the whiteboard duty pucks.

2. **`mergeDuplicateEvents()` disabled:** The overflow-row merge logic is preserved but inactive. The false positive case (same event name/times, different crews) is not fully resolved. A potential fix would be to require that one of the events in a group has zero personnel (pure overflow row with instructor absent) — only then merge. Fully separate events with different crews would each have at least one person listed.

3. **Session-scoped IDs:** `mkId()` resets on every page load. This means `selectedIds` saved to `STORAGE_KEY` will never match after a reload. The workaround (`eventNaturalKey`) works for event selection restoration, but it means any saved `changes` array contains stale event IDs that cannot be replayed against freshly loaded events. The future feature "localStorage replay of changes on reload" (noted in AGENT-INSTRUCTIONS.md section 9d) would require a key-based change matching strategy.

4. **`CF` and `AIRMANSHIP` events without crew classified as "Other":** Events with these names and no personnel cannot inherit class from siblings at the parser level — only `EventSelectionScreen`'s two-pass `useMemo` (lines 3813+) performs sibling inheritance. This is technically a classification compartment issue but is triggered by the fact that parsers allow empty personnel arrays through.

---

## Change Impact Checklist

When modifying any code in this compartment, check the following:

**If modifying `isValidName()`:**
- [ ] Run the app with real API data and verify scheduler notes no longer appear as crew chips
- [ ] Check that names with punctuation (e.g., `"Newland, A"`, `"Harms, J *"`) still pass
- [ ] Check that `"FALSE"` and `"TRUE"` (boolean strings from spreadsheet) are still rejected
- [ ] Verify `"COVER 416th"` (a note seen in real supervision data) is still rejected (>2 words or >25 chars)
- [ ] Verify the academics parser still correctly pulls entire roster categories (it does NOT use `isValidName` on roster data)

**If modifying `transformBatchData()` flying sub-parser column indices:**
- [ ] Verify against real batch JSON: column layout `[model, briefTime, etd, eta, debriefEnd, eventName, crew×8, notes, effective, CX, partialEffective]`
- [ ] Check that crew slice `row.slice(6, 14)` still aligns with spreadsheet columns
- [ ] Confirm `cancelled` reads from `row[16]` (not row[15] which is ground's CX column)
- [ ] Test with empty crew rows — must still produce an event card (no guard)

**If modifying `transformBatchData()` ground sub-parser column indices:**
- [ ] Verify crew slice is `row.slice(3, 13)` (10 slots) — notes are now at `row[13]`
- [ ] Confirm CX/Non-E is at `row[15]` for ground rows

**If modifying `transformBatchData()` supervision sub-parser:**
- [ ] Test with the `batch-output-extract.json` sample to verify triplet loop works correctly
- [ ] Verify the footer row (empty duty, FOA/AUTH labels) is still handled — currently skipped
- [ ] If implementing FOA/AUTH footer extraction: add detection at row iteration before the duty guard, not inside the triplet loop

**If re-enabling `mergeDuplicateEvents()`:**
- [ ] Remove the early-return at line 2816
- [ ] Test the two T-38 CF-1 sorties case (same name/times, different crews — must stay separate)
- [ ] Test Airmanship Lecture overflow rows (same instructor repeated — must merge)
- [ ] Consider adding a guard: only merge when at least one event in the group has zero personnel (pure overflow scenario)
- [ ] Update `version-history.md` with the re-enable rationale

**If modifying `buildSampleEvents()` or SAMPLE_SHEET:**
- [ ] Ensure the sample data exercises all 5 section parsers (Supervision, Flying, Ground, NA, Academics)
- [ ] Verify offline mode still works: open the HTML file with network disabled in browser dev tools
- [ ] Keep sample dates aligned with `SAMPLE_DATES` array

**If modifying any localStorage key string:**
- [ ] Update the key constant AND all references (save/load/clear functions)
- [ ] Old key data in browsers will be orphaned — consider a migration or version bump in the key name
- [ ] Test `clearWorkingCopy()` still clears both `WORKING_STORAGE_KEY` and `HIGHLIGHT_STORAGE_KEY`

**If modifying `eventNaturalKey()`:**
- [ ] Existing saved selection keys in `STORAGE_KEY` will not match the new format — users lose saved selections on next load (acceptable, just be aware)
- [ ] Ensure the new key still uses only stable fields (not `id`, which is session-scoped)
- [ ] Check both `refreshFromWhiteboard` (line 8345) and the startup `useEffect` (line 8422) use the same key function

**If modifying the App-level load sequence (lines 8361–8438):**
- [ ] Verify priority order: working copy → API fetch → sample fallback → custom events → selection restore
- [ ] Confirm `clearWorkingCopy()` is called before any API re-fetch (in `refreshFromWhiteboard`)
- [ ] Test that `customEvents` are filtered to `dateSet` — events from previous week must not bleed into current week's data
- [ ] Verify the `mode='full'` vs `mode='quick'` distinction in `refreshFromWhiteboard` adds `&refresh=true` only for full mode

**If adding a new section type (beyond Flying/Ground/NA/Supervision/Academics):**
- [ ] Add a parser branch in `transformBatchData()`
- [ ] Add a branch in `transformSheetReturn()` for sample data consistency
- [ ] Add the section to `SECTION_ORDER` constant (line 2394) for display ordering
- [ ] Add to `SECTION_PRIORITY` and `SECTION_BADGE` maps
- [ ] Update `mergeDuplicateEvents()` pass-through logic if the new section should never be merged
- [ ] Update conflict detection if the new section should participate (currently all non-cancelled events do)
- [ ] Update `EventSelectionScreen` to show the new section in the chooser
