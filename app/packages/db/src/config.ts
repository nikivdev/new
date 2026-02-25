"use rise"

import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

export interface DbConfig {
  readonly url: string
  readonly authToken?: string
}

export const resolveDbConfig = (env: {
  readonly DB_URL: string
  readonly DB_AUTH_TOKEN: string
}): DbConfig => {
  if (env.DB_URL.length > 0) {
    return {
      url: env.DB_URL,
      authToken: env.DB_AUTH_TOKEN.length > 0 ? env.DB_AUTH_TOKEN : undefined,
    }
  }
  return { url: "file:local.db" }
}

export const ensureDbDirectory = (config: DbConfig): DbConfig => {
  if (config.url.startsWith("file:")) {
    const filePath = config.url.slice(5)
    const dir = dirname(filePath)
    if (dir !== "." && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
  return config
}
