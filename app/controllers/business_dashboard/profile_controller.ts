import type { HttpContext } from '@adonisjs/core/http'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { PinService } from '#services/security/pin_service'
import { SandboxMode } from '#services/sandbox/sandbox_mode'
import { updateBusinessProfileValidator } from '#validators/business_dashboard'

export default class BusinessDashboardProfileController {
  /**
   * GET /api/v1/business/dashboard/profile
   */
  async show({ business, response }: HttpContext) {
    return response.ok({
      data: {
        id: business.id,
        code: business.code,
        name: business.name,
        email: business.email,
        phone: business.phone,
        status: business.status,
        webhook_url: business.webhookUrl,
        pin_set: PinService.isPinSet(business),
        // Lets the dashboard confirm it is talking to the API it thinks it is (sandbox vs
        // production) instead of trusting its own hostname alone.
        environment: SandboxMode.isEnabled() ? 'sandbox' : 'production',
        created_at: business.createdAt,
      },
    })
  }

  /**
   * PATCH /api/v1/business/dashboard/profile
   * Email is deliberately NOT editable here — changing it is an admin action, to avoid a
   * compromised dashboard token being used to silently redirect account-recovery email.
   */
  async update({ business, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(updateBusinessProfileValidator)

    const before = { name: business.name, phone: business.phone, webhook_url: business.webhookUrl }

    business.merge({
      name: payload.name,
      phone: payload.phone,
      webhookUrl: payload.webhook_url,
    })
    await business.save()

    await AuditLoggerService.record({
      actorType: 'business',
      actorId: business.id,
      action: 'business.profile_updated',
      resourceType: 'business',
      resourceId: business.id,
      before,
      after: { name: business.name, phone: business.phone, webhook_url: business.webhookUrl },
      correlationId,
    })

    return response.ok({
      data: {
        id: business.id,
        name: business.name,
        phone: business.phone,
        webhook_url: business.webhookUrl,
        updated_at: business.updatedAt,
      },
    })
  }
}
