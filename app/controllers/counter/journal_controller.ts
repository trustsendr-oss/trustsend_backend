import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import {
  InstitutionJournalService,
  JOURNAL_TYPES,
} from '#services/counter/institution_journal_service'

export const journalValidator = vine.create({
  page: vine.number().positive().min(1).optional(),
  limit: vine.number().positive().min(1).max(100).optional(),
  type: vine.enum(JOURNAL_TYPES).optional(),
  agent_id: vine.number().positive().optional(),
  search: vine.string().trim().maxLength(64).optional(),
})

/**
 * The institution's journal — cash at its counters, savings and loan movements — through either
 * door onto ctx.business: counter/transactions for staff, business/dashboard/journal for
 * management. Both read the same rows; see institution_journal_service.ts for how they are
 * scoped to one institution.
 */
export default class CounterJournalController {
  /** GET /api/v1/counter/transactions and /api/v1/business/dashboard/journal */
  async index({ business, request, response }: HttpContext) {
    const payload = await request.validateUsing(journalValidator)
    const result = await InstitutionJournalService.list(business.id, {
      page: payload.page ?? 1,
      limit: payload.limit ?? 50,
      type: payload.type,
      agentId: payload.agent_id,
      search: payload.search,
    })
    return response.ok(result)
  }
}
