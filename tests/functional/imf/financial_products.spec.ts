import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import FinancialProduct from '#models/financial_product'
import { FinancialProductService } from '#services/lending/financial_product_service'
import InternalUser from '#models/internal_user'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'

/**
 * The catalogue an institution sells from, and the review gate in front of it.
 *
 * Two things are worth pinning down. A product reaches borrowers inside TumaPlus's own app under
 * TumaPlus's name, so nothing may reach `active` without passing through review — every shortcut
 * around that is tested here. And a live product must stop being visible the moment its provider
 * stops being active, since yesterday's approval is not a licence to keep selling today.
 */
test.group('Financial product catalogue', (group) => {
  const businessIds: number[] = []
  const businessCodes: string[] = []
  // financial_products.reviewed_by is a real FK, so the reviewer has to exist.
  let REVIEWER = 0
  let reviewerId = 0

  group.setup(async () => {
    const reviewer = await InternalUser.create({
      email: `product-reviewer-${Date.now()}@example.test`,
      fullName: 'Product Reviewer',
      password: 'a-real-password',
      status: 'active',
    })
    reviewerId = reviewer.id
    REVIEWER = reviewer.id
  })

  group.teardown(async () => {
    await db.from('internal_users').where('id', reviewerId).delete()
  })

  group.each.teardown(async () => {
    await db.from('financial_products').whereIn('provider_id', businessIds).delete()
    for (const id of businessIds) {
      await db.from('wallets').where('business_id', id).delete()
    }
    for (const code of businessCodes) {
      await db.from('ledger_accounts').where('code', `BUSINESS_WALLET.${code}`).delete()
    }
    await db.from('businesses').whereIn('id', businessIds).delete()
    businessIds.length = 0
    businessCodes.length = 0
  })

  async function makeProvider(suffix: string) {
    const code = `TESTPROD${suffix}`
    const { business } = await BusinessOnboardingService.create({
      code,
      name: `Institution ${suffix}`,
      email: `prod${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `test-prod-${suffix}`,
      kind: 'imf',
    })
    businessIds.push(business.id)
    businessCodes.push(code)
    // Set directly rather than through BusinessLifecycleService.approve, which requires an
    // approved KYC first — that flow has its own tests, and this fixture only needs a provider
    // the catalogue will treat as active.
    business.status = 'active'
    await business.save()
    return business
  }

  function loanDraft(suffix: string) {
    return {
      code: `LOAN${suffix}`,
      name: 'Credit commercant',
      kind: 'loan' as const,
      currencyCode: 'USD',
      minAmount: 50_00n,
      maxAmount: 2_000_00n,
      interestRateBps: 500,
      interestPeriod: 'month' as const,
      interestMethod: 'flat' as const,
      termMonthsMin: 3,
      termMonthsMax: 12,
      feeFlat: 5_00n,
      feePercentBps: 100,
      mandatorySavingsBps: 1000,
    }
  }

  test('a product starts as a draft whatever the caller intends', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const provider = await makeProvider(suffix)

    const product = await FinancialProductService.create(
      provider.id,
      loanDraft(suffix),
      `test-${suffix}`
    )

    assert.equal(product.status, 'draft')
    assert.isFalse(product.isPublished)
  })

  test('a draft cannot be published without review', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const provider = await makeProvider(suffix)
    const product = await FinancialProductService.create(
      provider.id,
      loanDraft(suffix),
      `test-${suffix}`
    )

    await assert.rejects(
      () => FinancialProductService.approve(product, REVIEWER, `test-${suffix}`),
      'A product in status "draft" cannot be approved'
    )
    assert.equal(product.status, 'draft')
  })

  test('submit then approve publishes it, and records who allowed it', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const provider = await makeProvider(suffix)
    const product = await FinancialProductService.create(
      provider.id,
      loanDraft(suffix),
      `test-${suffix}`
    )

    await FinancialProductService.submit(product, `test-${suffix}`)
    assert.equal(product.status, 'pending_review')
    assert.isNotNull(product.submittedAt)

    await FinancialProductService.approve(product, REVIEWER, `test-${suffix}`)
    assert.equal(product.status, 'active')
    assert.equal(product.reviewedBy, REVIEWER)
    assert.isTrue(product.isPublished)
  })

  test('a rejection carries its reason back and reopens editing', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const provider = await makeProvider(suffix)
    const product = await FinancialProductService.create(
      provider.id,
      loanDraft(suffix),
      `test-${suffix}`
    )

    await FinancialProductService.submit(product, `test-${suffix}`)
    await FinancialProductService.reject(
      product,
      REVIEWER,
      'Taux mensuel trop eleve.',
      `t-${suffix}`
    )

    assert.equal(product.status, 'rejected')
    assert.equal(product.reviewNotes, 'Taux mensuel trop eleve.')

    // Editable again, and resubmitting clears the stale refusal.
    await FinancialProductService.update(product, { interestRateBps: 300 }, `t-${suffix}`)
    await FinancialProductService.submit(product, `t-${suffix}`)
    assert.equal(product.status, 'pending_review')
    assert.isNull(product.reviewNotes)
  })

  test('a live product cannot be edited behind borrowers backs', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const provider = await makeProvider(suffix)
    const product = await FinancialProductService.create(
      provider.id,
      loanDraft(suffix),
      `test-${suffix}`
    )
    await FinancialProductService.submit(product, `test-${suffix}`)
    await FinancialProductService.approve(product, REVIEWER, `test-${suffix}`)

    await assert.rejects(() =>
      FinancialProductService.update(product, { interestRateBps: 9000 }, `t-${suffix}`)
    )
    await product.refresh()
    assert.equal(product.interestRateBps, 500)
  })

  test('the catalogue shows published products only', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const provider = await makeProvider(suffix)

    const draft = await FinancialProductService.create(
      provider.id,
      { ...loanDraft(suffix), code: `DRAFT${suffix}` },
      `t-${suffix}`
    )
    const live = await FinancialProductService.create(
      provider.id,
      { ...loanDraft(suffix), code: `LIVE${suffix}` },
      `t-${suffix}`
    )
    await FinancialProductService.submit(live, `t-${suffix}`)
    await FinancialProductService.approve(live, REVIEWER, `t-${suffix}`)

    const published = await FinancialProductService.listPublished()
    const ids = published.map((p) => p.id)

    assert.include(ids, live.id)
    assert.notInclude(ids, draft.id)
  })

  test('suspending a provider pulls its products from the catalogue', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const provider = await makeProvider(suffix)
    const product = await FinancialProductService.create(
      provider.id,
      loanDraft(suffix),
      `t-${suffix}`
    )
    await FinancialProductService.submit(product, `t-${suffix}`)
    await FinancialProductService.approve(product, REVIEWER, `t-${suffix}`)

    const before = await FinancialProductService.listPublished()
    assert.include(
      before.map((p) => p.id),
      product.id
    )

    provider.status = 'suspended'
    await provider.save()

    // The product is still `active`; it is the provider that is not, and that is enough.
    await product.refresh()
    assert.equal(product.status, 'active')
    const after = await FinancialProductService.listPublished()
    assert.notInclude(
      after.map((p) => p.id),
      product.id
    )
  })

  test('a loan must say which interest method it charges', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const provider = await makeProvider(suffix)

    await assert.rejects(() =>
      FinancialProduct.create({
        providerId: provider.id,
        code: `BAD${suffix}`,
        name: 'Loan with no method',
        kind: 'loan',
        currencyCode: 'USD',
        interestRateBps: 500,
        interestPeriod: 'month',
        interestMethod: null,
        status: 'draft',
      })
    )
  })

  test('one code cannot be reused inside the same institution', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const provider = await makeProvider(suffix)
    await FinancialProductService.create(provider.id, loanDraft(suffix), `t-${suffix}`)

    await assert.rejects(() =>
      FinancialProductService.create(provider.id, loanDraft(suffix), `t-${suffix}`)
    )
  })
})
