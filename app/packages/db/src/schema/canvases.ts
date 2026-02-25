"use rise"

import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const canvases = sqliteTable(
  "canvases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull().default("Untitled Canvas"),
    width: integer("width").notNull().default(1024),
    height: integer("height").notNull().default(768),
    defaultModel: text("default_model").notNull().default("dall-e-3"),
    defaultStyle: text("default_style").notNull().default("natural"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("canvases_user_idx").on(table.userId)],
)

export const canvasImages = sqliteTable(
  "canvas_images",
  {
    id: text("id").primaryKey(),
    canvasId: text("canvas_id")
      .notNull()
      .references(() => canvases.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    modelId: text("model_id").notNull(),
    imageUrl: text("image_url"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    positionX: real("position_x").notNull().default(0),
    positionY: real("position_y").notNull().default(0),
    rotation: real("rotation").notNull().default(0),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("canvas_images_canvas_idx").on(table.canvasId)],
)

export type CanvasRow = typeof canvases.$inferSelect
export type CanvasInsert = typeof canvases.$inferInsert
export type CanvasImageRow = typeof canvasImages.$inferSelect
export type CanvasImageInsert = typeof canvasImages.$inferInsert
