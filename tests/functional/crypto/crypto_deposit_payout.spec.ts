import { test } from '@japa/runner'
import env from '#start/env'
import { randomUUID } from 'node:crypto'
import { HDNodeWallet } from 'ethers'
import CryptoDeposit from '#models/crypto_deposit'
import CryptoDepositAddress from '#models/crypto_deposit_address'
import { AlchemyNotify, type AddressRegistrar } from '#services/crypto/alchemy_notify'
import { AlchemySignatureService } from '#services/crypto/alchemy_signature_service'
import { CryptoDepositService, type ChainReader } from '#services/crypto/crypto_deposit_service'
import { MAINNET_NETWORKS as NETWORKS, TESTNET_NETWORKS } from '#services/crypto/crypto_networks'
import { CryptoPayoutService } from '#services/crypto/crypto_payout_service'
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
  group.setup(() => {
    const previous = Object.fromEntries(
      Object.keys(TEST_ENV).map((key) => [key, env.get(key as any)])
    )
    for (const [key, value] of Object.entries(TEST_ENV)) env.set(key as any, value)
    return () => {
      for (const [key, value] of Object.entries(previous)) env.set(key as any, (value ?? '') as any)
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

    const types = heard.map((event) => `${event.payload.type}:${event.payload.status ?? ''}`)
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

test.group('Crypto payouts (stablecoins)', () => {
  test('initiates crypto payout, debits wallet, and refunds on failure', async ({
    client,
    assert,
  }) => {
    const { user, wallet } = await createUserWithWallet({
      email: `crypto-out-${randomUUID()}@test.com`,
      balance: 10000n, // $100.00
    })

    const idempotencyKey = randomUUID()
    const destinationAddress = '0x2222222222222222222222222222222222222222'

    // 1. Initiate payout of $20.00 (2000 hundredths)
    const payoutRes = await client.post('/api/v1/crypto/payouts').loginAs(user).json({
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
    const payout2Res = await client.post('/api/v1/crypto/payouts').loginAs(user).json({
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
})
