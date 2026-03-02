# MCG Data Extractor Agent

## Purpose
Extract structured event data from the USAF Test Pilot School Master Curriculum Guide (MCG) PDF and convert it into SQL seed data for the TPS Interactive Scheduler database.

## Source Document
- **File:** `Data-Extract/MCG 25B.pdf` (329 pages, Class 25B)
- **Tool:** Use `pdftotext -f <start> -l <end> -layout "<path>" -` via Bash to extract text from page ranges

## MCG Structure Overview

### Phases (in document order)
| Phase | Prefix | Description | Approx PDF Pages |
|-------|--------|-------------|-----------------|
| Ancillary Training | AN | Intro events, misc training | 14-15 |
| Check Flight | CF | Aircraft checkout, ground/flight training | 15-34 |
| Space Operations | SO | GROOT satellite operations | 35-38 |
| Astronautical Sciences | AS | Satellite systems, astrodynamics | 39-58 |
| Performance (Flight Sciences) | PF | Aerodynamics, energy, perf testing | 59-77 |
| Flying Qualities | FQ | Stability, structures, handling qualities | 78-103 |
| Mission Systems | SY | Sensors, EW, weapons, autonomy, cyber | 104-128 |
| Test Foundations | TF | Planning, executing, reporting test | 129-158 |
| Test Leadership | TL | Leadership, management, capstone | 159-167 |

**Note:** Pages 168+ are lesson plans / appendices — NOT curriculum events. Stop extraction at page 167.

### Event Naming Convention (Table 1, pg 11)
```
[PHASE PREFIX] [Course#][Module#][Block##][EventType]
```
- **Phase prefixes:** AN, CF, SO, AS, PF, FQ, SY, TF, TL
- **Event type suffix letter:**
  - A = Academic Lecture
  - B = Asynchronous Content
  - C = Control Room
  - E = Exam/Assessment
  - F = Flight
  - G = Ground School
  - H = Ground Training
  - I = Ground Test
  - L = Lab
  - M = MIB (Mission Information Brief)
  - O = Space Operation
  - R = Written Report
  - S = Simulator
  - Y = Oral Report/Presentation

### Event Entry Format (typical)
```
PF 8302F C-12 Autopilot Flight Control System Flight (CSO/RPA)
    Description paragraph explaining the event purpose and what students learn...

Prerequisites:
    PF 6121F T-38 Low L/D Flight [req'd for PF 8302F]
    PF 7111C F-16/T-38 Tower Flyby Tower (ABM/CSO/FTE/RPA)
    PF 8232F Data Group Level Accel/Turn Perf Data Flights 3
    TF 6251F C-12 Intermediate Airborne Test Conduct (FTC) [req'd for PF 8302F]
```

### Applicability Tags (in parentheses)
Students are divided into tracks. Events may apply to all or specific subsets:
- **P** = Pilot (manned aircraft)
- **ABM** = Air Battle Manager
- **CSO** = Combat Systems Officer
- **FTE** = Flight Test Engineer
- **RPA** = Remotely Piloted Aircraft pilot
- **STC** = Space Test Concentration (all STC students)
- **FTC** = Flight Test Concentration (all FTC students)
- If no parenthetical, event applies to all students

### Terminal Learning Objectives (TLOs)
Each module (e.g., PF 8300) has a set of TLOs. Individual events within the module inherit these TLOs. Extract TLOs at the module level.

### Prerequisite Notation
- `[req'd for XX XXXXZ]` = specifically required for the named event
- Events listed without `[req'd for ...]` are general prerequisites for the block
- Some prerequisites are conditional on data group or track assignment

## Output Format

### Per-phase JSON output file
For each phase, produce a JSON file at `Data-Extract/phase-{PREFIX}.json`:

```json
{
  "phase": "PF",
  "phaseName": "Flight Sciences: Performance",
  "sourceDocument": "MCG 25B",
  "extractedAt": "2026-02-18",
  "modules": [
    {
      "moduleCode": "PF 8300",
      "moduleName": "Performance Testing",
      "tlos": [
        "TLO 1. The student will understand how to measure aircraft maneuverability...",
        "TLO 2. The student will demonstrate appropriate abilities..."
      ],
      "events": [
        {
          "code": "PF 8302F",
          "eventName": "C-12 Autopilot Flight Control System Flight (CSO/RPA)",
          "eventType": "F",
          "eventTypeName": "Flight",
          "section": "Flying",
          "applicability": ["CSO", "RPA"],
          "description": "Introduction to flying the C-12 as a simulated remotely piloted aircraft...",
          "prerequisites": [
            {
              "code": "PF 6121F",
              "name": "T-38 Low L/D Flight",
              "requiredFor": "PF 8302F",
              "notes": null
            },
            {
              "code": "PF 7111C",
              "name": "F-16/T-38 Tower Flyby Tower (ABM/CSO/FTE/RPA)",
              "requiredFor": null,
              "notes": null
            }
          ]
        }
      ]
    }
  ]
}
```

### Event type to section mapping
| Event Type Letter | Section |
|-------------------|---------|
| F | Flying |
| S | Flying (Simulator counts as flying for scheduling) |
| A, B | Academics |
| G, H, L | Ground |
| M | Ground |
| C | Ground |
| E | Ground |
| I | Ground |
| R, Y | Ground |
| O | Flying (Space Operations) |

## Extraction Procedure

For each phase:

1. **Extract text** from the relevant PDF page range using pdftotext
2. **Parse module headers** — look for lines matching `XX ####` pattern followed by module name
3. **Parse TLOs** — lines starting with "TLO #." under "Terminal Learning Objectives:"
4. **Parse event entries** — lines matching the pattern `XX ####[A-Z] EventName`
5. **Parse applicability** — extract parenthetical track tags like `(CSO/RPA/FTE)`
6. **Parse description** — text between event header and "Prerequisites:" or next event
7. **Parse prerequisites** — lines under "Prerequisites:" matching `XX ####[A-Z] Name [req'd for ...]`
8. **Handle multi-event headers** — some entries list MIB + Flight together (e.g., `PF 8301M` and `PF 8302F` sharing one description)
9. **Handle numbered event ranges** — entries like `PF 8230-2F Data Group Level Accel/Turn Perf Data Flights 1-3` mean 3 flights

## Database Schema Alignment

The extracted data maps to these tables:
- `curriculum_version` — one row for "MCG 25B", course_type per phase
- `event_template` — one row per event code
  - `event_name` = event code (e.g., "PF 8302F")
  - `section_id` = mapped from event type letter
  - `description` = event description text
  - `notes` = applicability tags, TLO references
  - `sort_order` = sequence within phase
  - `is_required` = TRUE unless explicitly optional
- `event_prerequisite` — one row per prerequisite link
  - `notes` = the `[req'd for ...]` annotation if present

## Quality Checks
After extraction, verify:
- [ ] All event codes follow the naming convention (2-letter prefix + space + 4 digits + 1 letter)
- [ ] All prerequisite references point to events that exist in the extracted data
- [ ] No duplicate event codes within the same phase
- [ ] Applicability tags are valid (P, ABM, CSO, FTE, RPA, STC, FTC)
- [ ] Event type letter matches the suffix of the event code

## Notes
- Some events span multiple lines — be careful with text wrapping from pdftotext
- Figure references (e.g., "Figure 16: PF 8200 Energy") are NOT events — skip them
- "req'd" is an abbreviation for "required"
- Some prerequisites have conditional notes like "[req'd for T-38 Data Group]" — capture these in the notes field
- The MCG is for Class 25B — this is the version_code for the curriculum_version record
