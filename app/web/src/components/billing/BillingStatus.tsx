import { useBilling } from "@/components/BillingProvider"
import { UsageDisplay } from "./UsageDisplay"
import { UpgradeButton } from "./UpgradeButton"

export function BillingStatus() {
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-white">
            {billing.isPaid ? "Pro Plan" : "Free Plan"}
          </h3>
          <p className="text-sm text-zinc-400">
            {billing.isPaid ? "$7.99/month" : "Limited requests"}
          </p>
        </div>
        {!billing.isPaid && <UpgradeButton />}
      </div>

      {billing.isPaid && (
        <>
          <UsageDisplay />
          <button
            onClick={billing.openPortal}
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Manage subscription
          </button>
        </>
      )}
    </div>
  )
}
