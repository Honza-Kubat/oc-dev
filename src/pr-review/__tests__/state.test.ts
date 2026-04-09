import { describe, test, expect } from "bun:test"
import {
  createInitialSession,
  transition,
  assertState,
  assertStateOneOf,
  SessionStore,
} from "../state"
import { ReviewState } from "../types"

describe("createInitialSession", () => {
  test("creates session in IDLE state", () => {
    const session = createInitialSession()
    expect(session.state).toBe(ReviewState.IDLE)
    expect(session.prRef).toBeNull()
    expect(session.context).toBeNull()
    expect(session.candidateFindings).toEqual([])
    expect(session.verifiedFindings).toEqual([])
    expect(session.summary).toBeNull()
    expect(session.payload).toBeNull()
  })
})

describe("transition", () => {
  test("allows IDLE -> COLLECTING_CONTEXT", () => {
    const session = createInitialSession()
    const next = transition(session, ReviewState.COLLECTING_CONTEXT)
    expect(next.state).toBe(ReviewState.COLLECTING_CONTEXT)
  })

  test("allows sequential transitions through full workflow", () => {
    let session = createInitialSession()
    session = transition(session, ReviewState.COLLECTING_CONTEXT)
    session = transition(session, ReviewState.ANALYZING)
    session = transition(session, ReviewState.CANDIDATES_READY)
    session = transition(session, ReviewState.VERIFIED)
    session = transition(session, ReviewState.FINALIZED)
    session = transition(session, ReviewState.POSTED)
    expect(session.state).toBe(ReviewState.POSTED)
  })

  test("rejects invalid transition IDLE -> ANALYZING", () => {
    const session = createInitialSession()
    expect(() => transition(session, ReviewState.ANALYZING)).toThrow("Invalid state transition")
  })

  test("rejects invalid transition IDLE -> POSTED", () => {
    const session = createInitialSession()
    expect(() => transition(session, ReviewState.POSTED)).toThrow("Invalid state transition")
  })

  test("rejects transition from POSTED (terminal state)", () => {
    let session = createInitialSession()
    session = transition(session, ReviewState.COLLECTING_CONTEXT)
    session = transition(session, ReviewState.ANALYZING)
    session = transition(session, ReviewState.CANDIDATES_READY)
    session = transition(session, ReviewState.VERIFIED)
    session = transition(session, ReviewState.FINALIZED)
    session = transition(session, ReviewState.POSTED)
    expect(() => transition(session, ReviewState.IDLE)).toThrow("Invalid state transition")
  })

  test("preserves other session data during transition", () => {
    const session = {
      ...createInitialSession(),
      prRef: { owner: "o", repo: "r", number: 1 },
    }
    const next = transition(session, ReviewState.COLLECTING_CONTEXT)
    expect(next.prRef).toEqual({ owner: "o", repo: "r", number: 1 })
  })
})

describe("assertState", () => {
  test("does not throw when state matches", () => {
    const session = createInitialSession()
    expect(() => assertState(session, ReviewState.IDLE)).not.toThrow()
  })

  test("throws when state does not match", () => {
    const session = createInitialSession()
    expect(() => assertState(session, ReviewState.POSTED)).toThrow("Expected state POSTED")
  })
})

describe("assertStateOneOf", () => {
  test("does not throw when state is in list", () => {
    const session = createInitialSession()
    expect(() =>
      assertStateOneOf(session, [ReviewState.IDLE, ReviewState.ANALYZING]),
    ).not.toThrow()
  })

  test("throws when state is not in list", () => {
    const session = createInitialSession()
    expect(() =>
      assertStateOneOf(session, [ReviewState.POSTED, ReviewState.ANALYZING]),
    ).toThrow()
  })
})

describe("SessionStore", () => {
  test("get creates new session if not exists", () => {
    const store = new SessionStore()
    const session = store.get("test-session")
    expect(session.state).toBe(ReviewState.IDLE)
  })

  test("set and get roundtrip", () => {
    const store = new SessionStore()
    const session = transition(createInitialSession(), ReviewState.COLLECTING_CONTEXT)
    store.set("test-session", session)
    expect(store.get("test-session").state).toBe(ReviewState.COLLECTING_CONTEXT)
  })

  test("delete removes session", () => {
    const store = new SessionStore()
    store.set("test-session", createInitialSession())
    store.delete("test-session")
    const session = store.get("test-session")
    expect(session.state).toBe(ReviewState.IDLE)
  })

  test("sessions are isolated", () => {
    const store = new SessionStore()
    store.set("s1", transition(createInitialSession(), ReviewState.COLLECTING_CONTEXT))
    store.set("s2", createInitialSession())
    expect(store.get("s1").state).toBe(ReviewState.COLLECTING_CONTEXT)
    expect(store.get("s2").state).toBe(ReviewState.IDLE)
  })
})
