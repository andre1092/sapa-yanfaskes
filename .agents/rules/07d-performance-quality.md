---
trigger: model_decision
description: Apply this rule when profiling, benchmarking, auditing, load testing, regression testing, measuring API performance, diagnosing memory issues, validating concurrency behavior, or reviewing production performance readiness.
---

# 07D — PERFORMANCE QUALITY AND VERIFICATION

## PURPOSE

Provide measurable verification for performance-related changes.

---

## MEASURE, DO NOT GUESS

When performance is reported as a problem:

1. reproduce
2. measure
3. identify bottleneck
4. change implementation
5. measure again

Do not optimize based purely on intuition.

---

## METRICS

Track where appropriate:

- application startup duration
- authentication readiness
- Drive discovery latency
- number of Drive requests
- number of Sheets requests
- concurrent request count
- retry count
- 429 frequency
- cache hit rate
- cache miss rate
- data transfer size
- normalization duration
- aggregation duration
- table rendering duration
- chart rendering duration
- refresh duration

---

## API REGRESSION

A feature must not silently increase request volume.

Example:

Before:
10 requests

After:
250 requests

This requires investigation even if the feature still works.

---

## PERFORMANCE PROFILING

Use profiling to identify:

- network bottlenecks
- CPU bottlenecks
- memory growth
- unnecessary renders
- expensive transformations
- chart bottlenecks

Do not optimize code that has no measurable impact.

---

## LARGE DATA TESTS

At minimum consider test datasets around:

100 rows
1,000 rows
10,000 rows

Also test:

wide tables
sparse tables
mixed types
many worksheets
many spreadsheets

Actual thresholds should be determined by the application requirements.

---

## LOAD TESTING

When practical, simulate:

- many spreadsheets
- multiple pages of Drive results
- concurrent spreadsheet loads
- multiple simultaneous users if a backend exists

Observe:

latency
errors
429 responses
memory
CPU
request count

---

## FAILURE TESTING

Test:

- network timeout
- 429
- 500
- 503
- authentication expiration
- permission denied
- deleted spreadsheet
- invalid range

Verify that failures do not create request storms.

---

## CACHE TESTING

Verify:

first request → cache miss

second equivalent request → cache hit

explicit refresh → correct invalidation

different spreadsheet → different cache key

different range → different cache key

different user/account → no unauthorized cache sharing

---

## RACE CONDITION TESTING

Simulate:

request A starts
request B starts
B finishes first
A finishes later

Verify that A cannot overwrite B.

---

## MEMORY TESTING

Repeatedly:

open dashboard
switch spreadsheet
switch worksheet
refresh
return
repeat

Check for:

- growing memory
- abandoned listeners
- stale promises
- duplicate subscriptions
- unbounded caches

---

## PERFORMANCE ACCEPTANCE GATE

A change should not be approved if it introduces:

- unbounded concurrency
- excessive request duplication
- excessive payloads
- uncontrolled retries
- obvious memory growth
- very large DOM rendering
- severe interaction lag

unless there is a documented and accepted reason.

---

## PERFORMANCE REVIEW CHECKLIST

Before release:

[ ] API requests minimized
[ ] pagination verified
[ ] concurrency bounded
[ ] retries bounded
[ ] cache behavior verified
[ ] request deduplication verified
[ ] large datasets tested
[ ] table rendering tested
[ ] charts tested
[ ] filtering tested
[ ] search tested
[ ] refresh tested
[ ] race conditions tested
[ ] memory behavior reviewed
[ ] errors tested
[ ] performance metrics reviewed
[ ] no sensitive data logged

---

## FINAL RULE

Never state that performance is "optimized" without evidence.

State what was measured, what was changed, and what remains unknown.