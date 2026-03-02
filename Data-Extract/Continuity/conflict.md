# Continuity vs MCG Conflict Notes

## Overview

- **Continuity Source**: `Continuity_25A.xlsx` (Class 25A, still used for all classes)
- **MCG Source**: `MCG 25B.pdf` (Class 25B, extracted to `Data-Extract/MCG-25B/phase-*.json`)
- **Date**: 2026-02-19

## Event Code Mismatch (Expected)

The continuity uses **25A event codes** while the MCG uses **25B event codes**. These numbering schemes changed between classes, so **zero direct code matches are expected**. Code synchronization will be handled in a later step by matching on event names, mission descriptions, and sequence position.

**Continuity event count**: 153 unique events (using FQ 25A sheet as primary)
**MCG 25B event count**: 621 events across 9 phases

The continuity only covers **sortie-level events** (flights, sims, labs, control room sessions) — it does NOT include academics, exams, debriefs, MIBs, or written reports. The MCG covers ALL event types. This is expected: the continuity is a scheduling operations document, not a curriculum catalog.

## Structural Differences

### 1. Continuity Has Richer Operational Data
The continuity captures scheduling details the MCG does not:
- **Crew compositions** (specific pairings: IP/STUD, data group assignments)
- **Aircraft configurations** (Block 40/50, DAS SIPF, wing tanks, sensor pods)
- **Aircraft capability requirements** (Required Cape vs Desired Cape)
- **Aircrew qualification requirements** (specific quals per event)
- **Scheduling notes** (POC contacts, phone numbers, airspace blocks, fuel loads, brief times)
- **LOX** (logistics/aircraft type for ordering)
- **Duration in hours** (MCG does not specify event durations)

### 2. MCG Has Richer Curriculum Data
The MCG captures educational structure the continuity does not:
- **Terminal Learning Objectives (TLOs)** per module
- **Event descriptions** (what students learn)
- **Prerequisite chains** (formal DAG with `[req'd for ...]` annotations)
- **Applicability tags** (P, ABM, CSO, FTE, RPA, STC, FTC)
- **Module/course hierarchy** (courses > modules > events)
- **Credit hours** per course

### 3. Two FQ Sheets in Continuity
The continuity has TWO Flying Qualities sheets:
- **"FLYING QUALITIES"** (38 events) — older format, uses abbreviated names
- **"FQ"** (31 events) — Class 25A update, cleaner names, more specific prereqs

The "FQ" sheet is authoritative for 25A. Some events were added (FQ 8133S PIO Sim, FQ 8153F Learjet HQ Flight, etc.) and some removed (FQ 6371X Ramp Tour, some backup variants).

### 4. Performance Sheet Has Dual Code Columns
The PERFORMANCE sheet has two `#` columns (A and B) — some events have codes in both. This suggests the sheet was tracking code changes between class versions.

### 5. Missing Phases in Continuity
The continuity does NOT cover:
- **AN** (Ancillary Training) — administrative/orientation events
- **SO** (Space Operations) — handled separately by space ops branch
- **AS** (Astronautical Sciences) — STC-only, separate scheduling track
- **TL** (Test Leadership) — classroom-only, no sortie scheduling needed

## Prerequisite Conflicts

The MCG prerequisites are **authoritative** per user direction. However, the continuity prerequisites often provide more **operational specificity**:

### MCG prerequisite style (formal):
```
PF 6121F T-38 Low L/D Flight [req'd for PF 8302F]
```

### Continuity prerequisite style (operational):
```
CF 6351FP T-38 CF-1 (PILOT)
CF 6554FN/FP C-12 Training Flt (FTE/CSO/non-crew solo P)
T-38 CF-4 RPA
```

The continuity prereqs often specify **which student track** needs which prereq (Pilot vs FTE vs RPA), while MCG prereqs use the parenthetical applicability tags. When synchronizing, MCG prerequisite chains should be primary, with continuity prereqs adding track-specific detail.

## Recommended Database Approach

Per user direction: **separate curriculum database per class** is recommended.

This means:
1. `curriculum_version` table gets one row per class (25A, 25B, etc.)
2. `event_template` records are **duplicated** per curriculum version with class-specific codes
3. Cross-class event matching is done by **event name/mission** not by code
4. Each class's continuity data maps to its own curriculum version
5. New classes clone the previous version and update codes/details

### Example mapping:
| Event Name | 25A Code | 25B Code | Notes |
|-----------|----------|----------|-------|
| Tower Flyby | PF 7151FP | PF 7111C | Code AND type letter changed |
| T-38 Low L/D Flight | PF 6152F | PF 6121F | Different numbering |
| C-172 Airmanship FA-1 | CF 6151FE | CF 6110F | Range notation in 25B |

The exact mapping will be built in the synchronization step.

## Data Quality Notes

### Continuity Issues Found
1. **Typos in event codes**: `FQ6751CE` (missing space), `FQ8132S` (missing space)
2. **Duplicate codes**: `SY 9221LU` appears twice in SYSTEMS sheet with different events
3. **Orphan codes**: PERFORMANCE sheet rows 151-188 have standalone PF codes with no mission data
4. **Duration format inconsistency**: Mix of decimal hours (1.5), military format (1+05), "ASD" (as scheduled), and null
5. **Merged cells**: Some continuation rows have data that logically belongs to the previous event but is ambiguous

### MCG Issues Found (from extraction)
1. **"W" suffix not in legend**: Used for Working Group events (FQ, SY, TF phases)
2. **"Z" suffix not in legend**: Used for Debrief events (AN, PF, FQ phases)
3. **Code typo**: AS 9401A printed as "AS9401A" in PDF (no space)
4. **Prerequisite code mismatch**: PF 8230-2F prereq list references "PF 8210F" but the defined code is "PF 8211F"
