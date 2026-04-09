---
name: git-workflow
description: Standardized git workflow with conventional commits, branch naming, and PR templates
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: git
---

## What I do

- Enforce conventional commit messages (feat, fix, docs, refactor, test, chore)
- Suggest branch names following `<type>/<short-description>` pattern
- Generate PR descriptions from commit history
- Help with interactive rebase and conflict resolution

## When to use me

Use this skill when you need to commit changes, create branches, or prepare PRs. I ensure consistent git practices across the project.

## Commit format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
