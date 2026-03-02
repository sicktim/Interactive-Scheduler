/** Rainbow view column width for each date */
export const RAINBOW_COL_WIDTH = 300;

/** Rainbow filter buttons */
export const RAINBOW_FILTERS = [
  { key: 'Supervision', label: 'Supv', color: '#8b5cf6' },
  { key: 'Flying',      label: 'Flt',  color: '#10b981' },
  { key: 'Ground',      label: 'Gnd',  color: '#f59e0b' },
  { key: 'NA',          label: 'NAs',  color: '#ef4444' },
  { key: 'Academics',   label: 'Acad', color: '#3b82f6' },
] as const;

/** Rainbow bar CSS class by section */
export const RB_BAR_CLASS: Record<string, string> = {
  Flying:      'rb-bar-flying',
  Ground:      'rb-bar-ground',
  NA:          'rb-bar-na',
  Supervision: 'rb-bar-supervision',
  Academics:   'rb-bar-academics',
};
