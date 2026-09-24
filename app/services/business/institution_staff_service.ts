import { randomBytes } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import Agent from '#models/agent'
import type Business from '#models/business'
import BusinessStaff, { type BusinessStaffRole } from '#models/business_staff'
import User from '#models/user'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { TellerSessionService } from '#services/counter/teller_session_service'
import { IdGenerator } from '#services/security/id_generator'
import { UserOnboardingService } from '#services/users/user_onboarding_service'

export class StaffRuleException extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: 400 | 404 | 409 = 400
  ) {
    super(message)
    this.name = 'StaffRuleException'
  }
}

export interface NewStaffMember {
  role: BusinessStaffRole
  agentId?: number | null
  /** An existing TumaPlus account, by the 9-digit code its holder shares. */
  userCode?: string
  /** Or a new account: name and email, the password is generated. */
  fullName?: string
  email?: string
}

const MAX_CODE_ATTEMPTS = 5

/**
 * An institution managing its own people — the job admin/business_staff_controller.ts did on its
 * behalf until an institution could be trusted with it.
 *
 * ## Who a staff member is
 *
 * An ordinary TumaPlus user, tied to exactly one institution by a `business_staff` row. They are
 * NOT a TumaPlus network agent: they sign in with their own account and act for the institution
 * that employs them, at the counter it posts them to. Someone who already has a TumaPlus account
 * (a teller is very often also a customer) is attached by the code they share; otherwise an
 * account is created and its password handed to the institution once.
 *
 * ## Rules held here rather than in the controller
 *
 * - A teller works a window: no teller without a counter posting.
 * - A posting points at one of THIS institution's live counters, never another's.
 * - One institution per person: BusinessStaffIdentityService resolves a user to a single active
 *   membership, so a second one elsewhere would make "which institution is this request for"
 *   depend on row order.
 * - Nobody is moved off a counter, suspended or terminated while their drawer is open: the shift
 *   would be left with nobody able to close it, and its variance with nobody to answer for it.
 *
 * ## What an institution cannot do
 *
 * Reset a staff member's password. Their account is a personal TumaPlus account with a wallet of
 * its own; letting an employer set its password would let the employer into that wallet. A
 * forgotten password goes through the ordinary reset flow, like any other user's.
 */
export class InstitutionStaffService {
  static async add(
    business: Business,
    member: NewStaffMember,
    correlationId: string
  ): Promise<{ staff: BusinessStaff; generatedPassword: string | null }> {
    const agentId = await this.validatePosting(business.id, member.role, member.agentId ?? null)

    return db.transaction(async (trx) => {
      let user: User | null = null
      let generatedPassword: string | null = null

      if (member.userCode) {
        user = await User.query({ client: trx }).where('code', member.userCode).first()
        if (!user) {
          throw new StaffRuleException(
            'No TumaPlus account has this code.',
            'E_USER_NOT_FOUND',
            404
          )
        }
      } else if (member.email) {
        const email = member.email.trim().toLowerCase()
        user = await User.query({ client: trx }).where('email', email).first()
        if (!user) {
          if (!member.fullName?.trim()) {
            throw new StaffRuleException('A new account needs a full name.', 'E_NAME_REQUIRED')
          }
          generatedPassword = randomBytes(9).toString('base64url')
          user = await User.create(
            {
              fullName: member.fullName.trim(),
              email,
              password: generatedPassword,
              code: await this.uniqueUserCode(),
            },
            { client: trx }
          )
          await UserOnboardingService.createDefaultWallet(user.id, 'USD', correlationId, trx)
        }
      } else {
        throw new StaffRuleException(
          'Give either the code of an existing account or an email for a new one.',
          'E_IDENTITY_REQUIRED'
        )
      }

      const memberships = await BusinessStaff.query({ client: trx }).where('user_id', user.id)
      if (memberships.some((row) => row.businessId === business.id)) {
        throw new StaffRuleException(
          'This person is already on staff at this institution.',
          'E_ALREADY_STAFF',
          409
        )
      }
      if (memberships.some((row) => row.status === 'active')) {
        throw new StaffRuleException(
          'This person is active staff of another institution.',
          'E_STAFF_ELSEWHERE',
          409
        )
      }

      const staff = await BusinessStaff.create(
        { businessId: business.id, userId: user.id, agentId, role: member.role, status: 'active' },
        { client: trx }
      )

      await AuditLoggerService.record({
        actorType: 'business',
        actorId: business.id,
        action: 'business_staff.created',
        resourceType: 'business_staff',
        resourceId: staff.id,
        before: undefined,
        after: {
          user_id: user.id,
          role: staff.role,
          agent_id: staff.agentId,
          new_account: generatedPassword !== null,
        },
        correlationId,
        trx,
      })

      return { staff, generatedPassword }
    })
  }

  static async update(
    business: Business,
    staff: BusinessStaff,
    changes: {
      role?: BusinessStaffRole
      agentId?: number | null
      status?: BusinessStaff['status']
    },
    correlationId: string
  ): Promise<BusinessStaff> {
    if (staff.status === 'terminated') {
      throw new StaffRuleException(
        'A terminated membership cannot be changed.',
        'E_STAFF_TERMINATED',
        409
      )
    }

    const role = changes.role ?? staff.role
    const agentId =
      changes.agentId !== undefined || changes.role !== undefined
        ? await this.validatePosting(
            business.id,
            role,
            changes.agentId !== undefined ? changes.agentId : staff.agentId
          )
        : staff.agentId

    const leavesCounter = staff.agentId !== null && agentId !== staff.agentId
    const stopsWorking = changes.status !== undefined && changes.status !== 'active'
    if ((leavesCounter || stopsWorking) && (await this.hasOpenDrawer(staff))) {
      throw new StaffRuleException(
        'This person has a drawer open: it must be closed first.',
        'E_SESSION_OPEN',
        409
      )
    }

    if (changes.status === 'active' && staff.status !== 'active') {
      const elsewhere = await BusinessStaff.query()
        .where('user_id', staff.userId)
        .whereNot('id', staff.id)
        .where('status', 'active')
        .first()
      if (elsewhere) {
        throw new StaffRuleException(
          'This person is active staff of another institution.',
          'E_STAFF_ELSEWHERE',
          409
        )
      }
    }

    const before = { role: staff.role, status: staff.status, agent_id: staff.agentId }
    staff.role = role
    staff.agentId = agentId
    if (changes.status !== undefined) staff.status = changes.status
    await staff.save()

    await AuditLoggerService.record({
      actorType: 'business',
      actorId: business.id,
      action: 'business_staff.updated',
      resourceType: 'business_staff',
      resourceId: staff.id,
      before,
      after: { role: staff.role, status: staff.status, agent_id: staff.agentId },
      correlationId,
    })
    return staff
  }

  /** Checks a posting against the role and returns the counter id to store. */
  private static async validatePosting(
    businessId: number,
    role: BusinessStaffRole,
    agentId: number | null
  ): Promise<number | null> {
    if (agentId === null) {
      if (role === 'teller') {
        throw new StaffRuleException(
          'A teller must be posted to a counter.',
          'E_TELLER_NEEDS_COUNTER'
        )
      }
      return null
    }

    const counter = await Agent.find(agentId)
    if (!counter || counter.businessId !== businessId) {
      // Not a 403: another institution's counters do not exist as far as this one is concerned.
      throw new StaffRuleException(
        'No such counter at this institution.',
        'E_COUNTER_NOT_FOUND',
        404
      )
    }
    if (counter.status === 'terminated') {
      throw new StaffRuleException('This counter is closed for good.', 'E_COUNTER_TERMINATED', 409)
    }
    return counter.id
  }

  private static async hasOpenDrawer(staff: BusinessStaff): Promise<boolean> {
    if (!staff.agentId) return false
    const session = await TellerSessionService.openSessionFor(staff.agentId)
    return session?.staffId === staff.id
  }

  private static async uniqueUserCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const candidate = IdGenerator.generateNumericCode()
      if (!(await User.findBy('code', candidate))) return candidate
    }
    throw new Error('Unable to generate a unique user code after several attempts')
  }
}
