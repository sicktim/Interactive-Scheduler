# Compartment Reviewer — Persistent Memory

## Verified Null-Time Patterns (confirmed T2 review, 2026-03-02)

- `evStart(ev)` returns `null` when `ev.startTime` is `null` (via `timeToMinutes` which returns null for falsy input)
- `evEnd(ev)` falls back to `TIMELINE_END` (1080) when both `startTime` and `endTime` are null
- `timePct(null)` computes `NaN` — produces broken inline styles on EventCard (`left: NaN%`, `width: NaN%`)
- `overlap(a, b)` explicitly guards `if (aS == null || bS == null) return false` at line ~2561 — null-time events are SAFE for conflict detection
- `focusedAvailability` useMemo has identical null-guard — also safe
- `estimateHeight(ev)` handles null startTime: `dur = (TIMELINE_END - null) || 60 = 60` fallback — height calculation is safe

## Key Fragile Pattern: null-time events in the timeline

When any event has `startTime: null`, it is safe for conflict detection and height estimation, but
WILL produce `left: NaN%` in EventCard positioning. This is a rendering bug, not a crash.
The event still appears in `buildSupervisionLayout` with a valid `top/height` from the layout,
but the EventCard's own style calculation breaks independently.

## Supervision Layout with null-time events

`buildSupervisionLayout` sorts by `evStart(ev) || 0` — null-time events sort to position 0.
Sub-lane packing uses `s = evStart(ev) || 0` — null events always placed first, open a new lane.
`evMap` gets `{ top: laneTop, height: SUPV_LANE_H }` — valid positioning from layout.
The broken part is `EventCard` computing its own `left/width` from `timePct(sMin)` with null sMin.

## Change tracking with null eventTime

`handleRemove` records `eventTime: ev.startTime`. For null-time events this writes `eventTime: null`.
Display: change summary and clipboard show `(null)` in event descriptor. Not a crash, cosmetically broken.
Safe fix pattern: `ev.startTime || 'All Day'` at the recording site.

## Line Reference Drift Pattern

T2 supervision parser additions (FOA/AUTH footer detection, ~30 new lines in the 2757-2786 range)
shifted all post-parser function references by approximately +30 lines.
`estimateHeight` documented at 3270 is actually at 3303 (drift +33).
`buildSupervisionLayout` documented at 3343 is actually at 3376 (drift +33).
Rule: after parser additions, always spot-check line refs for functions in the 3200-3700 range.

## foaByDate useMemo safety

`/^FOA$/i` and `/^AUTH$/i` anchored patterns — no false positive risk from partial name matches.
Only `section === 'Supervision'` events are scanned, further reducing collision risk.

## Seeding Effect Pattern (Whiteboard)

The T2 seeding effect is non-destructive: guards on `stored.foa.length > 0 || stored.auth.length > 0`.
If user has made any assignment, the seed is skipped. Safe to call on every activeDay/workingEvents change.

## Project-wide: always grep before assuming

Never assume a guard exists or a function is at a documented line — always grep to verify.
Key functions to verify for null safety: `evStart`, `evEnd`, `timePct`, `overlap`, `visualEnd`.
