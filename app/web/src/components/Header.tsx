import { Link } from "@tanstack/react-router"

import { atom, reatomBoolean } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"
import {
  ChevronDown,
  ChevronRight,
  Home,
  LogIn,
  LogOut,
  Menu,
  Network,
  Palette,
  SquareFunction,
  StickyNote,
  User,
  X,
} from "lucide-react"
import { useJazzAuth } from "@/lib/jazz/hooks"

const headerMenuOpenAtom = reatomBoolean(false, "headerMenuOpen")
const headerGroupedExpandedAtom = atom<Record<string, boolean>>({}, "headerGroupedExpanded")

const Header = reatomComponent(() => {
  const isOpen = headerMenuOpenAtom()
  const groupedExpanded = headerGroupedExpandedAtom()
  const { isAuthenticated, profile, accountId, logOut } = useJazzAuth()

  const displayName = profile?.email ?? profile?.name ?? accountId ?? ""
  const avatarInitial =
    displayName.trim().charAt(0).toUpperCase() || undefined

  const handleSignOut = async () => {
    logOut()
    window.location.href = "/"
  }

  return (
    <>
      <header className="p-4 flex items-center justify-between bg-gray-800 text-white shadow-lg">
        <div className="flex items-center">
          <button
            onClick={() => headerMenuOpenAtom.set(true)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <h1 className="ml-4 text-xl font-semibold">
            <Link to="/">
              <img
                src="/tanstack-word-logo-white.svg"
                alt="TanStack Logo"
                className="h-10"
              />
            </Link>
          </h1>
        </div>

        {isAuthenticated ? (
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Sign out"
          >
            <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center">
              <span className="text-sm font-medium">
                {avatarInitial ?? <User size={16} />}
              </span>
            </div>
          </button>
        ) : (
          <Link
            to="/auth"
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white text-black font-medium rounded-lg hover:bg-white/90 transition-colors"
          >
            <LogIn size={18} />
            <span>Sign in</span>
          </Link>
        )}
      </header>

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Navigation</h2>
          <button
            onClick={() => headerMenuOpenAtom.set(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => headerMenuOpenAtom.set(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
            }}
          >
            <Home size={20} />
            <span className="font-medium">Home</span>
          </Link>

          <Link
            to="/chat"
            onClick={() => headerMenuOpenAtom.set(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
            }}
          >
            <Network size={20} />
            <span className="font-medium">Chat</span>
          </Link>

          <Link
            to="/canvas"
            onClick={() => headerMenuOpenAtom.set(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
            }}
          >
            <Palette size={20} />
            <span className="font-medium">Canvas</span>
          </Link>

          <Link
            to="/users"
            onClick={() => headerMenuOpenAtom.set(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
            }}
          >
            <Network size={20} />
            <span className="font-medium">Users (Electric)</span>
          </Link>

          {isAuthenticated ? (
            <div className="border-t border-gray-700 pt-4 mt-4 mb-4">
              <div className="flex items-center gap-3 p-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center shrink-0">
                  <span className="text-sm font-medium">
                    {avatarInitial}
                  </span>
                </div>
                <span className="font-medium text-sm truncate">
                  {displayName || "Signed in"}
                </span>
              </div>
              <button
                onClick={() => {
                  headerMenuOpenAtom.set(false)
                  handleSignOut()
                }}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors w-full text-left text-red-400 hover:text-red-300"
              >
                <LogOut size={20} />
                <span className="font-medium">Sign out</span>
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              onClick={() => headerMenuOpenAtom.set(false)}
              className="flex items-center gap-3 p-3 rounded-lg bg-white text-black hover:bg-white/90 transition-colors mb-4"
            >
              <LogIn size={20} />
              <span className="font-medium">Sign in</span>
            </Link>
          )}

          {/* Demo Links Start */}

          <Link
            to="/demo/start/server-funcs"
            onClick={() => headerMenuOpenAtom.set(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
            }}
          >
            <SquareFunction size={20} />
            <span className="font-medium">Start - Server Functions</span>
          </Link>

          <Link
            to="/demo/start/api-request"
            onClick={() => headerMenuOpenAtom.set(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
            }}
          >
            <Network size={20} />
            <span className="font-medium">Start - API Request</span>
          </Link>

          <div className="flex flex-row justify-between">
            <Link
              to="/demo/start/ssr"
              onClick={() => headerMenuOpenAtom.set(false)}
              className="flex-1 flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
              activeProps={{
                className:
                  "flex-1 flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
              }}
            >
              <StickyNote size={20} />
              <span className="font-medium">Start - SSR Demos</span>
            </Link>
            <button
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              onClick={() =>
                headerGroupedExpandedAtom.set((prev) => ({
                  ...prev,
                  StartSSRDemo: !prev.StartSSRDemo,
                }))
              }
            >
              {groupedExpanded.StartSSRDemo ? (
                <ChevronDown size={20} />
              ) : (
                <ChevronRight size={20} />
              )}
            </button>
          </div>
          {groupedExpanded.StartSSRDemo && (
            <div className="flex flex-col ml-4">
              <Link
                to="/demo/start/ssr/spa-mode"
                onClick={() => headerMenuOpenAtom.set(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                activeProps={{
                  className:
                    "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
                }}
              >
                <StickyNote size={20} />
                <span className="font-medium">SPA Mode</span>
              </Link>

              <Link
                to="/demo/start/ssr/full-ssr"
                onClick={() => headerMenuOpenAtom.set(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                activeProps={{
                  className:
                    "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
                }}
              >
                <StickyNote size={20} />
                <span className="font-medium">Full SSR</span>
              </Link>

              <Link
                to="/demo/start/ssr/data-only"
                onClick={() => headerMenuOpenAtom.set(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                activeProps={{
                  className:
                    "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2",
                }}
              >
                <StickyNote size={20} />
                <span className="font-medium">Data Only</span>
              </Link>
            </div>
          )}

          {/* Demo Links End */}
        </nav>
      </aside>
    </>
  )
})

export default Header
