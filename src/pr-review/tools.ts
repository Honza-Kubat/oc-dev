import { tool } from "@opencode-ai/plugin"
import type { PluginInput } from "@opencode-ai/plugin"
import { z } from "zod"
import type {
  CandidateFinding,
  VerifiedFinding,
  ReviewSession,
  AssessmentInput,
  PriorThreadReference,
} from "./types"
import { ReviewState } from "./types"
import { SessionStore, transition, assertState } from "./state"
import { parsePrRef } from "./parse-pr-ref"
import { CandidateFindingsArraySchema, VerificationResultsArraySchema, AssessmentInputSchema } from "./schemas"
import { validateLineRange } from "./diff"
import {
  validateCandidateFinding,
  validateReviewBody,
  validateInlineComment,
  validatePayloadLimits,
  containsSecrets,
} from "./validation"
import { deduplicateFindings } from "./dedupe"
import { batchVerify } from "./verification"
import { computeFinalAction } from "./policy"
import {
  resolveGitRemote,
  fetchPrMetadata,
  fetchLinkedIssue,
  fetchChangedFiles,
  fetchDiff,
  fetchPriorReviews,
  fetchPriorComments,
  postReview,
} from "./github"
import {
  reconcilePriorReviews,
  getPriorThreadsMap,
} from "./reconcile"
import { buildReviewPayload } from "./format"

const store = new SessionStore()

function jsonResult(data: unknown): string {
  return JSON.stringify(data, null, 2)
}

function errorResult(message: string): string {
  return jsonResult({ ok: false, error: message })
}

function okResult(data: Record<string, unknown>): string {
  return jsonResult({ ok: true, ...data })
}

export function createPrReviewTools(ctx: PluginInput) {
  const { $, directory } = ctx

  const prReviewStart = tool({
    description:
      "Start a PR review by parsing and validating the PR reference. Accepts a PR number or full GitHub PR URL.",
    args: {
      ref: z.string().describe("PR number (e.g. 1234) or full GitHub PR URL"),
    },
    async execute(args, toolCtx) {
      try {
        const session = store.get(toolCtx.sessionID)
        assertState(session, ReviewState.IDLE)

        let remoteOwner: string | undefined
        let remoteRepo: string | undefined
        try {
          const remote = await resolveGitRemote($, directory)
          remoteOwner = remote.owner
          remoteRepo = remote.repo
        } catch {
          // remote resolution is optional for URL refs
        }

        const prRef = parsePrRef(args.ref, remoteOwner, remoteRepo)

        const updated = transition(
          { ...session, prRef },
          ReviewState.COLLECTING_CONTEXT,
        )
        store.set(toolCtx.sessionID, updated)

        return okResult({
          prRef: { owner: prRef.owner, repo: prRef.repo, number: prRef.number },
          state: updated.state,
          nextStep: "Call pr-review-load-context to fetch PR data",
        })
      } catch (err) {
        return errorResult(
          err instanceof Error ? err.message : String(err),
        )
      }
    },
  })

  const prReviewLoadContext = tool({
    description:
      "Load full PR context: metadata, diff, changed files, prior reviews, comments, and linked issue.",
    args: {},
    async execute(_args, toolCtx) {
      try {
        const session = store.get(toolCtx.sessionID)
        assertState(session, ReviewState.COLLECTING_CONTEXT)

        if (!session.prRef) {
          return errorResult("No PR reference resolved. Call pr-review-start first.")
        }
        const ref = session.prRef

        const [metadata, changedFiles, diffHunks, priorReviews, priorComments] =
          await Promise.all([
            fetchPrMetadata($, ref),
            fetchChangedFiles($, ref),
            fetchDiff($, ref),
            fetchPriorReviews($, ref),
            fetchPriorComments($, ref),
          ])

        const linkedIssue = await fetchLinkedIssue($, ref, metadata.body)

        const context = {
          prRef: ref,
          metadata,
          linkedIssue,
          changedFiles,
          diffHunks,
          priorReviews,
          priorComments,
        }

        const updated = transition(
          {
            ...session,
            context,
          },
          ReviewState.ANALYZING,
        )
        store.set(toolCtx.sessionID, updated)

        const changedFileNames = changedFiles.map((f) => f.filename)
        const priorCommentCount = priorComments.length
        const priorReviewCount = priorReviews.length

        return okResult({
          state: updated.state,
          prTitle: metadata.title,
          prAuthor: metadata.author,
          baseBranch: metadata.baseRef,
          headBranch: metadata.headRef,
          linkedIssue: linkedIssue
            ? { title: linkedIssue.title, labels: linkedIssue.labels }
            : null,
          changedFiles: changedFileNames,
          totalAdditions: changedFiles.reduce((s, f) => s + f.additions, 0),
          totalDeletions: changedFiles.reduce((s, f) => s + f.deletions, 0),
          diffHunkCount: diffHunks.length,
          priorReviewCount,
          priorCommentCount,
          diff: diffHunks
            .map(
              (h) =>
                `--- ${h.file} @@ ${h.oldStart},${h.oldEnd} +${h.newStart},${h.newEnd}\n${h.lines.map((l) => `${l.type === "add" ? "+" : l.type === "remove" ? "-" : " "}${l.content}`).join("\n")}`,
            )
            .join("\n\n"),
          priorReviews: priorReviews.map((r) => ({
            id: r.id,
            user: r.user,
            state: r.state,
            body: r.body.substring(0, 500),
          })),
          priorComments: priorComments.map((c) => ({
            id: c.id,
            path: c.path,
            line: c.line,
            body: c.body.substring(0, 500),
          })),
          nextStep:
            "Analyze the code and diff. Then call pr-review-submit-analysis with your findings as a JSON array.",
        })
      } catch (err) {
        return errorResult(
          err instanceof Error ? err.message : String(err),
        )
      }
    },
  })

  const prReviewSubmitAnalysis = tool({
    description:
      "Submit candidate findings from your analysis. Provide a JSON array of findings. Each finding must have exact file/line references from the diff.",
    args: {
      findings_json: z
        .string()
        .describe(
          'JSON array of candidate findings. Each: {id, kind, file, lineStart, lineEnd, title, body, suggestion?, confidence, evidence[]}',
        ),
    },
    async execute(args, toolCtx) {
      try {
        const session = store.get(toolCtx.sessionID)
        assertState(session, ReviewState.ANALYZING)

        if (!session.context) {
          return errorResult("No context loaded. Call pr-review-load-context first.")
        }

        let parsed: unknown
        try {
          parsed = JSON.parse(args.findings_json)
        } catch {
          return errorResult(
            "Invalid JSON in findings_json. Provide a valid JSON array.",
          )
        }

        const parseResult = CandidateFindingsArraySchema.safeParse(parsed)
        if (!parseResult.success) {
          return errorResult(
            `Schema validation failed: ${JSON.stringify(parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`))}`,
          )
        }

        const rawFindings: CandidateFinding[] = parseResult.data
        const validationErrors: string[] = []

        for (const f of rawFindings) {
          const issues = validateCandidateFinding(f)
          if (issues.length > 0) {
            validationErrors.push(
              `Finding ${f.id}: ${issues.map((i) => `${i.field}: ${i.message}`).join("; ")}`,
            )
          }
        }
        if (validationErrors.length > 0) {
          return errorResult(`Validation errors: ${validationErrors.join(" | ")}`)
        }

        for (const f of rawFindings) {
          const rangeCheck = validateLineRange(
            session.context.diffHunks,
            f.file,
            f.lineStart,
            f.lineEnd,
          )
          if (!rangeCheck.valid) {
            return errorResult(
              `Finding ${f.id}: ${rangeCheck.reason}. Adjust line range to map to an actual changed hunk.`,
            )
          }
        }

        const { unique, duplicates } = deduplicateFindings(rawFindings)

        const updated = transition(
          {
            ...session,
            candidateFindings: unique,
          },
          ReviewState.CANDIDATES_READY,
        )
        store.set(toolCtx.sessionID, updated)

        return okResult({
          state: updated.state,
          acceptedFindings: unique.length,
          duplicatesDropped: duplicates.length,
          duplicates: duplicates.map((d) => ({
            id: d.finding.id,
            duplicateOf: d.duplicateOf,
            reason: d.reason,
          })),
          findings: unique.map((f) => ({
            id: f.id,
            kind: f.kind,
            file: f.file,
            lines: `${f.lineStart}-${f.lineEnd}`,
            title: f.title,
          })),
          nextStep:
            "Re-examine each finding. Then call pr-review-verify with verification status and severity for each.",
        })
      } catch (err) {
        return errorResult(
          err instanceof Error ? err.message : String(err),
        )
      }
    },
  })

  const prReviewVerify = tool({
    description:
      "Verify findings from the analysis pass. Provide verification status and severity for each finding.",
    args: {
      verifications_json: z
        .string()
        .describe(
          'JSON array of verification results. Each: {findingId, status: "verified"|"rejected"|"needs_more_evidence", severity: "critical"|"high"|"medium"|"low", notes?}',
        ),
    },
    async execute(args, toolCtx) {
      try {
        const session = store.get(toolCtx.sessionID)
        assertState(session, ReviewState.CANDIDATES_READY)

        if (!session.context) {
          return errorResult("No context loaded.")
        }

        let parsed: unknown
        try {
          parsed = JSON.parse(args.verifications_json)
        } catch {
          return errorResult("Invalid JSON in verifications_json.")
        }

        const parseResult = VerificationResultsArraySchema.safeParse(parsed)
        if (!parseResult.success) {
          return errorResult(
            `Schema validation failed: ${JSON.stringify(parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`))}`,
          )
        }

        const priorRecon = reconcilePriorReviews(
          session.context.priorComments,
          session.context.priorReviews,
          session.context.changedFiles.map((f) => f.filename),
          [],
        )
        const priorThreadsMap = getPriorThreadsMap(priorRecon)
        const threadMap = new Map<string, PriorThreadReference>()
        for (const [key, val] of priorThreadsMap) {
          threadMap.set(key, {
            reviewId: val.reviewId,
            commentId: val.commentId,
            body: val.body,
            status: val.status,
          })
        }

        const { verified, warnings, errors } = batchVerify(
          session.candidateFindings,
          parseResult.data,
          threadMap,
        )

        if (errors.length > 0 && verified.length === 0) {
          return errorResult(`All verifications failed: ${errors.join("; ")}`)
        }

        const finalRecon = reconcilePriorReviews(
          session.context.priorComments,
          session.context.priorReviews,
          session.context.changedFiles.map((f) => f.filename),
          verified,
        )

        const updated = transition(
          {
            ...session,
            verifiedFindings: verified,
            priorReconciliation: finalRecon,
          },
          ReviewState.VERIFIED,
        )
        store.set(toolCtx.sessionID, updated)

        return okResult({
          state: updated.state,
          verifiedCount: verified.filter((f) => f.verificationStatus === "verified").length,
          rejectedCount: verified.filter((f) => f.verificationStatus === "rejected").length,
          needsMoreEvidenceCount: verified.filter((f) => f.verificationStatus === "needs_more_evidence").length,
          warnings,
          errors,
          verifiedFindings: verified.map((f) => ({
            id: f.id,
            kind: f.kind,
            severity: f.severity,
            status: f.verificationStatus,
            file: f.file,
            lines: `${f.lineStart}-${f.lineEnd}`,
            title: f.title,
          })),
          priorReconciliation: {
            resolved: finalRecon.resolved.length,
            partiallyResolved: finalRecon.partiallyResolved.length,
            unresolved: finalRecon.unresolved.length,
            obsolete: finalRecon.obsolete.length,
          },
          nextStep:
            "Call pr-review-finalize with your risk/size/confidence/test assessments and summaries.",
        })
      } catch (err) {
        return errorResult(
          err instanceof Error ? err.message : String(err),
        )
      }
    },
  })

  const prReviewFinalize = tool({
    description:
      "Finalize the review: provide assessments and get the computed review action. The final action is determined by deterministic policy - you cannot override it.",
    args: {
      risk: z.enum(["low", "medium", "high"]).describe("Risk assessment"),
      size: z.enum(["small", "medium", "large"]).describe("Size assessment"),
      confidence: z
        .enum(["low", "medium", "high"])
        .describe("Confidence assessment"),
      test_adequacy: z
        .enum(["adequate", "weak", "missing_critical"])
        .describe("Test coverage assessment"),
      goal_summary: z.string().describe("Summary of what this PR aims to achieve"),
      implementation_summary: z
        .string()
        .describe("Summary of how the PR implements the goal"),
    },
    async execute(args, toolCtx) {
      try {
        const session = store.get(toolCtx.sessionID)
        assertState(session, ReviewState.VERIFIED)

        const assessmentInput: AssessmentInput = {
          risk: args.risk,
          size: args.size,
          confidence: args.confidence,
          testAdequacy: args.test_adequacy,
          goalSummary: args.goal_summary,
          implementationSummary: args.implementation_summary,
        }

        const parseResult = AssessmentInputSchema.safeParse(assessmentInput)
        if (!parseResult.success) {
          return errorResult(
            `Assessment validation failed: ${JSON.stringify(parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`))}`,
          )
        }

        const policyResult = computeFinalAction({
          verifiedFindings: session.verifiedFindings,
          assessment: assessmentInput,
          priorReconciliation: session.priorReconciliation,
        })

        const summary = {
          goalSummary: assessmentInput.goalSummary,
          implementationSummary: assessmentInput.implementationSummary,
          riskAssessment: assessmentInput.risk,
          sizeAssessment: assessmentInput.size,
          confidenceAssessment: assessmentInput.confidence,
          testAssessment: assessmentInput.testAdequacy,
          finalAction: policyResult.action,
          finalBody: "",
        }

        const payload = buildReviewPayload(
          summary,
          session.verifiedFindings,
          session.priorReconciliation,
          policyResult.reasons,
        )

        const bodyIssues = validateReviewBody(payload.body)
        if (bodyIssues.length > 0) {
          return errorResult(
            `Review body validation failed: ${bodyIssues.map((i) => i.message).join("; ")}`,
          )
        }

        const commentIssues: string[] = []
        for (const comment of payload.comments) {
          const issues = validateInlineComment(comment)
          commentIssues.push(
            ...issues.map((i) => `${comment.path}:${comment.line} ${i.field}: ${i.message}`),
          )
        }
        if (commentIssues.length > 0) {
          return errorResult(
            `Inline comment validation failed: ${commentIssues.join("; ")}`,
          )
        }

        const limitIssues = validatePayloadLimits(payload.comments)
        if (limitIssues.length > 0) {
          return errorResult(
            `Payload limit validation failed: ${limitIssues.map((i) => i.message).join("; ")}`,
          )
        }

        if (session.context) {
          for (const comment of payload.comments) {
            const rangeCheck = validateLineRange(
              session.context.diffHunks,
              comment.path,
              comment.startLine ?? comment.line,
              comment.line,
            )
            if (!rangeCheck.valid) {
              return errorResult(
                `Inline comment for ${comment.path}:${comment.line} failed diff validation: ${rangeCheck.reason}`,
              )
            }
          }
        }

        const updated = transition(
          {
            ...session,
            summary,
            payload,
          },
          ReviewState.FINALIZED,
        )
        store.set(toolCtx.sessionID, updated)

        return okResult({
          state: updated.state,
          finalAction: policyResult.action,
          policyReasons: policyResult.reasons,
          totalInlineComments: payload.comments.length,
          reviewBodyPreview: payload.body.substring(0, 800) + (payload.body.length > 800 ? "..." : ""),
          comments: payload.comments.map((c) => ({
            path: c.path,
            line: c.startLine ? `${c.startLine}-${c.line}` : c.line,
            bodyPreview: c.body.substring(0, 200),
          })),
          nextStep:
            "Review the payload above. If correct, call pr-review-post to submit. You cannot change the action.",
        })
      } catch (err) {
        return errorResult(
          err instanceof Error ? err.message : String(err),
        )
      }
    },
  })

  const prReviewPost = tool({
    description:
      "Post the finalized review to GitHub. This is irreversible. Only works if the review has been finalized and all validations passed.",
    args: {
      confirm: z
        .literal(true)
        .describe("Must be explicitly set to true to confirm posting."),
    },
    async execute(args, toolCtx) {
      try {
        if (!args.confirm) {
          return errorResult("Set confirm to true to post the review.")
        }

        const session = store.get(toolCtx.sessionID)
        assertState(session, ReviewState.FINALIZED)

        if (!session.prRef) {
          return errorResult("No PR reference.")
        }
        if (!session.payload) {
          return errorResult("No review payload. Call pr-review-finalize first.")
        }

        if (containsSecrets(session.payload.body)) {
          return errorResult(
            "ABORT: Review body contains potential secrets/tokens. Review manually.",
          )
        }
        for (const comment of session.payload.comments) {
          if (containsSecrets(comment.body)) {
            return errorResult(
              `ABORT: Comment on ${comment.path}:${comment.line} contains potential secrets/tokens.`,
            )
          }
        }

        const result = await postReview(
          $,
          session.prRef,
          session.payload.body,
          session.payload.event,
          session.payload.comments,
        )

        const updated = transition(session, ReviewState.POSTED)
        store.set(toolCtx.sessionID, updated)
        store.delete(toolCtx.sessionID)

        return okResult({
          state: updated.state,
          reviewId: result.reviewId,
          reviewUrl: result.url,
          action: session.payload.event,
          commentCount: session.payload.comments.length,
          message: "Review posted successfully.",
        })
      } catch (err) {
        return errorResult(
          err instanceof Error ? err.message : String(err),
        )
      }
    },
  })

  return {
    "pr-review-start": prReviewStart,
    "pr-review-load-context": prReviewLoadContext,
    "pr-review-submit-analysis": prReviewSubmitAnalysis,
    "pr-review-verify": prReviewVerify,
    "pr-review-finalize": prReviewFinalize,
    "pr-review-post": prReviewPost,
  }
}
