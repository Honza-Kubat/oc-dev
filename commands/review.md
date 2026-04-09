---
description: Review current changes for quality and issues
agent: reviewer
subtask: true
---

Review the current uncommitted changes in the project.

1. Run `git diff` to see what has changed
2. Analyze each change for:
   - Bugs or logic errors
   - Security concerns
   - Performance implications
   - Missing error handling
   - Style and convention issues
3. Provide a structured review with severity levels

If there are no uncommitted changes, check the last commit with `git diff HEAD~1`.
