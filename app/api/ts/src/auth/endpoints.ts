"use rise"

import { Effect } from "effect"
import { HttpApiBuilder } from "@effect/platform"
import { RiseApi, LoginResponse, CurrentTenant } from "@app/domain/http"
import { AuthService } from "./service.js"

export const HttpAuthPublicLive = HttpApiBuilder.group(
  RiseApi,
  "authPublic",
  (handlers) =>
    Effect.gen(function* () {
      const authService = yield* AuthService

      return handlers.handle("login", ({ payload }) =>
        Effect.gen(function* () {
          const token = yield* authService.login(payload.password)
          return new LoginResponse({ token })
        }),
      )
    }),
)

export const HttpAuthLive = HttpApiBuilder.group(
  RiseApi,
  "auth",
  (handlers) =>
    Effect.succeed(
      handlers.handle("session", () =>
        Effect.gen(function* () {
          const tenant = yield* CurrentTenant.Context
          return { userId: tenant.userId }
        }),
      ),
    ),
)
