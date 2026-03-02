import { describe, it, expect } from 'vitest';
import { timeToMinutes, minutesToTime, timePct, fmtDate } from '@/utils/time';
import { TIMELINE_START, TIMELINE_END, TIMELINE_RANGE } from '@/constants';

describe('timeToMinutes', () => {
  it('parses "06:00" to 360 minutes', () => {
    expect(timeToMinutes('06:00')).toBe(360);
  });

  it('parses "12:00" to 720 minutes', () => {
    expect(timeToMinutes('12:00')).toBe(720);
  });

  it('parses "00:00" (midnight) to 0 minutes', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('parses "23:59" to 1439 minutes', () => {
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('parses single-digit hour "7:30" to 450 minutes', () => {
    expect(timeToMinutes('7:30')).toBe(450);
  });

  it('returns null for null input', () => {
    expect(timeToMinutes(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(timeToMinutes(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(timeToMinutes('')).toBeNull();
  });

  it('returns null for non-time string', () => {
    expect(timeToMinutes('hello')).toBeNull();
  });

  it('parses time embedded in other text', () => {
    // regex finds HH:MM pattern within string
    expect(timeToMinutes('starts at 8:30 AM')).toBe(510);
  });
});

describe('minutesToTime', () => {
  it('converts 360 minutes to "06:00"', () => {
    expect(minutesToTime(360)).toBe('06:00');
  });

  it('converts 0 minutes to "00:00"', () => {
    expect(minutesToTime(0)).toBe('00:00');
  });

  it('converts 720 minutes to "12:00"', () => {
    expect(minutesToTime(720)).toBe('12:00');
  });

  it('converts 1439 minutes to "23:59"', () => {
    expect(minutesToTime(1439)).toBe('23:59');
  });

  it('pads single-digit hours with leading zero', () => {
    expect(minutesToTime(90)).toBe('01:30');
  });

  it('pads single-digit minutes with leading zero', () => {
    expect(minutesToTime(605)).toBe('10:05');
  });
});

describe('timePct', () => {
  it('returns 0 for TIMELINE_START (360 min)', () => {
    expect(timePct(TIMELINE_START)).toBe(0);
  });

  it('returns 100 for TIMELINE_END (1080 min)', () => {
    expect(timePct(TIMELINE_END)).toBe(100);
  });

  it('returns 50 for the midpoint (720 min = 12:00)', () => {
    const mid = TIMELINE_START + TIMELINE_RANGE / 2;
    expect(timePct(mid)).toBe(50);
  });

  it('clamps below TIMELINE_START to 0', () => {
    expect(timePct(0)).toBe(0);
  });

  it('clamps above TIMELINE_END to 100', () => {
    expect(timePct(2000)).toBe(100);
  });

  it('computes correct percentage for 09:00 (540 min)', () => {
    // (540 - 360) / 720 * 100 = 25
    expect(timePct(540)).toBe(25);
  });
});

describe('fmtDate', () => {
  it('formats "2026-02-03" correctly', () => {
    const result = fmtDate('2026-02-03');
    expect(result.weekday).toBe('Tue');
    expect(result.day).toBe(3);
    expect(result.month).toBe('Feb');
    expect(result.full).toBe('Tue 3 Feb');
  });

  it('formats "2026-01-01" as New Year correctly', () => {
    const result = fmtDate('2026-01-01');
    expect(result.weekday).toBe('Thu');
    expect(result.day).toBe(1);
    expect(result.month).toBe('Jan');
    expect(result.full).toBe('Thu 1 Jan');
  });

  it('formats "2026-12-25" (Christmas) correctly', () => {
    const result = fmtDate('2026-12-25');
    expect(result.weekday).toBe('Fri');
    expect(result.day).toBe(25);
    expect(result.month).toBe('Dec');
    expect(result.full).toBe('Fri 25 Dec');
  });

  it('returns correct structure shape', () => {
    const result = fmtDate('2026-06-15');
    expect(result).toHaveProperty('weekday');
    expect(result).toHaveProperty('day');
    expect(result).toHaveProperty('month');
    expect(result).toHaveProperty('full');
    expect(typeof result.weekday).toBe('string');
    expect(typeof result.day).toBe('number');
    expect(typeof result.month).toBe('string');
    expect(typeof result.full).toBe('string');
  });
});
