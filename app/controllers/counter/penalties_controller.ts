import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'
import { PenaltyService } from '#services/lending/penalty_service'

const runPenaltiesValidator = vine.compile(
  vine.object({
    period: vine.string().regex(/^\d{4}-\d{2}$/).optional(),
  })
)

export default class PenaltiesController {
  /** POST /api/v1/counter/penalties/run */
  async run({ request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(runPenaltiesValidator)
    const period = payload.period
      ? DateTime.fromFormat(payload.period, 'yyyy-MM')
      : DateTime.now()

    const outcome = await PenaltyService.runForPeriod(period, correlationId)

    return response.ok({
      data: {
        period: PenaltyService.periodKeyFor(period),
        loans_considered: outcome.loansConsidered,
        loans_charged: outcome.loansCharged,
        total_charged: outcome.totalCharged.toString(),
      },
    })
  }
}
