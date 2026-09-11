import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { createHash } from 'node:crypto'

export class IdempotencyConflictException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IdempotencyConflictException'
  }
}

interface IdempotencyIdentity {
  key: string
  actorType: 'user' | 'agent' | 'business'
  actorId: number
  endpoint: string
}

/**
 * Enforces idempotency-key safety for money-moving endpoints, backed by the (previously unused)
 * `idempotency_keys` table.
 *
 * Usage in a controller:
 *   const requestHash = IdempotencyService.hashPayload(payload)
 *   const outcome = await IdempotencyService.begin({ key, actorType: 'user', actorId: user.id, endpoint, requestHash })
 *   if (outcome.replay) return response.status(outcome.status).send(outcome.body)
 *   try {
 *     const result = await doTheThing()
 *     await IdempotencyService.complete(identity, 201, result)
 *     return response.created(result)
 *   } catch (e) {
 *     await IdempotencyService.fail(identity)
 *     throw e
 *   }
 */
export class IdempotencyService {
  static hashPayload(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  }

  /**
   * @throws IdempotencyConflictException if the key is already in progress, or was previously
   *   used with a different request payload.
   */
  static async begin(
    identity: IdempotencyIdentity & { requestHash: string }
  ): Promise<{ replay: false } | { replay: true; status: number; body: any }> {
    const existing = await db
      .query()
      .from('idempotency_keys')
      .where('actor_type', identity.actorType)
      .where('actor_id', identity.actorId)
      .where('key', identity.key)
      .where('endpoint', identity.endpoint)
      .first()

    if (existing) {
      if (existing.request_hash !== identity.requestHash) {
        throw new IdempotencyConflictException(
          'This idempotency key was already used with a different request payload'
        )
      }

      if (existing.status === 'completed') {
        return { replay: true, status: existing.response_status, body: existing.response_body }
      }

      if (existing.status === 'in_progress') {
        throw new IdempotencyConflictException(
          'A request with this idempotency key is already in progress'
        )
      }

      // status === 'failed': the previous attempt never completed, allow a fresh retry.
      await db
        .query()
        .from('idempotency_keys')
        .where('id', existing.id)
        .update({ status: 'in_progress', response_status: null, response_body: null })
      return { replay: false }
    }

    try {
      await db.table('idempotency_keys').insert({
        key: identity.key,
        actor_type: identity.actorType,
        actor_id: identity.actorId,
        endpoint: identity.endpoint,
        request_hash: identity.requestHash,
        status: 'in_progress',
        created_at: new Date(),
        expires_at: DateTime.now().plus({ hours: 24 }).toJSDate(),
      })
    } catch {
      // Unique constraint (actor_type, actor_id, key, endpoint) lost the race to a concurrent
      // request with the same key — treat exactly like the "already exists" branch above.
      throw new IdempotencyConflictException(
        'A request with this idempotency key is already in progress'
      )
    }

    return { replay: false }
  }

  static async complete(identity: IdempotencyIdentity, status: number, body: any): Promise<void> {
    await db
      .query()
      .from('idempotency_keys')
      .where('actor_type', identity.actorType)
      .where('actor_id', identity.actorId)
      .where('key', identity.key)
      .where('endpoint', identity.endpoint)
      .update({ status: 'completed', response_status: status, response_body: body })
  }

  static async fail(identity: IdempotencyIdentity): Promise<void> {
    await db
      .query()
      .from('idempotency_keys')
      .where('actor_type', identity.actorType)
      .where('actor_id', identity.actorId)
      .where('key', identity.key)
      .where('endpoint', identity.endpoint)
      .update({ status: 'failed' })
  }
}
