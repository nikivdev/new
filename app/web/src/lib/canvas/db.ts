import { withJazzUser } from "@/lib/jazz/server-store"
import type { JazzAuth } from "@/lib/jazz/server-auth"
import {
  Canvas,
  CanvasImage,
  CanvasImageList,
} from "@/lib/jazz/schema"
import type {
  CanvasPoint,
  CanvasSize,
  SerializedCanvas,
  SerializedCanvasImage,
  SerializedCanvasRecord,
  SerializedCanvasSummary,
} from "./types"

const DEFAULT_POSITION: CanvasPoint = { x: 0, y: 0 }
const DEFAULT_IMAGE_SIZE: CanvasSize = { width: 512, height: 512 }
const DEFAULT_IMAGE_NAME = "Box 1"
const DEFAULT_MODEL = "gemini-2.5-flash-image-preview"

const serializeCanvasRecord = (
  record: any,
  ownerId: string,
): SerializedCanvasRecord => ({
  id: record.$jazz.id,
  name: record.name,
  ownerId,
  defaultModel: record.defaultModel ?? DEFAULT_MODEL,
  defaultStyle: record.defaultStyle ?? "default",
  backgroundPrompt: record.backgroundPrompt ?? null,
  width: record.width ?? 1024,
  height: record.height ?? 1024,
  createdAt: record.createdAt
    ? new Date(record.createdAt).toISOString()
    : new Date().toISOString(),
  updatedAt: record.updatedAt
    ? new Date(record.updatedAt).toISOString()
    : new Date().toISOString(),
})

const serializeImage = (
  image: any,
  canvasId: string,
): SerializedCanvasImage => ({
  id: image.$jazz.id,
  canvasId,
  name: image.name ?? DEFAULT_IMAGE_NAME,
  prompt: image.prompt ?? "",
  modelId: image.modelId ?? DEFAULT_MODEL,
  modelUsed: image.modelUsed ?? null,
  styleId: image.styleId ?? "default",
  width: image.width ?? DEFAULT_IMAGE_SIZE.width,
  height: image.height ?? DEFAULT_IMAGE_SIZE.height,
  rotation: image.rotation ?? 0,
  position: image.position ?? DEFAULT_POSITION,
  branchParentId: image.branchParentId ?? null,
  metadata: (image.metadata as Record<string, unknown> | null) ?? null,
  imageUrl: image.imageUrl ?? null,
  imageData: image.contentBase64 ?? null,
  createdAt: image.createdAt
    ? new Date(image.createdAt).toISOString()
    : new Date().toISOString(),
  updatedAt: image.updatedAt
    ? new Date(image.updatedAt).toISOString()
    : new Date().toISOString(),
})

const createCanvasWithDefaults = async (
  auth: JazzAuth,
  name?: string,
): Promise<SerializedCanvas> => {
  return withJazzUser(auth, async (account) => {
    const now = Date.now()
    const image = CanvasImage.create(
      {
        name: DEFAULT_IMAGE_NAME,
        prompt: "",
        modelId: DEFAULT_MODEL,
        modelUsed: undefined,
        styleId: "default",
        width: DEFAULT_IMAGE_SIZE.width,
        height: DEFAULT_IMAGE_SIZE.height,
        position: DEFAULT_POSITION,
        rotation: 0,
        contentBase64: undefined,
        imageUrl: undefined,
        metadata: undefined,
        branchParentId: undefined,
        createdAt: now,
        updatedAt: now,
      },
      { owner: account },
    )
    const images = CanvasImageList.create([image], { owner: account })
    const canvas = Canvas.create(
      {
        name: name ?? "Untitled Canvas",
        width: 1024,
        height: 1024,
        defaultModel: DEFAULT_MODEL,
        defaultStyle: "default",
        backgroundPrompt: undefined,
        createdAt: now,
        updatedAt: now,
        images,
      },
      { owner: account },
    )

    account.root.canvases.$jazz.push(canvas)

    return {
      canvas: serializeCanvasRecord(canvas, auth.accountId),
      images: [serializeImage(image, canvas.$jazz.id)],
    }
  })
}

const findCanvas = (account: any, canvasId: string) =>
  account.root.canvases.find(
    (candidate: any) => candidate?.$jazz?.id === canvasId,
  )

const findCanvasImage = (account: any, imageId: string) => {
  for (const canvas of account.root.canvases) {
    const image = canvas.images?.find(
      (candidate: any) => candidate?.$jazz?.id === imageId,
    )
    if (image) {
      return { canvas, image }
    }
  }
  return null
}

export async function getOrCreateCanvasForUser(
  auth: JazzAuth,
): Promise<SerializedCanvas> {
  return withJazzUser(auth, async (account) => {
    const existing = [...account.root.canvases].filter(
      (canvas: any) => canvas && canvas.$isLoaded,
    )

    if (existing.length > 0) {
      const canvas = existing[0]
      const images = [...canvas.images]
        .filter((image: any) => image && image.$isLoaded)
        .sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0))

      return {
        canvas: serializeCanvasRecord(canvas, auth.accountId),
        images: images.map((image: any) =>
          serializeImage(image, canvas.$jazz.id),
        ),
      }
    }

    return createCanvasWithDefaults(auth)
  })
}

export async function getCanvasSnapshotById(
  auth: JazzAuth,
  canvasId: string,
): Promise<SerializedCanvas | null> {
  return withJazzUser(auth, async (account) => {
    const canvas = findCanvas(account, canvasId)
    if (!canvas) return null

    const images = [...canvas.images]
      .filter((image: any) => image && image.$isLoaded)
      .sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0))

    return {
      canvas: serializeCanvasRecord(canvas, auth.accountId),
      images: images.map((image: any) =>
        serializeImage(image, canvasId),
      ),
    }
  })
}

export async function createCanvasForUser(params: {
  auth: JazzAuth
  name?: string
}): Promise<SerializedCanvas> {
  return createCanvasWithDefaults(params.auth, params.name)
}

export async function listCanvasesForUser(
  auth: JazzAuth,
): Promise<SerializedCanvasSummary[]> {
  return withJazzUser(auth, async (account) => {
    const canvases = [...account.root.canvases].filter(
      (canvas: any) => canvas && canvas.$isLoaded,
    )

    if (canvases.length === 0) {
      const created = await createCanvasWithDefaults(auth)
      return [
        {
          canvas: created.canvas,
          previewImage: created.images[0] ?? null,
          imageCount: created.images.length,
        },
      ]
    }

    return canvases.map((canvas: any) => {
      const images = [...canvas.images].filter(
        (image: any) => image && image.$isLoaded,
      )
      const sortedImages = [...images].sort(
        (a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0),
      )
      const previewImage = sortedImages[0]
        ? serializeImage(sortedImages[0], canvas.$jazz.id)
        : null

      return {
        canvas: serializeCanvasRecord(canvas, auth.accountId),
        previewImage,
        imageCount: images.length,
      }
    })
  })
}

export async function createCanvasImage(params: {
  auth: JazzAuth
  canvasId: string
  name?: string
  prompt?: string
  position?: CanvasPoint
  size?: CanvasSize
  modelId?: string
  styleId?: string
  branchParentId?: string | null
}): Promise<SerializedCanvasImage> {
  return withJazzUser(params.auth, async (account) => {
    const canvas = findCanvas(account, params.canvasId)
    if (!canvas) {
      throw new Error("Canvas not found")
    }

    const now = Date.now()
    const image = CanvasImage.create(
      {
        name: params.name ?? DEFAULT_IMAGE_NAME,
        prompt: params.prompt ?? "",
        modelId: params.modelId ?? DEFAULT_MODEL,
        modelUsed: undefined,
        styleId: params.styleId ?? "default",
        width: params.size?.width ?? DEFAULT_IMAGE_SIZE.width,
        height: params.size?.height ?? DEFAULT_IMAGE_SIZE.height,
        position: params.position ?? DEFAULT_POSITION,
        rotation: 0,
        contentBase64: undefined,
        imageUrl: undefined,
        metadata: undefined,
        branchParentId: params.branchParentId ?? undefined,
        createdAt: now,
        updatedAt: now,
      },
      { owner: account },
    )

    canvas.images.$jazz.push(image)
    canvas.$jazz.set("updatedAt", now)

    return serializeImage(image, canvas.$jazz.id)
  })
}

export async function updateCanvasImage(params: {
  auth: JazzAuth
  imageId: string
  data: {
    name?: string
    prompt?: string
    modelId?: string
    modelUsed?: string | null
    styleId?: string
    position?: CanvasPoint
    size?: CanvasSize
    rotation?: number
    metadata?: Record<string, unknown> | null
    branchParentId?: string | null
    imageDataBase64?: string | null
    imageUrl?: string | null
  }
}): Promise<SerializedCanvasImage> {
  return withJazzUser(params.auth, async (account) => {
    const match = findCanvasImage(account, params.imageId)
    if (!match) {
      throw new Error("Image not found")
    }

    const { canvas, image } = match
    const now = Date.now()

    if (params.data.name !== undefined) image.$jazz.set("name", params.data.name)
    if (params.data.prompt !== undefined) image.$jazz.set("prompt", params.data.prompt)
    if (params.data.modelId !== undefined) image.$jazz.set("modelId", params.data.modelId)
    if (params.data.modelUsed !== undefined) {
      image.$jazz.set("modelUsed", params.data.modelUsed ?? undefined)
    }
    if (params.data.styleId !== undefined) image.$jazz.set("styleId", params.data.styleId)
    if (params.data.position) image.$jazz.set("position", params.data.position)
    if (params.data.size) {
      image.$jazz.set("width", params.data.size.width)
      image.$jazz.set("height", params.data.size.height)
    }
    if (typeof params.data.rotation === "number") {
      image.$jazz.set("rotation", params.data.rotation)
    }
    if (params.data.metadata !== undefined) {
      image.$jazz.set("metadata", params.data.metadata ?? undefined)
    }
    if (params.data.branchParentId !== undefined) {
      image.$jazz.set("branchParentId", params.data.branchParentId ?? undefined)
    }
    if (params.data.imageDataBase64 !== undefined) {
      image.$jazz.set("contentBase64", params.data.imageDataBase64 ?? undefined)
    }
    if (params.data.imageUrl !== undefined) {
      image.$jazz.set("imageUrl", params.data.imageUrl ?? undefined)
    }

    image.$jazz.set("updatedAt", now)
    canvas.$jazz.set("updatedAt", now)

    return serializeImage(image, canvas.$jazz.id)
  })
}

export async function deleteCanvasImage(auth: JazzAuth, imageId: string) {
  return withJazzUser(auth, async (account) => {
    const match = findCanvasImage(account, imageId)
    if (!match) return

    const { canvas } = match
    const index = canvas.images.findIndex(
      (candidate: any) => candidate?.$jazz?.id === imageId,
    )
    if (index !== -1) {
      canvas.images.$jazz.splice(index, 1)
      canvas.$jazz.set("updatedAt", Date.now())
    }
  })
}

export async function updateCanvasRecord(params: {
  auth: JazzAuth
  canvasId: string
  data: {
    name?: string
    width?: number
    height?: number
    defaultModel?: string
    defaultStyle?: string
    backgroundPrompt?: string | null
  }
}): Promise<SerializedCanvasRecord> {
  return withJazzUser(params.auth, async (account) => {
    const canvas = findCanvas(account, params.canvasId)
    if (!canvas) {
      throw new Error("Canvas not found")
    }

    if (params.data.name !== undefined) canvas.$jazz.set("name", params.data.name)
    if (params.data.width !== undefined) canvas.$jazz.set("width", params.data.width)
    if (params.data.height !== undefined) canvas.$jazz.set("height", params.data.height)
    if (params.data.defaultModel !== undefined) canvas.$jazz.set("defaultModel", params.data.defaultModel)
    if (params.data.defaultStyle !== undefined) canvas.$jazz.set("defaultStyle", params.data.defaultStyle)
    if (params.data.backgroundPrompt !== undefined) {
      canvas.$jazz.set("backgroundPrompt", params.data.backgroundPrompt ?? undefined)
    }
    canvas.$jazz.set("updatedAt", Date.now())

    return serializeCanvasRecord(canvas, params.auth.accountId)
  })
}

export async function getCanvasOwner(auth: JazzAuth, canvasId: string) {
  return withJazzUser(auth, async (account) => {
    const canvas = findCanvas(account, canvasId)
    return canvas ? { ownerId: auth.accountId } : null
  })
}

export async function getCanvasImageRecord(auth: JazzAuth, imageId: string) {
  return withJazzUser(auth, async (account) => {
    const match = findCanvasImage(account, imageId)
    if (!match) return null

    const { canvas, image } = match
    return {
      id: image.$jazz.id,
      canvas_id: canvas.$jazz.id,
      name: image.name ?? DEFAULT_IMAGE_NAME,
      prompt: image.prompt ?? "",
      model_id: image.modelId ?? DEFAULT_MODEL,
      model_used: image.modelUsed ?? null,
      style_id: image.styleId ?? "default",
      width: image.width ?? DEFAULT_IMAGE_SIZE.width,
      height: image.height ?? DEFAULT_IMAGE_SIZE.height,
      position: image.position ?? DEFAULT_POSITION,
      rotation: image.rotation ?? 0,
      content_base64: image.contentBase64 ?? null,
      image_url: image.imageUrl ?? null,
      metadata: (image.metadata as Record<string, unknown> | null) ?? null,
      branch_parent_id: image.branchParentId ?? null,
      created_at: image.createdAt ? new Date(image.createdAt) : new Date(),
      updated_at: image.updatedAt ? new Date(image.updatedAt) : new Date(),
    }
  })
}
