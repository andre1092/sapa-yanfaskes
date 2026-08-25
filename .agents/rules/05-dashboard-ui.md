---
trigger: glob
globs: src/**/*.{tsx,ts,css}
---

# DASHBOARD UI RULES

## PRINCIPLE

The dashboard is a data application, not merely a visual landing page.

Data correctness has higher priority than visual decoration.

---

## PRIMARY UX

The user should be able to:

1. sign in
2. discover spreadsheets
3. select spreadsheet
4. select worksheet
5. inspect data
6. filter
7. search
8. visualize
9. refresh
10. understand errors

with minimal interaction.

---

## CORE COMPONENTS

Build reusable components:

GoogleAuthButton
SpreadsheetSelector
WorksheetSelector
RefreshButton
SearchInput
FilterPanel
KpiCard
DataTable
ChartContainer
LoadingSkeleton
EmptyState
ErrorState
LastUpdated
DataQualityIndicator

---

## RESPONSIVE

Support:

desktop
tablet
mobile

Do not create fixed-width layouts that break on smaller screens.

---

## TABLE

Use:

sorting
filtering
pagination or virtualization
column resizing where justified
sticky headers
responsive overflow

Do not render extremely large datasets directly into the DOM.

---

## CHARTS

Charts must be generated from normalized data.

Never place spreadsheet-specific parsing logic inside chart components.

Charts must handle:

empty data
invalid values
mixed data types
large series
missing labels

---

## FILTERING

Filtering should operate on normalized data.

Filters should be dynamically generated when appropriate from detected
schema metadata.

Avoid generating a filter for every field automatically when there
are hundreds of fields.

---

## KPI

KPI cards must define:

label
value
unit
aggregation
source
updatedAt
optional comparison

Never display a KPI without knowing its source field and aggregation.

---

## LOADING

Always show meaningful loading feedback.

Prefer skeletons over blank screens.

Never block the complete dashboard because one spreadsheet failed.

---

## PARTIAL FAILURE

If 1 of 50 spreadsheets fails:

- successfully loaded spreadsheets remain usable
- failed spreadsheet is marked
- user can retry that spreadsheet
- dashboard displays a non-destructive warning

Never discard all valid data because one source fails.

---

## EMPTY STATES

Distinguish:

No spreadsheets found
No worksheets found
Worksheet empty
No matching filter results
Permission denied
Authentication required

Do not use one generic "No data" message for all cases.

---

## ACCESSIBILITY

Support:

keyboard navigation
focus states
ARIA labels where necessary
sufficient contrast
screen-reader-friendly status messages

---

## VISUAL DESIGN

Use a consistent design system.

Avoid excessive animation.

Prioritize:
- hierarchy
- readability
- data density
- discoverability
- responsive layout

---

## REFRESH UX

Show:

Refreshing...
Updated just now
Updated X minutes ago
Refresh failed

Do not cause the entire application to flash or unmount during refresh.

---

## ERROR UX

Errors must explain:

what failed
why it probably failed
what the user can do next

Do not expose:
- stack traces
- tokens
- internal API payloads
- implementation details