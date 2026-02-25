import {
  action,
  atom,
  computed,
  effect,
  reatomBoolean,
  withConnectHook,
  wrap,
} from '@/shared/reatom/core'
import { authClient } from '@/lib/auth-client'

const JAZZ_ACCOUNT_ID_KEY = 'jazzAccountId'
const JAZZ_SECRET_KEY = 'jazz-logged-in-secret'

export const jazzMountedAtom = reatomBoolean(false, 'jazzMounted')
export const jazzHasIndexedDbAtom = reatomBoolean(true, 'jazzHasIndexedDb')
export const jazzIsDesktopAtom = reatomBoolean(false, 'jazzIsDesktop')

const checkIndexedDb = action(async () => {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    jazzHasIndexedDbAtom.set(false)
    return
  }

  try {
    const ok = await wrap(new Promise<boolean>((resolve) => {
      const request = indexedDB.open('_jazz_test', 1)
      request.onsuccess = () => {
        request.result.close()
        indexedDB.deleteDatabase('_jazz_test')
        resolve(true)
      }
      request.onerror = () => resolve(false)
    }))
    jazzHasIndexedDbAtom.set(ok)
  } catch {
    jazzHasIndexedDbAtom.set(false)
  }
}, 'checkIndexedDb')

jazzMountedAtom.extend(withConnectHook(() => {
  if (typeof window === 'undefined') return
  jazzMountedAtom.set(true)
  jazzIsDesktopAtom.set(!!window.electron?.ai)
  checkIndexedDb()
}))

export const jazzReadyAtom = computed(() => {
  return jazzMountedAtom() && jazzHasIndexedDbAtom() && !jazzIsDesktopAtom()
}, 'jazzReady')

export const jazzSessionAtom = atom<any | null>(null, 'jazzSession')
export const fetchJazzSession = action(async () => {
  try {
    const result = await wrap(authClient.getSession())
    jazzSessionAtom.set(result.data)
  } catch {
    jazzSessionAtom.set(null)
  }
}, 'fetchJazzSession')

jazzSessionAtom.extend(withConnectHook(fetchJazzSession))

export const jazzAccountAtom = atom<any | null>(null, 'jazzAccount')
export const jazzIsAuthenticatedAtom = reatomBoolean(false, 'jazzIsAuthenticated')

export const setJazzSnapshot = action(
  (payload: { account: any; isAuthenticated: boolean }) => {
    const nextAccount = payload.account ?? null
    if (jazzAccountAtom() !== nextAccount) {
      jazzAccountAtom.set(nextAccount)
    }
    if (jazzIsAuthenticatedAtom() !== payload.isAuthenticated) {
      jazzIsAuthenticatedAtom.set(payload.isAuthenticated)
    }
  },
  'setJazzSnapshot',
)

export const jazzAccountIdAtom = computed(() => {
  const account = jazzAccountAtom()
  return account?.$isLoaded ? account.$jazz.id : null
}, 'jazzAccountId')

export const jazzProfileAtom = computed(() => {
  const account = jazzAccountAtom()
  return account?.$isLoaded ? account.profile : null
}, 'jazzProfile')

export const jazzIsAuthenticatedEffectiveAtom = computed(() => {
  return Boolean(jazzSessionAtom()) || jazzIsAuthenticatedAtom()
}, 'jazzIsAuthenticatedEffective')

effect(() => {
  const accountId = jazzAccountIdAtom()
  const isAuthenticated = jazzIsAuthenticatedEffectiveAtom()
  if (typeof window === 'undefined') return

  if (accountId && isAuthenticated) {
    window.localStorage.setItem(JAZZ_ACCOUNT_ID_KEY, accountId)
  } else {
    window.localStorage.removeItem(JAZZ_ACCOUNT_ID_KEY)
  }
}, 'syncJazzAccountId')

effect(() => {
  const session = jazzSessionAtom()
  const profile = jazzProfileAtom()
  const account = jazzAccountAtom()

  if (!session?.user?.email || !profile || !account?.$isLoaded) return

  try {
    if (!profile.email && session.user.email) {
      profile.$jazz.set('email', session.user.email)
    }
    if (profile.name === 'Anonymous' && session.user.name) {
      profile.$jazz.set('name', session.user.name)
    }
  } catch (error) {
    console.warn('[jazz] failed to sync profile from session', error)
  }
}, 'syncJazzProfile')

effect(() => {
  const session = jazzSessionAtom()
  if (typeof window === 'undefined') return
  if (!session?.jazzAuth) return

  if (window.localStorage.getItem(JAZZ_SECRET_KEY)) return

  try {
    window.localStorage.setItem(JAZZ_SECRET_KEY, JSON.stringify(session.jazzAuth))
  } catch (error) {
    console.warn('[jazz] failed to persist jazz auth', error)
  }
}, 'persistJazzSecret')
