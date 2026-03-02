import { describe, it, expect } from 'vitest';
import { detectConflicts, hasConflict, eventConflictCount, getConflictText } from '@/utils/conflicts';
import type { ScheduleEvent, ConflictMap } from '@/types';

/** Helper to create a minimal ScheduleEvent */
function makeEvent(overrides: Partial<ScheduleEvent> & { id: string }): ScheduleEvent {
  return {
    section: 'Flying',
    date: '2026-02-03',
    model: 'T-38',
    eventName: 'Test Event',
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

describe('detectConflicts', () => {
  it('returns empty map when no events', () => {
    const conflicts = detectConflicts([]);
    expect(conflicts.size).toBe(0);
  });

  it('returns empty map for a single event', () => {
    const ev = makeEvent({ id: 'ev-1', personnel: ['Pilot A'] });
    const conflicts = detectConflicts([ev]);
    expect(conflicts.size).toBe(0);
  });

  it('detects conflict when same person is in overlapping events', () => {
    const ev1 = makeEvent({
      id: 'ev-1',
      startTime: '08:00',
      endTime: '10:00',
      eventName: 'Flight 1',
      personnel: ['Pilot A'],
    });
    const ev2 = makeEvent({
      id: 'ev-2',
      startTime: '09:00',
      endTime: '11:00',
      eventName: 'Flight 2',
      personnel: ['Pilot A'],
    });
    const conflicts = detectConflicts([ev1, ev2]);
    expect(conflicts.size).toBe(2); // Both events should be recorded
    expect(conflicts.has('ev-1')).toBe(true);
    expect(conflicts.has('ev-2')).toBe(true);
  });

  it('no conflict when same person in non-overlapping events', () => {
    const ev1 = makeEvent({
      id: 'ev-1',
      startTime: '08:00',
      endTime: '09:00',
      personnel: ['Pilot A'],
    });
    const ev2 = makeEvent({
      id: 'ev-2',
      startTime: '10:00',
      endTime: '11:00',
      personnel: ['Pilot A'],
    });
    const conflicts = detectConflicts([ev1, ev2]);
    expect(conflicts.size).toBe(0);
  });

  it('no conflict when different people in overlapping events', () => {
    const ev1 = makeEvent({
      id: 'ev-1',
      startTime: '08:00',
      endTime: '10:00',
      personnel: ['Pilot A'],
    });
    const ev2 = makeEvent({
      id: 'ev-2',
      startTime: '09:00',
      endTime: '11:00',
      personnel: ['Pilot B'],
    });
    const conflicts = detectConflicts([ev1, ev2]);
    expect(conflicts.size).toBe(0);
  });

  it('no conflict when same person on different dates', () => {
    const ev1 = makeEvent({
      id: 'ev-1',
      date: '2026-02-03',
      startTime: '08:00',
      endTime: '10:00',
      personnel: ['Pilot A'],
    });
    const ev2 = makeEvent({
      id: 'ev-2',
      date: '2026-02-04',
      startTime: '08:00',
      endTime: '10:00',
      personnel: ['Pilot A'],
    });
    const conflicts = detectConflicts([ev1, ev2]);
    expect(conflicts.size).toBe(0);
  });

  it('detects multiple people in conflict', () => {
    const ev1 = makeEvent({
      id: 'ev-1',
      startTime: '08:00',
      endTime: '10:00',
      eventName: 'Flight 1',
      personnel: ['Pilot A', 'Pilot B'],
    });
    const ev2 = makeEvent({
      id: 'ev-2',
      startTime: '09:00',
      endTime: '11:00',
      eventName: 'Flight 2',
      personnel: ['Pilot A', 'Pilot B'],
    });
    const conflicts = detectConflicts([ev1, ev2]);
    // Both events should have both people in conflict
    const ev1Conflicts = conflicts.get('ev-1')!;
    expect(ev1Conflicts.has('Pilot A')).toBe(true);
    expect(ev1Conflicts.has('Pilot B')).toBe(true);
  });

  it('handles three-way conflicts', () => {
    const ev1 = makeEvent({
      id: 'ev-1',
      startTime: '08:00',
      endTime: '10:00',
      personnel: ['Pilot A'],
    });
    const ev2 = makeEvent({
      id: 'ev-2',
      startTime: '09:00',
      endTime: '11:00',
      personnel: ['Pilot A'],
    });
    const ev3 = makeEvent({
      id: 'ev-3',
      startTime: '09:30',
      endTime: '10:30',
      personnel: ['Pilot A'],
    });
    const conflicts = detectConflicts([ev1, ev2, ev3]);
    // All three events should have conflicts
    expect(conflicts.has('ev-1')).toBe(true);
    expect(conflicts.has('ev-2')).toBe(true);
    expect(conflicts.has('ev-3')).toBe(true);
  });
});

describe('hasConflict', () => {
  it('returns true when person has conflict on event', () => {
    const conflicts: ConflictMap = new Map([
      ['ev-1', new Map([
        ['Pilot A', [{ eventName: 'Flight 2', model: null, section: 'Flying', startTime: '09:00', endTime: '11:00' }]],
      ])],
    ]);
    expect(hasConflict('ev-1', 'Pilot A', conflicts)).toBe(true);
  });

  it('returns false when person has no conflict', () => {
    const conflicts: ConflictMap = new Map();
    expect(hasConflict('ev-1', 'Pilot A', conflicts)).toBe(false);
  });

  it('returns false when event has conflicts but not for this person', () => {
    const conflicts: ConflictMap = new Map([
      ['ev-1', new Map([
        ['Pilot B', [{ eventName: 'Flight 2', model: null, section: 'Flying', startTime: '09:00', endTime: '11:00' }]],
      ])],
    ]);
    expect(hasConflict('ev-1', 'Pilot A', conflicts)).toBe(false);
  });
});

describe('eventConflictCount', () => {
  it('returns 0 for event with no conflicts', () => {
    const conflicts: ConflictMap = new Map();
    expect(eventConflictCount('ev-1', conflicts)).toBe(0);
  });

  it('returns correct count of personnel with conflicts', () => {
    const conflicts: ConflictMap = new Map([
      ['ev-1', new Map([
        ['Pilot A', [{ eventName: 'Flight 2', model: null, section: 'Flying', startTime: '09:00', endTime: '11:00' }]],
        ['Pilot B', [{ eventName: 'Flight 3', model: null, section: 'Flying', startTime: '09:00', endTime: '11:00' }]],
      ])],
    ]);
    expect(eventConflictCount('ev-1', conflicts)).toBe(2);
  });

  it('returns 1 for single person conflict', () => {
    const conflicts: ConflictMap = new Map([
      ['ev-1', new Map([
        ['Pilot A', [{ eventName: 'Flight 2', model: null, section: 'Flying', startTime: '09:00', endTime: '11:00' }]],
      ])],
    ]);
    expect(eventConflictCount('ev-1', conflicts)).toBe(1);
  });
});

describe('getConflictText', () => {
  it('returns null when no conflicts exist for event', () => {
    const conflicts: ConflictMap = new Map();
    expect(getConflictText('ev-1', 'Pilot A', conflicts)).toBeNull();
  });

  it('returns null when person has no conflict on event', () => {
    const conflicts: ConflictMap = new Map([
      ['ev-1', new Map([
        ['Pilot B', [{ eventName: 'Flight 2', model: null, section: 'Flying', startTime: '09:00', endTime: '11:00' }]],
      ])],
    ]);
    expect(getConflictText('ev-1', 'Pilot A', conflicts)).toBeNull();
  });

  it('returns formatted text for a conflict without model', () => {
    const conflicts: ConflictMap = new Map([
      ['ev-1', new Map([
        ['Pilot A', [{ eventName: 'Ground Brief', model: null, section: 'Ground', startTime: '09:00', endTime: '11:00' }]],
      ])],
    ]);
    const text = getConflictText('ev-1', 'Pilot A', conflicts);
    expect(text).toBe('Ground Brief (09:00-11:00)');
  });

  it('returns formatted text with model prefix', () => {
    const conflicts: ConflictMap = new Map([
      ['ev-1', new Map([
        ['Pilot A', [{ eventName: 'CF-01', model: 'T-38', section: 'Flying', startTime: '09:00', endTime: '11:00' }]],
      ])],
    ]);
    const text = getConflictText('ev-1', 'Pilot A', conflicts);
    expect(text).toBe('T-38 CF-01 (09:00-11:00)');
  });

  it('joins multiple conflicts with semicolons', () => {
    const conflicts: ConflictMap = new Map([
      ['ev-1', new Map([
        ['Pilot A', [
          { eventName: 'CF-01', model: 'T-38', section: 'Flying', startTime: '09:00', endTime: '10:00' },
          { eventName: 'Ground Brief', model: null, section: 'Ground', startTime: '09:30', endTime: '11:00' },
        ]],
      ])],
    ]);
    const text = getConflictText('ev-1', 'Pilot A', conflicts);
    expect(text).toContain('T-38 CF-01 (09:00-10:00)');
    expect(text).toContain('Ground Brief (09:30-11:00)');
    expect(text).toContain('; ');
  });

  it('handles null endTime with "??" placeholder', () => {
    const conflicts: ConflictMap = new Map([
      ['ev-1', new Map([
        ['Pilot A', [{ eventName: 'Event X', model: null, section: 'Flying', startTime: '09:00', endTime: null }]],
      ])],
    ]);
    const text = getConflictText('ev-1', 'Pilot A', conflicts);
    expect(text).toBe('Event X (09:00-??)');
  });
});
