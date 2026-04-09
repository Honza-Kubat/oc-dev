import type { PrRef } from "./types"

const GITHUB_PR_URL_RE =
  /^https:\/\/github\.com\/([a-zA-Z0-9\-_.]+)\/([a-zA-Z0-9\-_.]+)\/pull\/(\d+)(?:\/.*)?$/
const NUMERIC_RE = /^\d+$/

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ParseError"
  }
}

export function parsePrRef(input: string, remoteOwner?: string, remoteRepo?: string): PrRef {
  if (!input || typeof input !== "string") {
    throw new ParseError("PR reference is required")
  }

  const trimmed = input.trim()

  const urlMatch = trimmed.match(GITHUB_PR_URL_RE)
  if (urlMatch) {
    const prNumber = parseInt(urlMatch[3], 10)
    if (prNumber < 1) {
      throw new ParseError("PR number must be a positive integer")
    }
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      number: prNumber,
    }
  }

  if (NUMERIC_RE.test(trimmed)) {
    const prNumber = parseInt(trimmed, 10)
    if (prNumber < 1) {
      throw new ParseError("PR number must be a positive integer")
    }
    if (!remoteOwner || !remoteRepo) {
      throw new ParseError(
        "Cannot resolve owner/repo from bare PR number. Provide a full GitHub PR URL or run from inside a git repository with a GitHub remote.",
      )
    }
    return {
      owner: remoteOwner,
      repo: remoteRepo,
      number: prNumber,
    }
  }

  throw new ParseError(
    `Invalid PR reference: "${trimmed}". Expected a PR number (e.g. 1234) or a GitHub PR URL (e.g. https://github.com/OWNER/REPO/pull/1234).`,
  )
}

export function parseGitRemoteUrl(url: string): { owner: string; repo: string } {
  let match: RegExpMatchArray | null

  match = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (match) {
    return { owner: match[1], repo: match[2] }
  }

  match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (match) {
    return { owner: match[1], repo: match[2] }
  }

  match = url.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (match) {
    return { owner: match[1], repo: match[2] }
  }

  throw new ParseError(`Cannot parse GitHub remote URL: "${url}"`)
}
