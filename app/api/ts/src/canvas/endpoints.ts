"use rise"

import { Effect } from "effect"
import { HttpApiBuilder } from "@effect/platform"
import { RiseApi, CurrentTenant } from "@app/domain/http"
import { CanvasService } from "./service.js"

export const HttpCanvasLive = HttpApiBuilder.group(
  RiseApi,
  "canvas",
  (handlers) =>
    Effect.gen(function* () {
      const canvasService = yield* CanvasService

      return handlers
        .handle("listCanvases", () =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* canvasService.list(tenant.userId)
          }),
        )
        .handle("createCanvas", ({ payload }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            const canvas = yield* canvasService.create({
              userId: tenant.userId,
              name: payload.name,
              width: payload.width,
              height: payload.height,
            })
            return { ...canvas, images: [] as Array<never> }
          }),
        )
        .handle("getCanvas", ({ path }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* canvasService.get(path.canvasId, tenant.userId)
          }),
        )
        .handle("deleteCanvas", ({ path }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* canvasService.remove(path.canvasId, tenant.userId)
          }),
        )
        .handle("generateImage", ({ path, payload }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* canvasService.generate({
              userId: tenant.userId,
              canvasId: path.canvasId,
              prompt: payload.prompt,
              model: payload.model,
              width: payload.width,
              height: payload.height,
              positionX: payload.positionX,
              positionY: payload.positionY,
            })
          }),
        )
    }),
)
