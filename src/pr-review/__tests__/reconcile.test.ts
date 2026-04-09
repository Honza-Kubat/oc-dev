import { describe, test, expect } from "bun:test"
import {
  reconcilePriorReviews,
  hasUnresolvedBlockers,
  getPriorThreadsMap,
} from "../reconcile"
import type { PriorComment, PriorReview, VerifiedFinding, PriorReconciliation } from "../types"

const makeComment = (overrides: Partial<PriorComment> = {}): PriorComment => ({
  id: 1,
  path: "src/foo.ts",
  line: 10,
  body: "This function has a null pointer issue",
  ...overrides,
})

const makeVerifiedFinding = (overrides: Partial<VerifiedFinding> = {}): VerifiedFinding => ({
  id: "f1",
  kind: "blocking_bug",
  file: "src/foo.ts",
  lineStart: 10,
  lineEnd: 15,
  title: "Null pointer dereference",
  body: "Variable can be null and is dereferenced",
  confidence: "high",
  evidence: ["Line 10 accesses .prop without check"],
  verificationStatus: "verified",
  severity: "critical",
  duplicateOf: null,
  relatedPriorThread: null,
  ...overrides,
})

describe("reconcilePriorReviews", () => {
  const priorReviews: PriorReview[] = [
    { id: 1, user: "reviewer", body: "LGTM mostly", state: "COMMENTED", submittedAt: "2024-01-01" },
  ]

  test("marks prior comments on unchanged files as obsolete", () => {
    const comments = [
      makeComment({ id: 1, path: "src/deleted.ts", line: 10 }),
    ]
    const result = reconcilePriorReviews(comments, priorReviews, ["src/foo.ts"], [])
    expect(result.obsolete.length).toBe(1)
    expect(result.resolved.length).toBe(0)
  })

  test("marks prior comments as unresolved when no matching current finding", () => {
    const comments = [
      makeComment({ id: 1, path: "src/foo.ts", line: 10 }),
    ]
    const result = reconcilePriorReviews(
      comments,
      priorReviews,
      ["src/foo.ts"],
      [],
    )
    expect(result.unresolved.length).toBe(1)
  })

  test("marks prior comments as resolved when matching finding exists", () => {
    const comments = [
      makeComment({
        id: 1,
        path: "src/foo.ts",
        line: 12,
        body: "Null pointer dereference variable can be null",
      }),
    ]
    const findings = [
      makeVerifiedFinding({
        file: "src/foo.ts",
        lineStart: 10,
        lineEnd: 15,
        title: "Null pointer dereference",
        body: "Variable can be null",
      }),
    ]
    const result = reconcilePriorReviews(
      comments,
      priorReviews,
      ["src/foo.ts"],
      findings,
    )
    expect(result.resolved.length).toBe(1)
  })

  test("marks as partially resolved when finding exists but different issue", () => {
    const comments = [
      makeComment({
        id: 1,
        path: "src/foo.ts",
        line: 12,
        body: "Completely unrelated issue about logging",
      }),
    ]
    const findings = [
      makeVerifiedFinding({
        file: "src/foo.ts",
        lineStart: 10,
        lineEnd: 15,
        title: "Null pointer dereference",
        body: "Variable can be null",
      }),
    ]
    const result = reconcilePriorReviews(
      comments,
      priorReviews,
      ["src/foo.ts"],
      findings,
    )
    expect(result.partiallyResolved.length).toBe(1)
  })

  test("filters out reply comments", () => {
    const comments = [
      makeComment({ id: 1, path: "src/foo.ts", line: 10 }),
      makeComment({ id: 2, path: "src/foo.ts", line: 10, inReplyToId: 1 }),
    ]
    const result = reconcilePriorReviews(comments, priorReviews, ["src/foo.ts"], [])
    const total =
      result.resolved.length +
      result.partiallyResolved.length +
      result.unresolved.length +
      result.obsolete.length +
      result.intentionallyNotAddressed.length
    expect(total).toBe(1)
  })

  test("returns empty categories for no prior comments", () => {
    const result = reconcilePriorReviews([], priorReviews, ["src/foo.ts"], [])
    expect(result.resolved).toEqual([])
    expect(result.unresolved).toEqual([])
    expect(result.obsolete).toEqual([])
  })
})

describe("hasUnresolvedBlockers", () => {
  test("returns true when unresolved findings exist", () => {
    const recon: PriorReconciliation = {
      resolved: [],
      partiallyResolved: [],
      unresolved: [
        { commentId: 1, path: "src/foo.ts", line: 10, body: "Fix", status: "unresolved" },
      ],
      obsolete: [],
      intentionallyNotAddressed: [],
    }
    expect(hasUnresolvedBlockers(recon)).toBe(true)
  })

  test("returns false when no unresolved findings", () => {
    const recon: PriorReconciliation = {
      resolved: [
        { commentId: 1, path: "src/foo.ts", line: 10, body: "Fix", status: "resolved" },
      ],
      partiallyResolved: [],
      unresolved: [],
      obsolete: [],
      intentionallyNotAddressed: [],
    }
    expect(hasUnresolvedBlockers(recon)).toBe(false)
  })
})

describe("getPriorThreadsMap", () => {
  test("maps all findings by key", () => {
    const recon: PriorReconciliation = {
      resolved: [
        { commentId: 1, path: "src/foo.ts", line: 10, body: "Fix", status: "resolved" },
      ],
      partiallyResolved: [],
      unresolved: [
        { commentId: 2, path: "src/bar.ts", line: 20, body: "Bug", status: "unresolved" },
      ],
      obsolete: [],
      intentionallyNotAddressed: [],
    }
    const map = getPriorThreadsMap(recon)
    expect(map.size).toBe(2)
    expect(map.has("prior-1")).toBe(true)
    expect(map.has("prior-2")).toBe(true)
    expect(map.get("prior-1")?.status).toBe("resolved")
    expect(map.get("prior-2")?.status).toBe("unresolved")
  })

  test("returns empty map for empty reconciliation", () => {
    const recon: PriorReconciliation = {
      resolved: [],
      partiallyResolved: [],
      unresolved: [],
      obsolete: [],
      intentionallyNotAddressed: [],
    }
    expect(getPriorThreadsMap(recon).size).toBe(0)
  })
})
