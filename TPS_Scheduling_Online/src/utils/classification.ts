import type { ScheduleEvent, EventClass, Roster } from '../types';
import { STAFF_KEYWORDS, STAFF_CATEGORIES, STUDENT_PATTERNS } from '../constants';
import { personCat } from './display';

/** Classify an event by its crew composition (A-Class, B-Class, Staff, Other) */
export const classifyEvent = (ev: ScheduleEvent, roster: Roster): EventClass => {
  // 1. Check staff keywords against event name
  const name = (ev.eventName || '').toUpperCase();
  // "P/S" = Performance/Syllabus (student training events) — exclude from staff keyword match
  const isStudentSyllabus = name.includes('P/S ');
  if (!isStudentSyllabus && STAFF_KEYWORDS.some(kw => name.includes(kw))) return 'Staff';

  // 2. Count non-staff personnel by class
  const staffCats = new Set(STAFF_CATEGORIES);
  let aCount = 0;
  let bCount = 0;
  ev.personnel.forEach(p => {
    const cat = personCat(p, roster);
    if (!cat || staffCats.has(cat)) return; // skip staff/unknown
    if (cat === 'FTC-A' || cat === 'STC-A') aCount++;
    else if (cat === 'FTC-B' || cat === 'STC-B') bCount++;
  });

  if (aCount > 0 && aCount >= bCount) return 'A-Class';
  if (bCount > 0 && bCount > aCount) return 'B-Class';
  return 'Other';
};

/** Check if an event name matches student curriculum patterns */
export const isStudentEventName = (name: string): boolean =>
  STUDENT_PATTERNS.some(pat => name.startsWith(pat));
