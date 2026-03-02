/** Core event representation — extracted from the monolith's implicit shape */
export interface ScheduleEvent {
  id: string;
  section: EventSection;
  date: string;          // ISO date e.g. "2026-02-03"
  model: string | null;  // Aircraft model for Flying events
  eventName: string;
  startTime: string;     // HH:MM
  endTime: string | null;
  etd: string | null;    // Estimated Time of Departure (Flying only)
  eta: string | null;    // Estimated Time of Arrival (Flying only)
  personnel: string[];
  originalPersonnel: string[];
  notes: string | null;
  readonly: boolean;     // Supervision & Academics are readonly
}

export type EventSection =
  | 'Flying'
  | 'Ground'
  | 'NA'
  | 'Supervision'
  | 'Academics';

/** Classification of an event by crew class composition */
export type EventClass = 'A-Class' | 'B-Class' | 'Staff' | 'Other';

/** Layout result for a single event in a section lane */
export interface LayoutResult {
  top: number;
  height: number;
}

/** Full layout for a section's events */
export interface SectionLayout {
  evMap: Record<string, LayoutResult>;
  total: number;
}

/** Rainbow view event bar (derived from ScheduleEvent for a specific person) */
export interface RainbowEventBar {
  section: EventSection;
  title: string;
  shortTitle: string;
  start: string;
  end: string | null;
  etd: string | null;
  eta: string | null;
  personnel: string[];
  id: string;
}

/** Rainbow event bar with computed lane info */
export interface LaidOutRainbowEvent extends RainbowEventBar {
  startMin: number;
  endMin: number;
  lane: number;
}
