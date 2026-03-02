/** Detail about a single conflict (what the person also overlaps with) */
export interface ConflictDetail {
  eventName: string;
  model: string | null;
  section: string;
  startTime: string;
  endTime: string | null;
}

/**
 * ConflictMap: Map<eventId, Map<personName, ConflictDetail[]>>
 *
 * For each event, tracks which personnel have conflicts and
 * the details of those conflicting events.
 */
export type ConflictMap = Map<string, Map<string, ConflictDetail[]>>;
