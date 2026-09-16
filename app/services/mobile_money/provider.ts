/**
 * Contract every mobile money provider integration must implement. Business services
 * (MobileMoneyDepositService, MobileMoneyPayoutService, the reconciliation sweep) talk only
 * to this interface, never to a provider's SDK/HTTP client directly — swapping or adding a
 * provider later means writing one new adapter, not touching controllers or ledger logic.
 */

export type MobileMoneyRequestOutcome = 'ACCEPTED' | 'REJECTED' | 'DUPLICATE_IGNORED'
export type MobileMoneyFinalStatus = 'COMPLETED' | 'FAILED'
export type MobileMoneyPendingStatus = 'ACCEPTED' | 'ENQUEUED' | 'PROCESSING' | 'IN_RECONCILIATION'

export interface MobileMoneyFailureReason {
  code: string
  message: string
}

export interface InitiateDepositParams {
  providerReferenceId: string // our generated UUIDv4
  amount: string // smallest-unit-free decimal string, as the provider expects
  currencyCode: string
  phoneNumber: string
  providerCode: string // e.g. "MTN_MOMO_ZMB" — validated against the allow-list before this is called
  customerMessage?: string
}

export interface InitiatePayoutParams {
  providerReferenceId: string
  amount: string
  currencyCode: string
  phoneNumber: string
  providerCode: string
  customerMessage?: string
}

export interface InitiateResult {
  outcome: MobileMoneyRequestOutcome
  failureReason?: MobileMoneyFailureReason
}

export interface StatusResult {
  status: MobileMoneyPendingStatus | MobileMoneyFinalStatus
  providerTransactionId?: string
  failureReason?: MobileMoneyFailureReason
}

export interface MobileMoneyProvider {
  readonly name: string

  initiateDeposit(params: InitiateDepositParams): Promise<InitiateResult>
  initiatePayout(params: InitiatePayoutParams): Promise<InitiateResult>
  checkDepositStatus(providerReferenceId: string): Promise<StatusResult>
  checkPayoutStatus(providerReferenceId: string): Promise<StatusResult>
}
