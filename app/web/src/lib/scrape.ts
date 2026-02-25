type ScrapeEnv = {
  SCRAPE_SERVICE_URL?: string
  SCRAPE_SERVICE_TOKEN?: string
}

const getEnv = (): ScrapeEnv => {
  let SCRAPE_SERVICE_URL: string | undefined
  let SCRAPE_SERVICE_TOKEN: string | undefined

  try {
    const { getServerContext } = require("@tanstack/react-start/server") as {
      getServerContext: () => { cloudflare?: { env?: ScrapeEnv } } | null
    }
    const ctx = getServerContext()
    SCRAPE_SERVICE_URL = ctx?.cloudflare?.env?.SCRAPE_SERVICE_URL
    SCRAPE_SERVICE_TOKEN = ctx?.cloudflare?.env?.SCRAPE_SERVICE_TOKEN
  } catch {
    // Not in server context
  }

  SCRAPE_SERVICE_URL = SCRAPE_SERVICE_URL ?? process.env.SCRAPE_SERVICE_URL
  SCRAPE_SERVICE_TOKEN =
    SCRAPE_SERVICE_TOKEN ?? process.env.SCRAPE_SERVICE_TOKEN

  return { SCRAPE_SERVICE_URL, SCRAPE_SERVICE_TOKEN }
}

export const getScrapeConfig = () => {
  const env = getEnv()
  return {
    url: env.SCRAPE_SERVICE_URL,
    token: env.SCRAPE_SERVICE_TOKEN,
  }
}
