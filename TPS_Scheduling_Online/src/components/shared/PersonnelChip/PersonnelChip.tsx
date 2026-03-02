import type { Roster } from '../../../types';
import { chipColor } from '../../../utils';
import './PersonnelChip.css';

interface PersonnelChipProps {
  name: string;
  roster: Roster;
  conflictText?: string | null;
  onRemove?: ((name: string) => void) | null;
  eventId?: string;
  inPicker?: boolean;
  isBusy?: boolean;
  isUnavailable?: boolean;
  onDragStart?: (name: string, eventId?: string) => void;
  onDragEnd?: () => void;
  onShowTooltip?: (text: string, rect: DOMRect) => void;
  onHideTooltip?: () => void;
}

export function PersonnelChip({
  name, roster, conflictText, onRemove, eventId,
  inPicker, isBusy, isUnavailable,
  onDragStart: onDS, onDragEnd: onDE,
  onShowTooltip, onHideTooltip,
}: PersonnelChipProps) {
  const colors = chipColor(name, roster);

  const handleDragStart = (e: React.DragEvent<HTMLSpanElement>) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ person: name, sourceEventId: eventId || null }));
    e.dataTransfer.effectAllowed = 'copyMove';
    e.currentTarget.style.opacity = '0.4';
    if (onDS) onDS(name, eventId);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLSpanElement>) => {
    e.currentTarget.style.opacity = '1';
    if (onDE) onDE();
  };

  const hasCon = !!conflictText;

  const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement>) => {
    if ((hasCon || isUnavailable) && onShowTooltip) {
      const rect = e.currentTarget.getBoundingClientRect();
      onShowTooltip(isUnavailable ? conflictText! : `Also on: ${conflictText}`, rect);
    }
  };

  const classNames = [
    'chip',
    hasCon && !isUnavailable ? 'chip-conflict' : '',
    inPicker ? 'picker-chip' : '',
    isBusy ? 'busy' : '',
    isUnavailable ? 'unavailable' : '',
  ].filter(Boolean).join(' ');

  return (
    <span
      className={classNames}
      style={{ background: colors.bg, color: colors.text }}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onHideTooltip}
      title={hasCon ? undefined : name}
    >
      {name}
      {hasCon && <span className="conflict-icon">!</span>}
      {onRemove && (
        <span
          className="chip-remove"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (onHideTooltip) onHideTooltip();
            onRemove(name);
          }}
        >
          ✕
        </span>
      )}
    </span>
  );
}
