"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useAccount, useIsAuthenticated, useLogOut } from "jazz-tools/react"
import { reatomComponent } from "@reatom/react"
import { GenAccount } from "./schema"
import { authClient } from "@/lib/auth-client"
import { useJazzReady } from "./provider"
import {
  jazzAccountIdAtom,
  jazzIsAuthenticatedEffectiveAtom,
  jazzProfileAtom,
  jazzSessionAtom,
  setJazzSnapshot,
} from "./model"

type JazzAuthState = {
  isAuthenticated: boolean
  account: any
  accountId: string | null
  profile: any
  logOut: () => void
  session: any
}

const defaultAuthState: JazzAuthState = {
  isAuthenticated: false,
  account: null,
  accountId: null,
  profile: null,
  logOut: () => {},
  session: null,
}

const JazzAuthContext = createContext<JazzAuthState>(defaultAuthState)

const JazzAuthProviderInner = reatomComponent(({ children }: { children: ReactNode }) => {
  const session = jazzSessionAtom()

  const isJazzAuthenticated = useIsAuthenticated()
  const account = useAccount(GenAccount, { resolve: { profile: true } })
  const jazzLogOut = useLogOut()

  setJazzSnapshot({
    account,
    isAuthenticated: isJazzAuthenticated,
  })

  const accountId = jazzAccountIdAtom()
  const profile = jazzProfileAtom()
  const isAuthenticated = jazzIsAuthenticatedEffectiveAtom()

  const handleLogOut = async () => {
    await authClient.signOut()
    jazzLogOut()
    window.location.href = "/"
  }

  return (
    <JazzAuthContext.Provider
      value={{
        isAuthenticated,
        account,
        accountId,
        profile,
        logOut: handleLogOut,
        session,
      }}
    >
      {children}
    </JazzAuthContext.Provider>
  )
})

export function JazzAuthProvider({ children }: { children: ReactNode }) {
  const isJazzReady = useJazzReady()

  if (!isJazzReady) {
    return (
      <JazzAuthContext.Provider value={defaultAuthState}>
        {children}
      </JazzAuthContext.Provider>
    )
  }

  return <JazzAuthProviderInner>{children}</JazzAuthProviderInner>
}

export function useJazzAuth() {
  return useContext(JazzAuthContext)
}
