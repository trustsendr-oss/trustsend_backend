import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import BusinessStaff from '#models/business_staff'
import InternalUser from '#models/internal_user'
import KycVerification from '#models/kyc_verification'
import type TellerSession from '#models/teller_session'
import User from '#models/user'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { AgentLifecycleService } from '#services/agents/agent_lifecycle_service'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { TellerSessionService } from '#services/counter/teller_session_service'

/**
 * The shift control: open with a declared drawer, close against a physical count, signed off by
 * someone else.
 *
 * The case worth protecting hardest is the commission one. CashOutService hands the customer the
 * gross in notes but credits the counter's float only the net, so a shift reconciled against the
 * float would report a shortfall equal to the commission on every single shift — a control that
 * cries wolf daily is a control nobody reads. The variance here is computed from the gross that
 * crossed the counter, and one test exists purely to pin that down.
 */
test.group('Teller sessions', (group) => {
  const businessIds: number[] = []
  const businessCodes: string[] = []
  const userIds: number[] = []
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `session-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  group.teardown(async () => {
    await db.from('internal_users').where('id', adminId).delete()
  })

  group.each.teardown(async () => {
    const sessions = await db
      .from('teller_sessions')
      .whereIn('business_id', businessIds)
      .select('id')
    const sessionIds = sessions.map((s) => s.id)
    await db.from('ledger_transactions').whereIn('teller_session_id', sessionIds).delete()
    await db.from('teller_session_balances').whereIn('teller_session_id', sessionIds).delete()
    await db.from('teller_sessions').whereIn('id', sessionIds).delete()
    await db.from('business_staff').whereIn('business_id', businessIds).delete()

    const agents = await db.from('agents').whereIn('business_id', businessIds).select('id')
    const agentIds = agents.map((a) => a.id)
    const history = await db
      .from('agent_status_history')
      .whereIn('agent_id', agentIds)
      .distinct('agent_id')
    const frozen = new Set(history.map((h) => h.agent_id))
    const removable = agentIds.filter((id) => !frozen.has(id))
    await db.from('wallets').whereIn('agent_id', removable).delete()
    await db.from('agents').whereIn('id', removable).delete()

    const stillOwned = await db
      .from('agents')
      .whereIn('business_id', businessIds)
      .select('business_id')
    const kept = new Set(stillOwned.map((a) => a.business_id))
    const deletable = businessIds.filter((id) => !kept.has(id))
    for (const id of deletable) {
      await db.from('wallets').where('business_id', id).delete()
      await db
        .from('kyc_verifications')
        .where('subject_type', 'business')
        .where('subject_id', id)
        .delete()
    }
    for (const [i, code] of businessCodes.entries()) {
      if (deletable.includes(businessIds[i])) {
        await db.from('ledger_accounts').where('code', `BUSINESS_WALLET.${code}`).delete()
      }
    }
    await db.from('businesses').whereIn('id', deletable).delete()

    const linked = await db.from('agents').whereIn('user_id', userIds).select('user_id')
    const keptUsers = new Set(linked.map((a) => a.user_id))
    await db
      .from('users')
      .whereIn(
        'id',
        userIds.filter((id) => !keptUsers.has(id))
      )
      .delete()

    businessIds.length = 0
    businessCodes.length = 0
    userIds.length = 0
  })

  async function setUpCounter(suffix: string) {
    const code = `TESTSESS${suffix}`
    const { business } = await BusinessOnboardingService.create({
      code,
      name: `Institution ${suffix}`,
      email: `sess${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `sess-${suffix}`,
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
      email: `counter${suffix}@example.test`,
      phone: '+243900000001',
      tier: 'distributor',
      correlationId: `sess-${suffix}`,
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
    await AgentLifecycleService.approve(counter.id, adminId, `sess-${suffix}`)
    await counter.refresh()

    const makeStaff = async (label: string, role: 'teller' | 'branch_manager') => {
      const person = await User.create({
        fullName: `${label} ${suffix}`,
        email: `${label}${suffix}@example.test`,
        password: 'a-real-password',
      })
      userIds.push(person.id)
      return BusinessStaff.create({
        businessId: business.id,
        userId: person.id,
        agentId: role === 'teller' ? counter.id : null,
        role,
        status: 'active',
      })
    }

    return {
      business,
      counter,
      teller: await makeStaff('teller', 'teller'),
      manager: await makeStaff('manager', 'branch_manager'),
    }
  }

  /** Books a counter movement to a shift, exactly as the phase-2 cash routes will. */
  async function bookMovement(
    session: TellerSession,
    type: 'cash_in' | 'cash_out',
    amount: bigint,
    currencyCode = 'USD'
  ) {
    await db.table('ledger_transactions').insert({
      id: `TXN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      uuid: crypto.randomUUID(),
      type,
      status: 'completed',
      correlation_id: `sess-move-${Date.now()}`,
      initiated_by_type: 'agent',
      initiated_by_id: session.agentId,
      teller_session_id: session.id,
      amount: amount.toString(),
      currency_code: currencyCode,
      created_at: new Date(),
    })
  }

  test('a shift opens with what the teller says is in the drawer', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await setUpCounter(suffix)

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 500_00n }],
      `sess-${suffix}`
    )

    assert.equal(session.status, 'open')
    assert.equal(session.agentId, counter.id)
    assert.equal(session.staffId, teller.id)
    assert.lengthOf(session.balances, 1)
    assert.equal(session.balances[0].openingCash, 500_00n)
    assert.isNull(session.balances[0].countedCash)
  })

  test('a counter cannot have two drawers open at once', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller } = await setUpCounter(suffix)

    await TellerSessionService.open(teller, [{ currencyCode: 'USD', amount: 0n }], `s-${suffix}`)

    await assert.rejects(
      () => TellerSessionService.open(teller, [{ currencyCode: 'USD', amount: 0n }], `s-${suffix}`),
      /already has an open session/
    )
  })

  test('a currency the counter holds no float in is refused', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller } = await setUpCounter(suffix)

    await assert.rejects(
      () =>
        TellerSessionService.open(teller, [{ currencyCode: 'EUR', amount: 100n }], `s-${suffix}`),
      'This counter holds no EUR float'
    )
  })

  test('a balanced drawer closes with no variance', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller } = await setUpCounter(suffix)

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 500_00n }],
      `s-${suffix}`
    )
    await bookMovement(session, 'cash_in', 200_00n)
    await bookMovement(session, 'cash_out', 50_00n)

    const closed = await TellerSessionService.close(
      session,
      [{ currencyCode: 'USD', amount: 650_00n }],
      { correlationId: `s-${suffix}` }
    )

    assert.equal(closed.status, 'closed')
    assert.equal(closed.balances[0].expectedCash, 650_00n)
    assert.equal(closed.balances[0].variance, 0n)
  })

  test('a shortfall is reported as a negative variance', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller } = await setUpCounter(suffix)

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 100_00n }],
      `s-${suffix}`
    )
    await bookMovement(session, 'cash_in', 40_00n)

    // 140.00 expected, 100.00 counted: 40.00 is missing.
    const closed = await TellerSessionService.close(
      session,
      [{ currencyCode: 'USD', amount: 100_00n }],
      { correlationId: `s-${suffix}`, notes: 'Ecart constate a la fermeture' }
    )

    assert.equal(closed.balances[0].expectedCash, 140_00n)
    assert.equal(closed.balances[0].variance, -40_00n)
    assert.equal(closed.notes, 'Ecart constate a la fermeture')
  })

  test('commission on a cash-out does not become a phantom shortfall', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await setUpCounter(suffix)

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 1_000_00n }],
      `s-${suffix}`
    )

    // A 100.00 withdrawal: the customer is handed 100.00 in notes, while the float is credited
    // only the net of commission. Reconciling against the float would claim a shortfall equal to
    // that commission — the drawer is measured against the gross instead.
    await bookMovement(session, 'cash_out', 100_00n)

    const floatWallet = await db
      .from('wallets')
      .where('agent_id', counter.id)
      .where('currency_code', 'USD')
      .first()
    assert.isNotNull(floatWallet, 'the counter does hold a float we could have been tempted to use')

    const closed = await TellerSessionService.close(
      session,
      [{ currencyCode: 'USD', amount: 900_00n }],
      { correlationId: `s-${suffix}` }
    )

    assert.equal(closed.balances[0].expectedCash, 900_00n)
    assert.equal(closed.balances[0].variance, 0n, 'no phantom shortfall')
  })

  test('each currency is reconciled on its own', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, teller, counter } = await setUpCounter(suffix)

    // Give the counter a second float, as a DRC window would have.
    const account = await db
      .table('ledger_accounts')
      .insert({
        code: `AGENT_FLOAT.${counter.id}.CDF.${suffix}`,
        name: `CDF float ${counter.id}`,
        account_type: 'asset',
        owner_type: 'agent_wallet',
        currency_code: 'CDF',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('id')
    await db.table('wallets').insert({
      agent_id: counter.id,
      ledger_account_id: account[0].id ?? account[0],
      currency_code: 'CDF',
      balance_cache: 0,
      purpose: 'primary',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    })

    const session = await TellerSessionService.open(
      teller,
      [
        { currencyCode: 'USD', amount: 100_00n },
        { currencyCode: 'CDF', amount: 500_000n },
      ],
      `s-${suffix}`
    )
    await bookMovement(session, 'cash_in', 10_00n, 'USD')

    const closed = await TellerSessionService.close(
      session,
      [
        { currencyCode: 'USD', amount: 110_00n },
        { currencyCode: 'CDF', amount: 490_000n },
      ],
      { correlationId: `s-${suffix}` }
    )

    const byCurrency = new Map(closed.balances.map((b) => [b.currencyCode, b]))
    assert.equal(byCurrency.get('USD')!.variance, 0n)
    // A surplus in one drawer never offsets a shortfall in the other.
    assert.equal(byCurrency.get('CDF')!.variance, -10_000n)
    assert.equal(business.id, closed.businessId)
  })

  test('a teller cannot sign off their own shift', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller } = await setUpCounter(suffix)

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 0n }],
      `s-${suffix}`
    )
    await TellerSessionService.close(session, [{ currencyCode: 'USD', amount: 0n }], {
      correlationId: `s-${suffix}`,
    })

    await assert.rejects(
      () => TellerSessionService.reconcile(session, teller, { correlationId: `s-${suffix}` }),
      'A teller cannot sign off their own session'
    )
  })

  test('a second person signs it off', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, manager } = await setUpCounter(suffix)

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 0n }],
      `s-${suffix}`
    )
    await TellerSessionService.close(session, [{ currencyCode: 'USD', amount: 0n }], {
      correlationId: `s-${suffix}`,
    })

    const reconciled = await TellerSessionService.reconcile(session, manager, {
      correlationId: `s-${suffix}`,
      notes: 'Verifie, caisse conforme',
    })

    assert.equal(reconciled.status, 'reconciled')
    assert.equal(reconciled.reconciledBy, manager.id)
    assert.isNotNull(reconciled.reconciledAt)
  })

  test('an open shift cannot be signed off before it is counted', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, manager } = await setUpCounter(suffix)

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 0n }],
      `s-${suffix}`
    )

    await assert.rejects(
      () => TellerSessionService.reconcile(session, manager, { correlationId: `s-${suffix}` }),
      'A session in status "open" cannot be signed off'
    )
  })

  test('closing a shift twice is refused', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller } = await setUpCounter(suffix)

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 0n }],
      `s-${suffix}`
    )
    await TellerSessionService.close(session, [{ currencyCode: 'USD', amount: 0n }], {
      correlationId: `s-${suffix}`,
    })

    await assert.rejects(() =>
      TellerSessionService.close(session, [{ currencyCode: 'USD', amount: 999n }], {
        correlationId: `s-${suffix}`,
      })
    )
  })

  test('a closed shift frees the counter for the next one', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await setUpCounter(suffix)

    const first = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 0n }],
      `s-${suffix}`
    )
    await TellerSessionService.close(first, [{ currencyCode: 'USD', amount: 0n }], {
      correlationId: `s-${suffix}`,
    })

    const second = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 0n }],
      `s-${suffix}`
    )
    assert.notEqual(second.id, first.id)

    const current = await TellerSessionService.openSessionFor(counter.id)
    assert.equal(current!.id, second.id)
  })
})
