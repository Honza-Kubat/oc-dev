import { z } from "zod"
import {
  MAX_BODY_LENGTH,
  MAX_EVIDENCE_ITEMS,
  MAX_EVIDENCE_LENGTH,
  MAX_FINDING_ID_LENGTH,
  MAX_IMPL_SUMMARY_LENGTH,
  MAX_SUGGESTION_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
} from "./types"

export const FindingKindSchema = z.enum([
  "blocking_bug",
  "likely_bug",
  "test_gap",
  "maintainability",
  "question",
  "nit",
])

export const ConfidenceSchema = z.enum(["low", "medium", "high"])
export const RiskSchema = z.enum(["low", "medium", "high"])
export const SizeSchema = z.enum(["small", "medium", "large"])
export const TestAssessmentSchema = z.enum(["adequate", "weak", "missing_critical"])
export const SeveritySchema = z.enum(["critical", "high", "medium", "low"])
export const VerificationStatusSchema = z.enum(["verified", "rejected", "needs_more_evidence"])
export const PriorFindingStatusSchema = z.enum([
  "resolved",
  "partially_resolved",
  "unresolved",
  "obsolete",
  "intentionally_not_addressed",
])

export const CandidateFindingSchema = z
  .object({
    id: z.string().min(1).max(MAX_FINDING_ID_LENGTH),
    kind: FindingKindSchema,
    file: z.string().min(1),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    title: z.string().min(1).max(MAX_TITLE_LENGTH),
    body: z.string().min(1).max(MAX_BODY_LENGTH),
    suggestion: z.string().max(MAX_SUGGESTION_LENGTH).optional(),
    confidence: ConfidenceSchema,
    evidence: z
      .array(z.string().min(1).max(MAX_EVIDENCE_LENGTH))
      .min(1)
      .max(MAX_EVIDENCE_ITEMS),
  })
  .refine((d) => d.lineEnd >= d.lineStart, {
    message: "lineEnd must be >= lineStart",
  })

export const CandidateFindingsArraySchema = z.array(CandidateFindingSchema).min(0).max(50)

export const VerificationResultSchema = z.object({
  findingId: z.string().min(1).max(MAX_FINDING_ID_LENGTH),
  status: VerificationStatusSchema,
  severity: SeveritySchema,
  notes: z.string().max(1000).optional(),
})

export const VerificationResultsArraySchema = z.array(VerificationResultSchema).min(0).max(50)

export const AssessmentInputSchema = z.object({
  risk: RiskSchema,
  size: SizeSchema,
  confidence: ConfidenceSchema,
  testAdequacy: TestAssessmentSchema,
  goalSummary: z.string().min(10).max(MAX_SUMMARY_LENGTH),
  implementationSummary: z.string().min(10).max(MAX_IMPL_SUMMARY_LENGTH),
})

export const PrRefSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int().positive(),
})
