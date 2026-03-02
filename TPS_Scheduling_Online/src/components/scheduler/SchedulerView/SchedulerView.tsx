import { useState, useMemo, useCallback, useRef } from 'react';
import type { ScheduleEvent, Roster, TooltipState, ViewMode } from '../../../types';
import type { WorkingCopyData } from '../../../utils';
import { DAY_COL_WIDTH } from '../../../constants';
import { fmtDate, personCat, computeNetChanges } from '../../../utils';
import { useSchedulerState } from '../../../hooks/useSchedulerState';
import { useConflicts } from '../../../hooks/useConflicts';
import { useFocusMode } from '../../../hooks/useFocusMode';
import { useKeyboardShortcut } from '../../../hooks/useKeyboardShortcut';
import { usePersistence } from '../../../hooks/usePersistence';
import { DayColumn } from '../TimelineView/DayColumn/DayColumn';
import { PersonnelPicker } from '../PersonnelPicker/PersonnelPicker';
import { ChangeSummary } from '../ChangeSummary/ChangeSummary';
import { RainbowView } from '../RainbowView/RainbowView';
import { RefreshModal } from '../RefreshModal/RefreshModal';
import { TooltipPortal } from '../../shared/TooltipPortal/TooltipPortal';
import './SchedulerView.css';

interface SchedulerViewProps {
  allEvents: ScheduleEvent[];
  roster: Roster;
  dates: string[];
  initialSelectedIds: Set<string>;
  initialNaCats: Set<string>;
  onChangeSelection: () => void;
  cachedWorkingState: WorkingCopyData | null;
  onRefreshFromWhiteboard: (mode: 'quick' | 'full') => void;
}

export function SchedulerView({
  allEvents, roster, dates, initialSelectedIds, initialNaCats,
  onChangeSelection, cachedWorkingState, onRefreshFromWhiteboard,
}: SchedulerViewProps) {
  // -- Core state management (extracted hook) --
  const {
    workingEvents, changes, initialized,
    addPersonToEvent, removePersonFromEvent,
    undoChange, clearAllChanges,
  } = useSchedulerState({
    allEvents, roster, dates,
    initialSelectedIds, initialNaCats,
    cachedWorkingState,
  });

  // -- UI-local state --
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const [focusEnabled, setFocusEnabled] = useState(true);
  const timelineRef = useRef<HTMLDivElement>(null);

  // -- Tooltip callbacks --
  const showTooltip = useCallback((text: string, rect: DOMRect) => {
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < 80;
    setTooltip({ text, x: rect.left + rect.width / 2, y: showAbove ? rect.top - 6 : rect.bottom + 6, above: showAbove });
  }, []);
  const hideTooltip = useCallback(() => setTooltip(null), []);

  // -- Conflict detection (extracted hook) --
  const conflicts = useConflicts(workingEvents);

  // -- Focus mode (extracted hook) --
  const {
    focusedEventId, setFocusedEvent, availabilityMap: focusedAvailability,
  } = useFocusMode({ workingEvents, viewMode, focusEnabled });

  // -- Keyboard shortcut: Escape clears focus (extracted hook) --
  useKeyboardShortcut('Escape', useCallback(() => setFocusedEvent(null), [setFocusedEvent]));

  // -- Auto-save persistence (extracted hook) --
  const { savedShow } = usePersistence({
    workingEvents, changes, allEvents, roster, dates,
    initialSelectedIds, initialNaCats, initialized,
  });

  // -- Derived data --
  const visibleEvents = useMemo(() => {
    return workingEvents.filter(ev => {
      if (ev.readonly) return false;
      if (ev.section === 'NA') {
        return ev.personnel.some(p => {
          const c = personCat(p, roster);
          return c ? initialNaCats.has(c) : false;
        });
      }
      return initialSelectedIds.has(ev.id);
    });
  }, [workingEvents, initialSelectedIds, initialNaCats, roster]);

  const eventsByDate = useMemo(() => {
    const m: Record<string, ScheduleEvent[]> = {};
    dates.forEach(d => { m[d] = []; });
    visibleEvents.forEach(ev => { if (m[ev.date]) m[ev.date].push(ev); });
    return m;
  }, [visibleEvents, dates]);

  const handleCopy = useCallback(() => {
    const netInstructions = computeNetChanges(changes);
    if (netInstructions.length === 0) return;
    const lines: string[] = [];
    const byDate: Record<string, typeof netInstructions> = {};
    netInstructions.forEach(inst => {
      if (!byDate[inst.date]) byDate[inst.date] = [];
      byDate[inst.date].push(inst);
    });
    Object.keys(byDate).sort().forEach(date => {
      const h = fmtDate(date);
      lines.push(`--- ${h.full} ---`);
      byDate[date].forEach(inst => {
        const fmtEvt = (meta: typeof inst.source) => {
          if (!meta) return '';
          const mdl = meta.eventModel ? `${meta.eventModel} | ` : '';
          return `${mdl}${meta.eventName} (${meta.eventTime})`;
        };
        if (inst.type === 'move') {
          lines.push(`  MOVE: ${fmtEvt(inst.source)}  -->  ${fmtEvt(inst.target)}`);
          lines.push(`        ${inst.persons.join(', ')}`);
        } else if (inst.type === 'add') {
          lines.push(`  ADD to ${fmtEvt(inst.target)}:`);
          lines.push(`        ${inst.persons.join(', ')}`);
        } else {
          lines.push(`  REMOVE from ${fmtEvt(inst.source)}:`);
          lines.push(`        ${inst.persons.join(', ')}`);
        }
      });
      lines.push('');
    });
    navigator.clipboard.writeText(lines.join('\n').trim()).catch(() => {});
  }, [changes]);

  const scrollToDay = (date: string) => {
    const idx = dates.indexOf(date);
    if (idx >= 0 && timelineRef.current) {
      timelineRef.current.scrollTo({ left: idx * DAY_COL_WIDTH, behavior: 'smooth' });
    }
  };

  const conflictCount = useMemo(() => {
    const people = new Set<string>();
    conflicts.forEach(pm => pm.forEach((_, p) => people.add(p)));
    return people.size;
  }, [conflicts]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="app-layout">
      <div className="app-header">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="scheduler-title">
              TPS INTERACTIVE SCHEDULER
              <span className={`saved-indicator ${savedShow ? 'show' : ''}`}>saved</span>
            </h1>
            <p className="scheduler-subtitle">
              {visibleEvents.length} events
              {conflictCount > 0 && (
                <span className="conflict-count-text">{'\u26A0'} {conflictCount} conflict{conflictCount > 1 ? 's' : ''}</span>
              )}
            </p>
          </div>
          {viewMode === 'timeline' && (
            <div className="day-tabs ml-4">
              {dates.map(d => {
                const h = fmtDate(d);
                return (
                  <div key={d} className={`day-tab ${d === today ? 'today' : ''}`} onClick={() => scrollToDay(d)}>
                    {h.weekday} {h.day}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            className={`focus-toggle-btn ${focusEnabled ? 'on' : 'off'}`}
            onClick={() => {
              setFocusEnabled(prev => { if (prev) setFocusedEvent(null); return !prev; });
            }}
            title={focusEnabled ? 'Focus mode ON -- click events to highlight and see availability' : 'Focus mode OFF'}
          >
            Focus {focusEnabled ? 'ON' : 'OFF'}
          </button>
          <div className="view-tabs">
            <div className={`view-tab ${viewMode === 'timeline' ? 'active' : ''}`} onClick={() => setViewMode('timeline')}>Timeline</div>
            <div className={`view-tab ${viewMode === 'rainbow' ? 'active' : ''}`} onClick={() => setViewMode('rainbow')}>Rainbow</div>
          </div>
          <button onClick={onChangeSelection} className="filter-btn">Edit Selection</button>
          <button onClick={() => setShowRefreshModal(true)} className="filter-btn refresh-btn">
            <span>Refresh from Whiteboard</span>
            <span className="refresh-btn-sub">Clears local work</span>
          </button>
        </div>
      </div>

      {/* Timeline -- always mounted for scroll preservation */}
      <div
        className="timeline-area"
        ref={timelineRef}
        style={viewMode !== 'timeline' ? { display: 'none' } : undefined}
        onClick={(e) => {
          if (focusEnabled && !(e.target as HTMLElement).closest('.event-card')) setFocusedEvent(null);
        }}
      >
        <div className="days-container">
          {dates.map(date => (
            <DayColumn
              key={date}
              date={date}
              events={eventsByDate[date] || []}
              roster={roster}
              conflicts={conflicts}
              onRemove={removePersonFromEvent}
              onAdd={addPersonToEvent}
              onShowTooltip={showTooltip}
              onHideTooltip={hideTooltip}
              focusedEventId={focusedEventId}
              onFocusEvent={setFocusedEvent}
              focusEnabled={focusEnabled}
            />
          ))}
        </div>
      </div>

      <div style={{ gridColumn: 1, gridRow: 3, display: viewMode !== 'timeline' ? 'none' : undefined }}>
        <PersonnelPicker
          roster={roster}
          allEvents={workingEvents}
          conflicts={conflicts}
          onShowTooltip={showTooltip}
          onHideTooltip={hideTooltip}
          focusedAvailability={focusedAvailability}
        />
      </div>

      {/* Rainbow -- always mounted for state preservation */}
      <div className="rainbow-area" style={viewMode !== 'rainbow' ? { display: 'none' } : undefined}>
        <RainbowView workingEvents={workingEvents} roster={roster} dates={dates} />
      </div>

      <ChangeSummary
        changes={changes}
        onUndoGroup={undoChange}
        onClearAll={clearAllChanges}
        onCopy={handleCopy}
      />

      {showRefreshModal && (
        <RefreshModal
          onClose={() => setShowRefreshModal(false)}
          onRefresh={onRefreshFromWhiteboard}
        />
      )}

      <TooltipPortal tooltip={tooltip} />
    </div>
  );
}
