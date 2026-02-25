import { createFileRoute } from "@tanstack/react-router"
import { requireJazzAccountId } from "@/lib/jazz/server-auth"
import { getPolarConfig, polarFetch } from "@/lib/polar"
import { withJazzServerAccount } from "@/lib/jazz/server-store"
import { updateBillingUserFromPolar } from "@/lib/billing"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

const findBillingUser = (account: any, userId: string) =>
  account.root.billingUsers.find((bu: any) => bu?.userId === userId)

export const Route = createFileRoute("/api/polar/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { accountId, response } = requireJazzAccountId(request)
        if (!accountId) {
          return response
        }

        const { accessToken, proProductId } = getPolarConfig()

        if (!accessToken) {
          console.error("[polar] Polar not configured - missing POLAR_ACCESS_TOKEN")
          return json({ error: "Polar not configured" }, 500)
        }

        if (!proProductId) {
          console.error("[polar] Product ID not configured - missing POLAR_PRO_PRODUCT_ID")
          return json({ error: "Product ID not configured" }, 500)
        }

        try {
          // Get customer email from Jazz profile if available
          let customerEmail: string | undefined
          let polarCustomerId: string | undefined

          await withJazzServerAccount(async (account) => {
            const billingUser = findBillingUser(account, accountId)
            polarCustomerId = billingUser?.polarCustomerId ?? undefined

            // Try to get email from user directory
            const user = account.root.users?.find((u: any) => u?.userId === accountId)
            customerEmail = user?.email ?? undefined
          })

          const origin = new URL(request.url).origin
          const successUrl = `${origin}/settings/billing?success=true`

          // Build checkout request
          const checkoutBody: Record<string, unknown> = {
            products: [proProductId],
            metadata: { user_id: accountId },
            success_url: successUrl,
          }

          if (polarCustomerId) {
            checkoutBody.customer_id = polarCustomerId
          } else if (customerEmail) {
            checkoutBody.customer_email = customerEmail
          }

          console.log("[polar] Creating checkout for product:", proProductId)

          const res = await polarFetch("/v1/checkouts", {
            method: "POST",
            body: JSON.stringify(checkoutBody),
          })

          if (!res.ok) {
            const errorData = await res.text()
            console.error("[polar] Checkout creation failed:", res.status, errorData)
            return json({ error: "Failed to create checkout" }, 500)
          }

          const data = await res.json() as { url: string; id: string }
          console.log("[polar] Checkout created:", data.id)
          return json({ url: data.url })
        } catch (error) {
          const err = error as Error
          console.error("[polar] Checkout error:", err.message)
          return json({ error: `Failed to create checkout: ${err.message}` }, 500)
        }
      },
    },
  },
})
