import { createHash } from 'node:crypto'
import { type DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Likiliba from '#models/likiliba'
import KycVerification from '#models/kyc_verification'
import { IdGenerator } from '#services/security/id_generator'
import type { LikilibaFrequency } from '#models/likiliba'

export class LikilibaException extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 422
  ) {
    super(message)
    this.name = 'LikilibaException'
  }
}

/** Who did something: a member, the scheduler, or Reemite staff. */
export type LikilibaActor = { type: 'user' | 'system' | 'internal_user'; id: number }

export const SYSTEM_ACTOR: LikilibaActor = { type: 'system', id: 0 }

/**
 * Every write to a group starts here: the group row is locked first, which serialises the
 * scheduler and members acting on the same group, whatever they touch next.
 */
export async function lockGroup(id: number, trx: TransactionClientContract): Promise<Likiliba> {
  const likiliba = await Likiliba.query({ client: trx }).where('id', id).forUpdate().first()
  if (!likiliba) {
    throw new LikilibaException('This likiliba does not exist', 'NOT_FOUND', 404)
  }
  return likiliba
}

export function newReference(prefix: 'LKB' | 'LKC' | 'LKP'): string {
  return IdGenerator.generateId(prefix)
}

/** Basis points of an amount, rounded down: the member never pays a fraction more than stated. */
export function bpsOf(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / 10_000n
}

/** A fee-schedule percentage (1.00 → 100 bps). */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100)
}

/**
 * Splits `total` across `weights` in proportion, in whole units, so that the parts add up to
 * `total` exactly. The units lost to rounding go to the largest weights first.
 */
export function prorata<K>(
  total: bigint,
  weights: Array<{ key: K; weight: bigint }>
): Map<K, bigint> {
  const result = new Map<K, bigint>()
  const positive = weights.filter((w) => w.weight > 0n)
  const sum = positive.reduce((acc, w) => acc + w.weight, 0n)
  if (total <= 0n || sum === 0n) return result

  let allocated = 0n
  for (const w of positive) {
    const part = (total * w.weight) / sum
    result.set(w.key, part)
    allocated += part
  }

  const byWeight = [...positive].sort((a, b) =>
    a.weight === b.weight ? 0 : a.weight > b.weight ? -1 : 1
  )
  let leftover = total - allocated
  for (let i = 0; leftover > 0n; i = (i + 1) % byWeight.length) {
    const key = byWeight[i].key
    result.set(key, (result.get(key) ?? 0n) + 1n)
    leftover -= 1n
  }
  return result
}

/** Due date of round `index` (0-based) of a cycle whose first round is due at `first`. */
export function dueDateOf(first: DateTime, frequency: LikilibaFrequency, index: number): DateTime {
  switch (frequency) {
    case 'weekly':
      return first.plus({ weeks: index })
    case 'biweekly':
      return first.plus({ weeks: 2 * index })
    case 'monthly':
      return first.plus({ months: index })
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** JSON with keys sorted at every level, so the same rules always hash the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(typeof value === 'bigint' ? value.toString() : value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

/** Phone numbers are compared on their digits only. */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

export async function isKycApproved(userId: number, trx?: TransactionClientContract) {
  const latest = await KycVerification.query(trx ? { client: trx } : {})
    .where('subject_type', 'user')
    .where('subject_id', userId)
    .orderBy('created_at', 'desc')
    .first()
  return latest?.status === 'approved'
}

export const FREQUENCY_LABEL: Record<LikilibaFrequency, string> = {
  weekly: 'chaque semaine',
  biweekly: 'toutes les deux semaines',
  monthly: 'chaque mois',
}

export function formatDate(value: DateTime): string {
  return value.setZone('Africa/Kinshasa').setLocale('fr').toFormat("d LLLL yyyy 'à' HH:mm")
}
