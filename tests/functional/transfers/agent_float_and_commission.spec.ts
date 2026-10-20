import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import Agent from '#models/agent'
import InternalUser from '#models/internal_user'
import KycVerification from '#models/kyc_verification'
import User from '#models/user'
import Wallet from '#models/wallet'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { AgentLifecycleService } from '#services/agents/agent_lifecycle_service'
import { AgentFloatService } from '#services/agents/agent_float_service'
import { AgentCommissionService } from '#services/agents/agent_commission_service'
import { P2pTransferService } from '#services/transactions/p2p_transfer_service'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import { CashInService } from '#services/transactions/cash_in_service'
import { CashOutService } from '#services/transactions/cash_out_service'
import { FloatTransferService } from '#services/transactions/float_transfer_service'
import { PinService } from '#services/security/pin_service'
import { Money } from '#services/money/money'

/**
 * An agent's float and what they earn on it.
 *
 * - deposits and withdrawals are free for the customer and move only the amount;
 * - the agent is paid once a day, a percentage of their cash volume, round trips excluded;
 * - the agent's cash limits are enforced;
 * - the float exists per currency, and can be taken back to the personal wallet;
 * - termination checks every float, not only the USD one.
 *
 * Fixtures carry a timestamp suffix and nothing is torn down, as in agent_cash.spec.ts.
 */
test.group('Agent float and commission', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `agent-float-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  group.teardown(async () => {
    await db.from('internal_users').where('id', adminId).delete()
  })

  async function setUp(
    suffix: string,
    limits: { dailyLimit?: bigint; perTransactionLimit?: bigint } = {}
  ) {
    const agentUser = await User.create({
      fullName: `Agent ${suffix}`,
      code: `5${suffix}`,
      email: `fagent${suffix}@example.test`,
      password: 'a-real-password',
    })
    await PinService.setPin(agentUser, '1111')
    const personal = await UserOnboardingService.createDefaultWallet(
      agentUser.id,
      'USD',
      `af-${suffix}`
    )

    const agent = await AgentOnboardingService.create({
      userId: agentUser.id,
      code: `4${suffix}`,
      fullName: `Agent ${suffix}`,
      email: `fagent${suffix}@example.test`,
      phone: '+243900000012',
      tier: 'master',
      commissionRate: 2.5,
      ...limits,
      correlationId: `af-${suffix}`,
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
    await AgentLifecycleService.approve(agent.id, adminId, `af-${suffix}`)
    await agent.refresh()
    await db.from('wallets').where('id', agent.walletId!).update({ balance_cache: 1_000_00n })

    const customer = await User.create({
      fullName: `Customer ${suffix}`,
      code: `6${suffix}`,
      email: `fcust${suffix}@example.test`,
      password: 'a-real-password',
    })
    await PinService.setPin(customer, '2222')
    const wallet = await UserOnboardingService.createDefaultWallet(
      customer.id,
      'USD',
      `af-${suffix}`
    )

    return { agentUser, agent, personal, customer, wallet }
  }

  const suffixOf = () => `${Date.now()}`.slice(-8)
  const balanceOf = async (walletId: number) => (await Wallet.findOrFail(walletId)).balanceCache

  const depositTo = async (
    agent: Agent,
    walletId: number,
    amount: bigint,
    suffix: string
  ): Promise<void> => {
    const txn = await CashInService.initiate({
      agentId: agent.id,
      userWalletId: walletId,
      amount: new Money(amount, 'USD'),
      correlationId: `af-${suffix}`,
    })
    await CashInService.confirm(txn.id, `af-${suffix}`, agent.id)
  }

  test('a deposit is free for the customer and pays no commission on the spot', async ({
    assert,
  }) => {
    const suffix = suffixOf()
    const { agent, wallet } = await setUp(suffix)

    await depositTo(agent, wallet.id, 100_00n, suffix)

    assert.equal(await balanceOf(wallet.id), 100_00n, 'the customer gets the full amount')
    // 1000 − 100 handed to the customer; the commission comes with the daily payout.
    assert.equal(await balanceOf(agent.walletId!), 900_00n)
  })

  test('a withdrawal is free for the customer', async ({ client, assert }) => {
    const suffix = suffixOf()
    const { agent, customer, wallet } = await setUp(suffix)
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 200_00n })

    const created = await client.post('/api/v1/cash-out').loginAs(customer).json({
      agent_code: agent.code,
      amount: '10000',
      currency_code: 'USD',
      pin: '2222',
      idempotency_key: randomUUID(),
    })
    created.assertStatus(201)
    assert.equal((created.body() as any).data.fee, '0')

    await CashOutService.confirm(
      (created.body() as any).data.transaction_id,
      `af-${suffix}`,
      agent.id
    )

    assert.equal(await balanceOf(wallet.id), 100_00n)
    // The agent handed out 100 and was credited 100.
    assert.equal(await balanceOf(agent.walletId!), 1_100_00n)

    const lookup = await client.get(`/api/v1/directory/agents?code=${agent.code}`).loginAs(customer)
    assert.equal((lookup.body() as any).data.cash_out_fee_percent, 0)
  })

  test('the agent is paid once a day on their cash volume', async ({ assert }) => {
    const suffix = suffixOf()
    const { agent, wallet } = await setUp(suffix)

    await depositTo(agent, wallet.id, 100_00n, suffix)
    await depositTo(agent, wallet.id, 300_00n, `${suffix}b`)

    const rate = await AgentFloatService.volumeCommissionPercent(agent)
    const expected = AgentFloatService.commissionOn(400_00n, rate)
    const results = await AgentCommissionService.payDay(DateTime.now())
    const mine = results.find((r) => r.agentId === agent.id)

    assert.equal(mine?.volume, 400_00n)
    assert.equal(mine?.commission, expected)
    // 1000 − 400 handed out, + the day's commission.
    assert.equal(await balanceOf(agent.walletId!), 600_00n + expected)

    // A second run the same day pays nothing more.
    const again = await AgentCommissionService.payDay(DateTime.now())
    assert.isUndefined(again.find((r) => r.agentId === agent.id))
    assert.equal(await balanceOf(agent.walletId!), 600_00n + expected)
  })

  test('a deposit sent straight back to the agent is not volume', async ({ assert }) => {
    const suffix = suffixOf()
    const { agent, personal, customer, wallet } = await setUp(suffix)

    await depositTo(agent, wallet.id, 100_00n, suffix)
    // The accomplice returns the money to the agent's own account.
    await P2pTransferService.initiate({
      senderWalletId: wallet.id,
      recipientWalletId: personal.id,
      amount: new Money(90_00n, 'USD'),
      correlationId: `af-${suffix}`,
      initiatedByType: 'user',
      initiatedById: customer.id,
    })

    const results = await AgentCommissionService.payDay(DateTime.now())
    const mine = results.find((r) => r.agentId === agent.id)

    assert.equal(mine?.volume, 0n)
    assert.equal(mine?.excluded, 100_00n)
    assert.equal(mine?.commission, 0n)
    assert.equal(await balanceOf(agent.walletId!), 900_00n, 'no commission on a round trip')
  })

  test('a person-to-person transfer costs the sender the fee on top', async ({ assert }) => {
    const suffix = suffixOf()
    const { personal, customer, wallet } = await setUp(suffix)
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 200_00n })

    const result = await P2pTransferService.initiate({
      senderWalletId: wallet.id,
      recipientWalletId: personal.id,
      amount: new Money(100_00n, 'USD'),
      correlationId: `af-${suffix}`,
      initiatedByType: 'user',
      initiatedById: customer.id,
    })

    // fee_schedules p2p_transfer = 1 %: the recipient gets 100, the sender pays 101.
    assert.equal(result.fee, 1_00n)
    assert.equal(await balanceOf(wallet.id), 99_00n)
    assert.equal(await balanceOf(personal.id), 100_00n)
  })

  test('the agent cash limits are enforced', async ({ assert }) => {
    const suffix = suffixOf()
    const { agent, wallet } = await setUp(suffix, {
      perTransactionLimit: 300_00n,
      dailyLimit: 500_00n,
    })

    await assert.rejects(
      () =>
        CashInService.initiate({
          agentId: agent.id,
          userWalletId: wallet.id,
          amount: new Money(301_00n, 'USD'),
          correlationId: `af-${suffix}`,
        }),
      /per-transaction cash limit/
    )

    for (const amount of [250_00n, 250_00n]) {
      await CashInService.initiate({
        agentId: agent.id,
        userWalletId: wallet.id,
        amount: new Money(amount, 'USD'),
        correlationId: `af-${suffix}`,
      })
    }
    await assert.rejects(
      () =>
        CashInService.initiate({
          agentId: agent.id,
          userWalletId: wallet.id,
          amount: new Money(1_00n, 'USD'),
          correlationId: `af-${suffix}`,
        }),
      /daily cash limit/
    )
  })

  test('the float is held per currency', async ({ assert }) => {
    const suffix = suffixOf()
    const { agent, agentUser, customer } = await setUp(suffix)

    // No CDF float yet: a CDF deposit is refused rather than booked on the USD wallet.
    const cdfCustomerWallet = await UserOnboardingService.createDefaultWallet(
      customer.id,
      'CDF',
      `af-${suffix}`
    )
    await assert.rejects(
      () =>
        CashInService.initiate({
          agentId: agent.id,
          userWalletId: cdfCustomerWallet.id,
          amount: new Money(10_000n, 'CDF'),
          correlationId: `af-${suffix}`,
        }),
      /no CDF float/
    )

    // Funding it from the personal CDF wallet opens it.
    const personalCdf = await UserOnboardingService.createDefaultWallet(
      agentUser.id,
      'CDF',
      `af-${suffix}`
    )
    await db.from('wallets').where('id', personalCdf.id).update({ balance_cache: 50_000n })
    await FloatTransferService.convertFromPersonalWallet({
      agentId: agent.id,
      amount: new Money(50_000n, 'CDF'),
      correlationId: `af-${suffix}`,
    })

    const cdfFloat = await AgentFloatService.requireFloatWallet(agent, 'CDF')
    assert.equal(cdfFloat.balanceCache, 50_000n)
    assert.equal(await balanceOf(agent.walletId!), 1_000_00n, 'the USD float is untouched')
  })

  test('float goes back to the personal wallet, then the agent can be terminated', async ({
    client,
    assert,
  }) => {
    const suffix = suffixOf()
    const { agent, agentUser, personal } = await setUp(suffix)

    await assert.rejects(
      () => AgentLifecycleService.deactivate(agent.id, adminId, 'leaving', `af-${suffix}`),
      /non-zero float/
    )

    const me = await client.get('/api/v1/agent/me').loginAs(agentUser)
    assert.isTrue((me.body() as any).data.capabilities.can_withdraw_float)

    const withdrawn = await client.post('/api/v1/agents/float-withdraw').loginAs(agentUser).json({
      amount: '100000',
      currency_code: 'USD',
      pin: '1111',
      idempotency_key: randomUUID(),
    })
    withdrawn.assertStatus(201)
    assert.equal(await balanceOf(personal.id), 1_000_00n)
    assert.equal(await balanceOf(agent.walletId!), 0n)

    await AgentLifecycleService.deactivate(agent.id, adminId, 'leaving', `af-${suffix}`)
    const terminated = await Agent.findOrFail(agent.id)
    assert.equal(terminated.status, 'terminated')
    assert.equal((await Wallet.findOrFail(agent.walletId!)).status, 'closed')
  })

  test('a float transfer is attributed to the sending agent', async ({ assert }) => {
    const suffix = suffixOf()
    const { agent } = await setUp(suffix)
    const childUser = await User.create({
      fullName: `Child ${suffix}`,
      email: `fchild${suffix}@example.test`,
      password: 'a-real-password',
    })
    const child = await AgentOnboardingService.create({
      userId: childUser.id,
      fullName: `Child ${suffix}`,
      email: `fchild${suffix}@example.test`,
      phone: '+243900000013',
      tier: 'distributor',
      parentAgentId: agent.id,
      correlationId: `af-${suffix}`,
    })
    await db.from('agents').where('id', child.id).update({ status: 'active' })

    const txn = await FloatTransferService.initiate({
      fromAgentId: agent.id,
      toAgentId: child.id,
      amount: new Money(40_00n, 'USD'),
      correlationId: `af-${suffix}`,
    })

    assert.equal(txn.initiatedByType, 'agent')
    assert.equal(txn.initiatedById, agent.id)
    assert.equal(await balanceOf(child.walletId!), 40_00n)
    const audit = await db
      .from('audit_logs')
      .where('resource_id', txn.id)
      .where('action', 'transaction.float_transfer.initiated')
      .first()
    assert.equal(audit?.actor_type, 'agent')
    assert.equal(Number(audit?.actor_id), agent.id)
  })
})
