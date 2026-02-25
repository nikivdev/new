import { createFileRoute } from "@tanstack/react-router"
import { getPolarConfig } from "@/lib/polar"
import {
  updateBillingUserFromPolar,
  addRefillCredits,
  findUserIdByPolarCustomerId,
} from "@/lib/billing"

export const Route = createFileRoute("/api/polar/webhooks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { webhookSecret } = getPolarConfig()

        if (!webhookSecret) {
          console.error("[polar] Webhook secret not configured")
          return new Response("Webhook secret not configured", { status: 500 })
        }

        const body = await request.text()
        const signature = request.headers.get("x-polar-signature")

        if (!signature) {
          return new Response("Missing x-polar-signature header", { status: 400 })
        }

        // Verify HMAC SHA256 signature
        const isValid = await verifySignature(body, signature, webhookSecret)
        if (!isValid) {
          console.error("[polar] Webhook signature verification failed")
          return new Response("Invalid signature", { status: 400 })
        }

        let event: { type: string; data: Record<string, any> }
        try {
          event = JSON.parse(body)
        } catch {
          return new Response("Invalid JSON", { status: 400 })
        }

        try {
          switch (event.type) {
            case "checkout.succeeded": {
              const checkout = event.data
              const userId = checkout.metadata?.user_id
              if (!userId) {
                console.error("[polar] Checkout missing user_id in metadata")
                break
              }

              if (checkout.metadata?.type === "refill") {
                console.log("[polar] Refill purchase for user:", userId)
                await addRefillCredits(userId)
              } else {
                console.log("[polar] Subscription checkout for user:", userId)
                // Store the customer ID and fetch subscription details
                if (checkout.customer_id) {
                  await updateBillingUserFromPolar({
                    userId,
                    polarCustomerId: checkout.customer_id,
                  })
                }
                // Subscription details will come via subscription.created event
              }
              break
            }

            case "subscription.created":
            case "subscription.updated": {
              const subscription = event.data
              console.log(`[polar] Subscription ${event.type}:`, subscription.id)
              await handleSubscriptionUpdate(subscription)
              break
            }

            case "subscription.canceled": {
              const subscription = event.data
              console.log("[polar] Subscription canceled:", subscription.id)
              await handleSubscriptionCanceled(subscription)
              break
            }

            case "order.paid": {
              const order = event.data
              console.log("[polar] Order paid:", order.id)
              break
            }

            default:
              console.log(`[polar] Unhandled event type: ${event.type}`)
          }

          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        } catch (error) {
          console.error("[polar] Webhook handler error:", error)
          return new Response("Webhook handler error", { status: 500 })
        }
      },
    },
  },
})

async function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")

    // Constant-time comparison
    if (computed.length !== signature.length) return false
    let result = 0
    for (let i = 0; i < computed.length; i++) {
      result |= computed.charCodeAt(i) ^ signature.charCodeAt(i)
    }
    return result === 0
  } catch {
    return false
  }
}

async function handleSubscriptionUpdate(subscription: Record<string, any>) {
  const customerId = subscription.customer_id
  if (!customerId) {
    console.error("[polar] Subscription missing customer_id")
    return
  }

  // Find user by metadata first, then by customer ID
  let userId = subscription.metadata?.user_id
  if (!userId) {
    userId = await findUserIdByPolarCustomerId(customerId)
  }

  if (!userId) {
    console.error("[polar] No user found for customer:", customerId)
    return
  }

  const periodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start).getTime()
    : Date.now()
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end).getTime()
    : Date.now() + 30 * 24 * 60 * 60 * 1000

  await updateBillingUserFromPolar({
    userId,
    polarCustomerId: customerId,
    polarSubscriptionId: subscription.id,
    polarProductId: subscription.product_id,
    subscriptionStatus: subscription.status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
  })

  console.log(`[polar] Subscription synced for user ${userId}`)
}

async function handleSubscriptionCanceled(subscription: Record<string, any>) {
  const customerId = subscription.customer_id
  if (!customerId) return

  let userId = subscription.metadata?.user_id
  if (!userId) {
    userId = await findUserIdByPolarCustomerId(customerId)
  }

  if (!userId) {
    console.error("[polar] No user found for customer:", customerId)
    return
  }

  await updateBillingUserFromPolar({
    userId,
    subscriptionStatus: "canceled",
  })

  console.log(`[polar] Subscription ${subscription.id} marked as canceled`)
}
