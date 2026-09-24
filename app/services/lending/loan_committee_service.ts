import { DateTime } from 'luxon'
import type BusinessStaff from '#models/business_staff'
import Loan from '#models/loan'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export class LoanCommitteeException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoanCommitteeException'
  }
}

/**
 * The credit committee circuit for IMF-type institutions.
 *
 * In a microfinance institution, the credit officer who collects a file is typically NOT the same
 * person who approves it. A committee — at least two people with the right role — reviews the
 * application and records a collective decision. Only after their sign-off can the loan be
 * disbursed.
 *
 * ## Workflow
 *
 *   requested ──submit──▶ under_review ──committee_approve──▶ committee_approved ──disburse──▶ disbursed
 *       │                      │
 *       └──(direct reject)     └──committee_reject──▶ rejected
 *
 * The `stage` field tracks the committee circuit. The `status` field tracks the financial state.
 * They are separate dimensions: a loan can have status='approved' and stage='under_review' if the
 * institution skips the committee (single-officer institutions), or the two can be kept in sync
 * for full committee flow.
 *
 * For simplicity in v1, the committee circuit is enforced at the service level: `submitForReview`
 * gates entry into the committee queue, and `approveByCommittee` sets `stage='committee_approved'`
 * AND `status='approved'` so the existing `LoanService.disburse()` (which checks status='approved')
 * continues to work without changes.
 */
export class LoanCommitteeService {
  /**
   * A credit officer sends the file to the committee for review.
   *
   * The loan must be in `status='requested'` (not yet touched by the old approve() flow).
   * After this call the loan is visible in the committee queue (`stage='under_review'`).
   * `assignedLoanOfficerId` records who is responsible for following up.
   */
  static async submitForReview(
    loan: Loan,
    officer: BusinessStaff,
    correlationId: string
  ): Promise<Loan> {
    if (loan.status !== 'requested') {
      throw new LoanCommitteeException(
        `Only a requested loan can be sent to committee; this one is '${loan.status}'`
      )
    }
    if (loan.stage && loan.stage !== 'requested') {
      throw new LoanCommitteeException(
        `Loan is already in stage '${loan.stage}' — cannot re-submit`
      )
    }

    loan.stage = 'under_review'
    loan.assignedLoanOfficerId = officer.id
    await loan.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: officer.id,
      action: 'loan.committee.submitted',
      resourceType: 'loan',
      resourceId: loan.id,
      before: { stage: 'requested' },
      after: { stage: 'under_review', assigned_officer_id: officer.id },
      correlationId,
    })

    return loan
  }

  /**
   * The committee approves the loan, optionally adjusting the approved principal.
   *
   * Sets `stage = 'committee_approved'` and `status = 'approved'` so that `LoanService.disburse()`
   * can run without modification. The `approvedPrincipal` field records the amount the committee
   * agreed to; if null it defaults to the originally requested `loan.principal`.
   *
   * The `committeeDecisionAt` and `committeeNotes` fields are written for audit and reporting.
   */
  static async approveByCommittee(
    loan: Loan,
    officer: BusinessStaff,
    correlationId: string,
    options: { approvedPrincipal?: bigint; notes?: string } = {}
  ): Promise<Loan> {
    if (loan.stage !== 'under_review') {
      throw new LoanCommitteeException(
        `The committee can only decide on loans under review; this one is in stage '${loan.stage ?? 'none'}'`
      )
    }

    const approvedPrincipal = options.approvedPrincipal ?? loan.principal
    if (approvedPrincipal <= 0n) {
      throw new LoanCommitteeException('The approved principal must be greater than zero')
    }
    if (approvedPrincipal > loan.principal) {
      throw new LoanCommitteeException(
        'The committee cannot approve more than the originally requested principal'
      )
    }

    loan.stage = 'committee_approved'
    loan.status = 'approved'
    // If the committee approved a lower amount, record it and adjust the loan principal.
    if (approvedPrincipal < loan.principal) {
      loan.approvedPrincipal = approvedPrincipal
      loan.principal = approvedPrincipal
    }
    loan.committeeDecisionAt = DateTime.now()
    loan.committeeNotes = options.notes ?? null
    loan.decidedAt = DateTime.now()
    loan.decidedByStaffId = officer.id
    await loan.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: officer.id,
      action: 'loan.committee.approved',
      resourceType: 'loan',
      resourceId: loan.id,
      before: { stage: 'under_review', status: 'requested' },
      after: {
        stage: 'committee_approved',
        status: 'approved',
        approved_principal: approvedPrincipal.toString(),
        notes: options.notes ?? null,
        officer_id: officer.id,
      },
      correlationId,
    })

    return loan
  }

  /**
   * The committee rejects the loan application.
   *
   * Both `stage` and `status` are set to `'rejected'`. A reason is required: the borrower
   * deserves to know why, and the institution needs it for regulatory reporting.
   */
  static async rejectByCommittee(
    loan: Loan,
    officer: BusinessStaff,
    notes: string,
    correlationId: string
  ): Promise<Loan> {
    if (loan.stage !== 'under_review') {
      throw new LoanCommitteeException(
        `The committee can only decide on loans under review; this one is in stage '${loan.stage ?? 'none'}'`
      )
    }
    if (!notes || notes.trim().length === 0) {
      throw new LoanCommitteeException('A rejection reason is required')
    }

    loan.stage = 'rejected'
    loan.status = 'rejected'
    loan.committeeDecisionAt = DateTime.now()
    loan.committeeNotes = notes
    loan.decidedAt = DateTime.now()
    loan.decidedByStaffId = officer.id
    loan.decisionNotes = notes
    await loan.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: officer.id,
      action: 'loan.committee.rejected',
      resourceType: 'loan',
      resourceId: loan.id,
      before: { stage: 'under_review', status: 'requested' },
      after: { stage: 'rejected', status: 'rejected', notes, officer_id: officer.id },
      correlationId,
    })

    return loan
  }
}
