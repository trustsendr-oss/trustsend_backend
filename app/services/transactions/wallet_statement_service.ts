import db from '@adonisjs/lucid/services/db'

/**
 * One line of a wallet statement, as the client apps consume it.
 *
 * Every value is already display-ready: amounts are minor-unit digit strings, direction is
 * relative to the wallet being read, and `failure_reason` is plain text whatever shape it had
 * in storage.
 */
export type StatementRow = {
  id: string
  uuid: string
  wallet_id: number
  type: string
  status: string
  direction: 'in' | 'out'
  amount: string
  currency_code: string
  fee: string | null
  description: string | null
  counterparty_phone: string | null
  counterparty_name: string | null
  counterparty_code: string | null
  payment_method: string | null
  payment_channel: string | null
  /**
   * The description as the account holder wrote it, or `null` when the server generated it.
   * See GENERATED_DESCRIPTION below for why the two have to be told apart.
   */
  note: string | null
  /**
   * Wallet balance immediately after this entry, in minor units. `null` on rows that have not
   * posted yet — an in-flight mobile money transfer has moved nothing, so there is no balance to
   * report.
   */
  balance_after: string | null
  failure_reason: string | null
  created_at: string
  completed_at: string | null
}

/**
 * Reads what actually moved on a set of wallets.
 *
 * This exists because `GET /transfers/p2p` could not back a statement: it carries no amount and
 * no direction, only ever returns `p2p_transfer` rows, and resolves the wallet itself with
 * `.first()` — so a client holding both a USD and a BIF wallet always saw whichever came first,
 * regardless of which one it asked about.
 *
 * The statement is the union of two things, because a mobile money transfer is TWO rows:
 *
 * 1. Posted rows — those with a ledger entry on one of these wallets. Amount and direction come
 *    from the wallet's OWN entry rather than from `ledger_transactions.amount`: the entry is what
 *    actually moved there, and its direction is the only thing that says whether the money came
 *    in or went out. The counterparty is resolved from the transaction's OTHER wallet-backed
 *    entry rather than from `metadata` — only `p2p_transfer` writes wallet ids there, whereas
 *    every double-entry transaction has its other side sitting in `ledger_entries`. Fee entries
 *    are skipped by the owner_type filter: they land on platform accounts, never on a wallet.
 *
 * 2. Mobile money rows still in flight. A deposit posts nothing until the provider confirms it,
 *    and a payout is tracked from `initiated` onward — so on entries alone, someone who just
 *    started a top-up, or whose payout failed, would open the screen and find nothing at all.
 *    These rows name their wallet only inside `metadata.wallet_id`. Once such a row posts it sets
 *    `related_transaction_id`, which is exactly what keeps it from being listed twice.
 */
/**
 * Descriptions written by the services themselves rather than by a person.
 *
 * `description` holds both: P2pTransferService stores the sender's own words when they typed
 * any, and falls back to `P2P transfer from wallet 119` when they did not. A client cannot tell
 * the two apart, so it either shows an internal English string to a French-speaking user or
 * hides the note they actually wrote. The distinction is made here, once, for every client.
 *
 * Extend this list whenever a service adds a generated description — grep for `description:` and
 * `\.description =` under app/services.
 */
const GENERATED_DESCRIPTION =
  '^(P2P transfer from wallet|Mobile money (deposit|payout)|Cash-in|Cash-out|Card (creation|top-up)|Withdrawal from card|Agent [0-9]+ converted|Subscription to plan|Monthly maintenance fee|Reversal:|Currency swap )'

export class WalletStatementService {
  /**
   * The union above, with one `?` placeholder per wallet id in each branch.
   *
   * The ids are inlined as placeholders rather than passed as an array because knex expands an
   * array binding into a comma-separated list, which would break `= ANY(?)`.
   */
  private static statement(walletCount: number): string {
    const ids = Array.from({ length: walletCount }, () => '?').join(', ')

    return `
      SELECT
        lt.id,
        lt.uuid,
        la.owner_id AS wallet_id,
        lt.type,
        lt.status,
        CASE WHEN le.direction = 'debit' THEN 'out' ELSE 'in' END AS direction,
        le.amount::text AS amount,
        le.currency_code AS currency_code,
        lt.fee::text AS fee,
        lt.description,
        CASE WHEN lt.description ~ '${GENERATED_DESCRIPTION}' THEN NULL ELSE lt.description END AS note,
        le.balance_after::text AS balance_after,
        lt.counterparty_phone,
        COALESCE(cu.full_name, ca.business_name, ca.full_name, cb.name) AS counterparty_name,
        COALESCE(cu.code, ca.code, cb.code) AS counterparty_code,
        lt.payment_method,
        lt.payment_channel,
        COALESCE(
          lt.failure_reason,
          lt.metadata -> 'failure_reason' ->> 'message',
          lt.metadata ->> 'failure_reason'
        ) AS failure_reason,
        lt.created_at,
        lt.completed_at
      FROM ledger_transactions lt
      JOIN ledger_entries le ON le.ledger_transaction_id = lt.id
      JOIN ledger_accounts la ON la.id = le.ledger_account_id
      LEFT JOIN LATERAL (
        SELECT la2.owner_id
        FROM ledger_entries le2
        JOIN ledger_accounts la2 ON la2.id = le2.ledger_account_id
        WHERE le2.ledger_transaction_id = lt.id
          AND le2.ledger_account_id <> le.ledger_account_id
          AND la2.owner_type IN ('user_wallet', 'agent_wallet', 'business_wallet')
        LIMIT 1
      ) cp ON TRUE
      LEFT JOIN wallets cw ON cw.id = cp.owner_id
      LEFT JOIN users cu ON cu.id = cw.user_id
      LEFT JOIN agents ca ON ca.id = cw.agent_id
      LEFT JOIN businesses cb ON cb.id = cw.business_id
      WHERE la.owner_type = 'user_wallet' AND la.owner_id IN (${ids})

      UNION ALL

      SELECT
        lt.id,
        lt.uuid,
        w.id AS wallet_id,
        lt.type,
        lt.status,
        CASE WHEN lt.type = 'mobile_money_deposit' THEN 'in' ELSE 'out' END AS direction,
        COALESCE(lt.amount::text, '0') AS amount,
        COALESCE(lt.currency_code, w.currency_code) AS currency_code,
        lt.fee::text AS fee,
        lt.description,
        CASE WHEN lt.description ~ '${GENERATED_DESCRIPTION}' THEN NULL ELSE lt.description END AS note,
        -- Nothing has posted yet, so this wallet has no balance snapshot to report.
        NULL::text AS balance_after,
        lt.counterparty_phone,
        -- A mobile money operation has no internal counterparty: the correspondent is the phone
        -- number the row already carries.
        NULL::varchar AS counterparty_name,
        NULL::varchar AS counterparty_code,
        lt.payment_method,
        lt.payment_channel,
        COALESCE(
          lt.failure_reason,
          lt.metadata -> 'failure_reason' ->> 'message',
          lt.metadata ->> 'failure_reason'
        ) AS failure_reason,
        lt.created_at,
        lt.completed_at
      FROM ledger_transactions lt
      JOIN wallets w ON w.id::text = lt.metadata ->> 'wallet_id'
      WHERE lt.provider IS NOT NULL
        AND lt.related_transaction_id IS NULL
        AND w.id IN (${ids})
    `
  }

  /** One page of the statement, newest first, optionally narrowed to one direction. */
  static async list(options: {
    walletIds: number[]
    page: number
    limit: number
    direction?: 'in' | 'out'
  }): Promise<{ rows: StatementRow[]; total: number }> {
    const { walletIds, page, limit, direction } = options
    if (walletIds.length === 0) return { rows: [], total: 0 }

    const statement = this.statement(walletIds.length)
    // Both branches take the same id list, in the same order.
    const bindings: unknown[] = [...walletIds, ...walletIds]
    let filter = ''

    // Filtering has to happen here rather than in the client: a client that hides rows from the
    // page it was given shows "nothing found" while the matching rows sit on the next page.
    if (direction) {
      filter = ' WHERE direction = ?'
      bindings.push(direction)
    }

    const counted = await db.rawQuery(
      `SELECT COUNT(*)::int AS count FROM (${statement}) AS statement${filter}`,
      bindings
    )

    const listed = await db.rawQuery(
      `SELECT * FROM (${statement}) AS statement${filter}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...bindings, limit, (page - 1) * limit]
    )

    return { rows: listed.rows, total: counted.rows[0]?.count ?? 0 }
  }

  /**
   * A single movement, scoped to wallets the caller owns.
   *
   * Scoping by wallet is the authorization check: a transaction id that touched none of these
   * wallets simply does not appear, so there is no separate ownership test to forget.
   */
  static async find(options: {
    walletIds: number[]
    transactionId: string
  }): Promise<StatementRow | null> {
    const { walletIds, transactionId } = options
    if (walletIds.length === 0) return null

    const statement = this.statement(walletIds.length)

    const found = await db.rawQuery(
      `SELECT * FROM (${statement}) AS statement WHERE id = ? OR uuid::text = ? LIMIT 1`,
      [...walletIds, ...walletIds, transactionId, transactionId]
    )

    return found.rows[0] ?? null
  }
}
