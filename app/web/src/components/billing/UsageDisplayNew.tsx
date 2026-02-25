import { useBilling } from "@/components/BillingProvider"

export function UsageDisplayNew() {
  const billing = useBilling()

  if (billing.isLoading) {
    return null
  }

  const remaining = billing.remaining ?? 0
  const limit = billing.limit ?? billing.freeLimit ?? 20
  const percentage = Math.min(100, (remaining / limit) * 100)

  return (
    <div className="flex items-center gap-2 text-xs">
      <span>{billing.isPaid ? "Pro" : "Free"} requests</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-zinc-400 tabular-nums">{remaining} left</span>
    </div>
  )
}
