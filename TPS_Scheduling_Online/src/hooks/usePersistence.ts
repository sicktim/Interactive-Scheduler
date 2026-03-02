import { useState, useEffect } from 'react';
import type { ScheduleEvent, Change, Roster } from '@/types';
import { saveState, saveWorkingCopy, loadWorkingCopy, clearWorkingCopy } from '@/utils';
import type { WorkingCopyData } from '@/utils';

export interface UsePersistenceOptions {
  workingEvents: ScheduleEvent[];
  changes: Change[];
  allEvents: ScheduleEvent[];
  roster: Roster;
  dates: string[];
  initialSelectedIds: Set<string>;
  initialNaCats: Set<string>;
  initialized: React.RefObject<boolean>;
}

export interface UsePersistenceReturn {
  savedShow: boolean;
  loadFromStorage: () => WorkingCopyData | null;
  clearStorage: () => void;
}

/**
 * Auto-save persistence hook.
 *
 * Saves working events and changes to localStorage whenever the
 * changes array updates (and initialization is complete). Shows a
 * brief "saved" indicator when changes are persisted.
 *
 * Also provides `loadFromStorage` and `clearStorage` helpers that
 * delegate to the persistence utility functions.
 */
export function usePersistence({
  workingEvents,
  changes,
  allEvents,
  roster,
  dates,
  initialSelectedIds,
  initialNaCats,
  initialized,
}: UsePersistenceOptions): UsePersistenceReturn {
  const [savedShow, setSavedShow] = useState(false);

  useEffect(() => {
    if (!initialized.current) return;
    saveState(changes, initialSelectedIds, initialNaCats, allEvents);
    saveWorkingCopy(workingEvents, changes, allEvents, roster, dates, initialSelectedIds, initialNaCats);
    if (changes.length > 0) {
      setSavedShow(true);
      const t = setTimeout(() => setSavedShow(false), 2000);
      return () => clearTimeout(t);
    }
  }, [changes]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFromStorage = (): WorkingCopyData | null => {
    return loadWorkingCopy();
  };

  const clearStorage = (): void => {
    clearWorkingCopy();
  };

  return {
    savedShow,
    loadFromStorage,
    clearStorage,
  };
}
