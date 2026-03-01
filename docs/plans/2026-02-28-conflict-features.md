# Conflict Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three conflict-detection improvements: (1) exclude cancelled events from conflict detection, (2) reformat chip tooltip text to group by date chronologically, (3) add a clickable conflict summary modal in the header.

**Architecture:** All changes are in `Interactive-scheduler/interactive-scheduler.html` (single-file React 18 + Babel). Features 1 and 2 modify the `detectConflicts()` function and its downstream helpers. Feature 3 adds a new `ConflictSummaryModal` component and a header button trigger.

**Tech Stack:** React 18 (in-browser Babel), TailwindCSS, single HTML file — no build step.

---

## Task 1: Feature 1 — Exclude Cancelled Events from Conflict Detection

**Files:**
- Modify: `Interactive-scheduler/interactive-scheduler.html:2140`

### Step 1: Add the cancelled guard

Find `detectConflicts` at line ~2137. Inside the `allEvents.forEach(ev => {` loop (line 2140), add a one-line early return before `ev.personnel.forEach`:

```javascript
const detectConflicts = (allEvents) => {
    // Map: person||date -> [events]
    const pdMap = {};
    allEvents.forEach(ev => {
        if (ev.cancelled) return;          // ← ADD THIS LINE
        ev.personnel.forEach(person => {
            const k = `${person}||${ev.date}`;
            if (!pdMap[k]) pdMap[k] = [];
            pdMap[k].push(ev);
        });
    });
```

### Step 2: Manual test — basic exclusion

1. Load the scheduler and find a person shared across two overlapping events on the same day (or create test conditions with a custom event).
2. Confirm chip(s) on those events flash yellow with `!` (baseline conflict exists).
3. Right-click one of the events → action menu → **Cancel** it.
4. **Expected:** The CX badge appears on the cancelled event. The `!` conflict indicators disappear from ALL chips on both events (including the non-cancelled one). The header conflict count decreases.
5. Click the same event → **Un-cancel** it.
6. **Expected:** Conflict indicators return on both events. Header count increases.

### Step 3: Manual test — cancelled event's own chips

1. Open a cancelled event on the timeline (it should show CX badge + red border).
2. Confirm its chips do NOT have the yellow `!` flash.
3. Add a custom event that overlaps with the cancelled event and shares a person.
4. **Expected:** No conflict should appear. The person is free since the other event is cancelled.

### Step 4: Manual test — header conflict count

1. Note the current `⚠ N conflicts` count in the header.
2. Cancel one event involved in a conflict.
3. **Expected:** Count drops by the number of unique people whose conflicts were resolved by this cancellation.

### Step 5: Risk check before committing

Verify `ev.cancelled` is always `false` (not `undefined`) when events are loaded. Search for `cancelled:` in the file — confirm all event factories set `cancelled: false` explicitly. If any old event has `undefined`, the guard `if (ev.cancelled)` will correctly treat it as falsy (safe).

### Step 6: Commit

```bash
git add Interactive-scheduler/interactive-scheduler.html
git commit -m "fix(conflicts): exclude cancelled events from conflict detection"
```

---

## Task 2: Feature 2 — Date-Grouped Conflict Tooltip Text

**Files:**
- Modify: `Interactive-scheduler/interactive-scheduler.html:2170-2180` (add `date` field to conflict entries)
- Modify: `Interactive-scheduler/interactive-scheduler.html:2189-2198` (rewrite `getConflictText`)
- Modify: `Interactive-scheduler/interactive-scheduler.html:3623-3641` (rewrite `personConflictSummary` useMemo)

**Note:** `.conflict-tooltip-portal` already has `white-space: pre-line` at line ~402 — no CSS change needed. `\n` in tooltip text will render as line breaks automatically.

### Step 1: Add `date` field to conflict entries

Find the two `addConflict()` calls at lines ~2170 and ~2176. Add `date:` to each entry object:

```javascript
// Record on event i — add date: evList[j].date
addConflict(evList[i].id, {
    eventName: evList[j].eventName, model: evList[j].model,
    section: evList[j].section,
    startTime: evList[j].startTime, endTime: evList[j].endTime,
    date: evList[j].date,                                         // ← ADD
});
// Record on event j — add date: evList[i].date
addConflict(evList[j].id, {
    eventName: evList[i].eventName, model: evList[i].model,
    section: evList[i].section,
    startTime: evList[i].startTime, endTime: evList[i].endTime,
    date: evList[i].date,                                         // ← ADD
});
```

### Step 2: Rewrite `getConflictText()`

Replace the existing function body at lines ~2189-2198:

```javascript
const getConflictText = (eventId, person, conflicts) => {
    const ec = conflicts.get(eventId);
    if (!ec) return null;
    const pc = ec.get(person);
    if (!pc || pc.length === 0) return null;
    // Group by date, sort chronologically
    const byDate = new Map();
    pc.forEach(c => {
        const d = c.date || '?';
        if (!byDate.has(d)) byDate.set(d, []);
        const m = c.model ? `${c.model} ` : '';
        byDate.get(d).push(`  ${m}${c.eventName} (${c.startTime}-${c.endTime || '??'})`);
    });
    const lines = [];
    [...byDate.keys()].sort().forEach(date => {
        const fd = fmtDate(date);
        lines.push(`${fd.weekday} ${fd.day} ${fd.month}:`);
        byDate.get(date).forEach(l => lines.push(l));
    });
    return lines.join('\n');
};
```

### Step 3: Rewrite `personConflictSummary` useMemo in PersonnelPicker

Find the `personConflictSummary` useMemo inside `PersonnelPicker` at lines ~3623-3641. Replace entirely:

```javascript
const personConflictSummary = useMemo(() => {
    // person -> Map<date, Set<formattedEntry>>
    const summary = new Map();
    conflicts.forEach((personMap, eventId) => {
        personMap.forEach((confList, person) => {
            if (!summary.has(person)) summary.set(person, new Map());
            const dateMap = summary.get(person);
            confList.forEach(c => {
                const d = c.date || '?';
                if (!dateMap.has(d)) dateMap.set(d, new Set());
                const m = c.model ? `${c.model} ` : '';
                dateMap.get(d).add(`  ${m}${c.eventName} (${c.startTime}-${c.endTime || '??'})`);
            });
        });
    });
    // Convert to formatted strings grouped by date
    const result = new Map();
    summary.forEach((dateMap, person) => {
        const lines = [];
        [...dateMap.keys()].sort().forEach(date => {
            const fd = fmtDate(date);
            lines.push(`${fd.weekday} ${fd.day} ${fd.month}:`);
            dateMap.get(date).forEach(l => lines.push(l));
        });
        result.set(person, lines.join('\n'));
    });
    return result;
}, [conflicts]);
```

### Step 4: Manual test — tooltip format

1. Hover over a flashing `!` chip on the timeline (event card).
2. **Expected tooltip:**
   ```
   Also on:
   MON 02 Mar:
     F-16 AAR (0800-1000)
   TUE 03 Mar:
     Ground AERO (0900-1100)
   ```
3. Hover over a flashing chip in the **Picker panel** (left side).
4. **Expected:** Same date-grouped format (no "Also on:" prefix — picker chips use conflictText directly).
5. Verify a person with conflicts on only ONE date shows a single date header with events under it.
6. Verify a person with NO conflicts shows no `!` and no tooltip.

### Step 5: Commit

```bash
git add Interactive-scheduler/interactive-scheduler.html
git commit -m "feat(conflicts): date-grouped chip tooltip text with chronological ordering"
```

---

## Task 3: Feature 3 — Conflict Summary Modal

**Files:**
- Modify: `Interactive-scheduler/interactive-scheduler.html` — add `ConflictSummaryModal` component (insert before `PersonnelChip`, ~line 3257)
- Modify: `Interactive-scheduler/interactive-scheduler.html:5122` — add `showConflictSummary` state to `SchedulerView`
- Modify: `Interactive-scheduler/interactive-scheduler.html:5141` — make conflict count clickable
- Modify: `Interactive-scheduler/interactive-scheduler.html:5263` — render modal alongside other portals

### Step 1: Add section priority + badge constants (near SECTION_ORDER, line ~1675)

Add immediately after `const SECTION_ORDER`:

```javascript
const SECTION_PRIORITY = { Flying: 1, Ground: 2, Academics: 3, NA: 4, Supervision: 5 };
const SECTION_BADGE    = { Flying: 'FLT', Ground: 'GND', Academics: 'ACD', NA: 'N/A', Supervision: 'SP' };
const SECTION_BADGE_COLOR = { Flying: '#3b82f6', Ground: '#16a34a', Academics: '#7c3aed', NA: '#475569', Supervision: '#d97706' };
```

### Step 2: Add `ConflictSummaryModal` component

Insert the full component before `PersonnelChip` (~line 3257). The component accepts `{ conflicts, workingEvents, onClose }`:

```javascript
const ConflictSummaryModal = ({ conflicts, workingEvents, onClose }) => {
    const byDate = React.useMemo(() => {
        const map = new Map(); // date -> [{event, personConflicts: [{person, alsoOn}]}]
        conflicts.forEach((personMap, eventId) => {
            const event = workingEvents.find(e => e.id === eventId);
            if (!event) return;
            const date = event.date;
            if (!map.has(date)) map.set(date, []);
            const personConflicts = [];
            personMap.forEach((confList, person) => {
                const alsoOn = confList.map(c => {
                    const m = c.model ? `${c.model} ` : '';
                    return `${m}${c.eventName}`;
                }).join(', ');
                personConflicts.push({ person, alsoOn });
            });
            personConflicts.sort((a, b) => a.person.localeCompare(b.person));
            map.get(date).push({ event, personConflicts });
        });
        // Sort events within each day by section priority then start time
        map.forEach(events => {
            events.sort((a, b) => {
                const pa = SECTION_PRIORITY[a.event.section] || 99;
                const pb = SECTION_PRIORITY[b.event.section] || 99;
                if (pa !== pb) return pa - pb;
                return (a.event.startTime || '').localeCompare(b.event.startTime || '');
            });
        });
        return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    }, [conflicts, workingEvents]);

    if (byDate.size === 0) return null;

    return (
        <div
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
                     display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 56 }}
        >
            <div style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                          width: '92vw', maxWidth: 1300, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f87171',
                                   textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        ⚠ Conflict Summary
                    </span>
                    <button onClick={onClose}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                                     cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '2px 4px' }}>✕</button>
                </div>
                {/* Day columns */}
                <div style={{ display: 'flex', gap: 0, overflowX: 'auto', overflowY: 'auto',
                              padding: '12px 14px', flex: 1, alignItems: 'flex-start' }}>
                    {[...byDate.entries()].map(([date, events], colIdx) => {
                        const fd = fmtDate(date);
                        return (
                            <div key={date} style={{ minWidth: 230, maxWidth: 270, flexShrink: 0,
                                                     borderRight: '1px solid rgba(255,255,255,0.06)',
                                                     paddingRight: 14, marginRight: 14 }}>
                                {/* Day header */}
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8',
                                              textTransform: 'uppercase', letterSpacing: '0.08em',
                                              marginBottom: 10, paddingBottom: 4,
                                              borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    {fd.weekday} {fd.day} {fd.month}
                                </div>
                                {/* Event blocks */}
                                {events.map(({ event, personConflicts }) => {
                                    const badge = SECTION_BADGE[event.section] || 'OTH';
                                    const bColor = SECTION_BADGE_COLOR[event.section] || '#475569';
                                    const mPrefix = event.model ? `${event.model} ` : '';
                                    const timeStr = event.startTime
                                        ? `${event.startTime}${event.endTime ? '–' + event.endTime : ''}`
                                        : '';
                                    return (
                                        <div key={event.id} style={{ marginBottom: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'baseline',
                                                          gap: 5, marginBottom: 2 }}>
                                                <span style={{ fontSize: '0.5rem', fontWeight: 700,
                                                               color: '#fff', background: bColor,
                                                               padding: '1px 4px', borderRadius: 3,
                                                               flexShrink: 0 }}>{badge}</span>
                                                <span style={{ fontSize: '0.63rem', color: '#e2e8f0',
                                                               fontWeight: 600, lineHeight: 1.3 }}>
                                                    {mPrefix}{event.eventName}
                                                </span>
                                            </div>
                                            {timeStr && (
                                                <div style={{ fontSize: '0.57rem', color: '#64748b',
                                                              marginBottom: 4, paddingLeft: 2 }}>
                                                    {timeStr}
                                                </div>
                                            )}
                                            {personConflicts.map(({ person, alsoOn }) => (
                                                <div key={person}
                                                     style={{ fontSize: '0.6rem', paddingLeft: 6,
                                                              lineHeight: 1.6, color: '#cbd5e1' }}>
                                                    <span style={{ color: '#f87171', marginRight: 3 }}>⚠</span>
                                                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>{person}</span>
                                                    <span style={{ color: '#64748b' }}> → </span>
                                                    <span style={{ color: '#94a3b8' }}>{alsoOn}</span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
```

### Step 3: Add `showConflictSummary` state to `SchedulerView`

Near the top of `SchedulerView` where other modal states are defined (look for `const [showCreateEvent` or similar), add:

```javascript
const [showConflictSummary, setShowConflictSummary] = useState(false);
```

### Step 4: Make the conflict count header badge clickable

Find line ~5141:
```jsx
{conflictCount > 0 && <span className="text-red-400 ml-2">⚠ {conflictCount} conflict{conflictCount > 1 ? 's' : ''}</span>}
```

Replace with:
```jsx
{conflictCount > 0 && (
    <button
        onClick={() => setShowConflictSummary(true)}
        style={{ background: 'none', border: 'none', cursor: 'pointer',
                 fontFamily: 'inherit', fontSize: 'inherit', padding: 0 }}
        className="text-red-400 ml-2"
        title="View conflict summary"
    >
        ⚠ {conflictCount} conflict{conflictCount > 1 ? 's' : ''}
    </button>
)}
```

### Step 5: Render the modal

Find where other modals/portals are rendered near the bottom of `SchedulerView`'s return (around line 5255, near `CreateEventModal`, `EventActionMenu`, tooltip portal). Add:

```jsx
{showConflictSummary && (
    <ConflictSummaryModal
        conflicts={conflicts}
        workingEvents={workingEvents}
        onClose={() => setShowConflictSummary(false)}
    />
)}
```

### Step 6: Manual test — modal

1. Load the scheduler with conflicting events.
2. Click `⚠ N conflicts` in the header.
3. **Expected:** Modal opens showing day columns left-to-right, each day containing event blocks sorted Flying → Ground → Academics → NA.
4. Within each event block: `[FLT]` badge + event name, time below, then `⚠ Person → other event` lines.
5. Verify clicking outside the modal (the dark overlay) closes it.
6. Verify the `✕` button closes it.
7. Cancel an event that has conflicts → reopen modal → **Expected:** that event no longer appears.
8. **Light mode check:** Open modal in light mode. Visuals may be imperfect (no light overrides added yet) — acceptable for v3.13.0.

### Step 7: Bump version and commit

Update the HTML comment at line 1 from `v3.12.0` to `v3.13.0`. Also update any version string rendered in the UI if present.

```bash
git add Interactive-scheduler/interactive-scheduler.html
git commit -m "feat(conflicts): v3.13.0 — cancelled exclusion, date-grouped tooltips, conflict summary modal"
```

---

## Suggested Test Scenarios (Cross-Feature Validation)

After all three tasks are done, run these end-to-end checks:

| # | Scenario | Expected |
|---|----------|----------|
| A | Person X on Flight A + Ground B (same time) → cancel Flight A | No `!` on Ground B chips; conflict count drops; Flight A absent from summary modal |
| B | Un-cancel Flight A | `!` returns on Ground B; count restores; Flight A reappears in modal |
| C | Hover `!` chip on Ground B | Tooltip shows date header + Flight A entry |
| D | Hover `!` chip in Picker for Person X | Same date-grouped format in picker tooltip |
| E | Person Y with conflicts on 3 different dates | Tooltip shows 3 date headers, each with their events |
| F | Open summary modal → verify day columns in date order (Mon before Tue etc.) | ✓ |
| G | Within one day: Flying conflict and Ground conflict present | Flying block appears above Ground block |
| H | Custom event cancelled that was causing a conflict | Conflict clears (custom events respect `cancelled` flag) |
