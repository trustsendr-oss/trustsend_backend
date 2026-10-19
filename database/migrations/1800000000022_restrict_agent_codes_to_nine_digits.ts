import { BaseSchema } from '@adonisjs/lucid/schema'
import { randomInt } from 'node:crypto'

/**
 * Agent codes become exactly 9 digits, enforced by the database.
 *
 * The customer-facing routes (GET /directory/agents, POST /cash-out) only ever accepted 9 digits,
 * but POST /agents took any 2–20 character string and defaulted to `AG-XXXXXXXX`. Agents created
 * that way existed, some of them active, and no customer could ever find them or withdraw from
 * them. This migration gives each of them a fresh 9-digit code, prints the old → new mapping so
 * the agents can be told, then adds a CHECK so it cannot happen again.
 *
 * The agent's ledger account keeps its `AGENT_WALLET.<old code>` code on purpose: it is an
 * internal bookkeeping label referenced by history, not something a customer ever types.
 *
 * down() drops the constraint only — the replaced codes are not restored, since the new ones may
 * already be painted on shopfronts.
 */
export default class extends BaseSchema {
  protected tableName = 'agents'

  async up() {
    this.defer(async (db) => {
      const invalid: { id: number; code: string }[] = await db
        .from(this.tableName)
        .whereRaw(`code !~ '^[0-9]{9}$'`)
        .select('id', 'code')

      for (const agent of invalid) {
        let next = ''
        for (let attempt = 0; attempt < 10 && !next; attempt++) {
          const candidate = randomInt(100000000, 1000000000).toString()
          const taken = await db.from(this.tableName).where('code', candidate).first()
          if (!taken) next = candidate
        }
        if (!next) throw new Error(`Could not find a free 9-digit code for agent ${agent.id}`)

        await db.from(this.tableName).where('id', agent.id).update({ code: next })
        console.log(`[agents] agent ${agent.id}: code ${agent.code} → ${next}`)
      }
    })

    this.schema.raw(
      `ALTER TABLE agents ADD CONSTRAINT agents_code_nine_digits CHECK (code ~ '^[0-9]{9}$')`
    )
  }

  async down() {
    this.schema.raw(`ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_code_nine_digits`)
  }
}
