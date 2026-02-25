import { action, atom, computed, withLocalStorage } from '@/shared/reatom/core'

const GUEST_USAGE_KEY = 'gen_guest_usage'
const GUEST_FREE_LIMIT = 5

export type GuestUsage = {
  count: number
  lastReset: string
}

const defaultUsage: GuestUsage = {
  count: 0,
  lastReset: new Date().toISOString(),
}

export const guestUsageAtom = atom<GuestUsage>(defaultUsage, 'guestUsage').extend(
  withLocalStorage({
    key: GUEST_USAGE_KEY,
    toSnapshot: (value) => value,
    fromSnapshot: (raw) => {
      if (!raw || typeof raw !== 'object') return defaultUsage
      const record = raw as Partial<GuestUsage>
      return {
        count: typeof record.count === 'number' ? record.count : 0,
        lastReset: typeof record.lastReset === 'string' ? record.lastReset : defaultUsage.lastReset,
      }
    },
  }),
)

export const guestUsageRemainingAtom = computed(() => {
  const used = guestUsageAtom().count
  return Math.max(0, GUEST_FREE_LIMIT - used)
}, 'guestUsageRemaining')

export const guestUsageCanUseAtom = computed(() => guestUsageRemainingAtom() > 0, 'guestUsageCanUse')

export const incrementGuestUsage = action(() => {
  guestUsageAtom.set((prev) => ({
    count: prev.count + 1,
    lastReset: prev.lastReset,
  }))
}, 'incrementGuestUsage')

export const resetGuestUsage = action(() => {
  guestUsageAtom.set({
    count: 0,
    lastReset: new Date().toISOString(),
  })
}, 'resetGuestUsage')

export const getGuestUsageSnapshot = () => ({
  used: guestUsageAtom().count,
  remaining: guestUsageRemainingAtom(),
  limit: GUEST_FREE_LIMIT,
  canUse: guestUsageCanUseAtom(),
})
