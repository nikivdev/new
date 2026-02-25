import { createFileRoute, Link } from "@tanstack/react-router"
import { action, atom, effect, reatomBoolean, wrap } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"

import { BladeCanvasExperience } from "@/features/canvas/BladeCanvasExperience"
import { fetchCanvasSnapshot } from "@/lib/canvas/client"
import type { SerializedCanvas } from "@/lib/canvas/types"
import { AuthRequiredCard } from "@/features/canvas/components/AuthRequiredCard"
import { useJazzAuth } from "@/lib/jazz/hooks"

export const Route = createFileRoute("/canvas/$canvasId")({
  ssr: false,
  component: CanvasDetailPage,
})

type CanvasParams = {
  canvasId: string
  accountId: string | null
  isAuthenticated: boolean
}

const canvasParamsAtom = atom<CanvasParams | null>(null, 'canvasParams')
const canvasSnapshotAtom = atom<SerializedCanvas | null>(null, 'canvasSnapshot')
const canvasLoadingAtom = reatomBoolean(true, 'canvasSnapshotLoading')
const canvasErrorAtom = atom<string | null>(null, 'canvasSnapshotError')
const canvasRequestVersionAtom = atom(0, 'canvasSnapshotRequestVersion')

const loadCanvasSnapshot = action(async () => {
  const params = canvasParamsAtom()
  if (!params) return

  const version = canvasRequestVersionAtom.set((v) => v + 1)

  if (!params.isAuthenticated) {
    canvasLoadingAtom.set(false)
    canvasSnapshotAtom.set(null)
    canvasErrorAtom.set(null)
    return
  }

  canvasLoadingAtom.set(true)
  canvasErrorAtom.set(null)

  try {
    const data = await wrap(fetchCanvasSnapshot(params.canvasId, {
      accountId: params.accountId ?? undefined,
    }))
    if (canvasRequestVersionAtom() === version) {
      canvasSnapshotAtom.set(data)
    }
  } catch (err) {
    console.error('[canvas] failed to load snapshot', err)
    if (canvasRequestVersionAtom() === version) {
      if (typeof err === 'object' && err && 'status' in err && (err as { status?: number }).status === 401) {
        canvasErrorAtom.set('AUTH_REQUIRED')
      } else {
        canvasErrorAtom.set('Unable to open this canvas')
      }
      canvasSnapshotAtom.set(null)
    }
  } finally {
    if (canvasRequestVersionAtom() === version) {
      canvasLoadingAtom.set(false)
    }
  }
}, 'loadCanvasSnapshot')

effect(() => {
  const params = canvasParamsAtom()
  if (!params) return
  loadCanvasSnapshot()
}, 'canvasSnapshotEffect')

const CanvasDetailPage = reatomComponent(() => {
  const { canvasId } = Route.useParams()
  const { isAuthenticated, accountId } = useJazzAuth()

  const prev = canvasParamsAtom()
  const next = { canvasId, accountId: accountId ?? null, isAuthenticated }
  if (!prev || prev.canvasId !== next.canvasId || prev.accountId !== next.accountId || prev.isAuthenticated !== next.isAuthenticated) {
    canvasParamsAtom.set(next)
  }

  const snapshot = canvasSnapshotAtom()
  const loading = canvasLoadingAtom()
  const error = canvasErrorAtom()

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#03050a] px-6">
        <AuthRequiredCard
          title="Sign in to open this canvas"
          description="Log in to continue working on your saved canvases."
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#03050a] text-white/70">
        <p className="text-xs uppercase tracking-[0.4em]">Loading canvas…</p>
        <Link
          to="/canvas"
          className="text-[11px] uppercase tracking-[0.3em] text-white/40 hover:text-white"
        >
          Back to projects
        </Link>
      </div>
    )
  }

  if (error === 'AUTH_REQUIRED') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#03050a] px-6">
        <AuthRequiredCard
          title="Session expired"
          description="Please log in again to continue editing your canvas."
          actionLabel="Log in again"
        />
      </div>
    )
  }

  if (error || !snapshot) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#03050a] text-white">
        <p className="text-lg text-white/80">{error ?? 'Canvas not found.'}</p>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-full bg-white/10 px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white backdrop-blur transition hover:bg-white/20"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
          <Link
            to="/canvas"
            className="rounded-full border border-white/30 px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/80 transition hover:border-white hover:text-white"
          >
            Projects
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#01040d]">
      <BladeCanvasExperience
        initialCanvas={snapshot.canvas}
        initialImages={snapshot.images}
      />
    </div>
  )
})
