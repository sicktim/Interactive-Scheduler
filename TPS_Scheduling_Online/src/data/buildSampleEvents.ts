import type { ScheduleEvent } from '../types';
import { transformSheetReturn, mergeDuplicateEvents } from '../utils';
import { SAMPLE_ROSTER } from './sampleRoster';
import { SAMPLE_SHEET } from './sampleSheet';

/** Build sample events for offline development (two days of data) */
export const buildSampleEvents = (): ScheduleEvent[] => {
  const events: ScheduleEvent[] = [];
  events.push(...transformSheetReturn(SAMPLE_SHEET, '2026-02-03'));
  events.push(...transformSheetReturn(SAMPLE_SHEET, '2026-02-04'));
  return mergeDuplicateEvents(events, SAMPLE_ROSTER);
};
