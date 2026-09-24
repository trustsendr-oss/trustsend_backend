import Agent from '#models/agent'
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

export class CannotCoverCounterException extends Error {
  constructor() {
    super('Only a branch manager or an institution admin can work at a counter other than their own')
    this.name = 'CannotCoverCounterException'
  }
}

export class CounterNotFoundException extends Error {
  constructor() {
    super('No such counter at this institution')
    this.name = 'CounterNotFoundException'
  }
}

export class NotYourDrawerException extends Error {
  constructor() {
    super(
      'The drawer open at this counter belongs to someone else: open your own before handling cash'
    )
    this.name = 'NotYourDrawerException'
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
    const counterId = this.actingCounterId(staff)
    if (!counterId) {
      throw new StaffNotPostedException()
    }

    let counter: Agent | null
    if (counterId === staff.agentId) {
      await staff.load('agent')
      counter = staff.agent
    } else {
      counter = await Agent.find(counterId)
    }

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

  /* -- Covering a counter ------------------------------------------------------------------
   *
   * A teller works the window they are posted to, and only that one. A branch manager or an
   * institution admin is different: they are the people who step in when a window is short-handed,
   * and an admin is expected to be able to do anything a teller does. They name the counter they
   * are working at for the request (the `X-Counter-Id` header, read by business_staff_middleware),
   * and every counter route then resolves THAT counter through requireCounterForStaff — the same
   * isolation and status checks, no second code path.
   *
   * The choice lives in `$extras`, which Lucid never persists: covering a counter for one request
   * must never rewrite someone's posting.
   *
   * Cash is the one thing covering does not open up by itself. Cash booked at a counter goes into
   * the drawer open there, and a drawer is one person's statement of what they hold; an admin's
   * notes landing in a teller's drawer would give that teller a variance that is not theirs. So a
   * cover can handle cash only through a drawer they opened themselves (requireOwnDrawerWhenCovering).
   */
  static readonly COVERING_ROLES = new Set(['branch_manager', 'admin'])

  /** The counter this request acts at: the one being covered, else the posting. */
  static actingCounterId(staff: BusinessStaff): number | null {
    return (staff.$extras.actingCounterId as number | undefined) ?? staff.agentId
  }

  static isCovering(staff: BusinessStaff): boolean {
    const acting = staff.$extras.actingCounterId as number | undefined
    return acting !== undefined && acting !== staff.agentId
  }

  /**
   * Records, for this request only, that the staff member works at `counterId`.
   *
   * @throws CannotCoverCounterException for a role that works only its own window
   * @throws CounterNotFoundException for a counter that is not this institution's
   */
  static async coverCounter(staff: BusinessStaff, counterId: number): Promise<void> {
    if (counterId === staff.agentId) return
    if (!this.COVERING_ROLES.has(staff.role)) {
      throw new CannotCoverCounterException()
    }
    const counter = await Agent.find(counterId)
    if (!counter || counter.businessId !== staff.businessId) {
      throw new CounterNotFoundException()
    }
    staff.$extras.actingCounterId = counter.id
  }

  /** The counters this person may work at: every live one for a cover, else their posting. */
  static async countersFor(staff: BusinessStaff): Promise<Agent[]> {
    if (this.COVERING_ROLES.has(staff.role)) {
      return Agent.query()
        .where('business_id', staff.businessId)
        .whereNot('status', 'terminated')
        .orderByRaw('parent_agent_id IS NOT NULL')
        .orderBy('id', 'asc')
    }
    if (!staff.agentId) return []
    const posted = await Agent.find(staff.agentId)
    return posted ? [posted] : []
  }

  /** @throws NotYourDrawerException when a cover would book cash into someone else's drawer */
  static async requireOwnDrawerWhenCovering(staff: BusinessStaff, counter: Agent): Promise<void> {
    if (!this.isCovering(staff)) return
    const { default: TellerSession } = await import('#models/teller_session')
    const open = await TellerSession.query()
      .where('agent_id', counter.id)
      .where('status', 'open')
      .first()
    if (open && open.staffId !== staff.id) {
      throw new NotYourDrawerException()
    }
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
