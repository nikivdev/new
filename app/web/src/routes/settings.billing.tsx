import { createFileRoute } from "@tanstack/react-router"
import { useBilling } from "@/components/BillingProvider"
import { BadgeDollarSign, Check, Sparkles, Plus } from "lucide-react"
import {
  SectionHeader,
  UsageBar,
  PLAN_CARD_NOISE,
  CHANGE_PLAN_BACKGROUND,
} from "@/lib/settings-components"

export const Route = createFileRoute("/settings/billing")({
  component: BillingPage,
})

function SubscriptionCard({
  isPaid,
  onSubscribe,
  isLoading,
}: {
  isPaid: boolean
  onSubscribe: () => void
  isLoading: boolean
}) {
  return (
    <div
      className="rounded-3xl w-full p-5 border border-white/10 relative overflow-hidden"
      style={{
        backgroundImage: `url("${PLAN_CARD_NOISE}")`,
        background: "linear-gradient(135deg, #aa5ea4 0%, #2d254a 40%, #494281 90%)",
        backgroundBlendMode: "overlay, normal",
        backgroundSize: "280px 280px, cover",
        backgroundRepeat: "repeat, no-repeat",
      }}
    >
      <div className="flex items-center gap-2 text-2xl font-semibold text-white">
        <Sparkles className="w-5 h-5 text-pink-200" />
        <span>Gen Pro</span>
      </div>
      <p className="text-slate-200 mt-1">$8 / month</p>
      <ul className="mt-4 space-y-2 text-sm text-slate-200">
        <li className="flex items-center gap-2">
          <Check className="w-4 h-4 text-pink-300 shrink-0" />
          <span>1,000 standard requests</span>
        </li>
        <li className="flex items-center gap-2">
          <Check className="w-4 h-4 text-pink-300 shrink-0" />
          <span>100 premium requests</span>
        </li>
        <li className="flex items-center gap-2">
          <Check className="w-4 h-4 text-pink-300 shrink-0" />
          <span>300+ websites for context scraping</span>
        </li>
      </ul>
      {isPaid ? (
        <div className="flex items-center gap-2 mt-6">
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-emerald-300">Active</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSubscribe}
          disabled={isLoading}
          className="mt-6 w-full py-3 px-4 cursor-pointer bg-white text-[#2d254a] font-semibold rounded-xl transition-all hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          Subscribe
        </button>
      )}
    </div>
  )
}

function BillingPage() {
  const billing = useBilling()

  return (
    <div id="billing" className="scroll-mt-24 mx-auto">
      <SectionHeader
        title="Subscription"
        description="Manage your subscription and usage."
      />
      <div className="flex flex-row gap-8 w-full">
        <div className="flex flex-col gap-4 w-full">
          <SubscriptionCard
            isPaid={billing.isPaid}
            onSubscribe={billing.openCheckout}
            isLoading={billing.isLoading}
          />
        </div>
        {billing.isPaid && (
          <div className="space-y-6 self-stretch w-full h-fit">
            <UsageBar
              icon={<BadgeDollarSign className="w-4 h-4 text-white/80" />}
              label="messages"
              current={billing.used ?? 0}
              total={billing.limit ?? 1000}
              gradient="linear-gradient(90deg, #7da2ff, #a36bff, #d870ff)"
            />
            {billing.topupCredits && (billing.topupCredits.standard > 0 || billing.topupCredits.premium > 0 || billing.topupCredits.scrapes > 0) && (
              <div className="text-sm text-white/70 bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="font-medium text-white/90 mb-2">Bonus Credits</div>
                <div className="space-y-1 text-xs">
                  {billing.topupCredits.standard > 0 && (
                    <div>+{billing.topupCredits.standard} standard</div>
                  )}
                  {billing.topupCredits.premium > 0 && (
                    <div>+{billing.topupCredits.premium} premium</div>
                  )}
                  {billing.topupCredits.scrapes > 0 && (
                    <div>+{billing.topupCredits.scrapes} scrapes</div>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={billing.openRefillCheckout}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 border border-pink-500/30 transition-colors rounded-lg py-2"
              >
                <Plus className="w-4 h-4" />
                Refill Credits - $8
              </button>
              <button
                type="button"
                onClick={billing.openPortal}
                style={{
                  backgroundImage: `url("${CHANGE_PLAN_BACKGROUND}")`,
                }}
                className="flex-1 text-sm font-medium text-white bg-white/5 shadow-inner shadow-neutral-800/65 hover:bg-white/10 border border-white/10 transition-colors rounded-lg py-2 bg-cover bg-center bg-no-repeat"
              >
                Manage subscription
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
