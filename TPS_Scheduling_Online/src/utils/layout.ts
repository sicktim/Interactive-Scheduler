import type { ScheduleEvent, SectionLayout } from '../types';
import { TIMELINE_START, TIMELINE_END, TIMELINE_RANGE, DAY_COL_WIDTH } from '../constants';
import { timeToMinutes } from './time';

/** Get event start in minutes */
export const evStart = (ev: ScheduleEvent): number | null =>
  timeToMinutes(ev.startTime);

/** Get event end in minutes (fallback: start+60 or TIMELINE_END) */
export const evEnd = (ev: ScheduleEvent): number => {
  const e = timeToMinutes(ev.endTime);
  const s = timeToMinutes(ev.startTime);
  return e || (s ? s + 60 : TIMELINE_END);
};

/**
 * Effective visual end accounting for min-width:140px card expansion.
 * Critical layout pattern from line 1636 of the monolith.
 */
export const visualEnd = (ev: ScheduleEvent): number => {
  const s = evStart(ev);
  const e = evEnd(ev);
  if (s == null) return e;
  const dur = e - s;
  const widthPct = (dur / TIMELINE_RANGE) * 100;
  const cardPx = (widthPct / 100) * DAY_COL_WIDTH;
  if (cardPx >= 140) return e;
  // Card is expanded to 140px — compute what end time that corresponds to
  const expandedPct = (140 / DAY_COL_WIDTH) * 100;
  const expandedDur = (expandedPct / 100) * TIMELINE_RANGE;
  return s + expandedDur;
};

/** Check if two events overlap in time */
export const overlap = (a: ScheduleEvent, b: ScheduleEvent): boolean => {
  const aS = evStart(a);
  const aE = evEnd(a);
  const bS = evStart(b);
  const bE = evEnd(b);
  if (aS == null || bS == null) return false;
  return aS < bE && bS < aE;
};

/** Estimate the pixel height of an event card based on crew count and card width */
export const estimateHeight = (ev: ScheduleEvent): number => {
  let h = 18; // title bar
  if (ev.section === 'Flying' && ev.etd && ev.eta) h += 14;
  const crewCount = Math.max(1, ev.personnel.length + 1); // +1 for add chip

  // Width-aware: compute card pixel width from time span
  const sMin = evStart(ev);
  const eMin = evEnd(ev);
  const dur = (eMin - (sMin ?? 0)) || 60;
  const widthPct = (dur / TIMELINE_RANGE) * 100;
  const cardPxWidth = Math.max(140, (widthPct / 100) * DAY_COL_WIDTH);

  // Estimate chips per row based on actual card width
  const chipAreaWidth = cardPxWidth - 14; // padding
  const avgChipWidth = 78;
  const chipsPerRow = Math.max(1, Math.floor(chipAreaWidth / avgChipWidth));

  const rows = Math.ceil(crewCount / chipsPerRow);
  h += rows * 20 + 6;
  return Math.max(h, 40);
};

/** Assign events to non-overlapping lanes and compute layout positions */
export const buildLayout = (events: ScheduleEvent[]): SectionLayout => {
  if (events.length === 0) return { evMap: {}, total: 0 };

  const sorted = [...events].sort((a, b) => (evStart(a) || 0) - (evStart(b) || 0));
  const lanes: ScheduleEvent[][] = [];
  const laneOf: Record<string, number> = {};

  sorted.forEach(ev => {
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      const last = lanes[i][lanes[i].length - 1];
      if ((evStart(ev) || 0) >= (visualEnd(last) || 0)) {
        lanes[i].push(ev);
        laneOf[ev.id] = i;
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes.push([ev]);
      laneOf[ev.id] = lanes.length - 1;
    }
  });

  // Lane heights
  const laneH = lanes.map(lane => Math.max(...lane.map(estimateHeight)));
  const laneTop: number[] = [];
  let cum = 0;
  laneH.forEach((h, i) => { laneTop[i] = cum; cum += h + 3; });

  const evMap: Record<string, { top: number; height: number }> = {};
  events.forEach(ev => {
    const li = laneOf[ev.id] ?? 0;
    evMap[ev.id] = { top: laneTop[li] || 0, height: estimateHeight(ev) };
  });

  return { evMap, total: cum };
};
