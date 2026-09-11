import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

export default class BusinessOverviewController {
  /**
   * GET /api/v1/business/dashboard/overview
   * Aggregate counts/volume for this business's mobile money transactions — no new table, just
   * a grouped read over ledger_transactions.
   */
  async show({ business, response }: HttpContext) {
    const since30d = DateTime.now().minus({ days: 30 }).toJSDate()

    const byStatus = await db
      .query()
      .from('ledger_transactions')
      .where('initiated_by_type', 'business')
      .where('initiated_by_id', business.id)
      .whereIn('type', ['mobile_money_deposit', 'mobile_money_payout'])
      .select('type', 'status')
      .count('* as count')
      .groupBy('type', 'status')

    const last30Days = await db
      .query()
      .from('ledger_transactions')
      .where('initiated_by_type', 'business')
      .where('initiated_by_id', business.id)
      .whereIn('type', ['mobile_money_deposit', 'mobile_money_payout'])
      .where('created_at', '>=', since30d)
      .select('type', 'status')
      .count('* as count')
      .groupBy('type', 'status')

    const summarize = (rows: any[]) => {
      const summary = {
        deposits: { completed: 0, failed: 0, pending: 0, total: 0 },
        payouts: { completed: 0, failed: 0, pending: 0, total: 0 },
      }
      for (const row of rows) {
        const bucket = row.type === 'mobile_money_deposit' ? summary.deposits : summary.payouts
        const count = Number(row.count)
        bucket.total += count
        if (row.status === 'completed') bucket.completed += count
        else if (row.status === 'failed') bucket.failed += count
        else bucket.pending += count
      }
      return summary
    }

    const allTime = summarize(byStatus)
    const recent = summarize(last30Days)

    const successRate = (bucket: { completed: number; total: number }) =>
      bucket.total === 0 ? null : Math.round((bucket.completed / bucket.total) * 10000) / 100

    return response.ok({
      data: {
        all_time: {
          ...allTime,
          deposit_success_rate_percent: successRate(allTime.deposits),
          payout_success_rate_percent: successRate(allTime.payouts),
        },
        last_30_days: {
          ...recent,
          deposit_success_rate_percent: successRate(recent.deposits),
          payout_success_rate_percent: successRate(recent.payouts),
        },
      },
    })
  }
}
