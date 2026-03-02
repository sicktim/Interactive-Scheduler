# Theme System Compartment

---

## Purpose

The theme system provides a user-togglable light/dark display mode for the entire Interactive Scheduler application. Dark mode is the default. Light mode applies a comprehensive set of CSS overrides via a `.light-mode` class on `<body>`. The user's preference is persisted to `localStorage` so it survives page reloads. The toggle button is fixed-position and always visible regardless of which screen (Loading, Selection, or Scheduler) is currently rendered.

The system was introduced in **v3.6.1** in direct response to user feedback in `feedback.txt` (Version 3.7 Feedback section, line 191: "Light/dark mode").

---

## Owner Boundaries

The theme system owns:
- The `THEME_KEY` constant and all `localStorage` reads/writes for theme preference
- The `darkMode` state variable and `setDarkMode` updater inside `App()`
- The `useEffect` that applies/removes the `light-mode` class on `document.body`
- The `themeToggle` JSX element (the button rendered on every screen)
- The `.theme-toggle-container` and `.theme-toggle-btn` CSS blocks (dark-mode defaults)
- The entire `.light-mode` CSS override block (lines 1873–2369)

The theme system does NOT own:
- Any component's internal layout or data logic — it only provides visual overrides
- The `CATEGORY_COLORS` constant (accent colors are theme-invariant — see below)
- Conflict detection or focus mode logic (those just get their colors overridden)

---

## Key Elements and Line References

### JavaScript Constants and State

| Element | Location | Notes |
|---|---|---|
| `THEME_KEY` constant | Line 8280 | Value: `'tps-scheduler-theme'` |
| `darkMode` state | Line 8284 | Initializes from localStorage; `!== 'light'` means dark is default |
| `useEffect` applying class | Lines 8286–8289 | Calls `document.body.classList.toggle('light-mode', !darkMode)` |
| `themeToggle` JSX element | Lines 8446–8454 | `<div className="theme-toggle-container"><button ...>` |
| Loading screen render | Line 8471 | `{themeToggle}` prepended to `<LoadingScreen>` |
| Selection screen render | Lines 8473–8486 | `{themeToggle}` prepended to `<EventSelectionScreen>` |
| Scheduler screen render | Lines 8489–8491 | `{themeToggle}` inside SchedulerView return |
| Error screen render | Lines 8456–8468 | `{themeToggle}` also present on error fallback |

### Dark Mode Icon Logic (lines 8451–8452)

```javascript
title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
>{darkMode ? '\u2600' : '\u263D'}</button>
```

- `\u2600` = sun (shown when in dark mode — click to go light)
- `\u263D` = crescent moon (shown when in light mode — click to go dark)

### CSS: Theme Toggle Button Dark Defaults (lines 1254–1280)

```css
/* ===== THEME TOGGLE ===== */
.theme-toggle-container {
    position: fixed;
    top: 7px;
    left: 240px;
    z-index: 9999;
}
.theme-toggle-btn {
    width: 40px; height: 40px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.06);
    color: #fbbf24;          /* amber — sun icon color in dark mode */
    font-size: 1rem;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
    backdrop-filter: blur(8px);
    line-height: 1;
}
.theme-toggle-btn:hover {
    background: rgba(255,255,255,0.12);
    border-color: rgba(255,255,255,0.3);
    transform: scale(1.08);
}
```

Position note: `left: 240px` places the button to the right of the app's 240px-wide left gutter/header area so it does not overlap navigation controls.

---

## CSS Architecture

### Dark Mode (Default)

Dark mode is the baseline. No `.light-mode` class is present on `<body>`. All base CSS rules in `<style>` define the dark appearance: dark gradient backgrounds (`#1a1a2e` through to `#0f0f1a`), light-on-dark text, semi-transparent surfaces, and amber/white accent details.

The `<meta name="theme-color" content="#1a1a2e">` tag at line 36 sets the browser chrome to match the dark background.

### Light Mode CSS Override Block

The light mode override block begins at **line 1873** and ends at **line 2369** (closing `}` of `</style>` is at line 2370). Total span: approximately **497 lines** of CSS.

The block is organized into named sections with inline comments:

| Line range | Section |
|---|---|
| 1873–1878 | Body background and base color |
| 1880–1888 | Theme toggle button overrides |
| 1890–1897 | App header (chrome) |
| 1899–1909 | Timeline area, change summary panel, picker panel surfaces |
| 1911–1927 | Day columns and day headers |
| 1929–1933 | Section dividers (Flying/Ground/NA) |
| 1935–1960 | Event cards (flying/ground/na) + event title bars + labels |
| 1962–1963 | Personnel chips hover |
| 1965–1971 | Conflict tooltip portal |
| 1973–1983 | Focus toggle button (on/off states) |
| 1985–2008 | Modal overlay and content (including form inputs/selects) |
| 2010–2024 | Picker panel (tabs, search, blank pucks, section labels) |
| 2026–2049 | Change summary panel (header, date groups, entries, footer) |
| 2051–2098 | Event selection screen (day headers, rows, checkboxes, quick-select buttons) |
| 2101–2121 | Miscellaneous controls (loading screen, spinner, filter buttons, day tabs, saved indicator) |
| 2123–2126 | Scrollbar (webkit: track, thumb, corner) |
| 2128–2132 | View toggle tabs (Timeline/Rainbow/Whiteboard switcher) |
| 2134–2181 | Rainbow view (area, toolbar, corner, date headers, name cells, data cells, event bars) |
| 2183–2195 | Rainbow filter modal |
| 2197–2242 | Inline style overrides — `!important` rules targeting React-injected `style` props |
| 2244–2288 | Action menu portal and action tooltip (also has dark defaults in this block) |
| 2290–2369 | Whiteboard view (all wb-* rules) |

### `!important` Usage

Light mode uses `!important` selectively to beat React inline style props. These are documented in the "Inline style overrides" section (lines 2197–2242). Known uses:

- `.light-mode .app-header h1` and `p` — React applies inline `color` in some header renders
- `.light-mode .event-name-text`, `.event-time-text` — React inline styles on text elements
- `.light-mode .modal-content h3`, `h2`, `p` — modal titles and paragraphs use inline colors
- `.light-mode .modal-content select, input` — `background`, `color`, `border-color` all need `!important`
- `.light-mode .change-summary-footer button` — inline color prop
- `.light-mode .rainbow-toolbar span`, `select`, `button[style]` — toolbar controls use React `style` prop
- `.light-mode .selection-section-title span` — uses `color: inherit !important` to prevent bleed-through
- `.light-mode .day-header > div > div:first-child/last-child` — day header text colors
- `.light-mode .change-entry .change-detail span` — change detail span inherits from inline style
- `.light-mode .change-summary-header span` — same issue
- `.light-mode .filter-btn[style]` and `span:last-child` — Refresh button uses inline style prop
- `.light-mode .wb-cell-editing`, `.wb-row-effective:hover td`, `.wb-row-partial:hover td`, `.wb-row-cancelled:hover td` — these use `!important` to override the general `tr:hover td` rule within the same light-mode block

### Scrollbar Overrides (lines 2123–2126)

Only webkit scrollbar properties are overridden in light mode. The dark-mode defaults use `rgba(255,255,255,0.08/0.15)` style track/thumb colors. In light mode:

```css
.light-mode ::-webkit-scrollbar-track { background: rgba(0,0,0,0.03); }
.light-mode ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); }
.light-mode ::-webkit-scrollbar-corner { background: #f0f4f8; }
```

---

## Component Coverage

Every major component area has explicit `.light-mode` overrides:

### LoadingScreen

- Lines 2102–2106: `color: #1e293b` (dark text on light background), spinner recolored from white to `#3b82f6`

### EventSelectionScreen

- Lines 2051–2098: Day headers, event rows, checkboxes, crew preview text, NA category chips, separators, and quick-select group buttons (active-a/active-b/active-staff states)
- Line 2197–2200: `selection-section-title span` and `day-header` child div colors (inline style overrides)
- Lines 2222–2225: Tailwind utility class overrides for `.text-gray-500/600` inside `.selection-body`

### SchedulerView — Timeline

- Lines 1899–1960: Timeline area background, day columns, day headers, section dividers (Flying/Ground/NA labeled with appropriate accent tints), event cards per section, title bars, labels, event name/time text, flight bar track

### SchedulerView — Picker Panel

- Lines 1906–1909: Panel surface
- Lines 2010–2024: Picker tabs (default/hover/active), search input (background/border/text/placeholder), blank puck divider and chip borders, section label color

### SchedulerView — Change Summary Panel

- Lines 1902–1905: Panel surface and border
- Lines 2026–2049: Header, date group rows, change entries (hover/border), detail text, undo button, footer and footer button

### Conflict Tooltip Portal

- Lines 1965–1971: White background, red border (`#ef4444`), dark red text (`#991b1b`), drop shadow. Note: the conflict tooltip in dark mode uses a dark semi-transparent background with red text. In light mode it inverts to white-on-red-border for clarity.

### Focus Mode Toggle

- Lines 1973–1983: `on` state uses blue tint background and `#2563eb` text; `off` state uses near-invisible gray

### Modals (CreateEventModal, RefreshModal, RainbowModal, RainbowFilterModal, EditEventModal, ConfirmDeleteModal)

- Lines 1985–2008: All modal overlays get lighter scrim (`rgba(0,0,0,0.35)`), modal content becomes white with light border. All heading, paragraph, and span colors overridden. Form inputs/selects get `#f1f5f9` background with dark text.
- Lines 2286–2288: Additional targeting for `.edit-event-modal-title` and `.confirm-delete-modal-title`

### Rainbow View

- Lines 2134–2195: Full coverage including area background, toolbar surface, filter button, corner cell (with drop shadow), date headers (weekday/day-month colors), time ruler, name cells (opaque white with right shadow), category separator, data cells, hour grid lines, event bars (white text maintained, with added text-shadow for legibility against colored bars), hover states, and the full filter modal panel
- Lines 2208–2219: Inline style overrides for rainbow toolbar span/select/button elements

### Whiteboard View

- Lines 2290–2369: The largest single light-mode section. Full details in the Whiteboard subsection below.

### Event Action Menu (right-click / long-press portal)

- Lines 2277–2284: Drop shadow reduced from `rgba(0,0,0,0.6)` to `rgba(0,0,0,0.25)` (less dramatic on white). Action tooltip background inverted from near-black to `rgba(15,23,42,0.9)` with `#f8fafc` text.

### View Toggle Tabs (Timeline/Rainbow/Whiteboard row)

- Lines 2128–2132: Tab strip background from near-transparent to `rgba(0,0,0,0.04)`, inactive tab text from white-alpha to black-alpha, active tab uses `#2563eb` blue with light blue background tint

### Day Tabs / Filter Buttons / Saved Indicator

- Lines 2107–2121: Filter buttons get dark border/text colors, day tabs get dark text, today tab uses blue tint, the "Saved" indicator becomes `#059669` (emerald green on white is readable without change to green hue)

---

## Whiteboard View Detail (lines 2290–2369)

The Whiteboard compartment is the largest single consumer of light-mode overrides because it introduced after v3.6.1 and contains its own rich CSS ruleset. Key behaviors:

**Date header row** (line 2291): `#f1f5f9` (light slate) rather than dark slate

**Section title bars** (lines 2293–2298): Each section type gets a semantically-colored light tint:
- Flying: emerald text on `#e6f7f2`
- Ground: amber text on `#fef3cd`
- NA: dark red text on `#fee2e2`
- Supervision: dark purple text on `#ede9fe`
- Academics: dark blue text on `#dbeafe`

**Table cells** (lines 2299–2308): Column headers get `rgba(0,0,0,0.03)` background with muted text; data cells get near-black text with subtle border

**Status row hover colors** (lines 2309–2312): The generic `tr:hover td` override (`rgba(0,0,0,0.02)`) would wash out the green/yellow/red status rows. These three rules use `!important` to preserve:
- `wb-row-effective:hover td`: `rgba(34,197,94,0.16)`
- `wb-row-partial:hover td`: `rgba(234,179,8,0.16)`
- `wb-row-cancelled:hover td`: `rgba(239,68,68,0.16)`

**Status row base colors** (lines 2346–2348): Even without hover, effective/partial/cancelled rows get `0.1` opacity tints of green/yellow/red respectively

**Crew assignment cells** (lines 2316–2345): Crew chip remove buttons, empty crew placeholders, drop zones, placeholder chips (including generic), warning banners, fill prompts, and add-placeholder popover all themed

**Highlight cells** (lines 2349–2355): `wb-highlight-yellow/purple/orange/red` all use `rgba(..., 0.2)` tint via `inset box-shadow` (slightly lower opacity than dark mode's `0.25`). The highlight toggle button also has its `active` state styled.

**Duty section** (lines 2356–2358): Duty slot labels and drop zones themed; drag-over state uses blue border/background

**Supervision group column separators** (lines 1448–1451): The `wb-supv-group-start` rule draws a bold left border. Dark mode uses `rgba(255,255,255,0.18)`, light mode uses `rgba(0,0,0,0.18)`.

**Add row / delete button** (lines 2359–2369): Add-row button gets muted black border/text with blue hover. Delete button fades from `rgba(0,0,0,0.2)` to `#ef4444` on hover.

---

## Accent Colors (Theme-Invariant)

These colors are hardcoded in the `CATEGORY_COLORS` constant at lines 2426–2436 and applied via inline `style` props to chip and bar elements throughout the app. They do not change between dark and light mode. The decision was made because:

1. The colors are designed to match the source Google Sheets spreadsheet exactly
2. The color contrast of these chips (light text on saturated background) is sufficient on both white and dark page backgrounds
3. Changing them per-theme would require threading a `darkMode` prop through every component

| Category | Background | Text | Dark-mode purpose |
|---|---|---|---|
| FTC-A | `#7c3aed` | `#f3e8ff` | Purple |
| FTC-B | `#ea580c` | `#fff7ed` | Orange |
| STC-A | `#9333ea` | `#fae8ff` | Purple variant |
| STC-B | `#f97316` | `#ffedd5` | Orange variant |
| Staff IP | `#16a34a` | `#dcfce7` | Green |
| Staff IFTE/ICSO | `#4338ca` | `#e0e7ff` | Indigo |
| Staff STC | `#2563eb` | `#dbeafe` | Blue |
| Attached/Support | `#64748b` | `#f1f5f9` | Slate |

The `DEFAULT_CHIP` fallback (line 2438) is `{ bg: '#475569', text: '#e2e8f0' }` (slate) — also not theme-toggled.

Rainbow view event bars (`rb-event-bar`) use the same `CATEGORY_COLORS` inline. The light-mode rule at line 2179 sets `color: rgba(255,255,255,0.95)` to ensure text on those saturated bars stays white-on-color in light mode (same as dark). The `text-shadow` rule at line 2180 adds a subtle dark halo for legibility against very light page backgrounds.

Conflict outline colors (`#fbbf24` amber, introduced in v3.1) are also not theme-toggled — amber is readable on all backgrounds.

---

## State Connections

```
localStorage key: 'tps-scheduler-theme'
    |
    v
App() useState: darkMode (bool)     <-- initialized from localStorage on mount
    |
    | useEffect [darkMode]
    v
document.body.classList.toggle('light-mode', !darkMode)
localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light')
    |
    v
CSS: .light-mode .* overrides take effect (purely CSS cascade, no JS re-render)
```

The `darkMode` state is not passed as a prop to any child component. All theming is handled purely by the presence or absence of `light-mode` on `<body>`. This means:

- No component knows about the theme directly
- Components that use React inline `style` props are overridden via CSS attribute selectors (e.g., `button[style]`)
- The `themeToggle` JSX is composed once in `App()` and inserted identically into each screen's return

---

## Cross-Compartment Dependencies

The theme system has a **read dependency** on almost every CSS class in the application — it must have a parallel `.light-mode` rule for anything that uses dark-mode-specific colors.

Key dependencies by direction:

**Theme system overrides these compartments:**
- Timeline view: day columns, headers, section dividers, event cards, tooltip portal
- Rainbow view: all rb-* classes, toolbar, filter modal
- Picker panel: tabs, search, blank pucks, picker chip hover
- Change summary: header, date groups, entries, undo, footer
- Event selection screen: day headers, rows, NA chips, quick-select buttons
- Whiteboard view: all wb-* classes (largest block)
- Modals (all): overlay scrim, content surface, inputs
- Event action menu: drop shadow, tooltip
- View tab switcher: the three-way tab row
- Scrollbars: webkit track/thumb/corner
- Loading screen: text and spinner

**Theme system is independent of:**
- Data pipeline (roster, events, API)
- Conflict detection logic
- Focus mode logic (only colors change)
- Drag-and-drop handlers
- localStorage keys used by other features (`tps-scheduler-state`, `tps-scheduler-working`, `tps-scheduler-custom-events`)
- `CATEGORY_COLORS` constant (accent colors are invariant)

**Compartments that may break theme if they add new components:**
- Any new component using React `style` props with hardcoded dark colors must add a corresponding `.light-mode [selector][style]` override if it needs to differ in light mode
- Any new CSS class introduced by a new feature should audit whether it needs a `.light-mode` counterpart

---

## Bug History and Known Issues

### v3.6.1 Introduction
The theme system was introduced at v3.6.1 per user request. No pre-existing bugs because no prior theme existed.

### CF/Airmanship Classification Fix (also in v3.6.1)
The version-history entry for v3.6.1 notes a "CF/AIRMANSHIP classification fix also included (two-pass sibling inheritance in EventSelectionScreen useMemo)." This was bundled into the same version but is unrelated to the theme system itself.

### Event Merging Disabled (v3.7.0)
`mergeDuplicateEvents()` was disabled in v3.7.0 (feedback.txt lines 183–184). This is unrelated to theming.

### Known Limitations / Watch Items

1. **Tailwind utility classes**: Some components use Tailwind classes like `.text-gray-500` directly on elements. Lines 2222–2225 override these within `.selection-body`, but if Tailwind classes are used in other contexts in light mode they will revert to their Tailwind dark-friendly defaults. Any new Tailwind usage should be audited.

2. **New wb-* rules added without light-mode counterparts**: The whiteboard compartment actively expands. If new `wb-*` CSS classes are introduced in dark mode with dark-specific colors, they must receive `.light-mode` counterparts or they will appear broken in light mode.

3. **Action menu SVG**: The event action menu uses an SVG with hardcoded fill colors. The drop shadow is adjusted by light-mode (line 2278) but the SVG segment colors themselves are not theme-aware. If the SVG palette is dark-only, those icons may be hard to see on a white background. This has not been reported as a bug but should be verified.

4. **`meta[theme-color]`**: Line 36 sets browser chrome color to `#1a1a2e` (dark). This is not updated dynamically when light mode is activated. Updating it would require a `useEffect` to call `document.querySelector('meta[name=theme-color]').setAttribute(...)`. Currently not implemented; low priority since this only affects mobile browser chrome tinting.

5. **`position: fixed; left: 240px` toggle button**: If the app header layout ever changes such that the left-side chrome is narrower or wider than 240px, the toggle button will overlap or be oddly spaced. The value is hardcoded at line 1258.

---

## Change Impact Checklist

Use this checklist any time you add or modify CSS in `interactive-scheduler.html`:

- [ ] Does the new CSS class use a dark-specific color (near-black background, near-white text, low-opacity white overlays)?
  - If yes: add a `.light-mode .new-class` override with light-appropriate values
- [ ] Does the new component use a React `style` prop with a hardcoded color?
  - If yes: add a `.light-mode .component-class [element][style]` override with `!important`
- [ ] Does the new component use Tailwind utility classes that assume dark backgrounds?
  - If yes: add a `.light-mode` override targeting those utilities within the component's container class
- [ ] Does the new feature introduce a new surface (panel, modal, popover)?
  - If yes: add background/border/text-color overrides for that surface under `.light-mode`
- [ ] Does the new feature introduce a hover or active state?
  - If yes: verify the hover state is readable on both a dark and light page background
- [ ] Did you add a new `wb-*` class for the Whiteboard view?
  - If yes: add it to the `.light-mode` Whiteboard section (lines 2290–2369 area)
- [ ] Did you add a new `rb-*` class for the Rainbow view?
  - If yes: add it to the `.light-mode` Rainbow section (lines 2134–2195 area)
- [ ] After making changes, visually verify the feature in both dark and light modes before committing
