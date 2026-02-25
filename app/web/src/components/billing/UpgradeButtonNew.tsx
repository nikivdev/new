import { useBilling } from "@/components/BillingProvider"

type UpgradeButtonProps = {
  className?: string
  children?: React.ReactNode
}

export function UpgradeButtonNew({ className, children }: UpgradeButtonProps) {
  const billing = useBilling()

  return (
    <button
      type="button"
      onClick={billing.openCheckout}
      disabled={billing.isLoading}
      className={
        className ??
        "px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
      }
    >
      {children ?? "Upgrade to Pro"}
    </button>
  )
}
