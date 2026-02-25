import { createFileRoute } from "@tanstack/react-router"
import { Group } from "jazz-tools"
import { requireJazzAuth } from "@/lib/jazz/server-auth"
import { withJazzUser } from "@/lib/jazz/server-store"
import {
  BlockIdList,
  ChatMessage,
  ChatMessageList,
  ChatThread,
  ContextItemIdList,
} from "@/lib/jazz/schema"

const defaultJsonHeaders = (status: number) => ({
  status,
  headers: { "content-type": "application/json" },
})

const serializeThread = (thread: any) => ({
  id: thread.$jazz.id,
  title: thread.title,
  created_at: thread.createdAt ? new Date(thread.createdAt).toISOString() : null,
})

const serializeMessage = (message: any, threadId: string) => ({
  id: message.$jazz.id,
  thread_id: threadId,
  role: message.role,
  content: message.content,
  created_at: message.createdAt ? new Date(message.createdAt).toISOString() : null,
})

export const Route = createFileRoute("/api/chat/mutations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { auth, response } = await requireJazzAuth(request)
        if (!auth) {
          return response
        }

        const body = await request.json().catch(() => ({}))
        const { action } = body as { action?: string }

        try {
          switch (action) {
            case "createThread": {
              const title =
                (typeof body.title === "string" && body.title.trim()) ||
                "New chat"

              return await withJazzUser(auth, async (account) => {
                const group = Group.create()
                const thread = ChatThread.create(
                  {
                    title,
                    messages: ChatMessageList.create([], { owner: group }),
                    createdAt: Date.now(),
                    contextItemIds: ContextItemIdList.create([], { owner: group }),
                    blockIds: BlockIdList.create([], { owner: group }),
                  },
                  { owner: group },
                )
                account.root.chatThreads.$jazz.push(thread)

                return new Response(
                  JSON.stringify({ thread: serializeThread(thread) }),
                  defaultJsonHeaders(200),
                )
              })
            }
            case "addMessage": {
              const threadId = typeof body.threadId === "string" ? body.threadId : ""
              const role =
                typeof body.role === "string" ? body.role.trim() : "user"
              const content =
                typeof body.content === "string" ? body.content.trim() : ""

              if (!threadId || !content || !role) {
                return new Response(
                  JSON.stringify({ error: "Missing threadId/content/role" }),
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

                const threadOwner = thread.$jazz.owner ?? account
                const message = ChatMessage.create(
                  {
                    role,
                    content,
                    createdAt: Date.now(),
                  },
                  { owner: threadOwner },
                )
                thread.messages.$jazz.push(message)

                return new Response(
                  JSON.stringify({ message: serializeMessage(message, threadId) }),
                  defaultJsonHeaders(200),
                )
              })
            }
            case "renameThread": {
              const threadId = typeof body.threadId === "string" ? body.threadId : ""
              const title =
                typeof body.title === "string" ? body.title.trim() : ""
              if (!threadId || !title) {
                return new Response(
                  JSON.stringify({ error: "Missing threadId/title" }),
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

                thread.$jazz.set("title", title)
                return new Response(
                  JSON.stringify({ thread: serializeThread(thread) }),
                  defaultJsonHeaders(200),
                )
              })
            }
            case "deleteAllThreads": {
              return await withJazzUser(auth, async (account) => {
                const count = account.root.chatThreads.length
                if (count > 0) {
                  account.root.chatThreads.$jazz.splice(0, count)
                }

                return new Response(
                  JSON.stringify({ success: true }),
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
          console.error("[chat/mutations] error", error)
          return new Response(
            JSON.stringify({ error: "Mutation failed" }),
            defaultJsonHeaders(500),
          )
        }
      },
    },
  },
})
