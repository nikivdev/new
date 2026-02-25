"use rise"

import { Effect } from "effect"
import { CanvasRepository } from "./repository.js"
import { generateImage } from "../ai/providers/openai.js"
import { CanvasError, CanvasNotFoundError } from "@app/domain/http"

export class CanvasService extends Effect.Service<CanvasService>()(
  "rise/CanvasService",
  {
    accessors: true,
    dependencies: [CanvasRepository.Default],
    effect: Effect.gen(function* () {
      const repo = yield* CanvasRepository

      const list = Effect.fn("CanvasService.list")(
        (userId: string) => repo.listCanvases(userId),
      )

      const create = Effect.fn("CanvasService.create")(
        (params: {
          userId: string
          name: string
          width: number
          height: number
        }) => repo.createCanvas(params),
      )

      const get = Effect.fn("CanvasService.get")(
        (canvasId: string, userId: string) =>
          Effect.gen(function* () {
            const canvas = yield* repo.getCanvas(canvasId, userId)
            if (!canvas) {
              return yield* Effect.fail(
                new CanvasNotFoundError({
                  message: `Canvas ${canvasId} not found`,
                }),
              )
            }
            return canvas
          }),
      )

      const remove = Effect.fn("CanvasService.remove")(
        (canvasId: string, userId: string) =>
          Effect.gen(function* () {
            const deleted = yield* repo.deleteCanvas(canvasId, userId)
            if (!deleted) {
              return yield* Effect.fail(
                new CanvasNotFoundError({
                  message: `Canvas ${canvasId} not found`,
                }),
              )
            }
            return { ok: true }
          }),
      )

      const generate = Effect.fn("CanvasService.generate")(
        (params: {
          userId: string
          canvasId: string
          prompt: string
          model: string
          width: number
          height: number
          positionX: number
          positionY: number
        }) =>
          Effect.gen(function* () {
            // Verify canvas exists
            const canvas = yield* repo.getCanvas(params.canvasId, params.userId)
            if (!canvas) {
              return yield* Effect.fail(
                new CanvasNotFoundError({
                  message: `Canvas ${params.canvasId} not found`,
                }),
              )
            }

            // Generate image
            const result = yield* generateImage({
              prompt: params.prompt,
              model: params.model,
              size: `${params.width}x${params.height}`,
            }).pipe(
              Effect.mapError(
                (e) =>
                  new CanvasError({
                    message: e.message,
                  }),
              ),
            )

            // Store in DB
            const image = yield* repo.addImage({
              canvasId: params.canvasId,
              prompt: params.prompt,
              modelId: params.model,
              imageUrl: result.url,
              width: params.width,
              height: params.height,
              positionX: params.positionX,
              positionY: params.positionY,
            })

            return image
          }),
      )

      return { list, create, get, remove, generate } as const
    }),
  },
) {}
