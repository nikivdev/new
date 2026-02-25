import { createOpenRouter } from "@openrouter/ai-sdk-provider"

type CloudflareEnv = {
  OPENROUTER_API_KEY?: string
  OPENROUTER_MODEL?: string
}

// Helper to get Cloudflare env
const getCloudflareEnv = (): CloudflareEnv | undefined => {
  try {
    // Use cloudflare:workers module (requires TanStack Start v1.138.0+)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require("cloudflare:workers") as { env: CloudflareEnv }
    return env
  } catch {
    return undefined
  }
}

// Get API key from Cloudflare env or process.env
const getApiKey = (): string | undefined => {
  // Try Cloudflare Workers context first
  const cfEnv = getCloudflareEnv()
  if (cfEnv?.OPENROUTER_API_KEY) {
    console.log("[ai-provider] Got API key from Cloudflare env")
    return cfEnv.OPENROUTER_API_KEY
  }

  const hasProcessEnvKey = !!process.env.OPENROUTER_API_KEY
  console.log("[ai-provider] Using process.env, has key:", hasProcessEnvKey)
  return process.env.OPENROUTER_API_KEY
}

const DEFAULT_OPENROUTER_MODEL = "stepfun/step-3.5-flash:free"

const getModel = (): string => {
  const cfEnv = getCloudflareEnv()
  const fromCloudflare = cfEnv?.OPENROUTER_MODEL?.trim()
  if (fromCloudflare) {
    return fromCloudflare
  }

  const fromProcessEnv = process.env.OPENROUTER_MODEL?.trim()
  if (fromProcessEnv) {
    return fromProcessEnv
  }

  return DEFAULT_OPENROUTER_MODEL
}

export const getOpenRouter = () => {
  const apiKey = getApiKey()
  if (!apiKey) {
    console.log("[ai-provider] No API key available, returning null")
    return null
  }
  console.log("[ai-provider] Creating OpenRouter client with key length:", apiKey.length)
  return createOpenRouter({ apiKey })
}

// Create OpenRouter with explicit API key (for use when you have the key from cloudflare env)
export const getOpenRouterWithKey = (apiKey: string | undefined) => {
  if (!apiKey) {
    console.log("[ai-provider] No API key provided, returning null")
    return null
  }
  console.log("[ai-provider] Creating OpenRouter client with provided key, length:", apiKey.length)
  return createOpenRouter({ apiKey })
}

export const getDefaultModel = () => getModel()
