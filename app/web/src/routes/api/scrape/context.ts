import { createFileRoute } from "@tanstack/react-router"
import { requireJazzAuth } from "@/lib/jazz/server-auth"
import { checkUsageAllowed, recordUsage } from "@/lib/billing"
import { getScrapeConfig } from "@/lib/scrape"

type ScrapeContextBody = {
  url?: string
  clean?: boolean
  maxPages?: number
  includePages?: boolean
  persist?: boolean
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

export const Route = createFileRoute("/api/scrape/context")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { auth, response } = await requireJazzAuth(request)
        if (!auth) {
          return response
        }

        const usageCheck = await checkUsageAllowed(
          request,
          auth.accountId,
          "scrapes",
        )

        if (!usageCheck.isPaid) {
          return json(
            {
              error: "Pro subscription required for website searches",
              reason: "no_subscription",
            },
            403,
          )
        }

        if (!usageCheck.allowed) {
          return json(
            {
              error: "Usage limit exceeded",
              reason: usageCheck.reason,
              remaining: usageCheck.remaining,
              limit: usageCheck.limit,
            },
            429,
          )
        }

        let body: ScrapeContextBody
        try {
          body = (await request.json()) as ScrapeContextBody
        } catch {
          return json({ error: "Invalid JSON body" }, 400)
        }

        if (!body.url || typeof body.url !== "string") {
          return json({ error: "url is required" }, 400)
        }

        const config = getScrapeConfig()
        if (!config.url) {
          return json({ error: "SCRAPE_SERVICE_URL not configured" }, 500)
        }

        const payload: Record<string, unknown> = {
          url: body.url,
          clean: body.clean ?? true,
          persist: body.persist ?? true,
        }

        if (typeof body.maxPages === "number") {
          payload.max_pages = body.maxPages
        }

        if (typeof body.includePages === "boolean") {
          payload.include_pages = body.includePages
        }

        const headers: Record<string, string> = {
          "content-type": "application/json",
        }

        if (config.token) {
          headers.Authorization = `Bearer ${config.token}`
        }

        const target = new URL("/context", config.url).toString()
        const responseUpstream = await fetch(target, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        })

        if (!responseUpstream.ok) {
          const errorText = await responseUpstream.text()
          return json(
            {
              error: "Scrape service error",
              status: responseUpstream.status,
              details: errorText,
            },
            responseUpstream.status,
          )
        }

        const data = (await responseUpstream.json()) as Record<string, unknown>

        await recordUsage(
          request,
          1,
          `scrape-${auth.accountId}-${Date.now()}`,
          "scrapes",
          auth.accountId,
        )

        return json(data, 200)
      },
    },
  },
})
