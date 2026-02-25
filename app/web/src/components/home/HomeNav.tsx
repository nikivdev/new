import { Link } from "@tanstack/react-router"

import { useJazzAuth } from "@/lib/jazz/hooks"

const navLinks = [
  { label: "Chat", to: "/chat" },
  { label: "Images", to: "/canvas" },
]

export function HomeNav() {
  const { isAuthenticated } = useJazzAuth()
  const showLogin = !isAuthenticated

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-20 border-b border-white/10 bg-gradient-to-b from-[#080a16]/95 via-[#080a16]/80 to-transparent backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-between px-6">
        <Link to="/" className="text-2xl font-semibold tracking-tight text-white">
          Starter App
        </Link>
        <div className="flex items-center gap-4 text-xs uppercase tracking-[0.3em] text-white/70">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-full border border-white/15 px-4 py-1.5 text-white/80 transition hover:border-white hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div>
          {showLogin ? (
            <Link
              to="/auth"
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-white/90"
            >
              Log in
            </Link>
          ) : (
            <Link
              to="/canvas"
              className="rounded-full border border-white/30 px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-white/80 transition hover:border-white hover:text-white"
            >
              Open studio
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
