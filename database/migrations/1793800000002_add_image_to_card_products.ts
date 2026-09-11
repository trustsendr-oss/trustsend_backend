import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Visuel de la carte, par catégorie.
 *
 * Deux colonnes plutôt qu'une URL : le fichier est servi par nous, et le type MIME est capturé
 * au téléversement plutôt que deviné à la lecture — c'est la leçon tirée de `kyc_documents`,
 * dont la colonne `mime_type` a dû être ajoutée après coup et laisse des lignes anciennes à
 * renifler.
 *
 * `image_ref` est un identifiant opaque, pas un nom de fichier construit à partir de l'id de la
 * catégorie : rien ne doit pouvoir être énuméré depuis l'extérieur.
 */
export default class extends BaseSchema {
  protected tableName = 'card_products'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('image_ref', 64)
        .nullable()
        .comment('Opaque reference to the stored card art; null until staff upload one')
      table.string('image_mime_type', 100).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('image_ref')
      table.dropColumn('image_mime_type')
    })
  }
}
