import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import type User from '#models/user'
import type LikilibaMessage from '#models/likiliba_message'
import { LikilibaAttachmentStorageService } from '#services/likiliba/attachment_storage_service'
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

/**
 * Sends the photo, voice message or file of a message. Photos and voice messages are played
 * inline; every other file is a download
 * (`attachment` disposition, `nosniff`), so a document can never be rendered as a page.
 */
export async function serveAttachment(response: HttpContext['response'], message: LikilibaMessage) {
  const bytes = await LikilibaAttachmentStorageService.retrieve(message.attachmentRef!)
  const mimeType = message.attachmentMimeType ?? 'application/octet-stream'
  const name = (message.attachmentName ?? 'fichier').replace(/["\\\r\n]/g, '_')
  response.header('Content-Type', mimeType)
  response.header('X-Content-Type-Options', 'nosniff')
  response.header(
    'Content-Disposition',
    `${message.kind === 'file' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`
  )
  response.header('Cache-Control', 'private, max-age=86400')
  return response.send(bytes)
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
