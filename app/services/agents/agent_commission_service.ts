import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Agent from '#models/agent'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { AgentFloatService } from '#services/agents/agent_float_service'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import { formatAmount } from '#services/notifications/transaction_notifier'

/** Business days are counted in the time zone of the network (UTC+2: Rwanda, Burundi, east DRC). */
export const COMMISSION_TIME_ZONE = 'Africa/Kigali'

/**
 * A day is paid only after this hour of the following day, so a deposit made late in the evening
 * has had several hours to reveal a round trip before its volume counts.
 */
const PAY_AFTER_HOUR = 6

/** How long after a deposit money sent back to the agent marks it as a round trip. */
const ROUND_TRIP_WINDOW_HOURS = 24

type CashRow = {
  id: string
  type: 'cash_in' | 'cash_out'
  amount: string
  currency_code: string
  completed_at: Date
  agent_id: number
  user_wallet_id: number
}

export type DayResult = {
  agentId: number
  currency: string
  volume: bigint
  excluded: bigint
  commission: bigint
}

/**
 * Daily agent commission — the Wave model.
 *
 * Cash in and cash out are free for the customer. Instead of a commission per operation, each
 * agent is paid once a day `agent_cash_volume_commission` % (fee_schedules) of the cash volume
 * they handled that day: deposits plus withdrawals, per currency, credited to their float out of
 * AGENT_CASH_COMMISSION (an expense). It is funded by the fee on person-to-person transfers.
 *
 * ## Round trips are not volume
 *
 * Paying on volume pays for fake volume too: an agent records a deposit to an accomplice, the
 * accomplice sends the money straight back, and the agent repeats — earning on cash that never
 * existed. Two patterns are left out of the volume (and reported as `excluded_volume`):
 * - a deposit to a customer who, within ROUND_TRIP_WINDOW_HOURS, sends money to the agent's own
 *   account (the user linked to the agent);
 * - a withdrawal by a customer the same agent credited by deposit in the preceding
 *   ROUND_TRIP_WINDOW_HOURS (deposit then withdraw at the same counter moves no money).
 *
 * Running it is idempotent: agent_commission_payouts has one row per agent, day and currency,
 * written in the same database transaction as the ledger entries.
 */
export class AgentCommissionService {
  /** The days this run should settle: yesterday once it is past PAY_AFTER_HOUR, plus catch-up. */
  static dueDays(now = DateTime.now().setZone(COMMISSION_TIME_ZONE)): DateTime[] {
    const today = now.startOf('day')
    const days = [today.minus({ days: 3 }), today.minus({ days: 2 })]
    if (now.hour >= PAY_AFTER_HOUR) days.push(today.minus({ days: 1 }))
    return days
  }

  /** Settles every due day; days already paid are skipped. */
  static async payDueDays(): Promise<DayResult[]> {
    const results: DayResult[] = []
    for (const day of this.dueDays()) {
      results.push(...(await this.payDay(day)))
    }
    return results
  }

  /** Pays every agent for one business day. */
  static async payDay(day: DateTime): Promise<DayResult[]> {
    const rate = await FeeScheduleService.getFeePercent('agent_cash_volume_commission')
    if (rate <= 0) return []

    const start = day.setZone(COMMISSION_TIME_ZONE).startOf('day')
    const end = start.plus({ days: 1 })
    const businessDay = start.toISODate()!

    const rawRows = await db
      .from('ledger_transactions')
      .whereIn('type', ['cash_in', 'cash_out'])
      .whereIn('status', ['completed', 'settled'])
      .where('completed_at', '>=', start.toJSDate())
      .where('completed_at', '<', end.toJSDate())
      // Tracking rows carry the agent; the double-entry rows they point to do not.
      .whereRaw(`metadata->>'agent_id' IS NOT NULL`)
      .select(
        'id',
        'type',
        'amount',
        'currency_code',
        'completed_at',
        db.raw(`(metadata->>'agent_id')::int AS agent_id`),
        db.raw(`(metadata->>'user_wallet_id')::int AS user_wallet_id`)
      )
    const rows: CashRow[] = rawRows.map((row: any) => ({ ...row, amount: String(row.amount) }))

    if (rows.length === 0) return []

    const agentList = await Agent.query().whereIn('id', [...new Set(rows.map((r) => r.agent_id))])
    const agents = new Map(agentList.map((a) => [a.id, a]))

    // Group per agent and currency, splitting counted volume from round trips.
    const groups = new Map<string, DayResult>()
    for (const row of rows) {
      const agent = agents.get(row.agent_id)
      // An institution's counter is the institution's own window: TumaPlus pays it nothing.
      if (!agent || agent.businessId) continue

      const key = `${row.agent_id}|${row.currency_code}`
      const group = groups.get(key) ?? {
        agentId: row.agent_id,
        currency: row.currency_code,
        volume: 0n,
        excluded: 0n,
        commission: 0n,
      }
      const amount = BigInt(row.amount)
      if (await this.isRoundTrip(row, agent)) group.excluded += amount
      else group.volume += amount
      groups.set(key, group)
    }

    const results: DayResult[] = []
    for (const group of groups.values()) {
      group.commission = AgentFloatService.commissionOn(group.volume, rate)
      const paid = await this.settle(agents.get(group.agentId)!, businessDay, rate, group)
      if (paid) results.push(group)
    }
    return results
  }

  /** See the class comment for the two patterns. */
  private static async isRoundTrip(row: CashRow, agent: Agent): Promise<boolean> {
    const completedAt = DateTime.fromJSDate(new Date(row.completed_at))

    if (row.type === 'cash_in') {
      if (!agent.userId) return false
      const sentBack = await db
        .from('ledger_transactions as t')
        .join('wallets as sender', 'sender.id', db.raw(`(t.metadata->>'sender_wallet_id')::int`))
        .join(
          'wallets as recipient',
          'recipient.id',
          db.raw(`(t.metadata->>'recipient_wallet_id')::int`)
        )
        .join('wallets as deposited', 'deposited.id', db.raw('?', [row.user_wallet_id]))
        .where('t.type', 'p2p_transfer')
        .where('t.status', 'completed')
        .whereRaw('sender.user_id = deposited.user_id')
        .where('recipient.user_id', agent.userId)
        .where('t.created_at', '>=', completedAt.toJSDate())
        .where('t.created_at', '<', completedAt.plus({ hours: ROUND_TRIP_WINDOW_HOURS }).toJSDate())
        .select('t.id')
        .first()
      return Boolean(sentBack)
    }

    const depositedBefore = await db
      .from('ledger_transactions')
      .where('type', 'cash_in')
      .whereIn('status', ['completed', 'settled'])
      .whereRaw(`(metadata->>'agent_id')::int = ?`, [row.agent_id])
      .whereRaw(`(metadata->>'user_wallet_id')::int = ?`, [row.user_wallet_id])
      .where('completed_at', '<', completedAt.toJSDate())
      .where('completed_at', '>=', completedAt.minus({ hours: ROUND_TRIP_WINDOW_HOURS }).toJSDate())
      .select('id')
      .first()
    return Boolean(depositedBefore)
  }

  /**
   * Records the day and pays it, atomically. Returns false when this agent, day and currency was
   * already settled by an earlier run.
   */
  private static async settle(
    agent: Agent,
    businessDay: string,
    rate: number,
    group: DayResult
  ): Promise<boolean> {
    const paid = await db.transaction(async (trx) => {
      const inserted = await trx
        .table('agent_commission_payouts')
        .insert({
          agent_id: agent.id,
          business_day: businessDay,
          currency_code: group.currency,
          volume: group.volume.toString(),
          excluded_volume: group.excluded.toString(),
          rate_percent: rate,
          commission: group.commission.toString(),
          created_at: new Date(),
        })
        .onConflict(['agent_id', 'business_day', 'currency_code'])
        .ignore()
        .returning('id')
      if (inserted.length === 0) return false
      if (group.commission === 0n) return true

      const floatWallet = await AgentFloatService.ensureFloatWallet(agent, group.currency, trx)
      const floatAccount = await AgentFloatService.ledgerAccountId(
        floatWallet.id,
        'agent_wallet',
        trx
      )
      const expense = await AgentFloatService.commissionExpenseAccount(group.currency, trx)
      const commission = new Money(group.commission, group.currency)

      const posted = await LedgerService.postTransaction(
        'agent_commission',
        [
          { accountId: expense.id, direction: 'debit', amount: commission },
          { accountId: floatAccount, direction: 'credit', amount: commission },
        ],
        'system',
        0,
        {
          correlationId: `agent-commission:${agent.id}:${businessDay}:${group.currency}`,
          description: `Agent commission for ${businessDay} (${group.currency})`,
          metadata: {
            agent_id: agent.id,
            business_day: businessDay,
            volume: group.volume.toString(),
            excluded_volume: group.excluded.toString(),
            rate_percent: rate,
          },
          amount: commission,
          paymentMethod: 'commission',
          trx,
        }
      )

      await trx
        .from('agent_commission_payouts')
        .where('id', inserted[0].id ?? inserted[0])
        .update({ ledger_transaction_id: posted.id })
      return true
    })

    if (paid && group.commission > 0n) {
      const day = DateTime.fromISO(businessDay).setLocale('fr').toFormat('d LLLL')
      await InAppNotificationService.notify({
        recipientType: 'agent',
        recipientId: agent.id,
        type: 'agent.commission_paid',
        title: 'Commission versée',
        message: `${formatAmount(group.commission, group.currency)} de commission pour le ${day}, sur ${formatAmount(group.volume, group.currency)} de dépôts et retraits.`,
        data: {
          business_day: businessDay,
          currency_code: group.currency,
          commission: group.commission.toString(),
          volume: group.volume.toString(),
          excluded_volume: group.excluded.toString(),
        },
      })
    }

    return paid
  }
}
