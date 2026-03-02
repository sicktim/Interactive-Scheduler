# Data Extraction Instructions

## Overview

This directory contains structured data extracted from three source documents used by TPS (Test Pilot School) scheduling. Each source captures a different dimension of the curriculum and scheduling pipeline:

| Source | Format | Contains | Output Location |
|--------|--------|----------|-----------------|
| **MCG** (Master Course Guide) | PDF | Full curriculum catalog: 621+ events, prerequisites, applicability, descriptions | `MCG-25B/` |
| **Continuity** | Excel (.xlsx) | Sortie-level scheduling details: crew compositions, aircraft configs, durations | `Continuity/` |
| **Digital Big Board** | Excel (.xlsx) | Student completion tracking: who completed what event and when | `Digital-Big-Board/` |

**Key relationship**: The MCG is the authoritative curriculum source (what events exist and their prerequisites). The Continuity adds operational scheduling detail (how to schedule those events). The Big Board tracks execution (who completed them).

---

## General Principles

### 1. Version Your Outputs

Always version extracted data. When re-extracting or enriching:
- Move the previous version into a `Version-N-<description>/` subfolder
- Create a new `Version-N+1-<description>/` folder for the new output
- Keep a transformation script (`.cjs` or `.py`) at the source level for reproducibility

Example:
```
MCG-25B/
  Version-1-raw-data/        # First extraction: faithful PDF text
  Version-2-expanded-details/ # Second pass: codified prerequisite notes
  transform-v2.cjs           # Script that converts V1 → V2
```

### 2. Preserve Original Data

Never discard information during transformation:
- Keep an `originalNotes` or similar field when parsing free-text into structured fields
- Log any unmatched patterns in a validation report
- Include `sourceRows`, `pageRange`, or `extractedAt` metadata for traceability

### 3. Validate Every Extraction

Every extraction should produce a validation report confirming:
- **Count parity**: same number of events/items in output as in source
- **Field coverage**: no source data dropped or orphaned
- **Pattern coverage**: all text patterns accounted for (especially notes/prerequisites)
- **Spot checks**: manually verify 3-5 complex items against the source document

### 4. Use Consistent JSON Schema

All phase files within a source should use the same schema. Include a `summary` block at the top level with counts and statistics for quick validation.

---

## MCG Extraction

### Source
PDF document (e.g., `MCG 25B.pdf`). New MCG versions are published per class (25A, 25B, 26A, etc.). The MCG will always live as a PDF — this extraction process will repeat for every new class.

### Structure
The MCG is organized as: **Phases > Modules > Events**

9 phases in 25B:
| Phase | Name | Event Count |
|-------|------|-------------|
| AN | Ancillary Training | 24 |
| AS | Astronautical Sciences | 57 |
| CF | Curriculum Fundamentals | 134 |
| FQ | Flying Qualities | 102 |
| PF | Performance | 68 |
| SO | Space Operations | 14 |
| SY | Systems | 89 |
| TF | Test Force | 115 |
| TL | Test Leadership | 18 |

### V1 Schema (Raw Extraction)

Extract each event with these fields — no interpretation, just faithful transcription:

```json
{
  "code": "CF 6691F",
  "eventName": "F-16 Departure Flight",
  "eventType": "F",
  "eventTypeName": "Flight",
  "section": "Flying",
  "applicability": ["FTC"],
  "description": "The objective of this mission is...",
  "prerequisites": [
    {
      "code": "CF 6673F",
      "name": "F-16 CF-4",
      "requiredFor": null,
      "notes": "req'd for P, crew solo"
    }
  ]
}
```

**Event type codes** (from the MCG legend):
| Code | Type |
|------|------|
| A | Academic Lecture |
| C | Control Room |
| E | Exam |
| F | Flight |
| L | Lab |
| M | Mission |
| P | Presentation/Report |
| S | Simulation |
| T | Mission Brief/Study Period |
| W | Working Group |
| X | MIB (Mission Information Brief) |
| Z | Debrief |

Note: `W` and `Z` are not in the MCG's printed legend but appear in practice.

**Prerequisite notes**: In V1, copy the notes field exactly as printed. Common patterns include:
- Position applicability: `"req'd for P"`, `"ABM/CSO/FTE"`, `"req'd for all"`
- Pilot sub-type: `"P, crew solo"`, `"P, non-crew solo"`
- Data groups: `"req'd for T-38 Data Group"`
- Alternative pathways: `"OR TF 6231C"`, `"alternative to CF 6203F"`
- Cross-phase: `"External prerequisite from PF phase"`
- PDF errata: `"Printed as PF 8210F in PDF, should be PF 8211F"`

These notes get codified in V2 (see `transform-v2.cjs` for the complete parsing logic).

### V2 Schema (Expanded Details)

The V2 transformation parses the 46 unique note patterns into structured fields. See the plan file (`.claude/plans/`) or `transform-v2.cjs` for the complete schema documentation. Key additions:
- `applicabilityDetail` on events: `{ positions, courseType, clearance }`
- `scope` on prerequisites: `{ positions, pilotType, crewSoloAircraft, dataGroup, clearance }`
- `alternative`: `{ groupId, altCode, relationship }` for OR-linked prerequisites
- `partialCompletion`, `isExternal`/`externalPhase`, `errata`, `originalNotes`

### MCG Extraction Workflow

#### Step 1: Split by Phase (Use Agents)

The MCG PDF is too large for a single context window. Split the work by phase:

```
For each of the 9 phases:
  → Launch a dedicated agent to extract that phase
  → Agent reads the relevant PDF pages
  → Agent outputs phase-XX.json
```

**Critical**: Some phases (like TF at 115 events) may need to be split further into parts (e.g., `phase-TF-part1.json` + `phase-TF-part2.json`) and merged afterward.

#### Step 2: Merge and Validate

After all phase agents complete:
1. Merge any split phases (e.g., TF parts)
2. Run count validation: total events should match the MCG's course summary table
3. Spot-check 3-5 events per phase against the PDF

#### Step 3: V2 Transformation

Run `transform-v2.cjs` (or create a new version for the new MCG):
```bash
node Data-Extract/MCG-<class>/transform-v2.cjs
```

If the new MCG introduces new note patterns not in the 46 known patterns, the script will log them as unmatched. Update the parser for new patterns before re-running.

---

## Continuity Extraction

### Source
Excel workbook (e.g., `Continuity_25A.xlsx`). The continuity is a scheduling operations document — it only covers **sortie-level events** (flights, sims, labs, control room sessions). It does NOT include academics, exams, MIBs, or written reports.

Eventually the continuity will be replaced by the digital scheduling tool itself, but until then it remains an Excel document that needs periodic extraction.

### Structure
One sheet per phase, with columns:

| Column | Content |
|--------|---------|
| A | Event code |
| B | Mission name (or section header / aircraft variant) |
| C | Crew composition |
| D | Aircraft configuration |
| E | Duration (hours) |
| F | Scheduling notes |
| G | Prerequisites |
| H | LOX (aircraft type for logistics) |
| I | Aircrew qualification requirements |
| J | Required aircraft capability |
| K | Desired aircraft capability |

### Output Schema

```json
{
  "sheet": "CF PHASE",
  "classCode": "25A",
  "extractedAt": "2026-02-19",
  "sections": [
    {
      "name": "T-38",
      "events": [
        {
          "eventCode": "CF 6351FP",
          "missionName": "T-38 CF-1 (PILOT)",
          "section": "T-38",
          "aircraftType": "T-38",
          "aircraftVariant": "T-38C",
          "config": "Clean",
          "duration": 1.5,
          "crew": ["IP/STUD"],
          "notes": ["Brief 1+00 prior"],
          "prerequisites": ["T-38 BOLD FACE"],
          "aircrewQuals": "T-38 IP",
          "aircraftRequiredCape": null,
          "aircraftDesiredCape": null,
          "sourceRows": [15, 16]
        }
      ]
    }
  ],
  "summary": {
    "totalEvents": 42,
    "totalSections": 8,
    "aircraftTypes": ["C-12", "F-16", "Glider", "Learjet", "T-38"]
  }
}
```

### Row Parsing Challenges

The continuity uses **multi-row events** where continuation rows add crew compositions, aircraft variants, or notes below the primary event row. The extraction script must handle:

1. **Section headers**: Text-only in column B, no code in A (e.g., "T-38", "Glider", "F-16")
2. **Event start rows**: Code in column A marks a new event
3. **Continuation rows**: No code in A; may contain:
   - Aircraft variant in B (e.g., "T-38C", "F-16D & UTD")
   - Additional crew in C
   - Additional notes in F
   - Additional prerequisites in G
4. **Empty rows**: Skip
5. **Dual code columns**: The PERFORMANCE sheet has two `#` columns — handle both

See `Continuity/extract_cf_phase.py` for a reference implementation of this parsing pattern.

### Continuity Extraction Workflow

#### Step 1: One Agent Per Sheet

Each phase sheet is independent. Launch one agent per sheet:

```
For each sheet (CF PHASE, FQ, PERFORMANCE, SYSTEMS, TF):
  → Agent reads the sheet with openpyxl
  → Agent handles section headers, event rows, continuation rows
  → Agent outputs continuity-XX.json
```

**Note**: The FQ phase has TWO sheets ("FLYING QUALITIES" and "FQ"). The "FQ" sheet is authoritative for the current class. Extract both if documenting the transition, or just the authoritative sheet.

#### Step 2: Validate

- Compare event counts to manual counts from the spreadsheet
- Verify duration parsing (decimal hours, H+MM format, ASD)
- Check that multi-row events are properly merged

### Known Continuity Issues
- Missing spaces in some event codes (`FQ6751CE` should be `FQ 6751CE`)
- Duplicate codes across phases (different events, same code)
- Orphan code rows without mission data (PERFORMANCE sheet rows 151-188)
- Inconsistent duration formats: `1.5`, `1+05`, `"ASD"`, `null`
- Merged cells creating ambiguous continuation rows

---

## Digital Big Board Extraction

### Source
Excel workbook (e.g., `Digital Big Board_19Feb26.xlsx`). Student-centric completion tracking matrix.

### Structure

The workbook has **36 sheets** spanning classes 19B through 26A. Two formats exist:

#### Old Format (Classes 19B–24B)
Per-phase sheets (e.g., "19B CF", "20A FQ"):
- Columns = students
- Rows = events
- Labels/metadata in columns Z–AC
- Color-coded cells for completion status

#### New Format (Classes 25A+)
Consolidated "Big Board" per class (e.g., "25B BigBoard"):
- **Row 2**: COUNTIF formulas = events in next 5 days per student (workload indicator)
- **Row 3**: Student names
- **Row 4**: Track codes (ABM, CSO, RPA, FTE, Pilot-F, Pilot-M)
- **Row 5**: Primary aircraft assignment
- **Rows 6–275**: Event completion matrix
  - **Columns A–Z**: Student columns
  - **Columns AE–AU**: Right-side metadata (Series, Course#, Event#, Title, applicability, type, aircraft, scheduling window, %Complete)
- **Cell values**: Date strings (completed), empty (pending), `"."` (N/A for track)
- **Cell colors**: Grey fill (`#999999`) = completed, white = scheduled/pending

### Extraction Goals

The Big Board maps to the `student_completion` database table:
- WHO (student name + track) completed WHAT (event code) and WHEN (date in cell)

### Big Board Extraction Workflow

#### Step 1: Determine Format

Check the sheet name pattern:
- `"25B BigBoard"` → new consolidated format
- `"25B CF"` → old per-phase format

#### Step 2: Extract Metadata

For new format sheets:
- Read student names from row 3
- Read track codes from row 4
- Read event metadata from columns AE–AU

#### Step 3: Parse Completion Matrix

For each cell in the student×event grid:
- Date string → completed, record the date
- Empty → pending (not yet completed)
- `"."` → N/A for this student's track
- Check cell fill color as secondary confirmation (grey = completed)

#### Step 4: Output

```json
{
  "class": "25B",
  "format": "consolidated",
  "students": [
    { "name": "Smith, John", "track": "Pilot-F", "aircraft": "F-16" }
  ],
  "completions": [
    { "student": "Smith, John", "eventCode": "CF 6351F", "completedDate": "2026-01-15" }
  ],
  "pendingEvents": [
    { "student": "Smith, John", "eventCode": "PF 6121F" }
  ]
}
```

---

## Agent-Based Workload Splitting

### Why Split Work Across Agents

Data extraction is context-intensive. A single conversation window filling up means:
- Lost context about earlier phases when working on later ones
- Risk of schema drift between early and late extractions
- No ability to re-check earlier work without re-reading source files

**Solution**: Use the Task tool to launch dedicated sub-agents for each independent unit of work. The main conversation stays lean — it coordinates, validates, and merges.

### Strategy: Main Thread as Coordinator

```
Main Thread (coordinator):
  ├── Define the JSON schema (write to a temp file or pass in prompt)
  ├── Launch Agent 1: Extract phase AN (pages 14-15)
  ├── Launch Agent 2: Extract phase CF (pages 18-42)
  ├── Launch Agent 3: Extract phase FQ (pages 43-65)
  ├── ... (up to 9 agents for 9 phases)
  ├── Wait for all agents to complete
  ├── Validate: count events, check schema conformance
  └── Merge or fix any issues
```

### Agent Prompt Template

When launching extraction agents, provide:

1. **The exact JSON schema** they should produce (include an example event)
2. **The source document path** (absolute path on disk)
3. **The page range or sheet name** to focus on
4. **The output file path** where they should write results
5. **Known edge cases** for that specific phase (if any)

Example agent prompt:
```
Extract all events from the CF phase of MCG 25B (pages 18-42).

Source: C:/Users/.../Data-Extract/MCG-25B/MCG 25B.pdf
Output: C:/Users/.../Data-Extract/MCG-25B/Version-1-raw-data/phase-CF.json

Use this JSON schema for each event:
{
  "code": "CF 6351F",
  "eventName": "T-38 CF-1",
  "eventType": "F",
  ...
}

Known issues for CF phase:
- Has the most events (134) — may need to split into parts
- Crew solo prerequisites appear here (F-16, C-12, T-38)
- Section headers: "Flying", "Academics", "Simulation"

Write the complete phase JSON file. Include a summary block with event counts.
```

### Parallel vs Sequential

- **MCG phases**: Fully independent — launch all 9 in parallel
- **Continuity sheets**: Fully independent — launch all 5 in parallel
- **Big Board sheets**: Independent per class — launch in parallel by class
- **V2 transformation**: Sequential — requires ALL V1 files to exist first (cross-phase alternative linking)

### Context Preservation Tips

1. **Start fresh conversations** for each major extraction batch. Don't try to extract MCG + Continuity + Big Board in one session.

2. **Read this file first** in every new session. It provides the schema, workflow, and known issues without consuming the prior conversation's context.

3. **Reference existing outputs** when doing V2+ transformations. The V1 files are your ground truth — read them, don't re-extract from PDF.

4. **Use `.cjs` extension** for Node.js scripts if the project has `"type": "module"` in `package.json`. Otherwise `require()` will fail with an ESM error.

5. **Run validation immediately** after extraction, before moving on. Catching count mismatches early saves re-work.

6. **Log unmatched patterns** rather than silently dropping them. Any unmatched note or unparseable cell should appear in the validation report.

---

## Cross-Source Synchronization

The three sources use **different event codes per class** (e.g., 25A codes differ from 25B codes). Synchronization is by **event name and mission description**, not by code.

See `Continuity/conflict.md` for detailed notes on structural differences between MCG and Continuity data, including:
- What each source captures that the other doesn't
- Prerequisite style differences
- Known data quality issues in each source
- Recommended database approach (separate curriculum per class)

---

## Quick Reference: File Locations

```
Data-Extract/
├── instructions.md                          ← You are here
├── MCG-25B/
│   ├── MCG 25B.pdf                          # Source PDF
│   ├── transform-v2.cjs                     # V1→V2 transformation script
│   ├── Version-1-raw-data/
│   │   └── phase-{AN,AS,CF,FQ,PF,SO,SY,TF,TL}.json
│   └── Version-2-expanded-details/
│       ├── phase-{AN,AS,CF,FQ,PF,SO,SY,TF,TL}.json
│       └── v2-validation-report.json
├── Continuity/
│   ├── Continuity_25A.xlsx                  # Source spreadsheet
│   ├── extract_cf_phase.py                  # Reference extraction script
│   ├── continuity-{CF,FQ,PF,SY,TF}.json    # Extracted phase data
│   └── conflict.md                          # MCG vs Continuity differences
└── Digital-Big-Board/
    └── Digital Big Board_19Feb26.xlsx       # Source spreadsheet
```

---

## Checklist for New Extractions

When a new MCG, Continuity, or Big Board is published:

- [ ] Create a new subfolder under `Data-Extract/` (e.g., `MCG-26A/`)
- [ ] Copy the source document into the subfolder
- [ ] Read this instructions file for schema and workflow guidance
- [ ] Launch parallel agents for each phase/sheet
- [ ] Validate all outputs (counts, schema, spot-checks)
- [ ] Run V2 transformation if applicable (MCG only)
- [ ] Update `conflict.md` if both MCG and Continuity are refreshed
- [ ] Update `MEMORY.md` with new event counts and any schema changes
