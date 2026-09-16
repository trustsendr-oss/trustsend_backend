import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { LedgerService } from '#services/ledger/ledger_service'

/**
 * Read-only accounting views built on top of what LedgerService already computes correctly
 * (getAccountBalance()'s debit/credit sign convention, reconcileBalances()'s integrity checks) —
 * this controller only adds the aggregation queries needed to present them, nothing new about
 * how money is posted. See app/services/ledger/ledger_service.ts for the underlying invariants.
 */
export default class AdminAccountingController {
  /**
   * GET /api/v1/admin/accounting/balance-sheet?currency=USD
   * Assets vs Liabilities+Equity for one currency — currencies can't be summed together, so the
   * caller must pick one (defaults to USD).
   *
   * Wallet-backed accounts (user_wallet/agent_wallet/business_wallet) are reclassified here as
   * liabilities regardless of their stored `account_type` (which is 'asset' for every one of
   * them — see user_onboarding_service.ts, business_onboarding_service.ts,
   * agent_onboarding_service.ts). That's correct from the WALLET OWNER's point of view ("my
   * balance is my asset"), but for the PLATFORM's own balance sheet a wallet balance is money
   * the platform owes back to its holder — a liability. platform_internal accounts (clearing,
   * fees, equity) keep their stored account_type as-is; those genuinely are the platform's own
   * assets/revenue/equity.
   */
  async balanceSheet({ request, response }: HttpContext) {
    const currency = (request.input('currency') as string | undefined) || 'USD'
    const WALLET_OWNER_TYPES = ['user_wallet', 'agent_wallet', 'business_wallet']

    const rows = await db
      .query()
      .from('ledger_entries as le')
      .join('ledger_accounts as la', 'la.id', 'le.ledger_account_id')
      .where('le.currency_code', currency)
      .select(
        db.raw(`
          CASE
            WHEN la.owner_type IN ('user_wallet', 'agent_wallet', 'business_wallet') THEN 'liability'
            ELSE la.account_type
          END as reporting_type
        `)
      )
      .sum({
        balance: db.raw(`
          CASE
            WHEN la.owner_type IN ('user_wallet', 'agent_wallet', 'business_wallet') THEN
              CASE WHEN le.direction = 'credit' THEN le.amount ELSE -le.amount END
            WHEN la.account_type IN ('asset', 'expense') THEN
              CASE WHEN le.direction = 'debit' THEN le.amount ELSE -le.amount END
            ELSE
              CASE WHEN le.direction = 'credit' THEN le.amount ELSE -le.amount END
          END
        `),
      })
      .groupByRaw(
        `CASE WHEN la.owner_type IN ('${WALLET_OWNER_TYPES.join("','")}') THEN 'liability' ELSE la.account_type END`
      )

    const byType: Record<string, bigint> = {
      asset: 0n,
      liability: 0n,
      equity: 0n,
      revenue: 0n,
      expense: 0n,
    }
    for (const row of rows as any[]) {
      // db.query() is the raw builder, not a Lucid Model — rows keep Postgres's own column
      // names (snake_case), never auto-camelCased.
      byType[row.reporting_type] = BigInt(row.balance || 0)
    }

    const assets = byType.asset
    const liabilities = byType.liability
    const equity = byType.equity

    return response.ok({
      data: {
        currency_code: currency,
        assets: assets.toString(),
        liabilities: liabilities.toString(),
        equity: equity.toString(),
        revenue: byType.revenue.toString(),
        expense: byType.expense.toString(),
        balanced: assets === liabilities + equity,
      },
    })
  }

  /**
   * GET /api/v1/admin/accounting/revenue?currency=USD&date_from=&date_to=
   * Fees actually collected (credited to a revenue account) in the period, broken down by
   * account — e.g. PLAN_SUBSCRIPTION_FEES, PLATFORM_FEES.<currency> (lazily created the first
   * time a fee > 0 is charged — see LedgerService.getOrCreatePlatformAccount()).
   */
  async revenue({ request, response }: HttpContext) {
    const currency = (request.input('currency') as string | undefined) || 'USD'
    const dateFrom = request.input('date_from') as string | undefined
    const dateTo = request.input('date_to') as string | undefined

    const query = db
      .query()
      .from('ledger_entries as le')
      .join('ledger_accounts as la', 'la.id', 'le.ledger_account_id')
      .where('la.account_type', 'revenue')
      .where('le.direction', 'credit')
      .where('le.currency_code', currency)
      .select('la.code', 'la.name')
      .sum('le.amount as total')
      .count('le.id as entry_count')
      .groupBy('la.code', 'la.name')
      .orderBy('total', 'desc')

    if (dateFrom) {
      const from = DateTime.fromISO(dateFrom)
      if (!from.isValid) return response.badRequest({ message: 'Invalid date_from' })
      query.where('le.created_at', '>=', from.toSQL()!)
    }
    if (dateTo) {
      const to = DateTime.fromISO(dateTo)
      if (!to.isValid) return response.badRequest({ message: 'Invalid date_to' })
      query.where('le.created_at', '<=', to.toSQL()!)
    }

    const rows = (await query) as any[]
    const total = rows.reduce((sum, r) => sum + BigInt(r.total || 0), 0n)

    return response.ok({
      data: {
        currency_code: currency,
        total: total.toString(),
        by_account: rows.map((r) => ({
          code: r.code,
          name: r.name,
          total: BigInt(r.total || 0).toString(),
          entry_count: Number(r.entry_count),
        })),
      },
    })
  }

  /**
   * POST /api/v1/admin/accounting/reconcile
   * On-demand, not scheduled: reconcileBalances() iterates every wallet, so this is a deliberate
   * action rather than something computed on every page load.
   */
  async reconcile({ response }: HttpContext) {
    const result = await LedgerService.reconcileBalances()
    return response.ok({ data: result })
  }
}
