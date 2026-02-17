# Net Change Summary -- Design & Implementation

> **Issue:** 8.0d from AGENT-INSTRUCTIONS.md
> **Status:** Design complete, ready for integration
> **Author:** Reasoning agent (Opus 4.5)
> **Date:** 2026-02-05

---

## 1. Reasoning

### The core insight

The raw `changes` array is an **append-only log** of individual mutations. It must stay that way for undo to work (each entry maps to exactly one reversible operation). But the *display* of that log should show the **net effect** -- what a human scheduler needs to actually do to the spreadsheet.

### Scenario analysis

I will walk through each scenario to validate the algorithm before writing code.

**Scenario 1: Simple add**
```
changes: [{ type:'add', person:'Borek', eventId:'evt-5' }]
net state for Borek: added to evt-5
display: "Add Borek to F-16 CF-1 (08:15)"
```

**Scenario 2: Simple remove**
```
changes: [{ type:'remove', person:'Borek', eventId:'evt-5' }]
net state for Borek: removed from evt-5
display: "Remove Borek from F-16 CF-1 (08:15)"
```

**Scenario 3: Net zero (add then remove same event)**
```
changes: [
  { type:'add', person:'Borek', eventId:'evt-5' },
  { type:'remove', person:'Borek', eventId:'evt-5' }
]
net state for Borek: +1 -1 = 0 on evt-5
display: (nothing)
```

**Scenario 4: Move (remove from A, add to B)**
```
changes: [
  { type:'remove', person:'Borek', eventId:'evt-3' },
  { type:'add', person:'Borek', eventId:'evt-5' }
]
net state for Borek: -1 on evt-3, +1 on evt-5 => one remove, one add => MOVE
display: "Move Borek: F-16 CF-1 (08:15) -> C-172 GS (10:00)"
```

**Scenario 5: Partial net (add to A, remove from A, add to B)**
```
changes: [
  { type:'add', person:'Borek', eventId:'evt-3' },
  { type:'remove', person:'Borek', eventId:'evt-3' },
  { type:'add', person:'Borek', eventId:'evt-5' }
]
net state for Borek: evt-3 net=0, evt-5 net=+1
display: "Add Borek to C-172 GS (10:00)"
```

**Scenario 6: Bulk move (3 people moved from same source to same target)**
```
changes: [
  { type:'remove', person:'Knoerr', eventId:'evt-3' },
  { type:'add', person:'Knoerr', eventId:'evt-5' },
  { type:'remove', person:'Peterson', eventId:'evt-3' },
  { type:'add', person:'Peterson', eventId:'evt-5' },
  { type:'remove', person:'Morrison', eventId:'evt-3' },
  { type:'add', person:'Morrison', eventId:'evt-5' },
]
Each person: -1 on evt-3, +1 on evt-5 => MOVE
All three share same (source=evt-3, target=evt-5) => GROUP
display:
  "Move evt-3 (08:15) -> evt-5 (10:00)
     Knoerr, Peterson, Morrison"
```

**Scenario 7: Mixed (move Knoerr A->B, add Dobbs to B independently)**
```
Knoerr: move evt-3 -> evt-5
Dobbs: add to evt-5
These do NOT group because they are different instruction types.
display:
  "Move Knoerr: evt-3 (08:15) -> evt-5 (10:00)"
  "Add Dobbs to evt-5 (10:00)"
```

**Scenario 8: Chain move (Borek A->B, then B->C)**
```
changes: [
  { type:'remove', person:'Borek', eventId:'evt-3' },
  { type:'add', person:'Borek', eventId:'evt-5' },
  { type:'remove', person:'Borek', eventId:'evt-5' },
  { type:'add', person:'Borek', eventId:'evt-7' },
]
net state for Borek: evt-3 net=-1, evt-5 net=0, evt-7 net=+1
=> one net-remove (evt-3), one net-add (evt-7) => MOVE
display: "Move Borek: evt-3 (08:15) -> evt-7 (13:00)"
```

**Scenario 9: Undo interaction**
When user undoes a raw change, that entry is removed from the `changes` array. Since `computeNetChanges` re-derives from the full array every time, the net display automatically updates. No special handling needed for the computation itself.

For the UI: grouped items need an undo button that undoes *all* raw changes contributing to that group. This is critical -- if a move shows as one line, the undo button must reverse the entire move (both the remove and the add).

### Algorithm design

**Step 1: Compute net counts per (person, eventId)**

For each change entry, accumulate a counter:
- `add` => +1
- `remove` => -1

After processing all changes, any (person, eventId) pair with net=0 is cancelled out.

**Step 2: Classify each person's net changes**

For each person, collect:
- `netRemoves`: list of eventIds where net < 0 (with event metadata)
- `netAdds`: list of eventIds where net > 0 (with event metadata)

Then classify:
- If person has exactly 1 net-remove and exactly 1 net-add => **MOVE**
- If person has only net-adds => each is a standalone **ADD**
- If person has only net-removes => each is a standalone **REMOVE**
- If person has multiple net-removes and/or multiple net-adds => pair them as **MOVE**s greedily (chronologically), with leftovers as standalone adds/removes

Actually, let me reconsider the multi-remove/multi-add case. In practice, a scheduler might move someone from A to B and also add them to C. That would be 1 remove + 2 adds. The most intuitive display is:
- Move person: A -> B
- Add person to C

But how do we decide which add pairs with which remove? We should pair them chronologically: the first remove pairs with the first add that comes after it in the raw change log. Let me think about this differently.

Actually, the simplest and most correct approach: for each person, if they have exactly N net-removes and N net-adds, those are N moves. If unequal, pair as many as possible (min(removes, adds)), and the remainder are standalone. Pairing order: chronological by when the first relevant raw change appeared.

But in practice, the overwhelming majority of cases will be:
- 0 removes, 1+ adds (pure adds)
- 1+ removes, 0 adds (pure removes)
- 1 remove, 1 add (single move)
- N removes, N adds from same source to same target (bulk move, which gets grouped)

I will keep the algorithm simple and handle the general case.

**Step 3: Group moves by (sourceEventId, targetEventId)**

Multiple people moved from the same source to the same target get grouped into one display entry.

**Step 4: Group standalone adds by targetEventId, standalone removes by sourceEventId**

Multiple people added to the same event get grouped. Multiple people removed from the same event get grouped.

**Step 5: Sort for display**

Sort groups by date, then by chronological order of their first contributing raw change.

**Step 6: Track raw indices for undo**

Each net instruction maps back to the set of raw change indices that contributed to it. The undo button reverses all of them.

### Important detail: tracking raw indices

When we accumulate net counts, we need to know *which* raw changes contributed. For a (person, eventId) pair with net=+1 from two adds and one remove, we need all three indices. When undoing, we must reverse all three in the correct order (last-in-first-out to maintain consistency).

Actually, let me reconsider. The undo for a grouped display item should undo the *entire net effect*. If the net effect is "Move Borek from A to C" (via A->B->C chain), undoing that should:
1. Remove Borek from C (reverse the add to C)
2. Add Borek back to A (reverse the remove from A)

But the intermediate changes (add to B, remove from B) have net=0 and are already cancelled. Those raw entries still exist in the array though, and they represent real state mutations that were already applied and then reversed.

Wait -- this is a subtlety. Let me re-examine.

The raw changes array after "move A->B then move B->C":
```
[0] remove from A
[1] add to B
[2] remove from B
[3] add to C
```

Current state: Borek is on C (not on A, not on B).

The net display says: "Move Borek: A -> C"

If user clicks undo on this, what should happen? We want to put Borek back on A and remove from C. That means we need to undo indices [3] (remove from C) and [0] (add back to A). But indices [1] and [2] are the intermediate B steps -- they already cancel each other. If we remove all four from the changes array, the net effect on state is:
- Undo [3] (was add to C): remove Borek from C
- Undo [2] (was remove from B): add Borek back to B
- Undo [1] (was add to B): remove Borek from B
- Undo [0] (was remove from A): add Borek back to A

Net effect: Borek on A, not on B, not on C. That is correct!

But the ORDER matters. The current `handleUndo` reverses one change at a time. For a group undo, we need to reverse them in reverse chronological order (last change first). And we need a new `handleUndoGroup` that takes a list of indices.

OK let me finalize the approach:

- Each net instruction carries `rawIndices: number[]` -- the indices into the `changes` array of all raw changes that contribute to this net instruction
- "Undo" on a net instruction calls a new `handleUndoGroup(indices)` that reverses all those raw changes in reverse order and removes them from the array
- This correctly handles chain moves, net-zero intermediates, etc.

### Edge case: what if a group undo partially fails?

If one of the events no longer exists (was somehow removed), the undo of that specific change is a no-op but the others still proceed. This matches the current single-undo behavior.

---

## 2. `computeNetChanges(changes)` function

```js
/**
 * Computes net-effect display instructions from a raw changes array.
 * Pure function -- does not mutate the input.
 *
 * @param {Array} changes - Raw chronological changes array
 * @returns {Array} netInstructions - Array of display-ready instruction objects
 *
 * Each instruction has shape:
 * {
 *   type: 'add' | 'remove' | 'move',
 *   persons: string[],           // one or more people
 *   date: string,                // ISO date for display grouping
 *   // For 'add': target event info
 *   // For 'remove': source event info
 *   // For 'move': both source and target
 *   source: { eventId, eventName, eventModel, eventTime, eventSection } | null,
 *   target: { eventId, eventName, eventModel, eventTime, eventSection } | null,
 *   rawIndices: number[],        // indices into original changes array (for undo)
 *   firstIndex: number,          // earliest raw index (for chronological sorting)
 * }
 */
function computeNetChanges(changes) {
    if (!changes || changes.length === 0) return [];

    // Step 1: Accumulate net count per (person, eventId) and track contributing indices
    // Key: "person||eventId"
    const netMap = new Map(); // key -> { net: number, indices: number[], person, eventMeta }

    changes.forEach((ch, idx) => {
        const key = `${ch.person}||${ch.eventId}`;
        if (!netMap.has(key)) {
            netMap.set(key, {
                net: 0,
                indices: [],
                person: ch.person,
                eventId: ch.eventId,
                eventMeta: {
                    eventId: ch.eventId,
                    eventName: ch.eventName,
                    eventModel: ch.eventModel,
                    eventTime: ch.eventTime,
                    eventSection: ch.eventSection,
                    date: ch.date,
                },
            });
        }
        const entry = netMap.get(key);
        entry.net += (ch.type === 'add' ? 1 : -1);
        entry.indices.push(idx);
    });

    // Step 2: For each person, collect net-adds and net-removes (skip net-zero pairs)
    const personEffects = new Map(); // person -> { adds: [...], removes: [...], zeroIndices: [...] }

    for (const [, entry] of netMap) {
        if (!personEffects.has(entry.person)) {
            personEffects.set(entry.person, { adds: [], removes: [], zeroIndices: [] });
        }
        const pe = personEffects.get(entry.person);
        if (entry.net > 0) {
            // Net add (could be net > 1 in theory, but practically always 1)
            pe.adds.push(entry);
        } else if (entry.net < 0) {
            // Net remove
            pe.removes.push(entry);
        } else {
            // Net zero -- these indices are "silent" but still part of the undo group
            pe.zeroIndices.push(...entry.indices);
        }
    }

    // Step 3: Classify into moves, adds, removes
    // A move = pairing a net-remove with a net-add for the same person
    const rawInstructions = []; // before grouping

    for (const [person, pe] of personEffects) {
        // Sort adds and removes by their earliest raw index (chronological)
        pe.adds.sort((a, b) => Math.min(...a.indices) - Math.min(...b.indices));
        pe.removes.sort((a, b) => Math.min(...a.indices) - Math.min(...b.indices));

        const numMoves = Math.min(pe.adds.length, pe.removes.length);

        // Pair moves
        for (let i = 0; i < numMoves; i++) {
            const rem = pe.removes[i];
            const add = pe.adds[i];
            const allIndices = [...rem.indices, ...add.indices];
            // Include zero-contribution indices if this is the only move for this person
            // (they represent intermediate steps in a chain)
            if (numMoves === 1 && pe.adds.length === 1 && pe.removes.length === 1) {
                allIndices.push(...pe.zeroIndices);
            }
            rawInstructions.push({
                type: 'move',
                person,
                date: rem.eventMeta.date, // use source date for grouping
                source: rem.eventMeta,
                target: add.eventMeta,
                rawIndices: allIndices,
                firstIndex: Math.min(...allIndices),
            });
        }

        // If there were multiple moves AND zero-indices, distribute zeros to the first move
        if (numMoves > 1 && pe.zeroIndices.length > 0) {
            rawInstructions[rawInstructions.length - numMoves].rawIndices.push(...pe.zeroIndices);
        }

        // Remaining adds (not paired with a remove)
        for (let i = numMoves; i < pe.adds.length; i++) {
            const add = pe.adds[i];
            rawInstructions.push({
                type: 'add',
                person,
                date: add.eventMeta.date,
                source: null,
                target: add.eventMeta,
                rawIndices: [...add.indices],
                firstIndex: Math.min(...add.indices),
            });
        }

        // Remaining removes (not paired with an add)
        for (let i = numMoves; i < pe.removes.length; i++) {
            const rem = pe.removes[i];
            rawInstructions.push({
                type: 'remove',
                person,
                date: rem.eventMeta.date,
                source: rem.eventMeta,
                target: null,
                rawIndices: [...rem.indices],
                firstIndex: Math.min(...rem.indices),
            });
        }
    }

    // Step 4: Group by instruction type and event pair
    // Moves: group by (sourceEventId, targetEventId)
    // Adds: group by targetEventId
    // Removes: group by sourceEventId
    const groupMap = new Map(); // groupKey -> { type, persons, date, source, target, rawIndices, firstIndex }

    rawInstructions.forEach(inst => {
        let groupKey;
        if (inst.type === 'move') {
            groupKey = `move||${inst.source.eventId}||${inst.target.eventId}`;
        } else if (inst.type === 'add') {
            groupKey = `add||${inst.target.eventId}`;
        } else {
            groupKey = `remove||${inst.source.eventId}`;
        }

        if (!groupMap.has(groupKey)) {
            groupMap.set(groupKey, {
                type: inst.type,
                persons: [],
                date: inst.date,
                source: inst.source,
                target: inst.target,
                rawIndices: [],
                firstIndex: inst.firstIndex,
            });
        }

        const group = groupMap.get(groupKey);
        group.persons.push(inst.person);
        group.rawIndices.push(...inst.rawIndices);
        group.firstIndex = Math.min(group.firstIndex, inst.firstIndex);
    });

    // Step 5: Convert to array and sort by date, then chronological order
    const result = Array.from(groupMap.values());
    result.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.firstIndex - b.firstIndex;
    });

    return result;
}
```

---

## 3. Updated `ChangeSummary` component

```jsx
// ---- CHANGE SUMMARY (v3 -- net changes with grouping) ----

const ChangeSummary = ({ changes, onUndoGroup, onClearAll, onCopy }) => {
    const netInstructions = useMemo(() => computeNetChanges(changes), [changes]);

    // Group by date for display
    const byDate = useMemo(() => {
        const m = {};
        netInstructions.forEach(inst => {
            if (!m[inst.date]) m[inst.date] = [];
            m[inst.date].push(inst);
        });
        return m;
    }, [netInstructions]);

    const sortedDates = Object.keys(byDate).sort();

    // Count net changes (not raw)
    const netCount = netInstructions.length;

    const formatEvent = (meta) => {
        if (!meta) return '';
        const model = meta.eventModel ? `${meta.eventModel} | ` : '';
        return `${model}${meta.eventName} (${meta.eventTime})`;
    };

    return (
        <div className="change-summary-panel">
            <div className="change-summary-header">
                <span>Change Summary</span>
                <span className="text-xs font-normal text-gray-500">
                    {netCount > 0 ? netCount : ''}
                    {netCount > 0 && netCount !== changes.length && (
                        <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: 4 }}>
                            ({changes.length} raw)
                        </span>
                    )}
                </span>
            </div>
            <div className="change-list">
                {sortedDates.length === 0 && changes.length === 0 && (
                    <div className="text-center text-gray-600 text-xs py-8">
                        No changes yet.<br/>Drag personnel to events<br/>or remove with x.
                    </div>
                )}
                {sortedDates.length === 0 && changes.length > 0 && (
                    <div className="text-center text-gray-600 text-xs py-8">
                        All changes cancel out.<br/>Net effect: no changes.
                    </div>
                )}
                {sortedDates.map(date => {
                    const h = fmtDate(date);
                    return (
                        <div key={date}>
                            <div className="change-date-group">{h.full}</div>
                            {byDate[date].map((inst, i) => (
                                <NetChangeEntry
                                    key={`${date}-${i}`}
                                    inst={inst}
                                    formatEvent={formatEvent}
                                    onUndo={() => onUndoGroup(inst.rawIndices)}
                                />
                            ))}
                        </div>
                    );
                })}
            </div>
            {changes.length > 0 && (
                <div className="change-summary-footer">
                    <button onClick={onCopy}
                        className="bg-blue-600 hover:bg-blue-500 text-white">
                        Copy
                    </button>
                    <button onClick={onClearAll}
                        className="bg-transparent text-red-400 hover:bg-red-900/30"
                        style={{ border: '1px solid rgba(239,68,68,0.3)' }}>
                        Clear All
                    </button>
                </div>
            )}
        </div>
    );
};

const NetChangeEntry = ({ inst, formatEvent, onUndo }) => {
    const isSingle = inst.persons.length === 1;

    if (inst.type === 'move') {
        return (
            <div className="change-entry" style={{ flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, width: '100%' }}>
                    <span className="change-icon-move" style={{
                        color: '#3b82f6', fontWeight: 700, fontSize: '0.7rem', flexShrink: 0
                    }}>
                        &rarr;
                    </span>
                    <div className="change-detail" style={{ flex: 1 }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                            {formatEvent(inst.source)}
                        </span>
                        <span style={{ color: '#3b82f6', margin: '0 4px' }}>&rarr;</span>
                        <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                            {formatEvent(inst.target)}
                        </span>
                    </div>
                    <span className="change-undo" onClick={onUndo} title="Undo all">&#8617;</span>
                </div>
                <div style={{
                    paddingLeft: 18, color: '#93c5fd',
                    fontSize: '0.55rem', lineHeight: 1.4
                }}>
                    {inst.persons.join(', ')}
                </div>
            </div>
        );
    }

    if (inst.type === 'add') {
        const evt = formatEvent(inst.target);
        return (
            <div className="change-entry">
                <span className="change-icon-add">+</span>
                <div className="change-detail">
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Add to </span>
                    {evt}
                    <br/>
                    <span style={{ color: '#6ee7b7' }}>{inst.persons.join(', ')}</span>
                </div>
                <span className="change-undo" onClick={onUndo} title="Undo all">&#8617;</span>
            </div>
        );
    }

    // remove
    const evt = formatEvent(inst.source);
    return (
        <div className="change-entry">
            <span className="change-icon-remove">&minus;</span>
            <div className="change-detail">
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Remove from </span>
                {evt}
                <br/>
                <span style={{ color: '#fca5a5' }}>{inst.persons.join(', ')}</span>
            </div>
            <span className="change-undo" onClick={onUndo} title="Undo all">&#8617;</span>
        </div>
    );
};
```

---

## 4. Updated `handleCopy` function

```js
const handleCopy = useCallback(() => {
    const netInstructions = computeNetChanges(changes);
    if (netInstructions.length === 0) return;

    const lines = [];
    const byDate = {};
    netInstructions.forEach(inst => {
        if (!byDate[inst.date]) byDate[inst.date] = [];
        byDate[inst.date].push(inst);
    });

    Object.keys(byDate).sort().forEach(date => {
        const h = fmtDate(date);
        lines.push(`--- ${h.full} ---`);
        byDate[date].forEach(inst => {
            const fmtEvt = (meta) => {
                if (!meta) return '';
                const mdl = meta.eventModel ? `${meta.eventModel} | ` : '';
                return `${mdl}${meta.eventName} (${meta.eventTime})`;
            };

            if (inst.type === 'move') {
                lines.push(`  MOVE: ${fmtEvt(inst.source)}  -->  ${fmtEvt(inst.target)}`);
                lines.push(`        ${inst.persons.join(', ')}`);
            } else if (inst.type === 'add') {
                lines.push(`  ADD to ${fmtEvt(inst.target)}:`);
                lines.push(`        ${inst.persons.join(', ')}`);
            } else {
                lines.push(`  REMOVE from ${fmtEvt(inst.source)}:`);
                lines.push(`        ${inst.persons.join(', ')}`);
            }
        });
        lines.push(''); // blank line between dates
    });

    navigator.clipboard.writeText(lines.join('\n').trim()).catch(() => {});
}, [changes]);
```

### Example clipboard output

```
--- Mon 3 Feb ---
  MOVE: F-16 | CF-1 (08:15)  -->  C-172 | Ground School (10:00)
        Knoerr S, Peterson R, Morrison J
  ADD to T-38 | Contact (13:00):
        Dobbs R

--- Tue 4 Feb ---
  REMOVE from F-16 | Aero EE (08:00):
        Smith J
```

This reads like a set of instructions a human can follow to update the spreadsheet.

---

## 5. Undo Strategy

### New `handleUndoGroup` function

Replace the old `handleUndo(idx)` with `handleUndoGroup(indices)`:

```js
const handleUndoGroup = useCallback((indices) => {
    if (!indices || indices.length === 0) return;

    // Sort indices in DESCENDING order so we undo last changes first
    // This preserves consistency (reverse chronological order)
    const sortedDesc = [...indices].sort((a, b) => b - a);

    setWorkingEvents(prev => {
        const next = prev.map(ev => ({ ...ev, personnel: [...ev.personnel] }));
        sortedDesc.forEach(idx => {
            const ch = changes[idx];
            if (!ch) return;
            const event = next.find(e => e.id === ch.eventId);
            if (!event) return;
            if (ch.type === 'add') {
                event.personnel = event.personnel.filter(p => p !== ch.person);
            } else {
                if (!event.personnel.includes(ch.person)) event.personnel.push(ch.person);
            }
        });
        return next;
    });

    // Remove all the indices from changes array
    const indexSet = new Set(indices);
    setChanges(prev => prev.filter((_, i) => !indexSet.has(i)));
}, [changes]);
```

### Why undo-all-in-group is correct

When the display shows "Move Borek: A -> C" (which is the net effect of a chain A->B->C), the undo must reverse ALL four raw changes (remove from A, add to B, remove from B, add to C) in reverse order. This puts Borek back on A and removes him from C. The intermediate B additions/removals cancel out naturally.

If we only undid the "visible" net changes (remove from C, add to A), the intermediate raw changes would remain in the array and cause incorrect state on subsequent operations.

### Alternative considered: expand group for individual undo

I considered letting users click to expand a group and undo individual sub-changes. However, this creates dangerous inconsistencies:

- If "Move Borek A->C" is displayed and the user undoes just the "add to C" part, Borek is now removed from A AND removed from C -- he is nowhere. The display would then show "Remove Borek from A" which is confusing because the user's original intent was a move.
- Partial undo of grouped items violates the "net effect" mental model.

**Decision: Undo always operates on the entire group.** The undo button tooltip says "Undo all" to make this clear. If the user needs finer control, they can make individual corrective additions/removals using the normal drag-and-drop interface.

---

## 6. Integration Instructions

### File: `interactive-scheduler.html`

All changes are in a single file. Here is exactly what to modify:

### 6a. Add `computeNetChanges` function (after the helper functions, before components)

**Location:** After `fmtDate` (line ~739) and before the component definitions. Insert the complete `computeNetChanges` function from Section 2 above.

Suggested insertion point: around **line 747** (after `personCat` function ends), add:

```js
// ---- NET CHANGE COMPUTATION ----
// (paste the entire computeNetChanges function here)
```

### 6b. Replace the `ChangeSummary` component

**Location:** Lines 1611-1666.

Replace the entire `ChangeSummary` component and add the new `NetChangeEntry` component right before it. Use the code from Section 3 above.

### 6c. Replace `handleUndo` with `handleUndoGroup`

**Location:** Lines 1790-1805.

Replace:
```js
const handleUndo = useCallback((idx) => {
    const ch = changes[idx];
    if (!ch) return;
    // ... existing code ...
    setChanges(prev => prev.filter((_, i) => i !== idx));
}, [changes]);
```

With the `handleUndoGroup` function from Section 5.

### 6d. Replace `handleCopy`

**Location:** Lines 1815-1832.

Replace with the updated `handleCopy` from Section 4.

### 6e. Update `ChangeSummary` usage (props)

**Location:** Lines 1894-1899.

Change:
```jsx
<ChangeSummary
    changes={changes}
    onUndo={handleUndo}
    onClearAll={handleClearAll}
    onCopy={handleCopy}
/>
```

To:
```jsx
<ChangeSummary
    changes={changes}
    onUndoGroup={handleUndoGroup}
    onClearAll={handleClearAll}
    onCopy={handleCopy}
/>
```

### 6f. No CSS changes needed

The existing CSS classes (`change-entry`, `change-detail`, `change-icon-add`, `change-icon-remove`, `change-undo`, etc.) are reused. The move icon uses inline styles for the blue color (`#3b82f6`) consistent with the existing design language. No new CSS classes are required.

### 6g. No changes to `handleAdd` or `handleRemove`

The raw change recording logic stays exactly the same. `computeNetChanges` is a pure display transformation.

---

## 7. Testing Checklist

After integration, verify these scenarios manually:

1. **Add one person to an event.** Summary shows "Add to [event]: [person]"
2. **Remove one person from an event.** Summary shows "Remove from [event]: [person]"
3. **Drag person from event A to event B.** Summary shows "Move: A -> B, [person]"
4. **Add person to A, then remove from A.** Summary shows nothing (or "All changes cancel out").
5. **Move 3 people from A to B.** Summary shows one grouped move with all 3 names.
6. **Move Borek from A to B, then B to C.** Summary shows "Move: A -> C, Borek"
7. **Click undo on a grouped move.** All raw changes in the group are reversed. People return to original events.
8. **Click Copy.** Clipboard contains human-readable instruction text with MOVE/ADD/REMOVE labels.
9. **Clear All.** Everything resets to original state.
10. **No changes at startup.** Summary is empty (existing `initialized` ref guard still works).

---

## 8. Future Considerations

- **Event time changes (assumption #1):** When time editing is implemented, the change summary will need a new instruction type (`'timeChange'`) with before/after times. The `computeNetChanges` function can be extended with an additional classification pass.
- **localStorage replay (feature 9d):** The raw changes array is what gets saved. On reload, `computeNetChanges` will still produce the correct net display from the restored raw array.
- **Performance:** `computeNetChanges` runs in O(n) where n is the number of raw changes. It is called inside `useMemo` keyed on `changes`, so it only recomputes when changes actually change. For typical usage (dozens of changes, not thousands), this is negligible.
