import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Agent from '#models/agent'
import InternalUser from '#models/internal_user'
import Notification from '#models/notification'
import User from '#models/user'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import { CashOutService } from '#services/transactions/cash_out_service'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { Money } from '#services/money/money'

/**
 * "Become an agent": a customer applies from the app, an internal reviewer decides.
 *
 * What matters: one open application per person, a customer can never approve themselves, and an
 * approval yields an agent that still has to pass the usual gates (pending_approval, own KYC).
 * Fixtures carry a timestamp suffix; nothing is torn down (see counter_cash.spec.ts).
 */
test.group('Agent applications', (group) => {
  let admin: InternalUser

  group.setup(async () => {
    admin = await InternalUser.create({
      email: `agent-app-admin-${Date.now()}@example.test`,
      fullName: 'Reviewer',
      password: 'a-real-password',
      status: 'active',
      // The admin gate requires a finished onboarding: definitive password and 2FA enrolled.
      mustChangePassword: false,
      mfaEnabled: true,
    })
  })

  group.teardown(async () => {
    await db.from('internal_users').where('id', admin.id).delete()
  })

  const suffixOf = () => `${Date.now()}`.slice(-8)
  const asAdmin = (req: any) => req.withGuard('internal').loginAs(admin)

  /** A customer holding `usd` (ledger units) on a USD wallet — 150 USD by default. */
  async function applicant(suffix: string, usd: bigint = 150_00n) {
    const user = await User.create({
      fullName: `Applicant ${suffix}`,
      code: `6${suffix}`,
      email: `applicant${suffix}@example.test`,
      password: 'a-real-password',
    })
    const wallet = await UserOnboardingService.createDefaultWallet(user.id, 'USD', `app-${suffix}`)
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: usd })
    return user
  }

  const form = {
    business_name: 'Boutique Kivu',
    phone: '+243900000010',
    city: 'Goma',
    motivation: 'Je tiens déjà une boutique de transfert.',
  }

  test('a customer applies once, and follows their application', async ({ client, assert }) => {
    const suffix = suffixOf()
    const user = await applicant(suffix)

    const none = await client.get('/api/v1/agent-applications/mine').loginAs(user)
    none.assertStatus(200)
    assert.isNull((none.body() as any).data)

    const created = await client.post('/api/v1/agent-applications').loginAs(user).json(form)
    created.assertStatus(201)
    assert.equal((created.body() as any).data.status, 'submitted')

    const twice = await client.post('/api/v1/agent-applications').loginAs(user).json(form)
    twice.assertStatus(409)
    assert.equal((twice.body() as any).code, 'APPLICATION_OPEN')

    const mine = await client.get('/api/v1/agent-applications/mine').loginAs(user)
    assert.equal((mine.body() as any).data.business_name, 'Boutique Kivu')
  })

  test('a customer cannot reach the review queue', async ({ client }) => {
    const user = await applicant(suffixOf())
    const response = await client.get('/api/v1/admin/agent-applications').loginAs(user)
    response.assertStatus(401)
  })

  test('approval creates a pending agent linked to the applicant', async ({ client, assert }) => {
    const suffix = suffixOf()
    const user = await applicant(suffix)
    const created = await client.post('/api/v1/agent-applications').loginAs(user).json(form)
    const id = (created.body() as any).data.id

    const approved = await asAdmin(
      client.post(`/api/v1/admin/agent-applications/${id}/approve`)
    ).json({
      tier: 'distributor',
    })
    approved.assertStatus(200)
    assert.equal((approved.body() as any).data.status, 'approved')

    const agent = await Agent.query().where('user_id', user.id).firstOrFail()
    assert.equal(agent.status, 'pending_approval', 'still has to pass KYC and activation')
    assert.match(agent.code, /^\d{9}$/)
    assert.equal(agent.businessName, 'Boutique Kivu')

    const note = await Notification.query()
      .where('recipient_type', 'user')
      .where('recipient_id', user.id)
      .where('type', 'agent_application.approved')
      .first()
    assert.isNotNull(note)

    // Deciding twice is refused, and an agent cannot apply again.
    const again = await asAdmin(client.post(`/api/v1/admin/agent-applications/${id}/approve`)).json(
      {
        tier: 'distributor',
      }
    )
    again.assertStatus(409)
    const reapply = await client.post('/api/v1/agent-applications').loginAs(user).json(form)
    reapply.assertStatus(409)
    assert.equal((reapply.body() as any).code, 'ALREADY_AGENT')
  })

  test('a rejection carries its reason and allows a new application', async ({
    client,
    assert,
  }) => {
    const suffix = suffixOf()
    const user = await applicant(suffix)
    const created = await client.post('/api/v1/agent-applications').loginAs(user).json(form)
    const id = (created.body() as any).data.id

    const rejected = await asAdmin(
      client.post(`/api/v1/admin/agent-applications/${id}/reject`)
    ).json({
      reason: 'Adresse de la boutique introuvable',
    })
    rejected.assertStatus(200)

    const mine = await client.get('/api/v1/agent-applications/mine').loginAs(user)
    assert.equal((mine.body() as any).data.status, 'rejected')
    assert.equal((mine.body() as any).data.rejection_reason, 'Adresse de la boutique introuvable')

    const retry = await client.post('/api/v1/agent-applications').loginAs(user).json(form)
    retry.assertStatus(201)
  })

  test('less than 100 USD cannot apply', async ({ client, assert }) => {
    const user = await applicant(suffixOf(), 99_99n)

    const eligibility = await client.get('/api/v1/agent-applications/eligibility').loginAs(user)
    eligibility.assertStatus(200)
    assert.isFalse((eligibility.body() as any).data.eligible)
    assert.equal((eligibility.body() as any).data.shortfall_usd, '1')

    const response = await client.post('/api/v1/agent-applications').loginAs(user).json(form)
    response.assertStatus(422)
    assert.equal((response.body() as any).code, 'INSUFFICIENT_BALANCE')
  })

  test('a CDF balance counts at its USD equivalent', async ({ client, assert }) => {
    const suffix = suffixOf()
    const user = await applicant(suffix, 0n)
    const cdf = await UserOnboardingService.createDefaultWallet(user.id, 'CDF', `app-${suffix}`)

    const before = await client.get('/api/v1/agent-applications/eligibility').loginAs(user)
    const minimumCdf = BigInt((before.body() as any).data.minimum_cdf)
    assert.isAbove(Number(minimumCdf), 0)

    await db.from('wallets').where('id', cdf.id).update({ balance_cache: minimumCdf })
    const after = await client.get('/api/v1/agent-applications/eligibility').loginAs(user)
    assert.isTrue((after.body() as any).data.eligible)
  })

  test('money reserved for a withdrawal does not count', async ({ client, assert }) => {
    const suffix = suffixOf()
    const user = await applicant(suffix, 120_00n)
    const wallet = await db
      .from('wallets')
      .where('user_id', user.id)
      .where('currency_code', 'USD')
      .first()

    // A network agent to reserve the withdrawal at.
    const agentUser = await User.create({
      fullName: `Holder ${suffix}`,
      email: `holder${suffix}@example.test`,
      password: 'a-real-password',
    })
    const agent = await AgentOnboardingService.create({
      userId: agentUser.id,
      fullName: `Holder ${suffix}`,
      email: `holder${suffix}@example.test`,
      phone: '+243900000011',
      tier: 'master',
      correlationId: `app-${suffix}`,
    })
    await db.from('agents').where('id', agent.id).update({ status: 'active' })

    await CashOutService.initiate({
      agentId: agent.id,
      userWalletId: wallet.id,
      amount: new Money(30_00n, 'USD'),
      correlationId: `app-${suffix}`,
    })

    const eligibility = await client.get('/api/v1/agent-applications/eligibility').loginAs(user)
    assert.isFalse((eligibility.body() as any).data.eligible, '120 - 30 reserved = 90 USD')
  })

  test('an e-mail already used by another agent is refused clearly, then overridden', async ({
    client,
    assert,
  }) => {
    const suffix = suffixOf()
    const user = await applicant(suffix)

    // Another account's agent record already uses the applicant's e-mail.
    const other = await User.create({
      fullName: `Other ${suffix}`,
      email: `other${suffix}@example.test`,
      password: 'a-real-password',
    })
    await AgentOnboardingService.create({
      userId: other.id,
      fullName: `Other ${suffix}`,
      email: user.email!,
      phone: '+243900000012',
      tier: 'master',
      correlationId: `app-${suffix}`,
    })

    const created = await client.post('/api/v1/agent-applications').loginAs(user).json(form)
    const id = (created.body() as any).data.id

    const clash = await asAdmin(client.post(`/api/v1/admin/agent-applications/${id}/approve`)).json(
      {
        tier: 'distributor',
      }
    )
    clash.assertStatus(409)
    assert.equal((clash.body() as any).code, 'AGENT_EMAIL_TAKEN')

    const approved = await asAdmin(
      client.post(`/api/v1/admin/agent-applications/${id}/approve`)
    ).json({ tier: 'distributor', email: `shop${suffix}@example.test` })
    approved.assertStatus(200)
    const agent = await Agent.query().where('user_id', user.id).firstOrFail()
    assert.equal(agent.email, `shop${suffix}@example.test`)
  })
})
