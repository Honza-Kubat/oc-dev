import type { DiffHunk, DiffLine } from "./types"

export function parseUnifiedDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  const lines = diffText.split("\n")
  let currentFile: string | null = null
  let currentHunk: DiffHunk | null = null
  let newLineNo = 0
  let oldLineNo = 0

  for (const line of lines) {
    const fileMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (fileMatch) {
      if (currentHunk) {
        hunks.push(currentHunk)
      }
      currentFile = fileMatch[2]
      currentHunk = null
      continue
    }

    if (line.startsWith("--- a/") || line.startsWith("+++ b/")) {
      continue
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/)
    if (hunkMatch && currentFile) {
      if (currentHunk) {
        hunks.push(currentHunk)
      }
      oldLineNo = parseInt(hunkMatch[1], 10)
      newLineNo = parseInt(hunkMatch[3], 10)
      currentHunk = {
        file: currentFile,
        oldStart: oldLineNo,
        oldEnd: oldLineNo + (parseInt(hunkMatch[2] || "1", 10) - 1),
        newStart: newLineNo,
        newEnd: newLineNo + (parseInt(hunkMatch[4] || "1", 10) - 1),
        header: hunkMatch[0],
        lines: [],
      }
      continue
    }

    if (!currentHunk || !currentFile) continue

    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "add",
        newLineNo: newLineNo++,
        oldLineNo: null,
        content: line.slice(1),
      })
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "remove",
        newLineNo: null,
        oldLineNo: oldLineNo++,
        content: line.slice(1),
      })
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({
        type: "context",
        newLineNo: newLineNo++,
        oldLineNo: oldLineNo++,
        content: line.slice(1),
      })
    } else if (line === "\\ No newline at end of file") {
      // skip
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk)
  }

  return hunks
}

export function lineIsInHunk(
  hunk: DiffHunk,
  file: string,
  lineStart: number,
  lineEnd: number,
): boolean {
  if (hunk.file !== file) return false
  if (lineEnd < lineStart) return false

  for (const line of hunk.lines) {
    if (line.newLineNo === null) continue
    if (line.newLineNo >= lineStart && line.newLineNo <= lineEnd) {
      return true
    }
  }
  return false
}

export function validateLineRange(
  hunks: DiffHunk[],
  file: string,
  lineStart: number,
  lineEnd: number,
): { valid: boolean; reason?: string } {
  const fileHunks = hunks.filter((h) => h.file === file)
  if (fileHunks.length === 0) {
    return { valid: false, reason: `File "${file}" not found in diff` }
  }

  const matchingHunks = fileHunks.filter((h) => lineIsInHunk(h, file, lineStart, lineEnd))
  if (matchingHunks.length === 0) {
    return {
      valid: false,
      reason: `Line range ${lineStart}-${lineEnd} does not map to any changed hunk in "${file}"`,
    }
  }

  return { valid: true }
}

export function fileExistsInDiff(hunks: DiffHunk[], file: string): boolean {
  return hunks.some((h) => h.file === file)
}

export function getChangedLineNumbers(hunks: DiffHunk[], file: string): number[] {
  const lines: number[] = []
  for (const hunk of hunks) {
    if (hunk.file !== file) continue
    for (const line of hunk.lines) {
      if (line.type === "add" && line.newLineNo !== null) {
        lines.push(line.newLineNo)
      }
    }
  }
  return lines
}

export function getChangedFiles(hunks: DiffHunk[]): string[] {
  const files = new Set<string>()
  for (const hunk of hunks) {
    files.add(hunk.file)
  }
  return [...files].sort()
}
