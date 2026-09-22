import type Agent from '#models/agent'
import BusinessStaff from '#models/business_staff'

export class BusinessStaffNotFoundException extends Error {
  constructor() {
    super('User is not a member of any institution staff')
    this.name = 'BusinessStaffNotFoundException'
  }
}

export class BusinessStaffNotActiveException extends Error {
  constructor(status: string) {
    super(`Staff membership is not active (status: ${status})`)
    this.name = 'BusinessStaffNotActiveException'
  }
}

export class StaffNotPostedException extends Error {
  constructor() {
    super('This staff member is not posted to a counter')
    this.name = 'StaffNotPostedException'
  }
}

export class CounterNotActiveException extends Error {
  constructor(status: string) {
    super(`The counter is not active (status: ${status})`)
    this.name = 'CounterNotActiveException'
  }
}

/**
 * Resolves the BusinessStaff record linked to an authenticated User.
 *
 * This is the single source of truth for "is this authenticated caller really staff of an
 * institution, and which one" — mirroring AgentIdentityService, which plays the same role for
 * agents. Every endpoint acting on behalf of an institution MUST go through this rather than
 * trusting a business id sent by the caller: the membership row is what ties a person to exactly
 * one institution, and it is the whole of the isolation boundary between competing institutions.
 *
 * `business` is preloaded because every caller needs it immediately — business_staff_middleware
 * puts it on ctx.business, and loading it here keeps that a single query rather than two.
 */
export class BusinessStaffIdentityService {
  static async findActiveStaffForUser(userId: number): Promise<BusinessStaff | null> {
    const staff = await BusinessStaff.query().where('user_id', userId).preload('business').first()

    if (!staff || staff.status !== 'active') {
      return null
    }
    return staff
  }

  /**
   * The counter a staff member is actually standing at.
   *
   * This replaces `agents.user_id` for an institution: a counter is a place, not a person, so it
   * has no account of its own and cannot be resolved from a signed-in user the way a TumaPlus
   * network agent is (AgentIdentityService). The posting is the link, and it is the only one —
   * which is also what keeps a teller from acting at a counter they were never posted to.
   *
   * Every precondition a cash operation needs is checked here rather than at each call site: the
   * membership is active, a posting exists, the counter is active, and — since `business_staff`
   * and `agents` both carry a business id — that the two agree.
   *
   * @throws StaffNotPostedException if the member holds no counter posting
   * @throws CounterNotActiveException if the counter is not active
   */
  static async requireCounterForStaff(staff: BusinessStaff): Promise<Agent> {
    if (!staff.agentId) {
      throw new StaffNotPostedException()
    }

    await staff.load('agent')
    const counter = staff.agent

    if (!counter || counter.businessId !== staff.businessId) {
      // Defensive: the admin API already refuses a cross-institution posting. Reaching this would
      // mean the row was written some other way, and acting on it would cross the isolation
      // boundary the whole design rests on.
      throw new StaffNotPostedException()
    }
    if (counter.status !== 'active') {
      throw new CounterNotActiveException(counter.status)
    }

    return counter
  }

  /**
   * @throws BusinessStaffNotFoundException if the user has no staff membership
   * @throws BusinessStaffNotActiveException if the membership isn't active
   */
  static async requireActiveStaffForUser(userId: number): Promise<BusinessStaff> {
    const staff = await BusinessStaff.query().where('user_id', userId).preload('business').first()

    if (!staff) {
      throw new BusinessStaffNotFoundException()
    }
    if (staff.status !== 'active') {
      throw new BusinessStaffNotActiveException(staff.status)
    }
    return staff
  }
}
