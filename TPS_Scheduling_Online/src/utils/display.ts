import type { Roster, ChipColors } from '../types';
import { CATEGORY_COLORS, DEFAULT_CHIP } from '../constants';

/** Look up a person's roster category */
export const personCat = (name: string, roster: Roster): string | null => {
  for (const [cat, members] of Object.entries(roster)) {
    if (members.includes(name)) return cat;
  }
  return null;
};

/** Get chip color for a person based on their roster category */
export const chipColor = (name: string, roster: Roster): ChipColors => {
  const cat = personCat(name, roster);
  return (cat && CATEGORY_COLORS[cat]) || DEFAULT_CHIP;
};

/**
 * Filter out strings that are notes, not names.
 * Applied to all crew arrays during parsing.
 * Preserves the critical filtering from line 1677 of the monolith.
 */
export const isValidName = (str: string | null | undefined): boolean => {
  if (!str || typeof str !== 'string') return false;
  const t = str.trim();
  if (!t || t.length > 25) return false;
  if (t === 'FALSE' || t === 'TRUE') return false;
  if (t.split(/\s+/).length > 4) return false;
  return true;
};
