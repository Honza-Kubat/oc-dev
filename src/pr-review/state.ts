import { ReviewState, type ReviewSession, type ReviewContext } from "./types"

export function createInitialSession(): ReviewSession {
  return {
    state: ReviewState.IDLE,
    prRef: null,
    context: null,
    candidateFindings: [],
    verifiedFindings: [],
    summary: null,
    payload: null,
    priorReconciliation: null,
  }
}

const VALID_TRANSITIONS: Record<ReviewState, ReviewState[]> = {
  [ReviewState.IDLE]: [ReviewState.COLLECTING_CONTEXT],
  [ReviewState.COLLECTING_CONTEXT]: [ReviewState.ANALYZING],
  [ReviewState.ANALYZING]: [ReviewState.CANDIDATES_READY],
  [ReviewState.CANDIDATES_READY]: [ReviewState.VERIFIED],
  [ReviewState.VERIFIED]: [ReviewState.FINALIZED],
  [ReviewState.FINALIZED]: [ReviewState.POSTED],
  [ReviewState.POSTED]: [],
}

export function transition(
  session: ReviewSession,
  newState: ReviewState,
): ReviewSession {
  const allowed = VALID_TRANSITIONS[session.state]
  if (!allowed.includes(newState)) {
    throw new Error(
      `Invalid state transition: ${session.state} -> ${newState}. Allowed transitions from ${session.state}: [${allowed.join(", ")}]`,
    )
  }
  return { ...session, state: newState }
}

export function assertState(session: ReviewSession, expected: ReviewState): void {
  if (session.state !== expected) {
    throw new Error(
      `Expected state ${expected}, but current state is ${session.state}.`,
    )
  }
}

export function assertStateOneOf(session: ReviewSession, expected: ReviewState[]): void {
  if (!expected.includes(session.state)) {
    throw new Error(
      `Expected one of [${expected.join(", ")}], but current state is ${session.state}.`,
    )
  }
}

export class SessionStore {
  private sessions = new Map<string, ReviewSession>()

  get(sessionId: string): ReviewSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      const fresh = createInitialSession()
      this.sessions.set(sessionId, fresh)
      return fresh
    }
    return session
  }

  set(sessionId: string, session: ReviewSession): void {
    this.sessions.set(sessionId, session)
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}
