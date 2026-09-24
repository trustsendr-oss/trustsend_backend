import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type BusinessStaff from '#models/business_staff'
import Loan from '#models/loan'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { CollateralService } from '#services/lending/collateral_service'

export class LoanDefaultException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoanDefaultException'
  }
}

/**
 * Default management and recovery service for microfinance institutions (P3).
 *
 * Handles:
 *  - Declaring a loan in default (manual or policy-based)
 *  - Executing collateral seizure on locked savings
 *  - Writing off irrecoverable debt for financial closing
 */
export class DefaultManagementService {
  /**
   * Marks a loan as defaulted and optionally triggers collateral recovery.
   */
  static async markDefault(
    loan: Loan,
    staff: BusinessStaff,
    reason: string,
    correlationId: string,
    options: { seizeCollateral?: boolean } = {}
  ): Promise<Loan> {
    if (loan.status === 'repaid' || loan.status === 'rejected' || loan.status === 'cancelled') {
      throw new LoanDefaultException(`A loan with status '${loan.status}' cannot be marked as defaulted`)
    }

    if (loan.status === 'defaulted') {
      throw new LoanDefaultException('This loan is already in default status')
    }

    return db.transaction(async (trx) => {
      const beforeStatus = loan.status
      loan.status = 'defaulted'
      loan.defaultedAt = DateTime.now()
      loan.defaultReason = reason
      await loan.useTransaction(trx).save()

      let collateralSeized = 0n
      if (options.seizeCollateral && loan.collateralStatus === 'locked' && loan.collateralSavingsAccountId) {
        try {
          const seizedAmount = await CollateralService.seizeCollateral(loan, correlationId, trx)
          collateralSeized = seizedAmount

          // Deduct seized amount from outstanding interest then principal
          const toInterest = collateralSeized < loan.interestOutstanding ? collateralSeized : loan.interestOutstanding
          const toPrincipal = (collateralSeized - toInterest) < loan.principalOutstanding ? (collateralSeized - toInterest) : loan.principalOutstanding
          
          loan.interestOutstanding -= toInterest
          loan.principalOutstanding -= toPrincipal
          await loan.useTransaction(trx).save()
        } catch (error) {
          // If seizure fails, log it but keep default status
          await AuditLoggerService.record({
            actorType: 'internal_user',
            actorId: staff.id,
            action: 'loan.collateral_seizure_failed',
            resourceType: 'loan',
            resourceId: loan.id,
            before: undefined,
            after: { error: (error as Error).message },
            correlationId,
            trx,
          })
        }
      }

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: staff.id,
        action: 'loan.default_declared',
        resourceType: 'loan',
        resourceId: loan.id,
        before: { status: beforeStatus },
        after: {
          status: 'defaulted',
          reason,
          collateral_seized: collateralSeized.toString(),
          principal_outstanding: loan.principalOutstanding.toString(),
        },
        correlationId,
        trx,
      })

      return loan
    })
  }

  /**
   * Seizes collateral on an already defaulted loan.
   */
  static async seizeCollateral(
    loan: Loan,
    staff: BusinessStaff,
    correlationId: string
  ): Promise<{ loan: Loan; amountSeized: bigint }> {
    if (loan.status !== 'defaulted') {
      throw new LoanDefaultException('Collateral can only be seized on defaulted loans')
    }

    if (loan.collateralStatus !== 'locked' || !loan.collateralSavingsAccountId) {
      throw new LoanDefaultException('This loan has no locked collateral to seize')
    }

    return db.transaction(async (trx) => {
      const amountSeized = await CollateralService.seizeCollateral(loan, correlationId, trx)

      const toInterest = amountSeized < loan.interestOutstanding ? amountSeized : loan.interestOutstanding
      const toPrincipal = (amountSeized - toInterest) < loan.principalOutstanding ? (amountSeized - toInterest) : loan.principalOutstanding
      
      loan.interestOutstanding -= toInterest
      loan.principalOutstanding -= toPrincipal
      await loan.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: staff.id,
        action: 'loan.collateral_seized',
        resourceType: 'loan',
        resourceId: loan.id,
        before: { collateral_status: 'locked' },
        after: {
          collateral_status: 'seized',
          amount_seized: amountSeized.toString(),
          principal_outstanding: loan.principalOutstanding.toString(),
        },
        correlationId,
        trx,
      })

      return { loan, amountSeized }
    })
  }
}
