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
