import { randomBytes } from 'node:crypto'
import InternalUser from '#models/internal_user'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export class InternalUserNotFoundException extends Error {
  constructor() {
    super('Internal user not found')
    this.name = 'InternalUserNotFoundException'
  }
}

export class CannotModifySelfException extends Error {
  constructor() {
    super('Cannot suspend or deactivate your own account')
    this.name = 'CannotModifySelfException'
  }
}

/**
 * Admin CRUD + lifecycle for InternalUser (staff) accounts — the "who can log in as an admin at
 * all" surface. Before this existed, the only way to create or manage a staff account was direct
 * DB access, since internal_auth_controller.ts only ever provided login/logout. There's no role
 * system on this model (see internal_user.ts) — every internal_user is equally privileged,
 * mirroring how /agents and /businesses already trust any internal_user equally.
 */
export class InternalUserService {
  static async list(): Promise<InternalUser[]> {
    return InternalUser.query().orderBy('id', 'asc')
  }

  static async findByIdOrFail(id: number): Promise<InternalUser> {
    const user = await InternalUser.find(id)
    if (!user) throw new InternalUserNotFoundException()
    return user
  }

  /**
   * Creates a staff account. If no password is supplied, one is generated and returned in
   * plaintext ONLY in this call's result — it is never stored or retrievable again — and
   * mustChangePassword is set so the new hire is forced to pick their own on first login.
   */
  static async create(
    request: { email: string; fullName: string; password?: string },
    actorId: number,
    correlationId: string
  ): Promise<{ user: InternalUser; generatedPassword: string | null }> {
    const generatedPassword = request.password ? null : randomBytes(12).toString('base64url')

    const user = await InternalUser.create({
      email: request.email,
      fullName: request.fullName,
      password: request.password || generatedPassword!,
      status: 'active',
      mustChangePassword: !request.password,
      mfaEnabled: false,
      loginAttempts: 0,
    })

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'internal_user.created',
      resourceType: 'internal_user',
      resourceId: user.id,
      before: undefined,
      after: { email: user.email, full_name: user.fullName },
      correlationId,
    })

    return { user, generatedPassword }
  }

  static async activate(id: number, actorId: number, correlationId: string): Promise<InternalUser> {
    const user = await this.findByIdOrFail(id)
    const before = { status: user.status }

    user.status = 'active'
    user.loginAttempts = 0
    user.loginLockedUntil = null
    await user.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'internal_user.activated',
      resourceType: 'internal_user',
      resourceId: user.id,
      before,
      after: { status: 'active' },
      correlationId,
    })

    return user
  }

  /** Temporary hold — e.g. under investigation. Distinct from deactivate (permanent offboarding). */
  static async suspend(id: number, actorId: number, reason: string, correlationId: string): Promise<InternalUser> {
    if (id === actorId) throw new CannotModifySelfException()

    const user = await this.findByIdOrFail(id)
    const before = { status: user.status }

    user.status = 'suspended'
    await user.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'internal_user.suspended',
      resourceType: 'internal_user',
      resourceId: user.id,
      before,
      after: { status: 'suspended', reason },
      correlationId,
    })

    return user
  }

  /** Permanent offboarding — e.g. the staff member left. */
  static async deactivate(id: number, actorId: number, reason: string, correlationId: string): Promise<InternalUser> {
    if (id === actorId) throw new CannotModifySelfException()

    const user = await this.findByIdOrFail(id)
    const before = { status: user.status }

    user.status = 'inactive'
    await user.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'internal_user.deactivated',
      resourceType: 'internal_user',
      resourceId: user.id,
      before,
      after: { status: 'inactive', reason },
      correlationId,
    })

    return user
  }

  /**
   * Admin-initiated password reset (e.g. the staff member is locked out and has no self-service
   * recovery flow). Returns the new password in plaintext ONCE — same one-time-reveal convention
   * as create() and BusinessApiKeyService.generate(). Forces a change on next login.
   */
  static async resetPassword(id: number, actorId: number, correlationId: string): Promise<string> {
    const user = await this.findByIdOrFail(id)
    const newPassword = randomBytes(12).toString('base64url')

    user.password = newPassword
    user.mustChangePassword = true
    user.loginAttempts = 0
    user.loginLockedUntil = null
    await user.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'internal_user.password_reset',
      resourceType: 'internal_user',
      resourceId: user.id,
      before: undefined,
      after: undefined,
      correlationId,
    })

    return newPassword
  }
}
