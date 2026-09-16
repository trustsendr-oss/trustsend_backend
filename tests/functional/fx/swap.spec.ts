import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import ExchangeRate from '#models/exchange_rate'
import FxQuote from '#models/fx_quote'
import Wallet from '#models/wallet'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import { createUserWithWallet, TEST_PIN } from '#tests/helpers/user_helper'

// The typed API client can't see through the controllers' union responses; tests read raw JSON.
const json = (res: { body(): unknown }) => res.body() as any

async function userWithUsdAndCdf(balance = 100000n) {
  const { user, wallet } = await createUserWithWallet({
    email: `fx-${randomUUID()}@test.com`,
    balance,
  })
  const cdf = await UserOnboardingService.createDefaultWallet(user.id, 'CDF', 'test')
  return { user, usd: wallet, cdf }
}

test.group('Currency swaps', (group) => {
  let previous: { manualRate: string | null; marginBps: number } | null = null

  // Deterministic rate: 1 USD = 2000 CDF, 1% margin. Restored afterwards.
  group.setup(async () => {
    const row = await ExchangeRate.find('CDF')
    previous = row ? { manualRate: row.manualRate, marginBps: row.marginBps } : null
    await ExchangeRate.updateOrCreate(
      { currencyCode: 'CDF' },
      { manualRate: '2000', marginBps: 100 }
    )
    return async () => {
      if (previous) {
        await ExchangeRate.updateOrCreate({ currencyCode: 'CDF' }, previous)
      } else {
        await ExchangeRate.query().where('currency_code', 'CDF').delete()
      }
    }
  })

  test('quotes then swaps USD to CDF with a balanced ledger', async ({ client, assert }) => {
    const { user, usd, cdf } = await userWithUsdAndCdf()

    const quoteRes = await client
      .post('/api/v1/swaps/quote')
      .loginAs(user)
      .json({ from_currency: 'USD', to_currency: 'CDF', amount: '1000' })

    assert.equal(quoteRes.status(), 201)
    const quote = json(quoteRes).data
    assert.equal(quote.amount_out, '1980000')
    assert.equal(quote.fee, '20000')
    assert.equal(quote.rate, '1980')
    assert.equal(quote.mid_rate, '2000')

    const swapRes = await client
      .post('/api/v1/swaps')
      .loginAs(user)
      .json({ quote_id: quote.quote_id, idempotency_key: randomUUID(), pin: TEST_PIN })

    assert.equal(swapRes.status(), 201)
    assert.equal(json(swapRes).data.status, 'completed')

    await usd.refresh()
    const cdfWallet = await Wallet.findOrFail(cdf.id)
    assert.equal(usd.balanceCache, 99000n)
    assert.equal(cdfWallet.balanceCache, 1980000n)

    const perCurrency = await db
      .from('ledger_entries')
      .where('ledger_transaction_id', json(swapRes).data.transaction_id)
      .select('currency_code')
      .select(
        db.raw("SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END)::text AS net")
      )
      .groupBy('currency_code')
    assert.lengthOf(perCurrency, 2)
    for (const row of perCurrency) assert.equal(row.net, '0')

    const reuse = await client
      .post('/api/v1/swaps')
      .loginAs(user)
      .json({ quote_id: quote.quote_id, idempotency_key: randomUUID(), pin: TEST_PIN })
    assert.equal(reuse.status(), 409)
    assert.equal(json(reuse).code, 'QUOTE_USED')
  })

  test('lists public mid rates against a base currency', async ({ client, assert }) => {
    const res = await client.get('/api/v1/exchange-rates').qs({ base: 'USD' })
    assert.equal(res.status(), 200)
    const cdf = json(res).data.find((r: { currency_code: string }) => r.currency_code === 'CDF')
    assert.equal(cdf.rate, '2000')
    assert.equal(cdf.source, 'manual')
  })

  test('refuses an expired quote', async ({ client, assert }) => {
    const { user } = await userWithUsdAndCdf()
    const quoteRes = await client
      .post('/api/v1/swaps/quote')
      .loginAs(user)
      .json({ from_currency: 'USD', to_currency: 'CDF', amount: '1000' })

    await FxQuote.query()
      .where('id', json(quoteRes).data.quote_id)
      .update({ expires_at: DateTime.now().minus({ minutes: 5 }).toJSDate() })

    const res = await client
      .post('/api/v1/swaps')
      .loginAs(user)
      .json({
        quote_id: json(quoteRes).data.quote_id,
        idempotency_key: randomUUID(),
        pin: TEST_PIN,
      })
    assert.equal(res.status(), 410)
    assert.equal(json(res).code, 'QUOTE_EXPIRED')
  })

  test('does not move money with a wrong PIN', async ({ client, assert }) => {
    const { user, usd } = await userWithUsdAndCdf()
    const quoteRes = await client
      .post('/api/v1/swaps/quote')
      .loginAs(user)
      .json({ from_currency: 'USD', to_currency: 'CDF', amount: '1000' })

    const res = await client
      .post('/api/v1/swaps')
      .loginAs(user)
      .json({ quote_id: json(quoteRes).data.quote_id, idempotency_key: randomUUID(), pin: '9999' })
    assert.equal(res.status(), 401)

    await usd.refresh()
    assert.equal(usd.balanceCache, 100000n)
  })

  test('rejects insufficient balance and identical currencies', async ({ client, assert }) => {
    const { user } = await userWithUsdAndCdf(500n)

    const poor = await client
      .post('/api/v1/swaps/quote')
      .loginAs(user)
      .json({ from_currency: 'USD', to_currency: 'CDF', amount: '1000' })
    assert.equal(poor.status(), 402)

    const same = await client
      .post('/api/v1/swaps/quote')
      .loginAs(user)
      .json({ from_currency: 'USD', to_currency: 'USD', amount: '100' })
    assert.equal(same.status(), 422)
  })
})
