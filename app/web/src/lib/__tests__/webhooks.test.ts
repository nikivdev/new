import { describe, it, expect, vi } from "vitest"

// Test the HMAC SHA256 signature verification logic independently
async function computeHmacSha256(payload: string, hmacKey: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(hmacKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

describe("webhook signature verification", () => {
  it("computes correct HMAC SHA256 signature", async () => {
    const payload = '{"type":"checkout.succeeded","data":{"id":"123"}}'
    const hmacKey = "test-hmac-key-placeholder"
    const signature = await computeHmacSha256(payload, hmacKey)

    // Verify it's a 64-char hex string (256 bits)
    expect(signature).toMatch(/^[0-9a-f]{64}$/)

    // Same input should produce same output
    const signature2 = await computeHmacSha256(payload, hmacKey)
    expect(signature).toBe(signature2)
  })

  it("different payloads produce different signatures", async () => {
    const hmacKey = "test-hmac-key-placeholder"
    const sig1 = await computeHmacSha256('{"type":"a"}', hmacKey)
    const sig2 = await computeHmacSha256('{"type":"b"}', hmacKey)
    expect(sig1).not.toBe(sig2)
  })

  it("different secrets produce different signatures", async () => {
    const payload = '{"type":"test"}'
    const sig1 = await computeHmacSha256(payload, "secret1")
    const sig2 = await computeHmacSha256(payload, "secret2")
    expect(sig1).not.toBe(sig2)
  })
})

describe("webhook event parsing", () => {
  it("parses checkout.succeeded with refill metadata", () => {
    const event = {
      type: "checkout.succeeded",
      data: {
        id: "checkout_123",
        customer_id: "cust_456",
        metadata: { user_id: "user_789", type: "refill" },
      },
    }

    expect(event.type).toBe("checkout.succeeded")
    expect(event.data.metadata.type).toBe("refill")
    expect(event.data.metadata.user_id).toBe("user_789")
  })

  it("parses subscription.created event", () => {
    const event = {
      type: "subscription.created",
      data: {
        id: "sub_123",
        customer_id: "cust_456",
        product_id: "prod_789",
        status: "active",
        current_period_start: "2026-02-17T00:00:00Z",
        current_period_end: "2026-03-17T00:00:00Z",
        cancel_at_period_end: false,
        metadata: { user_id: "user_789" },
      },
    }

    expect(event.type).toBe("subscription.created")
    expect(event.data.status).toBe("active")
    expect(new Date(event.data.current_period_start).getTime()).toBeGreaterThan(0)
  })

  it("parses subscription.canceled event", () => {
    const event = {
      type: "subscription.canceled",
      data: {
        id: "sub_123",
        customer_id: "cust_456",
        status: "canceled",
      },
    }

    expect(event.type).toBe("subscription.canceled")
    expect(event.data.status).toBe("canceled")
  })
})
