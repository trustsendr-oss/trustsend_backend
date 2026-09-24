import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import Wallet from '#models/wallet'
import CryptoDepositAddress from '#models/crypto_deposit_address'
import LedgerTransaction from '#models/ledger_transaction'
import { CryptoDepositService } from '#services/crypto/crypto_deposit_service'
import { CryptoPayoutService } from '#services/crypto/crypto_payout_service'
import { createUserWithWallet, TEST_PIN } from '#tests/helpers/user_helper'

const json = (res: { body(): unknown }) => res.body() as any

test.group('Crypto Deposits & Payouts (Stablecoins)', () => {
  test('generates deposit address and credits wallet on incoming deposit', async ({ client, assert }) => {
    const { user, wallet } = await createUserWithWallet({
      email: `crypto-dep-${randomUUID()}@test.com`,
      balance: 0n,
    })

    // 1. Get deposit address
    const res = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({
        network: 'polygon',
        token_symbol: 'USDC',
        currency_code: 'USD',
      })

    assert.equal(res.status(), 200)
    const body = json(res).data
    assert.equal(body.network, 'polygon')
    assert.equal(body.token_symbol, 'USDC')
    assert.isTrue(body.address.startsWith('0x'))

    // 2. Simulate Alchemy deposit webhook / service deposit (50.00 USDC = 50_000_000 raw units with 6 decimals)
    const txHash = '0x' + randomUUID().replace(/-/g, '') + '0000'
    const depositTxn = await CryptoDepositService.processIncomingDeposit({
      network: 'polygon',
      tokenSymbol: 'USDC',
      toAddress: body.address,
      fromAddress: '0x1111111111111111111111111111111111111111',
      rawAmount: '50000000', // 50 USDC -> 5000 hundredths of USD ($50.00)
      txHash,
      blockNumber: 1234567,
      logIndex: 0,
    })

    assert.equal(depositTxn.status, 'completed')
    assert.equal(depositTxn.amount, 5000n)

    // Verify wallet balance updated
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 5000n)

    // 3. Idempotency test: reprocessing same txHash must be no-op and return same txn
    const replayTxn = await CryptoDepositService.processIncomingDeposit({
      network: 'polygon',
      tokenSymbol: 'USDC',
      toAddress: body.address,
      fromAddress: '0x1111111111111111111111111111111111111111',
      rawAmount: '50000000',
      txHash,
      logIndex: 0,
    })
    assert.equal(replayTxn.id, depositTxn.id)
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 5000n)
  })

  test('initiates crypto payout, debits wallet, and refunds on failure', async ({ client, assert }) => {
    const { user, wallet } = await createUserWithWallet({
      email: `crypto-out-${randomUUID()}@test.com`,
      balance: 10000n, // $100.00
    })

    const idempotencyKey = randomUUID()
    const destinationAddress = '0x2222222222222222222222222222222222222222'

    // 1. Initiate payout of $20.00 (2000 hundredths)
    const payoutRes = await client
      .post('/api/v1/crypto/payouts')
      .loginAs(user)
      .json({
        amount: '2000',
        currency_code: 'USD',
        network: 'base',
        token_symbol: 'USDC',
        destination_address: destinationAddress,
        pin: TEST_PIN,
        idempotency_key: idempotencyKey,
      })

    assert.equal(payoutRes.status(), 201)
    const data = json(payoutRes).data
    assert.equal(data.status, 'processing')
    assert.equal(data.amount, '2000')

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 8000n) // $80.00 left

    // 2. Complete payout
    const completedTxn = await CryptoPayoutService.completePayout(
      data.transaction_id,
      '0xabcde1234567890'
    )
    assert.equal(completedTxn.status, 'completed')

    // 3. Test failed payout refund scenario
    const failIdempotencyKey = randomUUID()
    const payout2Res = await client
      .post('/api/v1/crypto/payouts')
      .loginAs(user)
      .json({
        amount: '3000',
        currency_code: 'USD',
        network: 'base',
        token_symbol: 'USDC',
        destination_address: destinationAddress,
        pin: TEST_PIN,
        idempotency_key: failIdempotencyKey,
      })

    assert.equal(payout2Res.status(), 201)
    const data2 = json(payout2Res).data
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 5000n) // $50.00 left

    // Simulate blockchain broadcast failure & refund
    await CryptoPayoutService.failPayout(data2.transaction_id, 'Out of gas or reverted on-chain')
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 8000n) // Fully refunded to $80.00!
  })

  test('receives and processes Alchemy webhook HTTP request', async ({ client, assert }) => {
    const { user, wallet } = await createUserWithWallet({
      email: `crypto-hook-${randomUUID()}@test.com`,
      balance: 0n,
    })

    // 1. Get deposit address
    const addressRes = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({
        network: 'polygon',
        token_symbol: 'USDC',
        currency_code: 'USD',
      })
    const depositAddress = json(addressRes).data.address

    // 2. Post webhook event to /api/v1/webhooks/alchemy
    const txHash = '0x' + randomUUID().replace(/-/g, '') + 'ffff'
    const webhookPayload = {
      webhookId: 'wh_test_123',
      id: 'evt_test_123',
      createdAt: new Date().toISOString(),
      type: 'ADDRESS_ACTIVITY',
      event: {
        network: 'POLYGON',
        activity: [
          {
            from: '0x3333333333333333333333333333333333333333',
            to: depositAddress,
            value: 25.0,
            asset: 'USDC',
            category: 'erc20',
            hash: txHash,
            blockNum: '0x1234',
            rawContract: {
              rawValue: '25000000', // 25 USDC
              address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
              decimal: '6',
            },
          },
        ],
      },
    }

    const res = await client
      .post('/api/v1/webhooks/alchemy')
      .json(webhookPayload)

    assert.equal(res.status(), 200)
    assert.equal(json(res).status, 'success')
    assert.equal(json(res).processed_count, 1)

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 2500n) // $25.00 credited
  })
})
