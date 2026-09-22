import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import BusinessStaff from '#models/business_staff'
import InternalUser from '#models/internal_user'
import User from '#models/user'
import { CryptoService } from '#services/security/crypto_service'
import { TotpService } from '#services/security/totp_service'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { FinancialProductService } from '#services/lending/financial_product_service'
import { LoanService } from '#services/lending/loan_service'
import { SavingsService } from '#services/savings/savings_service'
import { createUserWithWallet } from '#tests/helpers/user_helper'

const BASE_URL = `http://${env.get('HOST')}:${env.get('PORT')}/api/v1`

/**
 * TumaPlus oversight of what institutions lend and hold.
 *
 * The property worth pinning is what these routes do NOT offer. Whether a borrower gets credit is
 * the institution's decision, taken by its own credit officer; a back-office that could approve
 * would quietly move that judgement, and the liability with it, to TumaPlus. The last test asserts
 * no such route exists rather than trusting that nobody adds one.
 *
 * Staff sign-in goes through two factors, as the admin console does — the cookie plumbing mirrors
 * tests/functional/business/dashboard.spec.ts, which explains why raw fetch is used here.
 */
test.group('Admin lending oversight', (group) => {
  let session: { cookieHeader: string; csrfToken: string }

  function pair(headers: string[], name: string) {
    const header = headers.find((c) => c.startsWith(`${name}=`))
    if (!header) throw new Error(`Missing ${name} in Set-Cookie`)
    return header.split(';')[0]
  }

  function toSession(headers: string[]) {
    const access = pair(headers, 'internal_access_token')
    const csrf = pair(headers, 'internal_csrf_token')
    return {
      cookieHeader: `${access}; ${csrf}`,
      csrfToken: csrf.split('=').slice(1).join('='),
    }
  }

  async function call(path: string, method = 'GET', body?: unknown) {
    const headers: Record<string, string> = { Cookie: session.cookieHeader }
    if (method !== 'GET') headers['X-CSRF-Token'] = session.csrfToken
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json().catch(() => null)) as any }
  }

  group.setup(async () => {
    const email = `admin-lending-${Date.now()}@example.test`
    const secret = TotpService.generateSecret()
    await InternalUser.create({
      email,
      fullName: 'Oversight Staff',
      password: 'staffpass123',
      status: 'active',
      mustChangePassword: false,
      mfaEnabled: true,
      mfaSecretEncrypted: CryptoService.encrypt(secret),
    })

    const login = await fetch(`${BASE_URL}/internal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'staffpass123' }),
    })
    const pending = toSession(login.headers.getSetCookie())

    const verify = await fetch(`${BASE_URL}/internal/auth/mfa/verify`, {
      method: 'POST',
      headers: {
        'Cookie': pending.cookieHeader,
        'X-CSRF-Token': pending.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: TotpService.generate(secret) }),
    })
    session = toSession(verify.headers.getSetCookie())
  })

  async function institutionWithABook(suffix: string) {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTADL${suffix}`,
      name: `Institution ${suffix}`,
      email: `adl${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `adl-${suffix}`,
      kind: 'imf',
    })
    business.status = 'active'
    await business.save()
    await db
      .from('wallets')
      .where('business_id', business.id)
      .update({ balance_cache: '100000000' })

    const publish = async (kind: 'loan' | 'savings') => {
      const product = await FinancialProductService.create(
        business.id,
        {
          code: `${kind.toUpperCase()}${suffix}`,
          name: kind === 'loan' ? 'Credit commercant' : 'Epargne a vue',
          kind,
          currencyCode: 'USD',
          interestRateBps: kind === 'loan' ? 500 : 300,
          interestPeriod: kind === 'loan' ? 'month' : 'year',
          interestMethod: kind === 'loan' ? 'flat' : null,
          termMonthsMax: kind === 'loan' ? 6 : null,
        },
        `adl-${suffix}`
      )
      await FinancialProductService.submit(product, `adl-${suffix}`)
      // Approved by the staff account this group signed in as.
      const staff = await InternalUser.query().orderBy('id', 'desc').firstOrFail()
      await FinancialProductService.approve(product, staff.id, `adl-${suffix}`)
      return product
    }

    const credit = await publish('loan')
    const savings = await publish('savings')

    const officerUser = await User.create({
      fullName: `Officer ${suffix}`,
      email: `off-${randomUUID()}@example.test`,
      password: 'a-real-password',
    })
    const officer = await BusinessStaff.create({
      businessId: business.id,
      userId: officerUser.id,
      agentId: null,
      role: 'credit_officer',
      status: 'active',
    })

    const borrower = await createUserWithWallet({ email: `adl-${randomUUID()}@test.com` })
    const loan = await LoanService.request(borrower.user.id, credit.id, 1_000_00n, `adl-${suffix}`)
    await LoanService.approve(loan, officer, `adl-${suffix}`)
    await LoanService.disburse(loan, `adl-${suffix}`)
    await db.from('wallets').where('id', borrower.wallet.id).update({ balance_cache: '500000' })
    await LoanService.repay(loan, 216_67n, `adl-${suffix}`)

    const saver = await createUserWithWallet({
      email: `adl-${randomUUID()}@test.com`,
      balance: 1_000_00n,
    })
    await SavingsService.open(saver.user.id, savings.id, {
      initialAmount: 400_00n,
      correlationId: `adl-${suffix}`,
    })

    return { business, loan }
  }

  test('staff can list loans across every institution', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { loan } = await institutionWithABook(suffix)

    const res = await call('/admin/loans')
    assert.equal(res.status, 200)
    assert.include(
      res.body.data.map((l: { id: number }) => l.id),
      loan.id
    )
  })

  test('a loan opens with its schedule, payments and charges', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { loan } = await institutionWithABook(suffix)

    const res = await call(`/admin/loans/${loan.id}`)
    assert.equal(res.status, 200)

    const data = res.body.data
    assert.lengthOf(data.schedule, 6)
    assert.lengthOf(data.repayments, 1)
    // The split as recorded at the time, which is what answers a disputed balance.
    assert.equal(data.repayments[0].applied_to_interest, '5000')
    assert.equal(data.repayments[0].applied_to_principal, '16667')
    assert.equal(data.interest_method, 'flat')
  })

  test('savings are visible with the balance the saver owns', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business } = await institutionWithABook(suffix)

    const res = await call(`/admin/savings?provider_id=${business.id}`)
    assert.equal(res.status, 200)
    assert.lengthOf(res.body.data, 1)
    assert.equal(res.body.data[0].balance, '40000')
    assert.isTrue(res.body.data[0].withdrawable)
  })

  test('an institution position is available from the back-office', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business } = await institutionWithABook(suffix)

    const res = await call(`/admin/institutions/${business.id}/position`)
    assert.equal(res.status, 200)

    const data = res.body.data
    assert.equal(data.deposits.balance, '40000')
    assert.equal(data.loans.grossPortfolio, '83333')
    assert.isArray(data.quality)
    // bigints leave as digit strings, as everywhere else.
    assert.isString(data.cash.total)
  })

  test('the back-office cannot decide on credit', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { loan } = await institutionWithABook(suffix)

    // Asserted rather than assumed: the judgement belongs to the institution's credit officer,
    // and a route here would move it — with the liability — to the wrong party.
    for (const action of ['approve', 'reject', 'disburse']) {
      const res = await call(`/admin/loans/${loan.id}/${action}`, 'POST', {})
      assert.notEqual(res.status, 200, `/admin/loans/:id/${action} must not exist`)
    }
  })

  test('signed-out callers see nothing', async ({ assert }) => {
    const res = await fetch(`${BASE_URL}/admin/loans`)
    assert.notEqual(res.status, 200)
  })
})
