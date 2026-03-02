# Drag-and-Drop Compartment

**Source file:** `Interactive-scheduler/interactive-scheduler.html`
**Lines of interest:** 4279–4314 (PersonnelChip), 4358–4404 (EventCard drop), 4738–4788 (BlankPuck), 6266–6366 (WhiteboardCrewCell), 6375–6580 (PlaceholderChip), 6585–6819 (WhiteboardCrewGroup), 6870–7210 (WhiteboardSupervision / handlePocDrop), 7705–7762 (DutyPuckChip / DutyDropZone), 7781–7903 (handleAdd / handleRemove in SchedulerView)

---

## Purpose

The drag-and-drop system is the primary interaction model for assigning and re-assigning personnel across events. It covers two distinct views (Timeline EventCard crew area and Whiteboard table cells/groups) and one auxiliary widget (Duty Pucks in the Whiteboard header). Every assignment mutation produced by a drag ultimately resolves to one of two SchedulerView callbacks: `handleAdd` (line 7781) or `handleRemove` (line 7878). Those callbacks drive `workingEvents` state, which is the single source of truth for both display and change-tracking.

---

## Owner Boundaries

The drag-and-drop compartment owns:

- The HTML5 Drag-and-Drop API wiring on every source element (`draggable`, `onDragStart`, `onDragEnd`).
- The `text/plain` JSON payload written to `dataTransfer` and the contract for every field in that payload.
- The `effectAllowed` / `dropEffect` declarations on every source and target.
- The `dragOver` local state in every drop-target component (controls the blue highlight CSS).
- The MOVE-vs-COPY decision logic inside every `handleDrop` implementation.
- The visual opacity feedback on drag start (`0.4`) / drag end (`1`).
- `e.stopPropagation()` calls used to prevent parent elements from receiving a drop event intended for a child.

The compartment does **not** own:

- `handleAdd` / `handleRemove` business logic (owned by the State Connections compartment).
- Conflict detection (owned by the Conflict Detection compartment).
- Focus mode dimming (owned by the Event Focus Mode compartment).
- The `canFillPlaceholder` compatibility check (owned by the Placeholder compartment).

---

## Universal Payload Format

All drag sources write a single `text/plain` JSON string. The full possible schema is:

```json
{
  "person":         string,          // display name being dragged; ALWAYS present
  "sourceEventId":  string | null,   // event.id where the chip came from; null = from picker or duty zone
  "category":       string | null,   // roster category, e.g. "Staff IP"; null if not known at drag time
  "sourceDuty":     string | null,   // "foa" | "auth"; set only by DutyPuckChip; null otherwise
  "isBlankPuck":    boolean,         // true only for BlankPuck drags
  "role":           string | null,   // placeholder role, e.g. "IP", "Generic"; only when isBlankPuck=true
  "isDefaultLabel": boolean          // true if blank puck has NOT been renamed by user; only when isBlankPuck=true
}
```

Not every source writes every field. The table below shows which fields each source populates:

| Field            | PersonnelChip | BlankPuck | wb-crew-chip (Group) | WhiteboardCrewCell chip | DutyPuckChip |
|------------------|:---:|:---:|:---:|:---:|:---:|
| `person`         | yes | yes | yes | yes | yes |
| `sourceEventId`  | yes (or null) | — | yes | yes | null (explicit) |
| `category`       | — | yes | yes | yes | — |
| `sourceDuty`     | — | — | — | — | yes |
| `isBlankPuck`    | — | true | — | — | — |
| `role`           | — | yes | — | — | — |
| `isDefaultLabel` | — | yes | — | — | — |

Drop targets silently ignore unknown/missing fields with `|| null` / `|| false` defaults. Drop handlers wrap `JSON.parse` in try/catch so a plain-text fallback (`personName = raw`) is available if the payload is not JSON.

---

## Drag Sources Inventory

### 1. PersonnelChip (in-event chip and picker chip)
**Component:** `PersonnelChip` (line 4276)
**`draggable`:** unconditionally true (line 4304)

```js
// line 4279–4284
const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
        person: name,
        sourceEventId: eventId || null,   // null when rendered in picker (no eventId prop)
    }));
    e.dataTransfer.effectAllowed = 'copyMove';
    e.currentTarget.style.opacity = '0.4';
    if (onDS) onDS(name, eventId);        // notifies SchedulerView (unused currently but wired for future use)
};

// line 4286–4288
const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    if (onDE) onDE();
};
```

- When rendered **inside an EventCard** (`eventId` is the event's id), `sourceEventId` is set. This enables MOVE semantics at the drop target.
- When rendered **inside PersonnelPicker** (`inPicker=true`, no `eventId` prop), `sourceEventId` is null. This means a drop of a picker chip always adds without removing.
- `category` is **not** included in this payload; drop targets call `personCat(personName, roster)` themselves when they need it.

---

### 2. BlankPuck
**Component:** `BlankPuck` (line 4727)
**`draggable`:** `draggable={!editing}` (line 4767) — disabled while the rename input is focused to allow normal text interaction.

```js
// line 4738–4754
const handleDragStart = (e) => {
    const name = customName.trim() || def.label;
    const isDefaultLabel = !customName.trim();
    e.dataTransfer.setData('text/plain', JSON.stringify({
        person: name,
        isBlankPuck: true,
        category: def.cat,       // null for Generic puck
        role: def.role,          // e.g. "IP", "Student", "Generic"
        isDefaultLabel,
    }));
    e.dataTransfer.effectAllowed = 'copy';   // NOTE: 'copy' not 'copyMove'
    e.currentTarget.style.opacity = '0.45';
};

const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setCustomName('');   // always reset custom name after drag (Option 2 behavior)
};
```

- `effectAllowed = 'copy'` because a blank puck has no source event; there is nothing to remove.
- Drop targets that read `isBlankPuck && isDefaultLabel && role` create an **unfilled placeholder slot**; those that read `isBlankPuck && !isDefaultLabel && role` create a **pre-filled placeholder** (the custom name becomes the filledBy value).
- `canRename` pucks (e.g., the Generic puck) allow the user to type a guest name before dragging.

---

### 3. wb-crew-chip in WhiteboardCrewGroup
**Component:** inline `<span>` inside `WhiteboardCrewGroup` (line 6700, approx)

```js
// line 6705–6718 (approx)
<span className="wb-crew-chip" style={style}
    draggable
    onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({
            person,
            sourceEventId: eventId,
            category: personCat(person, roster) || null,
        }));
        e.dataTransfer.effectAllowed = 'copyMove';
        e.currentTarget.style.opacity = '0.4';
        e.stopPropagation();    // prevent parent <td> from receiving drag events
    }}
    onDragEnd={(e) => {
        e.currentTarget.style.opacity = '1';
    }}>
```

- `e.stopPropagation()` on `onDragStart` prevents the parent `<td>` element (which is the `WhiteboardCrewGroup` drop target) from firing its own drag events for the same gesture.
- Includes `category` in payload so drop targets can skip the roster lookup.

---

### 4. WhiteboardCrewCell person chip (Supervision)
**Component:** inline `<span>` inside `WhiteboardCrewCell` (line 6330, approx)

```js
// line 6330–6348 (approx)
<span
    draggable
    style={{ cursor: 'grab', ... }}
    onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({
            person,
            sourceEventId: eventId,
            category: personCat(person, roster) || null,
        }));
        e.dataTransfer.effectAllowed = 'copyMove';
        e.currentTarget.style.opacity = '0.4';
        e.stopPropagation();
    }}
    onDragEnd={(e) => {
        e.currentTarget.style.opacity = '1';
    }}>
```

- Same pattern as the WhiteboardCrewGroup chip. The `<td>` that wraps this span is itself a drop target (`WhiteboardCrewCell`), so `e.stopPropagation()` is required.
- Used primarily in the Supervision section, where each cell holds at most one person.

---

### 5. DutyPuckChip (FOA/AUTH)
**Component:** `DutyPuckChip` (line 7705), defined as an inner component inside `WhiteboardView`.

```js
// line 7708–7728
<span
    className="duty-puck-chip"
    draggable
    onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({
            person,
            sourceDuty: slot,          // "foa" | "auth"
            sourceEventId: null,       // explicit null — not an event crew slot
        }));
        e.dataTransfer.effectAllowed = 'copyMove';
        e.currentTarget.style.opacity = '0.4';
    }}
    onDragEnd={(e) => { e.currentTarget.style.opacity = '1'; }}
>
```

- `sourceDuty` distinguishes the duty zone origin. `DutyDropZone.handleDrop` reads this field to decide between `moveBetweenDuty` (MOVE within duty slots) and `addToDuty` (COPY from picker/event).
- `sourceEventId: null` ensures no event-crew remove is triggered if this puck is dropped on an event.

---

## Drop Targets Inventory

### 1. EventCard crew area (Timeline view)
**Component:** `EventCard` (line 4318)
**State:** `const [dragOver, setDragOver] = useState(false)` (line 4321)

```js
// line 4358–4363
const handleDragOver = (e) => {
    if (event.readonly) return;   // guard: supervision/academic events reject drops
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
};
```

```js
// line 4365–4404
const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (event.readonly) return;
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const personName = data.person;
        if (!personName) return;

        // Branch A: blank puck with default label → create unfilled placeholder
        if (data.isBlankPuck && data.isDefaultLabel && data.role && onAddPlaceholder) {
            onAddPlaceholder(event.id, data.role);
            return;
        }

        // Branch B: renamed blank puck → create pre-filled placeholder
        if (data.isBlankPuck && !data.isDefaultLabel && data.role && onAddPlaceholder) {
            onAddPlaceholder(event.id, data.role, personName);
            return;
        }

        // Branch C: real person — add if not already present
        if (!event.personnel.includes(personName)) {
            onAdd(event.id, personName, data.sourceEventId);  // sourceEventId triggers MOVE in handleAdd

            // Indirect fill prompt: if matching unfilled placeholders exist, set pendingFill
            if (onFillPlaceholder) {
                const cat = data.category || personCat(personName, roster);
                // ... build matches list from event.placeholders
                if (matches.length > 0) {
                    setPendingFill({ person: personName, matches, rcMap });
                }
            }
        }
    } catch (err) {}
};
```

- **Visual feedback:** `className` includes `drag-over` class (line 4434) which applies CSS rule `event-card.drag-over` (line 180–183): blue `box-shadow` outline (`#3b82f6`, 2px solid + glow).
- **`onDragLeave`** (line 4437): `() => setDragOver(false)` — no guard.
- MOVE semantics for person drops are delegated to `handleAdd` via the `sourceEventId` argument (see MOVE vs COPY section below).

---

### 2. WhiteboardCrewGroup (Whiteboard Flying/Ground/NA)
**Component:** `WhiteboardCrewGroup` (line 6585)
**State:** `const [dragOver, setDragOver] = useState(false)` (line 6592, approx)

```js
// line 6615–6618 (approx)
const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
};
```

```js
// line 6620–6668 (approx)
const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    // ... parse payload fields including isBlankPuck, isDefaultLabel, role, sourceEventId, droppedCat

    // Branch A: default-label blank puck → unfilled placeholder
    if (isBlankPuck && isDefaultLabel && role && onAddPlaceholder) {
        onAddPlaceholder(eventId, role); return;
    }

    // Branch B: renamed blank puck → filled placeholder
    if (isBlankPuck && !isDefaultLabel && role && onAddPlaceholder) {
        onAddPlaceholder(eventId, role, personName); return;
    }

    // Branch C: MOVE — remove from source event before adding here
    if (sourceEventId && sourceEventId !== eventId && onRemove) {
        onRemove(sourceEventId, personName);   // direct call to handleRemove
    }

    // Add to crew (skip duplicates)
    if (!crew.includes(personName) && onAdd) onAdd(eventId, personName);

    // Indirect fill prompt check
    if (placeholders && placeholders.length > 0 && onFillPlaceholder) { ... }
};
```

- **Visual feedback:** `wb-crew-drop-active` class on the `<td>` applies CSS rule (line 1687–1690): `outline: 2px dashed #3b82f6 !important; background: rgba(59,130,246,0.1) !important`.
- **Key difference from EventCard:** MOVE is executed with **explicit separate `onRemove` + `onAdd` calls** here, whereas EventCard passes `sourceEventId` into `onAdd` and lets `handleAdd` do both.

---

### 3. WhiteboardCrewCell (Supervision single-slot, existing events only)
**Component:** `WhiteboardCrewCell` (line 6266)
**State:** `const [dragOver, setDragOver] = useState(false)` (line 6269, approx)

```js
// line 6281–6285 (approx)
const handleDragOver = (e) => {
    if (readonly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
};

// line 6288–6309 (approx)
const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (readonly) return;
    const raw = e.dataTransfer.getData('text/plain');
    let personName = raw;
    let sourceId = null;
    try {
        const parsed = JSON.parse(raw);
        personName = parsed.person || raw;
        sourceId = parsed.sourceEventId || null;
    } catch(ignored) {}
    if (!personName) return;

    // MOVE: remove from source event if different
    if (sourceId && sourceId !== eventId && onRemove) {
        onRemove(sourceId, personName);
    }
    // Single-slot replacement: evict existing occupant
    if (person && person !== personName && onRemove) {
        onRemove(eventId, person);
    }
    if (onAdd) onAdd(eventId, personName);
};
```

- **Single-slot replacement:** if the cell is already occupied by a different person, that person is removed before the new one is added. This is unique to `WhiteboardCrewCell`; group-based targets do not evict.
- **Visual feedback:** `wb-crew-drop-active` class on the `<td>`, same CSS as WhiteboardCrewGroup.
- **Scope:** Used only for triplets that correspond to **existing** supervision events. Empty supervision triplets use `handlePocDrop` (Drop Target 6) instead.

---

### 4. PlaceholderChip (unfilled placeholder slot)
**Component:** `PlaceholderChip` (line 6375)
**State:** `const [dragOver, setDragOver] = useState(false)` (line 6378, approx)

```js
// line 6425–6428 (approx)
const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();   // prevent parent <td> (WhiteboardCrewGroup) from also highlighting
    setDragOver(true);
};

// line 6432–6459 (approx)
const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();   // prevent parent WhiteboardCrewGroup from also processing this drop
    setDragOver(false);
    setWarning(null);
    // ... parse personName and droppedCat from payload
    const cat = droppedCat || personCat(personName, roster);

    if (canFillPlaceholder(role, cat)) {
        // Compatible → fill placeholder AND add to crew
        if (onFill) onFill(id, personName);    // onFill calls both onFillPlaceholder + onAdd
    } else {
        // Incompatible → show inline warning badge with sibling suggestions
        const compatSiblings = siblingCandidates.filter(s => canFillPlaceholder(s.role, cat));
        setWarning({ person: personName, cat, siblings: compatSiblings });
    }
};
```

- **`e.stopPropagation()` on both `handleDragOver` and `handleDrop`**: critical — without these, the parent `WhiteboardCrewGroup` `<td>` would simultaneously receive the drag events, creating a double-add.
- **Visual feedback:** `.wb-placeholder-chip.drag-over` CSS (line 1551–1553): `opacity: 1; outline: 2px dashed #3b82f6`.
- **Warning badge:** when `canFillPlaceholder` returns false, a `.wb-placeholder-warn` popover appears inline offering "Add to mission" (bypasses role check) or "Cancel" buttons. Does **not** use MOVE semantics; the person is never removed from a source event.

---

### 5. DutyDropZone (FOA/AUTH slots)
**Component:** `DutyDropZone` (line 7733), inner component inside `WhiteboardView`

```js
// line 7735–7761
const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
};

const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const person = data.person;
        if (!person) return;
        if (data.sourceDuty && data.sourceDuty !== slot) {
            moveBetweenDuty(data.sourceDuty, slot, person);  // MOVE between foa ↔ auth
        } else {
            addToDuty(slot, person);                          // COPY from picker/event chip
        }
    } catch {}
};
```

- **Duty MOVE:** triggered only when `sourceDuty` is present and differs from the target slot. This is an intra-duty move that does NOT touch `workingEvents`.
- Drops from `PersonnelChip` (picker) or whiteboard crew chips always hit the `else` branch, adding the person to the duty slot without removing from any event.
- **Visual feedback:** `.duty-drop-zone.drag-over` CSS (line 1371–1374): `border-color: #3b82f6; background: rgba(59,130,246,0.1); color: #3b82f6`.

---

### 6. POC cell (pending supervision triplet)
**Component:** inline `handlePocDrop` inside `WhiteboardSupervision` (line 7023)
**State:** `pocDragOver` object state keyed by `slotKey` — `{ [slotKey]: boolean }`

This drop target handles the POC column of empty supervision triplets — i.e., slots that do not yet correspond to any existing event. It is **not** a standalone React component; it is a closure-captured handler defined per triplet inside the `WhiteboardSupervision` render loop.

```js
// line 7023–7068 (condensed)
const handlePocDrop = (e) => {
    e.preventDefault();
    setPocDragOver(prev => ({ ...prev, [slotKey]: false }));
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    let personName = raw, sourceId = null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed.isBlankPuck) return;   // REJECT blank pucks early
        personName = parsed.person || raw;
        sourceId = parsed.sourceEventId || null;
    } catch(ignored) {}
    if (!personName) return;

    const updatedSlot = { startTime: '', endTime: '', poc: null, ...slot, poc: personName };
    const st = (updatedSlot.startTime || '').trim();
    const et = (updatedSlot.endTime   || '').trim();

    if (st && et && TIME_RE.test(st) && TIME_RE.test(et)) {
        // Both times already valid → MOVE + create event immediately
        if (sourceId && onRemove) onRemove(sourceId, personName);
        onCreateEvent('Supervision', activeDay, {
            eventName: duty, startTime: st, endTime: et,
            personnel: [personName], originalPersonnel: [personName],
        });
        setPendingSlots(prev => { const n = { ...prev }; delete n[slotKey]; return n; });
    } else {
        // Times absent → store poc for deferred creation; do NOT remove from source yet
        setPendingSlots(prev => ({
            ...prev,
            [slotKey]: { ...updatedSlot, pocSourceId: sourceId },
        }));
    }
};
```

**Payload fields read:**
- `person` — stored as the POC name
- `sourceEventId` — stored as `pocSourceId` in `pendingSlots` for deferred MOVE when event is eventually created
- `isBlankPuck` — guard: if true, returns early without modifying state

**Payload fields NOT handled (silently ignored):**
- `sourceDuty`, `isDefaultLabel`, `role`, `category`

**Behavior summary:**
- If both `startTime` and `endTime` are already present and valid in the pending slot (entered before POC was dropped): executes an **immediate MOVE** (`onRemove` from `sourceId`) and calls `onCreateEvent`. The `pendingSlots` entry is deleted.
- If times are absent or invalid: stores `poc` + `pocSourceId` in `pendingSlots[slotKey]`. The source event is **not** yet modified — MOVE is deferred until `handleTimeCommit` detects both times are valid and fires `onCreateEvent`.
- When `handleTimeCommit` finally fires `onCreateEvent`, it reads `pocSourceId` from the slot and calls `onRemove(pocSourceId, poc)` before creating the event.

**Visual feedback:** `wb-crew-drop-active` class is applied to the pending POC `<td>` via `pocDragOver[slotKey]`, matching the same CSS as `WhiteboardCrewCell`.

**Note on MOVE timing:** The deferred MOVE pattern (POC stored but source not yet removed) means a person can temporarily appear to be "still assigned" to their source event while their name sits in `pendingSlots`. The remove from the source event is only committed when `onCreateEvent` fires. This is intentional — if the user clears the times, no orphaned removal has occurred.

---

## MOVE vs COPY Semantics

A **MOVE** occurs when the drag payload carries a `sourceEventId` that differs from the drop target's `eventId`. The system then removes the person from the source event before (or as part of) adding to the destination.

There are two implementation patterns in use:

### Pattern A — Unified in handleAdd (EventCard drop, line 4388)
```js
// EventCard handleDrop, line 4388
onAdd(event.id, personName, data.sourceEventId);
```
`handleAdd` receives the optional `sourceId` argument and internally calls:
```js
// handleAdd internals (approx lines 7796–7806)
if (sourceId) {
    const source = next.find(e => e.id === sourceId);
    if (source) {
        source.personnel = source.personnel.filter(p => p !== person);
        newChanges.push({ type: 'remove', ... });
    }
}
```
Both the remove and the add are recorded as a single atomic state update, which React 18 batches correctly.

### Pattern B — Explicit separate calls (WhiteboardCrewGroup; WhiteboardCrewCell; handlePocDrop)
```js
// WhiteboardCrewGroup handleDrop (approx line 6655–6659)
if (sourceEventId && sourceEventId !== eventId && onRemove) {
    onRemove(sourceEventId, personName);
}
if (!crew.includes(personName) && onAdd) onAdd(eventId, personName);
```
These fire as two separate React state updates. Because both `handleRemove` and `handleAdd` use functional updater form (`setWorkingEvents(prev => ...)`) and `setChanges(c => ...)`, React 18 automatic batching should still combine them into one commit in practice. However, this pattern is subtly different from Pattern A: the remove change record and the add change record are written separately, so the `computeNetChanges()` function must correlate them by person+event to detect moves.

`handlePocDrop` uses a **deferred variant of Pattern B**: when times are absent, `onRemove` is NOT called at all — only `pocSourceId` is stored. When `handleTimeCommit` eventually fires `onCreateEvent`, it reads `pocSourceId` and calls `onRemove` at that point. This means the remove and the create are separated by an unknown amount of time (the user's time-entry keystrokes), not just two React batches.

**Copy (no sourceEventId):** When `sourceEventId` is null (picker chip or duty puck), no remove step occurs. The person is added to the target event crew only.

---

## effectAllowed / dropEffect Contract

| Drag Source | `effectAllowed` set at | Value |
|---|---|---|
| `PersonnelChip` (chip or picker) | line 4281 | `'copyMove'` |
| `BlankPuck` | line 4748 | `'copy'` |
| wb-crew-chip in `WhiteboardCrewGroup` | line 6718 (approx) | `'copyMove'` |
| WhiteboardCrewCell person chip | line 6345 (approx) | `'copyMove'` |
| `DutyPuckChip` | line 7718 (approx) | `'copyMove'` |

| Drop Target | `dropEffect` set at | Value |
|---|---|---|
| `EventCard.handleDragOver` | line 4361 | `'copy'` |
| `WhiteboardCrewGroup.handleDragOver` | line 6618 (approx) | `'copy'` |
| `WhiteboardCrewCell.handleDragOver` | line 6283 (approx) | `'copy'` |
| `PlaceholderChip.handleDragOver` | line 6426 (approx) | (not set — `e.preventDefault()` only) |
| `DutyDropZone.handleDragOver` | line 7737 (approx) | `'copy'` |
| `handlePocDrop` (pending supervision POC) | line 7024 | `'copy'` (implicit via `e.preventDefault()`) |

Note: All drop targets set `dropEffect = 'copy'` even when they implement MOVE semantics. The `dropEffect` value on `dragover` only affects the cursor icon; the actual MOVE logic is encoded in the payload (`sourceEventId`, `sourceDuty`) and executed in `handleDrop`. The browser's native MOVE behavior (clearing the drag source element's content) is never triggered because the drop targets do not request `'move'`.

---

## Prop Chain (onAdd / onRemove)

```
SchedulerView
├── handleAdd — defines behavior
├── handleRemove — defines behavior
│
├── DayColumn (line 4594) ← receives onAdd={handleAdd}, onRemove={handleRemove}
│   └── EventCard (line 4320) ← receives onAdd, onRemove
│       └── PersonnelChip (line 4276) ← receives onRemove (not onAdd; chip is only a source)
│
├── PersonnelPicker (line 4793) ← no onAdd/onRemove; picker chips are drag sources only
│   └── PersonnelChip (line 4913) ← drag source; no onRemove in picker context
│
└── WhiteboardView (line 7623) ← receives onAdd={handleAdd}, onRemove={handleRemove}
    ├── WhiteboardFlying / WhiteboardGround / WhiteboardNA (lines 7213, 7351, 7521)
    │   └── WhiteboardCrewGroup (line 6585) ← receives onAdd, onRemove, onAddPlaceholder,
    │                                          onRemovePlaceholder, onFillPlaceholder
    │       └── PlaceholderChip (line 6375) ← receives onRemove (via onFill wrapper), onFill,
    │                                          onRemovePlaceholder, onAddToMission=onAdd
    │
    ├── WhiteboardSupervision (line 6870)
    │   ├── WhiteboardCrewCell (line 6266) ← receives onAdd, onRemove (for existing supervision events)
    │   └── handlePocDrop (inline, line 7023) ← receives onAdd, onRemove, onCreateEvent (for empty pending triplets)
    │
    └── DutyDropZone / DutyPuckChip (lines 7705, 7733)
        (self-contained — accesses addToDuty/removeFromDuty/moveBetweenDuty via closure;
         does NOT call onAdd/onRemove; duty state is separate from workingEvents)
```

**Placeholder-specific prop chain:**

```
handleAddPlaceholder → WhiteboardView → WhiteboardFlying/Ground/NA
    → WhiteboardCrewGroup (onAddPlaceholder)

handleFillPlaceholder → WhiteboardView → WhiteboardCrewGroup (onFillPlaceholder)
    → PlaceholderChip.onFill (which calls both onFillPlaceholder + onAdd)

handleRemovePlaceholder → WhiteboardView → WhiteboardCrewGroup (onRemovePlaceholder)
    → PlaceholderChip (onRemovePlaceholder)
```

---

## State Connections

| State variable | Owner | Modified by DnD via |
|---|---|---|
| `workingEvents` | `SchedulerView` | `handleAdd`, `handleRemove` |
| `changes` | `SchedulerView` | `handleAdd`, `handleRemove` |
| `dutyState` | `WhiteboardView` | `addToDuty`, `moveBetweenDuty`, `removeFromDuty` |
| `dragOver` | local per drop-target component | set in `handleDragOver`, cleared in `handleDragLeave` / `handleDrop` |
| `pendingFill` | `EventCard` and `WhiteboardCrewGroup` | set in `handleDrop` when matching unfilled placeholders exist; cleared by user choice in fill prompt |
| `pendingSlots` | `WhiteboardSupervision` (line 6898) | set by `handlePocDrop` (stores poc + pocSourceId) and `handleTimeCommit` (stores/clears time fields); entry deleted when `onCreateEvent` fires |
| `pocDragOver` | `WhiteboardSupervision` | set in inline dragOver handler per slotKey; cleared on dragLeave / handlePocDrop |

**handleAdd internals:**
- Uses functional `setWorkingEvents` updater.
- If `sourceId` is provided (MOVE), removes person from source event and records a `{type:'remove'}` change.
- Adds person to target event and records a `{type:'add'}` change.
- Both changes written in `newChanges[]` then applied via `setChanges(c => [...c, ...newChanges])` after the state update.
- Guard: `if (!initialized.current) return` prevents phantom changes during React state initialization.

**handleRemove internals:**
- Uses functional `setWorkingEvents` updater.
- Filters person from `event.personnel`.
- Clears `filledBy` on any placeholder that references this person.
- Records `{type:'remove'}` change inside the updater using nested `setChanges` (React 18 batching).
- Guard: `if (!initialized.current) return`.

**Duty state** is stored separately in `localStorage` under key `tps-duty-assignments` (line 7635), keyed by day string. It is loaded/saved per `activeDay` change. DnD on duty zones never touches `workingEvents` or `changes`.

---

## Cross-Compartment Dependencies

| Compartment | Dependency direction | Details |
|---|---|---|
| **Event Focus Mode** | DnD → Focus | `EventCard.handleDrop` checks `event.readonly` (line 4359, 4368) before accepting drops. Readonly events (Supervision, Academics) reject all drops. |
| **Placeholder** | DnD → Placeholder | `EventCard.handleDrop` and `WhiteboardCrewGroup.handleDrop` branch on `isBlankPuck` + `isDefaultLabel` to dispatch to `onAddPlaceholder`. `PlaceholderChip.handleDrop` calls `canFillPlaceholder(role, cat)` to validate compatibility. |
| **Conflict Detection** | DnD → Conflict | After any `handleAdd`, `workingEvents` changes triggers `conflicts = useMemo(() => detectConflicts(workingEvents), ...)` to recompute. |
| **Change Summary** | DnD → Changes | Every successful add/remove appends to `changes[]`, which `computeNetChanges()` consumes for the change panel. MOVE operations produce both a remove and an add change record; the net-change computation detects and presents these as a single MOVE instruction. |
| **Picker** | Focus ↔ DnD | When `focusedAvailability` is set (focus mode active), picker chips with `isUnavailable=true` visually grey out. They are still draggable — dropping a greyed-out chip onto an event still calls `onAdd`. There is no guard preventing unavailable chips from being dropped. |
| **WhiteboardView** | DnD ↔ Duty | DutyDropZone accepts drops from picker chips and whiteboard crew chips (any `person` field in payload), but the reverse (dropping a duty puck onto an event) is also valid — `sourceEventId: null` in the duty payload means no event remove fires. |

---

## Bug History & Known Issues

### v1.0 — Picker drag broken
- **Problem:** Dragging a picker chip onto an event card had no effect.
- **Fix (v2.0, version-history.md line 23):** Added `effectAllowed: 'copyMove'` to PersonnelChip drag start and implemented `onDragOver` / `onDrop` handlers on EventCard crew areas.

### v3.1 — X-button remove not tracked in change summary
- **Problem:** Clicking the X button on a PersonnelChip called `onRemove` directly but did not record a change. This was a React 18 batching atomicity issue — `setChanges` was called outside the `setWorkingEvents` updater.
- **Fix (v3.1, version-history.md line 43):** Moved `setChanges` call inside the `setWorkingEvents` functional updater in `handleRemove`. Now both the state mutation and the change record are in the same React update batch.
- **Feedback reference:** feedback.txt line 29 — "It doesn't track changes when you remove a person with the X."

### v3.4 — Tooltip artifact after person delete during drag hover
- **Problem:** If a user hovered over a picker chip (showing conflict tooltip), then clicked the X to remove it, the tooltip persisted in the DOM because the chip was destroyed before `onMouseLeave` fired.
- **Fix (v3.5, version-history.md line 106):** PersonnelChip X button `onClick` now calls `onHideTooltip()` before `onRemove()` (line 4313).
- **Feedback reference:** feedback.txt line 168.

### PlaceholderChip — Double-add without stopPropagation
- **Known design constraint:** `PlaceholderChip.handleDragOver` and `handleDrop` both call `e.stopPropagation()`. If this is removed, the parent `WhiteboardCrewGroup` `<td>` simultaneously fires its own drop handler, adding the person twice: once as a filled placeholder and once as a plain crew member via the group's `onAdd` path.

### DutyDropZone — No MOVE from event to duty
- **Current behavior:** Dropping a whiteboard crew chip onto a DutyDropZone calls `addToDuty` only. The person is **not** removed from the event crew. This is intentional (the duty zone is an administrative layer independent of event assignments), but it means a person can appear both in the duty zone and in an event crew simultaneously.

### BlankPuck rename reset
- **Current behavior:** After any drag from a BlankPuck, `setCustomName('')` is always called in `handleDragEnd` (line 4754), resetting the puck to its default label. This is intentional "Option 2 behavior" — the puck returns to a neutral state after each use so it can be dragged again with a fresh name.

---

## Change Impact Checklist

Before modifying any drag-and-drop code, verify the following:

- [ ] **Payload format change:** If you add or remove a field from any source's `setData` call, update ALL drop targets that read that field — both direct reads (`data.field`) and destructured reads (`const { field } = parsed`). Also update this document's payload table.
- [ ] **New drop target:** Must call `e.preventDefault()` in `handleDragOver` or the drop will not fire. Must also add a `dragOver` local state, set on `dragOver` / clear on `dragLeave` and `handleDrop`.
- [ ] **New drag source:** Decide `effectAllowed` (`'copy'` for picker-like sources with no source event, `'copyMove'` for chips already assigned to an event).
- [ ] **MOVE semantics on a new drop target:** Use Pattern A (pass `sourceEventId` to `onAdd`) if you want atomic change recording. Use Pattern B (separate `onRemove` + `onAdd` calls) only if you need intermediate state access between the two operations.
- [ ] **`e.stopPropagation()` in nested drop targets:** Any drop target that is a child of another drop target must stop propagation on both `dragOver` and `drop` events to prevent double-handling.
- [ ] **`readonly` guard:** All drop targets that receive from the general pool must check `event.readonly` and return early if true. Supervision and Academic events must never be modified by drag.
- [ ] **`initialized` ref guard:** `handleAdd` and `handleRemove` check `initialized.current`. Any new state mutation callback that runs during React initialization must include the same guard.
- [ ] **`pendingSlots` deferred MOVE:** If modifying `handlePocDrop` or `handleTimeCommit` in `WhiteboardSupervision`, verify that `onRemove(pocSourceId, poc)` is called exactly once — either immediately in `handlePocDrop` (when times are already present) or deferred until `handleTimeCommit` triggers `onCreateEvent`. Do not call `onRemove` in both places.
- [ ] **Placeholder interaction:** If a person is dropped via a new path (not PlaceholderChip), consider whether the indirect fill prompt (`pendingFill`) should fire. See `EventCard.handleDrop` Branch C and `WhiteboardCrewGroup.handleDrop` Branch C for the pattern.
- [ ] **Duty zone isolation:** DutyDropZone state (`dutyState`, `localStorage` key `tps-duty-assignments`) is completely separate from `workingEvents`. Do not route duty changes through `handleAdd` / `handleRemove`.
- [ ] **CSS feedback classes:** Confirm `drag-over` (EventCard) or `wb-crew-drop-active` (whiteboard targets) is applied and removed correctly after a drop or cancelled drag. A stuck highlight state means `handleDragLeave` was not wired.
