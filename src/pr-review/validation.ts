import {
  MAX_TITLE_LENGTH,
  MAX_BODY_LENGTH,
  MAX_SUGGESTION_LENGTH,
  MAX_COMMENT_BODY_LENGTH,
  MAX_REVIEW_BODY_LENGTH,
  MAX_INLINE_COMMENTS,
} from "./types"
import type { CandidateFinding, VerifiedFinding, InlineComment } from "./types"

const SECRET_PATTERNS = [
  /(?:password|passwd|pwd)\s*[:=]\s*\S+/i,
  /(?:api[_-]?key|apikey)\s*[:=]\s*\S+/i,
  /(?:secret|token|bearer)\s*[:=]\s*\S+/i,
  /(?:private[_-]?key)\s*[:=]\s*[-\w/+=]{20,}/i,
  /ghp_[0-9a-zA-Z]{36}/,
  /gho_[0-9a-zA-Z]{36}/,
  /ghu_[0-9a-zA-Z]{36}/,
  /ghs_[0-9a-zA-Z]{36}/,
  /github_pat_[0-9a-zA-Z_]{82}/,
  /sk-[0-9a-zA-Z]{48}/,
  /xox[bpas]-[0-9a-zA-Z-]+/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
]

const CODE_BLOCK_RE = /```[\s\S]*?```/g

export interface ValidationIssue {
  field: string
  message: string
}

export function validateCandidateFinding(f: CandidateFinding): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!f.id || f.id.length === 0) {
    issues.push({ field: "id", message: "Finding id is required" })
  }

  if (!f.title || f.title.trim().length === 0) {
    issues.push({ field: "title", message: "Title must not be empty" })
  } else if (f.title.length > MAX_TITLE_LENGTH) {
    issues.push({ field: "title", message: `Title exceeds max length ${MAX_TITLE_LENGTH}` })
  }

  if (!f.body || f.body.trim().length === 0) {
    issues.push({ field: "body", message: "Body must not be empty" })
  } else if (f.body.length > MAX_BODY_LENGTH) {
    issues.push({ field: "body", message: `Body exceeds max length ${MAX_BODY_LENGTH}` })
  }

  if (f.suggestion !== undefined && f.suggestion.length > MAX_SUGGESTION_LENGTH) {
    issues.push({
      field: "suggestion",
      message: `Suggestion exceeds max length ${MAX_SUGGESTION_LENGTH}`,
    })
  }

  if (!f.file || f.file.trim().length === 0) {
    issues.push({ field: "file", message: "File is required" })
  }

  if (f.lineStart < 1) {
    issues.push({ field: "lineStart", message: "lineStart must be positive" })
  }

  if (f.lineEnd < f.lineStart) {
    issues.push({ field: "lineEnd", message: "lineEnd must be >= lineStart" })
  }

  if (!f.evidence || f.evidence.length === 0) {
    issues.push({ field: "evidence", message: "At least one evidence item is required" })
  }

  return issues
}

export function containsSecrets(text: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(text))
}

export function codeBlockRatio(text: string): number {
  const matches = text.match(CODE_BLOCK_RE)
  if (!matches) return 0
  const codeLen = matches.reduce((sum, m) => sum + m.length, 0)
  return codeLen / text.length
}

export function validateReviewBody(body: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!body || body.trim().length === 0) {
    issues.push({ field: "body", message: "Review body must not be empty" })
  } else if (body.length > MAX_REVIEW_BODY_LENGTH) {
    issues.push({
      field: "body",
      message: `Review body exceeds max length ${MAX_REVIEW_BODY_LENGTH}`,
    })
  }

  if (containsSecrets(body)) {
    issues.push({ field: "body", message: "Review body contains potential secrets/tokens" })
  }

  if (codeBlockRatio(body) > 0.6) {
    issues.push({
      field: "body",
      message: "Review body has too much code (>60%). Reduce code block content.",
    })
  }

  return issues
}

export function validateInlineComment(comment: InlineComment): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!comment.path || comment.path.trim().length === 0) {
    issues.push({ field: "path", message: "Inline comment path is required" })
  }

  if (comment.line < 1) {
    issues.push({ field: "line", message: "Inline comment line must be positive" })
  }

  if (comment.startLine !== undefined && comment.startLine < 1) {
    issues.push({ field: "startLine", message: "Inline comment startLine must be positive" })
  }

  if (
    comment.startLine !== undefined &&
    comment.line < comment.startLine
  ) {
    issues.push({
      field: "line",
      message: "Inline comment line must be >= startLine",
    })
  }

  if (!comment.body || comment.body.trim().length === 0) {
    issues.push({ field: "body", message: "Inline comment body must not be empty" })
  } else if (comment.body.length > MAX_COMMENT_BODY_LENGTH) {
    issues.push({
      field: "body",
      message: `Inline comment body exceeds max length ${MAX_COMMENT_BODY_LENGTH}`,
    })
  }

  if (containsSecrets(comment.body)) {
    issues.push({ field: "body", message: "Inline comment body contains potential secrets/tokens" })
  }

  if (codeBlockRatio(comment.body) > 0.6) {
    issues.push({
      field: "body",
      message: "Inline comment body has too much code (>60%)",
    })
  }

  return issues
}

export function validatePayloadLimits(
  comments: InlineComment[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (comments.length > MAX_INLINE_COMMENTS) {
    issues.push({
      field: "comments",
      message: `Too many inline comments: ${comments.length} (max ${MAX_INLINE_COMMENTS})`,
    })
  }
  return issues
}

export function sanitizeMarkdown(text: string): string {
  let sanitized = text
  sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, "")
  sanitized = sanitized.replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
  sanitized = sanitized.replace(/javascript\s*:/gi, "")
  return sanitized.trim()
}
