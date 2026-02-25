"use rise"

import { Effect } from "effect"
import { Database } from "../database/live.js"

export class BillingRepository extends Effect.Service<BillingRepository>()(
  "rise/BillingRepository",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const db = yield* Database

      const getUsageCount = Effect.fn("BillingRepository.getUsageCount")(
        (
          userId: string,
          meter: "standard" | "premium",
          periodStart: number,
        ): Effect.Effect<number> =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.execute({
                sql: `SELECT coalesce(sum(amount), 0) as total FROM usage_records
                      WHERE user_id = ? AND meter = ? AND period_start >= ?`,
                args: [userId, meter, periodStart],
              })
              return Number(result.rows[0]?.total ?? 0)
            },
            catch: (e) => new Error(`Failed to get usage count: ${e}`),
          }).pipe(Effect.orDie),
      )

      const recordUsage = Effect.fn("BillingRepository.recordUsage")(
        (record: {
          id: string
          userId: string
          meter: "standard" | "premium"
          amount: number
          model: string | null
          idempotencyKey: string | null
          periodStart: number
          createdAt: number
        }): Effect.Effect<void> =>
          Effect.tryPromise({
            try: () =>
              db.execute({
                sql: `INSERT INTO usage_records (id, user_id, meter, amount, model, idempotency_key, period_start, created_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                  record.id,
                  record.userId,
                  record.meter,
                  record.amount,
                  record.model,
                  record.idempotencyKey,
                  record.periodStart,
                  record.createdAt,
                ],
              }),
            catch: (e) => new Error(`Failed to record usage: ${e}`),
          }).pipe(Effect.asVoid, Effect.orDie),
      )

      return { getUsageCount, recordUsage } as const
    }),
  },
) {}
