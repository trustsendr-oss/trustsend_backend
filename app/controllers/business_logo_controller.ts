import type { HttpContext } from '@adonisjs/core/http'
import { readFile } from 'node:fs/promises'
import Business from '#models/business'
import type InternalUser from '#models/internal_user'
import {
  ALLOWED_LOGO_EXTENSIONS,
  BusinessLogoService,
  InvalidLogoException,
  MAX_LOGO_SIZE_BYTES,
} from '#services/business/business_logo_service'

/** Reads the `image` field; `undefined` when nothing was sent. */
async function readLogo(request: HttpContext['request']): Promise<Buffer | undefined> {
  const file = request.file('image', {
    size: MAX_LOGO_SIZE_BYTES,
    extnames: [...ALLOWED_LOGO_EXTENSIONS],
  })
  if (!file) return undefined
  if (!file.isValid) {
    throw new InvalidLogoException(file.errors.map((error) => error.message).join(', '))
  }
  return readFile(file.tmpPath!)
}

/**
 * Institution logos: uploaded by the institution from its dashboard, or by Reemite staff from
 * the admin panel; read by anyone, like the catalogue of offers they appear in.
 */
export default class BusinessLogoController {
  /** GET /api/v1/finance/institutions/:id/logo — public. */
  async show({ params, response }: HttpContext) {
    const business = await Business.find(Number(params.id))
    if (!business?.logoRef) return response.notFound({ message: 'No logo' })

    const bytes = await BusinessLogoService.retrieve(business.logoRef)
    response.header('Content-Type', business.logoMimeType ?? 'application/octet-stream')
    // The URL carries a version of the file: a long cache never shows a replaced logo.
    response.header('Cache-Control', 'public, max-age=604800')
    return response.send(bytes)
  }

  /** POST /api/v1/businesses/:id/logo — Reemite staff. */
  async adminUpload({ auth, params, request, response, correlationId }: HttpContext) {
    const staff = auth.getUserOrFail() as InternalUser
    const business = await Business.findOrFail(Number(params.id))
    return this.upload(
      business,
      { type: 'internal_user', id: staff.id },
      request,
      response,
      correlationId
    )
  }

  /** DELETE /api/v1/businesses/:id/logo — Reemite staff. */
  async adminRemove({ auth, params, response, correlationId }: HttpContext) {
    const staff = auth.getUserOrFail() as InternalUser
    const business = await Business.findOrFail(Number(params.id))
    await BusinessLogoService.remove(
      business,
      { type: 'internal_user', id: staff.id },
      correlationId
    )
    return response.ok({ data: { logo_url: null } })
  }

  /** POST /api/v1/business/dashboard/profile/logo — the institution itself. */
  async dashboardUpload({ business, request, response, correlationId }: HttpContext) {
    return this.upload(
      business,
      { type: 'business', id: business.id },
      request,
      response,
      correlationId
    )
  }

  /** DELETE /api/v1/business/dashboard/profile/logo */
  async dashboardRemove({ business, response, correlationId }: HttpContext) {
    await BusinessLogoService.remove(business, { type: 'business', id: business.id }, correlationId)
    return response.ok({ data: { logo_url: null } })
  }

  private async upload(
    business: Business,
    actor: { type: 'business' | 'internal_user'; id: number },
    request: HttpContext['request'],
    response: HttpContext['response'],
    correlationId: string
  ) {
    try {
      const bytes = await readLogo(request)
      if (!bytes) {
        return response.badRequest({ code: 'LOGO_MISSING', message: 'No image was sent' })
      }
      await BusinessLogoService.set(business, bytes, actor, correlationId)
      return response.ok({ data: { logo_url: BusinessLogoService.urlOf(business) } })
    } catch (error) {
      if (error instanceof InvalidLogoException) {
        return response.unprocessableEntity({ code: 'LOGO_INVALID', message: error.message })
      }
      throw error
    }
  }
}
