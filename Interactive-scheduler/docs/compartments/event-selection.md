# Event Selection Compartment

**File:** `Interactive-scheduler/interactive-scheduler.html`
**Current Version:** v3.8.0
**Last Reviewed:** 2026-03-01

---

## Purpose

The Event Selection compartment is the second screen in the three-screen flow
(Loading -> Event Selection -> Scheduler View). Its job is to let each
scheduler pick exactly which events they are responsible for before entering
the main workspace. This scoping decision drives:

- Which event cards are rendered in the Timeline and Whiteboard views
- Which events are visible/editable vs. read-only in the picker
- Which NA categories are tracked for conflict detection
- Which events appear in the Supervision section (all-or-nothing)

Conflict detection itself runs on ALL events regardless of selection. The
selection only controls what is shown in the scheduler workspace.

---

## Owner Boundaries

The compartment owns the following surfaces exclusively:

- The `EventSelectionScreen` React component (lines 3795-4143)
- The `classifyEvent()` function and the `STAFF_KEYWORDS` constant (lines 3759-3783)
- The `CLASS_COLORS` lookup object (lines 3786-3791)
- The two-pass sibling inheritance logic inside `EventSelectionScreen` (lines 3812-3877)
- The `naCategoriesAvailable` derived list (lines 3881-3887)
- The `supervisionByDate` and `allSupervisionIds` derived structures (lines 3890-3906)
- The `toggleEvent`, `toggleGroup`, `toggleClass`, `toggleNaCat`, `selectAll`,
  `isClassFullySelected` handlers (lines 3908-3961)
- The `SECTION_ORDER` constant at line 2394 (consumed by both Scheduler and this screen)
- The `saveState` / `loadState` localStorage helpers (lines 3642-3722), which
  are the persistence layer for selections between sessions

The compartment reads but does NOT own:

- `allEvents` (produced by the data pipeline, passed in as a prop)
- `roster` (produced by the data pipeline, passed in as a prop)
- `dates` (produced by the data pipeline, passed in as a prop)
- `personCat()` utility at line 2571 (used inside `classifyEvent`)
- `CATEGORY_COLORS` constant at line 2427 (used for NA chip coloring)
- `evStart()` utility (used to sort events within groups)

---

## Key Functions & Line References

### Constants

| Identifier | Line | Description |
|---|---|---|
| `SECTION_ORDER` | 2394 | `['Supervision', 'Flying', 'Ground', 'NA']` — render order for sections in the Scheduler/Whiteboard views |
| `WB_SECTION_ORDER` | 2398 | Same value; used in the Whiteboard view independently |
| `STAFF_KEYWORDS` | 3759-3762 | List of uppercase substrings that classify an event as Staff |
| `CLASS_COLORS` | 3786-3791 | Color tokens for A-Class (purple), B-Class (orange), Staff (green), Other (slate) |
| `STORAGE_KEY` | 2387 | `'tps-scheduler-state'` — key for lightweight selection-only localStorage entry |
| `WORKING_STORAGE_KEY` | 3661 | `'tps-scheduler-working'` — key for full working-state cache (includes workingEvents, changes, allEvents) |

### Classification

| Function | Lines | Signature |
|---|---|---|
| `classifyEvent` | 3764-3784 | `(ev, roster) => 'A-Class' \| 'B-Class' \| 'Staff' \| 'Other'` |

### Persistence

| Function | Lines | Signature |
|---|---|---|
| `eventNaturalKey` | 3640 | `(ev) => string` — stable cross-session key: `date\|section\|eventName\|startTime\|model` |
| `saveState` | 3642-3658 | `(changes, selectedIds, naCats, allEvents) => void` — writes to `STORAGE_KEY` |
| `loadState` | 3704-3717 | `() => { changes, selectedIds, naCats, selectedKeys, savedAt } \| null` |
| `saveWorkingCopy` | 3663-3678 | Full snapshot save: adds `workingEvents`, `allEvents`, `roster`, `dates` |
| `loadWorkingCopy` | 3680-3697 | Returns full snapshot or null |
| `clearWorkingCopy` | 3699-3702 | Removes both `WORKING_STORAGE_KEY` and `tps-scheduler-highlights` |
| `clearState` | 3719-3722 | Removes `STORAGE_KEY` and calls `clearWorkingCopy` |

### Component

| Name | Lines | Props |
|---|---|---|
| `EventSelectionScreen` | 3795-4143 | `{ allEvents, roster, dates, onContinue, initialSelected, initialNaCats }` |

Internal state of `EventSelectionScreen`:

| State | Initial value | Description |
|---|---|---|
| `selectedIds` | `initialSelected \|\| new Set()` | Set of event IDs the user has selected |
| `naCats` | `initialNaCats \|\| new Set()` | Set of category strings selected for NA conflict tracking |

---

## Classification Logic Detail

### `classifyEvent(ev, roster)` — lines 3764-3784

Classification is a two-step decision:

**Step 1 — Staff keyword match (line 3769)**

The uppercased `ev.eventName` is checked against `STAFF_KEYWORDS`:

```
STAFF_KEYWORDS = [
    'MSN QUAL', 'NVG QUAL', 'CHECKRIDE', 'CURRENCY', 'FERRY FLIGHT', 'FERRY',
    'CHASE', 'CADET', 'NAVY', 'HI AOA', 'UPGRADE', 'VISTA UPG', 'FORM UPG', 'UPG'
]
```

**P/S exclusion (line 3768):** Before testing keywords, the name is checked for
the substring `'P/S '` (space-terminated). If present, `isStudentSyllabus = true`
and the keyword match is skipped entirely. This prevents events like
`P/S CHASE (T-38)(TF 5503F)` or `LOW L/D P/S CHASE` from being classified as
Staff. "P/S" stands for Performance/Syllabus, denoting student training events.

**Step 2 — Personnel majority count (lines 3771-3783)**

If the event did not match a staff keyword, personnel are iterated and each
person is looked up in the roster via `personCat(p, roster)`. Staff categories
(`Staff IP`, `Staff IFTE/ICSO`, `Staff STC`, `Attached/Support`) are ignored.
Remaining personnel increment `aCount` (for `FTC-A`/`STC-A`) or `bCount`
(for `FTC-B`/`STC-B`).

- `aCount > 0 && aCount >= bCount` → `'A-Class'`
- `bCount > 0 && bCount > aCount` → `'B-Class'`
- Neither → `'Other'`

**Edge case — events with no classifiable personnel:**

An event with no crew, or a crew consisting entirely of staff, falls through to
`'Other'`. This is the documented source of the "CF rides and AIRMANSHIP rides
without people showing as Other" issue that led to the two-pass fix below.

---

### Two-Pass CF/AIRMANSHIP Sibling Inheritance — lines 3806-3855

This logic lives inside the `byDateClassified` / `classSets` useMemo within
`EventSelectionScreen` (outer boundary: lines 3813-3878).

**Problem:** Events named `CF-1`, `CF-2`, `AIRMANSHIP`, etc. are curriculum
events that should be grouped with A-Class or B-Class. When these events have
no crew assigned (empty scheduling lines), `classifyEvent` returns `'Other'`
because there are no personnel to count. The user reported this consistently in
v3.2 and v3.6 feedback.

**Solution (added in v3.6.1):**

```
const STUDENT_PATTERNS = ['CF', 'AIRMANSHIP'];   // line 3808
const isStudentEventName = (name) =>             // line 3809
    STUDENT_PATTERNS.some(pat => name.startsWith(pat));
```

**Pass 1 (lines 3824-3837):**

For every non-readonly, non-NA, non-Supervision event on each date:

1. Call `classifyEvent(ev, roster)` and store the result in `eventClass` Map (keyed by `ev.id`).
2. If the result is not `'Other'`, record it in `dateNameClass` Map (keyed by `"date|UPPERCASED_NAME"`).
3. If the result IS `'Other'` and the event name starts with a STUDENT_PATTERN, push to `studentEvents[]` for re-processing.

**Pass 2 (lines 3840-3855):**

For each event in `studentEvents`:

1. Try an exact name match in `dateNameClass` for the same date → `inherited`.
2. If no exact match, broaden: scan all `dateNameClass` entries for the same date where the event name also starts with a STUDENT_PATTERN and the class is `'A-Class'` or `'B-Class'`. Take the first found.
3. If a class was inherited, overwrite `eventClass.set(ev.id, inherited)`.

**Effect:** An uncrewed `CF-3` on the same date as a crewed `CF-1` (classified
`A-Class`) will inherit `A-Class`. If no crewed sibling exists on that date,
the event remains `'Other'`. The broadening step in Pass 2 is intentionally
limited to A/B-Class results (not Staff) to avoid false promotion.

---

### `naCategoriesAvailable` — lines 3881-3887

```js
const naCategoriesAvailable = useMemo(() => {
    const rosterCats = new Set(
        Object.keys(roster).filter(cat => roster[cat] && roster[cat].length > 0)
    );
    const ordered = Object.keys(CATEGORY_COLORS).filter(cat => rosterCats.has(cat));
    rosterCats.forEach(cat => { if (!ordered.includes(cat)) ordered.push(cat); });
    return ordered;
}, [roster]);
```

**Key design decision (fixed in v3.5):** The list is derived from the
*roster* itself, not from actual NA events present on the schedule. Any
roster category with at least one member is always available for selection.
Prior to v3.5, the list was derived only from people who appeared in actual NA
events, which caused `STC-A` and `STC-B` to disappear whenever no STC members
had posted NAs for the week.

Display order follows `CATEGORY_COLORS` key order (FTC-A, FTC-B, STC-A,
STC-B, Staff IP, Staff IFTE/ICSO, Staff STC, Attached/Support), with any
unlisted categories appended alphabetically.

---

### Supervision Section — lines 3889-3906, 3997-4020

Supervision events are separated from the classified date groups and handled
with an all-or-nothing toggle:

```js
const supervisionByDate = useMemo(() => { /* groups by date, sorted by start */ }, [allEvents]);
const allSupervisionIds  = useMemo(() => { /* flat Set of all supervision IDs */ }, [allEvents]);
```

The UI renders a single `"Include Supervision (N events)"` chip (using the
`na-cat-chip` CSS class) that toggles all supervision IDs into/out of
`selectedIds` at once. The section header reads "SUPERVISION" and appears
above the "NON-AVAILABILITY" block, which itself appears above the date groups.

Section coloring for Supervision: `rgba(139,92,246,0.1)` border / `#8b5cf6`
text (`#c4b5fd`), visually distinct from the NA red, Flying green, and Ground
amber.

---

### Quick-Select Buttons — lines 4052-4073

One button per class category (A-Class, B-Class, Staff, Other) showing the
count of selected vs. total events in that class across ALL dates:

```
{cls} ({selectedCount}/{count})
```

`toggleClass(cls)` (line 3929) flips all events in `classSets[cls]` at once:
if all are selected it deselects all, otherwise it selects all. Buttons are
filtered to only show categories that have at least one event.

Active state uses `CLASS_COLORS[cls]` for border/text/background styling.

---

### Date Group Rendering — lines 4075-4139

For each date in `dates`, the render iterates `classOrder × sectionOrder`:

```
classOrder   = ['A-Class', 'B-Class', 'Staff', 'Other']
sectionOrder = ['Flying', 'Ground']
```

Groups are keyed by `"cls|sec"` (e.g., `"A-Class|Flying"`). An empty group
produces no output. Populated groups render:

1. A section header with dual gradient background (`CLASS_COLORS` left, `secColors` right)
   and left border in the class color. Clicking the header calls `toggleGroup(evs)`.
2. Individual event rows (`sel-event-row`) showing: checkbox, model, event name,
   start-end time, and a truncated crew preview.

Events within each group are sorted by start time (line 3873).

---

## State Connections

### App-level state that crosses into this compartment

| State | Lines | How it flows |
|---|---|---|
| `selectedIds` (App) | 8295 | Initialized from `loadWorkingCopy()` or `loadState()` on startup; passed as `initialSelected` prop; written back via `onContinue(ids, cats)` at line 3979 |
| `naCats` (App) | 8296 | Same flow as `selectedIds`; written back via `onContinue` |
| `allEvents` (App) | 8292 | Immutable input to this compartment; produced by the data pipeline |
| `roster` (App) | 8293 | Immutable input; used for `personCat` lookups in `classifyEvent` |
| `dates` (App) | 8294 | Ordered list of ISO date strings; drives the date groups |
| `screen` (App) | 8291 | Set to `'selection'` to display this component; changed to `'scheduler'` by `handleContinue` |

### What "Continue" transmits

When the user clicks Continue at line 3979:

```js
onContinue(selectedIds, naCats)
```

This calls `handleContinue` in App (line 8440), which:
- Updates App-level `selectedIds` and `naCats`
- Sets `screen` to `'scheduler'`
- Passes `initialSelectedIds` and `initialNaCats` into `SchedulerView`

`SchedulerView` then calls `saveState([], initialSelectedIds, initialNaCats, allEvents)`
on mount (line 7696) to persist the lightweight selection immediately.

---

## Cross-Compartment Dependencies

### Reads from Data Pipeline compartment

- `allEvents` array (produced by `transformBatchData` + `mergeDuplicateEvents` pipeline)
- `roster` object (fetched from `?type=roster` endpoint)
- `isValidName()` filtering (applied during parsing; names that reach here are already clean)

### Reads from Conflict Detection compartment

- None directly at selection time. Conflict detection runs in `SchedulerView` using
  the selected IDs and NA categories passed through `onContinue`.

### Feeds into Scheduler View compartment

- `selectedIds` Set → drives `visibleEvents` filter in `SchedulerView`
- `naCats` Set → determines which NA events get surfaced for conflict tracking

### Feeds into the Whiteboard compartment

- `initialSelectedIds` and `initialNaCats` are also passed to `SchedulerView`,
  which uses them in the Whiteboard view's `WB_SECTION_ORDER` rendering (line 7296)

### localStorage keys written by this compartment

| Key | Written by | Read by |
|---|---|---|
| `tps-scheduler-state` | `saveState()` — called from `SchedulerView` on change | `loadState()` — called in App on startup and in `refreshFromWhiteboard` |
| `tps-scheduler-working` | `saveWorkingCopy()` — called from `SchedulerView` | `loadWorkingCopy()` — called in App on startup; bypasses selection screen entirely |

The `tps-scheduler-state` key stores `selectedKeys` (natural keys, not IDs) so
selections survive a full data refresh where event IDs are regenerated. The
natural key formula is: `date|section|eventName|startTime|model` (line 3640).

When a working copy cache exists, the App skips the selection screen entirely
and jumps straight to `'scheduler'`. The selection screen is only shown when:
1. No working copy cache exists, AND
2. No saved state with matching event keys exists

---

## Bug History & Known Issues

### Fixed bugs directly affecting this compartment

| Version | Bug | Root Cause | Fix |
|---|---|---|---|
| v2.0 | NA shown only under first date | NA section rendered inside `dates.map()` with `date === dates[0]` guard | Moved NA to standalone section above date groups |
| v2.0 | Event chooser was a flat, unorganized list | No classification or grouping | Added `classifyEvent()`, class/section group headers, quick-select buttons |
| v3.2 | `P/S CHASE` misclassified as Staff | `STAFF_KEYWORDS` includes `'CHASE'`; substring match hit student events | Added `isStudentSyllabus` check: any name containing `'P/S '` skips staff keyword matching |
| v3.2 | `LOW L/D P/S CHASE` also misclassified | Same substring issue | Same fix — `'P/S '` exclusion applies to the whole name, not just prefix |
| v3.5 | STC-A / STC-B not shown in NA section | `naCategoriesAvailable` was derived from people appearing in actual NA events; if STC members had no NAs that week, the category was absent | Changed to roster-based: any category with at least one member is always available |
| v3.6.1 | CF/AIRMANSHIP rides without crew show as Other | `classifyEvent` requires at least one non-staff, non-unknown crew member to assign A/B; empty events fall through to Other | Added two-pass sibling inheritance: uncrewed student-pattern events inherit class from a crewed sibling on the same date |

### Active / known issues

- **Broad sibling broadening risk:** Pass 2 of the sibling inheritance will
  attach an uncrewed CF event to any crewed CF-pattern event on the same date,
  even if they belong to different missions. There is no mission-scope constraint.
  This is an acceptable trade-off given the low probability of conflicting
  patterns within one day.

- **`STUDENT_PATTERNS` hardcoded:** Only `['CF', 'AIRMANSHIP']` trigger
  inheritance. Other curriculum event names that begin with known prefixes
  (e.g., `FQ`, `PF`, `SY`, `TF`) do not benefit from sibling inheritance.
  They remain `'Other'` when uncrewed. The user's concern was specifically
  about CF and AIRMANSHIP events, so this scope is intentional.

- **`FERRY` overlaps `FERRY FLIGHT`:** `STAFF_KEYWORDS` contains both `'FERRY'`
  and `'FERRY FLIGHT'`. Because JavaScript `String.includes()` is used, `'FERRY'`
  would match any event name containing the word FERRY regardless of order.
  This is harmless in practice but is technically redundant.

- **Supervision is all-or-nothing:** There is no per-supervision-event toggle.
  Either all supervision events are included or none. This was intentional per
  v3.8.0 design — supervision events are considered an administrative context,
  not individually scheduled responsibilities.

- **No per-date NA granularity:** NA categories are selected globally across all
  dates. There is no way to say "track FTC-A NAs only on Tuesday." This matches
  the user's stated model where NA selection controls conflict tracking
  participation globally.

---

## Change Impact Checklist

Use this checklist whenever modifying anything in the Event Selection compartment.

### If you change `STAFF_KEYWORDS`

- [ ] Verify no student event names contain any of the new keywords without a
      `P/S ` prefix
- [ ] Check feedback.txt for historical examples of misclassified events
- [ ] Retest classification of: `P/S CHASE`, `LOW L/D P/S CHASE`, `MSN QUAL FORM UPG`
      (should remain Staff), `CF-1` (should be A-Class or B-Class via personnel)

### If you change `classifyEvent()`

- [ ] Verify the P/S exclusion is still applied before keyword matching
- [ ] Retest events with zero crew: should fall to `'Other'` (inheriting later via Pass 2)
- [ ] Retest events with mixed A/B crew: majority should win; tie goes to A-Class
- [ ] Confirm staff personnel (Staff IP, etc.) are excluded from aCount/bCount
- [ ] Rerun the two-pass logic manually against at least one date with uncrewed CF events

### If you change the two-pass sibling inheritance

- [ ] Confirm `STUDENT_PATTERNS` still covers user's required event name prefixes
- [ ] Verify Pass 1 correctly populates `dateNameClass` only for non-Other events
- [ ] Verify Pass 2 exact match (same date, same name) fires before broadening
- [ ] Verify broadening only promotes to A-Class or B-Class (not Staff or Other)
- [ ] Test the case where NO crewed sibling exists (event must stay Other)

### If you change `naCategoriesAvailable`

- [ ] Confirm the list is derived from `roster` keys, NOT from actual NA events
- [ ] Verify the display order follows `CATEGORY_COLORS` key order
- [ ] Test with a roster that has no STC members (should not crash)
- [ ] Test with a roster category that has members but no NA events (should still appear)

### If you change the Supervision section

- [ ] The Supervision chip uses `selectedIds` (same Set as regular events), not `naCats`
- [ ] `allSupervisionIds` must stay in sync with events having `section === 'Supervision'`
- [ ] Confirm that Supervision events remain `readonly: true` and are never passed
      through `classifyEvent()` (they are excluded at line 3825)
- [ ] The Supervision section header must appear ABOVE the NON-AVAILABILITY block

### If you change localStorage key names

- [ ] Update `STORAGE_KEY`, `WORKING_STORAGE_KEY` constants
- [ ] Update all call sites: `saveState`, `loadState`, `clearState`,
      `saveWorkingCopy`, `loadWorkingCopy`, `clearWorkingCopy`
- [ ] Old key will be orphaned in existing users' browsers — add a migration or
      note the breaking change

### If you change `eventNaturalKey()`

- [ ] Existing saved selections in all users' browsers will become invalid
      (no automatic match after reload)
- [ ] Update version-history.md to note the breaking change in persistence
- [ ] Consider whether `model` is always present — null/undefined `model` serializes
      as `'null'` or `'undefined'`; verify the key includes `|| ''` guards

### If you add a new class category beyond A-Class / B-Class / Staff / Other

- [ ] Add entry to `CLASS_COLORS` (lines 3786-3791)
- [ ] Add to `classOrder` array (line 3965) — currently `['A-Class', 'B-Class', 'Staff', 'Other']`
- [ ] Add to `classSets` initialization in the useMemo (line 3815)
- [ ] Verify quick-select buttons still filter out empty categories

### If you change the render order within date groups

- [ ] `classOrder` (line 3965) and `sectionOrder` (line 3966) are local to the component
- [ ] `SECTION_ORDER` (line 2394) is the global constant used by SchedulerView
      and WhiteboardView — changing it affects the main workspace layout too
- [ ] Confirm the two arrays are not confused; `sectionOrder` in this component
      is `['Flying', 'Ground']` (no NA or Supervision, those are handled separately)

### After any classification logic change

- [ ] Open the app with sample data and confirm events land in expected groups
- [ ] Open the app with live API data (if accessible) and spot-check at least one
      day with mixed A-Class, B-Class, Staff, and uncrewed CF events
- [ ] Check that the Continue button count matches expectations
- [ ] Check that selections persist after navigating to Scheduler and back
