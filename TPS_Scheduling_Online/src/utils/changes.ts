import type { Change, EventMeta, NetInstruction } from '../types';

/**
 * Compute net changes from raw change list.
 *
 * This is the critical algorithm that collapses add+remove pairs
 * into 'move' instructions, handles net-zero cancellations, and
 * preserves rawIndices for undo capability.
 *
 * Directly ported from monolith lines 2099-2181.
 */
export function computeNetChanges(changes: Change[]): NetInstruction[] {
  if (!changes || changes.length === 0) return [];

  const netMap = new Map<string, {
    net: number;
    indices: number[];
    person: string;
    eventId: string;
    eventMeta: EventMeta;
  }>();

  changes.forEach((ch, idx) => {
    const key = `${ch.person}||${ch.eventId}`;
    if (!netMap.has(key)) {
      netMap.set(key, {
        net: 0, indices: [], person: ch.person, eventId: ch.eventId,
        eventMeta: {
          eventId: ch.eventId, eventName: ch.eventName, eventModel: ch.eventModel,
          eventTime: ch.eventTime, eventSection: ch.eventSection, date: ch.date,
        },
      });
    }
    const entry = netMap.get(key)!;
    entry.net += (ch.type === 'add' ? 1 : -1);
    entry.indices.push(idx);
  });

  const personEffects = new Map<string, {
    adds: Array<typeof netMap extends Map<string, infer V> ? V : never>;
    removes: Array<typeof netMap extends Map<string, infer V> ? V : never>;
    zeroIndices: number[];
  }>();

  for (const [, entry] of netMap) {
    if (!personEffects.has(entry.person)) {
      personEffects.set(entry.person, { adds: [], removes: [], zeroIndices: [] });
    }
    const pe = personEffects.get(entry.person)!;
    if (entry.net > 0) pe.adds.push(entry);
    else if (entry.net < 0) pe.removes.push(entry);
    else pe.zeroIndices.push(...entry.indices);
  }

  interface RawInstruction {
    type: 'add' | 'remove' | 'move';
    person: string;
    date: string;
    source: EventMeta | null;
    target: EventMeta | null;
    rawIndices: number[];
    firstIndex: number;
  }

  const rawInstructions: RawInstruction[] = [];

  for (const [person, pe] of personEffects) {
    pe.adds.sort((a, b) => Math.min(...a.indices) - Math.min(...b.indices));
    pe.removes.sort((a, b) => Math.min(...a.indices) - Math.min(...b.indices));
    const numMoves = Math.min(pe.adds.length, pe.removes.length);

    for (let i = 0; i < numMoves; i++) {
      const rem = pe.removes[i];
      const add = pe.adds[i];
      const allIndices = [...rem.indices, ...add.indices];
      if (numMoves === 1 && pe.adds.length === 1 && pe.removes.length === 1) {
        allIndices.push(...pe.zeroIndices);
      }
      rawInstructions.push({
        type: 'move', person, date: rem.eventMeta.date,
        source: rem.eventMeta, target: add.eventMeta,
        rawIndices: allIndices, firstIndex: Math.min(...allIndices),
      });
    }
    if (numMoves > 1 && pe.zeroIndices.length > 0) {
      rawInstructions[rawInstructions.length - numMoves].rawIndices.push(...pe.zeroIndices);
    }
    for (let i = numMoves; i < pe.adds.length; i++) {
      const add = pe.adds[i];
      rawInstructions.push({
        type: 'add', person, date: add.eventMeta.date,
        source: null, target: add.eventMeta,
        rawIndices: [...add.indices], firstIndex: Math.min(...add.indices),
      });
    }
    for (let i = numMoves; i < pe.removes.length; i++) {
      const rem = pe.removes[i];
      rawInstructions.push({
        type: 'remove', person, date: rem.eventMeta.date,
        source: rem.eventMeta, target: null,
        rawIndices: [...rem.indices], firstIndex: Math.min(...rem.indices),
      });
    }
  }

  // Group by operation + event pair
  const groupMap = new Map<string, NetInstruction>();
  rawInstructions.forEach(inst => {
    let groupKey: string;
    if (inst.type === 'move') groupKey = `move||${inst.source!.eventId}||${inst.target!.eventId}`;
    else if (inst.type === 'add') groupKey = `add||${inst.target!.eventId}`;
    else groupKey = `remove||${inst.source!.eventId}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        type: inst.type, persons: [], date: inst.date,
        source: inst.source, target: inst.target,
        rawIndices: [], firstIndex: inst.firstIndex,
      });
    }
    const group = groupMap.get(groupKey)!;
    group.persons.push(inst.person);
    group.rawIndices.push(...inst.rawIndices);
    group.firstIndex = Math.min(group.firstIndex, inst.firstIndex);
  });

  const result = Array.from(groupMap.values());
  result.sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : a.firstIndex - b.firstIndex
  );
  return result;
}
