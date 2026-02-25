import { createFileRoute } from "@tanstack/react-router"
import { requireJazzAccountId } from "@/lib/jazz/server-auth"
import { polarFetch } from "@/lib/polar"
import { withJazzServerAccount } from "@/lib/jazz/server-store"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

const findBillingUser = (account: any, userId: string) =>
  account.root.billingUsers.find((bu: any) => bu?.userId === userId)

export const Route = createFileRoute("/api/polar/portal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { accountId, response } = requireJazzAccountId(request)
        if (!accountId) {
          return response
        }

        try {
          // Get Polar customer ID from Jazz
          const polarCustomerId = await withJazzServerAccount(async (account) => {
            const billingUser = findBillingUser(account, accountId)
            return billingUser?.polarCustomerId ?? null
          })

          if (!polarCustomerId) {
            return json({ error: "No billing account found" }, 404)
          }

          // Create a customer portal session via Polar API
          const res = await polarFetch(`/v1/customer-portal/sessions`, {
            method: "POST",
            body: JSON.stringify({ customer_id: polarCustomerId }),
          })

          if (!res.ok) {
            const errorData = await res.text()
            console.error("[polar] Portal session failed:", res.status, errorData)
            return json({ error: "Failed to create portal session" }, 500)
          }

          const data = await res.json() as { customer_portal_url: string }
          return json({ url: data.customer_portal_url })
        } catch (error) {
          console.error("[polar] Portal error:", error)
          return json({ error: "Failed to create portal session" }, 500)
        }
      },
    },
  },
})
