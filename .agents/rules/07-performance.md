---
trigger: always_on
---

# 07 — PERFORMANCE CORE

## PURPOSE

This project must be engineered for predictable performance,
scalability, low unnecessary network usage, and responsive UX.

Performance is an architectural requirement.

---

## CORE PRINCIPLE

Always prefer:

DISCOVER BROADLY
→ INSPECT CHEAPLY
→ LOAD LAZILY
→ CACHE SAFELY
→ PROCESS INCREMENTALLY
→ RENDER ONLY WHAT IS REQUIRED

Never use:

DISCOVER EVERYTHING
→ DOWNLOAD EVERYTHING
→ PROCESS EVERYTHING
→ RENDER EVERYTHING

---

## PERFORMANCE PRIORITY

Optimize in this order:

1. Avoid unnecessary API requests.
2. Avoid unnecessary data transfer.
3. Avoid duplicate requests.
4. Bound concurrency.
5. Avoid redundant computation.
6. Control memory usage.
7. Minimize unnecessary rendering.
8. Optimize micro-level code only after architectural bottlenecks
   have been addressed.

---

## NETWORK-FIRST THINKING

Google APIs are remote, quota-sensitive dependencies.

Treat every external request as:

- latency-sensitive
- failure-prone
- potentially rate-limited
- potentially expensive

Never create an API request merely because a React component mounted.

---

## DATA-FIRST THINKING

Separate:

metadata
from
data

Metadata should be loaded before large cell ranges.

Do not fetch spreadsheet values merely to populate:

- spreadsheet selectors
- worksheet selectors
- metadata cards

---

## LAZY LOADING

Do not load all worksheets or all spreadsheet values during startup.

Preferred flow:

Authentication
→ Spreadsheet discovery
→ Spreadsheet metadata
→ User selection
→ Worksheet metadata
→ User selection
→ Requested data
→ Normalization
→ Visualization

---

## CACHING

Use caching for expensive or frequently reused resources.

At minimum consider caching:

- spreadsheet discovery
- spreadsheet metadata
- worksheet metadata
- requested ranges

Cache keys must include sufficient request identity.

Never cache credentials or access tokens.

---

## CONCURRENCY

Never perform unbounded concurrent Google API requests.

All bulk work must use a bounded concurrency strategy.

Interactive requests should have higher priority than background
prefetch operations.

---

## LARGE DATA

The application must remain usable when datasets become large.

For large datasets consider:

- chunking
- pagination
- incremental processing
- virtualization
- aggregation
- sampling
- server-side processing where appropriate

Never download huge datasets to the browser without justification.

---

## UI RESPONSIVENESS

Network requests and expensive data transformations must not make the
UI appear frozen.

Use:

- progressive loading
- loading states
- memoization
- virtualization
- background refresh
- incremental processing

when appropriate.

---

## CORRECTNESS

Performance optimization must never silently change business meaning.

Never:

- discard rows without justification
- alter dates incorrectly
- round values without business justification
- silently omit failed data
- change aggregations merely to make rendering faster

---

## OBSERVABILITY

Performance must be measurable.

Track relevant metrics such as:

- request count
- request latency
- cache hit rate
- cache miss rate
- payload size
- normalization duration
- rendering duration
- refresh duration

---

## REQUIRED SUB-RULES

Detailed performance requirements are defined in:

@07a-performance-api.md
@07b-performance-data.md
@07c-performance-ui.md
@07d-performance-quality.md

All referenced rules are part of this project's performance policy.

---

## PERFORMANCE GATE

A feature is not performance-complete if it introduces:

- uncontrolled API concurrency
- duplicate requests
- unnecessary large payloads
- excessive memory usage
- huge DOM rendering
- uncontrolled retry loops
- full application reloads for local changes
- blocking background work

Always verify performance impact before declaring a feature complete.