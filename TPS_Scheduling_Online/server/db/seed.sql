-- TPS Interactive Scheduler — Seed Data
-- Reference tables populated from existing frontend constants
-- Version: 1.0.0

-- ============================================================
-- PERSONNEL CATEGORIES (from src/constants/colors.ts + classification.ts)
-- ============================================================

INSERT OR IGNORE INTO personnel_category (id, display_name, sort_order, is_staff, is_student, color_bg, color_text) VALUES
    ('FTC-A',            'FTC-A',            1, FALSE, TRUE,  '#7c3aed', '#f3e8ff'),
    ('STC-A',            'STC-A',            2, FALSE, TRUE,  '#9333ea', '#fae8ff'),
    ('FTC-B',            'FTC-B',            3, FALSE, TRUE,  '#ea580c', '#fff7ed'),
    ('STC-B',            'STC-B',            4, FALSE, TRUE,  '#f97316', '#ffedd5'),
    ('Staff IP',         'Staff IP',         5, TRUE,  FALSE, '#16a34a', '#dcfce7'),
    ('Staff IFTE/ICSO',  'Staff IFTE/ICSO',  6, TRUE,  FALSE, '#4338ca', '#e0e7ff'),
    ('Staff STC',        'Staff STC',        7, TRUE,  FALSE, '#2563eb', '#dbeafe'),
    ('Attached/Support', 'Attached/Support', 8, TRUE,  FALSE, '#64748b', '#f1f5f9');

-- ============================================================
-- CREW ROLES
-- ============================================================

INSERT OR IGNORE INTO crew_role (id, display_name, description, sort_order) VALUES
    ('IP',              'Instructor Pilot',       'Qualified instructor pilot',                    1),
    ('SP',              'Student Pilot',           'Student pilot under training',                  2),
    ('FTE_STUDENT',     'FTE Student',             'Flight Test Engineer student',                  3),
    ('FTE_INSTRUCTOR',  'FTE Instructor',          'Flight Test Engineer instructor',               4),
    ('CSO',             'Combat Systems Officer',  'CSO / Navigator role',                          5),
    ('IFTE',            'IFTE',                    'Instructor Flight Test Engineer',               6),
    ('ICSO',            'ICSO',                    'Instructor Combat Systems Officer',             7),
    ('OBSERVER',        'Observer',                'Non-flying observer / passenger',               8);

-- ============================================================
-- EVENT SECTIONS (from src/types/events.ts EventSection type)
-- ============================================================

INSERT OR IGNORE INTO event_section (id, display_name, is_readonly, sort_order) VALUES
    ('Flying',      'Flying',       FALSE, 1),
    ('Ground',      'Ground',       FALSE, 2),
    ('NA',          'NA',           FALSE, 3),
    ('Supervision', 'Supervision',  TRUE,  4),
    ('Academics',   'Academics',    TRUE,  5);

-- ============================================================
-- AIRCRAFT TYPES (from schedule data)
-- ============================================================

INSERT OR IGNORE INTO aircraft_type (id, display_name, default_max_seats, notes, is_active) VALUES
    ('F-16',   'F-16 Viper',        2,  'Primary FTC training aircraft',          TRUE),
    ('T-38',   'T-38 Talon',        2,  'Supersonic jet trainer',                 TRUE),
    ('C-12',   'C-12 Huron',        9,  'Multi-engine turboprop, King Air variant', TRUE),
    ('X-62A',  'X-62A VISTA',       2,  'Variable In-flight Simulator Test Aircraft', TRUE),
    ('EXTRA',  'Extra 300',         2,  'Aerobatic training aircraft',            TRUE),
    ('A-29',   'A-29 Super Tucano', 2,  'Light attack / trainer',                TRUE),
    ('Glider', 'TG-16A Glider',     2,  'Motorized glider for soaring training', TRUE);

-- ============================================================
-- AIRCRAFT CONFIGURATIONS (F-16 example)
-- ============================================================

INSERT OR IGNORE INTO aircraft_config (id, aircraft_type_id, config_name, description, reduces_seats_by) VALUES
    ('F16_DEPARTURE',   'F-16', 'Departure',   'Departure config with test instrumentation',   0),
    ('F16_STRUCTURES',  'F-16', 'Structures',  'Structural test configuration',                0),
    ('F16_NORMAL',      'F-16', 'Normal',      'Standard training configuration',              0),
    ('F16_NONE',        'F-16', 'No Special',  'No special configuration required',            0);

-- F-16 incompatible config pairs
INSERT OR IGNORE INTO config_incompatibility (config_a_id, config_b_id, reason) VALUES
    ('F16_DEPARTURE', 'F16_STRUCTURES', 'Physically incompatible instrumentation setups');

-- ============================================================
-- USER ROLES (auth-ready, not active)
-- ============================================================

INSERT OR IGNORE INTO user_role (id, display_name, description) VALUES
    ('admin',      'Administrator',  'Full system access, manage users and configuration'),
    ('scheduler',  'Scheduler',      'Create and modify schedule events'),
    ('instructor', 'Instructor',     'View schedules, manage own events'),
    ('student',    'Student',        'View own schedule and progress'),
    ('viewer',     'Viewer',         'Read-only access to schedules');
