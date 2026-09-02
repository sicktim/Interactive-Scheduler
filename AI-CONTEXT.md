# AI-CONTEXT.md — TPS Interactive Scheduler

> **Audience: AI coding assistants** (and the humans directing them) who need to understand,
> extend, or **replicate this application's features inside another system** — e.g. the USAF
> Test Pilot School Learning Management System (LMS).
>
> This document is maintained alongside the app. It encodes not just *what* the features are,
> but the **nuances and gotchas learned over months of scheduler-driven refinement**. If you are
> replicating this UI, treat the "Nuances" sections as requirements, not trivia — every one of
> them exists because a real scheduling workflow broke without it.

**Live app:** https://sicktim.github.io/Interactive-Scheduler/
**Repo:** https://github.com/sicktim/Interactive-Scheduler
**Sibling app (standalone Crew Rainbow, merged into this app in v4.3.0):**
https://sicktim.github.io/Schedule-Gantt/ · https://github.com/sicktim/Schedule-Gantt

---

## 1. What this application is

A **single-file React 18 scheduling app** for the USAF Test Pilot School. Schedulers use it to
view and rework the daily flying/ground schedule ("the Whiteboard") with three synchronized
views over one shared working dataset:

| View | Purpose | Interactivity |
|---|---|---|
| **Timeline** | Per-day event cards on a 06:00–18:00 horizontal timeline | Full editing: drag-drop personnel, edit/cancel/delete events, placeholders |
| **Rainbow** | Person × day grid ("crew rainbow") — every person's week at a glance | **Read-only by design** + filters, timeline marker/range scrubber, workload counters, person/event popups |
| **Whiteboard** | Faithful replica of the source spreadsheet layout (Supervision / Flying / Ground / Academics / NA tables) | Drag-drop personnel, FOA/AUTH duty pucks, highlights |

Data is **"semi-live"**: pulled on demand from a Google Sheet via a Google Apps Script (GAS)
web app. Users explicitly refresh; there is no polling. Local edits accumulate as a *working
copy* with change tracking, undo, and a copy-to-clipboard change summary — the sheet itself is
never written back by this app.

## 2. Tech stack (deliberate constraints)

- **One HTML file** (`index.html`): all CSS, all components, all logic. No build step.
- React 18 UMD + **Babel standalone** (JSX compiled in-browser) + Tailwind CDN + JetBrains Mono.
- Dark theme is the default; light theme = `.light-mode` class on `<body>` with ~500 lines of
  additive overrides (persisted in localStorage).
- **Consequence for editors:** the entire app lives in ONE `<script type="text/babel">` block.
  A single syntax error or duplicate top-level `const` anywhere renders a **blank page**. This
  is the #1 way merges break. Never paste a second app's script alongside; integrate surgically.

## 3. Data pipeline & contracts

### 3.1 GAS endpoints (read-only)

- `?type=roster` → `{ "FTC-A": ["Last, F", ...], "STC-A": [...], "FTC-B", "STC-B",
  "Staff IP", "Staff IFTE/ICSO", "Staff STC", "Attached/Support" }`
  Category names are **load-bearing** (ordering, colors, academics fan-out, filters).
- `?type=batch` → array of day payloads with raw sheet rows per section
  (`flying`, `ground`, `na`, `supervision`, `academics`) keyed by ISO date.
- `?type=batch&refresh=true` → forces GAS to rescan the spreadsheet (30–60 s), then returns.
  The UI distinguishes **Quick Refresh** (server cache, instant) from **Full Rescan**.
- GAS caches server-side (CacheService). The client stores *state*, not sheet data.

### 3.2 Raw sheet row → column map (end-exclusive slices)

- **Flying:** `0=Model 1=Brief 2=ETD 3=ETA 4=Debrief 5=Event 6–13=Crew 14=Notes 15=Eff 16=CX 17=PartE`
- **Ground:** `0=Event 1=Start 2=End 3–12=People 13=Notes 14=Eff 15=CX 16=PartE`
- **NA:** `0=Reason 1=Start 2=End 3–12=People 13=Notes` — **no cancelled column**
- **Supervision:** `row[0]=Duty`, then repeating triplets `(POC, start, end)` at indexes 1,4,7…
  Footer rows contain FOA/AUTH duty assignments (parsed as all-day, `startTime: null`).
- Parsers must **skip literal header rows** — first cell equal to `'Event'`, `'Events'`,
  `'Reason'`, `'Supervision'`, `'Academics'`, `'Notes'`. Real data repeats these headers.

### 3.3 Canonical event object (the app's single internal contract)

```js
{
  id: 'evt-N',                 // SESSION-SCOPED — regenerated every load. Never persist it.
  section: 'Flying'|'Ground'|'NA'|'Supervision'|'Academics',
  date: 'YYYY-MM-DD',
  model: string|null,          // aircraft or SIM/CR id (Flying only)
  eventName: string,
  startTime: 'HH:MM'|null,     // null ⇒ all-day FOA/AUTH supervision — guard ALL time math
  endTime: 'HH:MM'|null,
  etd: 'HH:MM'|null, eta: 'HH:MM'|null,   // Flying: actual airborne window inside brief→debrief
  personnel: string[],         // names exactly as they appear in the roster
  originalPersonnel: string[], // snapshot for change tracking
  notes: string|null,
  readonly: boolean,           // Academics (synthesized from roster category)
  cancelled: boolean, effective: boolean, partiallyEffective: boolean,
  isCustom?: true,             // user-created events (id 'custom-…', persisted separately)
  placeholders?: [{ id, role, filledBy }],
}
```

- **Cross-session identity** is the natural key `date|section|eventName|startTime|model` —
  used to restore selections and re-apply state after refresh. `id` is NOT stable.
- **Flying dual-time semantics:** `startTime/endTime` = brief→debrief (the outer bar);
  `etd/eta` = wheels-up→wheels-down (the solid inner bar). Both matter to schedulers.
- **Flying title fallback:** rows may have a model but no event name — show
  `model` (or `'A/C'`) rather than dropping the row. Schedulers rely on seeing these.

### 3.4 Client persistence (localStorage)

| Key | Contents |
|---|---|
| `tps-scheduler-state` | selection + UI state (restored by natural key) |
| `tps-scheduler-working` | the working copy (events + changes) — survives reload |
| `tps-scheduler-custom-events` | user-created events, merged after every fetch |
| `tps-scheduler-highlights` | whiteboard cell highlights |
| `tps-duty-assignments` | FOA/AUTH duty pucks |
| `tps-scheduler-theme` | `'light'`/`'dark'` |

An `initialized` ref guards against **phantom changes** being recorded while React state is
hydrating — without it, the change log fills with no-op entries on every load.

## 4. Shared systems (cross-view)

### 4.1 Conflict detection
`detectConflicts(events)` → `Map<eventId, Map<person, conflictingEvent[]>>`. Rules:
overlapping time ranges for the same person on the same date; **cancelled events excluded**;
**supervision-vs-supervision overlap allowed** (a person can hold two sup duties). Consumed by
event cards (red badges), picker chips, whiteboard cells, and the header conflict-summary modal.

### 4.2 Change tracking & undo
Every add/remove/edit/cancel/status change appends to a `changes` list, **net-collapsed per
event+person** (add then remove = no entry). Grouped undo restores `originalPersonnel`-based
state. A formatted change summary is copyable to clipboard for texting/emailing the squadron.

### 4.3 Drag & drop (Timeline + Whiteboard; Rainbow is intentionally not a drop surface)
Universal JSON payload via `dataTransfer.setData('text/plain', …)`:
```js
{ person: 'Last, F', sourceEventId: 'evt-3'|null,   // null = from picker (copy, not move)
  category?: 'FTC-A', isBlankPuck?: bool, role?: 'IP', sourceDuty?: 'FOA' }
```
Every drop target parses this one shape. If you add a drop surface, accept the same payload.

### 4.4 Focus mode
Clicking an event (when Focus is ON) grays out unavailable personnel everywhere and dims other
events. Focus is **cleared when entering the Rainbow view** (it has no focus participation).

### 4.5 View toggling — the single most copied pattern
All three views are **always mounted**; switching sets `display:none` on the inactive ones.
This preserves scroll positions, filters, and marker state across tab switches.
**Consequence:** any view must tolerate being rendered while hidden — `getBoundingClientRect`
and ResizeObserver read **zero** under `display:none`. Never measure-on-mount; prefer pure
CSS layout (sticky cells, grid) over JS measurement. (A ResizeObserver-based sticky header was
removed in v3.6 for exactly this reason; the standalone rainbow's JS height-sync was NOT
ported in v4.3.0 for the same reason.)

## 5. The Crew Rainbow view (v4.3.0 = standalone v6.3 feature parity)

The refined standalone **TPS Crew Rainbow** (Schedule-Gantt repo, v6.3) was merged into this
app's Rainbow view in v4.3.0. The standalone parses raw GAS sheet rows itself; the merged
version renders the same UI from this app's canonical events — one data source, no second
fetch. **If you are replicating the rainbow in an LMS, this section is the spec.**

### 5.1 Grid geometry
- Rows = **people** (roster order, grouped under category separator rows; order:
  FTC-A, STC-A, FTC-B, STC-B, Staff IP, Staff IFTE/ICSO, Staff STC, Attached/Support).
- Columns = **days**. Fixed **300 px per day** representing **06:00–18:00**
  (positions are percent-of-day; the 06:00–18:00 window is a squadron constant).
- Name column: sticky-left, opaque, 190 px. Headers: sticky-top, 54 px, with weekday + `D Mon`
  label and a 6/9/12/15/18 time ruler. Corner cell is sticky both ways.
- Events lane-pack greedily per cell (first lane whose last event ends before this one starts;
  missing end time ⇒ start + 60 min). Row height grows with lane count.
- Bars: 20 px tall, type-colored, ellipsized label, native tooltip `title\nstart–end`.

### 5.2 Color system (used consistently across bars, filter pills, badges)
| Type | Hex |
|---|---|
| Flying | `#10b981` |
| Ground | `#f59e0b` |
| NA | `#ef4444` |
| Supervision | `#8b5cf6` |
| Academics | `#3b82f6` |
| Notes (personnel status) | `#facc15` |
Tint formula for pills/badges: `color + '33'` (20% alpha background).
Flying bars are more translucent than others so the **solid inner ETD→ETA bar** reads clearly.

### 5.3 Features and their nuances
1. **Type filter pills** (double as the legend): Supv/Flt/Gnd/NAs/Acad (+ Notes when status
   data exists). Active = tinted; inactive = gray outline.
2. **Personnel filtering**: category dropdown (All / each category / disabled "Custom
   Selection" indicator) + a filter modal with search, per-name checkboxes, group toggles,
   Select/Deselect-All-Visible (acts only on the search-filtered set). Applying the modal sets
   the dropdown to "Custom".
3. **Timeline marker / range scrubber**: click a header ruler → red time marker (draggable
   chip with HH:MM label + full-height red line). Drag > 10 min → blue range with start/end
   handles, start/end/duration labels, **15-minute minimum width**. Escape or an empty-grid
   click clears it. Purely visual — never persisted.
4. **Weekly workload counters** (v6.3): per person, per week (current + next), count of
   **Flying and Ground events only** (per-person participation). Rendered right-aligned in the
   name cell: week label (that week's **Monday** as `M/DD`, gray) + fly count (green) + green
   dot + ground count (amber). Two checkboxes in the PERSONNEL corner toggle This Wk / Next Wk.
   Weeks are **Sunday–Saturday in America/Los_Angeles**. **Cancelled events are counted** —
   intentional v6.3 behavior (workload was planned, tallies still reflect it).
5. **Cancelled events** (v6.3): keep the type color but **0.4 opacity + strike-through label
   + ` [CANCELLED]` tooltip suffix**. Only Flying and Ground carry a CX column in the sheet;
   NA/Supervision/Academics can never be cancelled.
6. **Today + now** (v6.3): today's header gets a 3 px blue top border, tinted background, blue
   text. A **dashed vertical now-line** renders in today's column when Pacific "now" is within
   06:00–18:00. It is frozen at render time (no ticking interval) — accepted behavior.
7. **Person modal** (v6.3): click a name → two-week schedule (current + next week columns),
   rows = start time / type badge / title / M/DD. **Academics are excluded** (they'd flood the
   list — every student has them daily). Cancelled rows are dimmed + struck. Ignores all
   active filters.
8. **Event modal**: click a bar → time, date, section, ETD/ETA flight window, personnel,
   notes (yellow panel), CANCELLED chip.
9. **Personnel status notes** (v6.3): one-line yellow note pinned to the bottom of a person's
   day cell (e.g. leave, DNIF), toggled by the Notes pill. *Dormant in this app* until the
   batch feed supplies `personnelNotes` (the standalone's GAS endpoint does; this app's does
   not yet). The rendering + plumbing exist; supply `personnelStatuses = [{person, status,
   date}]` to activate.
10. **Pan-to-scroll** (v6.3): grab anywhere on the grid and drag to scroll both axes. A 5 px
    threshold distinguishes click from drag so bar/name clicks still work; a non-drag click on
    empty grid clears the marker/range.

### 5.4 Timezone model (subtle, deliberate)
- "Today", "now", and week bounds: **America/Los_Angeles** (squadron local time), via
  `toLocaleString`/`en-CA` tricks.
- **Header date labels: UTC** — ISO date strings are parsed with `Date.UTC` and formatted with
  `timeZone:'UTC'` to avoid off-by-one-day shifts. Do not "fix" this asymmetry; parsing
  `'YYYY-MM-DD'` in local time shifts the calendar for evening users.
- All date *comparisons* are ISO-string lexical comparisons, never Date math.

## 6. Gotchas — the hard-won list

These are the failure modes that actually happened. Replicate the behavior, not the bugs.

1. **Single-script fragility:** one duplicate `const` or JSX typo = blank page (no partial
   render). Namespace additions (`rb*` prefix used for rainbow helpers) and integrate edits
   surgically.
2. **`display:none` + measurement:** hidden views measure 0. Use CSS sticky/grid layout, not
   JS height-syncing, for frozen panes.
3. **`startTime: null` events exist** (FOA/AUTH all-day duties). Every time computation must
   guard or coerce (rainbow coerces to 06:00; timeline filters them out and renders them as
   header chips instead).
4. **Session ids vs natural keys:** event `id`s change every load. Anything persisted must key
   on `date|section|eventName|startTime|model`.
5. **Header-row sentinels in sheet data** (see 3.2) — skipping them is mandatory or ghost
   events appear.
6. **Flying rows without event names** are real events (model-only). Show them with the model
   as the title.
7. **Duplicate-event merging is intentionally disabled.** A merge heuristic
   (`mergeDuplicateEvents`) exists but returns input unchanged — it produced false positives
   with T-38 multi-line events. Whiteboard rows are the truth, duplicates and all.
8. **Cancelled ≠ deleted:** cancelled events stay visible (faded/struck) and are excluded from
   conflict detection, but still count in rainbow workload tallies.
9. **Conflict rules have exceptions:** supervision-vs-supervision overlaps are legal.
10. **CSS specificity battles are real:** light-mode overrides and whiteboard hover rules use
    deliberate `!important` chains to beat React inline styles and `tr:hover` rules. New CSS
    classes need matching `.light-mode` coverage or light theme silently regresses.
11. **Magic geometry constants must move together:** name column width (190 px) appears in the
    grid template AND the marker-line offset formula (`191 + dayIndex * 301`; 301 = 300 px
    column + 1 px grid gap). Header height (54 px) appears in header CSS AND the marker-line
    `top: 55px`. The 06:00–18:00 window and 300 px column width are used by every positioning
    formula.
12. **Window-level listeners:** marker drags and pan attach `pointermove/pointerup` to
    `window` (drags must survive leaving the element). Escape handlers exist in both the
    rainbow and the shell — they must stay compatible.
13. **Change-tracking hydration guard:** without the `initialized` ref, restoring the working
    copy on load records every restored event as a "change".
14. **Roster order is presentation order.** Never alphabetize; the squadron's roster order is
    intentional.

## 6b. Big Board integration (v4.4.0) — curriculum completion data

A second GAS feed (repo: https://github.com/sicktim/Big-Board-Summary, local sibling
project `MCG-Tracker/`) supplies per-student completion status for curriculum events,
consumed by the whiteboard/timeline **[+] add-person popup**.

### Data contract
- Endpoints: `?call=sheets_avail` (tab list) and `?call=fetch_sheet&sheet=<tabName>`.
- `fetch_sheet` returns `{ ok, sheetName, fetchedAt, classMeta: {startDate, endDate},
  students: [{col, name, type, dataGroup}], events: [{row, series, courseNo, eventNo,
  title, pilotGate, cells: [{col, value, bgHex, rgbFamily, strikethrough}]}] }`.
- `rgbFamily` classification (server-side): equal RGB ≥240 → `white`, ≥150 →
  `lightGrey`, else `darkGrey`; any non-grey color → `paired`.
- **Cell-status semantics** (port of MCG-Tracker `status.js` — the authority):
  `darkGrey` → not required · `lightGrey` → complete · `paired`+strikethrough →
  complete · `paired` → pending (pair-opted) · `white`+parseable date → scheduled
  (past date ⇒ flag `past-date-unchecked`, "verify" — still scheduled, not pending) ·
  `white` blank → pending. Ambiguous m/d dates that fit neither class-window year
  parse to null (never guess).
- Sheet tabs for a class are named inconsistently (`"26A FTC Big Board"`,
  `"***26A STC BigBoard***"`) — resolve by pattern (`/26A.*FTC/i` etc., excluding
  `Backup_*`), never hardcode.

### Matching rules (learned, load-bearing)
- **Events**: only whiteboard titles following the `Name (CODE)` convention (e.g.
  `SYS PRACT EXAM (SY 7511F)`) are matched — code normalized (uppercase, single
  space) against Big Board `eventNo`. Uncoded events are deliberately out of scope.
- **Students**: Big Board names are `<track letter> LASTNAME[, INITIAL][ *]`
  (track letters C/R/E/A/F/B/M; `*` = SRO — appears on BOTH systems sometimes).
  Whiteboard roster is `Last, F[ *]`. Match by last name scoped to the class's
  roster category (26A FTC→`FTC-A`, 26A STC→`STC-A`, 26B FTC→`FTC-B`,
  26B STC→`STC-B`), first-initial tiebreak on duplicate surnames; anything still
  ambiguous is reported as unmatched rather than guessed.
- **Authority boundary** (standing rule inherited from MCG-Tracker): the Big Board
  is authoritative for *scheduled/completed status only* — NOT for event
  applicability (the MCG is). `notreq` (darkGrey) students are hidden behind a
  "show N/A" toggle, never asserted as truly exempt.

### UX (the [+] popup, "grouped + badges" scheme)
Three tabs: **Big Board** / **Everyone** (type-ahead; roster too large to list) /
**Placeholders** (role chips). The Big Board tab groups candidates:
`NEEDS · AVAILABLE` (full color, one click adds) → `NEEDS · UNAVAILABLE` (dimmed,
red dashed outline, `!` with busy tooltip) → `SCHEDULED (not complete)` (blue dashed
outline + date badge; clicking arms a two-step "Add anyway?" so nobody double-books
by accident) → `COMPLETED` (greyscale + ✓). Availability = same-date, non-cancelled,
time-overlapping events (cancelled events never block — matches focus mode).
Data loads are explicit (30–60 s per class), cached locally, and always labeled
**"as of <fetch time>"** — schedulers must know how stale the board is. A header
"Big Board" button manages load/refresh/reset per class.

## 7. Replicating in another system (LMS guidance)

- **Minimal data contract** to drive a rainbow UI without this app's parsers:
  ```js
  events:   [{ type/section, title, start, end, person, date, etd?, eta?, notes?, cancelled? }]
            // pre-fanned: ONE object per person per event
  roster:   { category: [names] }     // ordering + grouping + filters
  dates:    ['YYYY-MM-DD', ...]       // column order
  statuses: [{ person, status, date }] // optional (Notes feature)
  ```
- **Feature-parity checklist** for a faithful rainbow: person×day grid (06:00–18:00, 300 px/day,
  frozen name column + sticky headers), lane-packed cells, Flying dual-bar, cancelled
  fade/strike, today highlight + now-line, weekly Fly/Gnd counters with week toggles,
  six filter pills, category dropdown + personnel filter modal, marker/range scrubber
  (15-min minimum), person modal (Academics excluded), event modal, pan-to-scroll,
  Quick-vs-Full refresh distinction with an "Updated: …" stamp.
- **What is intentional and should NOT be "improved" without asking the schedulers:**
  cancelled events counting toward workload; Academics excluded from the person modal;
  read-only rainbow (editing happens in Timeline/Whiteboard); duplicate events not merged;
  roster order preserved; UTC header dates + Pacific today/now.
- The standalone Crew Rainbow repo (https://github.com/sicktim/Schedule-Gantt) contains the
  reference implementation of the raw-sheet parsers (`?mode=full` GAS contract) if the LMS
  ingests sheet data directly rather than replacing the data layer.

## 8. Repo map

| Path | Contents |
|---|---|
| `index.html` | **The deployed app** (GitHub Pages serves this) |
| `Interactive-scheduler/interactive-scheduler.html` | Development twin — kept byte-identical to `index.html` |
| `Interactive-scheduler/docs/compartments/` | Per-subsystem docs (line refs may lag; concepts current) |
| `Interactive-scheduler/version-history.md` | Changelog |
| `Squadron Schedule API/` | GAS source for the data endpoint |
| `AI-CONTEXT.md` | This file |

*Last updated: 2026-07-29 (v4.4.0 Big Board integration + whiteboard UX batch — see
`Interactive-scheduler/version-history.md` for the full change list; other v4.4.0
whiteboard behaviors worth replicating: select-all-on-focus time entry with
Enter-commits/Tab-advances, SIM/CR rows tied to the preceding real flying row via
`attachedTo`/`rowIdx` with an Aircraft-vs-Whiteboard sort toggle, collapsible change
summary, editable academics block times).*
