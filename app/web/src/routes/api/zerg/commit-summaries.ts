import { createFileRoute } from "@tanstack/react-router"
import { requireJazzAuth } from "@/lib/jazz/server-auth"
import { withJazzServerAccount } from "@/lib/jazz/server-store"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

type CommitSummaryResponse = {
  id: string
  repo: string
  title?: string | null
  author?: string | null
  authoredAt?: string | null
  summary: string
  window?: string | null
  runId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export const Route = createFileRoute("/api/zerg/commit-summaries")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { auth, response } = await requireJazzAuth(request)
        if (!auth) {
          return response
        }

        return withJazzServerAccount(async (account) => {
          const summaries = account.root?.zerg?.commitSummaries ?? []
          const items = summaries
            .filter((item: any) => item && item.$isLoaded)
            .map((item: any) => ({
              id: item.$jazz.id,
              repo: item.repo,
              title: item.title ?? null,
              author: item.author ?? null,
              authoredAt: item.authoredAt
                ? new Date(item.authoredAt).toISOString()
                : null,
              summary: item.summary,
              window: item.window ?? null,
              runId: item.runId ?? null,
              createdAt: item.createdAt
                ? new Date(item.createdAt).toISOString()
                : null,
              updatedAt: item.updatedAt
                ? new Date(item.updatedAt).toISOString()
                : null,
            }))
            .sort((a: CommitSummaryResponse, b: CommitSummaryResponse) => {
              const aTime = a.authoredAt
                ? Date.parse(a.authoredAt)
                : a.createdAt
                ? Date.parse(a.createdAt)
                : 0
              const bTime = b.authoredAt
                ? Date.parse(b.authoredAt)
                : b.createdAt
                ? Date.parse(b.createdAt)
                : 0
              return bTime - aTime
            })

          return json({ items })
        })
      },
    },
  },
})
