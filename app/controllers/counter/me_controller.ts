import type { HttpContext } from '@adonisjs/core/http'
import { serializeStaff } from '#controllers/business_dashboard/serialize_institution'

/**
 * Who the signed-in person is at their institution.
 *
 * The one thing a client cannot work out on its own: an ordinary login returns a TumaPlus user,
 * and nothing in it says that this user is a teller at IMF Kivu, posted to its Goma counter. Every
 * screen the staff application shows — and every button it greys out — depends on that answer, so
 * it is served from the same resolution middleware.businessStaff() applies to every counter route.
 */
export default class CounterMeController {
  /** GET /api/v1/business/staff/me */
  async show({ business, businessStaff, response }: HttpContext) {
    await businessStaff.load('user')
    await businessStaff.load('agent')

    return response.ok({
      data: {
        ...serializeStaff(businessStaff),
        business: {
          id: business.id,
          code: business.code,
          name: business.name,
          kind: business.kind,
          status: business.status,
        },
      },
    })
  }
}
