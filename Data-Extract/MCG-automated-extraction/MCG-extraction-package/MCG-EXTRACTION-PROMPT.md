# MCG Extraction Prompt

> **Purpose**: Upload a new MCG PDF, run this prompt with Claude Code, and get a standardized V3 JSON dataset.
>
> **Input**: `MCG-<CLASS>/MCG <CLASS>.pdf` (e.g., `MCG-26A/MCG 26A.pdf`)
>
> **Output**: `MCG-<CLASS>/Version-3-course-aware/phase-{XX}.json` + supporting files

---

## Quick Start

```
1. Place the MCG PDF at: MCG-<CLASS>/MCG <CLASS>.pdf
2. Open Claude Code in this directory
3. Paste this entire file as the prompt (or reference it: "Follow @MCG-EXTRACTION-PROMPT.md for MCG <CLASS>")
4. Claude Code will orchestrate the extraction using agents
```

---

## Overview

The MCG (Master Curriculum Guide) is a ~200-page PDF published per TPS class (25A, 25B, 26A, etc.). It defines **every event** in the curriculum: lectures, flights, simulations, labs, exams, and their prerequisites.

**What makes V3 different from V1/V2:**
- **FTC vs STC course assignments** on every event (Flight Test Course vs Space Test Course)
- **Dependency graph** built from text prerequisites across all phases
- **Scheduling metadata** — duration, timing constraints, sequencing hints

**The extraction is broken into 5 stages.** Use Claude Code's Task tool to run stages in parallel where possible. Each stage has validation checks.

---

## Stage 0: Setup

### Create Directory Structure

```
MCG-<CLASS>/
├── MCG <CLASS>.pdf              # Source (already placed by user)
├── Version-1-raw-data/          # Phase JSON files (Stage 1)
├── Version-2-expanded-details/  # Structured prereqs (Stage 2)
├── Version-3-course-aware/      # Full V3 with course assignments (Stage 3)
│   └── viewer/
│       └── index.html           # Interactive viewer
├── dependency-graph.json        # Consolidated dependency graph (Stage 3)
└── extraction-report.json       # Final validation report (Stage 4)
```

Create these directories before launching extraction agents.

---

## Stage 1: Raw Text Extraction (V1)

### Goal
Extract every event from the PDF as faithful JSON — no interpretation, just transcription.

### Strategy: One Agent Per Phase

The MCG is organized into 9 phases. Launch a **dedicated agent** for each phase to stay within context limits. The phases and their typical page ranges are:

| Phase | Name | Typical Size | Course |
|-------|------|-------------|--------|
| AN | Ancillary Training | ~5 pages, ~25-50 events | Shared |
| TL | Test Leadership | ~10 pages, ~20-30 events | Shared |
| CF | Check Flight Training | ~30 pages, ~80-100 events | FTC |
| TF | Test Foundations | ~40 pages, ~100-130 events | Shared |
| PF | Performance | ~20 pages, ~50-70 events | FTC |
| FQ | Flying Qualities | ~25 pages, ~80-100 events | FTC |
| AS | Astronautical Sciences | ~20 pages, ~50-80 events | STC |
| SO | Space System Operations | ~5 pages, ~10-20 events | STC |
| SY | Mission Systems | ~25 pages, ~70-90 events | Shared |

**IMPORTANT**: These are approximate. Always check the MCG's Table of Contents for exact page ranges.

### Agent Prompt Template (V1)

For each phase, launch an agent with the Task tool using this template:

```
You are extracting events from the {PHASE_CODE} ({PHASE_NAME}) phase of {MCG_CLASS}.

SOURCE: {absolute path to PDF}
OUTPUT: {absolute path to Version-1-raw-data/phase-{PHASE_CODE}.json}
PAGES: Read pages {START} through {END} of the PDF

COURSE ASSIGNMENT: This phase is {FTC|STC|Shared} (from course-structure.json)

Extract every event into this JSON schema:

{
  "phase": "{PHASE_CODE}",
  "phaseName": "{PHASE_NAME}",
  "sourceDocument": "MCG {CLASS}",
  "extractedAt": "{today's date}",
  "pageRange": { "start": {START}, "end": {END} },
  "modules": [
    {
      "moduleCode": "XX NNNN",
      "moduleName": "Module Name",
      "parentCourse": "XX NNNN Course Name (or null)",
      "tlos": ["TLO 1. Full text of terminal learning objective..."],
      "events": [
        {
          "code": "XX NNNNL",
          "eventName": "Event Name",
          "eventType": "L",
          "eventTypeName": "Type name from legend",
          "section": "Academics|Flying|Simulation|Ground|Lab|Operations",
          "applicability": [],
          "description": "Full description text from PDF",
          "prerequisites": [
            {
              "code": "YY MMMMK",
              "name": "Prerequisite Event Name",
              "requiredFor": null,
              "notes": "Raw text exactly as printed (e.g., 'req'd for P, crew solo')"
            }
          ]
        }
      ]
    }
  ],
  "summary": {
    "totalModules": N,
    "totalEvents": N,
    "totalPrerequisites": N,
    "eventsByType": { "A": N, "F": N, ... }
  }
}

EXTRACTION RULES:
1. Copy ALL text exactly as printed — do NOT interpret, summarize, or clean up
2. The event type letter is the LAST character of the event code (e.g., CF 5101H → type "H")
3. Applicability: capture exactly what's printed. Common values:
   - Empty [] if no applicability restrictions listed
   - ["FTC"] or ["STC"] if course-specific
   - ["P"] or ["FTE"] if position-specific
   - ["P", "crew solo"] if combined
   - ["US Only"] if clearance-restricted
4. Prerequisites: copy the notes field EXACTLY as printed — V2 transformation will parse it
5. If a module has too many events to fit in context, split into parts:
   Write phase-{PHASE_CODE}-part1.json and phase-{PHASE_CODE}-part2.json
6. Include the summary block with accurate counts
7. Preserve TLOs (Terminal Learning Objectives) at the module level

EVENT TYPE CODES (from MCG legend):
  A = Academic Lecture    F = Flight          S = Simulation
  C = Control Room        L = Lab             T = Mission Brief/Study
  E = Exam                M = Mission         W = Working Group
  P = Presentation/Report R = Report          X = MIB
  H = Ground Training     Z = Debrief

KNOWN EDGE CASES:
- Some events have NO prerequisites (prereqs: [])
- Some events have the same name but different codes (OK — they're different events)
- Prerequisites may reference events in OTHER phases (cross-phase prereqs)
- Some event descriptions span multiple paragraphs — capture all text
- "parentCourse" is the course header that groups modules (e.g., "CF 5000 Common Ground Training")
- If a phase has sub-phases or sub-courses, preserve that hierarchy in the module structure
```

### Large Phase Handling

If a phase has >100 events (typically TF, CF), the agent may need to split work:

```
SPLITTING RULES:
- If you run out of context, write what you have as part1 and note where you stopped
- Split at MODULE boundaries (not mid-module)
- Include a "splitInfo" field: { "part": 1, "totalParts": 2, "lastModuleCompleted": "XX NNNN" }
- The coordinator will merge parts into the final phase file
```

### Post-Extraction Merge

After all agents complete:

1. **Merge split phases**: Combine part1 + part2 into a single phase file
2. **Validate counts**: Compare event counts against the MCG's summary tables
3. **Cross-reference**: Ensure all prerequisite codes reference real events
4. **Spot-check**: Read 3-5 complex events per phase directly from PDF to verify accuracy

---

## Stage 2: Prerequisite Expansion (V2)

### Goal
Parse raw prerequisite notes into structured fields. This is a deterministic transformation.

### How to Run

If reusing the existing transform script (25B patterns still apply):
```bash
node transform-v2.cjs
```

The `transform-v2.cjs` script should be placed in each `MCG-<CLASS>/` directory. It reads from `Version-1-raw-data/` and writes to `Version-2-expanded-details/`.

If the new MCG has new note patterns:
1. Run the script — it will log unmatched patterns
2. Add new parsing rules to `parsePrereqNotes()` for each unmatched pattern
3. Re-run until `unmatchedNotes: 0`

### What V2 Adds
- `applicabilityDetail`: `{ positions, courseType, clearance }`
- `scope`: `{ positions, pilotType, crewSoloAircraft, dataGroup, clearance, timingConstraint }`
- `alternative`: `{ altCode, relationship, groupId }`
- `partialCompletion`, `isExternal`, `externalPhase`, `errata`
- `originalNotes` preserved for auditability

### Validation
- Event count V1 === V2 (no events lost)
- Prerequisite count V1 === V2 (no prereqs lost)
- `unmatchedNotes` array is empty
- Spot-check 5 parsed prereqs against raw notes

---

## Stage 3: Course Assignment & V3 Schema (V3)

### Goal
Add FTC/STC course assignments to every event and produce the final V3 dataset with a dependency graph.

### Course Assignment Cascade

Every event gets a `courseAssignment` field resolved using this priority:

```
1. EXPLICIT: Event's own applicability contains "FTC" or "STC"
   → courseAssignment = that value
   → courseAssignmentSource = "explicit"

2. MODULE: The module's code maps to a course in course-structure.json
   → courseAssignment = module's assignment
   → courseAssignmentSource = "module"

3. PHASE: The phase is course-specific in course-structure.json
   → courseAssignment = phase's assignment
   → courseAssignmentSource = "phase"

4. DEFAULT: Phase is "Shared" and no more specific assignment exists
   → courseAssignment = "Shared"
   → courseAssignmentSource = "phase"
```

### Special Cases

**Shared phases with mixed events** (TF, SY, TL):
- Some events within a Shared phase may be FTC-only or STC-only
- Check the event's `applicabilityDetail.courseType` (from V2 expansion)
- If `courseType` is set, use it; otherwise inherit from module/phase

**Events with both FTC and STC applicability**:
- If an event's applicability contains BOTH "FTC" and "STC", it's "Shared"
- This is different from an event with no applicability tags (which inherits)

**STC students in FTC-specific events**:
- The CF phase is FTC-only, but STC students may attend some ground training events
- Look for "STC" in the event's applicability array — if present, override phase assignment to "Shared"

### V3 Transformation

Run the transform script:

```bash
node scripts/transform-v3.cjs MCG-<CLASS>
```

This reads V2 phase files + `course-structure.json` and produces:
- `MCG-<CLASS>/Version-3-course-aware/phase-*.json` (9 phase files)
- `MCG-<CLASS>/Version-3-course-aware/v3-validation-report.json`
- `MCG-<CLASS>/dependency-graph.json`

The logic:

```
For each V2 phase file:
  1. Load phase data
  2. Load course-structure.json for phase/module mappings
  3. For each module:
     a. Determine module courseAssignment (from course-structure.json)
     b. For each event:
        - Apply cascade: explicit > module > phase
        - Set courseAssignment and courseAssignmentSource
  4. Compute summary with course breakdown stats
  5. Write to Version-3-course-aware/phase-{XX}.json
Build dependency graph from all prerequisite relationships across phases.
```

### V3 Validation
- [ ] Every event has a non-null `courseAssignment` (FTC, STC, or Shared)
- [ ] FTC-only phases (CF, PF, FQ) have 0 events with `courseAssignment: "STC"` (unless explicit override)
- [ ] STC-only phases (SO, AS) have 0 events with `courseAssignment: "FTC"` (unless explicit override)
- [ ] Shared phases have a mix of FTC, STC, and Shared events
- [ ] Event count V2 === V3
- [ ] `courseAssignmentSource` distribution makes sense (most should be "phase" or "module")

### Dependency Graph

The `transform-v3.cjs` script also builds `dependency-graph.json`:

```json
{
  "sourceDocument": "MCG <CLASS>",
  "generatedAt": "<date>",
  "stats": {
    "totalNodes": 621,
    "totalEdges": 1380,
    "edgesBySource": { "text": 1380 },
    "edgesByType": { "prerequisite": 1380 }
  },
  "nodes": [
    {
      "code": "CF 5101H",
      "eventName": "Emergency Parachute Training",
      "phase": "CF",
      "courseAssignment": "FTC",
      "eventType": "H"
    }
  ],
  "edges": [
    {
      "from": "AN 5130A",
      "to": "CF 5101H",
      "type": "prerequisite",
      "scope": { "positions": ["all"], "courseType": null },
      "source": "text",
      "sourceDetail": "phase-CF.json"
    }
  ]
}
```

Validation:
- [ ] All prerequisite codes resolve to real event nodes
- [ ] No circular dependencies (DAG check)
- [ ] Cross-phase edges are valid (referenced phase exists)

---

## Stage 4: Validation & Reporting

### Final Validation Checklist

Run these checks across the entire dataset:

#### Count Integrity
- [ ] Total events matches MCG's published count (from course summary page)
- [ ] V1 events === V2 events === V3 events (no data loss between versions)
- [ ] V1 prereqs === V2 prereqs (text expansion didn't drop any)
- [ ] Every event code is unique within the dataset

#### Course Assignment Coverage
- [ ] 100% of events have `courseAssignment` (no nulls)
- [ ] FTC-only phases: all events are FTC or Shared (no STC unless explicit)
- [ ] STC-only phases: all events are STC or Shared (no FTC unless explicit)
- [ ] Distribution looks reasonable (check against MCG's course summary)

#### Dependency Graph Integrity
- [ ] All prerequisite codes in phase files are valid event codes
- [ ] No orphan prerequisite codes (prereq code doesn't exist in any phase)
- [ ] Dependency graph is a DAG (no cycles)
- [ ] Cross-phase prerequisites are marked with `isExternal: true`

#### Spot Checks (Manual)
- [ ] Read 5 events from PDF and compare to V3 JSON field by field
- [ ] Check 3 complex prerequisites (crew solo, alternatives, cross-phase)

### Extraction Report

Generate `extraction-report.json`:

```json
{
  "sourceDocument": "MCG <CLASS>",
  "extractedAt": "<date>",
  "schemaVersion": 3,
  "phases": {
    "AN": { "events": N, "prereqs": N, "ftc": N, "stc": N, "shared": N },
    ...
  },
  "totals": {
    "events": N,
    "prerequisites": N,
    "dependencyEdges": N,
    "courseBreakdown": { "FTC": N, "STC": N, "Shared": N }
  },
  "validation": {
    "countIntegrity": "PASS|FAIL",
    "courseAssignment": "PASS|FAIL",
    "dependencyGraph": "PASS|FAIL",
    "unmatchedNotes": [],
    "orphanPrereqs": [],
    "cycleDetected": false
  }
}
```

---

## Stage 5: Viewer Generation

### Goal
Produce an interactive HTML viewer for the V3 data.

A template viewer is provided at `scripts/viewer-v3-template.html`. Copy it into the V3 output:

```bash
mkdir -p MCG-<CLASS>/Version-3-course-aware/viewer
cp scripts/viewer-v3-template.html MCG-<CLASS>/Version-3-course-aware/viewer/index.html
```

The viewer is a single HTML file (vanilla JS, no build step). Features:

1. **Phase browser**: Expand/collapse phases > modules > events > prerequisites
2. **FTC/STC filter toggles**: Show only FTC events, only STC, only Shared, or all
3. **Position filters**: Filter by P, FTE, CSO, ABM, RPA
4. **Search**: Full-text search across event codes, names, descriptions
5. **Course assignment badges**: Visual indicator showing FTC (orange), STC (purple), Shared (gray) on every event
6. **Dependency view**: Click an event to see its prerequisites (incoming) and dependents (outgoing)
7. **Statistics dashboard**: Event counts by phase, course, type

### Serving the Viewer

The viewer loads JSON via `fetch()`, so it must be served over HTTP:
```bash
cd MCG-<CLASS>/Version-3-course-aware
npx serve .
# or: python -m http.server 8080
# then open http://localhost:8080/viewer/
```

---

## Agent Orchestration Strategy

### Parallel Execution Map

```
Stage 0 (Setup):
  └── Create directories

Stage 1 (V1 Extraction):
  ├── Agent: phase-AN  ─┐
  ├── Agent: phase-TL  ─┤
  ├── Agent: phase-CF  ─┤  All 9 run in PARALLEL
  ├── Agent: phase-TF  ─┤  (no dependencies between phases)
  ├── Agent: phase-PF  ─┤
  ├── Agent: phase-FQ  ─┤
  ├── Agent: phase-AS  ─┤
  ├── Agent: phase-SO  ─┤
  └── Agent: phase-SY  ─┘
  └── Coordinator: merge splits, validate counts

Stage 2 (V2 Transform):
  └── Sequential: run transform-v2.cjs (needs all V1 files for cross-phase alt groups)

Stage 3 (V3 Course Assignment + Dependency Graph):
  └── run transform-v3.cjs (needs V2 + course-structure.json)

Stage 4 (Validation):
  └── Agent: validate-extraction (needs all outputs)

Stage 5 (Viewer):
  └── Copy viewer template, verify it loads
```

### Context Management Tips

1. **Keep the main thread lean**: The main conversation coordinates. Agents do the heavy reading.
2. **Pass absolute paths**: Agents need exact file locations.
3. **Pass the schema**: Include the V1 schema in each Stage 1 agent prompt. Don't make agents guess the format.
4. **Check agent outputs**: After each agent completes, read a sample of its output to verify.
5. **Split large phases**: TF (100+ events) and CF (80+ events) may need 2 agents each.

### Error Recovery

If an agent produces incorrect output:
1. Read the agent's output to identify the issue
2. Re-launch with a corrected prompt + specific guidance on what went wrong
3. Do NOT try to manually fix agent output in the main thread — context is precious

---

## Reference: File Locations

```
MCG-extraction-package/
├── MCG-EXTRACTION-PROMPT.md          ← This file (the master prompt)
├── course-structure.json             ← Phase/module → FTC/STC/Shared mapping
├── Course-Overview.png               ← Reference image of Figure 3
├── schemas/
│   └── mcg-v3-schema.json            ← V3 JSON schema definition
└── scripts/
    ├── transform-v3.cjs              ← V2→V3 course assignment transform
    └── viewer-v3-template.html       ← V3 interactive viewer template
```

Per-class output structure:
```
MCG-<CLASS>/
├── MCG <CLASS>.pdf                   ← Source PDF (placed by user)
├── transform-v2.cjs                  ← V1→V2 prereq expansion script
├── Version-1-raw-data/
│   └── phase-{AN,AS,CF,FQ,PF,SO,SY,TF,TL}.json
├── Version-2-expanded-details/
│   ├── phase-{AN,AS,CF,FQ,PF,SO,SY,TF,TL}.json
│   └── v2-validation-report.json
├── Version-3-course-aware/
│   ├── phase-{AN,AS,CF,FQ,PF,SO,SY,TF,TL}.json
│   ├── v3-validation-report.json
│   └── viewer/index.html
├── dependency-graph.json
└── extraction-report.json
```

---

## Reference: Known Patterns from 25B

### Prerequisite Note Patterns (46 known)

The `transform-v2.cjs` script handles these patterns. If a new MCG introduces new patterns, they'll appear in the `unmatchedNotes` array of the validation report.

| Pattern | Example | Count in 25B |
|---------|---------|-------------|
| Position list | `"req'd for P, FTE"` | ~200 |
| All positions | `"req'd for all"` | ~100 |
| No notes (inherit) | `null` or `""` | ~125 |
| Crew solo | `"P, crew solo"` | ~45 |
| Data group | `"req'd for T-38 Data Group"` | ~12 |
| Alternative (OR) | `"OR TF 6231C"` | ~8 |
| External | `"External prerequisite from PF phase"` | ~6 |
| Timing constraint | `"+5 days"` | ~3 |
| Partial completion | `"Hour 8"` | ~2 |
| Errata | `"Printed as PF 8210F..."` | ~3 |
| Clearance | `"US Only"` | ~5 |

### Applicability Patterns

| Pattern | Meaning |
|---------|---------|
| `[]` (empty) | All positions, all courses |
| `["FTC"]` | FTC students only |
| `["STC"]` | STC students only |
| `["P"]` | Pilots only |
| `["P", "FTE"]` | Pilots and FTEs |
| `["ABM", "FTE", "STC"]` | ABMs and FTEs in STC |
| `["US Only"]` | US clearance required |
| `["FTC", "P"]` | FTC pilots only |

### Course Structure (from Figure 3: Course Overview)

Use `course-structure.json` as the authoritative FTC/STC mapping. Summary:

| Phase | Course | Rationale |
|-------|--------|-----------|
| AN | Shared | Orientation for all students |
| TL | Shared | Leadership curriculum for both courses |
| CF | **FTC** | Aircraft check flights — FTC only |
| TF | Shared | Core test methodology for both courses |
| PF | **FTC** | Aircraft performance testing |
| FQ | **FTC** | Aircraft handling qualities |
| AS | **STC** | Satellite and space systems |
| SO | **STC** | Space operations |
| SY | Shared | Mission systems for both courses |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-22 | Initial V3 extraction prompt with FTC/STC, dependency graph |
| 1.1 | 2026-02-22 | Removed image extraction / AI figure analysis (excessive API usage) |
