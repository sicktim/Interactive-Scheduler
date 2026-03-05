# Task Planner Memory

## Key Architectural Patterns

### Change Tracking (handleEditSave)
- `handleEditSave` at ~line 8096 records `event-edit` with `before: { eventName, model, startTime, endTime }` only
- **Notes field is NOT included in the `before` snapshot** -- this is the root cause of bug #1 in v4.1.0 feedback
- The `updates` object IS the `after` field, so if `updates = { notes: 'new value' }`, the diff renderer in `NetChangeEntry` tries to compare `before.eventName` vs `after.eventName` (where `after.eventName` is undefined) resulting in the "undefined" display

### Event Selection / Working State Lifecycle
- `onChangeSelection` at line 9044 calls `clearWorkingCopy()` then navigates to selection screen
- This destroys the user's working changes -- root cause of bug #2 in v4.1.0 feedback
- Fix must preserve `workingEvents` when returning to selection screen

### FOA/AUTH Dual Display Pattern
- FOA/AUTH events are emitted from the supervision parser with `startTime: null`
- `eventsByDate` already filters them from timeline (null startTime guard at line 8226)
- BUT `dayEvents` in WhiteboardView has no such guard -- they flow into the Supervision table
- `SUPERVISION_ROLE_ORDER` includes 'FOA' and 'AUTH' so they get their own rows in the whiteboard
- User wants them ONLY in the date/title bar pills, not as supervision table rows

### Cancelled Events in Conflict Detection
- `detectConflicts` already skips cancelled events at line 2971 (`if (ev.cancelled) return`)
- BUT `focusedAvailability` memo (line 7728-7757) does NOT check `ev.cancelled`
- This is the root cause of bug #6 -- cancelled events still block focus-mode availability

## Compartment Dependency Quick Ref
- Data Pipeline: 7 dependents (highest impact)
- Conflict Detection: 5 dependents
- Change Tracking: consumed by Timeline, Whiteboard
- Whiteboard Supervision: consumes Data Pipeline events directly

## Session Notes
- Time input UX (item #7) is an XL task spanning all time inputs app-wide
- The "select all" persistence for refresh (item #5) requires storing an `isSelectAll` flag in localStorage
