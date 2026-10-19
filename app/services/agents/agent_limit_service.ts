import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import Agent from '#models/agent'
import { type Money } from '#services/money/money'
import { CashOutHoldService } from '#services/transactions/cash_out_hold_service'

export class AgentLimitExceededException extends Error {
  constructor(
    public limitType: 'per_transaction' | 'daily' | 'monthly',
    public limit: bigint,
    public requested: bigint
  ) {
    super(`This agent's ${limitType.replace('_', '-')} cash limit is reached (${limit})`)
    this.name = 'AgentLimitExceededException'
  }
}

/**
 * Enforces agents.per_transaction_limit / daily_limit / monthly_limit — the cash volume one agent
 * may handle. Stored and shown since 1793700000000_add_profile_and_limits_to_agents.ts, checked
 * nowhere until this service.
 *
 * Volume is the cash crossing the counter, in the currency of the operation: deposits and
 * withdrawals taken at this agent (still pending, or done) and remittances paid out by them. A
 * lapsed or cancelled withdrawal never moved cash, so it does not count.
 *
 * The agent row is locked on `trx`, so two operations racing at the same counter see each other.
 */
export class AgentLimitService {
  static async assertWithinLimits(
    agentId: number,
    amount: Money,
    trx: TransactionClientContract
  ): Promise<void> {
    const agent = await Agent.query({ client: trx }).where('id', agentId).forUpdate().firstOrFail()

    if (agent.perTransactionLimit && amount.amount > agent.perTransactionLimit) {
      throw new AgentLimitExceededException(
        'per_transaction',
        agent.perTransactionLimit,
        amount.amount
      )
    }

    const windows = [
      { type: 'daily' as const, limit: agent.dailyLimit, since: DateTime.now().startOf('day') },
      {
        type: 'monthly' as const,
        limit: agent.monthlyLimit,
        since: DateTime.now().startOf('month'),
      },
    ]
    for (const window of windows) {
      if (!window.limit) continue
      const projected =
        (await this.volumeSince(agent.id, amount.currencyCode, window.since, trx)) + amount.amount
      if (projected > window.limit) {
        throw new AgentLimitExceededException(window.type, window.limit, projected)
      }
    }
  }

  static async volumeSince(
    agentId: number,
    currencyCode: string,
    since: DateTime,
    trx: TransactionClientContract
  ): Promise<bigint> {
    const row = await db
      .from('ledger_transactions')
      .where('currency_code', currencyCode)
      .where('created_at', '>=', since.toJSDate())
      .where((q) => {
        q.where((cash) =>
          cash
            .whereIn('type', ['cash_in', 'cash_out'])
            .whereRaw(`metadata->>'agent_id' = ?`, [String(agentId)])
            .where((live) =>
              live
                .whereIn('status', ['pending', 'completed', 'settled'])
                .orWhere((reserved) =>
                  reserved
                    .where('status', 'reserved')
                    .where('created_at', '>=', CashOutHoldService.cutoff().toJSDate())
                )
            )
        ).orWhere((payout) =>
          payout
            .where('type', 'remittance_payout')
            .where('initiated_by_type', 'agent')
            .where('initiated_by_id', agentId)
        )
      })
      .sum({ total: 'amount' })
      .useTransaction(trx)
      .first()

    return BigInt(row?.total ?? 0)
  }
}
