import { InferenceClient } from "@huggingface/inference"

const Z_IMAGE_MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"

type ZImageEnv = {
  HF_TOKEN?: string
  HUGGING_FACE_API_KEY?: string
}

const DEFAULT_MASK_MIME = "image/png"

const getEnv = (): ZImageEnv => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getServerContext } = require("@tanstack/react-start/server") as {
      getServerContext: () => { cloudflare?: { env?: ZImageEnv } } | null
    }
    const ctx = getServerContext()
    if (ctx?.cloudflare?.env) {
      return ctx.cloudflare.env
    }
  } catch {
    // not running within the server context
  }
  return {
    HF_TOKEN: process.env.HF_TOKEN,
    HUGGING_FACE_API_KEY: process.env.HUGGING_FACE_API_KEY,
  }
}

const ensureBase64 = (input: string): string => {
  if (input.startsWith("data:")) {
    const [, payload = ""] = input.split(",", 2)
    return payload.trim()
  }
  return input.trim()
}

const toDataUrl = (base64: string, mimeType: string) =>
  `data:${mimeType || DEFAULT_MASK_MIME};base64,${ensureBase64(base64)}`

const normalizeDataUrl = (input: string, fallbackMime = DEFAULT_MASK_MIME) => {
  if (input.startsWith("data:")) {
    return input
  }
  return toDataUrl(input, fallbackMime)
}

export type ZImageInpaintRequest = {
  prompt: string
  baseImageBase64: string
  baseImageMimeType?: string
  maskDataUrl: string
  numInferenceSteps?: number
  guidanceScale?: number
  strength?: number
}

export type ZImageInpaintResponse = {
  base64Image: string
  mimeType: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export async function generateZImageInpaint(
  params: ZImageInpaintRequest,
): Promise<ZImageInpaintResponse> {
  const env = getEnv()
  const token = env.HF_TOKEN ?? env.HUGGING_FACE_API_KEY
  if (!token) {
    throw new Error("Set HF_TOKEN or HUGGING_FACE_API_KEY to enable Z-Image inpainting.")
  }

  const client = new InferenceClient(token)
  const payload: Record<string, unknown> = {
    model: Z_IMAGE_MODEL_ID,
    provider: "fal-ai",
    inputs: params.prompt,
    image_url: normalizeDataUrl(
      params.baseImageBase64,
      params.baseImageMimeType ?? "image/png",
    ),
    mask_url: normalizeDataUrl(params.maskDataUrl, DEFAULT_MASK_MIME),
  }

  if (typeof params.numInferenceSteps === "number" && Number.isFinite(params.numInferenceSteps)) {
    payload.num_inference_steps = clamp(Math.round(params.numInferenceSteps), 1, 50)
  }
  if (typeof params.guidanceScale === "number" && Number.isFinite(params.guidanceScale)) {
    payload.guidance_scale = clamp(params.guidanceScale, 0.1, 20)
  }
  if (typeof params.strength === "number" && Number.isFinite(params.strength)) {
    payload.strength = clamp(params.strength, 0, 1)
  }

  const blob = await client.textToImage(payload, { outputType: "blob" })
  const buffer = Buffer.from(await blob.arrayBuffer())
  return {
    base64Image: buffer.toString("base64"),
    mimeType: blob.type || "image/png",
  }
}

export { Z_IMAGE_MODEL_ID }
