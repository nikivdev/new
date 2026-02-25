import { Link } from "@tanstack/react-router"

type AuthRequiredCardProps = {
  title: string
  description: string
  actionLabel?: string
}

export function AuthRequiredCard({
  title,
  description,
  actionLabel = "Log in",
}: AuthRequiredCardProps) {
  return (
    <div className="w-full max-w-xl rounded-3xl border border-white/15 bg-white/5 px-10 py-12 text-center text-white">
      <p className="text-sm uppercase tracking-[0.4em] text-white/50">Canvas</p>
      <h1 className="mt-4 text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-white/70">{description}</p>
      <div className="mt-8 flex flex-col items-center gap-3 text-xs uppercase tracking-[0.3em]">
        <Link
          to="/auth"
          className="rounded-full bg-white px-6 py-2 font-semibold text-slate-900 transition hover:bg-white/90"
        >
          {actionLabel}
        </Link>
        <Link
          to="/"
          className="text-white/60 hover:text-white"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
