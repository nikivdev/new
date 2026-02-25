import { createFileRoute, Outlet } from "@tanstack/react-router"
import { reatomComponent } from "@reatom/react"
import SettingsPanel from "@/components/Settings-panel"
import { useJazzAuth } from "@/lib/jazz/hooks"

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
  ssr: false,
})

const SettingsLayout = reatomComponent(() => {
  const { isAuthenticated, profile, account } = useJazzAuth()

  if (isAuthenticated && !account?.$isLoaded) {
    return null
  }

  return (
    <div className="min-h-screen max-w-5xl mx-auto text-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 flex gap-6">
        <SettingsPanel profile={profile} />
        <div className="flex-1 space-y-12 overflow-auto pr-1 pb-12">
          <Outlet />
        </div>
      </div>
    </div>
  )
})
