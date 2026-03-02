# Test-QA-Agent Persistent Memory

## Whiteboard v4.0.0 Verification (2026-02-28)

**Status**: COMPLETE — 16-point QA pass on Whiteboard feature
- All core functionality verified via static code analysis
- 3 minor issues identified (1 MEDIUM pre-merge fix)
- NO regressions detected
- APPROVED FOR MERGE (pending Issue #2 fix)

**Key Finding**: NA deletion missing confirmation modal (Issue #2) — 5-minute fix before merge

**Test Artifacts**:
- Full report: `Interactive-scheduler/whiteboard-v4.0-qa-report.md` (37KB, 600+ lines)
- Verification evidence: `whiteboard-v4.0-verification.md` in this directory
- All 16 test scenarios traced through actual code with line numbers

---

## Project Testing Patterns

### Critical Functions Always Tested
1. **classifyEvent()** — P/S exclusion, Staff keywords, A/B roster logic (need to find current position each time)
2. **mergeDuplicateEvents()** — Currently DISABLED (v3.7); preserved for future re-enable
3. **computeNetChanges()** — Display-only; raw changes array preserved
4. **transformBatchData()** — API response to internal format
5. **isValidName()** — Filters notes from crew (>25 chars, >4 words, FALSE/TRUE)
6. **handleStatusChange()** — Mutual exclusivity: setting one status forces others false
7. **handleAdd()** / **handleRemove()** — Change tracking with React 18 batching
8. **clearWorkingCopy()** — Must clear BOTH working storage AND highlights storage

### Edge Cases Encountered

**Empty Crew Arrays**: Valid since v3.2 — must display, never skip
**Names that are Notes**: isValidName() filters >25 chars, >4 words, literal FALSE/TRUE
**Effective/PartiallyEffective Flags**: Parsed from API (string 'TRUE' or boolean), stored as boolean
**Readonly Events**: Supervision/Academics cannot be edited; still affect conflict detection
**Light Mode CSS**: ~400 lines of `.light-mode` overrides; always verify both themes visually

### Regression Risk Zones
1. State management — Whiteboard adds new view, must not interfere with timeline/rainbow
2. Change tracking — New change types ('event-status', 'event-edit', etc.) must have undo branches
3. localStorage persistence — Highlights key must be cleared with working copy
4. Custom events — Created in whiteboard must survive refresh

---

## File Structure Notes

**Key Test Locations** (always verify with grep):
- `interactive-scheduler.html` is THE source (4500+ lines, single file)
- Component order: LoadingScreen → EventSelectionScreen → SchedulerView
- Within SchedulerView: state setup, handlers, then render logic
- Whiteboard components defined before main SchedulerView (lines ~5162-5831)

**Storage Keys** (must clear atomically):
- `tps-scheduler-state` — changes + selections
- `tps-scheduler-working` — full working copy
- `tps-scheduler-theme` — light/dark preference
- `tps-scheduler-custom-events` — user-created events
- `tps-scheduler-highlights` — whiteboard cell highlights (v4.0+)

---

## Contract Verification Checklist

Before testing ANY feature, verify against `interface-contracts.md` (§ references):
- ✓ ScheduleEvent model (§1) — all fields present, correct types
- ✓ Roster & colors (§2) — CATEGORY_COLORS correct for all 8 categories
- ✓ Change model (§3) — includes type, person, date, event metadata
- ✓ NetInstructions (§4) — grouping logic for moves/adds/removes
- ✓ Batch API response (§5) — row format, sections, field indices
- ✓ Event classification (§6) — P/S exclusion, staff keywords, A/B counting
- ✓ Merge logic (§7) — disabled but body preserved; was: base key then personnel[0] sub-grouping
- ✓ Persistence (§8) — all storage keys, Set serialization
- ✓ Color scheme (§9) — 8 categories with bg/text colors

---

## Testing Methodology

1. **Locate function** — grep for function name
2. **Read function** — Read tool with line ranges
3. **Trace data** — Follow sample input through logic
4. **Check branches** — Ensure all if/else paths covered
5. **Verify contracts** — Compare actual behavior to interface-contracts.md
6. **Check callers** — grep for function name; ensure assumptions in calling code valid
7. **Test undo** — If change tracked, verify handleUndoGroup has branch for that type
8. **Light mode** — Search for `.light-mode .component` overrides
9. **Edge cases** — Empty arrays, nulls, readonly, long strings, duplicates

---

## Common Bugs to Watch For

1. **Uninitialized ref guard missing** — `if (!initialized.current) return;` must guard change tracking
2. **Forgot to deepcopy personnel array** — `personnel: [...ev.personnel]` required
3. **Highlight persistence lost** — clearWorkingCopy() must remove highlights key
4. **Readonly not checked** — event.readonly guard missing from edit/delete handlers
5. **Undo missing change type branch** — New change types must have case in handleUndoGroup
6. **Mutation of original array** — always map/filter, never push directly to original

---

## Next Session

When starting new QA work:
1. Read this MEMORY.md first (already loaded in system prompt)
2. Check `Interactive-scheduler/feedback.txt` for [FIXED] items to verify
3. Read `.claude/coordination/COORDINATION.md` (protocol)
4. Read `.claude/coordination/agent-handoffs.md` (check for requests)
5. Read `.claude/coordination/interface-contracts.md` (current specs)
6. Use grep to find current code positions (line numbers shift with edits)
7. Create git branch: `test/<feature-name>`
8. Commit test reports with: `git commit -m "test: verify [FEATURE] from feedback.txt vX.X.X"`

---

**Last Updated**: 2026-02-28 (Whiteboard v4.0.0 QA complete)
**Sessions**: 1 (this session)
