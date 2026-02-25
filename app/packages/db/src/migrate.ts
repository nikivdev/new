"use rise"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { DbConfig } from "./config.js"

const defaultMigrationsFolder = () =>
  resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle")

export const runMigrations = async (
  config: DbConfig,
  migrationsFolder = defaultMigrationsFolder(),
) => {
  if (!existsSync(migrationsFolder)) {
    throw new Error(`Migrations folder not found: ${migrationsFolder}`)
  }
  const client = createClient({
    url: config.url,
    authToken: config.authToken,
  })
  const db = drizzle(client)
  await migrate(db, { migrationsFolder })
  client.close()
}
