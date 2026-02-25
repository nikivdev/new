"use rise"

import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { Authorization } from "./current-tenant.js"

// --- Schemas ---

export class CanvasImage extends Schema.Class<CanvasImage>("CanvasImage")({
  id: Schema.String,
  prompt: Schema.String,
  modelId: Schema.String,
  imageUrl: Schema.optionalWith(Schema.String, { nullable: true }),
  width: Schema.Number,
  height: Schema.Number,
  positionX: Schema.Number,
  positionY: Schema.Number,
  rotation: Schema.Number,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}) {}

export class Canvas extends Schema.Class<Canvas>("Canvas")({
  id: Schema.String,
  name: Schema.String,
  width: Schema.Number,
  height: Schema.Number,
  defaultModel: Schema.String,
  defaultStyle: Schema.String,
  images: Schema.Array(CanvasImage),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}) {}

export class CanvasSummary extends Schema.Class<CanvasSummary>(
  "CanvasSummary",
)({
  id: Schema.String,
  name: Schema.String,
  imageCount: Schema.Number,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}) {}

export class CreateCanvasRequest extends Schema.Class<CreateCanvasRequest>(
  "CreateCanvasRequest",
)({
  name: Schema.optionalWith(Schema.String, {
    default: () => "Untitled Canvas",
  }),
  width: Schema.optionalWith(Schema.Number, { default: () => 1024 }),
  height: Schema.optionalWith(Schema.Number, { default: () => 768 }),
}) {}

export class GenerateImageRequest extends Schema.Class<GenerateImageRequest>(
  "GenerateImageRequest",
)({
  prompt: Schema.String,
  model: Schema.optionalWith(Schema.String, { default: () => "dall-e-3" }),
  width: Schema.optionalWith(Schema.Number, { default: () => 1024 }),
  height: Schema.optionalWith(Schema.Number, { default: () => 1024 }),
  positionX: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  positionY: Schema.optionalWith(Schema.Number, { default: () => 0 }),
}) {}

export class CanvasError extends Schema.TaggedError<CanvasError>()(
  "CanvasError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 400 }),
) {}

export class CanvasNotFoundError extends Schema.TaggedError<CanvasNotFoundError>()(
  "CanvasNotFoundError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 404 }),
) {}

// --- API Group ---

export class CanvasApiGroup extends HttpApiGroup.make("canvas")
  .add(
    HttpApiEndpoint.get("listCanvases", "/").addSuccess(
      Schema.Array(CanvasSummary),
    ),
  )
  .add(
    HttpApiEndpoint.post("createCanvas", "/")
      .setPayload(CreateCanvasRequest)
      .addSuccess(Canvas)
      .addError(CanvasError),
  )
  .add(
    HttpApiEndpoint.get("getCanvas", "/:canvasId")
      .setPath(Schema.Struct({ canvasId: Schema.String }))
      .addSuccess(Canvas)
      .addError(CanvasNotFoundError),
  )
  .add(
    HttpApiEndpoint.del("deleteCanvas", "/:canvasId")
      .setPath(Schema.Struct({ canvasId: Schema.String }))
      .addSuccess(Schema.Struct({ ok: Schema.Boolean }))
      .addError(CanvasNotFoundError),
  )
  .add(
    HttpApiEndpoint.post("generateImage", "/:canvasId/generate")
      .setPath(Schema.Struct({ canvasId: Schema.String }))
      .setPayload(GenerateImageRequest)
      .addSuccess(CanvasImage)
      .addError(CanvasError)
      .addError(CanvasNotFoundError),
  )
  .prefix("/api/canvas")
  .middleware(Authorization) {}
