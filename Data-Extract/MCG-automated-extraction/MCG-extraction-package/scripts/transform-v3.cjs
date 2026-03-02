/**
 * MCG V2 → V3 Transformation Script
 *
 * Adds course assignments (FTC/STC/Shared) to every event using the cascade:
 *   explicit applicability > figure analysis > module mapping > phase mapping
 *
 * Also merges figure references and builds per-phase dependency edge lists.
 *
 * Usage: node scripts/transform-v3.cjs <class-dir>
 * Example: node scripts/transform-v3.cjs MCG-25B
 *
 * Expects:
 *   <class-dir>/Version-2-expanded-details/phase-*.json
 *   <class-dir>/figure-analysis.json (optional — proceeds without it)
 *   ../course-structure.json
 *
 * Produces:
 *   <class-dir>/Version-3-course-aware/phase-*.json
 *   <class-dir>/Version-3-course-aware/v3-validation-report.json
 *   <class-dir>/dependency-graph.json
 */

const fs = require('fs');
const path = require('path');

// ─── Configuration ────────────────────────────────────────────────

const CLASS_DIR = process.argv[2];
if (!CLASS_DIR) {
  console.error('Usage: node scripts/transform-v3.cjs <class-dir>');
  console.error('Example: node scripts/transform-v3.cjs MCG-25B');
  process.exit(1);
}

const SCRIPT_DIR = __dirname;
const BASE_DIR = path.resolve(SCRIPT_DIR, '..');
const TARGET_DIR = path.resolve(BASE_DIR, CLASS_DIR);

const V2_DIR = path.join(TARGET_DIR, 'Version-2-expanded-details');
const V3_DIR = path.join(TARGET_DIR, 'Version-3-course-aware');

const COURSE_STRUCTURE_PATH = path.join(BASE_DIR, 'course-structure.json');
const FIGURE_ANALYSIS_PATH = path.join(TARGET_DIR, 'figure-analysis.json');

const PHASE_CODES = ['AN', 'AS', 'CF', 'FQ', 'PF', 'SO', 'SY', 'TF', 'TL'];

// ─── Load Reference Data ──────────────────────────────────────────

function loadCourseStructure() {
  if (!fs.existsSync(COURSE_STRUCTURE_PATH)) {
    console.error(`ERROR: course-structure.json not found at ${COURSE_STRUCTURE_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(COURSE_STRUCTURE_PATH, 'utf8'));
}

function loadFigureAnalysis() {
  if (!fs.existsSync(FIGURE_ANALYSIS_PATH)) {
    console.warn('WARNING: figure-analysis.json not found — proceeding without figure data');
    return null;
  }
  return JSON.parse(fs.readFileSync(FIGURE_ANALYSIS_PATH, 'utf8'));
}

function loadV2Phase(phaseCode) {
  const filePath = path.join(V2_DIR, `phase-${phaseCode}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ─── Figure-Derived Assignments ───────────────────────────────────

function buildFigureAssignments(figureAnalysis) {
  const assignments = new Map(); // code -> { assignment, source }

  if (!figureAnalysis || !figureAnalysis.results) return assignments;

  for (const result of figureAnalysis.results) {
    const interp = result.interpretation;
    if (!interp) continue;

    // Course overview figures provide phase/module-level assignments
    if (result.classification?.figureType === 'course_overview') {
      const courseAssignments = interp.courseAssignments || [];
      for (const ca of courseAssignments) {
        assignments.set(ca.code, {
          assignment: ca.assignment,
          source: `Figure ${result.figure?.number || '?'}`
        });
      }
    }

    // Dependency flow figures may tag individual events
    if (interp.courseAssignments) {
      for (const ca of interp.courseAssignments) {
        if (!assignments.has(ca.code)) {
          assignments.set(ca.code, {
            assignment: ca.assignment,
            source: `Figure ${result.figure?.number || '?'}`
          });
        }
      }
    }
  }

  return assignments;
}

function buildFigureDependencyEdges(figureAnalysis) {
  const edges = [];

  if (!figureAnalysis || !figureAnalysis.results) return edges;

  for (const result of figureAnalysis.results) {
    const interp = result.interpretation;
    if (!interp) continue;

    // Dependency flow diagrams
    if (interp.edges) {
      for (const edge of interp.edges) {
        edges.push({
          from: edge.from,
          to: edge.to,
          type: edge.type || 'prerequisite',
          scope: edge.conditions ? { raw: edge.conditions } : null,
          source: 'figure',
          sourceDetail: `Figure ${result.figure?.number || '?'}: ${result.figure?.name || ''}`
        });
      }
    }

    // Also check for dependencyEdges in interpretation
    if (interp.dependencyEdges) {
      for (const edge of interp.dependencyEdges) {
        edges.push({
          ...edge,
          source: edge.source || 'figure',
          sourceDetail: edge.sourceDetail || `Figure ${result.figure?.number || '?'}`
        });
      }
    }
  }

  return edges;
}

// ─── Page-to-Phase Mapping for Figures ────────────────────────────

function buildPhaseFigures(figureAnalysis, phasePageRanges) {
  const phaseFigures = {}; // phaseCode -> Figure[]
  for (const code of PHASE_CODES) {
    phaseFigures[code] = [];
  }

  if (!figureAnalysis || !figureAnalysis.results) return phaseFigures;

  for (const result of figureAnalysis.results) {
    const page = result.page;
    if (!page) continue;

    // Find which phase this page belongs to
    for (const [phaseCode, range] of Object.entries(phasePageRanges)) {
      if (range && page >= range.start && page <= range.end) {
        phaseFigures[phaseCode].push({
          figureNumber: result.figure?.number || '?',
          figureName: result.figure?.name || '',
          pageNumber: page,
          imageFile: result.imageFile || null,
          figureType: result.classification?.figureType || 'other',
          interpretation: result.interpretation || null,
          confidence: result.classification?.confidence || 0
        });
        break;
      }
    }
  }

  return phaseFigures;
}

// ─── Course Assignment Cascade ────────────────────────────────────

function resolveEventCourseAssignment(event, moduleAssignment, phaseAssignment, figureAssignments) {
  // Priority 1: Explicit in event applicability
  const ad = event.applicabilityDetail;
  if (ad && ad.courseType) {
    return { assignment: ad.courseType, source: 'explicit' };
  }

  // Also check raw applicability array
  if (event.applicability) {
    const hasFTC = event.applicability.includes('FTC');
    const hasSTC = event.applicability.includes('STC');
    if (hasFTC && hasSTC) {
      return { assignment: 'Shared', source: 'explicit' };
    }
    if (hasFTC) {
      return { assignment: 'FTC', source: 'explicit' };
    }
    if (hasSTC) {
      return { assignment: 'STC', source: 'explicit' };
    }
  }

  // Priority 2: Figure-derived assignment for this specific event
  if (figureAssignments.has(event.code)) {
    const fa = figureAssignments.get(event.code);
    return { assignment: fa.assignment, source: 'figure' };
  }

  // Priority 3: Module-level assignment
  if (moduleAssignment && moduleAssignment !== 'Shared') {
    return { assignment: moduleAssignment, source: 'module' };
  }

  // Priority 4: Phase-level assignment
  return { assignment: phaseAssignment, source: 'phase' };
}

function resolveModuleCourseAssignment(moduleCode, phaseCode, courseStructure, figureAssignments) {
  // Check figure assignments for module code
  if (figureAssignments.has(moduleCode)) {
    return figureAssignments.get(moduleCode).assignment;
  }

  // Check course-structure.json
  const phaseInfo = courseStructure.phases[phaseCode];
  if (phaseInfo && phaseInfo.modules) {
    for (const [code, modInfo] of Object.entries(phaseInfo.modules)) {
      if (code === moduleCode) {
        return modInfo.courseAssignment;
      }
    }
  }

  // Fall back to phase assignment
  return phaseInfo ? phaseInfo.courseAssignment : 'Shared';
}

// ─── Transform a Phase ───────────────────────────────────────────

function transformPhaseToV3(v2Data, courseStructure, figureAssignments, phaseFigures) {
  const phaseCode = v2Data.phase;
  const phaseInfo = courseStructure.phases[phaseCode];
  const phaseAssignment = phaseInfo ? phaseInfo.courseAssignment : 'Shared';

  const v3Data = {
    schemaVersion: 3,
    phase: v2Data.phase,
    phaseName: v2Data.phaseName,
    courseAssignment: phaseAssignment,
    sourceDocument: v2Data.sourceDocument,
    extractedAt: v2Data.extractedAt,
    transformedAt: new Date().toISOString().split('T')[0],
    pageRange: v2Data.pageRange || null,
    figures: phaseFigures[phaseCode] || [],
    modules: v2Data.modules.map(mod => {
      const moduleAssignment = resolveModuleCourseAssignment(
        mod.moduleCode, phaseCode, courseStructure, figureAssignments
      );

      return {
        moduleCode: mod.moduleCode,
        moduleName: mod.moduleName,
        parentCourse: mod.parentCourse || null,
        courseAssignment: moduleAssignment,
        tlos: mod.tlos || [],
        events: mod.events.map(ev => {
          const resolved = resolveEventCourseAssignment(
            ev, moduleAssignment, phaseAssignment, figureAssignments
          );

          return {
            code: ev.code,
            eventName: ev.eventName,
            eventType: ev.eventType,
            eventTypeName: ev.eventTypeName || null,
            section: ev.section || null,
            courseAssignment: resolved.assignment,
            courseAssignmentSource: resolved.source,
            applicability: ev.applicability || [],
            applicabilityDetail: ev.applicabilityDetail || null,
            description: ev.description || '',
            duration: null, // MCG rarely specifies — populated from Continuity
            prerequisites: (ev.prerequisites || []).map(prereq => ({
              code: prereq.code,
              name: prereq.name,
              requiredFor: prereq.requiredFor || null,
              scope: prereq.scope || { positions: ['inherit'] },
              alternative: prereq.alternative || null,
              partialCompletion: prereq.partialCompletion || null,
              isExternal: prereq.isExternal || false,
              externalPhase: prereq.externalPhase || null,
              errata: prereq.errata || null,
              originalNotes: prereq.originalNotes || null
            })),
            schedulingNotes: null
          };
        })
      };
    }),
    summary: null // Computed below
  };

  // Compute summary
  v3Data.summary = computeV3Summary(v3Data);

  return v3Data;
}

function computeV3Summary(phaseData) {
  let totalModules = 0;
  let totalEvents = 0;
  let totalPrereqs = 0;
  const eventsByType = {};
  const eventsByCourse = { FTC: 0, STC: 0, Shared: 0 };
  let figureCount = phaseData.figures ? phaseData.figures.length : 0;

  for (const mod of phaseData.modules) {
    totalModules++;
    for (const ev of mod.events) {
      totalEvents++;
      totalPrereqs += ev.prerequisites.length;

      // By type
      const t = ev.eventType || '?';
      eventsByType[t] = (eventsByType[t] || 0) + 1;

      // By course
      const c = ev.courseAssignment || 'Shared';
      if (eventsByCourse[c] !== undefined) {
        eventsByCourse[c]++;
      }
    }
  }

  return {
    totalModules,
    totalEvents,
    totalPrerequisites: totalPrereqs,
    eventsByType,
    eventsByCourse,
    figureCount,
    dependencyEdgeCount: totalPrereqs // text-derived edges (figure edges added separately)
  };
}

// ─── Dependency Graph Builder ─────────────────────────────────────

function buildDependencyGraph(allV3Phases, figureDependencyEdges) {
  const nodes = [];
  const edges = [];
  const nodeSet = new Set();

  // Collect all nodes and text-derived edges
  for (const phase of allV3Phases) {
    for (const mod of phase.modules) {
      for (const ev of mod.events) {
        if (!nodeSet.has(ev.code)) {
          nodeSet.add(ev.code);
          nodes.push({
            code: ev.code,
            eventName: ev.eventName,
            phase: phase.phase,
            courseAssignment: ev.courseAssignment,
            eventType: ev.eventType
          });
        }

        for (const prereq of ev.prerequisites) {
          edges.push({
            from: prereq.code,
            to: ev.code,
            type: 'prerequisite',
            scope: {
              positions: prereq.scope?.positions || ['inherit'],
              courseType: prereq.scope?.courseType || null
            },
            source: 'text',
            sourceDetail: `phase-${phase.phase}.json`
          });
        }
      }
    }
  }

  // Add figure-derived edges (deduplicated)
  const edgeKeys = new Set(edges.map(e => `${e.from}->${e.to}`));
  for (const figEdge of figureDependencyEdges) {
    const key = `${figEdge.from}->${figEdge.to}`;
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push(figEdge);
    }
  }

  // Check for orphan prerequisite codes
  const orphanPrereqs = [];
  for (const edge of edges) {
    if (!nodeSet.has(edge.from)) {
      orphanPrereqs.push({ code: edge.from, referencedBy: edge.to, source: edge.source });
    }
  }

  // DAG cycle detection (simple DFS-based)
  const cycleDetected = detectCycles(nodes, edges);

  // Stats
  const edgesBySource = {};
  const edgesByType = {};
  for (const e of edges) {
    edgesBySource[e.source] = (edgesBySource[e.source] || 0) + 1;
    edgesByType[e.type] = (edgesByType[e.type] || 0) + 1;
  }

  return {
    sourceDocument: allV3Phases[0]?.sourceDocument || 'Unknown',
    generatedAt: new Date().toISOString(),
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      edgesBySource,
      edgesByType,
      orphanPrereqs: orphanPrereqs.length,
      cycleDetected
    },
    nodes,
    edges,
    orphanPrereqs
  };
}

function detectCycles(nodes, edges) {
  // Build adjacency list
  const adj = new Map();
  for (const node of nodes) {
    adj.set(node.code, []);
  }
  for (const edge of edges) {
    if (adj.has(edge.from)) {
      adj.get(edge.from).push(edge.to);
    }
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const node of nodes) {
    color.set(node.code, WHITE);
  }

  function dfs(u) {
    color.set(u, GRAY);
    for (const v of (adj.get(u) || [])) {
      if (color.get(v) === GRAY) return true; // Back edge = cycle
      if (color.get(v) === WHITE && dfs(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  }

  for (const node of nodes) {
    if (color.get(node.code) === WHITE) {
      if (dfs(node.code)) return true;
    }
  }
  return false;
}

// ─── Main ─────────────────────────────────────────────────────────

function main() {
  console.log(`MCG V2 → V3 Transformation`);
  console.log(`Class directory: ${CLASS_DIR}`);
  console.log('================================\n');

  // Load reference data
  console.log('Loading reference data...');
  const courseStructure = loadCourseStructure();
  const figureAnalysis = loadFigureAnalysis();
  console.log(`  course-structure.json: ${Object.keys(courseStructure.phases).length} phases`);
  console.log(`  figure-analysis.json: ${figureAnalysis ? figureAnalysis.results?.length || 0 : 'NOT FOUND'} figures`);

  // Build figure-derived data
  const figureAssignments = buildFigureAssignments(figureAnalysis);
  const figureDependencyEdges = buildFigureDependencyEdges(figureAnalysis);
  console.log(`  Figure assignments: ${figureAssignments.size}`);
  console.log(`  Figure dependency edges: ${figureDependencyEdges.length}`);

  // Build page-range mapping for figure-to-phase assignment
  const phasePageRanges = {};
  for (const code of PHASE_CODES) {
    const v2 = loadV2Phase(code);
    if (v2 && v2.pageRange) {
      phasePageRanges[code] = v2.pageRange;
    }
  }
  const phaseFigures = buildPhaseFigures(figureAnalysis, phasePageRanges);

  // Ensure output directory
  if (!fs.existsSync(V3_DIR)) {
    fs.mkdirSync(V3_DIR, { recursive: true });
  }

  // Transform each phase
  console.log('\nTransforming phases...');
  const allV3Phases = [];
  const validation = {
    transformedAt: new Date().toISOString(),
    phases: {},
    totals: { v2Events: 0, v3Events: 0, v2Prereqs: 0, v3Prereqs: 0 },
    courseBreakdown: { FTC: 0, STC: 0, Shared: 0 },
    sourceBreakdown: { explicit: 0, figure: 0, module: 0, phase: 0 },
    issues: []
  };

  for (const code of PHASE_CODES) {
    const v2Data = loadV2Phase(code);
    if (!v2Data) {
      console.log(`  SKIP: phase-${code}.json not found in V2`);
      continue;
    }

    const v3Data = transformPhaseToV3(v2Data, courseStructure, figureAssignments, phaseFigures);
    allV3Phases.push(v3Data);

    // Count V2 totals
    let v2Events = 0, v2Prereqs = 0;
    for (const mod of v2Data.modules) {
      for (const ev of mod.events) {
        v2Events++;
        v2Prereqs += ev.prerequisites.length;
      }
    }

    // Count V3 totals and course breakdown
    let v3Events = 0, v3Prereqs = 0;
    const phaseCourse = { FTC: 0, STC: 0, Shared: 0 };
    const phaseSource = { explicit: 0, figure: 0, module: 0, phase: 0 };

    for (const mod of v3Data.modules) {
      for (const ev of mod.events) {
        v3Events++;
        v3Prereqs += ev.prerequisites.length;
        phaseCourse[ev.courseAssignment] = (phaseCourse[ev.courseAssignment] || 0) + 1;
        phaseSource[ev.courseAssignmentSource] = (phaseSource[ev.courseAssignmentSource] || 0) + 1;
      }
    }

    validation.phases[code] = {
      v2Events, v3Events, match: v2Events === v3Events,
      v2Prereqs, v3Prereqs, prereqMatch: v2Prereqs === v3Prereqs,
      courseBreakdown: phaseCourse,
      sourceBreakdown: phaseSource
    };
    validation.totals.v2Events += v2Events;
    validation.totals.v3Events += v3Events;
    validation.totals.v2Prereqs += v2Prereqs;
    validation.totals.v3Prereqs += v3Prereqs;
    validation.courseBreakdown.FTC += phaseCourse.FTC;
    validation.courseBreakdown.STC += phaseCourse.STC;
    validation.courseBreakdown.Shared += phaseCourse.Shared;
    for (const [k, v] of Object.entries(phaseSource)) {
      validation.sourceBreakdown[k] = (validation.sourceBreakdown[k] || 0) + v;
    }

    // Sanity checks
    const phaseAssignment = courseStructure.phases[code]?.courseAssignment;
    if (phaseAssignment === 'FTC' && phaseCourse.STC > 0) {
      validation.issues.push({
        type: 'unexpected_course',
        phase: code,
        message: `FTC-only phase has ${phaseCourse.STC} STC events — check for explicit overrides`
      });
    }
    if (phaseAssignment === 'STC' && phaseCourse.FTC > 0) {
      validation.issues.push({
        type: 'unexpected_course',
        phase: code,
        message: `STC-only phase has ${phaseCourse.FTC} FTC events — check for explicit overrides`
      });
    }

    // Write V3 file
    const outPath = path.join(V3_DIR, `phase-${code}.json`);
    fs.writeFileSync(outPath, JSON.stringify(v3Data, null, 2), 'utf8');
    const size = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`  phase-${code}.json (${size} KB) — FTC:${phaseCourse.FTC} STC:${phaseCourse.STC} Shared:${phaseCourse.Shared}`);
  }

  // Build dependency graph
  console.log('\nBuilding dependency graph...');
  const depGraph = buildDependencyGraph(allV3Phases, figureDependencyEdges);
  const depPath = path.join(TARGET_DIR, 'dependency-graph.json');
  fs.writeFileSync(depPath, JSON.stringify(depGraph, null, 2), 'utf8');
  console.log(`  Nodes: ${depGraph.stats.totalNodes}`);
  console.log(`  Edges: ${depGraph.stats.totalEdges}`);
  console.log(`  Orphan prereqs: ${depGraph.stats.orphanPrereqs}`);
  console.log(`  Cycles detected: ${depGraph.stats.cycleDetected}`);

  // Write validation report
  validation.dependencyGraph = {
    nodes: depGraph.stats.totalNodes,
    edges: depGraph.stats.totalEdges,
    orphanPrereqs: depGraph.stats.orphanPrereqs,
    cycleDetected: depGraph.stats.cycleDetected
  };

  const reportPath = path.join(V3_DIR, 'v3-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(validation, null, 2), 'utf8');

  // Summary
  console.log('\n================================');
  console.log(`Events:  V2=${validation.totals.v2Events} → V3=${validation.totals.v3Events} (${validation.totals.v2Events === validation.totals.v3Events ? 'MATCH' : 'MISMATCH'})`);
  console.log(`Prereqs: V2=${validation.totals.v2Prereqs} → V3=${validation.totals.v3Prereqs} (${validation.totals.v2Prereqs === validation.totals.v3Prereqs ? 'MATCH' : 'MISMATCH'})`);
  console.log(`Course:  FTC=${validation.courseBreakdown.FTC} STC=${validation.courseBreakdown.STC} Shared=${validation.courseBreakdown.Shared}`);
  console.log(`Source:  explicit=${validation.sourceBreakdown.explicit} figure=${validation.sourceBreakdown.figure} module=${validation.sourceBreakdown.module} phase=${validation.sourceBreakdown.phase}`);
  if (validation.issues.length > 0) {
    console.log(`\nIssues (${validation.issues.length}):`);
    for (const issue of validation.issues) {
      console.log(`  [${issue.type}] ${issue.phase}: ${issue.message}`);
    }
  }
}

main();
