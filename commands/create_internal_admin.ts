import { randomBytes, randomUUID } from 'node:crypto'
import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import InternalUser from '#models/internal_user'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

/**
 * Bootstraps a staff account from the server itself — the only way to create the very first
 * admin, since the admin panel's own "create internal user" action needs an existing admin.
 *
 * The password is random and printed exactly once; the account must change it and enrol TOTP
 * two-factor authentication before the admin console lets it through (is_internal_user.ts).
 *
 *   node ace internal:create-admin staff@trustsend.africa --name="Jane Doe"
 */
export default class CreateInternalAdmin extends BaseCommand {
  static commandName = 'internal:create-admin'
  static description = 'Create a staff account with a one-time random password'
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Email address of the staff account' })
  declare email: string

  @flags.string({ description: 'Full name of the staff member', required: true })
  declare name: string

  async run() {
    const email = this.email.trim().toLowerCase()
    const fullName = this.name.trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.logger.error(`Invalid email address: ${this.email}`)
      this.exitCode = 1
      return
    }

    if (fullName.length < 2) {
      this.logger.error('The --name flag must contain at least 2 characters')
      this.exitCode = 1
      return
    }

    if (await InternalUser.findBy('email', email)) {
      this.logger.error(`A staff account already exists for ${email}`)
      this.exitCode = 1
      return
    }

    const password = randomBytes(18).toString('base64url')

    const user = await InternalUser.create({
      email,
      fullName,
      password,
      status: 'active',
      mustChangePassword: true,
      mfaEnabled: false,
      mfaSecretEncrypted: null,
      mfaLastUsedStep: null,
      loginAttempts: 0,
    })

    await AuditLoggerService.record({
      actorType: 'system',
      actorId: 0,
      action: 'internal_user.created',
      resourceType: 'internal_user',
      resourceId: user.id,
      before: undefined,
      after: { email: user.email, full_name: user.fullName, via: 'cli' },
      correlationId: randomUUID(),
    })

    this.logger.success(`Staff account created for ${email} (id ${user.id})`)
    this.logger.warning('Temporary password — shown only once, share it through a secure channel:')
    console.log(`\n  ${password}\n`)
    this.logger.info('On first sign-in the account must change this password and enable two-factor authentication.')
  }
}
