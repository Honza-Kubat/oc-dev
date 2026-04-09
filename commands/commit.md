---
description: Create a well-structured commit for current changes
agent: build
---

Create a commit for the current changes following conventional commit format.

1. Run `git diff --staged` to see staged changes, or `git diff` for unstaged
2. Analyze the changes and determine the appropriate commit type:
   - feat: new feature
   - fix: bug fix
   - docs: documentation changes
   - refactor: code restructuring
   - test: adding or updating tests
   - chore: maintenance tasks
3. Stage relevant files if needed
4. Create a commit with a clear, descriptive message in the format:
   `<type>(<scope>): <description>`
5. Keep the subject line under 72 characters

$ARGUMENTS
