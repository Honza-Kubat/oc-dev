import { describe, test, expect } from "bun:test"
import {
  validateCandidateFinding,
  containsSecrets,
  validateReviewBody,
  validateInlineComment,
  validatePayloadLimits,
  sanitizeMarkdown,
  codeBlockRatio,
} from "../validation"
import type { CandidateFinding, InlineComment } from "../types"

const makeFinding = (overrides: Partial<CandidateFinding> = {}): CandidateFinding => ({
  id: "f1",
  kind: "blocking_bug",
  file: "src/foo.ts",
  lineStart: 10,
  lineEnd: 15,
  title: "Test finding",
  body: "Test body with enough content",
  confidence: "high",
  evidence: ["Evidence one"],
  ...overrides,
})

describe("validateCandidateFinding", () => {
  test("passes for valid finding", () => {
    const issues = validateCandidateFinding(makeFinding())
    expect(issues).toEqual([])
  })

  test("rejects empty id", () => {
    const issues = validateCandidateFinding(makeFinding({ id: "" }))
    expect(issues.some((i) => i.field === "id")).toBe(true)
  })

  test("rejects empty title", () => {
    const issues = validateCandidateFinding(makeFinding({ title: "" }))
    expect(issues.some((i) => i.field === "title")).toBe(true)
  })

  test("rejects whitespace-only title", () => {
    const issues = validateCandidateFinding(makeFinding({ title: "   " }))
    expect(issues.some((i) => i.field === "title")).toBe(true)
  })

  test("rejects empty body", () => {
    const issues = validateCandidateFinding(makeFinding({ body: "" }))
    expect(issues.some((i) => i.field === "body")).toBe(true)
  })

  test("rejects empty file", () => {
    const issues = validateCandidateFinding(makeFinding({ file: "" }))
    expect(issues.some((i) => i.field === "file")).toBe(true)
  })

  test("rejects lineEnd < lineStart", () => {
    const issues = validateCandidateFinding(makeFinding({ lineStart: 20, lineEnd: 10 }))
    expect(issues.some((i) => i.field === "lineEnd")).toBe(true)
  })

  test("rejects negative lineStart", () => {
    const issues = validateCandidateFinding(makeFinding({ lineStart: 0 }))
    expect(issues.some((i) => i.field === "lineStart")).toBe(true)
  })

  test("rejects empty evidence", () => {
    const issues = validateCandidateFinding(makeFinding({ evidence: [] }))
    expect(issues.some((i) => i.field === "evidence")).toBe(true)
  })

  test("returns multiple issues at once", () => {
    const issues = validateCandidateFinding({
      id: "",
      kind: "blocking_bug",
      file: "",
      lineStart: -1,
      lineEnd: -2,
      title: "",
      body: "",
      confidence: "low",
      evidence: [],
    })
    expect(issues.length).toBeGreaterThan(1)
  })
})

describe("containsSecrets", () => {
  test("detects GitHub PAT", () => {
    expect(containsSecrets("ghp_1234567890abcdefghijklmnopqrstuvwxyz")).toBe(true)
  })

  test("detects AWS key ID", () => {
    expect(containsSecrets("AKIAIOSFODNN7EXAMPLE")).toBe(true)
  })

  test("detects private key", () => {
    expect(containsSecrets("-----BEGIN RSA PRIVATE KEY-----")).toBe(true)
  })

  test("detects password in text", () => {
    expect(containsSecrets("password=secret123")).toBe(true)
  })

  test("detects api_key assignment", () => {
    expect(containsSecrets("api_key=abc123")).toBe(true)
  })

  test("passes for clean text", () => {
    expect(containsSecrets("This is a normal code review comment")).toBe(false)
  })

  test("passes for normal variable names", () => {
    expect(containsSecrets("const config = getConfig()")).toBe(false)
  })
})

describe("validateReviewBody", () => {
  test("passes for valid body", () => {
    const issues = validateReviewBody("This PR looks good. No issues found.")
    expect(issues).toEqual([])
  })

  test("rejects empty body", () => {
    const issues = validateReviewBody("")
    expect(issues.some((i) => i.field === "body")).toBe(true)
  })

  test("rejects body with secrets", () => {
    const issues = validateReviewBody("Found token=abc123 in the code")
    expect(issues.some((i) => i.message.includes("secrets"))).toBe(true)
  })

  test("rejects body with too much code", () => {
    const codeBlock = "```js\n" + "x".repeat(1000) + "\n```"
    const body = `Short text ${codeBlock}`
    const issues = validateReviewBody(body)
    expect(issues.some((i) => i.message.includes("too much code"))).toBe(true)
  })
})

describe("validateInlineComment", () => {
  test("passes for valid comment", () => {
    const issues = validateInlineComment({
      path: "src/foo.ts",
      line: 10,
      body: "This should be fixed",
    })
    expect(issues).toEqual([])
  })

  test("rejects empty path", () => {
    const issues = validateInlineComment({
      path: "",
      line: 10,
      body: "Fix this",
    })
    expect(issues.some((i) => i.field === "path")).toBe(true)
  })

  test("rejects line < 1", () => {
    const issues = validateInlineComment({
      path: "src/foo.ts",
      line: 0,
      body: "Fix this",
    })
    expect(issues.some((i) => i.field === "line")).toBe(true)
  })

  test("rejects line < startLine", () => {
    const issues = validateInlineComment({
      path: "src/foo.ts",
      line: 5,
      startLine: 10,
      body: "Fix this",
    })
    expect(issues.some((i) => i.field === "line")).toBe(true)
  })

  test("rejects empty body", () => {
    const issues = validateInlineComment({
      path: "src/foo.ts",
      line: 10,
      body: "",
    })
    expect(issues.some((i) => i.field === "body")).toBe(true)
  })

  test("rejects body with secrets", () => {
    const issues = validateInlineComment({
      path: "src/foo.ts",
      line: 10,
      body: "secret=mysecret123",
    })
    expect(issues.some((i) => i.message.includes("secrets"))).toBe(true)
  })
})

describe("validatePayloadLimits", () => {
  test("passes within limit", () => {
    const comments = Array.from({ length: 10 }, (_, i) => ({
      path: "src/foo.ts",
      line: i + 1,
      body: "Comment",
    }))
    expect(validatePayloadLimits(comments)).toEqual([])
  })

  test("rejects over limit", () => {
    const comments = Array.from({ length: 51 }, (_, i) => ({
      path: "src/foo.ts",
      line: i + 1,
      body: "Comment",
    }))
    const issues = validatePayloadLimits(comments)
    expect(issues.some((i) => i.field === "comments")).toBe(true)
  })
})

describe("sanitizeMarkdown", () => {
  test("removes script tags", () => {
    expect(sanitizeMarkdown('<script>alert("xss")</script>')).toBe('')
  })

  test("removes iframe tags", () => {
    expect(sanitizeMarkdown('<iframe src="evil.com"></iframe>')).toBe('')
  })

  test("removes javascript: URLs", () => {
    expect(sanitizeMarkdown("javascript:void(0)")).toBe('void(0)')
  })

  test("preserves normal markdown", () => {
    const md = "# Hello\n\n- item 1\n- item 2"
    expect(sanitizeMarkdown(md)).toBe(md)
  })
})

describe("codeBlockRatio", () => {
  test("returns 0 for no code blocks", () => {
    expect(codeBlockRatio("just text")).toBe(0)
  })

  test("calculates ratio for code blocks", () => {
    const text = "text ```code``` more"
    expect(codeBlockRatio(text)).toBeGreaterThan(0)
    expect(codeBlockRatio(text)).toBeLessThan(1)
  })

  test("returns high ratio for mostly code", () => {
    const text = "```\n" + "x".repeat(100) + "\n```"
    expect(codeBlockRatio(text)).toBeGreaterThan(0.5)
  })
})
