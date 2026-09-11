import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Ajoute l'état « retirée » aux réclamations.
 *
 * Un client qui renonce à sa réclamation ne la « résout » pas : `resolved` est une décision du
 * support, et les confondre effacerait la différence entre un dossier tranché et un dossier
 * abandonné — pour le suivi comme pour les statistiques du support.
 */
export default class extends BaseSchema {
  protected tableName = 'disputes'

  async up() {
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP CONSTRAINT disputes_status_check`)
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT disputes_status_check
      CHECK (status = ANY (ARRAY[
        'opened', 'investigating', 'approved', 'rejected', 'resolved', 'withdrawn'
      ]::text[]))
    `)
  }

  async down() {
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP CONSTRAINT disputes_status_check`)
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT disputes_status_check
      CHECK (status = ANY (ARRAY[
        'opened', 'investigating', 'approved', 'rejected', 'resolved'
      ]::text[]))
    `)
  }
}
