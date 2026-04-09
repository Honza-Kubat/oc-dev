import type { CandidateFinding, VerifiedFinding } from "./types"

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/?/, "")
}

function titleSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase().replace(/[^a-z0-9]/g, "")
  const normB = b.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (normA === normB) return 1
  if (normA.length === 0 || normB.length === 0) return 0

  const setA = new Set(normA.split(""))
  const setB = new Set(normB.split(""))
  let intersection = 0
  for (const c of setA) {
    if (setB.has(c)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

function isSameLocation(
  a: { file: string; lineStart: number; lineEnd: number },
  b: { file: string; lineStart: number; lineEnd: number },
): boolean {
  return (
    normalizePath(a.file) === normalizePath(b.file) &&
    a.lineStart === b.lineStart &&
    a.lineEnd === b.lineEnd
  )
}

function isOverlappingLocation(
  a: { file: string; lineStart: number; lineEnd: number },
  b: { file: string; lineStart: number; lineEnd: number },
): boolean {
  return (
    normalizePath(a.file) === normalizePath(b.file) &&
    a.lineStart <= b.lineEnd &&
    b.lineStart <= a.lineEnd
  )
}

export interface DeduplicationResult {
  unique: CandidateFinding[]
  duplicates: Array<{
    finding: CandidateFinding
    duplicateOf: string
    reason: string
  }>
}

export function deduplicateFindings(
  findings: CandidateFinding[],
): DeduplicationResult {
  const unique: CandidateFinding[] = []
  const duplicates: DeduplicationResult["duplicates"] = []

  for (const finding of findings) {
    let isDuplicate = false

    for (const existing of unique) {
      if (isSameLocation(finding, existing)) {
        const titleSim = titleSimilarity(finding.title, existing.title)
        if (titleSim > 0.6 || finding.kind === existing.kind) {
          isDuplicate = true
          duplicates.push({
            finding,
            duplicateOf: existing.id,
            reason: `Same location (${finding.file}:${finding.lineStart}-${finding.lineEnd}) with similar title or same kind`,
          })
          break
        }
      }

      if (isOverlappingLocation(finding, existing) && finding.kind === existing.kind) {
        const titleSim = titleSimilarity(finding.title, existing.title)
        if (titleSim > 0.7) {
          isDuplicate = true
          duplicates.push({
            finding,
            duplicateOf: existing.id,
            reason: `Overlapping location with same kind and similar title`,
          })
          break
        }
      }
    }

    if (!isDuplicate) {
      unique.push(finding)
    }
  }

  return { unique, duplicates }
}

export function deduplicateVerified(
  findings: VerifiedFinding[],
): VerifiedFinding[] {
  const seen = new Map<string, VerifiedFinding>()

  for (const f of findings) {
    if (f.duplicateOf) continue
    const key = `${normalizePath(f.file)}:${f.lineStart}-${f.lineEnd}:${f.kind}`
    if (!seen.has(key)) {
      seen.set(key, f)
    }
  }

  return [...seen.values()]
}

export function findDuplicateOfPrior(
  finding: CandidateFinding,
  priorFindings: Array<{ path: string; line: number; body: string }>,
): number | null {
  const normFile = normalizePath(finding.file)
  for (const prior of priorFindings) {
    const normPriorPath = normalizePath(prior.path)
    if (normPriorPath !== normFile) continue
    if (prior.line >= finding.lineStart && prior.line <= finding.lineEnd) {
      return 1
    }
  }
  return null
}
