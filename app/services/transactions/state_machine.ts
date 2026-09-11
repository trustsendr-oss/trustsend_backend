/**
 * Generic Transaction State Machine
 *
 * Enforces valid state transitions for transaction types (P2P, cash-in, cash-out, etc.)
 * Prevents invalid transitions and documents the allowed flows.
 *
 * Usage:
 *   const sm = new TransactionStateMachine(p2pTransitions)
 *   sm.assertTransition('pending', 'processing') // throws if invalid
 */

export class InvalidTransactionTransitionException extends Error {
  constructor(from: string, to: string) {
    super(`Invalid transition: ${from} → ${to}`)
    this.name = 'InvalidTransactionTransitionException'
  }
}

export type TransitionMap<State extends string> = Record<State, State[]>

export class TransactionStateMachine<State extends string> {
  private transitions: TransitionMap<State>

  constructor(transitions: TransitionMap<State>) {
    this.transitions = transitions
  }

  /**
   * Verify that a transition from 'from' to 'to' is valid
   * Throws InvalidTransactionTransitionException if not allowed
   */
  assertTransition(from: State, to: State): void {
    if (!this.transitions[from]?.includes(to)) {
      throw new InvalidTransactionTransitionException(from, to)
    }
  }

  /**
   * Get valid next states for a given state
   */
  getValidTransitions(from: State): State[] {
    return this.transitions[from] || []
  }
}

/**
 * Predefined state machines for each transaction type
 */

export type P2pTransactionState =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'flagged'
  | 'reversed'

export const P2P_TRANSITIONS: TransitionMap<P2pTransactionState> = {
  pending: ['processing', 'flagged', 'failed'],
  processing: ['completed', 'failed', 'flagged'],
  flagged: ['processing', 'failed'],
  completed: ['reversed'],
  failed: [],
  reversed: [],
}

export type CashInTransactionState =
  | 'initiated'
  | 'pending_confirmation'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'reversed'

export const CASH_IN_TRANSITIONS: TransitionMap<CashInTransactionState> = {
  initiated: ['pending_confirmation', 'failed'],
  pending_confirmation: ['completed', 'failed', 'expired'],
  completed: ['reversed'],
  failed: [],
  expired: [],
  reversed: [],
}

export type CashOutTransactionState =
  | 'initiated'
  | 'reserved'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'reversed'

export const CASH_OUT_TRANSITIONS: TransitionMap<CashOutTransactionState> = {
  initiated: ['reserved', 'cancelled', 'failed'],
  reserved: ['completed', 'cancelled', 'expired'],
  completed: ['reversed'],
  cancelled: [],
  expired: [],
  failed: [],
  reversed: [],
}

export type FloatTransactionState =
  | 'pending'
  | 'completed'
  | 'rejected'

export const FLOAT_TRANSITIONS: TransitionMap<FloatTransactionState> = {
  pending: ['completed', 'rejected'],
  completed: [],
  rejected: [],
}

export type ReversalTransactionState =
  | 'requested'
  | 'approved'
  | 'executed'
  | 'denied'

export const REVERSAL_TRANSITIONS: TransitionMap<ReversalTransactionState> = {
  requested: ['approved', 'denied'],
  approved: ['executed'],
  denied: [],
  executed: [],
}
