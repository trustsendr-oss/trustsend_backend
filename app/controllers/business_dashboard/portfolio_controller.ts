import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Loan from '#models/loan'
import LoanSchedule from '#models/loan_schedule'
import SavingsAccount from '#models/savings_account'
import { serializeLoan } from '#controllers/lending/serialize_loan'

/**
 * The institution's book, read by its management: loans, savings accounts, and the customers who
 * hold them.
 *
 * ## Reading, not deciding
 *
 * Approving, refusing and disbursing a loan stay on counter/loans, with a credit officer, branch
 * manager or admin on staff: those acts record WHICH PERSON decided (loans.decided_by_staff_id),
 * and an institution account is not a person. A director who wants to decide adds themselves as
 * staff with the admin role.
 *
 * ## Whose customers
 *
 * Nobody owns a TumaPlus account holder (counter_enrolment_service.ts). A person becomes this
 * institution's customer through what they hold with it, so that is exactly what the customer list
 * is built from: holders of a savings account or a loan here, and no one else.
 */
export default class BusinessDashboardPortfolioController {
  /** GET /api/v1/business/dashboard/loans?status= */
  async loans({ business, request, response }: HttpContext) {
    const status = request.input('status')
    const query = Loan.query()
      .where('provider_id', business.id)
      .preload('product')
      .preload('borrower')
    if (status) query.where('status', String(status))

    const loans = await query
      .orderByRaw(`CASE WHEN status = 'requested' THEN 0 ELSE 1 END`)
      .orderBy('requested_at', 'desc')
      .limit(1000)

    return response.ok({
      data: loans.map((loan) => ({
        ...serializeLoan(loan),
        borrower: loan.borrower
          ? { code: loan.borrower.code, full_name: loan.borrower.fullName }
          : null,
      })),
    })
  }

  /** GET /api/v1/business/dashboard/loans/:id */
  async loan({ business, params, response }: HttpContext) {
    const loan = await Loan.query()
      .where('id', Number(params.id))
      .where('provider_id', business.id)
      .preload('product')
      .preload('borrower')
      .first()
    if (!loan) return response.notFound({ message: 'Loan not found' })

    const schedule = await LoanSchedule.query()
      .where('loan_id', loan.id)
      .orderBy('installment', 'asc')
    return response.ok({
      data: {
        ...serializeLoan(loan, schedule),
        borrower: loan.borrower
          ? { code: loan.borrower.code, full_name: loan.borrower.fullName }
          : null,
      },
    })
  }

  /** GET /api/v1/business/dashboard/savings?status= */
  async savings({ business, request, response }: HttpContext) {
    const status = request.input('status')
    const query = SavingsAccount.query()
      .where('provider_id', business.id)
      .preload('product')
      .preload('wallet')
      .preload('saver')
    if (status) query.where('status', String(status))

    const accounts = await query.orderBy('opened_at', 'desc').limit(1000)

    return response.ok({
      data: accounts.map((account) => ({
        id: account.id,
        status: account.status,
        currency_code: account.currencyCode,
        balance: account.wallet?.balanceCache.toString() ?? '0',
        withdrawable: account.isWithdrawable,
        opened_at: account.openedAt,
        matures_at: account.maturesAt,
        closed_at: account.closedAt,
        interest_rate_percent: account.interestRateBps / 100,
        interest_period: account.interestPeriod,
        product: account.product
          ? { id: account.product.id, name: account.product.name, kind: account.product.kind }
          : null,
        holder: account.saver
          ? { code: account.saver.code, full_name: account.saver.fullName }
          : null,
      })),
    })
  }

  /** GET /api/v1/business/dashboard/customers — people holding a product with this institution. */
  async customers({ business, response }: HttpContext) {
    const rows = await db
      .from('users')
      .select('users.id', 'users.code', 'users.full_name', 'users.phone', 'users.created_at')
      .select(
        db.raw(
          '(SELECT COUNT(*) FROM savings_accounts s WHERE s.user_id = users.id AND s.provider_id = ?) AS savings_count',
          [business.id]
        ),
        db.raw(
          '(SELECT COUNT(*) FROM loans l WHERE l.user_id = users.id AND l.provider_id = ?) AS loan_count',
          [business.id]
        ),
        db.raw(
          `GREATEST(
            (SELECT MAX(s.opened_at) FROM savings_accounts s WHERE s.user_id = users.id AND s.provider_id = ?),
            (SELECT MAX(l.requested_at) FROM loans l WHERE l.user_id = users.id AND l.provider_id = ?)
          ) AS last_activity`,
          [business.id, business.id]
        )
      )
      .where((query) => {
        query
          .whereExists((sub) =>
            sub
              .from('savings_accounts')
              .whereRaw('savings_accounts.user_id = users.id')
              .where('savings_accounts.provider_id', business.id)
          )
          .orWhereExists((sub) =>
            sub
              .from('loans')
              .whereRaw('loans.user_id = users.id')
              .where('loans.provider_id', business.id)
          )
      })
      .orderBy('last_activity', 'desc')
      .limit(2000)

    return response.ok({
      data: rows.map((row) => ({
        code: row.code,
        full_name: row.full_name,
        phone: row.phone,
        savings_count: Number(row.savings_count),
        loan_count: Number(row.loan_count),
        last_activity: row.last_activity,
        created_at: row.created_at,
      })),
    })
  }
}
