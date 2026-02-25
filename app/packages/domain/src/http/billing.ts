"use rise"

import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { Authorization } from "./current-tenant.js"

// --- Schemas ---

export class UsageInfo extends Schema.Class<UsageInfo>("UsageInfo")({
  meter: Schema.Literal("standard", "premium"),
  used: Schema.Number,
  limit: Schema.Number,
  remaining: Schema.Number,
  periodStart: Schema.Number,
}) {}

export class UsageSummary extends Schema.Class<UsageSummary>("UsageSummary")({
  standard: UsageInfo,
  premium: UsageInfo,
}) {}

// --- API Group ---

export class BillingApiGroup extends HttpApiGroup.make("billing")
  .add(
    HttpApiEndpoint.get("getUsage", "/usage").addSuccess(UsageSummary),
  )
  .prefix("/api/billing")
  .middleware(Authorization) {}
