# TPS Schedule Gantt — File Classification Audit Memory

## Skills Folder Classification
**Date: 2026-02-27**

- Location: `skills/`
- Classification: **Shared Tooling / Development Infrastructure**
- Confidence: **HIGH**
- Reason: Contains three Claude Code skill definitions that serve all projects in the monorepo:
  1. `gas-developer/` — Specializes in Google Apps Script (.gs) development. Used for Squadron-Schedule-API work.
  2. `html-coder/` — Specializes in HTML/CSS/vanilla JS frontend development. Used for GUI HTML and Interactive-Scheduler projects.
  3. `project-overlord/` — Project management and architectural decision skill. Meta-skill that orchestrates across all projects.

- **Conclusion:** NOT project-specific. This is shared developer infrastructure/tooling. Should remain in root or in a dedicated `.claude/` subdirectory (where it already resides).

## Key Patterns to Remember
- `.skill` files + corresponding `SKILL.md` are Claude Code skill definitions (development infrastructure)
- These do NOT belong to Data-Extract, GUI HTML, Interactive-Scheduler, Squadron-Schedule-API, or TPS_Scheduling_Online
- They are meta-tooling that helps developers work across the monorepo
