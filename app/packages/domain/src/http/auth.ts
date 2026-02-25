"use rise"

import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { Authorization, UnauthorizedError } from "./current-tenant.js"

export class LoginRequest extends Schema.Class<LoginRequest>("LoginRequest")({
  password: Schema.String,
}) {}

export class LoginResponse extends Schema.Class<LoginResponse>(
  "LoginResponse",
)({
  token: Schema.String,
}) {}

export class LoginError extends Schema.TaggedError<LoginError>()(
  "LoginError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 401 }),
) {}

export class AuthPublicApiGroup extends HttpApiGroup.make("authPublic")
  .add(
    HttpApiEndpoint.post("login", "/login")
      .setPayload(LoginRequest)
      .addSuccess(LoginResponse)
      .addError(LoginError),
  )
  .prefix("/api/auth") {}

export class AuthApiGroup extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.get("session", "/session")
      .addSuccess(Schema.Struct({ userId: Schema.String }))
      .addError(UnauthorizedError),
  )
  .prefix("/api/auth")
  .middleware(Authorization) {}
