/** Auto-incrementing event ID generator */
let _eid = 0;

export const mkId = (): string => `evt-${++_eid}`;

/** Reset counter (useful for tests) */
export const resetIdCounter = (): void => { _eid = 0; };
