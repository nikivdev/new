"use rise"

import { Effect, Stream } from "effect"
import { Env } from "../../env.js"

export type ChatMessage = {
  readonly role: "user" | "assistant" | "system"
  readonly content: string
}

export const streamCerebras = (
  messages: ReadonlyArray<ChatMessage>,
  model: string,
) =>
  Effect.gen(function* () {
    const env = yield* Env

    const apiKey = env.CEREBRAS_API_KEY
    if (apiKey.length === 0) {
      return yield* Effect.fail(new Error("CEREBRAS_API_KEY not configured"))
    }

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch("https://api.cerebras.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
          }),
        }),
      catch: (e) => new Error(`Cerebras request failed: ${e}`),
    })

    if (!response.ok) {
      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => new Error("Failed to read error response"),
      })
      return yield* Effect.fail(new Error(`Cerebras API error ${response.status}: ${text}`))
    }

    return readSseStream(response)
  })

const readSseStream = (response: Response): Stream.Stream<string, Error> =>
  Stream.async<string, Error>((emit) => {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    const read = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            emit.end()
            return
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop()!

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data:")) continue
            const data = trimmed.slice(5).trim()
            if (data === "[DONE]") {
              emit.end()
              return
            }
            try {
              const json = JSON.parse(data)
              const content =
                json.choices?.[0]?.delta?.content ??
                json.choices?.[0]?.delta?.text ??
                ""
              if (content) {
                emit.single(content)
              }
              if (json.choices?.[0]?.finish_reason) {
                emit.end()
                return
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } catch (e) {
        emit.fail(new Error(`Stream read error: ${e}`))
      }
    }

    read()
  })
