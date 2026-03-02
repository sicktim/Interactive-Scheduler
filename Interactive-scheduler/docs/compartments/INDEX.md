# Compartment Index — TPS Interactive Scheduler

> **Last Updated:** 2026-03-01
> **Source:** `Interactive-scheduler/interactive-scheduler.html` (~8509 lines, v3.8.0+)
> **Branch:** `Whiteboard-addition`

---

## Compartment Inventory

| # | Compartment | File | Scope Summary |
|---|------------|------|---------------|
| 1 | [Data Pipeline](data-pipeline.md) | data-pipeline.md | API fetch, parsers (flying/ground/NA/supv/acad), event normalization, merge logic, sample data |
| 2 | [Event Selection](event-selection.md) | event-selection.md | EventSelectionScreen, classifyEvent, NA categories, quick-select, supervision toggle |
| 3 | [Timeline](timeline.md) | timeline.md | TimelineView, lane layout, estimateHeight, EventCard, DayColumn, section rendering |
| 4 | [Rainbow](rainbow.md) | rainbow.md | RainbowView, grid layout, event bars, timeline handles, filters, sticky headers |
| 5 | [Picker](picker.md) | picker.md | PersonnelPicker, PersonnelChip, BlankPuck, category tabs, focus grey-out |
| 6 | [Whiteboard](whiteboard.md) | whiteboard.md | WhiteboardView, 4 table components, supervision, FOA/AUTH duty pucks, focus/dim |
| 7 | [Change Tracking](change-tracking.md) | change-tracking.md | Changes array, computeNetChanges, undo, clipboard, localStorage persistence |
| 8 | [Conflict Detection](conflict-detection.md) | conflict-detection.md | detectConflicts, overlap, tooltip portal, badge/chip indicators, focusedAvailability |
| 9 | [Drag and Drop](drag-and-drop.md) | drag-and-drop.md | Universal payload format, 5 drag sources, 5 drop targets, MOVE/COPY semantics |
| 10 | [Theme System](theme-system.md) | theme-system.md | Light/dark toggle, .light-mode CSS overrides, accent colors, localStorage theme |

---

## Cross-Dependency Map

This matrix shows which compartments **depend on** (read from / are affected by) which others.

```
                      PRODUCES →
                   DP  ES  TL  RB  PK  WB  CT  CD  DD  TH
CONSUMES ↓        ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
Data Pipeline (DP)  ·
Event Selection(ES) ●   ·
Timeline      (TL)  ●   ●   ·               ●   ●   ●   ●
Rainbow       (RB)  ●   ●       ·            ●   ●       ●
Picker        (PK)  ●               ·            ●   ●   ●
Whiteboard    (WB)  ●   ●               ·   ●   ●   ●   ●
Change Track  (CT)              ●       ●   ●   ·
Conflict Det  (CD)  ●           ●   ●   ●   ●       ·
Drag & Drop   (DD)          ●       ●   ●               ·
Theme System  (TH)          ●   ●   ●   ●                ·

● = depends on (reads from or is affected by changes in)
```

### Reading the Matrix

- **Column** = producer: changes here ripple to all ● rows
- **Row** = consumer: affected by changes in all ● columns

### Highest-Impact Compartments (most dependents)

1. **Data Pipeline** (7 dependents) — changing event shape or parser output affects nearly everything
2. **Conflict Detection** (5 dependents) — tooltip portal, chip outlines, badge used across TL/RB/PK/WB
3. **Drag & Drop** (4 dependents) — payload format shared across TL/PK/WB, DD doc itself
4. **Theme System** (4 dependents) — CSS overrides touch TL/RB/PK/WB
5. **Change Tracking** (3 dependents) — TL/WB/CT all record changes

---

## Change Impact Quick-Reference

When you modify a compartment, check these cross-compartment impacts:

### Data Pipeline changes
- [ ] Event shape change? → Update Timeline, Rainbow, Whiteboard, Picker, Conflict Detection
- [ ] Parser column index change? → Verify sample data still loads (buildSampleEvents)
- [ ] New event field? → Check if Timeline/Rainbow/Whiteboard render it
- [ ] foaAuth extraction change? → Update Whiteboard duty puck seeding

### Event Selection changes
- [ ] classifyEvent logic change? → Verify Timeline section headers, Whiteboard table grouping
- [ ] New STAFF_KEYWORDS entry? → Check P/S exclusion still works
- [ ] Selection state shape change? → Update localStorage helpers, SchedulerView consumer

### Timeline changes
- [ ] EventCard drag handler change? → Update Drag & Drop compartment doc
- [ ] estimateHeight change? → Check min-width:140px still matches visualEnd
- [ ] New CSS class on cards? → Add .light-mode override in Theme System
- [ ] Focus mode change? → Sync with Whiteboard focus behavior

### Rainbow changes
- [ ] Grid column width change? → Update offset formula (161 + dateIndex * 301)
- [ ] Header height change? → Update 44px/45px pairing, marker top offset
- [ ] Filter change? → Verify "All Personnel" and "Custom Selection" paths
- [ ] New bar CSS class? → Add .light-mode override

### Picker changes
- [ ] PersonnelChip change? → Affects BOTH picker AND Timeline event cards (dual-context)
- [ ] BlankPuck payload change? → Update all drop targets (EventCard, WhiteboardCrewGroup)
- [ ] focusedAvailability change? → Only affects picker (computed in SchedulerView)

### Whiteboard changes
- [ ] WhiteboardCrewGroup drop handler? → Sync with Drag & Drop payload format
- [ ] Supervision table structure? → Verify SUPV_DUTY_ORDER, duty puck seeding
- [ ] Focus/dim CSS? → Check specificity against .wb-table tr:hover (needs !important)
- [ ] New wb-* CSS class? → Add .light-mode override in Theme System

### Change Tracking changes
- [ ] Change entry shape? → Update computeNetChanges, handleUndoGroup, ChangeSummary
- [ ] New change type? → Add to EVENT_LEVEL_TYPES if event-level, add undo handler
- [ ] setChanges timing? → Verify React 18 batching (inside setWorkingEvents updater)

### Conflict Detection changes
- [ ] detectConflicts output shape? → Update all consumers (TL badge, PK chips, WB rows, RB bars)
- [ ] Tooltip portal change? → Affects all onShowTooltip/onHideTooltip call sites
- [ ] focusedAvailability change? → Only affects PersonnelPicker

### Drag & Drop changes
- [ ] Payload field added/removed? → Update ALL 5 drag sources and 5 drop targets
- [ ] effectAllowed change? → Verify dropEffect compatibility at every target
- [ ] MOVE semantics change? → Check both Pattern A (EventCard) and Pattern B (Whiteboard)

### Theme System changes
- [ ] New .light-mode rule? → Verify no specificity conflict with dark defaults
- [ ] !important added? → Document reason (likely React inline style override)
- [ ] Accent color change? → Verify contrast on both dark and light backgrounds

---

## How to Use Compartments

### For Bug Investigation
1. Identify which compartment the bug is in
2. Read that compartment's **Bug History** section for similar past issues
3. Check the **Cross-Compartment Dependencies** section for ripple effects
4. Use the **Change Impact Checklist** before committing fixes

### For Feature Implementation
1. Read the relevant compartment doc(s) for current architecture
2. Check the dependency map for affected compartments
3. After implementation, run through each affected compartment's change impact checklist
4. Update the compartment doc with new line references if functions moved

### For Code Review
1. For each changed line range, identify which compartment owns it
2. Cross-reference the dependency map — are dependent compartments also updated?
3. Check the **Known Issues** section — does this change address or worsen any?
