import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import type User from '#models/user'
import { PinService } from '#services/security/pin_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import { LikilibaException } from '#services/likiliba/shared'

/** Maps service refusals to responses; anything else is a real error and propagates. */
export function likilibaError(error: unknown, response: HttpContext['response']) {
  if (error instanceof LikilibaException) {
    return response.status(error.status).send({ code: error.code, message: error.message })
  }
  const name = (error as Error)?.name
  if (name === 'FundsReservedException') {
    return response.paymentRequired({ code: 'FUNDS_RESERVED', message: (error as Error).message })
  }
  if (name === 'TransactionLimitExceededException') {
    return response.badRequest({ code: 'LIMIT_EXCEEDED', message: (error as Error).message })
  }
  throw error
}

export function parseDate(value: string, field: string): DateTime {
  const parsed = DateTime.fromISO(value, { setZone: true })
  if (!parsed.isValid) {
    throw new LikilibaException(`${field} must be an ISO 8601 date`, 'INVALID_DATE')
  }
  return parsed
}

/** The PIN guards every action that moves money or binds the member. */
export async function assertPin(user: User, pin: string) {
  const check = await PinService.verifyPin(user, pin)
  if (!check.valid) {
    throw new LikilibaException(check.message, check.code, 401)
  }
}

/**
 * Runs a money-moving action at most once per idempotency key: a retry on a flaky network replays
 * the first answer instead of paying twice. The PIN never enters the request hash.
 */
export async function idempotent(
  ctx: HttpContext,
  user: User,
  endpoint: string,
  payload: { idempotency_key: string } & Record<string, unknown>,
  status: number,
  action: () => Promise<Record<string, unknown>>
) {
  const { response } = ctx
  const identity = {
    key: payload.idempotency_key,
    actorType: 'user' as const,
    actorId: user.id,
    endpoint,
  }
  try {
    const outcome = await IdempotencyService.begin({
      ...identity,
      requestHash: IdempotencyService.hashPayload({ ...payload, pin: undefined }),
    })
    if (outcome.replay) return response.status(outcome.status).send(outcome.body)
  } catch (error) {
    if ((error as Error).name === 'IdempotencyConflictException') {
      return response.conflict({ code: 'IDEMPOTENCY_CONFLICT', message: (error as Error).message })
    }
    throw error
  }

  try {
    const body = await action()
    await IdempotencyService.complete(identity, status, body)
    return response.status(status).send(body)
  } catch (error) {
    await IdempotencyService.fail(identity)
    return likilibaError(error, response)
  }
}
