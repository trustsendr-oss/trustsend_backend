import db from '@adonisjs/lucid/services/db'
import Agent from '#models/agent'
import Business from '#models/business'
import User from '#models/user'

export type KycSubjectType = 'user' | 'agent' | 'business'

/** Who a KYC file is about, in words a reviewer can use. */
export type KycSubject = {
  type: KycSubjectType
  id: number
  /** Display name: the person, the shop (agent) or the company. */
  name: string | null
  email: string | null
  /** Public 9-digit code (user, agent) or the business code. */
  code: string | null
  /** For an agent: the customer account that operates it. */
  user_id?: number | null
}

const key = (type: string, id: number) => `${type}:${id}`

/**
 * Resolves the subject behind KYC files for the admin console.
 *
 * `kyc_verifications` only stores (subject_type, subject_id) — a polymorphic pair with no foreign
 * key — so a list showed "user #103" and reviewers had to look people up by hand. Subjects are
 * loaded in one query per type, never one per row.
 */
export class KycSubjectService {
  static async resolveMany(
    rows: { subjectType: string; subjectId: number }[]
  ): Promise<Map<string, KycSubject>> {
    const idsOf = (type: KycSubjectType) => [
      ...new Set(rows.filter((r) => r.subjectType === type).map((r) => r.subjectId)),
    ]

    const [users, agents, businesses] = await Promise.all([
      idsOf('user').length ? User.query().whereIn('id', idsOf('user')) : [],
      idsOf('agent').length ? Agent.query().whereIn('id', idsOf('agent')) : [],
      idsOf('business').length ? Business.query().whereIn('id', idsOf('business')) : [],
    ])

    const subjects = new Map<string, KycSubject>()
    for (const user of users) {
      subjects.set(key('user', user.id), {
        type: 'user',
        id: user.id,
        name: user.fullName,
        email: user.email,
        code: user.code,
      })
    }
    for (const agent of agents) {
      subjects.set(key('agent', agent.id), {
        type: 'agent',
        id: agent.id,
        name: agent.businessName ?? agent.fullName,
        email: agent.email,
        code: agent.code,
        user_id: agent.userId,
      })
    }
    for (const business of businesses) {
      subjects.set(key('business', business.id), {
        type: 'business',
        id: business.id,
        name: business.name,
        email: business.email,
        code: business.code,
      })
    }
    return subjects
  }

  static lookup(
    subjects: Map<string, KycSubject>,
    row: { subjectType: string; subjectId: number }
  ): KycSubject {
    return (
      subjects.get(key(row.subjectType, row.subjectId)) ?? {
        type: row.subjectType as KycSubjectType,
        id: row.subjectId,
        name: null,
        email: null,
        code: null,
      }
    )
  }

  /**
   * Subject ids whose name, e-mail or code contains `term` (case-insensitive), per type — the
   * server-side half of the console's KYC search.
   */
  static async matching(term: string): Promise<Record<KycSubjectType, number[]>> {
    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const ids = async (table: string, columns: string[]) => {
      const rows = await db
        .from(table)
        .where((q) => {
          for (const column of columns) q.orWhereILike(column, like)
        })
        .select('id')
        .limit(500)
      return rows.map((r) => Number(r.id))
    }

    const [user, agent, business] = await Promise.all([
      ids('users', ['full_name', 'email', 'code']),
      ids('agents', ['full_name', 'business_name', 'email', 'code']),
      ids('businesses', ['name', 'email', 'code']),
    ])
    return { user, agent, business }
  }
}
