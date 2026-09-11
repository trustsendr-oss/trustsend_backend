import { readFile } from 'node:fs/promises'
import type { HttpContext } from '@adonisjs/core/http'
import type InternalUser from '#models/internal_user'
import CardProduct from '#models/card_product'
import {
  CardProductService,
  CardProductCodeTakenException,
  CardProductNotFoundException,
  serializeCardProduct,
} from '#services/cards/card_product_service'
import {
  CardArtStorageService,
  InvalidCardArtException,
  ALLOWED_CARD_ART_EXTENSIONS,
  MAX_CARD_ART_SIZE_BYTES,
} from '#services/cards/card_art_storage_service'
import vine from '@vinejs/vine'

// Montants en chaîne et non en nombre, même convention que les forfaits et le mobile money :
// ce sont des bigint en unité mineure, qu'un `number` JavaScript ne porte pas sans perte.
const moneyAmount = vine.string().regex(/^(0|[1-9]\d*)$/)
// `null` explicite signifie « retirer le plafond » ; absent signifie « ne pas y toucher ».
const optionalLimit = moneyAmount.nullable().optional()

const createCardProductValidator = vine.create({
  code: vine.string().minLength(2).maxLength(50),
  name: vine.string().minLength(2).maxLength(255),
  description: vine.string().maxLength(1000).optional(),
  currency_code: vine.string().fixedLength(3).optional(),
  issuance_price: moneyAmount.optional(),
  max_balance: optionalLimit,
  max_active_cards: vine.number().positive().nullable().optional(),
  per_topup_limit: optionalLimit,
  daily_topup_limit: optionalLimit,
  monthly_topup_limit: optionalLimit,
})

const updateCardProductValidator = vine.create({
  name: vine.string().minLength(2).maxLength(255).optional(),
  description: vine.string().maxLength(1000).optional(),
  issuance_price: moneyAmount.optional(),
  max_balance: optionalLimit,
  max_active_cards: vine.number().positive().nullable().optional(),
  per_topup_limit: optionalLimit,
  daily_topup_limit: optionalLimit,
  monthly_topup_limit: optionalLimit,
})

/** `null` traverse tel quel ; `undefined` veut dire « champ absent, ne rien changer ». */
function toBigInt(value: string | null | undefined): bigint | null | undefined {
  if (value === undefined) return undefined
  return value === null ? null : BigInt(value)
}

/**
 * Lit le visuel joint à la requête, s'il y en a un.
 *
 * Le champ est facultatif : créer une catégorie sans image doit rester possible, quitte à la
 * téléverser ensuite. `undefined` veut dire « aucun fichier envoyé », à distinguer d'un fichier
 * envoyé mais refusé, qui lève.
 */
async function readUploadedArt(request: HttpContext['request']): Promise<Buffer | undefined> {
  const file = request.file('image', {
    size: MAX_CARD_ART_SIZE_BYTES,
    extnames: [...ALLOWED_CARD_ART_EXTENSIONS],
  })
  if (!file) return undefined
  if (!file.isValid) {
    throw new InvalidCardArtException(file.errors.map((error) => error.message).join(', '))
  }
  return readFile(file.tmpPath!)
}

/**
 * Le catalogue ajoute les horodatages à la forme partagée : le personnel a besoin de savoir
 * quand une catégorie a été créée ou retouchée, un porteur de carte non.
 */
function serialize(product: CardProduct) {
  return {
    ...serializeCardProduct(product),
    created_at: product.createdAt,
    updated_at: product.updatedAt,
  }
}

/**
 * Le catalogue des cartes.
 *
 * `catalogue()` est ouvert à tout client authentifié — c'est la vitrine, sans laquelle personne
 * ne peut savoir ce qu'il achète. Les autres actions sont réservées au personnel : elles fixent
 * les prix.
 */
export default class CardProductsController {
  /**
   * GET /api/v1/cards/products
   *
   * Uniquement les catégories en vente. Une catégorie archivée n'est pas masquée par erreur :
   * elle a été retirée délibérément et ne doit plus être proposée.
   */
  async catalogue({ response }: HttpContext) {
    const products = await CardProductService.listAvailable()
    return response.ok({ data: products.map(serialize) })
  }

  /** GET /api/v1/card-products (personnel) — archives comprises. */
  async index({ response }: HttpContext) {
    const products = await CardProductService.list()
    return response.ok({ data: products.map(serialize) })
  }

  /** GET /api/v1/card-products/:id (personnel) */
  async show({ params, response }: HttpContext) {
    try {
      const product = await CardProductService.findByIdOrFail(Number(params.id))
      return response.ok({ data: serialize(product) })
    } catch (error) {
      if (error instanceof CardProductNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }

  /** POST /api/v1/card-products (personnel) */
  async store({ auth, request, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const payload = await request.validateUsing(createCardProductValidator)
    const art = await readUploadedArt(request)

    try {
      const product = await CardProductService.create(
        {
          code: payload.code,
          name: payload.name,
          description: payload.description,
          currencyCode: payload.currency_code,
          issuancePrice: toBigInt(payload.issuance_price) ?? undefined,
          maxBalance: toBigInt(payload.max_balance),
          maxActiveCards: payload.max_active_cards,
          perTopupLimit: toBigInt(payload.per_topup_limit),
          dailyTopupLimit: toBigInt(payload.daily_topup_limit),
          monthlyTopupLimit: toBigInt(payload.monthly_topup_limit),
        },
        user.id,
        correlationId
      )
      if (art) await CardProductService.setImage(product, art)
      return response.created({ data: serialize(product) })
    } catch (error) {
      if (error instanceof CardProductCodeTakenException) {
        return response.conflict({ message: error.message })
      }
      if (error instanceof InvalidCardArtException) {
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  /** PATCH /api/v1/card-products/:id (personnel) */
  async update({ auth, params, request, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const payload = await request.validateUsing(updateCardProductValidator)
    const art = await readUploadedArt(request)

    try {
      const product = await CardProductService.update(
        Number(params.id),
        {
          name: payload.name,
          description: payload.description,
          issuancePrice: toBigInt(payload.issuance_price) ?? undefined,
          maxBalance: toBigInt(payload.max_balance),
          maxActiveCards: payload.max_active_cards,
          perTopupLimit: toBigInt(payload.per_topup_limit),
          dailyTopupLimit: toBigInt(payload.daily_topup_limit),
          monthlyTopupLimit: toBigInt(payload.monthly_topup_limit),
        },
        user.id,
        correlationId
      )
      if (art) await CardProductService.setImage(product, art)
      return response.ok({ data: serialize(product) })
    } catch (error) {
      if (error instanceof CardProductNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }

  /**
   * GET /api/v1/cards/products/:id/image — **publique**.
   *
   * Un visuel de catalogue n'est pas une donnée client : le rendre public permet au chargeur
   * d'images de l'application de le récupérer et de le mettre en cache comme n'importe quelle
   * image, sans avoir à y joindre un jeton. La référence du fichier reste un UUID opaque, donc
   * rien n'est énumérable pour autant.
   */
  async image({ params, response }: HttpContext) {
    const product = await CardProduct.find(Number(params.id))
    if (!product?.imageRef) {
      return response.notFound({ message: 'No image for this card category' })
    }

    const bytes = await CardArtStorageService.retrieve(product.imageRef)
    response.header('Content-Type', product.imageMimeType ?? 'application/octet-stream')
    // Le visuel ne change qu'au téléversement d'un remplaçant, et l'URL porte l'identifiant de
    // la catégorie : un cache long évite de le retélécharger à chaque ouverture de l'écran.
    response.header('Cache-Control', 'public, max-age=86400')
    return response.send(bytes)
  }

  /**
   * DELETE /api/v1/card-products/:id/image (personnel)
   *
   * Retire le visuel sans toucher au reste : la catégorie reste en vente, les cartes déjà
   * émises gardent leurs conditions, et l'écran retombe sur son rendu par défaut.
   */
  async destroyImage({ auth, params, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser

    try {
      const product = await CardProductService.clearImage(Number(params.id), user.id, correlationId)
      return response.ok({ data: serialize(product) })
    } catch (error) {
      if (error instanceof CardProductNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }

  /** POST /api/v1/card-products/:id/archive (personnel) */
  async archive({ auth, params, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser

    try {
      const product = await CardProductService.archive(Number(params.id), user.id, correlationId)
      return response.ok({ data: serialize(product) })
    } catch (error) {
      if (error instanceof CardProductNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }
}
