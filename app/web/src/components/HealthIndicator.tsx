import { action, atom, reatomBoolean, sleep, withConnectHook, wrap } from '@/shared/reatom/core'
import { reatomComponent } from '@reatom/react'
import { useJazzAuth } from '@/lib/jazz/hooks'

type HealthStatus = {
  ok: boolean
  checks: Record<string, { ok: boolean; message?: string; count?: number }>
}

const ADMIN_EMAIL = 'nikita.voloboev@gmail.com'

const healthStatusAtom = atom<HealthStatus | null>(null, 'healthStatus')
const healthLoadingAtom = reatomBoolean(true, 'healthLoading')
const showDetailsAtom = reatomBoolean(false, 'healthShowDetails')

const checkHealth = action(async () => {
  try {
    const res = await wrap(fetch('/api/health'))
    const data = await res.json() as HealthStatus
    healthStatusAtom.set(data)
  } catch {
    healthStatusAtom.set({ ok: false, checks: { fetch: { ok: false, message: 'Failed to reach server' } } })
  } finally {
    healthLoadingAtom.set(false)
  }
}, 'checkHealth')

healthStatusAtom.extend(withConnectHook(() => {
  let active = true

  const loop = async () => {
    while (active) {
      await wrap(checkHealth())
      await wrap(sleep(30000))
    }
  }

  loop()
  return () => {
    active = false
  }
}))

export const HealthIndicator = reatomComponent(() => {
  const { profile } = useJazzAuth()
  const status = healthStatusAtom()
  const loading = healthLoadingAtom()
  const showDetails = showDetailsAtom()

  const isAdmin = profile?.email === ADMIN_EMAIL

  if (!isAdmin) {
    return null
  }

  if (loading) {
    return (
      <div className="relative">
        <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" title="Checking..." />
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => showDetailsAtom.toggle()}
        className="flex items-center gap-2 group"
        title={status?.ok ? 'All systems operational' : 'System issue detected'}
      >
        <div
          className={`w-3 h-3 rounded-full transition-colors ${
            status?.ok ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
      </button>

      {showDetails && status && (
        <div className="absolute top-6 right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-lg p-3 min-w-48 shadow-xl">
          <div className="text-sm font-medium mb-2 text-white">
            {status.ok ? 'All Systems OK' : 'Issues Detected'}
          </div>
          {Object.entries(status.checks).map(([name, check]) => (
            <div key={name} className="flex items-center gap-2 text-xs text-zinc-400">
              <div className={`w-2 h-2 rounded-full ${check.ok ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="capitalize">{name}:</span>
              <span className={check.ok ? 'text-green-400' : 'text-red-400'}>
                {check.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
