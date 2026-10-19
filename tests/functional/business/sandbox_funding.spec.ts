import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import env from '#start/env'
import Wallet from '#models/wallet'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { BusinessApiKeyService } from '#services/business/business_api_key_service'
import { CurrencyService } from '#services/money/currency_service'
import { MAX_SANDBOX_FUNDING_AMOUNT } from '#services/sandbox/sandbox_funding_service'

/** Unique per run — these tests write real rows and must not collide with a previous run's. */
const runId = Date.now().toString(36)

/** Onboards in sandbox mode, so the business is active straight away. */
async function sandboxBusinessWithKey(label: string) {
  env.set('APP_MODE', 'sandbox')
  const { business } = await BusinessOnboardingService.create({
    code: `sbf-${runId}-${label}`,
    name: `Sandbox Funding Biz ${label}`,
    email: `sbf-${runId}-${label}@biz.test`,
    phone: '260763456789',
    correlationId: 'debug',
  })
  const { apiKey } = await BusinessApiKeyService.generate(business.id, 1, 'debug')
  return { business, apiKey }
}

/** body() is typed as the union of every status the route can answer with; tests read the success shape. */
function dataOf(response: { text(): string }) {
  return JSON.parse(response.text()).data
}

async function usdBalance(businessId: number) {
  const wallet = await Wallet.query()
    .where('business_id', businessId)
    .where('currency_code', 'USD')
    .firstOrFail()
  return wallet.balanceCache
}

test.group('Sandbox wallet funding', (group) => {
  const originalMode = env.get('APP_MODE')
  group.each.teardown(() => env.set('APP_MODE', originalMode ?? 'production'))

  test('credits the wallet through the ledger and lists the transaction', async ({
    client,
    assert,
  }) => {
    const { business, apiKey } = await sandboxBusinessWithKey('credit')

    const response = await client
      .post('/api/v1/business/sandbox/fund')
      .header('Authorization', `Bearer ${apiKey}`)
      .json({ currency_code: 'USD', amount: '150000', idempotency_key: randomUUID() })

    assert.equal(response.status(), 201)
    assert.equal(dataOf(response).balance, '150000')
    assert.equal(await usdBalance(business.id), 150000n)

    const history = await client
      .get('/api/v1/business/transactions')
      .header('Authorization', `Bearer ${apiKey}`)
    assert.equal(history.body().data[0].type, 'sandbox_funding')
  })

  test('filters the transaction history by type, status, currency and search', async ({
    client,
    assert,
  }) => {
    const { apiKey } = await sandboxBusinessWithKey('filters')
    const funded = await client
      .post('/api/v1/business/sandbox/fund')
      .header('Authorization', `Bearer ${apiKey}`)
      .json({ currency_code: 'USD', amount: '2000', idempotency_key: randomUUID() })
    const transactionId = dataOf(funded).transaction_id as string

    const list = (params: Record<string, string>) =>
      client
        .get('/api/v1/business/transactions')
        .qs(params)
        .header('Authorization', `Bearer ${apiKey}`)

    const matching = await list({
      type: 'sandbox_funding',
      currency_code: 'usd',
      q: transactionId.slice(-6),
      date_from: new Date().toISOString().slice(0, 10),
    })
    assert.equal(matching.status(), 200)
    assert.equal(matching.body().meta.total, 1)
    assert.equal(matching.body().data[0].transaction_id, transactionId)

    assert.equal((await list({ type: 'mobile_money_payout' })).body().meta.total, 0)
    assert.equal((await list({ status: 'failed' })).body().meta.total, 0)
    assert.equal((await list({ q: 'no-such-transaction' })).body().meta.total, 0)
    assert.equal((await list({ date_from: 'not-a-date' })).status(), 400)
  })

  test('replaying the same idempotency key does not credit twice', async ({ client, assert }) => {
    const { business, apiKey } = await sandboxBusinessWithKey('replay')
    const body = { currency_code: 'USD', amount: '5000', idempotency_key: randomUUID() }

    const first = await client
      .post('/api/v1/business/sandbox/fund')
      .header('Authorization', `Bearer ${apiKey}`)
      .json(body)
    const second = await client
      .post('/api/v1/business/sandbox/fund')
      .header('Authorization', `Bearer ${apiKey}`)
      .json(body)

    assert.equal(second.status(), 201)
    assert.equal(dataOf(second).transaction_id, dataOf(first).transaction_id)
    assert.equal(await usdBalance(business.id), 5000n)
  })

  test('is unavailable outside the sandbox', async ({ client, assert }) => {
    const { business, apiKey } = await sandboxBusinessWithKey('prod')

    env.set('APP_MODE', 'production')
    const response = await client
      .post('/api/v1/business/sandbox/fund')
      .header('Authorization', `Bearer ${apiKey}`)
      .json({ currency_code: 'USD', amount: '5000', idempotency_key: randomUUID() })

    assert.equal(response.status(), 404)
    assert.equal(await usdBalance(business.id), 0n)
  })

  test('rejects an amount above the per-request ceiling', async ({ client, assert }) => {
    const { apiKey } = await sandboxBusinessWithKey('ceiling')

    const response = await client
      .post('/api/v1/business/sandbox/fund')
      .header('Authorization', `Bearer ${apiKey}`)
      .json({
        currency_code: 'USD',
        amount: (MAX_SANDBOX_FUNDING_AMOUNT + 1n).toString(),
        idempotency_key: randomUUID(),
      })

    assert.equal(response.status(), 422)
  })

  test('asks for a wallet to be created first when none exists in that currency', async ({
    client,
    assert,
  }) => {
    const activeCurrencies = await CurrencyService.listActive()
    const otherCurrency = activeCurrencies.find((c) => c.code !== 'USD')
    if (!otherCurrency)
      return assert.fail('Needs an active currency other than USD in the currencies table')

    const { apiKey } = await sandboxBusinessWithKey('nowallet')
    const response = await client
      .post('/api/v1/business/sandbox/fund')
      .header('Authorization', `Bearer ${apiKey}`)
      .json({ currency_code: otherCurrency.code, amount: '5000', idempotency_key: randomUUID() })

    assert.equal(response.status(), 404)
    assert.include(response.text(), 'POST /business/wallet')
  })
})
