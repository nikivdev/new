import { describe, it, expect, vi } from "vitest"

// Mock jazz server auth
vi.mock("@/lib/jazz/server-auth", () => ({
  getJazzAccountId: (request: Request) =>
    request.headers.get("x-jazz-account-id"),
}))

describe("billing", () => {
  describe("getMeterForModel", () => {
    it("returns premium for claude-sonnet-4", async () => {
      const { getMeterForModel } = await import("../billing")
      expect(getMeterForModel("anthropic/claude-sonnet-4")).toBe("premium")
    })

    it("returns premium for claude-opus-4", async () => {
      const { getMeterForModel } = await import("../billing")
      expect(getMeterForModel("anthropic/claude-opus-4")).toBe("premium")
    })

    it("returns premium for gpt-4o", async () => {
      const { getMeterForModel } = await import("../billing")
      expect(getMeterForModel("openai/gpt-4o")).toBe("premium")
    })

    it("returns standard for other models", async () => {
      const { getMeterForModel } = await import("../billing")
      expect(getMeterForModel("cerebras/zai-glm-4.7")).toBe("standard")
      expect(getMeterForModel("google/gemini-2.0-flash")).toBe("standard")
    })
  })
})
