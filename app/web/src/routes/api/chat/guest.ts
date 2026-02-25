import { createFileRoute } from "@tanstack/react-router"
import { getFlowPersonalEnv, getFlowPersonalEnvInfo } from "@/lib/ai/flow-env"

const buildThreadId = (provided?: string) => {
  if (provided && provided.trim()) return provided
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `guest-${Date.now()}`
}

const normalizeModel = (value?: string) => {
  if (!value) return "zai-glm-4.7"
  return value.includes("/") ? value.split("/").pop() || value : value
}

type AiServerConfig = {
  url: string
  token: string
  model: string
}

const getAiServerConfig = () => {
  const url =
    process.env.AI_SERVER_URL ??
    process.env.ZERG_AI_URL ??
    process.env.ZERG_AI_SERVER_URL ??
    ""
  if (!url) return null
  return {
    url: url.replace(/\/+$/g, ""),
    token:
      process.env.AI_SERVER_TOKEN ??
      process.env.ZERG_AI_TOKEN ??
      process.env.ZERG_AI_SERVER_TOKEN ??
      "",
    model:
      process.env.AI_SERVER_MODEL ??
      process.env.AI_MODEL ??
      process.env.CEREBRAS_MODEL ??
      "zai-glm-4.7",
  }
}

const getLocalAiServerConfig = () => {
  if (process.env.NODE_ENV === "production") return null
  const url = process.env.AI_LOCAL_SERVER_URL ?? "http://127.0.0.1:7331"
  if (!url) return null
  return {
    url: url.replace(/\/+$/g, ""),
    token:
      process.env.AI_SERVER_TOKEN ??
      process.env.ZERG_AI_TOKEN ??
      process.env.ZERG_AI_SERVER_TOKEN ??
      "",
    model:
      process.env.AI_SERVER_MODEL ??
      process.env.AI_MODEL ??
      process.env.CEREBRAS_MODEL ??
      "zai-glm-4.7",
  }
}

const uniqueServers = (servers: Array<AiServerConfig | null>) => {
  const seen = new Set<string>()
  const result: AiServerConfig[] = []
  for (const server of servers) {
    if (!server) continue
    if (seen.has(server.url)) continue
    seen.add(server.url)
    result.push(server)
  }
  return result
}

export const Route = createFileRoute("/api/chat/guest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        console.log("[guest-chat] Request received")

        const body = (await request.json().catch(() => ({}))) as {
          messages?: Array<{ role: "user" | "assistant"; content: string }>
          model?: string
          threadId?: string
        }

        const messages = body.messages ?? []
        const threadId = buildThreadId(body.threadId)
        let model = normalizeModel(
          body.model ??
            process.env.CEREBRAS_MODEL ??
            process.env.AI_MODEL ??
            "zai-glm-4.7",
        )

        console.log("[guest-chat] payload", {
          count: messages.length,
          model,
          threadId,
        })

        if (messages.length === 0) {
          return new Response(JSON.stringify({ error: "Missing messages" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          })
        }

        const aiServers = uniqueServers([
          getAiServerConfig(),
          getLocalAiServerConfig(),
        ])
        for (const aiServer of aiServers) {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 60000)
          let aiResponse: Response
          try {
            aiResponse = await fetch(`${aiServer.url}/v1/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(aiServer.token
                  ? { Authorization: `Bearer ${aiServer.token}` }
                  : {}),
              },
              body: JSON.stringify({
                model: normalizeModel(body.model ?? aiServer.model),
                messages,
              }),
              signal: controller.signal,
            })
          } catch (error) {
            clearTimeout(timeoutId)
            console.error(
              "[guest-chat] ai server request failed",
              aiServer.url,
              error,
            )
            continue
          }

          clearTimeout(timeoutId)
          if (!aiResponse.ok) {
            const errorText = await aiResponse.text()
            console.error(
              "[guest-chat] ai server error",
              aiServer.url,
              aiResponse.status,
              errorText,
            )
            continue
          }

          const payload = (await aiResponse.json().catch(() => null)) as
            | {
                choices?: Array<{ message?: { content?: string } }>
              }
            | null
          const content = payload?.choices?.[0]?.message?.content ?? ""

          const encoder = new TextEncoder()
          const stream = new ReadableStream({
            start(controller) {
              const jsonChunk = JSON.stringify({
                choices: [{ delta: { content } }],
              })
              controller.enqueue(
                encoder.encode(`data: ${jsonChunk}\n\n`),
              )
              controller.enqueue(encoder.encode("data: [DONE]\n\n"))
              controller.close()
            },
          })

          return new Response(stream, {
            status: 200,
            headers: {
              "content-type": "text/event-stream; charset=utf-8",
              "X-Thread-Id": threadId,
              "X-Stream": "1",
              "X-Model": normalizeModel(body.model ?? aiServer.model),
            },
          })
        }

        let apiKey =
          process.env.AI_CEREBRAS_API_KEY ?? process.env.CEREBRAS_API_KEY
        let keySource: "env" | "flow" | "local" | "none" = apiKey ? "env" : "none"
        if (!apiKey) {
          const info = await getFlowPersonalEnvInfo("CEREBRAS_API_KEY")
          apiKey = info.value ?? undefined
          if (info.source === "flow" || info.source === "local") {
            keySource = info.source
          }
        }
        if (!process.env.CEREBRAS_MODEL && !process.env.AI_MODEL) {
          const flowModel = await getFlowPersonalEnv("CEREBRAS_MODEL")
          if (flowModel) {
            model = normalizeModel(flowModel)
          }
        }
        console.log("[guest-chat] cerebras", {
          enabled: Boolean(apiKey),
          source: keySource,
          keyLen: apiKey?.length ?? 0,
          keyPrefix: apiKey ? apiKey.slice(0, 4) : null,
          keySuffix: apiKey ? apiKey.slice(-4) : null,
          backend: process.env.FLOW_ENV_BACKEND ?? null,
        })

        if (!apiKey) {
          const lastUserMessage = messages
            .filter((m) => m.role === "user")
            .pop()
          const reply = `Demo reply: I received "${lastUserMessage?.content}". Configure CEREBRAS_API_KEY for real responses.`
          return new Response(reply, {
            status: 200,
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "X-Thread-Id": threadId,
              "X-Stream": "0",
              "X-Model": model,
            },
          })
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
          controller.abort()
        }, 120000)

        let cerebrasResponse: Response
        try {
          cerebrasResponse = await fetch(
            "https://api.cerebras.ai/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "text/event-stream",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                messages,
                temperature: 0.3,
                max_tokens: 4096,
                stream: true,
              }),
              signal: controller.signal,
            },
          )
        } catch (error) {
          clearTimeout(timeoutId)
          console.error("[guest-chat] cerebras fetch failed", error)
          return new Response(
            JSON.stringify({
              error: "Cerebras request failed",
              status: 500,
              detail: error instanceof Error ? error.message : String(error),
            }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          )
        }

        console.log("[guest-chat] cerebras status", cerebrasResponse.status, {
          contentType: cerebrasResponse.headers.get("content-type"),
        })

        if (!cerebrasResponse.ok) {
          clearTimeout(timeoutId)
          const errorText = await cerebrasResponse.text()
          console.error(
            "[guest-chat] cerebras error",
            cerebrasResponse.status,
            errorText,
          )
          return new Response(
            JSON.stringify({ error: "Cerebras request failed" }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          )
        }

        const reader = cerebrasResponse.body?.getReader()
        if (!reader) {
          clearTimeout(timeoutId)
          return new Response(
            JSON.stringify({ error: "No response body from Cerebras" }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          )
        }

        let chunkCount = 0
        let closed = false
        const decoder = new TextDecoder()
        const tee = new ReadableStream({
          async pull(controller) {
            if (closed) return
            try {
              const { done, value } = await reader.read()
              if (done) {
                clearTimeout(timeoutId)
                if (!closed) {
                  closed = true
                  controller.close()
                }
                console.log("[guest-chat] cerebras stream done", { chunkCount })
                return
              }
              chunkCount += 1
              if (chunkCount === 1) {
                console.log("[guest-chat] cerebras first chunk", {
                  bytes: value?.byteLength ?? 0,
                })
              }
              if (chunkCount <= 3 && value) {
                try {
                  const preview = decoder.decode(value, { stream: true })
                  console.log("[guest-chat] cerebras chunk preview", {
                    chunk: chunkCount,
                    preview: preview.slice(0, 200),
                  })
                } catch {
                  // ignore preview errors
                }
              }
              if (!closed) {
                controller.enqueue(value)
              }
            } catch (error) {
              clearTimeout(timeoutId)
              if (closed) return
              console.error("[guest-chat] stream failure", error)
              closed = true
              try {
                controller.error(error)
              } catch {
                // ignore invalid state errors
              }
            }
          },
          async cancel() {
            clearTimeout(timeoutId)
            closed = true
            try {
              await reader.cancel()
            } catch {
              // ignore cancel errors
            }
          },
        })

        const contentType =
          cerebrasResponse.headers.get("content-type") ??
          "text/event-stream; charset=utf-8"

        return new Response(tee, {
          headers: {
            "content-type": contentType,
            "cache-control": "no-cache, no-transform",
            "X-Thread-Id": threadId,
            "X-Stream": "sse",
            "X-Model": model,
          },
        })
      },
    },
  },
})
