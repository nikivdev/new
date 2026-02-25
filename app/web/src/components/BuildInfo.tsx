declare const __BUILD_TIME__: string

function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return "just now"
}

export function BuildInfo() {
  const buildTime = new Date(__BUILD_TIME__)
  const relative = getRelativeTime(buildTime)

  return (
    <span
      className="text-[10px] text-white/30 select-none"
      title={`Built: ${buildTime.toLocaleString()}`}
    >
      {relative}
    </span>
  )
}
