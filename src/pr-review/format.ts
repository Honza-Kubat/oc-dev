import type {
  VerifiedFinding,
  ReviewSummary,
  ReviewPayload,
  InlineComment,
  PriorReconciliation,
  ReviewAction,
} from "./types"
import { sanitizeMarkdown } from "./validation"

export function formatReviewBody(
  summary: ReviewSummary,
  findings: VerifiedFinding[],
  reconciliation: PriorReconciliation | null,
  policyReasons: string[],
): string {
  const parts: string[] = []

  parts.push(`## PR Review Summary`)
  parts.push("")

  parts.push(`### Goal`)
  parts.push(summary.goalSummary)
  parts.push("")

  parts.push(`### Implementation`)
  parts.push(summary.implementationSummary)
  parts.push("")

  parts.push(`### Assessment`)
  parts.push(
    `| Dimension | Rating |`,
    `|---|---|`,
    `| Risk | ${summary.riskAssessment} |`,
    `| Size | ${summary.sizeAssessment} |`,
    `| Confidence | ${summary.confidenceAssessment} |`,
    `| Test Coverage | ${summary.testAssessment} |`,
  )
  parts.push("")

  parts.push(`### Verdict: **${summary.finalAction}**`)
  for (const reason of policyReasons) {
    parts.push(`- ${reason}`)
  }
  parts.push("")

  const verifiedFindings = findings.filter((f) => f.verificationStatus === "verified")
  if (verifiedFindings.length > 0) {
    parts.push(`### Findings (${verifiedFindings.length})`)
    parts.push("")

    const bySeverity = groupBySeverity(verifiedFindings)
    for (const [severity, items] of bySeverity) {
      parts.push(`#### ${severity}`)
      for (const f of items) {
        parts.push(`- **[${f.kind}]** ${f.title} (${f.file}:${f.lineStart})`)
      }
      parts.push("")
    }
  }

  if (reconciliation) {
    const priorSummary = formatPriorReconciliation(reconciliation)
    if (priorSummary.length > 0) {
      parts.push("### Prior Review Status")
      parts.push(priorSummary)
      parts.push("")
    }
  }

  return sanitizeMarkdown(parts.join("\n"))
}

function groupBySeverity(
  findings: VerifiedFinding[],
): Map<string, VerifiedFinding[]> {
  const groups = new Map<string, VerifiedFinding[]>()
  for (const f of findings) {
    const list = groups.get(f.severity) ?? []
    list.push(f)
    groups.set(f.severity, list)
  }
  return groups
}

function formatPriorReconciliation(recon: PriorReconciliation): string {
  const parts: string[] = []

  if (recon.resolved.length > 0) {
    parts.push(`- **Resolved**: ${recon.resolved.length} prior finding(s)`)
  }
  if (recon.partiallyResolved.length > 0) {
    parts.push(`- **Partially resolved**: ${recon.partiallyResolved.length} prior finding(s)`)
  }
  if (recon.unresolved.length > 0) {
    parts.push(`- **Unresolved**: ${recon.unresolved.length} prior finding(s)`)
  }
  if (recon.obsolete.length > 0) {
    parts.push(`- **Obsolete**: ${recon.obsolete.length} prior finding(s)`)
  }

  return parts.join("\n")
}

export function formatInlineComment(finding: VerifiedFinding): InlineComment {
  const parts: string[] = []

  parts.push(`**[${finding.kind}] ${finding.title}**`)
  parts.push("")
  parts.push(finding.body)

  if (finding.suggestion) {
    parts.push("")
    parts.push(`**Suggestion:**`)
    parts.push(finding.suggestion)
  }

  if (finding.evidence.length > 0) {
    parts.push("")
    parts.push(`**Evidence:**`)
    for (const e of finding.evidence) {
      parts.push(`- ${e}`)
    }
  }

  if (finding.relatedPriorThread) {
    parts.push("")
    parts.push(`*Previously raised (status: ${finding.relatedPriorThread.status})*`)
  }

  return {
    path: finding.file,
    line: finding.lineEnd,
    startLine: finding.lineStart !== finding.lineEnd ? finding.lineStart : undefined,
    body: sanitizeMarkdown(parts.join("\n")),
  }
}

export function buildReviewPayload(
  summary: ReviewSummary,
  findings: VerifiedFinding[],
  reconciliation: PriorReconciliation | null,
  policyReasons: string[],
): ReviewPayload {
  const verifiedFindings = findings.filter(
    (f) => f.verificationStatus === "verified",
  )

  const body = formatReviewBody(summary, verifiedFindings, reconciliation, policyReasons)
  const comments = verifiedFindings.map((f) => formatInlineComment(f))

  return {
    body,
    event: summary.finalAction,
    comments,
  }
}
