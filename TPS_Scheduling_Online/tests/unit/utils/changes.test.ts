import { describe, it, expect } from 'vitest';
import { computeNetChanges } from '@/utils/changes';
import type { Change } from '@/types';

/** Helper to create a Change record */
function makeChange(overrides: Partial<Change> & { type: 'add' | 'remove'; person: string; eventId: string }): Change {
  return {
    date: '2026-02-03',
    eventSection: 'Flying',
    eventModel: 'T-38',
    eventName: 'CF-01',
    eventTime: '08:00',
    ...overrides,
  };
}

describe('computeNetChanges', () => {
  it('returns empty array for empty input', () => {
    expect(computeNetChanges([])).toEqual([]);
  });

  it('returns empty array for null input', () => {
    expect(computeNetChanges(null as unknown as Change[])).toEqual([]);
  });

  it('returns a single add instruction', () => {
    const changes: Change[] = [
      makeChange({ type: 'add', person: 'Pilot A', eventId: 'ev-1' }),
    ];
    const result = computeNetChanges(changes);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('add');
    expect(result[0].persons).toContain('Pilot A');
    expect(result[0].target).not.toBeNull();
    expect(result[0].source).toBeNull();
  });

  it('returns a single remove instruction', () => {
    const changes: Change[] = [
      makeChange({ type: 'remove', person: 'Pilot A', eventId: 'ev-1' }),
    ];
    const result = computeNetChanges(changes);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('remove');
    expect(result[0].persons).toContain('Pilot A');
    expect(result[0].source).not.toBeNull();
    expect(result[0].target).toBeNull();
  });

  it('collapses add+remove on same person/event to net zero (no instructions)', () => {
    const changes: Change[] = [
      makeChange({ type: 'add', person: 'Pilot A', eventId: 'ev-1' }),
      makeChange({ type: 'remove', person: 'Pilot A', eventId: 'ev-1' }),
    ];
    const result = computeNetChanges(changes);
    // Net zero should produce no instructions
    expect(result).toHaveLength(0);
  });

  it('creates a move instruction when remove from A and add to B', () => {
    const changes: Change[] = [
      makeChange({ type: 'remove', person: 'Pilot A', eventId: 'ev-1', eventName: 'Flight 1' }),
      makeChange({ type: 'add', person: 'Pilot A', eventId: 'ev-2', eventName: 'Flight 2' }),
    ];
    const result = computeNetChanges(changes);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('move');
    expect(result[0].persons).toContain('Pilot A');
    expect(result[0].source!.eventId).toBe('ev-1');
    expect(result[0].target!.eventId).toBe('ev-2');
  });

  it('groups multiple people in the same move', () => {
    const changes: Change[] = [
      makeChange({ type: 'remove', person: 'Pilot A', eventId: 'ev-1', eventName: 'Flight 1' }),
      makeChange({ type: 'add', person: 'Pilot A', eventId: 'ev-2', eventName: 'Flight 2' }),
      makeChange({ type: 'remove', person: 'Pilot B', eventId: 'ev-1', eventName: 'Flight 1' }),
      makeChange({ type: 'add', person: 'Pilot B', eventId: 'ev-2', eventName: 'Flight 2' }),
    ];
    const result = computeNetChanges(changes);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('move');
    expect(result[0].persons).toContain('Pilot A');
    expect(result[0].persons).toContain('Pilot B');
  });

  it('handles mix of add, remove, and move', () => {
    const changes: Change[] = [
      // Pilot A: remove from ev-1, add to ev-2 -> move
      makeChange({ type: 'remove', person: 'Pilot A', eventId: 'ev-1', eventName: 'Flight 1' }),
      makeChange({ type: 'add', person: 'Pilot A', eventId: 'ev-2', eventName: 'Flight 2' }),
      // Pilot B: just added to ev-3 -> add
      makeChange({ type: 'add', person: 'Pilot B', eventId: 'ev-3', eventName: 'Flight 3' }),
      // Pilot C: just removed from ev-4 -> remove
      makeChange({ type: 'remove', person: 'Pilot C', eventId: 'ev-4', eventName: 'Flight 4' }),
    ];
    const result = computeNetChanges(changes);
    const types = result.map(r => r.type).sort();
    expect(types).toContain('move');
    expect(types).toContain('add');
    expect(types).toContain('remove');
  });

  it('preserves rawIndices for undo capability', () => {
    const changes: Change[] = [
      makeChange({ type: 'add', person: 'Pilot A', eventId: 'ev-1' }),
    ];
    const result = computeNetChanges(changes);
    expect(result[0].rawIndices).toBeDefined();
    expect(result[0].rawIndices).toContain(0);
  });

  it('sorts results by date and firstIndex', () => {
    const changes: Change[] = [
      makeChange({ type: 'add', person: 'Pilot A', eventId: 'ev-1', date: '2026-02-04' }),
      makeChange({ type: 'add', person: 'Pilot B', eventId: 'ev-2', date: '2026-02-03' }),
    ];
    const result = computeNetChanges(changes);
    expect(result).toHaveLength(2);
    // Feb 3 should come before Feb 4
    expect(result[0].date).toBe('2026-02-03');
    expect(result[1].date).toBe('2026-02-04');
  });

  it('handles double-add as net add', () => {
    const changes: Change[] = [
      makeChange({ type: 'add', person: 'Pilot A', eventId: 'ev-1' }),
      makeChange({ type: 'add', person: 'Pilot A', eventId: 'ev-1' }),
    ];
    const result = computeNetChanges(changes);
    // net = +2, should still show as add (net > 0)
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('add');
  });
});
