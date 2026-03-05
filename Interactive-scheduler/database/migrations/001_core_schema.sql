-- Migration 001: Core Schema (v1.1)
-- TPS Interactive Scheduler - PostgreSQL
-- All 16 tables from database-structure.md v1.1
--
-- Run with: psql -U tps_admin -h localhost -d tps_scheduler -f 001_core_schema.sql
-- Requires: CREATE EXTENSION "pgcrypto" (run as superuser first)

BEGIN;

-- ============================================================
-- REFERENCE DATA
-- ============================================================

CREATE TABLE IF NOT EXISTS personnel_category (
    id            text PRIMARY KEY,
    display_name  text NOT NULL,
    sort_order    smallint NOT NULL,
    is_staff      boolean NOT NULL DEFAULT FALSE,
    is_student    boolean NOT NULL DEFAULT FALSE,
    color_bg      text NOT NULL,
    color_text    text NOT NULL
);

CREATE TABLE IF NOT EXISTS event_section (
    id            text PRIMARY KEY,
    display_name  text NOT NULL,
    badge_code    text NOT NULL,
    badge_color   text NOT NULL,
    sort_order    smallint NOT NULL,
    is_readonly   boolean NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS supervision_role (
    id            text PRIMARY KEY,
    display_name  text NOT NULL,
    sort_order    smallint NOT NULL
);

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS app_user (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username      text NOT NULL UNIQUE,
    display_name  text NOT NULL,
    is_active     boolean NOT NULL DEFAULT TRUE,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_preference (
    user_id       uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
    theme         text NOT NULL DEFAULT 'dark'
                    CHECK (theme IN ('dark', 'light')),
    default_view  text NULL
                    CHECK (default_view IS NULL
                        OR default_view IN ('timeline', 'whiteboard', 'rainbow')),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ROSTER
-- ============================================================

CREATE TABLE IF NOT EXISTS roster_person (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name  text NOT NULL,
    category_id   text NOT NULL REFERENCES personnel_category(id),
    sort_order    smallint NOT NULL DEFAULT 0,
    is_active     boolean NOT NULL DEFAULT TRUE,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (display_name, category_id)
);

-- ============================================================
-- SCHEDULE DATES
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule_date (
    date          date PRIMARY KEY,
    sheet_name    text NOT NULL,
    fetched_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SCHEDULED EVENTS (source data from GAS API)
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduled_event (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    section                 text NOT NULL REFERENCES event_section(id),
    date                    date NOT NULL REFERENCES schedule_date(date),
    model                   text NULL,
    event_name              text NOT NULL,
    start_time              text NULL,
    end_time                text NULL,
    etd                     text NULL,
    eta                     text NULL,
    notes                   text NULL,
    is_readonly             boolean NOT NULL DEFAULT FALSE,
    is_cancelled            boolean NOT NULL DEFAULT FALSE,
    is_effective            boolean NOT NULL DEFAULT FALSE,
    is_partially_effective  boolean NOT NULL DEFAULT FALSE,
    natural_key             text NOT NULL UNIQUE,
    source_hash             text NULL,
    is_stale                boolean NOT NULL DEFAULT FALSE,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    updated_by              uuid NULL REFERENCES app_user(id)
);

CREATE TABLE IF NOT EXISTS event_personnel (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id      uuid NOT NULL REFERENCES scheduled_event(id) ON DELETE CASCADE,
    person_name   text NOT NULL,
    position      smallint NOT NULL,
    is_original   boolean NOT NULL DEFAULT TRUE,
    UNIQUE (event_id, person_name)
);

-- ============================================================
-- CUSTOM EVENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_event (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by    uuid NOT NULL REFERENCES app_user(id),
    section       text NOT NULL REFERENCES event_section(id),
    date          date NOT NULL,
    model         text NULL,
    event_name    text NOT NULL,
    start_time    text NULL,
    end_time      text NULL,
    etd           text NULL,
    eta           text NULL,
    notes         text NULL,
    is_deleted    boolean NOT NULL DEFAULT FALSE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- WORKING STATE (per-user editable snapshots)
-- ============================================================

CREATE TABLE IF NOT EXISTS working_event (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    source_event_id         uuid NULL REFERENCES scheduled_event(id),
    section                 text NOT NULL,
    date                    date NOT NULL,
    model                   text NULL,
    event_name              text NOT NULL,
    start_time              text NULL,
    end_time                text NULL,
    etd                     text NULL,
    eta                     text NULL,
    notes                   text NULL,
    is_readonly             boolean NOT NULL DEFAULT FALSE,
    is_cancelled            boolean NOT NULL DEFAULT FALSE,
    is_effective            boolean NOT NULL DEFAULT FALSE,
    is_partially_effective  boolean NOT NULL DEFAULT FALSE,
    is_custom               boolean NOT NULL DEFAULT FALSE,
    saved_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS working_event_personnel (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    working_event_id  uuid NOT NULL REFERENCES working_event(id) ON DELETE CASCADE,
    person_name       text NOT NULL,
    position          smallint NOT NULL
);

CREATE TABLE IF NOT EXISTS working_event_placeholder (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    working_event_id  uuid NOT NULL REFERENCES working_event(id) ON DELETE CASCADE,
    role              text NOT NULL,
    filled_by         text NULL
);

-- ============================================================
-- CHANGE TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS event_change (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    sequence         integer NOT NULL,
    change_type      text NOT NULL
                       CHECK (change_type IN (
                         'add', 'remove', 'event-cancel',
                         'event-edit', 'event-status', 'event-delete'
                       )),
    event_id         text NULL,
    event_name       text NULL,
    event_model      text NULL,
    event_time       text NULL,
    event_section    text NULL,
    date             date NULL,
    person           text NULL,
    before_json      jsonb NULL,
    after_json       jsonb NULL,
    cancelled_before boolean NULL,
    cancelled_after  boolean NULL,
    status_field     text NULL,
    status_before    boolean NULL,
    status_after     boolean NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- DUTY ASSIGNMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS duty_assignment (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    date          date NOT NULL,
    slot          text NOT NULL CHECK (slot IN ('foa', 'auth')),
    person_name   text NOT NULL,
    position      smallint NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, date, slot, person_name)
);

-- ============================================================
-- CELL HIGHLIGHTS
-- ============================================================

CREATE TABLE IF NOT EXISTS cell_highlight (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    event_id      text NOT NULL,
    field         text NOT NULL,
    color_key     text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, event_id, field)
);

-- ============================================================
-- USER SESSION
-- ============================================================

CREATE TABLE IF NOT EXISTS user_session (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    selected_ids      jsonb NOT NULL DEFAULT '[]'::jsonb,
    selected_keys     jsonb NOT NULL DEFAULT '[]'::jsonb,
    na_cats           jsonb NOT NULL DEFAULT '[]'::jsonb,
    select_all_active boolean NOT NULL DEFAULT FALSE,
    has_working_state boolean NOT NULL DEFAULT FALSE,
    saved_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_event_date
    ON scheduled_event(date);
CREATE INDEX IF NOT EXISTS idx_event_date_section
    ON scheduled_event(date, section);
CREATE INDEX IF NOT EXISTS idx_event_not_stale
    ON scheduled_event(date) WHERE is_stale = FALSE;
CREATE INDEX IF NOT EXISTS idx_event_personnel_name
    ON event_personnel(person_name);
CREATE INDEX IF NOT EXISTS idx_event_personnel_event
    ON event_personnel(event_id);
CREATE INDEX IF NOT EXISTS idx_roster_category
    ON roster_person(category_id);
CREATE INDEX IF NOT EXISTS idx_roster_name
    ON roster_person(display_name);
CREATE INDEX IF NOT EXISTS idx_working_event_user
    ON working_event(user_id);
CREATE INDEX IF NOT EXISTS idx_working_event_user_date
    ON working_event(user_id, date);
CREATE INDEX IF NOT EXISTS idx_working_personnel_event
    ON working_event_personnel(working_event_id);
CREATE INDEX IF NOT EXISTS idx_working_placeholder_event
    ON working_event_placeholder(working_event_id);
CREATE INDEX IF NOT EXISTS idx_change_user_seq
    ON event_change(user_id, sequence);
CREATE INDEX IF NOT EXISTS idx_custom_event_user
    ON custom_event(created_by);
CREATE INDEX IF NOT EXISTS idx_custom_event_date
    ON custom_event(date);
CREATE INDEX IF NOT EXISTS idx_duty_user_date
    ON duty_assignment(user_id, date);
CREATE INDEX IF NOT EXISTS idx_highlight_user
    ON cell_highlight(user_id);

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO personnel_category VALUES
    ('FTC-A',             'FTC-A',             1, FALSE, TRUE,  '#7c3aed', '#f3e8ff'),
    ('FTC-B',             'FTC-B',             2, FALSE, TRUE,  '#ea580c', '#fff7ed'),
    ('STC-A',             'STC-A',             3, FALSE, TRUE,  '#9333ea', '#fae8ff'),
    ('STC-B',             'STC-B',             4, FALSE, TRUE,  '#f97316', '#ffedd5'),
    ('Staff IP',          'Staff IP',          5, TRUE,  FALSE, '#16a34a', '#dcfce7'),
    ('Staff IFTE/ICSO',   'Staff IFTE/ICSO',   6, TRUE,  FALSE, '#4338ca', '#e0e7ff'),
    ('Staff STC',         'Staff STC',         7, TRUE,  FALSE, '#2563eb', '#dbeafe'),
    ('Attached/Support',  'Attached/Support',  8, FALSE, FALSE, '#64748b', '#f1f5f9')
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_section VALUES
    ('Supervision', 'Supervision', 'SP',  '#d97706', 1, FALSE),
    ('Flying',      'Flying',      'FLT', '#3b82f6', 2, FALSE),
    ('Ground',      'Ground',      'GND', '#16a34a', 3, FALSE),
    ('NA',          'NA',          'N/A', '#475569', 4, FALSE),
    ('Academics',   'Academics',   'ACD', '#7c3aed', 5, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO supervision_role VALUES
    ('SOF',                'SOF',               1),
    ('OS',                 'OS',                2),
    ('ODO',                'ODO',               3),
    ('F-16 FDO',           'F-16 FDO',          4),
    ('T-38 TDO',           'T-38 TDO',          5),
    ('C-12 TDO',           'C-12 TDO',          6),
    ('A-29 ADO',           'A-29 ADO',          7),
    ('Other (As Required)', 'Other (As Required)', 8)
ON CONFLICT (id) DO NOTHING;

-- Default local user for single-user mode
INSERT INTO app_user (username, display_name)
    VALUES ('local', 'Local User')
ON CONFLICT (username) DO NOTHING;

COMMIT;
