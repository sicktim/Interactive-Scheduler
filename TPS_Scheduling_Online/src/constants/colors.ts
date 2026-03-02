import type { ChipColors } from '../types';

/** Personnel chip colors by roster category — matches source spreadsheet */
export const CATEGORY_COLORS: Record<string, ChipColors> = {
  'FTC-A':            { bg: '#7c3aed', text: '#f3e8ff' },  // purple
  'FTC-B':            { bg: '#ea580c', text: '#fff7ed' },  // orange
  'STC-A':            { bg: '#9333ea', text: '#fae8ff' },  // purple variant
  'STC-B':            { bg: '#f97316', text: '#ffedd5' },  // orange variant
  'Staff IP':         { bg: '#16a34a', text: '#dcfce7' },  // green
  'Staff IFTE/ICSO':  { bg: '#4338ca', text: '#e0e7ff' },  // indigo
  'Staff STC':        { bg: '#2563eb', text: '#dbeafe' },  // blue
  'Attached/Support': { bg: '#64748b', text: '#f1f5f9' },  // slate
};

/** Fallback chip color for unrecognized personnel */
export const DEFAULT_CHIP: ChipColors = { bg: '#475569', text: '#e2e8f0' };

/** Event class colors for selection screen grouping */
export const CLASS_COLORS: Record<string, {
  bg: string;
  border: string;
  text: string;
  cssClass: string;
}> = {
  'A-Class': { bg: 'rgba(168,85,247,0.08)', border: '#a855f7', text: '#d8b4fe', cssClass: 'class-group-a' },
  'B-Class': { bg: 'rgba(249,115,22,0.08)', border: '#f97316', text: '#fed7aa', cssClass: 'class-group-b' },
  'Staff':   { bg: 'rgba(34,197,94,0.08)',   border: '#22c55e', text: '#bbf7d0', cssClass: 'class-group-staff' },
  'Other':   { bg: 'rgba(100,116,139,0.08)', border: '#64748b', text: '#cbd5e1', cssClass: 'class-group-other' },
};

/** Section colors used in selection screen */
export const SECTION_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Flying: { bg: 'rgba(16,185,129,0.1)', border: '#10b981', text: '#6ee7b7' },
  Ground: { bg: 'rgba(245,158,11,0.1)', border: '#f59e0b', text: '#fde68a' },
  NA:     { bg: 'rgba(239,68,68,0.1)',   border: '#ef4444', text: '#fca5a5' },
};
