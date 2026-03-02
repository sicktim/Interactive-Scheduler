# Change Tracking Compartment

> **File:** `Interactive-scheduler/interactive-scheduler.html`
> **Current version:** v3.8.0
> **Last audited:** 2026-03-01
> **Auditor:** Historian agent (Claude Sonnet 4.6)

---

## Purpose

The change tracking system records every mutation a scheduler makes to working events, displays those mutations as human-readable net-effect instructions in the Change Summary panel, provides per-group undo, and copies instructions to the clipboard for pasting into the source spreadsheet. It is the primary "output channel" of the scheduler — the thing that converts UI interactions into actionable spreadsheet instructions a human can follow.

The system deliberately separates two concerns:

1. **Raw log** (`changes` array) — append-only, preserves every discrete mutation for undo correctness.
2. **Net display** (`computeNetChanges()`) — pure transformation run at render time; cancels reciprocal changes, detects moves, groups bulk operations.

---

## Owner Boundaries

The change tracking compartment owns the following, and nothing else should modify them without understanding the invariants below:

| Owned | Location |
|-------|----------|
| `changes` state | `SchedulerView` — line 7539 |
| `setChanges` calls | Inside `setWorkingEvents` updaters (for atomicity) or immediately after (for `handleAdd`) |
| `initialized` ref guard | Lines 7553, 7576–7577, 7598–7599, 7629–7630, 7660–7661, 7678, 7698 |
| `computeNetChanges()` | Lines 3060–3183 |
| `handleUndoGroup()` | Lines 7906–7954 |
| `handleClearAll()` | Lines 7957–7961 |
| `handleCopy()` | Lines 7964–8013 |
| `ChangeSummary` component | Lines 5032–5105 |
| `NetChangeEntry` component | Lines 4936–5030 |
| `saveState()` / `loadState()` / `clearState()` | Lines 3642–3722 |
| `saveWorkingCopy()` / `loadWorkingCopy()` / `clearWorkingCopy()` | Lines 3663–3702 |

---

## Key Functions & Line References

| Function / Symbol | Line(s) | Description |
|---|---|---|
| `STORAGE_KEY` constant | 2387 | `'tps-scheduler-state'` — lightweight key (changes + selections) |
| `WORKING_STORAGE_KEY` constant | 3661 | `'tps-scheduler-working'` — full working copy including events |
| `saveState()` | 3642 | Saves `changes`, selected IDs (as natural keys), and NA cats |
| `saveWorkingCopy()` | 3663 | Saves full `workingEvents`, `allEvents`, `roster`, and `changes` |
| `loadWorkingCopy()` | 3680 | Returns full session state; returns `null` if key absent |
| `clearWorkingCopy()` | 3699 | Removes `WORKING_STORAGE_KEY` and `'tps-scheduler-highlights'` |
| `loadState()` | 3704 | Returns lightweight state (changes, selectedIds, naCats) |
| `clearState()` | 3719 | Removes `STORAGE_KEY`, then calls `clearWorkingCopy()` |
| `computeNetChanges(changes)` | 3060–3183 | Pure function; returns net instruction array |
| `EVENT_LEVEL_TYPES` set | 3063 | `{'event-cancel', 'event-edit', 'event-delete'}` — bypass person-net path |
| `initialized` ref | 7553 | `useRef(false)`; gate that prevents phantom changes on init |
| `restoredFromCache` ref | 7554 | `useRef(false)`; prevents double-restore on subsequent renders |
| `changes` state | 7539 | `useState([])` — raw chronological mutation log |
| `handleCancelEvent()` | 7571–7592 | Records `event-cancel` change inside `setWorkingEvents` updater |
| `handleEditSave()` | 7594–7614 | Records `event-edit` change inside `setWorkingEvents` updater |
| `handleStatusChange()` | 7618–7645 | Records `event-status` change inside `setWorkingEvents` updater |
| `handleDeleteConfirmed()` | 7652–7674 | Records `event-delete` change; snapshots full event into `deletedEvent` |
| Init `useEffect` | 7677–7699 | Sets `initialized.current = false`, hydrates state, fires `requestAnimationFrame` to re-enable |
| Auto-save `useEffect` | 7769–7778 | Triggers `saveState` + `saveWorkingCopy` on every `changes` update |
| `handleAdd()` | 7781–7824 | Records `remove` (from source) + `add` (to target) via external `setChanges` |
| `handleRemove()` | 7878–7903 | Records `remove` inside `setWorkingEvents` updater (atomicity fix) |
| `handleUndoGroup()` | 7906–7954 | Reverses all `indices` in descending order; filters them from `changes` |
| `handleClearAll()` | 7957–7961 | Resets `workingEvents` to `originalPersonnel`, clears `changes`, calls `clearState()` |
| `handleCopy()` | 7964–8013 | Formats `computeNetChanges` output into plaintext; writes to clipboard |
| `NetChangeEntry` component | 4936–5030 | Renders one net instruction; dispatches on `inst.type` |
| `ChangeSummary` component | 5032–5105 | Groups instructions by date; renders count badge (net + raw) |
| `ChangeSummary` usage | 8178–8183 | Props: `changes`, `onUndoGroup`, `onClearAll`, `onCopy` |

---

## Change Entry Shape

The raw `changes` array is an append-only log. Each entry is one of five types:

### Person-level types

```js
// type: 'add'
{
  type: 'add',
  person: string,         // e.g. 'Borek S'
  date: string,           // ISO date, e.g. '2026-02-03'
  eventSection: string,   // 'Flying' | 'Ground' | 'NA' | 'Supervision'
  eventModel: string,     // e.g. 'F-16' (may be empty for Ground/NA)
  eventName: string,      // e.g. 'CF-1'
  eventTime: string,      // e.g. '08:15' (startTime)
  eventId: string,        // stable session ID (UUID-like)
}

// type: 'remove'  — same fields as 'add'
```

### Event-level types

```js
// type: 'event-cancel'  (recorded by handleCancelEvent, line 7577)
{
  type: 'event-cancel',
  eventId, eventName, eventModel, eventTime, eventSection, date,
  cancelledBefore: boolean,   // ev.cancelled before toggle
  cancelledAfter: boolean,    // ev.cancelled after toggle
}

// type: 'event-edit'  (recorded by handleEditSave, line 7599)
{
  type: 'event-edit',
  eventId, eventName, eventModel, eventTime, eventSection, date,
  before: { eventName, model, startTime, endTime },
  after:  { eventName, model, startTime, endTime },   // partial — only changed fields
}

// type: 'event-status'  (recorded by handleStatusChange, line 7630)
{
  type: 'event-status',
  eventId, eventName, eventModel, eventTime, eventSection, date,
  field: 'effective' | 'partiallyEffective' | 'cancelled',
  before: { effective, partiallyEffective, cancelled },
  after:  { effective, partiallyEffective, cancelled },
}

// type: 'event-delete'  (recorded by handleDeleteConfirmed, line 7661)
{
  type: 'event-delete',
  eventId, eventName, eventModel, eventTime, eventSection, date,
  deletedEvent: { ...fullEventSnapshot, personnel: [...], placeholders: [...] },
}
```

**Note:** `event-status` entries are NOT processed by `computeNetChanges` (not in `EVENT_LEVEL_TYPES`). They ARE handled by `handleUndoGroup`. This is a minor omission from the `computeNetChanges` display path — see Bug History.

---

## Net Change Algorithm

`computeNetChanges(changes)` (lines 3060–3183) is a **pure function** called inside `useMemo` in `ChangeSummary` and directly inside `handleCopy`. It never mutates its input.

### Step 1 — Separate event-level changes (line 3066)

Event-level types (`event-cancel`, `event-edit`, `event-delete`) bypass the person-net logic. They are collected into `eventLevelItems[]` with their `rawIndices` for direct undo tracking.

### Step 2 — Accumulate net count per (person, eventId) (line 3081)

For each `add`/`remove` entry, accumulates into `netMap` keyed by `"person||eventId"`:
- `add` contributes +1
- `remove` contributes -1
- All contributing raw indices are stored in `entry.indices[]`
- Event metadata captured from the first entry for that key

### Step 3 — Classify per-person effects (line 3097)

For each person, sorts entries into:
- `adds[]` — net > 0 (net-positive adds)
- `removes[]` — net < 0 (net-positive removes)
- `zeroIndices[]` — net = 0 (cancelled pairs; still needed for undo)

### Step 4 — Classify into moves / standalone adds / standalone removes (line 3108)

Sorted chronologically by earliest raw index. Then:

```
numMoves = min(adds.length, removes.length)

for i in [0..numMoves):
  pair removes[i] with adds[i] → MOVE instruction
  if exactly 1 move total, include zeroIndices (chain-move intermediates)

remaining adds[numMoves..] → standalone ADD instructions
remaining removes[numMoves..] → standalone REMOVE instructions
```

This handles all 9 scenarios from `fix-net-changes.md`:
- Scenario 3 (net-zero): `zeroIndices`, not shown
- Scenario 4 (simple move): `numMoves=1`, one MOVE
- Scenario 6 (bulk move): `numMoves=N`, N individual MOVEs then grouped in Step 5
- Scenario 8 (chain move A->B->C): net per person = remove A, zero B, add C → one MOVE (A->C); `zeroIndices` included for full undo

### Step 5 — Group by instruction type and event pair (line 3141)

Group key logic:
- `move`: `"move||{sourceEventId}||{targetEventId}"`
- `add`:  `"add||{targetEventId}"`
- `remove`: `"remove||{sourceEventId}"`

Multiple people with the same source/target pair collapse into one display entry with a `persons[]` array.

### Step 6 — Collapse event-cancel chains (line 3158)

For `event-cancel` entries: an even-length chain for the same `eventId` (cancel then un-cancel) is net-zero and omitted. An odd-length chain keeps only the last state, but merges all `rawIndices` so the full chain is undone atomically.

### Step 7 — Merge and sort (line 3180)

Combines person-instruction groups with net event-level items, sorted by `date` then `firstIndex` (chronological within date).

### Output shape (net instruction)

```js
{
  type: 'add' | 'remove' | 'move' | 'event-cancel' | 'event-edit' | 'event-delete',
  persons: string[],           // empty for event-level types
  date: string,                // ISO date (source date for moves)
  source: { eventId, eventName, eventModel, eventTime, eventSection, date } | null,
  target: { eventId, eventName, eventModel, eventTime, eventSection, date } | null,
  rawIndices: number[],        // all contributing raw change indices (for undo)
  firstIndex: number,          // earliest raw index (for sort)
  // event-cancel only:
  cancelledBefore: boolean,
  cancelledAfter: boolean,
  // event-edit only:
  before: object,
  after: object,
  // event-delete only:
  deletedEvent: object,
}
```

---

## Undo System

### `handleUndoGroup(indices)` — lines 7906–7954

Takes an array of raw `changes` indices (from `inst.rawIndices`) and reverses them in **descending order** (last change first).

Reverse logic per change type:

| Type | Reverse Operation |
|---|---|
| `add` | `event.personnel.filter(p => p !== ch.person)` |
| `remove` | `event.personnel.push(ch.person)` (if not already present) |
| `event-cancel` | `ev.cancelled = ch.cancelledBefore` |
| `event-status` | `Object.assign(ev, ch.before)` |
| `event-edit` | `Object.assign(ev, ch.before)` |
| `event-delete` | `next.push({ ...ch.deletedEvent, ... })` (re-inserts if not found) |

After applying all reversals, `setChanges(prev => prev.filter((_, i) => !indexSet.has(i)))` removes the undone indices from the raw array.

### Why descending order matters

If a chain A->B->C produces raw changes `[remove A, add B, remove B, add C]`, reversing in descending order gives:
1. Undo "add C" → remove from C
2. Undo "remove B" → add back to B
3. Undo "add B" → remove from B
4. Undo "remove A" → add back to A

Net effect: person is back on A, not on B or C. Correct.

### "Undo all group" contract

The undo button always reverses the **entire group** as displayed. There is no partial undo within a group. Tooltip reads "Undo all" to signal this. This was an explicit design decision (see `fix-net-changes.md` Section 5 — "Alternative considered") to prevent dangerous partial-undo states where a person ends up on no event.

### `handleClearAll()` — lines 7957–7961

Resets `workingEvents` by mapping all events back to `ev.originalPersonnel`. Clears `changes` to `[]`. Calls `clearState()` to remove both localStorage keys.

---

## Clipboard Format

`handleCopy()` (lines 7964–8013) calls `computeNetChanges(changes)`, groups instructions by date, and writes a human-readable string to `navigator.clipboard`.

### Format template

```
--- {weekday} {day} {month} ---
  MOVE: {model} | {eventName} ({time})  -->  {model} | {eventName} ({time})
        {person1}, {person2}, ...

  ADD to {model} | {eventName} ({time}):
        {person1}, {person2}

  REMOVE from {model} | {eventName} ({time}):
        {person1}

  CANCELLED: {model} | {eventName} ({time})
  UN-CANCELLED: {model} | {eventName} ({time})
  EDITED: {model} | {eventName} ({time}) [name -> "...", time -> HH:MM-HH:MM]
  REMOVED: {model} | {eventName} ({time})

```

### Cross-date move notation

If the target event is on a different date than the group date header, the target's time field is prefixed with a short date: `(Mon, 3 Feb, 10:00)`. This handles cross-day moves. Implemented at line 7980.

### Example output

```
--- Mon 3 Feb ---
  MOVE: F-16 | CF-1 (08:15)  -->  C-172 | Ground School (10:00)
        Knoerr S, Peterson R, Morrison J
  ADD to T-38 | Contact (13:00):
        Dobbs R

--- Tue 4 Feb ---
  REMOVE from F-16 | Aero EE (08:00):
        Smith J
  CANCELLED: T-38 | CF-2 (09:00)
```

---

## State Connections

### `changes` array dependencies

```
changes
  ├── read by: computeNetChanges() → ChangeSummary display
  ├── read by: handleUndoGroup() (via closure over changes)
  ├── read by: handleCopy() (passed to computeNetChanges)
  ├── read by: auto-save useEffect (line 7769)
  ├── written by: handleAdd()         [external setChanges call, line 7822]
  ├── written by: handleRemove()      [inside setWorkingEvents updater, line 7895]
  ├── written by: handleCancelEvent() [inside setWorkingEvents updater, line 7577]
  ├── written by: handleEditSave()    [inside setWorkingEvents updater, line 7599]
  ├── written by: handleStatusChange()[inside setWorkingEvents updater, line 7630]
  ├── written by: handleDeleteConfirmed() [external setChanges call, line 7661]
  ├── written by: handleUndoGroup()   [filter to remove undone indices]
  ├── written by: handleClearAll()    [reset to []]
  └── restored from: cachedWorkingState.changes (line 7686)
```

### `initialized` ref dependencies

The `initialized` ref is the gate protecting ALL `setChanges` calls. Its lifecycle:

1. Set to `false` at the start of the init `useEffect` (line 7678)
2. State is hydrated (either from cache or `allEvents`)
3. `requestAnimationFrame(() => { initialized.current = true; })` (line 7698) — fires after the browser has painted the first frame with the new state, guaranteeing no phantom changes from React's batch-processing of the state initialization

Every `setChanges` call site checks `if (initialized.current)` before proceeding, except inside `setWorkingEvents` updaters where the check is done before calling the updater.

### `restoredFromCache` ref

Prevents the init `useEffect` from re-loading cache on subsequent renders after `allEvents` changes. Once set to `true`, subsequent `allEvents` changes cause a fresh load from `allEvents` instead of re-applying the cache.

### localStorage keys

| Key | Content | Written by | Read by |
|---|---|---|---|
| `'tps-scheduler-state'` | `{changes, selectedIds, selectedKeys, naCats, savedAt}` | `saveState()` | `loadState()` |
| `'tps-scheduler-working'` | `{workingEvents, changes, allEvents, roster, dates, selectedIds, naCats, savedAt}` | `saveWorkingCopy()` | `loadWorkingCopy()` |
| `'tps-scheduler-highlights'` | whiteboard highlight map | whiteboard compartment | cleared by `clearWorkingCopy()` |

The `selectedKeys` field in `tps-scheduler-state` stores stable natural keys (`eventNaturalKey()`, line 3640) instead of session-volatile IDs, allowing event selections to survive across refreshes even when IDs regenerate.

### Auto-save trigger

The `useEffect` at line 7769 is keyed on `[changes]`. Every time `changes` updates, both `saveState` and `saveWorkingCopy` fire. A 2-second "saved" indicator (`savedShow` state) also fires.

---

## Cross-Compartment Dependencies

| Compartment | Dependency |
|---|---|
| **Timeline / EventCard** | Calls `handleRemove(eventId, person)` on chip X button. Calls `handleAdd(targetId, person, sourceId)` on drop. Both feed into `changes`. |
| **Whiteboard view** | Calls `handleAdd`, `handleRemove`, `handleEditSave`, `handleStatusChange`, `handleDeleteEvent`. All feed into `changes`. |
| **PersonnelPicker** | Calls `handleAdd(targetId, person, null)` (no sourceId). Records as pure `add`. |
| **EventCard action menu** | Calls `handleCancelEvent`, `handleEditSave`, `handleDeleteConfirmed`. All record event-level changes. |
| **Conflict detection** | Reads `workingEvents` (which `handleUndoGroup` and `handleAdd`/`handleRemove` mutate). Does not touch `changes`. |
| **Focus mode** | Reads `workingEvents.personnel` to compute `focusedAvailability`. Does not touch `changes`. |
| **Rainbow view** | Reads `workingEvents` but does not write to `changes`. |
| **Custom events** | `handleCreateEvent` and `handleDeleteCustomEvent` do NOT record into `changes`. Custom events have their own `CUSTOM_EVENTS_KEY` localStorage. |
| **Placeholders** | `handleAddPlaceholder`, `handleRemovePlaceholder`, `handleFillPlaceholder` do NOT record into `changes`. |
| **LocalStorage** | `clearState()` and `clearWorkingCopy()` are called by `handleClearAll()` and by the "Full Refresh" path. |

---

## Bug History & Known Issues

### [FIXED v1.0 → v2.0] Phantom changes on load

**Symptom:** Change summary showed changes on initial load without user interaction.
**Root cause:** React batch-processes state initialization; `setWorkingEvents` fired `setChanges` before the component settled.
**Fix:** `initialized` ref with `requestAnimationFrame` delay. Guard added to all change-recording paths. See version-history.md v2.0.

### [FIXED v3.0] X button did not track changes

**Symptom:** Removing a person with the chip X button did not appear in Change Summary.
**Root cause:** `setChanges` was called outside the `setWorkingEvents` updater. React 18 batches these in event handlers, so the state read inside `handleRemove` was stale by the time `setChanges` ran.
**Fix (v3.1):** Moved `setChanges` call **inside** the `setWorkingEvents` updater for `handleRemove`. This guarantees both state updates are atomic in a single render cycle.
**Reference:** feedback.txt "Change tracking. Seems to track effectively when grouping or moving pucks between events. It doesn't track changes when you remove a person with the X. [FIXED in v3.1]"

### [FIXED v3.0] Change summary showed raw changes, not net changes

**Symptom:** Moving Borek off an event then back onto it left 2 entries instead of 0.
**Root cause:** No net-change computation existed; every mutation was displayed directly.
**Fix (v3.0):** `computeNetChanges()` introduced. `ChangeSummary` switched to displaying net instructions only. See `fix-net-changes.md` for the full 9-scenario analysis.
**Reference:** feedback.txt v2 feedback, "Change summary simply tracks each change, but doesn't track net change."

### [KNOWN] `event-status` not shown in ChangeSummary

**Current behavior:** `handleStatusChange()` records `event-status` entries into `changes`, and `handleUndoGroup` correctly reverses them, but `computeNetChanges` does not include `event-status` in `EVENT_LEVEL_TYPES` (line 3063) and does not process them. Result: status changes are tracked for undo but are invisible in the Change Summary panel and clipboard output.
**Impact:** Low — status changes (effective/partiallyEffective/cancelled toggle via whiteboard) are a secondary path. The main cancel path (`handleCancelEvent`) uses `event-cancel` which IS displayed.
**Resolution needed:** Add `'event-status'` to `EVENT_LEVEL_TYPES` and add a `NetChangeEntry` renderer for it, similar to `event-cancel`.

### [KNOWN] `event-delete` indices not merged with event-cancel chain logic

**Current behavior:** `event-delete` entries are passed through `netEventItems` directly (line 3169 `netEventItems.push(item)`), but delete-then-undo (which removes the entry from `changes`) is handled by `handleUndoGroup` deleting the index. If a user deletes an event and then adds it back via some other path (currently no UI for this), the two won't cancel. In practice, event deletion cannot be "un-done" via a subsequent UI action — only via the undo button — so this is benign.

### [KNOWN] Chain-move zero-index distribution

In `computeNetChanges` line 3124:
```js
if (numMoves > 1 && pe.zeroIndices.length > 0) {
    rawInstructions[rawInstructions.length - numMoves].rawIndices.push(...pe.zeroIndices);
}
```
When a person has multiple moves (N removes paired with N adds), intermediate zero-pair indices are attached only to the **first** move instruction. This means undoing the second move does not clean up zero-pair intermediates from `changes`. They remain as orphaned entries but have no display effect (they cancelled to zero). Functionally harmless since orphaned zero-pair entries remain invisible to `computeNetChanges`.

### [KNOWN] handleAdd records changes outside updater

`handleAdd` (line 7781) collects `newChanges` synchronously inside the `setWorkingEvents` updater, then calls `setChanges(c => [...c, ...newChanges])` **outside** the updater (line 7822). This is different from `handleRemove` which records inside the updater. The reason `handleRemove` needed the inside-updater approach (v3.1 fix) was that it read stale state from the event handler closure. `handleAdd` avoids this by building `newChanges` synchronously in the updater before the external call. This is correct but architecturally inconsistent with `handleRemove`.

---

## Change Impact Checklist

When modifying any part of the change tracking compartment, verify the following:

### If modifying `computeNetChanges()`:
- [ ] Scenario 3 (net-zero add+remove): summary shows "All changes cancel out"
- [ ] Scenario 4 (simple move): summary shows one MOVE with one person
- [ ] Scenario 6 (bulk move): summary shows one grouped MOVE with all people
- [ ] Scenario 8 (chain move A->B->C): summary shows MOVE A->C with intermediate indices merged
- [ ] `event-cancel` cancel+uncancel chain (even length): omitted from display
- [ ] `event-cancel` toggle once (odd length): shown once with correct `cancelledAfter`
- [ ] Clipboard output format unbroken (MOVE/ADD/REMOVE/CANCELLED/EDITED/REMOVED labels)
- [ ] `rawIndices` on each output instruction covers all contributing raw entries (undo correctness)

### If modifying `handleUndoGroup()`:
- [ ] Undo `add` removes person from event
- [ ] Undo `remove` re-adds person to event
- [ ] Undo `event-cancel` reverts `cancelled` to `cancelledBefore`
- [ ] Undo `event-status` restores all three status booleans from `ch.before`
- [ ] Undo `event-edit` restores `eventName`, `model`, `startTime`, `endTime` from `ch.before`
- [ ] Undo `event-delete` re-inserts event into `workingEvents` with full personnel/placeholders
- [ ] Undone indices removed from `changes` array
- [ ] `changes` re-derived `computeNetChanges` display updates correctly after undo

### If modifying `handleRemove()` or `handleAdd()`:
- [ ] Change entry fields: `type`, `person`, `date`, `eventSection`, `eventModel`, `eventName`, `eventTime`, `eventId` all present
- [ ] `initialized.current` guard respected
- [ ] For `handleRemove`: `setChanges` remains inside `setWorkingEvents` updater (React 18 atomicity)
- [ ] For `handleAdd`: `newChanges` correctly captures both the `remove` from source (if `sourceId` present) and the `add` to target

### If modifying localStorage persistence:
- [ ] `changes` array survives page refresh (hydrated in init `useEffect` line 7686)
- [ ] `restoredFromCache.current` prevents double-restore
- [ ] Full Refresh / Clear All calls `clearState()` which removes both storage keys
- [ ] `eventNaturalKey()` used for `selectedKeys` (not session-volatile IDs)

### If adding a new mutation type:
- [ ] Add entry type to raw `changes` shape section above
- [ ] If event-level: add to `EVENT_LEVEL_TYPES` set (line 3063)
- [ ] Add undo logic to `handleUndoGroup` `sortedDesc.forEach` block (line 7911)
- [ ] Add `NetChangeEntry` render case
- [ ] Add clipboard format line in `handleCopy`
- [ ] Consider whether the new type should participate in cancel-chain collapsing (like `event-cancel`) or pass through directly (like `event-edit`, `event-delete`)

### If touching `initialized` ref:
- [ ] Guard still set to `false` at start of init `useEffect` before any state is set
- [ ] Guard re-enabled only via `requestAnimationFrame` (not synchronously)
- [ ] All `setChanges` call sites still check the guard
- [ ] Second-render protection (`restoredFromCache`) still intact
