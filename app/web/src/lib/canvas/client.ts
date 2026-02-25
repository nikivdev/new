import type {
  SerializedCanvas,
  SerializedCanvasImage,
  SerializedCanvasSummary,
} from "./types"
import { withJazzAuthHeaders } from "@/lib/jazz/headers"

const jsonHeaders = { "content-type": "application/json" }

const withJazzHeaders = (headers: HeadersInit = {}) =>
  withJazzAuthHeaders(headers)

const handleJson = async (response: Response) => {
  if (!response.ok) {
    const text = await response.text()
    let message = text
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed.error === "string") {
        message = parsed.error
      }
    } catch {
      // response was not JSON; fall back to raw text
    }
    const error = new Error(message || "Canvas request failed") as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return (await response.json()) as any
}

export const fetchCanvasSnapshot = async (
  canvasId: string,
  { accountId }: { accountId?: string | null } = {},
): Promise<SerializedCanvas> => {
  const res = await fetch(`/api/canvas/${canvasId}`, {
    credentials: "include",
    headers: withJazzHeaders({}),
  })
  const data = await handleJson(res)
  return data as SerializedCanvas
}

export const fetchCanvasList = async ({
  accountId,
}: {
  accountId?: string | null
} = {}): Promise<SerializedCanvasSummary[]> => {
  const res = await fetch("/api/canvas", {
    credentials: "include",
    headers: withJazzHeaders({}),
  })
  const data = await handleJson(res)
  return data.canvases as SerializedCanvasSummary[]
}

export const createCanvasProject = async (params: {
  name?: string
  accountId?: string | null
} = {}): Promise<SerializedCanvas> => {
  const res = await fetch("/api/canvas", {
    method: "POST",
    headers: withJazzHeaders(jsonHeaders),
    credentials: "include",
    body: JSON.stringify({ name: params.name }),
  })
  const data = await handleJson(res)
  return data as SerializedCanvas
}

export const createCanvasBox = async (params: {
  canvasId: string
  name?: string
  prompt?: string
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  modelId?: string
  styleId?: string
  branchParentId?: string | null
  accountId?: string | null
}): Promise<SerializedCanvasImage> => {
  const { accountId, ...payload } = params
  const res = await fetch("/api/canvas/images", {
    method: "POST",
    headers: withJazzHeaders(jsonHeaders),
    credentials: "include",
    body: JSON.stringify(payload),
  })
  const data = await handleJson(res)
  return data.image as SerializedCanvasImage
}

export const updateCanvasBox = async (
  imageId: string,
  data: Partial<{
    name: string
    prompt: string
    modelId: string
    styleId: string
    position: { x: number; y: number }
    size: { width: number; height: number }
    rotation: number
  }> & { accountId?: string | null },
): Promise<SerializedCanvasImage> => {
  const { accountId, ...payload } = data
  const res = await fetch(`/api/canvas/images/${imageId}`, {
    method: "PATCH",
    headers: withJazzHeaders(jsonHeaders),
    credentials: "include",
    body: JSON.stringify(payload),
  })
  const json = await handleJson(res)
  return json.image as SerializedCanvasImage
}

export const deleteCanvasBox = async (
  imageId: string,
  { accountId }: { accountId?: string | null } = {},
) => {
  const res = await fetch(`/api/canvas/images/${imageId}`, {
    method: "DELETE",
    headers: withJazzHeaders(jsonHeaders),
    credentials: "include",
  })
  await handleJson(res)
}

export const generateCanvasBoxImage = async (params: {
  imageId: string
  prompt?: string
  modelId?: string
  temperature?: number
  accountId?: string | null
}): Promise<SerializedCanvasImage> => {
  const { accountId, ...payload } = params
  const res = await fetch(`/api/canvas/images/${params.imageId}/generate`, {
    method: "POST",
    headers: withJazzHeaders(jsonHeaders),
    credentials: "include",
    body: JSON.stringify({
      prompt: payload.prompt,
      modelId: payload.modelId,
      temperature: payload.temperature,
    }),
  })
  const json = await handleJson(res)
  return json.image as SerializedCanvasImage
}

export const inpaintCanvasBoxImage = async (params: {
  imageId: string
  mask: string
  prompt?: string
  numInferenceSteps?: number
  guidanceScale?: number
  strength?: number
  accountId?: string | null
}): Promise<SerializedCanvasImage> => {
  const { accountId, ...payload } = params
  const res = await fetch(`/api/canvas/images/${params.imageId}/inpaint`, {
    method: "POST",
    headers: withJazzHeaders(jsonHeaders),
    credentials: "include",
    body: JSON.stringify({
      mask: payload.mask,
      prompt: payload.prompt,
      numInferenceSteps: payload.numInferenceSteps,
      guidanceScale: payload.guidanceScale,
      strength: payload.strength,
    }),
  })
  const json = await handleJson(res)
  return json.image as SerializedCanvasImage
}
