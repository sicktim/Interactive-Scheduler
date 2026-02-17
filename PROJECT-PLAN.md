# TPS Schedule Project — Master Plan

> **Living document.** Update as decisions are made and phases complete.
> End-state vision lives in `End-State.txt` (also living).

---

## 1. Current State Assessment

### What Exists Today

| Component | Maturity | Lines | Tech | Notes |
|-----------|----------|-------|------|-------|
| **Gantt Chart** (`GUI HTML/index.html`) | v5.3 — Stable | 1,187 | React 18 + Babel + Tailwind (single file) | Production-quality read-only view |
| **Interactive Scheduler** (`Interactive-scheduler/interactive-scheduler.html`) | v3.6 — Active dev | ~3,900 | Same stack as Gantt (single file) | Primary development target; drag-drop, conflict detection, Rainbow view |
| **Class View** (`GUI HTML/class-view.html`) | v5.0 — Secondary | 565 | Same stack | Roster-focused alternate view |
| **Squadron Schedule API** (`Squadron Schedule API/`) | v4.3 — Backend | 1,705 | Google Apps Script | Batch processor with CacheService, main data source |
| **Schedule Events API** (`Schedule Events/`) | v4.3 — Legacy | ~800 | Google Apps Script | Older endpoint, still active, partially redundant |
| **Supporting Docs / Troubleshooting** | — | — | PNG, JSON, MD, TXT | Debug data, screenshots, old formats |

### Architectural Debt

1. **Single-file HTML apps** — Good for zero-build deployment, but the Interactive Scheduler at ~3,900 lines is approaching the limit where a single file becomes hard to maintain, test, and hand off.
2. **Two overlapping GAS APIs** — `Schedule Events/Code.gs` and `Squadron Schedule API/BatchProcessor.gs` share caching logic and serve similar data. Which is canonical?
3. **No version control** — All history lives in VS Code Timeline and `archive/` folders. No branching, no diffs, no rollback safety net.
4. **No test infrastructure** — Changes are validated by manual browser testing. Regressions are caught by the user, not by automated checks.
5. **Shared code via copy-paste** — Both Gantt and Scheduler parse the same API response format independently. Changes to parsing must be duplicated.
6. **OneDrive as deployment** — Files live on OneDrive; no staging/production separation.

### What Works Well

- Comprehensive documentation (AGENT-INSTRUCTIONS.md, feedback.txt, design docs)
- Clear user feedback loop with [FIXED] markers
- Sample data in repo enables offline development
- Single-file pattern means zero-config deployment for end users
- Agent/skill system in Claude Code provides structured AI assistance

---

## 2. End-State Vision (from End-State.txt)

### Near-Term (Current Phase)
> A scheduling tool that displays Whiteboard 2.0 in various forms (timeline, rainbow, listed event-focused) to assist scheduling/deconflicting people and assets.

**Translation:** Stabilize the Interactive Scheduler as a fully functional scheduling assistant that reads from Whiteboard 2.0 (Google Sheets via GAS) and lets schedulers reassign personnel with conflict awareness.

### Long-Term
> A fully deployed web-hosted schedule user interface and backend database to schedule events, people, assets within constraints of crew size, academic prerequisites, crew qualifications. Used to communicate personalized daily/weekly flying schedules. Used simultaneously by schedulers. No connection to Whiteboard 2.0 / Google Sheets / GAS. Infrastructure to enable later optimization algorithms.

**Translation:** Standalone web application with its own database, user auth, real-time collaboration, constraint engine, and eventually algorithmic scheduling. No Google dependency.

---

## 3. Phased Development Roadmap

### Phase 0 — Stabilize & Organize (NOW)
**Goal:** Stop the drift. Get the house in order before building more.

| Task | Detail |
|------|--------|
| **Initialize git** | Create a repo, commit current state as v0.1.0 baseline. This is the single most impactful thing you can do right now. |
| **Reorganize directory** | See Section 4 below |
| **Consolidate GAS backend** | Designate Squadron Schedule API as canonical; archive Schedule Events |
| **Pin Interactive Scheduler v3.6** | Tag the current working version before any more changes |
| **Freeze new features temporarily** | Fix remaining v3.6 bugs only; no new features until Phase 1 structure is in place |

### Phase 1 — Near-Term End State (Weeks)
**Goal:** Fully functional scheduling tool reading from Whiteboard 2.0.

| Task | Detail |
|------|--------|
| **Complete event time editing** | Noted in assumptions.txt #1 as approved but NOT YET IMPLEMENTED |
| **Add save-back-to-sheet capability** | Currently changes are local only (localStorage). Need GAS `doPost()` endpoint to write changes back |
| **Stabilize Rainbow view** | Address any remaining layout/display bugs |
| **Add listed event-focused view** | Third view type mentioned in near-term end state (timeline, rainbow, **listed**) |
| **Unify event parsing** | Extract shared parsing functions (transformBatchData, mergeDuplicateEvents) into a common module both views can reference |
| **Add basic error recovery** | API timeout handling, localStorage corruption recovery, graceful degradation |

### Phase 2 — Bridge Architecture (Months)
**Goal:** Prepare for the long-term stack while keeping the current tool working.

| Task | Detail |
|------|--------|
| **Introduce a build system** | Migrate from single-file to a proper React project (Vite + React recommended) |
| **Extract components** | Break interactive-scheduler.html into proper React component files |
| **Add TypeScript** | Type the data models (Event, Personnel, Roster, Change) — critical for handoff |
| **Set up automated testing** | Vitest for unit tests on parsing/classification/merge logic; Playwright for E2E |
| **Create a REST API spec** | Document the data contract between frontend and backend (OpenAPI/Swagger) |
| **Evaluate backend options** | Choose the long-term backend stack (see Section 6) |
| **Set up CI/CD** | GitHub Actions: lint, test, build, deploy to staging |

### Phase 3 — Long-Term End State (Quarters)
**Goal:** Standalone web application with own database, no Google dependency.

| Task | Detail |
|------|--------|
| **Build the backend** | REST API + database (PostgreSQL recommended) |
| **User authentication** | CAC/SSO integration or username/password with roles (scheduler, student, instructor, admin) |
| **Real-time collaboration** | WebSocket or SSE for multi-scheduler awareness |
| **Constraint engine** | Encode scheduling rules (crew size, prereqs, qualifications) as data, not code |
| **Data migration** | Import historical schedules from Google Sheets into the new database |
| **Optimization algorithm hooks** | API endpoints that an optimization service can call to suggest/auto-assign schedules |
| **Deploy** | Cloud hosting (likely DoD-approved: AWS GovCloud, Azure Gov, or Platform One) |

---

## 4. Recommended Directory Reorganization

### Current (flat, mixed concerns)
```
tps_schedule_gannt/
├── GUI HTML/              ← Frontend (Gantt)
├── Interactive-scheduler/ ← Frontend (Scheduler) + docs + screenshots + archive
├── Schedule Events/       ← Backend (legacy) + sample data
├── Squadron Schedule API/ ← Backend (current)
├── Supporting Docs/       ← Old screenshots, old JSON, old spreadsheets
├── Troubleshooting/       ← Debug data
├── skills/                ← Claude skills
└── [loose files at root]
```

### Proposed (clear separation)
```
tps_schedule_gannt/
│
├── README.md                      ← NEW: Project overview, setup, architecture diagram
├── End-State.txt                  ← Vision (living doc)
├── PROJECT-PLAN.md                ← This file (living doc)
├── CHANGELOG.md                   ← NEW: Consolidated version history across all components
├── .gitignore                     ← NEW: Ignore node_modules, .env, etc.
│
├── frontend/
│   ├── gantt/
│   │   ├── index.html             ← Gantt chart (v5.3, stable)
│   │   ├── class-view.html        ← Class roster view
│   │   └── README.md              ← From current explanation.md + issues.txt
│   │
│   ├── scheduler/
│   │   ├── interactive-scheduler.html  ← Main app (v3.6)
│   │   ├── AGENT-INSTRUCTIONS.md       ← Primary handoff doc
│   │   ├── assumptions.txt             ← Design decisions
│   │   ├── feedback.txt                ← User feedback log
│   │   └── design-docs/
│   │       ├── fix-duplicate-merging.md
│   │       └── fix-net-changes.md
│   │
│   └── shared/                    ← FUTURE: Extracted common parsing/utilities
│       └── (empty until Phase 2)
│
├── backend/
│   ├── gas-api/                   ← Canonical GAS backend (Squadron Schedule API)
│   │   ├── Main.gs
│   │   ├── BatchProcessor.gs
│   │   ├── Config.gs
│   │   ├── SmartSheetFinder.gs
│   │   ├── TriggerSetup.gs
│   │   ├── Utilities.gs
│   │   └── README.md              ← NEW: API docs, endpoints, deployment steps
│   │
│   └── gas-legacy/                ← Archive of Schedule Events (deprecated)
│       ├── Code.gs
│       └── README.md              ← Deprecation notice, points to gas-api/
│
├── data/
│   ├── samples/                   ← JSON test fixtures
│   │   ├── batch-return-v4.2T.json
│   │   ├── list-v4.0.json
│   │   ├── roster-v4.0.json
│   │   └── sheet-return-v4.0.json
│   │
│   └── reference/                 ← Screenshots, color schemes, spreadsheet examples
│       ├── color-scheme.png
│       ├── timeline-bar-display-desired.png
│       └── ...
│
├── archive/                       ← All old versions, old screenshots, old JSON formats
│   ├── scheduler-v3.1/
│   ├── old-json/
│   ├── old-photos/
│   └── old-spreadsheets/
│
├── docs/                          ← Cross-cutting documentation
│   ├── api-endpoints.md           ← From google-apps-script-links.txt
│   ├── architecture.md            ← NEW: System diagram, data flow, tech stack
│   ├── deployment.md              ← NEW: How to deploy GAS + distribute HTML
│   └── devops-context.md          ← From 2026-02-05 devops txt
│
├── .claude/                       ← Claude Code config (unchanged)
│   ├── settings.local.json
│   ├── agents/
│   └── agent-memory/
│
└── skills/                        ← Claude Code skills (unchanged)
```

### Key Principles
- **`frontend/`** — Things users open in a browser
- **`backend/`** — Things that run on a server (GAS today, Node/Python later)
- **`data/`** — Test fixtures and reference material used during development
- **`archive/`** — Anything superseded; kept for history but not active development
- **`docs/`** — Cross-cutting documentation that spans multiple components

---

## 5. Agent Recommendations

You already have `ui-frontend-architect`. Here are recommended additional agents:

### Existing Agents (Keep)

| Agent | Role | Notes |
|-------|------|-------|
| **ui-frontend-architect** | Implement UI features in the single-file React app | Already created. Has context about the scheduler's architecture. |

### Recommended New Agents

#### `backend-api-architect`
**Purpose:** Owns the GAS backend and future REST API design.
**Responsibilities:**
- Modify/extend GAS endpoints (BatchProcessor, Config, caching)
- Design the REST API contract (OpenAPI spec) for Phase 2
- Implement `doPost()` for save-back-to-sheet
- Plan database schema for Phase 3
- Ensure API backward compatibility during migration

**Key instructions to include:**
- Always read `backend/gas-api/README.md` and `docs/api-endpoints.md` first
- Understand caching strategy (CacheService, 30-min TTL)
- Test with sample data in `data/samples/`
- Document all endpoint changes in the API docs

#### `test-qa-agent`
**Purpose:** Write and run tests, catch regressions.
**Responsibilities:**
- Create test cases for classification logic, merge logic, net-change computation
- Validate UI behavior against feedback.txt entries
- Run the profiler-test.html against sample data
- Document test results and coverage

**Key instructions to include:**
- Read `feedback.txt` for known bugs and [FIXED] items — verify fixes hold
- Use sample JSON in `data/samples/` for test inputs
- Focus on the critical functions: `classifyEvent`, `mergeDuplicateEvents`, `computeNetChanges`, `transformBatchData`

#### `project-coordinator`
**Purpose:** Track progress, maintain documentation, prevent scope drift.
**Responsibilities:**
- Update PROJECT-PLAN.md, CHANGELOG.md, End-State.txt
- Review changes against the current phase goals
- Flag scope creep (new features that don't belong in the current phase)
- Maintain the user checklist (Section 8)
- Ensure handoff documentation stays current

**Key instructions to include:**
- Read PROJECT-PLAN.md and End-State.txt at session start
- Cross-reference all work against the current phase
- Update feedback.txt with [FIXED] markers when bugs are resolved
- Maintain version-history.md with each release

#### `data-architect` (Phase 2+)
**Purpose:** Design the database schema and data migration strategy.
**Responsibilities:**
- Model the domain: Events, Personnel, Assets, Constraints, Schedules
- Design the migration path from Google Sheets → database
- Define the constraint engine data structures
- Plan optimization algorithm interfaces

**When to create:** When Phase 2 begins and backend technology is chosen.

---

## 6. Technology Recommendations for Long-Term Stack

### Frontend (Phase 2 Migration)

| Choice | Recommendation | Rationale |
|--------|---------------|-----------|
| **Framework** | React (keep) | Already in use; large ecosystem; developer familiarity |
| **Build tool** | Vite | Fast, modern, zero-config for React + TS |
| **Language** | TypeScript | Type safety critical for handoff to human developer |
| **Styling** | Tailwind CSS (keep) | Already in use; utility-first works well for schedule UIs |
| **State management** | Zustand or React Context | Avoid Redux complexity; Zustand is lightweight and sufficient |
| **Testing** | Vitest (unit) + Playwright (E2E) | Fast, modern, integrates with Vite |

### Backend (Phase 3)

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Node.js + Express/Fastify** | Same language as frontend; fast dev; huge ecosystem | Less structured for complex domains | Good for near-term API |
| **Python + FastAPI** | Excellent for optimization algorithms; clean async; auto-docs | Different language from frontend | Best if optimization is priority |
| **Node.js + NestJS** | Structured, TypeScript-native, good for larger teams | Steeper learning curve | Best for long-term maintainability |

**Recommendation:** Start with **Node.js + Fastify** for Phase 2 (simple REST API replacing GAS). Plan to evaluate **Python + FastAPI** for Phase 3 if the optimization algorithm work is significant — or keep Node and use a Python microservice for optimization only.

### Database

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **PostgreSQL** | Robust, excellent for relational scheduling data, JSON support | Requires hosting | **Recommended** |
| **SQLite** | Zero-config, file-based, good for prototyping | Single-writer, no multi-user | Good for Phase 2 prototyping |
| **Supabase** | PostgreSQL + auth + realtime + hosting | Vendor lock-in, requires internet | Good accelerator if DoD-approved |

### Hosting (Phase 3)

| Option | Notes |
|--------|-------|
| **Platform One / DoD DevSecOps** | If this is for official USAF use |
| **AWS GovCloud** | ITAR/FedRAMP compliant |
| **Azure Government** | DoD IL4/IL5 certified |
| **Self-hosted (base network)** | If internet dependency is unacceptable |

---

## 7. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Single-file becomes unmaintainable** | High — blocks handoff | High (already ~3,900 lines) | Phase 2: migrate to component architecture |
| **No version control** | High — one bad edit loses everything | High | Phase 0: initialize git immediately |
| **OneDrive sync conflicts** | Medium — could corrupt files | Medium | Git + .gitignore solves this |
| **GAS quota limits** | Medium — API goes down under load | Low (caching mitigates) | Phase 2: move to own backend |
| **Bus factor = 1** | High — only one person knows the system | High | Documentation + handoff docs + typed code |
| **Scope creep** | High — features added faster than stabilized | High (per user's own observation) | Phase discipline; project-coordinator agent |
| **No automated tests** | High — regressions caught late | High | Phase 1: at minimum, manual test checklist; Phase 2: automated |

---

## 8. User Checklist

### Phase 0 — Stabilize & Organize (Do Now)

- [ ] **Install git** (if not already installed) — `winget install Git.Git`
- [ ] **Initialize git repo** in `tps_schedule_gannt/` — Claude Code can help with this
- [ ] **Create `.gitignore`** — exclude `node_modules/`, `*.env`, `Troubleshooting/output.json` (large debug files)
- [ ] **Make initial commit** — tag as `v0.1.0` (baseline of everything as-is)
- [ ] **Reorganize directory** per Section 4 — move files, commit as "reorganize project structure"
- [ ] **Designate canonical GAS API** — confirm Squadron Schedule API is the one to keep; add deprecation notice to Schedule Events
- [ ] **Review and update End-State.txt** — refine near-term/long-term descriptions with any new clarity
- [ ] **Create agents** per Section 5 recommendations (backend-api-architect, test-qa-agent, project-coordinator)
- [ ] **Create `README.md`** at project root — brief overview for any future human developer
- [ ] **Mark Interactive Scheduler v3.6 as baseline** — note this in CHANGELOG.md

### Phase 1 — Near-Term Completion

- [ ] **Resolve all v3.6 feedback items** — verify each [FIXED] item still works
- [ ] **Implement event time editing** — assumptions.txt #1 (approved, not implemented)
- [ ] **Implement save-back-to-sheet** — GAS `doPost()` endpoint + UI save button
- [ ] **Design the listed event-focused view** — third view mentioned in near-term end state
- [ ] **Test with real scheduling session** — have a scheduler use it for a real week
- [ ] **Document the complete user workflow** — from opening the page to saving changes
- [ ] **Update End-State.txt** — mark near-term items as complete, refine long-term

### Phase 2 — Bridge Architecture

- [ ] **Choose backend technology** — review Section 6 recommendations
- [ ] **Set up Vite + React + TypeScript project** — migrate from single-file HTML
- [ ] **Extract React components** — one component per file, shared types
- [ ] **Write unit tests** for critical logic (classify, merge, net-changes, transform)
- [ ] **Set up CI/CD** — GitHub Actions or equivalent
- [ ] **Build REST API** — replace GAS endpoints with own backend
- [ ] **Design database schema** — create data-architect agent
- [ ] **Update End-State.txt** — refine Phase 3 scope based on Phase 2 learnings

### Phase 3 — Long-Term End State

- [ ] **Deploy backend + database**
- [ ] **Implement user authentication**
- [ ] **Build real-time collaboration** (multi-scheduler awareness)
- [ ] **Encode scheduling constraints as data**
- [ ] **Migrate historical data from Google Sheets**
- [ ] **Build optimization algorithm hooks**
- [ ] **Decommission GAS endpoints and Google Sheets dependency**
- [ ] **Hand off to sustainment developer** — ensure all documentation is current

---

## 9. Handoff Readiness Checklist (for Human Developer)

When it's time to hand this to a human web developer, they should find:

- [ ] A `README.md` explaining the project, how to run it, and the architecture
- [ ] TypeScript types for all data models
- [ ] Automated test suite with >80% coverage on business logic
- [ ] CI/CD pipeline that runs tests on every push
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Database schema documentation with ER diagram
- [ ] Deployment instructions (step-by-step)
- [ ] Architecture decision records (ADRs) for major choices
- [ ] `CONTRIBUTING.md` with coding standards and PR process

---

## 10. Decision Log

Track major decisions here as they're made.

| Date | Decision | Rationale | Decided By |
|------|----------|-----------|------------|
| 2026-02-13 | Created PROJECT-PLAN.md | Need structure to prevent scope drift | User + Claude |
| 2026-02-13 | Interactive Scheduler v3.6 designated as baseline | All v3.6 feedback items addressed | User + Claude |
| | | | |

---

*Last updated: 2026-02-13*
