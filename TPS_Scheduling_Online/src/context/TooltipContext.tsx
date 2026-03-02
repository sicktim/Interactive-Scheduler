import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { TooltipState } from '../types';

interface TooltipContextValue {
  tooltip: TooltipState | null;
  showTooltip: (text: string, rect: DOMRect) => void;
  hideTooltip: () => void;
}

const TooltipContext = createContext<TooltipContextValue>({
  tooltip: null,
  showTooltip: () => {},
  hideTooltip: () => {},
});

export const useTooltipContext = () => useContext(TooltipContext);

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const showTooltip = useCallback((text: string, rect: DOMRect) => {
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < 80;
    setTooltip({
      text,
      x: rect.left + rect.width / 2,
      y: showAbove ? rect.top - 6 : rect.bottom + 6,
      above: showAbove,
    });
  }, []);

  const hideTooltip = useCallback(() => setTooltip(null), []);

  return (
    <TooltipContext.Provider value={{ tooltip, showTooltip, hideTooltip }}>
      {children}
    </TooltipContext.Provider>
  );
}
