import { describe, it, expect, beforeEach } from 'vitest';
import { transformSheetReturn, isStaff, mergeDuplicateEvents } from '@/utils/transform';
import { resetIdCounter } from '@/utils/id';
import type { ScheduleEvent, SheetReturn, Roster } from '@/types';

beforeEach(() => {
  resetIdCounter();
});

describe('transformSheetReturn', () => {
  it('returns empty array for null input', () => {
    expect(transformSheetReturn(null as unknown as SheetReturn, '2026-02-03')).toEqual([]);
  });

  it('returns empty array when schedule is empty', () => {
    expect(transformSheetReturn({ schedule: [] }, '2026-02-03')).toEqual([]);
  });

  it('transforms a Flying event correctly', () => {
    const sheet: SheetReturn = {
      schedule: [{
        section: 'Flying',
        time: '08:00',
        details: {
          model: 'T-38',
          eventName: 'CF-01',
          briefTime: '07:30',
          debriefEnd: '11:00',
          etd: '08:00',
          eta: '09:30',
          notes: 'Test note',
        },
        personnel: ['Pilot A', 'Pilot B'],
      }],
    };
    const events = transformSheetReturn(sheet, '2026-02-03');
    expect(events).toHaveLength(1);
    expect(events[0].section).toBe('Flying');
    expect(events[0].model).toBe('T-38');
    expect(events[0].eventName).toBe('CF-01');
    expect(events[0].startTime).toBe('07:30');
    expect(events[0].endTime).toBe('11:00');
    expect(events[0].etd).toBe('08:00');
    expect(events[0].eta).toBe('09:30');
    expect(events[0].personnel).toEqual(['Pilot A', 'Pilot B']);
    expect(events[0].date).toBe('2026-02-03');
    expect(events[0].readonly).toBe(false);
    expect(events[0].notes).toBe('Test note');
  });

  it('transforms a Ground event correctly', () => {
    const sheet: SheetReturn = {
      schedule: [{
        section: 'Ground',
        time: '10:00',
        details: {
          eventName: 'Ground Brief',
          startTime: '10:00',
          endTime: '11:00',
          notes: 'Room 101',
        },
        personnel: ['Engineer A'],
      }],
    };
    const events = transformSheetReturn(sheet, '2026-02-03');
    expect(events).toHaveLength(1);
    expect(events[0].section).toBe('Ground');
    expect(events[0].eventName).toBe('Ground Brief');
    expect(events[0].startTime).toBe('10:00');
    expect(events[0].endTime).toBe('11:00');
    expect(events[0].notes).toBe('Room 101');
    expect(events[0].readonly).toBe(false);
  });

  it('transforms a Supervision event as readonly', () => {
    const sheet: SheetReturn = {
      schedule: [{
        section: 'Supervision',
        time: '06:00',
        details: { duty: 'SOF', startTime: '06:00', endTime: '18:00' },
        personnel: ['Supervisor A'],
      }],
    };
    const events = transformSheetReturn(sheet, '2026-02-03');
    expect(events).toHaveLength(1);
    expect(events[0].section).toBe('Supervision');
    expect(events[0].eventName).toBe('SOF');
    expect(events[0].readonly).toBe(true);
  });

  it('transforms an Academics event as readonly', () => {
    const sheet: SheetReturn = {
      schedule: [{
        section: 'Academics',
        time: '08:00',
        details: { eventName: 'Alpha FTC Academics', startTime: '08:00', endTime: '10:00' },
        personnel: ['Student A', 'Student B'],
      }],
    };
    const events = transformSheetReturn(sheet, '2026-02-03');
    expect(events).toHaveLength(1);
    expect(events[0].section).toBe('Academics');
    expect(events[0].readonly).toBe(true);
  });

  it('transforms an NA event correctly', () => {
    const sheet: SheetReturn = {
      schedule: [{
        section: 'NA',
        time: '06:00',
        details: { reason: 'Leave', startTime: '06:00', endTime: '18:00' },
        personnel: ['Person A'],
      }],
    };
    const events = transformSheetReturn(sheet, '2026-02-03');
    expect(events).toHaveLength(1);
    expect(events[0].section).toBe('NA');
    expect(events[0].eventName).toBe('Leave');
    expect(events[0].readonly).toBe(false);
  });

  it('filters out invalid names from personnel', () => {
    const sheet: SheetReturn = {
      schedule: [{
        section: 'Flying',
        time: '08:00',
        details: {
          model: 'T-38',
          eventName: 'CF-01',
          briefTime: '07:30',
          debriefEnd: '11:00',
          etd: null,
          eta: null,
          notes: null,
        },
        personnel: ['Valid Name', 'FALSE', '', 'TRUE', 'Another Name'],
      }],
    };
    const events = transformSheetReturn(sheet, '2026-02-03');
    expect(events[0].personnel).toEqual(['Valid Name', 'Another Name']);
  });

  it('handles Flying event notes that are "FALSE" as null', () => {
    const sheet: SheetReturn = {
      schedule: [{
        section: 'Flying',
        time: '08:00',
        details: {
          model: 'T-38',
          eventName: 'CF-01',
          briefTime: '07:30',
          debriefEnd: null,
          etd: null,
          eta: null,
          notes: 'FALSE',
        },
        personnel: ['Pilot A'],
      }],
    };
    const events = transformSheetReturn(sheet, '2026-02-03');
    expect(events[0].notes).toBeNull();
  });

  it('generates unique IDs for each event', () => {
    const sheet: SheetReturn = {
      schedule: [
        {
          section: 'Ground',
          time: '08:00',
          details: { eventName: 'Event 1', startTime: '08:00', endTime: '09:00', notes: null },
          personnel: ['A'],
        },
        {
          section: 'Ground',
          time: '10:00',
          details: { eventName: 'Event 2', startTime: '10:00', endTime: '11:00', notes: null },
          personnel: ['B'],
        },
      ],
    };
    const events = transformSheetReturn(sheet, '2026-02-03');
    expect(events[0].id).not.toBe(events[1].id);
  });

  it('copies personnel into originalPersonnel', () => {
    const sheet: SheetReturn = {
      schedule: [{
        section: 'Ground',
        time: '08:00',
        details: { eventName: 'Event 1', startTime: '08:00', endTime: '09:00', notes: null },
        personnel: ['A', 'B'],
      }],
    };
    const events = transformSheetReturn(sheet, '2026-02-03');
    expect(events[0].originalPersonnel).toEqual(events[0].personnel);
    // Ensure they are separate arrays (not same reference)
    expect(events[0].originalPersonnel).not.toBe(events[0].personnel);
  });
});

describe('isStaff', () => {
  const roster: Roster = {
    'Staff IP': ['Instructor Pilot', 'Lead IP'],
    'Staff IFTE/ICSO': ['Test Engineer'],
    'Staff STC': ['STC Member'],
    'Attached/Support': ['Support Person'],
    'FTC-A': ['Student Alpha'],
    'FTC-B': ['Student Bravo'],
  };

  it('returns true for Staff IP', () => {
    expect(isStaff('Instructor Pilot', roster)).toBe(true);
  });

  it('returns true for Staff IFTE/ICSO', () => {
    expect(isStaff('Test Engineer', roster)).toBe(true);
  });

  it('returns true for Staff STC', () => {
    expect(isStaff('STC Member', roster)).toBe(true);
  });

  it('returns true for Attached/Support', () => {
    expect(isStaff('Support Person', roster)).toBe(true);
  });

  it('returns false for students', () => {
    expect(isStaff('Student Alpha', roster)).toBe(false);
    expect(isStaff('Student Bravo', roster)).toBe(false);
  });

  it('returns false for unknown names', () => {
    expect(isStaff('Unknown Person', roster)).toBe(false);
  });

  it('returns false for empty name', () => {
    expect(isStaff('', roster)).toBe(false);
  });

  it('returns false for null roster', () => {
    expect(isStaff('Anyone', null as unknown as Roster)).toBe(false);
  });

  it('handles whitespace in name matching', () => {
    expect(isStaff(' Instructor Pilot ', roster)).toBe(true);
  });
});

describe('mergeDuplicateEvents', () => {
  const roster: Roster = {
    'Staff IP': ['Staff Lead'],
    'FTC-A': ['Student A', 'Student B'],
  };

  function makeTestEvent(overrides: Partial<ScheduleEvent> & { id: string }): ScheduleEvent {
    return {
      section: 'Flying',
      date: '2026-02-03',
      model: 'T-38',
      eventName: 'CF-01',
      startTime: '08:00',
      endTime: '10:00',
      etd: null,
      eta: null,
      personnel: [],
      originalPersonnel: [],
      notes: null,
      readonly: false,
      ...overrides,
    };
  }

  it('returns empty array for empty input', () => {
    expect(mergeDuplicateEvents([], roster)).toEqual([]);
  });

  it('returns single event unchanged', () => {
    const ev = makeTestEvent({ id: 'e1', personnel: ['Student A'] });
    const result = mergeDuplicateEvents([ev], roster);
    expect(result).toHaveLength(1);
  });

  it('merges events with same name/date/time/section/model and same lead', () => {
    // Two-phase merge: events must share personnel[0] to be in the same sub-group
    const ev1 = makeTestEvent({ id: 'e1', personnel: ['Student A'] });
    const ev2 = makeTestEvent({ id: 'e2', personnel: ['Student A', 'Student B'] });
    const result = mergeDuplicateEvents([ev1, ev2], roster);
    expect(result).toHaveLength(1);
    expect(result[0].personnel).toContain('Student A');
    expect(result[0].personnel).toContain('Student B');
  });

  it('does NOT merge events with different personnel[0] (two-phase sub-grouping)', () => {
    // Different leads → separate sub-groups → no merge
    const ev1 = makeTestEvent({ id: 'e1', personnel: ['Student A'] });
    const ev2 = makeTestEvent({ id: 'e2', personnel: ['Student B'] });
    const result = mergeDuplicateEvents([ev1, ev2], roster);
    expect(result).toHaveLength(2);
  });

  it('does not merge events with different names', () => {
    const ev1 = makeTestEvent({ id: 'e1', eventName: 'CF-01', personnel: ['Student A'] });
    const ev2 = makeTestEvent({ id: 'e2', eventName: 'CF-02', personnel: ['Student B'] });
    const result = mergeDuplicateEvents([ev1, ev2], roster);
    expect(result).toHaveLength(2);
  });

  it('does not merge events with different times', () => {
    const ev1 = makeTestEvent({ id: 'e1', startTime: '08:00', personnel: ['Student A'] });
    const ev2 = makeTestEvent({ id: 'e2', startTime: '09:00', personnel: ['Student B'] });
    const result = mergeDuplicateEvents([ev1, ev2], roster);
    expect(result).toHaveLength(2);
  });

  it('skips readonly events (Supervision, Academics)', () => {
    const ev1 = makeTestEvent({ id: 'e1', section: 'Supervision', readonly: true, personnel: ['A'] });
    const ev2 = makeTestEvent({ id: 'e2', section: 'Supervision', readonly: true, personnel: ['B'] });
    const result = mergeDuplicateEvents([ev1, ev2], roster);
    // Readonly events are not merged, both should remain
    expect(result).toHaveLength(2);
  });

  it('skips NA events from merging', () => {
    const ev1 = makeTestEvent({ id: 'e1', section: 'NA', personnel: ['A'] });
    const ev2 = makeTestEvent({ id: 'e2', section: 'NA', personnel: ['B'] });
    const result = mergeDuplicateEvents([ev1, ev2], roster);
    expect(result).toHaveLength(2);
  });

  it('prefers staff lead when merging (empty lead + staff lead)', () => {
    // ev1 has no lead (empty personnel), ev2 has a staff lead
    // leads.size = 1 ('Staff Lead' only), so they merge as one group
    const ev1 = makeTestEvent({ id: 'e1', personnel: [] });
    const ev2 = makeTestEvent({ id: 'e2', personnel: ['Staff Lead', 'Student B'] });
    const result = mergeDuplicateEvents([ev1, ev2], roster);
    expect(result).toHaveLength(1);
    // Staff Lead should be first (selected as primary because lead is staff)
    expect(result[0].personnel[0]).toBe('Staff Lead');
  });

  it('deduplicates personnel across merged events (same lead)', () => {
    // Same lead 'Staff Lead' → same sub-group → merge
    const ev1 = makeTestEvent({ id: 'e1', personnel: ['Staff Lead', 'Student A'] });
    const ev2 = makeTestEvent({ id: 'e2', personnel: ['Staff Lead', 'Student B'] });
    const result = mergeDuplicateEvents([ev1, ev2], roster);
    expect(result).toHaveLength(1);
    // Staff Lead should appear only once
    const staffCount = result[0].personnel.filter(p => p === 'Staff Lead').length;
    expect(staffCount).toBe(1);
    expect(result[0].personnel).toContain('Student A');
    expect(result[0].personnel).toContain('Student B');
  });

  it('merges notes from both events (same lead)', () => {
    // Same lead → merge → notes combined with semicolons
    const ev1 = makeTestEvent({ id: 'e1', personnel: ['Student A'], notes: 'Note 1' });
    const ev2 = makeTestEvent({ id: 'e2', personnel: ['Student A'], notes: 'Note 2' });
    const result = mergeDuplicateEvents([ev1, ev2], roster);
    expect(result).toHaveLength(1);
    expect(result[0].notes).toContain('Note 1');
    expect(result[0].notes).toContain('Note 2');
  });
});
