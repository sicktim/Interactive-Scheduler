import { describe, it, expect } from 'vitest';
import { classifyEvent, isStudentEventName } from '@/utils/classification';
import type { ScheduleEvent, Roster } from '@/types';

const roster: Roster = {
  'FTC-A': ['Student A1', 'Student A2'],
  'FTC-B': ['Student B1', 'Student B2'],
  'STC-A': ['STC Student A'],
  'STC-B': ['STC Student B'],
  'Staff IP': ['Instructor Pilot'],
  'Staff IFTE/ICSO': ['Test Engineer'],
  'Staff STC': ['STC Instructor'],
  'Attached/Support': ['Support Person'],
};

function makeEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id: 'test-1',
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

describe('classifyEvent', () => {
  describe('Staff classification by keyword', () => {
    it('classifies MSN QUAL as Staff', () => {
      const ev = makeEvent({ eventName: 'MSN QUAL', personnel: ['Student A1'] });
      expect(classifyEvent(ev, roster)).toBe('Staff');
    });

    it('classifies NVG QUAL as Staff', () => {
      const ev = makeEvent({ eventName: 'NVG QUAL', personnel: [] });
      expect(classifyEvent(ev, roster)).toBe('Staff');
    });

    it('classifies CHECKRIDE as Staff', () => {
      const ev = makeEvent({ eventName: 'CHECKRIDE', personnel: [] });
      expect(classifyEvent(ev, roster)).toBe('Staff');
    });

    it('classifies CURRENCY as Staff', () => {
      const ev = makeEvent({ eventName: 'CURRENCY FLIGHT', personnel: [] });
      expect(classifyEvent(ev, roster)).toBe('Staff');
    });

    it('classifies FERRY FLIGHT as Staff', () => {
      const ev = makeEvent({ eventName: 'FERRY FLIGHT', personnel: [] });
      expect(classifyEvent(ev, roster)).toBe('Staff');
    });

    it('classifies CHASE as Staff', () => {
      const ev = makeEvent({ eventName: 'CHASE', personnel: [] });
      expect(classifyEvent(ev, roster)).toBe('Staff');
    });

    it('classifies UPGRADE as Staff', () => {
      const ev = makeEvent({ eventName: 'UPGRADE', personnel: [] });
      expect(classifyEvent(ev, roster)).toBe('Staff');
    });

    it('does not classify P/S events as Staff even with UPG keyword', () => {
      // P/S = Performance/Syllabus (student training), should NOT match staff keywords
      const ev = makeEvent({ eventName: 'P/S UPG-01', personnel: ['Student A1'] });
      expect(classifyEvent(ev, roster)).not.toBe('Staff');
    });
  });

  describe('A-Class classification', () => {
    it('classifies event with FTC-A students as A-Class', () => {
      const ev = makeEvent({ eventName: 'CF-01', personnel: ['Student A1', 'Student A2', 'Instructor Pilot'] });
      expect(classifyEvent(ev, roster)).toBe('A-Class');
    });

    it('classifies event with STC-A students as A-Class', () => {
      const ev = makeEvent({ eventName: 'CF-01', personnel: ['STC Student A', 'Instructor Pilot'] });
      expect(classifyEvent(ev, roster)).toBe('A-Class');
    });
  });

  describe('B-Class classification', () => {
    it('classifies event with FTC-B students as B-Class', () => {
      const ev = makeEvent({ eventName: 'CF-01', personnel: ['Student B1', 'Student B2', 'Instructor Pilot'] });
      expect(classifyEvent(ev, roster)).toBe('B-Class');
    });

    it('classifies event with STC-B students as B-Class', () => {
      const ev = makeEvent({ eventName: 'CF-01', personnel: ['STC Student B', 'Instructor Pilot'] });
      expect(classifyEvent(ev, roster)).toBe('B-Class');
    });
  });

  describe('Mixed and Other classification', () => {
    it('classifies A-Class when A count >= B count', () => {
      const ev = makeEvent({
        eventName: 'CF-01',
        personnel: ['Student A1', 'Student A2', 'Student B1', 'Instructor Pilot'],
      });
      // 2 A vs 1 B -> A-Class
      expect(classifyEvent(ev, roster)).toBe('A-Class');
    });

    it('classifies B-Class when B count > A count', () => {
      const ev = makeEvent({
        eventName: 'CF-01',
        personnel: ['Student A1', 'Student B1', 'Student B2', 'Instructor Pilot'],
      });
      // 1 A vs 2 B -> B-Class
      expect(classifyEvent(ev, roster)).toBe('B-Class');
    });

    it('classifies as Other when no students present', () => {
      const ev = makeEvent({
        eventName: 'CF-01',
        personnel: ['Instructor Pilot', 'Test Engineer'],
      });
      expect(classifyEvent(ev, roster)).toBe('Other');
    });

    it('classifies as Other when personnel are unknown', () => {
      const ev = makeEvent({
        eventName: 'CF-01',
        personnel: ['Unknown Person'],
      });
      expect(classifyEvent(ev, roster)).toBe('Other');
    });

    it('classifies as Other with empty personnel', () => {
      const ev = makeEvent({ eventName: 'Some Event', personnel: [] });
      expect(classifyEvent(ev, roster)).toBe('Other');
    });
  });
});

describe('isStudentEventName', () => {
  it('returns true for events starting with "CF"', () => {
    expect(isStudentEventName('CF-01')).toBe(true);
    expect(isStudentEventName('CF-02')).toBe(true);
  });

  it('returns true for events starting with "AIRMANSHIP"', () => {
    expect(isStudentEventName('AIRMANSHIP-01')).toBe(true);
    expect(isStudentEventName('AIRMANSHIP PHASE 1')).toBe(true);
  });

  it('returns false for non-student event names', () => {
    expect(isStudentEventName('MSN QUAL')).toBe(false);
    expect(isStudentEventName('CHASE')).toBe(false);
    expect(isStudentEventName('Ground Brief')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isStudentEventName('')).toBe(false);
  });

  it('is case-sensitive (patterns are uppercase)', () => {
    // The patterns are 'CF' and 'AIRMANSHIP' - checking startsWith behavior
    expect(isStudentEventName('cf-01')).toBe(false);
    expect(isStudentEventName('airmanship')).toBe(false);
  });
});
