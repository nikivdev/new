"use rise"

import { Effect } from "effect"
import { Env } from "../../env.js"

export type ImageGenerationResult = {
  readonly url: string
  readonly revisedPrompt?: string
}

export const generateImage = (options: {
  readonly prompt: string
  readonly model?: string
  readonly size?: string
}) =>
  Effect.gen(function* () {
    const env = yield* Env

    const apiKey = env.OPENAI_API_KEY
    if (apiKey.length === 0) {
      return yield* Effect.fail(new Error("OPENAI_API_KEY not configured"))
    }

    const model = options.model ?? "dall-e-3"
    const size = options.size ?? "1024x1024"

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            prompt: options.prompt,
            n: 1,
            size,
            response_format: "url",
          }),
        }),
      catch: (e) => new Error(`OpenAI request failed: ${e}`),
    })

    if (!response.ok) {
      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => new Error("Failed to read error response"),
      })
      return yield* Effect.fail(
        new Error(`OpenAI API error ${response.status}: ${text}`),
      )
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{
        data: Array<{ url: string; revised_prompt?: string }>
      }>,
      catch: () => new Error("Failed to parse OpenAI response"),
    })

    const image = json.data[0]
    if (!image) {
      return yield* Effect.fail(new Error("No image in OpenAI response"))
    }

    return {
      url: image.url,
      revisedPrompt: image.revised_prompt,
    } as ImageGenerationResult
  })
