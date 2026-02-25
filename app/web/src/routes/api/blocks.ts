import { createFileRoute } from "@tanstack/react-router"
import { requireJazzAuth } from "@/lib/jazz/server-auth"
import { withJazzUser } from "@/lib/jazz/server-store"
import { Block, BlockConfig, BlockPage } from "@/lib/jazz/schema"

interface BlocksBody {
  action?: string
  id?: string
  name?: string
  type?: "text" | "web"
  url?: string
  content?: string
  config?: {
    updateInterval?: string
    deepScanLevel?: number
    summarise?: boolean
    createSections?: boolean
  }
  threadId?: string
  blockId?: string
  pageId?: string
  included?: boolean
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

async function fetchUrlContent(url: string): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    console.log(`[blocks] Fetching URL: ${url}`)
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/markdown" },
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch: ${response.status}` }
    }

    const content = await response.text()
    console.log(`[blocks] Fetched ${content.length} chars from ${url}`)
    return { success: true, content }
  } catch (error) {
    console.error(`[blocks] Fetch error:`, error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

const serializeBlock = (block: any) => ({
  id: block.$jazz.id,
  name: block.name,
  type: block.type,
  url: block.url ?? null,
  content: block.content ?? null,
  config: block.config ? {
    updateInterval: block.config.updateInterval ?? undefined,
    deepScanLevel: block.config.deepScanLevel ?? undefined,
    summarise: block.config.summarise ?? undefined,
    createSections: block.config.createSections ?? undefined,
  } : undefined,
  status: block.status,
  errorMessage: block.errorMessage ?? null,
  tokenCount: block.tokenCount ?? 0,
  pageCount: block.pageCount ?? 0,
  lastRefreshedAt: block.lastRefreshedAt
    ? new Date(block.lastRefreshedAt).toISOString()
    : null,
  createdAt: block.createdAt ? new Date(block.createdAt).toISOString() : null,
  updatedAt: block.updatedAt ? new Date(block.updatedAt).toISOString() : null,
})

const serializePage = (page: any) => ({
  id: page.$jazz.id,
  path: page.path,
  url: page.url ?? null,
  content: page.content ?? null,
  tokenCount: page.tokenCount ?? 0,
  included: page.included ?? true,
  createdAt: page.createdAt ? new Date(page.createdAt).toISOString() : null,
})

const updateBlockContent = async (
  auth: { accountId: string; accountSecret: string },
  blockId: string,
  result: { success: boolean; content?: string; error?: string },
) => {
  await withJazzUser(auth, async (account) => {
    const block = account.root.blocks.find(
      (candidate: any) => candidate?.$jazz?.id === blockId,
    )
    if (!block) return
    const now = Date.now()
    if (result.success && result.content) {
      const tokens = estimateTokens(result.content)
      block.$jazz.set("content", result.content)
      block.$jazz.set("status", "ready")
      block.$jazz.set("tokenCount", tokens)
      block.$jazz.set("lastRefreshedAt", now)
      block.$jazz.set("updatedAt", now)
      block.$jazz.set("errorMessage", undefined)
    } else {
      block.$jazz.set("status", "error")
      block.$jazz.set("errorMessage", result.error ?? "Unknown error")
      block.$jazz.set("updatedAt", now)
    }
  })
}

export const Route = createFileRoute("/api/blocks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { auth, response } = await requireJazzAuth(request)
        if (!auth) {
          return response
        }

        return withJazzUser(auth, async (account) => {
          const blocks = [...account.root.blocks]
            .filter((block: any) => block && block.$isLoaded)
            .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
            .map(serializeBlock)

          return json({ blocks })
        })
      },

      POST: async ({ request }) => {
        const { auth, response } = await requireJazzAuth(request)
        if (!auth) {
          return response
        }

        const body = (await request.json().catch(() => ({}))) as BlocksBody
        const { action } = body

        try {
          switch (action) {
            case "create": {
              const { name, type, url, content, config } = body

              if (!name?.trim()) {
                return json({ error: "Name is required" }, 400)
              }
              if (!type || !["text", "web"].includes(type)) {
                return json({ error: "Invalid type" }, 400)
              }
              if (type === "web" && !url?.trim()) {
                return json({ error: "URL is required for web blocks" }, 400)
              }

              return await withJazzUser(auth, async (account) => {
                const now = Date.now()
                const configValue = BlockConfig.create(
                  {
                    updateInterval: config?.updateInterval,
                    deepScanLevel: config?.deepScanLevel,
                    summarise: config?.summarise,
                    createSections: config?.createSections,
                  },
                  { owner: account },
                )

                const block = Block.create(
                  {
                    name: name.trim(),
                    type,
                    url: type === "web" ? url?.trim() : undefined,
                    content: type === "text" ? content ?? "" : undefined,
                    config: configValue,
                    status: type === "web" ? "scanning" : "ready",
                    errorMessage: undefined,
                    tokenCount:
                      type === "text" && content ? estimateTokens(content) : 0,
                    pageCount: type === "text" ? 1 : 0,
                    lastRefreshedAt: undefined,
                    createdAt: now,
                    updatedAt: now,
                    pages: [],
                  },
                  { owner: account },
                )

                account.root.blocks.$jazz.push(block)

                if (type === "web" && url) {
                  fetchUrlContent(url).then((result) =>
                    updateBlockContent(auth, block.$jazz.id, result),
                  ).catch(console.error)
                }

                return json({ block: serializeBlock(block) })
              })
            }

            case "update": {
              const { id, name, content, config } = body
              if (!id) {
                return json({ error: "Block ID required" }, 400)
              }

              return await withJazzUser(auth, async (account) => {
                const block = account.root.blocks.find(
                  (candidate: any) => candidate?.$jazz?.id === id,
                )
                if (!block) {
                  return json({ error: "Block not found" }, 404)
                }

                if (name?.trim()) {
                  block.$jazz.set("name", name.trim())
                }
                if (content !== undefined) {
                  block.$jazz.set("content", content)
                  block.$jazz.set("tokenCount", estimateTokens(content))
                }
                if (config) {
                  if (!block.config) {
                    block.$jazz.set(
                      "config",
                      BlockConfig.create({}, { owner: account }),
                    )
                  }
                  if (config.updateInterval !== undefined) {
                    block.config.$jazz.set("updateInterval", config.updateInterval)
                  }
                  if (config.deepScanLevel !== undefined) {
                    block.config.$jazz.set("deepScanLevel", config.deepScanLevel)
                  }
                  if (config.summarise !== undefined) {
                    block.config.$jazz.set("summarise", config.summarise)
                  }
                  if (config.createSections !== undefined) {
                    block.config.$jazz.set("createSections", config.createSections)
                  }
                }
                block.$jazz.set("updatedAt", Date.now())

                return json({ block: serializeBlock(block) })
              })
            }

            case "delete": {
              const blockId = body.id
              if (!blockId) {
                return json({ error: "Block ID required" }, 400)
              }

              return await withJazzUser(auth, async (account) => {
                const index = account.root.blocks.findIndex(
                  (candidate: any) => candidate?.$jazz?.id === blockId,
                )
                if (index !== -1) {
                  account.root.blocks.$jazz.splice(index, 1)
                }

                for (const thread of account.root.chatThreads) {
                  if (!thread?.blockIds) continue
                  const ids = Array.from(thread.blockIds)
                  const removeIndex = ids.indexOf(blockId)
                  if (removeIndex !== -1) {
                    thread.blockIds.$jazz.splice(removeIndex, 1)
                  }
                }

                return json({ success: true })
              })
            }

            case "refresh": {
              const blockId = body.id
              if (!blockId) {
                return json({ error: "Block ID required" }, 400)
              }

              return await withJazzUser(auth, async (account) => {
                const block = account.root.blocks.find(
                  (candidate: any) => candidate?.$jazz?.id === blockId,
                )
                if (!block) {
                  return json({ error: "Block not found" }, 404)
                }
                if (block.type !== "web" || !block.url) {
                  return json({ error: "Only web blocks can be refreshed" }, 400)
                }

                block.$jazz.set("status", "scanning")
                block.$jazz.set("updatedAt", Date.now())

                fetchUrlContent(block.url).then((result) =>
                  updateBlockContent(auth, blockId, result),
                ).catch(console.error)

                return json({ success: true })
              })
            }

            case "get": {
              const blockId = body.id
              if (!blockId) {
                return json({ error: "Block ID required" }, 400)
              }

              return await withJazzUser(auth, async (account) => {
                const block = account.root.blocks.find(
                  (candidate: any) => candidate?.$jazz?.id === blockId,
                )
                if (!block) {
                  return json({ error: "Block not found" }, 404)
                }

                const pages = block.pages?.map(serializePage) ?? []
                return json({ block: serializeBlock(block), pages })
              })
            }

            case "linkToThread": {
              const blockId = body.blockId
              const threadId = body.threadId

              if (!blockId || !threadId) {
                return json({ error: "blockId and threadId required" }, 400)
              }

              return await withJazzUser(auth, async (account) => {
                const block = account.root.blocks.find(
                  (candidate: any) => candidate?.$jazz?.id === blockId,
                )
                if (!block) {
                  return json({ error: "Block not found" }, 404)
                }

                const thread = account.root.chatThreads.find(
                  (candidate: any) => candidate?.$jazz?.id === threadId,
                )
                if (!thread) {
                  return json({ error: "Thread not found" }, 404)
                }

                const ids = Array.from(thread.blockIds ?? [])
                if (!ids.includes(blockId)) {
                  thread.blockIds.$jazz.push(blockId)
                }

                return json({ success: true })
              })
            }

            case "unlinkFromThread": {
              const blockId = body.blockId
              const threadId = body.threadId

              if (!blockId || !threadId) {
                return json({ error: "blockId and threadId required" }, 400)
              }

              return await withJazzUser(auth, async (account) => {
                const thread = account.root.chatThreads.find(
                  (candidate: any) => candidate?.$jazz?.id === threadId,
                )
                if (!thread) {
                  return json({ error: "Thread not found" }, 404)
                }

                const ids = Array.from(thread.blockIds ?? [])
                const removeIndex = ids.indexOf(blockId)
                if (removeIndex !== -1) {
                  thread.blockIds.$jazz.splice(removeIndex, 1)
                }

                return json({ success: true })
              })
            }

            case "getThreadBlocks": {
              const threadId = body.threadId
              if (!threadId) {
                return json({ error: "threadId required" }, 400)
              }

              return await withJazzUser(auth, async (account) => {
                const thread = account.root.chatThreads.find(
                  (candidate: any) => candidate?.$jazz?.id === threadId,
                )
                if (!thread) {
                  return json({ error: "Thread not found" }, 404)
                }

                const ids = Array.from(thread.blockIds ?? [])
                const blocks = account.root.blocks
                  .filter((block: any) => ids.includes(block?.$jazz?.id))
                  .map(serializeBlock)

                return json({ blocks })
              })
            }

            case "togglePageIncluded": {
              const pageId = body.pageId
              const included = body.included

              if (!pageId || included === undefined) {
                return json({ error: "pageId and included required" }, 400)
              }

              return await withJazzUser(auth, async (account) => {
                let targetPage: any = null
                for (const block of account.root.blocks) {
                  const page = block.pages?.find(
                    (candidate: any) => candidate?.$jazz?.id === pageId,
                  )
                  if (page) {
                    targetPage = page
                    break
                  }
                }

                if (!targetPage) {
                  return json({ error: "Page not found" }, 404)
                }

                targetPage.$jazz.set("included", Boolean(included))
                return json({ success: true })
              })
            }

            default:
              return json({ error: "Unknown action" }, 400)
          }
        } catch (error) {
          console.error("[blocks] POST error:", error)
          return json({ error: "Operation failed" }, 500)
        }
      },
    },
  },
})
