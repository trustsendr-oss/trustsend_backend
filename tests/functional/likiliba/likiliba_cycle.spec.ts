import { test } from '@japa/runner'
import { randomInt, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import InternalUser from '#models/internal_user'
import KycVerification from '#models/kyc_verification'
import Likiliba from '#models/likiliba'
import LikilibaContribution from '#models/likiliba_contribution'
import LikilibaDebt from '#models/likiliba_debt'
import LikilibaMember from '#models/likiliba_member'
import LikilibaPenalty from '#models/likiliba_penalty'
import LikilibaRound from '#models/likiliba_round'
import User from '#models/user'
import { PinService } from '#services/security/pin_service'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import { LikilibaService, type LikilibaSettings } from '#services/likiliba/likiliba_service'
import { LikilibaInvitationService } from '#services/likiliba/invitation_service'
import { LikilibaMembershipService } from '#services/likiliba/membership_service'
import { LikilibaContributionService } from '#services/likiliba/contribution_service'
import { LikilibaDebtService } from '#services/likiliba/debt_service'
import { LikilibaPenaltyService } from '#services/likiliba/penalty_service'
import { LikilibaCycleService } from '#services/likiliba/cycle_service'
import {
  LikilibaAdminService,
  LikilibaReconciliationService,
} from '#services/likiliba/admin_service'
import { LikilibaRules } from '#services/likiliba/rules'
import { LikilibaLedger } from '#services/likiliba/likiliba_ledger'

/**
 * Likiliba, end to end against the real ledger.
 *
 * What these pin: money only ever moves through balanced ledger transactions; the pot pays a
 * round in full or not at all; a missing share is covered by cautions (or makes the round wait),
 * never by a partial payout; penalties are charged once per day, capped, and paid to the round's
 * beneficiary; and every step leaves a trace — group history, audit log, notification.
 */
test.group('Likiliba cycle', (group) => {
  let reviewerId = 0
  const cid = () => `test-likiliba-${randomUUID()}`

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `lkb-admin-${randomUUID()}@example.test`,
      fullName: 'Likiliba Reviewer',
      password: 'a-real-password',
      status: 'active',
    })
    reviewerId = admin.id
  })

  /** A verified customer holding `amount` in a primary wallet of `currency`. */
  async function person(currency: 'CDF' | 'USD', amount: bigint, name: string) {
    const user = await User.create({
      fullName: name,
      email: `lkb-${randomUUID()}@example.test`,
      password: 'a-real-password',
      code: String(randomInt(100_000_000, 1_000_000_000)),
      phone: `+2439${randomInt(10_000_000, 99_999_999)}`,
    })
    await PinService.setPin(user, '1234')
    const kyc = new KycVerification()
    kyc.subjectType = 'user'
    kyc.subjectId = user.id
    kyc.verificationType = 'document'
    kyc.status = 'approved'
    kyc.submittedAt = DateTime.now()
    kyc.decidedAt = DateTime.now()
    kyc.reviewedBy = reviewerId
    await kyc.save()
    const wallet = await UserOnboardingService.createDefaultWallet(user.id, currency, cid())
    await fund(wallet.id, amount)
    return { user, wallet }
  }

  /**
   * Tops a wallet up through the ledger itself — a balance written straight into balance_cache
   * would leave the wallet failing reconciliation, and these tests check that.
   */
  async function fund(walletId: number, amount: bigint) {
    if (amount <= 0n) return
    await db.transaction(async (trx) => {
      const wallet = await db.from('wallets').where('id', walletId).useTransaction(trx).first()
      const { LedgerService } = await import('#services/ledger/ledger_service')
      const { Money } = await import('#services/money/money')
      const source = await LedgerService.getOrCreatePlatformAccount(
        `TEST_FUNDING.${wallet.currency_code}`,
        'Test funding',
        wallet.currency_code,
        trx,
        'equity'
      )
      await LedgerService.postTransaction(
        'test_funding',
        [
          {
            accountId: source.id,
            direction: 'debit',
            amount: new Money(amount, wallet.currency_code),
          },
          {
            accountId: wallet.ledger_account_id,
            direction: 'credit',
            amount: new Money(amount, wallet.currency_code),
          },
        ],
        'system',
        0,
        { correlationId: cid(), trx }
      )
    })
  }

  async function balance(walletId: number) {
    return LikilibaLedger.balanceOf(walletId)
  }

  function settings(overrides: Partial<LikilibaSettings>): LikilibaSettings {
    return {
      name: 'Likiliba du quartier',
      currencyCode: 'USD',
      contributionAmount: 10_00n,
      frequency: 'monthly',
      size: 3,
      startsAt: DateTime.now().plus({ days: 3 }),
      cautionRequired: true,
      cautionMultiplier: 1,
      graceHours: 48,
      escalationDays: 7,
      penaltyMode: 'percent',
      penaltyDailyBps: 100,
      penaltyCapBps: 1000,
      orderingMode: 'draw',
      ...overrides,
    }
  }

  /** Builds a full group: organiser + invitees admitted, locked, signed, started. */
  async function startedGroup(
    currency: 'CDF' | 'USD',
    overrides: Partial<LikilibaSettings>,
    balances: bigint[],
    order?: (memberIds: { organiser: number; others: number[] }) => number[]
  ) {
    const people: Array<Awaited<ReturnType<typeof person>>> = []
    for (const [i, b] of balances.entries()) people.push(await person(currency, b, `Membre ${i}`))
    const [organiser, ...others] = people

    const created = await LikilibaService.create(
      organiser.user,
      settings({ currencyCode: currency, size: people.length, ...overrides }),
      cid()
    )
    for (const other of others) {
      const { invitation } = await LikilibaInvitationService.invite(
        organiser.user,
        created.id,
        { channel: 'account', userCode: other.user.code! },
        cid()
      )
      await LikilibaInvitationService.accept(other.user, invitation.id, cid())
      await LikilibaInvitationService.admit(organiser.user, invitation.id, cid())
    }

    const members = await LikilibaMember.query().where('likilibaId', created.id).orderBy('id')
    const memberOf = (u: User) => members.find((m) => m.userId === u.id)!
    const manual = order?.({
      organiser: memberOf(organiser.user).id,
      others: others.map((o) => memberOf(o.user).id),
    })
    await LikilibaService.lock(organiser.user, created.id, manual, cid())

    let likiliba = await Likiliba.findOrFail(created.id)
    const rules = (await LikilibaRules.current(likiliba))!
    for (const p of people) {
      await LikilibaMembershipService.commit(
        p.user,
        likiliba.id,
        { rulesHash: rules.rulesHash, autoDebit: false },
        cid()
      )
    }
    await LikilibaService.start(organiser.user, likiliba.id, cid())
    likiliba = await Likiliba.findOrFail(created.id)

    const byPosition = await LikilibaMember.query()
      .where('likilibaId', likiliba.id)
      .orderBy('position')
    const personOf = (m: LikilibaMember) => people.find((p) => p.user.id === m.userId)!
    return { likiliba, people, organiser, byPosition, personOf, memberOf }
  }

  async function tick(likilibaId: number, now: DateTime<true>) {
    await db.transaction((trx) => LikilibaCycleService.processGroup(likilibaId, now, trx))
  }

  async function roundStatus(likilibaId: number, n: number) {
    const r = await round(likilibaId, n)
    return r.status
  }

  async function groupStatus(likilibaId: number) {
    const likiliba = await Likiliba.findOrFail(likilibaId)
    return likiliba.status
  }

  async function round(likilibaId: number, n: number) {
    return LikilibaRound.query().where('likilibaId', likilibaId).where('number', n).firstOrFail()
  }

  async function payAllExcept(
    likiliba: Likiliba,
    people: Awaited<ReturnType<typeof person>>[],
    except: number[] = []
  ) {
    const current = await Likiliba.findOrFail(likiliba.id)
    const r = await round(likiliba.id, current.currentRoundNumber)
    for (const p of people) {
      const member = await LikilibaMember.query()
        .where('likilibaId', likiliba.id)
        .where('userId', p.user.id)
        .firstOrFail()
      if (member.id === r.beneficiaryMemberId || except.includes(p.user.id)) continue
      await LikilibaContributionService.pay(p.user, likiliba.id, cid())
    }
    return r
  }

  async function potMismatches(likilibaId: number) {
    const all = await LikilibaReconciliationService.checkPots()
    return all.filter((m) => m.likilibaId === likilibaId)
  }

  async function notificationTypes(likiliba: Likiliba) {
    const rows = await db
      .from('outbox_events')
      .where('aggregate_type', 'likiliba')
      .where('aggregate_id', likiliba.code)
      .select('payload')
    return rows.map((r: any) => r.payload.type as string)
  }

  /* ------------------------------------------------------------------------ */

  test('a full USD cycle with caution: every round paid in full, commission 1 %, cautions back', async ({
    assert,
  }) => {
    const { likiliba, people, byPosition, personOf } = await startedGroup('USD', {}, [
      100_00n,
      100_00n,
      100_00n,
    ])

    // Cautions locked at signature: 10.00 each.
    for (const m of byPosition) assert.equal(await balance(m.cautionWalletId!), 10_00n)
    const first = await round(likiliba.id, 1)
    const netted = await LikilibaContribution.query()
      .where('roundId', first.id)
      .where('status', 'netted')
    assert.lengthOf(netted, 1, "the beneficiary's own share is netted")

    for (let n = 1; n <= 3; n++) {
      const r = await payAllExcept(likiliba, people)
      // Not before the due date, even when complete.
      assert.equal(await roundStatus(likiliba.id, n), 'collecting')
      await tick(likiliba.id, r.dueAt.plus({ minutes: 1 }) as DateTime<true>)
      const paid = await round(likiliba.id, n)
      assert.equal(paid.status, 'paid_out')
      assert.equal(paid.grossAmount, 20_00n)
      assert.equal(paid.commissionAmount, 20n)
      assert.equal(paid.netAmount, 19_80n)
      assert.equal(await balance(likiliba.potWalletId!), 0n, 'the pot is empty after each payout')
    }

    const done = await Likiliba.findOrFail(likiliba.id)
    assert.equal(done.status, 'completed')
    // Each member: 100.00 − 2 contributions (20.00) + payout 19.80 = 99.80; caution released.
    for (const m of byPosition) {
      assert.equal(await balance(personOf(m).wallet.id), 99_80n)
      assert.equal(await balance(m.cautionWalletId!), 0n)
    }
    assert.lengthOf(await potMismatches(likiliba.id), 0)

    const types = await notificationTypes(likiliba)
    for (const t of [
      'locked',
      'rules_signed',
      'started',
      'round_opened',
      'contribution_confirmed',
      'payout_received',
      'caution_released',
      'completed',
    ]) {
      assert.include(types, `likiliba.${t}`)
    }
    const audit = await db
      .from('audit_logs')
      .where('resource_type', 'likiliba')
      .where('resource_id', String(likiliba.id))
    assert.isAbove(audit.length, 10)
  })

  test('a CDF default: caution covers, penalties accrue daily, debts withheld from the defaulter’s payout', async ({
    assert,
  }) => {
    // Contribution 1 000 FC. The defaulter keeps just enough for the caution.
    const C = 1_000_00n
    const { likiliba, people, byPosition, personOf } = await startedGroup(
      'CDF',
      { contributionAmount: C, orderingMode: 'manual' },
      [10_000_00n, C, 10_000_00n],
      ({ organiser, others }) => [others[1], others[0], organiser]
    )
    const defaulter = byPosition[1] // receives in round 2
    const beneficiary1 = byPosition[0]
    assert.equal(await balance(personOf(defaulter).wallet.id), 0n)

    const r1 = await payAllExcept(likiliba, people, [personOf(defaulter).user.id])
    // Past the grace period: the defaulter's own caution covers, the round pays.
    await tick(likiliba.id, r1.graceEndsAt.plus({ minutes: 5 }) as DateTime<true>)

    const covered = await LikilibaContribution.query()
      .where('roundId', r1.id)
      .where('memberId', defaulter.id)
      .firstOrFail()
    assert.equal(covered.status, 'covered')
    assert.equal(await balance(defaulter.cautionWalletId!), 0n)
    assert.equal(await roundStatus(likiliba.id, 1), 'paid_out')

    // Day 1 penalty: 1 % of 1 000 FC = 10 FC, owed to round 1's beneficiary — balance is zero.
    let penalties = await LikilibaPenalty.query()
      .where('contributionId', covered.id)
      .orderBy('dayNumber')
    assert.lengthOf(penalties, 1)
    assert.equal(penalties[0].amount, 10_00n)
    assert.equal(penalties[0].status, 'in_debt')
    assert.equal(penalties[0].beneficiaryMemberId, beneficiary1.id)

    // Three more days; the same pass run twice charges nothing more.
    const later = r1.graceEndsAt.plus({ days: 3, minutes: 5 }) as DateTime<true>
    await tick(likiliba.id, later)
    await tick(likiliba.id, later)
    penalties = await LikilibaPenalty.query()
      .where('contributionId', covered.id)
      .orderBy('dayNumber')
    assert.deepEqual(
      penalties.map((p) => p.dayNumber),
      [1, 2, 3, 4]
    )

    const listed = await LikilibaPenaltyService.listFor(likiliba, defaulter.id)
    assert.equal(listed[0].cumulative, 40_00n)
    assert.equal(listed[0].cap, 100_00n)

    // Round 2 is the defaulter's, a month later: by then the penalties reached their cap
    // (10 % = 100 FC, ten days). Their debts — 1 000 FC to their own caution + 100 FC of
    // penalties — are withheld from the payout, and their caution is restored.
    const r2 = await payAllExcept(likiliba, people)
    await tick(likiliba.id, r2.dueAt.plus({ minutes: 1 }) as DateTime<true>)
    const paid2 = await round(likiliba.id, 2)
    assert.equal(paid2.status, 'paid_out')
    assert.equal(paid2.grossAmount, 2n * C)
    assert.equal(paid2.commissionAmount, 20_00n)
    assert.equal(paid2.withheldAmount, C + 100_00n)
    assert.equal(paid2.netAmount, 2n * C - 20_00n - C - 100_00n)
    assert.equal(await balance(defaulter.cautionWalletId!), C, 'caution restored from the payout')
    const open = await LikilibaDebt.query()
      .where('debtorMemberId', defaulter.id)
      .where('status', 'open')
    assert.lengthOf(open, 0)
    const paidPenalties = await LikilibaPenalty.query()
      .where('contributionId', covered.id)
      .where('status', 'paid')
    assert.lengthOf(paidPenalties, 10)

    assert.lengthOf(await potMismatches(likiliba.id), 0)
    const types = await notificationTypes(likiliba)
    assert.include(types, 'likiliba.contribution_covered')
    assert.include(types, 'likiliba.penalty_assessed')
  })

  test('without caution, a missing share makes the round wait, then escalate; support resumes and the calendar shifts', async ({
    assert,
  }) => {
    const { likiliba, people, byPosition, personOf } = await startedGroup(
      'USD',
      {
        cautionRequired: false,
        cautionMultiplier: null,
        penaltyMode: 'fixed',
        penaltyFixedAmount: 10n,
        penaltyCapBps: 1000,
      },
      [50_00n, 50_00n]
    )
    const late = byPosition[1]
    const r1 = await round(likiliba.id, 1)

    await tick(likiliba.id, r1.graceEndsAt.plus({ minutes: 5 }) as DateTime<true>)
    assert.equal(await roundStatus(likiliba.id, 1), 'waiting_funds', 'no partial payout')

    // Fixed penalty 0.10 USD per day, paid straight to the waiting beneficiary.
    const penalties = await LikilibaPenalty.query().where('memberId', late.id)
    assert.lengthOf(penalties, 1)
    assert.equal(penalties[0].status, 'paid')
    assert.equal(await balance(personOf(byPosition[0]).wallet.id), 50_10n)

    await tick(likiliba.id, r1.graceEndsAt.plus({ days: 8 }) as DateTime<true>)
    assert.equal(await roundStatus(likiliba.id, 1), 'escalated')
    assert.equal(await groupStatus(likiliba.id), 'suspended')

    // Paying while suspended is allowed, but nothing is paid out until support resumes.
    await LikilibaContributionService.pay(personOf(late).user, likiliba.id, cid())
    assert.equal(await roundStatus(likiliba.id, 1), 'escalated')

    const { dueAt: before2 } = await round(likiliba.id, 2)
    await LikilibaAdminService.resume(reviewerId, likiliba.id, 'Le membre a régularisé.', cid())
    assert.equal(await groupStatus(likiliba.id), 'active')
    await tick(likiliba.id, r1.graceEndsAt.plus({ days: 8, hours: 1 }) as DateTime<true>)
    const paid = await round(likiliba.id, 1)
    assert.equal(paid.status, 'paid_out')
    assert.equal(paid.netAmount, 10_00n - 10n)
    const { dueAt: after2 } = await round(likiliba.id, 2)
    assert.isTrue(after2 > before2, 'later rounds shifted by the delay')
    assert.lengthOf(await potMismatches(likiliba.id), 0)
    void people
  })

  test('rules and roster: CDF/USD only, organiser never first, many invitations per person, leaving reopens', async ({
    assert,
  }) => {
    const organiser = await person('USD', 100_00n, 'Organisatrice')
    await assert.rejects(
      () => LikilibaService.create(organiser.user, settings({ currencyCode: 'BIF' }), cid()),
      /CDF or USD only/
    )
    await assert.rejects(
      () =>
        LikilibaService.create(
          organiser.user,
          settings({
            cautionRequired: false,
            cautionMultiplier: null,
            contributionAmount: 1_000_00n,
          }),
          cid()
        ),
      /without caution/
    )

    // One person, two groups: both invitations are listed, each answered on its own.
    const guest = await person('USD', 100_00n, 'Invitée')
    const g1 = await LikilibaService.create(organiser.user, settings({ name: 'Groupe A' }), cid())
    const other = await person('CDF', 0n, 'Autre organisateur')
    const g2 = await LikilibaService.create(
      other.user,
      settings({ name: 'Groupe B', currencyCode: 'CDF', contributionAmount: 5_000_00n }),
      cid()
    )
    const { invitation: i1 } = await LikilibaInvitationService.invite(
      organiser.user,
      g1.id,
      { channel: 'account', userCode: guest.user.code! },
      cid()
    )
    await LikilibaInvitationService.invite(
      other.user,
      g2.id,
      { channel: 'phone', phone: guest.user.phone! },
      cid()
    )
    const listed = await LikilibaInvitationService.listFor(guest.user)
    assert.sameMembers(
      listed.map((i) => i.likilibaId),
      [g1.id, g2.id]
    )
    await assert.rejects(
      () =>
        LikilibaInvitationService.invite(
          organiser.user,
          g1.id,
          { channel: 'account', userCode: guest.user.code! },
          cid()
        ),
      /already has an open invitation/
    )

    // Accepting the CDF group opens the guest's CDF wallet.
    const cdfInvitation = listed.find((i) => i.likilibaId === g2.id)!
    await LikilibaInvitationService.accept(guest.user, cdfInvitation.id, cid())
    const cdfWallet = await db
      .from('wallets')
      .where('user_id', guest.user.id)
      .where('currency_code', 'CDF')
      .where('purpose', 'primary')
      .first()
    assert.exists(cdfWallet)

    // An accepted invitation is not admission.
    await LikilibaInvitationService.accept(guest.user, i1.id, cid())
    await assert.rejects(
      () => LikilibaService.lock(organiser.user, g1.id, undefined, cid()),
      /needs 3 members/
    )

    // Manual order: the organiser cannot be first.
    const third = await person('USD', 100_00n, 'Troisième')
    const manual = await LikilibaService.create(
      organiser.user,
      settings({ orderingMode: 'manual', size: 2 }),
      cid()
    )
    const { invitation } = await LikilibaInvitationService.invite(
      organiser.user,
      manual.id,
      { channel: 'link' },
      cid()
    )
    await LikilibaInvitationService.accept(third.user, invitation.id, cid())
    await LikilibaInvitationService.admit(organiser.user, invitation.id, cid())
    const [orgMember, thirdMember] = await LikilibaMember.query()
      .where('likilibaId', manual.id)
      .orderBy('id')
    await assert.rejects(
      () => LikilibaService.lock(organiser.user, manual.id, [orgMember.id, thirdMember.id], cid()),
      /cannot place themselves first/
    )
    await LikilibaService.lock(organiser.user, manual.id, [thirdMember.id, orgMember.id], cid())

    // Signing locks the caution; leaving after the lock refunds it and reopens the roster.
    const locked = await Likiliba.findOrFail(manual.id)
    const rules = (await LikilibaRules.current(locked))!
    await assert.rejects(
      () =>
        LikilibaMembershipService.commit(
          third.user,
          manual.id,
          { rulesHash: 'x'.repeat(64), autoDebit: false },
          cid()
        ),
      /rules changed/
    )
    await LikilibaMembershipService.commit(
      third.user,
      manual.id,
      { rulesHash: rules.rulesHash, autoDebit: true },
      cid()
    )
    assert.equal(await balance(third.wallet.id), 90_00n)
    await LikilibaService.leave(third.user, manual.id, cid())
    assert.equal(await balance(third.wallet.id), 100_00n)
    assert.equal(await groupStatus(manual.id), 'recruiting')
    assert.lengthOf(await potMismatches(manual.id), 0)
  })

  test('repaying a covered contribution stops the penalties and restores the cautions', async ({
    assert,
  }) => {
    const C = 10_00n
    const { likiliba, people, byPosition, personOf } = await startedGroup(
      'USD',
      { orderingMode: 'manual' },
      [100_00n, C, 100_00n],
      ({ organiser, others }) => [others[1], organiser, others[0]]
    )
    const defaulter = byPosition[2] // receives last
    const r1 = await payAllExcept(likiliba, people, [personOf(defaulter).user.id])
    await tick(likiliba.id, r1.graceEndsAt.plus({ minutes: 5 }) as DateTime<true>)
    assert.equal(await LikilibaDebtService.totalOwedBy(defaulter.id), C + 10n)

    await fund(personOf(defaulter).wallet.id, 50_00n)
    await LikilibaDebtService.repay(personOf(defaulter).user, likiliba.id, cid())
    assert.equal(await LikilibaDebtService.totalOwedBy(defaulter.id), 0n)
    assert.equal(await balance(defaulter.cautionWalletId!), C)

    const { length: count } = await LikilibaPenalty.query().where('memberId', defaulter.id)
    await tick(likiliba.id, r1.graceEndsAt.plus({ days: 5 }) as DateTime<true>)
    assert.lengthOf(
      await LikilibaPenalty.query().where('memberId', defaulter.id),
      count,
      'no penalty once repaid'
    )
    assert.lengthOf(await potMismatches(likiliba.id), 0)
  })
})
