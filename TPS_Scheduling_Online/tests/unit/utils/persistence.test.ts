import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  eventNaturalKey,
  saveState,
  loadState,
  clearState,
  saveWorkingCopy,
  loadWorkingCopy,
  clearWorkingCopy,
} from '@/utils/persistence';
import { STORAGE_KEY, WORKING_STORAGE_KEY } from '@/constants';
import type { ScheduleEvent, Change, Roster } from '@/types';

/** Helper to create a minimal ScheduleEvent */
function makeEvent(overrides: Partial<ScheduleEvent> & { id: string }): ScheduleEvent {
  return {
    section: 'Flying',
    date: '2026-02-03',
    model: 'T-38',
    eventName: 'CF-01',
    startTime: '08:00',
    endTime: '10:00',
    etd: null,
    eta: null,
    personnel: ['Pilot A'],
    originalPersonnel: ['Pilot A'],
    notes: null,
    readonly: false,
    ...overrides,
  };
}

describe('eventNaturalKey', () => {
  it('generates a stable key from event fields', () => {
    const ev = makeEvent({ id: 'ev-1', date: '2026-02-03', section: 'Flying', eventName: 'CF-01', startTime: '08:00', model: 'T-38' });
    const key = eventNaturalKey(ev);
    expect(key).toBe('2026-02-03|Flying|CF-01|08:00|T-38');
  });

  it('generates consistent keys for same event data', () => {
    const ev1 = makeEvent({ id: 'ev-1' });
    const ev2 = makeEvent({ id: 'ev-2' }); // different ID, same data
    expect(eventNaturalKey(ev1)).toBe(eventNaturalKey(ev2));
  });

  it('generates different keys for different events', () => {
    const ev1 = makeEvent({ id: 'ev-1', eventName: 'CF-01' });
    const ev2 = makeEvent({ id: 'ev-2', eventName: 'CF-02' });
    expect(eventNaturalKey(ev1)).not.toBe(eventNaturalKey(ev2));
  });

  it('handles null model as empty string', () => {
    const ev = makeEvent({ id: 'ev-1', model: null });
    const key = eventNaturalKey(ev);
    expect(key).toBe('2026-02-03|Flying|CF-01|08:00|');
  });

  it('handles null startTime as empty string', () => {
    const ev = makeEvent({ id: 'ev-1', startTime: '' });
    const key = eventNaturalKey(ev);
    expect(key).toContain('||');
  });
});

describe('saveState / loadState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads state round-trip', () => {
    const changes: Change[] = [
      {
        type: 'add', person: 'Pilot A', date: '2026-02-03',
        eventSection: 'Flying', eventModel: 'T-38', eventName: 'CF-01',
        eventTime: '08:00', eventId: 'ev-1',
      },
    ];
    const selectedIds = new Set(['ev-1', 'ev-2']);
    const naCats = new Set(['Leave']);
    const allEvents = [makeEvent({ id: 'ev-1' }), makeEvent({ id: 'ev-2' })];

    saveState(changes, selectedIds, naCats, allEvents);
    const loaded = loadState();

    expect(loaded).not.toBeNull();
    expect(loaded!.changes).toEqual(changes);
    expect(loaded!.selectedIds).toBeInstanceOf(Set);
    expect(loaded!.selectedIds.has('ev-1')).toBe(true);
    expect(loaded!.selectedIds.has('ev-2')).toBe(true);
    expect(loaded!.naCats).toBeInstanceOf(Set);
    expect(loaded!.naCats.has('Leave')).toBe(true);
    expect(loaded!.savedAt).toBeDefined();
  });

  it('returns null when nothing is saved', () => {
    expect(loadState()).toBeNull();
  });

  it('includes selectedKeys with natural keys', () => {
    const ev1 = makeEvent({ id: 'ev-1' });
    saveState([], new Set(['ev-1']), new Set(), [ev1]);
    const loaded = loadState();
    expect(loaded!.selectedKeys).toHaveLength(1);
    expect(loaded!.selectedKeys[0]).toBe(eventNaturalKey(ev1));
  });

  it('saves to the correct localStorage key', () => {
    saveState([], new Set(), new Set(), []);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});

describe('clearState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes saved state from localStorage', () => {
    saveState([], new Set(), new Set(), []);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    clearState();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('also clears working copy', () => {
    const ev = makeEvent({ id: 'ev-1' });
    saveWorkingCopy([ev], [], [ev], {}, ['2026-02-03'], new Set(), new Set());
    expect(localStorage.getItem(WORKING_STORAGE_KEY)).not.toBeNull();
    clearState();
    expect(localStorage.getItem(WORKING_STORAGE_KEY)).toBeNull();
  });
});

describe('saveWorkingCopy / loadWorkingCopy', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads working copy round-trip', () => {
    const ev = makeEvent({ id: 'ev-1' });
    const roster: Roster = { 'FTC-A': ['Pilot A'] };
    const dates = ['2026-02-03', '2026-02-04'];

    saveWorkingCopy([ev], [], [ev], roster, dates, new Set(['ev-1']), new Set(['Leave']));
    const loaded = loadWorkingCopy();

    expect(loaded).not.toBeNull();
    expect(loaded!.workingEvents).toHaveLength(1);
    expect(loaded!.workingEvents[0].id).toBe('ev-1');
    expect(loaded!.allEvents).toHaveLength(1);
    expect(loaded!.roster).toEqual(roster);
    expect(loaded!.dates).toEqual(dates);
    expect(loaded!.selectedIds).toBeInstanceOf(Set);
    expect(loaded!.selectedIds.has('ev-1')).toBe(true);
    expect(loaded!.naCats).toBeInstanceOf(Set);
    expect(loaded!.naCats.has('Leave')).toBe(true);
    expect(loaded!.savedAt).toBeDefined();
  });

  it('returns null when no working copy is saved', () => {
    expect(loadWorkingCopy()).toBeNull();
  });

  it('saves to the correct localStorage key', () => {
    const ev = makeEvent({ id: 'ev-1' });
    saveWorkingCopy([ev], [], [ev], {}, [], new Set(), new Set());
    expect(localStorage.getItem(WORKING_STORAGE_KEY)).not.toBeNull();
  });
});

describe('clearWorkingCopy', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes working copy from localStorage', () => {
    const ev = makeEvent({ id: 'ev-1' });
    saveWorkingCopy([ev], [], [ev], {}, [], new Set(), new Set());
    expect(localStorage.getItem(WORKING_STORAGE_KEY)).not.toBeNull();
    clearWorkingCopy();
    expect(localStorage.getItem(WORKING_STORAGE_KEY)).toBeNull();
  });
});

describe('corrupt data recovery', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadState returns null for corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json!!!');
    expect(loadState()).toBeNull();
  });

  it('loadWorkingCopy returns null for corrupt JSON', () => {
    localStorage.setItem(WORKING_STORAGE_KEY, '{corrupt data}}}');
    expect(loadWorkingCopy()).toBeNull();
  });

  it('loadWorkingCopy returns null when required fields are missing', () => {
    localStorage.setItem(WORKING_STORAGE_KEY, JSON.stringify({ changes: [] }));
    // Missing workingEvents and allEvents -> should return null
    expect(loadWorkingCopy()).toBeNull();
  });

  it('loadState returns defaults for missing fields', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({}));
    const loaded = loadState();
    expect(loaded).not.toBeNull();
    expect(loaded!.changes).toEqual([]);
    expect(loaded!.selectedIds).toBeInstanceOf(Set);
    expect(loaded!.selectedIds.size).toBe(0);
  });

  it('saveState handles localStorage being full gracefully', () => {
    // Mock localStorage.setItem to throw
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = vi.fn(() => {
      throw new Error('QuotaExceededError');
    });

    // Should not throw
    expect(() => {
      saveState([], new Set(), new Set(), []);
    }).not.toThrow();

    localStorage.setItem = originalSetItem;
  });
});
