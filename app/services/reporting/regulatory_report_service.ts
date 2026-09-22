import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Business from '#models/business'
import { PortfolioQualityService } from '#services/lending/portfolio_quality_service'

export interface RegulatoryPosition {
  institution: { id: number; code: string; name: string }
  currencyCode: string
  asOf: string
  /** What the institution owes its savers. */
  deposits: {
    accounts: number
    savers: number
    balance: bigint
    byProduct: Array<{ productId: number; name: string; accounts: number; balance: bigint }>
  }
  /** What its borrowers owe it. */
  loans: {
    outstanding: number
    borrowers: number
    grossPortfolio: bigint
    principalOutstanding: bigint
    interestOutstanding: bigint
    penaltiesOutstanding: bigint
    defaulted: { count: number; principal: bigint }
  }
  /** Portfolio at risk, the ratios a supervisor asks for first. */
  quality: Array<{ days: number; amount: bigint; ratioBps: number }>
  /** Liquidity the institution itself holds on the platform. */
  cash: { operating: bigint; branchFloats: bigint; total: bigint }
  /** Movement over the window, which is what a periodic return reports rather than a stock. */
  activity: {
    from: string
    disbursed: bigint
    disbursements: number
    repaid: bigint
    repayments: number
    depositsTaken: bigint
    withdrawalsPaid: bigint
    interestPaidToSavers: bigint
  }
}

/**
 * An institution's financial position, in the shape a microfinance return asks for.
 *
 * ## What this is, and what it is not
 *
 * It is the SUBSTRATE of a regulatory filing: deposits owed, portfolio held, arrears, liquidity,
 * and the movement over a period — the figures every microfinance return is assembled from, and
 * the ones TumaPlus is the only place that knows.
 *
 * It is NOT a completed BCC return. Mapping these into the supervisor's actual forms requires
 * their templates, line numbering and valuation rules, none of which can be inferred from a
 * database; inventing a layout and calling it a filing would be worse than useless, because
 * someone would submit it. Producing the forms is a separate task, and a short one once the
 * templates are in hand.
 *
 * ## Read from the domain, not from the ledger
 *
 * What is owed and what is held are domain state — savings balances, loan books — and the ledger
 * records the movements that changed them. The `activity` section is the exception and reads the
 * ledger, because movement over a window is exactly what the ledger is for.
 *
 * Every figure is scoped to one institution and one currency. An institution operating in USD and
 * CDF files twice, because the two are not addable and a supervisor would not accept a sum.
 */
export class RegulatoryReportService {
  static async positionFor(
    businessId: number,
    currencyCode = 'USD',
    options: { asOf?: DateTime; since?: DateTime } = {}
  ): Promise<RegulatoryPosition> {
    const business = await Business.findOrFail(businessId)
    const asOf = options.asOf ?? DateTime.now()
    const since = options.since ?? asOf.startOf('month')

    const quality = await PortfolioQualityService.reportFor(businessId, currencyCode, asOf)

    return {
      institution: { id: business.id, code: business.code, name: business.name },
      currencyCode,
      asOf: asOf.toISO()!,
      deposits: await this.deposits(businessId, currencyCode),
      loans: await this.loans(businessId, currencyCode),
      quality: quality.par,
      cash: await this.cash(businessId, currencyCode),
      activity: await this.activity(businessId, currencyCode, since, asOf),
    }
  }

  /** Savers' money the institution is liable for, held in escrow on their behalf. */
  private static async deposits(businessId: number, currencyCode: string) {
    const rows = await db
      .from('savings_accounts')
      .join('wallets', 'wallets.id', 'savings_accounts.wallet_id')
      .join('financial_products', 'financial_products.id', 'savings_accounts.product_id')
      .where('savings_accounts.provider_id', businessId)
      .where('savings_accounts.currency_code', currencyCode)
      .whereIn('savings_accounts.status', ['active', 'matured'])
      .select(
        'savings_accounts.id',
        'savings_accounts.user_id',
        'savings_accounts.product_id',
        'financial_products.name as product_name',
        'wallets.balance_cache'
      )

    const byProduct = new Map<number, { name: string; accounts: number; balance: bigint }>()
    const savers = new Set<number>()
    let balance = 0n

    for (const row of rows) {
      const amount = BigInt(row.balance_cache)
      balance += amount
      savers.add(row.user_id)

      const entry = byProduct.get(row.product_id) ?? {
        name: row.product_name,
        accounts: 0,
        balance: 0n,
      }
      entry.accounts += 1
      entry.balance += amount
      byProduct.set(row.product_id, entry)
    }

    return {
      accounts: rows.length,
      savers: savers.size,
      balance,
      byProduct: [...byProduct.entries()].map(([productId, entry]) => ({
        productId,
        ...entry,
      })),
    }
  }

  private static async loans(businessId: number, currencyCode: string) {
    const rows = await db
      .from('loans')
      .where('provider_id', businessId)
      .where('currency_code', currencyCode)
      .whereIn('status', ['disbursed', 'repaying', 'defaulted'])
      .select(
        'user_id',
        'status',
        'principal_outstanding',
        'interest_outstanding',
        'penalties_outstanding'
      )

    const borrowers = new Set<number>()
    let principal = 0n
    let interest = 0n
    let penalties = 0n
    let defaultedCount = 0
    let defaultedPrincipal = 0n
    let outstanding = 0

    for (const row of rows) {
      borrowers.add(row.user_id)
      const rowPrincipal = BigInt(row.principal_outstanding)
      principal += rowPrincipal
      interest += BigInt(row.interest_outstanding)
      penalties += BigInt(row.penalties_outstanding)

      if (row.status === 'defaulted') {
        defaultedCount += 1
        defaultedPrincipal += rowPrincipal
      } else {
        outstanding += 1
      }
    }

    return {
      outstanding,
      borrowers: borrowers.size,
      // Gross portfolio is principal: interest not yet due is not an asset a supervisor counts.
      grossPortfolio: principal,
      principalOutstanding: principal,
      interestOutstanding: interest,
      penaltiesOutstanding: penalties,
      defaulted: { count: defaultedCount, principal: defaultedPrincipal },
    }
  }

  /** The institution's own liquidity: its operating wallet plus the cash sitting at its counters. */
  private static async cash(businessId: number, currencyCode: string) {
    const operatingRow = await db
      .from('wallets')
      .where('business_id', businessId)
      .where('currency_code', currencyCode)
      .where('purpose', 'primary')
      .sum('balance_cache as total')
      .first()

    const floatRow = await db
      .from('wallets')
      .join('agents', 'agents.id', 'wallets.agent_id')
      .where('agents.business_id', businessId)
      .where('wallets.currency_code', currencyCode)
      .sum('wallets.balance_cache as total')
      .first()

    const operating = BigInt(operatingRow?.total ?? 0)
    const branchFloats = BigInt(floatRow?.total ?? 0)

    return { operating, branchFloats, total: operating + branchFloats }
  }

  /**
   * Movement across the window, read from the ledger — which is what the ledger is for, as
   * opposed to the balances above, which are domain state.
   */
  private static async activity(
    businessId: number,
    currencyCode: string,
    since: DateTime,
    asOf: DateTime
  ) {
    // Loan movement comes from the loan book itself rather than from transaction metadata. The
    // first version of this probed `metadata ->> 'provider_id'` and reported zero disbursements,
    // because disbursement metadata never carried that key — a reporting figure that is silently
    // zero is worse than one that is missing, so the figures are taken from the tables that
    // definitionally know them.
    const disbursedRow = await db
      .from('loans')
      .where('provider_id', businessId)
      .where('currency_code', currencyCode)
      .whereNotNull('disbursed_at')
      .where('disbursed_at', '>=', since.toSQL()!)
      .where('disbursed_at', '<=', asOf.toSQL()!)
      .select(db.raw('COALESCE(SUM(principal), 0) as total'), db.raw('COUNT(*) as count'))
      .first()

    const repaidRow = await db
      .from('loan_repayments')
      .join('loans', 'loans.id', 'loan_repayments.loan_id')
      .where('loans.provider_id', businessId)
      .where('loans.currency_code', currencyCode)
      .where('loan_repayments.paid_at', '>=', since.toSQL()!)
      .where('loan_repayments.paid_at', '<=', asOf.toSQL()!)
      .select(
        db.raw('COALESCE(SUM(loan_repayments.amount), 0) as total'),
        db.raw('COUNT(*) as count')
      )
      .first()

    // Savings movement has no domain table of its own, so it is read from the ledger by the
    // account the transaction names — a key SavingsService always sets.
    const savingsMovement = async (type: string) => {
      const row = await db
        .from('ledger_transactions')
        .join(
          'savings_accounts',
          'savings_accounts.id',
          db.raw("(ledger_transactions.metadata ->> 'savings_account_id')::int")
        )
        .where('ledger_transactions.type', type)
        .where('savings_accounts.provider_id', businessId)
        .where('savings_accounts.currency_code', currencyCode)
        .where('ledger_transactions.created_at', '>=', since.toSQL()!)
        .where('ledger_transactions.created_at', '<=', asOf.toSQL()!)
        .select(db.raw('COALESCE(SUM(ledger_transactions.amount), 0) as total'))
        .first()

      return BigInt(row?.total ?? 0)
    }

    return {
      from: since.toISO()!,
      disbursed: BigInt(disbursedRow?.total ?? 0),
      disbursements: Number(disbursedRow?.count ?? 0),
      repaid: BigInt(repaidRow?.total ?? 0),
      repayments: Number(repaidRow?.count ?? 0),
      depositsTaken: await savingsMovement('savings_deposit'),
      withdrawalsPaid: await savingsMovement('savings_withdrawal'),
      interestPaidToSavers: await savingsMovement('savings_interest'),
    }
  }
}
