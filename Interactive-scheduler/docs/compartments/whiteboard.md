# Whiteboard Compartment

**Source file:** `Interactive-scheduler/interactive-scheduler.html` (v4.2.0, ~9450 lines)
**Document date:** 2026-03-04

---

## Purpose

The Whiteboard view is a spreadsheet-style tab within the TPS Interactive Scheduler that mirrors the physical whiteboard used by schedulers at the Test Pilot School. It presents one day's worth of schedule data in a dense, tabular layout with inline cell editing, drag-and-drop crew assignment, status checkboxes (Eff/CX/PE), contextual cell highlighting, and per-duty supervision grouping. It is the primary data-entry surface for schedulers who want a compact "whole day at a glance" view that matches the look of the source Google Sheet (Whiteboard 2.0).

The view was introduced in v4.0 (the `Whiteboard-addition` branch) and is co-equal with the Timeline and Rainbow tabs.

---

## Owner Boundaries

The Whiteboard compartment owns:

- All components prefixed `Whiteboard*` (lines 6310–7810)
- The `HighlightPicker` component (line 6286)
- The `PlaceholderChip` component (line 6489)
- The `WhiteboardCrewGroup` component (line 6699)
- The `WhiteboardCrewCell` component (line 6380)
- The `wbRowClass` helper (line 6935)
- The `PendingTimeInput` component (line 6946) — active component for pending supervision slot time entry; manages draft state locally, calls `onCommit(value)` on blur or Enter
- The `DutyPuckChip` and `DutyDropZone` inner components (defined inside `WhiteboardView`, ~line 8450)
- The `DUTY_STORAGE_KEY` localStorage key (`tps-duty-assignments`, line 7822)
- The `HIGHLIGHT_STORAGE_KEY` localStorage key (`tps-scheduler-highlights`, line 3977)
- CSS rules from `.whiteboard-area` through `.wb-*` prefixed selectors (lines 1285–~1870)
- CSS for `.duty-slot`, `.duty-puck-chip`, `.duty-drop-zone` (lines 1321–~1375)
- Light-mode overrides for all of the above (lines ~2150–2360)
- Constants: `WB_SECTION_ORDER`, `SUPV_DUTY_ORDER`, `ACAD_FIXED_CATS`, `WB_HIGHLIGHT_COLORS`, `WB_HIGHLIGHT_BG` (lines 2603–2718)
- Placeholder system constants: `BLANK_PUCK_DEFS`, `RENAMEABLE_PH_ROLES`, `PLACEHOLDER_FILL_RULES`, `PLACEHOLDER_ROLE_OPTIONS`, `GENERIC_PUCK_COLOR`, `canFillPlaceholder`, `getPlaceholderRoleColor`, `makePlaceholder` (lines 2645–2718)
- `handleCreateWbEvent` wrapper and the "Add" buttons inside each sub-table
- `foaAuthBadges` useMemo (inside `WhiteboardView`)
- Scroll position persistence per day
- `wbActiveDay` state in `SchedulerView`
- The `viewMode === 'whiteboard'` branch and its `display:none` wrapper

The Whiteboard compartment does NOT own:

- `handleAdd`, `handleRemove`, `handleEditSave`, `handleStatusChange`, `handleDeleteEvent`, `handleDeleteCustomEvent`, `handleCreateEvent`, `handleAddPlaceholder`, `handleRemovePlaceholder`, `handleFillPlaceholder` — these live in `SchedulerView` and are passed as props
- `focusedEventId` state — owned by `SchedulerView`, threaded into whiteboard via prop
- `workingEvents` state — owned by `SchedulerView`, whiteboard is read-only on it (except via callbacks)
- The `PersonnelPicker` — shared with Timeline view, shown when `viewMode` is `'timeline'` or `'whiteboard'` (line 8688)
- `CUSTOM_EVENTS_KEY` (`tps-scheduler-custom-events`) — shared with Timeline create-event flow, but whiteboard also reads/writes it via `handleCreateEvent` / `handleDeleteCustomEvent`
- `CATEGORY_COLORS`, `chipColor()`, `personCat()` — shared color utilities

---

## Key Components and Line References

| Component | Lines | Purpose |
|---|---|---|
| `WhiteboardView` | 7810–~8200 | Root component; owns day state, highlights, duty pucks, scroll position |
| `WhiteboardSupervision` | 6984–~7400 | Duty-grouped table (SOF, OS, ODO, FDOs); pending empty triplets with `PendingTimeInput`/`handlePocDrop`; up to 4 POC/Start/End triplets per row |
| `WhiteboardFlying` | 7400–~7538 | Flying events table; 12 columns including Model, Brief, ETD, ETA, Debrief, Crew |
| `WhiteboardGround` | 7538–~7658 | Ground events table; 9 columns including Event, Start, End, Person(s) |
| `WhiteboardAcademics` | 7658–~7708 | Read-only academics sidebar; always renders 4 fixed rows |
| `WhiteboardNA` | 7708–~7810 | Non-availability table; no status checkboxes |
| `WhiteboardCrewGroup` | 6699–~6935 | Multi-person crew cell with flex-wrap chips, placeholders, and + menu |
| `WhiteboardCrewCell` | 6380–~6489 | Single-occupancy crew cell (used only by Supervision POC column on existing events) |
| `PlaceholderChip` | 6489–~6699 | Dashed unfilled slot chip with drag-fill, rename, and warning prompt |
| `WhiteboardCell` | 6310–6379 | Inline-editable `<td>`; supports text and time (HH:MM validated by `TIME_RE`); Tab/Shift+Tab navigation; standard `<input className="wb-input">` for both text and time types |
| `HighlightPicker` | 6286–~6310 | `position:fixed` color-swatch popup portal; appears near clicked cell |
| `PendingTimeInput` | 6946–~6984 | Lightweight text input for pending supervision slot times; manages draft state locally; fires `onCommit(value)` on blur or Enter |
| `DutyPuckChip` | ~8135–~8160 | Colored chip in FOA/AUTH header slots; draggable |
| `DutyDropZone` | ~8160–~8200 | Drop target "+"-styled zone in FOA/AUTH header |
| `wbRowClass` | 6935–6946 | Returns `wb-row-effective`, `wb-row-partial`, or `wb-row-cancelled` per event status |

### Supporting constants (defined at module scope)

| Constant | Line | Value / Purpose |
|---|---|---|
| `WB_SECTION_ORDER` | 2603 | `['Supervision', 'Flying', 'Ground', 'NA']` — render order |
| `SUPV_DUTY_ORDER` | 2605 | `['SOF', 'OS', 'ODO', 'F-16 FDO', 'T-38 TDO', 'C-12 TDO', 'A-29 ADO']` — no "Other (As Req'd)"; custom duties create dynamic rows |
| `ACAD_FIXED_CATS` | 2607–2615 | 4-element array for fixed Academics rows (Alpha/Bravo x FTC/STC) |
| `TIME_RE` | 2615 | `/^([01]\d|2[0-3]):[0-5]\d$/` — military time validation |
| `GENERIC_PUCK_COLOR` | 2645 | `{ bg: '#f8fafc', text: '#1e293b' }` — white puck for generic role |
| `BLANK_PUCK_DEFS` | 2647–2658 | 7 blank-puck definitions for picker (IP, IFTE/ICSO, FTC-A, FTC-B, STC-A, STC-B, Generic) |
| `RENAMEABLE_PH_ROLES` | 2658 | `Set(['IP', 'IFTE/ICSO', 'Staff STC', 'Generic'])` |
| `PLACEHOLDER_FILL_RULES` | 2664–2676 | Which roster categories can fill each placeholder role |
| `canFillPlaceholder` | 2676 | Helper: returns bool from `PLACEHOLDER_FILL_RULES` |
| `getPlaceholderRoleColor` | 2685 | Helper: returns `{ bg, text }` color object for a role |
| `makePlaceholder` | 2690 | Factory: `{ id, role, filledBy }` |
| `PLACEHOLDER_ROLE_OPTIONS` | 2697–2709 | Ordered list for the add-placeholder popover |
| `WB_HIGHLIGHT_COLORS` | 2709–2718 | 7 swatch definitions (yellow, ftca, ftcb, stca, stcb, ip, ifte) |
| `WB_HIGHLIGHT_BG` | 2718 | Derived map from `WB_HIGHLIGHT_COLORS` |
| `HIGHLIGHT_STORAGE_KEY` | 3977 | `'tps-scheduler-highlights'` |
| `DUTY_STORAGE_KEY` | 7822 | `'tps-duty-assignments'` (defined inside `WhiteboardView`) |

---

## Table Structure

### Supervision Table (WhiteboardSupervision, lines 6984–~7400)

Uses `.wb-table.wb-table-compact`. The table has a fixed structure regardless of how many events exist for a given duty role.

**Column layout (colgroup):**

```
Duty (7.5%) | [POC (6%) | Start (4.5%) | End (4.5%)] × 4 | Notes (flex) | Delete (20px)
```

The four POC/Start/End triplets (`maxTriplets = 4`) correspond to up to four supervision events under the same duty type on a given day (e.g., SOF Alpha morning + SOF Bravo afternoon).

**Header row:** `Duty | POC | Start | End | POC | Start | End | POC | Start | End | POC | Start | End | Notes | (blank)`

For existing supervision events, POC columns use `WhiteboardCrewCell` (single-occupancy, colored by category). Start/End columns use `WhiteboardCell` with `type="time"`. Notes uses `WhiteboardCell` with `type="text"`. The Notes cell reflects only `evts[0].notes` since multiple events sharing a duty row only show one notes field.

**Empty triplets (pending slots):** If `evts[i]` is null, the slot renders three `<td>` elements containing a `PendingTimeInput` for Start, a `PendingTimeInput` for End, and a POC `<td>` that is a drop target (`handlePocDrop`). The state for in-progress (not-yet-created) triplets is held in `pendingSlots` (a `useState` object keyed by `slotKey = "${duty}:${i}"`). Once both times are valid, `onCreateEvent` fires immediately and the `pendingSlots` entry is removed. If only the POC is dropped first (times absent), the POC is stored in `pendingSlots[slotKey].poc` and `pocSourceId` for deferred creation when times are later entered. `PendingTimeInput` renders with an amber border (via CSS class `.wb-pending-time-amber`) when the field has content that fails `TIME_RE` validation.

**Delete column:** Renders an `×` span (`.wb-delete-btn`) only if any of the duty's events has `isCustom: true`. Deletes the first custom event found.

**Add button:** `+ Add Supervision Event`, opens a `window.prompt()` for a duty name, then calls `handleCreateWbEvent('Supervision', activeDay, { eventName: dutyName })`. The duty name is stored in `eventName` and used by `byDuty` as the grouping key. If the name matches a `SUPV_DUTY_ORDER` entry (exact or substring), it routes to the corresponding fixed row; otherwise a new dynamic row is created at the bottom of the table.

**Academics sidebar:** `WhiteboardAcademics` renders to the right of Supervision in a `.wb-supv-acad-row` grid (`grid-template-columns: 1fr 160px`, line 1455). It always renders all 4 fixed rows regardless of available event data, using `useMemo` to match events by `alphaKey` and `classKey` substrings (lines 7473–7481).

### Flying Table (WhiteboardFlying, lines 7400–~7538)

Uses `.wb-table`. 12 columns:

```
(delete 16px) | Model (6%) | Brief/startTime (5%) | ETD (5%) | ETA (5%) | Debrief/endTime (5%) | Event (12%) | Crew (flex) | Notes (9%) | Eff (28px) | CX (28px) | PE (28px)
```

- Crew column is `WhiteboardCrewGroup` — a flex-wrap `<td>` containing all crew chips, placeholder chips, and the `+` popover button.
- Status columns contain `<input type="checkbox" className="wb-checkbox wb-checkbox-{eff|cx|pe}">`.
- Tab navigation uses `cellRefsMap` with `makeTab(idx)` factory. Tab order: Model(0) → Brief(1) → ETD(2) → ETA(3) → Debrief(4) → Event(5) → Notes(6). `WhiteboardCrewGroup` is skipped in the tab chain.
- Delete button (`.wb-delete-btn`) calls `onDeleteCustom(ev.id)` for custom events or `onDeleteEvent(ev)` for imported events.

### Ground Table (WhiteboardGround, lines 7538–~7658)

Uses `.wb-table`. 9 columns:

```
(delete 16px) | Event (18%) | Start (6%) | End (6%) | Person(s) (flex) | Notes (12%) | Eff (28px) | CX (28px) | PE (28px)
```

No Model, ETD, or ETA. Tab order: Event(0) → Start(1) → End(2) → Notes(3).

### NA Table (WhiteboardNA, lines 7708–~7810)

Uses `.wb-table`. 6 columns:

```
(delete 16px) | Reason (20%) | Start (6%) | End (6%) | Person(s) (flex) | Notes (14%)
```

No Eff/CX/PE status columns. Tab order: Reason(0) → Start(1) → End(2) → Notes(3).

### Academics Sidebar (WhiteboardAcademics, lines 7658–~7708)

Uses `.wb-table.wb-table-compact`. 3 columns: Class | Start | End. Always renders 4 rows from `ACAD_FIXED_CATS`. Events are matched by substring: `alphaKey` (e.g., `'alpha'`) AND `classKey` (e.g., `'ftc'`) in `ev.eventName.toLowerCase()`. Display name strips the word "Academics" and surrounding whitespace. Unmatched rows show the fixed label and `—` (em-dash) in time columns. This table is read-only — no editing, no delete buttons.

---

## WhiteboardCell Component (lines 6310–6379)

`WhiteboardCell` is a `React.forwardRef` component that wraps a single `<td>`. It switches between a display state and an editing state (with a text `<input>`).

**Props:**
- `value` — current field value (string or null)
- `field` — field name key (e.g., `'startTime'`, `'eventName'`)
- `eventId` — used as first arg to `onSave`
- `type` — `'text'` or `'time'`
- `onSave(eventId, field, trimmedValue)` — called on commit if value changed
- `highlight` — color key string (e.g., `'yellow'`, `'ftca'`) or null; adds `wb-highlight-{key}` CSS class
- `highlightMode` — boolean; when true, click opens picker instead of editing
- `onHighlight(key, rect)` — called in highlight mode with cell key and bounding rect
- `readonly` — boolean; disables editing
- `className` — extra CSS class (used to apply `wb-supv-group-start` to POC columns)
- `onTab`, `onShiftTab` — callbacks invoked on Tab/Shift+Tab keydown inside input
- `cellRef` (via forwardRef) — exposes `{ focus: () => tdRef.current.click() }` for tab navigation

**Edit lifecycle:**
1. Click → `setEditing(true)` (guarded by `highlightMode` and `readonly`)
2. `useEffect` focuses `inputRef` when `editing` becomes true
3. Keyboard: Escape reverts draft; Enter commits; Tab commits then calls `onTab`/`onShiftTab`
4. Blur commits via `commit()`
5. `commit()` validates time fields against `TIME_RE` — reverts on invalid, does not call `onSave`
6. `commit()` only calls `onSave` if `trimmed !== (value || '').trim()`

**Highlight mode:** When `highlightMode` is true, click calls `onHighlight(`${eventId}:${field}`, rect)` and returns early without entering edit mode.

---

## WhiteboardCrewCell Component (lines 6380–~6489)

Used by `WhiteboardSupervision` for the POC slot in each triplet that corresponds to an **existing** supervision event. It is a single-occupancy `<td>` — it shows one person, allows drag-in of a replacement, and shows an `×` remove button on hover. Empty triplets (no existing event) use `handlePocDrop` inline instead of this component — see the `PendingTimeInput` / `pendingSlots` pattern in WhiteboardSupervision.

**Prop `className: extraClass`** — renamed to `extraClass` due to JSX destructuring; applied as an additional CSS class on the `<td>`. The supervision table passes `className="wb-supv-group-start"` to give the POC cell its bold left border.

**Drop semantics:**
- Parses drag payload JSON: `{ person, sourceEventId, category }`
- MOVE: if `sourceId && sourceId !== eventId`, calls `onRemove(sourceId, personName)` before `onAdd`
- Single-slot replacement: if the cell is already occupied by a different person, calls `onRemove(eventId, currentPerson)` first

**Drag start:** Encodes `{ person, sourceEventId: eventId, category }` as JSON in `text/plain`. Sets `effectAllowed = 'copyMove'`. Fades opacity to 0.4.

---

## WhiteboardCrewGroup Component (lines 6699–~6935)

Used by Flying, Ground, and NA tables for the multi-person crew column. Renders as a single `<td>` with `flex-wrap` content.

**Contents (in order):**
1. Real crew chips — filtered to exclude anyone already shown as a `filledBy` on a placeholder (`filledBySet` computed from `ev.placeholders`)
2. Placeholder chips (`PlaceholderChip`) for each entry in `ev.placeholders[]`
3. `+` button (`.wb-crew-add-btn`) that opens the add-placeholder role picker popover

**Drag payload JSON fields used:**
- `person` — name string
- `sourceEventId` — origin event id (for MOVE semantics)
- `category` — roster category string (for placeholder fill checking)
- `isBlankPuck` — boolean; true when dragged from a blank puck in the picker
- `isDefaultLabel` — boolean; true when blank puck has its default label (not renamed)
- `role` — placeholder role string

**Drop path selection:**
- `isBlankPuck && isDefaultLabel && role` → `onAddPlaceholder(eventId, role)` — creates unfilled slot
- `isBlankPuck && !isDefaultLabel && role` → `onAddPlaceholder(eventId, role, personName)` — creates filled slot
- Otherwise → MOVE from source if applicable, then `onAdd(eventId, personName)`, then check for matching unfilled placeholders → `setPendingFill()`

**PendingFill prompt:** After a real-name drop onto a crew group that has matching unfilled placeholder slots, shows an inline prompt on the newly-added chip asking which slot to fill.

**Add-placeholder popover:** Lists all roles from `PLACEHOLDER_ROLE_OPTIONS`. Click outside (via `document.addEventListener('pointerdown')`) closes the menu.

---

## PlaceholderChip Component (lines 6489–~6699)

Represents one placeholder slot within a `WhiteboardCrewGroup`. Has two visual states:

**Filled state:** Renders identically to a real crew chip — uses category color for roster members, role color for guest names. Remove button reverts `filledBy → null` (handled upstream in `handleRemove` which maps over placeholders).

**Unfilled state:** Dashed border, italic, 65% opacity. Role color used for border and tinted background.

**Rename:** Roles in `RENAMEABLE_PH_ROLES` (`IP`, `IFTE/ICSO`, `Staff STC`, `Generic`) show `cursor: text` and activate an inline `<input>` on click. Enter/blur commit the name as `filledBy` via `onFill(id, typedName)`.

**Incompatibility warning:** When a person is dropped on a placeholder whose role doesn't match their category (`canFillPlaceholder` returns false), a `.wb-placeholder-warn` popup appears anchored below the chip. The popup lists compatible sibling placeholder slots (if any), "Add to mission" fallback, and Cancel.

---

## Supervision Section Detail

`WhiteboardSupervision` (lines 6984–~7400) receives all `section === 'Supervision'` events for the active day and groups them by duty role using `byDuty` (a `useMemo`).

**`pendingSlots` state:** A `useState({})` object keyed by `"${duty}:${i}"` (e.g., `"SOF:2"`). Each entry holds `{ startTime, endTime, poc, pocSourceId }` for an in-progress empty triplet that has not yet been committed as a real event. `PendingTimeInput` components (in pending supervision triplet slots) write into this object via `onCommit` callbacks; `handlePocDrop` writes `poc` and `pocSourceId`. When both times are valid, `onCreateEvent` fires and the entry is deleted.

**Duty matching algorithm:**
```js
const key = SUPV_DUTY_ORDER.find(d => duty.toUpperCase() === d.toUpperCase())
    || SUPV_DUTY_ORDER.find(d => duty.toUpperCase().includes(d.toUpperCase()))
    || duty
    || 'Unnamed Duty';
```
First tries exact match (case-insensitive), then substring match, then falls back to the event's own `eventName` as the key (creating a dynamic row). If `eventName` is empty, falls back to `'Unnamed Duty'`.

Events within each duty group are sorted by `startTime` ascending.

**Row click handler:** Calls `onFocusEvent` to toggle focus on the row's first event. Excluded interactive elements: `BUTTON`, `INPUT`, `LABEL`, `SELECT` tag names, and `.wb-crew-chip`, `.wb-remove-btn`, `.wb-checkbox`, `.placeholder-chip`, `.wb-add-btn`, `.wb-delete-btn` closest-ancestor matches. If `rowEvId` is null (no events for duty), click is a no-op.

**Column group separators:** The `wb-supv-group-start` class is applied directly on the `<th>` and `<td>` elements at the start of each POC/Start/End triplet group. CSS at lines 1442–1453 uses `th.wb-supv-group-start` and `td.wb-supv-group-start` (element-qualified selectors) to add `border-left: 2px solid` and `padding-left: 10px` with `!important` to visually separate column groups. IMPORTANT: Do NOT use the descendant selector form `.wb-supv-group-start th` — that will never match because the class is on the th/td itself, not a parent wrapper.

**Custom event deletion:** The delete column (`<col style={{ width: 20 }}/>`) shows an `×` span only when any event in the duty group has `isCustom: true`. Only one custom event per duty row can exist — the delete removes `evts.find(ev => ev.isCustom)`.

---

## FOA/AUTH Duty Pucks

The whiteboard date header bar contains two named duty slots — FOA and AUTH — implemented as drag-and-drop "puck" holders.

**State:** `dutyState` — `{ foa: string[], auth: string[] }`. Initialized from `localStorage[DUTY_STORAGE_KEY][dayKey]` on mount and on every `activeDay` change.

**Persistence:** Every mutation (`addToDuty`, `removeFromDuty`, `moveBetweenDuty`) calls `saveDutyForDay(dayKey, next)` which writes the entire duty object to `localStorage` keyed by the active day string.

**`DutyPuckChip` (lines ~8135–~8160):**
- Renders with `chipColor(person, roster)` background
- Drag payload: `{ person, sourceDuty: slot, sourceEventId: null }`
- `×` button calls `removeFromDuty(slot, person)`

**`DutyDropZone` (lines ~8160–~8200):**
- Dashed border box, 22×18px, labeled `+`
- Accepts drops from any source (picker, another duty slot, event crew)
- If payload has `sourceDuty !== slot`, calls `moveBetweenDuty(data.sourceDuty, slot, person)` (removes from source, adds to target)
- Otherwise calls `addToDuty(slot, person)` (deduplication guard)

**`foaAuthBadges` useMemo:** Searches `workingEvents` for the active day. Finds an event whose `eventName` matches `/\bFOA\b/i` for FOA, and `/\bAUTH(?:ORIZATION|ORISATION|ORIZE|ORISED|ORIZED)?\b/i` for AUTH. These are display-only informational badges in the header, separate from the drag-drop duty puck system. The badges were designed to reflect API-seeded FOA/AUTH values from the supervision events data.

**Layout:** The date header row uses `display: flex` with the highlight button on the left, the date label absolutely centered (`pointer-events: none`), and `.wb-header-badges` at `margin-left: auto` on the right. The duty slots sit inside `.wb-header-badges`.

---

## Focus and Highlight System

### Row Focus/Dim (Event Focus Mode)

`focusedEventId` is owned by `SchedulerView` and threaded into `WhiteboardView` as a prop, then forwarded to each sub-table.

**CSS classes applied to `<tr>`:**

```js
const rowFocusClass = focusedEventId
    ? (ev.id === focusedEventId ? 'wb-row-focused' : 'wb-row-dimmed')
    : '';
```

Applied in combination with `wbRowClass(ev)` (status class), joined as:
```js
[wbRowClass(ev), rowFocusClass].filter(Boolean).join(' ') || undefined
```

**`wb-row-focused` CSS (lines ~1735–1748, verify with grep):**
- `border-top: 2px solid rgba(59,130,246,0.8) !important` — blue border top and bottom on all `td`
- `border-bottom: 2px solid rgba(59,130,246,0.8) !important`
- `border-left: 2px solid rgba(59,130,246,0.8) !important` — only on `:first-child td`
- `border-right: 2px solid rgba(59,130,246,0.8) !important` — only on `:last-child td`
- `position: relative; z-index: 2` — lifts row above siblings so borders are not clipped

**`wb-row-dimmed` CSS (lines ~1749–1751, verify with grep):**
- `opacity: 0.35`

**Supervision focus handling:** Uses the first event's ID as the representative for the row. If any event in the duty group matches `focusedEventId`, the whole row gets `wb-row-focused`; otherwise `wb-row-dimmed`.

### Row Click Handler (focus toggle)

All four section tables (Supervision, Flying, Ground, NA) use the same click guard pattern:

```js
onClick={(e) => {
    const tag = e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'LABEL' || tag === 'SELECT') return;
    if (e.target.closest('.wb-crew-chip') || e.target.closest('.wb-remove-btn') ||
        e.target.closest('.wb-checkbox') || e.target.closest('.placeholder-chip') ||
        e.target.closest('.wb-add-btn') || e.target.closest('.wb-delete-btn')) return;
    if (onFocusEvent) onFocusEvent(ev.id === focusedEventId ? null : ev.id);
}}
```

Toggle semantics: clicking the focused row's non-interactive area calls `onFocusEvent(null)` (deselect). Clicking an unfocused row selects it. `onFocusEvent` is `setFocusedEventId` in `SchedulerView`.

### Click-Outside Dismiss

`WhiteboardView` attaches an `onClick` handler to the `.whiteboard-area` container:

```js
onClick={(e) => {
    if (!focusedEventId) return;
    if (!e.target.closest('tr')) {
        onFocusEvent(null);
    }
}}
```

Clicking anywhere in the whiteboard area that is not inside a table row clears the focus.

### Row Status Highlights

`wbRowClass` (lines 6821–6826) returns a CSS class based on event status flags:

| Status | CSS class | Background color (dark) |
|---|---|---|
| `ev.effective` | `wb-row-effective` | `rgba(34,197,94,0.12)` (green tint) |
| `ev.partiallyEffective` | `wb-row-partial` | `rgba(234,179,8,0.12)` (yellow tint) |
| `ev.cancelled` | `wb-row-cancelled` | `rgba(239,68,68,0.12)` (red tint) |

**Hover override (lines ~1729–1732, verify with grep):** The base `.wb-table tr:hover td` rule sets a faint background. Status rows use `!important` to maintain their tinted color on hover (e.g., `rgba(34,197,94,0.18)` for effective rows). Without `!important` the hover rule would overwrite the status color.

### Cell Highlight System

**Mode:** `highlightMode` boolean state toggled by the `Highlight` button in the date header bar. When active, clicking any `WhiteboardCell` or `WhiteboardCrewCell` opens the `HighlightPicker` instead of editing.

**Picker (`HighlightPicker`, lines 6169–6190):**
- Rendered via `ReactDOM.createPortal` to `document.body` at `position: fixed`
- Positioned above-right of clicked cell using `getBoundingClientRect()`
- 7 color swatches from `WB_HIGHLIGHT_COLORS` + ERASE + ✕ close button
- Close (✕) also disables `highlightMode`

**Key format:** Highlights are keyed as `"${eventId}:${field}"` for `WhiteboardCell`, `"${eventId}:crew"` for `WhiteboardCrewGroup`, and `"${eventId}:crew:${slotIndex}"` for `WhiteboardCrewCell`.

**Persistence:** `highlights` state initialized via `loadHighlights()` which reads `HIGHLIGHT_STORAGE_KEY` from localStorage. Every change calls `saveHighlights(next)`. Cleared by `clearWorkingCopy()` on Refresh from Whiteboard.

**Picker scroll dismissal:** A scroll listener on `wbAreaRef` is attached only while `pickerTarget` is non-null. The picker closes only when scroll exceeds 400px from where it was opened (`pickerScrollTop` ref pattern).

**Picker click-outside dismissal:** A `pointerdown` listener on `document` closes the picker if the click target is not inside `.wb-picker-popup`.

---

## Drag-and-Drop Integration

### Crew chip drag (WhiteboardCrewGroup and WhiteboardCrewCell)

Drag payload format (`text/plain`, JSON):
```json
{
  "person": "Smith, J",
  "sourceEventId": "event-abc123",
  "category": "FTC-A"
}
```

`effectAllowed = 'copyMove'` is set on both `WhiteboardCrewGroup` chips and `WhiteboardCrewCell` span.

**MOVE semantics:**
- `WhiteboardCrewGroup.handleDrop`: if `sourceEventId && sourceEventId !== eventId`, calls `onRemove(sourceEventId, personName)` before `onAdd`
- `WhiteboardCrewCell.handleDrop`: same pattern; additionally removes the existing occupant if present
- `handlePocDrop` (in empty supervision triplets): if both times are already present → MOVE (`onRemove` from source) + immediate `onCreateEvent`. If times absent → stores `poc` + `pocSourceId` in `pendingSlots` (MOVE deferred until times are entered)
- Actual state mutations occur in `SchedulerView.handleAdd` / `handleRemove`, not in the whiteboard components

### Blank puck drag

From the `PersonnelPicker`, `BlankPuck` components set additional fields in the payload:
```json
{
  "person": "IP Placeholder",
  "isBlankPuck": true,
  "isDefaultLabel": true,
  "role": "IP",
  "category": "Staff IP"
}
```
`WhiteboardCrewGroup.handleDrop` detects `isBlankPuck` and routes to `onAddPlaceholder` instead of `onAdd`. `handlePocDrop` in empty supervision triplets explicitly returns early (`if (parsed.isBlankPuck) return`) — blank pucks are not accepted as POC for a new supervision event.

### Duty puck drag

`DutyPuckChip` sets `sourceDuty` in the payload; `DutyDropZone` detects it and calls `moveBetweenDuty` for cross-slot moves. Duty puck drags do not interact with event crew arrays — they are independent state.

---

## State Connections

```
SchedulerView
├── workingEvents (source of truth)  ──────→ WhiteboardView (prop)
├── focusedEventId                   ──────→ WhiteboardView (prop) → all sub-tables
├── wbActiveDay                      ──────→ WhiteboardView activeDay (prop)
├── handleAdd / handleRemove         ──────→ WhiteboardView onAdd / onRemove
├── handleEditSave                   ──────→ WhiteboardView onEditSave
├── handleStatusChange               ──────→ WhiteboardView onStatusChange
├── handleDeleteEvent                ──────→ WhiteboardView onDeleteEvent → setConfirmDelete
├── handleDeleteCustomEvent          ──────→ WhiteboardView onDeleteCustom
├── handleCreateEvent                ──────→ WhiteboardView onCreateEvent
├── handleAddPlaceholder             ──────→ WhiteboardView onAddPlaceholder
├── handleRemovePlaceholder          ──────→ WhiteboardView onRemovePlaceholder
├── handleFillPlaceholder            ──────→ WhiteboardView onFillPlaceholder
├── conflicts (useMemo)              ──────→ WhiteboardView → WhiteboardSupervision/Flying/Ground/NA → WhiteboardCrewCell/CrewGroup
├── showTooltip                      ──────→ WhiteboardView onShowTooltip → all 4 sub-tables → WhiteboardCrewCell/CrewGroup chips
└── hideTooltip                      ──────→ WhiteboardView onHideTooltip → all 4 sub-tables → WhiteboardCrewCell/CrewGroup chips

WhiteboardView (internal state)
├── highlights           { [key]: colorKey }    → localStorage HIGHLIGHT_STORAGE_KEY
├── highlightMode        boolean
├── pickerTarget         { key, rect } | null
├── pickerScrollTop      ref (scroll position when picker opened)
├── dutyState            { foa: string[], auth: string[] }  → localStorage DUTY_STORAGE_KEY[day]
├── wbAreaRef            ref to .whiteboard-area div
├── scrollPositions      ref { [day]: scrollTop }
└── dayEvents            useMemo → { Supervision[], Flying[], Ground[], Academics[], NA[] }

WhiteboardSupervision (internal state)
├── pendingSlots         { [slotKey]: { startTime, endTime, poc, pocSourceId } }
│                        keyed by "${duty}:${tripletIndex}"; holds in-progress empty-triplet data
│                        before all three fields are valid for event creation
└── pocDragOver          { [slotKey]: boolean }  — drag-over highlight state for pending POC cells
```

**`dayEvents` useMemo:** Filters `workingEvents` by `ev.date === activeDay`. Groups into `WB_SECTION_ORDER` sections plus `Academics`. Sorts each section:
- Flying: by `model` then `startTime`, blank-name events always last
- Ground: by `eventName` then `startTime`, blank-name events last
- NA: by `startTime`, blank-name events last

**Scroll position:** On `activeDay` change, saves `scrollTop` for the departing day and restores for the arriving day (defaults to 0 if no saved position).

---

## Cross-Compartment Dependencies

| Dependency | Direction | Notes |
|---|---|---|
| `workingEvents` | SchedulerView → Whiteboard | Read-only in whiteboard; mutations via callbacks |
| `focusedEventId` / `setFocusedEventId` | Shared | Timeline, Rainbow, and Whiteboard all read/set this; it coordinates event focus across views |
| `handleAdd` / `handleRemove` | SchedulerView → Whiteboard | Single source of truth for crew mutations; also feeds change tracking and undo |
| `handleEditSave` | SchedulerView → Whiteboard | Logs `event-edit` changes; triggers `saveWorkingCopy` via `useEffect` |
| `handleStatusChange` | SchedulerView → Whiteboard | Mutual exclusivity logic lives in SchedulerView; Whiteboard only passes field name |
| `CUSTOM_EVENTS_KEY` | Shared | Custom events persist to `tps-scheduler-custom-events`; used by Timeline create-event flow and Whiteboard `handleCreateEvent` |
| `PersonnelPicker` | Shared | Picker panel visible when `viewMode === 'timeline'` OR `'whiteboard'` |
| `chipColor()` / `personCat()` | Shared utilities | Used by `WhiteboardCrewGroup`, `WhiteboardCrewCell`, `DutyPuckChip` for roster-based coloring |
| `conflicts` | SchedulerView → Whiteboard → all 4 sub-tables → WhiteboardCrewGroup / WhiteboardCrewCell | Threaded in v4.0.1 (T3). Crew chips now show amber `chip-conflict` outline + `!` icon + portal tooltip when a person has a conflict. `onShowTooltip`/`onHideTooltip` also threaded down the same chain. |
| `SECTION_ORDER` vs `WB_SECTION_ORDER` | Distinct | `SECTION_ORDER` (line ~2484) is for the Timeline/Selection screen; `WB_SECTION_ORDER` (line 2688) includes Supervision and is used exclusively by Whiteboard |
| `clearWorkingCopy()` | Shared | On "Refresh from Whiteboard", also clears `tps-scheduler-highlights` (HIGHLIGHT_STORAGE_KEY, line 4062) |
| `initialized` ref | SchedulerView | `handleAdd` / `handleRemove` etc. check `initialized.current` before recording changes; Whiteboard never touches this ref directly |

---

## Bug History and Known Issues

### Fixed Bugs (from feedback.txt and version-history.md)

**v4.0 (Whiteboard-addition branch):**
- FOA/AUTH not updating from Whiteboard 2.0: `foaAuthBadges` now uses regex search of `workingEvents` to display time ranges and names from supervision events. The duty puck system is independent localStorage state.
- Supervision column groups needing visual separation: `wb-supv-group-start` with `border-left: 2px solid !important` added on POC columns and Notes column (lines 1443–1451).
- `"Other (As Req'd)"` row was not editable/addable: `+ Add Supervision Event` button creates custom events that fall into this row.

### Known Issues (from whiteboard-v4.0-qa-report.md, 2026-02-28)

**Issue #1 — Academics read-only has no visual indicator (LOW priority)**
`WhiteboardAcademics` rows are not editable but have no greyed styling or "readonly" badge. Users clicking them get no feedback. Suggested fix: add `opacity: 0.6` or `cursor: not-allowed` to Academics rows.

**Issue #2 — Whiteboard delete has no confirmation modal (MEDIUM priority)**
Flying/Ground/NA delete buttons (`.wb-delete-btn`) call `onDeleteEvent(ev)` directly, which in `SchedulerView` is wired to `(ev) => setConfirmDelete(ev)` (line 8165). The `ConfirmDelete` modal *does* fire — this is not a bug as currently wired. However, the QA report noted that `onDeleteEvent` was previously mapped differently; verify current wiring is correct.

**Issue #3 — Silent failure when dropping duplicate onto occupied crew (LOW priority)**
If a person is already in `ev.personnel`, `handleAdd` returns early (`target.personnel.includes(person)`). No visual feedback is given to the user. The drag appears to succeed but nothing changes.

**Gap #1 — Light mode styling (MEDIUM, untested)**
~45 CSS overrides under `.light-mode .wb-*` exist (lines 2299–2358) but have not been visually QA'd in the browser.

**Gap #2 — Supervision column separator [FIXED in v4.0.1]**
Root cause was a wrong CSS selector: `.wb-supv-group-start th` uses descendant syntax but the class is applied directly on `<th>`/`<td>` elements. Fixed by changing to `th.wb-supv-group-start` / `td.wb-supv-group-start`. Also added `padding-left: 10px !important` (gap-first approach per user request), increased border opacity to 0.22, and added `!important` to padding to beat the compact table override. Light-mode rule also updated to match.

**Gap #3 — `"Other (As Req'd)"` row removal [FIXED in v4.0.1 T6]**
User feedback (line 211): "Remove Other (As Req'd). ... when adding a new supervision line it will create a new line with the supervision title." Fixed: removed from `SUPV_DUTY_ORDER` (line 2401). The `byDuty` fallback now uses the event's own `eventName` as the row key, so custom duty names (entered via `window.prompt`) create their own dynamic rows at the bottom of the supervision table.

**Gap #4 — Supervision event creation requires time entry**
User feedback (line 215): "There is no way to add/edit a new supervision column group ... if a supervision event is created on the timeline view, it will show as a new line in Whiteboard." This was partially addressed in v4.1.0 T7 — empty supervision triplets now show time input fields and a droppable POC cell. Time entry combined with a POC drop (`handlePocDrop`) now triggers event creation inline, without a button.

**v4.2.0 T8 — SegmentedTimeInput [REVERTED]**
T8 implemented `SegmentedTimeInput` (two HH/MM input segments with digit-accumulation buffers) to replace `MilitaryTimeInput` in modals and `PendingTimeInput` in whiteboard pending slots. It was reverted because `onChange` fired on each valid digit, triggering list re-render and re-sorting, causing the user to lose their scroll position mid-edit. The revert restored `MilitaryTimeInput` in `CreateEventModal`/`EditEventModal` and `PendingTimeInput` in whiteboard pending supervision triplets. `WhiteboardCell` type=time reverted to the standard `<input className="wb-input">` path (same as text cells). Time entry UX remains a backlog item.

---

## Change Impact Checklist

When modifying any part of the Whiteboard compartment, check the following:

### Modifying `WhiteboardView` (lines 7810–~8200)

- [ ] Does `dayEvents` useMemo still correctly filter by `activeDay` and group by `WB_SECTION_ORDER`?
- [ ] Are all four section tables still receiving `focusedEventId`, `highlights`, `highlightMode`, `onHighlight`, `activeDay`?
- [ ] Does `handleCreateWbEvent` still build a complete event object with all required fields (`id`, `section`, `date`, `model`, `eventName`, `startTime`, `endTime`, `etd`, `eta`, `personnel`, `originalPersonnel`, `placeholders`, `notes`, `readonly`, `isCustom`, `cancelled`, `effective`, `partiallyEffective`)?
- [ ] Is the click-outside-dismiss on `.whiteboard-area` still guarded by `e.target.closest('tr')`?
- [ ] Is the picker scroll threshold still 400px (`pickerScrollTop` ref pattern)?
- [ ] Does the duty state reload on `activeDay` change (the `useEffect` near the `DUTY_STORAGE_KEY` constant)?

### Modifying `WhiteboardSupervision` (lines 7349–~7760)

- [ ] Is `SUPV_DUTY_ORDER` still the source of truth for the fixed row order?
- [ ] Does `byDuty` useMemo correctly handle events whose `eventName` does not match any duty string (falls back to the event's own `eventName` as a dynamic row key, or `'Unnamed Duty'` if empty)?
- [ ] Do dynamic rows (keys not in `SUPV_DUTY_ORDER`) appear after all fixed rows, in insertion order?
- [ ] Is `maxTriplets = 4` sufficient for all real-world schedules?
- [ ] Does the delete button only appear for custom events (`ev.isCustom`)?
- [ ] Is `wb-supv-group-start` applied to the POC `<td>` (via `className` prop on `WhiteboardCrewCell`) and to the Notes `<td>` (via `className` prop on `WhiteboardCell`)?
- [ ] Does the `+ Add Supervision Event` button receive `activeDay` correctly?
- [ ] Does `pendingSlots` reset properly when `activeDay` changes? (Parent `WhiteboardSupervision` should clear `pendingSlots` on day change or pass empty slot objects.)
- [ ] Does `handlePocDrop` correctly reject `isBlankPuck` payloads with an early return?
- [ ] When both times are already valid in the pending slot and a POC is dropped, does `onCreateEvent` fire immediately and is the `pendingSlots` entry deleted?
- [ ] When a POC is dropped but times are absent, is `pocSourceId` stored in `pendingSlots` (not immediately removed from source event)?

### Modifying `WhiteboardCell` (lines 6644–6742)

- [ ] Is the `React.forwardRef` wrapper preserved (required for tab navigation)?
- [ ] Does `commit()` still validate time fields with `TIME_RE` before calling `onSave`?
- [ ] Is Tab/Shift+Tab still intercepted in `handleKeyDown`?
- [ ] Does `highlightMode` still take precedence over editing?
- [ ] Is `readonly` still checked before `setEditing(true)`?

### Modifying `WhiteboardCrewGroup` (lines 7064–~7298)

- [ ] Does the drop handler still distinguish blank puck drags (`isBlankPuck`) from regular person drags?
- [ ] Is MOVE semantics (remove from source before adding to target) preserved?
- [ ] Are placeholder chips excluded from duplicate crew chip rendering (`filledBySet`)?
- [ ] Does `onFillPlaceholder` get called when a person fills a placeholder slot?
- [ ] Does the add-placeholder menu close on outside click (the `pointerdown` document listener)?

### Modifying `PlaceholderChip` (lines 6854–~7060)

- [ ] Does `canFillPlaceholder(role, cat)` correctly determine compatibility?
- [ ] Is `e.stopPropagation()` called in `handleDrop` to prevent the parent `WhiteboardCrewGroup` from also processing the drop?
- [ ] Does the incompatibility warning list compatible sibling placeholders (`compatSiblings`)?
- [ ] Is the rename flow (click-to-edit input) guarded by `RENAMEABLE_PH_ROLES.has(role)`?

### Modifying the Focus/Highlight System

- [ ] Does `wb-row-focused` use `!important` on all four border directions?
- [ ] Is `wb-row-focused` applied via combined class string with `wbRowClass(ev)`?
- [ ] Does `wb-row-effective:hover td` use `!important` to preserve the green tint over `wb-table tr:hover td`? Same for partial and cancelled.
- [ ] Are highlights saved to `HIGHLIGHT_STORAGE_KEY` on every change?
- [ ] Is `HIGHLIGHT_STORAGE_KEY` cleared in `clearWorkingCopy()`?

### Modifying FOA/AUTH Duty Pucks

- [ ] Is `DUTY_STORAGE_KEY` keyed per day (the `dutyDayKey = String(activeDay ?? '')` pattern)?
- [ ] Do `addToDuty` and `removeFromDuty` call `saveDutyForDay` immediately?
- [ ] Does `moveBetweenDuty` atomically update both slots and save?
- [ ] Does the `DutyDropZone` detect `sourceDuty` in the payload to route to `moveBetweenDuty` vs `addToDuty`?

### Adding a New Section to the Whiteboard

1. Add the section name to `WB_SECTION_ORDER` (line 2688)
2. Create a new `Whiteboard{Section}` component following the same pattern as `WhiteboardFlying`
3. Add the section's render branch inside `WhiteboardView`'s `WB_SECTION_ORDER.map(sec => ...)` (grep for `WB_SECTION_ORDER.map` to find current line)
4. Pass all required props: `events`, `roster`, `conflicts`, `onEditSave`, `onStatusChange`, `onAdd`, `onRemove`, `onDeleteEvent`, `onDeleteCustom`, `onCreateEvent`, `onFocusEvent`, `focusedEventId`, `onAddPlaceholder`, `onRemovePlaceholder`, `onFillPlaceholder`, `highlights`, `highlightMode`, `onHighlight`, `activeDay`
5. Add a section to `SECTION_ORDER` (grep for `SECTION_ORDER` near `WB_SECTION_ORDER`) if the new section should also appear in the Timeline picker

### Changing Status Flag Behavior

- `handleStatusChange` in `SchedulerView` enforces mutual exclusivity: setting one of `effective`, `partiallyEffective`, `cancelled` forces the other two to false.
- `wbRowClass` (lines 6821–6826) checks them in order: `effective` wins over `partiallyEffective` wins over `cancelled`. If mutual exclusivity is removed, the order of checks in `wbRowClass` determines which color is shown.
- The `before` snapshot in the change log captures all three flags; `handleUndoGroup` restores all three.
