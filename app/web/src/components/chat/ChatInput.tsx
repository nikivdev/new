import { ChevronDown } from "lucide-react"
import {
  action,
  atom,
  computed,
  effect,
  onEvent,
  reatomBoolean,
  withConnectHook,
  wrap,
} from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"
import { useEffect, useMemo, useState } from "react"

const AVAILABLE_MODELS = [
  {
    id: "cerebras/zai-glm-4.7",
    name: "GLM-4.7",
    provider: "Cerebras",
  },
  {
    id: "deepseek/deepseek-chat-v3-0324",
    name: "DeepSeek V3",
    provider: "DeepSeek",
  },
  {
    id: "google/gemini-2.0-flash-001",
    name: "Gemini 2.0 Flash",
    provider: "Google",
  },
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "Anthropic",
  },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
] as const

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"]

const modelSelectOpenAtom = reatomBoolean(false, 'modelSelectOpen')
const modelSelectContainerRefAtom = atom<HTMLDivElement | null>(null, 'modelSelectContainer').extend(target => ({
  mutableRef: {
    set current(value: HTMLDivElement | null) {
      target.set(value)
    },
  },
}))

const chatInputMessageAtom = atom('', 'chatInputMessage')
const chatInputHasSubmittedAtom = reatomBoolean(false, 'chatInputHasSubmitted')
const chatInputConnectedPathAtom = atom<string | null>(null, 'chatInputConnectedPath')
const chatInputHomePathAtom = atom<string | null>(null, 'chatInputHomePath')
const chatInputTextareaRefAtom = atom<HTMLTextAreaElement | null>(null, 'chatInputTextareaRef').extend(target => ({
  mutableRef: {
    set current(value: HTMLTextAreaElement | null) {
      target.set(value)
    },
  },
}))
const chatInputDisabledAtom = reatomBoolean(false, 'chatInputDisabled')
const cerebrasStatusAtom = atom<
  | {
      enabled: boolean
      model: string
      error?: string
    }
  | null
>(null, 'cerebrasStatus')

const canOpenDesktopContextAtom = computed(() => {
  if (typeof window === 'undefined') return false
  return (
    typeof window.electron?.ai?.openPalette === 'function' &&
    typeof window.electron?.ai?.listWorkspaces === 'function' &&
    typeof window.electron?.ai?.addWorkspace === 'function'
  )
}, 'canOpenDesktopContext')

const refreshConnectedPath = action(async () => {
  if (!window.electron?.ai?.listWorkspaces) return
  try {
    const list = await wrap(window.electron.ai.listWorkspaces())
    const top = list[0]
    chatInputConnectedPathAtom.set(top?.path ?? null)
  } catch {
    chatInputConnectedPathAtom.set(null)
  }
}, 'refreshConnectedPath')

const loadHomePath = action(async () => {
  if (!window.electron?.app?.getPath) return
  try {
    const path = await wrap(window.electron.app.getPath('home'))
    chatInputHomePathAtom.set(path)
  } catch {
    chatInputHomePathAtom.set(null)
  }
}, 'loadHomePath')

// Connect folder is handled via the desktop palette.

const resizeTextarea = action(() => {
  const textarea = chatInputTextareaRefAtom()
  if (!textarea) return

  textarea.style.height = 'auto'
  const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)
  textarea.style.height = `${nextHeight}px`
  textarea.style.overflowY = textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden'
}, 'resizeTextarea')

const loadCerebrasStatus = action(async () => {
  if (typeof window === 'undefined') return
  try {
    const res = await wrap(fetch('/api/debug/env'))
    if (!res.ok) {
      throw new Error(`status ${res.status}`)
    }
    const data = (await wrap(res.json())) as {
      cerebras?: { enabled?: boolean; model?: string }
    }
    cerebrasStatusAtom.set({
      enabled: Boolean(data.cerebras?.enabled),
      model: data.cerebras?.model ?? 'zai-glm-4.7',
    })
  } catch (error) {
    cerebrasStatusAtom.set({
      enabled: false,
      model: 'zai-glm-4.7',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}, 'loadCerebrasStatus')

cerebrasStatusAtom.extend(withConnectHook(loadCerebrasStatus))

effect(() => {
  if (!canOpenDesktopContextAtom()) return
  loadHomePath()
  refreshConnectedPath()

  onEvent(window, 'app:workspace-selected', (event: Event) => {
    const detail = (event as CustomEvent<{ path?: string; mode?: string }>).detail
    if (detail?.path) {
      chatInputConnectedPathAtom.set(detail.path)
    } else {
      refreshConnectedPath()
    }
  })
}, 'desktopContextInit')

effect(() => {
  const container = modelSelectContainerRefAtom()
  if (typeof window === 'undefined') return

  onEvent(window, 'mousedown', (event) => {
    if (!modelSelectOpenAtom()) return
    if (container && !container.contains(event.target as Node)) {
      modelSelectOpenAtom.set(false)
    }
  })

  onEvent(window, 'keydown', (event) => {
    if (!modelSelectOpenAtom()) return
    if (event.key === 'Escape') {
      modelSelectOpenAtom.set(false)
    }
  })
}, 'modelSelectDismiss')

effect(() => {
  const isDisabled = chatInputDisabledAtom()
  chatInputMessageAtom()
  const textarea = chatInputTextareaRefAtom()
  if (!textarea) return

  resizeTextarea()

  if (typeof window === 'undefined') return
  const isSmallScreen = window.matchMedia('(max-width: 639px)').matches
  if (!isSmallScreen || isDisabled) return

  const focus = () => {
    const length = textarea.value.length
    textarea.focus()
    textarea.setSelectionRange(length, length)
  }

  window.requestAnimationFrame(focus)
  window.setTimeout(focus, 220)
}, 'chatInputResize')

function ModelSparkle() {
  return (
    <svg
      className="w-4 h-4"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_1212_3035)">
        <path
          d="M16 8.016C13.9242 8.14339 11.9666 9.02545 10.496 10.496C9.02545 11.9666 8.14339 13.9242 8.016 16H7.984C7.85682 13.9241 6.97483 11.9664 5.5042 10.4958C4.03358 9.02518 2.07588 8.14318 0 8.016L0 7.984C2.07588 7.85682 4.03358 6.97483 5.5042 5.5042C6.97483 4.03358 7.85682 2.07588 7.984 0L8.016 0C8.14339 2.07581 9.02545 4.03339 10.496 5.50397C11.9666 6.97455 13.9242 7.85661 16 7.984V8.016Z"
          fill="url(#paint0_radial_1212_3035)"
          style={{ stopColor: "#9168C0", stopOpacity: 1 }}
        />
      </g>
      <defs>
        <radialGradient
          id="paint0_radial_1212_3035"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(1.588 6.503) rotate(18.6832) scale(17.03 136.421)"
        >
          <stop
            offset="0.067"
            stopColor="#9168C0"
            style={{ stopColor: "#9168C0", stopOpacity: 1 }}
          />
          <stop
            offset="0.343"
            stopColor="#5684D1"
            style={{ stopColor: "#5684D1", stopOpacity: 1 }}
          />
          <stop
            offset="0.672"
            stopColor="#1BA1E3"
            style={{ stopColor: "#1BA1E3", stopOpacity: 1 }}
          />
        </radialGradient>
        <clipPath id="clip0_1212_3035">
          <rect
            width="16"
            height="16"
            fill="white"
            style={{ fill: "white", fillOpacity: 1 }}
          />
        </clipPath>
      </defs>
    </svg>
  )
}

interface ModelSelectProps {
  selectedModel: ModelId
  onChange: (model: ModelId) => void
}

const ModelSelect = reatomComponent(({ selectedModel, onChange }: ModelSelectProps) => {
  const open = modelSelectOpenAtom()
  const selected = AVAILABLE_MODELS.find((m) => m.id === selectedModel)

  return (
    <div ref={modelSelectContainerRefAtom.mutableRef} className="relative select-none">
      <button
        type="button"
        onClick={() => modelSelectOpenAtom.toggle()}
        className="flex items-center gap-2 rounded-xl border border-white/8 bg-linear-to-b from-[#2d2e39] via-[#1e1f28] to-[#1a1b24] px-3 py-1.5 text-left shadow-inner shadow-black/40 hover:border-white/14 transition-colors min-w-[170px]"
      >
        <ModelSparkle />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-white">
            {selected?.name ?? 'Choose model'}
          </span>
        </div>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-neutral-500 transition-transform ${open ? 'rotate-180 text-neutral-300' : ''}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div className="absolute left-0 bottom-full z-20 my-1 max-w-52 overflow-hidden rounded-2xl border border-white/5 bg-[#0b0c11]/95 backdrop-blur-lg box-shadow-xl">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Models
          </div>
          <div className="flex flex-col py-1">
            {AVAILABLE_MODELS.map((model) => {
              const isActive = model.id === selectedModel
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onChange(model.id)
                    modelSelectOpenAtom.set(false)
                  }}
                  className={`flex items-center hover:bg-white/2 rounded-lg gap-3 px-3 py-1 text-sm transition-colors ${isActive ? 'text-white' : 'text-white/65 hover:text-white'}`}
                >
                  <ModelSparkle />
                  <div className="flex flex-col cursor-pointer items-start">
                    <span className="text-[13px] font-semibold leading-tight">
                      {model.name}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})

interface ChatInputProps {
  onSubmit: (message: string) => void
  isLoading: boolean
  selectedModel: ModelId
  onModelChange: (model: ModelId) => void
  limitReached?: boolean
  remainingRequests?: number
  showInlineGreeting?: boolean
  onFocusChange?: (focused: boolean) => void
  agentMode?: boolean
  agentMakeMode?: boolean
  musicMode?: boolean
  uiMode?: boolean
  uiPage?: string | null
  uiInputLock?: boolean
  queuedCount?: number
  envMode?: boolean
  flowMode?: boolean
  explainMode?: boolean
  onExplainModeToggle?: () => void
  agentButtons?: {
    id: string
    label: string
    onClick: () => void
    disabled?: boolean
  }[]
}

const MAX_TEXTAREA_HEIGHT = 220

const SLASH_COMMANDS = [
  { value: "/beads ready", label: "Ready issues" },
  { value: "/beads list", label: "List issues" },
  { value: "/beads show ", label: "Show issue" },
  { value: "/beads create ", label: "Create issue" },
  { value: "/beads start ", label: "Start issue" },
  { value: "/beads done ", label: "Close issue" },
  { value: "/beads sync", label: "Sync status" },
  { value: "/beads help", label: "Help" },
] as const

// Command palette actions (available via Cmd+K)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const COMMAND_PALETTE_ACTIONS = [
  { label: "/beads", value: "/beads " },
  { label: "explain", value: "explain " },
  { label: "ai up", value: "is ai up" },
  { label: "flow", value: "status" },
] as const

export const ChatInput = reatomComponent(({
  onSubmit,
  isLoading: _isLoading,
  selectedModel,
  onModelChange,
  limitReached = false,
  remainingRequests,
  showInlineGreeting = false,
  onFocusChange,
  agentMode = false,
  agentMakeMode = false,
  musicMode = false,
  uiMode = false,
  uiPage: _uiPage = null,
  uiInputLock = true,
  queuedCount = 0,
  envMode = false,
  flowMode = false,
  explainMode = false,
  onExplainModeToggle: _onExplainModeToggle,
  agentButtons = [],
}: ChatInputProps) => {
  const message = chatInputMessageAtom()
  const hasSubmittedOnce = chatInputHasSubmittedAtom()
  const homePath = chatInputHomePathAtom()
  const canOpenDesktopContext = canOpenDesktopContextAtom()
  const [slashIndex, setSlashIndex] = useState(0)

  const slashSuggestions = useMemo(() => {
    const trimmed = message.trim()
    if (!trimmed.startsWith('/') || trimmed.includes('\n')) return []
    const results = SLASH_COMMANDS.filter((cmd) =>
      cmd.value.startsWith(trimmed),
    )
    if (results.length > 0) return results
    return SLASH_COMMANDS
  }, [message])

  useEffect(() => {
    setSlashIndex(0)
  }, [slashSuggestions.length, message])

  const showLimitReached = limitReached && !canOpenDesktopContext
  const isDisabled = showLimitReached
  chatInputDisabledAtom.set(isDisabled)
  const isUiFocusLocked = uiMode && uiInputLock

  const formatPath = (path: string) => {
    if (homePath && path.startsWith(homePath)) {
      const suffix = path.slice(homePath.length)
      return `~${suffix.startsWith('/') ? suffix : `/${suffix}`}`
    }
    return path
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !isDisabled && !limitReached) {
      onSubmit(message)
      chatInputMessageAtom.set('')
      chatInputHasSubmittedAtom.set(true)
      chatInputTextareaRefAtom()?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((prev) => (prev + 1) % slashSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((prev) =>
          prev === 0 ? slashSuggestions.length - 1 : prev - 1,
        )
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const next = slashSuggestions[slashIndex]
        if (next) {
          chatInputMessageAtom.set(next.value)
          const textarea = chatInputTextareaRefAtom()
          if (textarea) {
            window.requestAnimationFrame(() => {
              textarea.focus()
              const length = textarea.value.length
              textarea.setSelectionRange(length, length)
            })
          }
        }
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  useEffect(() => {
    if (!isUiFocusLocked || isDisabled) return
    const textarea = chatInputTextareaRefAtom()
    if (!textarea) return
    const focusTimer = window.setTimeout(() => {
      if (document.activeElement !== textarea) {
        textarea.focus()
        if (typeof textarea.selectionStart === 'number') {
          const length = textarea.value.length
          textarea.setSelectionRange(length, length)
        }
      }
    }, 0)
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || target === textarea) return
      window.setTimeout(() => {
        if (document.activeElement !== textarea) {
          textarea.focus()
          if (typeof textarea.selectionStart === 'number') {
            const length = textarea.value.length
            textarea.setSelectionRange(length, length)
          }
        }
      }, 0)
    }

    window.addEventListener('focusin', handleFocusIn)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('focusin', handleFocusIn)
    }
  }, [isUiFocusLocked, isDisabled])

  return (
    <div className="gen-chat-input-shell px-4 md:relative md:bottom-auto fixed bottom-0 left-0 right-0 bg-[#07080f] pb-[calc(env(safe-area-inset-bottom)+16px)] md:pb-4 z-30">
      {showInlineGreeting && (
        <div className="sm:hidden max-w-4xl mx-auto mb-4 text-center text-white font-semibold text-xl leading-tight">
          How can I help?
        </div>
      )}
      {showLimitReached && (
        <div className="gen-auth-cta max-w-4xl mx-auto mb-3 overflow-hidden rounded-[26px] border border-white/8 bg-linear-to-b from-[#0c1c27] via-[#0a1923] to-[#08141d] shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-4 px-6 py-4">
            <div className="flex-1">
              <div className="text-lg font-semibold text-white">
                Sign in to continue chatting
              </div>
              <div className="text-sm text-neutral-300">
                Get more requests with a free account
              </div>
            </div>
            <a
              href="/auth"
              className="shrink-0 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white bg-linear-to-b from-[#1ab8b0] via-[#0a8f8b] to-[#0ba58a] shadow-[0_16px_48px_rgba(0,0,0,0.45)] transition hover:brightness-110"
            >
              Sign in
            </a>
          </div>
        </div>
      )}
      <form onSubmit={wrap(handleSubmit)}>
        <div
          className={`gen-chat-input-card relative min-h-[2.5em] max-w-4xl mx-auto rounded-3xl border border-neutral-700/30 bg-[#181921d9]/90 px-3 p-4 backdrop-blur-lg transition-all hover:border-neutral-600/40 ${showLimitReached ? 'opacity-80' : ''} ${agentMakeMode ? 'border-cyan-400/35 shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_0_40px_rgba(56,189,248,0.2)]' : musicMode ? 'border-amber-400/35 shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_0_40px_rgba(251,191,36,0.22)]' : agentMode ? 'border-emerald-400/35 shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_0_40px_rgba(16,185,129,0.2)]' : ''}`}
        >
          <textarea
            ref={chatInputTextareaRefAtom.mutableRef}
            autoFocus
            value={message}
            onChange={wrap((e) => chatInputMessageAtom.set(e.target.value))}
            onKeyDown={wrap(handleKeyDown)}
            onFocus={wrap(() => onFocusChange?.(true))}
            onBlur={wrap(() => {
              onFocusChange?.(false)
              if (!isUiFocusLocked || isDisabled) return
              const textarea = chatInputTextareaRefAtom()
              if (!textarea) return
              window.setTimeout(() => {
                if (document.activeElement !== textarea) {
                  textarea.focus()
                  if (typeof textarea.selectionStart === 'number') {
                    const length = textarea.value.length
                    textarea.setSelectionRange(length, length)
                  }
                }
              }, 0)
            })}
            placeholder={
              agentMakeMode
                ? 'Describe the agent you want to create...'
                : musicMode
                  ? 'Describe the computer task you want...'
                : flowMode
                  ? 'status, start <name>, stop <name>, help'
                : explainMode
                  ? 'Explain [topic] or enter path to file/folder...'
                  : hasSubmittedOnce && typeof remainingRequests === 'number'
                    ? `${remainingRequests} request${remainingRequests === 1 ? '' : 's'} remaining`
                    : 'Ask anything...'
            }
            className="w-full max-h-[220px] min-h-[24px] resize-none overflow-y-auto bg-transparent text-[16px] touch-manipulation text-neutral-100 placeholder-neutral-500 focus:outline-none disabled:opacity-60 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-16"
            rows={3}
            disabled={isDisabled}
          />

          {slashSuggestions.length > 0 && (
            <div className="absolute left-3 right-3 bottom-[68px] z-20 rounded-2xl border border-white/10 bg-[#0f111a]/95 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur">
              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.28em] text-white/40">
                Commands
              </div>
              <div className="max-h-56 overflow-y-auto pb-2">
                {slashSuggestions.map((cmd, index) => (
                  <button
                    key={cmd.value}
                    type="button"
                    onClick={() => {
                      chatInputMessageAtom.set(cmd.value)
                      const textarea = chatInputTextareaRefAtom()
                      if (textarea) {
                        window.requestAnimationFrame(() => {
                          textarea.focus()
                          const length = textarea.value.length
                          textarea.setSelectionRange(length, length)
                        })
                      }
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                      index === slashIndex
                        ? 'bg-white/10 text-white'
                        : 'text-white/80 hover:bg-white/5'
                    }`}
                  >
                    <span className="font-semibold">{cmd.value}</span>
                    <span className="text-xs text-white/50">{cmd.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {showLimitReached && (
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-linear-to-b from-black/25 via-transparent to-black/30" />
          )}

          <div className="absolute bottom-0 left-0 p-3 w-full flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {agentMakeMode ? (
                <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-linear-to-b from-[#2d2e39] via-[#1e1f28] to-[#1a1b24] px-3 py-1.5 text-left shadow-inner shadow-black/40 text-white/90 text-xs font-semibold">
                  Agent Make
                </div>
              ) : musicMode ? (
                <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-linear-to-b from-[#2d2e39] via-[#1e1f28] to-[#1a1b24] px-3 py-1.5 text-left shadow-inner shadow-black/40 text-white/90 text-xs font-semibold">
                  Computer Use
                </div>
              ) : envMode ? (
                <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-linear-to-b from-[#2d2e39] via-[#1e1f28] to-[#1a1b24] px-3 py-1.5 text-left shadow-inner shadow-black/40 text-white/90 text-xs font-semibold">
                  Env
                </div>
              ) : flowMode ? (
                <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-linear-to-b from-[#2d2e39] via-[#1e1f28] to-[#1a1b24] px-3 py-1.5 text-left shadow-inner shadow-black/40 text-white/90 text-xs font-semibold">
                  Flow
                </div>
              ) : explainMode ? (
                <div className="flex items-center gap-2 rounded-xl border border-purple-400/20 bg-linear-to-b from-[#2d2e39] via-[#1e1f28] to-[#1a1b24] px-3 py-1.5 text-left shadow-inner shadow-black/40 text-purple-300 text-xs font-semibold">
                  Explain
                </div>
              ) : uiMode ? (
                <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-linear-to-b from-[#2d2e39] via-[#1e1f28] to-[#1a1b24] px-3 py-1.5 text-left shadow-inner shadow-black/40 text-white/90 text-xs font-semibold">
                  UI
                </div>
              ) : agentMode ? (
                <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-linear-to-b from-[#2d2e39] via-[#1e1f28] to-[#1a1b24] px-3 py-1.5 text-left shadow-inner shadow-black/40 text-white/90 text-xs font-semibold">
                  Agent
                </div>
              ) : canOpenDesktopContext ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-linear-to-b from-[#2d2e39] via-[#1e1f28] to-[#1a1b24] px-3 py-1.5 text-left shadow-inner shadow-black/40">
                    <ModelSparkle />
                    <span className="text-white/90 text-xs font-semibold">
                      {AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.name ?? 'Model'}
                    </span>
                  </div>
                </div>
              ) : (
                <ModelSelect
                  selectedModel={selectedModel}
                  onChange={onModelChange}
                />
              )}
              {agentButtons.length > 0 && (
                <>
                  <span className="h-4 w-px bg-white/10" />
                  {agentButtons.map((button) => (
                    <button
                      key={button.id}
                      type="button"
                      onClick={wrap(button.onClick)}
                      disabled={button.disabled}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/80 transition hover:border-white/25 hover:text-white disabled:opacity-40"
                    >
                      {button.label}
                    </button>
                  ))}
                </>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-neutral-400">
              {queuedCount > 0 && (
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/70">
                  Queued {queuedCount}
                </div>
              )}
              <button
                type="submit"
                disabled={!message.trim() || isDisabled}
                className="flex py-2 px-3 cursor-pointer items-center justify-center text-white rounded-[10px] bg-linear-to-b from-[#5b9fbf] via-[#0d817f] to-[#069d7f] transition-colors duration-300 hover:bg-cyan-700 hover:text-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg box-shadow-xl"
                aria-label="Send message"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M0.184054 0.112806C0.258701 0.0518157 0.349387 0.0137035 0.445193 0.00305845C0.540999 -0.00758662 0.637839 0.00968929 0.724054 0.0528059L15.7241 7.55281C15.8073 7.59427 15.8773 7.65812 15.9262 7.73717C15.9751 7.81622 16.001 7.90734 16.001 8.00031C16.001 8.09327 15.9751 8.18439 15.9262 8.26344C15.8773 8.34249 15.8073 8.40634 15.7241 8.44781L0.724054 15.9478C0.637926 15.9909 0.541171 16.0083 0.445423 15.9977C0.349675 15.9872 0.25901 15.9492 0.184331 15.8884C0.109651 15.8275 0.0541361 15.7464 0.0244608 15.6548C-0.00521444 15.5631 -0.0077866 15.4649 0.0170539 15.3718L1.98305 8.00081L0.0170539 0.629806C-0.00790602 0.536702 -0.0054222 0.438369 0.0242064 0.346644C0.053835 0.25492 0.109345 0.173715 0.184054 0.112806ZM2.88405 8.50081L1.27005 14.5568L14.3821 8.00081L1.26905 1.44481L2.88405 7.50081H9.50005C9.63266 7.50081 9.75984 7.55348 9.85361 7.64725C9.94738 7.74102 10.0001 7.8682 10.0001 8.00081C10.0001 8.13341 9.94738 8.26059 9.85361 8.35436C9.75984 8.44813 9.63266 8.50081 9.50005 8.50081H2.88405Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
})

export { AVAILABLE_MODELS }
