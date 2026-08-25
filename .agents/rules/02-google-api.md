---
trigger: always_on
---

# GOOGLE API ENGINEERING RULES

## PURPOSE

This rule governs all interactions with:

- Google Drive API
- Google Sheets API
- Google OAuth / Google Identity Services

The implementation must treat Google APIs as unreliable external
dependencies and must isolate them from application/business logic.

---

## DRIVE DISCOVERY

The application must discover spreadsheets using Drive API.

Endpoint:

GET https://www.googleapis.com/drive/v3/files

Required conceptual query:

mimeType='application/vnd.google-apps.spreadsheet'
and trashed=false

Request fields should be minimized.

Prefer fields equivalent to:

nextPageToken,
files(id,name,mimeType,modifiedTime,createdTime,webViewLink,owners)

Do not retrieve unnecessary metadata.

---

## PAGINATION

Drive API results are paginated.

Algorithm:

1. request first page
2. process files
3. inspect nextPageToken
4. if token exists:
   request next page
5. repeat
6. terminate only when nextPageToken is absent

Never assume one request returns all files.

Implement protection against:
- duplicate page processing
- invalid page tokens
- network interruption
- accidental infinite loops

---

## SHARED DRIVES

Support Shared Drives when applicable.

Use appropriate Drive API parameters such as:

supportsAllDrives=true
includeItemsFromAllDrives=true

Do not assume all organizational spreadsheets are stored in My Drive.

The implementation should make Shared Drive behavior configurable.

---

## SPREADSHEET METADATA

After discovering a spreadsheet ID:

GET:

https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}

Retrieve only relevant metadata.

Discover:
- spreadsheet title
- spreadsheet locale
- time zone
- worksheets
- worksheet IDs
- worksheet titles
- row counts
- column counts

Do not download all grid data during metadata discovery.

---

## DATA RETRIEVAL

Use:

GET:
https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}

or batchGet when multiple ranges are required.

Range requests must be explicit.

Never generate unbounded ranges unnecessarily.

Bad:

A:Z

when only known rows are required.

Prefer bounded ranges when the data engine knows the boundaries.

---

## URL CONSTRUCTION

Centralize API URL generation.

Do not build Google API URLs randomly throughout the codebase.

Create typed service methods such as:

drive.listSpreadsheets()
sheets.getSpreadsheetMetadata(id)
sheets.getValues(id, range)
sheets.batchGetValues(id, ranges)

The service layer is responsible for URL construction.

UI code must never construct Google API URLs directly.

---

## AUTHORIZATION

All authenticated Google API requests must send:

Authorization: Bearer <access_token>

Do not put tokens into source code.

Prefer Authorization headers to query-string tokens.

---

## REQUEST TIMEOUT

Every network request must have a timeout.

Timeout behavior must produce a controlled application error.

Do not allow indefinitely hanging requests.

---

## RETRY

Retry only transient errors.

Retry candidates:

429
500
502
503
504
network timeout

Do not automatically retry:

400
401
403
404

unless the error is specifically known to be recoverable.

Use exponential backoff with jitter.

---

## RATE LIMITING

Do not issue hundreds of simultaneous API calls.

Use:
- concurrency limits
- request queues
- batching
- caching

when discovering or loading many spreadsheets.

---

## API RESPONSE VALIDATION

Never trust external JSON blindly.

Validate:
- expected object structure
- files array
- spreadsheet metadata
- values array
- page tokens
- range information

Invalid responses must become typed errors.

---

## GOOGLE API ERROR MODEL

Convert Google API responses into internal errors:

AuthenticationError
AuthorizationError
NotFoundError
RateLimitError
ValidationError
TransientGoogleError
NetworkError
UnknownGoogleError

The UI should consume internal errors instead of raw Google responses.

---

## CACHE

Cache:

spreadsheet discovery
spreadsheet metadata
worksheet metadata
range values

with configurable TTL.

Cache invalidation must occur after explicit refresh.

Do not cache authentication secrets.

---

## REFRESH

The dashboard must expose a refresh operation.

Refresh must support:

- refreshing spreadsheet discovery
- refreshing metadata
- refreshing selected spreadsheet data

Avoid unnecessarily invalidating unrelated cache entries.

---

## SECURITY

Do not log:

Authorization headers
access tokens
refresh tokens
client secrets
sensitive spreadsheet contents

When logging requests, log:

method
endpoint category
spreadsheet ID only when safe
range metadata
duration
status code

Never log raw tokens.

---

## TESTING

Create tests for:

- Drive pagination
- spreadsheet filtering
- Shared Drive support
- metadata retrieval
- values retrieval
- batchGet
- 401
- 403
- 404
- 429
- 500
- timeout
- malformed JSON
- expired access token

Use mocks for Google APIs.

Do not depend exclusively on live Google APIs for unit tests.