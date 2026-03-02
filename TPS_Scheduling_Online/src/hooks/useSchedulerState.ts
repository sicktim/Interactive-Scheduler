import { useState, useCallback, useRef, useEffect } from 'react';
import type { ScheduleEvent, Change } from '@/types';
import type { WorkingCopyData } from '@/utils';
import { saveState, saveWorkingCopy, clearState } from '@/utils';
import type { Roster } from '@/types';

export interface UseSchedulerStateOptions {
  allEvents: ScheduleEvent[];
  roster: Roster;
  dates: string[];
  initialSelectedIds: Set<string>;
  initialNaCats: Set<string>;
  cachedWorkingState: WorkingCopyData | null;
}

export interface UseSchedulerStateReturn {
  workingEvents: ScheduleEvent[];
  changes: Change[];
  initialized: React.RefObject<boolean>;
  addPersonToEvent: (targetId: string, person: string, sourceId: string | null) => void;
  removePersonFromEvent: (eventId: string, person: string) => void;
  undoChange: (indices: number[]) => void;
  clearAllChanges: () => void;
}

/**
 * Core scheduler state management hook.
 *
 * Manages the mutable working copy of events and the raw change log.
 * Preserves the critical `initialized` ref guard pattern that prevents
 * phantom changes during React 18 batched state initialization.
 */
export function useSchedulerState({
  allEvents,
  roster,
  dates,
  initialSelectedIds,
  initialNaCats,
  cachedWorkingState,
}: UseSchedulerStateOptions): UseSchedulerStateReturn {
  const [workingEvents, setWorkingEvents] = useState<ScheduleEvent[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const initialized = useRef(false);
  const restoredFromCache = useRef(false);

  // Initialize working events -- from cache if available, otherwise from allEvents.
  // Critical: initialized ref guard prevents phantom changes during React 18 batched state init.
  useEffect(() => {
    initialized.current = false;
    if (cachedWorkingState && !restoredFromCache.current) {
      restoredFromCache.current = true;
      setWorkingEvents(cachedWorkingState.workingEvents.map(ev => ({ ...ev, personnel: [...ev.personnel] })));
      setChanges(cachedWorkingState.changes || []);
    } else {
      setWorkingEvents(allEvents.map(ev => ({ ...ev, personnel: [...ev.personnel] })));
      setChanges([]);
    }
    saveState([], initialSelectedIds, initialNaCats, allEvents);
    requestAnimationFrame(() => { initialized.current = true; });
  }, [allEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPersonToEvent = useCallback((targetId: string, person: string, sourceId: string | null) => {
    if (!initialized.current) return;

    const newChanges: Change[] = [];

    setWorkingEvents(prev => {
      const next = prev.map(ev => ({ ...ev, personnel: [...ev.personnel] }));
      const target = next.find(e => e.id === targetId);
      if (!target || target.personnel.includes(person)) return prev;

      if (sourceId) {
        const source = next.find(e => e.id === sourceId);
        if (source) {
          source.personnel = source.personnel.filter(p => p !== person);
          newChanges.push({
            type: 'remove', person, date: source.date,
            eventSection: source.section, eventModel: source.model,
            eventName: source.eventName, eventTime: source.startTime,
            eventId: source.id,
          });
        }
      }

      target.personnel.push(person);
      newChanges.push({
        type: 'add', person, date: target.date,
        eventSection: target.section, eventModel: target.model,
        eventName: target.eventName, eventTime: target.startTime,
        eventId: target.id,
      });

      return next;
    });

    if (newChanges.length > 0) {
      setChanges(c => [...c, ...newChanges]);
    }
  }, []);

  const removePersonFromEvent = useCallback((eventId: string, person: string) => {
    if (!initialized.current) return;

    setWorkingEvents(prev => {
      const next = prev.map(ev => ({ ...ev, personnel: [...ev.personnel] }));
      const event = next.find(e => e.id === eventId);
      if (!event) return prev;
      event.personnel = event.personnel.filter(p => p !== person);
      setChanges(c => [...c, {
        type: 'remove', person, date: event.date,
        eventSection: event.section, eventModel: event.model,
        eventName: event.eventName, eventTime: event.startTime,
        eventId: event.id,
      }]);
      return next;
    });
  }, []);

  const undoChange = useCallback((indices: number[]) => {
    if (!indices || indices.length === 0) return;
    const sortedDesc = [...indices].sort((a, b) => b - a);
    setWorkingEvents(prev => {
      const next = prev.map(ev => ({ ...ev, personnel: [...ev.personnel] }));
      sortedDesc.forEach(idx => {
        const ch = changes[idx];
        if (!ch) return;
        const event = next.find(e => e.id === ch.eventId);
        if (!event) return;
        if (ch.type === 'add') {
          event.personnel = event.personnel.filter(p => p !== ch.person);
        } else {
          if (!event.personnel.includes(ch.person)) event.personnel.push(ch.person);
        }
      });
      return next;
    });
    const indexSet = new Set(indices);
    setChanges(prev => prev.filter((_, i) => !indexSet.has(i)));
  }, [changes]);

  const clearAllChanges = useCallback(() => {
    setWorkingEvents(allEvents.map(ev => ({ ...ev, personnel: [...ev.originalPersonnel] })));
    setChanges([]);
    clearState();
  }, [allEvents]);

  return {
    workingEvents,
    changes,
    initialized,
    addPersonToEvent,
    removePersonFromEvent,
    undoChange,
    clearAllChanges,
  };
}
