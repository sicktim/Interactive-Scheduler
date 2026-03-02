import { describe, it, expect, beforeEach } from 'vitest';
import { mkId, resetIdCounter } from '@/utils/id';

describe('mkId', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it('generates sequential IDs starting from evt-1', () => {
    expect(mkId()).toBe('evt-1');
  });

  it('generates incrementing IDs on subsequent calls', () => {
    expect(mkId()).toBe('evt-1');
    expect(mkId()).toBe('evt-2');
    expect(mkId()).toBe('evt-3');
  });

  it('returns IDs with the "evt-" prefix', () => {
    const id = mkId();
    expect(id).toMatch(/^evt-\d+$/);
  });

  it('continues incrementing across many calls', () => {
    for (let i = 0; i < 99; i++) mkId();
    expect(mkId()).toBe('evt-100');
  });
});

describe('resetIdCounter', () => {
  it('resets the counter so next ID is evt-1', () => {
    mkId();
    mkId();
    mkId();
    resetIdCounter();
    expect(mkId()).toBe('evt-1');
  });

  it('can reset multiple times', () => {
    mkId();
    resetIdCounter();
    expect(mkId()).toBe('evt-1');
    mkId();
    mkId();
    resetIdCounter();
    expect(mkId()).toBe('evt-1');
  });
});
