---
trigger: always_on
---

# TESTING RULES

## TESTING PRINCIPLE

Do not declare a feature complete because it compiles.

All meaningful functionality must have verification.

---

## TEST LEVELS

Use:

unit tests
integration tests
API contract tests
component tests
end-to-end tests

where appropriate.

---

## GOOGLE API MOCKS

Unit tests must not require live Google credentials.

Mock:

Drive API
Sheets API
OAuth responses
rate limiting
network failures

---

## DRIVE TESTS

Verify:

one-page discovery
multiple-page discovery
empty result
duplicate result protection
invalid page token
403
429
500
timeout

---

## SHEETS TESTS

Verify:

metadata retrieval
worksheet discovery
range retrieval
batch retrieval
empty worksheet
invalid range
permission denied
deleted spreadsheet

---

## DATA ENGINE TESTS

Verify:

header detection
duplicate headers
missing cells
blank rows
numeric parsing
date parsing
boolean parsing
percentage parsing
currency parsing
ambiguous identifiers
mixed types

---

## UI TESTS

Verify:

authentication state
loading state
empty state
error state
retry
refresh
filter
search
sort
mobile layout

---

## REGRESSION

Every bug fix should include a regression test when practical.

---

## QUALITY GATE

A change cannot be considered complete until:

- tests pass
- lint passes
- typecheck passes
- build passes
- relevant browser behavior is verified

Report failures explicitly.
Never hide failures merely to make the agent task look complete.