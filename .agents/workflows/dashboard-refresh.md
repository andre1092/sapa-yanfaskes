---
description: 
---

# Dashboard Data Refresh Implementation

## Description

Implement a secure administrator-only data refresh mechanism that
synchronizes dashboard data with Google Spreadsheet sources without
requiring a browser reload.

## Steps

1. Inspect the existing Google authentication implementation.

2. Inspect the Drive API service.

3. Inspect the Google Sheets API service.

4. Inspect the existing spreadsheet discovery logic.

5. Inspect the existing cache implementation.

6. Inspect the data normalization pipeline.

7. Inspect dashboard state management.

8. Identify every dataset currently used by the dashboard.

9. Define a centralized refresh service.

10. Define a secure administrator-only refresh endpoint or equivalent
    application service.

11. Never rely only on frontend menu visibility to authorize refresh.

12. Verify Administrator permission server-side.

13. Reject FKTP and FKRTL refresh requests.

14. Implement refresh locking or duplicate refresh prevention.

15. Implement smart refresh behavior.

16. Refresh spreadsheet discovery where required.

17. Detect changed spreadsheet sources where practical.

18. Prefer refreshing only changed or relevant sources instead of
    blindly downloading every spreadsheet on every refresh.

19. Invalidate affected cache entries.

20. Fetch required Google Sheets ranges.

21. Use batch retrieval where it reduces request overhead.

22. Normalize refreshed data.

23. Recalculate derived metrics, KPIs, charts, and dashboard summaries.

24. Update dashboard state without reloading the browser.

25. Preserve authentication and navigation state.

26. Provide clear refresh states:

    idle
    refreshing
    completed
    partial_failure
    failed

27. Display:

    last successful refresh
    refresh duration
    total sources
    changed sources
    successful sources
    failed sources

28. Support targeted retry for failed sources.

29. Do not retry indefinitely.

30. Respect Google API rate limits and concurrency controls.

31. Prevent an obsolete refresh operation from overwriting newer data.

32. Add tests for:

    Administrator refresh
    FKTP refresh denial
    FKRTL refresh denial
    concurrent refresh
    cache invalidation
    changed source
    unchanged source
    failed source
    partial success
    expired authentication
    Google API failure

33. Run all available tests and build verification.

34. Perform a security review.

35. Perform a performance review.

36. Do not declare completion until the complete refresh lifecycle has been verified.