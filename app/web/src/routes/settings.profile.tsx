import { createFileRoute } from "@tanstack/react-router"
import { LogOut, MessageCircle, MessageSquare } from "lucide-react"
import { reatomBoolean } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"
import { SectionHeader, SettingCard } from "@/lib/settings-components"
import { useJazzAuth } from "@/lib/jazz/hooks"
import { FeedbackModal } from "@/components/FeedbackModal"

export const Route = createFileRoute("/settings/profile")({
  component: ProfilePage,
})

const showFeedbackAtom = reatomBoolean(false, 'showFeedback')

const ProfilePage = reatomComponent(() => {
  const { profile, logOut, session } = useJazzAuth()
  const showFeedback = showFeedbackAtom()

  const email = profile?.email || session?.user?.email
  const rawName = profile?.name
  const name = rawName && rawName !== "Anonymous" && rawName.toLowerCase() !== "anonymous" ? rawName : null

  let initials = "G"
  if (name) initials = name.slice(0, 1).toUpperCase()
  else if (email) initials = email.slice(0, 1).toUpperCase()

  const handleLogout = async () => {
    logOut()
    window.location.href = "/"
  }

  return (
    <div id="profile" className="scroll-mt-24">
      <SectionHeader
        title="Profile"
        description="Manage your account details."
      />
      <div className="space-y-5">
        <SettingCard title="Account">
          <div className="flex items-center gap-4 py-2">
            <div className="w-11 h-11 rounded-full bg-white/10 grid place-items-center text-lg font-semibold text-white">
              {initials}
            </div>
            <div className="flex-1">
              <p className="text-md text-white font-semibold">
                {name || email || "Guest user"}
              </p>
              <p className="text-md text-white/85">{email ?? "-"}</p>
            </div>
          </div>
        </SettingCard>

        <SettingCard title="Support">
          <div className="flex items-start justify-between py-2">
            <div className="flex flex-col gap-2">
              <p className="font-medium text-white">Get help</p>
              <p className="text-xs text-white/70">
                Join our Discord community or send us feedback.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="https://discord.com/invite/bxtD8x6aNF"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm bg-white/5 hover:bg-white/10 text-white px-3 py-2 rounded-lg border border-white/10 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Discord
              </a>
              <button
                type="button"
                onClick={() => showFeedbackAtom.set(true)}
                className="inline-flex items-center gap-2 text-sm bg-white/5 hover:bg-white/10 text-white px-3 py-2 rounded-lg border border-white/10 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Feedback
              </button>
            </div>
          </div>
        </SettingCard>

        {showFeedback && <FeedbackModal onClose={() => showFeedbackAtom.set(false)} />}

        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 text-sm font-medium text-rose-500 hover:bg-rose-600/10 hover:text-rose-400 rounded-lg px-4 py-2 cursor-pointer transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  )
})
