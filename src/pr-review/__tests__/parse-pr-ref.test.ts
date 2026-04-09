import { describe, test, expect } from "bun:test"
import { parsePrRef, parseGitRemoteUrl, ParseError } from "../parse-pr-ref"

describe("parsePrRef", () => {
  test("parses a full GitHub PR URL", () => {
    const result = parsePrRef("https://github.com/owner/repo/pull/1234")
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      number: 1234,
    })
  })

  test("parses URL with trailing slash", () => {
    const result = parsePrRef("https://github.com/owner/repo/pull/1234/")
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      number: 1234,
    })
  })

  test("parses URL with trailing path segments", () => {
    const result = parsePrRef("https://github.com/owner/repo/pull/1234/files")
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      number: 1234,
    })
  })

  test("parses URL with hyphens and dots in owner/repo", () => {
    const result = parsePrRef("https://github.com/my-org/my.repo/pull/42")
    expect(result).toEqual({
      owner: "my-org",
      repo: "my.repo",
      number: 42,
    })
  })

  test("parses bare PR number with remote info", () => {
    const result = parsePrRef("1234", "owner", "repo")
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      number: 1234,
    })
  })

  test("parses bare PR number with whitespace", () => {
    const result = parsePrRef("  1234  ", "owner", "repo")
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      number: 1234,
    })
  })

  test("throws on empty input", () => {
    expect(() => parsePrRef("")).toThrow(ParseError)
    expect(() => parsePrRef("")).toThrow("required")
  })

  test("throws on bare number without remote info", () => {
    expect(() => parsePrRef("1234")).toThrow(ParseError)
    expect(() => parsePrRef("1234")).toThrow("Cannot resolve owner/repo")
  })

  test("throws on invalid URL", () => {
    expect(() => parsePrRef("https://gitlab.com/owner/repo/pull/1234")).toThrow(ParseError)
  })

  test("throws on non-numeric, non-URL input", () => {
    expect(() => parsePrRef("abc")).toThrow(ParseError)
    expect(() => parsePrRef("abc")).toThrow("Invalid PR reference")
  })

  test("throws on PR number 0", () => {
    expect(() => parsePrRef("0", "owner", "repo")).toThrow()
  })

  test("throws on negative number", () => {
    expect(() => parsePrRef("-1", "owner", "repo")).toThrow(ParseError)
  })
})

describe("parseGitRemoteUrl", () => {
  test("parses SSH URL", () => {
    expect(parseGitRemoteUrl("git@github.com:owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    })
  })

  test("parses SSH URL without .git", () => {
    expect(parseGitRemoteUrl("git@github.com:owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    })
  })

  test("parses HTTPS URL", () => {
    expect(parseGitRemoteUrl("https://github.com/owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    })
  })

  test("parses HTTPS URL without .git", () => {
    expect(parseGitRemoteUrl("https://github.com/owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    })
  })

  test("parses SSH protocol URL", () => {
    expect(parseGitRemoteUrl("ssh://git@github.com/owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    })
  })

  test("throws on unrecognized URL", () => {
    expect(() => parseGitRemoteUrl("https://gitlab.com/owner/repo")).toThrow(ParseError)
  })
})
