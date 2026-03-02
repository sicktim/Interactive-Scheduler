# Personnel Picker Compartment

## Purpose

The Personnel Picker is a fixed panel at the bottom of the Timeline and Whiteboard views that provides a roster-sourced drag source for scheduling personnel onto events. It shows every person in the loaded roster, categorized and filterable, with real-time visual state for three distinct conditions: assigned to any event (amber dot), conflicted with another event (amber outline pulse), and unavailable during the focused event's time window (greyed out). Pucks are dragged directly onto event cards to add personnel. It also hosts BlankPuck placeholders — typed drag sources that create unfilled or pre-named placeholder slots on event cards.

---

## Owner Boundaries

The picker compartment owns:

- The `PersonnelPicker` component and all internal state it holds (`activeTabs`, `search`)
- The `PersonnelChip` component in both its picker and event-card incarnations
- The `BlankPuck` component (placeholder drag source)
- The CSS classes: `.picker-panel`, `.picker-tabs`, `.picker-tab`, `.picker-body`, `.picker-chip`, `.picker-search`, `.blank-puck`, `.blank-puck-divider`, `.blank-puck-input`, `.chip`, `.chip-conflict`, `.chip-remove`, `.chip-placeholder`, `.conflict-icon`, `.picker-chip.busy`, `.picker-chip.unavailable`
- The constants: `BLANK_PUCK_DEFS`, `CATEGORY_COLORS`, `DEFAULT_CHIP`, `GENERIC_PUCK_COLOR`, `PLACEHOLDER_FILL_RULES`, `PLACEHOLDER_ROLE_OPTIONS`, `RENAMEABLE_PH_ROLES`
- The helper functions: `chipColor()`, `personCat()`, `canFillPlaceholder()`, `getPlaceholderRoleColor()`, `makePlaceholder()`
- The chip measurement constants used by the lane height estimator (`CHIP_FONT_SIZE_REM`, `CHIP_HPAD`, etc.)
- The `personConflictSummary` memo inside `PersonnelPicker`
- The tooltip portal display logic (`showTooltip`/`hideTooltip` callbacks in `SchedulerView`, viewport detection)

The picker compartment does NOT own:

- `focusedAvailability` — computed in `SchedulerView` (line 7728), passed in as a prop
- `detectConflicts()` / `getConflictText()` — owned by the Conflict Engine compartment; picker consumes results only
- `handleAdd` / `handleRemove` — owned by the Event State compartment; invoked on drop
- `handleAddPlaceholder` / `handleFillPlaceholder` / `handleRemovePlaceholder` — owned by the Placeholder compartment; invoked on drop

---

## Key Components & Line References

### PersonnelChip (line 4276)

```js
const PersonnelChip = ({ name, roster, conflictText, onRemove, eventId, inPicker,
    isBusy, isUnavailable, colorOverride, onDragStart: onDS, onDragEnd: onDE,
    onShowTooltip, onHideTooltip })
```

Used in two contexts:
1. Inside `PersonnelPicker` — `inPicker=true`, no `onRemove`, no `eventId`
2. Inside `EventCard` crew area — `inPicker` omitted, `onRemove` provided, `eventId` set

**Color resolution (line 4277):** `colorOverride || chipColor(name, roster)`. The `colorOverride` path is used when a person is filling a placeholder slot; the chip takes the placeholder's role color rather than the person's roster category color.

**Drag payload (lines 4280-4281):**
```json
{ "person": "<name>", "sourceEventId": "<eventId or null>" }
```
`effectAllowed = 'copyMove'` — allows both copy (from picker, no source) and move (from event card, has source).

**Opacity feedback (lines 4282, 4287):** Chip opacity drops to 0.4 during drag, restored to 1.0 on dragend. This is a direct DOM mutation on `e.currentTarget`, not React state, for performance.

**Tooltip trigger (lines 4293-4297):** `onMouseEnter` fires `onShowTooltip` only when either `hasCon` or `isUnavailable` is true. The text differs:
- Conflict chip (not unavailable): `"Also on:\n" + conflictText`
- Unavailable chip (focus mode): `conflictText` verbatim (already prefixed with "Assigned:" or "Busy:")

**Class composition (line 4302):**
```
chip
  [chip-conflict]   — if hasCon && !isUnavailable
  [picker-chip]     — if inPicker
  [busy]            — if isBusy
  [unavailable]     — if isUnavailable
```
Note: `chip-conflict` is suppressed on `isUnavailable` chips — the unavailable greyed-out state overrides the conflict amber outline visually.

**`title` attribute (line 4309):** Set to the person's name only when there is no `conflictText`. When a conflict exists, `title` is explicitly `undefined` to prevent the native browser tooltip from doubling the portal tooltip text.

**X-button (line 4313):** Calls `onHideTooltip()` before `onRemove(name)` to clear any open portal tooltip before the chip is unmounted. Without this ordering, the tooltip div would remain on screen after the chip disappears (bug fixed in v3.5).

---

### PersonnelPicker (line 4793)

```js
const PersonnelPicker = ({ roster, allEvents, conflicts, onDS, onDE,
    onShowTooltip, onHideTooltip, focusedAvailability })
```

**Internal state:**
- `activeTabs` — `useState(new Set(['All']))` (line 4794). Multi-select Set of active roster category filters.
- `search` — `useState('')` (line 4795). Text search string.

**`toggleTab` logic (lines 4799-4814):**
- Clicking "All" always resets to `new Set(['All'])`.
- Clicking a specific category removes "All" from the set and adds/toggles that category.
- If after toggling the set is empty, it reverts to `new Set(['All'])`.
- If after toggling all categories are selected, it also reverts to `new Set(['All'])`.

**`busySet` memo (lines 4816-4820):** Iterates `allEvents` (which is `workingEvents` from `SchedulerView`) to build a `Set<string>` of every person currently assigned to any event. This drives the amber dot indicator. Does not consult `conflicts`.

**`personConflictSummary` memo (lines 4822-4852):** Inverts the `conflicts` Map (which is `Map<eventId, Map<personName, ConflictEntry[]>>`) into a `Map<personName, formattedString>`. Groups entries by date with `fmtDate()` headers. Used as `conflictText` for non-focused, non-unavailable chips. Example output:
```
Mon 3 Mar:
  T-38 CF-1 (08:00-10:00)
  T-38 CF-2 (09:00-11:00)
```

**`people` memo (lines 4854-4869):** Flattens roster entries into `[{ name, category }]` arrays filtered by `activeTabs`, then filtered again by `search`. Drives the chip render list.

**Chip render loop (lines 4907-4927):** For each person:
1. Checks `focusedAvailability.has(p.name)` to determine `isUnavailable`.
2. If unavailable, builds `unavailText` from the availability map using "Assigned:" / "Busy:" prefixes.
3. Passes `conflictText`: if unavailable, passes `unavailText`; otherwise passes `personConflictSummary.get(p.name) || null`.
4. Always passes `isBusy={busySet.has(p.name)}`.

**Header layout (lines 4872-4904):** Left to right:
1. "Picker" label (`.text-gray-600.uppercase`)
2. Category tab strip (`.picker-tabs`)
3. Divider (`blank-puck-divider`)
4. "Placeholder & Custom Pucks" label (`.pp-section-label`)
5. BlankPuck chips mapped from `BLANK_PUCK_DEFS`
6. Divider
7. Assigned legend: amber dot + "assigned" text (lines 4900-4902)
8. Search input (`.picker-search`)

**Visibility (line 8142-8144):** The picker panel is hidden (via parent `display:none`) when `viewMode` is `'rainbow'`. It is visible for both `'timeline'` and `'whiteboard'` modes.

---

### BlankPuck (line 4727)

```js
const BlankPuck = ({ def })
```

where `def` comes from `BLANK_PUCK_DEFS` (line 2441):

```js
const BLANK_PUCK_DEFS = [
    { id: 'blank-ip',      label: 'IP',        cat: 'Staff IP',        role: 'IP',        canRename: true  },
    { id: 'blank-ifte',    label: 'IFTE/ICSO', cat: 'Staff IFTE/ICSO', role: 'IFTE/ICSO', canRename: true  },
    { id: 'blank-ftca',    label: 'FTC-A',     cat: 'FTC-A',           role: 'FTC-A',     canRename: false },
    { id: 'blank-ftcb',    label: 'FTC-B',     cat: 'FTC-B',           role: 'FTC-B',     canRename: false },
    { id: 'blank-stca',    label: 'STC-A',     cat: 'STC-A',           role: 'STC-A',     canRename: false },
    { id: 'blank-stcb',    label: 'STC-B',     cat: 'STC-B',           role: 'STC-B',     canRename: false },
    { id: 'blank-generic', label: 'Generic',   cat: null,              role: 'Generic',   canRename: true  },
];
```

**Internal state:** `customName` (string) and `editing` (boolean). When `canRename=true`, clicking the puck opens an inline input that sets `customName`.

**Color (line 4732):** Uses `CATEGORY_COLORS[def.cat]` if `def.cat` is set; falls back to `GENERIC_PUCK_COLOR` (`{ bg: '#f8fafc', text: '#1e293b' }`) for the Generic puck.

**Drag payload (lines 4738-4748):**
```json
{
    "person": "<customName or def.label>",
    "isBlankPuck": true,
    "category": "<def.cat>",
    "role": "<def.role>",
    "isDefaultLabel": <true if customName is empty>
}
```
`effectAllowed = 'copy'` (not `copyMove`) — blank pucks are always copy operations; they have no source event.

**Post-drag reset (line 4754):** `customName` is reset to `''` after dragend. The puck reverts to its default label, preventing stale names from persisting.

**`canRename` behaviour:** IP, IFTE/ICSO, and Generic pucks can be named before dragging (a person name can be typed in). The student-category pucks (FTC-A/B, STC-A/B) cannot be renamed — the role label is the intent.

---

## Focus Mode Integration

**`focusedAvailability` memo (lines 7728-7757)** lives in `SchedulerView`. It is `null` unless `focusedEventId` is set and `focusEnabled` is `true`.

When active, the memo walks `workingEvents` and produces `Map<personName, ConflictEntry[]>`:

1. **Assigned people** (line 7739-7742): Everyone already on the focused event is added with `{ assigned: true, ...focused event fields }`. This was added in v3.4 — previously, personnel already on the focused event were not greyed out, which was confusing.

2. **Overlapping people** (lines 7744-7755): All other events on the same date whose time window overlaps the focused event's window contribute their personnel. The overlap check uses `evStart(ev) < evEnd(fev) && evEnd(ev) > evStart(fev)`. The entry does NOT have `assigned: true`.

The memo runs against `workingEvents` — which includes readonly Supervision and Academics events. This is intentional (user requirement): focus mode must check ALL events, not just editable ones.

**Prop threading:** `SchedulerView` (line 8143) passes `focusedAvailability` directly to `PersonnelPicker`. It is NOT passed through `DayColumn` or `EventCard`.

**Consumer in PersonnelPicker (lines 4908-4911):**
```js
const isUnavailable = focusedAvailability && focusedAvailability.has(p.name);
const unavailText = isUnavailable
    ? focusedAvailability.get(p.name).map(c =>
        `${c.assigned ? 'Assigned: ' : 'Busy: '}${c.model ? c.model + ' ' : ''}${c.eventName} (${c.startTime}-${c.endTime || '??'})`
      ).join('\n')
    : null;
```

**CSS effect on unavailable chips (lines 430-433):**
```css
.picker-chip.unavailable {
    opacity: 0.3;
    filter: grayscale(0.8);
}
```

**Clearing focus mode:**
- Click outside any event card on the timeline area (line 8116 — `onClick` on `.timeline-area`): `setFocusedEventId(null)`
- Press Escape (lines 7762-7766): global keydown listener
- Switch to rainbow view (line 7760): `useEffect` clears focus when `viewMode === 'rainbow'`
- Click another event card: calls `onFocusEvent(event.id)` which replaces the current focus

---

## Conflict Display Logic

### Detection pipeline

`detectConflicts(allEvents)` (line 2967) runs as a `useMemo` on `workingEvents` (line 7725). It:
1. Groups events by `person||date` key
2. For each group with 2+ events, runs all pairwise overlap checks
3. Skips `ev.cancelled` events (line 2971) and Supervision-vs-Supervision pairs (line 2987)
4. Uses an inner `addConflict` helper that deduplicates by `eventName+startTime+endTime`
5. Returns `Map<eventId, Map<personName, ConflictEntry[]>>`

### Picker-side conflict display

`personConflictSummary` (lines 4822-4852) inverts the `conflicts` map into a per-person string. It is used as the `conflictText` prop for chips that are NOT in unavailable (focus) mode.

### Chip-level conflict display

**On event cards:** `getConflictText(event.id, person, conflicts)` (line 3022) returns formatted multi-line text grouped by date. Passed as `conflictText` to `PersonnelChip`. The chip renders:
- `chip-conflict` class: amber (#fbbf24) 2px outline + `0 0 6px rgba(251,191,36,0.5)` glow, animated with `conflict-pulse` (2s ease-in-out, lines 375-385)
- A `!` icon span (`.conflict-icon`, line 4312) in amber (#fbbf24, 0.55rem bold)
- On hover: tooltip with `"Also on:\n" + conflictText`

**In the picker:** Same chip receives `conflictText` from `personConflictSummary`. Classes applied:
- `chip-conflict` for the amber outline
- `picker-chip` for grab cursor
- `busy` for the amber dot (independently triggered by `busySet`)

A person can simultaneously have all three states active: they can be assigned to an event (amber dot), have a conflict with another event on that same day (amber outline), and when focus mode is on, appear greyed out (if the focused event's window overlaps any of their events).

**Tooltip prefix distinction:**
- Non-focus conflict: `"Also on:\n<conflictText>"` (line 4296)
- Focus mode unavailable: no "Also on:" prefix; text starts directly with "Assigned:" or "Busy:" (line 4910)

This distinction is important: "Also on:" makes sense when the viewer is looking at a chip already on an event (it has conflicts elsewhere). In the picker, focus mode tooltip is always "what prevents this person from joining the focused event."

---

## Drag Protocol

### From picker chips (PersonnelChip, `inPicker=true`)

**Payload:**
```json
{ "person": "<name>", "sourceEventId": null }
```
`effectAllowed = 'copyMove'`

Since `eventId` is not passed to picker chips (line 4913-4925 in PersonnelPicker render — no `eventId` prop), `sourceEventId` is always `null`. On drop, when `sourceId` is null, no remove step is performed — the person is only added to the target event.

### From event card chips (PersonnelChip, `inPicker` omitted)

**Payload:**
```json
{ "person": "<name>", "sourceEventId": "<eventId>" }
```
`effectAllowed = 'copyMove'`

On drop to a different event, `handleAdd` (line 7781) sees `sourceId` is set and removes the person from the source event (move semantics), then adds them to the target.

### From BlankPuck

**Payload:**
```json
{
    "person": "<customName or def.label>",
    "isBlankPuck": true,
    "category": "<def.cat or null>",
    "role": "<def.role>",
    "isDefaultLabel": <bool>
}
```
`effectAllowed = 'copy'`

**Drop routing in EventCard.handleDrop (lines 4375-4384):**
- `isBlankPuck && isDefaultLabel && role` → calls `onAddPlaceholder(event.id, role)` — creates an unfilled placeholder slot
- `isBlankPuck && !isDefaultLabel && role` → calls `onAddPlaceholder(event.id, role, personName)` — creates a filled placeholder (name already set)

### Drop target: EventCard

`handleDragOver` (line 4358): sets `dropEffect = 'copy'` and `dragOver` state. Guard: `if (event.readonly) return` — supervisor and NA events reject drops.

`handleDrop` (lines 4365-4404): parses JSON payload, routes by `isBlankPuck` flag, then checks `!event.personnel.includes(personName)` to prevent duplicate adds. After a successful add, checks for matching unfilled placeholders via `canFillPlaceholder()` and queues a `pendingFill` prompt if matches exist.

### onDS / onDE callbacks

These are `handleDragStart` / `handleDragEnd` passed from `SchedulerView` through `DayColumn` → `EventCard` → `PersonnelChip` and also directly to `PersonnelPicker` → `PersonnelChip`. Currently their implementation in `SchedulerView` is not visible in the searched lines — they are threading callbacks but the primary drag state is managed locally in the chip's DOM mutation (opacity).

---

## State Connections

| State / Prop | Source | Updated By | Consumer |
|---|---|---|---|
| `activeTabs` | `PersonnelPicker` local `useState` | `toggleTab()` | `people` memo filter |
| `search` | `PersonnelPicker` local `useState` | input `onChange` | `people` memo filter |
| `busySet` | `PersonnelPicker` `useMemo` | derived from `allEvents` prop | `isBusy` prop on chips |
| `personConflictSummary` | `PersonnelPicker` `useMemo` | derived from `conflicts` prop | `conflictText` on non-focus chips |
| `focusedAvailability` | `SchedulerView` `useMemo` (line 7728) | derived from `focusedEventId`, `workingEvents` | `isUnavailable` + `unavailText` in picker |
| `focusedEventId` | `SchedulerView` `useState` (line 7547) | event card clicks, Escape, view switch | input to `focusedAvailability` memo |
| `focusEnabled` | `SchedulerView` `useState` (line 7548) | Focus ON/OFF toggle button | gates `focusedAvailability` |
| `tooltip` | `SchedulerView` `useState` | `showTooltip()` / `hideTooltip()` callbacks | `.conflict-tooltip-portal` div (line 8237) |
| `conflicts` | `SchedulerView` `useMemo` (line 7725) | `detectConflicts(workingEvents)` | picker `personConflictSummary` + chip `conflictText` |
| `workingEvents` | `SchedulerView` `useState` | `handleAdd`, `handleRemove`, etc. | picker `allEvents` prop → `busySet` |
| `roster` | `SchedulerView` state (from API) | load only | `cats`, `chipColor`, `personCat` |
| `customName` | `BlankPuck` local `useState` | inline input | drag payload `person` field |
| `editing` | `BlankPuck` local `useState` | span click / blur / Enter | shows input vs label |

---

## Cross-Compartment Dependencies

**Conflict Engine:**
- `detectConflicts()` (line 2967) produces the `conflicts` Map consumed by picker.
- `getConflictText()` (line 3022) formats conflict text for event-card chips.
- `eventConflictCount()` (line 3051) drives the conflict badge on event cards.
- Changes to conflict detection logic (exclusions, dedup, Supervision skip) directly affect what amber outlines appear on picker chips.

**Event State / SchedulerView:**
- `workingEvents` drives `busySet` — any add/remove to any event immediately updates which chips show amber dots.
- `handleAdd(targetId, person, sourceId)` is invoked on drop from picker or event-card chips.
- `handleRemove(eventId, person)` is invoked by the chip X-button.
- `focusedAvailability` is computed in SchedulerView and passed as prop; picker has no input into this computation.

**Placeholder Compartment:**
- `handleAddPlaceholder`, `handleFillPlaceholder`, `handleRemovePlaceholder` — invoked from `EventCard.handleDrop` and `EventCard` crew render.
- `canFillPlaceholder(role, personCatName)` — used in drop handlers to determine if a dragged person matches an unfilled placeholder slot.
- `PLACEHOLDER_FILL_RULES`, `PLACEHOLDER_ROLE_OPTIONS`, `BLANK_PUCK_DEFS`, `RENAMEABLE_PH_ROLES` — all defined in the picker constants block but directly support placeholder mechanics.
- `PlaceholderChip` (line ~6090) is a separate component rendered inside event card crew areas for unfilled slots; it re-uses `chipColor` and `personCat`.

**Tooltip Portal:**
- Tooltip state (`tooltip`, `showTooltip`, `hideTooltip`) is owned by `SchedulerView`.
- Viewport detection (`showAbove` at line 7558): `spaceBelow = window.innerHeight - rect.bottom; showAbove = spaceBelow < 80`. Threshold is 80px.
- Render (lines 8237-8244): `position:fixed` div at app root, `z-index:9999`. Transform switches between `translate(-50%, -100%)` (above) and `translateX(-50%)` (below) based on `tooltip.above` flag.
- The picker chip's `onMouseLeave` wires to `hideTooltip` directly; X-button calls `hideTooltip` before `onRemove`.

**Light Mode:**
- `.light-mode .picker-panel` (line 1906): white background override.
- `.light-mode .picker-tab` (line 2011): dark text tabs.
- `.light-mode .picker-tab.active` (line 2015): `#2563eb` blue.
- `.light-mode .picker-search` (line 2016): light grey input.
- `.light-mode .blank-puck` (line 2023): dark dashed border.
- `.light-mode .pp-section-label` (line 2024): dark text.
- Chip colors (amber dot, amber conflict outline) are unchanged — they are inline styles / fixed CSS values that work on both themes.

**Lane Height Estimator:**
- Constants at lines 3190-3201 (`CHIP_FONT_SIZE_REM`, `CHIP_HPAD`, `CHIP_REMOVE_FSIZE`, `CHIP_CONFLICT_FSIZE`, `CHIP_ROW_H`, etc.) must stay synchronized with CSS in the chip block.
- `estimateHeight()` uses these to predict how many chip rows will appear in a card, determining lane slot height.

---

## Bug History & Known Issues

### Fixed Bugs

**v1.0: Cannot drag from picker to events**
Picker drag did not work because `effectAllowed` was not set and drop handlers rejected the payload. Fixed in v2.0 with `effectAllowed: 'copyMove'` and proper drop handlers on crew areas.

**v2.0 / v3.0: Conflict tooltip not visible (top row)**
Chips with conflicts near the top of the screen showed a native `title` tooltip that was obscured by the browser chrome or other elements. Fixed in v3.0 by switching to a portal tooltip (`position:fixed`, `z-index:9999`) that escapes all stacking contexts.

**v3.1: Conflict outline invisible on orange chips**
The original red conflict outline (`border: 2px solid red`) was invisible against `FTC-B` (orange) and `STC-B` (orange) chip backgrounds. Changed to amber/yellow `#fbbf24` with glow, which is universally visible. (feedback.txt line 30, version-history.md v3.1)

**v3.1: Duplicate tooltip on conflict badge hover**
The conflict badge (`!` circle on event card) had a native `title` attribute duplicating the portal tooltip. Both showed simultaneously. Fixed by removing `title` from the badge and all chips when conflict text is present. (feedback.txt line 30)

**v3.2: Picker conflict chips showing generic "Has time conflict" text**
Picker chips hovered during a conflict showed `"CONFLICT: Also on Has time conflict."` — generic placeholder text instead of real event details. Fixed by building `personConflictSummary` from the detailed `conflicts` Map. (feedback.txt line 33)

**v3.2: "Assigned" legend meaning unclear**
Users reported not knowing what the orange dots in the upper-right corner of picker chips meant. Fixed by adding the amber dot + "assigned" legend in the picker header row. (feedback.txt line 33)

**v3.2: Conflict tooltip not threaded to picker chips**
`onShowTooltip`/`onHideTooltip` callbacks were not passed from `SchedulerView` through `PersonnelPicker` to `PersonnelChip`. Hovering a conflicted picker chip did nothing. Fixed in v3.3 by threading the callbacks. (version-history.md v3.3)

**v3.3: Picker tooltip clipped at viewport bottom**
When chips near the bottom of the picker panel were hovered, the tooltip rendered below the chip but was cut off by the viewport edge. Fixed in v3.4: `showTooltip` detects if `spaceBelow < 80px` and sets `showAbove = true`, causing the tooltip to render above using `translate(-50%, -100%)`. (feedback.txt line 155, version-history.md v3.4)

**v3.4: Assigned personnel not greyed out in focus mode**
When Event Focus Mode was active, people already assigned to the focused event still appeared fully opaque in the picker, implying they were available to drag in. Fixed in v3.4 by including the focused event's own personnel in `focusedAvailability` with `{ assigned: true }`. (feedback.txt line 156, version-history.md v3.4)

**v3.5: Tooltip artifact after X-button delete**
Hovering a conflicted picker chip, then clicking X to remove them from an event, left the tooltip `div` on screen because the chip was unmounted while the tooltip state was still set. Fixed by calling `onHideTooltip()` inside the X-button `onClick` before calling `onRemove(name)`. (feedback.txt line 168, version-history.md v3.5)

### Known Issues / Watch Items

**Multi-select tab reverts to All unexpectedly:** If the user manually selects every individual roster category one by one, `toggleTab` detects `cats.every(c => next.has(c))` and reverts to `new Set(['All'])`. This is intentional for consistency but can be surprising if a category has 0 members and thus isn't in `cats`.

**Picker hidden in rainbow mode:** The picker panel is mounted but its parent `div` has `display:none` when `viewMode === 'rainbow'` (line 8142). Tab state and search are preserved (component stays mounted), but visual confirmation of this is zero — users may forget what they had selected when switching back.

**No drag-into-picker to remove:** There is no drop target in the picker. Dragging a chip from an event card back to the picker does not remove them from the event. Removal requires the X-button on the chip.

**Conflict outline suppressed on unavailable chips:** The CSS class logic (line 4302) suppresses `chip-conflict` on `isUnavailable` chips. A person who is both unavailable (focus mode) AND has a cross-event conflict will only show the greyed-out state, not the amber outline. This is intentional — the focus-mode state is considered more actionable.

---

## Change Impact Checklist

Use this checklist when modifying any code in the picker compartment or its dependencies.

**If changing `PersonnelChip` drag payload structure:**
- [ ] Update `EventCard.handleDrop` (line 4365) to parse new fields
- [ ] Update `DayColumn` drop handler if one exists
- [ ] Update `WhiteboardView` drop handler (line 6437+) — it also parses `isBlankPuck`, `isDefaultLabel`, `role`, `category`
- [ ] Update `BlankPuck.handleDragStart` if shared fields change

**If changing conflict CSS (`.chip-conflict`, `conflict-pulse`):**
- [ ] Verify visibility on all 8 `CATEGORY_COLORS` chip backgrounds
- [ ] Verify visibility in light mode (no `.light-mode .chip-conflict` override exists; if added, must preserve contrast)
- [ ] Do not remove the `!isUnavailable` guard on line 4302 — unavailable chips must not show amber outline

**If changing `focusedAvailability` computation:**
- [ ] Ensure readonly events (Supervision, Academics) are still included in overlap checking — this was an explicit user requirement
- [ ] Ensure `assigned: true` flag is preserved for the focused event's own personnel — drives "Assigned:" vs "Busy:" prefix
- [ ] Test with a person on the focused event AND conflicting with another event — they should appear in both `focusedAvailability` (assigned entry) and `personConflictSummary` (but only the focus mode tooltip should show)
- [ ] Verify that `focusEnabled = false` fully suppresses availability: `focusedAvailability` returns `null` when `!focusEnabled`

**If changing tooltip viewport detection (`showTooltip`, line 7556):**
- [ ] The 80px threshold is empirical — test with picker chips at the bottom of the picker panel on a small viewport
- [ ] The `tooltip.above` flag must be propagated to the portal div transform (line 8240)
- [ ] Light mode override (line 1966) styles the portal; verify text contrast in both modes

**If adding a new BlankPuck type:**
- [ ] Add entry to `BLANK_PUCK_DEFS` (line 2441)
- [ ] Add role to `PLACEHOLDER_FILL_RULES` (line 2458) with the allowed roster category set
- [ ] Add role to `PLACEHOLDER_ROLE_OPTIONS` (line 2491) for the + popover on event cards
- [ ] If renameable, add role to `RENAMEABLE_PH_ROLES` (line 2452)
- [ ] Add role to `getPlaceholderRoleColor()` mapping (line 2478) if it needs a non-default color

**If changing `CATEGORY_COLORS`:**
- [ ] `chipColor()` (line 2578) and `personCat()` (line 2571) derive from this — all chips affected
- [ ] `BlankPuck` color lookup (line 4732) uses this directly
- [ ] `BLANK_PUCK_DEFS` category strings must match keys exactly
- [ ] Verify amber conflict outline (#fbbf24) still contrasts against any new background colors

**If toggling picker visibility (adding new view modes):**
- [ ] The picker panel parent div condition (line 8142): currently `display:none` when NOT `timeline` or `whiteboard`
- [ ] Update condition if the picker should be visible in additional view modes
- [ ] Picker state (`activeTabs`, `search`) persists across view switches since the component stays mounted — this is intentional

**If modifying chip measurement constants (lines 3190-3201):**
- [ ] Must stay synchronized with CSS values in `.chip`, `.chip-remove`, `.conflict-icon`
- [ ] `estimateHeight()` in the Lane Assignment section depends on all these constants
- [ ] Test card heights after changes — mismatched constants cause layout overlaps
