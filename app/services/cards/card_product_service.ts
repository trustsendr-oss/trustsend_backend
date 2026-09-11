import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type Card from '#models/card'
import CardProduct from '#models/card_product'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { CardArtStorageService } from '#services/cards/card_art_storage_service'

export class CardProductNotFoundException extends Error {
  constructor(message = 'Card category not found') {
    super(message)
    this.name = 'CardProductNotFoundException'
  }
}

export class CardProductUnavailableException extends Error {
  constructor(message = 'This card category is no longer available') {
    super(message)
    this.name = 'CardProductUnavailableException'
  }
}

export class CardProductLimitException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CardProductLimitException'
  }
}

export class CardProductCodeTakenException extends Error {
  constructor(code: string) {
    super(`A card category with code "${code}" already exists`)
    this.name = 'CardProductCodeTakenException'
  }
}

/** Les plafonds, tous facultatifs et tous « pas de plafond » lorsqu'ils valent `null`. */
export type CardProductLimits = {
  maxBalance?: bigint | null
  maxActiveCards?: number | null
  perTopupLimit?: bigint | null
  dailyTopupLimit?: bigint | null
  monthlyTopupLimit?: bigint | null
}

/**
 * Reads the card catalogue and enforces what a category allows.
 *
 * Every check here runs BEFORE the provider is called. A card topped up at Payscribe and then
 * refused locally would leave real money on a real card with nothing recorded on our side — the
 * `funding_ledger_mismatch` path in CardService exists precisely because that ordering was got
 * wrong once already.
 *
 * A card with no category — issued before the catalogue existed — is unrestricted. Inventing a
 * category for it would impose terms it was never sold under.
 */
export class CardProductService {
  /**
   * Les catégories d'un lot de cartes, indexées par identifiant.
   *
   * Une seule requête pour toute la liste : résoudre la catégorie carte par carte ferait autant
   * d'allers-retours que de cartes affichées, pour un catalogue qui en compte une poignée.
   */
  static async mapByIds(ids: (number | null)[]): Promise<Map<number, CardProduct>> {
    const wanted = [...new Set(ids.filter((id): id is number => id !== null))]
    if (wanted.length === 0) return new Map()

    const products = await CardProduct.query().whereIn('id', wanted)
    return new Map(products.map((product) => [product.id, product]))
  }

  /** Tout le catalogue, archives comprises — la vue du personnel. */
  static async list(): Promise<CardProduct[]> {
    return CardProduct.query().orderBy('issuance_price', 'asc')
  }

  static async create(
    request: {
      code: string
      name: string
      description?: string
      currencyCode?: string
      issuancePrice?: bigint
    } & CardProductLimits,
    actorId: number,
    correlationId: string
  ): Promise<CardProduct> {
    const existing = await CardProduct.query().where('code', request.code).first()
    if (existing) throw new CardProductCodeTakenException(request.code)

    const product = await CardProduct.create({
      code: request.code,
      name: request.name,
      description: request.description ?? null,
      currencyCode: request.currencyCode ?? 'USD',
      issuancePrice: request.issuancePrice ?? 0n,
      maxBalance: request.maxBalance ?? null,
      maxActiveCards: request.maxActiveCards ?? null,
      perTopupLimit: request.perTopupLimit ?? null,
      dailyTopupLimit: request.dailyTopupLimit ?? null,
      monthlyTopupLimit: request.monthlyTopupLimit ?? null,
      status: 'active',
    })

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'card_product.created',
      resourceType: 'card_product',
      resourceId: String(product.id),
      before: undefined,
      after: describe(product),
      correlationId,
    })

    return product
  }

  /**
   * Modifie une catégorie.
   *
   * `code` n'est pas modifiable : c'est l'identifiant stable auquel les clients et les scripts
   * se réfèrent. Le tarif et les plafonds, eux, ne valent que pour les ventes à venir — les
   * cartes déjà émises gardent la catégorie inscrite sur elles.
   */
  static async update(
    id: number,
    request: {
      name?: string
      description?: string
      issuancePrice?: bigint
    } & CardProductLimits,
    actorId: number,
    correlationId: string
  ): Promise<CardProduct> {
    const product = await this.findByIdOrFail(id)
    const before = describe(product)

    if (request.name !== undefined) product.name = request.name
    if (request.description !== undefined) product.description = request.description
    if (request.issuancePrice !== undefined) product.issuancePrice = request.issuancePrice
    if (request.maxBalance !== undefined) product.maxBalance = request.maxBalance
    if (request.maxActiveCards !== undefined) product.maxActiveCards = request.maxActiveCards
    if (request.perTopupLimit !== undefined) product.perTopupLimit = request.perTopupLimit
    if (request.dailyTopupLimit !== undefined) product.dailyTopupLimit = request.dailyTopupLimit
    if (request.monthlyTopupLimit !== undefined) {
      product.monthlyTopupLimit = request.monthlyTopupLimit
    }

    await product.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'card_product.updated',
      resourceType: 'card_product',
      resourceId: String(product.id),
      before,
      after: describe(product),
      correlationId,
    })

    return product
  }

  /**
   * Retire une catégorie de la vente.
   *
   * Archiver plutôt que supprimer : des cartes déjà vendues la référencent, et l'effacer
   * rendrait illisibles les conditions auxquelles elles ont été achetées.
   */
  static async archive(id: number, actorId: number, correlationId: string): Promise<CardProduct> {
    const product = await this.findByIdOrFail(id)
    const before = describe(product)

    product.status = 'archived'
    await product.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'card_product.archived',
      resourceType: 'card_product',
      resourceId: String(product.id),
      before,
      after: describe(product),
      correlationId,
    })

    return product
  }

  /**
   * Retire le visuel d'une catégorie.
   *
   * La ligne est mise à jour **avant** l'effacement du fichier : dans l'autre ordre, un échec
   * d'enregistrement laisserait une catégorie pointant vers un fichier disparu — chaque
   * affichage renverrait alors une erreur au lieu de retomber proprement sur le rendu par
   * défaut.
   *
   * Sans visuel, rien à faire : l'appel est idempotent, deux clics ne doivent pas échouer.
   */
  static async clearImage(
    id: number,
    actorId: number,
    correlationId: string
  ): Promise<CardProduct> {
    const product = await this.findByIdOrFail(id)
    if (!product.imageRef) return product

    const before = describe(product)
    const ref = product.imageRef

    product.imageRef = null
    product.imageMimeType = null
    await product.save()

    await CardArtStorageService.remove(ref)

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'card_product.image_removed',
      resourceType: 'card_product',
      resourceId: String(product.id),
      before,
      after: describe(product),
      correlationId,
    })

    return product
  }

  /**
   * Attache un visuel à une catégorie, en remplaçant le précédent.
   *
   * L'ancien fichier est effacé **après** que le remplaçant est enregistré : dans l'autre ordre,
   * un échec d'écriture laisserait une catégorie pointant vers un fichier qui n'existe plus.
   */
  static async setImage(product: CardProduct, bytes: Buffer): Promise<CardProduct> {
    const previousRef = product.imageRef

    const { ref, mimeType } = await CardArtStorageService.store(bytes)
    product.imageRef = ref
    product.imageMimeType = mimeType
    await product.save()

    if (previousRef) await CardArtStorageService.remove(previousRef)
    return product
  }

  /** The catalogue a customer may buy from. Archived categories are not offered. */
  static async listAvailable(): Promise<CardProduct[]> {
    return CardProduct.query().where('status', 'active').orderBy('issuance_price', 'asc')
  }

  static async findByIdOrFail(id: number): Promise<CardProduct> {
    const product = await CardProduct.find(id)
    if (!product) throw new CardProductNotFoundException()
    return product
  }

  /**
   * The category a card may be bought under right now.
   *
   * Archived is refused rather than silently substituted: a customer who picked a category that
   * has since been withdrawn must be told, not quietly sold something else at another price.
   */
  static async requirePurchasable(id: number): Promise<CardProduct> {
    const product = await this.findByIdOrFail(id)
    if (product.status !== 'active') throw new CardProductUnavailableException()
    return product
  }

  /**
   * How many non-terminated cards of this category the holder already owns, against the cap.
   *
   * Counted per category rather than overall: a cap of one on a premium category must not stop
   * someone from also holding a standard card.
   */
  static async assertCanIssue(
    product: CardProduct,
    ownerType: 'user' | 'business',
    ownerId: number
  ): Promise<void> {
    if (product.maxActiveCards === null) return

    const ownerColumn = ownerType === 'user' ? 'user_id' : 'business_id'
    const result = await db
      .query()
      .from('cards')
      .where(ownerColumn, ownerId)
      .where('card_product_id', product.id)
      .whereNot('status', 'terminated')
      .count('* as count')
      .first()

    const held = Number(result?.count ?? 0)
    if (held >= product.maxActiveCards) {
      throw new CardProductLimitException(
        `La catégorie « ${product.name} » est limitée à ${product.maxActiveCards} carte(s) ; vous en détenez déjà ${held}.`
      )
    }
  }

  /**
   * Whether this top-up is allowed: the single-transaction cap, the rolling windows, and the
   * ceiling the card's balance must not cross.
   *
   * The windows are rolling — 24 hours and 30 days back from now — rather than calendar-aligned
   * like LimitService's wallet windows. A card sold as "500 par mois" should mean any thirty
   * days, not a quota that resets on the first of the month and lets someone spend twice that
   * across a month boundary.
   */
  static async assertCanTopup(card: Card, amount: bigint): Promise<void> {
    if (card.cardProductId === null) return
    const product = await CardProduct.find(card.cardProductId)
    if (!product) return

    if (product.perTopupLimit !== null && amount > product.perTopupLimit) {
      throw new CardProductLimitException(
        `Le rechargement est limité à ${formatMinor(product.perTopupLimit, product.currencyCode)} par opération sur cette carte.`
      )
    }

    if (product.maxBalance !== null && card.balanceCache + amount > product.maxBalance) {
      throw new CardProductLimitException(
        `Cette carte ne peut pas dépasser ${formatMinor(product.maxBalance, product.currencyCode)}.`
      )
    }

    if (product.dailyTopupLimit !== null) {
      await this.assertWithinWindow(
        card,
        amount,
        DateTime.now().minus({ hours: 24 }).toJSDate(),
        product.dailyTopupLimit,
        product.currencyCode,
        'sur 24 heures'
      )
    }

    if (product.monthlyTopupLimit !== null) {
      await this.assertWithinWindow(
        card,
        amount,
        DateTime.now().minus({ days: 30 }).toJSDate(),
        product.monthlyTopupLimit,
        product.currencyCode,
        'sur 30 jours'
      )
    }
  }

  /**
   * Sums what has already been loaded onto this card since `since`.
   *
   * Reads `ledger_transactions` rather than the provider's own history: the provider is a third
   * party that can be slow or unreachable, and a limit that stops being enforced when it is down
   * is not a limit.
   */
  private static async assertWithinWindow(
    card: Card,
    amount: bigint,
    since: Date,
    limit: bigint,
    currencyCode: string,
    windowLabel: string
  ): Promise<void> {
    const result = await db
      .query()
      .from('ledger_transactions')
      .where('type', 'card_topup')
      .where('created_at', '>=', since)
      .whereRaw("metadata ->> 'card_id' = ?", [String(card.id)])
      .sum('amount as total')
      .first()

    const used = BigInt(result?.total ?? 0)
    if (used + amount > limit) {
      throw new CardProductLimitException(
        `Plafond de rechargement atteint : ${formatMinor(limit, currencyCode)} ${windowLabel}, dont ${formatMinor(used, currencyCode)} déjà utilisés.`
      )
    }
  }
}

/**
 * Forme d'une catégorie telle que les clients la reçoivent.
 *
 * Exportée depuis le service plutôt que depuis un contrôleur : elle est employée à la fois par
 * le catalogue et par chaque réponse « carte », et deux copies auraient fini par diverger.
 *
 * Attention à ce que ces valeurs représentent : le **prix** n'a plus d'effet sur une carte déjà
 * émise, il a été prélevé une fois. Les **plafonds**, eux, sont ceux de la catégorie
 * aujourd'hui — c'est bien la ligne courante que lit `assertCanTopup`, donc un plafond modifié
 * s'applique aussi aux cartes déjà vendues.
 */
export function serializeCardProduct(product: CardProduct) {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    currency_code: product.currencyCode,
    issuance_price: product.issuancePrice.toString(),
    max_balance: product.maxBalance?.toString() ?? null,
    max_active_cards: product.maxActiveCards,
    per_topup_limit: product.perTopupLimit?.toString() ?? null,
    daily_topup_limit: product.dailyTopupLimit?.toString() ?? null,
    monthly_topup_limit: product.monthlyTopupLimit?.toString() ?? null,
    // La référence du fichier est portée par l'URL, et c'est indispensable : elle change à
    // chaque téléversement, alors que l'identifiant de la catégorie, lui, ne bouge jamais. Sans
    // elle, remplacer un visuel laissait une URL identique derrière un cache d'une journée —
    // le serveur renvoyait bien la nouvelle image, personne ne la voyait.
    //
    // Chaque URL désigne désormais un contenu immuable, ce qui rend le cache long non seulement
    // correct mais souhaitable.
    image_url: product.imageRef
      ? `/api/v1/cards/products/${product.id}/image?v=${product.imageRef}`
      : null,
    status: product.status,
  }
}

/** Instantané d'une catégorie pour le journal d'audit, bigint sérialisés. */
function describe(product: CardProduct): Record<string, unknown> {
  return {
    code: product.code,
    name: product.name,
    currency_code: product.currencyCode,
    issuance_price: product.issuancePrice.toString(),
    max_balance: product.maxBalance?.toString() ?? null,
    max_active_cards: product.maxActiveCards,
    per_topup_limit: product.perTopupLimit?.toString() ?? null,
    daily_topup_limit: product.dailyTopupLimit?.toString() ?? null,
    monthly_topup_limit: product.monthlyTopupLimit?.toString() ?? null,
    // La référence, pas les octets : elle change à chaque téléversement, donc l'historique
    // montre qu'un visuel a été posé, remplacé ou retiré, sans stocker d'image dans le journal.
    image_ref: product.imageRef,
    status: product.status,
  }
}

/** Unités mineures → montant lisible, pour les messages rendus à l'utilisateur. */
function formatMinor(minor: bigint, currencyCode: string): string {
  const negative = minor < 0n
  const digits = (negative ? -minor : minor).toString().padStart(3, '0')
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${negative ? '-' : ''}${whole},${digits.slice(-2)} ${currencyCode}`
}
