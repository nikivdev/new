import { createFileRoute } from "@tanstack/react-router"
import { requireJazzAuth } from "@/lib/jazz/server-auth"
import { withJazzUser } from "@/lib/jazz/server-store"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

export const Route = createFileRoute("/api/chat-threads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { auth, response } = await requireJazzAuth(request)
        if (!auth) {
          return response
        }

        return withJazzUser(auth, async (account) => {
          const threads = [...account.root.chatThreads]
            .filter((thread: any) => thread && thread.$isLoaded)
            .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
            .map((thread: any) => ({
              id: thread.$jazz.id,
              title: thread.title,
              created_at: thread.createdAt
                ? new Date(thread.createdAt).toISOString()
                : null,
            }))

          return json({ threads })
        })
      },
    },
  },
})
