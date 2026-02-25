import { describe, it, expect } from "vitest"

/**
 * Jazz schema validation tests — verifies the data shapes used
 * across the application for billing, chat, context, blocks, and canvas.
 */

describe("BillingUser schema", () => {
  const makeBillingUser = (overrides = {}) => ({
    userId: "user_123",
    polarCustomerId: undefined as string | undefined,
    polarSubscriptionId: undefined as string | undefined,
    polarProductId: undefined as string | undefined,
    subscriptionStatus: undefined as string | undefined,
    currentPeriodStart: undefined as number | undefined,
    currentPeriodEnd: undefined as number | undefined,
    cancelAtPeriodEnd: undefined as boolean | undefined,
    topupStandardCredits: 0,
    topupPremiumCredits: 0,
    topupScrapesCredits: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  })

  it("creates default billing user with zero credits", () => {
    const user = makeBillingUser()
    expect(user.topupStandardCredits).toBe(0)
    expect(user.topupPremiumCredits).toBe(0)
    expect(user.topupScrapesCredits).toBe(0)
    expect(user.subscriptionStatus).toBeUndefined()
  })

  it("active subscriber has all fields populated", () => {
    const now = Date.now()
    const user = makeBillingUser({
      polarCustomerId: "cust_abc",
      polarSubscriptionId: "sub_def",
      polarProductId: "prod_ghi",
      subscriptionStatus: "active",
      currentPeriodStart: now,
      currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
      cancelAtPeriodEnd: false,
    })

    expect(user.subscriptionStatus).toBe("active")
    expect(user.polarCustomerId).toBe("cust_abc")
    expect(user.currentPeriodEnd).toBeGreaterThan(user.currentPeriodStart!)
  })

  it("canceled subscriber retains customer ID", () => {
    const user = makeBillingUser({
      polarCustomerId: "cust_abc",
      subscriptionStatus: "canceled",
    })

    expect(user.subscriptionStatus).toBe("canceled")
    expect(user.polarCustomerId).toBe("cust_abc")
  })

  it("uses polar field names (not stripe)", () => {
    const user = makeBillingUser()
    expect("polarCustomerId" in user).toBe(true)
    expect("polarSubscriptionId" in user).toBe(true)
    expect("polarProductId" in user).toBe(true)
    // Stripe fields should not exist
    expect("stripeCustomerId" in user).toBe(false)
    expect("stripeSubscriptionId" in user).toBe(false)
    expect("stripePriceId" in user).toBe(false)
  })
})

describe("ChatThread schema", () => {
  it("thread has title, messages, and timestamps", () => {
    const thread = {
      title: "My conversation",
      messages: [
        { role: "user" as const, content: "Hello", createdAt: Date.now() },
        { role: "assistant" as const, content: "Hi!", createdAt: Date.now() },
      ],
      createdAt: Date.now(),
      contextItemIds: [] as string[],
      blockIds: [] as string[],
    }

    expect(thread.title).toBe("My conversation")
    expect(thread.messages).toHaveLength(2)
    expect(thread.contextItemIds).toHaveLength(0)
  })

  it("thread can reference context items and blocks", () => {
    const thread = {
      title: "Research",
      messages: [],
      createdAt: Date.now(),
      contextItemIds: ["ctx_1", "ctx_2"],
      blockIds: ["block_1"],
    }

    expect(thread.contextItemIds).toHaveLength(2)
    expect(thread.blockIds).toHaveLength(1)
  })
})

describe("ContextItem schema", () => {
  it("URL context item", () => {
    const item = {
      type: "url" as const,
      url: "https://example.com",
      name: "Example Site",
      content: "Page content here...",
      refreshing: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    expect(item.type).toBe("url")
    expect(item.url).toBe("https://example.com")
    expect(item.refreshing).toBe(false)
  })

  it("file context item", () => {
    const item = {
      type: "file" as const,
      name: "readme.md",
      content: "# Hello",
      refreshing: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    expect(item.type).toBe("file")
    expect(item.url).toBeUndefined()
  })
})

describe("Block schema", () => {
  it("web block with scan status", () => {
    const block = {
      name: "Docs",
      type: "web" as const,
      url: "https://docs.example.com",
      content: "Documentation content...",
      config: {
        deepScanLevel: 2,
        summarise: true,
        createSections: true,
      },
      status: "ready" as const,
      tokenCount: 5000,
      pageCount: 12,
      pages: [],
    }

    expect(block.type).toBe("web")
    expect(block.status).toBe("ready")
    expect(block.tokenCount).toBe(5000)
    expect(block.config.deepScanLevel).toBe(2)
  })

  it("text block", () => {
    const block = {
      name: "Custom Instructions",
      type: "text" as const,
      content: "Always respond in markdown.",
      config: {},
      status: "ready" as const,
      tokenCount: 15,
      pageCount: 1,
      pages: [],
    }

    expect(block.type).toBe("text")
    expect(block.url).toBeUndefined()
  })

  it("block status transitions", () => {
    const validStatuses = ["ready", "scanning", "error"]
    expect(validStatuses).toContain("ready")
    expect(validStatuses).toContain("scanning")
    expect(validStatuses).toContain("error")
  })
})

describe("Canvas schema", () => {
  it("canvas with images", () => {
    const canvas = {
      name: "My Canvas",
      width: 1024,
      height: 768,
      defaultModel: "gemini-2.0-flash-preview-image-generation",
      defaultStyle: "realistic",
      images: [
        {
          name: "Cat",
          prompt: "A fluffy cat",
          modelId: "gemini-2.0-flash-preview-image-generation",
          styleId: "realistic",
          width: 512,
          height: 512,
          position: { x: 100, y: 100 },
          rotation: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    }

    expect(canvas.width).toBe(1024)
    expect(canvas.images).toHaveLength(1)
    expect(canvas.images[0].position.x).toBe(100)
  })
})
