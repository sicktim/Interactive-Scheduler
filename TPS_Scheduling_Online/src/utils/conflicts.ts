import type { ScheduleEvent, ConflictMap, ConflictDetail } from '../types';
import { overlap } from './layout';

/** Detect all personnel conflicts across events */
export const detectConflicts = (allEvents: ScheduleEvent[]): ConflictMap => {
  // Map: person||date -> [events]
  const pdMap: Record<string, ScheduleEvent[]> = {};
  allEvents.forEach(ev => {
    ev.personnel.forEach(person => {
      const k = `${person}||${ev.date}`;
      if (!pdMap[k]) pdMap[k] = [];
      pdMap[k].push(ev);
    });
  });

  const conflicts: ConflictMap = new Map();

  Object.values(pdMap).forEach(evList => {
    if (evList.length < 2) return;
    for (let i = 0; i < evList.length; i++) {
      for (let j = i + 1; j < evList.length; j++) {
        if (!overlap(evList[i], evList[j])) continue;
        const common = evList[i].personnel.filter(p => evList[j].personnel.includes(p));
        common.forEach(person => {
          const addConflict = (evId: string, entry: ConflictDetail): void => {
            if (!conflicts.has(evId)) conflicts.set(evId, new Map());
            const cm = conflicts.get(evId)!;
            if (!cm.has(person)) cm.set(person, []);
            const arr = cm.get(person)!;
            const dup = arr.some(c =>
              c.eventName === entry.eventName &&
              c.startTime === entry.startTime &&
              c.endTime === entry.endTime
            );
            if (!dup) arr.push(entry);
          };
          // Record on event i
          addConflict(evList[i].id, {
            eventName: evList[j].eventName,
            model: evList[j].model,
            section: evList[j].section,
            startTime: evList[j].startTime,
            endTime: evList[j].endTime,
          });
          // Record on event j
          addConflict(evList[j].id, {
            eventName: evList[i].eventName,
            model: evList[i].model,
            section: evList[i].section,
            startTime: evList[i].startTime,
            endTime: evList[i].endTime,
          });
        });
      }
    }
  });

  return conflicts;
};

/** Get human-readable conflict text for a person on a specific event */
export const getConflictText = (
  eventId: string,
  person: string,
  conflicts: ConflictMap,
): string | null => {
  const ec = conflicts.get(eventId);
  if (!ec) return null;
  const pc = ec.get(person);
  if (!pc || pc.length === 0) return null;
  return pc.map(c => {
    const m = c.model ? `${c.model} ` : '';
    return `${m}${c.eventName} (${c.startTime}-${c.endTime || '??'})`;
  }).join('; ');
};

/** Check if a specific person has a conflict on a given event */
export const hasConflict = (
  eventId: string,
  person: string,
  conflicts: ConflictMap,
): boolean => {
  const ec = conflicts.get(eventId);
  return !!(ec && ec.has(person));
};

/** Count distinct personnel with conflicts on an event */
export const eventConflictCount = (eventId: string, conflicts: ConflictMap): number => {
  const ec = conflicts.get(eventId);
  return ec ? ec.size : 0;
};
