"use rise"

import { Config, Effect } from "effect"

export class Env extends Effect.Service<Env>()("rise/Env", {
  accessors: true,
  effect: Effect.gen(function* () {
    const env = {
      PORT: yield* Config.number("PORT").pipe(Config.withDefault(8787)),
      DB_URL: yield* Config.string("DB_URL").pipe(Config.withDefault("")),
      DB_AUTH_TOKEN: yield* Config.string("DB_AUTH_TOKEN").pipe(
        Config.withDefault(""),
      ),
      ROOT_PASSWORD: yield* Config.string("ROOT_PASSWORD").pipe(
        Config.withDefault(""),
      ),
      CORS_ORIGINS: yield* Config.string("CORS_ORIGINS").pipe(
        Config.withDefault("*"),
      ),

      // AI Provider keys
      OPENROUTER_API_KEY: yield* Config.string("OPENROUTER_API_KEY").pipe(
        Config.withDefault(""),
      ),
      CEREBRAS_API_KEY: yield* Config.string("CEREBRAS_API_KEY").pipe(
        Config.withDefault(""),
      ),
      OPENAI_API_KEY: yield* Config.string("OPENAI_API_KEY").pipe(
        Config.withDefault(""),
      ),
      GEMINI_API_KEY: yield* Config.string("GEMINI_API_KEY").pipe(
        Config.withDefault(""),
      ),

      // Usage limits
      GUEST_DAILY_LIMIT: yield* Config.number("GUEST_DAILY_LIMIT").pipe(
        Config.withDefault(5),
      ),
      FREE_DAILY_LIMIT: yield* Config.number("FREE_DAILY_LIMIT").pipe(
        Config.withDefault(20),
      ),
      PAID_STANDARD_LIMIT: yield* Config.number("PAID_STANDARD_LIMIT").pipe(
        Config.withDefault(1000),
      ),
      PAID_PREMIUM_LIMIT: yield* Config.number("PAID_PREMIUM_LIMIT").pipe(
        Config.withDefault(100),
      ),
      PAID_USER_IDS: yield* Config.string("PAID_USER_IDS").pipe(
        Config.withDefault(""),
      ),
    } as const

    if (env.ROOT_PASSWORD.trim().length === 0) {
      return yield* Effect.dieMessage(
        "ROOT_PASSWORD is required for self-hosted auth",
      )
    }

    return env
  }),
}) {}
