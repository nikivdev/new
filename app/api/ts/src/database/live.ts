"use rise"

import { Context, Effect, Layer } from "effect"
import { createClient, type Client } from "@libsql/client"
import { Env } from "../env.js"
import { resolveDbConfig, ensureDbDirectory, runMigrations } from "@app/db"

export class Database extends Context.Tag("rise/Database")<
  Database,
  Client
>() {}

export const DatabaseLive: Layer.Layer<Database, never, Env> =
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const env = yield* Env

      const dbConfig = ensureDbDirectory(
        resolveDbConfig({
          DB_URL: env.DB_URL,
          DB_AUTH_TOKEN: env.DB_AUTH_TOKEN,
        }),
      )

      yield* Effect.tryPromise(() => runMigrations(dbConfig)).pipe(
        Effect.tap(() => Effect.logInfo("[Database] Migrations complete")),
        Effect.orDie,
      )

      const client = createClient({
        url: dbConfig.url,
        authToken: dbConfig.authToken,
      })

      return Layer.succeed(Database, client)
    }),
  )
