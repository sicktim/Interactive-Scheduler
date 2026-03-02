import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { ScheduleEvent, Roster, RainbowSelection } from '../../../types';
import { RAINBOW_COL_WIDTH, RAINBOW_FILTERS, RB_BAR_CLASS, ROSTER_ORDER, TIMELINE_START, TIMELINE_RANGE } from '../../../constants';
import { timeToMinutes, timePct, minutesToTime, fmtDate } from '../../../utils';
import './RainbowView.css';

interface RainbowViewProps {
  workingEvents: ScheduleEvent[];
  roster: Roster;
  dates: string[];
}

function RainbowModal({ event, onClose }: { event: RainbowModalEvent | null; onClose: () => void }) {
  if (!event) return null;
  const secColors: Record<string, [string, string]> = {
    Flying: ['green', '#10b981'], Ground: ['yellow', '#f59e0b'],
    NA: ['red', '#ef4444'], Supervision: ['purple', '#8b5cf6'], Academics: ['blue', '#3b82f6'],
  };
  const [, cHex] = secColors[event.section] || ['blue', '#3b82f6'];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold px-3 py-1 rounded" style={{ borderLeft: `4px solid ${cHex}`, color: cHex }}>{event.title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl">&times;</button>
        </div>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="rb-modal-info-box flex-1">
              <div className="rb-modal-label">Time</div>
              <div className="rb-modal-value">{event.start || '?'} – {event.end || '?'}</div>
            </div>
            <div className="rb-modal-info-box flex-1">
              <div className="rb-modal-label">Section</div>
              <div className="rb-modal-value">{event.section}</div>
            </div>
          </div>
          {event.etd && event.eta && (
            <div className="rb-modal-info-box">
              <div className="rb-modal-label">Flight Window</div>
              <div className="rb-modal-value">ETD {event.etd} — ETA {event.eta}</div>
            </div>
          )}
          {event.personnel && event.personnel.length > 0 && (
            <div className="rb-modal-info-box">
              <div className="rb-modal-label">Personnel ({event.personnel.length})</div>
              <div className="rb-modal-personnel">{event.personnel.join(', ')}</div>
            </div>
          )}
        </div>
        <button onClick={onClose} className="rb-modal-close-btn">Close</button>
      </div>
    </div>
  );
}

function RainbowFilterModal({ isOpen, onClose, roster, currentSelection, onApply }: {
  isOpen: boolean; onClose: () => void; roster: Roster;
  currentSelection: Set<string> | null; onApply: (sel: Set<string>) => void;
}) {
  const [search, setSearch] = useState('');
  const [tempSel, setTempSel] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setTempSel(new Set(currentSelection || Object.values(roster).flat()));
      setSearch('');
    }
  }, [isOpen, currentSelection, roster]);

  const filteredRoster = useMemo(() => {
    if (!search) return roster;
    const lower = search.toLowerCase();
    const result: Roster = {};
    Object.entries(roster).forEach(([cat, names]) => {
      const f = names.filter(n => n.toLowerCase().includes(lower));
      if (f.length > 0) result[cat] = f;
    });
    return result;
  }, [roster, search]);

  const toggle = (name: string) => {
    setTempSel(prev => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  };

  const toggleGroup = (names: string[]) => {
    setTempSel(prev => {
      const n = new Set(prev);
      const allIn = names.every(nm => n.has(nm));
      names.forEach(nm => allIn ? n.delete(nm) : n.add(nm));
      return n;
    });
  };

  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-heading)' }}>Filter Personnel</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl">&times;</button>
        </div>
        <input
          type="text" placeholder="Search names..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="rb-filter-search"
        />
        <div className="flex gap-2 mb-2">
          <button onClick={() => {
            const all = Object.values(filteredRoster).flat();
            setTempSel(prev => { const n = new Set(prev); all.forEach(nm => n.add(nm)); return n; });
          }} className="rb-filter-btn-sm">Select All Visible</button>
          <button onClick={() => {
            const all = Object.values(filteredRoster).flat();
            setTempSel(prev => { const n = new Set(prev); all.forEach(nm => n.delete(nm)); return n; });
          }} className="rb-filter-btn-sm">Deselect All Visible</button>
        </div>
        <div className="rb-filter-modal-body">
          {Object.entries(filteredRoster).map(([cat, names]) => (
            <div key={cat}>
              <div className="rb-filter-group-header" onClick={() => toggleGroup(names)}>
                <div className={`rb-filter-cb ${names.every(n => tempSel.has(n)) ? 'checked' : ''}`}>
                  {names.every(n => tempSel.has(n)) ? '✓' : ''}
                </div>
                <span>{cat} ({names.filter(n => tempSel.has(n)).length}/{names.length})</span>
              </div>
              {names.map(name => (
                <div key={name} className="rb-filter-person-row" onClick={() => toggle(name)}>
                  <div className={`rb-filter-cb ${tempSel.has(name) ? 'checked' : ''}`}>
                    {tempSel.has(name) ? '✓' : ''}
                  </div>
                  <span>{name}</span>
                </div>
              ))}
            </div>
          ))}
          {Object.keys(filteredRoster).length === 0 && (
            <div className="text-center py-4" style={{ color: 'var(--text-muted)' }}>No matches found</div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="rb-filter-cancel">Cancel</button>
          <button onClick={() => { onApply(tempSel); onClose(); }} className="rb-filter-apply">Apply</button>
        </div>
      </div>
    </div>
  );
}

interface RainbowModalEvent {
  section: string;
  title: string;
  start: string;
  end: string | null;
  etd: string | null;
  eta: string | null;
  personnel: string[];
}

export function RainbowView({ workingEvents, roster, dates }: RainbowViewProps) {
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(() => new Set(RAINBOW_FILTERS.map(f => f.key)));
  const [modalEvent, setModalEvent] = useState<RainbowModalEvent | null>(null);
  const [rbSelection, setRbSelection] = useState<RainbowSelection | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [visiblePersonnel, setVisiblePersonnel] = useState<Set<string> | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const dragRef = useRef<{
    mode: string; dateIndex: number; originTime?: number;
    initialSelection?: RainbowSelection;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleType = useCallback((key: string) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const personDateEvents = useMemo(() => {
    const map = new Map<string, Map<string, RainbowModalEvent[]>>();
    workingEvents.forEach(ev => {
      (ev.personnel || []).forEach(person => {
        if (!map.has(person)) map.set(person, new Map());
        const dateMap = map.get(person)!;
        if (!dateMap.has(ev.date)) dateMap.set(ev.date, []);
        dateMap.get(ev.date)!.push({
          section: ev.section,
          title: ev.model ? `${ev.model} ${ev.eventName}` : ev.eventName,
          start: ev.startTime,
          end: ev.endTime,
          etd: ev.etd,
          eta: ev.eta,
          personnel: ev.personnel,
        });
      });
    });
    return map;
  }, [workingEvents]);

  const personnelList = useMemo(() => {
    const list: Array<{ type: 'separator' | 'person'; name?: string; category: string }> = [];
    ROSTER_ORDER.forEach(cat => {
      let names = roster[cat] || [];
      if (visiblePersonnel) names = names.filter(n => visiblePersonnel.has(n));
      if (names.length > 0) {
        list.push({ type: 'separator', category: cat });
        names.forEach(name => list.push({ type: 'person', name, category: cat }));
      }
    });
    return list;
  }, [roster, visiblePersonnel]);

  const layoutEvents = useCallback((events: RainbowModalEvent[] | undefined) => {
    if (!events || events.length === 0) return { events: [] as Array<RainbowModalEvent & { startMin: number; endMin: number; lane: number }>, laneCount: 0 };
    const sorted = events.map(ev => ({
      ...ev,
      startMin: timeToMinutes(ev.start) ?? TIMELINE_START,
      endMin: timeToMinutes(ev.end) ?? (timeToMinutes(ev.start) ? timeToMinutes(ev.start)! + 60 : TIMELINE_START + TIMELINE_RANGE),
      lane: 0,
    })).sort((a, b) => a.startMin - b.startMin);

    const lanes: typeof sorted[] = [];
    sorted.forEach(ev => {
      let placed = false;
      for (let i = 0; i < lanes.length; i++) {
        const last = lanes[i][lanes[i].length - 1];
        if (ev.startMin >= last.endMin) {
          lanes[i].push(ev);
          ev.lane = i;
          placed = true;
          break;
        }
      }
      if (!placed) {
        ev.lane = lanes.length;
        lanes.push([ev]);
      }
    });
    return { events: sorted, laneCount: lanes.length };
  }, []);

  const rulerMarks = useMemo(() =>
    [6, 9, 12, 15, 18].map(h => ({ label: String(h), pct: timePct(h * 60) })),
  []);

  const hourLines = useMemo(() => [9, 12, 15].map(h => timePct(h * 60)), []);

  const pctToMinutes = useCallback((pct: number) =>
    Math.round(TIMELINE_START + (pct / 100) * TIMELINE_RANGE),
  []);

  const addRbGlobalListeners = useCallback(() => {
    const onMove = (me: PointerEvent) => {
      if (!dragRef.current) return;
      const { mode, dateIndex, initialSelection } = dragRef.current;
      const area = scrollRef.current;
      if (!area) return;
      const areaRect = area.getBoundingClientRect();
      const scrollLeft = area.scrollLeft;
      const colLeft = 161 + dateIndex * (RAINBOW_COL_WIDTH + 1);
      const colVisualLeft = areaRect.left + colLeft - scrollLeft;
      const xInCol = me.clientX - colVisualLeft;
      const pct = Math.max(0, Math.min(100, (xInCol / RAINBOW_COL_WIDTH) * 100));
      const currentTime = pctToMinutes(pct);
      const originTime = dragRef.current.originTime ?? currentTime;

      if (mode === 'create') {
        if (Math.abs(currentTime - originTime) > 10) {
          setRbSelection({ type: 'range', dateIndex, start: Math.min(originTime, currentTime), end: Math.max(originTime, currentTime) });
        } else {
          setRbSelection({ type: 'marker', dateIndex, start: currentTime, end: currentTime });
        }
      } else if (mode === 'drag-marker' && initialSelection) {
        setRbSelection({ ...initialSelection, start: currentTime, end: currentTime });
      } else if (mode === 'drag-start' && initialSelection) {
        setRbSelection({ ...initialSelection, start: Math.min(currentTime, initialSelection.end - 15) });
      } else if (mode === 'drag-end' && initialSelection) {
        setRbSelection({ ...initialSelection, end: Math.max(currentTime, initialSelection.start + 15) });
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [pctToMinutes]);

  const handleRulerPointerDown = useCallback((e: React.PointerEvent, dateIndex: number) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const mins = pctToMinutes(pct);
    if (rbSelection) { setRbSelection(null); return; }
    dragRef.current = { mode: 'create', dateIndex, originTime: mins };
    setRbSelection({ type: 'marker', dateIndex, start: mins, end: mins });
    addRbGlobalListeners();
  }, [pctToMinutes, rbSelection, addRbGlobalListeners]);

  const handleRbHandleDrag = useCallback((mode: string, e: React.PointerEvent) => {
    if (e.button !== 0 || !rbSelection) return;
    e.stopPropagation();
    dragRef.current = { mode, dateIndex: rbSelection.dateIndex, initialSelection: { ...rbSelection } };
    addRbGlobalListeners();
  }, [rbSelection, addRbGlobalListeners]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRbSelection(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleRbCategoryChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const cat = e.target.value;
    setSelectedCategory(cat);
    if (cat === 'All') setVisiblePersonnel(null);
    else if (cat !== 'Custom' && roster[cat]) setVisiblePersonnel(new Set(roster[cat]));
  }, [roster]);

  const handleRbFilterApply = useCallback((newSelection: Set<string>) => {
    setVisiblePersonnel(newSelection);
    setSelectedCategory('Custom');
    setFilterOpen(false);
  }, []);

  return (
    <>
      <div className="rainbow-toolbar">
        <span className="rainbow-toolbar-label">FILTERS</span>
        {RAINBOW_FILTERS.map(f => (
          <button
            key={f.key}
            className={`rainbow-filter-btn ${visibleTypes.has(f.key) ? 'active' : ''}`}
            style={{ '--filter-color': f.color, '--filter-bg': f.color + '20' } as React.CSSProperties}
            onClick={() => toggleType(f.key)}
          >
            {f.label}
          </button>
        ))}
        <div className="rainbow-toolbar-right">
          {rbSelection && (
            <button onClick={() => setRbSelection(null)} className="rb-clear-marker-btn">
              Clear Marker
            </button>
          )}
          <button onClick={() => setFilterOpen(true)} className="filter-btn rb-filter-btn">
            <svg xmlns="http://www.w3.org/2000/svg" style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filter
          </button>
          <select value={selectedCategory} onChange={handleRbCategoryChange} className="rb-category-select">
            <option value="All">All Personnel</option>
            {Object.keys(roster).map(cat => (<option key={cat} value={cat}>{cat}</option>))}
            <option value="Custom" disabled style={{ color: 'var(--text-dimmed)' }}>Custom Selection</option>
          </select>
        </div>
      </div>

      <div className="rainbow-scroll" ref={scrollRef}>
        <div
          className="rainbow-grid"
          style={{ gridTemplateColumns: `160px repeat(${dates.length}, ${RAINBOW_COL_WIDTH}px)` }}
        >
          <div className="rainbow-corner">
            <span className="rainbow-corner-label">PERSONNEL</span>
          </div>
          {dates.map((d, dIdx) => {
            const h = fmtDate(d);
            const isSelected = rbSelection && rbSelection.dateIndex === dIdx;
            return (
              <div key={d} className="rainbow-date-header">
                <div className="rainbow-date-label">
                  <div className="rb-weekday">{h.weekday}</div>
                  <div className="rb-daymonth">{h.day} {h.month}</div>
                </div>
                <div className="rainbow-time-ruler" style={{ position: 'relative' }}>
                  {rulerMarks.map(m => (
                    <span key={m.label} style={{ left: m.pct + '%' }}>{m.label}</span>
                  ))}
                  <div className="rb-ruler-interactive" onPointerDown={(e) => { e.stopPropagation(); handleRulerPointerDown(e, dIdx); }} />
                  {isSelected && rbSelection!.type === 'marker' && (() => {
                    const pct = timePct(rbSelection!.start);
                    return (
                      <div className="rb-handle-container">
                        <div className="rb-marker-handle" style={{ left: `${pct}%` }} onPointerDown={(e) => handleRbHandleDrag('drag-marker', e)}>
                          {minutesToTime(rbSelection!.start)}
                        </div>
                      </div>
                    );
                  })()}
                  {isSelected && rbSelection!.type === 'range' && (() => {
                    const sPct = timePct(rbSelection!.start);
                    const ePct = timePct(rbSelection!.end);
                    const durMins = rbSelection!.end - rbSelection!.start;
                    const durLabel = durMins >= 60 ? `${Math.floor(durMins / 60)}:${String(durMins % 60).padStart(2, '0')}` : `${durMins}m`;
                    const midPct = (sPct + ePct) / 2;
                    return (
                      <div className="rb-handle-container">
                        <div className="rb-time-label" style={{ left: `${sPct}%` }}>{minutesToTime(rbSelection!.start)}</div>
                        <div className="rb-dur-label" style={{ left: `${midPct}%` }}>{durLabel}</div>
                        <div className="rb-time-label" style={{ left: `${ePct}%` }}>{minutesToTime(rbSelection!.end)}</div>
                        <div className="rb-range-handle" style={{ left: `calc(${sPct}% - 8px)` }} onPointerDown={(e) => handleRbHandleDrag('drag-start', e)}>
                          <div className="rb-range-handle-visual" />
                        </div>
                        <div className="rb-range-handle" style={{ left: `calc(${ePct}% - 8px)` }} onPointerDown={(e) => handleRbHandleDrag('drag-end', e)}>
                          <div className="rb-range-handle-visual" />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}

          {personnelList.map((item, idx) => {
            if (item.type === 'separator') {
              return (
                <div key={`sep-${item.category}`} className="rainbow-cat-separator">
                  {item.category}
                </div>
              );
            }

            const personDates = personDateEvents.get(item.name!);

            return (
              <Fragment key={`person-${item.name}-${idx}`}>
                <div className="rainbow-name-cell">
                  <div className="rainbow-name-text">{item.name}</div>
                  <div className="rainbow-cat-text">{item.category}</div>
                </div>
                {dates.map(date => {
                  const allCellEvts = personDates ? personDates.get(date) || [] : [];
                  const cellEvts = allCellEvts.filter(e => visibleTypes.has(e.section));
                  const { events: laid, laneCount } = layoutEvents(cellEvts);
                  const cellH = Math.max(28, laneCount * 24 + 4);

                  return (
                    <div key={date} className="rainbow-cell" style={{ height: cellH }}>
                      {hourLines.map(pct => (
                        <div key={pct} className="rb-hour-line" style={{ left: pct + '%' }} />
                      ))}
                      {laid.map((ev, i) => {
                        const left = timePct(ev.startMin);
                        const width = Math.max(2, timePct(ev.endMin) - left);
                        const top = ev.lane * 24 + 2;
                        const barClass = RB_BAR_CLASS[ev.section] || 'rb-bar-flying';

                        let innerBar: React.ReactNode = null;
                        if (ev.section === 'Flying' && ev.etd && ev.eta) {
                          const etdMin = timeToMinutes(ev.etd);
                          const etaMin = timeToMinutes(ev.eta);
                          if (etdMin != null && etaMin != null && ev.endMin > ev.startMin) {
                            const innerLeft = ((etdMin - ev.startMin) / (ev.endMin - ev.startMin)) * 100;
                            const innerWidth = ((etaMin - etdMin) / (ev.endMin - ev.startMin)) * 100;
                            innerBar = (
                              <div className="rb-flight-inner" style={{
                                left: innerLeft + '%',
                                width: Math.max(1, innerWidth) + '%',
                              }} />
                            );
                          }
                        }

                        return (
                          <div
                            key={i}
                            className={`rb-event-bar ${barClass}`}
                            style={{ left: left + '%', width: width + '%', top, cursor: 'pointer' }}
                            title={`${ev.title}\n${ev.start || '?'}–${ev.end || '?'}`}
                            onClick={() => setModalEvent(ev)}
                          >
                            {innerBar}
                            <span className="rb-bar-label">{(ev as { shortTitle?: string }).shortTitle || ev.title.split(' ')[0]}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
          {rbSelection && (() => {
            const colLeft = 161 + rbSelection.dateIndex * (RAINBOW_COL_WIDTH + 1);
            if (rbSelection.type === 'marker') {
              const pct = timePct(rbSelection.start);
              const leftPx = colLeft + (pct / 100) * RAINBOW_COL_WIDTH;
              return <div className="rb-grid-line" style={{ left: `${leftPx}px` }} />;
            }
            if (rbSelection.type === 'range') {
              const sPct = timePct(rbSelection.start);
              const ePct = timePct(rbSelection.end);
              const leftPx = colLeft + (sPct / 100) * RAINBOW_COL_WIDTH;
              const widthPx = ((ePct - sPct) / 100) * RAINBOW_COL_WIDTH;
              return <div className="rb-grid-range" style={{ left: `${leftPx}px`, width: `${widthPx}px` }} />;
            }
            return null;
          })()}
        </div>
      </div>
      <RainbowModal event={modalEvent} onClose={() => setModalEvent(null)} />
      <RainbowFilterModal
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        roster={roster}
        currentSelection={visiblePersonnel}
        onApply={handleRbFilterApply}
      />
    </>
  );
}

// Need Fragment import
import { Fragment } from 'react';
