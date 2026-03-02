/** Shape of the batch API response from Google Apps Script */
export interface BatchResponse {
  metadata: {
    'current-as-of': string;
    daysIncluded: number;
    cacheStatus: string;
    processingTime: string;
  };
  days: BatchDay[];
  error?: boolean;
  message?: string;
}

export interface BatchDay {
  name: string;       // e.g. "Tue 10 Feb"
  isoDate: string;    // e.g. "2026-02-10"
  structureUsed: string;
  data: BatchDayData;
}

export interface BatchDayData {
  flying?: string[][];
  ground?: string[][];
  na?: string[][];
  supervision?: string[][];
  academics?: string[][];
}

/** Shape of the roster API response */
export interface RosterResponse {
  roster: Record<string, string[]>;
  error?: boolean;
  message?: string;
}

/** Shape of the sheet-return format (used by sample data) */
export interface SheetReturn {
  schedule: SheetScheduleItem[];
}

export interface SheetScheduleItem {
  section: string;
  time: string;
  details: Record<string, string | null>;
  personnel: string[];
}
