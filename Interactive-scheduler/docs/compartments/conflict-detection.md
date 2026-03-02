# Conflict Detection Compartment

## Purpose

The conflict detection subsystem identifies personnel scheduling conflicts across all working events — including read-only Supervision and Academics events that the user has not actively selected — and surfaces those conflicts through three escalating visual channels: a per-event badge with count, amber-outlined chips with a `!` icon, and a hover tooltip with specific conflicting event names and times. A related but distinct sub-system, Focus Mode Availability, uses the same overlap primitive to compute who cannot be added to a focused event without creating a conflict.

---

## Owner Boundaries

This compartment owns:
- `detectConflicts()` — the primary algorithm (lines 2967–3020)
- `overlap()` — the time-overlap primitive (lines 2557–2561)
- `addConflict()` — the deduplication helper (lines 2992–2998, defined inline inside `detectConflicts`)
- `getConflictText()` — formats conflict entries into a human-readable tooltip string (lines 3022–3044)
- `hasConflict()` — boolean presence check (lines 3046–3048)
- `eventConflictCount()` — count of conflicting persons for badge (lines 3051–3053)
- `focusedAvailability` useMemo — focus mode availability check (lines 7727–7757)
- `ConflictSummaryModal` component (lines 4147–4272)
- `PersonnelPicker.personConflictSummary` useMemo (lines 4823–4852)
- `conflictCount` useMemo — header badge count (lines 8039–8043)
- `.chip-conflict` CSS and `@keyframes conflict-pulse` (lines 375–387)
- `.conflict-badge` CSS (lines 391–402)
- `.conflict-tooltip-portal` CSS and portal render (lines 404–418; 8237–8244)
- `showTooltip` / `hideTooltip` callbacks and `tooltip` state (lines 7541, 7556–7561)
- `.event-card.focused` / `.event-card.dimmed` / `.picker-chip.unavailable` CSS (lines 421–433)

This compartment does NOT own:
- Chip rendering layout (chip width measurement, row packing) — layout compartment
- Event card rendering beyond the badge and chip wiring — timeline compartment
- `PersonnelChip` component itself beyond the conflict-specific props (`conflictText`, `isUnavailable`, `onShowTooltip`, `onHideTooltip`) — picker compartment

---

## Key Functions & Line References

| Symbol | Lines | Description |
|---|---|---|
| `overlap(a, b)` | 2557–2561 | Returns true if two events share at least one minute |
| `detectConflicts(allEvents)` | 2967–3020 | Full algorithm; returns `Map<eventId, Map<personName, entry[]>>` |
| `addConflict(evId, entry)` (inner) | 2992–2998 | Dedup guard; defined closure inside `detectConflicts` |
| `getConflictText(eventId, person, conflicts)` | 3022–3044 | Renders tooltip string grouped by date |
| `hasConflict(eventId, person, conflicts)` | 3046–3048 | Boolean check for chip styling decision |
| `eventConflictCount(eventId, conflicts)` | 3051–3053 | Returns number of conflicting persons for badge digit |
| `conflicts` useMemo | 7724–7725 | Runs `detectConflicts(workingEvents)` on every working state change |
| `focusedAvailability` useMemo | 7728–7757 | Focus mode: who overlaps the focused event |
| `conflictCount` useMemo | 8039–8043 | Unique person count across all conflict entries; drives header button |
| `showTooltip(text, rect)` | 7556–7560 | Sets `tooltip` state; computes above/below from viewport space |
| `hideTooltip()` | 7561 | Clears `tooltip` state |
| `ConflictSummaryModal` | 4147–4272 | Modal listing all conflicts grouped by date then event |
| `PersonnelPicker.personConflictSummary` | 4823–4852 | Aggregates conflict map into per-person tooltip strings for picker chips |
| Tooltip portal render | 8237–8244 | Single `<div class="conflict-tooltip-portal">` at SchedulerView root |

---

## Conflict Algorithm Detail

### Entry Point

`detectConflicts` is called inside a `useMemo` at line 7725, keyed on `[workingEvents]`. It runs synchronously on every state change that touches personnel or event times.

```js
// Line 7724–7725
// Conflict detection on ALL events
const conflicts = useMemo(() => detectConflicts(workingEvents), [workingEvents]);
```

### Step 1 — Build a Person+Date Index

```js
// Lines 2968–2977
const pdMap = {};
allEvents.forEach(ev => {
    if (ev.cancelled) return;          // cancelled events excluded entirely
    ev.personnel.forEach(person => {
        const k = `${person}||${ev.date}`;
        if (!pdMap[k]) pdMap[k] = [];
        pdMap[k].push(ev);
    });
});
```

Key: `"SMITH, J||2026-03-03"` — one bucket per person per calendar day. Cancelled events (`ev.cancelled === true`) are skipped at this stage; they cannot create conflicts and cannot be conflicted against.

### Step 2 — Pairwise Overlap Check

```js
// Lines 2982–3016
Object.values(pdMap).forEach(evList => {
    if (evList.length < 2) return;
    for (let i = 0; i < evList.length; i++) {
        for (let j = i + 1; j < evList.length; j++) {
            // Supervision-vs-Supervision: skip
            if (evList[i].section === 'Supervision' && evList[j].section === 'Supervision') continue;
            if (!overlap(evList[i], evList[j])) continue;
            const common = evList[i].personnel.filter(p => evList[j].personnel.includes(p));
            common.forEach(person => {
                addConflict(evList[i].id, { ...evList[j] details });
                addConflict(evList[j].id, { ...evList[i] details });
            });
        }
    }
});
```

The `O(n²)` inner loop is acceptable because the bucket is bounded: only events sharing the same person on the same day can end up in the same bucket, and that count is practically small (typically 2–6 events).

**Supervision-vs-Supervision exception (line 2987):** Two Supervision events that overlap the same person are not flagged. Supervision roles are structured (FOA, AUTH, SOF) and dual-booking is normal operational practice.

### Step 3 — `overlap()` Primitive

```js
// Lines 2557–2561
const overlap = (a, b) => {
    const aS = evStart(a), aE = evEnd(a), bS = evStart(b), bE = evEnd(b);
    if (aS == null || bS == null) return false;
    return aS < bE && bS < aE;
};
```

Uses strict half-open interval semantics: `aS < bE && bS < aE`. Two events that share only an endpoint (one ends at 10:00, the other starts at 10:00) do NOT conflict. Null-guard: if either event lacks a parseable start time, returns false.

`evStart` / `evEnd` helpers (lines 2535–2540):
- `evStart(ev)` — calls `timeToMinutes(ev.startTime)`; returns null on failure
- `evEnd(ev)` — uses `timeToMinutes(ev.endTime)` when present; falls back to `startTime + 60` when endTime absent; falls back to `TIMELINE_END` if startTime also absent

Note: `overlap()` uses `evEnd()` (raw logical end), NOT `visualEnd()`. Visual expansion for the `min-width:140px` card is a rendering concern and must not affect conflict logic. The `visualEnd()` function is used only inside the lane layout algorithms for overlap stacking.

### Step 4 — `addConflict()` Deduplication

Defined as a closure inside `detectConflicts`, per-invocation of the outer function:

```js
// Lines 2991–2998
const addConflict = (evId, entry) => {
    if (!conflicts.has(evId)) conflicts.set(evId, new Map());
    const cm = conflicts.get(evId);
    if (!cm.has(person)) cm.set(person, []);
    const arr = cm.get(person);
    const dup = arr.some(c => c.eventName === entry.eventName && c.startTime === entry.startTime && c.endTime === entry.endTime);
    if (!dup) arr.push(entry);
};
```

Deduplication key: `eventName + startTime + endTime`. This prevents the same conflicting event appearing twice for the same person, which was a real bug seen in archive `Conflict-duplication.png` and fixed in v3.3. Without this guard, the same conflict entry was being recorded once per person in `common[]` but the outer loop structure under certain merge scenarios could also produce it from multiple paths.

### Return Value

```
Map<eventId:string, Map<personName:string, ConflictEntry[]>>
```

Where each `ConflictEntry` is:
```
{ eventName, model, section, startTime, endTime, date }
```

The map is passed wholesale to every component that needs it; no component mutates it.

---

## Tooltip Portal System

### Why a Portal?

The conflict tooltip must appear above all event cards, pickers, and modals regardless of the CSS stacking context of the chip that triggers it. Event cards have `z-index` values in the 20s; pickers are in a fixed panel. A tooltip rendered inside either would be clipped by `overflow:hidden` or obscured by sibling elements at higher z-indices.

The fix (introduced in v3.0, line-numbered below for the current version) is a single `<div>` rendered at the `SchedulerView` root — outside the timeline and picker containers — with `position:fixed` and `z-index:9999`.

### State

```js
// Line 7541
const [tooltip, setTooltip] = useState(null);
// Shape: { text: string, x: number, y: number, above: boolean } | null
```

### Callbacks

```js
// Lines 7556–7561
const showTooltip = useCallback((text, rect) => {
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < 80;
    setTooltip({ text, x: rect.left + rect.width / 2, y: showAbove ? rect.top - 6 : rect.bottom + 6, above: showAbove });
}, []);
const hideTooltip = useCallback(() => setTooltip(null), []);
```

- `rect` is `getBoundingClientRect()` of the triggering chip or badge element
- `x` is the horizontal midpoint; CSS `translateX(-50%)` centers the portal div
- `showAbove` is true when fewer than 80px remain below the element — prevents picker chips at the bottom of the viewport from having their tooltip clipped below the viewport edge (v3.4 fix)
- When above: `y = rect.top - 6` with `transform: translate(-50%, -100%)`
- When below: `y = rect.bottom + 6` with `transform: translateX(-50%)`

### Portal Render

```js
// Lines 8237–8244
{tooltip && (
    <div className="conflict-tooltip-portal" style={{
        left: tooltip.x, top: tooltip.y,
        transform: tooltip.above ? 'translate(-50%, -100%)' : 'translateX(-50%)',
    }}>
        {tooltip.text}
    </div>
)}
```

### CSS

```css
/* Lines 404–418 */
.conflict-tooltip-portal {
    position: fixed;
    background: #1e1e3a;
    border: 1px solid #ef4444;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: .7rem;
    color: #fca5a5;
    white-space: pre-line;      /* renders \n as line breaks */
    z-index: 9999;
    pointer-events: none;       /* never intercepts mouse events */
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    max-width: 420px;
}
```

Light mode override (lines 1966–1971): white background, dark red text, border retained.

### Callback Threading

`showTooltip` and `hideTooltip` are defined in `SchedulerView` and passed down through the entire component tree:

```
SchedulerView
  → DayColumn (onShowTooltip, onHideTooltip)
    → EventCard (onShowTooltip, onHideTooltip)
      → PersonnelChip (onShowTooltip, onHideTooltip)   [crew chips on event card]
      conflict-badge (inline onMouseEnter/onMouseLeave)
  → PersonnelPicker (onShowTooltip, onHideTooltip)
    → PersonnelChip (onShowTooltip, onHideTooltip)     [chips in picker panel]
  → WhiteboardView (onShowTooltip, onHideTooltip)
    → WhiteboardFlying / WhiteboardGround (transitive)
```

The `conflicts` Map is passed in parallel along the same tree so that each `PersonnelChip` can call `getConflictText(event.id, name, conflicts)` to build the tooltip text before triggering `onShowTooltip`.

---

## Visual Indicators

### 1. Conflict Badge (Event Card)

```css
/* Lines 391–402 */
.conflict-badge {
    position: absolute;
    bottom: -3px; right: -3px;
    min-width: 14px; height: 14px;
    background: #a81a1a;
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.65rem; font-weight: 1000;
    color: white; z-index: 20;
    box-shadow: 0 0 6px rgba(239,68,68,0.6);
    padding: 0 3px;
}
```

Rendered at line 4450–4456 inside `EventCard`:
```js
{cCount > 0 && (
    <div className="conflict-badge"
        onMouseEnter={(e) => { if (onShowTooltip) { onShowTooltip(badgeTooltip, e.currentTarget.getBoundingClientRect()); } }}
        onMouseLeave={onHideTooltip}
    >
        {cCount}
    </div>
)}
```

- `cCount` = `eventConflictCount(event.id, conflicts)` = number of distinct personnel with conflicts on that event
- `badgeTooltip` is assembled at lines 4418–4429; format: `"SMITH → F-16 CF-1 07:00-09:00\nJONES → T-38 CF-2 08:00-10:00"`
- The badge is positioned at `bottom: -3px; right: -3px` — bottom-right corner of the event card
- The native `title` attribute is explicitly NOT used on the badge (removed in v3.1); portal tooltip only

### 2. Chip Conflict Outline (`.chip-conflict`)

```css
/* Lines 375–387 */
.chip-conflict {
    outline: 2px solid #fbbf24;
    outline-offset: -1px;
    box-shadow: 0 0 6px rgba(251,191,36,0.5);
    animation: conflict-pulse 2s ease-in-out infinite;
}

@keyframes conflict-pulse {
    0%, 100% { outline-color: rgba(251,191,36,0.9); box-shadow: 0 0 6px rgba(251,191,36,0.5); }
    50%       { outline-color: rgba(251,191,36,0.4); box-shadow: 0 0 3px rgba(251,191,36,0.2); }
}
```

Color is amber/yellow `#fbbf24`. This was changed from red (`#ef4444`) in v3.1 specifically because the red outline was invisible against the orange `FTC-B` and `STC-B` chip background color. The glow pulse ensures the outline is never confused with the chip's own background at any animation phase.

Applied in `PersonnelChip` at line 4302:
```js
className={`chip ${hasCon && !isUnavailable ? 'chip-conflict' : ''} ...`}
```

Note: `chip-conflict` is only applied when `hasCon && !isUnavailable`. When `isUnavailable` (focus mode), the chip uses `.picker-chip.unavailable` styling instead and does not pulse.

### 3. Conflict Icon (`!`)

```css
/* Line 387 */
.conflict-icon { color: #fbbf24; font-size: 0.55rem; font-weight: 700; }
```

Rendered inside the chip span at line 4312:
```js
{hasCon && <span className="conflict-icon">!</span>}
```

The `!` character width is always reserved in chip width measurement even when a chip has no conflict (lines 3226–3232). This prevents row height from changing when conflicts are first detected — a pessimistic but stable layout choice.

```js
// Lines 3226–3232
// Conflict icon (!) is always included pessimistically — we don't know at layout
// time which chips will have conflicts, and under-estimation causes row clipping.
const measureChipWidth = (name, isReadonly) => {
    ...
    w += CHIP_INNER_GAP + m.conflictW;   // always reserve space for '!'
    ...
};
```

### 4. Header Conflict Button

At line 8058–8067, in the app header, when `conflictCount > 0`:
```js
<button onClick={() => setShowConflictSummary(true)} className="text-red-400 ml-2">
    &#9888; {conflictCount} conflict{conflictCount > 1 ? 's' : ''}
</button>
```

`conflictCount` (lines 8039–8043) counts unique persons who appear in any conflict, not unique conflict pairs:
```js
const conflictCount = useMemo(() => {
    const people = new Set();
    conflicts.forEach(pm => pm.forEach((_, p) => people.add(p)));
    return people.size;
}, [conflicts]);
```

### 5. Conflict Summary Modal (`ConflictSummaryModal`)

Triggered by the header button or directly from state. Shows a multi-column layout (one column per day) with event blocks listing each conflicted person and the event(s) they are also on. Sorted by `SECTION_PRIORITY` then start time within each day. Auto-closes when `byDate.size === 0` (all conflicts resolved). Escape key closes it.

---

## Focus Mode Availability Check

Focus mode answers a different question than conflict detection: given a focused event, who across ALL working events would be unavailable if added?

### State

```js
// Lines 7547–7548
const [focusedEventId, setFocusedEventId] = useState(null);
const [focusEnabled, setFocusEnabled] = useState(true);  // default ON
```

### `focusedAvailability` Memo

```js
// Lines 7728–7757
const focusedAvailability = useMemo(() => {
    if (!focusedEventId || !focusEnabled) return null;
    const fev = workingEvents.find(e => e.id === focusedEventId);
    if (!fev) return null;
    const fStart = evStart(fev);
    const fEnd = evEnd(fev);
    const fDate = fev.date;
    // Map: person -> [{ eventName, model, startTime, endTime, assigned? }]
    const unavailable = new Map();
    // People already ON the focused event → mark as "assigned"
    fev.personnel.forEach(person => {
        unavailable.set(person, [{ eventName: fev.eventName, model: fev.model, startTime: fev.startTime, endTime: fev.endTime, assigned: true }]);
    });
    // People on overlapping events on the same date
    workingEvents.forEach(ev => {
        if (ev.id === focusedEventId) return;
        if (ev.date !== fDate) return;
        const eS = evStart(ev); const eE = evEnd(ev);
        if (eS == null || fStart == null) return;
        if (eS < fEnd && eE > fStart) {
            ev.personnel.forEach(person => {
                if (!unavailable.has(person)) unavailable.set(person, []);
                unavailable.get(person).push({ eventName: ev.eventName, model: ev.model, startTime: ev.startTime, endTime: ev.endTime });
            });
        }
    });
    return unavailable;
}, [focusedEventId, focusEnabled, workingEvents]);
```

Key design points:
- Checks **all** `workingEvents` (including readonly Supervision/Academics), not just visibleEvents
- People already on the focused event appear with `assigned: true` — they are greyed out too because they cannot be added again
- The overlap check here is inline, not calling `overlap()`, but uses identical half-open interval math (`eS < fEnd && eE > fStart`)
- Returns `null` when focus is off or no event is focused; `null` propagates down to `PersonnelPicker` where `focusedAvailability && focusedAvailability.has(p.name)` short-circuits

### Picker Display

In `PersonnelPicker` at lines 4907–4924:
```js
const isUnavailable = focusedAvailability && focusedAvailability.has(p.name);
const unavailText = isUnavailable
    ? focusedAvailability.get(p.name).map(c =>
        `${c.assigned ? 'Assigned: ' : 'Busy: '}${c.model ? c.model + ' ' : ''}${c.eventName} (${c.startTime}-${c.endTime || '??'})`
      ).join('\n')
    : null;
```

Chips pass either `unavailText` (focus mode) or `personConflictSummary.get(p.name)` (regular conflict mode) as `conflictText` — never both simultaneously.

### CSS

```css
/* Lines 421–433 */
.event-card.focused {
    z-index: 25;
    filter: brightness(1.2);
    box-shadow: 0 0 0 2px #3b82f6, 0 4px 16px rgba(59,130,246,0.4);
}
.event-card.dimmed {
    opacity: 0.35;
    filter: brightness(0.7);
}
.picker-chip.unavailable {
    opacity: 0.3;
    filter: grayscale(0.8);
}
```

`isFocused` and `isDimmed` are computed in `DayColumn` at lines 4704–4705:
```js
isFocused={focusEnabled && focusedEventId === ev.id}
isDimmed={focusEnabled && !!focusedEventId && focusedEventId !== ev.id}
```

Focus is cleared when:
- Clicking outside any event card on the timeline area (line 8116: `onClick` on `.timeline-area` checks `!e.target.closest('.event-card')`)
- Pressing Escape (line 7762–7765)
- Switching to Rainbow view (line 7760: `useEffect` on `viewMode`)
- Toggling Focus OFF (line 8092: toggle button sets `focusEnabled = false` and clears `focusedEventId`)

---

## State Connections

| State | Type | Owner | Notes |
|---|---|---|---|
| `workingEvents` | `Event[]` | `SchedulerView` | The primary input to `detectConflicts`; changes on every add/remove/edit/cancel |
| `conflicts` | `Map<id,Map<name,entry[]>>` | `SchedulerView` useMemo | Derived; passed as prop to DayColumn, EventCard, PersonnelPicker, WhiteboardView, ConflictSummaryModal |
| `tooltip` | `{text,x,y,above}\|null` | `SchedulerView` | Drives the portal div render; set/cleared via `showTooltip`/`hideTooltip` |
| `focusedEventId` | `string\|null` | `SchedulerView` | Active focus target; null = no focus |
| `focusEnabled` | `boolean` | `SchedulerView` | Gate for focus mode; default true |
| `focusedAvailability` | `Map<name,entry[]>\|null` | `SchedulerView` useMemo | Derived from `focusedEventId + workingEvents`; passed only to `PersonnelPicker` |
| `showConflictSummary` | `boolean` | `SchedulerView` | Controls `ConflictSummaryModal` mount |
| `conflictCount` | `number` | `SchedulerView` useMemo | Unique conflicted-person count; drives header button visibility |

---

## Cross-Compartment Dependencies

### Depends On (Inbound)

| Compartment | Symbol | Relationship |
|---|---|---|
| Timeline/Layout | `evStart(ev)`, `evEnd(ev)` | `overlap()` and `focusedAvailability` use these to convert time strings to minutes |
| Event Parser | `ev.cancelled`, `ev.personnel`, `ev.date`, `ev.startTime`, `ev.endTime`, `ev.section` | Core fields the algorithm reads |
| Event Parser | `ev.readonly` | Not read by conflict detection itself, but upstream logic decides which events reach `workingEvents` |
| Timeline/Layout | `visualEnd()` | NOT used by conflict detection. Used by layout only. Confusion here caused a past bug; see Bug History |
| Picker | `PersonnelChip` props `conflictText`, `isUnavailable`, `onShowTooltip`, `onHideTooltip` | Conflict system threads callbacks and text into the chip |
| Whiteboard | `WhiteboardFlying`, `WhiteboardGround`, `WhiteboardSupervision` | Receive `conflicts` and `focusedEventId` for row highlight/dim |

### Provides To (Outbound)

| Recipient | What |
|---|---|
| `EventCard` | `conflicts` Map, `onShowTooltip`, `onHideTooltip` — for badge and chip tooltip wiring |
| `PersonnelChip` (event card) | `conflictText` (from `getConflictText`), `onShowTooltip`, `onHideTooltip` |
| `PersonnelChip` (picker) | `conflictText` (from `personConflictSummary` or `focusedAvailability`), `isUnavailable`, `isBusy`, `onShowTooltip`, `onHideTooltip` |
| `DayColumn` | `conflicts`, focus props |
| `ConflictSummaryModal` | `conflicts`, `workingEvents` |
| App header | `conflictCount` for the warning button |

---

## Bug History & Known Issues

### Fixed Bugs

**v1.0 — Initial:** Conflict detection present from the first prototype but tooltip was only the chip's native `title` attribute. "Unclear what conflicts there are. It is highlighted, but I just don't know what the issue is." (feedback.txt line 9)

**v2.0 — Tooltip detail added:** Badge hover now showed specific event names/times. "Top row conflict popups are obscured by timeline." (feedback.txt line 20) — tooltip was rendered inside the timeline container, clipped by its stacking context.

**v3.0 — Portal tooltip:** Fixed by rendering tooltip at app root with `position:fixed; z-index:9999`. Also added conflict detail text to badge tooltip (not just chip tooltip).

**v3.1 — Amber outline:** "Orange color scheme makes it difficult to see red bar around name." (feedback.txt line 30). Changed chip conflict outline from red `#ef4444` to amber `#fbbf24` with glow animation. Also removed the native `title` attribute from the conflict badge — it was creating a duplicate browser tooltip overlapping the portal tooltip. (version-history.md line 45)

**v3.1 — Picker conflicts missing detail:** "When I hover, it just says 'CONFLICT: Also on Has time conflict.'" (feedback.txt line 33). Fixed by building `personConflictSummary` in `PersonnelPicker` from the full `conflicts` Map with actual event names, times, and dates.

**v3.3 — Conflict tooltip deduplication:** Archive screenshot `Conflict-duplication.png` showed duplicate conflict entries for the same person. Fixed by the `addConflict()` dedup guard keying on `eventName + startTime + endTime` (version-history.md line 68).

**v3.3 — Picker tooltip threading:** "Not sure what the flashing bounding box in puck chooser means... doesn't show anything about the conflict when hovering." (feedback.txt line 127). Fixed by threading `onShowTooltip`/`onHideTooltip` from `SchedulerView` through `PersonnelPicker` to `PersonnelChip` (version-history.md line 69).

**v3.4 — Focus mode assigned grey-out:** After dragging a person onto the focused event, they remained shown as available. Fixed by including focused event's own personnel in `focusedAvailability` with `assigned: true` (version-history.md line 90). Tooltip prefix distinguishes `Assigned:` vs `Busy:`.

**v3.4 — Viewport-aware tooltip position:** Picker chips at the bottom of the viewport had their tooltips clipped below the window. Fixed by checking `spaceBelow < 80` and rendering above when true (version-history.md line 89).

**v3.5 — Tooltip artifact on chip delete:** "Artifact when messing with picker and choosing people and looking at their conflicts. Happens when I hover over a person with a conflict, hit the x to delete them. It stays until I hover over any other person." (feedback.txt line 168). Fixed by having the `PersonnelChip` X-button call `onHideTooltip()` before `onRemove()`:

```js
// Line 4313
<span className="chip-remove" onClick={(e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onHideTooltip) onHideTooltip();   // clear tooltip BEFORE chip is destroyed
    onRemove(name);
}}>✕</span>
```

Without this, the tooltip `div` remained visible after the chip was unmounted because React batches the DOM removal and no `onMouseLeave` fires on an unmounted element.

**v3.8.0 — Cancelled events excluded:** Cancelled events (`ev.cancelled === true`) are skipped in the `pdMap` construction phase at line 2971. Before this, a cancelled event could still appear as a conflict source even though the person was not actually scheduled.

### Known Issues / Watch Items

1. **Supervision-vs-Supervision exclusion is coarse:** All supervision-vs-supervision pairs are excluded (line 2987). If in the future a person holds two incompatible supervision roles simultaneously, that conflict would be silently missed. This is acceptable under current operational patterns but should be revisited if supervision roles expand.

2. **`overlap()` uses `evEnd()` fallback `startTime + 60`:** When an event has no `endTime`, the algorithm assumes a 60-minute duration. This may produce false-positive conflicts for very short events or false-negative conflicts for long events. The fallback was chosen pragmatically; the real fix is ensuring all events from the parser populate `endTime`.

3. **Focus mode uses inline overlap logic, not `overlap()`:** The `focusedAvailability` memo duplicates the interval check (`eS < fEnd && eE > fStart`) rather than calling `overlap()`. This is functionally identical but means any future change to the overlap semantics (e.g., endpoint-inclusive) must be applied in two places.

4. **Conflict `!` icon width reserved pessimistically:** Every chip, even those without conflicts, reserves space for the `!` character (line 3232). This means chip rows are slightly wider than strictly necessary when no conflicts exist. This is intentional but wastes about 4–6px per chip per row.

---

## Change Impact Checklist

Use this checklist when modifying any part of the conflict detection compartment:

- [ ] **Changing `overlap()` semantics** — verify that `focusedAvailability`'s inline interval check (line 7749) is updated to match; verify that layout's `visualEnd()` usage is still NOT affected
- [ ] **Adding a new event section** — decide whether it should be excluded from Supervision-vs-Supervision logic (line 2987); ensure new section events reach `workingEvents` and are not filtered upstream before conflict detection
- [ ] **Changing cancelled event handling** — the `ev.cancelled` check at line 2971 must be the single authoritative gate; do not filter cancelled events upstream before they reach `detectConflicts` or the exclusion is lost
- [ ] **Changing tooltip position logic** — `showTooltip` (line 7556) is the single source of truth; changes propagate automatically; verify that the `80px` threshold is still appropriate for picker chips at the bottom of the viewport
- [ ] **Adding a new chip type** — if the chip can carry conflicts, wire `onShowTooltip`/`onHideTooltip` and ensure its X-remove button calls `onHideTooltip()` first (see v3.5 artifact bug)
- [ ] **Adding a new view (tab)** — pass `conflicts` from `SchedulerView` if the view shows personnel; consider whether `focusedAvailability` should propagate there; ensure focus is cleared on view switch if the new view cannot show focused state
- [ ] **Changing `evStart`/`evEnd` behavior** — verify `overlap()` still produces correct results; check the `focusedAvailability` inline check; run manual tests with events that have no `endTime`
- [ ] **Changing the `workingEvents` data shape** — `detectConflicts` reads `.cancelled`, `.personnel`, `.date`, `.startTime`, `.endTime`, `.section`, `.id`, `.eventName`, `.model`; any rename requires updating the algorithm and the `ConflictEntry` shape stored in the return Map
- [ ] **Adding events that should never conflict** — add a `continue` guard analogous to the Supervision-vs-Supervision check at line 2987; document the rationale
- [ ] **Changing the `ConflictSummaryModal`** — it depends on `SECTION_PRIORITY` and `SECTION_BADGE`/`SECTION_BADGE_COLOR` constants for sorting and display; ensure those constants cover any new sections
