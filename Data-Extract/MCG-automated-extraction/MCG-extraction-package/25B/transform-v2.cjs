/**
 * MCG 25B V1 → V2 Transformation Script
 *
 * Expands raw prerequisite notes into structured scope, alternative,
 * and metadata fields. Expands event applicability arrays into
 * detailed position/courseType/clearance breakdowns.
 *
 * Usage: node transform-v2.js
 */

const fs = require('fs');
const path = require('path');

const V1_DIR = path.join(__dirname, 'Version-1-raw-data');
const V2_DIR = path.join(__dirname, 'Version-2-expanded-details');

const PHASE_FILES = [
  'phase-AN', 'phase-AS', 'phase-CF', 'phase-FQ', 'phase-PF',
  'phase-SO', 'phase-SY', 'phase-TF', 'phase-TL'
];

const ALL_POSITIONS = ['P', 'FTE', 'CSO', 'ABM', 'RPA'];

// Crew solo checkout code → aircraft mapping
const CREW_SOLO_MAP = {
  'CF 6673F': 'F-16',  // F-16 CF-4 (crew solo checkout)
  'CF 6681F': 'F-16',  // F-16 Flight Training (non-crew-solo pilot)
  'CF 6542F': 'C-12',  // C-12 CF-3 (crew solo checkout)
  'CF 6552F': 'C-12',  // C-12 Flight Training (non-crew-solo pilot)
  'CF 6362F': 'T-38',  // T-38 CF-3 (crew solo checkout)
  'CF 6370F': 'T-38',  // T-38 Flight Training (non-crew-solo context)
};

// Known position codes (used to separate positions from metadata in applicability arrays)
const POSITION_CODES = new Set(['P', 'FTE', 'CSO', 'ABM', 'RPA']);
const COURSE_TYPES = new Set(['FTC', 'STC']);
const CLEARANCE_TAGS = new Set(['US Only', 'non-US Only']);

// ─── Applicability Expansion ───────────────────────────────────────

function expandApplicability(appArray) {
  if (!appArray || appArray.length === 0) {
    return { positions: [...ALL_POSITIONS], courseType: null, clearance: null };
  }

  const positions = [];
  let courseType = null;
  let clearance = null;

  for (const tag of appArray) {
    if (POSITION_CODES.has(tag)) {
      positions.push(tag);
    } else if (COURSE_TYPES.has(tag)) {
      courseType = tag;
    } else if (CLEARANCE_TAGS.has(tag)) {
      clearance = tag === 'US Only' ? 'US_only' : 'non_US_only';
    }
  }

  // If only course type / clearance specified, all positions apply
  if (positions.length === 0) {
    return { positions: [...ALL_POSITIONS], courseType, clearance };
  }

  return { positions: positions.sort(), courseType, clearance };
}

// ─── Prerequisite Note Parser ──────────────────────────────────────

function parsePrereqNotes(notes, prereqCode, eventApplicability) {
  const result = {
    scope: {
      positions: ['inherit'],
      pilotType: null,
      crewSoloAircraft: null,
      dataGroup: null,
      clearance: null,
    },
    alternative: null,
    partialCompletion: null,
    isExternal: false,
    externalPhase: null,
    errata: null,
    originalNotes: notes,
  };

  if (!notes) return result;

  let remaining = notes;

  // ── Step 1: Errata patterns ──
  if (/Printed as|Listed as|PDF uses|differs from|Name in prerequisite/i.test(notes)) {
    result.errata = notes;
    // Errata notes don't contain applicability info, return early with inherit
    return result;
  }

  // ── Step 2: General enrollment ──
  if (notes.includes('General enrollment')) {
    result.errata = notes;
    return result;
  }

  // ── Step 3: External prerequisites ──
  const extMatch = notes.match(/External prerequisite from (\w+) phase/);
  if (extMatch) {
    result.isExternal = true;
    result.externalPhase = extMatch[1];
    return result;
  }

  // ── Step 4: Partial completion ──
  const hourMatch = notes.match(/Hour (\d+)/);
  if (hourMatch) {
    result.partialCompletion = `Hour ${hourMatch[1]}`;
    return result;
  }

  // ── Step 5: Timing constraint ──
  const timingMatch = notes.match(/\+\s*(\d+)\s*days/);
  if (timingMatch) {
    result.scope.timingConstraint = `+${timingMatch[1]} days`;
    return result;
  }

  // ── Step 6: Alternative pathways ──
  const orMatch = notes.match(/OR\s+((?:[A-Z]{2}\s+)?\w+)/);
  if (orMatch) {
    const altCode = orMatch[1].trim();
    result.alternative = {
      altCode: altCode,
      relationship: 'or',
    };
    // Remove the OR part to parse remaining positions (event codes can be 1 or 2 words)
    remaining = remaining.replace(/;?\s*OR\s+[A-Z]{2}\s+\S+/g, '').trim();
    remaining = remaining.replace(/;?\s*OR\s+\S+/g, '').trim();
  }

  const altOfMatch = notes.match(/alternative to\s+((?:[A-Z]{2}\s+)?\w+)/);
  if (altOfMatch) {
    const altCode = altOfMatch[1].trim();
    result.alternative = {
      altCode: altCode,
      relationship: 'or',
    };
    // Remove "alternative to XX NNNNX" (event codes can be 1 or 2 words)
    remaining = remaining.replace(/;?\s*alternative to\s+[A-Z]{2}\s+\S+/g, '').trim();
    remaining = remaining.replace(/;?\s*alternative to\s+\S+/g, '').trim();
  }

  // ── Step 7: Data group patterns ──
  const dgMatch = notes.match(/req'd for (T-38|Learjet|C-12|F-16) Data Group/);
  if (dgMatch) {
    result.scope.dataGroup = dgMatch[1];
    // Data group prereqs apply to positions that use that aircraft
    // The positions are already encoded in the prereq name itself
    result.scope.positions = ['all'];
    return result;
  }

  // ── Step 8: Clearance patterns ──
  if (notes.includes('US Only')) {
    result.scope.clearance = 'US_only';
    remaining = remaining.replace(/US Only;?\s*/g, '').trim();
  }

  // ── Step 9: Pilot sub-type patterns ──
  const crewSoloMatch = remaining.match(/(?:req'd for )?(P),?\s*(crew solo|non-crew solo)/i);
  if (crewSoloMatch) {
    result.scope.positions = ['P'];
    result.scope.pilotType = crewSoloMatch[2].toLowerCase().replace(/-/g, '_').replace(' ', '_');
    // Normalize: "crew_solo" or "non_crew_solo"
    if (result.scope.pilotType === 'crew_solo' || result.scope.pilotType === 'non_crew_solo') {
      // Good
    }
    // Derive aircraft from prereq code
    if (CREW_SOLO_MAP[prereqCode]) {
      result.scope.crewSoloAircraft = CREW_SOLO_MAP[prereqCode];
    }
    return result;
  }

  // Check for "select P" or "select FTE/P" patterns
  if (/select\s+P/i.test(remaining)) {
    result.scope.pilotType = 'select';
  }

  // ── Step 10: Parse position list ──
  const parsed = parsePositionList(remaining);
  if (parsed.positions.length > 0) {
    result.scope.positions = parsed.positions;
    if (parsed.courseType) result.scope.courseType = parsed.courseType;
  }

  // ── Step 11: "req'd for all" ──
  if (notes === "req'd for all") {
    result.scope.positions = ['all'];
  }

  return result;
}

function parsePositionList(text) {
  // Strip common prefixes
  let clean = text.replace(/^req'd for\s*/i, '').trim();
  // Strip trailing commas, semicolons
  clean = clean.replace(/[;,]\s*$/, '').trim();

  const positions = [];
  let courseType = null;

  // Split on / or ,
  const parts = clean.split(/[\/,]\s*/);
  for (let part of parts) {
    part = part.trim();
    if (!part) continue;
    // Normalize position codes
    const upper = part.toUpperCase();
    if (upper === 'P' || upper === 'PILOT' || upper === 'PILOTS') {
      positions.push('P');
    } else if (upper === 'FTE') {
      positions.push('FTE');
    } else if (upper === 'CSO') {
      positions.push('CSO');
    } else if (upper === 'ABM') {
      positions.push('ABM');
    } else if (upper === 'RPA') {
      positions.push('RPA');
    } else if (upper === 'FTC') {
      courseType = 'FTC';
      // FTC means all positions in FTC
      if (positions.length === 0) {
        positions.push(...ALL_POSITIONS);
      }
    } else if (upper === 'STC') {
      courseType = 'STC';
      if (positions.length === 0) {
        positions.push(...ALL_POSITIONS);
      }
    } else if (part.startsWith('select')) {
      // "select P" or "select FTE/P" — parse what follows
      const selectParts = part.replace('select', '').trim().split('/');
      for (const sp of selectParts) {
        const s = sp.trim().toUpperCase();
        if (POSITION_CODES.has(s)) positions.push(s);
      }
    }
  }

  return { positions: [...new Set(positions)].sort(), courseType };
}

// ─── Alternative Group Assignment ──────────────────────────────────

function assignAlternativeGroups(allPhases) {
  // Collect all OR pairs across all phases
  const orPairs = new Map(); // key: sorted pair of codes, value: groupId

  let groupCounter = 0;
  const generateGroupId = (codeA, codeB) => {
    const sorted = [codeA, codeB].sort().join('_');
    if (!orPairs.has(sorted)) {
      groupCounter++;
      orPairs.set(sorted, `alt_group_${groupCounter}`);
    }
    return orPairs.get(sorted);
  };

  // Pass 1: collect all alternative relationships
  for (const phase of allPhases) {
    for (const mod of phase.modules) {
      for (const ev of mod.events) {
        for (const prereq of ev.prerequisites) {
          if (prereq.alternative && prereq.alternative.altCode) {
            const groupId = generateGroupId(prereq.code, prereq.alternative.altCode);
            prereq.alternative.groupId = groupId;
          }
        }
      }
    }
  }

  return orPairs;
}

// ─── Transform a single event ──────────────────────────────────────

function transformEvent(event) {
  const transformed = {
    ...event,
    applicabilityDetail: expandApplicability(event.applicability),
    prerequisites: event.prerequisites.map(prereq => {
      const parsed = parsePrereqNotes(prereq.notes, prereq.code, event.applicability);
      return {
        code: prereq.code,
        name: prereq.name,
        requiredFor: prereq.requiredFor,
        scope: parsed.scope,
        alternative: parsed.alternative,
        partialCompletion: parsed.partialCompletion,
        isExternal: parsed.isExternal,
        externalPhase: parsed.externalPhase,
        errata: parsed.errata,
        originalNotes: prereq.notes,
      };
    }),
  };
  return transformed;
}

// ─── Transform a phase file ────────────────────────────────────────

function transformPhase(v1Data) {
  const v2Data = {
    ...v1Data,
    schemaVersion: 2,
    transformedAt: new Date().toISOString().split('T')[0],
    modules: v1Data.modules.map(mod => ({
      ...mod,
      events: mod.events.map(transformEvent),
    })),
  };

  // Rebuild summary with V2 stats
  const stats = computeV2Stats(v2Data);
  v2Data.summary = { ...v1Data.summary, ...stats };

  return v2Data;
}

// ─── Compute V2-specific summary stats ─────────────────────────────

function computeV2Stats(phaseData) {
  let totalPrereqs = 0;
  let inheritCount = 0;
  let allCount = 0;
  let positionSpecific = 0;
  let crewSoloCount = 0;
  let dataGroupCount = 0;
  let alternativeCount = 0;
  let externalCount = 0;
  let errataCount = 0;
  let partialCount = 0;
  const positionFreq = {};
  const altGroups = new Set();

  for (const mod of phaseData.modules) {
    for (const ev of mod.events) {
      for (const prereq of ev.prerequisites) {
        totalPrereqs++;
        const pos = prereq.scope.positions;
        if (pos.length === 1 && pos[0] === 'inherit') inheritCount++;
        else if (pos.length === 1 && pos[0] === 'all') allCount++;
        else {
          positionSpecific++;
          for (const p of pos) {
            positionFreq[p] = (positionFreq[p] || 0) + 1;
          }
        }
        if (prereq.scope.pilotType) crewSoloCount++;
        if (prereq.scope.dataGroup) dataGroupCount++;
        if (prereq.alternative) {
          alternativeCount++;
          if (prereq.alternative.groupId) altGroups.add(prereq.alternative.groupId);
        }
        if (prereq.isExternal) externalCount++;
        if (prereq.errata) errataCount++;
        if (prereq.partialCompletion) partialCount++;
      }
    }
  }

  return {
    v2Stats: {
      totalPrereqs,
      scopeBreakdown: {
        inherit: inheritCount,
        all: allCount,
        positionSpecific,
      },
      positionFrequency: positionFreq,
      crewSoloPrereqs: crewSoloCount,
      dataGroupPrereqs: dataGroupCount,
      alternativePrereqs: alternativeCount,
      alternativeGroups: [...altGroups],
      externalPrereqs: externalCount,
      errataCount,
      partialCompletionCount: partialCount,
    },
  };
}

// ─── Main ──────────────────────────────────────────────────────────

function main() {
  console.log('MCG 25B V1 → V2 Transformation');
  console.log('================================\n');

  const allV2Phases = [];
  const validation = {
    transformedAt: new Date().toISOString(),
    phases: {},
    totals: { v1Events: 0, v2Events: 0, v1Prereqs: 0, v2Prereqs: 0 },
    unmatchedNotes: [],
  };

  for (const file of PHASE_FILES) {
    const v1Path = path.join(V1_DIR, file + '.json');
    if (!fs.existsSync(v1Path)) {
      console.log(`SKIP: ${file}.json not found`);
      continue;
    }

    const v1Data = JSON.parse(fs.readFileSync(v1Path, 'utf8'));
    const v2Data = transformPhase(v1Data);
    allV2Phases.push(v2Data);

    // Count V1 events and prereqs
    let v1Events = 0, v1Prereqs = 0;
    for (const mod of v1Data.modules) {
      for (const ev of mod.events) {
        v1Events++;
        v1Prereqs += ev.prerequisites.length;
      }
    }

    // Count V2 events and prereqs
    let v2Events = 0, v2Prereqs = 0;
    for (const mod of v2Data.modules) {
      for (const ev of mod.events) {
        v2Events++;
        v2Prereqs += ev.prerequisites.length;
      }
    }

    validation.phases[v2Data.phase] = {
      v1Events, v2Events, match: v1Events === v2Events,
      v1Prereqs, v2Prereqs, prereqMatch: v1Prereqs === v2Prereqs,
    };
    validation.totals.v1Events += v1Events;
    validation.totals.v2Events += v2Events;
    validation.totals.v1Prereqs += v1Prereqs;
    validation.totals.v2Prereqs += v2Prereqs;

    console.log(`${v2Data.phase}: ${v2Events} events, ${v2Prereqs} prereqs ✓`);
  }

  // Assign alternative group IDs across all phases
  console.log('\nAssigning alternative group IDs...');
  const altGroups = assignAlternativeGroups(allV2Phases);
  console.log(`  ${altGroups.size} alternative groups found`);

  // Check for unmatched notes (notes that resulted in 'inherit' but had non-null content)
  for (const phase of allV2Phases) {
    for (const mod of phase.modules) {
      for (const ev of mod.events) {
        for (const prereq of ev.prerequisites) {
          if (prereq.originalNotes &&
              prereq.scope.positions.length === 1 &&
              prereq.scope.positions[0] === 'inherit' &&
              !prereq.isExternal &&
              !prereq.errata &&
              !prereq.partialCompletion &&
              !prereq.alternative &&
              !prereq.scope.dataGroup &&
              !prereq.scope.pilotType &&
              !prereq.scope.clearance &&
              !prereq.scope.timingConstraint) {
            validation.unmatchedNotes.push({
              phase: phase.phase,
              event: ev.code,
              prereq: prereq.code,
              notes: prereq.originalNotes,
            });
          }
        }
      }
    }
  }

  // Write V2 files
  console.log('\nWriting V2 files...');
  for (const phase of allV2Phases) {
    const outPath = path.join(V2_DIR, `phase-${phase.phase}.json`);
    fs.writeFileSync(outPath, JSON.stringify(phase, null, 2), 'utf8');
    const size = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`  phase-${phase.phase}.json (${size} KB)`);
  }

  // Write validation report
  const reportPath = path.join(V2_DIR, 'v2-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(validation, null, 2), 'utf8');
  console.log(`  v2-validation-report.json`);

  // Summary
  console.log('\n================================');
  console.log(`Events:  V1=${validation.totals.v1Events} → V2=${validation.totals.v2Events} (${validation.totals.v1Events === validation.totals.v2Events ? 'MATCH ✓' : 'MISMATCH ✗'})`);
  console.log(`Prereqs: V1=${validation.totals.v1Prereqs} → V2=${validation.totals.v2Prereqs} (${validation.totals.v1Prereqs === validation.totals.v2Prereqs ? 'MATCH ✓' : 'MISMATCH ✗'})`);
  console.log(`Unmatched notes: ${validation.unmatchedNotes.length}`);
  if (validation.unmatchedNotes.length > 0) {
    console.log('\n  Unmatched notes (had content but parsed as inherit):');
    for (const n of validation.unmatchedNotes) {
      console.log(`    ${n.phase} ${n.event} → ${n.prereq}: "${n.notes}"`);
    }
  }
}

main();
