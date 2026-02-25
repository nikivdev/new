import { createFileRoute } from "@tanstack/react-router"
import { getJazzAccountId } from "@/lib/jazz/server-auth"
import { getPremiumTrialUsage, getBillingSummary } from "@/lib/billing"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

// Usage limits for free users
const GUEST_FREE_REQUESTS = 5

export const Route = createFileRoute("/api/polar/billing")({
  server: {
    handlers: {
      // GET: Get billing status for current user
      GET: async ({ request }) => {
        const accountId = getJazzAccountId(request)

        // Guest user
        if (!accountId) {
          return json({
            isGuest: true,
            isPaid: false,
            planName: "Guest",
            freeLimit: GUEST_FREE_REQUESTS,
          })
        }

        try {
          const summary = await getBillingSummary(request)
          return json(summary)
        } catch (error) {
          console.error("[billing] Error getting status:", error)
          const trialUsage = await getPremiumTrialUsage(accountId)
          return json({
            isGuest: false,
            isPaid: false,
            planName: "Free",
            freeLimit: 20,
            usage: {
              premium: trialUsage,
            },
          })
        }
      },
    },
  },
})
