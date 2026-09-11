import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Fil de discussion d'une réclamation.
 *
 * `disputes.resolution_notes` ne portait qu'un seul texte, écrit par le support à la clôture :
 * l'échange était à sens unique et le client n'avait aucun moyen d'apporter une précision après
 * coup — ni de lire autre chose qu'un verdict.
 *
 * Une table plutôt qu'un champ `jsonb` : un message a un auteur, une date et un ordre, et c'est
 * exactement ce qu'une table sait garantir. Les messages sont immuables ; corriger un propos se
 * fait en en écrivant un autre, comme dans n'importe quelle conversation.
 */
export default class extends BaseSchema {
  protected tableName = 'dispute_messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .string('dispute_id', 12)
        .notNullable()
        .references('id')
        .inTable('disputes')
        .onDelete('CASCADE')
      table
        .enum('author_type', ['user', 'agent', 'internal_user'])
        .notNullable()
        .comment('Qui parle : le réclamant, ou le personnel du support')
      table.integer('author_id').notNullable()
      table.text('body').notNullable()
      table.timestamp('created_at').notNullable()

      table.index(['dispute_id', 'created_at'])
    })

    this.schema.raw(`
      ALTER TABLE ${this.tableName}
      ADD CONSTRAINT dispute_messages_body_not_empty CHECK (length(btrim(body)) > 0)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
