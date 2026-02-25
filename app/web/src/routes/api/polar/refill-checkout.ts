import { createFileRoute } from "@tanstack/react-router"
import { requireJazzAccountId } from "@/lib/jazz/server-auth"
import { getPolarConfig, polarFetch } from "@/lib/polar"
import { withJazzServerAccount } from "@/lib/jazz/server-store"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

const findBillingUser = (account: any, userId: string) =>
  account.root.billingUsers.find((bu: any) => bu?.userId === userId)

export const Route = createFileRoute("/api/polar/refill-checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { accountId, response } = requireJazzAccountId(request)
        if (!accountId) {
          return response
        }

        const { accessToken, refillProductId } = getPolarConfig()

        if (!accessToken) {
          return json({ error: "Polar not configured" }, 500)
        }

        if (!refillProductId) {
          return json({ error: "Refill product not configured" }, 500)
        }

        // Check if user has active subscription in Jazz
        const billingInfo = await withJazzServerAccount(async (account) => {
          const billingUser = findBillingUser(account, accountId)
          if (!billingUser) return null
          return {
            polarCustomerId: billingUser.polarCustomerId,
            subscriptionStatus: billingUser.subscriptionStatus,
          }
        })

        if (!billingInfo || billingInfo.subscriptionStatus !== "active") {
          return json({ error: "Active subscription required for refills" }, 403)
        }

        try {
          const origin = new URL(request.url).origin
          const successUrl = `${origin}/settings/billing?refill=success`

          const checkoutBody: Record<string, unknown> = {
            products: [refillProductId],
            metadata: { user_id: accountId, type: "refill" },
            success_url: successUrl,
          }

          if (billingInfo.polarCustomerId) {
            checkoutBody.customer_id = billingInfo.polarCustomerId
          }

          const res = await polarFetch("/v1/checkouts", {
            method: "POST",
            body: JSON.stringify(checkoutBody),
          })

          if (!res.ok) {
            const errorData = await res.text()
            console.error("[polar] Refill checkout failed:", res.status, errorData)
            return json({ error: "Failed to create refill checkout" }, 500)
          }

          const data = await res.json() as { url: string; id: string }
          return json({ url: data.url })
        } catch (error) {
          const err = error as Error
          console.error("[polar] Refill checkout error:", err.message)
          return json({ error: `Failed to create refill checkout: ${err.message}` }, 500)
        }
      },
    },
  },
})
