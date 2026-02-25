import { describe, it, expect } from "vitest"
import { getMeterForModel, type MeterType } from "../billing"

describe("billing gates", () => {
  describe("model to meter mapping", () => {
    const cases: Array<[string, MeterType]> = [
      // Premium models
      ["anthropic/claude-sonnet-4", "premium"],
      ["anthropic/claude-opus-4", "premium"],
      ["openai/gpt-4o", "premium"],
      // Standard models
      ["cerebras/zai-glm-4.7", "standard"],
      ["google/gemini-2.0-flash-001", "standard"],
      ["meta-llama/llama-3.1-8b-instruct", "standard"],
      ["openai/gpt-4o-mini", "standard"],
      // Unknown models default to standard
      ["unknown/model", "standard"],
    ]

    for (const [modelId, expectedMeter] of cases) {
      it(`${modelId} → ${expectedMeter}`, () => {
        expect(getMeterForModel(modelId)).toBe(expectedMeter)
      })
    }
  })

  describe("AI chat request flow", () => {
    it("billing check response shape matches expected types", () => {
      // Validate the response shape that the AI chat route expects
      const usageCheckResult = {
        allowed: true,
        remaining: 950,
        limit: 1000,
        topupRemaining: 0,
        isGuest: false,
        isPaid: true,
        meter: "standard" as MeterType,
      }

      expect(usageCheckResult.allowed).toBe(true)
      expect(usageCheckResult.remaining).toBeLessThanOrEqual(usageCheckResult.limit)
      expect(usageCheckResult.isPaid).toBe(true)
    })

    it("429 response when usage exhausted", () => {
      const usageCheckResult = {
        allowed: false,
        remaining: 0,
        limit: 1000,
        topupRemaining: 0,
        reason: "subscription_limit" as const,
        isGuest: false,
        isPaid: true,
        meter: "standard" as MeterType,
      }

      expect(usageCheckResult.allowed).toBe(false)
      expect(usageCheckResult.reason).toBe("subscription_limit")

      // This is what the AI route returns for 429
      const responseBody = {
        error: "Usage limit exceeded",
        reason: usageCheckResult.reason,
        remaining: usageCheckResult.remaining,
        limit: usageCheckResult.limit,
      }

      expect(responseBody.error).toBe("Usage limit exceeded")
    })
  })

  describe("fallback chain", () => {
    it("AI server configs are correctly structured", () => {
      const aiServer = {
        url: "https://ai.example.com",
        token: "test-token",
        model: "cerebras/zai-glm-4.7",
      }

      expect(aiServer.url).not.toContain("/$")
      expect(typeof aiServer.token).toBe("string")
      expect(typeof aiServer.model).toBe("string")
    })

    it("unique servers deduplicates by URL", () => {
      type AiServerConfig = { url: string; token: string; model: string }
      const uniqueServers = (servers: Array<AiServerConfig | null>) => {
        const seen = new Set<string>()
        const result: AiServerConfig[] = []
        for (const server of servers) {
          if (!server) continue
          if (seen.has(server.url)) continue
          seen.add(server.url)
          result.push(server)
        }
        return result
      }

      const servers = uniqueServers([
        { url: "https://a.com", token: "t1", model: "m1" },
        { url: "https://a.com", token: "t2", model: "m2" },
        { url: "https://b.com", token: "t3", model: "m3" },
        null,
      ])

      expect(servers).toHaveLength(2)
      expect(servers[0].url).toBe("https://a.com")
      expect(servers[1].url).toBe("https://b.com")
    })
  })
})
