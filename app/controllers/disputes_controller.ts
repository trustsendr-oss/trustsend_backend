import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Dispute from '#models/dispute'
import DisputeMessage from '#models/dispute_message'
import LedgerTransaction from '#models/ledger_transaction'
import type InternalUser from '#models/internal_user'
import Wallet from '#models/wallet'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { LedgerService } from '#services/ledger/ledger_service'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import vine from '@vinejs/vine'

const createDisputeValidator = vine.create({
  transaction_id: vine.string().regex(/^[A-Z]+-[A-Z0-9]{8}$/), // TXN-XXXXXXXX format
  reason: vine.string().minLength(10).maxLength(500),
})

const messageValidator = vine.create({
  body: vine.string().minLength(2).maxLength(2000),
})

const closeValidator = vine.create({
  outcome: vine.enum(['approved', 'rejected']),
  resolution_notes: vine.string().minLength(10).maxLength(1000),
})

/** États dans lesquels un dossier ne se discute plus. */
const CLOSED_DISPUTE_STATUSES = ['approved', 'rejected', 'resolved', 'withdrawn']

const VALID_DISPUTE_STATUSES = ['opened', 'investigating', 'approved', 'rejected', 'resolved']
const VALID_RAISED_BY_TYPES = ['user', 'agent', 'internal_user']

export default class DisputesController {
  /**
   * cash-in/cash-out/mobile-money transactions are tracked via a "pending → completed" row
   * that is distinct from the actual double-entry LedgerTransaction posted once confirmed (see
   * cash_in_service.ts confirm() for why) — the latter is what carries real ledger_entries and
   * is what ownership checks and reversals must resolve against. P2P transfers post directly,
   * so their own id already IS the one with entries — this just falls through to it.
   */
  private resolvePostedTransactionId(txn: LedgerTransaction): string {
    return (txn.metadata as any)?.posted_transaction_id || txn.id
  }
  /**
   * La réclamation, si elle appartient bien à l'appelant.
   *
   * Regroupé ici parce que trois actions en ont besoin et que l'oublier sur l'une d'elles
   * laisserait n'importe qui lire ou commenter le dossier d'autrui.
   */
  private async requireOwnDispute(userId: number, id: string) {
    const dispute = await Dispute.find(id)
    if (!dispute) return { dispute: null, denied: 'not_found' as const }
    if (dispute.raisedByType !== 'user' || dispute.raisedById !== userId) {
      return { dispute: null, denied: 'forbidden' as const }
    }
    return { dispute, denied: null }
  }

  /**
   * GET /api/v1/disputes/all/:id/messages (personnel)
   *
   * Même fil, vu du support. `mine` s'inverse : ce qui est « à moi » dépend de qui regarde.
   */
  async adminMessages({ params, response }: HttpContext) {
    const messages = await DisputeMessage.query()
      .where('dispute_id', params.id)
      .orderBy('created_at', 'asc')

    return response.ok({
      data: messages.map((message) => ({
        id: message.id,
        author_type: message.authorType,
        mine: message.authorType === 'internal_user',
        body: message.body,
        created_at: message.createdAt,
      })),
    })
  }

  /**
   * POST /api/v1/disputes/all/:id/messages (personnel)
   *
   * Le client est prévenu dans l'application : sans notification, une réponse resterait
   * invisible jusqu'à ce qu'il pense à rouvrir son dossier.
   */
  async adminPostMessage({ auth, params, request, response }: HttpContext) {
    const staff = (await auth.authenticateUsing(['internal'])) as InternalUser

    const dispute = await Dispute.find(params.id)
    if (!dispute) return response.notFound({ message: 'Dispute not found' })

    const payload = await request.validateUsing(messageValidator)

    const message = await DisputeMessage.create({
      disputeId: dispute.id,
      authorType: 'internal_user',
      authorId: staff.id,
      body: payload.body.trim(),
    })

    if (dispute.raisedByType === 'user') {
      await InAppNotificationService.notify({
        recipientType: 'user',
        recipientId: dispute.raisedById,
        type: 'dispute.replied',
        title: 'Réponse à votre réclamation',
        message: payload.body.trim().slice(0, 160),
        data: { dispute_id: dispute.id },
      })
    }

    return response.created({
      data: {
        id: message.id,
        author_type: message.authorType,
        mine: true,
        body: message.body,
        created_at: message.createdAt,
      },
    })
  }

  /**
   * GET /api/v1/disputes/:id/messages
   * Le fil complet, du plus ancien au plus récent — l'ordre d'une conversation.
   */
  async messages({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    const { dispute, denied } = await this.requireOwnDispute(user.id, params.id)
    if (denied === 'not_found') return response.notFound({ message: 'Dispute not found' })
    if (denied) return response.forbidden({ message: 'Access denied' })

    const messages = await DisputeMessage.query()
      .where('dispute_id', dispute!.id)
      .orderBy('created_at', 'asc')

    return response.ok({
      data: messages.map((message) => ({
        id: message.id,
        author_type: message.authorType,
        // Ni nom ni identifiant du personnel : le client n'a pas à savoir QUI lui répond, et
        // l'exposer identifierait nominativement des agents du support.
        mine: message.authorType === 'user',
        body: message.body,
        created_at: message.createdAt,
      })),
    })
  }

  /**
   * POST /api/v1/disputes/:id/messages
   *
   * Refusé sur un dossier clos : rouvrir une discussion tranchée demande une nouvelle
   * réclamation, sinon un fil pourrait reprendre indéfiniment après décision.
   */
  async postMessage({ auth, params, request, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    const { dispute, denied } = await this.requireOwnDispute(user.id, params.id)
    if (denied === 'not_found') return response.notFound({ message: 'Dispute not found' })
    if (denied) return response.forbidden({ message: 'Access denied' })

    if (CLOSED_DISPUTE_STATUSES.includes(dispute!.status)) {
      return response.conflict({
        message: 'Cette réclamation est clôturée. Ouvrez-en une nouvelle si le problème persiste.',
      })
    }

    const payload = await request.validateUsing(messageValidator)

    const message = await DisputeMessage.create({
      disputeId: dispute!.id,
      authorType: 'user',
      authorId: user.id,
      body: payload.body.trim(),
    })

    return response.created({
      data: {
        id: message.id,
        author_type: message.authorType,
        mine: true,
        body: message.body,
        created_at: message.createdAt,
      },
    })
  }

  /**
   * POST /api/v1/disputes/:id/withdraw
   *
   * Le client renonce à sa réclamation. Distinct de `close`, réservé au personnel : celui-ci
   * tranche (`approved`/`rejected`), le client abandonne. Les confondre effacerait la différence
   * entre un dossier jugé et un dossier retiré.
   *
   * Aucune contre-passation n'est déclenchée : renoncer, c'est précisément ne rien réclamer.
   */
  async withdraw({ auth, params, request, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    const { dispute, denied } = await this.requireOwnDispute(user.id, params.id)
    if (denied === 'not_found') return response.notFound({ message: 'Dispute not found' })
    if (denied) return response.forbidden({ message: 'Access denied' })

    if (CLOSED_DISPUTE_STATUSES.includes(dispute!.status)) {
      return response.conflict({ message: 'Cette réclamation est déjà clôturée' })
    }

    const before = { status: dispute!.status }
    dispute!.status = 'withdrawn'
    dispute!.resolvedAt = DateTime.now()
    await dispute!.save()

    await AuditLoggerService.record({
      actorType: 'user',
      actorId: user.id,
      action: 'dispute.withdrawn',
      resourceType: 'dispute',
      resourceId: dispute!.id,
      before,
      after: { status: dispute!.status },
      correlationId: (request as any).correlationId || 'unknown',
    })

    return response.ok({
      data: { dispute_id: dispute!.id, status: dispute!.status, resolved_at: dispute!.resolvedAt },
    })
  }

  /**
   * GET /api/v1/disputes
   * List disputes for authenticated user
   */
  async index({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const disputes = await Dispute.query()
      .where('raised_by_type', 'user')
      .where('raised_by_id', user.id)
      .orderBy('created_at', 'desc')

    // L'opération contestée, jointe à la réclamation.
    //
    // Sans elle, une liste de litiges n'affiche que « TXN-9C06MFJE » : le porteur ne reconnaît
    // pas ce qu'il conteste, et doit ouvrir chaque ligne pour s'en souvenir. Chargée en une
    // seule requête plutôt qu'une par litige.
    const ids = [...new Set(disputes.map((d) => d.ledgerTransactionId))]
    const transactions = ids.length ? await LedgerTransaction.query().whereIn('id', ids) : []
    const byId = new Map(transactions.map((t) => [t.id, t]))

    return response.ok({
      data: disputes.map((dispute) => {
        const txn = byId.get(dispute.ledgerTransactionId)
        return {
          id: dispute.id,
          ledger_transaction_id: dispute.ledgerTransactionId,
          reason: dispute.reason,
          status: dispute.status,
          // `resolution_notes` manquait ici alors que show() le renvoyait : le motif d'une
          // décision est précisément ce qu'on veut lire sans avoir à ouvrir le détail.
          resolution_notes: dispute.resolutionNotes,
          opened_at: dispute.openedAt,
          resolved_at: dispute.resolvedAt,
          transaction: txn
            ? {
                type: txn.type,
                amount: txn.amount?.toString() ?? null,
                currency_code: txn.currencyCode,
                created_at: txn.createdAt,
              }
            : null,
        }
      }),
    })
  }

  /**
   * GET /api/v1/disputes/all?status=opened&raised_by_type=user (admin only)
   * Discovery — index() above only ever shows the CALLING user's own disputes (a plain user
   * token has no way to see anyone else's), and close() acts on an id an admin must already
   * know. Without this there was no way to find out which disputes exist to review at all — the
   * common "what's waiting on me" view is `?status=opened` (investigating also counts as open,
   * not yet closed one way or the other).
   */
  async listAll({ auth, request, response }: HttpContext) {
    await auth.authenticateUsing(['internal'])

    const status = request.input('status') as string | undefined
    if (status && !VALID_DISPUTE_STATUSES.includes(status)) {
      return response.badRequest({ message: `Invalid status filter: ${status}` })
    }

    const raisedByType = request.input('raised_by_type') as string | undefined
    if (raisedByType && !VALID_RAISED_BY_TYPES.includes(raisedByType)) {
      return response.badRequest({ message: `Invalid raised_by_type filter: ${raisedByType}` })
    }

    const query = Dispute.query().orderBy('opened_at', 'desc')
    if (status) query.where('status', status)
    if (raisedByType) query.where('raised_by_type', raisedByType)

    const disputes = await query

    return response.ok({
      data: disputes.map((dispute) => ({
        id: dispute.id,
        ledger_transaction_id: dispute.ledgerTransactionId,
        raised_by_type: dispute.raisedByType,
        raised_by_id: dispute.raisedById,
        reason: dispute.reason,
        status: dispute.status,
        assigned_to: dispute.assignedTo,
        resolution_notes: dispute.resolutionNotes,
        opened_at: dispute.openedAt,
        resolved_at: dispute.resolvedAt,
      })),
    })
  }

  /**
   * GET /api/v1/disputes/all/:id (admin only)
   * Single-record detail for the admin view — show() below is scoped to the raising user (auth.
   * user, default guard) and 403s anyone else, so it can't be reused for an admin looking up any
   * dispute by id. Registered under all/ rather than reusing :id (see listAll's own comment above
   * about the 'all' literal segment) so it never collides with the self-service show route.
   */
  async adminShow({ auth, params, response }: HttpContext) {
    await auth.authenticateUsing(['internal'])
    const dispute = await Dispute.findOrFail(params.id)

    return response.ok({
      data: {
        id: dispute.id,
        ledger_transaction_id: dispute.ledgerTransactionId,
        raised_by_type: dispute.raisedByType,
        raised_by_id: dispute.raisedById,
        reason: dispute.reason,
        status: dispute.status,
        assigned_to: dispute.assignedTo,
        resolution_notes: dispute.resolutionNotes,
        opened_at: dispute.openedAt,
        resolved_at: dispute.resolvedAt,
      },
    })
  }

  /**
   * POST /api/v1/disputes
   * File a dispute against a transaction
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const payload = await request.validateUsing(createDisputeValidator)

    try {
      // Verify transaction exists
      const txn = await LedgerTransaction.findOrFail(payload.transaction_id)

      // Verify the caller is actually a party to this transaction (owns one of the wallets
      // debited or credited by it) — otherwise anyone could open a dispute on anyone's transfer.
      const userWalletIds = (await Wallet.query().where('user_id', user.id).select('id')).map(
        (w) => w.id
      )
      const postedTransactionId = this.resolvePostedTransactionId(txn)
      const isParty =
        userWalletIds.length > 0 &&
        (await db
          .query()
          .from('ledger_entries as le')
          .join('ledger_accounts as la', 'la.id', 'le.ledger_account_id')
          .where('le.ledger_transaction_id', postedTransactionId)
          .whereIn('la.owner_id', userWalletIds)
          .where('la.owner_type', 'user_wallet')
          .first())

      if (!isParty) {
        return response.forbidden({ message: 'You are not a party to this transaction' })
      }

      // Check if dispute already exists for this transaction
      const existing = await Dispute.query()
        .where('ledger_transaction_id', txn.id)
        .where('raised_by_id', user.id)
        .where('status', '!=', 'resolved')
        .first()

      if (existing) {
        return response.badRequest({
          message: 'Active dispute already exists for this transaction',
        })
      }

      const dispute = new Dispute()
      dispute.ledgerTransactionId = txn.id
      dispute.reason = payload.reason
      dispute.status = 'opened'
      dispute.raisedByType = 'user'
      dispute.raisedById = user.id
      dispute.openedAt = DateTime.now()

      await dispute.save()

      return response.created({
        data: {
          dispute_id: dispute.id,
          transaction_id: dispute.ledgerTransactionId,
          status: dispute.status,
          opened_at: dispute.openedAt,
        },
      })
    } catch (error) {
      const err = error as any
      return response.internalServerError({ message: err.message || 'Dispute filing failed' })
    }
  }

  /**
   * GET /api/v1/disputes/:id
   * Get dispute details
   */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const dispute = await Dispute.findOrFail(params.id)

    // Verify user is the one who raised the dispute
    if (dispute.raisedById !== user.id) {
      return response.forbidden({ message: 'Access denied' })
    }

    return response.ok({
      data: {
        dispute_id: dispute.id,
        transaction_id: dispute.ledgerTransactionId,
        reason: dispute.reason,
        status: dispute.status,
        resolution_notes: dispute.resolutionNotes,
        opened_at: dispute.openedAt,
        resolved_at: dispute.resolvedAt,
      },
    })
  }

  /**
   * POST /api/v1/disputes/:id/close
   * Close a dispute (admin only)
   */
  async close({ auth, params, request, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser

    const dispute = await Dispute.findOrFail(params.id)

    const { outcome, resolution_notes } = await request.validateUsing(closeValidator)

    if (dispute.status === 'resolved' || dispute.status === 'rejected') {
      return response.badRequest({ message: 'Dispute already closed' })
    }

    try {
      const beforeData = { status: dispute.status }
      const correlationId = (params as any).correlationId || 'unknown'

      if (outcome === 'approved') {
        const originalTxn = await LedgerTransaction.findOrFail(dispute.ledgerTransactionId)
        const reversalTxn = await LedgerService.reverseTransaction(
          this.resolvePostedTransactionId(originalTxn),
          'internal_user',
          user.id,
          {
            correlationId,
            description: `Reversal for dispute ${dispute.id}: ${resolution_notes}`,
          }
        )
        dispute.resolutionTransactionId = reversalTxn.id
        dispute.status = 'resolved'
      } else {
        dispute.status = 'rejected'
      }

      dispute.resolvedAt = DateTime.now()
      dispute.resolutionNotes = resolution_notes
      dispute.assignedTo = user.id
      await dispute.save()

      // ✅ Add audit logging
      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: user.id,
        action: 'dispute.closed',
        resourceType: 'dispute',
        resourceId: dispute.id,
        before: beforeData,
        after: { status: dispute.status, outcome, resolved_by: user.id, notes: resolution_notes },
        correlationId,
      })

      return response.ok({
        data: {
          dispute_id: dispute.id,
          status: dispute.status,
          resolved_at: dispute.resolvedAt,
          resolved_by: user.id,
        },
      })
    } catch (error) {
      const err = error as any
      return response.internalServerError({ message: err.message || 'Close failed' })
    }
  }
}
