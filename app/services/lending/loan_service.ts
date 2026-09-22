import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type BusinessStaff from '#models/business_staff'
import FinancialProduct from '#models/financial_product'
import Loan from '#models/loan'
import LoanRepayment from '#models/loan_repayment'
import LoanSchedule from '#models/loan_schedule'
import Wallet from '#models/wallet'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { LedgerService } from '#services/ledger/ledger_service'
import { Money } from '#services/money/money'
import { buildSchedule, scheduleTotals } from '#services/lending/amortisation'

export class LoanStateException extends Error {
  constructor(status: string, action: string) {
    super(`A loan in status "${status}" cannot be ${action}`)
    this.name = 'LoanStateException'
  }
}

export class LoanProductException extends Error {
  constructor(reason: string) {
    super(`This credit product is not available: ${reason}`)
    this.name = 'LoanProductException'
  }
}

export class LoanAmountException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoanAmountException'
  }
}

export class LenderFundsException extends Error {
  constructor() {
    super('The institution does not have the funds to disburse this loan')
    this.name = 'LenderFundsException'
  }
}

/**
 * The life of a loan: applied for, decided on, paid out, repaid.
 *
 *   requested ──approve──▶ approved ──disburse──▶ disbursed ⇄ repaying ──▶ repaid
 *       │                                                │
 *       ├──reject──▶ rejected                            └──▶ defaulted (phase 5)
 *       └──cancel──▶ cancelled
 *
 * ## Whose money
 *
 * The institution's, in both directions: the principal leaves its wallet and the repayments go
 * back into it. TumaPlus is the rail and the record, never the lender — being the lender would
 * make it a credit institution before the regulator, with the capital requirements that implies.
 *
 * ## What is owed lives here, not in the ledger
 *
 * The ledger records cash that moved. The schedule records a contract. Expressing an amortisation
 * table as double-entry postings on a payment rail is the classic mistake in this domain: it makes
 * reconciliation impossible and buys nothing, since what a borrower owes is not a balance anyone
 * can spend.
 *
 * ## How a payment is applied
 *
 * Interest first, then principal, oldest instalment first. Interest-first is the near-universal
 * convention and it protects the borrower's own arithmetic: paying down principal while interest
 * accrues unpaid would leave them owing more than their schedule says. The split is recorded on
 * each repayment rather than re-derived, so a loan re-read years later shows what happened, not
 * what today's rule would have done.
 */
export class LoanService {
  /** A borrower applies. Nothing moves and nothing is promised. */
  static async request(
    userId: number,
    productId: number,
    principal: bigint,
    correlationId: string
  ): Promise<Loan> {
    const product = await FinancialProduct.query()
      .where('id', productId)
      .preload('provider')
      .first()

    if (!product) throw new LoanProductException('no such product')
    if (product.status !== 'active') throw new LoanProductException('it is not published')
    if (product.provider.status !== 'active') {
      throw new LoanProductException('the institution is not active')
    }
    if (product.kind !== 'loan') throw new LoanProductException('it is not a credit product')
    if (!product.interestMethod) {
      // The database forbids this, so reaching it means something wrote around it.
      throw new LoanProductException('it does not state how interest is charged')
    }

    if (principal <= 0n) throw new LoanAmountException('The amount must be greater than zero')
    if (product.minAmount && principal < product.minAmount) {
      throw new LoanAmountException(`The minimum for this product is ${product.minAmount}`)
    }
    if (product.maxAmount && principal > product.maxAmount) {
      throw new LoanAmountException(`The maximum for this product is ${product.maxAmount}`)
    }

    const loan = new Loan()
    loan.productId = product.id
    loan.providerId = product.providerId
    loan.userId = userId
    loan.currencyCode = product.currencyCode
    loan.principal = principal
    loan.principalOutstanding = 0n
    loan.interestOutstanding = 0n
    loan.feesCharged = 0n
    // Copied now so the offer a borrower is considering cannot change under them mid-decision.
    loan.interestRateBps = product.interestRateBps
    loan.interestPeriod = product.interestPeriod
    loan.interestMethod = product.interestMethod
    loan.penaltyRateBps = product.penaltyRateBps
    loan.penaltyBasis = product.penaltyBasis
    loan.penaltyGraceDays = product.penaltyGraceDays
    loan.penaltiesOutstanding = 0n
    loan.termMonths = product.termMonthsMax ?? product.termMonthsMin ?? 12
    loan.status = 'requested'
    loan.requestedAt = DateTime.now()
    await loan.save()

    await AuditLoggerService.record({
      actorType: 'user',
      actorId: userId,
      action: 'loan.requested',
      resourceType: 'loan',
      resourceId: loan.id,
      before: undefined,
      after: {
        provider_id: loan.providerId,
        principal: principal.toString(),
        rate_bps: loan.interestRateBps,
        method: loan.interestMethod,
      },
      correlationId,
    })

    return loan
  }

  /** The credit officer says yes. Still nothing moves — disbursement is a separate act. */
  static async approve(loan: Loan, officer: BusinessStaff, correlationId: string): Promise<Loan> {
    if (loan.status !== 'requested') throw new LoanStateException(loan.status, 'approved')

    loan.status = 'approved'
    loan.decidedAt = DateTime.now()
    loan.decidedByStaffId = officer.id
    await loan.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: officer.id,
      action: 'loan.approved',
      resourceType: 'loan',
      resourceId: loan.id,
      before: { status: 'requested' },
      after: { status: loan.status, principal: loan.principal.toString() },
      correlationId,
    })

    return loan
  }

  /** The credit officer says no, with a reason the borrower will read. */
  static async reject(
    loan: Loan,
    officer: BusinessStaff,
    notes: string,
    correlationId: string
  ): Promise<Loan> {
    if (loan.status !== 'requested') throw new LoanStateException(loan.status, 'rejected')

    loan.status = 'rejected'
    loan.decidedAt = DateTime.now()
    loan.decidedByStaffId = officer.id
    loan.decisionNotes = notes
    await loan.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: officer.id,
      action: 'loan.rejected',
      resourceType: 'loan',
      resourceId: loan.id,
      before: { status: 'requested' },
      after: { status: loan.status, notes },
      correlationId,
    })

    return loan
  }

  /**
   * The money leaves the institution's wallet for the borrower's, the schedule is written, and
   * what is owed starts running.
   *
   * The arrangement fee is deducted from what the borrower receives rather than added to what they
   * owe: they repay the principal they were quoted, and the fee is the institution's, taken at the
   * only moment both sides are looking at the same number.
   */
  static async disburse(loan: Loan, correlationId: string): Promise<Loan> {
    if (loan.status !== 'approved') throw new LoanStateException(loan.status, 'disbursed')

    const product = await FinancialProduct.findOrFail(loan.productId)
    const fee = this.arrangementFee(product, loan.principal)
    const netToBorrower = loan.principal - fee

    if (netToBorrower <= 0n) {
      throw new LoanAmountException('The arrangement fee would consume the whole loan')
    }

    return db.transaction(async (trx) => {
      const lenderWallet = await Wallet.query({ client: trx })
        .withScopes((s) => s.primary())
        .where('business_id', loan.providerId)
        .where('currency_code', loan.currencyCode)
        .where('status', 'active')
        .first()
      if (!lenderWallet) throw new LenderFundsException()

      const borrowerWallet = await Wallet.query({ client: trx })
        .withScopes((s) => s.primary())
        .where('user_id', loan.userId)
        .where('currency_code', loan.currencyCode)
        .where('status', 'active')
        .first()
      if (!borrowerWallet) {
        throw new LoanAmountException(`The borrower has no active ${loan.currencyCode} wallet`)
      }
      if (lenderWallet.balanceCache < loan.principal) throw new LenderFundsException()

      const lenderAccount = await this.ledgerAccountFor(lenderWallet.id, 'business_wallet', trx)
      const borrowerAccount = await this.ledgerAccountFor(borrowerWallet.id, 'user_wallet', trx)

      const entries = [
        {
          accountId: lenderAccount,
          direction: 'debit' as const,
          amount: new Money(loan.principal, loan.currencyCode),
        },
        {
          accountId: borrowerAccount,
          direction: 'credit' as const,
          amount: new Money(netToBorrower, loan.currencyCode),
        },
      ]

      if (fee > 0n) {
        // Straight back to the lender: the fee is theirs, not TumaPlus's. What TumaPlus charges
        // for running the rail is a separate arrangement, not skimmed off a borrower's loan.
        entries.push({
          accountId: lenderAccount,
          direction: 'credit' as const,
          amount: new Money(fee, loan.currencyCode),
        })
      }

      const posted = await LedgerService.postTransaction(
        'loan_disbursement',
        entries,
        'business',
        loan.providerId,
        {
          correlationId,
          description: `Disbursement of loan ${loan.id}`,
          metadata: { loan_id: loan.id, fee: fee.toString() },
          amount: new Money(loan.principal, loan.currencyCode),
          fee,
          trx,
        }
      )

      const lines = buildSchedule({
        principal: loan.principal,
        rateBps: loan.interestRateBps,
        period: loan.interestPeriod,
        termMonths: loan.termMonths,
        method: loan.interestMethod,
        firstDueAt: DateTime.now().plus({ months: 1 }),
      })

      for (const line of lines) {
        const row = new LoanSchedule()
        row.loanId = loan.id
        row.installment = line.installment
        row.dueAt = line.dueAt
        row.principal = line.principal
        row.interest = line.interest
        row.paid = 0n
        await row.useTransaction(trx).save()
      }

      const totals = scheduleTotals(lines)
      loan.status = 'disbursed'
      loan.disbursedAt = DateTime.now()
      loan.disbursementTransactionId = posted.id
      loan.feesCharged = fee
      loan.principalOutstanding = totals.principal
      loan.interestOutstanding = totals.interest
      await loan.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'business',
        actorId: loan.providerId,
        action: 'loan.disbursed',
        resourceType: 'loan',
        resourceId: loan.id,
        before: { status: 'approved' },
        after: {
          status: loan.status,
          net_to_borrower: netToBorrower.toString(),
          fee: fee.toString(),
          total_repayable: totals.total.toString(),
          transaction_id: posted.id,
        },
        correlationId,
        trx,
      })

      return loan
    })
  }

  /**
   * A payment: money back to the lender, then applied interest-first across the instalments in
   * the order they fell due.
   */
  static async repay(loan: Loan, amount: bigint, correlationId: string): Promise<Loan> {
    if (!loan.isOutstanding) throw new LoanStateException(loan.status, 'repaid')
    if (amount <= 0n) throw new LoanAmountException('The amount must be greater than zero')
    if (amount > loan.totalOutstanding) {
      throw new LoanAmountException(`Only ${loan.totalOutstanding} is still owed on this loan`)
    }

    return db.transaction(async (trx) => {
      const borrowerWallet = await Wallet.query({ client: trx })
        .withScopes((s) => s.primary())
        .where('user_id', loan.userId)
        .where('currency_code', loan.currencyCode)
        .where('status', 'active')
        .first()
      if (!borrowerWallet) {
        throw new LoanAmountException(`You have no active ${loan.currencyCode} wallet`)
      }

      const lenderWallet = await Wallet.query({ client: trx })
        .withScopes((s) => s.primary())
        .where('business_id', loan.providerId)
        .where('currency_code', loan.currencyCode)
        .where('status', 'active')
        .first()
      if (!lenderWallet) throw new LenderFundsException()

      const borrowerAccount = await this.ledgerAccountFor(borrowerWallet.id, 'user_wallet', trx)
      const lenderAccount = await this.ledgerAccountFor(lenderWallet.id, 'business_wallet', trx)
      const money = new Money(amount, loan.currencyCode)

      const posted = await LedgerService.postTransaction(
        'loan_repayment',
        [
          { accountId: borrowerAccount, direction: 'debit', amount: money },
          { accountId: lenderAccount, direction: 'credit', amount: money },
        ],
        'user',
        loan.userId,
        {
          correlationId,
          description: `Repayment on loan ${loan.id}`,
          metadata: { loan_id: loan.id, provider_id: loan.providerId },
          amount: money,
          trx,
        }
      )

      // Penalties are cleared before anything else: they keep growing while unpaid, so leaving
      // them behind to reduce principal would have the borrower paying down a balance while the
      // charge on it compounds. Clearing them first is what stops that.
      const toPenalties = min(loan.penaltiesOutstanding, amount)
      const { toInterest, toPrincipal } = await this.applyToSchedule(
        loan,
        amount - toPenalties,
        trx
      )

      const repayment = new LoanRepayment()
      repayment.loanId = loan.id
      repayment.amount = amount
      repayment.appliedToPenalties = toPenalties
      repayment.appliedToInterest = toInterest
      repayment.appliedToPrincipal = toPrincipal
      repayment.ledgerTransactionId = posted.id
      repayment.paidAt = DateTime.now()
      await repayment.useTransaction(trx).save()

      loan.penaltiesOutstanding -= toPenalties
      loan.interestOutstanding -= toInterest
      loan.principalOutstanding -= toPrincipal
      loan.status = loan.totalOutstanding === 0n ? 'repaid' : 'repaying'
      if (loan.status === 'repaid') loan.closedAt = DateTime.now()
      await loan.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'user',
        actorId: loan.userId,
        action: 'loan.repaid',
        resourceType: 'loan',
        resourceId: loan.id,
        before: undefined,
        after: {
          amount: amount.toString(),
          to_penalties: toPenalties.toString(),
          to_interest: toInterest.toString(),
          to_principal: toPrincipal.toString(),
          status: loan.status,
          transaction_id: posted.id,
        },
        correlationId,
        trx,
      })

      return loan
    })
  }

  /**
   * Walks the instalments oldest first, taking interest before principal on each.
   *
   * Interest-first protects the borrower's own arithmetic: paying down principal while interest
   * sits unpaid would leave them owing more than their schedule says they should.
   */
  private static async applyToSchedule(
    loan: Loan,
    amount: bigint,
    trx: TransactionClientContract
  ): Promise<{ toInterest: bigint; toPrincipal: bigint }> {
    const lines = await LoanSchedule.query({ client: trx })
      .where('loan_id', loan.id)
      .orderBy('installment', 'asc')

    let left = amount
    let toInterest = 0n
    let toPrincipal = 0n

    for (const line of lines) {
      if (left === 0n) break

      const remaining = line.remaining
      if (remaining === 0n) continue

      // What this line still wants, interest before principal.
      const interestDue = min(line.interest - min(line.paid, line.interest), left)
      toInterest += interestDue
      left -= interestDue

      const principalDue = min(remaining - interestDue, left)
      toPrincipal += principalDue
      left -= principalDue

      line.paid += interestDue + principalDue
      if (line.remaining === 0n) line.settledAt = DateTime.now()
      await line.useTransaction(trx).save()
    }

    return { toInterest, toPrincipal }
  }

  private static arrangementFee(product: FinancialProduct, principal: bigint): bigint {
    const flat = product.feeFlat ?? 0n
    const percent = product.feePercentBps
      ? (principal * BigInt(product.feePercentBps) + 5000n) / 10000n
      : 0n
    return flat + percent
  }

  private static async ledgerAccountFor(
    walletId: number,
    ownerType: 'user_wallet' | 'business_wallet',
    trx: TransactionClientContract
  ): Promise<number> {
    const row = await db
      .query()
      .from('ledger_accounts')
      .where('owner_type', ownerType)
      .where('owner_id', walletId)
      .select('id')
      .useTransaction(trx)
      .first()

    if (!row) throw new Error(`No ledger account backs wallet ${walletId}`)
    return row.id
  }
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}
