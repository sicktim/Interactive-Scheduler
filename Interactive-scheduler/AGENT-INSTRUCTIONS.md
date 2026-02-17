# TPS Interactive Scheduler — Agent Handoff Instructions

> **Current Version:** 3.5
> **File:** `Interactive-scheduler/interactive-scheduler.html` (~3560 lines)
> **Last Updated:** 2026-02-12
> **Status:** v3.5 complete — Timeline Alignment, Handle Polish & Tooltip Fix

### PROCESS REQUIREMENT
**Before implementing ANY fix**, agents MUST:
1. Read `Interactive-scheduler/feedback.txt` for user-reported issues and context
2. Read `Interactive-scheduler/assumptions.txt` for user-annotated design decisions
3. **After implementing a fix**, update `feedback.txt` with a status line (e.g., `[FIXED in v3.0]`) next to the resolved item
4. Update `assumptions.txt` if the fix changes any design assumptions
5. Update this file's bug/feature tables to reflect current state
6. Update version number in `Interactive-scheduler/interactive-scheduler.html` to match `version-history.md`
7. **Version update summary** — When bumping the version, include a short title summary directly in the HTML version comment AND in `version-history.md`. Format:
   - **HTML comment (line 1):** `<!-- Interactive Scheduler v3.X — Short Title Summary -->`
   - **version-history.md:** Section heading + categorized bullet list (Bug Fixes, Enhancements, New Features) with one-line descriptions of each change. See v3.3 entry for the canonical format.

---

## 1. Project Intent

The **TPS Interactive Scheduler** is a single-page web app for USAF Test Pilot School scheduling personnel. It lets schedulers:

- **View** multi-day flight/ground/NA schedules pulled from a Google Apps Script API
- **Reassign crew** between events via drag-and-drop or click
- **Detect conflicts** (double-booked personnel across overlapping events) with detailed tooltips
- **Track changes** with net-effect display (moves grouped, reciprocals cancelled), undo, copy-to-clipboard, and localStorage persistence
- **Select events** they're responsible for on a per-event (Flying/Ground) and per-category (NA) basis

The app is used alongside — and complements — an existing Gantt chart view (`GUI HTML/index.html` v5.3, production). Both share the same API and data format.

---

## 2. Architecture

### Single-file pattern
One self-contained HTML file: React 18 (production UMD) + Babel (in-browser JSX) + TailwindCSS (CDN). No build step. Same pattern as the Gantt chart.

### Three screens
1. **Loading** — Fetches roster + batch data from API; falls back to embedded sample data
2. **Event Selection** — User selects which events they manage (by date, by section, NAs by crew category)
3. **Scheduler View** — Main workspace with day columns, event cards, personnel picker, change summary

### Key dependencies (CDN)
```
React 18          unpkg.com/react@18/umd/react.production.min.js
ReactDOM 18       unpkg.com/react-dom@18/umd/react-dom.production.min.js
Babel Standalone   unpkg.com/@babel/standalone/babel.min.js
TailwindCSS        cdn.tailwindcss.com
JetBrains Mono     fonts.googleapis.com
```

---

## 3. Data Flow

### API
```
Base URL: https://script.google.com/macros/s/AKfycbyZNyrLxkW2vjbq8xpii43rWzYkkDvJTQ_KQCGMyErPZKqssL0XiA_UknwxOJ_XGzAt/exec
Endpoints:
  ?type=roster   → { roster: { "FTC-A": [...], "FTC-B": [...], ... } }
  ?type=batch    → { days: [{ isoDate, data: { flying, ground, na, supervision, academics } }] }
```

### Data pipeline (v3.1)
```
API → transformBatchData(batchJson, roster) → mergeDuplicateEvents(events, roster) → setAllEvents()
                                                ↑
Sample fallback also uses mergeDuplicateEvents(events, SAMPLE_ROSTER) via buildSampleEvents()
```

### Two input formats
| Format | Source | Transformer |
|--------|--------|-------------|
| **Raw arrays** | `?type=batch` API | `transformBatchData()` |
| **Structured objects** | `sheet-return-v4.0.json` | `transformSheetReturn()` |

Both produce the same normalized event shape:
```js
{
  id, section, date, model, eventName,
  startTime, endTime, etd, eta,
  personnel: [...],           // mutable working copy
  originalPersonnel: [...],   // immutable snapshot for undo/reset
  notes, readonly
}
```

### Data parsing details
- **Flying:** `row[0]=model, row[1]=briefTime, row[2]=etd, row[3]=eta, row[4]=debriefEnd, row[5]=eventName, row[6..14]=crew, row[15]=notes`
- **Ground:** `row[0]=eventName, row[1]=startTime, row[2]=endTime, row[3..9]=crew, row[10]=notes`
- **NA:** `row[0]=reason, row[1]=startTime, row[2]=endTime, row[3..]=crew`
- **Supervision:** `row[0]=duty, then triplets of [POC, startTime, endTime]` — readonly
- **Academics:** `row[0]=group name, row[1]=start, row[2]=end` — maps group to roster category, entire category becomes personnel — readonly

### Notes-as-people filtering
`isValidName()` rejects strings that are >25 chars, >4 words, or exactly "FALSE"/"TRUE". Applied to all crew arrays during parsing.

---

## 4. Component Map (v3.1)

```
App
├── LoadingScreen
├── EventSelectionScreen       ← role-based grouping (A-Class/B-Class/Staff/Other)
│   ├── classifyEvent()           quick-select buttons per category
│   ├── NA section (standalone)   crew category chips, separate from dates
│   └── Date groups with class/section sub-groups
├── SchedulerView
│   ├── tooltip state (portal-based, position:fixed at root)
│   ├── Header (day tabs, conflict count, edit selection, refresh)
│   ├── Timeline area
│   │   └── DayColumn (per date) — passes onShowTooltip/onHideTooltip
│   │       └── Section (Flying/Ground/NA)
│   │           └── EventCard — passes tooltip props to chips, badge uses portal
│   │               ├── Title bar (type label, name, time)
│   │               ├── Flight bar (ETD→ETA graphical, Flying only)
│   │               ├── Crew area (PersonnelChip × N, "+" add chip)
│   │               └── Conflict badge (onMouseEnter triggers portal tooltip)
│   ├── PersonnelPicker (bottom panel, category tabs, search, drag source)
│   ├── ChangeSummary (right panel, uses computeNetChanges for display)
│   │   └── NetChangeEntry (move/add/remove display with grouped persons)
│   └── Tooltip portal div (position:fixed, z-index:9999)
```

---

## 5. Key Algorithms

### Duplicate event merging (`mergeDuplicateEvents(events, roster)`) — UPDATED in v3.1
- **Two-phase approach** (v3.1): Phase 1 groups by base key WITHOUT personnel[0]; Phase 2 checks distinct staff leads
- `isStaff(name, roster)` helper checks Staff IP, Staff IFTE/ICSO, Staff STC, Attached/Support categories
- 0-1 distinct staff instructor leads → merge all events in base group
- 2+ distinct staff instructor leads → sub-group by lead, merge within sub-groups
- NA and readonly events excluded from merging
- Combines personnel with dedup (staff lead stays in position 0), merges notes with "; "
- Called after `transformBatchData()` before events enter state; requires roster parameter
- See `fix-duplicate-merging.md` for 13 corner cases analyzed

### Conflict detection (`detectConflicts`)
- Builds `person||date → [events]` map across ALL events (including readonly)
- For every pair with overlapping time ranges, records both directions
- Returns `Map<eventId, Map<personName, Array<{eventName, model, section, startTime, endTime}>>>`
- Tooltips show the *specific* conflicting event details

### Net change computation (`computeNetChanges`) — NEW in v3.0
- Display-only transformation; raw `changes` array preserved for undo
- Accumulates net count per (person, eventId) pair
- Net-zero pairs (add then remove same person/event) hidden from display
- Detects moves: person has exactly 1 net-remove and 1 net-add → MOVE
- Groups by instruction type and event pair (bulk moves shown as one line)
- Each instruction carries `rawIndices: number[]` for undo
- See `fix-net-changes.md` for 9 scenarios analyzed

### Event classification (`classifyEvent`) — NEW in v3.1
- Staff events: keyword match against STAFF_KEYWORDS (MSN QUAL, CHECKRIDE, CHASE, etc.)
- A-Class events: majority of non-staff personnel from FTC-A or STC-A
- B-Class events: majority of non-staff personnel from FTC-B or STC-B
- Other: events that don't match any above criteria

### Lane assignment (`buildLayout`) — UPDATED in v3.1
- Events sorted by start time, greedily placed into lanes (first-fit)
- `estimateHeight()` **width-aware**: computes card pixel width from time span, calculates chips-per-row based on available width (avg 78px/chip)
- `visualEnd()` (v3.1) accounts for min-width:140px card expansion when computing lane overlap
- Returns `{ evMap: { [id]: { top, height } }, total: totalHeight }`

### Change tracking — UPDATED in v3.1
- Changes stored as chronological array of `{ type, person, date, eventSection, eventModel, eventName, eventTime, eventId }`
- `initialized` ref guard (with `requestAnimationFrame`) prevents recording changes during state initialization
- `handleRemove` now calls `setChanges` inside `setWorkingEvents` updater for React 18 batching atomicity
- `handleUndoGroup(indices)` reverses entire groups in reverse-chronological order
- Auto-saved to localStorage under key `tps-scheduler-state`

### Tooltip portal — NEW in v3.0
- Single `tooltip` state in SchedulerView: `{ text, x, y }`
- `showTooltip(text, rect)` / `hideTooltip()` callbacks threaded through DayColumn → EventCard → PersonnelChip
- Portal div at SchedulerView root with `position: fixed; z-index: 9999`
- Completely escapes stacking contexts — always visible above sticky headers

---

## 6. Color Scheme (must match source spreadsheet)

```js
CATEGORY_COLORS = {
  'FTC-A':            { bg: '#7c3aed', text: '#f3e8ff' },  // purple
  'FTC-B':            { bg: '#ea580c', text: '#fff7ed' },  // orange
  'STC-A':            { bg: '#9333ea', text: '#fae8ff' },  // purple variant
  'STC-B':            { bg: '#f97316', text: '#ffedd5' },  // orange variant
  'Staff IP':         { bg: '#16a34a', text: '#dcfce7' },  // green
  'Staff IFTE/ICSO':  { bg: '#4338ca', text: '#e0e7ff' },  // indigo
  'Staff STC':        { bg: '#2563eb', text: '#dbeafe' },  // blue
  'Attached/Support': { bg: '#64748b', text: '#f1f5f9' },  // slate
}
```

Section colors: Flying=green (`#10b981`), Ground=amber (`#f59e0b`), NA=red (`#ef4444`)

Reference image: `Interactive-scheduler/color-scheme.png`

---

## 7. Bugs Fixed in v2.0

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Notes parsed as people | Raw API crew columns contain scheduler notes | `isValidName()` heuristic filter |
| Cluttered/overlapping cards | Fixed 52px event card height | Dynamic `estimateHeight()` based on crew count |
| Unclear conflict info | Badge showed count only | Detailed tooltips with conflicting event names/times |
| Can't drag from picker | `effectAllowed` mismatch + missing drop handlers | `copyMove` + drop handlers on `.event-crew-area` |
| Changes shown on load | State updater side-effects + no init guard | `initialized` ref + `requestAnimationFrame` + separate `setChanges` |
| Poor selection UX | Flat list of all events | By-date grouping, section headers, NA by category chips |
| Wrong colors | Original guessed colors | Updated to match `color-scheme.png` exactly |

---

## 8. Bugs Fixed in v3.0

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Top-row tooltip obscured | CSS-only tooltip trapped in stacking context (z-index:200 inside card z-index:5) | Portal-based tooltip at app root with `position:fixed; z-index:9999` |
| Real-estate overfill | `estimateHeight()` assumed 3 chips/row regardless of card width | `min-width:140px` on cards + width-aware height estimation |
| Duplicate events | Spreadsheet overflow rows appear as separate events | `mergeDuplicateEvents()` groups by (date+name+times+lead), combines crew |
| Change summary not net | Raw add/remove log, no cancellation or grouping | `computeNetChanges()` cancels net-zero, detects moves, groups bulk operations |

---

## 8b. Bugs Fixed in v3.1

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| X-button removal not tracked | `setChanges` called outside `setWorkingEvents` updater; React 18 batching race | `setChanges` moved inside `setWorkingEvents` updater for atomicity |
| Conflict invisible on orange chips | Red outline (#ef4444) invisible on orange FTC-B/STC-B chip backgrounds | Changed to amber/yellow (#fbbf24) with glow for universal contrast |
| Duplicate tooltip on conflict badge | Native `title` attribute overlaid portal tooltip | Removed `title` from conflict badge and conflict chips |
| Events overlapping horizontally | `buildLayout` used `evEnd()` ignoring min-width:140px visual expansion | Added `visualEnd()` accounting for card expansion; `overflow:hidden` on section-lanes |
| Duplicate merge misses no-instructor rows | `mergeDuplicateEvents` keyed on personnel[0]; 2nd row has no instructor → different key | Two-phase merge: base key without personnel[0], then sub-group by staff leads |
| Picker "Has time conflict" generic text | `conflictPeople` was just a Set; no event details for picker chips | `personConflictSummary` map with actual conflicting event names/times |
| Picker busy dots unexplained | Orange dot had no legend | Added "assigned" legend text next to dot indicator in picker header |
| NA under first day only | NA section rendered inside `dates.map()` conditional on `date === dates[0]` | NA moved to standalone section above date groups |
| Event chooser unorganized | Flat list within date sections | `classifyEvent()` categorizes as A-Class/B-Class/Staff/Other; quick-select buttons; role-based group headers |

---

## 8c. Known Bugs (reported in v3.1 feedback, targeting v3.2)

| # | Issue | Root Cause | Priority |
|---|-------|-----------|----------|
| 1 | **Empty events not displayed** | `transformBatchData()` line ~917: `if (crew.length === 0) return;` skips flying events with no personnel. User says events with model+times+name but no people must show. | **PRIORITY** |
| 2 | **P/S CHASE misclassified as Staff** | `STAFF_KEYWORDS` includes `'CHASE'` which substring-matches student events like "P/S CHASE (T-38)(TF 5503F)" and "LOW L/D P/S CHASE". These are A/B-Class student pursuit/chase flights, not staff events. | Medium |
| 3 | **Merge logic combines separate events** | Two genuinely different flights with same model+name+times but different crews (e.g., two T-38 CF-1 sorties at 09:30) get merged when neither crew lead is detected as staff (`staffLeads.size === 0 → merge all`). Need to sub-group by `personnel[0]` regardless of staff status. Screenshots: `combined-T38-events-error.png`, `combined-T38-events-error-whiteboard-source.png` | Medium |

**Analysis of Bug #3 (merge logic):**
- The original merge was designed for: same event split across whiteboard rows for more crew slots (same instructor, overflow students)
- The problem case: two genuinely different flights with same name/model/times but different leads, where neither lead is in a staff roster category
- Fix approach: sub-group by `personnel[0]` (first person = lead) regardless of staff detection. Events with empty personnel attach to existing groups (overflow rows with no instructor listed).
- This replaces the staff-only lead detection while preserving the "no-lead overflow" merge behavior.

---

## 9. Features NOT YET Implemented (future scope)

These are documented in `assumptions.txt` (user-edited) but not built yet:

### 9a. Event Time Editing (assumption #1)
> "They can be modified manually by clicking on the event and enabling time adjustment. Then it can be modified by typing times or by dragging in the UI."

**Suggested approach:**
- Click event → shows edit mode overlay with time inputs
- Option to drag event edges on the timeline to resize
- Changes to times should be tracked in the change summary
- Only for non-readonly events

### 9b. Touch/Mobile Drag Support
HTML5 Drag and Drop doesn't work on touch devices. Would need a polyfill or custom touch handlers.

### 9c. Personnel Status Notes
Roster API returns status notes (TDY, LV, Stanford, etc.) — these should display as info on chips or in the picker but don't prevent assignment.

### 9d. localStorage Replay of Changes on Reload
Currently saves the change log but doesn't replay changes when reloading with fresh API data. The saved `changes` array exists but isn't applied to the new `allEvents` on load. This would require matching events across reloads (by section + date + eventName + startTime, not by ID since IDs are generated fresh).

### 9e. Crew Member Rainbow Tab (user-requested in v3.1 feedback)
> "Using `GUI HTML/index.html` as the example. Add a crew member rainbow tab that is updated for all of the changes made within the interactive scheduler."

**Requirements (from user feedback):**
- Port the rainbow (crew member schedule view) from the Gantt chart (`GUI HTML/index.html`)
- Must reflect ALL interactive scheduler changes in real-time (adds, removes, moves)
- Must show ALL events regardless of event filtering on the interactive scheduler
- Keep the existing rainbow filters (Supv, Flt, Gnd, NAs, Acad, Notes) with default=show all
- Seamless tab navigation between Scheduler View and Rainbow View, preserving data state
- Data must be consistent: rainbow reads from working events (with changes applied), not raw API data

**Suggested approach:**
- Add a tab/toggle in the SchedulerView header to switch between Timeline and Rainbow views
- Rainbow component reads from `workingEvents` (which includes all user modifications)
- Reference `GUI HTML/index.html` for the existing rainbow rendering logic and layout
- One row per person, columns = time blocks, colored by event type/section

---

## 10. File Inventory

| File | Purpose |
|------|---------|
| `interactive-scheduler.html` | The app (v3.2, ~3026 lines) |
| `assumptions.txt` | Design assumptions with user annotations |
| `feedback.txt` | User feedback (v1→v2→v3→v3.1), issues marked with [FIXED in vX.X] |
| `fix-duplicate-merging.md` | Design doc for mergeDuplicateEvents (13 corner cases) |
| `fix-net-changes.md` | Design doc for computeNetChanges (9 scenarios) |
| `color-scheme.png` | Screenshot of source spreadsheet color scheme |
| `real-estate-overfill.png` | Screenshot: short event with too many crew overflows card |
| `top-row-conflict-obscuration.png` | Screenshot: conflict tooltip hidden by sticky header |
| `multi-events-duplicate.png` | Screenshot: duplicate events in scheduler view |
| `multi-event-duplicate-whiteboard-side.png` | Screenshot: source spreadsheet showing duplicated rows |
| `combined-T38-events-error.png` | Screenshot: v3.1 merge incorrectly combined two separate T-38 CF-1 flights |
| `combined-T38-events-error-whiteboard-source.png` | Screenshot: whiteboard source showing the two distinct T-38 CF-1 sorties |
| `archive/` | Previous versions |
| `AGENT-INSTRUCTIONS.md` | This file |

### Related files (parent directory)
| File | Purpose |
|------|---------|
| `GUI HTML/index.html` | Production Gantt chart v5.3 (reference for API/parsing) |
| `Schedule Events/list-v4.0.json` | Available sheets/dates sample |
| `Schedule Events/roster-v4.0.json` | Personnel roster sample |
| `Schedule Events/sheet-return-v4.0.json` | Structured day data sample |

---

## 11. What Made This Project Work

1. **Read the Gantt chart first** — The existing `index.html` contains all the parsing logic, API URLs, and data format knowledge. Start there for any data questions.
2. **Dual-format support** — Always test with both the batch API and the sheet-return JSON. The raw array indices are fragile.
3. **`isValidName()` is critical** — Without it, scheduler notes show up as crew members. Any new parsing code must apply it.
4. **The `initialized` ref pattern** — React state initialization triggers effects; the ref guard prevents phantom changes. Don't remove it.
5. **User expectations on color** — The color scheme MUST match the source spreadsheet. The user is particular about this. See `color-scheme.png`.
6. **Keep it single-file** — The user wants one HTML file they can open locally. No npm, no build step.
7. **Conflict detection is global** — Even readonly events (Supervision, Academics) participate in conflict detection. Don't filter them out.
8. **Test with sample data** — The embedded `SAMPLE_ROSTER` and `SAMPLE_SHEET` data lets the app work offline. Keep it updated.
9. **Tooltip portal pattern** — CSS z-index cannot escape stacking contexts. Use `position:fixed` at app root for tooltips that must appear above sticky headers.
10. **Width-aware layouts** — Card height estimation must account for actual pixel width, not just crew count.
11. **Net-change display** — Keep raw changes for undo, compute net display separately. Users want instruction-like output (MOVE/ADD/REMOVE format).
12. **Opus agents for hard problems** — Complex logic like duplicate merging and net-change computation benefit from dedicated reasoning agents with detailed prompts. The `.md` design docs they produce are valuable for future reference.

---

## 12. Quick Start for Continuing Development

1. Read this file
2. Read `assumptions.txt` (especially user annotations marked with `*` and `+`)
3. Read `feedback.txt` for context on user priorities (check for any new feedback since v3.0)
4. Check for any NEW screenshots in the folder (user provides screenshots with feedback)
5. Read the current `interactive-scheduler.html`
6. Make changes, keeping the single-file pattern
7. Test: open HTML file directly in a browser (works offline with sample data)
8. Update `feedback.txt` with [FIXED] markers for resolved issues
9. Update this file if architecture changes


## 13. Agentic Division of Tasks

1. Assign complex tasks like Fix 8: Event Chooser Organization to a single separate robust thinking agent to reason to a solution.
2. Agentize tasks when necessary. Divide and conquer.