# TPS Schedule Gantt — Project Instructions

> These instructions are automatically loaded into every Claude Code session for this project.

---

## Repository Structure

This is a **dual-repo monorepo** with two main projects:

- **`Interactive-scheduler/`** — Single-file React 18 scheduling app (primary active development)
- **`TPS_Scheduling_Online/`** — Self-contained deployment target (Phase 2+, no Google dependency)
- **`GUI HTML/`** — Production Gantt chart view (stable, reference only)
- **`Schedule Events/`** — JSON sample data
- **`Data-Extract/`** — Curriculum data extraction pipeline

---

## Compartment System (Interactive-Scheduler)

The Interactive Scheduler has **10 documented compartments** in `Interactive-scheduler/docs/compartments/`. Each compartment doc contains exact line references, state connections, bug history, and change impact checklists.

### Compartment Index

| Compartment | File | Scope |
|-------------|------|-------|
| Data Pipeline | `data-pipeline.md` | API, parsers, event normalization, merge logic |
| Event Selection | `event-selection.md` | classifyEvent, NA categories, quick-select |
| Timeline | `timeline.md` | Lane layout, estimateHeight, EventCard |
| Rainbow | `rainbow.md` | Grid layout, handles, filters, sticky headers |
| Picker | `picker.md` | PersonnelChip, BlankPuck, focus grey-out |
| Whiteboard | `whiteboard.md` | 4 tables, supervision, FOA/AUTH, focus/dim |
| Change Tracking | `change-tracking.md` | Net changes, undo, clipboard |
| Conflict Detection | `conflict-detection.md` | Overlap algo, tooltip portal, badges |
| Drag & Drop | `drag-and-drop.md` | Payload format, 5 sources, 5 targets |
| Theme System | `theme-system.md` | Light/dark CSS overrides |

**Full dependency matrix and quick-reference checklists**: `Interactive-scheduler/docs/compartments/INDEX.md`

### Compartment-Aware Workflow

When modifying `Interactive-scheduler/interactive-scheduler.html`:

1. **Before coding**: Identify which compartment(s) the change touches by checking line ranges in the relevant compartment doc(s).
2. **During coding**: Follow the compartment's documented patterns and conventions.
3. **After coding (high-risk check)**: If the change touches **3 or more compartments**, or modifies any of these fragile areas, spawn the `compartment-reviewer` agent:
   - Data Pipeline event shape (affects 7 downstream compartments)
   - Drag & Drop payload format (shared across 4 surfaces)
   - Conflict Detection output shape (consumed by 5 compartments)
   - CSS specificity in whiteboard hover/focus (known fragile — `!important` chain)
   - `estimateHeight` / `visualEnd` / `min-width:140px` trio (must stay in sync)
   - `PersonnelChip` (dual-context: used in both picker AND event cards)

4. **Low-risk changes** (single compartment, no fragile areas): Just verify against that compartment's Change Impact Checklist — no agent spawn needed.

### When NOT to spawn compartment-reviewer

- Simple CSS color or spacing tweaks within one compartment
- Adding content to an existing component without changing its interface
- Documentation-only changes
- Changes outside `interactive-scheduler.html`

---

## Key Project Files (Interactive-Scheduler)

Always read before working on the Interactive Scheduler:

1. `Interactive-scheduler/AGENT-INSTRUCTIONS.md` — Primary handoff document
2. `Interactive-scheduler/feedback.txt` — User feedback with `[FIXED]` markers
3. `Interactive-scheduler/assumptions.txt` — User-reviewed design decisions
4. `Interactive-scheduler/version-history.md` — Changelog with categorized entries

After implementing changes:

1. Update `feedback.txt` with `[FIXED in vX.X]` status next to resolved items
2. Update `version-history.md` with a categorized entry
3. Update the affected compartment doc(s) if line numbers shifted significantly or to update concepts as the applications changes. `Interactive-scheduler/docs/compartments/`
4. Update the HTML file's version comment on line 1

---

## Code Conventions

- **Single-file pattern**: All React components, CSS, and logic in one HTML file
- **No build step**: React 18 UMD + Babel standalone + TailwindCSS CDN
- **Dark theme default**: `.light-mode` class on `<body>` for light theme (~497 lines of additive overrides)
- **JetBrains Mono** font throughout
- **`!important`** is used selectively — always for: React inline style overrides in light mode, whiteboard status hover rules (specificity battle with `.wb-table tr:hover td`)
- **`initialized` ref guard**: Prevents phantom changes during React state initialization
- **`display:none` view toggling**: Timeline and Rainbow are always mounted, toggled via display — preserves scroll position and state

---

## Task Management Strategy

Always break feedback into a logically ordered task list and assign agents to address tasks. Preserve context without reducing capability of the LLM. If higher order thinking is warranted, employ the `task-planner` agent for advanced reasoning (utilizes Opus model).

---
## Task Management Strategy

Always break feedback into a logically ordered task list and assign agents to address tasks. Preserve context without reducing capability of the LLM. If higher order thinking is warranted, employ the `task-planner` agent for advanced reasoning (utilizes Opus model).

---
## Agent Coordination

| Agent | When to Use |
|-------|------------|
| `task-planner` | Decomposing ambiguous/multi-faceted work into ordered task lists (Opus model) |
| `ui-frontend-architect` | Implementing new UI features or components |
| `compartment-reviewer` | After high-risk changes (3+ compartments or fragile areas) |
| `test-qa-agent` | Verifying fixes against feedback.txt and known corner cases |
| `project-coordinator` | Updating docs, tracking progress, checking scope |
