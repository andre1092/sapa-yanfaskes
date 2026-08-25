---
description: 
---

# Dashboard Security and Authorization Audit

## Description

Audit authentication, role resolution, navigation restrictions, route
authorization, API authorization, data authorization, and the
administrator-only data refresh capability.

## Steps

1. Inspect authentication.

2. Inspect session handling.

3. Identify the authoritative source of user role.

4. Verify that roles cannot be changed from frontend state.

5. Verify that localStorage cannot elevate privileges.

6. Verify that URL parameters cannot determine privileges.

7. Verify Administrator access.

8. Verify FKTP access.

9. Verify FKRTL access.

10. Attempt unauthorized direct route access.

11. Attempt unauthorized API access.

12. Attempt unauthorized refresh requests.

13. Verify Admin Settings are inaccessible to FKTP.

14. Verify Admin Settings are inaccessible to FKRTL.

15. Verify FKTP cannot access FKRTL-only routes.

16. Verify FKRTL cannot access FKTP-only routes.

17. Verify server-side authorization.

18. Verify authorization failure responses.

19. Inspect logs for credential leakage.

20. Verify refresh operations do not expose tokens.

21. Verify spreadsheet data is not exposed across unauthorized users.

22. Verify cache keys include appropriate user/security context when
    required.

23. Add regression tests for every discovered security issue.

24. Run all relevant tests.

25. Produce a security audit report with:
    - findings
    - severity
    - affected files
    - remediation
    - verification result