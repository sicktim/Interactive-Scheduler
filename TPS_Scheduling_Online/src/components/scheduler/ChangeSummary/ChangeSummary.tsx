import { useMemo } from 'react';
import type { Change, EventMeta } from '../../../types';
import { computeNetChanges, fmtDate } from '../../../utils';
import './ChangeSummary.css';

interface ChangeSummaryProps {
  changes: Change[];
  onUndoGroup: (indices: number[]) => void;
  onClearAll: () => void;
  onCopy: () => void;
}

function NetChangeEntry({ inst, formatEvent, onUndo }: {
  inst: ReturnType<typeof computeNetChanges>[number];
  formatEvent: (meta: EventMeta | null) => string;
  onUndo: () => void;
}) {
  if (inst.type === 'move') {
    return (
      <div className="change-entry" style={{ flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, width: '100%' }}>
          <span className="change-icon-move">&rarr;</span>
          <div className="change-detail" style={{ flex: 1 }}>
            <span className="change-source">{formatEvent(inst.source)}</span>
            <span className="change-arrow">&rarr;</span>
            <span className="change-target">{formatEvent(inst.target)}</span>
          </div>
          <span className="change-undo" onClick={onUndo} title="Undo all">↩</span>
        </div>
        <div className="change-persons-move">
          {inst.persons.join(', ')}
        </div>
      </div>
    );
  }
  if (inst.type === 'add') {
    return (
      <div className="change-entry">
        <span className="change-icon-add">+</span>
        <div className="change-detail">
          <span className="change-source">Add to </span>{formatEvent(inst.target)}
          <br /><span className="change-persons-add">{inst.persons.join(', ')}</span>
        </div>
        <span className="change-undo" onClick={onUndo} title="Undo all">↩</span>
      </div>
    );
  }
  return (
    <div className="change-entry">
      <span className="change-icon-remove">&minus;</span>
      <div className="change-detail">
        <span className="change-source">Remove from </span>{formatEvent(inst.source)}
        <br /><span className="change-persons-remove">{inst.persons.join(', ')}</span>
      </div>
      <span className="change-undo" onClick={onUndo} title="Undo all">↩</span>
    </div>
  );
}

export function ChangeSummary({ changes, onUndoGroup, onClearAll, onCopy }: ChangeSummaryProps) {
  const netInstructions = useMemo(() => computeNetChanges(changes), [changes]);

  const byDate = useMemo(() => {
    const m: Record<string, typeof netInstructions> = {};
    netInstructions.forEach(inst => {
      if (!m[inst.date]) m[inst.date] = [];
      m[inst.date].push(inst);
    });
    return m;
  }, [netInstructions]);

  const sortedDates = Object.keys(byDate).sort();
  const netCount = netInstructions.length;

  const formatEvent = (meta: EventMeta | null): string => {
    if (!meta) return '';
    const model = meta.eventModel ? `${meta.eventModel} | ` : '';
    return `${model}${meta.eventName} (${meta.eventTime})`;
  };

  return (
    <div className="change-summary-panel">
      <div className="change-summary-header">
        <span>Change Summary</span>
        <span className="change-count">
          {netCount > 0 ? netCount : ''}
          {netCount > 0 && netCount !== changes.length && (
            <span className="change-raw-count">({changes.length} raw)</span>
          )}
        </span>
      </div>
      <div className="change-list">
        {sortedDates.length === 0 && changes.length === 0 && (
          <div className="change-empty">
            No changes yet.<br />Drag personnel to events<br />or remove with ✕.
          </div>
        )}
        {sortedDates.length === 0 && changes.length > 0 && (
          <div className="change-empty">
            All changes cancel out.<br />Net effect: no changes.
          </div>
        )}
        {sortedDates.map(date => {
          const h = fmtDate(date);
          return (
            <div key={date}>
              <div className="change-date-group">{h.full}</div>
              {byDate[date].map((inst, i) => (
                <NetChangeEntry
                  key={`${date}-${i}`}
                  inst={inst}
                  formatEvent={formatEvent}
                  onUndo={() => onUndoGroup(inst.rawIndices)}
                />
              ))}
            </div>
          );
        })}
      </div>
      {changes.length > 0 && (
        <div className="change-summary-footer">
          <button onClick={onCopy} className="btn-copy">Copy</button>
          <button onClick={onClearAll} className="btn-clear">Clear All</button>
        </div>
      )}
    </div>
  );
}
