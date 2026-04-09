import type {
  VerifiedFinding,
  ReviewAction,
  Confidence,
  Risk,
  TestAssessment,
  PriorReconciliation,
  AssessmentInput,
} from "./types"
import { BLOCKING_KINDS, BLOCKING_SEVERITIES } from "./types"

export interface PolicyInput {
  verifiedFindings: VerifiedFinding[]
  assessment: AssessmentInput
  priorReconciliation: PriorReconciliation | null
}

export interface PolicyResult {
  action: ReviewAction
  reasons: string[]
}

export function computeFinalAction(input: PolicyInput): PolicyResult {
  const reasons: string[] = []

  const hasBlockingFinding = input.verifiedFindings.some(
    (f) =>
      f.verificationStatus === "verified" &&
      (BLOCKING_KINDS.has(f.kind) || BLOCKING_SEVERITIES.has(f.severity)),
  )

  const hasUnresolvedPrior = input.priorReconciliation
    ? input.priorReconciliation.unresolved.length > 0
    : false

  const hasPartiallyResolvedPrior = input.priorReconciliation
    ? input.priorReconciliation.partiallyResolved.length > 0
    : false

  const criticalTestGap = input.verifiedFindings.some(
    (f) =>
      f.verificationStatus === "verified" &&
      f.kind === "test_gap" &&
      (f.severity === "critical" || f.severity === "high"),
  )

  const missingCriticalTests =
    input.assessment.testAdequacy === "missing_critical"

  if (hasBlockingFinding) {
    reasons.push("Verified blocking finding(s) exist")
  }
  if (hasUnresolvedPrior) {
    reasons.push("Unresolved prior blocking finding(s) exist")
  }
  if (criticalTestGap) {
    reasons.push("Critical test coverage gap for verified finding")
  }
  if (missingCriticalTests && input.assessment.risk !== "low") {
    reasons.push("Critical test coverage missing for non-low risk changes")
  }

  if (hasBlockingFinding || hasUnresolvedPrior || criticalTestGap || (missingCriticalTests && input.assessment.risk !== "low")) {
    return { action: "REQUEST_CHANGES", reasons }
  }

  const nonBlockingFindings = input.verifiedFindings.filter(
    (f) =>
      f.verificationStatus === "verified" &&
      !BLOCKING_KINDS.has(f.kind) &&
      !BLOCKING_SEVERITIES.has(f.severity),
  )

  const lowConfidence = input.assessment.confidence === "low"
  const weakTests = input.assessment.testAdequacy === "weak"
  const hasPartiallyResolved = hasPartiallyResolvedPrior
  const openQuestions = input.verifiedFindings.some(
    (f) => f.verificationStatus === "verified" && f.kind === "question",
  )

  if (
    nonBlockingFindings.length > 0 ||
    lowConfidence ||
    weakTests ||
    hasPartiallyResolved ||
    openQuestions
  ) {
    const commentReasons: string[] = []
    if (nonBlockingFindings.length > 0) {
      commentReasons.push(`${nonBlockingFindings.length} non-blocking finding(s)`)
    }
    if (lowConfidence) {
      commentReasons.push("Confidence is low")
    }
    if (weakTests) {
      commentReasons.push("Test coverage is weak")
    }
    if (hasPartiallyResolved) {
      commentReasons.push("Partially resolved prior finding(s)")
    }
    if (openQuestions) {
      commentReasons.push("Open questions without enough evidence to block")
    }
    return { action: "COMMENT", reasons: commentReasons }
  }

  const mediumOrHighConfidence =
    input.assessment.confidence === "medium" || input.assessment.confidence === "high"
  const adequateTests = input.assessment.testAdequacy === "adequate"
  const zeroBlockingFindings = !hasBlockingFinding
  const zeroUnresolvedPrior = !hasUnresolvedPrior
  const noPolicyViolation = !criticalTestGap && !missingCriticalTests

  if (
    zeroBlockingFindings &&
    zeroUnresolvedPrior &&
    adequateTests &&
    mediumOrHighConfidence &&
    noPolicyViolation
  ) {
    return { action: "APPROVE", reasons: ["All approval criteria met"] }
  }

  return { action: "COMMENT", reasons: ["Cannot approve: not all criteria met, but no blocking issues"] }
}

export function isBlockingAction(action: ReviewAction): boolean {
  return action === "REQUEST_CHANGES"
}

export function canApprove(input: PolicyInput): boolean {
  const result = computeFinalAction(input)
  return result.action === "APPROVE"
}
