import { describe, it, expect } from 'vitest';
import { evStart, evEnd, visualEnd, overlap, buildLayout, estimateHeight } from '@/utils/layout';
import { TIMELINE_END } from '@/constants';
import type { ScheduleEvent } from '@/types';

/** Helper to create a minimal ScheduleEvent for testing.
 *  Uses `in` check instead of `??` so that explicit `null` overrides are preserved. */
function makeEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id: overrides.id ?? 'test-1',
    section: overrides.section ?? 'Flying',
    date: overrides.date ?? '2026-02-03',
    model: overrides.model ?? 'T-38',
    eventName: overrides.eventName ?? 'Test Event',
    startTime: 'startTime' in overrides ? overrides.startTime as string : '08:00',
    endTime: 'endTime' in overrides ? overrides.endTime as string | null : '10:00',
    etd: overrides.etd ?? null,
    eta: overrides.eta ?? null,
    personnel: overrides.personnel ?? ['Pilot A'],
    originalPersonnel: overrides.originalPersonnel ?? ['Pilot A'],
    notes: overrides.notes ?? null,
    readonly: overrides.readonly ?? false,
  };
}

describe('evStart', () => {
  it('converts event startTime to minutes', () => {
    const ev = makeEvent({ startTime: '08:00' });
    expect(evStart(ev)).toBe(480);
  });

  it('returns null for event with no valid startTime', () => {
    const ev = makeEvent({ startTime: '' });
    expect(evStart(ev)).toBeNull();
  });

  it('handles times at different hours', () => {
    expect(evStart(makeEvent({ startTime: '06:00' }))).toBe(360);
    expect(evStart(makeEvent({ startTime: '14:30' }))).toBe(870);
  });
});

describe('evEnd', () => {
  it('converts event endTime to minutes', () => {
    const ev = makeEvent({ startTime: '08:00', endTime: '10:00' });
    expect(evEnd(ev)).toBe(600);
  });

  it('falls back to start+60 when endTime is null', () => {
    const ev = makeEvent({ startTime: '08:00', endTime: null });
    expect(evEnd(ev)).toBe(540); // 480 + 60
  });

  it('falls back to TIMELINE_END when both times are null', () => {
    const ev = makeEvent({ startTime: '', endTime: null });
    expect(evEnd(ev)).toBe(TIMELINE_END);
  });
});

describe('visualEnd', () => {
  it('returns evEnd for wide-enough events', () => {
    // An event spanning 08:00-14:00 (6 hours = 360 min) is definitely wide enough
    const ev = makeEvent({ startTime: '08:00', endTime: '14:00' });
    expect(visualEnd(ev)).toBe(evEnd(ev));
  });

  it('expands short events to account for min-width', () => {
    // A very short event (08:00-08:15 = 15 min) would be expanded
    const ev = makeEvent({ startTime: '08:00', endTime: '08:15' });
    const ve = visualEnd(ev);
    expect(ve).toBeGreaterThan(495); // Should be more than 08:15 = 495 min
  });

  it('returns evEnd when start is null', () => {
    const ev = makeEvent({ startTime: '', endTime: null });
    expect(visualEnd(ev)).toBe(evEnd(ev));
  });
});

describe('overlap', () => {
  it('detects overlapping events', () => {
    const a = makeEvent({ startTime: '08:00', endTime: '10:00' });
    const b = makeEvent({ startTime: '09:00', endTime: '11:00' });
    expect(overlap(a, b)).toBe(true);
  });

  it('detects when one event contains another', () => {
    const a = makeEvent({ startTime: '08:00', endTime: '12:00' });
    const b = makeEvent({ startTime: '09:00', endTime: '10:00' });
    expect(overlap(a, b)).toBe(true);
  });

  it('returns false for non-overlapping events', () => {
    const a = makeEvent({ startTime: '08:00', endTime: '09:00' });
    const b = makeEvent({ startTime: '10:00', endTime: '11:00' });
    expect(overlap(a, b)).toBe(false);
  });

  it('returns false for adjacent events (end of one = start of another)', () => {
    const a = makeEvent({ startTime: '08:00', endTime: '09:00' });
    const b = makeEvent({ startTime: '09:00', endTime: '10:00' });
    expect(overlap(a, b)).toBe(false);
  });

  it('returns false when start time is null', () => {
    const a = makeEvent({ startTime: '' });
    const b = makeEvent({ startTime: '10:00', endTime: '11:00' });
    expect(overlap(a, b)).toBe(false);
  });

  it('is symmetric: overlap(a,b) === overlap(b,a)', () => {
    const a = makeEvent({ startTime: '08:00', endTime: '10:00' });
    const b = makeEvent({ startTime: '09:00', endTime: '11:00' });
    expect(overlap(a, b)).toBe(overlap(b, a));
  });
});

describe('buildLayout', () => {
  it('returns empty layout for empty array', () => {
    const result = buildLayout([]);
    expect(result.evMap).toEqual({});
    expect(result.total).toBe(0);
  });

  it('assigns a single event to lane 0', () => {
    const ev = makeEvent({ id: 'ev-1' });
    const result = buildLayout([ev]);
    expect(result.evMap['ev-1']).toBeDefined();
    expect(result.evMap['ev-1'].top).toBe(0);
    expect(result.evMap['ev-1'].height).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it('puts non-overlapping events in the same lane', () => {
    const ev1 = makeEvent({ id: 'ev-1', startTime: '08:00', endTime: '09:00' });
    const ev2 = makeEvent({ id: 'ev-2', startTime: '11:00', endTime: '12:00' });
    const result = buildLayout([ev1, ev2]);
    // Both should have same top (lane 0) since they don't overlap
    expect(result.evMap['ev-1'].top).toBe(result.evMap['ev-2'].top);
  });

  it('places overlapping events in different lanes', () => {
    const ev1 = makeEvent({ id: 'ev-1', startTime: '08:00', endTime: '10:00' });
    const ev2 = makeEvent({ id: 'ev-2', startTime: '09:00', endTime: '11:00' });
    const result = buildLayout([ev1, ev2]);
    expect(result.evMap['ev-1'].top).not.toBe(result.evMap['ev-2'].top);
  });

  it('handles three overlapping events in three lanes', () => {
    const ev1 = makeEvent({ id: 'ev-1', startTime: '08:00', endTime: '11:00' });
    const ev2 = makeEvent({ id: 'ev-2', startTime: '08:30', endTime: '11:30' });
    const ev3 = makeEvent({ id: 'ev-3', startTime: '09:00', endTime: '12:00' });
    const result = buildLayout([ev1, ev2, ev3]);
    const tops = [
      result.evMap['ev-1'].top,
      result.evMap['ev-2'].top,
      result.evMap['ev-3'].top,
    ];
    // All three should have different top values
    const unique = new Set(tops);
    expect(unique.size).toBe(3);
  });

  it('total height is positive for events', () => {
    const ev = makeEvent({ id: 'ev-1' });
    const result = buildLayout([ev]);
    expect(result.total).toBeGreaterThan(0);
  });
});

describe('estimateHeight', () => {
  it('returns at least 40px (minimum)', () => {
    const ev = makeEvent({ personnel: [] });
    expect(estimateHeight(ev)).toBeGreaterThanOrEqual(40);
  });

  it('returns reasonable height for event with crew', () => {
    const ev = makeEvent({ personnel: ['A', 'B', 'C', 'D'] });
    const h = estimateHeight(ev);
    expect(h).toBeGreaterThanOrEqual(40);
    expect(h).toBeLessThan(500); // sanity check
  });

  it('increases height with more personnel', () => {
    const evSmall = makeEvent({ personnel: ['A'] });
    const evLarge = makeEvent({ personnel: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] });
    expect(estimateHeight(evLarge)).toBeGreaterThanOrEqual(estimateHeight(evSmall));
  });

  it('adds height for flying events with etd and eta', () => {
    const evFlying = makeEvent({
      section: 'Flying',
      etd: '08:30',
      eta: '09:30',
      personnel: ['A'],
    });
    const evGround = makeEvent({
      section: 'Ground',
      etd: null,
      eta: null,
      personnel: ['A'],
    });
    // Flying with etd/eta should have extra height for the time display
    expect(estimateHeight(evFlying)).toBeGreaterThanOrEqual(estimateHeight(evGround));
  });
});
