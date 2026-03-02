# Whiteboard v4.1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 7 improvements to the whiteboard view: scroll-tolerant picker, military time with tab navigation, supervision/academics layout, FOA/Auth badges, and blank pucks.

**Architecture:** Single-file React 18 + Babel app (no build system). All changes go in `Interactive-scheduler/interactive-scheduler.html`. No automated tests — verification is manual browser testing.

**Tech Stack:** React 18, Babel (in-browser transpile), TailwindCSS, vanilla JS, localStorage persistence.

**Note:** `--wb-date-h` already tuned to 26px by user in the browser (no code change needed).

---

## Task 1: Picker Scroll Threshold (400px)

**Files:**
- Modify: `Interactive-scheduler/interactive-scheduler.html` (~line 5928, ~5972, ~5998)

### Description
Currently any scroll on `.whiteboard-area` immediately closes the highlight color picker popup. Change to only dismiss when the user has scrolled more than 400px from where the picker was opened.

### Step 1: Add a ref to track scroll position when picker opens

Find the `pickerTarget` state declaration (~line 5928):
```js
const [pickerTarget, setPickerTarget] = useState(null); // { key, rect }
```
Add immediately after:
```js
const pickerScrollTop = useRef(0); // scrollTop captured when picker was opened
```

### Step 2: Capture scrollTop when picker opens

Find `handleHighlightCellClick` (~line 5972):

**Old:**
```js
const handleHighlightCellClick = useCallback((key, rect) => {
    setPickerTarget({ key, rect });
}, []);
```

**New:**
```js
const handleHighlightCellClick = useCallback((key, rect) => {
    if (wbAreaRef.current) pickerScrollTop.current = wbAreaRef.current.scrollTop;
    setPickerTarget({ key, rect });
}, []);
```

### Step 3: Change scroll handler to use 400px threshold

Find the scroll useEffect (~line 5998):

**Old:**
```js
React.useEffect(() => {
    const el = wbAreaRef.current;
    if (!el) return;
    const onScroll = () => setPickerTarget(null);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
}, []);
```

**New:**
```js
React.useEffect(() => {
    const el = wbAreaRef.current;
    if (!el) return;
    const onScroll = () => {
        if (Math.abs(el.scrollTop - pickerScrollTop.current) > 400) {
            setPickerTarget(null);
        }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
}, []);
```

### Verification
1. Enable Highlight mode, click a cell to open color picker.
2. Scroll slowly (<400px) — picker stays open.
3. Scroll >400px — picker closes.

---

## Task 2: Military Time (00–23) + Tab Key Navigation

**Files:**
- Modify: `Interactive-scheduler/interactive-scheduler.html`
  - `WhiteboardCell` component (~line 5336)
  - `WhiteboardFlying` component (~line 5609)
  - `WhiteboardGround` component (~line 5715)
  - `WhiteboardNA` component (~line 5850)
  - CSS `.wb-input-time` (~line 1351)

### Description
**Change 1 – Military time:** Replace `type="time"` (renders 12h AM/PM on Windows) with `type="text"` + pattern validation. On commit, validate with `/^([01]\d|2[0-3]):[0-5]\d$/`; revert on invalid.

**Change 2 – Tab navigation:** Convert `WhiteboardCell` to a `React.forwardRef` component exposing a `.focus()` method. Parent rows track cell refs in a `Map` keyed by event ID. Tab/Shift+Tab in any cell calls the neighbor's `.focus()`.

### Step 1: Rewrite WhiteboardCell (~line 5336)

**Old declaration:**
```js
const WhiteboardCell = ({ value, field, eventId, type, onSave, highlight, highlightMode, onHighlight, readonly, className }) => {
```

**New declaration (forwardRef):**
```js
const WhiteboardCell = React.forwardRef(({ value, field, eventId, type, onSave, highlight, highlightMode, onHighlight, readonly, className, onTab, onShiftTab }, cellRef) => {
```

**Inside the component, add after `inputRef`:**
```js
const tdRef = React.useRef(null);
React.useImperativeHandle(cellRef, () => ({
    focus: () => { if (tdRef.current) tdRef.current.click(); },
}));
```

**Add TIME_RE constant and update `commit`:**

After state declarations, add:
```js
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
```

**Old commit:**
```js
const commit = () => {
    setEditing(false);
    const trimmed = (draft || '').trim();
    if (trimmed !== (value || '').trim()) {
        onSave(eventId, field, trimmed);
    }
};
```

**New commit (validates military time):**
```js
const commit = () => {
    setEditing(false);
    const trimmed = (draft || '').trim();
    if (type === 'time' && trimmed && !TIME_RE.test(trimmed)) {
        setDraft(value || ''); // revert invalid time
        return;
    }
    if (trimmed !== (value || '').trim()) {
        onSave(eventId, field, trimmed);
    }
};
```

**Old handleKeyDown:**
```js
const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); }
    else if (e.key === 'Enter') { commit(); }
};
```

**New handleKeyDown (adds Tab interception):**
```js
const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); }
    else if (e.key === 'Enter') { commit(); }
    else if (e.key === 'Tab') {
        e.preventDefault();
        commit();
        if (e.shiftKey && onShiftTab) onShiftTab();
        else if (!e.shiftKey && onTab) onTab();
    }
};
```

**Old input rendering block:**
```js
if (editing && !readonly) {
    const inputClass = type === 'time' ? 'wb-input-time' : 'wb-input';
    return (
        <td className={cellClass} onClick={handleClick}>
            <input ref={inputRef} className={inputClass}
                type={type === 'time' ? 'time' : 'text'}
                value={draft} onChange={e => setDraft(e.target.value)}
                onBlur={commit} onKeyDown={handleKeyDown} />
        </td>
    );
}
return <td className={cellClass} onClick={handleClick}>{value || ''}</td>;
```

**New input rendering (always text, adds tdRef, time placeholder):**
```js
if (editing && !readonly) {
    const isTime = type === 'time';
    const inputClass = isTime ? 'wb-input-time' : 'wb-input';
    return (
        <td ref={tdRef} className={cellClass} onClick={handleClick}>
            <input ref={inputRef} className={inputClass}
                type="text"
                value={draft} onChange={e => setDraft(e.target.value)}
                onBlur={commit} onKeyDown={handleKeyDown}
                {...(isTime ? { placeholder: 'HH:MM', maxLength: 5 } : {})} />
        </td>
    );
}
return <td ref={tdRef} className={cellClass} onClick={handleClick}>{value || ''}</td>;
```

**Close forwardRef at end of component:**

The component currently ends with `};` — change to `});` to close the `forwardRef` call.

### Step 2: Add tab navigation to WhiteboardFlying

Inside `WhiteboardFlying`, before `events.map(...)`, add:
```js
const cellRefsMap = useRef(new Map());
```

Inside the `events.map(ev => { ... })` loop, add at the top:
```js
if (!cellRefsMap.current.has(ev.id)) cellRefsMap.current.set(ev.id, []);
const refs = cellRefsMap.current.get(ev.id);
const makeTab = (idx) => ({
    onTab: () => refs[idx + 1]?.focus(),
    onShiftTab: () => refs[idx - 1]?.focus(),
    ref: (el) => { refs[idx] = el; },
});
```

Tab order for Flying: `Model(0) → startTime/Brief(1) → etd(2) → eta(3) → endTime/Debrief(4) → eventName(5) → notes(6)`

Update each `<WhiteboardCell>` in the Flying row to spread `{...makeTab(N)}`:
```jsx
<WhiteboardCell {...makeTab(0)} value={ev.model} field="model" eventId={ev.id} type="text"
    onSave={handleCellSave} highlight={highlights[`${ev.id}:model`]}
    highlightMode={highlightMode} onHighlight={onHighlight} />
<WhiteboardCell {...makeTab(1)} value={ev.startTime} field="startTime" eventId={ev.id} type="time"
    onSave={handleCellSave} highlight={highlights[`${ev.id}:startTime`]}
    highlightMode={highlightMode} onHighlight={onHighlight} />
<WhiteboardCell {...makeTab(2)} value={ev.etd} field="etd" eventId={ev.id} type="time"
    onSave={handleCellSave} highlight={highlights[`${ev.id}:etd`]}
    highlightMode={highlightMode} onHighlight={onHighlight} />
<WhiteboardCell {...makeTab(3)} value={ev.eta} field="eta" eventId={ev.id} type="time"
    onSave={handleCellSave} highlight={highlights[`${ev.id}:eta`]}
    highlightMode={highlightMode} onHighlight={onHighlight} />
<WhiteboardCell {...makeTab(4)} value={ev.endTime} field="endTime" eventId={ev.id} type="time"
    onSave={handleCellSave} highlight={highlights[`${ev.id}:endTime`]}
    highlightMode={highlightMode} onHighlight={onHighlight} />
<WhiteboardCell {...makeTab(5)} value={ev.eventName} field="eventName" eventId={ev.id} type="text"
    onSave={handleCellSave} highlight={highlights[`${ev.id}:eventName`]}
    highlightMode={highlightMode} onHighlight={onHighlight} />
{/* WhiteboardCrewGroup is not a WhiteboardCell — skip tab index */}
<WhiteboardCell {...makeTab(6)} value={ev.notes} field="notes" eventId={ev.id} type="text"
    onSave={handleCellSave} highlight={highlights[`${ev.id}:notes`]}
    highlightMode={highlightMode} onHighlight={onHighlight} />
```

### Step 3: Add tab navigation to WhiteboardGround

Same pattern. Tab order: `eventName(0) → startTime(1) → endTime(2) → notes(3)`

Add `cellRefsMap` ref before the `events.map`, add `makeTab` inside map, spread `{...makeTab(N)}` on each cell.

### Step 4: Add tab navigation to WhiteboardNA

Same pattern. Tab order: `eventName(0) → startTime(1) → endTime(2) → notes(3)`

### Step 5: Update CSS for `.wb-input-time`

Find the `.wb-input-time` rule (~line 1351). Remove the `::-webkit-calendar-picker-indicator` rule since we no longer use `type="time"`. Update width if needed:

```css
.wb-input-time {
    width: 55px;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    padding: 0;
    outline: none;
    text-align: center;
}
/* Remove the ::-webkit-calendar-picker-indicator rule */
```

Also remove from light mode (~line 2005):
```css
/* DELETE: .light-mode .wb-input-time::-webkit-calendar-picker-indicator { filter: none; } */
```

### Verification
1. Click a time cell — text input appears with `HH:MM` placeholder, no AM/PM picker.
2. Type `14:30` → Enter — saves correctly.
3. Type `25:00` → Enter — reverts to original (invalid).
4. Tab through Flying row: Model → Brief → ETD → ETA → Debrief → Event → Notes.
5. Shift+Tab reverses direction.

---

## Task 3: Supervision Resize + Academics Inline (Side-by-Side)

**Files:**
- Modify: `Interactive-scheduler/interactive-scheduler.html`
  - CSS (~line 1294 after `.wb-table` rules)
  - `WhiteboardSupervision` colgroup (~line 5540)
  - `WhiteboardView` JSX Supervision section (~line 6072)

### Description
Place Academics table to the RIGHT of Supervision using a flex container. Shrink Supervision columns (POC -40%, Start/End -25%, Duty -25%) and add compact row styling. Remove the "ACADEMICS" sub-header (Academics now has its own `<thead>`).

### Step 1: Add CSS classes

Add after `.wb-table` rules (~line 1323):
```css
/* Compact table variant for Supervision (smaller cells) */
.wb-table-compact th {
    font-size: 0.45rem;
    padding: 2px 3px;
}
.wb-table-compact td {
    font-size: 0.55rem;
    padding: 2px 4px;
    height: 20px;
}

/* Flex row: Supervision left, Academics right */
.wb-supv-acad-row {
    display: flex;
    gap: 8px;
    align-items: flex-start;
}
.wb-supv-acad-left  { flex: 0 0 auto; min-width: 0; }
.wb-supv-acad-right { flex: 1 1 auto; min-width: 120px; }
```

Add light-mode overrides after light-mode whiteboard section:
```css
/* compact table inherits .light-mode .wb-table th/td rules — no extra overrides needed */
```

### Step 2: Update WhiteboardSupervision

Add `wb-table-compact` to the table class:
**Old:**
```jsx
<table className="wb-table">
```
**New:**
```jsx
<table className="wb-table wb-table-compact">
```

Update the colgroup with narrower widths:
**Old:**
```jsx
<colgroup>
    <col style={{ width: '10%' }} />
    {Array.from({ length: maxTriplets }, (_, i) => (
        <React.Fragment key={i}>
            <col style={{ width: '10%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
        </React.Fragment>
    ))}
    <col />{/* Notes — remaining */}
</colgroup>
```
**New:**
```jsx
<colgroup>
    <col style={{ width: '7.5%' }} />
    {Array.from({ length: maxTriplets }, (_, i) => (
        <React.Fragment key={i}>
            <col style={{ width: '6%' }} />
            <col style={{ width: '4.5%' }} />
            <col style={{ width: '4.5%' }} />
        </React.Fragment>
    ))}
    <col />{/* Notes — remaining (expanded) */}
</colgroup>
```

### Step 3: Update WhiteboardView JSX — wrap in flex container

**Old (Supervision section render, ~line 6072):**
```jsx
<React.Fragment>
    <WhiteboardSupervision events={evts} roster={roster}
        onEditSave={onEditSave} onAdd={onAdd} onRemove={onRemove}
        onFocusEvent={onFocusEvent}
        highlights={highlights} highlightMode={highlightMode}
        onHighlight={handleHighlightCellClick} />
    {acadEvts.length > 0 && (
        <div style={{ marginTop: 8 }}>
            <div className="wb-section-title" style={{ fontSize: '0.5rem', opacity: 0.7 }}>ACADEMICS</div>
            <WhiteboardAcademics events={acadEvts} roster={roster} />
        </div>
    )}
</React.Fragment>
```

**New:**
```jsx
<div className="wb-supv-acad-row">
    <div className="wb-supv-acad-left">
        <WhiteboardSupervision events={evts} roster={roster}
            onEditSave={onEditSave} onAdd={onAdd} onRemove={onRemove}
            onFocusEvent={onFocusEvent}
            highlights={highlights} highlightMode={highlightMode}
            onHighlight={handleHighlightCellClick} />
    </div>
    <div className="wb-supv-acad-right">
        <WhiteboardAcademics events={acadEvts} roster={roster} />
    </div>
</div>
```

Note: `WhiteboardAcademics` now always renders (even with 0 events) per Task 4.

### Verification
1. Supervision and Academics appear side-by-side.
2. Supervision text/cells are visibly smaller.
3. No "ACADEMICS" sub-label between the two tables.
4. Notes column in Supervision is proportionally wider.

---

## Task 4: Academics — Always 4 Categories, Strip "Academics" from Titles

**Files:**
- Modify: `Interactive-scheduler/interactive-scheduler.html`
  - Add `ACAD_FIXED_CATS` constant (near `SUPV_DUTY_ORDER`, ~line 2060)
  - Rewrite `WhiteboardAcademics` component (~line 5804)

### Description
Always render 4 fixed category rows (Alpha FTC, Alpha STC, Bravo FTC, Bravo STC) regardless of how many events exist. Strip "Academics" from displayed names. Show em-dash for empty cells.

### Step 1: Add ACAD_FIXED_CATS constant

Find `SUPV_DUTY_ORDER` constant (~line 2060). Add immediately after:
```js
const ACAD_FIXED_CATS = [
    { label: 'Alpha FTC', alphaKey: 'alpha', classKey: 'ftc', catColor: 'FTC-A' },
    { label: 'Alpha STC', alphaKey: 'alpha', classKey: 'stc', catColor: 'STC-A' },
    { label: 'Bravo FTC', alphaKey: 'bravo', classKey: 'ftc', catColor: 'FTC-B' },
    { label: 'Bravo STC', alphaKey: 'bravo', classKey: 'stc', catColor: 'STC-B' },
];
```

### Step 2: Rewrite WhiteboardAcademics

**Old (lines ~5804-5847):**
```jsx
const WhiteboardAcademics = ({ events, roster }) => {
    const classColor = (name) => {
        const lower = name.toLowerCase();
        if (lower.includes('alpha') && lower.includes('ftc')) return CATEGORY_COLORS['FTC-A'];
        if (lower.includes('bravo') && lower.includes('ftc')) return CATEGORY_COLORS['FTC-B'];
        if (lower.includes('alpha') && lower.includes('stc')) return CATEGORY_COLORS['STC-A'];
        if (lower.includes('bravo') && lower.includes('stc')) return CATEGORY_COLORS['STC-B'];
        if (lower.includes('staff') && lower.includes('ip')) return CATEGORY_COLORS['Staff IP'];
        if (lower.includes('staff') && lower.includes('stc')) return CATEGORY_COLORS['Staff STC'];
        if (lower.includes('ifte') || lower.includes('icso')) return CATEGORY_COLORS['Staff IFTE/ICSO'];
        if (lower.includes('attached')) return CATEGORY_COLORS['Attached/Support'];
        return null;
    };

    return (
        <table className="wb-table">
            <colgroup>
                <col />{/* Class — remaining */}
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
                <tr>
                    <th>Class</th>
                    <th>Start</th>
                    <th>End</th>
                </tr>
            </thead>
            <tbody>
                {events.map(ev => {
                    const color = classColor(ev.eventName);
                    const rowStyle = color ? { background: `${color.bg}22` } : {};
                    const nameStyle = color ? { ...rowStyle, fontWeight: 600, color: color.text, background: color.bg } : { fontWeight: 600 };
                    return (
                        <tr key={ev.id}>
                            <td style={nameStyle}>{ev.eventName}</td>
                            <td style={rowStyle}>{ev.startTime || ''}</td>
                            <td style={rowStyle}>{ev.endTime || ''}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
```

**New:**
```jsx
const WhiteboardAcademics = ({ events, roster }) => {
    const matched = useMemo(() => {
        return ACAD_FIXED_CATS.map(cat => {
            const ev = events.find(e => {
                const lower = (e.eventName || '').toLowerCase();
                return lower.includes(cat.alphaKey) && lower.includes(cat.classKey);
            });
            return { ...cat, ev };
        });
    }, [events]);

    return (
        <table className="wb-table wb-table-compact">
            <colgroup>
                <col />{/* Class label */}
                <col style={{ width: '30%' }} />
                <col style={{ width: '30%' }} />
            </colgroup>
            <thead>
                <tr>
                    <th>Class</th>
                    <th>Start</th>
                    <th>End</th>
                </tr>
            </thead>
            <tbody>
                {matched.map(({ label, catColor, ev }) => {
                    const color = CATEGORY_COLORS[catColor];
                    const rowStyle = color ? { background: `${color.bg}22` } : {};
                    const nameStyle = color
                        ? { fontWeight: 600, color: color.text, background: color.bg }
                        : { fontWeight: 600 };
                    // Strip "Academics" from the raw event name; fall back to fixed label
                    const displayName = ev
                        ? (ev.eventName || '').replace(/\s*academics\s*/i, '').trim() || label
                        : label;
                    return (
                        <tr key={label}>
                            <td style={nameStyle}>{displayName}</td>
                            <td style={rowStyle}>{ev ? (ev.startTime || '\u2014') : '\u2014'}</td>
                            <td style={rowStyle}>{ev ? (ev.endTime || '\u2014') : '\u2014'}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
```

Also update `WhiteboardView` to always pass `acadEvts` to `WhiteboardAcademics` (remove the `acadEvts.length > 0` guard that was around it — after Task 3 refactor, the Academics div always renders):
The Task 3 new JSX already removes that guard by always rendering `<WhiteboardAcademics events={acadEvts} roster={roster} />`.

### Verification
1. Always 4 rows: Alpha FTC, Alpha STC, Bravo FTC, Bravo STC — regardless of event count.
2. Row with matching event: correct color, name without "Academics".
3. Row with no matching event: label + em-dash in Start/End.

---

## Task 5: Supervision Add (+) Button for Custom Events

**Files:**
- Modify: `Interactive-scheduler/interactive-scheduler.html`
  - `WhiteboardSupervision` (~line 5515)
  - `WhiteboardView` Supervision JSX (~line 6074)

### Description
Add `+ Add Supervision Event` button below Supervision table, plus delete (×) button on custom supervision events.

### Step 1: Update WhiteboardSupervision props

**Old:**
```jsx
const WhiteboardSupervision = ({ events, roster, onEditSave, onAdd, onRemove, onFocusEvent,
    highlights, highlightMode, onHighlight }) => {
```
**New:**
```jsx
const WhiteboardSupervision = ({ events, roster, onEditSave, onAdd, onRemove, onFocusEvent,
    highlights, highlightMode, onHighlight, onCreateEvent, onDeleteCustom, activeDay }) => {
```

### Step 2: Update return JSX — wrap in Fragment, add delete column, add button

**Old return:**
```jsx
return (
    <table className="wb-table wb-table-compact">
        <colgroup>...</colgroup>
        <thead>...</thead>
        <tbody>...</tbody>
    </table>
);
```

**New return (Fragment + button):**
```jsx
return (
    <React.Fragment>
        <table className="wb-table wb-table-compact">
            <colgroup>
                <col style={{ width: '7.5%' }} />
                {Array.from({ length: maxTriplets }, (_, i) => (
                    <React.Fragment key={i}>
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '4.5%' }} />
                        <col style={{ width: '4.5%' }} />
                    </React.Fragment>
                ))}
                <col />{/* Notes */}
                <col style={{ width: 20 }} />{/* Delete btn */}
            </colgroup>
            <thead>
                <tr>
                    <th>Duty</th>
                    {Array.from({ length: maxTriplets }, (_, i) => (
                        <React.Fragment key={i}>
                            <th>POC</th><th>Start</th><th>End</th>
                        </React.Fragment>
                    ))}
                    <th>Notes</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                {SUPV_DUTY_ORDER.map(duty => {
                    const evts = byDuty[duty] || [];
                    return (
                        <tr key={duty}>
                            <td style={{ fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.6rem' }}>{duty}</td>
                            {Array.from({ length: maxTriplets }, (_, i) => {
                                const ev = evts[i];
                                if (!ev) return (
                                    <React.Fragment key={i}><td></td><td></td><td></td></React.Fragment>
                                );
                                return (
                                    <React.Fragment key={i}>
                                        <WhiteboardCrewCell person={ev.personnel[0] || null}
                                            eventId={ev.id} slotIndex={0} roster={roster}
                                            onAdd={onAdd} onRemove={onRemove} onFocusEvent={onFocusEvent}
                                            highlight={highlights ? highlights[`${ev.id}:crew:0`] : null}
                                            highlightMode={highlightMode} onHighlight={onHighlight} />
                                        <WhiteboardCell value={ev.startTime} field="startTime" eventId={ev.id} type="time"
                                            onSave={handleCellSave}
                                            highlight={highlights ? highlights[`${ev.id}:startTime`] : null}
                                            highlightMode={highlightMode} onHighlight={onHighlight} />
                                        <WhiteboardCell value={ev.endTime} field="endTime" eventId={ev.id} type="time"
                                            onSave={handleCellSave}
                                            highlight={highlights ? highlights[`${ev.id}:endTime`] : null}
                                            highlightMode={highlightMode} onHighlight={onHighlight} />
                                    </React.Fragment>
                                );
                            })}
                            <WhiteboardCell value={evts[0]?.notes || ''} field="notes"
                                eventId={evts[0]?.id} type="text" onSave={handleCellSave}
                                highlight={highlights && evts[0] ? highlights[`${evts[0].id}:notes`] : null}
                                highlightMode={highlightMode} onHighlight={onHighlight} />
                            <td>
                                {evts.some(ev => ev.isCustom) && onDeleteCustom && (
                                    <span className="wb-delete-btn"
                                        onClick={() => {
                                            const customEv = evts.find(ev => ev.isCustom);
                                            if (customEv) onDeleteCustom(customEv.id);
                                        }}
                                        title="Remove custom event">{'\u2715'}</span>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        {onCreateEvent && (
            <button className="wb-add-row" onClick={() => onCreateEvent('Supervision', activeDay)}>
                + Add Supervision Event
            </button>
        )}
    </React.Fragment>
);
```

### Step 3: Pass new props from WhiteboardView

**Old:**
```jsx
<WhiteboardSupervision events={evts} roster={roster}
    onEditSave={onEditSave} onAdd={onAdd} onRemove={onRemove}
    onFocusEvent={onFocusEvent}
    highlights={highlights} highlightMode={highlightMode}
    onHighlight={handleHighlightCellClick} />
```

**New:**
```jsx
<WhiteboardSupervision events={evts} roster={roster}
    onEditSave={onEditSave} onAdd={onAdd} onRemove={onRemove}
    onFocusEvent={onFocusEvent}
    highlights={highlights} highlightMode={highlightMode}
    onHighlight={handleHighlightCellClick}
    onCreateEvent={handleCreateWbEvent}
    onDeleteCustom={onDeleteCustom}
    activeDay={activeDay} />
```

### Verification
1. `+ Add Supervision Event` button appears below Supervision table.
2. Click → new custom event row appears in "Other (As Req'd)" duty slot.
3. Custom events show `×` delete button; readonly events do not.
4. Clicking × removes the event.

---

## Task 6: FOA/Auth Display in Date Header

**Files:**
- Modify: `Interactive-scheduler/interactive-scheduler.html`
  - CSS (after `.wb-date-header-label`, ~line 1268)
  - `WhiteboardView` component (~line 6004 for computed value, ~line 6034 for JSX)

### Description
Display FOA and Auth event badges in the whiteboard date header. Display-only, no editing.

### Step 1: Add CSS

Add after `.wb-date-header-label` rule (~line 1268):
```css
.wb-header-badges {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-left: auto; /* push to right side of flex row */
    z-index: 1;
}
.wb-foa-badge, .wb-auth-badge {
    font-size: 0.5rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 3px;
    white-space: nowrap;
    letter-spacing: 0.02em;
}
.wb-foa-badge {
    background: rgba(239,68,68,0.15);
    color: #fca5a5;
    border: 1px solid rgba(239,68,68,0.3);
}
.wb-auth-badge {
    background: rgba(59,130,246,0.15);
    color: #93c5fd;
    border: 1px solid rgba(59,130,246,0.3);
}
```

Add light-mode overrides after `.light-mode .wb-highlight-btn.active` rule:
```css
.light-mode .wb-foa-badge  { background: rgba(239,68,68,0.1);   color: #b91c1c; border-color: rgba(239,68,68,0.25); }
.light-mode .wb-auth-badge { background: rgba(59,130,246,0.1); color: #1d4ed8; border-color: rgba(59,130,246,0.25); }
```

### Step 2: Add computed value in WhiteboardView

After the `dateLabel` computation (~line 6004):
```js
const foaAuthBadges = useMemo(() => {
    if (!activeDay) return { foa: null, auth: null };
    const dayEvts = workingEvents.filter(ev => ev.date === activeDay);
    const foaEv  = dayEvts.find(ev => (ev.eventName || '').toUpperCase().includes('FOA'));
    const authEv = dayEvts.find(ev => (ev.eventName || '').toUpperCase().includes('AUTH'));
    const foa = foaEv ? {
        time: (foaEv.startTime && foaEv.endTime)
            ? `${foaEv.startTime}\u2013${foaEv.endTime}`
            : 'All Day',
    } : null;
    const auth = authEv ? {
        name: (authEv.eventName || '').replace(/auth(orization|orised|orize)?/i, '').trim() || 'Auth',
    } : null;
    return { foa, auth };
}, [workingEvents, activeDay]);
```

### Step 3: Update date header JSX

**Old:**
```jsx
<div className="wb-date-header-row">
    <button
        className={`wb-highlight-btn ${highlightMode ? 'active' : ''}`}
        onClick={() => setHighlightMode(m => !m)}
        title="Toggle highlight mode — click a cell to pick a color"
    >
        {highlightMode ? '\uD83C\uDFA8 Highlight ON' : '\uD83C\uDFA8 Highlight'}
    </button>
    <div className="wb-date-header-label">
        {dateLabel.weekday}, {dateLabel.day} {dateLabel.month}
    </div>
</div>
```

**New:**
```jsx
<div className="wb-date-header-row">
    <button
        className={`wb-highlight-btn ${highlightMode ? 'active' : ''}`}
        onClick={() => setHighlightMode(m => !m)}
        title="Toggle highlight mode — click a cell to pick a color"
    >
        {highlightMode ? '\uD83C\uDFA8 Highlight ON' : '\uD83C\uDFA8 Highlight'}
    </button>
    <div className="wb-date-header-label">
        {dateLabel.weekday}, {dateLabel.day} {dateLabel.month}
    </div>
    <div className="wb-header-badges">
        {foaAuthBadges.foa  && <span className="wb-foa-badge">FOA: {foaAuthBadges.foa.time}</span>}
        {foaAuthBadges.auth && <span className="wb-auth-badge">{foaAuthBadges.auth.name}</span>}
    </div>
</div>
```

### Verification
1. Day with a supervision event named "FOA..." → red badge in header.
2. Day with "Auth..." event → blue badge.
3. Day with neither → no badges. Right side of header stays clean.
4. Test in light and dark mode.

---

## Task 7a: Blank Pucks — Custom-Name Pucks (IP, IFTE/ICSO, Attached/Support)

**Files:**
- Modify: `Interactive-scheduler/interactive-scheduler.html`
  - Constants (~line 2089, after `DEFAULT_CHIP`)
  - CSS (~line 500, after picker-body styles)
  - New `BlankPuck` component (before `PersonnelPicker`, ~line 4134)
  - `PersonnelPicker` JSX (~line 4230)

### Description
Add always-visible blank pucks at the top of the picker. Users can click to type a custom name, then drag onto any crew cell. Three types: IP (green), IFTE/ICSO (indigo), Attached (slate).

### Step 1: Add BLANK_PUCK_DEFS constant

After `DEFAULT_CHIP` (~line 2089):
```js
const BLANK_PUCK_DEFS = [
    { id: 'blank-ip',       label: 'IP',        cat: 'Staff IP' },
    { id: 'blank-ifte',     label: 'IFTE/ICSO', cat: 'Staff IFTE/ICSO' },
    { id: 'blank-attached', label: 'Attached',  cat: 'Attached/Support' },
];
```

### Step 2: Add CSS

Add after `.picker-body` styles (~line 510):
```css
.blank-puck-row {
    display: flex;
    gap: 4px;
    padding: 4px 6px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.02);
    flex-wrap: wrap;
    align-items: center;
}
.blank-puck-row-label {
    font-size: 0.45rem;
    color: rgba(255,255,255,0.35);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
}
.blank-puck {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.55rem;
    font-weight: 600;
    cursor: grab;
    border: 1px dashed rgba(255,255,255,0.3);
    white-space: nowrap;
    min-width: 30px;
    user-select: none;
}
.blank-puck:active { cursor: grabbing; }
.blank-puck-input {
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    width: 64px;
    outline: none;
    padding: 0;
}
.blank-puck-input::placeholder { color: inherit; opacity: 0.55; }
```

Light mode:
```css
.light-mode .blank-puck-row { background: rgba(0,0,0,0.02); border-bottom-color: rgba(0,0,0,0.06); }
.light-mode .blank-puck-row-label { color: rgba(0,0,0,0.35); }
.light-mode .blank-puck { border-color: rgba(0,0,0,0.25); }
```

### Step 3: Add BlankPuck component

Add before `PersonnelPicker` (~line 4134):
```jsx
const BlankPuck = ({ def }) => {
    const [customName, setCustomName] = useState('');
    const [editing, setEditing] = useState(false);
    const inputRef = React.useRef(null);
    const color = CATEGORY_COLORS[def.cat] || DEFAULT_CHIP;

    React.useEffect(() => {
        if (editing && inputRef.current) inputRef.current.focus();
    }, [editing]);

    const handleDragStart = (e) => {
        const name = customName.trim() || def.label;
        e.dataTransfer.setData('text/plain', JSON.stringify({ person: name, isBlankPuck: true, category: def.cat }));
        e.dataTransfer.effectAllowed = 'copy';
        e.currentTarget.style.opacity = '0.45';
    };
    const handleDragEnd = (e) => { e.currentTarget.style.opacity = '1'; };

    const handleSpanClick = () => { if (!editing) setEditing(true); };
    const handleBlur = () => setEditing(false);
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
        }
    };

    return (
        <span
            className="blank-puck"
            style={{ background: color.bg, color: color.text }}
            draggable={!editing}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={handleSpanClick}
            title={`Click to name, then drag to assign`}
        >
            {editing ? (
                <input
                    ref={inputRef}
                    className="blank-puck-input"
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    placeholder={def.label}
                />
            ) : (
                customName.trim() || def.label
            )}
        </span>
    );
};
```

### Step 4: Add blank-puck-row to PersonnelPicker

**Old (~line 4230):**
```jsx
<div className="picker-body">
    {people.map(p => {
```

**New:**
```jsx
<div className="blank-puck-row">
    <span className="blank-puck-row-label">Blanks</span>
    {BLANK_PUCK_DEFS.map(def => (
        <BlankPuck key={def.id} def={def} />
    ))}
</div>
<div className="picker-body">
    {people.map(p => {
```

### Verification
1. Picker shows "Blanks" row with 3 colored pucks: IP (green), IFTE/ICSO (indigo), Attached (slate).
2. Click puck → text input with placeholder. Type name. Click away → puck shows typed name.
3. Drag puck onto event crew area → person added with typed name (or default label).
4. Puck resets after drag — typed name persists for reuse.
5. Blank pucks visible regardless of active filter tab.
6. Existing PersonnelChip drag-drop still works.

---

## Task 7b: Vacancy Pucks (FTC-A, FTC-B, STC-A, STC-B) — DEFERRED

More complex system requiring a `vacancies` field in the event data model, vacancy rendering in `WhiteboardCrewGroup`, and vacancy-aware add/remove logic. Defer to a separate PR after Task 7a is stable.

---

## Implementation Order

| # | Task | Effort | Dependencies |
|---|------|--------|--------------|
| 1 | Picker scroll threshold | XS | None |
| 6 | FOA/Auth badges | S | None |
| 4 | Academics fixed categories | S | None |
| 5 | Supervision (+) button | S | None |
| 3 | Supervision resize + Academics inline | M | Task 4 (render together cleanly) |
| 2 | Military time + Tab navigation | L | None (but largest change) |
| 7a | Blank pucks | M | None |

---

## Line Number Quick-Reference

Lines are approximate (file ~7017 lines at plan time). Lines shift as edits accumulate.

| Component | Approx. Lines | Task(s) |
|-----------|---------------|---------|
| CSS: picker-body | ~500 | 7a |
| CSS: wb-table | ~1294–1323 | 3 |
| CSS: wb-input-time | ~1351–1360 | 2 |
| CSS: wb-date-header-label | ~1261–1263 | 6 |
| CSS: wb-highlight-btn | ~1496–1512 | — |
| CSS: light-mode wb | ~1985–2030 | 2, 6, 7a |
| Constants (SUPV_DUTY_ORDER) | ~2060 | 4 |
| Constants (DEFAULT_CHIP) | ~2089 | 7a |
| `BlankPuck` component | before 4134 | 7a |
| `PersonnelPicker` | ~4214–4256 | 7a |
| `WhiteboardCell` | ~5336–5390 | 2 |
| `WhiteboardSupervision` | ~5514–5607 | 3, 5 |
| `WhiteboardFlying` | ~5609–5713 | 2 |
| `WhiteboardGround` | ~5715–5800 | 2 |
| `WhiteboardAcademics` | ~5803–5848 | 4 |
| `WhiteboardNA` | ~5850–5917 | 2 |
| `WhiteboardView` | ~5921–6118 | 1, 3, 5, 6 |
