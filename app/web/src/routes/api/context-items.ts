import { createFileRoute } from "@tanstack/react-router"
import { requireJazzAuth } from "@/lib/jazz/server-auth"
import { withJazzUser } from "@/lib/jazz/server-store"
import { ContextItem } from "@/lib/jazz/schema"

interface ContextItemsBody {
  action?: string
  url?: string
  threadId?: string
  itemId?: string
  query?: string
}

const defaultJsonHeaders = (status: number) => ({
  status,
  headers: { "content-type": "application/json" },
})

const PARSE_SERVER_URL = "http://65.108.248.119"

interface ParseResponse {
  status: number
  data?: {
    url: string
    title: string
    markdown: string
    headings: string[]
    links: { href: string; text: string }[]
    status?: number
  }
  error?: string
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const buildSnippet = (content: string, query: string) => {
  const lowerContent = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerContent.indexOf(lowerQuery)
  if (index === -1) return undefined
  const start = Math.max(0, index - 60)
  const end = Math.min(content.length, index + lowerQuery.length + 60)
  const snippet = content.slice(start, end)
  const escaped = escapeHtml(snippet)
  const regex = new RegExp(escapeHtml(query), "ig")
  return escaped.replace(regex, (match) => `<mark>${match}</mark>`)
}

const serializeItem = (item: any) => ({
  id: item.$jazz.id,
  type: item.type,
  url: item.url ?? null,
  name: item.name,
  content: item.content ?? null,
  refreshing: Boolean(item.refreshing),
  parent_id: item.parentId ?? null,
  created_at: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  updated_at: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
})

async function fetchAndUpdateContent(auth: { accountId: string; accountSecret: string }, itemId: string, url: string) {
  try {
    console.log(`[fetchAndUpdateContent] Starting fetch for: ${url}`)

    const response = await fetch(`${PARSE_SERVER_URL}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, clean: true }),
    })

    if (!response.ok) {
      throw new Error(`Parse server error: ${response.status}`)
    }

    const result = (await response.json()) as ParseResponse

    if (!result.data?.markdown) {
      throw new Error(result.error || "No content returned from parse server")
    }

    const content = result.data.markdown
    const title = result.data.title

    await withJazzUser(auth, async (account) => {
      const item = account.root.contextItems.find(
        (candidate: any) => candidate?.$jazz?.id === itemId,
      )
      if (!item) return
      item.$jazz.set("content", content)
      item.$jazz.set("refreshing", false)
      item.$jazz.set("updatedAt", Date.now())
      if (title) {
        item.$jazz.set("name", title)
      }
    })
  } catch (error) {
    console.error(`[fetchAndUpdateContent] Failed for ${url}:`, error)
    await withJazzUser(auth, async (account) => {
      const item = account.root.contextItems.find(
        (candidate: any) => candidate?.$jazz?.id === itemId,
      )
      if (!item) return
      item.$jazz.set("refreshing", false)
      item.$jazz.set("updatedAt", Date.now())
    })
  }
}

export const Route = createFileRoute("/api/context-items")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { auth, response } = await requireJazzAuth(request)
        if (!auth) {
          return response
        }

        const body = (await request.json().catch(() => ({}))) as ContextItemsBody
        const { action } = body

        try {
          switch (action) {
            case "addUrl": {
              const url = typeof body.url === "string" ? body.url.trim() : ""
              const threadId = body.threadId

              if (!url) {
                return new Response(
                  JSON.stringify({ error: "Missing url" }),
                  defaultJsonHeaders(400),
                )
              }

              let parsedUrl: URL
              try {
                parsedUrl = new URL(url)
              } catch {
                return new Response(
                  JSON.stringify({ error: "Invalid URL" }),
                  defaultJsonHeaders(400),
                )
              }

              const name = parsedUrl.hostname + parsedUrl.pathname
              const now = Date.now()

              return await withJazzUser(auth, async (account) => {
                const item = ContextItem.create(
                  {
                    type: "url",
                    url,
                    name,
                    content: undefined,
                    refreshing: true,
                    parentId: undefined,
                    createdAt: now,
                    updatedAt: now,
                  },
                  { owner: account },
                )

                account.root.contextItems.$jazz.push(item)

                if (threadId) {
                  const thread = account.root.chatThreads.find(
                    (candidate: any) => candidate?.$jazz?.id === threadId,
                  )
                  if (thread) {
                    const existing = Array.from(thread.contextItemIds ?? [])
                    if (!existing.includes(item.$jazz.id)) {
                      thread.contextItemIds.$jazz.push(item.$jazz.id)
                    }
                  }
                }

                fetchAndUpdateContent(auth, item.$jazz.id, url).catch(console.error)

                return new Response(
                  JSON.stringify({ item: serializeItem(item) }),
                  defaultJsonHeaders(200),
                )
              })
            }

            case "refreshUrl": {
              const itemId = body.itemId
              if (!itemId) {
                return new Response(
                  JSON.stringify({ error: "Missing itemId" }),
                  defaultJsonHeaders(400),
                )
              }

              return await withJazzUser(auth, async (account) => {
                const item = account.root.contextItems.find(
                  (candidate: any) => candidate?.$jazz?.id === itemId,
                )
                if (!item) {
                  return new Response(
                    JSON.stringify({ error: "Item not found" }),
                    defaultJsonHeaders(404),
                  )
                }

                if (!item.url) {
                  return new Response(
                    JSON.stringify({ error: "Item has no URL" }),
                    defaultJsonHeaders(400),
                  )
                }

                item.$jazz.set("refreshing", true)
                item.$jazz.set("updatedAt", Date.now())
                fetchAndUpdateContent(auth, itemId, item.url).catch(console.error)

                return new Response(
                  JSON.stringify({ success: true }),
                  defaultJsonHeaders(200),
                )
              })
            }

            case "deleteItem": {
              const itemId = body.itemId
              if (!itemId) {
                return new Response(
                  JSON.stringify({ error: "Missing itemId" }),
                  defaultJsonHeaders(400),
                )
              }

              return await withJazzUser(auth, async (account) => {
                const index = account.root.contextItems.findIndex(
                  (candidate: any) => candidate?.$jazz?.id === itemId,
                )
                if (index !== -1) {
                  account.root.contextItems.$jazz.splice(index, 1)
                }

                for (const thread of account.root.chatThreads) {
                  if (!thread?.contextItemIds) continue
                  const ids = Array.from(thread.contextItemIds)
                  const removeIndex = ids.indexOf(itemId)
                  if (removeIndex !== -1) {
                    thread.contextItemIds.$jazz.splice(removeIndex, 1)
                  }
                }

                return new Response(
                  JSON.stringify({ success: true }),
                  defaultJsonHeaders(200),
                )
              })
            }

            case "linkToThread": {
              const itemId = body.itemId
              const threadId = body.threadId

              if (!itemId || !threadId) {
                return new Response(
                  JSON.stringify({ error: "Missing itemId/threadId" }),
                  defaultJsonHeaders(400),
                )
              }

              return await withJazzUser(auth, async (account) => {
                const thread = account.root.chatThreads.find(
                  (candidate: any) => candidate?.$jazz?.id === threadId,
                )
                if (!thread) {
                  return new Response(
                    JSON.stringify({ error: "Thread not found" }),
                    defaultJsonHeaders(404),
                  )
                }

                const existing = Array.from(thread.contextItemIds ?? [])
                if (!existing.includes(itemId)) {
                  thread.contextItemIds.$jazz.push(itemId)
                }

                return new Response(
                  JSON.stringify({ success: true }),
                  defaultJsonHeaders(200),
                )
              })
            }

            case "unlinkFromThread": {
              const itemId = body.itemId
              const threadId = body.threadId

              if (!itemId || !threadId) {
                return new Response(
                  JSON.stringify({ error: "Missing itemId/threadId" }),
                  defaultJsonHeaders(400),
                )
              }

              return await withJazzUser(auth, async (account) => {
                const thread = account.root.chatThreads.find(
                  (candidate: any) => candidate?.$jazz?.id === threadId,
                )
                if (!thread) {
                  return new Response(
                    JSON.stringify({ error: "Thread not found" }),
                    defaultJsonHeaders(404),
                  )
                }

                const ids = Array.from(thread.contextItemIds ?? [])
                const removeIndex = ids.indexOf(itemId)
                if (removeIndex !== -1) {
                  thread.contextItemIds.$jazz.splice(removeIndex, 1)
                }

                return new Response(
                  JSON.stringify({ success: true }),
                  defaultJsonHeaders(200),
                )
              })
            }

            case "getItems": {
              return await withJazzUser(auth, async (account) => {
                const items = [...account.root.contextItems]
                  .filter((item: any) => item && item.$isLoaded)
                  .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
                  .map(serializeItem)

                return new Response(
                  JSON.stringify({ items }),
                  defaultJsonHeaders(200),
                )
              })
            }

            case "getThreadItems": {
              const threadId = body.threadId
              if (!threadId) {
                return new Response(
                  JSON.stringify({ error: "Missing threadId" }),
                  defaultJsonHeaders(400),
                )
              }

              return await withJazzUser(auth, async (account) => {
                const thread = account.root.chatThreads.find(
                  (candidate: any) => candidate?.$jazz?.id === threadId,
                )
                if (!thread) {
                  return new Response(
                    JSON.stringify({ error: "Thread not found" }),
                    defaultJsonHeaders(404),
                  )
                }

                const ids = Array.from(thread.contextItemIds ?? [])
                const items = account.root.contextItems
                  .filter((item: any) => ids.includes(item?.$jazz?.id))
                  .map(serializeItem)

                return new Response(
                  JSON.stringify({ items }),
                  defaultJsonHeaders(200),
                )
              })
            }

            case "search": {
              const query = typeof body.query === "string" ? body.query.trim() : ""
              if (!query || query.length < 2) {
                return new Response(
                  JSON.stringify({ items: [] }),
                  defaultJsonHeaders(200),
                )
              }

              return await withJazzUser(auth, async (account) => {
                const items = account.root.contextItems
                  .filter((item: any) => item?.content && item.content.toLowerCase().includes(query.toLowerCase()))
                  .map((item: any) => ({
                    ...serializeItem(item),
                    snippet: buildSnippet(item.content, query),
                  }))
                  .slice(0, 20)

                return new Response(
                  JSON.stringify({ items }),
                  defaultJsonHeaders(200),
                )
              })
            }

            default:
              return new Response(
                JSON.stringify({ error: "Unknown action" }),
                defaultJsonHeaders(400),
              )
          }
        } catch (error) {
          console.error("[context-items] error", error)
          return new Response(
            JSON.stringify({ error: "Operation failed" }),
            defaultJsonHeaders(500),
          )
        }
      },

      GET: async ({ request }: { request: Request }) => {
        const { auth, response } = await requireJazzAuth(request)
        if (!auth) {
          return response
        }

        return await withJazzUser(auth, async (account) => {
          const items = [...account.root.contextItems]
            .filter((item: any) => item && item.$isLoaded)
            .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
            .map(serializeItem)

          return new Response(JSON.stringify({ items }), defaultJsonHeaders(200))
        })
      },
    },
  },
})
