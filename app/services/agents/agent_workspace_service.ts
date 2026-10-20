import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Agent from '#models/agent'
import KycVerification from '#models/kyc_verification'
import LedgerTransaction from '#models/ledger_transaction'
import User from '#models/user'
import Wallet from '#models/wallet'
import {
  CASH_OUT_RESERVATION_TTL_MINUTES,
  CashOutHoldService,
} from '#services/transactions/cash_out_hold_service'
import { AgentFloatService } from '#services/agents/agent_float_service'

/**
 * What the signed-in agent may do right now.
 *
 * Computed here, never in the app: the app only decides what to SHOW from this, while every
 * action endpoint re-checks the same rule on its own (AgentIdentityService, the float parent
 * check, …). A capability the server did not grant is never a button the agent can press.
 */
export type AgentCapabilities = {
  /** Take cash from a customer and credit their wallet from the float (POST /cash-in). */
  can_cash_in: boolean
  /** Hand out cash for a customer's reserved withdrawal (POST /cash-out/:id/confirm). */
  can_pay_out: boolean
  /** Push float to a direct sub-agent (POST /agents/float-transfer). */
  can_transfer_float: boolean
  /** Move personal wallet money into the float (POST /agents/float-convert). */
  can_convert_float: boolean
  /** Move float back to the personal wallet (POST /agents/float-withdraw). */
  can_withdraw_float: boolean
  /** Send identity documents for the agent record (POST /agents/kyc/submit). */
  can_submit_kyc: boolean
}

export type AgentOperation = {
  transaction_id: string
  type: 'cash_in' | 'cash_out'
  /** `expired` is derived: a reservation past its lifetime, whatever its stored status. */
  status: string
  amount: string
  /** On a withdrawal, the agent's commission the customer pays on top of `amount`. */
  fee: string
  currency_code: string
  created_at: string
  completed_at: string | null
  /** Deadline for paying out a reserved withdrawal; null otherwise. */
  expires_at: string | null
  customer: { code: string | null; full_name: string | null } | null
}

/** One operation read in full from the agent's history. */
export type AgentOperationDetail = AgentOperation & {
  /** Public reference, the one quoted to support. */
  uuid: string
  /** What the agent earned on it, once confirmed; "0" otherwise. */
  agent_commission: string
  failure_reason: string | null
}

/** Statuses of a KYC file that still allow (re)submitting documents. */
const KYC_RESUBMITTABLE = new Set(['not_started', 'rejected', 'expired'])

/**
 * Read side of the agent's own workspace: profile, rights, pending work and history.
 *
 * Everything is scoped to one agent resolved from the authenticated user by the caller — no
 * method here accepts an agent id coming from the request.
 */
export class AgentWorkspaceService {
  static async latestKycStatus(agentId: number): Promise<string> {
    const kyc = await KycVerification.query()
      .where('subject_type', 'agent')
      .where('subject_id', agentId)
      .orderBy('created_at', 'desc')
      .first()
    return kyc?.status ?? 'not_started'
  }

  static capabilities(agent: Agent, kycStatus: string): AgentCapabilities {
    const active = agent.status === 'active'
    return {
      can_cash_in: active,
      can_pay_out: active,
      // Only a tier that can sponsor others has anyone to push float to: an `agent` is the
      // bottom of the hierarchy (see TIER_RANK in agent_onboarding_service.ts).
      can_transfer_float: active && agent.tier !== 'agent',
      can_convert_float: active,
      // A suspended agent keeps access to their own money; a counter has no personal wallet.
      can_withdraw_float: (active || agent.status === 'suspended') && agent.userId !== null,
      can_submit_kyc: agent.status !== 'terminated' && KYC_RESUBMITTABLE.has(kycStatus),
    }
  }

  static async profile(agent: Agent) {
    const [kycStatus, floatWallets, parent, commissions, volumeRate] = await Promise.all([
      this.latestKycStatus(agent.id),
      AgentFloatService.allFloatWallets(agent),
      agent.parentAgentId ? Agent.find(agent.parentAgentId) : Promise.resolve(null),
      this.commissionsThisMonth(agent),
      AgentFloatService.volumeCommissionPercent(agent),
    ])
    const serializeFloat = (wallet: Wallet) => ({
      wallet_id: wallet.id,
      currency_code: wallet.currencyCode,
      balance: wallet.balanceCache.toString(),
      status: wallet.status,
    })
    // `float` stays the onboarding (USD) wallet for existing clients; `floats` has every currency.
    const floatWallet = floatWallets.find((w) => w.id === agent.walletId) ?? null

    return {
      id: agent.id,
      code: agent.code,
      name: agent.businessName ?? agent.fullName,
      full_name: agent.fullName,
      business_name: agent.businessName,
      tier: agent.tier,
      status: agent.status,
      city: agent.city,
      region: agent.region,
      // Percent of each day's cash volume (deposits + withdrawals), paid the next day.
      commission_rate: volumeRate,
      suspension_reason: agent.status === 'suspended' ? agent.suspensionReason : null,
      limits: {
        daily: agent.dailyLimit?.toString() ?? null,
        monthly: agent.monthlyLimit?.toString() ?? null,
        per_transaction: agent.perTransactionLimit?.toString() ?? null,
      },
      float: floatWallet ? serializeFloat(floatWallet) : null,
      floats: floatWallets.map(serializeFloat),
      commissions_this_month: commissions,
      parent: parent ? { code: parent.code, name: parent.businessName ?? parent.fullName } : null,
      kyc: { status: kycStatus },
      reservation_ttl_minutes: CASH_OUT_RESERVATION_TTL_MINUTES,
      capabilities: this.capabilities(agent, kycStatus),
    }
  }

  /**
   * The agent's cash-in / cash-out tracking rows.
   *
   * Only tracking rows carry `metadata.agent_id`; the double-entry rows LedgerService posts at
   * confirmation do not, so they never show up twice here.
   */
  static async operations(agent: Agent, scope: 'pending' | 'recent'): Promise<AgentOperation[]> {
    const query = LedgerTransaction.query()
      .whereIn('type', ['cash_in', 'cash_out'])
      .whereRaw(`metadata->>'agent_id' = ?`, [String(agent.id)])
      .orderBy('created_at', 'desc')

    if (scope === 'pending') {
      query.where((q) => {
        q.where((cashIn) => cashIn.where('type', 'cash_in').where('status', 'pending')).orWhere(
          (cashOut) =>
            cashOut
              .where('type', 'cash_out')
              .where('status', 'reserved')
              .where('created_at', '>=', CashOutHoldService.cutoff().toJSDate())
        )
      })
    } else {
      query.limit(30)
    }

    return this.serialize(await query)
  }

  /** One cash-out, only if it was reserved at this agent — otherwise indistinguishable from missing. */
  static async cashOutFor(agent: Agent, transactionId: string): Promise<AgentOperation | null> {
    const txn = await LedgerTransaction.query()
      .where('id', transactionId)
      .where('type', 'cash_out')
      .whereRaw(`metadata->>'agent_id' = ?`, [String(agent.id)])
      .first()
    if (!txn) return null
    const [operation] = await this.serialize([txn])
    return operation
  }

  /**
   * What the agent earned since the start of the month, per currency: the daily volume
   * commissions (agent_commission_payouts), the per-operation commission on deposits and
   * withdrawals confirmed before that model (stamped on the tracking row), and the commission on
   * each remittance paid out (the `fee` of the payout transaction).
   */
  static async commissionsThisMonth(
    agent: Agent
  ): Promise<Array<{ currency_code: string; amount: string }>> {
    const since = DateTime.now().startOf('month').toJSDate()
    const rows = await db
      .from('ledger_transactions')
      .where('created_at', '>=', since)
      .where((q) => {
        q.where((cash) =>
          cash
            .whereIn('type', ['cash_in', 'cash_out'])
            .whereIn('status', ['completed', 'settled'])
            .whereRaw(`metadata->>'agent_id' = ?`, [String(agent.id)])
        ).orWhere((payout) =>
          payout
            .where('type', 'remittance_payout')
            .where('initiated_by_type', 'agent')
            .where('initiated_by_id', agent.id)
        )
      })
      .groupBy('currency_code')
      .select('currency_code')
      .select(
        db.raw(
          `COALESCE(SUM(CASE WHEN type = 'remittance_payout' THEN COALESCE(fee, 0)
             ELSE COALESCE((metadata->>'agent_commission')::bigint, 0) END), 0) AS total`
        )
      )

    // Daily volume commissions (AgentCommissionService), on top of the per-operation ones above:
    // operations taken before the switch still carry `agent_commission`, new ones carry none.
    const daily = await db
      .from('agent_commission_payouts')
      .where('agent_id', agent.id)
      .where('business_day', '>=', DateTime.now().startOf('month').toISODate()!)
      .groupBy('currency_code')
      .select('currency_code')
      .sum({ total: 'commission' })

    const totals = new Map<string, bigint>()
    for (const row of [...rows, ...daily] as any[]) {
      totals.set(row.currency_code, (totals.get(row.currency_code) ?? 0n) + BigInt(row.total ?? 0))
    }
    return [...totals].map(([currency_code, total]) => ({
      currency_code,
      amount: total.toString(),
    }))
  }

  /**
   * Any deposit or withdrawal taken at this agent, in full — the detail behind a line of the
   * history. Scoped by `metadata.agent_id` like operations(): another agent's reference is
   * indistinguishable from a missing one.
   */
  static async operationFor(
    agent: Agent,
    transactionId: string
  ): Promise<AgentOperationDetail | null> {
    const txn = await LedgerTransaction.query()
      .where('id', transactionId)
      .whereIn('type', ['cash_in', 'cash_out'])
      .whereRaw(`metadata->>'agent_id' = ?`, [String(agent.id)])
      .first()
    if (!txn) return null

    const [operation] = await this.serialize([txn])
    return {
      ...operation,
      uuid: txn.uuid,
      agent_commission: String(txn.metadata?.agent_commission ?? '0'),
      failure_reason: txn.failureReason ?? null,
    }
  }

  static async subAgents(agent: Agent) {
    const children = await Agent.query()
      .where('parent_agent_id', agent.id)
      .whereNot('status', 'terminated')
      .orderBy('full_name', 'asc')

    return children.map((child) => ({
      id: child.id,
      code: child.code,
      name: child.businessName ?? child.fullName,
      tier: child.tier,
      status: child.status,
      city: child.city,
    }))
  }

  private static async serialize(rows: LedgerTransaction[]): Promise<AgentOperation[]> {
    // Customers are resolved in two batched queries rather than one per row.
    const walletIds = [
      ...new Set(rows.map((row) => Number(row.metadata?.user_wallet_id)).filter(Boolean)),
    ]
    const wallets = walletIds.length ? await Wallet.query().whereIn('id', walletIds) : []
    const userIds = [...new Set(wallets.map((w) => w.userId).filter((id): id is number => !!id))]
    const users = userIds.length ? await User.query().whereIn('id', userIds) : []

    const walletOwner = new Map(wallets.map((w) => [w.id, w.userId]))
    const userById = new Map(users.map((u) => [u.id, u]))

    return rows.map((row) => {
      const ownerId = walletOwner.get(Number(row.metadata?.user_wallet_id))
      const customer = ownerId ? userById.get(ownerId) : undefined
      const reservedCashOut = row.type === 'cash_out' && row.status === 'reserved'
      const expired = reservedCashOut && CashOutHoldService.isExpired(row.createdAt)

      return {
        transaction_id: row.id,
        type: row.type as 'cash_in' | 'cash_out',
        status: expired ? 'expired' : row.status,
        amount: (row.amount ?? BigInt(row.metadata?.amount ?? 0)).toString(),
        fee: (row.type === 'cash_out' ? (row.fee ?? 0n) : 0n).toString(),
        currency_code: row.currencyCode ?? row.metadata?.currency_code ?? 'USD',
        created_at: row.createdAt.toISO()!,
        completed_at: row.completedAt?.toISO() ?? null,
        expires_at: reservedCashOut
          ? row.createdAt.plus({ minutes: CASH_OUT_RESERVATION_TTL_MINUTES }).toISO()
          : null,
        customer: customer ? { code: customer.code, full_name: customer.fullName } : null,
      }
    })
  }
}
