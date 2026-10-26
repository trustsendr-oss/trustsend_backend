import { test } from '@japa/runner'
import env from '#start/env'
import { randomUUID } from 'node:crypto'
import { HDNodeWallet } from 'ethers'
import CryptoDeposit from '#models/crypto_deposit'
import KycVerification from '#models/kyc_verification'
import InternalUser from '#models/internal_user'
import CryptoDepositAddress from '#models/crypto_deposit_address'
import { AlchemyNotify, type AddressRegistrar } from '#services/crypto/alchemy_notify'
import { AlchemySignatureService } from '#services/crypto/alchemy_signature_service'
import { CryptoDepositService, type ChainReader } from '#services/crypto/crypto_deposit_service'
import { MAINNET_NETWORKS as NETWORKS, TESTNET_NETWORKS } from '#services/crypto/crypto_networks'
import { CryptoPayoutService } from '#services/crypto/crypto_payout_service'
import { CryptoTreasuryService } from '#services/crypto/crypto_treasury_service'
import type { PayoutSender } from '#services/crypto/hot_wallet'
import {
  CryptoReconciliationService,
  type TransferSource,
} from '#services/crypto/crypto_reconciliation_service'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import OutboxEvent from '#models/outbox_event'
import transmit from '@adonisjs/transmit/services/main'
import { handleCryptoDepositCompleted } from '#jobs/outbox_relay_job'
import { NotificationService } from '#services/notifications/notification_service'
import { renderEmailHtml } from '#services/notifications/email_templates'
import { createUserWithWallet, TEST_PIN } from '#tests/helpers/user_helper'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { CryptoAlerts } from '#services/crypto/crypto_alerts'
import Dispute from '#models/dispute'

const json = (res: { body(): unknown }) => res.body() as any

const POLYGON_USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'
const POLYGON_USDT = '0xc2132d05d31c914a87c6611c10748aeb04b58e8f'
const BSC_USDT = '0x55d398326f99059ff775485246999027b3197955'
const BSC_TESTNET_USDT = '0x337610d27c682e347c9cd60bd4b3b107c9d34ddd'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
/** Account xpub of Hardhat's public test mnemonic ("test test … junk"): reproducible, worthless. */
const TEST_XPUB =
  'xpub6Ce9NcJvTk36xtLSrJLZqE7wtgA5deCeYs7rSQtreh4cj6ByPtrg9sD7V2FNFLPnf8heNP3FGkeV9qwfzvZNSd54JoNXVsXFYSYwHsnJxqP'

const padTopic = (address: string) => `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`
const randomHash = () => `0x${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`

/** A node that knows exactly the transfers it is given, at the block height it is told. */
function fakeChain(head: number, receipts: Record<string, any>): ChainReader {
  return {
    getBlockNumber: async () => head,
    getTransactionReceipt: async (_network, txHash) => receipts[txHash] ?? null,
  }
}

function transferReceipt(params: {
  contract: string
  to: string
  raw: bigint
  block: number
  logIndex?: number
}) {
  return {
    status: '0x1',
    blockNumber: `0x${params.block.toString(16)}`,
    logs: [
      {
        address: params.contract,
        logIndex: `0x${(params.logIndex ?? 0).toString(16)}`,
        topics: [
          TRANSFER_TOPIC,
          padTopic('0x3333333333333333333333333333333333333333'),
          padTopic(params.to),
        ],
        data: `0x${params.raw.toString(16).padStart(64, '0')}`,
        removed: false,
      },
    ],
  }
}

/** An Alchemy address-activity event, shaped like the real payload (hex amounts, `toAddress`). */
function activityEvent(params: {
  network?: string
  contract: string
  to: string
  raw: bigint
  hash: string
  asset?: string
}) {
  return {
    webhookId: 'wh_test_polygon',
    id: `whevt_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    type: 'ADDRESS_ACTIVITY',
    event: {
      network: params.network ?? 'MATIC_MAINNET',
      activity: [
        {
          fromAddress: '0x3333333333333333333333333333333333333333',
          toAddress: params.to,
          blockNum: '0x3e8',
          hash: params.hash,
          value: Number(params.raw) / 1e6,
          asset: params.asset ?? 'USDC',
          category: 'token',
          rawContract: {
            rawValue: `0x${params.raw.toString(16)}`,
            address: params.contract,
            decimals: 6,
          },
          log: {
            address: params.contract,
            logIndex: '0x0',
            transactionHash: params.hash,
            removed: false,
          },
        },
      ],
    },
  }
}

/** `.json()` serialises with JSON.stringify, so the signed string is byte-for-byte the body sent. */
async function postSigned(client: any, payload: unknown, key = 'whsec_test_polygon') {
  return client
    .post('/api/v1/webhooks/alchemy')
    .header('x-alchemy-signature', AlchemySignatureService.sign(JSON.stringify(payload), key))
    .json(payload)
}

/**
 * Set at runtime rather than in .env.test: .env and .env.test are read concurrently, so a key
 * present (even empty) in .env may win over the test value.
 */
const TEST_ENV: Record<string, string> = {
  // Production unless a test says otherwise: never inherit the machine's APP_MODE.
  APP_MODE: 'production',
  CRYPTO_DEPOSIT_XPUB: TEST_XPUB,
  ALCHEMY_WEBHOOK_IDS: 'polygon=wh_test_polygon,ethereum=wh_test_ethereum,bsc=wh_test_bsc',
  ALCHEMY_WEBHOOK_SIGNING_KEY: 'whsec_test_polygon,whsec_test_ethereum',
}

test.group('Crypto deposits (stablecoins)', (group) => {
  group.setup(async () => {
    const previous = Object.fromEntries(
      Object.keys(TEST_ENV).map((key) => [key, env.get(key as any)])
    )
    for (const [key, value] of Object.entries(TEST_ENV)) env.set(key as any, value)
    // Amounts below are checked without a fee; the 1 % fee has its own test.
    const fee = await db.from('fee_schedules').where('operation_type', 'crypto_deposit').first()
    await db
      .from('fee_schedules')
      .where('operation_type', 'crypto_deposit')
      .update({ fee_percent: 0 })
    return async () => {
      for (const [key, value] of Object.entries(previous)) env.set(key as any, (value ?? '') as any)
      if (fee) {
        await db
          .from('fee_schedules')
          .where('operation_type', 'crypto_deposit')
          .update({ fee_percent: fee.fee_percent })
      }
    }
  })

  let registered: Array<{ network: string; webhookId: string; address: string }> = []
  const original = AlchemyNotify.registrar
  const recording: AddressRegistrar = async (network, webhookId, address) => {
    registered.push({ network, webhookId, address })
  }

  group.each.setup(() => {
    registered = []
    AlchemyNotify.registrar = recording
    return () => {
      AlchemyNotify.registrar = original
    }
  })

  test('issues a real, xpub-derived address and registers it with Alchemy', async ({
    client,
    assert,
  }) => {
    const { user } = await createUserWithWallet({
      email: `crypto-addr-${randomUUID()}@test.com`,
      balance: 0n,
    })

    const res = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'polygon', token_symbol: 'USDC' })
    assert.equal(res.status(), 200)
    const data = json(res).data

    const row = await CryptoDepositAddress.query().where('address', data.address).firstOrFail()
    const expected = HDNodeWallet.fromExtendedKey(TEST_XPUB)
      .deriveChild(0)
      .deriveChild(row.derivationIndex!)
    assert.equal(data.address, expected.address.toLowerCase())
    assert.equal(data.currency_code, 'USD')
    assert.equal(data.required_confirmations, NETWORKS.polygon.confirmations)
    assert.deepEqual(registered, [
      { network: 'polygon', webhookId: 'wh_test_polygon', address: data.address },
    ])

    // Same owner, other token or network: same key, so a wrong-chain transfer stays recoverable.
    const usdt = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'polygon', token_symbol: 'USDT' })
    const eth = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'ethereum', token_symbol: 'USDC' })
    assert.equal(json(usdt).data.address, data.address)
    assert.equal(json(eth).data.address, data.address)

    // Asking again returns the stored address without registering it twice.
    const again = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'polygon', token_symbol: 'USDC' })
    assert.equal(json(again).data.address, data.address)
    assert.lengthOf(registered, 3)
  })

  test('refuses networks nobody watches, foreign currencies and unwatched addresses', async ({
    client,
    assert,
  }) => {
    const { user } = await createUserWithWallet({
      email: `crypto-refuse-${randomUUID()}@test.com`,
      balance: 0n,
    })

    // Arbitrum has no webhook configured: offering it would swallow deposits.
    const unwatched = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'arbitrum', token_symbol: 'USDC' })
    assert.equal(unwatched.status(), 422)
    assert.equal(json(unwatched).code, 'CRYPTO_RAIL_UNAVAILABLE')

    const solana = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'solana', token_symbol: 'USDC' } as any)
    assert.equal(solana.status(), 422)

    const cdf = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'polygon', token_symbol: 'USDT', currency_code: 'CDF' })
    assert.equal(cdf.status(), 422)
    assert.equal(json(cdf).code, 'CRYPTO_CURRENCY_MISMATCH')

    // Alchemy refusing the address: nothing is handed out, nothing is stored.
    AlchemyNotify.registrar = async () => {
      throw new Error('HTTP 401')
    }
    const refused = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'polygon', token_symbol: 'USDC' })
    assert.equal(refused.status(), 503)
    assert.isNull(await CryptoDepositAddress.query().where('user_id', user.id).first())

    const options = await client.get('/api/v1/crypto/deposits/options').loginAs(user)
    const rails = json(options).data.map((rail: any) => `${rail.network}:${rail.token_symbol}`)
    assert.includeMembers(rails, [
      'polygon:USDC',
      'polygon:USDT',
      'ethereum:USDC',
      'ethereum:USDT',
      'ethereum:EURC',
    ])
    assert.notInclude(rails, 'arbitrum:USDC')
  })

  test('a deposit pays 1 %, and the app is told before sending', async ({ client, assert }) => {
    await db
      .from('fee_schedules')
      .where('operation_type', 'crypto_deposit')
      .update({ fee_percent: 1 })
    try {
      const { user, wallet } = await createUserWithWallet({
        email: `crypto-fee-${randomUUID()}@test.com`,
        balance: 0n,
      })
      const options = json(await client.get('/api/v1/crypto/deposits/options').loginAs(user)).data
      assert.isTrue(options.every((rail: any) => rail.fee_bps === 100))
      const address = json(
        await client
          .post('/api/v1/crypto/deposits/address')
          .loginAs(user)
          .json({ network: 'polygon', token_symbol: 'USDC' })
      ).data.address
      const hash = randomHash()
      await postSigned(
        client,
        activityEvent({ contract: POLYGON_USDC, to: address, raw: 25_000_000n, hash })
      )
      await CryptoDepositService.confirmPending(
        fakeChain(1000 + NETWORKS.polygon.confirmations, {
          [hash]: transferReceipt({
            contract: POLYGON_USDC,
            to: address,
            raw: 25_000_000n,
            block: 1000,
          }),
        })
      )
      await wallet.refresh()
      assert.equal(wallet.balanceCache, 2475n) // $25.00 − 1 % = $24.75
    } finally {
      await db
        .from('fee_schedules')
        .where('operation_type', 'crypto_deposit')
        .update({ fee_percent: 0 })
    }
  })

  test('the webhook only records; the chain decides when to credit', async ({ client, assert }) => {
    const { user, wallet } = await createUserWithWallet({
      email: `crypto-hook-${randomUUID()}@test.com`,
      balance: 0n,
    })
    const addressRes = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'polygon', token_symbol: 'USDC' })
    const address = json(addressRes).data.address
    const hash = randomHash()
    const event = activityEvent({ contract: POLYGON_USDC, to: address, raw: 25_000_000n, hash })

    // Unsigned or wrongly signed: refused.
    const unsigned = await client.post('/api/v1/webhooks/alchemy').json(event)
    assert.equal(unsigned.status(), 401)
    const forged = await postSigned(client, event, 'not-the-key')
    assert.equal(forged.status(), 401)

    const res = await postSigned(client, event)
    assert.equal(res.status(), 200)
    assert.equal(json(res).recorded_count, 1)
    // Replayed by Alchemy: still one deposit.
    await postSigned(client, event)
    const deposits = await CryptoDeposit.query().where('tx_hash', hash)
    assert.lengthOf(deposits, 1)
    assert.equal(deposits[0].status, 'pending')

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 0n)

    // Mined at block 1000, head at 1010: 11 confirmations, Polygon needs 64.
    const receipts = {
      [hash]: transferReceipt({
        contract: POLYGON_USDC,
        to: address,
        raw: 25_000_000n,
        block: 1000,
      }),
    }
    await CryptoDepositService.confirmPending(fakeChain(1010, receipts))
    await deposits[0].refresh()
    assert.equal(deposits[0].status, 'pending')
    assert.equal(deposits[0].confirmations, 11)
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 0n)

    await CryptoDepositService.confirmPending(
      fakeChain(1000 + NETWORKS.polygon.confirmations, receipts)
    )
    await deposits[0].refresh()
    assert.equal(deposits[0].status, 'credited')
    assert.isNotNull(deposits[0].ledgerTransactionId)
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 2500n) // $25.00

    // Running again changes nothing.
    await CryptoDepositService.confirmPending(fakeChain(5000, receipts))
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 2500n)

    const list = await client.get('/api/v1/crypto/deposits').loginAs(user)
    assert.equal(json(list).data[0].status, 'credited')
    assert.equal(json(list).data[0].amount, '2500')
  })

  test('never credits a token that only claims to be USDT, nor a transfer the chain contradicts', async ({
    client,
    assert,
  }) => {
    const { user, wallet } = await createUserWithWallet({
      email: `crypto-fake-${randomUUID()}@test.com`,
      balance: 0n,
    })
    const addressRes = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'polygon', token_symbol: 'USDT' })
    const address = json(addressRes).data.address

    // A contract anyone could deploy, named "USDT".
    const fake = activityEvent({
      contract: '0x9999999999999999999999999999999999999999',
      to: address,
      raw: 1_000_000_000n,
      hash: randomHash(),
      asset: 'USDT',
    })
    const ignored = await postSigned(client, fake)
    assert.equal(json(ignored).recorded_count, 0)

    // Testnets are ignored too.
    const testnet = await postSigned(
      client,
      activityEvent({
        network: 'MATIC_AMOY',
        contract: POLYGON_USDT,
        to: address,
        raw: 5_000_000n,
        hash: randomHash(),
      })
    )
    assert.equal(json(testnet).recorded_count, 0)

    // The webhook claims 900 USDT; the chain shows 9.
    const hash = randomHash()
    await postSigned(
      client,
      activityEvent({ contract: POLYGON_USDT, to: address, raw: 900_000_000n, hash, asset: 'USDT' })
    )
    const receipts = {
      [hash]: transferReceipt({ contract: POLYGON_USDT, to: address, raw: 9_000_000n, block: 10 }),
    }
    await CryptoDepositService.confirmPending(fakeChain(10_000, receipts))

    const deposit = await CryptoDeposit.query().where('tx_hash', hash).firstOrFail()
    assert.equal(deposit.status, 'rejected')
    assert.equal(deposit.rejectReason, 'log_mismatch')
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 0n)
  })

  test('USDT sent to an address issued for USDC still credits the dollar wallet', async ({
    client,
    assert,
  }) => {
    const { user, wallet } = await createUserWithWallet({
      email: `crypto-swap-${randomUUID()}@test.com`,
      balance: 0n,
    })
    const addressRes = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'polygon', token_symbol: 'USDC' })
    const address = json(addressRes).data.address

    const hash = randomHash()
    await postSigned(
      client,
      activityEvent({ contract: POLYGON_USDT, to: address, raw: 12_345_678n, hash, asset: 'USDT' })
    )
    const receipts = {
      [hash]: transferReceipt({ contract: POLYGON_USDT, to: address, raw: 12_345_678n, block: 1 }),
    }
    await CryptoDepositService.confirmPending(fakeChain(1_000, receipts))

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 1234n) // $12.34 — sub-cent dust stays on-chain
  })

  test('BSC USDT is read with its 18 decimals, whatever Alchemy calls the network', async ({
    client,
    assert,
  }) => {
    const { user, wallet } = await createUserWithWallet({
      email: `crypto-bsc-${randomUUID()}@test.com`,
      balance: 0n,
    })
    const addressRes = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'bsc', token_symbol: 'USDT' })
    assert.equal(addressRes.status(), 200)
    const address = json(addressRes).data.address
    assert.equal(json(addressRes).data.required_confirmations, NETWORKS.bsc.confirmations)
    assert.deepInclude(registered, { network: 'bsc', webhookId: 'wh_test_bsc', address })

    // 10.5 USDT on BSC = 10.5 × 10^18 base units → $10.50.
    const first = randomHash()
    const second = randomHash()
    const raw = 10_500_000_000_000_000_000n
    for (const [hash, name] of [
      [first, 'BNB_MAINNET'],
      [second, 'BSC_MAINNET'],
    ]) {
      const res = await postSigned(
        client,
        activityEvent({ network: name, contract: BSC_USDT, to: address, raw, hash, asset: 'USDT' })
      )
      assert.equal(json(res).recorded_count, 1)
    }

    const receipts = {
      [first]: transferReceipt({ contract: BSC_USDT, to: address, raw, block: 100 }),
      [second]: transferReceipt({ contract: BSC_USDT, to: address, raw, block: 101 }),
    }
    await CryptoDepositService.confirmPending(fakeChain(100 + NETWORKS.bsc.confirmations, receipts))

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 2100n) // 2 × $10.50

    const options = await client.get('/api/v1/crypto/deposits/options').loginAs(user)
    const rails = json(options).data.map((rail: any) => `${rail.network}:${rail.token_symbol}`)
    assert.includeMembers(rails, ['bsc:USDT', 'bsc:USDC'])
  })

  test('the sandbox credits testnet transfers only, and production ignores them', async ({
    client,
    assert,
  }) => {
    const { user, wallet } = await createUserWithWallet({
      email: `crypto-sbx-${randomUUID()}@test.com`,
      balance: 0n,
    })
    const previousMode = env.get('APP_MODE')
    env.set('APP_MODE', 'sandbox')
    try {
      const options = await client.get('/api/v1/crypto/deposits/options').loginAs(user)
      const rails = json(options).data
      // BSC Testnet carries the test USDT; Sepolia only Circle's test USDC.
      assert.deepInclude(rails, {
        network: 'bsc',
        token_symbol: 'USDT',
        currency_code: 'USD',
        required_confirmations: TESTNET_NETWORKS.bsc!.confirmations,
        testnet_name: 'Testnet',
        fee_bps: 0,
      })
      assert.notDeepInclude(
        rails.map((rail: any) => `${rail.network}:${rail.token_symbol}`),
        'ethereum:USDT'
      )

      const addressRes = await client
        .post('/api/v1/crypto/deposits/address')
        .loginAs(user)
        .json({ network: 'bsc', token_symbol: 'USDT' })
      assert.equal(addressRes.status(), 200)
      const address = json(addressRes).data.address
      assert.equal(json(addressRes).data.testnet_name, 'Testnet')

      // A mainnet event reaching the sandbox is not ours to credit.
      const mainnet = await postSigned(
        client,
        activityEvent({
          network: 'BNB_MAINNET',
          contract: BSC_USDT,
          to: address,
          raw: 10n ** 18n,
          hash: randomHash(),
        })
      )
      assert.equal(json(mainnet).status, 'ignored')

      const hash = randomHash()
      const raw = 25n * 10n ** 18n
      const recorded = await postSigned(
        client,
        activityEvent({
          network: 'BNB_TESTNET',
          contract: BSC_TESTNET_USDT,
          to: address,
          raw,
          hash,
          asset: 'USDT',
        })
      )
      assert.equal(json(recorded).recorded_count, 1)

      const receipts = {
        [hash]: transferReceipt({ contract: BSC_TESTNET_USDT, to: address, raw, block: 50 }),
      }
      await CryptoDepositService.confirmPending(
        fakeChain(50 + TESTNET_NETWORKS.bsc!.confirmations, receipts)
      )
      await wallet.refresh()
      assert.equal(wallet.balanceCache, 2500n)
    } finally {
      env.set('APP_MODE', previousMode ?? 'production')
    }

    // Back in production, the very same testnet event is ignored.
    const again = await postSigned(
      client,
      activityEvent({
        network: 'BNB_TESTNET',
        contract: BSC_TESTNET_USDT,
        to: '0x0000000000000000000000000000000000000001',
        raw: 10n ** 18n,
        hash: randomHash(),
      })
    )
    assert.equal(json(again).status, 'ignored')
  })

  test('reconciliation records deposits no webhook reported, on any network, once', async ({
    client,
    assert,
  }) => {
    const { user, wallet } = await createUserWithWallet({
      email: `crypto-rec-${randomUUID()}@test.com`,
      balance: 0n,
    })
    const addressRes = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'polygon', token_symbol: 'USDT' })
    const address = json(addressRes).data.address

    // One deposit the webhook did deliver, one it missed, and one sent on BSC to an address
    // issued for Polygon — same key, so it is ours too.
    const delivered = randomHash()
    const missed = randomHash()
    const wrongNetwork = randomHash()
    await postSigned(
      client,
      activityEvent({
        contract: POLYGON_USDT,
        to: address,
        raw: 1_000_000n,
        hash: delivered,
        asset: 'USDT',
      })
    )

    const transfer = (hash: string, contract: string, raw: bigint, block: number) => ({
      uniqueId: `${hash}:log:0`,
      hash,
      blockNum: `0x${block.toString(16)}`,
      from: '0x3333333333333333333333333333333333333333',
      to: address,
      rawContract: { address: contract, value: `0x${raw.toString(16)}` },
      category: 'erc20',
    })
    const calls: Array<{ network: string; params: any }> = []
    const source: TransferSource = {
      getBlockNumber: async () => 5000,
      getAssetTransfers: async (network, params) => {
        calls.push({ network, params })
        if (params.toAddress !== address) return { transfers: [] }
        if (network === 'polygon') {
          return {
            transfers: [
              transfer(delivered, POLYGON_USDT, 1_000_000n, 10),
              transfer(missed, POLYGON_USDT, 7_000_000n, 11),
            ],
          }
        }
        if (network === 'bsc')
          return { transfers: [transfer(wrongNetwork, BSC_USDT, 2n * 10n ** 18n, 12)] }
        return { transfers: [] }
      },
    }

    const first = await CryptoReconciliationService.reconcile(source)
    assert.isAtLeast(first.missed, 2)
    assert.deepEqual(first.failedNetworks, [])
    // The contract filter is sent to Alchemy: only our stablecoins are listed.
    const polygonCall = calls.find(
      (call) => call.network === 'polygon' && call.params.toAddress === address
    )!
    assert.includeMembers(polygonCall.params.contractAddresses, [POLYGON_USDT])

    const ours = await CryptoDeposit.query().whereIn('tx_hash', [delivered, missed, wrongNetwork])
    assert.lengthOf(ours, 3) // the delivered one was not duplicated

    // Credited by the usual on-chain checks, the BSC one included.
    const receipts = {
      [delivered]: transferReceipt({
        contract: POLYGON_USDT,
        to: address,
        raw: 1_000_000n,
        block: 10,
      }),
      [missed]: transferReceipt({
        contract: POLYGON_USDT,
        to: address,
        raw: 7_000_000n,
        block: 11,
      }),
      [wrongNetwork]: transferReceipt({
        contract: BSC_USDT,
        to: address,
        raw: 2n * 10n ** 18n,
        block: 12,
      }),
    }
    await CryptoDepositService.confirmPending(fakeChain(5000, receipts))
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 1000n) // $1 + $7 + $2

    // A second pass finds nothing new, and resumes from the cursor minus the confirmation depth.
    calls.length = 0
    const second = await CryptoReconciliationService.reconcile(source)
    const resumed = calls.find(
      (call) => call.network === 'polygon' && call.params.toAddress === address
    )!
    assert.equal(
      resumed.params.fromBlock,
      `0x${(5000 - NETWORKS.polygon.confirmations).toString(16)}`
    )
    const afterSecond = await CryptoDeposit.query().whereIn('tx_hash', [
      delivered,
      missed,
      wrongNetwork,
    ])
    assert.lengthOf(afterSecond, 3)
    assert.isAtLeast(second.addresses, 1)
  })

  test('reconciliation skips stale addresses and keeps its cursor when a network fails', async ({
    client,
    assert,
  }) => {
    const { user } = await createUserWithWallet({
      email: `crypto-rec2-${randomUUID()}@test.com`,
      balance: 0n,
    })
    const addressRes = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'ethereum', token_symbol: 'USDC' })
    const address = json(addressRes).data.address
    await CryptoDepositAddress.query()
      .where('address', address)
      .update({ last_requested_at: DateTime.now().minus({ days: 30 }).toSQL() })

    await db
      .table('crypto_reconciliation_cursors')
      .insert({
        chain: 'ethereum:mainnet',
        last_block: 777,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict('chain')
      .merge({ last_block: 777, updated_at: new Date() })

    const asked: string[] = []
    const source: TransferSource = {
      getBlockNumber: async () => 9000,
      getAssetTransfers: async (network, params) => {
        asked.push(params.toAddress as string)
        if (network === 'ethereum') throw new Error('Alchemy unavailable')
        return { transfers: [] }
      },
    }
    const result = await CryptoReconciliationService.reconcile(source)

    assert.notInclude(asked, address) // shown 30 days ago: not re-scanned
    assert.include(result.failedNetworks, 'ethereum')
    const cursor = await db
      .from('crypto_reconciliation_cursors')
      .where('chain', 'ethereum:mainnet')
      .first()
    assert.equal(Number(cursor.last_block), 777) // the failed range is retried next tick
  })

  test('a credited deposit sends exactly one receipt e-mail', async ({ client, assert }) => {
    const { user } = await createUserWithWallet({
      email: `crypto-mail-${randomUUID()}@test.com`,
      balance: 0n,
    })
    const addressRes = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'polygon', token_symbol: 'USDT' })
    const address = json(addressRes).data.address
    const hash = randomHash()
    await postSigned(
      client,
      activityEvent({ contract: POLYGON_USDT, to: address, raw: 3_500_000n, hash, asset: 'USDT' })
    )
    const receipts = {
      [hash]: transferReceipt({ contract: POLYGON_USDT, to: address, raw: 3_500_000n, block: 1 }),
    }
    await CryptoDepositService.confirmPending(fakeChain(1000, receipts))

    const deposit = await CryptoDeposit.query().where('tx_hash', hash).firstOrFail()
    const events = await OutboxEvent.query()
      .where('aggregate_id', deposit.ledgerTransactionId!)
      .where('event_type', 'crypto_deposit.completed')
    assert.lengthOf(events, 1) // one event, one e-mail

    const sent: any[] = []
    const realSendEmail = NotificationService.sendEmail
    NotificationService.sendEmail = async (message) => {
      sent.push(message)
      return true
    }
    try {
      await handleCryptoDepositCompleted(events[0])
    } finally {
      NotificationService.sendEmail = realSendEmail
    }

    assert.lengthOf(sent, 1)
    assert.equal(sent[0].to, user.email)
    assert.equal(sent[0].template, 'crypto_deposit_completed')
    assert.include(sent[0].subject, 'Dépôt crypto crédité')
    assert.equal(sent[0].data.token, 'USDT')
    assert.equal(sent[0].data.network, 'Polygon')
    assert.equal(sent[0].data.tx_hash, hash)

    const html = renderEmailHtml('crypto_deposit_completed', sent[0].data, 'Reemite')
    assert.include(html, 'Dépôt crypto crédité')
    assert.include(html, hash)
  })

  test('the owner hears about the deposit live: pending, progress, credited, new balance', async ({
    client,
    assert,
  }) => {
    const { user } = await createUserWithWallet({
      email: `crypto-live-${randomUUID()}@test.com`,
      balance: 0n,
    })
    const addressRes = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'polygon', token_symbol: 'USDT' })
    const address = json(addressRes).data.address

    const heard: Array<{ channel: string; payload: any }> = []
    const stop = transmit.on('broadcast', (event) => {
      if (event.channel === `users/${user.id}`) heard.push(event)
    })
    try {
      const hash = randomHash()
      await postSigned(
        client,
        activityEvent({ contract: POLYGON_USDT, to: address, raw: 2_000_000n, hash, asset: 'USDT' })
      )
      const receipts = {
        [hash]: transferReceipt({
          contract: POLYGON_USDT,
          to: address,
          raw: 2_000_000n,
          block: 100,
        }),
      }
      await CryptoDepositService.confirmPending(fakeChain(110, receipts)) // 11 of 64: progress
      await CryptoDepositService.confirmPending(fakeChain(110, receipts)) // no change: silent
      await CryptoDepositService.confirmPending(
        fakeChain(100 + NETWORKS.polygon.confirmations, receipts)
      )
      await new Promise((resolve) => setImmediate(resolve))
    } finally {
      stop()
    }

    // The in-app notification of the credit is announced too; this test follows the deposit.
    const types = heard
      .filter((event) => event.payload.type !== 'notification.created')
      .map((event) => `${event.payload.type}:${event.payload.status ?? ''}`)
    assert.deepEqual(types.slice(0, 2), [
      'crypto_deposit.updated:pending', // recorded from the webhook
      'crypto_deposit.updated:pending', // 11 confirmations; the unchanged pass stays silent
    ])
    // Credited: the deposit itself, and the balance (announced by the ledger posting).
    assert.sameMembers(types.slice(2), ['crypto_deposit.updated:credited', 'wallet.updated:'])
    // Never the amount or the address: the app refetches through the REST routes.
    assert.notProperty(heard[0].payload, 'amount')
  })
})

test.group('Crypto withdrawals (reviewed by staff)', (group) => {
  let admin: InternalUser
  let previousFeePercent: unknown = null
  const previous: Record<string, unknown> = {}
  // Never the machine's real Alchemy settings: a deposit address requested here must not be
  // registered with a real webhook.
  const PAYOUT_ENV: Record<string, string> = {
    ...TEST_ENV,
    APP_MODE: 'production',
    CRYPTO_PAYOUT_NETWORKS: 'polygon,bsc',
    CRYPTO_PAYOUT_NETWORK_FEES: 'polygon=50,bsc=30',
    CRYPTO_PAYOUT_MIN_AMOUNT: '100',
    // Manual flow here: no hot wallet, whatever the machine's .env holds.
    CRYPTO_HOT_WALLET_PRIVATE_KEY: '',
  }

  group.setup(async () => {
    for (const [key, value] of Object.entries(PAYOUT_ENV)) {
      previous[key] = env.get(key as any)
      env.set(key as any, value)
    }
    const realRegistrar = AlchemyNotify.registrar
    AlchemyNotify.registrar = async () => {}
    // The 2 % withdrawal fee, whatever the test database holds.
    const fee = await db.from('fee_schedules').where('operation_type', 'crypto_payout').first()
    previousFeePercent = fee?.fee_percent ?? null
    await db
      .from('fee_schedules')
      .where('operation_type', 'crypto_payout')
      .update({ fee_percent: 2 })
    admin = await InternalUser.create({
      email: `crypto-payout-admin-${randomUUID()}@example.test`,
      fullName: 'Treasury reviewer',
      password: 'a-real-password',
      status: 'active',
      mustChangePassword: false,
      mfaEnabled: true,
    })
    return async () => {
      if (previousFeePercent !== null) {
        await db
          .from('fee_schedules')
          .where('operation_type', 'crypto_payout')
          .update({ fee_percent: previousFeePercent })
      }
      AlchemyNotify.registrar = realRegistrar
      for (const [key, value] of Object.entries(previous)) env.set(key as any, (value ?? '') as any)
    }
  })

  const asAdmin = (req: any) => req.withGuard('internal').loginAs(admin)
  const DESTINATION = '0x2222222222222222222222222222222222222222'

  /** A user whose identity is verified, with dollars to withdraw. */
  async function verifiedUser(balance: bigint) {
    const created = await createUserWithWallet({
      email: `crypto-out-${randomUUID()}@test.com`,
      balance,
    })
    const kyc = new KycVerification()
    kyc.subjectType = 'user'
    kyc.subjectId = created.user.id
    kyc.verificationType = 'document'
    kyc.status = 'approved'
    kyc.submittedAt = DateTime.now()
    kyc.decidedAt = DateTime.now()
    await kyc.save()
    return created
  }

  const request = (client: any, user: any, overrides: Record<string, unknown> = {}) =>
    client
      .post('/api/v1/crypto/payouts')
      .loginAs(user)
      .json({
        amount: '2000',
        network: 'polygon',
        token_symbol: 'USDT',
        destination_address: DESTINATION,
        pin: TEST_PIN,
        idempotency_key: randomUUID(),
        ...overrides,
      })

  test('requests are checked before any money moves', async ({ client, assert }) => {
    const { user, wallet } = await verifiedUser(10000n)

    const offered = await client.get('/api/v1/crypto/payouts/options').loginAs(user)
    const rails = json(offered).data.map(
      (rail: any) => `${rail.network}:${rail.token_symbol}:${rail.network_fee}`
    )
    assert.includeMembers(rails, ['polygon:USDT:50', 'bsc:USDT:30'])
    assert.notInclude(rails.join(' '), 'ethereum')
    assert.equal(json(offered).data[0].fee_bps, 200) // 2 %

    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ network: 'ethereum' }, 422, 'CRYPTO_PAYOUT_RAIL_UNAVAILABLE'], // not offered for withdrawals
      [{ amount: '50' }, 422, 'CRYPTO_PAYOUT_TOO_SMALL'],
      [
        {
          // A real checksummed address with one letter's case changed: a typo the checksum catches.
          destination_address: '0xf39fd6e51aad88F6F4ce6aB8827279cffFb92266',
        },
        422,
        'CRYPTO_PAYOUT_INVALID_ADDRESS',
      ],
      [{ amount: '99999' }, 422, 'INSUFFICIENT_FUNDS'],
    ]
    for (const [overrides, status, code] of cases) {
      const res = await request(client, user, overrides)
      assert.equal(res.status(), status, JSON.stringify(overrides))
      assert.equal(json(res).code, code, JSON.stringify(overrides))
    }

    // One of our own deposit addresses: a Reemite transfer does it for free.
    const deposit = await client
      .post('/api/v1/crypto/deposits/address')
      .loginAs(user)
      .json({ network: 'polygon', token_symbol: 'USDT' })
    assert.equal(deposit.status(), 200)
    const internal = await request(client, user, {
      destination_address: json(deposit).data.address,
    })
    assert.equal(json(internal).code, 'CRYPTO_PAYOUT_INTERNAL_ADDRESS')

    const { user: unverified } = await createUserWithWallet({
      email: `crypto-nokyc-${randomUUID()}@test.com`,
      balance: 10000n,
    })
    const noKyc = await request(client, unverified)
    assert.equal(noKyc.status(), 403)
    assert.equal(json(noKyc).code, 'KYC_REQUIRED')

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 10000n) // nothing debited by any refusal
  })

  test('reviewed, sent by staff, then completed only once the chain shows the transfer', async ({
    client,
    assert,
  }) => {
    const { user, wallet } = await verifiedUser(10000n)

    const heard: string[] = []
    const stop = transmit.on('broadcast', ({ channel, payload }) => {
      if (channel === `users/${user.id}` && (payload as any)?.type === 'crypto_payout.updated')
        heard.push((payload as any).status)
    })

    const res = await request(client, user)
    assert.equal(res.status(), 201)
    const payout = json(res).data
    assert.equal(payout.status, 'pending')
    assert.equal(payout.fee, '90') // 2 % of 20.00 (0.40) + the Polygon network fee (0.50)
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 10000n - 2090n)

    // In the review queue, not for users.
    const queue = await asAdmin(client.get('/api/v1/admin/crypto-payouts?status=pending'))
    assert.include(
      json(queue).data.map((row: any) => row.id),
      payout.id
    )
    const forbidden = await client.get('/api/v1/admin/crypto-payouts').loginAs(user)
    assert.isAtLeast(forbidden.status(), 401)

    const hash = randomHash()
    const sent = await asAdmin(client.post(`/api/v1/admin/crypto-payouts/${payout.id}/sent`)).json({
      tx_hash: hash,
    })
    assert.equal(sent.status(), 200)
    assert.equal(json(sent).data.status, 'processing')

    // The same transfer cannot settle another withdrawal.
    const other = json(await request(client, user, { amount: '1000' })).data
    const reused = await asAdmin(client.post(`/api/v1/admin/crypto-payouts/${other.id}/sent`)).json(
      { tx_hash: hash }
    )
    assert.equal(json(reused).code, 'TX_HASH_ALREADY_USED')

    // 20.00 USDT on Polygon = 20 000 000 base units (6 decimals), to the requested address.
    const receipts = {
      [hash]: transferReceipt({
        contract: POLYGON_USDT,
        to: DESTINATION,
        raw: 20_000_000n,
        block: 100,
      }),
    }
    await CryptoPayoutService.confirmSent(fakeChain(110, receipts))
    let row = json(await client.get(`/api/v1/crypto/payouts/${payout.id}`).loginAs(user)).data
    assert.equal(row.status, 'processing')
    assert.equal(row.confirmations, 11)

    await CryptoPayoutService.confirmSent(fakeChain(100 + NETWORKS.polygon.confirmations, receipts))
    row = json(await client.get(`/api/v1/crypto/payouts/${payout.id}`).loginAs(user)).data
    assert.equal(row.status, 'completed')
    assert.equal(row.tx_hash, hash)

    const emails = await OutboxEvent.query()
      .where('aggregate_id', payout.id)
      .where('event_type', 'crypto_payout.completed')
    assert.lengthOf(emails, 1)

    await new Promise((resolve) => setImmediate(resolve))
    stop()
    assert.includeMembers(heard, ['pending', 'processing', 'completed'])
  })

  test('a hash the chain contradicts waits for staff; refusing refunds everything, fees included', async ({
    client,
    assert,
  }) => {
    const { user, wallet } = await verifiedUser(10000n)
    const requested = await request(client, user, { network: 'bsc' })
    assert.equal(requested.status(), 201, JSON.stringify(json(requested)))
    const payout = json(requested).data
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 10000n - 2070n) // 2 % (0.40) + the BSC network fee (0.30)

    // Staff paste a hash whose transfer is 2 USDT instead of 20: never completed, never refunded alone.
    const hash = randomHash()
    await asAdmin(client.post(`/api/v1/admin/crypto-payouts/${payout.id}/sent`)).json({
      tx_hash: hash,
    })
    const receipts = {
      [hash]: transferReceipt({
        contract: BSC_USDT,
        to: DESTINATION,
        raw: 2n * 10n ** 18n,
        block: 1,
      }),
    }
    await CryptoPayoutService.confirmSent(fakeChain(1000, receipts))

    const attention = json(
      await asAdmin(client.get('/api/v1/admin/crypto-payouts?status=attention'))
    ).data
    const flagged = attention.find((row: any) => row.id === payout.id)
    assert.equal(flagged.verification_issue, 'transfer_mismatch')
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 10000n - 2070n) // 2 % (0.40) + the BSC network fee (0.30)

    const refused = await asAdmin(
      client.post(`/api/v1/admin/crypto-payouts/${payout.id}/reject`)
    ).json({
      reason: 'Montant envoyé incorrect, retrait annulé',
    })
    assert.equal(refused.status(), 200)
    assert.equal(json(refused).data.status, 'failed')
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 10000n) // amount and network fee back

    // A completed or refused withdrawal cannot be refused again.
    const again = await asAdmin(
      client.post(`/api/v1/admin/crypto-payouts/${payout.id}/reject`)
    ).json({
      reason: 'Deuxième tentative de remboursement',
    })
    assert.equal(json(again).code, 'CRYPTO_PAYOUT_STATE')
  })

  test('the treasury view compares each network balance with the withdrawals waiting', async ({
    client,
    assert,
  }) => {
    const { user } = await verifiedUser(10000n)
    await request(client, user, { amount: '3000' }) // 30.00 USDT waiting on Polygon

    const previousAddress = env.get('CRYPTO_TREASURY_ADDRESS')
    env.set('CRYPTO_TREASURY_ADDRESS', '0x000000000000000000000000000000000000dEaD')
    try {
      // Polygon: 0.5 POL (below the 1 POL default) and 10.00 USDT. BSC: plenty of both.
      const fakeNode = {
        callRpc: async (network: string, method: string) => {
          if (method === 'eth_getBalance')
            return network === 'polygon' ? '0x6f05b59d3b20000' : '0xde0b6b3a7640000'
          return network === 'polygon'
            ? `0x${10_000_000n.toString(16)}` // 10 USDT, 6 decimals
            : `0x${(10n ** 21n).toString(16)}` // 1000 USDT, 18 decimals
        },
      }
      const { address, networks } = await CryptoTreasuryService.balances(fakeNode as any)
      assert.equal(address, '0x000000000000000000000000000000000000dEaD')

      const polygon = networks.find((row) => row.network === 'polygon')!
      assert.isTrue(polygon.gas_low)
      assert.equal(polygon.gas_token, 'POL')
      const usdt = polygon.tokens.find((token) => token.token_symbol === 'USDT')!
      assert.equal(usdt.balance, '1000')
      assert.isAtLeast(Number(usdt.pending_withdrawals), 3000)
      assert.isTrue(usdt.short)

      const bsc = networks.find((row) => row.network === 'bsc')!
      assert.isFalse(bsc.gas_low)
      assert.isFalse(bsc.tokens.find((token) => token.token_symbol === 'USDT')!.short)

      const view = await client
        .get('/api/v1/admin/crypto-treasury')
        .withGuard('internal')
        .loginAs(admin)
      assert.equal(view.status(), 200)
    } finally {
      env.set('CRYPTO_TREASURY_ADDRESS', (previousAddress ?? '') as any)
    }
  })
})

test.group('Crypto withdrawals sent automatically (hot wallet)', (group) => {
  const previous: Record<string, unknown> = {}
  const AUTO_ENV: Record<string, string> = {
    ...TEST_ENV,
    APP_MODE: 'production',
    CRYPTO_PAYOUT_NETWORKS: 'polygon,bsc',
    CRYPTO_PAYOUT_NETWORK_FEES: 'polygon=0,bsc=0',
    CRYPTO_PAYOUT_MIN_AMOUNT: '100',
    // Hardhat's public test key: only proves a hot wallet is configured; tests use a fake sender.
    CRYPTO_HOT_WALLET_PRIVATE_KEY:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    CRYPTO_AUTO_PAYOUT_MAX: '20000',
    CRYPTO_AUTO_PAYOUT_USER_DAILY_MAX: '50000',
    CRYPTO_AUTO_PAYOUT_DAILY_MAX: '100000000',
    CRYPTO_ALERT_EMAILS: 'ops@example.test',
  }
  let admin: InternalUser

  group.setup(async () => {
    for (const [key, value] of Object.entries(AUTO_ENV)) {
      previous[key] = env.get(key as any)
      env.set(key as any, value)
    }
    admin = await InternalUser.create({
      email: `crypto-auto-admin-${randomUUID()}@example.test`,
      fullName: 'Treasury reviewer',
      password: 'a-real-password',
      status: 'active',
      mustChangePassword: false,
      mfaEnabled: true,
    })
    return () => {
      for (const [key, value] of Object.entries(previous)) env.set(key as any, (value ?? '') as any)
    }
  })

  const DESTINATION = '0x2222222222222222222222222222222222222222'

  // The test database outlives each run: automatic withdrawals left pending by earlier runs would
  // be sent first (oldest first) and change what each test observes. Each test starts alone.
  group.each.setup(async () => {
    await db
      .from('ledger_transactions')
      .where('type', 'crypto_payout')
      .where('status', 'pending')
      .update({ metadata: db.raw(`jsonb_set(metadata::jsonb, '{auto}', 'false')`) })
  })

  async function verifiedUser(balance: bigint) {
    const created = await createUserWithWallet({
      email: `crypto-auto-${randomUUID()}@test.com`,
      balance,
    })
    const kyc = new KycVerification()
    kyc.subjectType = 'user'
    kyc.subjectId = created.user.id
    kyc.verificationType = 'document'
    kyc.status = 'approved'
    kyc.submittedAt = DateTime.now()
    kyc.decidedAt = DateTime.now()
    await kyc.save()
    return created
  }

  const request = async (client: any, user: any, amount: string) => {
    const res = await client.post('/api/v1/crypto/payouts').loginAs(user).json({
      amount,
      network: 'polygon',
      token_symbol: 'USDT',
      destination_address: DESTINATION,
      pin: TEST_PIN,
      idempotency_key: randomUUID(),
    })
    return json(res).data
  }

  /** A hot wallet that signs on paper and records what it broadcasts. */
  function fakeHotWallet(options: { tokens?: bigint; failBroadcasts?: number } = {}) {
    const broadcasts: string[] = []
    // Each fake signs its own bytes, so a simulated failure never hits leftovers of earlier runs.
    const prefix = `0xraw${randomUUID().replace(/-/g, '')}`
    let signed = 0
    let failures = options.failBroadcasts ?? 0
    const sender: PayoutSender = {
      address: '0x1111111111111111111111111111111111111111',
      balances: async () => ({ token: options.tokens ?? 10n ** 12n, gas: 10n ** 18n }),
      sign: async () => {
        signed++
        return { hash: randomHash(), raw: `${prefix}${signed}` }
      },
      broadcast: async (_network, raw) => {
        broadcasts.push(raw)
        if (failures > 0 && raw.startsWith(prefix)) {
          failures--
          throw new Error('network unreachable')
        }
      },
    }
    return { sender, broadcasts, prefix, signedCount: () => signed }
  }

  test('a small withdrawal leaves the hot wallet alone, and completes once the chain confirms it', async ({
    client,
    assert,
  }) => {
    const { user } = await verifiedUser(100000n)
    const payout = await request(client, user, '2000')
    assert.isTrue(payout.auto)
    assert.equal(payout.status, 'pending')

    // Staff cannot send it too: that would pay twice.
    const manual = await client
      .post(`/api/v1/admin/crypto-payouts/${payout.id}/sent`)
      .withGuard('internal')
      .loginAs(admin)
      .json({ tx_hash: randomHash() })
    assert.equal(json(manual).code, 'CRYPTO_PAYOUT_AUTOMATIC')

    const hot = fakeHotWallet()
    const run = await CryptoPayoutService.processAutomatic(hot.sender)
    assert.isAtLeast(run.sent, 1)

    const sent = json(await client.get(`/api/v1/crypto/payouts/${payout.id}`).loginAs(user)).data
    assert.equal(sent.status, 'processing')
    assert.match(sent.tx_hash, /^0x[0-9a-f]{64}$/)

    // Running again sends nothing new for it.
    await CryptoPayoutService.processAutomatic(hot.sender)
    const after = json(await client.get(`/api/v1/crypto/payouts/${payout.id}`).loginAs(user)).data
    assert.equal(after.tx_hash, sent.tx_hash)

    const receipts = {
      [sent.tx_hash]: transferReceipt({
        contract: POLYGON_USDT,
        to: DESTINATION,
        raw: 20_000_000n,
        block: 5,
      }),
    }
    await CryptoPayoutService.confirmSent(fakeChain(5 + NETWORKS.polygon.confirmations, receipts))
    const done = json(await client.get(`/api/v1/crypto/payouts/${payout.id}`).loginAs(user)).data
    assert.equal(done.status, 'completed')
  })

  test('above the limits, the withdrawal waits for staff', async ({ client, assert }) => {
    const { user } = await verifiedUser(200000n)

    const large = await request(client, user, '25000') // $250 > $200
    assert.isFalse(large.auto)
    assert.equal(large.auto_reason, 'above_withdrawal_limit')

    const first = await request(client, user, '20000')
    const second = await request(client, user, '20000')
    const third = await request(client, user, '20000') // $600 over 24 h > $500
    assert.isTrue(first.auto)
    assert.isTrue(second.auto)
    assert.isFalse(third.auto)
    assert.equal(third.auto_reason, 'above_daily_limit')

    // Staff can send the ones that are theirs.
    const sent = await client
      .post(`/api/v1/admin/crypto-payouts/${large.id}/sent`)
      .withGuard('internal')
      .loginAs(admin)
      .json({ tx_hash: randomHash() })
    assert.equal(sent.status(), 200)
  })

  test('an empty hot wallet hands the withdrawal to staff instead of failing it', async ({
    client,
    assert,
  }) => {
    const { user } = await verifiedUser(100000n)
    const payout = await request(client, user, '3000')
    assert.isTrue(payout.auto)

    await CryptoPayoutService.processAutomatic(fakeHotWallet({ tokens: 0n }).sender)
    const row = json(await client.get(`/api/v1/crypto/payouts/${payout.id}`).loginAs(user)).data
    assert.equal(row.status, 'pending')
    assert.isFalse(row.auto)
    assert.equal(row.auto_reason, 'hot_wallet_insufficient')
  })

  test('a failed broadcast is retried with the very same transaction, never signed again', async ({
    client,
    assert,
  }) => {
    const { user } = await verifiedUser(100000n)
    const payout = await request(client, user, '1500')

    const hot = fakeHotWallet({ failBroadcasts: 1 })
    await CryptoPayoutService.processAutomatic(hot.sender)
    const recorded = json(
      await client.get(`/api/v1/crypto/payouts/${payout.id}`).loginAs(user)
    ).data
    assert.equal(recorded.status, 'processing') // hash committed before broadcasting
    const raw = hot.broadcasts.filter((item) => item.startsWith(hot.prefix)).at(-1)!
    await CryptoPayoutService.processAutomatic(hot.sender)
    // The same bytes broadcast again, not a newly signed transaction.
    assert.isAtLeast(hot.broadcasts.filter((item) => item === raw).length, 2)
    const again = json(await client.get(`/api/v1/crypto/payouts/${payout.id}`).loginAs(user)).data
    assert.equal(again.tx_hash, recorded.tx_hash)
  })

  test('signs of a taken-over account send the withdrawal to staff', async ({ client, assert }) => {
    // A PIN changed in the last 24 hours.
    const changed = await verifiedUser(100000n)
    await AuditLoggerService.record({
      actorType: 'user',
      actorId: changed.user.id,
      action: 'pin.changed',
      resourceType: 'user',
      resourceId: changed.user.id,
      correlationId: randomUUID(),
    })
    const afterPin = await request(client, changed.user, '1000')
    assert.isFalse(afterPin.auto)
    assert.equal(afterPin.auto_reason, 'recent_pin_change')

    // A new phone on an account that already had one.
    const moved = await verifiedUser(100000n)
    const now = new Date()
    await db.table('device_sessions').multiInsert([
      {
        user_id: moved.user.id,
        token_hash: randomUUID(),
        expires_at: new Date(Date.now() + 30 * 86400_000),
        created_at: new Date(Date.now() - 40 * 86400_000),
        updated_at: now,
      },
      {
        user_id: moved.user.id,
        token_hash: randomUUID(),
        expires_at: new Date(Date.now() + 30 * 86400_000),
        created_at: now,
        updated_at: now,
      },
    ])
    const afterPhone = await request(client, moved.user, '1000')
    assert.isFalse(afterPhone.auto)
    assert.equal(afterPhone.auto_reason, 'new_device')
  })

  test('the team is e-mailed when a withdrawal needs them, once', async ({ client, assert }) => {
    CryptoAlerts.reset()
    const sent: Array<{ to: string; subject: string; template: string }> = []
    const original = NotificationService.sendEmail
    NotificationService.sendEmail = async (email) => {
      sent.push(email)
      return true
    }
    try {
      const { user } = await verifiedUser(200000n)
      const large = await request(client, user, '25000')
      assert.isFalse(large.auto)
      await new Promise((resolve) => setTimeout(resolve, 50))
      const alerts = sent.filter((email) => email.template === 'ops_alert')
      assert.lengthOf(alerts, 1)
      assert.equal(alerts[0].to, 'ops@example.test')
      assert.include(alerts[0].subject, 'Retrait crypto à envoyer')

      // An empty hot wallet: one alert for the wallet, not one per withdrawal.
      sent.length = 0
      await request(client, user, '1000')
      await request(client, user, '1000')
      await CryptoPayoutService.processAutomatic(fakeHotWallet({ tokens: 0n }).sender)
      const empty = sent.filter((email) => email.subject.includes('Portefeuille chaud à recharger'))
      assert.lengthOf(empty, 1)
    } finally {
      NotificationService.sendEmail = original
      CryptoAlerts.reset()
    }
  })

  test('support sees the hash of a disputed withdrawal, and cannot reverse it', async ({
    client,
    assert,
  }) => {
    const { user } = await verifiedUser(100000n)
    const payout = await request(client, user, '1000')
    const hot = fakeHotWallet()
    await CryptoPayoutService.processAutomatic(hot.sender)
    const sent = json(await client.get(`/api/v1/crypto/payouts/${payout.id}`).loginAs(user)).data

    const dispute = await Dispute.create({
      ledgerTransactionId: payout.id,
      raisedByType: 'user',
      raisedById: user.id,
      reason: 'Not received',
      status: 'opened',
      openedAt: DateTime.now(),
    })

    const shown = json(
      await client.get(`/api/v1/disputes/all/${dispute.id}`).withGuard('internal').loginAs(admin)
    ).data
    assert.equal(shown.transaction.type, 'crypto_payout')
    assert.equal(shown.transaction.crypto.tx_hash, sent.tx_hash)
    assert.equal(shown.transaction.crypto.network, 'polygon')

    const reversal = await client
      .post(`/api/v1/disputes/${dispute.id}/close`)
      .withGuard('internal')
      .loginAs(admin)
      .json({ outcome: 'approved', resolution_notes: 'Customer says it never arrived' })
    assert.equal(reversal.status(), 422)
    assert.equal(json(reversal).code, 'CRYPTO_PAYOUT_NOT_REVERSIBLE')
  })
})
