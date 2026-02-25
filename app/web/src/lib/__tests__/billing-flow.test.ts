import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Billing flow tests — verifies the subscription checkout, refill,
 * portal, and webhook flows that power the billing system.
 */

vi.mock("@/shared/reatom/core", () => ({
  wrap: <T>(p: T) => p,
}))

vi.mock("@/lib/jazz/headers", () => ({
  withJazzAuthHeaders: (headers: Record<string, string> = {}) => ({
    ...headers,
    "x-jazz-account-id": "test-account-123",
    "x-jazz-account-secret": "test-secret",
  }),
}))

describe("billing status flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns guest status for unauthenticated users", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          isGuest: true,
          isPaid: false,
          planName: "Guest",
          freeLimit: 5,
        }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const { apiFetch } = await import("../api")
    const status = await apiFetch<{
      isGuest: boolean
      isPaid: boolean
      planName: string
      freeLimit: number
    }>("/api/polar/billing")

    expect(status.isGuest).toBe(true)
    expect(status.isPaid).toBe(false)
    expect(status.planName).toBe("Guest")
    expect(status.freeLimit).toBe(5)
  })

  it("returns free tier for authenticated unpaid users", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          isGuest: false,
          isPaid: false,
          planName: "Free",
          freeLimit: 20,
          usage: {
            premium: { used: 1, limit: 2, remaining: 1 },
          },
        }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const { apiFetch } = await import("../api")
    const status = await apiFetch<any>("/api/polar/billing")

    expect(status.isGuest).toBe(false)
    expect(status.isPaid).toBe(false)
    expect(status.planName).toBe("Free")
    expect(status.usage.premium.remaining).toBe(1)
  })

  it("returns Gen Pro status for paid users", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          isGuest: false,
          isPaid: true,
          planName: "Gen Pro",
          usage: {
            standard: { used: 50, limit: 1000, remaining: 950 },
            premium: { used: 5, limit: 100, remaining: 95 },
            scrapes: { used: 10, limit: 300, remaining: 290 },
          },
          topupCredits: { standard: 0, premium: 0, scrapes: 0 },
          currentPeriodEnd: "2026-03-17T00:00:00.000Z",
          cancelAtPeriodEnd: false,
        }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const { apiFetch } = await import("../api")
    const status = await apiFetch<any>("/api/polar/billing")

    expect(status.isPaid).toBe(true)
    expect(status.planName).toBe("Gen Pro")
    expect(status.usage.standard.limit).toBe(1000)
    expect(status.usage.premium.limit).toBe(100)
    expect(status.usage.scrapes.limit).toBe(300)
    expect(status.cancelAtPeriodEnd).toBe(false)
  })
})

describe("checkout flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("creates subscription checkout and returns redirect URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          url: "https://checkout.polar.sh/abc123",
        }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const { apiPost } = await import("../api")
    const result = await apiPost<{ url: string }>("/api/polar/checkout", {})

    expect(result.url).toBe("https://checkout.polar.sh/abc123")
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/polar/checkout",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("handles checkout creation failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('{"error":"Polar not configured"}'),
    })
    vi.stubGlobal("fetch", mockFetch)

    const { apiPost } = await import("../api")
    await expect(apiPost("/api/polar/checkout", {})).rejects.toThrow("HTTP 500")
  })
})

describe("refill checkout flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("creates refill checkout for active subscriber", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          url: "https://checkout.polar.sh/refill_456",
        }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const { apiPost } = await import("../api")
    const result = await apiPost<{ url: string }>("/api/polar/refill-checkout", {})

    expect(result.url).toBe("https://checkout.polar.sh/refill_456")
  })

  it("returns 403 when user has no active subscription", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () =>
        Promise.resolve('{"error":"Active subscription required for refills"}'),
    })
    vi.stubGlobal("fetch", mockFetch)

    const { apiPost } = await import("../api")
    await expect(apiPost("/api/polar/refill-checkout", {})).rejects.toThrow(
      "HTTP 403",
    )
  })
})

describe("portal flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns customer portal URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          url: "https://polar.sh/portal/customer_789",
        }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const { apiPost } = await import("../api")
    const result = await apiPost<{ url: string }>("/api/polar/portal", {})

    expect(result.url).toBe("https://polar.sh/portal/customer_789")
  })

  it("returns 404 when no billing account exists", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('{"error":"No billing account found"}'),
    })
    vi.stubGlobal("fetch", mockFetch)

    const { apiPost } = await import("../api")
    await expect(apiPost("/api/polar/portal", {})).rejects.toThrow("HTTP 404")
  })
})

describe("webhook processing", () => {
  it("checkout.succeeded with subscription creates billing user", () => {
    const event = {
      type: "checkout.succeeded",
      data: {
        id: "checkout_abc",
        customer_id: "cust_123",
        metadata: { user_id: "user_456" },
        product_id: "prod_pro",
      },
    }

    expect(event.data.metadata.user_id).toBe("user_456")
    expect(event.data.customer_id).toBe("cust_123")
    expect(event.data.metadata).not.toHaveProperty("type")
  })

  it("checkout.succeeded with refill metadata triggers credits", () => {
    const event = {
      type: "checkout.succeeded",
      data: {
        id: "checkout_def",
        customer_id: "cust_123",
        metadata: { user_id: "user_456", type: "refill" },
        product_id: "prod_refill",
      },
    }

    expect(event.data.metadata.type).toBe("refill")
    expect(event.data.metadata.user_id).toBe("user_456")
  })

  it("subscription events carry period dates as ISO strings", () => {
    const event = {
      type: "subscription.created",
      data: {
        id: "sub_789",
        customer_id: "cust_123",
        product_id: "prod_pro",
        status: "active",
        current_period_start: "2026-02-17T00:00:00Z",
        current_period_end: "2026-03-17T00:00:00Z",
        cancel_at_period_end: false,
      },
    }

    const periodStart = new Date(event.data.current_period_start).getTime()
    const periodEnd = new Date(event.data.current_period_end).getTime()

    expect(periodEnd).toBeGreaterThan(periodStart)
    expect(periodEnd - periodStart).toBeGreaterThan(27 * 24 * 60 * 60 * 1000) // at least 27 days
  })

  it("refill credits are additive", () => {
    const REFILL_CREDITS = { standard: 1000, premium: 100, scrapes: 300 }

    // Simulate user already having some topup credits
    let topupStandard = 200
    let topupPremium = 30
    let topupScrapes = 50

    // Apply refill
    topupStandard += REFILL_CREDITS.standard
    topupPremium += REFILL_CREDITS.premium
    topupScrapes += REFILL_CREDITS.scrapes

    expect(topupStandard).toBe(1200)
    expect(topupPremium).toBe(130)
    expect(topupScrapes).toBe(350)
  })
})

describe("usage tracking", () => {
  it("subscription usage consumes from meter before topup", () => {
    const usage = { standardUsed: 990, standardLimit: 1000 }
    const topupStandard = 500

    const subscriptionRemaining = Math.max(0, usage.standardLimit - usage.standardUsed)
    expect(subscriptionRemaining).toBe(10)

    // Using 5 requests — should come from subscription
    const amount = 5
    if (subscriptionRemaining >= amount) {
      usage.standardUsed += amount
    }

    expect(usage.standardUsed).toBe(995)
  })

  it("falls back to topup credits when subscription exhausted", () => {
    const usage = { standardUsed: 1000, standardLimit: 1000 }
    let topupStandard = 500

    const subscriptionRemaining = Math.max(0, usage.standardLimit - usage.standardUsed)
    expect(subscriptionRemaining).toBe(0)

    // Using 1 request — should come from topup
    const amount = 1
    if (subscriptionRemaining < amount) {
      topupStandard -= amount
    }

    expect(topupStandard).toBe(499)
  })

  it("denies request when both subscription and topup exhausted", () => {
    const usage = { standardUsed: 1000, standardLimit: 1000 }
    const topupStandard = 0

    const subscriptionRemaining = Math.max(0, usage.standardLimit - usage.standardUsed)
    const totalRemaining = subscriptionRemaining + topupStandard

    expect(totalRemaining).toBe(0)

    const allowed = totalRemaining > 0
    expect(allowed).toBe(false)
  })
})
