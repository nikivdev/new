import { createFileRoute } from "@tanstack/react-router"
import { streamText } from "ai"
import { requireJazzAuth } from "@/lib/jazz/server-auth"
import { withJazzUser } from "@/lib/jazz/server-store"
import { getOpenRouter, getDefaultModel } from "@/lib/ai/provider"
import { checkUsageAllowed, recordUsage, getMeterForModel } from "@/lib/billing"

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
      getDefaultModel(),
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
      getDefaultModel(),
  }
}

type AiServerConfig = {
  url: string
  token: string
  model: string
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

export const Route = createFileRoute("/api/chat/ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { auth, response } = await requireJazzAuth(request)
          if (!auth) {
            return response
          }

          const body = (await request.json().catch(() => ({}))) as {
            threadId?: string
            messages?: Array<{ role: "user" | "assistant"; content: string }>
            model?: string
          }

          const threadId = body.threadId
          const messages = body.messages ?? []
          const model = body.model ?? getDefaultModel()

          if (!threadId || messages.length === 0) {
            return new Response(
              JSON.stringify({ error: "Missing threadId or messages" }),
              {
                status: 400,
                headers: { "content-type": "application/json" },
              },
            )
          }

          const meterSlug = getMeterForModel(model)

          // Check usage limits
          const usageCheck = await checkUsageAllowed(
            request,
            auth.accountId,
            meterSlug,
          )
          if (!usageCheck.allowed) {
            return new Response(
              JSON.stringify({
                error: "Usage limit exceeded",
                reason: usageCheck.reason,
                remaining: usageCheck.remaining,
                limit: usageCheck.limit,
              }),
              {
                status: 429,
                headers: { "content-type": "application/json" },
              },
            )
          }

          // Try to load context from thread, but don't fail if thread isn't synced yet
          let contextContent = ""
          try {
            await withJazzUser(auth, async (account) => {
              const thread = account.root.chatThreads?.find(
                (candidate: any) => candidate?.$jazz?.id === threadId,
              )

              // If thread not found, just skip context loading (sync might be pending)
              if (!thread) {
                console.log("[ai] Thread not synced yet, proceeding without context")
                return
              }

              const contextItemIds = Array.from(thread.contextItemIds ?? [])
              if (contextItemIds.length > 0) {
                const items = account.root.contextItems.filter((item: any) =>
                  contextItemIds.includes(item?.$jazz?.id),
                )
                const contextParts = items
                  .filter((item: any) => item.content && !item.refreshing)
                  .map((item: any) => {
                    return `--- Content from ${item.name} (${item.url ?? "unknown"}) ---\n${item.content}\n--- End of ${item.name} ---`
                  })
                if (contextParts.length > 0) {
                  contextContent = contextParts.join("\n\n")
                }
              }

              const blockIds = Array.from(thread.blockIds ?? [])
              if (blockIds.length > 0) {
                const blockItems = account.root.blocks.filter((block: any) =>
                  blockIds.includes(block?.$jazz?.id),
                )
                const blockParts = blockItems
                  .filter((block: any) => block.content && block.status === "ready")
                  .map((block: any) => {
                    const source = block.type === "web" ? ` (${block.url})` : ""
                    return `--- Block: ${block.name}${source} ---\n${block.content}\n--- End of ${block.name} ---`
                  })
                if (blockParts.length > 0) {
                  contextContent = contextContent
                    ? `${contextContent}\n\n${blockParts.join("\n\n")}`
                    : blockParts.join("\n\n")
                }
              }
            })
          } catch (jazzError) {
            // Jazz connection failed, proceed without context
            console.warn("[ai] Jazz context load failed, proceeding without context:", jazzError)
          }

          // Build system prompt with context
          let systemPrompt = "You are a helpful assistant."
          if (contextContent) {
            systemPrompt = `You are a helpful assistant. You have access to the following context information that you should use to answer questions:\n\n${contextContent}\n\nUse the above context to help answer the user's questions when relevant.`
          }

          const openrouter = getOpenRouter()
          console.log(
            "[ai] openrouter:",
            openrouter ? "configured" : "not configured",
          )

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
                  model: body.model ?? aiServer.model ?? model,
                  messages: [
                    { role: "system", content: systemPrompt },
                    ...messages.map((m) => ({
                      role: m.role,
                      content: m.content,
                    })),
                  ],
                }),
                signal: controller.signal,
              })
            } catch (error) {
              clearTimeout(timeoutId)
              console.warn(
                "[ai] ai server request failed",
                aiServer.url,
                error,
              )
              continue
            }
            clearTimeout(timeoutId)
            if (!aiResponse.ok) {
              const errorText = await aiResponse.text()
              console.warn(
                "[ai] ai server error",
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
            await recordUsage(
              request,
              1,
              `chat-${threadId}-${Date.now()}`,
              meterSlug,
              auth.accountId,
            )

            const encoder = new TextEncoder()
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(content))
                controller.close()
              },
            })
            return new Response(stream, {
              status: 200,
              headers: {
                "content-type": "text/plain; charset=utf-8",
              },
            })
          }

          if (!openrouter) {
            // Fallback to simple demo response for unconfigured OpenRouter
            const lastUserMessage = messages
              .filter((m) => m.role === "user")
              .pop()
            const reply = `Demo reply: I received "${lastUserMessage?.content}". Configure OPENROUTER_API_KEY for real responses.`

            // Return a simple text stream (compatible with current client reader)
            const encoder = new TextEncoder()
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(reply))
                controller.close()
              },
            })

            return new Response(stream, {
              status: 200,
              headers: {
                "content-type": "text/plain; charset=utf-8",
              },
            })
          }

          // Use AI SDK streaming with OpenRouter
          console.log("[ai] calling streamText with model:", model)
          console.log("[ai] context content length:", contextContent.length)

          const result = streamText({
            model: openrouter.chat(model),
            system: systemPrompt,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            async onFinish({ text }) {
              console.log("[ai] onFinish, text length:", text.length)
              // Record usage based on model
              console.log(`[ai] Recording usage for model ${model} -> meter ${meterSlug}`)
              await recordUsage(
                request,
                1,
                `chat-${threadId}-${Date.now()}`,
                meterSlug,
                auth.accountId,
              )
            },
          })

          console.log("[ai] returning stream response")
          return result.toTextStreamResponse()
        } catch (error) {
          const err = error as Error
          console.error("[ai] Handler error:", err.message, err.stack)
          return new Response(
            JSON.stringify({ error: `AI request failed: ${err.message}` }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          )
        }
      },
    },
  },
})
