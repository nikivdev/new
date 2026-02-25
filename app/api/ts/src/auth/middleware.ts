"use rise"

import { Effect, Layer } from "effect"
import { HttpServerRequest } from "@effect/platform"
import { CurrentTenant } from "@app/domain/http"
import { AuthService } from "./service.js"

export const AuthorizationLive = Layer.effect(
  CurrentTenant.Authorization,
  Effect.gen(function* () {
    const authService = yield* AuthService

    return CurrentTenant.Authorization.of({
      bearer: (_bearerToken) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const tenant = yield* authService.resolveTenant(
            request.headers as Record<string, string | undefined>,
          )
          return new CurrentTenant.TenantSchema(tenant)
        }),
    })
  }),
)
