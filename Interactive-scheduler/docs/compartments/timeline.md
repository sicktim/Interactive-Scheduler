# Timeline Compartment

## Purpose

The Timeline is the primary scheduling view of the TPS Interactive Scheduler. It renders a horizontal Gantt-style calendar where each day occupies a fixed-width column (1125px) spanning 06:00–18:00. Events are displayed as absolutely-positioned cards within section bands (Supervision, Flying, Ground, NA). Personnel chips inside each card are draggable and accept drops from the PersonnelPicker panel below. The view supports conflict detection, focus/dim mode, cancelled event display, and custom event creation.

---

## Owner Boundaries

The Timeline compartment owns:
- All layout computation logic (lane assignment, height estimation, chip measurement)
- `DayColumn` component and its section-level rendering loop
- `EventCard` component and its internal crew area
- `PersonnelChip` component (shared with picker but defined here)
- Section-specific layout builders (`buildLayout`, `buildSupervisionLayout`, `buildFlyingLayout`, `buildGroundLayout`)
- CSS for `.day-column`, `.section-lanes`, `.event-card`, `.chip`, `.conflict-badge`, `.flight-bar-*`, `.chip-placeholder`
- `scrollToDay()` navigation helper
- The `display:none` mount pattern for view toggling

The Timeline compartment does **not** own:
- `PersonnelPicker` panel (separate compartment, rendered below the timeline)
- Rainbow view (separate compartment, always mounted alongside timeline)
- Whiteboard view (separate compartment)
- `focusedAvailability` computation (lives in `SchedulerView`, passed down)
- `detectConflicts()` (lives in `SchedulerView`, passed down as `conflicts` prop)
- Change tracking / undo (`handleAdd`, `handleRemove` callbacks from `SchedulerView`)

---

## Key Functions & Line References

All references are to `Interactive-scheduler/interactive-scheduler.html`.

### Constants (lines 2389–2424)
```
TIMELINE_START = 6 * 60   (360 min)
TIMELINE_END   = 18 * 60  (1080 min)
TIMELINE_RANGE = 720 min
DAY_COL_WIDTH  = 1125     (px, matches .day-column min-width in CSS)
SECTION_ORDER  = ['Supervision', 'Flying', 'Ground', 'NA']
SUPERVISION_ROLE_ORDER = ['SOF','OS','ODO','F-16 FDO','T-38 TDO','C-12 TDO','A-29 ADO',"Other (As Req'd)",'FOA','AUTH']  (line 2412)
FLYING_MODEL_ORDER = ['F-16','T-38','C-12','LJ-25','A-29','U-2','X-62A','EXTRA']  (line 2420)
SIM_CR_MODELS = Set of CR A/B/C, FS SIM A/B/C, FLYBY TWR  (line 2424)
```

### Chip Measurement Constants (lines 3189–3204)
```
CHIP_FONT_SIZE_REM = 0.58   matches .chip { font-size }
CHIP_FONT_WEIGHT   = 500    matches .chip { font-weight }
CHIP_HPAD          = 5      matches .chip { padding: 1px 5px }
CHIP_INNER_GAP     = 2      matches .event-crew-area { gap: 2px }
CHIP_REMOVE_CHAR   = '✕'
CHIP_REMOVE_FSIZE  = 0.50   matches .chip-remove { font-size }
CHIP_CONFLICT_CHAR = '!'
CHIP_CONFLICT_FSIZE = 0.55  matches .conflict-icon { font-size }
CREW_AREA_GAP      = 2      matches .event-crew-area { gap: 2px }
CREW_AREA_HPAD     = 5      matches .event-crew-area { padding: 2px 5px 3px }
CREW_AREA_VPAD     = 5      (top 2 + bottom 3)
CHIP_ROW_H         = 16     measured chip height (font + padding + gap)
TITLE_BAR_H        = 18     title bar height
FLIGHT_BAR_H       = 14     ETD/ETA flight time bar height
MIN_CARD_H         = 40     minimum event card height
```
**Critical:** These constants must stay in sync with their matching CSS rules. If font sizes or padding change in CSS, the constants must be updated or lane assignments will produce incorrect heights and cards will clip their crew areas.

### Time Utility Functions (lines 2530–2560)
- `timePct(mins)` — converts minutes since midnight to `%` position within the 06:00–18:00 range; clamped 0–100 (line 2530)
- `evStart(ev)` — returns `timeToMinutes(ev.startTime)` (line 2535)
- `evEnd(ev)` — returns `timeToMinutes(ev.endTime)` or `evStart + 60` fallback or `TIMELINE_END` (lines 2536–2540)
- `visualEnd(ev)` — adjusted end time accounting for min-width expansion (lines 2543–2555, see detail below)
- `overlap(a, b)` — returns true if two events' time windows overlap (lines 2557–2561)

### `visualEnd(ev)` — Lines 2543–2555
```javascript
const visualEnd = (ev) => {
    const s = evStart(ev);
    const e = evEnd(ev);
    if (s == null) return e;
    const dur = e - s;
    const widthPct = (dur / TIMELINE_RANGE) * 100;
    const cardPx = (widthPct / 100) * DAY_COL_WIDTH;
    if (cardPx >= 140) return e;
    // Card is expanded to 140px — compute what end time that corresponds to
    const expandedPct = (140 / DAY_COL_WIDTH) * 100;
    const expandedDur = (expandedPct / 100) * TIMELINE_RANGE;
    return s + expandedDur;
};
```
CSS sets `min-width: 140px` on `.event-card`. Short events expand visually beyond their data end time. `visualEnd` converts 140px back into minutes so the lane assignment algorithm treats the card's rendered footprint (not its data duration) as the overlap boundary. Without this, a 15-minute event at 08:00 would be placed in the same lane as a 08:30 event because their data windows don't overlap, but their rendered cards would visually collide.

### `getChipMetrics()` — Lines 3208–3223
Lazy-initialized via canvas. Measures:
- `charW` — width of character 'M' in `500 {CHIP_FONT_SIZE_REM}rem JetBrains Mono`
- `removeW` — width of '✕' at `CHIP_REMOVE_FSIZE`rem
- `conflictW` — width of '!' at 700 weight `CHIP_CONFLICT_FSIZE`rem

Result cached in `_chipMetrics` object (line 3207). Uses `document.createElement('canvas')` — called at layout time, never during SSR.

### `measureChipWidth(name, isReadonly)` — Lines 3228–3235
```
width = CHIP_HPAD*2 + name.length*charW + CHIP_INNER_GAP + conflictW
       [+ CHIP_INNER_GAP + removeW + 1]  (if not readonly)
```
Conflict icon space is **always reserved** even when no conflict exists (pessimistic estimation prevents row clipping when a conflict later appears). Remove button space omitted for readonly events.

### `measurePlaceholderChipWidth(label, hasRemove)` — Lines 3238–3243
Same as above but **no conflict icon** (placeholder chips never show conflicts). Used for unfilled placeholder chips and the `+` add-person button.

### `computeChipRows(personnel, areaWidth, isReadonly)` — Lines 3246–3256
Greedy first-fit bin packing over a flat `personnel` array. Mirrors CSS `flex-wrap` behavior. Returns integer row count.

### `packChipWidths(widths, areaWidth)` — Lines 3259–3268
Same algorithm as `computeChipRows` but accepts a pre-measured array of pixel widths (for mixed personnel + placeholder + button chips). Used by `estimateHeight`.

### `estimateHeight(ev)` — Lines 3270–3299
```
h = TITLE_BAR_H
if Flying && has ETD/ETA: h += FLIGHT_BAR_H
cardPxWidth = max(140, (dur/TIMELINE_RANGE)*100 / 100 * DAY_COL_WIDTH)
chipAreaWidth = cardPxWidth - CREW_AREA_HPAD*2
allWidths = personnelWidths + unfilledPlaceholderWidths + plusButtonWidth
rows = packChipWidths(allWidths, chipAreaWidth)
h += rows * CHIP_ROW_H + CREW_AREA_VPAD
return max(h, MIN_CARD_H)
```
Unfilled placeholders are counted with `measurePlaceholderChipWidth`; personnel chips use `measureChipWidth`. The `+` add button is included for non-readonly events. Uses `max(140, ...)` for card width so short events compute chip rows correctly against their actual rendered width.

---

## Layout Algorithm Detail

### Generic Layout — `buildLayout(events)` — Lines 3301–3338

Used for NA section. Standard greedy lane assignment:

1. Sort events by `evStart` ascending.
2. For each event, find the first existing lane where the last event's `visualEnd` <= this event's `evStart`. If found, append to that lane. If not found, open a new lane.
3. Lane heights = `max(estimateHeight(ev))` across all events in that lane.
4. Lane tops computed cumulatively with 3px gap between lanes.
5. Returns `evMap: { [id]: {top, height} }` and `total` (total height of section-lanes div).

### Supervision Layout — `buildSupervisionLayout(events)` — Lines 3343–3404

Supervision events are duty roles (SOF, OS, ODO, etc.) that should not compete with each other visually. Layout:

1. Group events by `eventName` (which holds the duty role string).
2. Order role bands by `SUPERVISION_ROLE_ORDER`, unknown roles alphabetically appended.
3. Each role band has a 12px label strip at top (`LABEL_H`).
4. Within each band, genuine time overlaps are stacked into sub-lanes (same greedy algorithm).
5. Band height = `LABEL_H + subLanes.length * SUPV_LANE_H + gaps`.
6. `SUPV_LANE_H = 40px`, `SUBLANE_GAP = 2px`, `ROLE_GAP = 4px`.
7. Returns `evMap`, `total`, and `roleBands` array for the separator overlay.

Role band separators (thin purple lines + role label text) are rendered as non-interactive overlay divs inside `DayColumn` at lines 4638–4653.

### Flying Layout — `buildFlyingLayout(events)` — Lines 3410–3525

Flying events are split into real aircraft vs. simulator/CR events:

- `isSimCR(ev)`: checks `ev.model` against `SIM_CR_MODELS` set.
- Real flights are grouped by `ev.model` into model bands ordered by `FLYING_MODEL_ORDER`.
- Sims/CRs are matched to preceding real-aircraft events by walking backwards through the events array to find the nearest non-sim event (line 3437–3447). Unmatched sims collect in a synthetic `'__SIMS__'` band displayed as "Sims / CR".
- Within each model band: real flights packed into sub-lanes first, then sims/CRs below a dashed divider.
- Per-lane heights use `estimateHeight` (not fixed `FLYING_LANE_H`) so ETD/ETA bar and crew rows don't clip.
- Returns `evMap`, `total`, and `modelBands` (each with `{model, top, height, flightH, hasSims}`).

Model band separators (thin green lines + model label) are rendered at lines 4657–4679. A dashed divider between flights and sims is rendered at lines 4671–4677 when `hasSims && flightH > 0`.

### Ground Layout — `buildGroundLayout(events)` — Lines 3530–3591

Ground events are grouped by `eventName` into named bands:

1. Groups sorted alphabetically by `eventName`.
2. Each band has a 12px label strip — except **singletons** (groups with exactly 1 event), which skip the label to save vertical space.
3. Per-lane heights use `estimateHeight` so wrapped event names have enough room.
4. Returns `evMap`, `total`, and `nameBands`.

### `DayColumn` FOA/AUTH Chips (added T2)

`DayColumn` now accepts a `foaAuth` prop: `{ foa: string|null, auth: string|null }` — the person name for each duty slot. When either slot is non-null, a small colored pill is rendered in the top-right of the `day-header`, using `chipColor()` for roster-based coloring. Shows the last name (first comma-split token, up to 8 chars) with a "FOA" or "AUTH" label prefix at 0.7 opacity.

The `foaByDate` useMemo in `SchedulerView` builds the per-date map from `workingEvents` (Supervision events named 'FOA'/'AUTH') and passes `foaByDate[date]` to each `DayColumn` as the `foaAuth` prop.

### Section Dispatch in `DayColumn` — Lines 3599–3615

```javascript
sectionData[sec] = {
    events: secEvts,
    layout: sec === 'Supervision' ? buildSupervisionLayout(secEvts)
          : sec === 'Flying'      ? buildFlyingLayout(secEvts)
          : sec === 'Ground'      ? buildGroundLayout(secEvts)
          : buildLayout(secEvts),   // NA and fallback
};
```
Computed inside a `useMemo([events])` hook.

---

## EventCard Anatomy

**Component definition:** Lines 4320–4590

**Props:**
```
event          — the event object
top            — pixel offset from top of section-lanes div (from layout)
height         — pixel height (from estimateHeight)
roster         — full roster map for chip coloring
conflicts      — Map<eventId, Map<person, [{...}]>> from detectConflicts
onRemove       — remove person callback (SchedulerView.handleRemove)
onAdd          — add person callback (SchedulerView.handleAdd)
onDS / onDE    — drag-start / drag-end forwarded through chip chain
onShowTooltip / onHideTooltip — portal tooltip callbacks
isFocused      — true when this event is the focusedEventId
isDimmed       — true when another event is focused
onFocusEvent   — setFocusedEventId setter
onDeleteCustom — delete custom event callback
onEventAction  — open action menu (cancel/edit) callback
onAddPlaceholder / onFillPlaceholder / onRemovePlaceholder — placeholder management
```

**Internal state:**
- `dragOver` — highlights card with blue glow when a chip is dragged over it
- `pendingFill` — holds `{ person, matches, rcMap }` when a dropped person matches unfilled placeholder slots; renders an inline prompt to confirm which slot to fill
- `addMenuOpen` — controls the `+` role-picker popover visibility

**Positioning (line 4435):**
```javascript
style={{
    left: `${timePct(sMin)}%`,
    width: `${Math.max(timePct(eMin) - timePct(sMin), 4)}%`,
    top: `${top}px`,
    height: `${height}px`
}}
```
Width is clamped to minimum 4% to avoid invisible zero-width cards. `min-width: 140px` in CSS ensures a readable minimum.

**CSS class composition (line 4434):**
```
event-card
event-card-{section}          (flying | ground | na | supervision)
event-card-cancelled          (if ev.cancelled)
event-card-custom             (if ev.isCustom)
drag-over                     (while dragging a chip over the card)
focused                       (if isFocused)
dimmed                        (if isDimmed)
```

### Title Bar (lines 4458–4472)
```
.event-title-bar
  [event-type-label]          model name (Flying) or "GND" / "NA"; no label for Supervision
  .event-name-text            event name; truncated with ellipsis (Flying); wraps for Ground/NA
  .event-time-text            "HH:MM-HH:MM" (Flying and Supervision only)
  [CX badge]                  red pill if ev.cancelled
  [+NEW badge]                blue badge if ev.isCustom (.custom-badge)
  [X delete button]           .custom-delete-btn, only if ev.isCustom && onDeleteCustom
```

### Flight Bar (lines 4337–4356)
Rendered only for Flying events with `etd` and `eta`. Shows a proportional green fill strip within the brief-to-debrief window:
- `fLeft = (etdMin - sMin) / dur * 100%`
- `fWidth = (etaMin - etdMin) / dur * 100%`
ETD label on left edge, ETA label on right edge.

### Crew Area (lines 4474–4587)
`.event-crew-area` — `display:flex; flex-wrap:wrap; gap:2px; padding:2px 5px 3px`

Renders in order:
1. **Personnel chips** — one `PersonnelChip` per `event.personnel` entry. Filled-placeholder people receive a `colorOverride` matching their placeholder role color.
2. **Pending fill prompt** — if the user just dropped a person and matching unfilled placeholders exist, a `.wb-fill-prompt` popover appears next to that chip asking which placeholder to fill.
3. **Unfilled placeholder chips** — `.chip-placeholder` with dashed border, italic text, optional remove button.
4. **+ add button** — `.wb-crew-add-btn` opens `.wb-add-ph-popover` with `PLACEHOLDER_ROLE_OPTIONS` list for adding a typed placeholder slot.

### Drag-and-Drop (lines 4358–4404)
- `handleDragOver` — sets `dragOver:true`, `dropEffect:'copy'`; skipped for readonly events
- `handleDrop` — parses `text/plain` JSON:
  - `isBlankPuck && isDefaultLabel` → calls `onAddPlaceholder(eventId, role)` (unfilled slot)
  - `isBlankPuck && !isDefaultLabel` → calls `onAddPlaceholder(eventId, role, personName)` (pre-filled slot)
  - Regular person → calls `onAdd(eventId, person, sourceEventId)`, then checks for matching unfilled placeholders to trigger `pendingFill`

### Conflict Badge (lines 4450–4457)
```
.conflict-badge  — absolute positioned bottom-right corner
```
Shows count of conflicting person-event pairs. Hover triggers portal tooltip listing each conflict as `"personName → model eventName HH:MM-HH:MM"`.

---

## State Connections

### `SchedulerView` state that feeds the timeline (lines 7537–7560):

| State | Type | Purpose |
|---|---|---|
| `workingEvents` | `Event[]` | All events (including readonly); source for `eventsByDate` |
| `focusedEventId` | `string \| null` | Which event is focused (line 7547) |
| `focusEnabled` | `boolean` | Focus mode on/off toggle (line 7548) |
| `viewMode` | `string` | `'timeline' \| 'rainbow' \| 'whiteboard'`; controls display:none (line 7542) |
| `conflicts` | `Map` | Output of `detectConflicts(workingEvents)` (line 7725) |
| `eventsByDate` | `{[date]: Event[]}` | Filtered by `visibleEvents`, mapped by date (line 7717) |
| `focusedAvailability` | `Map \| null` | Who is unavailable during focused event's window (line 7728) |

### `visibleEvents` filter (line 7702)
Only events with their section toggled on in the event-selection screen appear in the timeline. Supervision and readonly events pass through when selected.

### Focus mode flow:
1. User clicks an `EventCard` → `onFocusEvent(event.id)` → `setFocusedEventId` in `SchedulerView`
2. `focusedEventId` and `focusEnabled` propagate to all `DayColumn` instances via props
3. `DayColumn` passes `isFocused` (line 4704) and `isDimmed` (line 4705) to each `EventCard`
4. `focusedAvailability` computed in `SchedulerView` (lines 7728–7757) is passed to `PersonnelPicker`
5. Escape key clears focus (line 7762–7766); clicking outside any event card in `.timeline-area` also clears it (line 8116)
6. Switching to Rainbow view clears focus (line 7760)

### Scroll behavior (lines 8032–8036):
```javascript
const scrollToDay = (date) => {
    const idx = dates.indexOf(date);
    if (idx >= 0 && timelineRef.current) {
        timelineRef.current.scrollTo({ left: idx * DAY_COL_WIDTH, behavior: 'smooth' });
    }
};
```
The day-tab navigation in the toolbar calls `scrollToDay`. Each day is exactly `DAY_COL_WIDTH = 1125px` wide, so scroll offset is `idx * 1125`.

---

## Cross-Compartment Dependencies

### PersonnelPicker (below timeline)
- Receives `focusedAvailability` from `SchedulerView`; greys out unavailable chips
- Picker chips share the `PersonnelChip` component defined at line 4276
- `onDS`/`onDE` drag callbacks thread through `SchedulerView` → `DayColumn` → `EventCard` → `PersonnelChip`

### Rainbow View
- Both timeline and rainbow are always mounted; `display:none` toggles via `viewMode` state (lines 8114–8149)
- Rainbow reads `workingEvents` directly from `SchedulerView`; timeline changes to `workingEvents` immediately reflect in Rainbow

### Whiteboard View
- Same always-mounted pattern; `display:none` toggle (lines 8151–8176)
- Focus mode shared: `focusedEventId` / `onFocusEvent` passed to both timeline and whiteboard

### Change Tracking
- `handleAdd` (line 7781) and `handleRemove` (line 7878) in `SchedulerView` update `workingEvents` and append to `changes`
- `EventCard` calls these via `onAdd` and `onRemove` props; it never mutates state directly

### Conflict Detection
- `detectConflicts(workingEvents)` (line 2967) runs on ALL `workingEvents` including non-visible and readonly events
- Supervision-vs-supervision pairs are explicitly excluded (line 2987)
- Cancelled events excluded from conflict detection (line 2971)
- Result is a `Map<eventId, Map<personName, [...]>>` passed as `conflicts` prop to every `DayColumn` → `EventCard`

### Tooltip Portal
- Single `<div className="conflict-tooltip-portal">` rendered at `SchedulerView` root (not inside timeline)
- `showTooltip(text, rect)` / `hideTooltip()` callbacks threaded down: `SchedulerView` → `DayColumn` → `EventCard` → `PersonnelChip`
- Portal uses `position:fixed` with `z-index:9999` to escape all stacking contexts

---

## Bug History & Known Issues

### Fixed Bugs (chronological)

**v1.0 — Real-estate overflow (line 20 of feedback.txt)**
Short-duration events with many crew members caused cards to overflow their allotted height. Fixed in v2.0 with dynamic `estimateHeight()`.

**v2.0 — Notes appearing as crew names**
Scheduler notes longer than 25 characters or with >4 words were appearing as crew chips. Fixed with `isValidName()` heuristic.

**v3.0 — Top-row conflict tooltips obscured by timeline**
Conflict badge tooltips were rendered inside the card's stacking context, clipped by the sticky header. Fixed with the portal tooltip pattern (`position:fixed`, `z-index:9999`).

**v3.0 — min-width card real-estate issue (version 2 feedback)**
Cards too narrow for 1-hour events with many crew. Fixed by adding `min-width:140px` in CSS and making `estimateHeight` aware of that minimum width when computing chip rows.

**v3.1 — Event card horizontal overlap (event-overlapping-1/2.png)**
Events with short durations were placed in the same lane because `overlap()` used raw data end times. Fixed by adding `visualEnd()` which converts the 140px visual expansion back into minutes for lane boundary testing. Also added `overflow:hidden` to `.section-lanes` to contain cards that still escape.

**v3.1 — Conflict badge color invisible on orange chips**
Red outline was used for conflict highlighting, which disappeared on orange (FTC-B) chips. Changed to amber/yellow `#fbbf24` with pulsing glow animation (`@keyframes conflict-pulse`).

**v3.1 — Duplicate native tooltip on conflict badge**
Two tooltips appeared stacked (native `title` attribute + portal tooltip). Removed all `title` attributes from conflict elements.

**v3.3 — View switch wiping timeline state (version 3.2 feedback)**
Switching to Rainbow reset picker state and timeline scroll position. Fixed by switching from conditional rendering (`&&`) to `display:none` — both views are always mounted.

**v3.4 — Focus mode: assigned person not greyed in picker**
After dropping a person onto the focused event, they still appeared available in the picker. Fixed by including the focused event's own personnel in `focusedAvailability` with `assigned:true` flag.

**v3.5 — Tooltip artifact on chip delete**
When hovering over a chip with a conflict and then clicking X to remove, the tooltip portal remained visible after the chip was destroyed. Fixed by calling `onHideTooltip()` inside the chip X button handler before `onRemove()`.

### Known Issues / Watch Items

**Supervision card min-width override**
`.event-card-supervision` sets `min-width:50px` (overriding the base 140px) to allow short duty-period cards to be narrow. This means `visualEnd()` for supervision cards still uses the 140px calculation, which may cause lane placement to be slightly conservative (allocating more space than strictly needed for supervision).

**`estimateHeight()` pessimism on conflict icon**
The conflict icon width is always reserved in `measureChipWidth` even when no conflict exists at layout time. This means card heights may be slightly taller than the actual rendered chip rows when no conflicts are present. The trade-off is intentional: under-estimation causes crew area clipping when conflicts appear dynamically.

**Flying layout sim-matching by array index**
SIM/CR events are matched to their aircraft band by walking backwards through `events` to find the nearest preceding non-sim event (line 3437–3447). This is more reliable than startTime matching but depends on the source data's event ordering. If the API returns sims before their paired flights, they will fall into the `__SIMS__` catch-all band.

**`mergeDuplicateEvents()` disabled (v3.7.0)**
The merge function exists at lines ~2900–2965 but is bypassed via an early return. If re-enabled, the timeline layout will be affected: merged events would show combined crew, and the layout would need to re-run on the merged set.

---

## Change Impact Checklist

Use this checklist when modifying the timeline compartment:

### If you change any chip CSS (`.chip` padding, `gap`, `font-size`, `.chip-remove`, `.conflict-icon`):
- [ ] Update the matching constant in the `LANE ASSIGNMENT` section (lines 3189–3204)
- [ ] Re-verify `estimateHeight()` produces correct heights by testing with 1-person and 8-person events
- [ ] Check that Ground/NA event names still wrap correctly (`.event-card-ground .event-name-text { white-space: normal }`)

### If you change `DAY_COL_WIDTH` (currently 1125):
- [ ] Update `scrollToDay()` — it uses `idx * DAY_COL_WIDTH` directly (line 8035)
- [ ] Update `visualEnd()` — uses `DAY_COL_WIDTH` as the 100% reference
- [ ] Update `estimateHeight()` — uses `DAY_COL_WIDTH` for chip row width calculation
- [ ] Update `.day-column { min-width: ...; width: ... }` in CSS

### If you change `TIMELINE_START` or `TIMELINE_END`:
- [ ] Update ruler marks in `DayColumn` — currently hardcoded as `[6,9,12,15,18]` (line 4625)
- [ ] Verify all events that start outside the window (before 06:00 or after 18:00) clamp correctly via `timePct()` which already uses `Math.max(0, Math.min(100, ...))`

### If you add a new section type:
- [ ] Add to `SECTION_ORDER` (line 2394)
- [ ] Add a `buildXxxLayout()` function and wire it into the `DayColumn` `sectionData` dispatch (lines 3601–3614)
- [ ] Add `.section-divider-xxx` CSS color rule (lines 154–156)
- [ ] Add `.event-card-xxx` CSS color rule (lines 185–201)
- [ ] Decide if the section should have band separators (supervision/flying/ground pattern)

### If you change the `min-width` on `.event-card`:
- [ ] Update `visualEnd()` — hardcoded `140` references at lines 2550, 2552
- [ ] Update `estimateHeight()` — hardcoded `140` at line 3278

### If you add fields to the event object that affect visual height (e.g., a notes row):
- [ ] Update `estimateHeight()` to account for the additional height
- [ ] Update `TITLE_BAR_H`, `FLIGHT_BAR_H`, or add a new height constant if needed

### If you modify focus mode behavior:
- [ ] Verify `isFocused` / `isDimmed` logic at lines 4704–4705 (both derive from `focusEnabled && focusedEventId`)
- [ ] Verify `focusedAvailability` computation at lines 7728–7757 includes all relevant event categories
- [ ] Verify Escape key handler at line 7763 still fires
- [ ] Verify click-outside handler on `.timeline-area` at line 8116 still clears focus

### If you add a new event badge type (like the current CX and +NEW):
- [ ] Add to the `.event-title-bar` render section in `EventCard` (lines 4458–4472)
- [ ] Add CSS for the badge class
- [ ] Verify the badge does not overflow the title bar on short-width cards
- [ ] Verify `estimateHeight()` — badges don't currently add height (title bar height is fixed at `TITLE_BAR_H = 18`)

### If you modify drag-and-drop:
- [ ] Verify `handleDrop` in `EventCard` (lines 4365–4404) handles all puck types: regular person, blank puck with default label, blank puck with custom name
- [ ] Verify `handleDragStart` in `PersonnelChip` (line 4279) encodes the same fields that `handleDrop` expects
- [ ] Verify `BlankPuck.handleDragStart` (line 4738) encodes `isBlankPuck`, `category`, `role`, `isDefaultLabel` correctly
