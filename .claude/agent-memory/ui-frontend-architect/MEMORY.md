# UI Frontend Architect -- Agent Memory

## Project Architecture (Current: single-file HTML v4.2.0)
- Single HTML file: React 18 UMD + Babel standalone + TailwindCSS CDN — NO build step
- File: `Interactive-scheduler/interactive-scheduler.html` (~9450 lines as of v4.2.0 post-T8-revert)
- Dark theme default; `.light-mode` on `<body>` for light theme (~497 lines additive overrides)
- JetBrains Mono font throughout; three screens: Loading → Event Selection → Scheduler View
- ALWAYS grep for current line positions before editing — file shifts with every change

## Critical Patterns
- **initialized ref guard**: `initialized` useRef + `requestAnimationFrame` prevents phantom changes during React 18 batched init
- **Display:none view toggling**: Timeline + Rainbow + Whiteboard all always mounted, toggled with display:none
- **Tooltip portal**: position:fixed at app root, z-index:9999, threaded through DayColumn > EventCard > PersonnelChip
- **Conflict detection runs on ALL events**: Including readonly (Supervision/Academics)
- **setChanges inside setWorkingEvents updater**: Required for React 18 batching atomicity
- **focusedAvailability cancelled guard**: `if (ev.cancelled) return` skips cancelled events in focus picker (v4.2.0 T1)

## Event-Level Change Tracking (v4.2.0)
- `event-edit` type carries `before`/`after` snapshots: `{ eventName, model, startTime, endTime, notes }`
- `notes` added to snapshots in v4.2.0 — older entries will NOT have `notes` key
- `handleUndoGroup`: use `Object.keys(ch.before).forEach(k => ev[k] = ch.before[k])` NOT `Object.assign` — avoids setting ev.notes=undefined on pre-notes entries
- `NetChangeEntry` renders notes diff when `before.notes !== after.notes`
- Event-level types: 'event-cancel', 'event-edit', 'event-delete' — skip in netMap forEach in computeNetChanges

## Select-All Persistence (v4.2.0 T7)
- `selectAllActive` flag in `saveState`/`loadState` (5th param to saveState)
- `EventSelectionScreen` tracks it; `onContinue(ids, cats, selectAllActive)` passes to App
- `refreshFromWhiteboard` auto-selects new events when flag is true
- `SchedulerView` receives `selectAllActive` prop; passes to both its `saveState()` calls

## Time Input Strategy (v4.2.0 post-T8-revert)
- `MilitaryTimeInput`: used in CreateEventModal and EditEventModal; auto-inserts colon on 2nd digit; accepts `style` prop
- `PendingTimeInput` (~line 6946): active component for whiteboard pending supervision slot times; manages local draft; fires `onCommit(value)` on blur or Enter; props: `value, amber, placeholder, onCommit`
- `WhiteboardCell` type=time: uses standard `<input className="wb-input">` (same as text cells); `commit()` validates via `TIME_RE`, reverts on invalid
- T8 SegmentedTimeInput REVERTED — caused event re-sorting mid-edit (onChange fired on each valid digit → list re-render → lost scroll position). Time entry UX remains a backlog item.

## Edit-Selection Preservation (v4.2.0 T3)
- `onChangeSelection` in App does NOT call `clearWorkingCopy()` — working copy is preserved on navigate-back
- `handleContinue` loads existing cache from `loadWorkingCopy()` and passes as `cachedWorkingState` to SchedulerView
- SchedulerView init effect uses `cachedWorkingState` when present, instead of reinitializing from raw allEvents

## FOA/AUTH Filtering (v4.2.0 T4)
- FOA/AUTH events: `section=Supervision, startTime=null, eventName=/^(FOA|AUTH)$/i`
- `SUPERVISION_ROLE_ORDER` does NOT include 'FOA' or 'AUTH'
- `dayEvents` useMemo in `WhiteboardView` filters these out so they don't render as whiteboard rows
- FOA/AUTH still appear in day-column header pills (via `foaByDate` useMemo in SchedulerView)

## Supervision Table Structure (v4.2.0 T6)
- Each triplet (POC/Start/End) now has a 4th × delete column
- Colgroup: `<col style={{ width:14 }}>` per triplet group (4th of 4 columns per group)
- Occupied triplet render: delete `<td className="wb-supv-triplet-del-cell">` after End cell
- Pending slot render: empty `<td className="wb-supv-triplet-del-cell"></td>` to maintain column count
- CSS: `td.wb-supv-triplet-del-cell { width:14px; min-width:14px; padding:0 1px !important; text-align:center; vertical-align:middle; }`

## CSS Selector Pitfall — Class on Leaf Table Cell
- Use `th.classname` or `td.classname` NOT `.classname th`/`.classname td`
- `.classname td` is a DESCENDANT selector — impossible when td IS the element with the class
- Padding overrides on table cells need `!important` if ancestor compact-variant rule also sets padding

## FOA/AUTH Data Flow (v4.1.0)
- Parser emits Supervision events: `eventName:'FOA'|'AUTH'`, `startTime:null`, `endTime:null`, `personnel:[personName]`
- Footer row detection: `if (row[9] === 'FOA')` BEFORE empty-duty guard in supervision parser
- `foaByDate` useMemo in SchedulerView: builds `{ [date]: {foa,auth} }` from workingEvents, feeds DayColumn chips
- Whiteboard seeding effect seeds dutyState from parsed events when localStorage is empty for that day

## Section Layout Pattern (v3.11.0+)
- Three specialized layout fns: buildSupervisionLayout, buildFlyingLayout, buildGroundLayout
- All return shape: `{ evMap: {[id]:{top,height}}, total, <bandArray> }`
- LABEL_H=12 offset at top of every band; events start at cum+LABEL_H
- Flying band: `{ model, top, height, flightH }` — flightH < height signals SIM sub-tier
- Ground band: `{ name, top, height, isSingleton }` — isSingleton skips label
- Supervision band: `{ role, top, height }` — label at top:1

## Day-Scoped Conflict Filtering (v4.0.1)
- `wbDayConflicts` useMemo: filters conflicts Map to active day; passed to WhiteboardView + PersonnelPicker in WB mode
- Full `conflicts` Map used for header badge + ConflictSummaryModal (global multi-day indicators)

## Whiteboard Add-Event Modal (v4.2.0 T5)
- State: `showAddSupvModal`, `addSupvDutyName` in `WhiteboardSupervision`
- Click-outside useEffect closes modal; quick-pick chips from `SUPV_DUTY_ORDER`; Cancel/Create buttons
- `window.prompt` fully removed

## Color Scheme (must match source spreadsheet)
- FTC-A=purple (#7c3aed), FTC-B=orange (#ea580c), STC-A=purple variant (#9333ea), STC-B=orange variant (#f97316)
- Staff IP=green (#16a34a), Staff IFTE/ICSO=indigo (#4338ca), Staff STC=blue (#2563eb), Attached=slate (#64748b)
- Section colors: Flying=green (#10b981), Ground=amber (#f59e0b), NA=red (#ef4444)
