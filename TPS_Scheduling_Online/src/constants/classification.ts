import type { EventSection } from '../types';

/** Staff event keywords — if event name matches, classify as 'Staff' */
export const STAFF_KEYWORDS = [
  'MSN QUAL', 'NVG QUAL', 'CHECKRIDE', 'CURRENCY', 'FERRY FLIGHT', 'FERRY',
  'CHASE', 'CADET', 'NAVY', 'HI AOA', 'UPGRADE', 'VISTA UPG', 'FORM UPG', 'UPG',
];

/** Display order for event sections in the timeline */
export const SECTION_ORDER: EventSection[] = ['Flying', 'Ground', 'NA'];

/** Roster display order for rainbow view */
export const ROSTER_ORDER = [
  'FTC-A', 'STC-A', 'FTC-B', 'STC-B',
  'Staff IP', 'Staff IFTE/ICSO', 'Staff STC', 'Attached/Support',
];

/** Classification order for selection screen */
export const CLASS_ORDER = ['A-Class', 'B-Class', 'Staff', 'Other'] as const;

/** Section order for selection screen (non-NA sections) */
export const SELECTION_SECTION_ORDER = ['Flying', 'Ground'] as const;

/** Staff roster categories (used for personnel classification) */
export const STAFF_CATEGORIES = ['Staff IP', 'Staff IFTE/ICSO', 'Staff STC', 'Attached/Support'];

/** Student event name patterns — inherit class from crewed siblings */
export const STUDENT_PATTERNS = ['CF', 'AIRMANSHIP'];

/** Academics group-to-roster mapping */
export const ACADEMICS_GROUP_MAP: Record<string, string> = {
  'Alpha FTC': 'FTC-A',
  'Alpha STC': 'STC-A',
  'Bravo FTC': 'FTC-B',
  'Bravo STC': 'STC-B',
  'IP': 'Staff IP',
  'Staff STC': 'Staff STC',
  'IFTE/IWSO': 'Staff IFTE/ICSO',
};
