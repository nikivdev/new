import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock cloudflare:workers to avoid import errors
vi.mock("cloudflare:workers", () => ({ env: {} }))

describe("AI provider", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("getDefaultModel returns the forced model", async () => {
    const { getDefaultModel } = await import("../ai/provider")
    const model = getDefaultModel()
    expect(model).toBe("cerebras/zai-glm-4.7")
  })

  it("getOpenRouter returns null without API key", async () => {
    delete process.env.OPENROUTER_API_KEY
    const { getOpenRouter } = await import("../ai/provider")
    const router = getOpenRouter()
    expect(router).toBeNull()
  })

  it("getOpenRouter returns client with API key", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test-key-123"
    const { getOpenRouter } = await import("../ai/provider")
    const router = getOpenRouter()
    expect(router).not.toBeNull()
  })

  it("getOpenRouterWithKey returns null for undefined key", async () => {
    const { getOpenRouterWithKey } = await import("../ai/provider")
    const router = getOpenRouterWithKey(undefined)
    expect(router).toBeNull()
  })

  it("getOpenRouterWithKey returns client for valid key", async () => {
    const { getOpenRouterWithKey } = await import("../ai/provider")
    const router = getOpenRouterWithKey("sk-or-test-key-456")
    expect(router).not.toBeNull()
  })
})
