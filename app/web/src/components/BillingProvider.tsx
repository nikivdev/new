import {
  createContext,
  useContext,
  type ReactNode,
} from "react"
import {
  action,
  atom,
  effect,
  reatomBoolean,
} from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"
import { useJazzAuth } from "@/lib/jazz/hooks"
import { apiFetch, apiPost } from "@/lib/api"

type UsageSnapshot = {
  used: number
  limit: number
  remaining: number
}

type BillingUsage = {
  standard?: UsageSnapshot
  premium?: UsageSnapshot
  scrapes?: UsageSnapshot
}

type TopupCredits = {
  standard: number
  premium: number
  scrapes: number
}

type BillingStatus = {
  isGuest: boolean
  isPaid: boolean
  planName: string
  freeLimit?: number
  limit?: number
  used?: number
  remaining?: number
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
  isLoading: boolean
  error?: string
  usage?: BillingUsage
  topupCredits?: TopupCredits
}

type BillingContextValue = BillingStatus & {
  refresh: () => Promise<void>
  openCheckout: () => Promise<void>
  openPortal: () => Promise<void>
  openRefillCheckout: () => Promise<void>
}

const BillingContext = createContext<BillingContextValue | null>(null)

export function useBilling() {
  const context = useContext(BillingContext)
  if (!context) {
    return {
      isGuest: true,
      isPaid: false,
      planName: "Guest",
      freeLimit: 5,
      isLoading: false,
      usage: undefined,
      topupCredits: undefined,
      refresh: async () => {},
      openCheckout: async () => {},
      openPortal: async () => {},
      openRefillCheckout: async () => {},
    } as BillingContextValue
  }
  return context
}

type BillingProviderProps = {
  children: ReactNode
}

const billingAuthAtom = reatomBoolean(false, 'billingAuth')
const billingAccountIdAtom = atom<string | null>(null, 'billingAccountId')

const initialStatus: BillingStatus = {
  isGuest: true,
  isPaid: false,
  planName: 'Guest',
  freeLimit: 5,
  isLoading: true,
  usage: undefined,
  topupCredits: undefined,
}

const billingStatusAtom = atom<BillingStatus>(initialStatus, 'billingStatus')

const fetchBillingStatus = action(async () => {
  const accountId = billingAccountIdAtom()
  if (!accountId) {
    billingStatusAtom.set((prev) => ({ ...prev, isLoading: false }))
    return
  }
  try {
    const data = await apiFetch<Partial<BillingStatus>>('/api/polar/billing')
    const usage = data.usage
    billingStatusAtom.set({
      isGuest: data.isGuest ?? true,
      isPaid: data.isPaid ?? false,
      planName: data.planName ?? 'Guest',
      freeLimit: data.freeLimit,
      limit: usage?.standard?.limit ?? data.limit,
      used: usage?.standard?.used ?? data.used,
      remaining: usage?.standard?.remaining ?? data.remaining,
      usage,
      topupCredits: data.topupCredits,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd,
      isLoading: false,
    })
  } catch (error) {
    console.error('[billing] Failed to fetch status:', error)
    billingStatusAtom.set((prev) => ({
      ...prev,
      isLoading: false,
      error: 'Failed to load billing status',
    }))
  }
}, 'fetchBillingStatus')

effect(() => {
  if (!billingAuthAtom()) {
    billingStatusAtom.set({
      isGuest: true,
      isPaid: false,
      planName: 'Guest',
      freeLimit: 5,
      isLoading: false,
      usage: undefined,
      topupCredits: undefined,
    })
    return
  }

  fetchBillingStatus()
}, 'billingAuthEffect')

const openCheckout = action(async () => {
  const accountId = billingAccountIdAtom()
  if (!accountId) return
  try {
    const data = await apiPost<{ url?: string }>('/api/polar/checkout', {})
    if (data.url) {
      window.location.href = data.url
    }
  } catch (error) {
    console.error('[billing] Checkout error:', error)
  }
}, 'openCheckout')

const openPortal = action(async () => {
  const accountId = billingAccountIdAtom()
  if (!accountId) return
  try {
    const data = await apiPost<{ url?: string }>('/api/polar/portal', {})
    if (data.url) {
      window.location.href = data.url
    }
  } catch (error) {
    console.error('[billing] Portal error:', error)
  }
}, 'openPortal')

const openRefillCheckout = action(async () => {
  const accountId = billingAccountIdAtom()
  if (!accountId) return
  try {
    const data = await apiPost<{ url?: string }>('/api/polar/refill-checkout', {})
    if (data.url) {
      window.location.href = data.url
    }
  } catch (error) {
    console.error('[billing] Refill checkout error:', error)
  }
}, 'openRefillCheckout')

export const BillingProvider = reatomComponent(({ children }: BillingProviderProps) => {
  const { isAuthenticated, accountId } = useJazzAuth()

  billingAuthAtom.set(isAuthenticated)
  billingAccountIdAtom.set(accountId ?? null)

  const status = billingStatusAtom()

  const value: BillingContextValue = {
    ...status,
    refresh: fetchBillingStatus,
    openCheckout,
    openPortal,
    openRefillCheckout,
  }

  return (
    <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
  )
})
