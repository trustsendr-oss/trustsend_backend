import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import BorrowerGroup from '#models/borrower_group'
import BorrowerGroupMember from '#models/borrower_group_member'
import Loan from '#models/loan'
import LoanSchedule from '#models/loan_schedule'
import SavingsAccount from '#models/savings_account'
import Wallet from '#models/wallet'
import type BusinessStaff from '#models/business_staff'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export class GroupLendingException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GroupLendingException'
  }
}

export class GroupLendingService {
  /**
   * Create a new solidarity borrower group (Grameen model).
   */
  static async createGroup(params: {
    providerId: number
    name: string
    code: string
    meetingFrequency?: 'weekly' | 'biweekly' | 'monthly'
    meetingDay?: string
    presidentUserId?: number
    secretaryUserId?: number
    treasurerUserId?: number
    loanOfficerId?: number
    staff: BusinessStaff
    correlationId: string
  }): Promise<BorrowerGroup> {
    const existing = await BorrowerGroup.findBy('code', params.code)
    if (existing) {
      throw new GroupLendingException(`Group with code ${params.code} already exists`)
    }

    const group = new BorrowerGroup()
    group.providerId = params.providerId
    group.name = params.name
    group.code = params.code
    group.meetingFrequency = params.meetingFrequency || 'weekly'
    group.meetingDay = params.meetingDay || null
    group.presidentUserId = params.presidentUserId || null
    group.secretaryUserId = params.secretaryUserId || null
    group.treasurerUserId = params.treasurerUserId || null
    group.loanOfficerId = params.loanOfficerId || null
    group.status = 'active'
    await group.save()

    // Add president as leader member if provided
    if (params.presidentUserId) {
      await this.addMember(group.id, params.presidentUserId, 'leader')
    }
    if (params.secretaryUserId && params.secretaryUserId !== params.presidentUserId) {
      await this.addMember(group.id, params.secretaryUserId, 'officer')
    }
    if (params.treasurerUserId && params.treasurerUserId !== params.presidentUserId && params.treasurerUserId !== params.secretaryUserId) {
      await this.addMember(group.id, params.treasurerUserId, 'officer')
    }

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: params.staff.id,
      action: 'group.created',
      resourceType: 'borrower_group',
      resourceId: group.id,
      before: undefined,
      after: { code: group.code, name: group.name },
      correlationId: params.correlationId,
    })

    return group
  }

  /**
   * Add a member to a borrower group.
   */
  static async addMember(
    groupId: number,
    userId: number,
    role: 'leader' | 'officer' | 'member' = 'member'
  ): Promise<BorrowerGroupMember> {
    const group = await BorrowerGroup.findOrFail(groupId)
    if (group.status !== 'active') {
      throw new GroupLendingException(`Cannot add member: group is ${group.status}`)
    }

    const existing = await BorrowerGroupMember.query()
      .where('group_id', groupId)
      .where('user_id', userId)
      .first()

    if (existing) {
      existing.status = 'active'
      existing.role = role
      await existing.save()
      return existing
    }

    const member = new BorrowerGroupMember()
    member.groupId = groupId
    member.userId = userId
    member.role = role
    member.joinedAt = DateTime.now()
    member.status = 'active'
    await member.save()

    return member
  }

  /**
   * Remove a member from a borrower group (only if they have no active loans).
   */
  static async removeMember(groupId: number, userId: number): Promise<void> {
    const activeLoan = await Loan.query()
      .where('group_id', groupId)
      .where('user_id', userId)
      .whereIn('status', ['disbursed', 'repaying'])
      .first()

    if (activeLoan) {
      throw new GroupLendingException(
        `Cannot remove member #${userId}: they have active loan #${activeLoan.id} in this group`
      )
    }

    const member = await BorrowerGroupMember.query()
      .where('group_id', groupId)
      .where('user_id', userId)
      .firstOrFail()

    member.status = 'left'
    await member.save()
  }

  /**
   * Solidarity lending rule: verify whether the group is eligible for a new loan.
   * If ANY member has an overdue instalment on an active loan, the whole group is blocked!
   */
  static async assertGroupEligibleForLoan(groupId: number): Promise<void> {
    const group = await BorrowerGroup.findOrFail(groupId)
    if (group.status !== 'active') {
      throw new GroupLendingException(`Group ${group.name} is not active (status: ${group.status})`)
    }

    // Find all active members
    const members = await BorrowerGroupMember.query()
      .where('group_id', groupId)
      .where('status', 'active')

    const memberUserIds = members.map((m) => m.userId)
    if (memberUserIds.length === 0) {
      throw new GroupLendingException('Group has no active members')
    }

    // Check if any member has an overdue loan instalment
    const now = DateTime.now().toSQL()
    const overdueSchedule = await LoanSchedule.query()
      .whereIn('loan_id', (subquery) => {
        subquery
          .from('loans')
          .select('id')
          .whereIn('user_id', memberUserIds)
          .whereIn('status', ['disbursed', 'repaying'])
      })
      .whereRaw('(principal_due - principal_paid > 0 OR interest_due - interest_paid > 0)')
      .where('due_date', '<', now)
      .preload('loan')
      .first()

    if (overdueSchedule) {
      throw new GroupLendingException(
        `Group solidarity block: Member #${overdueSchedule.loan.userId} has overdue instalment #${overdueSchedule.installmentNumber} on loan #${overdueSchedule.loanId}`
      )
    }
  }

  /**
   * Get financial summary and risk metrics for a group.
   */
  static async getGroupFinancialSummary(groupId: number): Promise<{
    group: BorrowerGroup
    activeMembersCount: number
    totalLoansCount: number
    activeLoansCount: number
    totalOutstandingPrincipal: bigint
    totalOutstandingInterest: bigint
    totalSavingsBalance: bigint
    hasOverdueLoans: boolean
  }> {
    const group = await BorrowerGroup.findOrFail(groupId)
    const members = await BorrowerGroupMember.query()
      .where('group_id', groupId)
      .where('status', 'active')

    const memberUserIds = members.map((m) => m.userId)

    const loans = await Loan.query()
      .where('group_id', groupId)

    const activeLoans = loans.filter((l) => l.status === 'disbursed' || l.status === 'repaying')
    const totalOutstandingPrincipal = activeLoans.reduce((sum, l) => sum + l.principalOutstanding, 0n)
    const totalOutstandingInterest = activeLoans.reduce((sum, l) => sum + l.interestOutstanding, 0n)

    // Calculate total savings of all group members
    let totalSavings = 0n
    if (memberUserIds.length > 0) {
      const savings = await SavingsAccount.query()
        .whereIn('user_id', memberUserIds)
        .where('status', 'active')
        .preload('wallet')

      for (const s of savings) {
        if (s.wallet) {
          totalSavings += s.wallet.balanceCache
        }
      }
    }

    // Check overdue
    let hasOverdue = false
    try {
      await this.assertGroupEligibleForLoan(groupId)
    } catch {
      hasOverdue = true
    }

    return {
      group,
      activeMembersCount: members.length,
      totalLoansCount: loans.length,
      activeLoansCount: activeLoans.length,
      totalOutstandingPrincipal,
      totalOutstandingInterest,
      totalSavingsBalance: totalSavings,
      hasOverdueLoans: hasOverdue,
    }
  }
}
