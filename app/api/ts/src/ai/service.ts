"use rise"

import { Effect, Stream } from "effect"
import { Env } from "../env.js"
import { streamCerebras } from "./providers/cerebras.js"
import { streamOpenRouter } from "./providers/openrouter.js"
import type { ChatMessage } from "./providers/cerebras.js"

export { type ChatMessage } from "./providers/cerebras.js"

const PREMIUM_MODELS = [
  "anthropic/claude-sonnet-4",
  "anthropic/claude-opus-4",
  "openai/gpt-4o",
]

const CEREBRAS_MODELS = ["cerebras/zai-glm-4.7"]

export type MeterType = "standard" | "premium"

export const getMeterForModel = (model: string): MeterType =>
  PREMIUM_MODELS.includes(model) ? "premium" : "standard"

const chat = Effect.fn("AiService.chat")(
  (
    messages: ReadonlyArray<ChatMessage>,
    model: string,
  ): Effect.Effect<Stream.Stream<string, Error>, Error, Env> => {
    if (CEREBRAS_MODELS.includes(model)) {
      return streamCerebras(messages, model)
    }
    return streamOpenRouter(messages, model)
  },
)

export class AiService extends Effect.Service<AiService>()("rise/AiService", {
  accessors: true,
  dependencies: [Env.Default],
  effect: Effect.succeed({ chat, getMeterForModel }),
}) {}
