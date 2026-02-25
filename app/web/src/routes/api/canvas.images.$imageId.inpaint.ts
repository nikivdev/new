import { createFileRoute } from "@tanstack/react-router"

import { generateZImageInpaint, Z_IMAGE_MODEL_ID } from "@/lib/ai/zimage"
import {
  getCanvasImageRecord,
  getCanvasOwner,
  updateCanvasImage,
} from "@/lib/canvas/db"
import { resolveCanvasUser } from "@/lib/canvas/user-session"
import { checkUsageAllowed, recordUsage } from "@/lib/billing"

const INPAINT_ERROR_FALLBACK = "Image update failed. Please try again."

const formatInpaintError = (error: unknown) => {
  if (!(error instanceof Error) || !error.message) {
    return INPAINT_ERROR_FALLBACK
  }

  const lower = error.message.toLowerCase()
  if (lower.includes("quota exceeded")) {
    return "Image generation quota exceeded. Check your plan or try again shortly."
  }

  if (error.message.length > 160 || lower.includes("https://")) {
    return INPAINT_ERROR_FALLBACK
  }

  return error.message
}

const json = (data: unknown, status = 200, setCookie?: string) => {
  const headers = new Headers({ "content-type": "application/json" })
  if (setCookie) {
    headers.set("set-cookie", setCookie)
  }
  return new Response(JSON.stringify(data), { status, headers })
}

type CanvasImageRecord = NonNullable<Awaited<ReturnType<typeof getCanvasImageRecord>>>

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const inferMimeFromUrl = (url: string | null) => {
  if (!url) return "image/png"
  if (url.endsWith(".jpg") || url.endsWith(".jpeg")) return "image/jpeg"
  if (url.endsWith(".webp")) return "image/webp"
  if (url.endsWith(".gif")) return "image/gif"
  return "image/png"
}

const loadBaseImage = async (record: CanvasImageRecord) => {
  if (record.content_base64) {
    const metadata =
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as { mimeType?: string })
        : null
    return {
      base64: record.content_base64,
      mimeType: metadata?.mimeType ?? "image/png",
    }
  }

  if (!record.image_url) {
    throw new Error("No stored image data to inpaint.")
  }

  const response = await fetch(record.image_url)
  if (!response.ok) {
    throw new Error("Failed to download the source image for inpainting.")
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  return {
    base64: buffer.toString("base64"),
    mimeType: response.headers.get("content-type") ?? inferMimeFromUrl(record.image_url),
  }
}

export const Route = createFileRoute("/api/canvas/images/$imageId/inpaint")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { auth, userId, setCookie } = await resolveCanvasUser(request)
          const imageId = params.imageId
          const record = await getCanvasImageRecord(auth, imageId)
          if (!record) {
            return json({ error: "Not found" }, 404, setCookie)
          }

          const owner = await getCanvasOwner(auth, record.canvas_id)
          if (!owner || owner.ownerId !== auth.accountId) {
            return json({ error: "Forbidden" }, 403, setCookie)
          }

          const usageCheck = await checkUsageAllowed(request, userId)
          if (!usageCheck.allowed) {
            return json(
              {
                error: "Usage limit exceeded",
                reason: usageCheck.reason,
                remaining: usageCheck.remaining,
                limit: usageCheck.limit,
              },
              429,
              setCookie,
            )
          }

          const body = await request.json().catch(() => ({}))
          const mask = typeof body.mask === "string" ? body.mask.trim() : ""
          if (!mask) {
            return json({ error: "Mask data is required" }, 400, setCookie)
          }

          const promptInput = typeof body.prompt === "string" ? body.prompt.trim() : ""
          const prompt = promptInput || record.prompt?.trim() || ""
          if (!prompt) {
            return json({ error: "Prompt required" }, 400, setCookie)
          }

          const baseImage = await loadBaseImage(record)

          const steps =
            typeof body.numInferenceSteps === "number" && Number.isFinite(body.numInferenceSteps)
              ? clamp(Math.round(body.numInferenceSteps), 1, 50)
              : undefined
          const guidance =
            typeof body.guidanceScale === "number" && Number.isFinite(body.guidanceScale)
              ? clamp(body.guidanceScale, 0.1, 20)
              : undefined
          const strength =
            typeof body.strength === "number" && Number.isFinite(body.strength)
              ? clamp(body.strength, 0, 1)
              : undefined

          const generation = await generateZImageInpaint({
            prompt,
            baseImageBase64: baseImage.base64,
            baseImageMimeType: baseImage.mimeType,
            maskDataUrl: mask,
            numInferenceSteps: steps,
            guidanceScale: guidance,
            strength,
          })

          const image = await updateCanvasImage({
            auth,
            imageId,
            data: {
              prompt,
              modelUsed: Z_IMAGE_MODEL_ID,
              imageDataBase64: generation.base64Image,
              imageUrl: null,
              metadata: {
                provider: "huggingface.z-image",
                mimeType: generation.mimeType,
                description: prompt,
                generatedAt: new Date().toISOString(),
                maskApplied: true,
                parameters: {
                  num_inference_steps: steps ?? null,
                  guidance_scale: guidance ?? null,
                  strength: strength ?? null,
                },
              },
            },
          })

          await recordUsage(
            request,
            1,
            `canvas-inpaint-${imageId}-${Date.now()}`,
            "standard",
            userId,
          )

          return json({ image }, 200, setCookie)
        } catch (error) {
          if (error instanceof Response) return error
          console.error("[api/canvas/images/:id/inpaint] POST", error)
          const message = formatInpaintError(error)
          return json({ error: message }, 500)
        }
      },
    },
  },
})
