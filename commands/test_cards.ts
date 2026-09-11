import { BaseCommand } from '@adonisjs/core/ace'
import { randomBytes, createCipheriv, createHmac } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import Wallet from '#models/wallet'
import LedgerAccount from '#models/ledger_account'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import {
  CardService,
  InsufficientWalletBalanceException,
  CardOwnershipException,
} from '#services/cards/card_service'
import { CardDetailCryptoService } from '#services/cards/card_detail_crypto_service'
import {
  PayscribeSignatureService,
  PayscribeSignatureException,
} from '#services/cards/payscribe_signature_service'
import type {
  CardProvider,
  CreateCardParams,
  CreateCustomerParams,
  CreateCustomerResult,
  CardSummary,
  CardActionResult,
  CardTransactionPage,
} from '#services/cards/card_provider'
import env from '#start/env'

/** In-memory fake — no real Payscribe network calls, exercises CardService's own logic. */
class FakeCardProvider implements CardProvider {
  readonly name = 'payscribe'
  createCardCalls = 0
  cards = new Map<string, { balance: number }>()

  async createCustomer(_params: CreateCustomerParams): Promise<CreateCustomerResult> {
    return { providerCustomerId: `cust_${randomBytes(4).toString('hex')}` }
  }

  async createCard(params: CreateCardParams): Promise<CardSummary> {
    this.createCardCalls++
    const id = `card_${randomBytes(4).toString('hex')}`
    this.cards.set(id, { balance: Number(params.amount) })

    const key = Buffer.from(env.get('PAYSCRIBE_MERCHANT_HASH_KEY') as string, 'hex')
    const iv = randomBytes(12)
    const aad = Buffer.from(`bid:test|env:test|card:${id}`, 'utf8')
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(aad)
    const plaintext = JSON.stringify({ number: '4111111111111111', ccv: '123', expiry: '12/29' })
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    return {
      providerCardId: id,
      brand: params.brand,
      cardType: 'virtual',
      currencyCode: params.currencyCode,
      firstSix: '411111',
      lastFour: '1111',
      // Ce faux fournisseur exerce le chemin chiffré ; le chemin en clair est
      // celui de Payscribe en conditions réelles.
      plainDetails: null,
      masked: '411111 **** 1111',
      secureDetails: {
        alg: 'AES-256-GCM',
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: encrypted.toString('base64'),
        aad: aad.toString('utf8'),
      },
      balance: params.amount,
    }
  }

  async getCardDetails(providerCardId: string): Promise<CardSummary> {
    return this.createCard({
      providerCustomerId: '',
      brand: 'VISA',
      currencyCode: 'USD',
      amount: '0',
      reference: '',
    }).then((s) => ({
      ...s,
      providerCardId,
    }))
  }

  async topupCard(providerCardId: string, amount: string): Promise<CardActionResult> {
    const c = this.cards.get(providerCardId)!
    c.balance += Number(amount)
    return { balance: String(c.balance) }
  }

  async withdrawFromCard(providerCardId: string, amount: string): Promise<CardActionResult> {
    const c = this.cards.get(providerCardId)!
    c.balance -= Number(amount)
    return { balance: String(c.balance) }
  }

  async freezeCard(): Promise<void> {}
  async unfreezeCard(): Promise<void> {}
  async terminateCard(): Promise<void> {}
  async getCardTransactions(): Promise<CardTransactionPage> {
    return { transactions: [], total: 0, page: 1, pageSize: 0 }
  }
}

export default class TestCards extends BaseCommand {
  static commandName = 'test:cards'
  static options = { startApp: true }

  private assert(label: string, actual: unknown, expected: unknown) {
    const a = typeof actual === 'bigint' ? actual.toString() : actual
    const e = typeof expected === 'bigint' ? expected.toString() : expected
    if (JSON.stringify(a) === JSON.stringify(e)) {
      this.logger.info(`OK: ${label} -> ${a}`)
    } else {
      this.logger.error(`FAIL: ${label} -> got ${a}, expected ${e}`)
    }
  }

  async run() {
    // --- crypto round-trip sanity (uses whatever PAYSCRIBE_MERCHANT_HASH_KEY is set for this run) ---
    const provider = new FakeCardProvider()
    const cardService = new CardService(provider)

    // --- set up a real USD wallet with a real ledger account, funded ---
    const email = `card-test-${Date.now()}@example.com`
    const [userRow] = await db
      .table('users')
      .insert({
        full_name: 'Card Test User',
        email,
        password: 'not-a-real-hash',
        code: `${Date.now()}`.slice(-9),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('id')
    const userId = typeof userRow === 'object' ? userRow.id : userRow

    const account = await LedgerAccount.create({
      code: `USER_WALLET.${userId}.USD`,
      name: 'Test wallet',
      accountType: 'asset',
      ownerType: 'user_wallet',
      currencyCode: 'USD',
      status: 'active',
    })
    const wallet = new Wallet()
    wallet.userId = userId
    wallet.ledgerAccountId = account.id
    wallet.currencyCode = 'USD'
    wallet.balanceCache = 0n
    wallet.status = 'active'
    await wallet.save()
    account.ownerId = wallet.id
    await account.save()

    // Fund the wallet directly via the ledger (simulate a prior deposit)
    await db.transaction(async (trx) => {
      const platformFund = await LedgerService.getOrCreatePlatformAccount(
        'TEST_FUNDING.USD',
        'Test funding',
        'USD',
        trx,
        'equity'
      )
      await LedgerService.postTransaction(
        'test_funding',
        [
          { accountId: platformFund.id, direction: 'debit', amount: new Money(10_000n, 'USD') },
          { accountId: account.id, direction: 'credit', amount: new Money(10_000n, 'USD') },
        ],
        'system',
        0,
        { correlationId: 'test-cards', trx }
      )
    })

    const owner = {
      ownerType: 'user' as const,
      ownerId: userId,
      fullName: 'Card Test User',
      email,
      phone: '+15551234567',
    }

    // --- create card: $50.00 (5000 cents), 0% fee (default config) ---
    const { card, details } = await cardService.createCard({
      owner,
      walletId: wallet.id,
      brand: 'VISA',
      amount: new Money(5000n, 'USD'),
      correlationId: 'test-cards',
    })

    const reloadedWallet = await Wallet.findOrFail(wallet.id)
    this.assert('wallet debited by full amount', reloadedWallet.balanceCache, 5000n)
    this.assert('card balance == amount (0% fee)', card.balanceCache, 5000n)
    this.assert('card status active', card.status, 'active')
    this.assert('provider called once', provider.createCardCalls, 1)
    this.assert('secure_details decrypted', details?.number, '4111111111111111')

    // --- top up $10.00 ---
    const topped = await cardService.topup({
      cardId: card.id,
      ownerType: 'user',
      ownerId: userId,
      amount: new Money(1000n, 'USD'),
      correlationId: 'test-cards',
    })
    this.assert('card balance after topup', topped.balanceCache, 6000n)
    const walletAfterTopup = await Wallet.findOrFail(wallet.id)
    this.assert('wallet debited after topup', walletAfterTopup.balanceCache, 4000n)

    // --- withdraw $20.00 back ---
    const withdrawn = await cardService.withdraw({
      cardId: card.id,
      ownerType: 'user',
      ownerId: userId,
      amount: new Money(2000n, 'USD'),
      correlationId: 'test-cards',
    })
    this.assert('card balance after withdraw', withdrawn.balanceCache, 4000n)
    const walletAfterWithdraw = await Wallet.findOrFail(wallet.id)
    this.assert('wallet credited after withdraw', walletAfterWithdraw.balanceCache, 6000n)

    // --- insufficient balance on a fresh card creation ---
    try {
      await cardService.createCard({
        owner,
        walletId: wallet.id,
        brand: 'VISA',
        amount: new Money(999_999n, 'USD'),
        correlationId: 'test-cards',
      })
      this.logger.error('FAIL: card created despite insufficient balance')
    } catch (e) {
      this.assert(
        'insufficient balance rejected',
        e instanceof InsufficientWalletBalanceException,
        true
      )
    }

    // --- ownership check: another user cannot topup this card ---
    try {
      await cardService.topup({
        cardId: card.id,
        ownerType: 'user',
        ownerId: userId + 999999,
        amount: new Money(100n, 'USD'),
        correlationId: 'test-cards',
      })
      this.logger.error('FAIL: cross-owner topup was allowed')
    } catch (e) {
      this.assert('cross-owner topup rejected', e instanceof CardOwnershipException, true)
    }

    // --- freeze / unfreeze / terminate (terminate withdraws remaining balance) ---
    const frozen = await cardService.freeze(card.id, 'user', userId, 'test-cards')
    this.assert('frozen', frozen.status, 'frozen')
    const unfrozen = await cardService.unfreeze(card.id, 'user', userId, 'test-cards')
    this.assert('unfrozen', unfrozen.status, 'active')
    const terminated = await cardService.terminate(card.id, 'user', userId, 'test-cards')
    this.assert('terminated', terminated.status, 'terminated')
    this.assert('balance zeroed after terminate withdraws remainder', terminated.balanceCache, 0n)
    const walletAfterTerminate = await Wallet.findOrFail(wallet.id)
    this.assert('wallet got the remainder back', walletAfterTerminate.balanceCache, 10000n)

    // --- signature verification ---
    const rawBody = JSON.stringify({ event: 'card.status.changed', card_id: 'x' })
    const secret = env.get('PAYSCRIBE_WEBHOOK_SECRET') as string
    const validSig = createHmac('sha256', secret).update(rawBody).digest('hex')
    try {
      PayscribeSignatureService.verify(rawBody, validSig)
      this.logger.info('OK: valid webhook signature accepted')
    } catch {
      this.logger.error('FAIL: valid signature rejected')
    }
    try {
      PayscribeSignatureService.verify(rawBody, 'deadbeef')
      this.logger.error('FAIL: invalid signature accepted')
    } catch (e) {
      this.assert(
        'invalid webhook signature rejected',
        e instanceof PayscribeSignatureException,
        true
      )
    }
    try {
      PayscribeSignatureService.verify(rawBody, undefined)
      this.logger.error('FAIL: missing signature accepted')
    } catch (e) {
      this.assert(
        'missing webhook signature rejected',
        e instanceof PayscribeSignatureException,
        true
      )
    }
  }
}
