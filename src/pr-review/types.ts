export enum ReviewState {
  IDLE = "IDLE",
  COLLECTING_CONTEXT = "COLLECTING_CONTEXT",
  ANALYZING = "ANALYZING",
  CANDIDATES_READY = "CANDIDATES_READY",
  VERIFIED = "VERIFIED",
  FINALIZED = "FINALIZED",
  POSTED = "POSTED",
}

export type FindingKind =
  | "blocking_bug"
  | "likely_bug"
  | "test_gap"
  | "maintainability"
  | "question"
  | "nit"

export type Confidence = "low" | "medium" | "high"
export type Risk = "low" | "medium" | "high"
export type Size = "small" | "medium" | "large"
export type TestAssessment = "adequate" | "weak" | "missing_critical"
export type Severity = "critical" | "high" | "medium" | "low"
export type ReviewAction = "APPROVE" | "COMMENT" | "REQUEST_CHANGES"
export type VerificationStatus = "verified" | "rejected" | "needs_more_evidence"
export type PriorFindingStatus =
  | "resolved"
  | "partially_resolved"
  | "unresolved"
  | "obsolete"
  | "intentionally_not_addressed"

export interface PrRef {
  owner: string
  repo: string
  number: number
}

export interface PrMetadata {
  title: string
  body: string
  baseRef: string
  headRef: string
  author: string
  state: string
  url: string
}

export interface DiffHunk {
  file: string
  oldStart: number
  oldEnd: number
  newStart: number
  newEnd: number
  header: string
  lines: DiffLine[]
}

export interface DiffLine {
  type: "add" | "remove" | "context"
  newLineNo: number | null
  oldLineNo: number | null
  content: string
}

export interface ChangedFile {
  filename: string
  status: string
  additions: number
  deletions: number
}

export interface CandidateFinding {
  id: string
  kind: FindingKind
  file: string
  lineStart: number
  lineEnd: number
  title: string
  body: string
  suggestion?: string
  confidence: Confidence
  evidence: string[]
}

export interface VerifiedFinding {
  id: string
  kind: FindingKind
  file: string
  lineStart: number
  lineEnd: number
  title: string
  body: string
  suggestion?: string
  confidence: Confidence
  evidence: string[]
  verificationStatus: VerificationStatus
  severity: Severity
  duplicateOf: string | null
  relatedPriorThread: PriorThreadReference | null
}

export interface PriorThreadReference {
  reviewId: number
  commentId: number
  body: string
  status: PriorFindingStatus
}

export interface PriorReview {
  id: number
  user: string
  body: string
  state: string
  submittedAt: string
}

export interface PriorComment {
  id: number
  path: string
  line: number
  body: string
  inReplyToId?: number
  diffHunk?: string
}

export interface ReviewSummary {
  goalSummary: string
  implementationSummary: string
  riskAssessment: Risk
  sizeAssessment: Size
  confidenceAssessment: Confidence
  testAssessment: TestAssessment
  finalAction: ReviewAction
  finalBody: string
}

export interface InlineComment {
  path: string
  line: number
  startLine?: number
  body: string
}

export interface ReviewPayload {
  body: string
  event: ReviewAction
  comments: InlineComment[]
}

export interface ReviewContext {
  prRef: PrRef
  metadata: PrMetadata
  linkedIssue: { title: string; body: string; labels: string[] } | null
  changedFiles: ChangedFile[]
  diffHunks: DiffHunk[]
  priorReviews: PriorReview[]
  priorComments: PriorComment[]
}

export interface ReviewSession {
  state: ReviewState
  prRef: PrRef | null
  context: ReviewContext | null
  candidateFindings: CandidateFinding[]
  verifiedFindings: VerifiedFinding[]
  summary: ReviewSummary | null
  payload: ReviewPayload | null
  priorReconciliation: PriorReconciliation | null
}

export interface PriorReconciliation {
  resolved: ReconciledFinding[]
  partiallyResolved: ReconciledFinding[]
  unresolved: ReconciledFinding[]
  obsolete: ReconciledFinding[]
  intentionallyNotAddressed: ReconciledFinding[]
}

export interface ReconciledFinding {
  commentId: number
  path: string
  line: number
  body: string
  status: PriorFindingStatus
}

export interface AssessmentInput {
  risk: Risk
  size: Size
  confidence: Confidence
  testAdequacy: TestAssessment
  goalSummary: string
  implementationSummary: string
}

export const BLOCKING_KINDS: ReadonlySet<FindingKind> = new Set([
  "blocking_bug",
  "likely_bug",
  "test_gap",
])

export const BLOCKING_SEVERITIES: ReadonlySet<Severity> = new Set([
  "critical",
  "high",
])

export const MAX_TITLE_LENGTH = 200
export const MAX_BODY_LENGTH = 2000
export const MAX_SUGGESTION_LENGTH = 4000
export const MAX_EVIDENCE_LENGTH = 500
export const MAX_EVIDENCE_ITEMS = 10
export const MAX_FINDING_ID_LENGTH = 64
export const MAX_SUMMARY_LENGTH = 1000
export const MAX_IMPL_SUMMARY_LENGTH = 2000
export const MAX_REVIEW_BODY_LENGTH = 65536
export const MAX_COMMENT_BODY_LENGTH = 65536
export const MAX_INLINE_COMMENTS = 50
