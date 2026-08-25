---
trigger: always_on
---

# SECURITY RULES

## SECURITY PRIORITY

Security defects are release-blocking defects.

Never prioritize convenience over credential safety.

---

## CREDENTIALS

Never place real credentials in:

source code
Git
README
tests
logs
browser localStorage
URL query parameters
screenshots
documentation

---

## ACCESS TOKENS

Access tokens must be treated as secrets.

Never:
- print them
- log them
- store them in analytics
- include them in URLs
- include them in error messages

---

## CLIENT SECRETS

Never expose OAuth client secrets in frontend JavaScript.

If a secret is required, use a backend or secure deployment environment.

---

## OAUTH

Use modern Google OAuth flow.

For browser-based applications, prefer Authorization Code + PKCE
where appropriate.

Do not implement a custom authentication protocol.

---

## SCOPES

Request the smallest scope set needed.

Do not request full Drive write access for a read-only dashboard.

Prefer read-only scopes when the application only reads data.

---

## DATA LEAKAGE

Never expose spreadsheet contents through public endpoints without
authentication and authorization.

Do not create an unauthenticated proxy to Google Sheets.

---

## LOGGING

Logs must be sanitized.

Forbidden:
access_token
refresh_token
client_secret
Authorization header
cookie contents
raw private spreadsheet rows

---

## CORS

Never solve development CORS problems by permanently allowing:

Access-Control-Allow-Origin: *

when authenticated private data is involved.

Configure trusted origins.

---

## USER BOUNDARY

Never assume that because the application can read a file, every
logged-in dashboard user should automatically see that file.

Authorization semantics must be explicit.

---

## SHARED ENVIRONMENT

If multiple users access the same deployed dashboard, implement a
clear data ownership and authorization model.

Never accidentally use one administrator's Google access token to expose
that user's private Drive to every visitor.

---

## SECURITY REVIEW

Before release verify:

- OAuth flow
- scope minimization
- token handling
- CORS
- CSRF where relevant
- XSS
- dependency vulnerabilities
- server-side authorization
- log sanitation
- environment configuration
- secret scanning

Any failure blocks production release.