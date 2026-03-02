# Agent Coordination Protocol

> **Read this file at the start of every session.** It defines how agents communicate through shared files.

## Overview

We have 4 agents that work in separate Claude Code sessions and cannot communicate in real-time. All coordination happens through files in `.claude/coordination/`. Every agent reads these files at session start to pick up requests, contracts, and notifications from other agents.

## Coordination Files

| File | Purpose | Who Writes | Who Reads |
|------|---------|------------|-----------|
| `COORDINATION.md` (this file) | Protocol rules — how coordination works | Rarely updated | ALL agents |
| `interface-contracts.md` | Data shapes, API specs, type definitions | **backend-api-architect** owns; others flag mismatches | ALL agents |
| `agent-handoffs.md` | Cross-agent requests & notifications | ANY agent | ALL agents |

## Agents & Their Coordination Roles

| Agent | Color | Coordination Role |
|-------|-------|-------------------|
| **ui-frontend-architect** | Blue | Reads contracts before building components. Posts NEED requests when backend support is required. |
| **backend-api-architect** | Green | **Owns** `interface-contracts.md`. Updates contracts when data shapes change. Checks handoffs for NEED requests from frontend. |
| **test-qa-agent** | Yellow | Reads contracts to verify implementations match specs. Posts COMPLETED entries after verifying work. |
| **project-coordinator** | Purple | Audits handoffs for stale/unresolved items. Ensures contracts stay current with actual code. |

## Handoff Protocol

### Posting a Handoff Entry

When you need something from another agent or want to notify them of completed work, add an entry to `agent-handoffs.md` using this format:

```markdown
### [YYYY-MM-DD] TYPE: Short Description
- **From**: [your-agent-name]
- **To**: [target-agent-name] (or ALL)
- **Status**: OPEN | IN-PROGRESS | RESOLVED
- **Details**: [What you need, what you completed, or what's blocked]
- **Context**: [File paths, function names, line references — enough for the target agent to act]
```

### Handoff Types

| Type | When to Use | Example |
|------|-------------|---------|
| **NEED** | You require work from another agent | "NEED: New endpoint for personnel availability" |
| **COMPLETED** | You finished work another agent depends on | "COMPLETED: doPost endpoint for schedule write-back" |
| **BLOCKED** | You can't proceed without another agent's work | "BLOCKED: Waiting on API response shape definition" |
| **FYI** | Informational — no action required, but others should know | "FYI: Changed event model to include `readonly` flag" |

### Handoff Lifecycle

```
Agent A posts NEED (Status: OPEN)
  → Agent B reads it next session
  → Agent B sets Status: IN-PROGRESS (optional, for long tasks)
  → Agent B completes the work
  → Agent B sets Status: RESOLVED and posts a COMPLETED entry
```

### Rules

1. **Never delete entries** — mark them RESOLVED. The history is valuable.
2. **Always include file paths** — the target agent needs to find the relevant code.
3. **Check handoffs at session start** — filter for your agent name in the "To" field.
4. **Resolve your own NEEDs** — if you figure it out yourself, mark it RESOLVED with a note.
5. **One entry per request** — don't bundle unrelated requests in a single entry.

## Interface Contract Protocol

### When to Update `interface-contracts.md`

The **backend-api-architect** MUST update the contracts file when:
- A new endpoint is added or an existing endpoint's response shape changes
- The event model gains or loses properties
- The roster/personnel structure changes
- The change tracking model is modified
- Any data shape that crosses the backend↔frontend boundary changes

### When to Read `interface-contracts.md`

- **ui-frontend-architect**: Before building any component that consumes API data or renders event/personnel/change data
- **test-qa-agent**: Before verifying that an implementation matches its spec
- **project-coordinator**: During progress audits, to check contracts are current

### Flagging Mismatches

If you notice the code doesn't match a contract:
1. Post a **NEED** handoff to `backend-api-architect` (if the contract is wrong) or `ui-frontend-architect` (if the code is wrong)
2. Include: the contract section name, the expected shape, the actual shape, and the file:line where you found the mismatch

## Naming Conventions

- Agent names in handoffs: `ui-frontend-architect`, `backend-api-architect`, `test-qa-agent`, `project-coordinator`
- Contract section IDs: Use `PascalCase` type names (e.g., `ScheduleEvent`, `BatchResponse`, `NetInstruction`)
- Handoff entry dates: `YYYY-MM-DD` format
- File references: `relative/path/to/file.ext:lineNumber` format

## Session Start Checklist

Every agent should do this at the start of a session:

1. Read `.claude/coordination/COORDINATION.md` (this file) — in case protocols changed
2. Read `.claude/coordination/agent-handoffs.md` — check for entries targeting you
3. Read `.claude/coordination/interface-contracts.md` — if your work touches data shapes
4. Read your agent-specific required files (listed in your agent definition)
5. Proceed with the assigned task
