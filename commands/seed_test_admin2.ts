import { BaseCommand } from '@adonisjs/core/ace'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'

export default class SeedTestAdmin2 extends BaseCommand {
  static commandName = 'seed:test-admin2'
  static options = { startApp: true }

  async run() {
    const email = `card-plan-admin-${Date.now()}@internal.test`
    const password = 'Password123!'
    const passwordHash = await hash.make(password)

    await db.table('internal_users').insert({
      email,
      full_name: 'Card Plan Test Admin',
      password: passwordHash,
      status: 'active',
      must_change_password: false,
      mfa_enabled: false,
      login_attempts: 0,
      created_at: new Date(),
      updated_at: new Date(),
    })

    console.log(JSON.stringify({ email, password }))
  }
}
