import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { action, atom, effect, reatomBoolean, wrap } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"
import { useJazzAuth } from "@/lib/jazz/hooks"
import { withJazzAuthHeaders } from "@/lib/jazz/headers"

type DirectoryUserRecord = {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
  updatedAt?: string
}

export const Route = createFileRoute("/users")({
  ssr: false,
  component: UsersPage,
})

const usersAtom = atom<DirectoryUserRecord[]>([], 'directoryUsers')
const usersLoadingAtom = reatomBoolean(true, 'directoryUsersLoading')
const usersLoadedAtom = reatomBoolean(false, 'directoryUsersLoaded')
const usersAuthAtom = reatomBoolean(false, 'directoryUsersAuth')

const loadUsers = action(async () => {
  usersLoadingAtom.set(true)
  try {
    const response = await wrap(fetch('/api/users', {
      headers: withJazzAuthHeaders(),
    }))
    if (response.ok) {
      const data = (await response.json()) as { users: DirectoryUserRecord[] }
      usersAtom.set(data.users)
    }
  } catch (error) {
    console.error('[users] failed to load directory', error)
  } finally {
    usersLoadingAtom.set(false)
    usersLoadedAtom.set(true)
  }
}, 'loadDirectoryUsers')

effect(() => {
  const isAuthenticated = usersAuthAtom()
  if (!isAuthenticated) {
    usersAtom.set([])
    usersLoadedAtom.set(false)
    usersLoadingAtom.set(false)
    return
  }

  if (!usersLoadedAtom()) {
    loadUsers()
  }
}, 'directoryUsersEffect')

const UsersPage = reatomComponent(() => {
  const navigate = useNavigate()
  const { isAuthenticated, profile, logOut } = useJazzAuth()

  usersAuthAtom.set(isAuthenticated)

  const users = usersAtom()
  const loading = usersLoadingAtom()

  if (!isAuthenticated) {
    navigate({ to: '/auth' })
    return null
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-slate-400">Signed in as</p>
            <p className="text-lg font-semibold">
              {profile?.email ?? profile?.name ?? 'Signed in'}
            </p>
          </div>
          <button
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm hover:border-cyan-400 transition-colors"
            onClick={async () => {
              logOut()
              navigate({ to: '/auth' })
            }}
          >
            Sign out
          </button>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Users</h2>
            <span className="text-xs text-slate-400">
              Synced via Jazz directory
            </span>
          </div>
          <div className="divide-y divide-slate-800">
            {users.map((user) => (
              <div
                key={user.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{user.name || user.email}</p>
                  <p className="text-sm text-slate-400">{user.email}</p>
                </div>
                <span className="text-xs text-slate-500">{user.id}</span>
              </div>
            ))}
            {loading ? (
              <div className="px-4 py-6 text-center text-slate-400">
                Loading users...
              </div>
            ) : users.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-400">
                No users yet. Create an account from the login screen to seed
                data.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
})
