---
trigger: model_decision
description: Apply this rule when optimizing or reviewing frontend rendering performance, React component performance, large tables, chart performance, filtering, search, memoization, state updates, responsive UI, bundle size, code splitting, or browser performan
---

# 07C — UI AND RENDERING PERFORMANCE

## PURPOSE

Keep dashboard interactions responsive while displaying large,
dynamic Google Sheets datasets.

---

## INITIAL LOAD

Do not wait for all spreadsheet data before rendering the application
shell.

Preferred:

application shell
→ authentication
→ spreadsheet registry
→ dashboard controls
→ selected data
→ secondary visualizations

---

## PROGRESSIVE LOADING

Render useful information as soon as it becomes available.

Use:

- skeletons
- progressive sections
- incremental results
- background loading

Avoid blank-screen blocking.

---

## TABLE PERFORMANCE

Never render tens of thousands of DOM rows simultaneously.

Use:

- pagination
- virtualization
- windowing

for large datasets.

---

## COLUMN PERFORMANCE

Do not render hundreds of columns unnecessarily.

Use:

- column visibility
- horizontal scrolling
- selectable columns
- progressive presentation

when appropriate.

---

## CHART PERFORMANCE

Avoid rendering huge numbers of points when the visual goal does not
require them.

Prefer meaningful aggregation or downsampling.

Never change analytical meaning merely to gain performance.

---

## COMPONENT BOUNDARIES

Separate heavy components such as:

DataTable
Charts
Filters
KPI calculations

so updates to one component do not unnecessarily rerender all others.

---

## MEMOIZATION

Use framework-appropriate memoization for expensive derived values
or components when evidence shows it helps.

Avoid premature memoization of trivial components.

---

## STATE DESIGN

Avoid global state changes that cause the entire dashboard to rerender
when only one component needs updated data.

Keep state as close to its consumers as practical.

---

## SEARCH INPUT

For expensive filtering:

- debounce input
- avoid unnecessary state propagation
- avoid API calls for local search

Do not make the dashboard visibly lag while typing.

---

## FILTERS

Do not recompute the entire dashboard unnecessarily when a filter
affects only one visualization.

Use derived selectors or equivalent mechanisms.

---

## REFRESH

Refresh only what actually needs refreshing.

Example:

selected spreadsheet changed
→ refresh selected dataset

Do not refresh all spreadsheets merely because one table changed.

---

## BACKGROUND REFRESH

Background refresh must not:

- block UI interaction
- erase valid displayed data
- show a full-screen loading state
- reset scroll position unnecessarily

Update the existing data when the new result arrives.

---

## OBSOLETE RESULTS

Newer user actions have priority.

If:

Spreadsheet A
→ loading

then user switches to:

Spreadsheet B

a late response from A must not replace B's current state.

---

## CODE SPLITTING

Lazy-load heavy libraries when practical.

Potential examples:

- charting packages
- advanced export functionality
- large analytical modules

Do not introduce code splitting complexity without meaningful benefit.

---

## BUNDLE SIZE

Monitor bundle size.

Before adding a new dependency, consider:

- package size
- maintenance
- tree shaking
- existing dependency overlap
- security
- runtime performance

---

## STATIC ASSETS

Use appropriately sized assets.

Do not let decorative resources dominate dashboard load time.

---

## ACCESSIBILITY

Performance optimizations must not break:

- keyboard navigation
- focus management
- screen reader semantics
- loading announcements

---

## USER-PERCEIVED PERFORMANCE

Prefer immediate useful feedback.

Examples:

"Loading spreadsheets..."

"Loading dashboard data..."

"Refreshing..."

"Updated 2 minutes ago"

Do not fabricate percentage progress when actual progress cannot be
measured.

---

## UI PERFORMANCE TESTING

Test:

- large tables
- many filters
- rapid search
- switching spreadsheets quickly
- rapid worksheet switching
- repeated refreshes
- background refresh during interaction

---

## COMPLETION

UI changes are not performance-complete if they cause:

- unnecessary full-tree rerenders
- large DOM trees
- visible input lag
- blocking refresh
- excessive chart rendering
- stale request overwrites