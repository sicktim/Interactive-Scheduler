# Rainbow View Compartment

## Purpose

The Rainbow view is a personnel-centric read-only Gantt chart. Where the Timeline view organizes events by section (Flying/Ground/NA/Supervision) and date column, the Rainbow view pivots the data: each row is a single roster member, each column is a date, and horizontal event bars show that person's schedule for that day across the full 06:00–18:00 window. Its primary scheduling use-case is spotting crew overloads and open time slots at a glance, matching the visual pattern of `GUI HTML/index.html`.

Key characteristics:
- Reflects `workingEvents` in real time — all user edits on the Timeline appear here without a refresh.
- Shows ALL events regardless of Timeline event-selection filtering.
- Has its own independent filter system (event-type toggles + personnel filter).
- Read-only; clicking a bar opens a detail popup but does not allow editing.
- Always mounted via `display:none` toggling so scroll position and state survive tab switches.

---

## Owner Boundaries

The Rainbow view owns:
- All CSS under the `/* ===== RAINBOW VIEW ===== */` block (lines 906–1252) and light-mode overrides (lines 2134–2219).
- The `RainbowView` component (lines 5240–5617).
- The `RainbowModal` component (lines 5131–5170).
- The `RainbowFilterModal` component (lines 5174–5236).
- Module-level constants `RAINBOW_COL_WIDTH`, `RAINBOW_FILTERS`, `RB_BAR_CLASS`, `ROSTER_ORDER` (lines 5109–5127).

The Rainbow view does NOT own:
- `workingEvents` — owned by SchedulerView; Rainbow receives it as a prop.
- `roster` and `dates` — owned by SchedulerView; passed as props.
- `viewMode` state — owned by SchedulerView; determines whether `.rainbow-area` has `display:none`.
- `focusedEventId` — SchedulerView clears it when switching to Rainbow (line 7760); Rainbow does not participate in Focus Mode.
- `timePct`, `timeToMinutes`, `minutesToTime`, `fmtDate` — shared utilities (lines 2518–2568).
- `TIMELINE_START`, `TIMELINE_END`, `TIMELINE_RANGE` — shared constants (lines 2389–2391).

---

## Key Components & Line References

### Module-level constants (lines 5109–5127)

```js
const RAINBOW_COL_WIDTH = 300;   // px width of each date column

const RAINBOW_FILTERS = [        // event-type toggle definitions
    { key: 'Supervision', label: 'Supv', color: '#8b5cf6' },
    { key: 'Flying',      label: 'Flt',  color: '#10b981' },
    { key: 'Ground',      label: 'Gnd',  color: '#f59e0b' },
    { key: 'NA',          label: 'NAs',  color: '#ef4444' },
    { key: 'Academics',   label: 'Acad', color: '#3b82f6' },
];

const RB_BAR_CLASS = {           // section key → CSS bar class
    Flying:     'rb-bar-flying',
    Ground:     'rb-bar-ground',
    NA:         'rb-bar-na',
    Supervision:'rb-bar-supervision',
    Academics:  'rb-bar-academics',
};

const ROSTER_ORDER = [           // canonical row category order
    'FTC-A','STC-A','FTC-B','STC-B',
    'Staff IP','Staff IFTE/ICSO','Staff STC','Attached/Support'
];
```

### RainbowModal (lines 5131–5170)

Click popup for a single event bar. Props: `event` (the bar's data object), `onClose`.

Fields displayed:
- Time: `event.start – event.end`
- Section: `event.section`
- Flight Window (conditional): `ETD {event.etd} — ETA {event.eta}` (only when both are present)
- Personnel list: `event.personnel.join(', ')` with count

Color accent is derived from `secColors` map (line 5133) — matches the bar color scheme.

### RainbowFilterModal (lines 5174–5236)

Personnel-selection modal. Props: `isOpen`, `onClose`, `roster`, `currentSelection` (Set|null), `onApply`.

Internal state:
- `tempSel: Set<string>` — working copy of checked names; initialized from `currentSelection` on open.
- `search: string` — name search filter applied to `filteredRoster` memo (lines 5182–5191).

Behavior:
- Group header click (`toggleGroup`, line 5194) — toggles all names in a category.
- Individual row click (`toggle`, line 5193) — toggles single name.
- "Select All Visible" / "Deselect All Visible" buttons operate on currently filtered roster only.
- Apply calls `onApply(tempSel)` and closes; Cancel discards `tempSel`.

### RainbowView (lines 5240–5617)

Main component. Props: `workingEvents`, `roster`, `dates`.

Internal state (lines 5241–5248):

| State | Type | Purpose |
|---|---|---|
| `visibleTypes` | `Set<string>` | Which event sections are shown (all enabled by default) |
| `modalEvent` | object\|null | Currently open RainbowModal event |
| `rbSelection` | object\|null | Active timeline marker/range |
| `filterOpen` | boolean | Whether RainbowFilterModal is open |
| `visiblePersonnel` | `Set<string>`\|null | null = show all; Set = filtered subset |
| `selectedCategory` | string | Dropdown value: 'All', a roster category, or 'Custom' |

Refs:
- `dragRef` — mutable drag state (mode, dateIndex, originTime, initialSelection)
- `scrollRef` — attached to `.rainbow-scroll` div; used for viewport-relative pointer math during handle drags

---

## Grid Layout Architecture

### Flex-column wrapper (v3.6 revamp)

The `.rainbow-area` element (line 907, rendered at line 8147) uses `display:flex; flex-direction:column`. It occupies `grid-column:1; grid-row:2/4` in the SchedulerView CSS grid, filling the full content area below the header.

```
.rainbow-area
├── .rainbow-toolbar          (flex-shrink:0 — fixed height, never scrolled)
└── .rainbow-scroll           (flex:1; overflow:auto — the only scrollable region)
    └── .rainbow-grid         (CSS grid — min-width:max-content, position:relative)
        ├── [Header row]      corner cell + N date-header cells
        └── [Data rows]       separator rows + person rows
```

The toolbar sitting outside the scroll container (introduced in v3.6) was the fix for the prior approach where `ResizeObserver` + CSS variable `--rb-toolbar-h` had to dynamically offset sticky headers. With the toolbar outside, date headers can use `position:sticky; top:0` directly.

### CSS grid columns (line 5463)

```js
gridTemplateColumns: `160px repeat(${dates.length}, ${RAINBOW_COL_WIDTH}px)`
// Example for 5 days: "160px 300px 300px 300px 300px 300px"
```

- Column 1 (160px): name column — sticky-left
- Columns 2–N+1 (300px each): one date per column, separated by 1px `gap`

### Corner cell (lines 962–972, rendered at 5466–5468)

```css
.rainbow-corner {
    position: sticky; left: 0; top: 0;   /* sticky both axes */
    z-index: 35;
    background: rgba(26, 26, 46, 1);     /* fully opaque */
    height: 44px;
    box-shadow: 2px 2px 5px rgba(0,0,0,0.3);
}
```

Labeled "PERSONNEL" in 0.55rem uppercase text. z-index 35 places it above date headers (z-index 30) and name cells (z-index 20).

### Date header cells (lines 974–988, rendered at 5473–5522)

```css
.rainbow-date-header {
    position: sticky; top: 0;            /* simplified from v3.4 CSS-var approach */
    z-index: 30;
    background: rgba(30, 30, 60, 1);
    height: 44px;                        /* fixed — matches corner cell */
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
}
```

Contains two sub-elements stacked vertically:
1. `.rainbow-date-label` — centered weekday (0.7rem, bold, uppercase) + day/month (0.55rem, #94a3b8)
2. `.rainbow-time-ruler` — 14px-tall ruler strip with 6/9/12/15/18 hour marks and interactive overlay

### Name column cells (lines 1019–1045, rendered at 5538–5541)

```css
.rainbow-name-cell {
    position: sticky; left: 0;
    z-index: 20;
    background: rgba(15, 15, 35, 1);    /* fully opaque — covers grid cells behind it */
    border-right: 1px solid rgba(255,255,255,0.15);
    box-shadow: 2px 0 5px rgba(0,0,0,0.2);
    min-height: 28px;
}
```

Contains `.rainbow-name-text` (name, 0.6rem, bold, ellipsis overflow) and `.rainbow-cat-text` (roster category, 0.45rem, dimmed).

### Category separator rows (lines 1047–1060, rendered at 5528–5531)

```css
.rainbow-cat-separator {
    position: sticky; left: 0;
    z-index: 20;
    grid-column: 1 / -1;               /* spans ALL columns */
    background: rgba(255,255,255,0.03);
    font-size: 0.5rem; font-weight: 700; text-transform: uppercase;
    border-top: 1px solid rgba(255,255,255,0.06);
}
```

Inserted between roster category groups by the `personnelList` memo (lines 5284–5295). Spans the full grid width. Because `grid-column: 1 / -1` is used, these rows naturally force a row break in the grid even though rows are not explicitly defined.

### Data cells (lines 1062–1077, rendered at 5549–5589)

```css
.rainbow-cell {
    position: relative;
    background: rgba(15, 15, 35, 0.6);
    min-height: 28px;
    overflow: hidden;
    border-right: 1px solid rgba(255,255,255,0.05);
}
```

Cell height is dynamic (line 5546): `Math.max(28, laneCount * 24 + 4)` — grows by 24px per overlapping event lane.

Hour grid lines (`.rb-hour-line`) at hours 9, 12, 15 are absolute-positioned 1px-wide vertical lines (lines 1070–1077, rendered at 5550–5552).

### Event bars (lines 1079–1126, rendered at 5553–5587)

```css
.rb-event-bar {
    position: absolute;
    height: 20px;
    font-size: 0.65rem;
    font-weight: 500;
    color: rgba(255,255,255,0.9);
    border-radius: 2px;
    overflow: hidden;
    cursor: pointer;
}
.rb-event-bar:hover { z-index: 50; filter: brightness(1.2); box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
```

Position (line 5554–5556):
```js
const left  = timePct(ev.startMin);                       // % from left
const width = Math.max(2, timePct(ev.endMin) - left);     // % width, min 2%
const top   = ev.lane * 24 + 2;                           // px from cell top, 2px pad
```

Bar class map (lines 1102–1106):
- Flying: `rgba(16,185,129,0.5)` green
- Ground: `rgba(245,158,11,0.5)` amber
- NA: `rgba(239,68,68,0.5)` red
- Supervision: `rgba(139,92,246,0.5)` purple
- Academics: `rgba(59,130,246,0.5)` blue

Cancelled state (lines 213–217, applied at line 5578):
```css
.rb-bar-cancelled {
    opacity: 0.5;
    border-color: rgba(239,68,68,0.8) !important;
    background: rgba(239,68,68,0.3) !important;
}
```
Applied by appending `' rb-bar-cancelled'` to `barClass` when `ev.cancelled` is truthy.

Text label (`.rb-bar-label`, lines 1118–1126): Uses `min-width:0; overflow:hidden; text-overflow:ellipsis` to prevent label from expanding the bar. `text-shadow` gives dark-background readability in both themes. Shows `ev.shortTitle` (the model or eventName, whichever is shorter).

### Flying inner bar (lines 1108–1116, rendered at 5560–5572)

For Flying events with both `etd` and `eta`, a secondary `.rb-flight-inner` bar renders within the outer `.rb-event-bar`. It represents the airborne flight window at 60% height, positioned as a percentage of the event's total duration:

```js
const innerLeft  = ((etdMin - ev.startMin) / (ev.endMin - ev.startMin)) * 100;
const innerWidth = ((etaMin - etdMin)       / (ev.endMin - ev.startMin)) * 100;
```

---

## Timeline Handles System

### Architecture overview

Handles live exclusively in the date header; a single grid-level element (not per-row) draws the marker/range line spanning the full grid height below the header. This matches the pattern in `GUI HTML/index.html`.

### State: `rbSelection` (line 5243)

```js
// null = no selection
{ type: 'marker', dateIndex: number, start: number, end: number }
// or
{ type: 'range',  dateIndex: number, start: number, end: number }
// start/end are minutes from midnight (not percentages)
```

### Handle CSS

**Marker handle** (`.rb-marker-handle`, lines 1137–1165):
- Red tab (`background: #ef4444`), bottom-aligned in the ruler strip, centered on marker position via `translateX(-50%)`
- `::after` pseudo-element creates downward red triangle pointer (6px border trick)
- Height: 14px (matching ruler height)
- Shows time text (e.g., "09:30") via `minutesToTime(rbSelection.start)`

**Range handles** (`.rb-range-handle`, lines 1166–1183):
- Blue draggable vertical bars (`background: #3b82f6`), width 16px (touch target), visual inner bar 4px wide
- Height: 40px (extends below ruler into cell area for grab ease)
- `calc(${sPct}% - 8px)` left offset centers the 16px handle on the selection boundary

**Grid marker line** (`.rb-grid-line`, lines 1186–1195):
- `top: 45px` (below header), `bottom: 0` — spans full remaining grid height
- 2px red line with glow: `box-shadow: 0 0 4px rgba(239,68,68,0.5)`

**Grid range shade** (`.rb-grid-range`, lines 1196–1205):
- `top: 45px`, `bottom: 0` — same height as grid-line
- Blue tint: `background: rgba(59,130,246,0.15)` with blue left/right borders

### Column offset calculation (lines 5358–5361, 5596–5606)

The grid-level element must be positioned in absolute pixels (not percentages) because it sits on the `.rainbow-grid` element, not inside a date column. The calculation is:

```js
const colLeft = 161 + dateIndex * (RAINBOW_COL_WIDTH + 1);
// 161 = 160px name col + 1px gap
// +1 per gap = accounts for 1px CSS gap between columns
```

For marker: `leftPx = colLeft + (pct / 100) * RAINBOW_COL_WIDTH`
For range: `leftPx` at start, `widthPx = ((ePct - sPct) / 100) * RAINBOW_COL_WIDTH`

The grid line element is rendered as the last child of `.rainbow-grid` (lines 5594–5610) — inside the grid container but after all data rows, using `position:absolute` to escape normal flow.

### Interaction flow

**Click to place marker** (`handleRulerPointerDown`, lines 5389–5398):
1. Pointer down on `.rb-ruler-interactive` overlay
2. If `rbSelection` is already set, first click clears it (`setRbSelection(null); return`)
3. Otherwise: compute `pct` from click X in ruler, convert to minutes, set `type: 'marker'`
4. Attach global `pointermove`/`pointerup` via `addRbGlobalListeners`
5. During move: if dragged more than 10 minutes from origin, upgrade to `type: 'range'`

**Drag existing handle** (`handleRbHandleDrag`, lines 5400–5405):
- Called from `onPointerDown` on `.rb-marker-handle` or `.rb-range-handle`
- Sets `dragRef.current.mode` to `'drag-marker'`, `'drag-start'`, or `'drag-end'`
- `drag-start`: clamps to `min(currentTime, end - 15)` (15-min minimum range width)
- `drag-end`: clamps to `max(currentTime, start + 15)`

**Clear selection**:
- Escape key via `useEffect` (lines 5408–5412)
- "Clear Marker" button in toolbar (lines 5443–5447, shown only when `rbSelection` is truthy)

**Scroll-aware pointer tracking** (`addRbGlobalListeners`, lines 5349–5387):
```js
const area     = scrollRef.current;
const areaRect = area.getBoundingClientRect();
const scrollLeft = area.scrollLeft;
const colVisualLeft = areaRect.left + colLeft - scrollLeft;
const xInCol = me.clientX - colVisualLeft;
```
The `scrollRef` on `.rainbow-scroll` is critical — it provides the scroll offset needed to convert `clientX` to a column-relative position regardless of horizontal scroll.

### Range label display (lines 5501–5509)

When type is 'range', three floating labels appear in `.rb-handle-container`:
- Start time above left handle: `minutesToTime(rbSelection.start)`
- Duration at midpoint: `Xh:YY` format (or `Zm` for sub-hour) at `top:10px`
- End time above right handle: `minutesToTime(rbSelection.end)`

---

## Filter System

### Event-type toggles (toolbar, lines 5430–5441)

Five `.rainbow-filter-btn` buttons with CSS custom properties:
```css
.rainbow-filter-btn.active {
    color: var(--filter-color);
    border-color: var(--filter-color);
    background: var(--filter-bg);   /* color + '20' hex alpha suffix */
}
```

`visibleTypes` is a Set initialized with all five keys (line 5241). `toggleType` (lines 5250–5256) adds/removes keys. Filtering is applied at render time (line 5544): `allCellEvts.filter(e => visibleTypes.has(e.section))`.

### Personnel filter — category dropdown (lines 5452–5456)

```jsx
<select value={selectedCategory} onChange={handleRbCategoryChange}>
    <option value="All">All Personnel</option>
    {Object.keys(roster).map(cat => <option key={cat} value={cat}>{cat}</option>)}
    <option value="Custom" disabled>Custom Selection</option>
</select>
```

`handleRbCategoryChange` (lines 5415–5420):
- "All": sets `visiblePersonnel = null` (show everyone)
- Named category: `visiblePersonnel = new Set(roster[cat])`
- "Custom": unreachable via normal select (disabled); only set programmatically

### Personnel filter — FilterModal (lines 5448–5451, modal at 5174–5236)

The "Filter" button opens `RainbowFilterModal`. On apply, `handleRbFilterApply` (lines 5422–5426) sets `visiblePersonnel` to the new Set and forces `selectedCategory = 'Custom'` — this makes the dropdown show "Custom Selection" to indicate a non-standard filter is active.

### Personnel list construction (lines 5284–5295)

```js
const personnelList = useMemo(() => {
    ROSTER_ORDER.forEach(cat => {
        let names = roster[cat] || [];
        if (visiblePersonnel) names = names.filter(n => visiblePersonnel.has(n));
        if (names.length > 0) {
            list.push({ type: 'separator', category: cat });
            names.forEach(name => list.push({ type: 'person', name, category: cat }));
        }
    });
}, [roster, visiblePersonnel]);
```

- Order follows `ROSTER_ORDER` (FTC-A, STC-A, FTC-B, STC-B, Staff IP, Staff IFTE/ICSO, Staff STC, Attached/Support)
- Category separator is only inserted when at least one name passes the filter — empty categories are hidden entirely

---

## State Connections

### Data pipeline into Rainbow

```
SchedulerView.workingEvents   (all events including readonly)
      |
      v
RainbowView.personDateEvents  (useMemo, lines 5259–5281)
      |    — iterates ev.personnel[] for each event
      |    — Map<personName, Map<date, eventsArray>>
      |    — stores: section, title, shortTitle, start, end, etd, eta, personnel, id, cancelled
      v
layoutEvents()                (per-cell, lines 5298–5326)
      |    — lane-assignment greedy algorithm
      |    — sorts by startMin, assigns to first non-overlapping lane
      v
.rainbow-cell render          (one per person-date intersection)
```

### View mode mounting (SchedulerView, lines 8146–8149)

```jsx
<div className="rainbow-area" style={viewMode !== 'rainbow' ? { display: 'none' } : undefined}>
    <RainbowView workingEvents={workingEvents} roster={roster} dates={dates} />
</div>
```

`display:none` preserves all Rainbow React state (scroll position, `visibleTypes`, `rbSelection`, `visiblePersonnel`) across tab switches. The component is never unmounted.

### Focus mode isolation (line 7760)

```js
useEffect(() => { if (viewMode === 'rainbow') setFocusedEventId(null); }, [viewMode]);
```

When switching to Rainbow, SchedulerView clears the focused event so the Timeline's focus-mode dim effect does not linger. Rainbow itself does not receive or use `focusedEventId`.

### PersonnelPicker visibility (line 8142–8144)

```jsx
<div style={{ display: (viewMode !== 'timeline' && viewMode !== 'whiteboard') ? 'none' : undefined }}>
    <PersonnelPicker ... />
</div>
```

The picker is hidden when Rainbow is active. This is correct — Rainbow is read-only and has no drag targets.

---

## Cross-Compartment Dependencies

| Dependency | Direction | Details |
|---|---|---|
| `workingEvents` | SchedulerView → RainbowView | Entire event array; Rainbow builds its own personDateEvents index |
| `roster` | SchedulerView → RainbowView | Used by RainbowFilterModal (group structure) and personnelList |
| `dates` | SchedulerView → RainbowView | Determines number of date columns and column-offset math |
| `timePct()` | Shared utility | Converts minutes-from-midnight to 0–100% within 06:00–18:00 window |
| `timeToMinutes()` | Shared utility | Parses "HH:MM" string to integer minutes |
| `minutesToTime()` | Shared utility | Formats integer minutes to "HH:MM" |
| `fmtDate()` | Shared utility | Returns `{weekday, day, month, full}` for date header labels |
| `TIMELINE_START/END/RANGE` | Shared constants | All percentage calculations depend on these (06:00–18:00) |
| `.modal-overlay / .modal-content` | Shared CSS | RainbowModal and RainbowFilterModal reuse the global modal classes |
| `ev.cancelled` field | Event data | Drives `.rb-bar-cancelled` class; sourced from CX/Non-E column parser (v3.8.0) |
| `ev.section` field | Event data | Drives `RB_BAR_CLASS` lookup; must be one of Flying/Ground/NA/Supervision/Academics |
| `ev.etd`, `ev.eta` | Event data | Flying-inner-bar and RainbowModal flight window; both must be present |
| Light-mode CSS | Theme system | ~85 lines of `.light-mode .rainbow-*` overrides (lines 2134–2219) |

---

## Bug History & Known Issues

### Resolved bugs (chronological)

**v3.2 (initial)** — Rainbow vertical clipping
Event bars were clipping at the cell boundary. Root cause was a conflicting CSS `transform: translateY(-50%)` centering rule on `.rb-event-bar`. Removed in v3.3.
Reference: `archive/rainbow-vertical-alignment-clipping.png`

**v3.3** — View switch state loss
Switching tabs to Timeline and back reset picker state and scroll position. Fixed by changing from conditional rendering (`viewMode === 'rainbow' && <RainbowView>`) to always-mounted `display:none` toggling.

**v3.3** — Timeline handles rendered per-row
Initial implementation put handle overlays inside every `.rainbow-cell`, causing a handle to appear in each row. Redesigned in v3.4 to follow the Gantt pattern: handles only in the date header, a single grid-level absolute element for the vertical line.
Reference: `archive/timeline-handle-range.png`, `archive/timeline-handle-single.png`

**v3.4** — Rainbow toolbar obscuring sticky headers
The toolbar inside the scroll container meant sticky date headers needed `top: var(--rb-toolbar-h)` offsets driven by ResizeObserver. Toolbar was moved outside the scroll container in v3.6 and headers now use `top: 0`.

**v3.5** — Timeline misalignment
Corner cell and date headers had mismatched heights, causing the name column to be taller than the header row. Fixed by setting both to explicit `height: 44px`. The gap-aware column offset (`161 + dateIndex * (RAINBOW_COL_WIDTH + 1)`) was also introduced here to correctly position grid-level marker/range elements.
Reference: `archive/timeline-misalignment.png`

**v3.5** — Sticky header scrolling
Date headers were not frozen during vertical scroll. Fixed by confirming `position:sticky; top:0` on `.rainbow-date-header` and ensuring the scroll container is a direct ancestor with `overflow:auto` (`.rainbow-scroll` at line 931–935).

**v3.5** — Scroll-aware pointer tracking
Grid-level marker position was miscalculated during horizontal scroll because `querySelector('.rainbow-area')` was used as the reference element. Replaced by `scrollRef.current` which correctly provides `scrollLeft` of the actual scrolling container.

**v3.6** — Alternating row colors removed
User feedback (v3.6 feedback, line 178): "Remove alternating colors. Just make sure all backgrounds of the event area are one color." The `.row-alt` class and associated CSS were removed; all cells now use uniform `rgba(15,15,35,0.6)`.

**v3.6** — Rainbow-to-Timeline navigation broken
After v3.6 revamp, clicking the Timeline tab while in Rainbow showed both views simultaneously.
Reference: `archive/rainbow-after-clicking-from-timeline.png`. Fixed by verifying the `display:none` inline style logic on `.rainbow-area` and the `.timeline-area` element.

### Known issues / watch items

- **No horizontal scroll synchronization** — The name column uses `position:sticky; left:0` but the header row uses `position:sticky; top:0`. These work independently. If the grid is scrolled both horizontally and vertically, the corner cell (sticky on both axes, z-index 35) must remain opaque; any transparency would show grid content bleeding through.

- **Grid-level elements and sticky positioning** — `.rb-grid-line` and `.rb-grid-range` are `position:absolute` children of `.rainbow-grid`. They do not scroll with the horizontal scroll of `.rainbow-scroll`'s content because they use pixel `left` values computed at render time. If `RAINBOW_COL_WIDTH` changes or column count changes, these values recalculate correctly on next render. However, during an active drag, the grid-level elements update in real time via React state, which may cause a one-frame lag on slow devices.

- **Lane height is per-cell** — `laneCount` is computed independently per `(person, date)` pair. A person with 3 events on Monday and 1 on Tuesday will have a tall cell on Monday and a short cell on Tuesday. CSS grid automatically takes the max row height — this means the tallest cell in any row dictates the row height for all cells in that row. No current mechanism to equalize or control this.

- **`ev.personnel` membership required** — The Rainbow only shows a person's events by iterating `ev.personnel[]`. Events with empty `personnel` arrays are indexed but produce no visible bars. This is intentional (a schedule card with no people assigned has nothing to show on the person-centric view) but can be confusing when a nameless/empty event is visible on Timeline but absent from Rainbow.

- **Section filter applied after lane layout** — `visibleTypes` filtering (line 5544) occurs before lane layout (line 5545). Hiding Supervision bars does not re-layout remaining bars into fewer lanes. If a Supervision bar was the sole reason for a second lane, that lane space will remain after hiding Supervision. This is a cosmetic issue only.

---

## Change Impact Checklist

When editing the Rainbow view, verify the following:

**If changing `RAINBOW_COL_WIDTH`:**
- [ ] Update grid-level marker/range offset formula (`161 + dateIndex * (RAINBOW_COL_WIDTH + 1)`) — appears in two places: `addRbGlobalListeners` (line 5358) and the render block (line 5596)
- [ ] Confirm pointer-move tracking math in `addRbGlobalListeners` (line 5361) remains consistent
- [ ] Check that ruler marks at 6/9/12/15/18 still fit in the header width

**If changing the name column width (currently 160px):**
- [ ] Update the `gridTemplateColumns` literal (`160px repeat(...)`, line 5463)
- [ ] Update the column offset constant (`161` in lines 5358 and 5596 — the extra 1px accounts for the gap)
- [ ] Update `.rainbow-corner` height and `.rainbow-name-cell` styling to match

**If adding a new event section (beyond Flying/Ground/NA/Supervision/Academics):**
- [ ] Add entry to `RAINBOW_FILTERS` (line 5111)
- [ ] Add entry to `RB_BAR_CLASS` (line 5119)
- [ ] Add corresponding CSS class (`.rb-bar-*`, lines 1102–1106 pattern)
- [ ] Add entry to `RainbowModal`'s `secColors` map (line 5133)
- [ ] Add light-mode override if bar color differs in light theme

**If changing header height from 44px:**
- [ ] Update `.rainbow-corner` height (line 970)
- [ ] Update `.rainbow-date-header` height (line 985)
- [ ] Update `.rb-grid-line` and `.rb-grid-range` `top` value (currently `45px` = 44px header + 1px border, lines 1188, 1198)
- [ ] Confirm that `top: 0` on sticky headers still places them correctly below the toolbar

**If modifying handle interaction:**
- [ ] `handleRulerPointerDown` is on `.rb-ruler-interactive` inside `.rainbow-time-ruler` (lines 5482, 5389–5398)
- [ ] `addRbGlobalListeners` attaches to `window` — verify cleanup on `pointerup` (line 5383)
- [ ] `dragRef` is a plain mutable ref (not state) to avoid re-render during drag
- [ ] The "first click clears" behavior (line 5394) is intentional for usability

**If modifying the filter system:**
- [ ] `RainbowFilterModal` uses `tempSel` as a local copy — `onApply` receives the new Set; do not share the modal's internal state
- [ ] `selectedCategory = 'Custom'` auto-set in `handleRbFilterApply` (line 5423) keeps the dropdown in sync
- [ ] The 'Custom' `<option>` is `disabled` — it is only reached programmatically; if enabling it for manual selection, remove the `disabled` attribute

**If modifying `workingEvents` shape:**
- [ ] `personDateEvents` memo (lines 5259–5281) destructures: `ev.personnel`, `ev.date`, `ev.section`, `ev.model`, `ev.eventName`, `ev.startTime`, `ev.endTime`, `ev.etd`, `ev.eta`, `ev.id`, `ev.cancelled`
- [ ] `layoutEvents` uses `ev.start` and `ev.end` (the renamed copies from the memo, not `ev.startTime`/`ev.endTime`)
- [ ] `RainbowModal` uses: `event.title`, `event.start`, `event.end`, `event.section`, `event.etd`, `event.eta`, `event.personnel`

**If changing the scroll/sticky approach:**
- [ ] Verify `.rainbow-scroll` remains the direct overflow parent of `.rainbow-grid`; sticky positioning requires a non-`overflow:visible` ancestor
- [ ] The corner cell `z-index:35` must exceed date header `z-index:30` and name cell `z-index:20` to overlay them correctly at the corner intersection

**Light mode:**
- [ ] All rainbow CSS changes need corresponding `.light-mode` overrides (lines 2134–2219)
- [ ] Inline styles set via React `style` props in the toolbar require `!important` in light-mode overrides (see lines 2208–2218 for the pattern already in use)
