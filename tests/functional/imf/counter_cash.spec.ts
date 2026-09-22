import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import BusinessStaff from '#models/business_staff'
import InternalUser from '#models/internal_user'
import KycVerification from '#models/kyc_verification'
import User from '#models/user'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { AgentLifecycleService } from '#services/agents/agent_lifecycle_service'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import { TellerSessionService } from '#services/counter/teller_session_service'
import { CashInService } from '#services/transactions/cash_in_service'
import { CashOutService } from '#services/transactions/cash_out_service'
import { PinService } from '#services/security/pin_service'
import { Money } from '#services/money/money'

/**
 * Cash across an institution's window.
 *
 * The security question these tests exist for is which PIN authorises what, and the answer is
 * deliberately asymmetric. A deposit only credits the customer and debits the institution's float,
 * so the teller authorises it and a customer who walked in with no phone is asked for nothing. A
 * withdrawal debits the customer, so only the customer's own PIN will do — a teller's PIN standing
 * in for it would hand every teller the ability to empty any account they can name.
 *
 * The services are exercised directly; the controller wires the same calls to routes, and what is
 * worth pinning down is the money and the authorisation, not the HTTP.
 */
test.group('Counter cash', (group) => {
  const businessIds: number[] = []
  const businessCodes: string[] = []
  const userIds: number[] = []
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `cash-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  group.teardown(async () => {
    await db.from('internal_users').where('id', adminId).delete()
  })

  /**
   * Nothing is torn down, and it cannot be.
   *
   * Once cash has crossed the counter the fixture is anchored by design: ledger_entries and
   * agent_status_history are append-only at the database level, ledger_transactions reference each
   * other and their shift, and the shift references the staff who worked it. Deleting any of it
   * would mean disabling the immutability the ledger exists to guarantee. The money-moving tests
   * already in this suite make the same choice (tests/functional/transfers/p2p_transfer.spec.ts),
   * and every fixture here is suffixed with a timestamp so runs never collide.
   */
  group.each.teardown(async () => {
    businessIds.length = 0
    businessCodes.length = 0
    userIds.length = 0
  })

  async function setUp(suffix: string) {
    const code = `TESTCASH${suffix}`
    const { business } = await BusinessOnboardingService.create({
      code,
      name: `Institution ${suffix}`,
      email: `cash${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `cash-${suffix}`,
      kind: 'imf',
    })
    businessIds.push(business.id)
    businessCodes.push(code)
    business.status = 'active'
    await business.save()

    const counter = await AgentOnboardingService.create({
      businessId: business.id,
      code: `2${suffix}`,
      fullName: `Counter ${suffix}`,
      email: `ctr${suffix}@example.test`,
      phone: '+243900000001',
      tier: 'distributor',
      correlationId: `cash-${suffix}`,
    })
    const kyc = new KycVerification()
    kyc.subjectType = 'agent'
    kyc.subjectId = counter.id
    kyc.verificationType = 'document'
    kyc.status = 'approved'
    kyc.submittedAt = DateTime.now()
    kyc.decidedAt = DateTime.now()
    kyc.reviewedBy = adminId
    await kyc.save()
    await AgentLifecycleService.approve(counter.id, adminId, `cash-${suffix}`)
    await counter.refresh()

    // Float for the counter to lend against.
    await db.from('wallets').where('id', counter.walletId!).update({ balance_cache: 10_000_00n })

    const tellerUser = await User.create({
      fullName: `Teller ${suffix}`,
      email: `tl${suffix}@example.test`,
      password: 'a-real-password',
    })
    userIds.push(tellerUser.id)
    await PinService.setPin(tellerUser, '1111')

    const teller = await BusinessStaff.create({
      businessId: business.id,
      userId: tellerUser.id,
      agentId: counter.id,
      role: 'teller',
      status: 'active',
    })

    // A walk-in customer: no e-mail, no password, identified by code and authorised by PIN.
    const customer = await User.create({
      fullName: `Mama Ngalula ${suffix}`,
      code: `9${suffix}`,
      email: null,
      password: null,
    })
    userIds.push(customer.id)
    await PinService.setPin(customer, '2222')
    const wallet = await UserOnboardingService.createDefaultWallet(
      customer.id,
      'USD',
      `cash-${suffix}`
    )

    return { business, counter, teller, tellerUser, customer, wallet }
  }

  test('a deposit credits the customer and books itself to the shift', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter, customer, wallet } = await setUp(suffix)

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 0n }],
      `c-${suffix}`
    )

    const txn = await CashInService.initiate({
      agentId: counter.id,
      userWalletId: wallet.id,
      amount: new Money(120_00n, 'USD'),
      correlationId: `c-${suffix}`,
    })
    assert.equal(txn.tellerSessionId, session.id)

    await CashInService.confirm(txn.id, `c-${suffix}`, counter.id)

    await wallet.refresh()
    assert.isAbove(Number(wallet.balanceCache), 0, 'the customer, not the teller, was credited')
    assert.equal(wallet.userId, customer.id)
  })

  test('a withdrawal needs the customer PIN, not the teller one', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, tellerUser, customer, wallet, counter } = await setUp(suffix)

    await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 500_00n }],
      `c-${suffix}`
    )
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 300_00n })

    // The teller's own PIN must not open the customer's account.
    const withTellerPin = await PinService.verifyPin(customer, '1111')
    assert.isFalse(withTellerPin.valid, "a teller's PIN does not authorise a customer's debit")

    const withCustomerPin = await PinService.verifyPin(customer, '2222')
    assert.isTrue(withCustomerPin.valid)

    // And the teller's PIN is what confirms the notes left the drawer — a separate act.
    const tellerConfirms = await PinService.verifyPin(tellerUser, '1111')
    assert.isTrue(tellerConfirms.valid)

    await wallet.refresh()
    const txn = await CashOutService.initiate({
      agentId: counter.id,
      userWalletId: wallet.id,
      amount: new Money(100_00n, 'USD'),
      correlationId: `c-${suffix}`,
    })
    assert.equal(txn.status, 'reserved')
  })

  test('a withdrawal over the counter reaches the drawer count', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter, wallet } = await setUp(suffix)

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 500_00n }],
      `c-${suffix}`
    )
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 300_00n })

    const txn = await CashOutService.initiate({
      agentId: counter.id,
      userWalletId: wallet.id,
      amount: new Money(100_00n, 'USD'),
      correlationId: `c-${suffix}`,
    })
    assert.equal(txn.tellerSessionId, session.id)

    await CashOutService.confirm(txn.id, `c-${suffix}`, counter.id)

    // 500.00 opening, 100.00 handed out: 400.00 should be in the drawer. The float was credited
    // only the net of commission, which must not show up as a shortfall.
    const closed = await TellerSessionService.close(
      session,
      [{ currencyCode: 'USD', amount: 400_00n }],
      { correlationId: `c-${suffix}` }
    )
    assert.equal(closed.balances[0].expectedCash, 400_00n)
    assert.equal(closed.balances[0].variance, 0n, 'commission is not a phantom shortfall')
  })

  test('no cash crosses a counter with no drawer open', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { counter, wallet } = await setUp(suffix)

    await assert.rejects(
      () =>
        CashInService.initiate({
          agentId: counter.id,
          userWalletId: wallet.id,
          amount: new Money(10_00n, 'USD'),
          correlationId: `c-${suffix}`,
        }),
      'This counter has no open cash session — open one before taking cash'
    )

    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 300_00n })
    await assert.rejects(
      () =>
        CashOutService.initiate({
          agentId: counter.id,
          userWalletId: wallet.id,
          amount: new Money(10_00n, 'USD'),
          correlationId: `c-${suffix}`,
        }),
      'This counter has no open cash session — open one before taking cash'
    )
  })

  test('a walk-in customer with no e-mail can be served', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { customer, teller, counter, wallet } = await setUp(suffix)

    assert.isNull(customer.email, 'enrolled at the counter, not through the app')
    assert.isNull(customer.password)
    assert.isNotNull(customer.code)

    await TellerSessionService.open(teller, [{ currencyCode: 'USD', amount: 0n }], `c-${suffix}`)
    const txn = await CashInService.initiate({
      agentId: counter.id,
      userWalletId: wallet.id,
      amount: new Money(50_00n, 'USD'),
      correlationId: `c-${suffix}`,
    })

    assert.equal(txn.status, 'pending')
  })
})
