import { useBilling } from "@/components/BillingProvider"

export function UsageDisplay() {
  const billing = useBilling()

  if (billing.isLoading) {
    return null
  }

  if (!billing.isPaid) {
    return (
      <div className="text-xs text-zinc-500">
        Free tier: 20 requests/day
      </div>
    )
  }

  const remaining = billing.remaining ?? 0
  const limit = billing.limit ?? 1000
  const percentage = Math.min(100, (remaining / limit) * 100)

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-zinc-400 tabular-nums">
        {remaining} left
      </span>
    </div>
  )
}
