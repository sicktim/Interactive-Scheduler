/** Roster: maps category names to arrays of personnel names */
export type Roster = Record<string, string[]>;

/** Roster categories as they appear in the API */
export type RosterCategory =
  | 'FTC-A'
  | 'FTC-B'
  | 'STC-A'
  | 'STC-B'
  | 'Staff IP'
  | 'Staff IFTE/ICSO'
  | 'Staff STC'
  | 'Attached/Support';

/** Color pair for a personnel chip */
export interface ChipColors {
  bg: string;
  text: string;
}
