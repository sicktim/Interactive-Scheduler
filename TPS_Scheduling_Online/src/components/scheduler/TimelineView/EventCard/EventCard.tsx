import { useState } from 'react';
import type { ScheduleEvent, Roster, ConflictMap } from '../../../../types';
import { timeToMinutes, timePct, evStart, evEnd, eventConflictCount, getConflictText } from '../../../../utils';
import { PersonnelChip } from '../../../shared/PersonnelChip/PersonnelChip';
import './EventCard.css';

interface EventCardProps {
  event: ScheduleEvent;
  top: number;
  height: number;
  roster: Roster;
  conflicts: ConflictMap;
  onRemove: (eventId: string, person: string) => void;
  onAdd: (targetId: string, person: string, sourceId: string | null) => void;
  onDS?: (name: string, eventId?: string) => void;
  onDE?: () => void;
  onShowTooltip?: (text: string, rect: DOMRect) => void;
  onHideTooltip?: () => void;
  isFocused?: boolean;
  isDimmed?: boolean;
  onFocusEvent?: (eventId: string | null) => void;
}

export function EventCard({
  event, top, height, roster, conflicts,
  onRemove, onAdd, onDS, onDE,
  onShowTooltip, onHideTooltip,
  isFocused, isDimmed, onFocusEvent,
}: EventCardProps) {
  const [dragOver, setDragOver] = useState(false);

  const sMin = evStart(event);
  const eMin = evEnd(event);
  const leftPct = timePct(sMin ?? 0);
  const widthPct = timePct(eMin) - leftPct;

  const cCount = eventConflictCount(event.id, conflicts);
  const secClass = `event-card-${event.section.toLowerCase()}`;
  const labelClass = `label-${event.section.toLowerCase()}`;
  const typeLabel = event.section === 'Flying' ? (event.model || 'FLT') : event.section === 'Ground' ? 'GND' : 'NA';

  // Flight bar (ETD→ETA within the card)
  let flightBar: React.ReactNode = null;
  if (event.section === 'Flying' && event.etd && event.eta) {
    const etdMin = timeToMinutes(event.etd);
    const etaMin = timeToMinutes(event.eta);
    const dur = eMin - (sMin ?? 0);
    if (dur > 0 && etdMin != null && etaMin != null) {
      const fLeft = Math.max(0, (etdMin - (sMin ?? 0)) / dur * 100);
      const fWidth = Math.max(0, (etaMin - etdMin) / dur * 100);
      flightBar = (
        <div className="flight-bar-row">
          <div className="flight-bar-track">
            <div className="flight-bar-fill" style={{ left: `${fLeft}%`, width: `${fWidth}%` }}>
              <span className="flight-time-marker etd" style={{ left: 0 }}>{event.etd}</span>
              <span className="flight-time-marker eta" style={{ right: 0 }}>{event.eta}</span>
            </div>
          </div>
        </div>
      );
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (event.readonly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (event.readonly) return;
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.person && !event.personnel.includes(data.person)) {
        onAdd(event.id, data.person, data.sourceEventId);
      }
    } catch (_err) { /* ignore parse errors */ }
  };

  // Build conflict summary for badge tooltip
  let badgeTooltip = '';
  if (cCount > 0) {
    const ec = conflicts.get(event.id);
    const lines: string[] = [];
    ec?.forEach((confList, person) => {
      confList.forEach(c => {
        const m = c.model ? `${c.model} ` : '';
        lines.push(`${person} → ${m}${c.eventName} ${c.startTime}-${c.endTime || '??'}`);
      });
    });
    badgeTooltip = lines.join('\n');
  }

  const classNames = [
    'event-card',
    secClass,
    dragOver ? 'drag-over' : '',
    isFocused ? 'focused' : '',
    isDimmed ? 'dimmed' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classNames}
      style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 4)}%`, top: `${top}px`, height: `${height}px` }}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={(e) => {
        if (onFocusEvent && !event.readonly) {
          e.stopPropagation();
          onFocusEvent(isFocused ? null : event.id);
        }
      }}
    >
      {cCount > 0 && (
        <div
          className="conflict-badge"
          onMouseEnter={(e) => {
            if (onShowTooltip) onShowTooltip(badgeTooltip, e.currentTarget.getBoundingClientRect());
          }}
          onMouseLeave={onHideTooltip}
        >
          {cCount}
        </div>
      )}
      <div className="event-title-bar">
        <span className={`event-type-label ${labelClass}`}>{typeLabel}</span>
        <span className="event-name-text">{event.eventName}</span>
        <span className="event-time-text">{event.startTime}-{event.endTime || '??'}</span>
      </div>
      {flightBar}
      <div className="event-crew-area" onDragOver={handleDragOver} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
        {event.personnel.map(person => (
          <PersonnelChip
            key={person}
            name={person}
            roster={roster}
            conflictText={getConflictText(event.id, person, conflicts)}
            onRemove={event.readonly ? null : (n) => onRemove(event.id, n)}
            eventId={event.id}
            onDragStart={onDS}
            onDragEnd={onDE}
            onShowTooltip={onShowTooltip}
            onHideTooltip={onHideTooltip}
          />
        ))}
        {!event.readonly && <span className="add-chip" title="Drop personnel here">+</span>}
      </div>
    </div>
  );
}
