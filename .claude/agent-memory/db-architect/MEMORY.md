# Database Architect Memory

## Schema v1.1 (2026-03-05)

### Document Location
Interactive-scheduler/database/database-structure.md (MOVED from docs/)
Old location Interactive-scheduler/docs/database-structure.md should be removed.

### Table Count: 16 (unchanged from v1.0)
- 3 reference: personnel_category, event_section, supervision_role
- 2 user/auth: app_user, user_preference
- 4 source data: roster_person, schedule_date, scheduled_event, event_personnel
- 3 working state: working_event, working_event_personnel, working_event_placeholder
- 1 change tracking: event_change
- 1 custom events: custom_event
- 1 duty: duty_assignment
- 1 highlights: cell_highlight
- 1 session: user_session

### Key Design Decisions (D1-D12)
- D1: person_name (text) everywhere -- GAS API uses display names with anomalies
- D2: Separate working_event table mirrors allEvents/workingEvents split
- D3: natural_key UNIQUE text -- all components TRIMMED before compute
- D9: Times as text HH:MM -- corrupted times like "09:0" stored verbatim
- D11: Trim on ingest -- model names, NA reasons have trailing whitespace
- D12: personnelNotes not stored -- future daily_personnel_status table designed

### Raw Data Structure (v1.1 addition)
GAS batch response documented field-by-field:
- Flying: 81 rows x 18 cols, 8 crew slots, multi-row merge (171 cases)
- Ground: 61 rows x 17 cols, 10 personnel slots
- NA: 61 rows x 14 cols, 10 structural person slots (only 1 used)
- Supervision: 9 rows, triplet structure, FOA/AUTH footer at row 8
- Academics: 4 rows x 3 cols, fixed 3 events, no personnel
- personnelNotes: 10 category groups, not consumed by app

### Data Quality Issues (v1.1 addition)
- Trailing whitespace: model names ("F-16 "), NA reasons ("NA ")
- Name anomalies: asterisks ("Clements, J *"), question marks ("Sally?")
- Corrupted times: "09:0" in NA section
- Boolean-as-string: "TRUE"/"FALSE" in status columns
- Padding rows: Ground 34-48/day, NA ~52/day

### Known Risk: natural_key Uniqueness
Two events with same date|section|eventName|startTime|model would conflict.
Future fix: add a sequence tiebreaker to natural_key.

### Relationship to Phase 3 Schema
TPS_Scheduling_Online/server/db/schema.sql is a future-looking schema with
curriculum, aircraft, prerequisites. This schema supports the current app.

### Tooling Note
Write/Edit tools fail with EEXIST on some directories (agent-memory, database).
OneDrive sync issue. Workaround: write Python script elsewhere, run via Bash.
