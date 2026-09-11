import type { HttpContext } from '@adonisjs/core/http'
import LedgerAccount from '#models/ledger_account'
import LedgerEntry from '#models/ledger_entry'

/**
 * Read-only view over LedgerAccount for reconciliation — small, fixed-size list (chart of
 * accounts, mostly platform_internal + one row per wallet's linked account), so no pagination
 * (mirrors /agents, /plans — same "small admin list" convention, unlike /admin/transactions).
 * Balance isn't a stored column on LedgerAccount; it's derived from the latest LedgerEntry's
 * balance_after, same source of truth LedgerService itself uses.
 */
export default class AdminLedgerAccountsController {
  /** GET /api/v1/admin/ledger-accounts?owner_type=platform_internal */
  async index({ request, response }: HttpContext) {
    const ownerType = request.input('owner_type') as string | undefined

    const query = LedgerAccount.query().orderBy('code', 'asc')
    if (ownerType) query.where('owner_type', ownerType)
    const accounts = await query

    const latestEntries = await Promise.all(
      accounts.map((a) =>
        LedgerEntry.query().where('ledger_account_id', a.id).orderBy('created_at', 'desc').first()
      )
    )

    return response.ok({
      data: accounts.map((a, i) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        account_type: a.accountType,
        owner_type: a.ownerType,
        owner_id: a.ownerId,
        currency_code: a.currencyCode,
        status: a.status,
        balance: latestEntries[i]?.balanceAfter.toString() ?? '0',
      })),
    })
  }

  /** GET /api/v1/admin/ledger-accounts/:id — includes its most recent entries. */
  async show({ params, response }: HttpContext) {
    const account = await LedgerAccount.findOrFail(params.id)
    const entries = await LedgerEntry.query()
      .where('ledger_account_id', account.id)
      .orderBy('created_at', 'desc')
      .limit(50)

    return response.ok({
      data: {
        id: account.id,
        code: account.code,
        name: account.name,
        account_type: account.accountType,
        owner_type: account.ownerType,
        owner_id: account.ownerId,
        currency_code: account.currencyCode,
        status: account.status,
        balance: entries[0]?.balanceAfter.toString() ?? '0',
        recent_entries: entries.map((e) => ({
          id: e.id,
          ledger_transaction_id: e.ledgerTransactionId,
          direction: e.direction,
          amount: e.amount.toString(),
          balance_after: e.balanceAfter.toString(),
          created_at: e.createdAt,
        })),
      },
    })
  }
}
