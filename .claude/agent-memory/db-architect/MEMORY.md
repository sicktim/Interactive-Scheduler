# Database Architect Memory

## Schema v1.0 (2026-03-05)

### Table Count: 16
- 3 reference: personnel_category, event_section, supervision_role
- 2 user/auth: app_user, user_preference
- 4 source data: roster_person, schedule_date, scheduled_event, event_personnel
- 3 working state: working_event, working_event_personnel, working_event_placeholder
- 1 change tracking: event_change
- 1 custom events: custom_event
- 1 duty: duty_assignment
- 1 highlights: cell_highlight
- 1 session: user_session

### Key Design Decisions
- person_name (text) everywhere, not FK to roster -- GAS API uses display names
- Separate working_event table mirrors app allEvents/workingEvents split
- natural_key (UNIQUE text) on scheduled_event for upsert ON CONFLICT
- JSONB arrays for user_session selections (not junction tables)
- event_change.event_id is text (no FK) -- events may be deleted
- Times stored as text HH:MM, not PostgreSQL TIME type
- Soft delete via is_stale for events removed during refresh

### localStorage Keys Replaced
1. tps-scheduler-state -> user_session
2. tps-scheduler-working -> working_event + event_change + user_session
3. tps-scheduler-custom-events -> custom_event
4. tps-scheduler-highlights -> cell_highlight
5. tps-duty-assignments -> duty_assignment
6. tps-scheduler-theme -> user_preference

### Known Risk: natural_key Uniqueness
Two events with same date|section|eventName|startTime|model would conflict.
This is the same issue that motivated mergeDuplicateEvents (disabled v3.7.0).
Future fix: add a sequence tiebreaker to natural_key.

### Document Location
Interactive-scheduler/docs/database-structure.md

### Relationship to Phase 3 Schema
TPS_Scheduling_Online/server/db/schema.sql is a future-looking schema with
curriculum, aircraft, prerequisites. This schema supports the current app.
When systems converge, Phase 3 layers can be added atop this schema.
