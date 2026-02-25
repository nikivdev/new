import { type ReactNode, Fragment, useMemo, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { reatomBoolean, withConnectHook } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Search,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react"
import { Provider } from "@react-spectrum/provider"
import { theme } from "@react-spectrum/theme-default"
import {
  Cell,
  Column,
  Row,
  TableBody,
  TableHeader,
  TableView,
} from "@react-spectrum/table"

export type Message = {
  id: string | number
  role: "user" | "assistant"
  content: string
  createdAt?: Date
}

type ActivityItem =
  | { kind: "tool"; tool: string; detail?: string }
  | { kind: "status"; text: string }
  | { kind: "error"; text: string }

type EnvTableEntry = {
  key: string
  value: string
  source: string
}

type EnvTablePayload = {
  title?: string
  entries: EnvTableEntry[]
}

const ENV_TABLE_PREFIX = "@env-table\n"
const CAPABILITIES_PREFIX = "@capabilities\n"

type CapabilityItem = {
  label: string
  detail?: string
}

type CapabilitySection = {
  title: string
  items: CapabilityItem[]
}

type CapabilitiesPayload = {
  title?: string
  subtitle?: string
  sections: CapabilitySection[]
  tools?: Array<{ name: string; trigger: string; example?: string }>
}

const clientMountedAtom = reatomBoolean(false, 'clientMounted')
clientMountedAtom.extend(withConnectHook(() => {
  if (typeof window === 'undefined') return
  clientMountedAtom.set(true)
}))

const markdownBodyClassName =
  "gen-markdown-body streamdown text-sm leading-7 text-white/90 [&_*]:text-inherit"

const parseActivityItem = (text: string): ActivityItem => {
  const toolMatch = text.match(/^([a-zA-Z0-9_-]+)\((.*)\)$/)
  if (toolMatch) {
    const tool = toolMatch[1]
    const rawArgs = toolMatch[2]
    let detail: string | undefined
    if (rawArgs.startsWith("{") && rawArgs.endsWith("}")) {
      try {
        const parsed = JSON.parse(rawArgs) as {
          cmd?: string
          path?: string
          file?: string
          query?: string
          pattern?: string
          pat?: string
        }
        if (parsed?.cmd) {
          detail = parsed.cmd
        } else if (parsed?.path) {
          detail = parsed.path
        } else if (parsed?.file) {
          detail = parsed.file
        } else if (parsed?.query) {
          detail = parsed.query
        } else if (parsed?.pattern) {
          detail = parsed.pattern
        } else if (parsed?.pat) {
          detail = parsed.pat
        }
      } catch {
        detail = rawArgs
      }
    } else {
      detail = rawArgs
    }
    return { kind: "tool", tool, detail }
  }
  const lowered = text.toLowerCase()
  if (
    lowered.startsWith("refreshing context:") ||
    lowered.startsWith("context updated")
  ) {
    return { kind: "status", text: "" }
  }
  if (lowered.startsWith("error:")) {
    return { kind: "error", text }
  }
  return { kind: "status", text }
}

const splitActivity = (content: string) => {
  const lines = content.split("\n")
  const activity: ActivityItem[] = []
  const rest: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("• ")) {
      const itemText = trimmed.replace(/^•\s*/, "")
      if (itemText) {
        const parsed = parseActivityItem(itemText)
        if (parsed.kind !== "status" || parsed.text) {
          activity.push(parsed)
        }
      }
    } else {
      rest.push(line)
    }
  }
  return {
    activity,
    body: rest.join("\n").trim(),
  }
}

const parseEnvTablePayload = (content: string): EnvTablePayload | null => {
  if (!content.startsWith(ENV_TABLE_PREFIX)) return null
  const raw = content.slice(ENV_TABLE_PREFIX.length).trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as EnvTablePayload
    if (!parsed || !Array.isArray(parsed.entries)) return null
    return parsed
  } catch {
    return null
  }
}

const parseCapabilitiesPayload = (content: string): CapabilitiesPayload | null => {
  if (!content.startsWith(CAPABILITIES_PREFIX)) return null
  const raw = content.slice(CAPABILITIES_PREFIX.length).trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CapabilitiesPayload
    if (!parsed || !Array.isArray(parsed.sections)) return null
    return parsed
  } catch {
    return null
  }
}

function CapabilitiesMessage({ payload }: { payload: CapabilitiesPayload }) {
  const title = payload.title ?? "What I can do"
  const subtitle =
    payload.subtitle ?? "Local-first assistant with tools, traces, and context."
  return (
    <div className="gen-capabilities-card max-w-3xl rounded-3xl border border-white/10 bg-[#0b0d16]/80 shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
          Assist
        </div>
        <div className="mt-2 text-lg font-semibold text-white">{title}</div>
        <div className="mt-1 text-xs text-white/60">{subtitle}</div>
      </div>
      <div className="grid gap-3 px-5 py-4 md:grid-cols-2">
        {payload.sections.map((section) => (
          <div
            key={section.title}
            className="rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              {section.title}
            </div>
            <div className="mt-3 space-y-3">
              {section.items.map((item, index) => (
                <div key={`${section.title}-${index}`} className="text-sm text-white/85">
                  <div className="font-semibold text-white/90">{item.label}</div>
                  {item.detail ? (
                    <div className="text-xs text-white/55">{item.detail}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {payload.tools && payload.tools.length > 0 && (
        <div className="px-5 pb-5">
          <div className="rounded-2xl border border-white/10 bg-black/40">
            <div className="border-b border-white/10 px-4 py-3 text-[10px] uppercase tracking-[0.28em] text-white/50">
              Tools
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-2 px-4 py-3 text-[11px] text-white/75">
              <div className="text-white/40 uppercase tracking-[0.2em] text-[10px]">Tool</div>
              <div className="text-white/40 uppercase tracking-[0.2em] text-[10px]">Trigger</div>
              <div className="text-white/40 uppercase tracking-[0.2em] text-[10px]">Example</div>
              {payload.tools.map((tool) => (
                <Fragment key={tool.name}>
                  <div className="font-semibold text-white/90">{tool.name}</div>
                  <div className="text-white/70">{tool.trigger}</div>
                  <div className="text-white/60">{tool.example ?? '—'}</div>
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EnvTableMessage({ payload }: { payload: EnvTablePayload }) {
  const [entries, setEntries] = useState<EnvTableEntry[]>(payload.entries ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({})

  const grouped = useMemo(() => {
    const map = new Map<string, EnvTableEntry[]>()
    for (const entry of entries) {
      const list = map.get(entry.source) ?? []
      list.push(entry)
      map.set(entry.source, list)
    }
    return map
  }, [entries])

  const handleDelete = async (entry: EnvTableEntry) => {
    const id = `${entry.source}:${entry.key}`
    setError(null)
    setBusy((prev) => ({ ...prev, [id]: true }))
    try {
      if (!window.electron?.env?.deleteLocal) {
        throw new Error("Delete env is unavailable in this build.")
      }
      const result = await window.electron.env.deleteLocal(entry.key, entry.source)
      if (!result.ok || !result.removed) {
        throw new Error(result.error ?? "Failed to delete env.")
      }
      setEntries((prev) =>
        prev.filter((item) => !(item.key === entry.key && item.source === entry.source)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  const handleCopy = async (id: string, value: string) => {
    if (!navigator?.clipboard?.writeText) {
      setError("Clipboard API not available.")
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setCopiedId(id)
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev))
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (entries.length === 0) {
    return <div className="text-sm text-white/60">No env values found.</div>
  }

  return (
    <div className="max-w-3xl">
      <div className="text-sm font-semibold text-white">
        {payload.title ?? "Flow env (local)"}
      </div>
      {error && (
        <div className="mt-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {error}
        </div>
      )}
      {Array.from(grouped.entries()).map(([source, list]) => {
        const sorted = [...list].sort((a, b) => a.key.localeCompare(b.key))
        const isExpanded = expandedSources[source] ?? false
        const visible = isExpanded ? sorted : sorted.slice(0, 8)
        const items = visible.map((entry) => ({
          ...entry,
          id: `${entry.source}:${entry.key}`,
        }))
        return (
          <div key={source} className="mt-4">
            <div className="flex items-center justify-between gap-4 text-[11px] uppercase tracking-[0.2em] text-white/50">
              <span>{source}</span>
              {sorted.length > 8 && (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSources((prev) => ({
                      ...prev,
                      [source]: !isExpanded,
                    }))
                  }
                  className="rounded-full border border-white/10 p-1.5 text-white/60 transition hover:text-white"
                  aria-label={isExpanded ? "Collapse env list" : "Show all env values"}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
            <div className="env-table mt-2 rounded-2xl border border-white/10 bg-white/3 overflow-hidden">
              <Provider theme={theme} colorScheme="dark" scale="medium">
                <TableView
                  aria-label={`Env values for ${source}`}
                  selectionMode="none"
                  width="100%"
                  density="compact"
                  UNSAFE_className="env-table-view"
                >
                  <TableHeader>
                    <Column isRowHeader width="38%">Key</Column>
                    <Column width="52%">Value</Column>
                    <Column width={72} minWidth={72} maxWidth={72} align="end" hideHeader>
                      <span className="sr-only">Actions</span>
                    </Column>
                  </TableHeader>
                  <TableBody items={items}>
                    {(item) => (
                      <Row UNSAFE_className="env-row">
                        <Cell>
                          <span className="font-mono text-[12px] text-white/80">
                            {item.key}
                          </span>
                        </Cell>
                        <Cell UNSAFE_className="env-cell">
                          <span className="env-value font-mono text-[12px] text-white/70 break-all">
                            {item.value}
                          </span>
                        </Cell>
                        <Cell>
                          <div className="env-actions flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => handleCopy(item.id, item.value)}
                              className="text-white/80 hover:text-emerald-300 transition-colors"
                              aria-label="Copy value"
                            >
                              <Copy size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              disabled={!!busy[item.id]}
                              className="text-white/80 hover:text-red-400 transition-colors disabled:text-white/40"
                              aria-label="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </Cell>
                      </Row>
                    )}
                  </TableBody>
                </TableView>
              </Provider>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const hasRenderableStreaming = (content: string) => {
  if (!content.trim()) return false
  const { activity, body } = splitActivity(content)
  const visibleActivity = activity.filter((item) => item.kind !== "status")
  return body.trim().length > 0 || visibleActivity.length > 0
}

const ClientOnly = reatomComponent(({
  children,
  fallback = null,
}: {
  children: ReactNode
  fallback?: ReactNode
}) => {
  const mounted = clientMountedAtom()

  if (!mounted) {
    return <>{fallback}</>
  }

  return <>{children}</>
})

function StreamdownFallback({
  content,
  streaming,
}: {
  content: string
  streaming?: boolean
}) {
  if (!content) return null
  const suffix = streaming ? " ▋" : ""
  return (
    <div className="whitespace-pre-wrap text-sm text-neutral-200">
      {content}
      {suffix && <span className="inline-block animate-pulse">{suffix}</span>}
    </div>
  )
}

const summarizeTool = (item: Extract<ActivityItem, { kind: "tool" }>) => {
  const tool = item.tool.toLowerCase()
  const rawDetail = item.detail?.trim() ?? ""
  const normalizedDetail = rawDetail.replace(/^"+|"+$/g, "")
  if (tool === "bash") {
    return {
      label: "command",
      value: normalizedDetail || "bash",
      detail: "",
      icon: Terminal,
      tone: "bg-amber-500/20 border border-amber-500/30",
    }
  }
  if (tool === "getresearchnotes") {
    return {
      label: "notes search",
      value: normalizedDetail || "notes",
      detail: "",
      icon: BookOpen,
      tone: "bg-cyan-500/20 border border-cyan-500/30",
    }
  }
  if (tool === "read") {
    return {
      label: "read",
      value: normalizedDetail || "file",
      detail: "",
      icon: FileText,
      tone: "bg-sky-500/20 border border-sky-500/30",
    }
  }
  if (tool === "grep" || tool === "search") {
    return {
      label: "searched",
      value: normalizedDetail || tool,
      detail: "",
      icon: Search,
      tone: "bg-emerald-500/20 border border-emerald-500/30",
    }
  }
  if (tool === "glob") {
    return {
      label: "glob",
      value: normalizedDetail || tool,
      detail: "",
      icon: Search,
      tone: "bg-purple-500/20 border border-purple-500/30",
    }
  }
  return {
    label: "tool",
    value: normalizedDetail || item.tool,
    detail: "",
    icon: Wrench,
    tone: "bg-white/10 border border-white/15",
  }
}

function ActivityLog({ items }: { items: ActivityItem[] }) {
  const filtered = items.filter((item) => item.kind !== "status")
  if (!filtered.length) return null
  return (
    <div className="mb-3 flex flex-col gap-2">
      {filtered.map((item, index) => {
        if (item.kind === "tool") {
          const summary = summarizeTool(item)
          const Icon = summary.icon
          return (
            <div
              key={`${item.tool}-${index}`}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white/80"
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${summary.tone}`}>
                <Icon size={14} className="text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">
                    {summary.label}
                  </span>
                  <span className="truncate font-mono text-[12px] text-white/90">
                    {summary.value}
                  </span>
                </div>
                {summary.detail && (
                  <div className="mt-1 truncate text-[11px] text-white/50">
                    {summary.detail}
                  </div>
                )}
              </div>
            </div>
          )
        }
        if (item.kind === "error") {
          return (
            <div
              key={`${item.text}-${index}`}
              className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-100"
            >
              <span className="text-red-300">Error</span>
              <span className="truncate">{item.text}</span>
            </div>
          )
        }
        return null
      })}
    </div>
  )
}

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user"

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="gen-user-bubble w-fit max-w-2xl rounded-xl px-4 py-2 bg-[#16171f] inner-shadow-xl outline-1 outline-neutral-100/12 text-white">
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        </div>
      </div>
    )
  }

  const envTablePayload = parseEnvTablePayload(message.content)
  if (envTablePayload) {
    return <EnvTableMessage payload={envTablePayload} />
  }

  const capabilitiesPayload = parseCapabilitiesPayload(message.content)
  if (capabilitiesPayload) {
    return <CapabilitiesMessage payload={capabilitiesPayload} />
  }

  const { activity, body } = splitActivity(message.content)
  return (
    <div className="max-w-3xl">
      <ActivityLog items={activity} />
      <ClientOnly fallback={<StreamdownFallback content={body} />}>
        <div className={markdownBodyClassName}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {body}
          </ReactMarkdown>
        </div>
      </ClientOnly>
    </div>
  )
}

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
      <div
        className="w-2 h-2 bg-teal-500 rounded-full animate-pulse"
        style={{ animationDelay: "0.2s" }}
      />
      <div
        className="w-2 h-2 bg-teal-500 rounded-full animate-pulse"
        style={{ animationDelay: "0.4s" }}
      />
    </div>
  )
}

export function StreamingMessage({ content }: { content: string }) {
  const { activity, body } = splitActivity(content)
  return (
    <div className="max-w-3xl">
      <ActivityLog items={activity} />
      <ClientOnly fallback={<StreamdownFallback content={body} streaming />}>
        <div className={markdownBodyClassName}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {body}
          </ReactMarkdown>
        </div>
      </ClientOnly>
    </div>
  )
}
