import { Link, useLocation } from "@tanstack/react-router"
import {
  ArrowLeft,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
  CreditCard,
} from "lucide-react"

interface UserProfile {
  name?: string | null
  email?: string | null
  image?: string | null
}

interface SettingsPanelProps {
  profile?: UserProfile | null | undefined
}

type NavItem = {
  path: string
  label: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  {
    path: "/settings/preferences",
    label: "Preferences",
    icon: SlidersHorizontal,
  },
  { path: "/settings/profile", label: "Profile", icon: UserRound },
  { path: "/settings/billing", label: "Billing", icon: CreditCard },
]

export default function SettingsPanel({ profile }: SettingsPanelProps) {
  const location = useLocation()

  return (
    <aside className="shrink-0 bg-transparent border border-white/5 rounded-2xl h-[calc(100vh-6em)] sticky top-6 px-2 py-4 items-start flex flex-col gap-6">
      <div className="flex flex-col gap-2 items-start w-full">
        <div className="space-y-2">
          <Link
            to="/"
            className="inline-flex items-start gap-2 px-6 py-2.5 text-white/80 hover:text-white text-sm transition-colors w-full justify-start"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to app</span>
          </Link>
          {(profile ? navItems : navItems.slice(0, 1)).map(
            ({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                className={`w-full justify-start hover:cursor-pointer flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm transition-colors ${
                  isActive
                    ? "bg-white/4 text-white"
                    : "text-white/80 hover:bg-white/2 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
      </div>

      {!profile ? (
        <div className="mt-auto space-y-3">
          <Link
            to="/auth"
            className="block w-full text-center text-sm font-medium text-white bg-teal-600 hover:bg-teal-500 transition-colors rounded-lg py-2"
          >
            Sign in
          </Link>
        </div>
      ) : null}
    </aside>
  )
}
