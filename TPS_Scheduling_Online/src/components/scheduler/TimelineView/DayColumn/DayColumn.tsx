import { useMemo } from 'react';
import type { ScheduleEvent, Roster, ConflictMap } from '../../../../types';
import { SECTION_ORDER } from '../../../../constants';
import { fmtDate, timePct, buildLayout } from '../../../../utils';
import { EventCard } from '../EventCard/EventCard';
import './DayColumn.css';

interface DayColumnProps {
  date: string;
  events: ScheduleEvent[];
  roster: Roster;
  conflicts: ConflictMap;
  onRemove: (eventId: string, person: string) => void;
  onAdd: (targetId: string, person: string, sourceId: string | null) => void;
  onDS?: (name: string, eventId?: string) => void;
  onDE?: () => void;
  onShowTooltip?: (text: string, rect: DOMRect) => void;
  onHideTooltip?: () => void;
  focusedEventId?: string | null;
  onFocusEvent?: (eventId: string | null) => void;
  focusEnabled?: boolean;
}

export function DayColumn({
  date, events, roster, conflicts,
  onRemove, onAdd, onDS, onDE,
  onShowTooltip, onHideTooltip,
  focusedEventId, onFocusEvent, focusEnabled,
}: DayColumnProps) {
  const hdr = fmtDate(date);
  const today = new Date().toISOString().slice(0, 10);
  const isToday = date === today;

  const sectionData = useMemo(() => {
    const result: Record<string, { events: ScheduleEvent[]; layout: ReturnType<typeof buildLayout> }> = {};
    SECTION_ORDER.forEach(sec => {
      const secEvts = events.filter(ev => ev.section === sec);
      result[sec] = { events: secEvts, layout: buildLayout(secEvts) };
    });
    return result;
  }, [events]);

  return (
    <div className="day-column" style={{ borderColor: isToday ? 'rgba(59,130,246,0.25)' : undefined }}>
      <div className="day-header" style={{ borderBottom: isToday ? '2px solid #3b82f6' : undefined }}>
        <div style={{ textAlign: 'center' }}>
          <div className="day-header-weekday">{hdr.weekday}</div>
          <div className="day-header-date">{hdr.day} {hdr.month}</div>
        </div>
        <div className="timeline-ruler">
          {[6, 9, 12, 15, 18].map(h => (
            <span key={h} style={{ left: `${timePct(h * 60)}%` }}>{h}</span>
          ))}
        </div>
      </div>
      <div className="day-body">
        {SECTION_ORDER.map(sec => {
          const { events: secEvts, layout } = sectionData[sec];
          if (secEvts.length === 0) return null;
          const divClass = `section-divider section-divider-${sec.toLowerCase()}`;
          return (
            <div key={sec}>
              <div className={divClass}>{sec === 'NA' ? 'NON-AVAIL' : sec.toUpperCase()}</div>
              <div className="section-lanes" style={{ height: `${layout.total || 50}px` }}>
                {[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => (
                  <div key={h} className="hour-line" style={{ left: `${timePct(h * 60)}%` }} />
                ))}
                {secEvts.map(ev => {
                  const pos = layout.evMap[ev.id] || { top: 0, height: 40 };
                  return (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      top={pos.top}
                      height={pos.height}
                      roster={roster}
                      conflicts={conflicts}
                      onRemove={onRemove}
                      onAdd={onAdd}
                      onDS={onDS}
                      onDE={onDE}
                      onShowTooltip={onShowTooltip}
                      onHideTooltip={onHideTooltip}
                      isFocused={focusEnabled && focusedEventId === ev.id}
                      isDimmed={focusEnabled && !!focusedEventId && focusedEventId !== ev.id}
                      onFocusEvent={onFocusEvent}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        {events.length === 0 && <div className="empty-day">No selected events</div>}
      </div>
    </div>
  );
}
