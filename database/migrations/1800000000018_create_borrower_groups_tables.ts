import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('borrower_groups', (table) => {
      table.increments('id').notNullable()
      table.integer('provider_id').unsigned().notNullable().references('id').inTable('businesses').onDelete('CASCADE')
      table.string('name', 100).notNullable()
      table.string('code', 50).notNullable().unique()
      table.enum('meeting_frequency', ['weekly', 'biweekly', 'monthly']).notNullable().defaultTo('weekly')
      table.string('meeting_day', 20).nullable()
      table.integer('president_user_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL')
      table.integer('secretary_user_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL')
      table.integer('treasurer_user_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL')
      table.integer('loan_officer_id').unsigned().nullable().references('id').inTable('business_staff').onDelete('SET NULL')
      table.enum('status', ['active', 'suspended', 'closed']).notNullable().defaultTo('active')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['provider_id', 'status'])
      table.index(['loan_officer_id'])
    })

    this.schema.createTable('borrower_group_members', (table) => {
      table.increments('id').notNullable()
      table.integer('group_id').unsigned().notNullable().references('id').inTable('borrower_groups').onDelete('CASCADE')
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.enum('role', ['leader', 'officer', 'member']).notNullable().defaultTo('member')
      table.timestamp('joined_at').notNullable()
      table.enum('status', ['active', 'left', 'defaulted']).notNullable().defaultTo('active')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.unique(['group_id', 'user_id'])
      table.index(['user_id'])
    })

    this.schema.alterTable('loans', (table) => {
      table.integer('group_id').unsigned().nullable().references('id').inTable('borrower_groups').onDelete('SET NULL')
      table.index(['group_id'])
    })
  }

  async down() {
    this.schema.alterTable('loans', (table) => {
      table.dropColumn('group_id')
    })

    this.schema.dropTable('borrower_group_members')
    this.schema.dropTable('borrower_groups')
  }
}
