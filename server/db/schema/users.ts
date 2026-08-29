import { boolean, pgTable, unique, varchar } from 'drizzle-orm/pg-core'
import { commonColumns } from '../shared'

export const users = pgTable(
  'users',
  {
    ...commonColumns,
    email: varchar({ length: 255 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    isActive: boolean('is_active').default(true),
    password: varchar({ length: 255 })
  },
  table => [unique('users_email_unique').on(table.email)]
)
