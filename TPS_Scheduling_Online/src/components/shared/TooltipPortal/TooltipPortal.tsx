import type { TooltipState } from '../../../types';
import './TooltipPortal.css';

interface TooltipPortalProps {
  tooltip: TooltipState | null;
}

/**
 * Portal-style tooltip rendered at the app root with position:fixed.
 * This escapes all stacking contexts — critical pattern from monolith line 3715.
 */
export function TooltipPortal({ tooltip }: TooltipPortalProps) {
  if (!tooltip) return null;

  return (
    <div
      className="conflict-tooltip-portal"
      style={{
        left: tooltip.x,
        top: tooltip.y,
        transform: tooltip.above ? 'translate(-50%, -100%)' : 'translateX(-50%)',
      }}
    >
      {tooltip.text}
    </div>
  );
}
