import { useState, useMemo, useCallback } from 'react';
import type { ScheduleEvent, Roster, ConflictMap, AvailabilityEntry } from '../../../types';
import { PersonnelChip } from '../../shared/PersonnelChip/PersonnelChip';
import './PersonnelPicker.css';

interface PersonnelPickerProps {
  roster: Roster;
  allEvents: ScheduleEvent[];
  conflicts: ConflictMap;
  onDS?: (name: string, eventId?: string) => void;
  onDE?: () => void;
  onShowTooltip?: (text: string, rect: DOMRect) => void;
  onHideTooltip?: () => void;
  focusedAvailability?: Map<string, AvailabilityEntry[]> | null;
}

export function PersonnelPicker({
  roster, allEvents, conflicts,
  onDS, onDE, onShowTooltip, onHideTooltip,
  focusedAvailability,
}: PersonnelPickerProps) {
  const [activeTabs, setActiveTabs] = useState<Set<string>>(new Set(['All']));
  const [search, setSearch] = useState('');

  const cats = useMemo(() => Object.keys(roster).filter(k => roster[k]?.length > 0), [roster]);

  const toggleTab = useCallback((cat: string) => {
    setActiveTabs(prev => {
      if (cat === 'All') return new Set(['All']);
      const next = new Set(prev);
      next.delete('All');
      if (next.has(cat)) {
        next.delete(cat);
        if (next.size === 0) return new Set(['All']);
      } else {
        next.add(cat);
        if (cats.every(c => next.has(c))) return new Set(['All']);
      }
      return next;
    });
  }, [cats]);

  const busySet = useMemo(() => {
    const s = new Set<string>();
    allEvents.forEach(ev => ev.personnel.forEach(p => s.add(p)));
    return s;
  }, [allEvents]);

  const personConflictSummary = useMemo(() => {
    const summary = new Map<string, Set<string>>();
    conflicts.forEach((personMap) => {
      personMap.forEach((confList, person) => {
        if (!summary.has(person)) summary.set(person, new Set());
        const s = summary.get(person)!;
        confList.forEach(c => {
          const m = c.model ? `${c.model} ` : '';
          s.add(`${m}${c.eventName} (${c.startTime}-${c.endTime || '??'})`);
        });
      });
    });
    const result = new Map<string, string>();
    summary.forEach((detailSet, person) => {
      result.set(person, [...detailSet].join('; '));
    });
    return result;
  }, [conflicts]);

  const people = useMemo(() => {
    let list: Array<{ name: string; category: string }>;
    if (activeTabs.has('All')) {
      list = Object.entries(roster).flatMap(([cat, members]) =>
        members.map(n => ({ name: n, category: cat }))
      );
    } else {
      list = [];
      activeTabs.forEach(cat => {
        (roster[cat] || []).forEach(n => list.push({ name: n, category: cat }));
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [roster, activeTabs, search]);

  return (
    <div className="picker-panel">
      <div className="picker-header">
        <span className="picker-label">Picker</span>
        <div className="picker-tabs">
          <div
            className={`picker-tab ${activeTabs.has('All') ? 'active' : ''}`}
            onClick={() => toggleTab('All')}
          >
            All
          </div>
          {cats.map(c => (
            <div
              key={c}
              className={`picker-tab ${activeTabs.has(c) ? 'active' : ''}`}
              onClick={() => toggleTab(c)}
            >
              {c}
            </div>
          ))}
        </div>
        <span className="picker-legend">
          <span className="picker-busy-dot" />
          assigned
        </span>
        <input
          className="picker-search"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="picker-body">
        {people.map(p => {
          const isUnavailable = focusedAvailability?.has(p.name) ?? false;
          const unavailText = isUnavailable
            ? focusedAvailability!.get(p.name)!.map(c =>
                `${c.assigned ? 'Assigned: ' : 'Busy: '}${c.model ? c.model + ' ' : ''}${c.eventName} (${c.startTime}-${c.endTime || '??'})`
              ).join('\n')
            : null;
          return (
            <PersonnelChip
              key={p.name}
              name={p.name}
              roster={roster}
              conflictText={isUnavailable ? unavailText : (personConflictSummary.get(p.name) || null)}
              inPicker
              isBusy={busySet.has(p.name)}
              isUnavailable={isUnavailable}
              onDragStart={onDS}
              onDragEnd={onDE}
              onShowTooltip={onShowTooltip}
              onHideTooltip={onHideTooltip}
            />
          );
        })}
        {people.length === 0 && <span className="picker-empty">No results</span>}
      </div>
    </div>
  );
}
