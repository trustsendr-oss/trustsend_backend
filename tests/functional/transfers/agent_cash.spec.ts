import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import InternalUser from '#models/internal_user'
import KycVerification from '#models/kyc_verification'
import LedgerTransaction from '#models/ledger_transaction'
import User from '#models/user'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { AgentLifecycleService } from '#services/agents/agent_lifecycle_service'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import { CashOutService } from '#services/transactions/cash_out_service'
import {
  CASH_OUT_RESERVATION_TTL_MINUTES,
  CashOutHoldService,
} from '#services/transactions/cash_out_hold_service'
import { PinService } from '#services/security/pin_service'
import { Money } from '#services/money/money'

/**
 * Cash at a TumaPlus network agent.
 *
 * Three guarantees, each of which the code once lacked:
 * - a cash deposit credits the customer the agent names, never the agent's own account;
 * - a reserved withdrawal really holds the funds, so the same money cannot be reserved twice;
 * - a reservation nobody pays out lapses instead of sitting `reserved` forever.
 *
 * Every fixture carries a timestamp suffix and nothing is torn down — ledger rows are append-only
 * (see tests/functional/imf/counter_cash.spec.ts for the same choice).
 */
test.group('Agent cash', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `agent-cash-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  group.teardown(async () => {
    await db.from('internal_users').where('id', adminId).delete()
  })

  async function setUp(suffix: string) {
    const agentUser = await User.create({
      fullName: `Agent ${suffix}`,
      code: `7${suffix}`,
      email: `agent${suffix}@example.test`,
      password: 'a-real-password',
    })
    await PinService.setPin(agentUser, '1111')
    await UserOnboardingService.createDefaultWallet(agentUser.id, 'USD', `ac-${suffix}`)

    const agent = await AgentOnboardingService.create({
      userId: agentUser.id,
      code: `3${suffix}`,
      fullName: `Agent ${suffix}`,
      email: `agent${suffix}@example.test`,
      phone: '+243900000002',
      tier: 'master',
      correlationId: `ac-${suffix}`,
    })
    const kyc = new KycVerification()
    kyc.subjectType = 'agent'
    kyc.subjectId = agent.id
    kyc.verificationType = 'identity'
    kyc.status = 'approved'
    kyc.submittedAt = DateTime.now()
    kyc.decidedAt = DateTime.now()
    kyc.reviewedBy = adminId
    await kyc.save()
    await AgentLifecycleService.approve(agent.id, adminId, `ac-${suffix}`)
    await agent.refresh()
    await db.from('wallets').where('id', agent.walletId!).update({ balance_cache: 10_000_00n })

    const customer = await User.create({
      fullName: `Customer ${suffix}`,
      code: `8${suffix}`,
      email: `cust${suffix}@example.test`,
      password: 'a-real-password',
    })
    await PinService.setPin(customer, '2222')
    const wallet = await UserOnboardingService.createDefaultWallet(
      customer.id,
      'USD',
      `ac-${suffix}`
    )

    return { agentUser, agent, customer, wallet }
  }

  const suffixOf = () => `${Date.now()}`.slice(-8)

  test('a cash deposit credits the customer named by code', async ({ client, assert }) => {
    const suffix = suffixOf()
    const { agentUser, customer, wallet } = await setUp(suffix)

    const created = await client.post('/api/v1/cash-in').loginAs(agentUser).json({
      customer_code: customer.code,
      amount: '5000',
      currency_code: 'USD',
      pin: '1111',
      idempotency_key: randomUUID(),
    })
    created.assertStatus(201)
    assert.equal((created.body() as any).data.customer.code, customer.code)

    const txnId = (created.body() as any).data.transaction_id
    const confirmed = await client.post(`/api/v1/cash-in/${txnId}/confirm`).loginAs(agentUser)
    confirmed.assertStatus(200)

    await wallet.refresh()
    assert.isAbove(Number(wallet.balanceCache), 0, 'the customer, not the agent, was credited')
  })

  test('an agent cannot deposit into their own account', async ({ client }) => {
    const suffix = suffixOf()
    const { agentUser } = await setUp(suffix)

    const response = await client.post('/api/v1/cash-in').loginAs(agentUser).json({
      customer_code: agentUser.code,
      amount: '5000',
      currency_code: 'USD',
      pin: '1111',
      idempotency_key: randomUUID(),
    })
    response.assertStatus(422)
  })

  test('the same money cannot be reserved twice', async ({ assert }) => {
    const suffix = suffixOf()
    const { agent, wallet } = await setUp(suffix)
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 100_00n })

    await CashOutService.initiate({
      agentId: agent.id,
      userWalletId: wallet.id,
      amount: new Money(80_00n, 'USD'),
      correlationId: `ac-${suffix}`,
    })

    // The hold covers the cash and the agent's 2.5 % fee the customer pays on top: 80 + 2.
    assert.equal(await CashOutHoldService.availableBalance(await wallet.refresh()), 18_00n)

    await assert.rejects(
      () =>
        CashOutService.initiate({
          agentId: agent.id,
          userWalletId: wallet.id,
          amount: new Money(50_00n, 'USD'),
          correlationId: `ac-${suffix}`,
        }),
      /reserved for a pending cash withdrawal/
    )
  })

  test('a reservation nobody pays out lapses and releases the funds', async ({ assert }) => {
    const suffix = suffixOf()
    const { agent, wallet } = await setUp(suffix)
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 100_00n })

    const txn = await CashOutService.initiate({
      agentId: agent.id,
      userWalletId: wallet.id,
      amount: new Money(80_00n, 'USD'),
      correlationId: `ac-${suffix}`,
    })

    // Age the reservation past its lifetime.
    await db
      .from('ledger_transactions')
      .where('id', txn.id)
      .update({
        created_at: DateTime.now()
          .minus({ minutes: CASH_OUT_RESERVATION_TTL_MINUTES + 1 })
          .toJSDate(),
      })

    // Already released before the sweep runs…
    assert.equal(await CashOutHoldService.availableBalance(await wallet.refresh()), 100_00n)
    // …and the agent can no longer pay it out.
    await assert.rejects(() => CashOutService.confirm(txn.id, `ac-${suffix}`, agent.id), /expired/)

    assert.isAtLeast(await CashOutService.expireStale(), 1)
    const expired = await LedgerTransaction.findOrFail(txn.id)
    assert.equal(expired.status, 'cancelled')
    assert.match(expired.failureReason ?? '', /Expired/)
  })

  test('an agent code is always exactly 9 digits', async ({ assert }) => {
    const suffix = suffixOf()
    const base = {
      fullName: `Code ${suffix}`,
      phone: '+243900000003',
      tier: 'master' as const,
      correlationId: `ac-${suffix}`,
    }
    const owner = await User.create({
      fullName: `Owner ${suffix}`,
      email: `owner${suffix}@example.test`,
      password: 'a-real-password',
    })

    await assert.rejects(
      () =>
        AgentOnboardingService.create({
          ...base,
          userId: owner.id,
          code: `AG-${suffix}`,
          email: `bad${suffix}@example.test`,
        }),
      /exactly 9 digits/
    )

    const generated = await AgentOnboardingService.create({
      ...base,
      userId: owner.id,
      email: `gen${suffix}@example.test`,
    })
    assert.match(generated.code, /^\d{9}$/)
  })

  test('the agent workspace is scoped to the signed-in agent', async ({ client, assert }) => {
    const suffix = suffixOf()
    const { agentUser, agent, customer, wallet } = await setUp(suffix)

    // A customer account has no agent space.
    const notAgent = await client.get('/api/v1/agent/me').loginAs(customer)
    notAgent.assertStatus(404)
    assert.equal((notAgent.body() as any).code, 'NOT_AN_AGENT')

    const me = await client.get('/api/v1/agent/me').loginAs(agentUser)
    me.assertStatus(200)
    assert.equal((me.body() as any).data.code, agent.code)
    assert.isTrue((me.body() as any).data.capabilities.can_pay_out)
    assert.isTrue((me.body() as any).data.capabilities.can_transfer_float, 'a master can sponsor')

    // A withdrawal reserved at this agent shows up as pending work and can be previewed.
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 100_00n })
    const txn = await CashOutService.initiate({
      agentId: agent.id,
      userWalletId: wallet.id,
      amount: new Money(40_00n, 'USD'),
      correlationId: `ac-${suffix}`,
    })

    const pending = await client.get('/api/v1/agent/operations?scope=pending').loginAs(agentUser)
    pending.assertStatus(200)
    const listed = (pending.body() as any).data.find((op: any) => op.transaction_id === txn.id)
    assert.equal(listed?.customer?.code, customer.code)
    assert.isNotNull(listed?.expires_at)

    const preview = await client.get(`/api/v1/agent/cash-outs/${txn.id}`).loginAs(agentUser)
    preview.assertStatus(200)
    assert.equal((preview.body() as any).data.amount, '4000')

    // Another agent cannot read it.
    const other = await setUp(`${Number(suffix) + 1}`.slice(-8))
    const foreign = await client.get(`/api/v1/agent/cash-outs/${txn.id}`).loginAs(other.agentUser)
    foreign.assertStatus(404)

    // The full detail behind a history line: same scoping.
    const detail = await client.get(`/api/v1/agent/operations/${txn.id}`).loginAs(agentUser)
    detail.assertStatus(200)
    assert.equal((detail.body() as any).data.type, 'cash_out')
    assert.equal((detail.body() as any).data.fee, '100')
    assert.isString((detail.body() as any).data.uuid)
    const foreignDetail = await client
      .get(`/api/v1/agent/operations/${txn.id}`)
      .loginAs(other.agentUser)
    foreignDetail.assertStatus(404)
  })

  test('a suspended agent keeps read access but loses its rights', async ({ client, assert }) => {
    const suffix = suffixOf()
    const { agentUser, agent } = await setUp(suffix)
    await AgentLifecycleService.suspend(agent.id, adminId, 'Test', `ac-${suffix}`)

    const me = await client.get('/api/v1/agent/me').loginAs(agentUser)
    me.assertStatus(200)
    assert.equal((me.body() as any).data.status, 'suspended')
    assert.isFalse((me.body() as any).data.capabilities.can_pay_out)
    assert.isFalse((me.body() as any).data.capabilities.can_cash_in)

    const subAgents = await client.get('/api/v1/agent/sub-agents').loginAs(agentUser)
    subAgents.assertStatus(403)
  })

  test('an agent cannot withdraw at their own counter', async ({ client }) => {
    const suffix = suffixOf()
    const { agentUser, agent } = await setUp(suffix)

    const response = await client.post('/api/v1/cash-out').loginAs(agentUser).json({
      agent_code: agent.code,
      amount: '1000',
      currency_code: 'USD',
      pin: '1111',
      idempotency_key: randomUUID(),
    })
    response.assertStatus(422)
  })
})
