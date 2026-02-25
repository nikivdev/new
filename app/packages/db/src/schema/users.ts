"use rise"

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("users_email_idx").on(table.email)],
)

export type UserRow = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert
