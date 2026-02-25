import { createFileRoute } from "@tanstack/react-router"
import {
  getCanvasImageRecord,
  getCanvasOwner,
  updateCanvasImage,
} from "@/lib/canvas/db"
import { generateGeminiImage, DEFAULT_GEMINI_IMAGE_MODEL } from "@/lib/ai/gemini-image"
import { generateOpenAIImage } from "@/lib/ai/openai-image"
import { resolveCanvasUser } from "@/lib/canvas/user-session"
import { STYLE_PRESETS } from "@/features/canvas/styles-presets"
import { checkUsageAllowed, recordUsage } from "@/lib/billing"

const GENERATION_ERROR_FALLBACK = "Image generation failed. Please try again."

const formatGenerationError = (error: unknown) => {
  if (!(error instanceof Error) || !error.message) {
    return GENERATION_ERROR_FALLBACK
  }

  const lower = error.message.toLowerCase()
  if (lower.includes("quota exceeded")) {
    return "Image generation quota exceeded. Check your plan or try again shortly."
  }

  if (error.message.length > 160 || lower.includes("https://")) {
    return GENERATION_ERROR_FALLBACK
  }

  return error.message
}

const json = (data: unknown, status = 200, setCookie?: string) => {
  const headers = new Headers({ "content-type": "application/json" })
  if (setCookie) {
    headers.set("set-cookie", setCookie)
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  })
}

const applyStylePrompt = (styleId: string | null | undefined, prompt: string) => {
  if (!styleId || styleId === "default") {
    return { resolvedStyleId: "default", prompt: prompt.trim() }
  }
  const preset = STYLE_PRESETS.find((item) => item.id === styleId)
  if (!preset || preset.id === "default") {
    return { resolvedStyleId: preset?.id ?? "default", prompt: prompt.trim() }
  }
  const stylePrompt = preset.prompt.trim()
  const basePrompt = prompt.trim()
  const combined = stylePrompt ? `${stylePrompt}\n\n${basePrompt}` : basePrompt
  return { resolvedStyleId: preset.id, prompt: combined }
}

const normalizeGeminiModelId = (modelId?: string | null) => {
  if (!modelId) return DEFAULT_GEMINI_IMAGE_MODEL
  if (
    modelId.includes("gemini-2.0-flash-exp-image-generation") ||
    modelId === "gemini-1.5-flash" ||
    modelId === "gemini-1.5-flash-latest"
  ) {
    return DEFAULT_GEMINI_IMAGE_MODEL
  }
  return modelId
}

export const Route = createFileRoute("/api/canvas/images/$imageId/generate")({
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

          // Check standard token limits (shared with chat)
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
          const prompt =
            typeof body.prompt === "string" && body.prompt.trim().length > 0
              ? body.prompt
              : record.prompt

          if (!prompt || !prompt.trim()) {
            return json({ error: "Prompt required" }, 400, setCookie)
          }

          const basePrompt = prompt.trim()
          const modelId =
            typeof body.modelId === "string" && body.modelId.trim().length > 0
              ? body.modelId
              : record.model_id
          const styleId =
            typeof body.styleId === "string" && body.styleId.trim().length > 0
              ? body.styleId
              : record.style_id

          const { prompt: styledPrompt, resolvedStyleId } = applyStylePrompt(styleId, basePrompt)

          const temperature =
            typeof body.temperature === "number" && Number.isFinite(body.temperature)
              ? body.temperature
              : undefined

          const provider = modelId?.includes("gpt-image") || modelId?.includes("dall") ? "openai" : "gemini"
          const resolvedModelId =
            provider === "gemini" ? normalizeGeminiModelId(modelId) : modelId ?? undefined

          let generation: {
            base64: string
            mimeType: string
            description?: string
            provider: string
          }

          if (provider === "openai") {
            const result = await generateOpenAIImage({
              prompt: styledPrompt,
              model: resolvedModelId,
            })
            generation = {
              base64: result.base64Image,
              mimeType: result.mimeType,
              description: result.revisedPrompt ?? styledPrompt,
              provider: "openai.dall-e-3",
            }
          } else {
            const result = await generateGeminiImage({
              prompt: styledPrompt,
              model: resolvedModelId,
              temperature,
            })
            generation = {
              base64: result.base64Image,
              mimeType: result.mimeType,
              description: styledPrompt,
              provider: "google.gemini",
            }
          }

          const image = await updateCanvasImage({
            auth,
            imageId,
            data: {
              prompt: basePrompt,
              modelId: provider === "gemini" ? resolvedModelId : modelId ?? record.model_id,
              modelUsed: provider === "gemini" ? resolvedModelId : modelId ?? record.model_id,
              styleId: resolvedStyleId,
              imageDataBase64: generation.base64,
              metadata: {
                provider: generation.provider,
                mimeType: generation.mimeType,
                description: generation.description ?? styledPrompt,
                generatedAt: new Date().toISOString(),
              },
            },
          })

          // Record standard usage so canvas shares the chat token meter
          await recordUsage(
            request,
            1,
            `canvas-${imageId}-${Date.now()}`,
            "standard",
            userId,
          )

          return json({ image }, 200, setCookie)
        } catch (error) {
          if (error instanceof Response) return error
          console.error("[api/canvas/images/:id/generate] POST", error)
          const message = formatGenerationError(error)
          return json({ error: message }, 500)
        }
      },
    },
  },
})
