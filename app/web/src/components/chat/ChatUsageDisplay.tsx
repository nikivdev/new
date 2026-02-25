import { useBilling } from "@/components/BillingProvider"

export function ChatUsageDisplay() {
  const billing = useBilling()

  if (billing.isLoading || billing.isGuest) {
    return null
  }

  const remaining = billing.remaining ?? 0
  const limit = billing.limit ?? billing.freeLimit ?? 20

  // Don't show if no balance info
  if (remaining === 0 && !billing.isPaid) {
    return null
  }

  const percentage = Math.min(100, (remaining / limit) * 100)

  return (
    <div className="flex items-center gap-4 text-xs text-white/60">
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap">{billing.isPaid ? "Pro" : "Free"}</span>
        <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${billing.isPaid ? "bg-purple-500" : "bg-emerald-500"}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="tabular-nums">{remaining}</span>
      </div>
    </div>
  )
}
