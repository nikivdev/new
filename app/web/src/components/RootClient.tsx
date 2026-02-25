"use client"

import { Outlet, useNavigate } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { useEffect } from "react"
import { context } from "@/shared/reatom/core"
import { reatomComponent, reatomContext } from "@reatom/react"
import { BillingProvider } from "@/components/BillingProvider"
import { JazzAppProvider } from "@/lib/jazz/provider"
import { JazzAuthProvider } from "@/lib/jazz/hooks"
import { devtoolsVisibleAtom } from "@/shared/reatom/devtools"
import { appThemeAtom } from "@/shared/theme"

const appContext = context.start()

const DevtoolsPanel = reatomComponent(() => {
  if (!devtoolsVisibleAtom()) return null
  return <TanStackRouterDevtools />
})

const ThemeInitializer = reatomComponent(() => {
  appThemeAtom()
  return null
})

const SettingsShortcutListener = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key === ",") {
        event.preventDefault()
        console.info("[shortcuts] renderer cmd+, detected")
        queueMicrotask(() => navigate({ to: "/settings/preferences" }))
        return
      }

      if (event.key.toLowerCase() === "n" && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent("app:new-chat"))
        return
      }

      if (event.key.toLowerCase() === "e" && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent("app:toggle-sidebar"))
      }
    }
    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
    }
  }, [navigate])

  useEffect(() => {
    if (!window.electron?.app?.onOpenSettings) return
    return window.electron.app.onOpenSettings(() => {
      console.info("[shortcuts] ipc open settings")
      queueMicrotask(() => navigate({ to: "/settings/preferences" }))
    })
  }, [navigate])

  useEffect(() => {
    if (!window.electron?.ai?.onNewChat) return
    return window.electron.ai.onNewChat(() => {
      window.dispatchEvent(new CustomEvent("app:new-chat"))
    })
  }, [])

  useEffect(() => {
    if (!window.electron?.ai?.onToggleSidebar) return
    return window.electron.ai.onToggleSidebar(() => {
      window.dispatchEvent(new CustomEvent("app:toggle-sidebar"))
    })
  }, [])

  useEffect(() => {
    if (!window.electron?.ai?.onCommandPalette) return
    return window.electron.ai.onCommandPalette(() => {
      window.dispatchEvent(new CustomEvent("app:command-palette"))
    })
  }, [])

  return null
}

export function RootClient() {
  return (
    <reatomContext.Provider value={appContext}>
      <JazzAppProvider>
        <JazzAuthProvider>
          <BillingProvider>
            <Outlet />
            <ThemeInitializer />
            <SettingsShortcutListener />
            <DevtoolsPanel />
          </BillingProvider>
        </JazzAuthProvider>
      </JazzAppProvider>
    </reatomContext.Provider>
  )
}
