"use rise"

import { Effect } from "effect"
import { Database } from "../database/live.js"

const generateId = () => crypto.randomUUID()

export class CanvasRepository extends Effect.Service<CanvasRepository>()(
  "rise/CanvasRepository",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const db = yield* Database

      const listCanvases = Effect.fn("CanvasRepository.listCanvases")(
        (userId: string) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.execute({
                sql: `SELECT c.id, c.name, c.created_at, c.updated_at,
                             (SELECT count(*) FROM canvas_images ci WHERE ci.canvas_id = c.id) as image_count
                      FROM canvases c WHERE c.user_id = ? ORDER BY c.updated_at DESC`,
                args: [userId],
              })
              return result.rows.map((r) => ({
                id: r.id as string,
                name: r.name as string,
                imageCount: Number(r.image_count ?? 0),
                createdAt: r.created_at as number,
                updatedAt: r.updated_at as number,
              }))
            },
            catch: (e) => new Error(`Failed to list canvases: ${e}`),
          }).pipe(Effect.orDie),
      )

      const createCanvas = Effect.fn("CanvasRepository.createCanvas")(
        (params: {
          userId: string
          name: string
          width: number
          height: number
        }) =>
          Effect.gen(function* () {
            const id = generateId()
            const now = Date.now()
            yield* Effect.tryPromise({
              try: () =>
                db.execute({
                  sql: `INSERT INTO canvases (id, user_id, name, width, height, default_model, default_style, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  args: [
                    id,
                    params.userId,
                    params.name,
                    params.width,
                    params.height,
                    "dall-e-3",
                    "natural",
                    now,
                    now,
                  ],
                }),
              catch: (e) => new Error(`Failed to create canvas: ${e}`),
            }).pipe(Effect.orDie)
            return {
              id,
              name: params.name,
              width: params.width,
              height: params.height,
              defaultModel: "dall-e-3",
              defaultStyle: "natural",
              createdAt: now,
              updatedAt: now,
            }
          }),
      )

      const getCanvas = Effect.fn("CanvasRepository.getCanvas")(
        (canvasId: string, userId: string) =>
          Effect.tryPromise({
            try: async () => {
              const cResult = await db.execute({
                sql: `SELECT * FROM canvases WHERE id = ? AND user_id = ?`,
                args: [canvasId, userId],
              })
              if (cResult.rows.length === 0) return null

              const c = cResult.rows[0]!
              const iResult = await db.execute({
                sql: `SELECT * FROM canvas_images WHERE canvas_id = ? ORDER BY created_at ASC`,
                args: [canvasId],
              })

              return {
                id: c.id as string,
                name: c.name as string,
                width: c.width as number,
                height: c.height as number,
                defaultModel: c.default_model as string,
                defaultStyle: c.default_style as string,
                images: iResult.rows.map((r) => ({
                  id: r.id as string,
                  prompt: r.prompt as string,
                  modelId: r.model_id as string,
                  imageUrl: (r.image_url as string | null) ?? undefined,
                  width: r.width as number,
                  height: r.height as number,
                  positionX: Number(r.position_x ?? 0),
                  positionY: Number(r.position_y ?? 0),
                  rotation: Number(r.rotation ?? 0),
                  createdAt: r.created_at as number,
                  updatedAt: r.updated_at as number,
                })),
                createdAt: c.created_at as number,
                updatedAt: c.updated_at as number,
              }
            },
            catch: (e) => new Error(`Failed to get canvas: ${e}`),
          }).pipe(Effect.orDie),
      )

      const deleteCanvas = Effect.fn("CanvasRepository.deleteCanvas")(
        (canvasId: string, userId: string) =>
          Effect.gen(function* () {
            const canvas = yield* getCanvas(canvasId, userId)
            if (!canvas) return false

            yield* Effect.tryPromise({
              try: () =>
                db.execute({
                  sql: `DELETE FROM canvas_images WHERE canvas_id = ?`,
                  args: [canvasId],
                }),
              catch: (e) => new Error(`Failed to delete images: ${e}`),
            }).pipe(Effect.orDie)

            const result = yield* Effect.tryPromise({
              try: () =>
                db.execute({
                  sql: `DELETE FROM canvases WHERE id = ? AND user_id = ?`,
                  args: [canvasId, userId],
                }),
              catch: (e) => new Error(`Failed to delete canvas: ${e}`),
            }).pipe(Effect.orDie)
            return (result.rowsAffected ?? 0) > 0
          }),
      )

      const addImage = Effect.fn("CanvasRepository.addImage")(
        (params: {
          canvasId: string
          prompt: string
          modelId: string
          imageUrl: string | null
          width: number
          height: number
          positionX: number
          positionY: number
        }) =>
          Effect.gen(function* () {
            const id = generateId()
            const now = Date.now()
            yield* Effect.tryPromise({
              try: () =>
                db.execute({
                  sql: `INSERT INTO canvas_images (id, canvas_id, prompt, model_id, image_url, width, height, position_x, position_y, rotation, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
                  args: [
                    id,
                    params.canvasId,
                    params.prompt,
                    params.modelId,
                    params.imageUrl,
                    params.width,
                    params.height,
                    params.positionX,
                    params.positionY,
                    now,
                    now,
                  ],
                }),
              catch: (e) => new Error(`Failed to add image: ${e}`),
            }).pipe(Effect.orDie)

            // Update canvas timestamp
            yield* Effect.tryPromise({
              try: () =>
                db.execute({
                  sql: `UPDATE canvases SET updated_at = ? WHERE id = ?`,
                  args: [now, params.canvasId],
                }),
              catch: (e) => new Error(`Failed to update canvas: ${e}`),
            }).pipe(Effect.orDie)

            return {
              id,
              prompt: params.prompt,
              modelId: params.modelId,
              imageUrl: params.imageUrl ?? undefined,
              width: params.width,
              height: params.height,
              positionX: params.positionX,
              positionY: params.positionY,
              rotation: 0,
              createdAt: now,
              updatedAt: now,
            }
          }),
      )

      return {
        listCanvases,
        createCanvas,
        getCanvas,
        deleteCanvas,
        addImage,
      } as const
    }),
  },
) {}
