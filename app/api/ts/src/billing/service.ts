"use rise"

import { Effect } from "effect"
import { Env } from "../env.js"
import { BillingRepository } from "./repository.js"
import type { MeterType } from "../ai/service.js"
import { UsageLimitError } from "@app/domain/http"

const generateId = () => crypto.randomUUID()

const getDayStart = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const getMonthStart = () => {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

type UserTier = "guest" | "free" | "paid"

export class BillingService extends Effect.Service<BillingService>()(
  "rise/BillingService",
  {
    accessors: true,
    dependencies: [Env.Default, BillingRepository.Default],
    effect: Effect.gen(function* () {
      const env = yield* Env
      const repo = yield* BillingRepository

      const checkUsage = Effect.fn("BillingService.checkUsage")(
        (
          userId: string,
          meter: MeterType,
        ): Effect.Effect<
          { allowed: boolean; used: number; limit: number; remaining: number },
          UsageLimitError
        > =>
          Effect.gen(function* () {
            const tier = getUserTier(userId)

            // Guests: daily limit
            if (tier === "guest") {
              const used = yield* repo.getUsageCount(
                userId,
                meter,
                getDayStart(),
              )
              const limit = env.GUEST_DAILY_LIMIT
              const remaining = Math.max(0, limit - used)
              if (remaining <= 0) {
                return yield* Effect.fail(
                  new UsageLimitError({
                    message: "Guest daily limit reached. Sign in for more.",
                    remaining: 0,
                    limit,
                  }),
                )
              }
              return { allowed: true, used, limit, remaining }
            }

            // Free users: only standard meter with daily limit.
            if (tier === "free") {
              if (meter === "premium") {
                return yield* Effect.fail(
                  new UsageLimitError({
                    message: "Premium models require paid tier",
                    remaining: 0,
                    limit: 0,
                  }),
                )
              }
              const used = yield* repo.getUsageCount(
                userId,
                "standard",
                getDayStart(),
              )
              const limit = env.FREE_DAILY_LIMIT
              const remaining = Math.max(0, limit - used)
              if (remaining <= 0) {
                return yield* Effect.fail(
                  new UsageLimitError({
                    message: "Free daily limit reached",
                    remaining: 0,
                    limit,
                  }),
                )
              }
              return { allowed: true, used, limit, remaining }
            }

            // Paid users: monthly quotas (standard + premium)
            const periodStart = getMonthStart()
            const effectiveLimit =
              meter === "premium"
                ? env.PAID_PREMIUM_LIMIT
                : env.PAID_STANDARD_LIMIT

            const used = yield* repo.getUsageCount(
              userId,
              meter,
              periodStart,
            )
            const remaining = Math.max(0, effectiveLimit - used)

            if (remaining <= 0) {
              return yield* Effect.fail(
                new UsageLimitError({
                  message: `${meter} usage limit reached`,
                  remaining: 0,
                  limit: effectiveLimit,
                }),
              )
            }

            return { allowed: true, used, limit: effectiveLimit, remaining }
          }),
      )

      const recordUsage = Effect.fn("BillingService.recordUsage")(
        (
          userId: string,
          meter: MeterType,
          model: string | null,
          idempotencyKey?: string,
        ): Effect.Effect<void> =>
          repo.recordUsage({
            id: generateId(),
            userId,
            meter,
            amount: 1,
            model,
            idempotencyKey: idempotencyKey ?? null,
            periodStart:
              getUserTier(userId) === "paid" ? getMonthStart() : getDayStart(),
            createdAt: Date.now(),
          }),
      )

      const getUsageSummary = Effect.fn("BillingService.getUsageSummary")(
        (userId: string) =>
          Effect.gen(function* () {
            const tier = getUserTier(userId)
            const standardPeriodStart =
              tier === "paid" ? getMonthStart() : getDayStart()
            const standardUsed = yield* repo.getUsageCount(
              userId,
              "standard",
              standardPeriodStart,
            )
            const premiumUsed = yield* repo.getUsageCount(
              userId,
              "premium",
              getMonthStart(),
            )

            return {
              standard: {
                meter: "standard" as const,
                used: standardUsed,
                limit:
                  tier === "paid"
                    ? env.PAID_STANDARD_LIMIT
                    : env.FREE_DAILY_LIMIT,
                remaining: Math.max(
                  0,
                  (tier === "paid"
                    ? env.PAID_STANDARD_LIMIT
                    : env.FREE_DAILY_LIMIT) - standardUsed,
                ),
                periodStart: standardPeriodStart,
              },
              premium: {
                meter: "premium" as const,
                used: premiumUsed,
                limit: tier === "paid" ? env.PAID_PREMIUM_LIMIT : 0,
                remaining: Math.max(
                  0,
                  (tier === "paid" ? env.PAID_PREMIUM_LIMIT : 0) -
                    premiumUsed,
                ),
                periodStart: getMonthStart(),
              },
            }
          }),
      )

      const getUserTier = (userId: string): UserTier => {
        if (userId === "guest" || userId.startsWith("guest:")) return "guest"
        const paid = new Set(
          env.PAID_USER_IDS.split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        )
        return paid.has(userId) ? "paid" : "free"
      }

      return { checkUsage, recordUsage, getUsageSummary, getUserTier } as const
    }),
  },
) {}
