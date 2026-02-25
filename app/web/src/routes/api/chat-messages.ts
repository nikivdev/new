import { createFileRoute } from "@tanstack/react-router"
import { requireJazzAuth } from "@/lib/jazz/server-auth"
import { withJazzUser } from "@/lib/jazz/server-store"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

export const Route = createFileRoute("/api/chat-messages")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { auth, response } = await requireJazzAuth(request)
        if (!auth) {
          return response
        }

        const url = new URL(request.url)
        const threadId = url.searchParams.get("threadId")
        if (!threadId) {
          return json({ error: "Missing threadId" }, 400)
        }

        return withJazzUser(auth, async (account) => {
          const thread = account.root.chatThreads.find(
            (candidate: any) => candidate?.$jazz?.id === threadId,
          )
          if (!thread) {
            return json({ error: "Thread not found" }, 404)
          }

          const messages = [...thread.messages]
            .filter((message: any) => message && message.$isLoaded)
            .sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0))
            .map((message: any) => ({
              id: message.$jazz.id,
              thread_id: threadId,
              role: message.role,
              content: message.content,
              created_at: message.createdAt
                ? new Date(message.createdAt).toISOString()
                : null,
            }))

          return json({ messages })
        })
      },
    },
  },
})
