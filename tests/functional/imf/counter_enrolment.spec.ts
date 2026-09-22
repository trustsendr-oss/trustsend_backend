import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import BusinessStaff from '#models/business_staff'
import InternalUser from '#models/internal_user'
import KycDocument from '#models/kyc_document'
import KycVerification from '#models/kyc_verification'
import User from '#models/user'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { AgentLifecycleService } from '#services/agents/agent_lifecycle_service'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import {
  CounterEnrolmentService,
  PhoneAlreadyEnrolledException,
} from '#services/counter/counter_enrolment_service'
import { TellerSessionService } from '#services/counter/teller_session_service'
import { CashInService } from '#services/transactions/cash_in_service'
import { PinService } from '#services/security/pin_service'
import { Money } from '#services/money/money'

/**
 * Enrolling the clientele an IMF actually serves: no smartphone, no e-mail, papers over the
 * counter.
 *
 * Three things are worth holding. The customer ends up an ordinary account with no owner — an
 * institution serves them, it does not possess them, which is what lets someone bank with two.
 * The PIN is theirs, because it is the only thing standing between their balance and the teller
 * processing their withdrawal. And the papers are recorded as PENDING: a teller collects evidence,
 * they do not rule on it.
 *
 * Nothing is torn down — see counter_cash.spec.ts for why an append-only ledger makes that
 * impossible once money has moved.
 */
test.group('Counter enrolment', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `enrol-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  async function setUp(suffix: string) {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTENR${suffix}`,
      name: `Institution ${suffix}`,
      email: `enr${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `enr-${suffix}`,
      kind: 'imf',
    })
    business.status = 'active'
    await business.save()

    const counter = await AgentOnboardingService.create({
      businessId: business.id,
      code: `2${suffix}`,
      fullName: `Counter ${suffix}`,
      email: `ctr${suffix}@example.test`,
      phone: '+243900000001',
      tier: 'distributor',
      correlationId: `enr-${suffix}`,
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
    await AgentLifecycleService.approve(counter.id, adminId, `enr-${suffix}`)
    await counter.refresh()
    await db.from('wallets').where('id', counter.walletId!).update({ balance_cache: 10_000_00n })

    const tellerUser = await User.create({
      fullName: `Teller ${suffix}`,
      email: `tl${suffix}@example.test`,
      password: 'a-real-password',
    })
    const teller = await BusinessStaff.create({
      businessId: business.id,
      userId: tellerUser.id,
      agentId: counter.id,
      role: 'teller',
      status: 'active',
    })

    return { business, counter, teller }
  }

  function papers() {
    return [
      {
        type: 'id_card_front' as const,
        buffer: Buffer.from('front-of-the-card'),
        mimeType: 'image/jpeg',
      },
      {
        type: 'id_card_back' as const,
        buffer: Buffer.from('back-of-the-card'),
        mimeType: 'image/jpeg',
      },
    ]
  }

  test('a walk-in gets an account with no address and no password', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await setUp(suffix)

    const { user, wallet } = await CounterEnrolmentService.enrol(
      teller,
      counter.id,
      {
        fullName: 'Mama Ngalula',
        phone: `+2439${suffix}`,
        pin: '4321',
        currencyCode: 'USD',
        documents: papers(),
        verificationType: 'identity',
      },
      `enr-${suffix}`
    )

    assert.isNull(user.email)
    assert.isNull(user.password)
    assert.match(user.code!, /^\d{9}$/)
    assert.equal(wallet.currencyCode, 'USD')
    assert.equal(wallet.purpose, 'primary')
  })

  test('the customer belongs to no institution', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await setUp(suffix)

    const { user } = await CounterEnrolmentService.enrol(
      teller,
      counter.id,
      {
        fullName: 'Papa Kabila',
        pin: '4321',
        currencyCode: 'USD',
        documents: papers(),
        verificationType: 'identity',
      },
      `enr-${suffix}`
    )

    // An institution serves them; it does not own them. Nothing on the row says otherwise, which
    // is what lets the same person bank with a second institution tomorrow.
    const columns = Object.keys(user.$attributes)
    assert.notInclude(columns, 'businessId')
  })

  test('the PIN is the customer own and opens their account', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await setUp(suffix)

    const { user } = await CounterEnrolmentService.enrol(
      teller,
      counter.id,
      {
        fullName: 'Maman Furaha',
        pin: '8765',
        currencyCode: 'USD',
        documents: papers(),
        verificationType: 'identity',
      },
      `enr-${suffix}`
    )

    const right = await PinService.verifyPin(user, '8765')
    assert.isTrue(right.valid)

    const wrong = await PinService.verifyPin(user, '0000')
    assert.isFalse(wrong.valid)
  })

  test('the papers are recorded as pending, never as approved', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await setUp(suffix)

    const { user, kycId } = await CounterEnrolmentService.enrol(
      teller,
      counter.id,
      {
        fullName: 'Papa Mwamba',
        pin: '4321',
        currencyCode: 'USD',
        documents: papers(),
        verificationType: 'identity',
      },
      `enr-${suffix}`
    )

    const kyc = await KycVerification.findOrFail(kycId)
    assert.equal(kyc.status, 'pending', 'a teller collects evidence, they do not rule on it')
    assert.equal(kyc.subjectType, 'user')
    assert.equal(kyc.subjectId, user.id)

    const documents = await KycDocument.query().where('kyc_verification_id', kycId)
    assert.lengthOf(documents, 2)
    assert.includeMembers(
      documents.map((d) => d.documentType),
      ['id_card_front', 'id_card_back']
    )
  })

  test('one phone number is enrolled once', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await setUp(suffix)
    const phone = `+2438${suffix}`

    const enrol = (fullName: string) =>
      CounterEnrolmentService.enrol(
        teller,
        counter.id,
        {
          fullName,
          phone,
          pin: '4321',
          currencyCode: 'USD',
          documents: papers(),
          verificationType: 'identity',
        },
        `enr-${suffix}`
      )

    await enrol('First Person')
    await assert.rejects(
      () => enrol('Second Person'),
      PhoneAlreadyEnrolledException.prototype.message
    )
  })

  test('someone enrolled at the window can be served at it straight away', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await setUp(suffix)

    const { user, wallet } = await CounterEnrolmentService.enrol(
      teller,
      counter.id,
      {
        fullName: 'Mama Solange',
        pin: '4321',
        currencyCode: 'USD',
        documents: papers(),
        verificationType: 'identity',
      },
      `enr-${suffix}`
    )

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 0n }],
      `enr-${suffix}`
    )

    const txn = await CashInService.initiate({
      agentId: counter.id,
      userWalletId: wallet.id,
      amount: new Money(30_00n, 'USD'),
      correlationId: `enr-${suffix}`,
    })
    await CashInService.confirm(txn.id, `enr-${suffix}`, counter.id)

    assert.equal(txn.tellerSessionId, session.id)
    await wallet.refresh()
    assert.isAbove(Number(wallet.balanceCache), 0)

    // And the account is still unreachable by password, which is the whole point of having none.
    assert.isFalse(await user.verifyPassword('anything-at-all'))
  })
})
