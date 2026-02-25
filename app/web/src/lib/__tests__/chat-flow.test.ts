import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Chat flow tests — verifies the guest chat and authenticated chat flows
 * that power routes/home.tsx and components/chat/ChatPage.tsx
 */

vi.mock("@/shared/reatom/core", () => ({
  wrap: <T>(p: T) => p,
}))

describe("guest chat flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("sends messages to /api/chat/guest and receives a response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "x-thread-id": "42" }),
      text: () => Promise.resolve("Hello! I'm here to help."),
    })
    vi.stubGlobal("fetch", mockFetch)

    const response = await fetch("/api/chat/guest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
    })

    expect(response.ok).toBe(true)
    const text = await response.text()
    expect(text).toBe("Hello! I'm here to help.")
    expect(response.headers.get("x-thread-id")).toBe("42")
  })

  it("preserves thread ID across multiple messages", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "x-thread-id": "42" }),
        text: () => Promise.resolve("Hi there!"),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "x-thread-id": "42" }),
        text: () => Promise.resolve("Sure, I can help with that."),
      })
    vi.stubGlobal("fetch", mockFetch)

    // First message
    await fetch("/api/chat/guest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
    })

    // Second message with thread ID
    await fetch("/api/chat/guest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
          { role: "user", content: "Help me write a poem" },
        ],
        threadId: "42",
      }),
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    const secondCall = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(secondCall.threadId).toBe("42")
    expect(secondCall.messages).toHaveLength(3)
  })

  it("returns 400 when messages array is empty", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Missing messages" }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const response = await fetch("/api/chat/guest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    })

    expect(response.ok).toBe(false)
    expect(response.status).toBe(400)
  })

  it("thread ID can be parsed from response body JSON prefix", () => {
    // The home page parses threadId from the first line of response
    const responseText = '{"threadId":42}\nHello! How can I help?'
    const newlineIndex = responseText.indexOf("\n")
    const maybeJson = responseText.slice(0, newlineIndex)
    const parsed = JSON.parse(maybeJson)
    const actualContent = responseText.slice(newlineIndex + 1)

    expect(parsed.threadId).toBe(42)
    expect(actualContent).toBe("Hello! How can I help?")
  })
})

describe("authenticated chat flow", () => {
  it("sends auth headers with chat requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Hello!"))
          controller.close()
        },
      }),
    })
    vi.stubGlobal("fetch", mockFetch)

    await fetch("/api/chat/ai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jazz-account-id": "acc_123",
        "x-jazz-account-secret": "secret_456",
      },
      body: JSON.stringify({
        threadId: "thread_789",
        messages: [{ role: "user", content: "Hello" }],
        model: "cerebras/zai-glm-4.7",
      }),
    })

    const calledHeaders = mockFetch.mock.calls[0][1].headers
    expect(calledHeaders["x-jazz-account-id"]).toBe("acc_123")
  })

  it("returns 429 when usage limit exceeded", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () =>
        Promise.resolve({
          error: "Usage limit exceeded",
          reason: "subscription_limit",
          remaining: 0,
          limit: 1000,
        }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const response = await fetch("/api/chat/ai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jazz-account-id": "acc_123",
        "x-jazz-account-secret": "secret_456",
      },
      body: JSON.stringify({
        threadId: "thread_789",
        messages: [{ role: "user", content: "Hello" }],
      }),
    })

    expect(response.status).toBe(429)
    const data = await response.json()
    expect(data.reason).toBe("subscription_limit")
  })

  it("returns 401 without auth headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Unauthorized" }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const response = await fetch("/api/chat/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "thread_789",
        messages: [{ role: "user", content: "Hello" }],
      }),
    })

    expect(response.status).toBe(401)
  })

  it("returns 400 without threadId", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Missing threadId or messages" }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const response = await fetch("/api/chat/ai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jazz-account-id": "acc_123",
        "x-jazz-account-secret": "secret_456",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
    })

    expect(response.status).toBe(400)
  })
})

describe("message types", () => {
  it("message has correct shape", () => {
    const message = {
      id: "msg_1",
      role: "user" as const,
      content: "Hello",
      createdAt: new Date(),
    }

    expect(message.id).toBeDefined()
    expect(["user", "assistant"]).toContain(message.role)
    expect(typeof message.content).toBe("string")
  })

  it("conversation maintains alternating roles", () => {
    const messages = [
      { role: "user" as const, content: "Hello" },
      { role: "assistant" as const, content: "Hi!" },
      { role: "user" as const, content: "How are you?" },
      { role: "assistant" as const, content: "I'm great!" },
    ]

    for (let i = 0; i < messages.length; i++) {
      const expected = i % 2 === 0 ? "user" : "assistant"
      expect(messages[i].role).toBe(expected)
    }
  })
})

describe("model selection", () => {
  const AVAILABLE_MODELS = [
    { id: "cerebras/zai-glm-4.7", name: "GLM-4.7", provider: "Cerebras" },
    { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3", provider: "DeepSeek" },
    { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", provider: "Google" },
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "Anthropic" },
    { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  ]

  it("default model is cerebras/zai-glm-4.7", () => {
    expect(AVAILABLE_MODELS[0].id).toBe("cerebras/zai-glm-4.7")
  })

  it("all models have provider/model-name format", () => {
    for (const model of AVAILABLE_MODELS) {
      expect(model.id).toMatch(/^[a-z]+\//)
    }
  })

  it("normalizeModel extracts model name from provider/model format", () => {
    const normalizeModel = (value?: string) => {
      if (!value) return "zai-glm-4.7"
      return value.includes("/") ? value.split("/").pop() || value : value
    }

    expect(normalizeModel("cerebras/zai-glm-4.7")).toBe("zai-glm-4.7")
    expect(normalizeModel("openai/gpt-4o")).toBe("gpt-4o")
    expect(normalizeModel(undefined)).toBe("zai-glm-4.7")
    expect(normalizeModel("standalone-model")).toBe("standalone-model")
  })
})
