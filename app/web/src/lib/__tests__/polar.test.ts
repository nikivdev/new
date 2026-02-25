import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock the require for server context
vi.mock("@tanstack/react-start/server", () => ({
  getServerContext: () => null,
}))

describe("polar config", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("getPolarConfig reads from process.env", async () => {
    process.env.POLAR_ACCESS_TOKEN = "test-token"
    // flow:secret:ignore
    process.env.POLAR_WEBHOOK_SECRET = "placeholder-webhook-secret-for-tests"
    process.env.POLAR_PRO_PRODUCT_ID = "prod-123"
    process.env.POLAR_REFILL_PRODUCT_ID = "prod-456"
    process.env.POLAR_API_URL = "https://api.test.polar.sh"

    const { getPolarConfig } = await import("../polar")
    const config = getPolarConfig()

    expect(config.accessToken).toBe("test-token")
    expect(config.webhookSecret).toBe("placeholder-webhook-secret-for-tests")
    expect(config.proProductId).toBe("prod-123")
    expect(config.refillProductId).toBe("prod-456")
    expect(config.apiUrl).toBe("https://api.test.polar.sh")
  })

  it("getPolarConfig defaults apiUrl to https://api.polar.sh", async () => {
    process.env.POLAR_ACCESS_TOKEN = "test-token"
    delete process.env.POLAR_API_URL

    const { getPolarConfig } = await import("../polar")
    const config = getPolarConfig()

    expect(config.apiUrl).toBe("https://api.polar.sh")
  })

  it("polarFetch throws when no access token", async () => {
    delete process.env.POLAR_ACCESS_TOKEN

    const { polarFetch } = await import("../polar")
    await expect(polarFetch("/v1/checkouts")).rejects.toThrow(
      "POLAR_ACCESS_TOKEN not configured",
    )
  })

  it("polarFetch sends authorization header", async () => {
    process.env.POLAR_ACCESS_TOKEN = "test-token-abc"
    process.env.POLAR_API_URL = "https://api.test.polar.sh"

    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"))
    vi.stubGlobal("fetch", mockFetch)

    const { polarFetch } = await import("../polar")
    await polarFetch("/v1/checkouts", {
      method: "POST",
      body: JSON.stringify({ products: ["p1"] }),
    })

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test.polar.sh/v1/checkouts",
      expect.objectContaining({
        method: "POST",
      }),
    )

    const calledHeaders = mockFetch.mock.calls[0][1].headers
    expect(calledHeaders.get("Authorization")).toBe("Bearer test-token-abc")
    expect(calledHeaders.get("Content-Type")).toBe("application/json")
  })
})
