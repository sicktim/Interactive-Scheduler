# UI Frontend Architect -- Agent Memory

## Project Architecture
- Vite + React 18 + TypeScript SPA, migrated from monolithic HTML
- Path alias: `@/*` maps to `src/*`
- Dark/light theme via CSS custom properties in `src/styles/theme.css`
- All colors must use CSS variables -- zero hardcoded hex/rgba in component CSS

## Key File Locations
- **Hooks**: `src/hooks/` -- useSchedulerState, useConflicts, useFocusMode, useKeyboardShortcut, usePersistence
- **Types**: `src/types/` -- events, changes, conflicts, personnel, ui, api
- **Utils**: `src/utils/` -- persistence, conflicts, changes, layout, transform, display, time, classification
- **Theme**: `src/styles/theme.css` -- all CSS custom properties, dark (:root) + light ([data-theme="light"])
- **SchedulerView**: `src/components/scheduler/SchedulerView/SchedulerView.tsx` -- main workspace, uses all 5 hooks

## Critical Patterns
- **initialized ref guard**: In useSchedulerState -- prevents phantom changes during React 18 batched init
- **Display:none view toggling**: Timeline + Rainbow always mounted, toggled with display:none
- **Tooltip portal**: position:fixed at app root, z-index:9999, threaded through DayColumn > EventCard > PersonnelChip
- **Conflict detection runs on ALL events**: Including readonly (Supervision/Academics)

## CSS Variable Naming Conventions
- `--bg-*` for backgrounds, `--text-*` for text colors, `--border-*` for borders
- `--accent-blue-*` for the primary blue accent family
- `--color-success/danger/warning/move-*` for semantic status colors
- `--rb-*` for rainbow-specific variables
- `--flight-bar-*` for flying event bar visuals
- `--conflict-*` for conflict badge/animation/tooltip

## Hook Contracts
- `useSchedulerState` returns: workingEvents, changes, initialized ref, addPersonToEvent, removePersonFromEvent, undoChange, clearAllChanges
- `useConflicts(allEvents)` returns: ConflictMap (via useMemo)
- `useFocusMode({workingEvents, viewMode, focusEnabled})` returns: focusedEventId, setFocusedEvent, availabilityMap
- `useKeyboardShortcut(key, callback)` -- void, effect-only
- `usePersistence({...options})` returns: savedShow, loadFromStorage, clearStorage

## Single-File HTML App Key Patterns (interactive-scheduler.html)
- File is ~5440 lines as of v3.10.0 -- ALWAYS grep for current line positions before editing
- `setChanges` inside `setWorkingEvents` updater: valid pattern used in this codebase (React 18 batches)
- Event-level change types: 'event-cancel', 'event-edit', 'event-delete' -- skip in netMap forEach in computeNetChanges
- Action menu z-index: backdrop=200, menu=201, tooltip=202 (conflict tooltip portal is z-index:~150)
- EventCard click: isFocused+onEventAction -> show action menu; else -> onFocusEvent(event.id) (NOT toggle null)
- Note: previously un-focusing was `onFocusEvent(isFocused ? null : event.id)` -- v3.9.0 changes this to only focus (click backdrop to unfocus)
- handleDeleteConfirmed: depends on `confirmDelete` state via closure, include in useCallback deps array

## Section Layout Pattern (v3.11.0)
- Three specialized layout functions: buildSupervisionLayout (role bands, purple), buildFlyingLayout (model bands, green), buildGroundLayout (name bands, amber)
- All follow identical return shape: `{ evMap: {[id]:{top,height}}, total, <bandArray> }`
- DayColumn sectionData useMemo picks layout fn by `sec` name; NA uses generic buildLayout
- Band separators are absolutely-positioned ghost divs rendered BEFORE hour-lines in section-lanes
- LABEL_H=12 offset at top of every band -- events start at cum+LABEL_H, not cum; band height grows by LABEL_H
- Flying band shape: `{ model, top, height, flightH }` -- flightH < height signals sim sub-tier exists (render dashed divider)
- Ground band shape: `{ name, top, height, isSingleton }` -- isSingleton skips label, uses lighter border
- Supervision band shape: `{ role, top, height }` -- label rendered at top:1 (not vertically centred)
- Ground/Flying use estimateHeight() per sub-lane for dynamic card heights (not fixed FLYING_LANE_H/GROUND_LANE_H)
- SIM pairing: walk backwards through events[] from sim index to find nearest preceding non-sim (index order, not startTime match)
- CSS: `.event-card-ground .event-name-text, .event-card-na .event-name-text` use white-space:normal + word-break:break-word
- Constants FLYING_MODEL_ORDER and SIM_CR_MODELS defined just after SUPERVISION_ROLE_ORDER (~line 1707)
- Layout fns defined after buildLayout generic fn (~line 2440 buildSupervisionLayout, ~2507 buildFlyingLayout, ~2627 buildGroundLayout)
- Band separator render blocks in DayColumn section loop (~line 3454 supvRoleBands, ~3475 flyingModelBands, ~3501 groundNameBands)
