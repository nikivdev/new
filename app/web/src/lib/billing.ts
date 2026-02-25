import { getJazzAccountId } from "@/lib/jazz/server-auth"
import { withJazzServerAccount } from "@/lib/jazz/server-store"

// ===========================================
// Gen Pro - $8/month
// ===========================================
// - 1,000 standard messages per month
// - 100 premium messages per month
// - 300 website scrapes per month
// ===========================================

// Usage limits - Free tier
const GUEST_FREE_REQUESTS = 5
const AUTH_FREE_REQUESTS_DAILY = 20
const TRIAL_PREMIUM_TOKENS = 2
const TRIAL_PERIOD_MS = 1000 * 60 * 60 * 24 * 365 * 5 // 5 years

type UsageSnapshot = {
  used: number
  limit: number
  remaining: number
}

const toUsageSnapshot = (limit: number, used: number): UsageSnapshot => ({
  used: Math.min(limit, used),
  limit,
  remaining: Math.max(0, limit - used),
})

// Premium model IDs - these use premium meter
const PREMIUM_MODELS = [
  "anthropic/claude-sonnet-4",
  "anthropic/claude-opus-4",
  "openai/gpt-4o",
] as const

export type MeterType = "standard" | "premium" | "scrapes"

/**
 * Determine which meter to use based on model ID
 */
export function getMeterForModel(modelId: string): MeterType {
  if (PREMIUM_MODELS.includes(modelId as (typeof PREMIUM_MODELS)[number])) {
    return "premium"
  }
  return "standard"
}

type UsageCheckResult = {
  allowed: boolean
  remaining: number
  limit: number
  topupRemaining?: number
  reason?:
    | "guest_limit"
    | "daily_limit"
    | "subscription_limit"
    | "no_subscription"
    | "trial_limit"
  isGuest: boolean
  isPaid: boolean
  meter?: MeterType
}

const findBillingUser = (account: any, userId: string) =>
  account.root.billingUsers.find((bu: any) => bu?.userId === userId)

const findOrCreateBillingUser = async (account: any, userId: string) => {
  let billingUser = findBillingUser(account, userId)
  if (!billingUser) {
    const { BillingUser, BillingUsageRecordList } = await import("@/lib/jazz/schema")
    const now = Date.now()
    billingUser = BillingUser.create(
      {
        userId,
        polarCustomerId: undefined,
        polarSubscriptionId: undefined,
        polarProductId: undefined,
        subscriptionStatus: undefined,
        currentPeriodStart: undefined,
        currentPeriodEnd: undefined,
        cancelAtPeriodEnd: undefined,
        usageRecords: BillingUsageRecordList.create([], { owner: account }),
        topupStandardCredits: 0,
        topupPremiumCredits: 0,
        topupScrapesCredits: 0,
        createdAt: now,
        updatedAt: now,
      },
      { owner: account }
    )
    account.root.billingUsers.$jazz.push(billingUser)
  }
  return billingUser
}

const getCurrentUsageRecord = (billingUser: any) => {
  const now = Date.now()
  if (!billingUser.usageRecords) return null
  const records = [...billingUser.usageRecords].filter(
    (record: any) => record && record.$isLoaded,
  )

  if (billingUser.currentPeriodStart && billingUser.currentPeriodEnd) {
    const match = records.find(
      (record: any) =>
        record.periodStart === billingUser.currentPeriodStart &&
        record.periodEnd === billingUser.currentPeriodEnd,
    )
    if (match) return match
  }

  return records.find(
    (record: any) =>
      record.periodStart <= now && record.periodEnd >= now,
  ) ?? null
}

const getOrCreateTrialRecord = async (account: any, billingUser: any) => {
  // Look for existing trial record (standard_limit=0, premium_limit=TRIAL)
  const existing = [...(billingUser.usageRecords ?? [])].find(
    (record: any) =>
      record &&
      record.$isLoaded &&
      record.standardLimit === 0 &&
      record.premiumLimit === TRIAL_PREMIUM_TOKENS
  )
  if (existing) return existing

  const { BillingUsageRecord } = await import("@/lib/jazz/schema")
  const now = Date.now()
  const trialRecord = BillingUsageRecord.create(
    {
      standardUsed: 0,
      standardLimit: 0,
      premiumUsed: 0,
      premiumLimit: TRIAL_PREMIUM_TOKENS,
      scrapesUsed: 0,
      scrapesLimit: 0,
      periodStart: now,
      periodEnd: now + TRIAL_PERIOD_MS,
      createdAt: now,
      updatedAt: now,
    },
    { owner: account }
  )
  billingUser.usageRecords.$jazz.push(trialRecord)
  return trialRecord
}

export async function getPremiumTrialUsage(userId: string): Promise<UsageSnapshot> {
  return withJazzServerAccount(async (account) => {
    const billingUser = await findOrCreateBillingUser(account, userId)
    const trialRecord = await getOrCreateTrialRecord(account, billingUser)
    return toUsageSnapshot(trialRecord.premiumLimit, trialRecord.premiumUsed)
  })
}

/**
 * Check if user can make an AI request based on their billing status.
 */
export async function checkUsageAllowed(
  request: Request,
  accountId?: string | null,
  meter: MeterType = "standard"
): Promise<UsageCheckResult> {
  const resolvedAccountId = accountId ?? getJazzAccountId(request)

  // Guest user - check local/cookie based limit
  if (!resolvedAccountId) {
    return {
      allowed: true, // Client will enforce limit
      remaining: GUEST_FREE_REQUESTS,
      limit: GUEST_FREE_REQUESTS,
      isGuest: true,
      isPaid: false,
    }
  }

  try {
    return await withJazzServerAccount(async (account) => {
      const billingUser = await findOrCreateBillingUser(account, resolvedAccountId)

      // Check for active subscription
      if (billingUser.subscriptionStatus === "active") {
        const usage = getCurrentUsageRecord(billingUser)

        if (!usage) {
          // No usage record yet - they have full limits
          const limit = meter === "standard" ? 1000 : meter === "premium" ? 100 : 300
          return {
            allowed: true,
            remaining: limit,
            limit,
            isGuest: false,
            isPaid: true,
            meter,
          }
        }

        let used: number
        let limit: number

        switch (meter) {
          case "premium":
            used = usage.premiumUsed
            limit = usage.premiumLimit
            break
          case "scrapes":
            used = usage.scrapesUsed
            limit = usage.scrapesLimit
            break
          default:
            used = usage.standardUsed
            limit = usage.standardLimit
        }

        const subscriptionRemaining = Math.max(0, limit - used)

        // Check topup credits
        const topupRemaining =
          meter === "premium"
            ? billingUser.topupPremiumCredits
            : meter === "scrapes"
              ? billingUser.topupScrapesCredits
              : billingUser.topupStandardCredits

        const totalRemaining = subscriptionRemaining + topupRemaining

        return {
          allowed: totalRemaining > 0,
          remaining: subscriptionRemaining,
          limit,
          topupRemaining,
          reason: totalRemaining <= 0 ? "subscription_limit" : undefined,
          isGuest: false,
          isPaid: true,
          meter,
        }
      }

      if (meter === "premium") {
        const trialRecord = await getOrCreateTrialRecord(account, billingUser)
        const trialUsage = toUsageSnapshot(trialRecord.premiumLimit, trialRecord.premiumUsed)
        return {
          allowed: trialUsage.remaining > 0,
          remaining: trialUsage.remaining,
          limit: trialUsage.limit,
          reason: trialUsage.remaining > 0 ? undefined : "trial_limit",
          isGuest: false,
          isPaid: false,
          meter,
        }
      }

      // Free authenticated user - allow with daily limit (tracked client-side for simplicity)
      return {
        allowed: true,
        remaining: AUTH_FREE_REQUESTS_DAILY,
        limit: AUTH_FREE_REQUESTS_DAILY,
        isGuest: false,
        isPaid: false,
      }
    })
  } catch (error) {
    console.error("[billing] Error checking usage:", error)
    // On error, allow with daily limit
    return {
      allowed: true,
      remaining: AUTH_FREE_REQUESTS_DAILY,
      limit: AUTH_FREE_REQUESTS_DAILY,
      isGuest: false,
      isPaid: false,
    }
  }
}

/**
 * Record a usage event after AI request completes.
 */
export async function recordUsage(
  request: Request,
  amount: number = 1,
  _idempotencyKey?: string,
  meter: MeterType = "standard",
  accountId?: string | null
): Promise<void> {
  const resolvedAccountId = accountId ?? getJazzAccountId(request)

  if (!resolvedAccountId) {
    // Guest users don't record to database
    return
  }

  try {
    await withJazzServerAccount(async (account) => {
      const billingUser = await findOrCreateBillingUser(account, resolvedAccountId)

      if (billingUser.subscriptionStatus !== "active") {
        if (meter === "premium") {
          const trialRecord = await getOrCreateTrialRecord(account, billingUser)
          const nextUsed = Math.min(trialRecord.premiumLimit, trialRecord.premiumUsed + amount)
          trialRecord.$jazz.set("premiumUsed", nextUsed)
          trialRecord.$jazz.set("updatedAt", Date.now())
        } else {
          console.log("[billing] Free user, not recording usage")
        }
        return
      }

      const now = Date.now()
      let usage = getCurrentUsageRecord(billingUser)

      if (usage) {
        // Check if subscription has remaining quota
        let used: number
        let limit: number

        switch (meter) {
          case "premium":
            used = usage.premiumUsed
            limit = usage.premiumLimit
            break
          case "scrapes":
            used = usage.scrapesUsed
            limit = usage.scrapesLimit
            break
          default:
            used = usage.standardUsed
            limit = usage.standardLimit
        }

        const subscriptionRemaining = Math.max(0, limit - used)

        if (subscriptionRemaining >= amount) {
          // Consume from subscription
          switch (meter) {
            case "premium":
              usage.$jazz.set("premiumUsed", usage.premiumUsed + amount)
              break
            case "scrapes":
              usage.$jazz.set("scrapesUsed", usage.scrapesUsed + amount)
              break
            default:
              usage.$jazz.set("standardUsed", usage.standardUsed + amount)
          }
          usage.$jazz.set("updatedAt", now)
          console.log(`[billing] Recorded ${amount} ${meter} from subscription`)
        } else {
          // Subscription exhausted, try topup credits
          const topupField =
            meter === "premium"
              ? "topupPremiumCredits"
              : meter === "scrapes"
                ? "topupScrapesCredits"
                : "topupStandardCredits"
          const available = billingUser[topupField]
          if (available >= amount) {
            billingUser.$jazz.set(topupField, available - amount)
            billingUser.$jazz.set("updatedAt", now)
            console.log(`[billing] Consumed ${amount} topup ${meter} credits (${available - amount} remaining)`)
          } else {
            console.log(`[billing] No topup credits available for ${meter}`)
          }
        }
      } else {
        // Create new usage record with subscription period
        const { BillingUsageRecord } = await import("@/lib/jazz/schema")
        const periodStart = billingUser.currentPeriodStart ?? now
        const periodEnd = billingUser.currentPeriodEnd ?? now + 30 * 24 * 60 * 60 * 1000

        const newRecord = BillingUsageRecord.create(
          {
            standardUsed: meter === "standard" ? amount : 0,
            standardLimit: 1000,
            premiumUsed: meter === "premium" ? amount : 0,
            premiumLimit: 100,
            scrapesUsed: meter === "scrapes" ? amount : 0,
            scrapesLimit: 300,
            periodStart,
            periodEnd,
            createdAt: now,
            updatedAt: now,
          },
          { owner: account }
        )
        billingUser.usageRecords.$jazz.push(newRecord)
        console.log(`[billing] Created usage record with ${amount} ${meter}`)
      }
    })
  } catch (error) {
    console.error("[billing] Error recording usage:", error)
    // Don't throw - usage recording should not block the request
  }
}

/**
 * Get billing summary for display in UI.
 */
export async function getBillingSummary(request: Request) {
  const accountId = getJazzAccountId(request)

  if (!accountId) {
    return {
      isGuest: true,
      isPaid: false,
      freeLimit: GUEST_FREE_REQUESTS,
      planName: "Guest",
    }
  }

  try {
    return await withJazzServerAccount(async (account) => {
      const billingUser = await findOrCreateBillingUser(account, accountId)

      if (billingUser.subscriptionStatus === "active") {
        const usage = getCurrentUsageRecord(billingUser)

        return {
          isGuest: false,
          isPaid: true,
          planName: "Gen Pro",
          usage: {
            standard: {
              used: usage?.standardUsed ?? 0,
              limit: usage?.standardLimit ?? 1000,
              remaining: (usage?.standardLimit ?? 1000) - (usage?.standardUsed ?? 0),
            },
            premium: {
              used: usage?.premiumUsed ?? 0,
              limit: usage?.premiumLimit ?? 100,
              remaining: (usage?.premiumLimit ?? 100) - (usage?.premiumUsed ?? 0),
            },
            scrapes: {
              used: usage?.scrapesUsed ?? 0,
              limit: usage?.scrapesLimit ?? 300,
              remaining: (usage?.scrapesLimit ?? 300) - (usage?.scrapesUsed ?? 0),
            },
          },
          topupCredits: {
            standard: billingUser.topupStandardCredits,
            premium: billingUser.topupPremiumCredits,
            scrapes: billingUser.topupScrapesCredits,
          },
          currentPeriodEnd: billingUser.currentPeriodEnd
            ? new Date(billingUser.currentPeriodEnd)
            : undefined,
          cancelAtPeriodEnd: billingUser.cancelAtPeriodEnd,
        }
      }

      const trialRecord = await getOrCreateTrialRecord(account, billingUser)
      const trialUsage = toUsageSnapshot(trialRecord.premiumLimit, trialRecord.premiumUsed)

      return {
        isGuest: false,
        isPaid: false,
        freeLimit: AUTH_FREE_REQUESTS_DAILY,
        planName: "Free",
        usage: {
          premium: trialUsage,
        },
      }
    })
  } catch (error) {
    console.error("[billing] Error getting summary:", error)
    return {
      isGuest: false,
      isPaid: false,
      freeLimit: AUTH_FREE_REQUESTS_DAILY,
      planName: "Free",
    }
  }
}

// Helper for Polar webhooks to update billing user
export async function updateBillingUserFromPolar(params: {
  userId: string
  polarCustomerId?: string
  polarSubscriptionId?: string
  polarProductId?: string
  subscriptionStatus?: string
  currentPeriodStart?: number
  currentPeriodEnd?: number
  cancelAtPeriodEnd?: boolean
}) {
  return withJazzServerAccount(async (account) => {
    const billingUser = await findOrCreateBillingUser(account, params.userId)
    const now = Date.now()

    if (params.polarCustomerId !== undefined) {
      billingUser.$jazz.set("polarCustomerId", params.polarCustomerId)
    }
    if (params.polarSubscriptionId !== undefined) {
      billingUser.$jazz.set("polarSubscriptionId", params.polarSubscriptionId)
    }
    if (params.polarProductId !== undefined) {
      billingUser.$jazz.set("polarProductId", params.polarProductId)
    }
    if (params.subscriptionStatus !== undefined) {
      billingUser.$jazz.set("subscriptionStatus", params.subscriptionStatus)
    }
    if (params.currentPeriodStart !== undefined) {
      billingUser.$jazz.set("currentPeriodStart", params.currentPeriodStart)
    }
    if (params.currentPeriodEnd !== undefined) {
      billingUser.$jazz.set("currentPeriodEnd", params.currentPeriodEnd)
    }
    if (params.cancelAtPeriodEnd !== undefined) {
      billingUser.$jazz.set("cancelAtPeriodEnd", params.cancelAtPeriodEnd)
    }
    billingUser.$jazz.set("updatedAt", now)

    // Create usage record for new subscription period if needed
    if (
      params.subscriptionStatus === "active" &&
      params.currentPeriodStart &&
      params.currentPeriodEnd
    ) {
      const existingUsage = [...(billingUser.usageRecords ?? [])].find(
        (record: any) =>
          record &&
          record.$isLoaded &&
          record.periodStart === params.currentPeriodStart
      )

      if (!existingUsage) {
        const { BillingUsageRecord } = await import("@/lib/jazz/schema")
        const newRecord = BillingUsageRecord.create(
          {
            standardUsed: 0,
            standardLimit: 1000,
            premiumUsed: 0,
            premiumLimit: 100,
            scrapesUsed: 0,
            scrapesLimit: 300,
            periodStart: params.currentPeriodStart,
            periodEnd: params.currentPeriodEnd,
            createdAt: now,
            updatedAt: now,
          },
          { owner: account }
        )
        billingUser.usageRecords.$jazz.push(newRecord)
        console.log(`[billing] Created usage record for new billing period`)
      }
    }

    return billingUser
  })
}

// Helper to add refill credits
export async function addRefillCredits(userId: string) {
  const REFILL_CREDITS = {
    standard: 1000,
    premium: 100,
    scrapes: 300,
  }

  return withJazzServerAccount(async (account) => {
    const billingUser = await findOrCreateBillingUser(account, userId)
    const now = Date.now()

    billingUser.$jazz.set(
      "topupStandardCredits",
      billingUser.topupStandardCredits + REFILL_CREDITS.standard
    )
    billingUser.$jazz.set(
      "topupPremiumCredits",
      billingUser.topupPremiumCredits + REFILL_CREDITS.premium
    )
    billingUser.$jazz.set(
      "topupScrapesCredits",
      billingUser.topupScrapesCredits + REFILL_CREDITS.scrapes
    )
    billingUser.$jazz.set("updatedAt", now)

    console.log(
      `[billing] Refill credits added for user ${userId}: +${REFILL_CREDITS.standard} standard, +${REFILL_CREDITS.premium} premium, +${REFILL_CREDITS.scrapes} scrapes`
    )
  })
}

// Helper to find user by Polar customer ID
export async function findUserIdByPolarCustomerId(
  polarCustomerId: string
): Promise<string | null> {
  return withJazzServerAccount(async (account) => {
    const billingUser = account.root.billingUsers.find(
      (bu: any) => bu?.polarCustomerId === polarCustomerId
    )
    return billingUser?.userId ?? null
  })
}
