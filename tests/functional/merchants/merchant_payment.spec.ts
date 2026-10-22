import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import Business from '#models/business'
import KycVerification from '#models/kyc_verification'
import Wallet from '#models/wallet'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { BusinessLifecycleService } from '#services/business/business_lifecycle_service'
import { BusinessApiKeyService } from '#services/business/business_api_key_service'
import { createUserWithWallet, TEST_PIN } from '#tests/helpers/user_helper'

/**
 * Merchant payments: a customer pays a business account by its six-digit payment code.
 * Free for the customer, 1 % kept out of the merchant's share. Fixtures carry a timestamp
 * suffix and nothing is torn down, as in the other functional suites.
 */
test.group('Merchant payments', () => {
  const suffixOf = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10)

  async function merchant(suffix: string, { approve = true } = {}) {
    const { business } = await BusinessOnboardingService.create({
      code: `mp-${suffix}`,
      name: `Boutique ${suffix}`,
      email: `mp${suffix}@biz.test`,
      phone: '260763456789',
      correlationId: `mp-${suffix}`,
    })
    if (approve) {
      const kyc = new KycVerification()
      kyc.subjectType = 'business'
      kyc.subjectId = business.id
      kyc.verificationType = 'document'
      kyc.status = 'approved'
      kyc.submittedAt = DateTime.now()
      kyc.decidedAt = DateTime.now()
      kyc.reviewedBy = 1
      await kyc.save()
      await BusinessLifecycleService.approve(business.id, 1, `mp-${suffix}`)
    }
    const fresh = await Business.findOrFail(business.id)
    const wallet = await Wallet.query()
      .where('business_id', business.id)
      .where('currency_code', 'USD')
      .firstOrFail()
    return { business: fresh, wallet }
  }

  const balanceOf = async (id: number) => {
    const wallet = await Wallet.findOrFail(id)
    return wallet.balanceCache
  }

  test('a merchant gets a six-digit payment code that resolves in the directory', async ({
    client,
    assert,
  }) => {
    const suffix = suffixOf()
    const { business } = await merchant(suffix)
    const { user } = await createUserWithWallet({ email: `mpc${suffix}@test.com`, balance: 0n })

    assert.match(business.paymentCode ?? '', /^\d{6}$/)
    const lookup = await client
      .get(`/api/v1/directory/merchants?code=${business.paymentCode}`)
      .loginAs(user)
    lookup.assertStatus(200)
    assert.equal((lookup.body() as any).data.name, business.name)
    assert.include((lookup.body() as any).data.currencies, 'USD')
    assert.equal((lookup.body() as any).data.customer_fee_percent, 0)
  })

  test('the customer pays the amount, the merchant receives it minus 1 %', async ({
    client,
    assert,
  }) => {
    const suffix = suffixOf()
    const { business, wallet: merchantWallet } = await merchant(suffix)
    const { user, wallet } = await createUserWithWallet({
      email: `mpp${suffix}@test.com`,
      balance: 200_00n,
    })
    const merchantBefore = await balanceOf(merchantWallet.id)
    const key = randomUUID()

    const paid = await client.post('/api/v1/merchant-payments').loginAs(user).json({
      merchant_code: business.paymentCode,
      amount: '10000',
      currency_code: 'USD',
      note: 'Table 4',
      pin: TEST_PIN,
      idempotency_key: key,
    })
    paid.assertStatus(201)
    assert.equal((paid.body() as any).data.fee, '0')

    assert.equal(await balanceOf(wallet.id), 100_00n, 'customer debited exactly the amount')
    assert.equal(
      (await balanceOf(merchantWallet.id)) - merchantBefore,
      99_00n,
      'merchant: 100 − 1 %'
    )

    // A retry with the same key pays once.
    const again = await client.post('/api/v1/merchant-payments').loginAs(user).json({
      merchant_code: business.paymentCode,
      amount: '10000',
      currency_code: 'USD',
      note: 'Table 4',
      pin: TEST_PIN,
      idempotency_key: key,
    })
    assert.equal(again.status(), 201)
    assert.equal(await balanceOf(wallet.id), 100_00n)

    // The merchant sees it, with the fee and the customer.
    const { apiKey } = await BusinessApiKeyService.generate(business.id, 1, `mp-${suffix}`)
    const listed = await client
      .get('/api/v1/business/merchant-payments')
      .header('Authorization', `Bearer ${apiKey}`)
    listed.assertStatus(200)
    const row = (listed.body() as any).data[0]
    assert.equal(row.amount, '10000')
    assert.equal(row.fee, '100')
    assert.equal(row.net_amount, '9900')
    assert.equal(row.note, 'Table 4')
  })

  test('only an approved merchant, in its currency, with the right PIN', async ({
    client,
    assert,
  }) => {
    const suffix = suffixOf()
    const pending = await merchant(`${suffix}p`.slice(-10), { approve: false })
    const { business } = await merchant(suffix)
    const { user } = await createUserWithWallet({
      email: `mpr${suffix}@test.com`,
      balance: 200_00n,
    })

    const unapproved = await client
      .get(`/api/v1/directory/merchants?code=${pending.business.paymentCode}`)
      .loginAs(user)
    unapproved.assertStatus(404)

    const pay = (body: Record<string, unknown>) =>
      client
        .post('/api/v1/merchant-payments')
        .loginAs(user)
        .json({
          merchant_code: business.paymentCode,
          amount: '1000',
          currency_code: 'USD',
          pin: TEST_PIN,
          idempotency_key: randomUUID(),
          ...body,
        })

    const toPending = await pay({ merchant_code: pending.business.paymentCode })
    toPending.assertStatus(404)
    assert.equal((toPending.body() as any).code, 'MERCHANT_NOT_FOUND')

    const wrongCurrency = await pay({ currency_code: 'BIF' })
    assert.include(
      ['SOURCE_WALLET_NOT_FOUND', 'MERCHANT_CURRENCY_UNSUPPORTED'],
      (wrongCurrency.body() as any).code
    )

    const wrongPin = await pay({ pin: '0000' })
    wrongPin.assertStatus(401)
  })
})
