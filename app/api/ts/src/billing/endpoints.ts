"use rise"

import { Effect } from "effect"
import { HttpApiBuilder } from "@effect/platform"
import { RiseApi, UsageSummary, UsageInfo, CurrentTenant } from "@app/domain/http"
import { BillingService } from "./service.js"

export const HttpBillingLive = HttpApiBuilder.group(
  RiseApi,
  "billing",
  (handlers) =>
    Effect.gen(function* () {
      const billingService = yield* BillingService

      return handlers.handle("getUsage", () =>
        Effect.gen(function* () {
          const tenant = yield* CurrentTenant.Context
          const summary = yield* billingService.getUsageSummary(tenant.userId)
          return new UsageSummary({
            standard: new UsageInfo(summary.standard),
            premium: new UsageInfo(summary.premium),
          })
        }),
      )
    }),
)
