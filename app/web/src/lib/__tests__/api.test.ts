import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock @/shared/reatom/core's wrap to pass through
vi.mock("@/shared/reatom/core", () => ({
  wrap: <T>(p: T) => p,
}))

// Mock jazz headers
vi.mock("@/lib/jazz/headers", () => ({
  withJazzAuthHeaders: (headers: Record<string, string> = {}) => ({
    ...headers,
    "x-jazz-account-id": "test-account-123",
    "x-jazz-account-secret": "test-secret",
  }),
}))

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("adds jazz auth headers to requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "ok" }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const { apiFetch } = await import("../api")
    await apiFetch("/api/polar/billing")

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/polar/billing",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-jazz-account-id": "test-account-123",
        }),
      }),
    )
  })

  it("throws on non-ok responses", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    })
    vi.stubGlobal("fetch", mockFetch)

    const { apiFetch } = await import("../api")
    await expect(apiFetch("/api/polar/billing")).rejects.toThrow("HTTP 401")
  })

  it("apiPost sends JSON body with correct content-type", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "https://checkout.polar.sh/123" }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const { apiPost } = await import("../api")
    const result = await apiPost<{ url: string }>("/api/polar/checkout", { test: true })

    expect(result.url).toBe("https://checkout.polar.sh/123")
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/polar/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ test: true }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    )
  })
})
