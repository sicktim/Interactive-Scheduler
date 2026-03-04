# TPS Interactive Scheduler — Version History

---

## v4.2.0 — Bug Fixes, Supervision UX, Select-All Persistence

### Bug Fixes
- **Cancelled events blocking focus picker (T1)** — `focusedAvailability` useMemo now skips cancelled events (`if (ev.cancelled) return`); a CX'd flight no longer marks crew as unavailable in focus mode
- **Notes field "undefined" in change summary (T2a)** — `handleEditSave` now includes `notes: ev.notes` in the `before` snapshot so notes changes display correctly in `NetChangeEntry`
- **Notes diff not shown (T2b)** — `NetChangeEntry` renders `notes → "..."` diff line when `before.notes !== after.notes`
- **Notes undo broken (T2c)** — `handleUndoGroup` replaced `Object.assign(ev, ch.before)` with a key-by-key restore (`Object.keys(ch.before).forEach`) to prevent setting `ev.notes = undefined` on pre-notes-tracking entries
- **Edit selection destroys working changes (T3)** — Removed `clearWorkingCopy()` from `onChangeSelection` in App; `handleContinue` now reloads the existing cache from localStorage and passes it as `cachedWorkingState` so SchedulerView restores prior work instead of reinitializing from raw allEvents
- **FOA/AUTH duplicated as supervision rows (T4)** — `SUPERVISION_ROLE_ORDER` no longer includes 'FOA'/'AUTH'; `dayEvents` useMemo in `WhiteboardView` filters events where `section=Supervision`, `startTime=null`, and `eventName` matches `/^(FOA|AUTH)$/i`

### Enhancements
- **Per-triplet delete button for supervision (T6)** — Each supervision column group (POC/Start/End triplet) now has its own × delete button in a 4th column; applies to both API-sourced and custom events; removes the old row-end delete that only worked on custom events
- **Select-All persisted across refresh (T7)** — `selectAllActive` flag added to `saveState`/`loadState`; when whiteboard refresh occurs with `selectAllActive=true`, newly fetched events are automatically selected; flag threaded through App → EventSelectionScreen → SchedulerView

### New Features / Components
- **UI modal for supervision event creation (T5)** — `window.prompt` replaced with an inline modal in `WhiteboardSupervision`; contains a text input, quick-pick chips for all standard duty names, Cancel and Create buttons; click-outside dismisses; no more browser popup

### Reverted (T8)
- **SegmentedTimeInput reverted** — T8 implemented a two-segment HH/MM input replacing `MilitaryTimeInput` and `PendingTimeInput`, but it caused events to re-sort mid-edit (because `onChange` fired on each valid digit, triggering list re-render and losing the user's scroll position). Reverted to `MilitaryTimeInput` in modals and `PendingTimeInput` in whiteboard pending slots. Time entry UX remains a backlog item.

---

## v4.1.0 — Supervision Enhancements, Whiteboard Conflict Indicators, Day-Scoped Conflicts

### Bug Fixes
- **Supervision column separators** — Fixed CSS selector bug (`.wb-supv-group-start th` → `th.wb-supv-group-start`); added 10px padding-left gap with visible border-left for POC/Notes column groups; dark and light mode both correct
- **FOA/AUTH from API** — Supervision parser now detects footer row (`row[9]==='FOA'`) before empty-duty guard; extracts FOA/AUTH person names, emits as Supervision events; seeds whiteboard duty puck slots on load; null-time guard prevents FOA/AUTH events from rendering as empty timeline EventCards

### New Features
- **Whiteboard conflict indicators** — Conflict `!` badge (amber outline + pulse + icon) now appears on whiteboard crew chips across all 4 tables (Flying, Ground, NA, Supervision); tooltip shows conflicting event details on hover; `onHideTooltip()` called before chip removal to prevent tooltip artifact
- **Day-scoped conflicts in whiteboard view** — When viewing the whiteboard, conflict chips, picker availability, conflict count, and ConflictSummaryModal all scope to the active day only; header button shows `(today)` suffix to indicate scoped count; timeline and rainbow views unchanged
- **FOA/AUTH in timeline date bar** — FOA and AUTH person chips now appear in timeline day column headers alongside the date; colored by roster category; only shown when assigned
- **Dynamic supervision duty rows** — Removed "Other (As Req'd)" from fixed duty list; events with unrecognized duty names create their own rows at the bottom of the supervision table; custom duty rows persist via existing custom event system
- **Lazy supervision event creation** — Empty supervision triplet slots are now editable; entering both start and end times creates a custom supervision event; partial completion (one time only) highlights the empty field with amber border; POC can be pre-assigned via drag and included at event creation

---

## v1.0 — Initial Prototype
- Three-screen flow: Loading → Event Selection → Scheduler View
- Single HTML file with React 18 + Babel + TailwindCSS
- Dark theme, JetBrains Mono font
- Gantt-style timeline with day columns (06:00–18:00)
- Drag-and-drop personnel between events
- Personnel picker panel with category tabs
- Conflict detection across all events (including readonly Supervision/Academics)
- Change summary panel tracking add/remove operations
- API integration with Google Apps Script (roster + batch endpoints)
- Sample data fallback when API unavailable

---

## v2.0 — Usability & Data Quality
- **Dynamic card heights** — `estimateHeight()` based on crew count replaces fixed 52px
- **Name filtering** — `isValidName()` heuristic filters scheduler notes from crew arrays
- **Conflict detail tooltips** — badge hover shows specific conflicting event names/times
- **Picker drag fix** — `effectAllowed: copyMove` + drop handlers on crew areas
- **Init guard** — `initialized` ref with `requestAnimationFrame` prevents phantom changes on load
- **Event selection by date** — grouped by date with Flying/Ground section headers
- **NA by category** — select crew categories (FTC-A, Staff IP, etc.) instead of individual NA events
- **Color scheme** — updated to match source spreadsheet exactly (purple/orange/green/indigo/blue/slate)

---

## v3.0 — Tooltips, Merging & Net Changes
- **Portal tooltip** — `position:fixed` at app root with `z-index:9999`, escapes all stacking contexts
- **Width-aware card sizing** — `min-width:140px` on cards + `estimateHeight()` computes actual chips-per-row from card width
- **Duplicate event merging** — `mergeDuplicateEvents()` groups by (date + eventName + times + lead instructor), combines crew with dedup
- **Net change computation** — `computeNetChanges()` cancels net-zero pairs, detects moves, groups bulk operations into MOVE/ADD/REMOVE instructions
- **Group undo** — `handleUndoGroup(indices)` reverses entire change groups at once
- **Clipboard copy** — human-readable net-change instructions format
- **localStorage persistence** — changes, selections, and NA categories auto-saved

---

## v3.1 — Conflict Visibility, Merge Robustness & Event Organization
- **X-button change tracking** — `setChanges` moved inside `setWorkingEvents` updater for React 18 batching atomicity
- **Conflict visibility** — amber/yellow outline (#fbbf24) with glow replaces red (invisible on orange chips)
- **Duplicate tooltip removed** — native `title` attribute removed from conflict badge and chips; portal tooltip only
- **Event overlap fix** — `visualEnd()` accounts for min-width:140px card expansion in lane assignment; `overflow:hidden` on section-lanes
- **Two-phase duplicate merge** — `mergeDuplicateEvents(events, roster)` groups by base key (no personnel[0]), then sub-groups by distinct staff instructor leads; `isStaff()` roster-aware helper
- **Picker improvements** — "assigned" legend for busy dots; specific conflict event details instead of generic "Has time conflict"
- **NA section standalone** — moved out of dates loop to top of selection screen
- **Event chooser organization** — `classifyEvent()` categorizes events as A-Class/B-Class/Staff/Other; quick-select buttons per category; role-based group headers within date sections

---

## v3.2 — Merge Fix, Classification Fix & Empty Events
### Bug Fixes
- **Empty events displayed** — removed `if (crew.length === 0) return;` guard in flying event parsing; events with model+times+name but no crew now show as empty cards
- **CHASE classification fix** — `STAFF_KEYWORDS` "CHASE" no longer matches student events like "P/S CHASE"; added exclusion for "P/S" prefix patterns
- **Merge logic: personnel[0]-based sub-grouping** — replaced staff-only lead detection with `personnel[0]` comparison; events with different first-listed personnel stay separate; empty-personnel events still attach to existing groups

### Features
- **Crew member rainbow view** — tabbed view showing all events per person; reflects interactive scheduler changes in real-time; Supv/Flt/Gnd/NA/Acad filter toggles

---

## v3.3 — Rainbow Enhancements & Event Focus Mode
### Bug Fixes
- **Rainbow view clipping** — removed conflicting CSS centering transform from `.rb-event-bar`
- **Conflict tooltip deduplication** — `addConflict` helper prevents duplicate entries by eventName+startTime+endTime
- **Picker conflict hover** — threaded `onShowTooltip`/`onHideTooltip` from SchedulerView through PersonnelPicker to PersonnelChip
- **View switch state preservation** — changed from conditional rendering to `display:none` toggling; both Timeline and Rainbow views always mounted

### Rainbow Enhancements
- **Rainbow click popup** — `RainbowModal` component shows event details, personnel list, flight window on bar click
- **Rainbow timeline handles** — click ruler for single marker, drag for range; snaps to 15-min; shows time labels; Escape or button to clear
- **Rainbow sticky headers** — date headers + name column use `position:sticky` for persistent visibility during scroll
- **Rainbow personnel filter** — `RainbowFilterModal` with group toggles, individual checkboxes, search, select/deselect all visible

### New Features
- **Event Focus Mode** — click event card to highlight; dims all other cards; picker greys out unavailable personnel with conflict tooltip on hover; checks ALL events (including readonly); Focus ON/OFF toggle in header (on by default); clear via click outside, Escape, or another event click
- **Picker multi-select** — `activeTabs` Set allows selecting multiple roster categories simultaneously
- **Local cache** — full working state saved to localStorage; survives page refresh; "Refresh from Whiteboard" button clears cache and reloads from API

---

## v3.4 — Timeline Handle Fix, UI Polish & Filter Overhaul
### Bug Fixes
- **Timeline handles reworked** — replaced per-cell overlays with Gantt-style pattern: handle UI (marker tab, range handles) renders only in clicked date header; single grid-level vertical line/range spans full height via absolute positioning; removed 15-min snap; drag-to-resize range handles
- **Rainbow sticky header fix** — CSS variable `--rb-toolbar-h` set dynamically via ResizeObserver; date headers + corner cell use `top: var(--rb-toolbar-h)` to offset below sticky toolbar
- **Picker tooltip viewport fix** — tooltip auto-detects viewport space below (<80px threshold); renders above target when clipped using `translate(-50%, -100%)`
- **Focus mode assigned grey-out** — focused event's own personnel now included in `focusedAvailability` as assigned; tooltip distinguishes "Assigned:" vs "Busy:" prefix

### UI Improvements
- **Scrollbars 2x wider** — width/height increased from 6px to 12px with matching track/thumb styling for both rainbow and timeline views
- **Refresh button clarity** — "Clears local work" subtext added below "Refresh from Whiteboard" button

### Rainbow Enhancements
- **Gantt-style personnel filter** — replaced custom filter button with Gantt pattern: Filter button (opens FilterModal for individual selection) + category dropdown (All Personnel / roster categories / Custom Selection); category auto-switches to "Custom" when FilterModal applies

---

## v3.5 — Timeline Alignment, Handle Polish & Tooltip Fix
### Bug Fixes
- **Rainbow timeline misalignment** — matched corner + date header heights via `--rb-header-h` CSS variable; consistent padding; gap-aware column offset (`161 + dateIndex * (RAINBOW_COL_WIDTH + 1)`); box-shadow on sticky headers for visual separation
- **Rainbow sticky header** — `headerRef` + ResizeObserver for dynamic header height measurement; `--rb-toolbar-h` offsets date headers below toolbar; both CSS variables set on grid element
- **Timeline marker handles match Gantt** — CSS matches Gantt exactly: `.rb-marker-handle` (red tab with `::after` triangle pointer), `.rb-range-handle` (blue draggable handles), `.rb-grid-line`/`.rb-grid-range` (full-height lines starting below header via `top: calc(var(--rb-header-h) + 1px)`); scroll-aware pointer tracking via `.rainbow-area`
- **Tooltip artifact on person delete** — `PersonnelChip` X button now calls `onHideTooltip()` before `onRemove()` to clear tooltip state when chip is destroyed from DOM

### Additional Fixes
- **STC-A/B NAs not shown** — `naCategoriesAvailable` was deriving categories only from people appearing in actual NA events; if no STC-A/B members had NAs that day, those categories wouldn't appear. Changed to roster-based: any roster category with at least one member is always available for NA conflict tracking selection

---

## v3.7.0 — Event Merging Disabled
### Bug Fixes
- **Duplicate event merge disabled** — `mergeDuplicateEvents()` bypassed via early return; function body preserved for potential re-enable. Root cause: events with identical model/times/eventName but different crews (e.g., one with instructor, one empty) were incorrectly merged. Phase 2 treated "1 lead + no-lead events" as `leads.size <= 1`, merging separate scheduling lines. See `archive/Two-t38-events-but-separate.png` for evidence.
