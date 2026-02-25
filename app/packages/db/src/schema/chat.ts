"use rise"

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const chatThreads = sqliteTable(
  "chat_threads",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull().default("New Chat"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("chat_threads_user_idx").on(table.userId)],
)

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    model: text("model"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("chat_messages_thread_idx").on(table.threadId)],
)

export type ChatThreadRow = typeof chatThreads.$inferSelect
export type ChatThreadInsert = typeof chatThreads.$inferInsert
export type ChatMessageRow = typeof chatMessages.$inferSelect
export type ChatMessageInsert = typeof chatMessages.$inferInsert
