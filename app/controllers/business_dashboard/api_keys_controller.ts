import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { BusinessApiKeyService } from '#services/business/business_api_key_service'

/**
 * Self-service API key management from the dashboard — same BusinessApiKeyService the admin
 * controller (businesses_controller.ts) uses, just scoped to ctx.business instead of an
 * admin-supplied business id.
 */
export default class BusinessDashboardApiKeysController {
  /**
   * GET /api/v1/business/dashboard/api-keys
   * Never returns the key itself — only what's needed to identify/manage it.
   */
  async index({ business, response }: HttpContext) {
    const keys = await db
      .from('business_api_keys')
      .where('business_id', business.id)
      .select('id', 'key_prefix', 'status', 'last_used_at', 'created_at', 'revoked_at')
      .orderBy('created_at', 'desc')

    return response.ok({
      data: keys.map((k) => ({
        id: k.id,
        key_prefix: k.key_prefix,
        status: k.status,
        last_used_at: k.last_used_at,
        created_at: k.created_at,
        revoked_at: k.revoked_at,
      })),
    })
  }

  /**
   * POST /api/v1/business/dashboard/api-keys
   * The full key is returned ONLY here — store it now, it cannot be retrieved again.
   */
  async store({ business, correlationId, response }: HttpContext) {
    const { apiKey, keyId } = await BusinessApiKeyService.generate(
      business.id,
      business.id,
      correlationId,
      'business'
    )

    return response.created({
      data: {
        key_id: keyId,
        api_key: apiKey,
        message: 'Store this key now — it cannot be retrieved again. Only its hash is kept.',
      },
    })
  }

  /**
   * DELETE /api/v1/business/dashboard/api-keys/:id
   */
  async destroy({ business, params, correlationId, response }: HttpContext) {
    const key = await db
      .from('business_api_keys')
      .where('id', params.id)
      .where('business_id', business.id)
      .first()

    if (!key) {
      return response.notFound({ message: 'API key not found' })
    }

    await BusinessApiKeyService.revoke(Number(params.id), business.id, correlationId, 'business')
    return response.ok({ message: 'API key revoked' })
  }
}
