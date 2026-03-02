import type { ScheduleEvent, Roster, BatchResponse, SheetReturn } from '../types';
import { ACADEMICS_GROUP_MAP, STAFF_CATEGORIES } from '../constants';
import { mkId } from './id';
import { isValidName } from './display';

/** Transform sheet-return format (used by sample data) into ScheduleEvents */
export const transformSheetReturn = (sheet: SheetReturn, date: string): ScheduleEvent[] => {
  const events: ScheduleEvent[] = [];
  if (!sheet || !sheet.schedule) return events;

  sheet.schedule.forEach(item => {
    const sec = item.section;
    const personnel = (item.personnel || []).filter(isValidName).map(p => p.trim());

    if (sec === 'Supervision' || sec === 'Academics') {
      events.push({
        id: mkId(), section: sec as ScheduleEvent['section'], date,
        model: null,
        eventName: sec === 'Supervision' ? item.details.duty! : item.details.eventName!,
        startTime: item.details.startTime || item.time,
        endTime: item.details.endTime || null,
        etd: null, eta: null,
        personnel: [...personnel],
        originalPersonnel: [...personnel],
        notes: null, readonly: true,
      });
    } else if (sec === 'Flying') {
      events.push({
        id: mkId(), section: 'Flying', date,
        model: (item.details.model || '').trim(),
        eventName: item.details.eventName || '',
        startTime: item.details.briefTime || item.time,
        endTime: item.details.debriefEnd || null,
        etd: item.details.etd || null,
        eta: item.details.eta || null,
        personnel: [...personnel],
        originalPersonnel: [...personnel],
        notes: item.details.notes === 'FALSE' ? null : item.details.notes || null,
        readonly: false,
      });
    } else if (sec === 'Ground') {
      events.push({
        id: mkId(), section: 'Ground', date,
        model: null,
        eventName: item.details.eventName || '',
        startTime: item.details.startTime || item.time,
        endTime: item.details.endTime || null,
        etd: null, eta: null,
        personnel: [...personnel],
        originalPersonnel: [...personnel],
        notes: item.details.notes || null, readonly: false,
      });
    } else if (sec === 'NA') {
      events.push({
        id: mkId(), section: 'NA', date,
        model: null,
        eventName: item.details.reason || 'NA',
        startTime: item.details.startTime || item.time,
        endTime: item.details.endTime || null,
        etd: null, eta: null,
        personnel: [...personnel],
        originalPersonnel: [...personnel],
        notes: null, readonly: false,
      });
    }
  });
  return events;
};

/** Transform batch API response into ScheduleEvents */
export const transformBatchData = (batchJson: BatchResponse, roster: Roster): ScheduleEvent[] => {
  const all: ScheduleEvent[] = [];
  if (!batchJson || !batchJson.days) return all;

  batchJson.days.forEach(dayData => {
    const date = dayData.isoDate;
    const raw = dayData.data;

    if (raw.flying) {
      raw.flying.forEach(row => {
        const briefTime = row[1];
        const eventName = row[5];
        if (!briefTime || !eventName || eventName === 'Event') return;
        const crew = row.slice(6, 15).filter(isValidName).map(c => c.trim());
        all.push({
          id: mkId(), section: 'Flying', date,
          model: (row[0] || '').trim(),
          eventName,
          startTime: briefTime,
          endTime: row[4],
          etd: row[2], eta: row[3],
          personnel: crew,
          originalPersonnel: [...crew],
          notes: (row[15] && row[15] !== 'FALSE') ? row[15] : null,
          readonly: false,
        });
      });
    }

    if (raw.ground) {
      raw.ground.forEach(row => {
        const evName = row[0];
        const start = row[1];
        if (!evName || !start || evName === 'Events') return;
        const people = row.slice(3, 10).filter(isValidName).map(p => p.trim());
        all.push({
          id: mkId(), section: 'Ground', date,
          model: null, eventName: evName,
          startTime: start, endTime: row[2],
          etd: null, eta: null,
          personnel: people,
          originalPersonnel: [...people],
          notes: (row[10] && row[10] !== 'FALSE') ? row[10] : null,
          readonly: false,
        });
      });
    }

    if (raw.na) {
      raw.na.forEach(row => {
        const reason = row[0];
        const start = row[1];
        if (!reason || !start || reason === 'Reason') return;
        const people = row.slice(3).filter(isValidName).map(p => p.trim());
        all.push({
          id: mkId(), section: 'NA', date,
          model: null, eventName: reason,
          startTime: start, endTime: row[2],
          etd: null, eta: null,
          personnel: people,
          originalPersonnel: [...people],
          notes: null, readonly: false,
        });
      });
    }

    if (raw.supervision) {
      raw.supervision.forEach(row => {
        const duty = row[0];
        if (!duty || duty === 'Supervision' || !duty.trim()) return;
        for (let i = 1; i < row.length - 2; i += 3) {
          const poc = row[i];
          if (poc && poc.trim() && isValidName(poc)) {
            all.push({
              id: mkId(), section: 'Supervision', date,
              model: null, eventName: duty.trim(),
              startTime: row[i + 1], endTime: row[i + 2],
              etd: null, eta: null,
              personnel: [poc.trim()],
              originalPersonnel: [poc.trim()],
              notes: null, readonly: true,
            });
          }
        }
      });
    }

    if (raw.academics) {
      raw.academics.forEach(row => {
        const group = row[0];
        const start = row[1];
        if (!group || !start || group === 'Academics') return;
        const cat = ACADEMICS_GROUP_MAP[group.trim()];
        const people = (cat && roster[cat]) || [];
        all.push({
          id: mkId(), section: 'Academics', date,
          model: null, eventName: `${group} Academics`,
          startTime: start, endTime: row[2],
          etd: null, eta: null,
          personnel: [...people],
          originalPersonnel: [...people],
          notes: null, readonly: true,
        });
      });
    }
  });

  return all;
};

/** Returns true if name appears in any staff roster category */
export const isStaff = (name: string, roster: Roster): boolean => {
  if (!name || !roster) return false;
  return STAFF_CATEGORIES.some(cat =>
    (roster[cat] || []).some(rName => rName.trim() === name.trim())
  );
};

/** Merge duplicate events (same name/time/model) combining their crew lists */
export const mergeDuplicateEvents = (events: ScheduleEvent[], roster: Roster): ScheduleEvent[] => {
  if (!events || events.length === 0) return events;

  const mergeableEvents: ScheduleEvent[] = [];
  events.forEach(ev => {
    if (ev.readonly || ev.section === 'NA' || ev.section === 'Supervision' || ev.section === 'Academics') {
      // pass-through: not mergeable
    } else {
      mergeableEvents.push(ev);
    }
  });

  // Phase 1: Group by base key WITHOUT personnel[0]
  const baseGroups = new Map<string, ScheduleEvent[]>();
  mergeableEvents.forEach(ev => {
    let key: string;
    if (ev.section === 'Flying') {
      key = [ev.date, ev.section, (ev.model || '').trim(), (ev.eventName || '').trim(),
        (ev.startTime || ''), (ev.endTime || ''), (ev.etd || ''), (ev.eta || '')].join('||');
    } else {
      key = [ev.date, ev.section, (ev.eventName || '').trim(),
        (ev.startTime || ''), (ev.endTime || '')].join('||');
    }
    if (!baseGroups.has(key)) baseGroups.set(key, []);
    baseGroups.get(key)!.push(ev);
  });

  // Phase 2: Within each base group, check distinct leads to decide merge strategy
  const mergedById = new Map<string, ScheduleEvent>();
  const removedIds = new Set<string>();

  const getLead = (ev: ScheduleEvent): string | null => {
    if (!ev.personnel || ev.personnel.length === 0) return null;
    return ev.personnel[0];
  };

  const mergeGroup = (group: ScheduleEvent[]): void => {
    if (group.length <= 1) return;

    let primaryIdx = 0;
    for (let i = 0; i < group.length; i++) {
      const lead = getLead(group[i]);
      if (lead && isStaff(lead, roster)) { primaryIdx = i; break; }
    }
    const primary = group[primaryIdx];

    const lead = getLead(primary);
    const staffLead = lead && isStaff(lead, roster) ? lead : null;
    const seen = new Set<string>();
    const combinedPersonnel: string[] = [];
    if (staffLead) {
      combinedPersonnel.push(staffLead);
      seen.add(staffLead);
    }
    (primary.personnel || []).forEach(person => {
      if (!seen.has(person)) { combinedPersonnel.push(person); seen.add(person); }
    });
    group.forEach((ev, i) => {
      if (i === primaryIdx) return;
      (ev.personnel || []).forEach(person => {
        if (!seen.has(person)) { combinedPersonnel.push(person); seen.add(person); }
      });
    });

    const noteSet = new Set<string>();
    group.forEach(ev => { if (ev.notes && ev.notes.trim()) noteSet.add(ev.notes.trim()); });
    const mergedNotes = noteSet.size > 0 ? [...noteSet].join('; ') : primary.notes;

    let mergedEtd = primary.etd;
    let mergedEta = primary.eta;
    let mergedEndTime = primary.endTime;
    if (primary.section === 'Flying') {
      group.forEach(ev => {
        if (!mergedEtd && ev.etd) mergedEtd = ev.etd;
        if (!mergedEta && ev.eta) mergedEta = ev.eta;
        if (!mergedEndTime && ev.endTime) mergedEndTime = ev.endTime;
      });
    }

    mergedById.set(primary.id, {
      ...primary, etd: mergedEtd, eta: mergedEta, endTime: mergedEndTime,
      personnel: combinedPersonnel, originalPersonnel: [...combinedPersonnel], notes: mergedNotes,
    });
    group.forEach((ev, i) => { if (i !== primaryIdx) removedIds.add(ev.id); });
  };

  baseGroups.forEach((group) => {
    if (group.length <= 1) return;

    const leads = new Set<string>();
    group.forEach(ev => {
      const lead = getLead(ev);
      if (lead) leads.add(lead);
    });

    if (leads.size <= 1) {
      mergeGroup(group);
    } else {
      const subGroups = new Map<string, ScheduleEvent[]>();
      const noLeadEvents: ScheduleEvent[] = [];

      group.forEach(ev => {
        const lead = getLead(ev);
        if (lead) {
          if (!subGroups.has(lead)) subGroups.set(lead, []);
          subGroups.get(lead)!.push(ev);
        } else {
          noLeadEvents.push(ev);
        }
      });

      if (noLeadEvents.length > 0 && subGroups.size > 0) {
        const firstKey = subGroups.keys().next().value!;
        noLeadEvents.forEach(ev => subGroups.get(firstKey)!.push(ev));
      }

      subGroups.forEach((subGroup) => {
        mergeGroup(subGroup);
      });
    }
  });

  // Rebuild result preserving original order
  const result: ScheduleEvent[] = [];
  events.forEach(ev => {
    if (removedIds.has(ev.id)) return;
    if (mergedById.has(ev.id)) result.push(mergedById.get(ev.id)!);
    else result.push(ev);
  });
  return result;
};
