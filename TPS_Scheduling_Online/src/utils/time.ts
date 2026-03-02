import { TIMELINE_START, TIMELINE_RANGE } from '../constants';

/** Parse "HH:MM" to minutes from midnight, or null */
export const timeToMinutes = (str: string | null | undefined): number | null => {
  if (!str) return null;
  const m = str.match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
};

/** Convert minutes from midnight to "HH:MM" */
export const minutesToTime = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

/** Convert minutes to a percentage within the timeline range (clamped 0–100) */
export const timePct = (mins: number): number =>
  Math.max(0, Math.min(100, ((mins - TIMELINE_START) / TIMELINE_RANGE) * 100));

/** Format an ISO date string into display parts */
export const fmtDate = (iso: string): { weekday: string; day: number; month: string; full: string } => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const mo = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return { weekday: wd, day: d, month: mo, full: `${wd} ${d} ${mo}` };
};
