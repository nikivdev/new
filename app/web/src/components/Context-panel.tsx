import { atom, effect, reatomBoolean } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"
import type {
  ReactNode,
  MouseEvent as ReactMouseEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react"
// import { useMutation } from "@tanstack/react-db"
import {
  ChevronDown,
  ChevronRight,
  File,
  Globe,
  Ellipsis,
  MessageCircle,
  LogIn,
  Plus,
  Trash2,
  RefreshCw,
  Link2,
  Unlink,
  User,
  type LucideIcon,
  PanelRight,
  // Settings,
  Search,
  X,
} from "lucide-react"
import Context from "@/components/icons/Context"
import Blocks from "@/components/icons/Blocks"
import Threads from "@/components/icons/Threads"
import { withJazzAuthHeaders } from "@/lib/jazz/headers"

type ChatThreadSummary = {
  id: string
  title?: string | null
  created_at?: Date
}

type ContextItemRecord = {
  id: string
  type: string
  url?: string | null
  name: string
  content?: string | null
  refreshing: boolean
  created_at?: string | Date
  updated_at?: string | Date
  snippet?: string
}

interface UserProfile {
  name?: string | null
  email?: string | null
  image?: string | null
}

interface ContextPanelProps {
  chats: ChatThreadSummary[]
  activeChatId?: string | null
  isAuthenticated?: boolean
  profile?: UserProfile | null | undefined
  onContextItemsChange?: () => void
  onToggleSidebar?: () => void
  onDeleteChat?: (chatId: string) => void
  onActivatePersonal?: () => void
  layout?: "sidebar" | "full"
  showThreads?: boolean
}

interface CollapsiblePanelProps {
  title: string
  icon: LucideIcon
  isOpen: boolean
  onToggle: () => void
  headerActions?: ReactNode
  children: ReactNode
  height?: string
  isDragging?: boolean
}

const openSectionsAtom = atom({ files: false, web: true }, "contextOpenSections")
const isContextOpenAtom = reatomBoolean(true, "contextIsOpen")
const isThreadsOpenAtom = reatomBoolean(true, "contextThreadsOpen")
const isPersonalOpenAtom = reatomBoolean(true, "contextPersonalOpen")
const threadsHeightAtom = atom(350, "contextThreadsHeight")
const isDraggingAtom = reatomBoolean(false, "contextDragging")
const deletingChatIdAtom = atom<string | null>(null, "contextDeletingChat")
const isAddWebsiteModalOpenAtom = reatomBoolean(false, "contextAddWebsiteOpen")
const webContextItemsAtom = atom<ContextItemRecord[]>([], "contextWebItems")
const linkedItemIdsAtom = atom<Set<string>>(new Set(), "contextLinkedItemIds")
const loadingItemsAtom = atom<Set<string>>(new Set(), "contextLoadingItems")
const searchQueryAtom = atom("", "contextSearchQuery")
const searchResultsAtom = atom<(ContextItemRecord & { snippet?: string })[]>([], "contextSearchResults")
const isSearchingAtom = reatomBoolean(false, "contextSearchLoading")
const searchTimeoutAtom = atom<ReturnType<typeof setTimeout> | null>(null, "contextSearchTimeout")
const containerRefAtom = atom<HTMLDivElement | null>(null, "contextContainer")
const addLinkButtonRefAtom = atom<HTMLButtonElement | null>(null, "contextAddLinkButton")
const addUrlAtom = atom("", "contextAddUrl")
const addLoadingAtom = reatomBoolean(false, "contextAddLoading")
const addErrorAtom = atom<string | null>(null, "contextAddError")
const addPositionAtom = atom({ top: 0, left: 0 }, "contextAddPosition")

const contextAuthAtom = reatomBoolean(false, "contextAuth")
const contextActiveThreadIdAtom = atom<string | null>(null, "contextActiveThread")
const contextOnContextItemsChangeAtom = atom<(() => void) | null>(null, "contextItemsChangeCb")
const contextOnDeleteChatAtom = atom<((chatId: string) => void) | null>(null, "contextDeleteChatCb")

const fetchContextItems = async () => {
  if (!contextAuthAtom()) return
  try {
    const res = await fetch("/api/context-items", {
      method: "POST",
      credentials: "include",
      headers: withJazzAuthHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ action: "getItems" }),
    })
    if (res.ok) {
      const data = (await res.json()) as { items: ContextItemRecord[] }
      webContextItemsAtom.set(data.items.filter((i) => i.type === "url"))
    }
  } catch (err) {
    console.error("Failed to fetch context items:", err)
  }
}

const fetchLinkedItems = async () => {
  if (!contextAuthAtom() || !contextActiveThreadIdAtom()) {
    linkedItemIdsAtom.set(new Set())
    return
  }
  try {
    const res = await fetch("/api/context-items", {
      method: "POST",
      credentials: "include",
      headers: withJazzAuthHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        action: "getThreadItems",
        threadId: contextActiveThreadIdAtom()
          ? Number(contextActiveThreadIdAtom())
          : undefined,
      }),
    })
    if (res.ok) {
      const data = (await res.json()) as { items: ContextItemRecord[] }
      linkedItemIdsAtom.set(new Set(data.items.map((i) => i.id)))
    }
  } catch (err) {
    console.error("Failed to fetch linked items:", err)
  }
}

effect(() => {
  if (!contextAuthAtom()) return
  fetchContextItems()
}, "contextFetchItems")

effect(() => {
  fetchLinkedItems()
}, "contextFetchLinkedItems")

effect(() => {
  const items = webContextItemsAtom()
  if (!contextAuthAtom()) return
  const hasRefreshing = items.some((item) => item.refreshing)
  if (!hasRefreshing) return
  const interval = setInterval(fetchContextItems, 2000)
  return () => clearInterval(interval)
}, "contextPolling")

effect(() => {
  if (!isDraggingAtom()) return
  const container = containerRefAtom()
  if (!container) return

  const handleMouseMove = (e: MouseEvent) => {
    const containerRect = container.getBoundingClientRect()
    const newHeight = e.clientY - containerRect.top - 50

    const collapseThreshold = 80
    const minHeight = 150
    const maxHeight = containerRect.height - 250

    if (newHeight < collapseThreshold) {
      isThreadsOpenAtom.set(false)
    } else if (newHeight >= minHeight && newHeight <= maxHeight) {
      if (!isThreadsOpenAtom()) {
        isThreadsOpenAtom.set(true)
      }
      threadsHeightAtom.set(newHeight)
    } else if (newHeight >= collapseThreshold && newHeight < minHeight) {
      if (!isThreadsOpenAtom()) {
        isThreadsOpenAtom.set(true)
      }
      threadsHeightAtom.set(minHeight)
    }
  }

  const handleMouseUp = () => {
    isDraggingAtom.set(false)
  }

  window.addEventListener("mousemove", handleMouseMove)
  window.addEventListener("mouseup", handleMouseUp)

  return () => {
    window.removeEventListener("mousemove", handleMouseMove)
    window.removeEventListener("mouseup", handleMouseUp)
  }
}, "contextDragging")

effect(() => {
  if (!isAddWebsiteModalOpenAtom()) return
  const button = addLinkButtonRefAtom()
  if (!button) return
  const rect = button.getBoundingClientRect()
  addPositionAtom.set({
    top: rect.top - 30,
    left: rect.right + 12,
  })
}, "contextAddPosition")

function CollapsiblePanel({
  title,
  icon: Icon,
  isOpen,
  onToggle,
  headerActions,
  children,
  height,
  isDragging = false,
}: CollapsiblePanelProps) {
  const isFlexHeight = height === "flex-1"

  return (
    <div
      className={`gen-collapsible-panel border bg-inherit rounded-xl border-slate-500/15 flex flex-col ${
        !isDragging ? "transition-all duration-300" : ""
      } ${isFlexHeight && isOpen ? "flex-1" : ""}`}
      style={!isFlexHeight && isOpen ? { height } : undefined}
    >
      <div
        className={`gen-collapsible-header flex items-center justify-between p-2 bg-[#0b0d15] w-full transition-all duration-300 ${
          isOpen ? "border-b border-slate-500/15 rounded-t-xl" : "rounded-xl"
        }`}
      >
        <div className="flex items-center gap-2">
          <Icon
            className="w-8 h-8 text-teal-500 transition-transform duration-300"
            strokeWidth={2}
          />
          <span className="text-white font-medium text-[13px]">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {headerActions}
          <div className="relative w-5 h-5 flex items-center justify-center">
            <ChevronDown
              onClick={onToggle}
              className={`absolute cursor-pointer transition-all duration-200 text-neutral-400 group-hover:text-white w-3.5 h-3.5 ${
                isOpen ? "opacity-100 rotate-0" : "opacity-0 rotate-90"
              }`}
              strokeWidth={1}
            />
            <ChevronRight
              onClick={onToggle}
              className={`absolute cursor-pointer transition-all duration-200 text-neutral-400 group-hover:text-white w-3.5 h-3.5 ${
                isOpen ? "opacity-0 -rotate-90" : "opacity-100 rotate-0"
              }`}
              strokeWidth={1}
            />
          </div>
        </div>
      </div>

      <div
        className={`gen-collapsible-content transition-all duration-300 ease-in-out overflow-hidden ${
          isOpen
            ? "opacity-100 bg-[#181921d9]/50 text-neutral-500 font-semibold rounded-b-xl px-0 py-4 overflow-y-auto flex-1"
            : "opacity-0 max-h-0 py-0"
        }`}
      >
        {children}
      </div>
    </div>
  )
}

const AddWebsiteModal = reatomComponent(() => {
  const isOpen = isAddWebsiteModalOpenAtom()
  const handleAdd = async () => {
    const rawUrl = addUrlAtom().trim()
    if (!rawUrl) return

    addLoadingAtom.set(true)
    addErrorAtom.set(null)

    try {
      let normalizedUrl = rawUrl
      if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
        normalizedUrl = `https://${normalizedUrl}`
      }

      const response = await fetch("/api/context-items", {
        method: "POST",
        credentials: "include",
        headers: withJazzAuthHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          action: "addUrl",
          url: normalizedUrl,
          threadId: contextActiveThreadIdAtom()
            ? Number(contextActiveThreadIdAtom())
            : undefined,
        }),
      })

      if (response.status === 401) {
        window.location.href = "/auth"
        return
      }

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error || "Failed to add URL")
      }

      addUrlAtom.set("")
      isAddWebsiteModalOpenAtom.set(false)
      contextOnContextItemsChangeAtom()?.()
      fetchContextItems()
      fetchLinkedItems()
    } catch (err) {
      addErrorAtom.set(err instanceof Error ? err.message : "Failed to add URL")
    } finally {
      addLoadingAtom.set(false)
    }
  }

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter" && !addLoadingAtom()) {
      handleAdd()
    }
  }

  if (!isOpen) return null

  const position = addPositionAtom()

  return (
    <div className="fixed inset-0 z-50" onClick={() => isAddWebsiteModalOpenAtom.set(false)}>
      <div
        className="absolute bg-[#1e202d]/60 backdrop-blur-md flex flex-col gap-3 rounded-2xl p-5 w-full max-w-[400px] shadow-xl border border-slate-200/5 box-shadow-[1px_0.5px_10px_0_rgba(0,0,0,0.4)_inset]"
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white text-sm">Add website</h2>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={addUrlAtom()}
            onChange={(e) => addUrlAtom.set(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="example.com"
            disabled={addLoadingAtom()}
            autoFocus
            className="flex-1 bg-[#0f1117]/40 rounded-lg px-4 py-2 text-white text-sm placeholder:text-neutral-500 focus:outline-none disabled:opacity-50"
            style={{ boxShadow: "1px 0.5px 10px 0 rgba(0,0,0,0.4) inset" }}
          />
          <button
            onClick={handleAdd}
            disabled={addLoadingAtom() || !addUrlAtom().trim()}
            className="px-4 cursor-pointer py-1 w-fit bg-teal-600 hover:bg-teal-700 disabled:bg-teal-600/50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors"
          >
            {addLoadingAtom() ? "Adding..." : "Add"}
          </button>
        </div>

        {addErrorAtom() && <p className="text-red-400 text-xs">{addErrorAtom()}</p>}

        <p className="text-neutral-500 text-xs">
          URL content will be fetched and made available as context for your
          chats.
        </p>
      </div>
    </div>
  )
})

export default function ContextPanel({
  chats,
  activeChatId = null,
  isAuthenticated = false,
  profile = null,
  onContextItemsChange,
  onToggleSidebar,
  onDeleteChat,
  layout = "sidebar",
  showThreads = true,
  onActivatePersonal,
}: ContextPanelProps) {
  contextAuthAtom.set(isAuthenticated)
  contextActiveThreadIdAtom.set(activeChatId ?? null)
  contextOnContextItemsChangeAtom.set(onContextItemsChange ?? null)
  contextOnDeleteChatAtom.set(onDeleteChat ?? null)

  const openSections = openSectionsAtom()
  const isContextOpen = isContextOpenAtom()
  const isThreadsOpen = isThreadsOpenAtom()
  const isPersonalOpen = isPersonalOpenAtom()
  const threadsHeight = threadsHeightAtom()
  const isDragging = isDraggingAtom()
  const deletingChatId = deletingChatIdAtom()
  const webContextItems = webContextItemsAtom()
  const linkedItemIds = linkedItemIdsAtom()
  const loadingItems = loadingItemsAtom()
  const searchQuery = searchQueryAtom()
  const searchResults = searchResultsAtom()
  const isSearching = isSearchingAtom()

  const isDesktop =
    typeof window !== "undefined" &&
    typeof window.electron?.ai?.openPalette === "function"
  const showHeader = showThreads || !isDesktop || !!onToggleSidebar
  const containerClass =
    layout === "full"
      ? "h-full flex flex-col gap-2 w-full max-w-none"
      : "h-screen flex flex-col gap-2 w-full max-w-[300px]"

  const profileInitial =
    profile?.name?.slice(0, 1) ??
    profile?.email?.slice(0, 1)?.toUpperCase() ??
    "G"
  const profileImage = profile?.image ?? null

  const activeThreadId = activeChatId ?? null

  const handleSearch = (query: string) => {
    searchQueryAtom.set(query)

  if (searchTimeoutAtom()) {
    clearTimeout(searchTimeoutAtom()!)
    searchTimeoutAtom.set(null)
  }

    if (query.length < 2) {
      searchResultsAtom.set([])
      isSearchingAtom.set(false)
      return
    }

    isSearchingAtom.set(true)

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch("/api/context-items", {
          method: "POST",
          credentials: "include",
          headers: withJazzAuthHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ action: "search", query }),
        })
        if (res.ok) {
          const data = (await res.json()) as {
            items: (ContextItemRecord & { snippet?: string })[]
          }
          searchResultsAtom.set(data.items)
        }
      } catch (err) {
        console.error("Search failed:", err)
      } finally {
        isSearchingAtom.set(false)
      }
    }, 300)

    searchTimeoutAtom.set(timeout)
  }

  const handleToggleLink = async (itemId: string) => {
    if (!activeThreadId) return
    const isLinked = linkedItemIds.has(itemId)
    loadingItemsAtom.set(new Set(loadingItems).add(itemId))
    try {
      await fetch("/api/context-items", {
        method: "POST",
        credentials: "include",
        headers: withJazzAuthHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          action: isLinked ? "unlinkFromThread" : "linkToThread",
          itemId,
          threadId: activeThreadId ? Number(activeThreadId) : undefined,
        }),
      })
      linkedItemIdsAtom.set((prev) => {
        const next = new Set(prev)
        if (isLinked) next.delete(itemId)
        else next.add(itemId)
        return next
      })
      onContextItemsChange?.()
    } catch (err) {
      console.error("Failed to toggle link:", err)
    } finally {
      loadingItemsAtom.set((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleRefreshItem = async (itemId: string) => {
    loadingItemsAtom.set(new Set(loadingItems).add(itemId))
    try {
      await fetch("/api/context-items", {
        method: "POST",
        credentials: "include",
        headers: withJazzAuthHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ action: "refreshUrl", itemId }),
      })
      webContextItemsAtom.set((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, refreshing: true } : i)),
      )
    } catch (err) {
      console.error("Failed to refresh:", err)
    } finally {
      loadingItemsAtom.set((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    loadingItemsAtom.set(new Set(loadingItems).add(itemId))
    try {
      await fetch("/api/context-items", {
        method: "POST",
        credentials: "include",
        headers: withJazzAuthHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ action: "deleteItem", itemId }),
      })
      webContextItemsAtom.set((prev) => prev.filter((i) => i.id !== itemId))
      linkedItemIdsAtom.set((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
      onContextItemsChange?.()
    } catch (err) {
      console.error("Failed to delete:", err)
    } finally {
      loadingItemsAtom.set((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const contextSections = [
    {
      id: "blocks",
      label: "Blocks",
      icon: Blocks,
      count: 0,
      hasChevron: false,
    },
    {
      id: "files",
      label: "Files",
      icon: File,
      count: 0,
      hasChevron: true,
    },
    {
      id: "web",
      label: "Web",
      icon: Globe,
      count: webContextItems.length,
      hasChevron: true,
    },
  ]

  const toggleSection = (id: string) => {
    openSectionsAtom.set((prev) => ({
      ...prev,
      [id]: !prev[id as keyof typeof prev],
    }))
  }

  const handleMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault()
    isDraggingAtom.set(true)
  }

  const handleDeleteChat = async (
    event: ReactMouseEvent<HTMLButtonElement>,
    chatId: string,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (deletingChatId) return

    try {
      deletingChatIdAtom.set(chatId)
      contextOnDeleteChatAtom()?.(chatId)
    } catch (error) {
      console.error("[contextPanel] failed to delete chat", { chatId, error })
    } finally {
      deletingChatIdAtom.set(null)
    }
  }

  return (
    <div
      ref={(node) => containerRefAtom.set(node)}
      className={`gen-context-panel ${containerClass}`}
    >
      {showHeader && (
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            {isAuthenticated && !isDesktop ? (
              <a
                href="/settings"
                className="flex items-center justify-center w-7 h-7 rounded-full bg-teal-600 hover:bg-teal-500 transition-colors duration-200 overflow-hidden"
                aria-label="Profile settings"
              >
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white text-xs font-medium">
                    {profileInitial}
                  </span>
                )}
              </a>
            ) : null}
            {!isAuthenticated && !isDesktop ? (
              <a
                href="/auth"
                className="flex items-center gap-2 text-neutral-300 hover:text-white transition-colors duration-200"
              >
                <LogIn className="w-4 h-4" strokeWidth={2} />
                <span className="text-[13px]">Login</span>
              </a>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors duration-200"
                aria-label="Collapse sidebar"
              >
                <PanelRight className="w-4 h-4 cursor-pointer" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      )}

      {showThreads && chats.length > 0 && (
        <CollapsiblePanel
          title="Personal"
          icon={User}
          isOpen={isPersonalOpen}
          onToggle={() => isPersonalOpenAtom.set(!isPersonalOpen)}
        >
          <div className="px-3 space-y-3 text-[12px] text-neutral-300">
            <div className="rounded-lg border border-white/5 bg-black/30 p-3">
              <p className="text-xs text-neutral-400">
                Keep a dedicated thread for personal notes and experiments.
              </p>
              <button
                type="button"
                onClick={() => onActivatePersonal?.()}
                disabled={!onActivatePersonal}
                className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  onActivatePersonal
                    ? "bg-teal-500/20 text-teal-200 hover:bg-teal-500/30"
                    : "cursor-not-allowed bg-white/5 text-white/30"
                }`}
              >
                Open personal thread
              </button>
            </div>
          </div>
        </CollapsiblePanel>
      )}

      {showThreads && (
        <div style={isDragging ? { transition: "none" } : undefined}>
          <CollapsiblePanel
            title="Threads"
            icon={Threads}
            isOpen={isThreadsOpen}
            onToggle={() => isThreadsOpenAtom.set(!isThreadsOpen)}
            height={`${threadsHeight}px`}
            headerActions={
              <a
                href="/"
                className={`pr-2 text-neutral-200 hover:text-white rounded-lg text-[11px] cursor-pointer flex items-center gap-1.5 transition-colors duration-200 ${
                  isThreadsOpen
                    ? ""
                    : "bg-white/5 px-2 py-1 box-shadow-[0_0_10px_0_rgba(0,0,0,0.5)] hover:bg-white/6 rounded-lg"
                }`}
              >
                <Plus className="w-4 h-4" strokeWidth={2} />
                <span>New</span>
              </a>
            }
          >
            <p className="text-xs text-neutral-500 font-semibold">RECENT</p>
            {chats.length === 0 ? (
              <p className="px-2 pt-2 text-xs text-neutral-600">
                Start a conversation to see it here.
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {chats.map((chat) => {
                  const isActive = chat.id.toString() === activeChatId
                  const displayTitle = chat.title?.trim() ?? "Untitled chat"
                  const isDeleting = deletingChatId === chat.id.toString()

                  return (
                    <div key={chat.id} className="group relative">
                      <a
                        href={`/c/${chat.id}`}
                        className={`flex items-center text-[13px] gap-2 py-2 px-2 pr-8 transition-colors duration-200 rounded-lg ${
                          isActive
                            ? "bg-white/5 text-white"
                            : "text-neutral-300 hover:text-white hover:bg-white/5"
                        } ${isDeleting ? "opacity-50" : ""}`}
                      >
                        <MessageCircle
                          className={`w-3.5 h-3.5 f ${
                            isActive ? "text-teal-400" : "text-teal-400/50"
                          }`}
                          strokeWidth={2}
                        />
                        <span className="truncate">{displayTitle}</span>
                      </a>
                      <button
                        type="button"
                        aria-label="Delete chat"
                        disabled={isDeleting}
                        onClick={(event) =>
                          handleDeleteChat(event, chat.id.toString())
                        }
                        className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-400 transition-all duration-200 opacity-0 invisible group-hover:visible group-hover:opacity-100 focus-visible:visible focus-visible:opacity-100 bg-transparent ${
                          isDeleting
                            ? "cursor-wait"
                            : "hover:text-white focus-visible:outline-1 focus-visible:outline-white/50"
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </CollapsiblePanel>
        </div>
      )}

      {showThreads && (isThreadsOpen || isContextOpen) && (
        <div
          onMouseDown={handleMouseDown}
          className="gen-context-divider flex items-center justify-center cursor-row-resize group transition-all duration-300 -my-1.5 animate-in fade-in zoom-in-95"
        >
          <Ellipsis className="w-6 h-4 text-neutral-600 group-hover:text-neutral-400 transition-all duration-300" />
        </div>
      )}

      <CollapsiblePanel
        title="Context"
        icon={Context}
        isOpen={isContextOpen}
        onToggle={() => isContextOpenAtom.set(!isContextOpen)}
        height="flex-1"
      >
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search websites..."
            className="w-full bg-[#0f1117]/60 rounded-lg pl-9 pr-8 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-all"
            style={{ boxShadow: "1px 0.5px 10px 0 rgba(0,0,0,0.4) inset" }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isSearching && (
            <div className="absolute right-8 top-1/2 -translate-y-1/2">
              <RefreshCw className="w-3 h-3 text-teal-400 animate-spin" />
            </div>
          )}
        </div>

        {searchQuery.length >= 2 && (
          <div className="mb-4">
            {searchResults.length === 0 && !isSearching ? (
              <p className="text-xs text-neutral-600 px-2">No results found</p>
            ) : (
              <div className="flex flex-col gap-1">
                {searchResults.map((item) => {
                  const isLinked = linkedItemIds.has(item.id)
                  const isLoading = loadingItems.has(item.id)
                  return (
                    <div
                      key={item.id}
                      className={`group flex flex-col gap-1 py-2 px-2 rounded-lg transition-colors ${
                        isLinked
                          ? "bg-teal-500/10 border border-teal-500/20"
                          : "hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Globe
                          className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0"
                          strokeWidth={2}
                        />
                        <span
                          className="flex-1 text-[12px] text-neutral-300 truncate"
                          title={item.url ?? item.name}
                        >
                          {item.name}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {activeThreadId && (
                            <button
                              type="button"
                              onClick={() => handleToggleLink(item.id)}
                              disabled={isLoading}
                              className={`p-1 rounded transition-colors ${
                                isLinked
                                  ? "text-teal-400 hover:text-teal-300"
                                  : "text-neutral-500 hover:text-white"
                              }`}
                              title={
                                isLinked
                                  ? "Unlink from thread"
                                  : "Link to thread"
                              }
                            >
                              {isLinked ? (
                                <Unlink className="w-3 h-3" />
                              ) : (
                                <Link2 className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      {item.snippet && (
                        <p
                          className="text-[11px] text-neutral-500 line-clamp-2 ml-5 [&_mark]:bg-teal-500/30 [&_mark]:text-teal-300 [&_mark]:rounded [&_mark]:px-0.5"
                          // biome-ignore lint/security/noDangerouslySetInnerHtml: Snippet is safe HTML from server
                          dangerouslySetInnerHTML={{ __html: item.snippet }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {!searchQuery && (
          <div className="flex justify-between text-sm mb-4 px-2">
            <span className="text-neutral-400">0 tokens</span>
          </div>
        )}

        <div className="flex flex-col gap-0.5">
          {contextSections.map((section) => {
            const Icon = section.icon
            const isOpen = openSections[section.id as keyof typeof openSections]

            return (
              <div key={section.id}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex items-center justify-between group py-2 px-2 cursor-pointer transition-colors duration-200 w-full"
                >
                  <div className="flex items-center gap-2">
                    {section.hasChevron &&
                      (isOpen ? (
                        <ChevronDown
                          className="w-4 h-4 text-neutral-400 group-hover:text-white"
                          strokeWidth={2}
                        />
                      ) : (
                        <ChevronRight
                          className="w-4 h-4 text-neutral-400 group-hover:text-white"
                          strokeWidth={2}
                        />
                      ))}
                    <Icon className="w-4 h-4 text-white" strokeWidth={2} />
                    <span className="text-md text-neutral-300 group-hover:text-white">
                      {section.label}
                    </span>
                  </div>
                  <span className="text-xs text-neutral-500 bg-white/4 px-2.5 py-0.5 rounded-lg group-hover:text-neutral-400 transition-colors duration-300">
                    {section.count}
                  </span>
                </button>

                {section.id === "web" && isOpen && (
                  <div className="ml-8 flex flex-col gap-1 mt-1">
                    {webContextItems.length === 0 ? (
                      <p className="text-xs text-neutral-600 py-1">
                        No URLs added yet
                      </p>
                    ) : (
                      webContextItems.map((item) => {
                        const isLinked = linkedItemIds.has(item.id)
                        const isLoading = loadingItems.has(item.id)
                        return (
                          <div
                            key={item.id}
                            className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors ${
                              isLinked
                                ? "bg-teal-500/10 border border-teal-500/20"
                                : "hover:bg-white/5"
                            }`}
                          >
                            <Globe
                              className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0"
                              strokeWidth={2}
                            />
                            <span
                              className="flex-1 text-[12px] text-neutral-300 truncate"
                              title={item.url ?? item.name}
                            >
                              {item.name}
                            </span>
                            {item.refreshing && (
                              <RefreshCw className="w-3 h-3 text-teal-400 animate-spin" />
                            )}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {activeThreadId && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleLink(item.id)}
                                  disabled={isLoading}
                                  className={`p-1 rounded transition-colors ${
                                    isLinked
                                      ? "text-teal-400 hover:text-teal-300"
                                      : "text-neutral-500 hover:text-white"
                                  }`}
                                  title={
                                    isLinked
                                      ? "Unlink from thread"
                                      : "Link to thread"
                                  }
                                >
                                  {isLinked ? (
                                    <Unlink className="w-3 h-3" />
                                  ) : (
                                    <Link2 className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRefreshItem(item.id)}
                                disabled={isLoading || item.refreshing}
                                className="p-1 rounded text-neutral-500 hover:text-white transition-colors disabled:opacity-50"
                                title="Refresh content"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                disabled={isLoading}
                                className="p-1 rounded text-neutral-500 hover:text-red-400 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <button
            type="button"
            ref={(node) => addLinkButtonRefAtom.set(node)}
            onClick={() => {
              if (!isAuthenticated) {
                window.location.href = "/auth"
                return
              }
              isAddWebsiteModalOpenAtom.set(true)
            }}
            className="flex items-center gap-2 py-2 pr-4 hover:bg-white/4 box-shadow-[1px_0.5px_10px_0_rgba(0,0,0,0.4)_inset] w-fit rounded-lg cursor-pointer transition-colors duration-200"
          >
            <Plus className="w-4 h-4 text-neutral-400" strokeWidth={2} />
            <span className="text-[13px] text-neutral-200">Add link...</span>
          </button>
        </div>
      </CollapsiblePanel>

      <AddWebsiteModal />
    </div>
  )
}
