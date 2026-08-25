---
trigger: model_decision
description: Apply when optimizing or reviewing data-processing performance, normalization performance, large datasets, memory usage, aggregation, filtering, parsing, or computational efficiency.
---

# 07B — DATA PROCESSING PERFORMANCE

## PURPOSE

Ensure normalization, transformation, aggregation, memory usage,
schema detection, and large-dataset processing remain efficient.

---

## GENERAL RULE

Data processing should scale approximately linearly with the amount
of data processed whenever practical.

Avoid unnecessary O(n²) algorithms.

---

## STREAM-LIKE PROCESSING

For large datasets:

Do not unnecessarily load multiple complete copies of the same data
into memory.

Prefer:

raw chunk
→ normalize
→ transform
→ aggregate
→ release unnecessary intermediates

---

## DATA COPIES

Avoid maintaining simultaneous copies of the same large dataset in:

- raw state
- normalized state
- filtered state
- chart state
- table state

Prefer one canonical dataset plus derived views.

---

## NORMALIZATION

Normalize data once where possible.

Do not repeatedly convert the same spreadsheet values during:

- rendering
- sorting
- filtering
- chart creation
- KPI generation

---

## TYPE INFERENCE

Schema detection should use a bounded sample when sufficient.

Do not scan every row of a 100,000-row worksheet merely to determine
whether a column contains dates.

Use configurable sampling.

If inference remains ambiguous:

preserve the original value.

---

## HEADER DETECTION

Header detection should examine enough rows to identify a reliable
header but must not scan unnecessarily large datasets.

---

## DUPLICATE HEADERS

Duplicate header detection must not require repeated full-dataset scans.

Create deterministic field names once.

---

## NUMBER PARSING

Do not parse large numeric datasets repeatedly.

Normalize numeric values once and reuse them.

Be conservative with locale-sensitive formats.

---

## DATE PARSING

Date parsing should happen during normalization or an equivalent
controlled transformation stage.

Do not repeatedly parse dates during rendering.

Preserve raw values when interpretation is uncertain.

---

## DERIVED CALCULATIONS

Do not calculate the same aggregate independently in multiple
components.

Example:

Bad:

KPI A → scan dataset
KPI B → scan dataset
Chart → scan dataset
Summary → scan dataset

Prefer a shared aggregation layer where practical.

---

## MEMOIZATION

Use memoization for expensive derived values when:

- input data is large
- calculation is expensive
- inputs change infrequently

Do not memoize trivial calculations merely for appearance.

---

## FILTERING

For large local datasets:

- debounce expensive search
- memoize filtered results
- avoid repeated full scans when an index can help
- reuse previous derived results where practical

---

## SEARCH

If the required data is already loaded locally:

search locally.

Do not issue one Google API request for every character typed.

---

## AGGREGATION

Aggregate data before visualization when full row-level detail is not
required.

Examples:

daily → monthly
transaction → category totals
individual records → regional totals

Aggregation must preserve the business meaning of the dashboard.

---

## CHART DATA

Do not pass enormous raw datasets directly to chart components when a
smaller derived representation is sufficient.

Use:

filtering
aggregation
sampling
downsampling

when analytically appropriate.

---

## LARGE DATASETS

For large datasets, consider:

- chunked retrieval
- pagination
- incremental normalization
- background processing
- server-side processing
- user-selected ranges

Do not automatically send enormous datasets to the browser.

---

## MEMORY

Avoid:

- deep clones
- unnecessary JSON stringify/parse
- large temporary arrays
- repeated object reconstruction

unless there is a documented reason.

---

## DATA QUALITY

Performance optimization must not hide data quality problems.

Track:

- malformed rows
- parse warnings
- missing values
- duplicate headers

without performing unnecessarily expensive scans.

---

## PERFORMANCE TEST DATA

Maintain representative fixtures for:

- 100 rows
- 1,000 rows
- 10,000 rows
- large/wide tables
- sparse data
- mixed data types

Use these fixtures to detect regressions.

---

## COMPLETION

Data-processing changes must be considered complete only when:

- algorithmic complexity is reasonable
- memory behavior is reasonable
- calculations are not unnecessarily repeated
- large data behavior has been considered
- data correctness is preserved