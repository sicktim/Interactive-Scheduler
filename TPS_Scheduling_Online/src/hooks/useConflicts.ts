import { useMemo } from 'react';
import type { ScheduleEvent, ConflictMap } from '@/types';
import { detectConflicts } from '@/utils';

/**
 * Memoized conflict detection hook.
 *
 * Takes ALL events (readonly + working) because readonly events
 * like Supervision and Academics participate in conflict detection
 * even though they cannot be edited.
 */
export function useConflicts(allEvents: ScheduleEvent[]): ConflictMap {
  return useMemo(() => detectConflicts(allEvents), [allEvents]);
}
