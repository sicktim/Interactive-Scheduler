import { useState, useMemo, useEffect } from 'react';
import type { ScheduleEvent, AvailabilityEntry, ViewMode } from '@/types';
import { evStart, evEnd } from '@/utils';

export interface UseFocusModeOptions {
  workingEvents: ScheduleEvent[];
  viewMode: ViewMode;
  focusEnabled: boolean;
}

export interface UseFocusModeReturn {
  focusedEventId: string | null;
  setFocusedEvent: (id: string | null) => void;
  availabilityMap: Map<string, AvailabilityEntry[]> | null;
}

/**
 * Focus mode hook for event availability visualization.
 *
 * When a user clicks an event in the timeline, this hook computes
 * which personnel are unavailable (busy on overlapping events)
 * during that event's time slot. The availability map is consumed
 * by the PersonnelPicker to dim unavailable chips.
 */
export function useFocusMode({
  workingEvents,
  viewMode,
  focusEnabled,
}: UseFocusModeOptions): UseFocusModeReturn {
  const [focusedEventId, setFocusedEventId] = useState<string | null>(null);

  // Clear focus when leaving timeline view
  useEffect(() => {
    if (viewMode !== 'timeline') setFocusedEventId(null);
  }, [viewMode]);

  const availabilityMap = useMemo(() => {
    if (!focusedEventId || !focusEnabled) return null;
    const fev = workingEvents.find(e => e.id === focusedEventId);
    if (!fev) return null;
    const fStart = evStart(fev);
    const fEnd = evEnd(fev);
    const fDate = fev.date;

    const unavailable = new Map<string, AvailabilityEntry[]>();

    // People already on the focused event are "assigned"
    fev.personnel.forEach(person => {
      if (!unavailable.has(person)) unavailable.set(person, []);
      unavailable.get(person)!.push({
        eventName: fev.eventName, model: fev.model,
        startTime: fev.startTime, endTime: fev.endTime, assigned: true,
      });
    });

    // People on overlapping events
    workingEvents.forEach(ev => {
      if (ev.id === focusedEventId || ev.date !== fDate) return;
      const eS = evStart(ev);
      const eE = evEnd(ev);
      if (eS == null || fStart == null) return;
      if (eS < fEnd && eE > fStart) {
        ev.personnel.forEach(person => {
          if (!unavailable.has(person)) unavailable.set(person, []);
          unavailable.get(person)!.push({
            eventName: ev.eventName, model: ev.model,
            startTime: ev.startTime, endTime: ev.endTime,
          });
        });
      }
    });
    return unavailable;
  }, [focusedEventId, focusEnabled, workingEvents]);

  const setFocusedEvent = (id: string | null) => setFocusedEventId(id);

  return {
    focusedEventId,
    setFocusedEvent,
    availabilityMap,
  };
}
