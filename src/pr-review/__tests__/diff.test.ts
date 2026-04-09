import { describe, test, expect } from "bun:test"
import { parseUnifiedDiff, validateLineRange, fileExistsInDiff, getChangedFiles, getChangedLineNumbers } from "../diff"

const SAMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index abc1234..def5678 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,5 +10,8 @@ function old() {
 const x = 1;
-const y = 2;
+const y = 3;
+const z = 4;
+const w = 5;
 const result = x + y;
-return result;
+return result + z + w;
}

diff --git a/src/bar.ts b/src/bar.ts
new file 100644
--- /dev/null
+++ b/src/bar.ts
@@ -0,0 +1,3 @@
+export function hello() {
+  return "world";
+}
`

describe("parseUnifiedDiff", () => {
  test("parses multiple file diffs", () => {
    const hunks = parseUnifiedDiff(SAMPLE_DIFF)
    expect(hunks.length).toBe(2)
  })

  test("extracts file names correctly", () => {
    const hunks = parseUnifiedDiff(SAMPLE_DIFF)
    expect(hunks[0].file).toBe("src/foo.ts")
    expect(hunks[1].file).toBe("src/bar.ts")
  })

  test("parses hunk line ranges", () => {
    const hunks = parseUnifiedDiff(SAMPLE_DIFF)
    expect(hunks[0].oldStart).toBe(10)
    expect(hunks[0].newStart).toBe(10)
  })

  test("classifies add/remove/context lines", () => {
    const hunks = parseUnifiedDiff(SAMPLE_DIFF)
    const fooHunk = hunks[0]
    const adds = fooHunk.lines.filter((l) => l.type === "add")
    const removes = fooHunk.lines.filter((l) => l.type === "remove")
    const contexts = fooHunk.lines.filter((l) => l.type === "context")
    expect(adds.length).toBeGreaterThan(0)
    expect(removes.length).toBeGreaterThan(0)
    expect(contexts.length).toBeGreaterThan(0)
  })

  test("tracks new line numbers for additions", () => {
    const hunks = parseUnifiedDiff(SAMPLE_DIFF)
    const barHunk = hunks[1]
    const addLines = barHunk.lines.filter((l) => l.type === "add")
    expect(addLines.map((l) => l.newLineNo)).toEqual([1, 2, 3])
  })

  test("returns empty for empty diff", () => {
    const hunks = parseUnifiedDiff("")
    expect(hunks).toEqual([])
  })

  test("handles diff with no changes", () => {
    const hunks = parseUnifiedDiff("diff --git a/foo b/foo\n--- a/foo\n+++ b/foo\n@@ -1,1 +1,1 @@\n context\n")
    expect(hunks.length).toBe(1)
  })
})

describe("validateLineRange", () => {
  const hunks = parseUnifiedDiff(SAMPLE_DIFF)

  test("valid when range overlaps changed lines", () => {
    const result = validateLineRange(hunks, "src/foo.ts", 10, 15)
    expect(result.valid).toBe(true)
  })

  test("invalid when file not in diff", () => {
    const result = validateLineRange(hunks, "src/missing.ts", 1, 10)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("not found in diff")
  })

  test("invalid when range outside changed hunks", () => {
    const result = validateLineRange(hunks, "src/foo.ts", 1, 5)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("does not map")
  })

  test("valid for new file additions", () => {
    const result = validateLineRange(hunks, "src/bar.ts", 1, 3)
    expect(result.valid).toBe(true)
  })
})

describe("fileExistsInDiff", () => {
  const hunks = parseUnifiedDiff(SAMPLE_DIFF)

  test("returns true for existing file", () => {
    expect(fileExistsInDiff(hunks, "src/foo.ts")).toBe(true)
  })

  test("returns false for missing file", () => {
    expect(fileExistsInDiff(hunks, "src/missing.ts")).toBe(false)
  })
})

describe("getChangedFiles", () => {
  test("returns unique sorted file list", () => {
    const hunks = parseUnifiedDiff(SAMPLE_DIFF)
    const files = getChangedFiles(hunks)
    expect(files).toEqual(["src/bar.ts", "src/foo.ts"])
  })
})

describe("getChangedLineNumbers", () => {
  const hunks = parseUnifiedDiff(SAMPLE_DIFF)

  test("returns added line numbers for a file", () => {
    const lines = getChangedLineNumbers(hunks, "src/bar.ts")
    expect(lines).toEqual([1, 2, 3])
  })

  test("returns empty for missing file", () => {
    const lines = getChangedLineNumbers(hunks, "missing.ts")
    expect(lines).toEqual([])
  })
})
