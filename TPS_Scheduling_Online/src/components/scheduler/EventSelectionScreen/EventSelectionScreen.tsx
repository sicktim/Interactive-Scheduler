import { useState, useMemo } from 'react';
import type { ScheduleEvent, Roster, EventClass } from '../../../types';
import { CATEGORY_COLORS, CLASS_COLORS, SECTION_COLORS, CLASS_ORDER, SELECTION_SECTION_ORDER } from '../../../constants';
import { evStart, fmtDate, classifyEvent, isStudentEventName } from '../../../utils';
import './EventSelectionScreen.css';

interface EventSelectionScreenProps {
  allEvents: ScheduleEvent[];
  roster: Roster;
  dates: string[];
  onContinue: (selectedIds: Set<string>, naCats: Set<string>) => void;
  initialSelected?: Set<string>;
  initialNaCats?: Set<string>;
}

export function EventSelectionScreen({
  allEvents, roster, dates, onContinue, initialSelected, initialNaCats,
}: EventSelectionScreenProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(initialSelected || new Set());
  const [naCats, setNaCats] = useState<Set<string>>(initialNaCats || new Set());

  const { byDateClassified, classSets } = useMemo(() => {
    const map: Record<string, Record<string, ScheduleEvent[]>> = {};
    const sets: Record<EventClass, Set<string>> = {
      'A-Class': new Set(), 'B-Class': new Set(), 'Staff': new Set(), 'Other': new Set(),
    };

    dates.forEach(d => { map[d] = {}; });

    // Pass 1: classify all events, build date|name → class lookup
    const eventClass = new Map<string, EventClass>();
    const dateNameClass = new Map<string, EventClass>();
    const studentEvents: ScheduleEvent[] = [];

    allEvents.forEach(ev => {
      if (ev.readonly || ev.section === 'NA') return;
      if (!map[ev.date]) return;

      const cls = classifyEvent(ev, roster);
      eventClass.set(ev.id, cls);

      const uName = (ev.eventName || '').toUpperCase().trim();
      if (cls !== 'Other') {
        dateNameClass.set(`${ev.date}|${uName}`, cls);
      } else if (isStudentEventName(uName)) {
        studentEvents.push(ev);
      }
    });

    // Pass 2: reclassify uncrewed student events via sibling inheritance
    studentEvents.forEach(ev => {
      const uName = (ev.eventName || '').toUpperCase().trim();
      let inherited = dateNameClass.get(`${ev.date}|${uName}`);
      if (!inherited) {
        for (const [k, v] of dateNameClass) {
          const sep = k.indexOf('|');
          if (k.substring(0, sep) === ev.date && isStudentEventName(k.substring(sep + 1)) && (v === 'A-Class' || v === 'B-Class')) {
            inherited = v;
            break;
          }
        }
      }
      if (inherited) eventClass.set(ev.id, inherited);
    });

    // Build final groupings
    allEvents.forEach(ev => {
      if (ev.readonly || ev.section === 'NA') return;
      if (!map[ev.date]) return;

      const cls = eventClass.get(ev.id) || 'Other';
      sets[cls].add(ev.id);

      const key = `${cls}|${ev.section}`;
      if (!map[ev.date][key]) map[ev.date][key] = [];
      map[ev.date][key].push(ev);
    });

    // Sort events within each group by start time
    Object.values(map).forEach(groups => {
      Object.values(groups).forEach(arr => {
        arr.sort((a, b) => (evStart(a) || 0) - (evStart(b) || 0));
      });
    });

    return { byDateClassified: map, classSets: sets };
  }, [allEvents, dates, roster]);

  const naCategoriesAvailable = useMemo(() => {
    const rosterCats = new Set(Object.keys(roster).filter(cat => roster[cat]?.length > 0));
    const ordered = Object.keys(CATEGORY_COLORS).filter(cat => rosterCats.has(cat));
    rosterCats.forEach(cat => { if (!ordered.includes(cat)) ordered.push(cat); });
    return ordered;
  }, [roster]);

  const toggleEvent = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleGroup = (evs: ScheduleEvent[]) => {
    const ids = evs.map(e => e.id);
    const allSel = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => allSel ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const toggleClass = (cls: EventClass) => {
    const ids = classSets[cls];
    if (!ids || ids.size === 0) return;
    const allSel = [...ids].every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => allSel ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const toggleNaCat = (cat: string) => {
    setNaCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const selectAll = () => {
    const all = new Set<string>();
    allEvents.forEach(ev => { if (!ev.readonly && ev.section !== 'NA') all.add(ev.id); });
    setSelectedIds(all);
    setNaCats(new Set(naCategoriesAvailable));
  };

  const isClassFullySelected = (cls: EventClass) => {
    const ids = classSets[cls];
    return ids.size > 0 && [...ids].every(id => selectedIds.has(id));
  };

  const totalSelected = selectedIds.size + naCats.size;

  return (
    <div className="selection-screen">
      <div className="app-header">
        <div>
          <h1 className="sel-title">TPS INTERACTIVE SCHEDULER</h1>
          <p className="sel-subtitle">Select events you are responsible for scheduling</p>
        </div>
        <div className="flex gap-3 items-center">
          <button onClick={selectAll} className="filter-btn">Select All</button>
          <button onClick={() => { setSelectedIds(new Set()); setNaCats(new Set()); }} className="filter-btn">Clear</button>
          <button
            onClick={() => onContinue(selectedIds, naCats)}
            disabled={totalSelected === 0}
            className="sel-continue-btn"
            style={{
              background: totalSelected > 0 ? '#2563eb' : '#374151',
              color: totalSelected > 0 ? 'white' : '#6b7280',
              cursor: totalSelected > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            Continue ({totalSelected})
          </button>
        </div>
      </div>
      <div className="selection-body">
        <p className="sel-note">
          Conflict detection checks ALL events regardless of selection.
        </p>

        {/* NON-AVAILABILITY */}
        {naCategoriesAvailable.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="selection-separator">NON-AVAILABILITY</div>
            <p className="sel-na-desc">Select crew categories to include in conflict tracking</p>
            <div className="na-category-grid">
              {naCategoriesAvailable.map(cat => {
                const catColor = CATEGORY_COLORS[cat];
                const isSelected = naCats.has(cat);
                return (
                  <div
                    key={cat}
                    className={`na-cat-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleNaCat(cat)}
                    style={isSelected && catColor ? {
                      borderColor: catColor.bg,
                      color: catColor.text,
                      background: catColor.bg + '30',
                    } : undefined}
                  >
                    {cat}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* QUICK SELECT */}
        <div style={{ marginBottom: 20 }}>
          <div className="selection-separator">QUICK SELECT</div>
          <div className="quick-select-bar">
            {CLASS_ORDER.filter(cls => classSets[cls].size > 0).map(cls => {
              const cc = CLASS_COLORS[cls];
              const active = isClassFullySelected(cls as EventClass);
              const count = classSets[cls as EventClass].size;
              const selectedCount = [...classSets[cls as EventClass]].filter(id => selectedIds.has(id)).length;
              return (
                <button
                  key={cls}
                  className="quick-select-btn"
                  onClick={() => toggleClass(cls as EventClass)}
                  style={active ? { borderColor: cc.border, color: cc.text, background: cc.bg } : undefined}
                >
                  {cls} ({selectedCount}/{count})
                </button>
              );
            })}
          </div>
        </div>

        {/* DATE SECTIONS */}
        {dates.map(date => {
          const dayGroups = byDateClassified[date];
          if (!dayGroups) return null;
          const hasEvents = Object.values(dayGroups).some(arr => arr.length > 0);
          if (!hasEvents) return null;
          const dh = fmtDate(date);

          return (
            <div key={date} className="selection-day-group">
              <div className="selection-day-header">
                <span>{dh.weekday} {dh.day} {dh.month}</span>
                <span className="sel-date-iso">{date}</span>
              </div>

              {CLASS_ORDER.map(cls => {
                const cc = CLASS_COLORS[cls];
                return SELECTION_SECTION_ORDER.map(sec => {
                  const key = `${cls}|${sec}`;
                  const evs = dayGroups[key];
                  if (!evs || evs.length === 0) return null;
                  const sc = SECTION_COLORS[sec];
                  const allSel = evs.every(e => selectedIds.has(e.id));

                  return (
                    <div key={key} className="selection-section">
                      <div
                        className={`selection-section-title ${cc.cssClass}`}
                        style={{
                          background: `linear-gradient(90deg, ${cc.bg}, ${sc.bg})`,
                          borderLeft: `3px solid ${cc.border}`,
                        }}
                        onClick={() => toggleGroup(evs)}
                      >
                        <div className={`sel-cb ${allSel ? 'checked' : ''}`}>{allSel ? '\u2713' : ''}</div>
                        <span className="sel-section-label">
                          <span style={{ color: cc.text }}>{cls.toUpperCase()}</span>
                          <span className="sel-section-sep">/</span>
                          <span style={{ color: sc?.text }}>{sec.toUpperCase()}</span>
                          <span className="sel-section-count">({evs.length})</span>
                        </span>
                      </div>
                      {evs.map(ev => {
                        const checked = selectedIds.has(ev.id);
                        return (
                          <div key={ev.id} className="sel-event-row" onClick={() => toggleEvent(ev.id)}>
                            <div className={`sel-cb ${checked ? 'checked' : ''}`}>{checked ? '\u2713' : ''}</div>
                            {ev.model && <span className="sel-model">{ev.model}</span>}
                            <span className="sel-event-name">{ev.eventName}</span>
                            <span className="sel-event-time">{ev.startTime}-{ev.endTime || '??'}</span>
                            <span className="sel-crew-preview">{ev.personnel.join(', ')}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                });
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
