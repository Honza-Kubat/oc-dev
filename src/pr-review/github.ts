import type { PluginInput } from "@opencode-ai/plugin"
import type { PrRef, PrMetadata, ChangedFile, PriorReview, PriorComment, DiffHunk } from "./types"
import { parseUnifiedDiff } from "./diff"

type BunShell = PluginInput["$"]

export async function fetchPrMetadata($: BunShell, ref: PrRef): Promise<PrMetadata> {
  const { owner, repo, number: prNumber } = ref
  const text = await $`gh api repos/${owner}/${repo}/pulls/${prNumber}`
    .quiet()
    .text()
  const data = JSON.parse(text)
  return {
    title: data.title ?? "",
    body: data.body ?? "",
    baseRef: data.base?.ref ?? "",
    headRef: data.head?.ref ?? "",
    author: data.user?.login ?? "",
    state: data.state ?? "",
    url: data.html_url ?? "",
  }
}

export async function fetchLinkedIssue(
  $: BunShell,
  ref: PrRef,
  prBody: string,
): Promise<{ title: string; body: string; labels: string[] } | null> {
  const issueRefs = [
    ...prBody.matchAll(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/|#)(\d+)/gi),
  ]
  if (issueRefs.length === 0) return null

  const issueNumber = issueRefs[0][1]
  try {
    const text = await $`gh api repos/${ref.owner}/${ref.repo}/issues/${issueNumber}`
      .quiet()
      .text()
    const data = JSON.parse(text)
    return {
      title: data.title ?? "",
      body: data.body ?? "",
      labels: (data.labels ?? []).map((l: any) => (typeof l === "string" ? l : l.name ?? "")).filter(Boolean),
    }
  } catch {
    return null
  }
}

export async function fetchChangedFiles(
  $: BunShell,
  ref: PrRef,
): Promise<ChangedFile[]> {
  const text = await $`gh api repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files`
    .quiet()
    .text()
  const data = JSON.parse(text) as any[]
  return data.map((f) => ({
    filename: f.filename ?? "",
    status: f.status ?? "",
    additions: f.additions ?? 0,
    deletions: f.deletions ?? 0,
  }))
}

export async function fetchDiff(
  $: BunShell,
  ref: PrRef,
): Promise<DiffHunk[]> {
  const text = await $`gh api repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`
    .quiet()
    .env({ GH_API_ACCEPT_HEADER: "application/vnd.github.v3.diff" })
    .text()
  // The above may not work; fallback to the diff endpoint
  try {
    const diffText = await $`gh pr diff ${ref.number} --repo ${ref.owner}/${ref.repo}`
      .quiet()
      .text()
    return parseUnifiedDiff(diffText)
  } catch {
    return parseUnifiedDiff(text)
  }
}

export async function fetchPriorReviews(
  $: BunShell,
  ref: PrRef,
): Promise<PriorReview[]> {
  try {
    const text = await $`gh api repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews`
      .quiet()
      .text()
    const data = JSON.parse(text) as any[]
    return data.map((r) => ({
      id: r.id ?? 0,
      user: r.user?.login ?? "",
      body: r.body ?? "",
      state: r.state ?? "",
      submittedAt: r.submitted_at ?? "",
    }))
  } catch {
    return []
  }
}

export async function fetchPriorComments(
  $: BunShell,
  ref: PrRef,
): Promise<PriorComment[]> {
  try {
    const text = await $`gh api repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/comments`
      .quiet()
      .text()
    const data = JSON.parse(text) as any[]
    return data.map((c) => ({
      id: c.id ?? 0,
      path: c.path ?? "",
      line: c.line ?? c.original_line ?? 0,
      body: c.body ?? "",
      inReplyToId: c.in_reply_to_id ?? undefined,
      diffHunk: c.diff_hunk ?? undefined,
    }))
  } catch {
    return []
  }
}

export async function resolveGitRemote(
  $: BunShell,
  directory: string,
): Promise<{ owner: string; repo: string }> {
  const url = await $`git remote get-url origin`.cwd(directory).quiet().text()
  const trimmed = url.trim()

  let match = trimmed.match(/^git@github\.com:([^/]+)\/([^/\s]+?)(?:\.git)?$/)
  if (match) return { owner: match[1], repo: match[2] }

  match = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/)
  if (match) return { owner: match[1], repo: match[2] }

  match = trimmed.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/)
  if (match) return { owner: match[1], repo: match[2] }

  throw new Error(`Cannot parse GitHub remote URL: "${trimmed}"`)
}

export async function postReview(
  $: BunShell,
  ref: PrRef,
  body: string,
  event: string,
  comments: Array<{ path: string; line: number; startLine?: number; body: string }>,
): Promise<{ reviewId: number; url: string }> {
  const payload: any = {
    body,
    event,
    comments: comments.map((c) => {
      const comment: any = {
        path: c.path,
        body: c.body,
        line: c.line,
        side: "RIGHT",
      }
      if (c.startLine !== undefined && c.startLine !== c.line) {
        comment.start_line = c.startLine
        comment.start_side = "RIGHT"
      }
      return comment
    }),
  }

  const result = await $`gh api repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews -X POST --input -`
    .quiet()
    .text()

  try {
    const data = JSON.parse(result)
    return {
      reviewId: data.id ?? 0,
      url: data.html_url ?? `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
    }
  } catch {
    return {
      reviewId: 0,
      url: `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
    }
  }
}
