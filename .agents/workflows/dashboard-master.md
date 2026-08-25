---
description: 
---

# Dashboard Platform Implementation

## Description

Orchestrate implementation of secure role-based dashboard access and
administrator-controlled Google Spreadsheet data synchronization.

## Steps

1. Inspect the existing repository and application architecture.

2. Do not assume frontend/backend technology.

3. Determine:
   - authentication
   - routing
   - authorization
   - Google Drive integration
   - Google Sheets integration
   - cache
   - dashboard state
   - test architecture

4. Call /dashboard-rbac.

5. Verify the resulting authentication and authorization architecture.

6. Call /dashboard-refresh.

7. Verify the resulting data-refresh architecture.

8. Call /dashboard-security-test.

9. Review performance.

10. Review API request volume.

11. Review cache invalidation.

12. Review role-based navigation.

13. Review route guards.

14. Review server-side authorization.

15. Review administrator-only refresh.

16. Run tests.

17. Run lint/typecheck/build where supported.

18. Verify all three user roles.

19. Verify refresh behavior.

20. Produce a final implementation report containing:
    - architecture
    - files changed
    - role matrix
    - refresh flow
    - API flow
    - tests
    - known limitations