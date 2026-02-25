import { action, atom, computed, effect, reatomBoolean, withConnectHook } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"
import { Link } from "@tanstack/react-router"
import {
  ChevronRight,
  FileText,
  Globe,
  MessageCircle,
  Zap,
  Loader2,
  Link2,
  ChevronDown,
  Search,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react"
import { withJazzAuthHeaders } from "@/lib/jazz/headers"

import ContextPanel from "./Context-panel"

type BlockPageRecord = {
  id: string
  path: string
  url?: string | null
  content?: string | null
  tokenCount: number
  included: boolean
  createdAt?: string
}

type BlockRecord = {
  id: string
  name: string
  type: "text" | "web"
  url?: string | null
  content?: string | null
  config?: {
    updateInterval?: string
    deepScanLevel?: number
    summarise?: boolean
    createSections?: boolean
  }
  status: "ready" | "scanning" | "error"
  errorMessage?: string | null
  tokenCount: number
  pageCount: number
  lastRefreshedAt?: string | null
  createdAt?: string
  updatedAt?: string
  pages?: BlockPageRecord[]
}

type BlockLayoutProps = {
  activeTab: "blocks" | "marketplace"
  toolbar?: React.ReactNode
  subnav?: React.ReactNode
  children: React.ReactNode
}

type MarketplaceCard = {
  title: string
  author: string
  price: string
  tone: string
  accent: string
  badge?: string
}

const blocksAtom = atom<BlockRecord[]>([], "blocks")
const blocksLoadingAtom = reatomBoolean(true, "blocksLoading")
const selectedBlockIdAtom = atom<string | null>(null, "blocksSelectedId")

const fetchBlocks = action(async () => {
  blocksLoadingAtom.set(true)
  try {
    const res = await fetch("/api/blocks", {
      method: "GET",
      credentials: "include",
      headers: withJazzAuthHeaders(),
    })
    if (res.ok) {
      const data = (await res.json()) as { blocks: BlockRecord[] }
      blocksAtom.set(data.blocks)
    }
  } catch (err) {
    console.error("Failed to fetch blocks:", err)
  } finally {
    blocksLoadingAtom.set(false)
  }
}, "fetchBlocks")

blocksAtom.extend(withConnectHook(fetchBlocks))

effect(() => {
  const blocks = blocksAtom()
  const hasScanning = blocks.some((b) => b.status === "scanning")
  if (!hasScanning) return

  const interval = setInterval(fetchBlocks, 2000)
  return () => clearInterval(interval)
}, "blocksPolling")

const deleteBlock = action(async (ctx, blockId: string) => {
  try {
    await fetch("/api/blocks", {
      method: "POST",
      credentials: "include",
      headers: withJazzAuthHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ action: "delete", id: blockId }),
    })
    blocksAtom.set((prev) => prev.filter((b) => b.id !== blockId))
    if (selectedBlockIdAtom() === blockId) {
      selectedBlockIdAtom.set(null)
    }
  } catch (err) {
    console.error("Failed to delete block:", err)
  }
}, "deleteBlock")

const refreshBlock = action(async (ctx, blockId: string) => {
  try {
    await fetch("/api/blocks", {
      method: "POST",
      credentials: "include",
      headers: withJazzAuthHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ action: "refresh", id: blockId }),
    })
    blocksAtom.set((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, status: "scanning" } : b)),
    )
  } catch (err) {
    console.error("Failed to refresh block:", err)
  }
}, "refreshBlock")

const webBlocksAtom = computed(
  () => blocksAtom().filter((b) => b.type === "web"),
  "webBlocks",
)
const textBlocksAtom = computed(
  () => blocksAtom().filter((b) => b.type === "text"),
  "textBlocks",
)

const blockTypeAtom = atom<"text" | "web">("web", "blockCreateType")
const blockNameAtom = atom("", "blockCreateName")
const blockUrlAtom = atom("", "blockCreateUrl")
const blockContentAtom = atom("", "blockCreateContent")
const blockIsCreatingAtom = reatomBoolean(false, "blockCreateLoading")
const blockErrorAtom = atom<string | null>(null, "blockCreateError")
const blockOptionsAtom = atom(
  {
    update: true,
    deepScan: false,
    summarise: false,
    sections: false,
    updateInterval: "1 hour",
    deepScanLevel: "5 levels",
  },
  "blockCreateOptions",
)

const marketplaceSections: { title: string; items: MarketplaceCard[] }[] = [
  {
    title: "Featured",
    items: [
      {
        title: "Stripe Integration",
        author: "Stripe",
        price: "Free",
        tone: "bg-gradient-to-r from-indigo-400 via-blue-500 to-purple-500",
        accent: "border-indigo-300/40",
      },
      {
        title: "X API",
        author: "X",
        price: "$19.99",
        tone: "bg-gradient-to-r from-slate-900 via-neutral-800 to-slate-950",
        accent: "border-slate-500/40",
      },
      {
        title: "Notion",
        author: "Notion",
        price: "$11.99",
        tone: "bg-gradient-to-r from-amber-200 via-amber-100 to-white",
        accent: "border-amber-200/50",
      },
    ],
  },
  {
    title: "Trending",
    items: [
      {
        title: "Dev Mode MCP",
        author: "Figma",
        price: "Free",
        tone: "bg-gradient-to-r from-green-400 via-emerald-500 to-green-600",
        accent: "border-emerald-200/50",
      },
      {
        title: "Gmail API Tools",
        author: "hunter2",
        price: "$9.99",
        tone: "bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400",
        accent: "border-orange-300/60",
      },
      {
        title: "VS Code",
        author: "nikiv",
        price: "Free",
        tone: "bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900",
        accent: "border-slate-500/30",
      },
    ],
  },
  {
    title: "Recently published",
    items: [
      {
        title: "Spotify API",
        author: "greg3",
        price: "$6.99",
        tone: "bg-gradient-to-r from-emerald-400 via-green-500 to-emerald-600",
        accent: "border-emerald-200/50",
      },
      {
        title: "VS Code",
        author: "nikiv",
        price: "Free",
        tone: "bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900",
        accent: "border-slate-500/30",
      },
      {
        title: "Dev Mode MCP",
        author: "Figma",
        price: "$4.99",
        tone: "bg-gradient-to-r from-lime-400 via-green-500 to-emerald-600",
        accent: "border-lime-200/50",
      },
    ],
  },
]

export default function BlockLayout({
  activeTab,
  subnav,
  children,
}: BlockLayoutProps) {
  return (
    <div className="min-h-screen bg-[#05070e] text-white">
      <div className="mx-auto flex max-w-[1700px] flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:py-8">
        <aside className="hidden w-full max-w-[340px] lg:block">
          <div className="h-screen overflow-hidden">
            <ContextPanel chats={[]} />
          </div>
        </aside>
        <main className="flex-1">
          <div className="relative overflow-hidden p-4 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <BlockNav activeTab={activeTab} />
                {activeTab === "blocks" ? (
                  <PublishButton />
                ) : (
                  <MarketplaceSearch />
                )}
              </div>

              {subnav ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {subnav}
                </div>
              ) : null}

              <div className="space-y-5 sm:space-y-6">{children}</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function BlockNav({ activeTab }: { activeTab: "blocks" | "marketplace" }) {
  const tabs = [
    { id: "blocks", label: "My Blocks", to: "/blocks" },
    { id: "marketplace", label: "Marketplace", to: "/marketplace" },
  ] as const

  return (
    <div className="flex items-start gap-8">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <Link
            key={tab.id}
            to={tab.to}
            className="relative pb-0.2 text-2xl -tracking-normal"
            activeOptions={{ exact: true }}
          >
            <span
              className={`transition-colors duration-200 ${
                isActive ? "text-white" : "text-white/50 hover:text-white/70"
              }`}
            >
              {tab.label}
            </span>
            {isActive ? (
              <span className="absolute inset-x-0 -bottom-0.5 flex h-[0.5px] items-center justify-center">
                <span className="h-[0.5px] w-full rounded-xl bg-linear-to-r from-amber-200 via-amber-100 to-amber-100/80 blur-[0.2px]" />
                <span className="absolute h-[14px] w-[120%] -z-10 bg-[radial-gradient(circle_at_center,rgba(255,179,71,0.35),transparent_65%)]" />
              </span>
            ) : null}
          </Link>
        )
      })}
    </div>
  )
}

function PublishButton() {
  return (
    <button
      type="button"
      className="relative overflow-hidden rounded-lg border border-amber-400/10 bg-linear-to-b from-[#412b26] to-[#44382a] px-4 py-1.5 text-sm text-white/70 hover:shadow-[0_2px_15px_rgba(68,56,42)] hover:text-white cursor-pointer"
    >
      Publish
    </button>
  )
}

export function MarketplaceSearch() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-[#0f1117]/40 px-4 py-2 shadow-inner shadow-white/1">
      <Search className="h-4 w-4 text-white/70" />
      <input
        placeholder="Search Marketplace"
        className="flex-1 bg-[#0f1117]/40 text-white text-sm placeholder:text-white/70 focus:outline-none disabled:opacity-50"
      />
    </div>
  )
}

export const MyBlocksView = reatomComponent(() => {
  const blocks = blocksAtom()
  const loading = blocksLoadingAtom()
  const selectedBlockId = selectedBlockIdAtom()
  const webBlocks = webBlocksAtom()
  const textBlocks = textBlocksAtom()

  return (
    <BlockLayout activeTab="blocks">
      <div className="grid items-start gap-3 sm:gap-5 lg:grid-cols-[280px_1fr]">
        <div className="w-full lg:max-w-[340px]">
          <div className="space-y-4 p-4 sm:p-5">
            {loading ? (
              <div className="flex items-center gap-2 text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading blocks...
              </div>
            ) : blocks.length === 0 ? (
              <p className="text-white/50 text-sm">
                No blocks yet. Create one!
              </p>
            ) : (
              <div className="space-y-3">
                {webBlocks.length > 0 && (
                  <BlockListGroup
                    title="Web"
                    items={webBlocks}
                    selectedId={selectedBlockId}
                    onSelect={(id) => selectedBlockIdAtom.set(id)}
                    onDelete={deleteBlock}
                    onRefresh={refreshBlock}
                  />
                )}
                {textBlocks.length > 0 && (
                  <BlockListGroup
                    title="Text"
                    items={textBlocks}
                    selectedId={selectedBlockId}
                    onSelect={(id) => selectedBlockIdAtom.set(id)}
                    onDelete={deleteBlock}
                    onRefresh={refreshBlock}
                  />
                )}
              </div>
            )}
          </div>
        </div>
        <div className="w-full">
          <CreateBlockPanel onBlockCreated={fetchBlocks} />
        </div>
      </div>
    </BlockLayout>
  )
})

function BlockListGroup({
  title,
  items,
  selectedId,
  onSelect,
  onDelete,
  onRefresh,
}: {
  title: string
  items: BlockRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRefresh: (id: string) => void
}) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between text-sm font-semibold text-white">
        <span>{title}</span>
        <span className="text-xs text-white/50">{items.length}</span>
      </div>
      <div className="mt-3 space-y-1">
        {items.map((block) => {
          const isSelected = selectedId === block.id
          const isScanning = block.status === "scanning"
          const hasError = block.status === "error"

          return (
            <div
              key={block.id}
              className={`group flex items-center justify-between text-sm rounded-lg px-2 py-2 cursor-pointer transition ${
                isSelected
                  ? "bg-white/10 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
              onClick={() => onSelect(block.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {block.type === "web" ? (
                  <Globe className="h-4 w-4 text-blue-400 flex-shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-amber-400 flex-shrink-0" />
                )}
                <span className="truncate">{block.name}</span>
                {isScanning && (
                  <Loader2 className="h-3 w-3 animate-spin text-teal-400" />
                )}
                {hasError && (
                  <span className="text-xs text-red-400">Error</span>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                {block.type === "web" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRefresh(block.id)
                    }}
                    disabled={isScanning}
                    className="p-1 rounded text-white/50 hover:text-white disabled:opacity-50"
                    title="Refresh"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(block.id)
                  }}
                  className="p-1 rounded text-white/50 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const blockTypes = [
  { id: "text", label: "Text", icon: FileText },
  { id: "web", label: "Web", icon: Globe },
] as const

const CreateBlockPanel = reatomComponent(({ onBlockCreated }: { onBlockCreated?: () => void }) => {
  const blockType = blockTypeAtom()
  const name = blockNameAtom()
  const url = blockUrlAtom()
  const content = blockContentAtom()
  const isCreating = blockIsCreatingAtom()
  const error = blockErrorAtom()
  const options = blockOptionsAtom()

  const handleCreate = async () => {
    blockErrorAtom.set(null)

    if (!name.trim()) {
      blockErrorAtom.set("Name is required")
      return
    }
    if (blockType === "web" && !url.trim()) {
      blockErrorAtom.set("URL is required for web blocks")
      return
    }

    blockIsCreatingAtom.set(true)

    try {
      let normalizedUrl = url.trim()
      if (blockType === "web" && normalizedUrl && !normalizedUrl.startsWith("http")) {
        normalizedUrl = `https://${normalizedUrl}`
      }

      const res = await fetch("/api/blocks", {
        method: "POST",
        credentials: "include",
        headers: withJazzAuthHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          action: "create",
          name: name.trim(),
          type: blockType,
          url: blockType === "web" ? normalizedUrl : undefined,
          content: blockType === "text" ? content : undefined,
          config: {
            updateInterval: options.updateInterval,
            deepScanLevel: parseInt(options.deepScanLevel),
            summarise: options.summarise,
            createSections: options.sections,
          },
        }),
      })

      if (res.status === 401) {
        window.location.href = "/auth"
        return
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error || "Failed to create block")
      }

      blockNameAtom.set("")
      blockUrlAtom.set("")
      blockContentAtom.set("")
      onBlockCreated?.()
    } catch (err) {
      blockErrorAtom.set(err instanceof Error ? err.message : "Failed to create block")
    } finally {
      blockIsCreatingAtom.set(false)
    }
  }

  return (
    <div className="w-full rounded-2xl bg-[#181921d9]/60 p-5 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-semibold text-white">Create block</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {blockTypes.map((type) => {
          const isActive = blockType === type.id
          const Icon = type.icon
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => blockTypeAtom.set(type.id)}
              className={`group relative flex flex-col cursor-pointer justify-center items-center gap-3 rounded-xl border px-4 py-4 text-sm font-medium transition ${
                isActive
                  ? "bg-gradient-to-br border-white/15 from-blue-300/10 via-blue-400/15 to-purple-400/30"
                  : "border-white/5 bg-white/3 hover:border-white/20 text-white/70 hover:bg-white/6"
              }`}
            >
              <Icon className="h-6 w-6" />
              <span>{type.label}</span>
            </button>
          )
        })}
      </div>

      <div className="space-y-2">
        <label className="text-sm uppercase tracking-[0.15em] text-white/70">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => blockNameAtom.set(e.target.value)}
          placeholder="My block"
          className="w-full rounded-lg bg-black/40 px-4 py-3 text-white text-sm placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-white/20"
        />
      </div>

      {blockType === "web" && (
        <div className="space-y-2">
          <label className="text-sm uppercase tracking-[0.15em] text-white/70">
            URL
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => blockUrlAtom.set(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-lg bg-black/40 px-4 py-3 text-white text-sm placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
      )}

      {blockType === "text" && (
        <div className="space-y-2">
          <label className="text-sm uppercase tracking-[0.15em] text-white/70">
            Content
          </label>
          <textarea
            value={content}
            onChange={(e) => blockContentAtom.set(e.target.value)}
            placeholder="Enter your text content here..."
            rows={6}
            className="w-full rounded-lg bg-black/40 px-4 py-3 text-white text-sm placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-white/20 resize-none"
          />
        </div>
      )}

      {blockType === "web" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <OptionRow
            label="Auto-update"
            checked={options.update}
            onChange={() =>
              blockOptionsAtom.set((prev) => ({ ...prev, update: !prev.update }))
            }
            select={{
              value: options.updateInterval,
              onChange: (value) =>
                blockOptionsAtom.set((prev) => ({ ...prev, updateInterval: value })),
              options: ["30 min", "1 hour", "3 hours", "1 day"],
            }}
          />
          <OptionRow
            label="Summarise"
            checked={options.summarise}
            onChange={() =>
              blockOptionsAtom.set((prev) => ({ ...prev, summarise: !prev.summarise }))
            }
          />
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="button"
        onClick={handleCreate}
        disabled={isCreating}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#e5634f] via-[#ed7246] to-[#c25c29] px-5 py-3 text-base font-semibold text-white shadow-[0_2px_3px_rgba(255,175,71,0.45)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition"
      >
        {isCreating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating...
          </>
        ) : (
          "Create Block"
        )}
      </button>
    </div>
  )
})

function OptionRow({
  label,
  checked,
  onChange,
  select,
}: {
  label: string
  checked: boolean
  onChange: () => void
  select?: {
    value: string
    onChange: (value: string) => void
    options: string[]
  }
}) {
  const muted = !checked
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onChange}
        className="flex items-center gap-3 text-left"
        aria-pressed={checked}
      >
        <GradientCheckbox checked={checked} />
        <span
          className={`text-lg font-semibold tracking-tight ${
            muted ? "text-slate-400" : "text-white"
          }`}
        >
          {label}
        </span>
      </button>
      {select ? (
        <SoftSelect
          value={select.value}
          onChange={select.onChange}
          options={select.options}
          disabled={muted}
        />
      ) : (
        <div className="h-10 w-10 shrink-0" />
      )}
    </div>
  )
}

function GradientCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 items-center cursor-pointer justify-center rounded-md border text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition ${
        checked
          ? "border-amber-600/20 shadow-[1px_1px_3px_rgba(255,149,87,0.2)] bg-linear-to-b from-red-500/20 via-orange-400/20 to-amber-300/20"
          : "border-white/10 bg-black/40"
      }`}
    >
      {checked ? (
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4"
          fill="none"
          stroke="#ff9557"
          strokeWidth={3}
        >
          <path d="M5 11.5 8.5 15 15 6" />
        </svg>
      ) : null}
    </span>
  )
}

function SoftSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
  disabled?: boolean
}) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none rounded-lg border px-6 py-1.5 border-none shadow-white/3 shadow-[1px_1px_0.5px_rgba(0,0,0,0.1)] pr-8 text-sm font-semibold  transition focus:outline-none ${
          disabled
            ? "bg-transparent text-slate-500 cursor-not-allowed"
            : "bg-black/50 text-white"
        }`}
      >
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-[#0c0f18] text-white">
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  )
}

export function MarketplaceView() {
  return (
    <BlockLayout activeTab="marketplace" subnav={<MarketplaceFilters />}>
      <div className="space-y-4 sm:space-y-5">
        {marketplaceSections.map((section) => (
          <div key={section.title} className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold sm:text-xl">
                {section.title}
              </h3>

              <button className="text-sm text-white/80 hover:text-white cursor-pointer">
                Show all
              </button>
            </div>
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {section.items.map((item) => (
                <MarketplaceCardView key={item.title} card={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </BlockLayout>
  )
}

function MarketplaceFilters() {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3">
      <div className="flex flex-1 min-w-[260px] items-center gap-2 overflow-x-auto sm:overflow-visible">
        <FilterPill active={true} text="Discover" />
        <FilterPill text="Featured" />
        <FilterPill text="Trending" />
        <FilterPill text="New" />
      </div>
      <div className="ml-auto flex items-center gap-2 overflow-x-auto sm:overflow-visible">
        <FilterPill text="Owned" />
        <FilterPill text="Profile" />
      </div>
    </div>
  )
}

function FilterPill({ text, active }: { text: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={`rounded-lg px-4 py-2 cursor-pointer text-sm transition ${
        active
          ? "border border-white/15 inset-shadow-2xl shadow-white rounded-lg bg-transparent text-white font-semibold"
          : "bg-transparent text-white/70 hover:text-white"
      }`}
    >
      {text}
    </button>
  )
}

function MarketplaceCardView({ card }: { card: MarketplaceCard }) {
  return (
    <div
      className={`relative flex h-full min-h-[190px] flex-col overflow-hidden rounded-2xl border ${card.accent} bg-[#131620]/70`}
    >
      <div className={`h-20 w-full ${card.tone}`} />
      <div className="flex flex-1 items-center justify-between gap-3 bg-linear-to-b from-[#252734] via-[#282a37] to-[#2c2d37] p-4">
        <div>
          <div className="text-base font-semibold drop-shadow-sm">
            {card.title}
          </div>
          <div className="text-sm text-white/80">
            by <span className="text-white font-semibold">{card.author}</span>
          </div>
        </div>
        <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white">
          {card.price}
        </span>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.2),transparent_65%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.12),transparent_55%)]" />
    </div>
  )
}
