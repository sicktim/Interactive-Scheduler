# Classification: tests/ Directory

## Summary
The `tests/` folder at `C:/Users/sickt/OneDrive/Documents/Claude/tps_schedule_gannt/tests/` belongs to the **TPS_Scheduling_Online (Phase 2)** project with **HIGH confidence**.

## Details

### Project Assignment
**TPS_Scheduling_Online / Phase 2 Modular Architecture**

### Confidence: HIGH (95%)

### Reasoning

1. **Vitest Configuration**
   - Configured in `vite.config.ts` with Vitest environment settings
   - Test glob pattern: `tests/**/*.test.ts` and `tests/**/*.test.tsx`
   - Package.json specifies `npm test: vitest run`
   - Vitest 2.1.8, jsdom 25.0.1, @testing-library/react 16.1.0 in devDependencies

2. **Test Import Patterns**
   - Tests import from `@/utils/*` (Vite path alias to `src/utils/`)
   - Path alias configured in `vite.config.ts`: `'@': path.resolve(__dirname, './src')`
   - This pattern is exclusive to the Phase 2 modular React/TypeScript architecture
   - Not used in legacy single-file HTML apps

3. **Tested Utilities**
   - Nine test files covering Phase 2 core utilities:
     - `time.test.ts` — timeToMinutes, minutesToTime, timePct, fmtDate
     - `id.test.ts` — ID generation/validation
     - `classification.test.ts` — event classification logic (classifyEvent, isStudentEventName)
     - `conflicts.test.ts` — conflict detection
     - `changes.test.ts` — schedule change computation
     - `persistence.test.ts` — localStorage handling
     - `layout.test.ts` — layout calculations
     - `transform.test.ts` — data transformation (transformBatchData, mergeDuplicateEvents)
     - `display.test.ts` — display formatting

4. **Build System Evidence**
   - React 18 type definitions used in tests
   - TypeScript strict mode (tsconfig.json in root)
   - Babel/JSX transpilation via Vite plugin-react
   - No single-file HTML references

5. **Exclusions (What It's NOT)**
   - NOT part of legacy Interactive-Scheduler single-file app (which is ~4,500 lines of inline React)
   - NOT part of GUI HTML Gantt chart (uses raw React + Babel in HTML, no build system)
   - NOT part of Data-Extract (JSON/PDF parsing, not unit tests)
   - NOT part of Squadron Schedule API (Google Apps Script, no Vitest)

### Verdict
The `tests/` directory is **exclusively part of the Phase 2 modular architecture** being developed in the TPS_Scheduling_Online project scope. Per `PROJECT-PLAN.md` Section 3, this modular version (with Vite, TypeScript, component separation) is the long-term deployment target, separate from the legacy single-file apps.

### Note on Repository Structure
This repository (`tps_schedule_gannt`) currently contains **both**:
- Legacy single-file apps (Interactive-Scheduler, GUI HTML) — near-term feature lab
- Phase 2 modular version (Vite/React/TypeScript in root) — eventual deployment target

The `tests/` directory belongs to the Phase 2 version. Per `PROJECT-PLAN.md`, when Phase 2 is production-ready, these files should migrate to the `TPS_Scheduling_Online` repository for long-term maintenance.
