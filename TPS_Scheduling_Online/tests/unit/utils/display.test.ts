import { describe, it, expect } from 'vitest';
import { isValidName, personCat, chipColor } from '@/utils/display';
import { CATEGORY_COLORS, DEFAULT_CHIP } from '@/constants';
import type { Roster } from '@/types';

describe('isValidName', () => {
  describe('rejects invalid names', () => {
    it('rejects strings longer than 25 characters', () => {
      expect(isValidName('A'.repeat(26))).toBe(false);
    });

    it('rejects strings with more than 4 words', () => {
      expect(isValidName('one two three four five')).toBe(false);
    });

    it('rejects the literal string "FALSE"', () => {
      expect(isValidName('FALSE')).toBe(false);
    });

    it('rejects the literal string "TRUE"', () => {
      expect(isValidName('TRUE')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidName('')).toBe(false);
    });

    it('rejects whitespace-only string', () => {
      expect(isValidName('   ')).toBe(false);
    });

    it('rejects null', () => {
      expect(isValidName(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isValidName(undefined)).toBe(false);
    });
  });

  describe('accepts valid names', () => {
    it('accepts "John Smith"', () => {
      expect(isValidName('John Smith')).toBe(true);
    });

    it('accepts "A/B-Flight"', () => {
      expect(isValidName('A/B-Flight')).toBe(true);
    });

    it('accepts a single name', () => {
      expect(isValidName('Anderson')).toBe(true);
    });

    it('accepts exactly 4 words', () => {
      expect(isValidName('John D Smith Jr')).toBe(true);
    });

    it('accepts exactly 25 characters', () => {
      expect(isValidName('A'.repeat(25))).toBe(true);
    });

    it('accepts names with hyphens and slashes', () => {
      expect(isValidName('O\'Brien-Smith')).toBe(true);
    });

    it('accepts names with leading/trailing spaces (trimmed)', () => {
      expect(isValidName('  John  ')).toBe(true);
    });
  });
});

describe('personCat', () => {
  const roster: Roster = {
    'FTC-A': ['Alpha One', 'Alpha Two'],
    'FTC-B': ['Bravo One', 'Bravo Two'],
    'Staff IP': ['Instructor Pilot'],
    'Staff IFTE/ICSO': ['Test Engineer'],
  };

  it('returns the correct category for a known person', () => {
    expect(personCat('Alpha One', roster)).toBe('FTC-A');
  });

  it('returns the correct category for staff', () => {
    expect(personCat('Instructor Pilot', roster)).toBe('Staff IP');
  });

  it('returns null for an unknown person', () => {
    expect(personCat('Unknown Person', roster)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(personCat('', roster)).toBeNull();
  });

  it('checks all categories', () => {
    expect(personCat('Bravo Two', roster)).toBe('FTC-B');
    expect(personCat('Test Engineer', roster)).toBe('Staff IFTE/ICSO');
  });
});

describe('chipColor', () => {
  const roster: Roster = {
    'FTC-A': ['Alpha One'],
    'FTC-B': ['Bravo One'],
    'Staff IP': ['Instructor Pilot'],
  };

  it('returns the correct color for a categorized person', () => {
    const color = chipColor('Alpha One', roster);
    expect(color).toEqual(CATEGORY_COLORS['FTC-A']);
  });

  it('returns correct color for FTC-B', () => {
    const color = chipColor('Bravo One', roster);
    expect(color).toEqual(CATEGORY_COLORS['FTC-B']);
  });

  it('returns correct color for Staff IP', () => {
    const color = chipColor('Instructor Pilot', roster);
    expect(color).toEqual(CATEGORY_COLORS['Staff IP']);
  });

  it('returns DEFAULT_CHIP for unknown person', () => {
    const color = chipColor('Unknown Person', roster);
    expect(color).toEqual(DEFAULT_CHIP);
  });

  it('returns color objects with bg and text properties', () => {
    const color = chipColor('Alpha One', roster);
    expect(color).toHaveProperty('bg');
    expect(color).toHaveProperty('text');
    expect(typeof color.bg).toBe('string');
    expect(typeof color.text).toBe('string');
  });
});
