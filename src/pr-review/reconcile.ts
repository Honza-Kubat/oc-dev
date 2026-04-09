import type {
  PriorComment,
  PriorReview,
  PriorReconciliation,
  PriorFindingStatus,
  ReconciledFinding,
  VerifiedFinding,
} from "./types"

function classifyPriorComment(
  comment: PriorComment,
  currentDiffFiles: string[],
  currentVerifiedFindings: VerifiedFinding[],
): PriorFindingStatus {
  if (!currentDiffFiles.includes(comment.path)) {
    return "obsolete"
  }

  const matchingFinding = currentVerifiedFindings.find(
    (f) =>
      f.file === comment.path &&
      f.lineStart <= comment.line &&
      f.lineEnd >= comment.line &&
      f.verificationStatus === "verified",
  )

  if (matchingFinding) {
    const bodySimilarity = computeBodySimilarity(
      comment.body,
      matchingFinding.title + " " + matchingFinding.body,
    )
    if (bodySimilarity > 0.5) {
      return "resolved"
    }
    return "partially_resolved"
  }

  return "unresolved"
}

function computeBodySimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean))
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean))
  if (wordsA.size === 0 && wordsB.size === 0) return 1
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let intersection = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++
  }
  const union = wordsA.size + wordsB.size - intersection
  return union === 0 ? 0 : intersection / union
}

export function reconcilePriorReviews(
  priorComments: PriorComment[],
  priorReviews: PriorReview[],
  currentDiffFiles: string[],
  currentVerifiedFindings: VerifiedFinding[],
): PriorReconciliation {
  const topLevelComments = priorComments.filter((c) => !c.inReplyToId)

  const categorized: ReconciledFinding[] = topLevelComments.map((comment) => ({
    commentId: comment.id,
    path: comment.path,
    line: comment.line,
    body: comment.body,
    status: classifyPriorComment(comment, currentDiffFiles, currentVerifiedFindings),
  }))

  return {
    resolved: categorized.filter((c) => c.status === "resolved"),
    partiallyResolved: categorized.filter((c) => c.status === "partially_resolved"),
    unresolved: categorized.filter((c) => c.status === "unresolved"),
    obsolete: categorized.filter((c) => c.status === "obsolete"),
    intentionallyNotAddressed: [],
  }
}

export function hasUnresolvedBlockers(reconciliation: PriorReconciliation): boolean {
  return reconciliation.unresolved.length > 0
}

export function getPriorThreadsMap(
  reconciliation: PriorReconciliation,
): Map<string, { reviewId: number; commentId: number; body: string; status: PriorFindingStatus }> {
  const map = new Map<string, { reviewId: number; commentId: number; body: string; status: PriorFindingStatus }>()
  const all = [
    ...reconciliation.resolved,
    ...reconciliation.partiallyResolved,
    ...reconciliation.unresolved,
    ...reconciliation.obsolete,
    ...reconciliation.intentionallyNotAddressed,
  ]
  for (const item of all) {
    map.set(`prior-${item.commentId}`, {
      reviewId: 0,
      commentId: item.commentId,
      body: item.body,
      status: item.status,
    })
  }
  return map
}
