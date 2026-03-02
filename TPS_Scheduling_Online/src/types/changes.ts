/** A single raw change record (add or remove a person from an event) */
export interface Change {
  type: 'add' | 'remove';
  person: string;
  date: string;
  eventSection: string;
  eventModel: string | null;
  eventName: string;
  eventTime: string;
  eventId: string;
}

/** Metadata about an event referenced in a change */
export interface EventMeta {
  eventId: string;
  eventName: string;
  eventModel: string | null;
  eventTime: string;
  eventSection: string;
  date: string;
}

/**
 * A net instruction after collapsing raw changes.
 * Types: 'add', 'remove', or 'move' (paired add+remove for same person)
 */
export interface NetInstruction {
  type: 'add' | 'remove' | 'move';
  persons: string[];
  date: string;
  source: EventMeta | null;   // null for 'add' type
  target: EventMeta | null;   // null for 'remove' type
  rawIndices: number[];        // indices into the raw changes array (for undo)
  firstIndex: number;
}
