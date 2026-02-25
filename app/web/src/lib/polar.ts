type PolarEnv = {
  POLAR_ACCESS_TOKEN?: string
  POLAR_WEBHOOK_SECRET?: string
  POLAR_PRO_PRODUCT_ID?: string
  POLAR_REFILL_PRODUCT_ID?: string
  POLAR_API_URL?: string
}

const getEnv = (): PolarEnv => {
  let POLAR_ACCESS_TOKEN: string | undefined
  let POLAR_WEBHOOK_SECRET: string | undefined
  let POLAR_PRO_PRODUCT_ID: string | undefined
  let POLAR_REFILL_PRODUCT_ID: string | undefined
  let POLAR_API_URL: string | undefined

  try {
    const { getServerContext } = require("@tanstack/react-start/server") as {
      getServerContext: () => { cloudflare?: { env?: PolarEnv } } | null
    }
    const ctx = getServerContext()
    POLAR_ACCESS_TOKEN = ctx?.cloudflare?.env?.POLAR_ACCESS_TOKEN
    POLAR_WEBHOOK_SECRET = ctx?.cloudflare?.env?.POLAR_WEBHOOK_SECRET
    POLAR_PRO_PRODUCT_ID = ctx?.cloudflare?.env?.POLAR_PRO_PRODUCT_ID
    POLAR_REFILL_PRODUCT_ID = ctx?.cloudflare?.env?.POLAR_REFILL_PRODUCT_ID
    POLAR_API_URL = ctx?.cloudflare?.env?.POLAR_API_URL
  } catch {
    // Not in server context
  }

  POLAR_ACCESS_TOKEN = POLAR_ACCESS_TOKEN ?? process.env.POLAR_ACCESS_TOKEN
  POLAR_WEBHOOK_SECRET = POLAR_WEBHOOK_SECRET ?? process.env.POLAR_WEBHOOK_SECRET
  POLAR_PRO_PRODUCT_ID = POLAR_PRO_PRODUCT_ID ?? process.env.POLAR_PRO_PRODUCT_ID
  POLAR_REFILL_PRODUCT_ID = POLAR_REFILL_PRODUCT_ID ?? process.env.POLAR_REFILL_PRODUCT_ID
  POLAR_API_URL = POLAR_API_URL ?? process.env.POLAR_API_URL

  return { POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET, POLAR_PRO_PRODUCT_ID, POLAR_REFILL_PRODUCT_ID, POLAR_API_URL }
}

export const getPolarConfig = () => {
  const env = getEnv()
  return {
    accessToken: env.POLAR_ACCESS_TOKEN,
    webhookSecret: env.POLAR_WEBHOOK_SECRET,
    proProductId: env.POLAR_PRO_PRODUCT_ID,
    refillProductId: env.POLAR_REFILL_PRODUCT_ID,
    apiUrl: env.POLAR_API_URL ?? "https://api.polar.sh",
  }
}

export async function polarFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { accessToken, apiUrl } = getPolarConfig()

  if (!accessToken) {
    throw new Error("POLAR_ACCESS_TOKEN not configured")
  }

  const url = `${apiUrl}${path}`
  const headers = new Headers(options.headers)
  headers.set("Authorization", `Bearer ${accessToken}`)
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json")
  }

  return fetch(url, { ...options, headers })
}
