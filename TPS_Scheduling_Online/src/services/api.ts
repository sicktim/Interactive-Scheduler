import type { BatchResponse, RosterResponse } from '../types';
import { API_URL } from '../constants';

/** Fetch the personnel roster from the Google Apps Script API */
export async function fetchRoster(): Promise<RosterResponse> {
  const res = await fetch(`${API_URL}?type=roster`);
  const json: RosterResponse = await res.json();
  if (json.error) throw new Error(json.message || 'Roster fetch failed');
  return json;
}

/** Fetch the batch schedule data */
export async function fetchBatch(refresh = false): Promise<BatchResponse> {
  const url = refresh
    ? `${API_URL}?type=batch&refresh=true`
    : `${API_URL}?type=batch`;
  const res = await fetch(url);
  const json: BatchResponse = await res.json();
  if (json.error) throw new Error(json.message || 'Batch fetch failed');
  return json;
}
