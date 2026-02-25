import { useBilling } from "@/components/BillingProvider"
import { UsageDisplayNew } from "./UsageDisplayNew"
import { UpgradeButtonNew } from "./UpgradeButtonNew"

export function BillingStatusNew() {
  const billing = useBilling()

  if (billing.isLoading) {
    return (
      <div className="p-4 bg-zinc-900 rounded-lg">
        <div className="animate-pulse h-4 bg-zinc-800 rounded w-24" />
      </div>
    )
  }

  return (
    <div className="p-4 bg-zinc-900 rounded-lg space-y-3">
      <UpgradeButtonNew />
      <UsageDisplayNew />
    </div>
  )
}
