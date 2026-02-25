"use client"

import { createContext, useContext } from "react"
import { JazzReactProvider } from "jazz-tools/react"
import { AuthProvider } from "jazz-tools/better-auth/auth/react"
import { reatomComponent } from "@reatom/react"
import { GenAccount } from "./schema"
import { authClient } from "@/lib/auth-client"
import { jazzReadyAtom } from "./model"

// Jazz Cloud sync peer
const JAZZ_ENV = (
  import.meta as {
    env?: { VITE_JAZZ_SYNC_SERVER?: string; VITE_JAZZ_API_KEY?: string }
  }
).env

const JAZZ_SYNC_SERVER =
  JAZZ_ENV?.VITE_JAZZ_SYNC_SERVER ??
  `wss://cloud.jazz.tools/?key=${JAZZ_ENV?.VITE_JAZZ_API_KEY ?? "starter@local"}`

const JazzReadyContext = createContext(false)
export const useJazzReady = () => useContext(JazzReadyContext)

export const JazzAppProvider = reatomComponent(({ children }: { children: React.ReactNode }) => {
  const isReady = jazzReadyAtom()

  if (!isReady) {
    return (
      <JazzReadyContext.Provider value={false}>
        {children}
      </JazzReadyContext.Provider>
    )
  }

  return (
    <JazzReadyContext.Provider value={true}>
      <JazzReactProvider
        AccountSchema={GenAccount}
        sync={{ peer: JAZZ_SYNC_SERVER }}
      >
        <AuthProvider betterAuthClient={authClient}>
          {children}
        </AuthProvider>
      </JazzReactProvider>
    </JazzReadyContext.Provider>
  )
})
