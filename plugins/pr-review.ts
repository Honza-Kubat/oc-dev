import { createPrReviewTools } from "../src/pr-review/tools"
import type { Plugin } from "@opencode-ai/plugin"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"

const COMMAND_FILENAME = "pr-review.md"
const COMMAND_MARKER = "<!-- managed by @honza-kubat/oc-dev -->"

const COMMAND_CONTENT = `${COMMAND_MARKER}
---
description: Production-grade PR review with deterministic policy guards
agent: reviewer
---

Review PR: **$ARGUMENTS**

You are performing a guarded PR review. You MUST follow this exact workflow in order, calling each tool sequentially. Do NOT skip steps. Do NOT fabricate GitHub API calls.

## Workflow

### Step 1: Start
Call \`pr-review-start\` with the PR reference above.
- If it returns an error, STOP and report the error to the user.

### Step 2: Load Context
Call \`pr-review-load-context\` to fetch PR metadata, diff, changed files, prior reviews, and linked issues.
- Read the diff and changed files carefully from the output.

### Step 3: Analyze
Read the changed source files using your file-reading tools to understand the full context. Analyze the implementation for:
- **Bugs**: Logic errors, null handling, edge cases, race conditions
- **Security**: Injection, auth issues, data exposure, secrets
- **Test gaps**: Missing tests for risky logic, untested edge cases
- **Maintainability**: Naming, structure, complexity, duplication
- **Questions**: Open design questions, unclear intent

Then call \`pr-review-submit-analysis\` with a JSON array of candidate findings. Each finding MUST:
- Reference exact file paths and line ranges that exist in the diff
- Include at least one piece of evidence
- Have a descriptive title and body

The \`findings_json\` argument must be a JSON array like:
\`\`\`json
[{"id":"f1","kind":"blocking_bug","file":"src/foo.ts","lineStart":10,"lineEnd":15,"title":"Null pointer dereference","body":"Variable x can be null...","confidence":"high","evidence":["Line 10 accesses x.prop without null check"]}]
\`\`\`

If no issues found, submit an empty array \`[]\`.

### Step 4: Verify
Re-examine each finding critically. For each one, decide:
- Is this a real issue or a false positive?
- What severity does it deserve?

Then call \`pr-review-verify\` with a JSON array of verification results:
\`\`\`json
[{"findingId":"f1","status":"verified","severity":"high"},{"findingId":"f2","status":"rejected","severity":"low"}]
\`\`\`

### Step 5: Finalize
Call \`pr-review-finalize\` with your assessments:
- \`risk\`: low/medium/high (consider security, data integrity, blast radius)
- \`size\`: small/medium/large
- \`confidence\`: low/medium/high (how confident are you in the review)
- \`test_adequacy\`: adequate/weak/missing_critical
- \`goal_summary\`: What this PR aims to do
- \`implementation_summary\`: How it achieves it

**IMPORTANT**: The final review action (APPROVE/COMMENT/REQUEST_CHANGES) is computed by deterministic policy code. You CANNOT override it. Do NOT suggest an action.

### Step 6: Post
Review the generated payload from the finalize step. If everything looks correct, call \`pr-review-post\` with \`confirm: true\` to submit the review to GitHub.

## Rules
- You MUST call tools in exact order: start -> load-context -> submit-analysis -> verify -> finalize -> post
- You MUST NOT skip any step
- You MUST NOT fabricate GitHub API calls or payloads
- You MUST NOT decide the final review action yourself
- You MUST provide evidence for every finding
- All inline comments MUST reference exact file/line ranges from the diff
- If any tool returns an error, STOP and report it
`

async function ensureCommandInstalled(directory: string) {
  const commandsDir = join(directory, ".opencode", "commands")
  const commandPath = join(commandsDir, COMMAND_FILENAME)

  try {
    const existing = await readFile(commandPath, "utf-8")
    if (existing.includes(COMMAND_MARKER)) {
      await writeFile(commandPath, COMMAND_CONTENT, "utf-8")
    }
  } catch {
    await mkdir(commandsDir, { recursive: true })
    await writeFile(commandPath, COMMAND_CONTENT, "utf-8")
  }
}

const PrReviewPlugin: Plugin = async (ctx) => {
  const { client, directory } = ctx

  await ensureCommandInstalled(directory)

  await client.app.log({
    body: {
      service: "oc-dev",
      level: "info",
      message: "PR Review plugin initialized",
    },
  })

  const prReviewTools = createPrReviewTools(ctx)

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await client.app.log({
          body: {
            service: "oc-dev",
            level: "debug",
            message: "Session idle",
          },
        })
      }
    },
    tool: prReviewTools,
  }
}

export default PrReviewPlugin
export { PrReviewPlugin }
