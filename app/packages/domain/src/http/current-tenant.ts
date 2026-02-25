"use rise"

import { Context, Schema } from "effect"
import {
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
} from "@effect/platform"

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 401 }),
) {}

export class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
  "ForbiddenError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 403 }),
) {}

export class TenantSchema extends Schema.Class<TenantSchema>("TenantSchema")({
  userId: Schema.String,
  email: Schema.optional(Schema.String),
  authMode: Schema.Literal("self_hosted"),
}) {}

export class Context_ extends Context.Tag("CurrentTenant")<
  Context_,
  TenantSchema
>() {}
export { Context_ as Context }

export class Authorization extends HttpApiMiddleware.Tag<Authorization>()(
  "Authorization",
  {
    failure: UnauthorizedError,
    provides: Context_,
    security: { bearer: HttpApiSecurity.bearer },
  },
) {}
