import type { ScheduleEvent, Change, Roster } from '../types';
import { STORAGE_KEY, WORKING_STORAGE_KEY } from '../constants';

/** Stable event key for matching across sessions (IDs are session-specific) */
export const eventNaturalKey = (ev: ScheduleEvent): string =>
  `${ev.date}|${ev.section}|${ev.eventName}|${ev.startTime || ''}|${ev.model || ''}`;

/** Save selection + change state to localStorage */
export const saveState = (
  changes: Change[],
  selectedIds: Set<string>,
  naCats: Set<string>,
  allEvents: ScheduleEvent[],
): void => {
  try {
    const selectedKeys = allEvents
      ? [...selectedIds].map(id => {
          const ev = allEvents.find(e => e.id === id);
          return ev ? eventNaturalKey(ev) : null;
        }).filter(Boolean)
      : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      changes,
      selectedIds: [...selectedIds],
      selectedKeys,
      naCats: [...naCats],
      savedAt: new Date().toISOString(),
    }));
  } catch (_e) { /* localStorage may be full */ }
};

/** Save the full working state (events + changes + metadata) */
export const saveWorkingCopy = (
  workingEvents: ScheduleEvent[],
  changes: Change[],
  allEvents: ScheduleEvent[],
  roster: Roster,
  dates: string[],
  selectedIds: Set<string>,
  naCats: Set<string>,
): void => {
  try {
    localStorage.setItem(WORKING_STORAGE_KEY, JSON.stringify({
      workingEvents,
      changes,
      allEvents,
      roster,
      dates,
      selectedIds: [...selectedIds],
      naCats: [...naCats],
      savedAt: new Date().toISOString(),
    }));
  } catch (e) {
    console.warn('Failed to save working copy:', (e as Error).message);
  }
};

export interface WorkingCopyData {
  workingEvents: ScheduleEvent[];
  changes: Change[];
  allEvents: ScheduleEvent[];
  roster: Roster;
  dates: string[];
  selectedIds: Set<string>;
  naCats: Set<string>;
  savedAt: string;
}

/** Load working state from localStorage */
export const loadWorkingCopy = (): WorkingCopyData | null => {
  try {
    const raw = localStorage.getItem(WORKING_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.workingEvents || !data.allEvents) return null;
    return {
      workingEvents: data.workingEvents,
      changes: data.changes || [],
      allEvents: data.allEvents,
      roster: data.roster || {},
      dates: data.dates || [],
      selectedIds: new Set(data.selectedIds || []),
      naCats: new Set(data.naCats || []),
      savedAt: data.savedAt,
    };
  } catch (_e) { return null; }
};

/** Clear working copy from localStorage */
export const clearWorkingCopy = (): void => {
  try { localStorage.removeItem(WORKING_STORAGE_KEY); } catch (_e) { /* noop */ }
};

export interface SavedState {
  changes: Change[];
  selectedIds: Set<string>;
  selectedKeys: string[];
  naCats: Set<string>;
  savedAt: string;
}

/** Load selection state from localStorage */
export const loadState = (): SavedState | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      changes: data.changes || [],
      selectedIds: new Set(data.selectedIds || []),
      selectedKeys: data.selectedKeys || [],
      naCats: new Set(data.naCats || []),
      savedAt: data.savedAt,
    };
  } catch (_e) { return null; }
};

/** Clear all saved state */
export const clearState = (): void => {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_e) { /* noop */ }
  clearWorkingCopy();
};
