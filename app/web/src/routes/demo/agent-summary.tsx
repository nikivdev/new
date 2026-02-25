import { createFileRoute } from "@tanstack/react-router"
import { reatomComponent } from "@reatom/react"

export const Route = createFileRoute("/demo/agent-summary")({
  component: AgentSummaryRoute,
})

const AgentSummaryRoute = reatomComponent(() => {
  return (
    <div className="px-6 py-10 text-white">
      <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-white/40">
          Demo
        </p>
        <h1 className="text-2xl font-semibold">Agent Summary</h1>
        <p className="text-sm text-white/60">
          Jazz + Groove demo is disabled for now.
        </p>
      </div>
    </div>
  )
})
