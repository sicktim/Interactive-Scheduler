/** Tooltip positioning state */
export interface TooltipState {
  text: string;
  x: number;
  y: number;
  above: boolean;
}

/** Scheduler view mode toggle */
export type ViewMode = 'timeline' | 'rainbow';

/** App-level screen state machine */
export type ScreenState = 'loading' | 'selection' | 'scheduler';

/** Theme mode */
export type ThemeMode = 'dark' | 'light';

/** Rainbow timeline selection (marker or range) */
export interface RainbowSelection {
  type: 'marker' | 'range';
  dateIndex: number;
  start: number;   // minutes from midnight
  end: number;     // minutes from midnight
}

/** Focus mode availability entry */
export interface AvailabilityEntry {
  eventName: string;
  model: string | null;
  startTime: string;
  endTime: string | null;
  assigned?: boolean;
}
