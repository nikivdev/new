import { createFileRoute } from "@tanstack/react-router"
import { withJazzUser } from "@/lib/jazz/server-store"
import { Block, BlockConfig, BlockPageList } from "@/lib/jazz/schema"

interface AddContextBody {
  url: string
  content: string
  title?: string
  userId: string // Required - which user to add context for
  userSecret: string // Required - user's Jazz account secret for auth
  threadId?: string // Optional - link to specific thread
  apiKey: string // Required for auth
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })

// Get API key from environment
const getApiKey = (): string | undefined => {
  try {
    const { getServerContext } = require("@tanstack/react-start/server") as {
      getServerContext: () => { cloudflare?: { env?: { CONTEXT_API_KEY?: string } } } | null
    }
    const ctx = getServerContext()
    return ctx?.cloudflare?.env?.CONTEXT_API_KEY
  } catch {
    return process.env.CONTEXT_API_KEY
  }
}

export const Route = createFileRoute("/api/external/context")({
  server: {
    handlers: {
      // Handle CORS preflight
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        })
      },

      /**
       * Add context from external source (agentic browser)
       *
       * POST /api/external/context
       * Headers:
       *   Authorization: Bearer <CONTEXT_API_KEY>
       *   Content-Type: application/json
       *
       * Body:
       *   {
       *     "url": "https://example.com/page",
       *     "content": "Markdown content of the page...",
       *     "title": "Page Title (optional)",
       *     "userId": "user_id_here",
       *     "userSecret": "user_secret_here",
       *     "threadId": "thread_id" (optional)
       *   }
       */
      POST: async ({ request }) => {
        // Validate API key
        const authHeader = request.headers.get("Authorization")
        const expectedKey = getApiKey()

        if (expectedKey) {
          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return json({ error: "Missing Authorization header" }, 401)
          }
          const providedKey = authHeader.slice(7)
          if (providedKey !== expectedKey) {
            return json({ error: "Invalid API key" }, 401)
          }
        }

        // Parse body
        let body: AddContextBody
        try {
          body = await request.json()
        } catch {
          return json({ error: "Invalid JSON body" }, 400)
        }

        // Validate required fields
        if (!body.url || typeof body.url !== "string") {
          return json({ error: "url is required" }, 400)
        }
        if (!body.content || typeof body.content !== "string") {
          return json({ error: "content is required" }, 400)
        }
        if (!body.userId || typeof body.userId !== "string") {
          return json({ error: "userId is required" }, 400)
        }
        if (!body.userSecret || typeof body.userSecret !== "string") {
          return json({ error: "userSecret is required" }, 400)
        }

        try {
          // Extract title from URL if not provided
          let title = body.title
          if (!title) {
            try {
              title = new URL(body.url).hostname
            } catch {
              title = body.url.slice(0, 50)
            }
          }

          // Estimate token count
          const tokenCount = Math.ceil(body.content.length / 4)

          const auth = { accountId: body.userId, accountSecret: body.userSecret }

          const result = await withJazzUser(auth, async (account) => {
            const now = Date.now()
            const config = BlockConfig.create({}, { owner: account })
            const pages = BlockPageList.create([], { owner: account })

            const block = Block.create(
              {
                name: title!,
                type: "web",
                url: body.url,
                content: body.content,
                config,
                status: "ready",
                errorMessage: undefined,
                tokenCount,
                pageCount: 1,
                lastRefreshedAt: now,
                createdAt: now,
                updatedAt: now,
                pages,
              },
              { owner: account }
            )

            account.root.blocks.$jazz.push(block)

            // Link to thread if specified
            if (body.threadId) {
              const thread = account.root.chatThreads.find(
                (candidate: any) => candidate?.$jazz?.id === body.threadId
              )
              if (thread) {
                const existing = Array.from(thread.blockIds ?? [])
                if (!existing.includes(block.$jazz.id)) {
                  thread.blockIds.$jazz.push(block.$jazz.id)
                }
                console.log(`[external/context] Linked block ${block.$jazz.id} to thread ${body.threadId}`)
              }
            }

            console.log(`[external/context] Created block ${block.$jazz.id}: ${title} (${tokenCount} tokens)`)

            return {
              id: block.$jazz.id,
              name: block.name,
              url: block.url,
              tokenCount: block.tokenCount,
              createdAt: new Date(block.createdAt).toISOString(),
            }
          })

          return json({
            success: true,
            block: result,
            message: body.threadId
              ? `Context added and linked to thread ${body.threadId}`
              : "Context added. Link to a chat thread to use it.",
          })
        } catch (error) {
          console.error("[external/context] Error:", error)
          return json({ error: "Failed to save context" }, 500)
        }
      },
    },
  },
})
