import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import BusinessStaff from '#models/business_staff'
import Loan from '#models/loan'
import LoanSchedule from '#models/loan_schedule'
import User from '#models/user'

export interface LoanOfficerPortfolioStats {
  staffId: number
  staffName: string
  activeBorrowersCount: number
  activeLoansCount: number
  totalDisbursedAmount: bigint
  totalOutstandingPrincipal: bigint
  totalOutstandingInterest: bigint
  totalOverdueAmount: bigint
  par30Amount: bigint
  par30RatioPercent: number
  par90Amount: bigint
  par90RatioPercent: number
  collectionRatePercent: number
}

export class LoanOfficerPortfolioService {
  /**
   * Assign a borrower to a loan officer.
   */
  static async assignBorrower(userId: number, staffId: number): Promise<void> {
    const staff = await BusinessStaff.findOrFail(staffId)
    const user = await User.findOrFail(userId)
    user.assignedLoanOfficerId = staff.id
    await user.save()
  }

  /**
   * Assign an active loan to a loan officer.
   */
  static async assignLoan(loanId: number, staffId: number): Promise<void> {
    const staff = await BusinessStaff.findOrFail(staffId)
    const loan = await Loan.findOrFail(loanId)
    loan.assignedLoanOfficerId = staff.id
    await loan.save()
  }

  /**
   * Calculate full portfolio metrics for a specific loan officer.
   */
  static async getPortfolioStats(staffId: number, businessId: number): Promise<LoanOfficerPortfolioStats> {
    const staff = await BusinessStaff.query()
      .where('id', staffId)
      .where('business_id', businessId)
      .preload('user')
      .firstOrFail()

    // Get all loans managed by this officer
    const loans = await Loan.query()
      .where('provider_id', businessId)
      .where('assigned_loan_officer_id', staffId)

    const activeLoans = loans.filter((l) => l.status === 'disbursed' || l.status === 'repaying')
    const activeBorrowerIds = new Set(activeLoans.map((l) => l.userId))

    const totalDisbursed = loans
      .filter((l) => l.status !== 'requested' && l.status !== 'rejected' && l.status !== 'cancelled')
      .reduce((sum, l) => sum + l.principal, 0n)

    const totalOutstandingPrincipal = activeLoans.reduce((sum, l) => sum + l.principalOutstanding, 0n)
    const totalOutstandingInterest = activeLoans.reduce((sum, l) => sum + l.interestOutstanding, 0n)

    // Calculate PAR 30 and PAR 90
    const now = DateTime.now()
    const activeLoanIds = activeLoans.map((l) => l.id)

    let par30Amount = 0n
    let par90Amount = 0n
    let totalOverdue = 0n
    let totalDue = 0n
    let totalPaid = 0n

    if (activeLoanIds.length > 0) {
      const schedules = await LoanSchedule.query()
        .whereIn('loan_id', activeLoanIds)

      const overdueByLoan = new Map<number, number>() // loanId -> max days overdue

      for (const item of schedules) {
        const principalDue = item.principalDue
        const principalPaid = item.principalPaid
        const interestDue = item.interestDue
        const interestPaid = item.interestPaid

        totalDue += principalDue + interestDue
        totalPaid += principalPaid + interestPaid

        const unpaid = (principalDue - principalPaid) + (interestDue - interestPaid)
        if (unpaid > 0n && item.dueDate < now) {
          totalOverdue += unpaid
          const daysLate = Math.floor(now.diff(item.dueDate, 'days').days)
          const currentMax = overdueByLoan.get(item.loanId) || 0
          if (daysLate > currentMax) {
            overdueByLoan.set(item.loanId, daysLate)
          }
        }
      }

      // If a loan has any instalment late > 30 days, its ENTIRE outstanding principal is at risk (PAR convention)
      for (const loan of activeLoans) {
        const daysLate = overdueByLoan.get(loan.id) || 0
        if (daysLate >= 30) {
          par30Amount += loan.principalOutstanding
        }
        if (daysLate >= 90) {
          par90Amount += loan.principalOutstanding
        }
      }
    }

    const par30Ratio = totalOutstandingPrincipal > 0n
      ? Number((par30Amount * 10000n) / totalOutstandingPrincipal) / 100
      : 0

    const par90Ratio = totalOutstandingPrincipal > 0n
      ? Number((par90Amount * 10000n) / totalOutstandingPrincipal) / 100
      : 0

    const collectionRate = totalDue > 0n
      ? Number((totalPaid * 10000n) / totalDue) / 100
      : 100

    return {
      staffId: staff.id,
      staffName: staff.user?.fullName || `Officer #${staff.id}`,
      activeBorrowersCount: activeBorrowerIds.size,
      activeLoansCount: activeLoans.length,
      totalDisbursedAmount: totalDisbursed,
      totalOutstandingPrincipal,
      totalOutstandingInterest,
      totalOverdueAmount: totalOverdue,
      par30Amount,
      par30RatioPercent: par30Ratio,
      par90Amount,
      par90RatioPercent: par90Ratio,
      collectionRatePercent: collectionRate,
    }
  }
}
