import type {
  CandidateFinding,
  VerifiedFinding,
  VerificationStatus,
  Severity,
  PriorThreadReference,
} from "./types"

export interface VerificationInput {
  findingId: string
  status: VerificationStatus
  severity: Severity
  notes?: string
}

export interface VerificationOutput {
  finding: VerifiedFinding
  warnings: string[]
}

export function verifyFinding(
  candidate: CandidateFinding,
  input: VerificationInput,
  priorThread: PriorThreadReference | null,
): VerificationOutput {
  const warnings: string[] = []

  if (candidate.id !== input.findingId) {
    throw new Error(`Finding ID mismatch: expected ${candidate.id}, got ${input.findingId}`)
  }

  if (input.status === "rejected") {
    return {
      finding: {
        ...candidate,
        verificationStatus: "rejected",
        severity: input.severity,
        duplicateOf: null,
        relatedPriorThread: priorThread,
      },
      warnings: ["Finding was rejected during verification"],
    }
  }

  if (input.status === "needs_more_evidence") {
    warnings.push("Finding needs more evidence - confidence may be reduced")
  }

  if (!candidate.evidence || candidate.evidence.length === 0) {
    warnings.push("No evidence provided for finding")
  }

  if (candidate.confidence === "low" && input.severity === "critical") {
    warnings.push("Critical severity assigned to low-confidence finding - consider downgrading")
  }

  return {
    finding: {
      ...candidate,
      verificationStatus: input.status,
      severity: input.severity,
      duplicateOf: null,
      relatedPriorThread: priorThread,
    },
    warnings,
  }
}

export function batchVerify(
  candidates: CandidateFinding[],
  inputs: VerificationInput[],
  priorThreads: Map<string, PriorThreadReference>,
): { verified: VerifiedFinding[]; warnings: string[]; errors: string[] } {
  const verified: VerifiedFinding[] = []
  const warnings: string[] = []
  const errors: string[] = []

  const candidateMap = new Map(candidates.map((c) => [c.id, c]))

  for (const input of inputs) {
    const candidate = candidateMap.get(input.findingId)
    if (!candidate) {
      errors.push(`No candidate finding with ID: ${input.findingId}`)
      continue
    }

    try {
      const result = verifyFinding(
        candidate,
        input,
        priorThreads.get(input.findingId) ?? null,
      )
      verified.push(result.finding)
      warnings.push(...result.warnings)
    } catch (err) {
      errors.push(
        `Verification failed for ${input.findingId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  const unverifiedIds = candidates
    .filter((c) => !inputs.some((i) => i.findingId === c.id))
    .map((c) => c.id)
  for (const id of unverifiedIds) {
    errors.push(`Candidate finding ${id} was not verified`)
  }

  return { verified, warnings, errors }
}
