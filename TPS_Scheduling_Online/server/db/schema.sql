-- TPS Interactive Scheduler — Database Schema
-- SQLite-compatible, PostgreSQL-ready
-- Version: 1.0.0

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- REFERENCE TABLES (seed data)
-- ============================================================

-- Personnel categories matching current roster structure
CREATE TABLE IF NOT EXISTS personnel_category (
    id          TEXT PRIMARY KEY,        -- 'FTC-A', 'Staff IP', etc.
    display_name TEXT NOT NULL,
    sort_order  INTEGER NOT NULL,
    is_staff    BOOLEAN NOT NULL DEFAULT FALSE,
    is_student  BOOLEAN NOT NULL DEFAULT FALSE,
    color_bg    TEXT,                     -- '#7c3aed' for UI chips
    color_text  TEXT
);

-- Crew roles for event staffing requirements
CREATE TABLE IF NOT EXISTS crew_role (
    id          TEXT PRIMARY KEY,        -- 'IP', 'SP', 'FTE_STUDENT', etc.
    display_name TEXT NOT NULL,
    description TEXT,
    sort_order  INTEGER NOT NULL
);

-- Event sections (the 5 schedule divisions)
CREATE TABLE IF NOT EXISTS event_section (
    id          TEXT PRIMARY KEY,        -- 'Flying', 'Ground', 'NA', etc.
    display_name TEXT NOT NULL,
    is_readonly BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order  INTEGER NOT NULL
);

-- ============================================================
-- AIRCRAFT LAYER
-- ============================================================

-- Aircraft types (F-16, T-38, C-12, X-62A, EXTRA, A-29, Glider)
CREATE TABLE IF NOT EXISTS aircraft_type (
    id              TEXT PRIMARY KEY,    -- 'F-16', 'T-38', 'C-12'
    display_name    TEXT NOT NULL,
    default_max_seats INTEGER NOT NULL,  -- F-16: 2, C-12: 9
    notes           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Individual aircraft by tail number
CREATE TABLE IF NOT EXISTS aircraft_tail (
    id              TEXT PRIMARY KEY,    -- Tail number key
    aircraft_type_id TEXT NOT NULL REFERENCES aircraft_type(id),
    tail_number     TEXT NOT NULL UNIQUE,
    max_seats       INTEGER,            -- NULL = use aircraft_type.default_max_seats
    notes           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Configurations that can be applied to an aircraft type
CREATE TABLE IF NOT EXISTS aircraft_config (
    id              TEXT PRIMARY KEY,    -- 'F16_DEPARTURE', 'F16_STRUCTURES'
    aircraft_type_id TEXT NOT NULL REFERENCES aircraft_type(id),
    config_name     TEXT NOT NULL,       -- 'Departure', 'Structures', 'Normal'
    description     TEXT,
    reduces_seats_by INTEGER DEFAULT 0,
    UNIQUE(aircraft_type_id, config_name)
);

-- Pairs of configs that CANNOT be applied simultaneously
CREATE TABLE IF NOT EXISTS config_incompatibility (
    config_a_id TEXT NOT NULL REFERENCES aircraft_config(id),
    config_b_id TEXT NOT NULL REFERENCES aircraft_config(id),
    reason      TEXT,
    PRIMARY KEY (config_a_id, config_b_id),
    CHECK (config_a_id < config_b_id)
);

-- ============================================================
-- PERSONNEL LAYER
-- ============================================================

-- Individual people (students, instructors, support)
CREATE TABLE IF NOT EXISTS person (
    id              TEXT PRIMARY KEY,    -- UUID
    display_name    TEXT NOT NULL,       -- "Larsen, R"
    category_id     TEXT NOT NULL REFERENCES personnel_category(id),
    email           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- What a person is qualified to do
CREATE TABLE IF NOT EXISTS person_qualification (
    id              TEXT PRIMARY KEY,    -- UUID
    person_id       TEXT NOT NULL REFERENCES person(id),
    qualification_type TEXT NOT NULL,    -- 'aircraft', 'instrument', 'instructor', 'custom'
    qualification_value TEXT NOT NULL,   -- 'F-16', 'T-38', 'NVG', 'High AOA'
    earned_date     TEXT,
    expiry_date     TEXT,
    is_current      BOOLEAN NOT NULL DEFAULT TRUE,
    notes           TEXT
);

-- Periods when a person is unavailable
CREATE TABLE IF NOT EXISTS non_availability (
    id              TEXT PRIMARY KEY,    -- UUID
    person_id       TEXT NOT NULL REFERENCES person(id),
    reason          TEXT NOT NULL,       -- 'Leave', 'TDY', 'Medical', 'Training'
    start_date      TEXT NOT NULL,       -- ISO date
    end_date        TEXT NOT NULL,       -- ISO date
    start_time      TEXT,                -- HH:MM (NULL = all day)
    end_time        TEXT,                -- HH:MM (NULL = all day)
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- AUTH LAYER (schema-ready, not implemented)
-- ============================================================

CREATE TABLE IF NOT EXISTS app_user (
    id              TEXT PRIMARY KEY,    -- UUID
    username        TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    person_id       TEXT REFERENCES person(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_role (
    id              TEXT PRIMARY KEY,    -- 'admin', 'scheduler', etc.
    display_name    TEXT NOT NULL,
    description     TEXT
);

CREATE TABLE IF NOT EXISTS user_role_assignment (
    user_id         TEXT NOT NULL REFERENCES app_user(id),
    role_id         TEXT NOT NULL REFERENCES user_role(id),
    PRIMARY KEY (user_id, role_id)
);

-- ============================================================
-- CURRICULUM LAYER (MCG system)
-- ============================================================

-- A Master Curriculum Guide version
CREATE TABLE IF NOT EXISTS curriculum_version (
    id              TEXT PRIMARY KEY,    -- UUID
    name            TEXT NOT NULL,       -- "FTC MCG 2026A"
    course_type     TEXT NOT NULL,       -- 'FTC' or 'STC'
    version_code    TEXT NOT NULL,       -- '2026A', '2026B'
    effective_date  TEXT NOT NULL,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(course_type, version_code)
);

-- An event type defined in a curriculum
CREATE TABLE IF NOT EXISTS event_template (
    id              TEXT PRIMARY KEY,    -- UUID
    curriculum_id   TEXT NOT NULL REFERENCES curriculum_version(id),
    event_name      TEXT NOT NULL,       -- 'CF-01', 'AIRMANSHIP-01'
    section_id      TEXT NOT NULL REFERENCES event_section(id),
    default_duration_min INTEGER,
    description     TEXT,
    notes           TEXT,
    sort_order      INTEGER NOT NULL,
    is_required     BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(curriculum_id, event_name)
);

-- Prerequisite chains: event X requires completion of event Y
CREATE TABLE IF NOT EXISTS event_prerequisite (
    event_template_id    TEXT NOT NULL REFERENCES event_template(id),
    requires_template_id TEXT NOT NULL REFERENCES event_template(id),
    notes               TEXT,
    PRIMARY KEY (event_template_id, requires_template_id),
    CHECK (event_template_id != requires_template_id)
);

-- Crew roles required for an event template
CREATE TABLE IF NOT EXISTS crew_requirement (
    id                  TEXT PRIMARY KEY, -- UUID
    event_template_id   TEXT NOT NULL REFERENCES event_template(id),
    crew_role_id        TEXT NOT NULL REFERENCES crew_role(id),
    min_count           INTEGER NOT NULL DEFAULT 1,
    max_count           INTEGER,
    is_mandatory        BOOLEAN NOT NULL DEFAULT TRUE,
    notes               TEXT
);

-- Aircraft type/config required for an event template
CREATE TABLE IF NOT EXISTS aircraft_requirement (
    id                  TEXT PRIMARY KEY, -- UUID
    event_template_id   TEXT NOT NULL REFERENCES event_template(id),
    aircraft_type_id    TEXT NOT NULL REFERENCES aircraft_type(id),
    required_config_id  TEXT REFERENCES aircraft_config(id),
    notes               TEXT
);

-- ============================================================
-- CLASS INSTANCE LAYER
-- ============================================================

-- A specific class cohort linked to a curriculum version
CREATE TABLE IF NOT EXISTS class_instance (
    id              TEXT PRIMARY KEY,    -- UUID
    curriculum_id   TEXT NOT NULL REFERENCES curriculum_version(id),
    class_name      TEXT NOT NULL,       -- 'FTC-A Class 26A'
    category_id     TEXT NOT NULL REFERENCES personnel_category(id),
    start_date      TEXT NOT NULL,
    end_date        TEXT,
    phase           TEXT,                -- 'Phase 1 (AM Flying)', etc.
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    notes           TEXT,
    UNIQUE(class_name)
);

-- Students enrolled in a class instance
CREATE TABLE IF NOT EXISTS student_enrollment (
    id              TEXT PRIMARY KEY,    -- UUID
    class_instance_id TEXT NOT NULL REFERENCES class_instance(id),
    person_id       TEXT NOT NULL REFERENCES person(id),
    enrolled_date   TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',
    notes           TEXT,
    UNIQUE(class_instance_id, person_id)
);

-- ============================================================
-- SCHEDULE LAYER (the daily view)
-- ============================================================

-- The actual scheduled event instances
CREATE TABLE IF NOT EXISTS scheduled_event (
    id              TEXT PRIMARY KEY,    -- UUID
    section_id      TEXT NOT NULL REFERENCES event_section(id),
    date            TEXT NOT NULL,       -- ISO date 'YYYY-MM-DD'
    event_name      TEXT NOT NULL,
    start_time      TEXT,                -- 'HH:MM'
    end_time        TEXT,                -- 'HH:MM'
    etd             TEXT,                -- Flying only
    eta             TEXT,                -- Flying only

    event_template_id TEXT REFERENCES event_template(id),
    aircraft_tail_id  TEXT REFERENCES aircraft_tail(id),
    aircraft_type_id  TEXT REFERENCES aircraft_type(id),
    class_instance_id TEXT REFERENCES class_instance(id),
    aircraft_config_id TEXT REFERENCES aircraft_config(id),

    notes           TEXT,
    is_readonly     BOOLEAN NOT NULL DEFAULT FALSE,
    status          TEXT NOT NULL DEFAULT 'scheduled',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    created_by      TEXT REFERENCES app_user(id)
);

-- Tracks which curriculum events a student has completed
CREATE TABLE IF NOT EXISTS student_completion (
    id                  TEXT PRIMARY KEY, -- UUID
    enrollment_id       TEXT NOT NULL REFERENCES student_enrollment(id),
    event_template_id   TEXT NOT NULL REFERENCES event_template(id),
    scheduled_event_id  TEXT REFERENCES scheduled_event(id),
    completed_date      TEXT NOT NULL,
    grade               TEXT,
    notes               TEXT,
    UNIQUE(enrollment_id, event_template_id)
);

-- Crew assigned to a scheduled event
CREATE TABLE IF NOT EXISTS event_crew (
    id              TEXT PRIMARY KEY,    -- UUID
    event_id        TEXT NOT NULL REFERENCES scheduled_event(id),
    person_id       TEXT NOT NULL REFERENCES person(id),
    crew_role_id    TEXT REFERENCES crew_role(id),
    is_original     BOOLEAN NOT NULL DEFAULT TRUE,
    added_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(event_id, person_id)
);

-- Supervision duties (separate table, always readonly)
CREATE TABLE IF NOT EXISTS supervision_duty (
    id              TEXT PRIMARY KEY,    -- UUID
    date            TEXT NOT NULL,
    duty_type       TEXT NOT NULL,       -- 'SOF', 'OS', 'ODO', etc.
    person_id       TEXT NOT NULL REFERENCES person(id),
    start_time      TEXT NOT NULL,
    end_time        TEXT NOT NULL,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit trail for all schedule changes
CREATE TABLE IF NOT EXISTS event_change_log (
    id              TEXT PRIMARY KEY,    -- UUID
    event_id        TEXT NOT NULL REFERENCES scheduled_event(id),
    change_type     TEXT NOT NULL,       -- 'crew_add', 'crew_remove', 'time_change', 'cancel', 'create'
    person_id       TEXT REFERENCES person(id),
    old_value       TEXT,                -- JSON
    new_value       TEXT,                -- JSON
    changed_at      TEXT NOT NULL DEFAULT (datetime('now')),
    changed_by      TEXT REFERENCES app_user(id)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Schedule queries (the hot path)
CREATE INDEX IF NOT EXISTS idx_event_date ON scheduled_event(date);
CREATE INDEX IF NOT EXISTS idx_event_date_section ON scheduled_event(date, section_id);
CREATE INDEX IF NOT EXISTS idx_event_template ON scheduled_event(event_template_id);
CREATE INDEX IF NOT EXISTS idx_event_class ON scheduled_event(class_instance_id);

-- Conflict detection
CREATE INDEX IF NOT EXISTS idx_crew_person ON event_crew(person_id);
CREATE INDEX IF NOT EXISTS idx_crew_event ON event_crew(event_id);

-- Supervision conflicts
CREATE INDEX IF NOT EXISTS idx_supervision_date ON supervision_duty(date);
CREATE INDEX IF NOT EXISTS idx_supervision_person ON supervision_duty(person_id, date);

-- NA lookups
CREATE INDEX IF NOT EXISTS idx_na_person_date ON non_availability(person_id, start_date, end_date);

-- Prerequisite lookups
CREATE INDEX IF NOT EXISTS idx_prereq_event ON event_prerequisite(event_template_id);
CREATE INDEX IF NOT EXISTS idx_completion_enrollment ON student_completion(enrollment_id);

-- Audit trail
CREATE INDEX IF NOT EXISTS idx_changelog_event ON event_change_log(event_id);
CREATE INDEX IF NOT EXISTS idx_changelog_time ON event_change_log(changed_at);

-- Person lookups
CREATE INDEX IF NOT EXISTS idx_person_category ON person(category_id);
CREATE INDEX IF NOT EXISTS idx_person_name ON person(display_name);

-- ============================================================
-- VIEWS
-- ============================================================

-- View that produces the ScheduleEvent shape for the frontend
CREATE VIEW IF NOT EXISTS v_schedule_event AS
SELECT
    se.id,
    se.section_id AS section,
    se.date,
    COALESCE(at2.id, se.aircraft_type_id) AS model,
    se.event_name AS eventName,
    se.start_time AS startTime,
    se.end_time AS endTime,
    se.etd,
    se.eta,
    se.notes,
    se.is_readonly AS readonly,
    json_group_array(p.display_name) AS personnel_json
FROM scheduled_event se
LEFT JOIN aircraft_tail tail ON se.aircraft_tail_id = tail.id
LEFT JOIN aircraft_type at2 ON tail.aircraft_type_id = at2.id
LEFT JOIN event_crew ec ON se.id = ec.event_id
LEFT JOIN person p ON ec.person_id = p.id
WHERE se.status != 'archived'
GROUP BY se.id;
