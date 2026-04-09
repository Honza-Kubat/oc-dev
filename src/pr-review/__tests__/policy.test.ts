import { describe, test, expect } from "bun:test"
import { computeFinalAction, canApprove } from "../policy"
import type { VerifiedFinding, AssessmentInput, PriorReconciliation } from "../types"

const emptyRecon: PriorReconciliation = {
  resolved: [],
  partiallyResolved: [],
  unresolved: [],
  obsolete: [],
  intentionallyNotAddressed: [],
}

const makeAssessment = (overrides: Partial<AssessmentInput> = {}): AssessmentInput => ({
  risk: "low",
  size: "small",
  confidence: "high",
  testAdequacy: "adequate",
  goalSummary: "Fix bug in auth module",
  implementationSummary: "Added null check before accessing user property",
  ...overrides,
})

const makeFinding = (overrides: Partial<VerifiedFinding> = {}): VerifiedFinding => ({
  id: "f1",
  kind: "blocking_bug",
  file: "src/foo.ts",
  lineStart: 10,
  lineEnd: 15,
  title: "Test finding",
  body: "Test body",
  confidence: "high",
  evidence: ["Evidence 1"],
  verificationStatus: "verified",
  severity: "critical",
  duplicateOf: null,
  relatedPriorThread: null,
  ...overrides,
})

describe("computeFinalAction", () => {
  test("APPROVE when no findings and all criteria met", () => {
    const result = computeFinalAction({
      verifiedFindings: [],
      assessment: makeAssessment(),
      priorReconciliation: emptyRecon,
    })
    expect(result.action).toBe("APPROVE")
    expect(result.reasons).toContain("All approval criteria met")
  })

  test("REQUEST_CHANGES when verified blocking bug exists", () => {
    const result = computeFinalAction({
      verifiedFindings: [
        makeFinding({ kind: "blocking_bug", severity: "critical" }),
      ],
      assessment: makeAssessment(),
      priorReconciliation: emptyRecon,
    })
    expect(result.action).toBe("REQUEST_CHANGES")
    expect(result.reasons).toEqual(
      expect.arrayContaining(["Verified blocking finding(s) exist"]),
    )
  })

  test("REQUEST_CHANGES when likely_bug with high severity", () => {
    const result = computeFinalAction({
      verifiedFindings: [
        makeFinding({ kind: "likely_bug", severity: "high" }),
      ],
      assessment: makeAssessment(),
      priorReconciliation: emptyRecon,
    })
    expect(result.action).toBe("REQUEST_CHANGES")
  })

  test("REQUEST_CHANGES when unresolved prior finding exists", () => {
    const recon: PriorReconciliation = {
      ...emptyRecon,
      unresolved: [
        {
          commentId: 1,
          path: "src/foo.ts",
          line: 10,
          body: "Fix this",
          status: "unresolved",
        },
      ],
    }
    const result = computeFinalAction({
      verifiedFindings: [],
      assessment: makeAssessment(),
      priorReconciliation: recon,
    })
    expect(result.action).toBe("REQUEST_CHANGES")
    expect(result.reasons).toEqual(
      expect.arrayContaining(["Unresolved prior blocking finding(s) exist"]),
    )
  })

  test("REQUEST_CHANGES when critical test gap for risky logic", () => {
    const result = computeFinalAction({
      verifiedFindings: [
        makeFinding({ kind: "test_gap", severity: "critical" }),
      ],
      assessment: makeAssessment(),
      priorReconciliation: emptyRecon,
    })
    expect(result.action).toBe("REQUEST_CHANGES")
    expect(result.reasons).toEqual(
      expect.arrayContaining(["Critical test coverage gap for verified finding"]),
    )
  })

  test("REQUEST_CHANGES when missing critical tests and non-low risk", () => {
    const result = computeFinalAction({
      verifiedFindings: [],
      assessment: makeAssessment({ risk: "high", testAdequacy: "missing_critical" }),
      priorReconciliation: emptyRecon,
    })
    expect(result.action).toBe("REQUEST_CHANGES")
  })

  test("COMMENT when only non-blocking findings", () => {
    const result = computeFinalAction({
      verifiedFindings: [
        makeFinding({ kind: "nit", severity: "low" }),
      ],
      assessment: makeAssessment(),
      priorReconciliation: emptyRecon,
    })
    expect(result.action).toBe("COMMENT")
  })

  test("COMMENT when low confidence", () => {
    const result = computeFinalAction({
      verifiedFindings: [],
      assessment: makeAssessment({ confidence: "low" }),
      priorReconciliation: emptyRecon,
    })
    expect(result.action).toBe("COMMENT")
    expect(result.reasons).toEqual(
      expect.arrayContaining(["Confidence is low"]),
    )
  })

  test("COMMENT when weak tests", () => {
    const result = computeFinalAction({
      verifiedFindings: [],
      assessment: makeAssessment({ testAdequacy: "weak" }),
      priorReconciliation: emptyRecon,
    })
    expect(result.action).toBe("COMMENT")
  })

  test("COMMENT when open questions exist", () => {
    const result = computeFinalAction({
      verifiedFindings: [
        makeFinding({ kind: "question", severity: "low" }),
      ],
      assessment: makeAssessment(),
      priorReconciliation: emptyRecon,
    })
    expect(result.action).toBe("COMMENT")
  })

  test("COMMENT when partially resolved prior findings", () => {
    const recon: PriorReconciliation = {
      ...emptyRecon,
      partiallyResolved: [
        {
          commentId: 1,
          path: "src/foo.ts",
          line: 10,
          body: "Fix this",
          status: "partially_resolved",
        },
      ],
    }
    const result = computeFinalAction({
      verifiedFindings: [],
      assessment: makeAssessment(),
      priorReconciliation: recon,
    })
    expect(result.action).toBe("COMMENT")
  })

  test("rejected findings are ignored for blocking", () => {
    const result = computeFinalAction({
      verifiedFindings: [
        makeFinding({
          kind: "blocking_bug",
          severity: "critical",
          verificationStatus: "rejected",
        }),
      ],
      assessment: makeAssessment(),
      priorReconciliation: emptyRecon,
    })
    expect(result.action).toBe("APPROVE")
  })

  test("APPROVE with medium confidence and adequate tests", () => {
    const result = computeFinalAction({
      verifiedFindings: [],
      assessment: makeAssessment({ confidence: "medium" }),
      priorReconciliation: emptyRecon,
    })
    expect(result.action).toBe("APPROVE")
  })

  test("missing critical tests with low risk does not block", () => {
    const result = computeFinalAction({
      verifiedFindings: [],
      assessment: makeAssessment({ risk: "low", testAdequacy: "missing_critical" }),
      priorReconciliation: emptyRecon,
    })
    expect(result.action).toBe("COMMENT")
  })
})

describe("canApprove", () => {
  test("true when all conditions met", () => {
    expect(
      canApprove({
        verifiedFindings: [],
        assessment: makeAssessment(),
        priorReconciliation: emptyRecon,
      }),
    ).toBe(true)
  })

  test("false when blocking finding", () => {
    expect(
      canApprove({
        verifiedFindings: [makeFinding({ kind: "blocking_bug" })],
        assessment: makeAssessment(),
        priorReconciliation: emptyRecon,
      }),
    ).toBe(false)
  })

  test("false when low confidence", () => {
    expect(
      canApprove({
        verifiedFindings: [],
        assessment: makeAssessment({ confidence: "low" }),
        priorReconciliation: emptyRecon,
      }),
    ).toBe(false)
  })
})
