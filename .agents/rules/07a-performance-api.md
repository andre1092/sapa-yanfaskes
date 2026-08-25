---
trigger: always_on
---

# 07A — API AND NETWORK PERFORMANCE

## PURPOSE

Control Google Drive API and Google Sheets API request volume,
latency, concurrency, retries, pagination, batching, and caching.

---

## DRIVE PAGINATION

Drive file discovery must use pagination.

Never assume one files.list request contains every spreadsheet.

Process:

request page
→ process files
→ inspect nextPageToken
→ request next page
→ repeat
→ stop only when nextPageToken is absent

Do not create infinite pagination loops.

---

## INCREMENTAL DISCOVERY

Do not unnecessarily rebuild the entire spreadsheet registry.

Use:

- spreadsheet ID
- modifiedTime
- cache
- refresh policy

to reduce unnecessary repeated discovery work.

---

## REQUEST MINIMIZATION

Every API request must have a reason.

Before adding an API request, determine:

1. Why is it required?
2. Can an existing result be reused?
3. Can the request be batched?
4. Can it be cached?
5. Can the request be delayed until user interaction?
6. Can metadata be used instead?

---

## FIELD MINIMIZATION

When an API supports field selection, request only required fields.

Do not retrieve large metadata objects when only a few properties
are required.

---

## SHEETS RANGE MINIMIZATION

Request the smallest practical spreadsheet range.

Bad:

A:ZZ

when:

A1:F500

is sufficient.

Do not download the entire worksheet simply because the API permits it.

---

## BATCHING

When multiple ranges from the same spreadsheet are required,
consider batch retrieval.

Example:

A1:F100
H1:J100
L1:N100

should be considered for one batch operation instead of multiple
independent calls.

Do not create unnecessary batching when requests are unrelated or
would significantly delay interactive operations.

---

## CONCURRENCY LIMIT

Never use unbounded:

Promise.all(allRequests)

for large spreadsheet collections.

Use a bounded concurrency pool.

The concurrency limit must be configurable.

Tune concurrency based on measured behavior rather than assuming that
maximum concurrency is fastest.

---

## REQUEST QUEUE

For high-volume API operations, use a controlled queue.

The queue may support:

- concurrency
- priority
- retry
- timeout
- cancellation
- deduplication

Interactive requests should have higher priority than background
operations.

---

## REQUEST DEDUPLICATION

Identical in-flight requests must be reused.

Example:

Spreadsheet A
Worksheet Dashboard
Range A1:F500

If three UI components request the same resource at the same time,
the application should make one network request whenever practical.

---

## CACHE LAYERS

Use appropriate cache layers such as:

L1: in-memory cache
L2: browser persistent cache when appropriate
L3: backend cache when the architecture includes a backend

Never cache credentials.

---

## CACHE KEY

Cache keys should include enough request identity.

Consider:

user/account context
spreadsheetId
worksheet
range
query
schema/transformation version

Do not use overly generic keys such as:

spreadsheetData

---

## CACHE TTL

Use configurable TTL values.

Typical policy:

discovery → longer TTL
metadata → medium TTL
selected dashboard data → shorter TTL

Explicit refresh must invalidate relevant cache entries.

---

## REQUEST DEDUPLICATION + CACHE

Request flow should conceptually be:

Check cache
→ return cached result if valid

Otherwise:
Check in-flight registry
→ reuse existing request if present

Otherwise:
Create API request
→ store in-flight request
→ resolve
→ cache result
→ remove in-flight entry

---

## STALE-WHILE-REVALIDATE

Where business freshness allows:

cached data
→ display immediately
→ background refresh
→ update cache
→ update UI

Do not use stale data when real-time correctness is mandatory.

---

## RETRY

Retry only transient errors.

Potential retry candidates:

429
500
502
503
504
network timeout

Do not blindly retry:

400
401
403
404

---

## EXPONENTIAL BACKOFF

Retries must use exponential backoff with jitter.

Never retry immediately in a tight loop.

Maximum retry count must be configurable.

---

## RATE LIMITING

Monitor:

- 429 frequency
- request rate
- retry count
- concurrent requests

When rate limiting occurs:

- reduce traffic
- honor backoff
- avoid retry storms
- preserve interactive request capacity

---

## TIMEOUT

Every network request must have a timeout.

A timeout must become a controlled application error.

Never allow a request to hang indefinitely.

---

## REQUEST CANCELLATION

Cancel obsolete requests where technically feasible.

Example:

User selects Spreadsheet A
→ request begins

User immediately selects Spreadsheet B
→ request A is no longer relevant

Prevent obsolete results from overwriting the current state.

---

## RACE CONDITION PROTECTION

Protect against:

Request A starts
Request B starts later
B finishes first
A finishes later

A must not overwrite the newer state.

Use:

- request IDs
- abort signals
- sequence numbers
- state version checks

where appropriate.

---

## PARTIAL SUCCESS

Do not fail the entire dashboard when one spreadsheet fails.

Example:

100 discovered
95 successful
5 failed

Continue displaying valid data.

Track failures separately and allow targeted retry.

---

## PERFORMANCE VERIFICATION

When modifying API code, verify:

- request count
- concurrency
- cache behavior
- retry behavior
- payload size
- duplicate requests
- latency

Do not declare API work complete based solely on compilation.