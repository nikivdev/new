import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"

export const PLAN_CARD_NOISE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.18'/%3E%3C/svg%3E"

export const CHANGE_PLAN_BACKGROUND =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.18'/%3E%3C/svg%3E"

type Option = { value: string; label: string }

export function InlineSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: Option[]
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white/5 border border-white/10 text-white text-sm pl-3 pr-8 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  )
}

export function SettingRow({
  title,
  description,
  control,
}: {
  title: string
  description: string
  control?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-white/70 mt-0.5">{description}</p>
      </div>
      {control ? <div className="shrink-0">{control}</div> : null}
    </div>
  )
}

export function SettingCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="bg-[#0c0f18] border border-white/5 rounded-2xl p-5 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.7)]">
      <h3 className="text-md font-semibold text-white mb-3">{title}</h3>
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  )
}

export function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative p-8 bg-[#0c0f18] max-w-xl mx-auto flex flex-col gap-2 border border-white/10 rounded-2xl shadow-[0_16px_60px_rgba(0,0,0,0.6)] w-full animate-in fade-in-0 zoom-in-95 duration-300"
        onClickCapture={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {description ? (
          <p className="text-md text-white/85 font-medium mt-1">
            {description}
          </p>
        ) : null}
        <div className="mt-4 space-y-4">{children}</div>
      </div>
    </div>
  )
}

export function SectionHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      {description ? (
        <p className="text-sm text-white/70 mt-1">{description}</p>
      ) : null}
    </div>
  )
}

export function UsageBar({
  icon,
  label,
  current,
  total,
  gradient,
}: {
  icon: ReactNode
  label: string
  current: number
  total: number
  gradient: string
}) {
  const pct = Math.min(100, Math.round((current / total) * 100))
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-200">
        <div className="text-lg">{icon}</div>
        <span className="font-semibold text-white">{current}</span>
        <span className="text-slate-400">
          / {total.toLocaleString()} {label}
        </span>
      </div>
      <div className="h-3 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: gradient,
          }}
        />
      </div>
    </div>
  )
}
