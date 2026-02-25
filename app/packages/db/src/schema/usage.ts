"use rise"

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const usageRecords = sqliteTable(
  "usage_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    meter: text("meter", { enum: ["standard", "premium"] }).notNull(),
    amount: integer("amount").notNull().default(1),
    model: text("model"),
    idempotencyKey: text("idempotency_key"),
    periodStart: integer("period_start", { mode: "number" }).notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("usage_user_meter_period_idx").on(
      table.userId,
      table.meter,
      table.periodStart,
    ),
    index("usage_idempotency_idx").on(table.idempotencyKey),
  ],
)

export type UsageRecordRow = typeof usageRecords.$inferSelect
export type UsageRecordInsert = typeof usageRecords.$inferInsert
