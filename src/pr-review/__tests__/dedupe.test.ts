import { describe, test, expect } from "bun:test"
import { deduplicateFindings, deduplicateVerified } from "../dedupe"
import type { CandidateFinding, VerifiedFinding } from "../types"

const makeFinding = (overrides: Partial<CandidateFinding> = {}): CandidateFinding => ({
  id: "f1",
  kind: "blocking_bug",
  file: "src/foo.ts",
  lineStart: 10,
  lineEnd: 15,
  title: "Null pointer dereference",
  body: "Variable can be null",
  confidence: "high",
  evidence: ["Line 10 accesses .prop without check"],
  ...overrides,
})

describe("deduplicateFindings", () => {
  test("returns all unique findings", () => {
    const findings = [
      makeFinding({ id: "f1", file: "src/a.ts", lineStart: 1, lineEnd: 5 }),
      makeFinding({ id: "f2", file: "src/b.ts", lineStart: 1, lineEnd: 5 }),
    ]
    const result = deduplicateFindings(findings)
    expect(result.unique.length).toBe(2)
    expect(result.duplicates.length).toBe(0)
  })

  test("deduplicates same location same kind", () => {
    const findings = [
      makeFinding({ id: "f1", file: "src/a.ts", lineStart: 10, lineEnd: 15 }),
      makeFinding({ id: "f2", file: "src/a.ts", lineStart: 10, lineEnd: 15, kind: "blocking_bug" }),
    ]
    const result = deduplicateFindings(findings)
    expect(result.unique.length).toBe(1)
    expect(result.duplicates.length).toBe(1)
    expect(result.duplicates[0].duplicateOf).toBe("f1")
  })

  test("deduplicates same location similar title", () => {
    const findings = [
      makeFinding({ id: "f1", title: "Null pointer dereference", kind: "likely_bug" }),
      makeFinding({ id: "f2", title: "Null pointer dereference issue", kind: "likely_bug" }),
    ]
    const result = deduplicateFindings(findings)
    expect(result.unique.length).toBe(1)
    expect(result.duplicates.length).toBe(1)
  })

  test("keeps different kinds at same location", () => {
    const findings = [
      makeFinding({ id: "f1", kind: "blocking_bug", title: "Bug here" }),
      makeFinding({ id: "f2", kind: "nit", title: "Style issue" }),
    ]
    const result = deduplicateFindings(findings)
    expect(result.unique.length).toBe(2)
  })

  test("handles overlapping locations with same kind and similar title", () => {
    const findings = [
      makeFinding({
        id: "f1",
        file: "src/a.ts",
        lineStart: 10,
        lineEnd: 20,
        kind: "blocking_bug",
        title: "Memory leak in handler",
      }),
      makeFinding({
        id: "f2",
        file: "src/a.ts",
        lineStart: 15,
        lineEnd: 25,
        kind: "blocking_bug",
        title: "Memory leak in handler function",
      }),
    ]
    const result = deduplicateFindings(findings)
    expect(result.unique.length).toBe(1)
  })

  test("normalizes path separators", () => {
    const findings = [
      makeFinding({ id: "f1", file: "src/a.ts" }),
      makeFinding({ id: "f2", file: "src/a.ts" }),
    ]
    const result = deduplicateFindings(findings)
    expect(result.unique.length).toBe(1)
  })

  test("empty input returns empty", () => {
    const result = deduplicateFindings([])
    expect(result.unique).toEqual([])
    expect(result.duplicates).toEqual([])
  })
})

describe("deduplicateVerified", () => {
  const makeVerified = (overrides: Partial<VerifiedFinding> = {}): VerifiedFinding => ({
    id: "f1",
    kind: "blocking_bug",
    file: "src/foo.ts",
    lineStart: 10,
    lineEnd: 15,
    title: "Test",
    body: "Body",
    confidence: "high",
    evidence: ["e"],
    verificationStatus: "verified",
    severity: "critical",
    duplicateOf: null,
    relatedPriorThread: null,
    ...overrides,
  })

  test("removes duplicates by key", () => {
    const findings = [
      makeVerified({ id: "f1", file: "src/a.ts", lineStart: 1, lineEnd: 5 }),
      makeVerified({ id: "f2", file: "src/a.ts", lineStart: 1, lineEnd: 5 }),
    ]
    const result = deduplicateVerified(findings)
    expect(result.length).toBe(1)
  })

  test("skips findings marked as duplicates", () => {
    const findings = [
      makeVerified({ id: "f1", duplicateOf: null }),
      makeVerified({ id: "f2", duplicateOf: "f1" }),
    ]
    const result = deduplicateVerified(findings)
    expect(result.length).toBe(1)
  })

  test("keeps different locations", () => {
    const findings = [
      makeVerified({ id: "f1", file: "src/a.ts", lineStart: 1, lineEnd: 5 }),
      makeVerified({ id: "f2", file: "src/b.ts", lineStart: 1, lineEnd: 5 }),
    ]
    const result = deduplicateVerified(findings)
    expect(result.length).toBe(2)
  })
})
