import { Kysely, Migration, MigrationProvider } from 'kysely'

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  }
}

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('post')
      .addColumn('uri', 'varchar', col => col.primaryKey())
      .addColumn('cid', 'varchar', col => col.notNull())
      .addColumn('text', 'varchar', col => col.notNull())
      .addColumn('replyParent', 'varchar')
      .addColumn('replyRoot', 'varchar')
      .addColumn('indexedAt', 'varchar', col => col.notNull())
      .addColumn('embedding', 'json')
      .addColumn('score', 'real')
      .execute()

    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar', col => col.primaryKey())
      .addColumn('cursor', 'integer', col => col.notNull())
      .execute()

    await db.schema
      .createTable('like')
      .addColumn('uri', 'varchar', col => col.primaryKey())
      .addColumn('cid', 'varchar', col => col.notNull())
      .addColumn('postUri', 'varchar', col => col.notNull())
      .addColumn('postCid', 'varchar', col => col.notNull())
      .addColumn('author', 'varchar', col => col.notNull())
      .addColumn('indexedAt', 'varchar', col => col.notNull())
      .addColumn('trainedOn', 'integer', col => col.defaultTo(0))
      .addForeignKeyConstraint('like', ['postUri'], 'post', ['uri'], cb =>
        cb.onDelete('cascade')
      )
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('post').execute()
    await db.schema.dropTable('sub_state').execute()
    await db.schema.dropTable('like').execute()
  }
}
