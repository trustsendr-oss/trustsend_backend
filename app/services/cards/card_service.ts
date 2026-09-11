import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import Card from '#models/card'
import CardCustomer from '#models/card_customer'
import Wallet from '#models/wallet'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import {
  CardDetailCryptoService,
  type DecryptedCardDetails,
} from '#services/cards/card_detail_crypto_service'
import type { CardProvider, CardSummary } from '#services/cards/card_provider'
import cardsConfig from '#config/cards'
import { CardProductService } from '#services/cards/card_product_service'

export type CardOwnerType = 'user' | 'business'

export class CardNotFoundException extends Error {
  constructor() {
    super('Card not found')
    this.name = 'CardNotFoundException'
  }
}

export class CardOwnershipException extends Error {
  constructor() {
    super('This card does not belong to you')
    this.name = 'CardOwnershipException'
  }
}

export class CardWalletException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CardWalletException'
  }
}

export class InsufficientWalletBalanceException extends Error {
  constructor() {
    super('Insufficient wallet balance')
    this.name = 'InsufficientWalletBalanceException'
  }
}

export class CardStatusException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CardStatusException'
  }
}

interface OwnerRef {
  ownerType: CardOwnerType
  ownerId: number
  fullName: string
  email: string
  phone: string
}

/**
 * Card issuing business logic — the single point that talks to CardProvider (Payscribe) AND
 * moves money on our own ledger. Mirrors mobile money's structure but is simpler in one
 * important way: Payscribe's create/topup/withdraw calls are synchronous (the response tells you
 * the outcome immediately) — there's no pending-then-webhook-confirms two-phase dance the way
 * mobile money deposits/payouts need. So the pattern here is: call the provider first (a network
 * call, deliberately OUTSIDE any db.transaction — same reasoning as
 * mobile_money_deposit_service.ts: don't hold a DB connection open across a slow HTTP call), and
 * only move our own ledger money once we know the provider actually accepted.
 *
 * Funding model (see payscribe_provider.ts's doc comment): the money that ends up on a card comes
 * out of OUR OWN pre-funded Payscribe merchant wallet, not directly out of what the end user
 * sends per-request. On our side we still debit the end user's TumaPlus wallet and credit a
 * CARD_ISSUING_CLEARING platform account — this is OUR record of money committed to customer
 * cards, matching MOBILE_MONEY_CLEARING's role for mobile money. Keeping the actual Payscribe
 * merchant wallet funded is a separate, manual operational concern this class has no visibility
 * into.
 */
/**
 * The card's number, expiry and CCV, whichever way the provider chose to send them.
 *
 * Payscribe documents an encrypted `secure_details` envelope, and this integration was written
 * against that. Its live card endpoints send the values in the clear instead, under
 * `card_number` / `expiry` / `ccv` — so looking only for the envelope found nothing and every
 * client showed a permanently masked card. Both shapes are accepted; the envelope wins when
 * present, since an account that encrypts is one that has real data to protect.
 *
 * Returns `null` rather than a record of empty strings when the provider withholds the data —
 * a sandbox account, or one without PCI card-data access. The difference matters to the caller:
 * "no data" is something to explain to the cardholder, "" is something they would try to read.
 */
function resolveCardDetails(summary: CardSummary): DecryptedCardDetails | null {
  if (summary.secureDetails) return CardDetailCryptoService.decrypt(summary.secureDetails)

  const plain = summary.plainDetails
  if (!plain) return null
  return plain.number || plain.ccv || plain.expiry ? plain : null
}

export class CardService {
  constructor(private readonly provider: CardProvider) {}

  /**
   * Creates the Payscribe customer for this owner if one doesn't exist yet, and returns its
   * provider_customer_id either way. Safe to call on every card request — idempotent by the
   * unique (owner, provider) index on card_customers.
   */
  async ensureProviderCustomer(owner: OwnerRef): Promise<string> {
    const ownerColumn = owner.ownerType === 'user' ? 'user_id' : 'business_id'

    const existing = await CardCustomer.query()
      .where(ownerColumn, owner.ownerId)
      .where('provider', this.provider.name)
      .first()

    if (existing) return existing.providerCustomerId

    const result = await this.provider.createCustomer({
      fullName: owner.fullName,
      email: owner.email,
      phone: owner.phone,
    })

    try {
      const created = new CardCustomer()
      if (owner.ownerType === 'user') created.userId = owner.ownerId
      else created.businessId = owner.ownerId
      created.provider = this.provider.name
      created.providerCustomerId = result.providerCustomerId
      await created.save()
    } catch {
      // Lost a race against a concurrent request for the same owner (unique index conflict) —
      // whichever provider_customer_id is already stored wins; both are valid Payscribe
      // customers for the same person, no harm in one being orphaned provider-side.
      const winner = await CardCustomer.query()
        .where(ownerColumn, owner.ownerId)
        .where('provider', this.provider.name)
        .firstOrFail()
      return winner.providerCustomerId
    }

    return result.providerCustomerId
  }

  /**
   * Fund a brand-new card. `amount` is what the caller asked to load onto the card (gross,
   * charged in full to their wallet) — the fee is skimmed from what's actually sent to Payscribe
   * as card funding, same convention as mobile_money_payout_service.ts (the requested amount is
   * always gross; the destination receives net-of-fee).
   */
  async createCard(request: {
    owner: OwnerRef
    walletId: number
    brand: 'VISA' | 'MASTERCARD'
    /** Montant chargé sur la carte à l'émission, hors prix de la catégorie. */
    amount: Money
    /** Catégorie achetée. `null` conserve l'émission gratuite d'avant le catalogue. */
    cardProductId?: number | null
    correlationId: string
  }): Promise<{ card: Card; details: DecryptedCardDetails | null }> {
    const wallet = await Wallet.findOrFail(request.walletId)

    // La catégorie est résolue et vérifiée en premier : refuser après avoir
    // créé la carte chez le fournisseur laisserait une carte réelle, adossée à
    // de l'argent réel, que rien de notre côté ne reconnaîtrait.
    const product = request.cardProductId
      ? await CardProductService.requirePurchasable(request.cardProductId)
      : null

    if (product) {
      if (product.currencyCode !== wallet.currencyCode) {
        throw new CardWalletException(
          `La catégorie « ${product.name} » se règle en ${product.currencyCode} ; ce compte est en ${wallet.currencyCode}.`
        )
      }
      await CardProductService.assertCanIssue(
        product,
        request.owner.ownerType,
        request.owner.ownerId
      )
    }

    const issuancePrice = product?.issuancePrice ?? 0n
    // Le portefeuille doit couvrir le chargement ET le prix de la catégorie :
    // les deux le quittent au même instant.
    const totalDue = request.amount.amount + issuancePrice

    if (wallet.currencyCode !== 'USD') {
      throw new CardWalletException('Card issuing is USD-only — fund from a USD wallet')
    }
    if (wallet.status !== 'active') {
      throw new CardWalletException(`Wallet is not active (status: ${wallet.status})`)
    }
    // Fast-fail (non-authoritative): the authoritative check happens below, right before the
    // ledger debit, protected by a row lock — same two-tier pattern as cash_in_service.ts.
    if (wallet.balanceCache < totalDue) {
      throw new InsufficientWalletBalanceException()
    }

    const providerCustomerId = await this.ensureProviderCustomer(request.owner)
    const reference = randomUUID()

    const summary = await this.provider.createCard({
      providerCustomerId,
      brand: request.brand,
      currencyCode: request.amount.currencyCode,
      amount: this.toDecimalString(request.amount),
      reference,
    })

    const feeBps = BigInt(Math.round(cardsConfig.fees.issuanceFeePercent * 100))
    const fee = (request.amount.amount * feeBps + 5000n) / 10000n
    const netToClearing = request.amount.amount - fee

    const card = await db.transaction(async (trx) => {
      const lockedWallet = await Wallet.query({ client: trx })
        .where('id', request.walletId)
        .forUpdate()
        .firstOrFail()

      if (lockedWallet.balanceCache < totalDue) {
        // The card ALREADY EXISTS at Payscribe with real money behind it (their side succeeded)
        // — we cannot pretend otherwise by throwing and forgetting it. Record it as active and
        // flag the shortfall loudly for manual reconciliation, rather than silently losing track
        // of a real external liability. This should be exceedingly rare (see the fast-fail check
        // above, moments earlier) — a concurrent debit on this exact wallet in that narrow window.
        console.error(
          `[CRITICAL] Card ${summary.providerCardId} funded at Payscribe but wallet ${request.walletId} ` +
            `has insufficient balance to debit — manual reconciliation required`
        )
        await AuditLoggerService.record({
          actorType: request.owner.ownerType,
          actorId: request.owner.ownerId,
          action: 'card.funding_ledger_mismatch',
          resourceType: 'card',
          resourceId: 0,
          after: {
            provider_card_id: summary.providerCardId,
            amount: request.amount.amount.toString(),
          },
          correlationId: request.correlationId,
          trx,
        })

        const unreconciled = new Card()
        if (request.owner.ownerType === 'user') unreconciled.userId = request.owner.ownerId
        else unreconciled.businessId = request.owner.ownerId
        unreconciled.walletId = request.walletId
        unreconciled.provider = this.provider.name
        unreconciled.providerCardId = summary.providerCardId
        unreconciled.brand = summary.brand
        unreconciled.cardType = summary.cardType
        unreconciled.currencyCode = summary.currencyCode
        unreconciled.status = 'active'
        unreconciled.firstSix = summary.firstSix
        unreconciled.lastFour = summary.lastFour
        unreconciled.masked = summary.masked
        unreconciled.balanceCache = request.amount.amount
        unreconciled.failureReason = 'funding_ledger_mismatch — see audit log'
        await unreconciled.useTransaction(trx).save()
        return unreconciled
      }

      const walletAccount = await db
        .query()
        .from('ledger_accounts')
        .where('owner_id', lockedWallet.id)
        .whereIn('owner_type', ['user_wallet', 'business_wallet'])
        .select('id')
        .useTransaction(trx)
        .first()

      if (!walletAccount) throw new Error('Ledger account not found for wallet')

      const clearingAccount = await LedgerService.getOrCreatePlatformAccount(
        `CARD_ISSUING_CLEARING.${request.amount.currencyCode}`,
        `Card Issuing Clearing (${request.amount.currencyCode})`,
        request.amount.currencyCode,
        trx,
        'asset'
      )

      const entries: Array<{ accountId: number; direction: 'debit' | 'credit'; amount: Money }> = [
        { accountId: walletAccount.id, direction: 'debit', amount: request.amount },
        {
          accountId: clearingAccount.id,
          direction: 'credit',
          amount: new Money(netToClearing, request.amount.currencyCode),
        },
      ]

      if (fee > 0n) {
        const feesAccount = await LedgerService.getOrCreatePlatformAccount(
          `PLATFORM_FEES.${request.amount.currencyCode}`,
          `TumaPlus Fees (${request.amount.currencyCode})`,
          request.amount.currencyCode,
          trx,
          'revenue'
        )
        entries.push({
          accountId: feesAccount.id,
          direction: 'credit',
          amount: new Money(fee, request.amount.currencyCode),
        })
      }

      await LedgerService.postTransaction(
        'card_issuance',
        entries,
        request.owner.ownerType,
        request.owner.ownerId,
        {
          correlationId: request.correlationId,
          description: `Card creation for wallet ${request.walletId}`,
          metadata: {
            fee: fee.toString(),
            net_to_clearing: netToClearing.toString(),
            provider_card_id: summary.providerCardId,
            card_product_id: product?.id ?? null,
            issuance_price: issuancePrice.toString(),
          },
          amount: request.amount,
          paymentMethod: 'card',
          paymentChannel: summary.brand,
          fee,
          trx,
        }
      )

      const newCard = new Card()
      if (request.owner.ownerType === 'user') newCard.userId = request.owner.ownerId
      else newCard.businessId = request.owner.ownerId
      newCard.walletId = request.walletId
      // La catégorie est figée sur la carte : archiver ou retarifer une
      // catégorie ne doit pas changer ce à quoi un porteur a droit.
      newCard.cardProductId = product?.id ?? null
      newCard.provider = this.provider.name
      newCard.providerCardId = summary.providerCardId
      newCard.brand = summary.brand
      newCard.cardType = summary.cardType
      newCard.currencyCode = summary.currencyCode
      newCard.status = 'active'
      newCard.firstSix = summary.firstSix
      newCard.lastFour = summary.lastFour
      newCard.masked = summary.masked
      newCard.balanceCache = netToClearing
      await newCard.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: request.owner.ownerType,
        actorId: request.owner.ownerId,
        action: 'card.created',
        resourceType: 'card',
        resourceId: newCard.id,
        after: {
          provider_card_id: summary.providerCardId,
          amount: request.amount.amount.toString(),
          fee: fee.toString(),
        },
        correlationId: request.correlationId,
        trx,
      })

      return newCard
    })

    await InAppNotificationService.notify({
      recipientType: request.owner.ownerType,
      recipientId: request.owner.ownerId,
      type: 'card.created',
      title: 'Card created',
      message: `Your ${summary.brand} card ending in ${summary.lastFour} is ready.`,
      data: { card_id: card.id },
    })

    return {
      card,
      details: resolveCardDetails(summary),
    }
  }

  /** @throws CardNotFoundException / CardOwnershipException */
  private async requireOwnedCard(
    cardId: number,
    ownerType: CardOwnerType,
    ownerId: number
  ): Promise<Card> {
    const card = await Card.find(cardId)
    if (!card) throw new CardNotFoundException()

    const owns = ownerType === 'user' ? card.userId === ownerId : card.businessId === ownerId
    if (!owns) throw new CardOwnershipException()

    return card
  }

  async topup(request: {
    cardId: number
    ownerType: CardOwnerType
    ownerId: number
    amount: Money
    correlationId: string
  }): Promise<Card> {
    const card = await this.requireOwnedCard(request.cardId, request.ownerType, request.ownerId)

    if (card.status !== 'active') {
      throw new CardStatusException(`Card is not active (status: ${card.status})`)
    }

    const wallet = await Wallet.findOrFail(card.walletId)
    if (wallet.balanceCache < request.amount.amount) {
      throw new InsufficientWalletBalanceException()
    }

    // Avant l'appel au fournisseur, jamais après : une carte rechargée chez
    // Payscribe puis refusée ici laisserait de l'argent réel sur une carte
    // réelle, sans contrepartie dans notre grand livre. C'est exactement ce
    // que le chemin `funding_ledger_mismatch` plus bas existe pour rattraper.
    await CardProductService.assertCanTopup(card, request.amount.amount)

    const reference = randomUUID()
    const feeBps = BigInt(Math.round(cardsConfig.fees.topupFeePercent * 100))
    const fee = (request.amount.amount * feeBps + 5000n) / 10000n
    const netToClearing = request.amount.amount - fee

    await this.provider.topupCard(
      card.providerCardId!,
      this.toDecimalString(request.amount),
      reference
    )

    return db.transaction(async (trx) => {
      const lockedWallet = await Wallet.query({ client: trx })
        .where('id', card.walletId)
        .forUpdate()
        .firstOrFail()

      if (lockedWallet.balanceCache < request.amount.amount) {
        console.error(
          `[CRITICAL] Card ${card.providerCardId} topped up at Payscribe but wallet ${card.walletId} ` +
            `has insufficient balance to debit — manual reconciliation required`
        )
        await AuditLoggerService.record({
          actorType: request.ownerType,
          actorId: request.ownerId,
          action: 'card.funding_ledger_mismatch',
          resourceType: 'card',
          resourceId: card.id,
          after: { amount: request.amount.amount.toString() },
          correlationId: request.correlationId,
          trx,
        })
        card.balanceCache += request.amount.amount
        await card.useTransaction(trx).save()
        return card
      }

      const walletAccount = await db
        .query()
        .from('ledger_accounts')
        .where('owner_id', lockedWallet.id)
        .whereIn('owner_type', ['user_wallet', 'business_wallet'])
        .select('id')
        .useTransaction(trx)
        .first()
      if (!walletAccount) throw new Error('Ledger account not found for wallet')

      const clearingAccount = await LedgerService.getOrCreatePlatformAccount(
        `CARD_ISSUING_CLEARING.${request.amount.currencyCode}`,
        `Card Issuing Clearing (${request.amount.currencyCode})`,
        request.amount.currencyCode,
        trx,
        'asset'
      )

      const entries: Array<{ accountId: number; direction: 'debit' | 'credit'; amount: Money }> = [
        { accountId: walletAccount.id, direction: 'debit', amount: request.amount },
        {
          accountId: clearingAccount.id,
          direction: 'credit',
          amount: new Money(netToClearing, request.amount.currencyCode),
        },
      ]
      if (fee > 0n) {
        const feesAccount = await LedgerService.getOrCreatePlatformAccount(
          `PLATFORM_FEES.${request.amount.currencyCode}`,
          `TumaPlus Fees (${request.amount.currencyCode})`,
          request.amount.currencyCode,
          trx,
          'revenue'
        )
        entries.push({
          accountId: feesAccount.id,
          direction: 'credit',
          amount: new Money(fee, request.amount.currencyCode),
        })
      }

      await LedgerService.postTransaction(
        'card_topup',
        entries,
        request.ownerType,
        request.ownerId,
        {
          correlationId: request.correlationId,
          description: `Card top-up for card ${card.id}`,
          // `card_id` est ce sur quoi CardProductService additionne les
          // rechargements d'une carte sur 24 h et 30 jours. Sans lui, la
          // somme est toujours nulle et le plafond ne se déclenche jamais.
          metadata: { fee: fee.toString(), card_id: String(card.id) },
          amount: request.amount,
          paymentMethod: 'card',
          paymentChannel: card.brand,
          fee,
          trx,
        }
      )

      card.balanceCache += netToClearing
      await card.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: request.ownerType,
        actorId: request.ownerId,
        action: 'card.topped_up',
        resourceType: 'card',
        resourceId: card.id,
        after: { amount: request.amount.amount.toString(), fee: fee.toString() },
        correlationId: request.correlationId,
        trx,
      })

      return card
    })
  }

  async withdraw(request: {
    cardId: number
    ownerType: CardOwnerType
    ownerId: number
    amount: Money
    correlationId: string
  }): Promise<Card> {
    const card = await this.requireOwnedCard(request.cardId, request.ownerType, request.ownerId)

    if (card.status !== 'active') {
      throw new CardStatusException(`Card is not active (status: ${card.status})`)
    }
    if (card.balanceCache < request.amount.amount) {
      throw new InsufficientWalletBalanceException()
    }

    const reference = randomUUID()
    await this.provider.withdrawFromCard(
      card.providerCardId!,
      this.toDecimalString(request.amount),
      reference
    )

    return db.transaction(async (trx) => {
      const lockedWallet = await Wallet.query({ client: trx })
        .where('id', card.walletId)
        .forUpdate()
        .firstOrFail()

      const walletAccount = await db
        .query()
        .from('ledger_accounts')
        .where('owner_id', lockedWallet.id)
        .whereIn('owner_type', ['user_wallet', 'business_wallet'])
        .select('id')
        .useTransaction(trx)
        .first()
      if (!walletAccount) throw new Error('Ledger account not found for wallet')

      const clearingAccount = await LedgerService.getOrCreatePlatformAccount(
        `CARD_ISSUING_CLEARING.${request.amount.currencyCode}`,
        `Card Issuing Clearing (${request.amount.currencyCode})`,
        request.amount.currencyCode,
        trx,
        'asset'
      )

      await LedgerService.postTransaction(
        'card_withdrawal',
        [
          { accountId: clearingAccount.id, direction: 'debit', amount: request.amount },
          { accountId: walletAccount.id, direction: 'credit', amount: request.amount },
        ],
        request.ownerType,
        request.ownerId,
        {
          correlationId: request.correlationId,
          description: `Withdrawal from card ${card.id}`,
          metadata: { card_id: String(card.id) },
          amount: request.amount,
          paymentMethod: 'card',
          paymentChannel: card.brand,
          trx,
        }
      )

      card.balanceCache -= request.amount.amount
      await card.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: request.ownerType,
        actorId: request.ownerId,
        action: 'card.withdrawn',
        resourceType: 'card',
        resourceId: card.id,
        after: { amount: request.amount.amount.toString() },
        correlationId: request.correlationId,
        trx,
      })

      return card
    })
  }

  async freeze(
    cardId: number,
    ownerType: CardOwnerType,
    ownerId: number,
    correlationId: string
  ): Promise<Card> {
    const card = await this.requireOwnedCard(cardId, ownerType, ownerId)
    if (card.status !== 'active') {
      throw new CardStatusException(`Only an active card can be frozen (status: ${card.status})`)
    }

    await this.provider.freezeCard(card.providerCardId!, randomUUID())

    card.status = 'frozen'
    await card.save()

    await AuditLoggerService.record({
      actorType: ownerType,
      actorId: ownerId,
      action: 'card.frozen',
      resourceType: 'card',
      resourceId: card.id,
      correlationId,
    })

    return card
  }

  async unfreeze(
    cardId: number,
    ownerType: CardOwnerType,
    ownerId: number,
    correlationId: string
  ): Promise<Card> {
    const card = await this.requireOwnedCard(cardId, ownerType, ownerId)
    if (card.status !== 'frozen') {
      throw new CardStatusException(`Only a frozen card can be unfrozen (status: ${card.status})`)
    }

    await this.provider.unfreezeCard(card.providerCardId!, randomUUID())

    card.status = 'active'
    await card.save()

    await AuditLoggerService.record({
      actorType: ownerType,
      actorId: ownerId,
      action: 'card.unfrozen',
      resourceType: 'card',
      resourceId: card.id,
      correlationId,
    })

    return card
  }

  /**
   * Terminates the card at the provider AND withdraws whatever balance it had left back to the
   * funding wallet first (a terminated card can never be topped up or withdrawn from again —
   * leaving a balance on it would be money silently stuck).
   */
  async terminate(
    cardId: number,
    ownerType: CardOwnerType,
    ownerId: number,
    correlationId: string
  ): Promise<Card> {
    let card = await this.requireOwnedCard(cardId, ownerType, ownerId)
    if (card.status === 'terminated') {
      throw new CardStatusException('Card is already terminated')
    }

    if (card.balanceCache > 0n) {
      // withdraw() re-fetches and saves its own Card instance — reassign `card` to that result
      // (rather than keep using this now-stale one) so the balanceCache update below builds on
      // top of the withdrawal instead of overwriting it back to the pre-withdrawal value.
      card = await this.withdraw({
        cardId,
        ownerType,
        ownerId,
        amount: new Money(card.balanceCache, card.currencyCode),
        correlationId,
      })
    }

    await this.provider.terminateCard(card.providerCardId!, randomUUID())

    card.status = 'terminated'
    await card.save()

    await AuditLoggerService.record({
      actorType: ownerType,
      actorId: ownerId,
      action: 'card.terminated',
      resourceType: 'card',
      resourceId: card.id,
      correlationId,
    })

    return card
  }

  /** Never persists the decrypted result — see CardDetailCryptoService's doc comment. */
  async getDetails(
    cardId: number,
    ownerType: CardOwnerType,
    ownerId: number
  ): Promise<{ card: Card; details: DecryptedCardDetails | null }> {
    const card = await this.requireOwnedCard(cardId, ownerType, ownerId)
    const summary = await this.provider.getCardDetails(card.providerCardId!)

    return {
      card,
      details: resolveCardDetails(summary),
    }
  }

  async getTransactions(
    cardId: number,
    ownerType: CardOwnerType,
    ownerId: number,
    params: { startDate: string; endDate: string; page?: number; pageSize?: number }
  ) {
    const card = await this.requireOwnedCard(cardId, ownerType, ownerId)
    return this.provider.getCardTransactions(card.providerCardId!, params)
  }

  async listForOwner(ownerType: CardOwnerType, ownerId: number): Promise<Card[]> {
    const ownerColumn = ownerType === 'user' ? 'user_id' : 'business_id'
    return Card.query().where(ownerColumn, ownerId).orderBy('created_at', 'desc')
  }

  private toDecimalString(amount: Money): string {
    // Payscribe wants a plain decimal string (e.g. "5" or "5.50"), not our smallest-unit bigint.
    // Card issuing is USD-only today (2 decimal places) — this assumes that; revisit if another
    // currency is ever added with a different smallest-unit convention (see Money's own caveats).
    const cents = amount.amount
    const whole = cents / 100n
    const remainder = cents % 100n
    return remainder === 0n ? whole.toString() : `${whole}.${remainder.toString().padStart(2, '0')}`
  }
}
