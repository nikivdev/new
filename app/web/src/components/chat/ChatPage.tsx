import { Link } from "@tanstack/react-router"
import { LogIn, LogOut, Menu, Moon, PanelLeft, Search, Sun, X } from "lucide-react"
import {
  action,
  atom,
  computed,
  effect,
  onEvent,
  reatomBoolean,
  wrap,
} from "@/shared/reatom/core"
import type { Frame } from "@/shared/reatom/core"
import { reatomComponent, useFrame } from "@reatom/react"
import { useEffect, useRef, useState } from "react"
import { useJazzAuth } from "@/lib/jazz/hooks"
import { withJazzAuthHeaders } from "@/lib/jazz/headers"
import {
  BlockIdList,
  ChatMessage,
  ChatMessageList,
  ChatThread,
  ContextItemIdList,
  GenAccount,
} from "@/lib/jazz/schema"
import { useAccount } from "jazz-tools/react"
import { Group } from "jazz-tools"
import { reatomGrooveDatabase } from "@/jazz2/useGrooveDatabase"
import grooveSchema from "@/jazz2/schema.sql?raw"
import { app } from "@/jazz2/generated/client"
import ContextPanel from "@/components/Context-panel"
import { ChatInput } from "./ChatInput"
import { streamSseText } from "@/shared/reatom/streaming"
import { EmptyChatState, MessageList } from "./ChatMessages"
import { ChatUsageDisplay } from "./ChatUsageDisplay"
import type { Message } from "./MessageBubble"
import { selectedModelAtom } from "@/features/chat/model/selected-model"
import { isSmallScreenAtom } from "@/shared/reatom/media"
import { matchesShortcut, shortcutMapAtom } from "@/features/settings/shortcuts"
import {
  explainModeAtom,
  ExplainViewer,
  generateExplanation,
  setExplainContext,
} from "@/features/explain"
import { appThemeAtom, toggleAppTheme } from "@/shared/theme"

const FREE_REQUEST_LIMIT = 2
const GUEST_REPO_PATH = '__guest__'

type GuestMessage = {
  id: number
  role: "user" | "assistant"
  content: string
}

type QueuedPrompt = {
  id: number
  content: string
}

type AgentState = {
  enabled: boolean
  repoRoot: string | null
  worktreePath: string | null
  dirtyCount: number
}

type AgentSpec = {
  job?: string
  prompt?: string
  matchedOn?: string[]
  deps?: string[]
}

type AgentMakePreview = {
  name: string
  spec: AgentSpec
  json: string
  source: 'base' | 'custom'
  matchedTerms: string[]
}

const baseAgents: Record<string, AgentSpec> = {
  env: {
    job: [
      "Use Flow env store to save env vars.",
      "Output a single bash command only.",
      "Prefer: FLOW_ENV_BACKEND=local env-help save [--env <name>] [service] <raw text>.",
      "If user already provides KEY=VALUE pairs, pass them through as-is.",
      "If user mentions an env name, include --env <name>.",
      "Do not echo secrets or add extra text.",
    ].join(" "),
    matchedOn: ["environment", "env", "secret", "api key", "token", "key"],
    deps: ["flow", "env-help"],
  },
  fish: {
    job: "if user mentions wrapping, then create function to wrap the tool or generally do fish related actions",
    matchedOn: ["fish shell", "wrapping"],
  },
  "agent-optimize": {
    job: [
      "Optimize a hive agent prompt using DSPy.",
      "Output a single bash command only.",
      "Input format: <agent_name> <guidance text>.",
      "Command must run:",
      "uv run --project /Users/nikiv/repos/stanfordnlp/dspy python /Users/nikiv/config/i/lin/scripts/agent-optimize.py --task \"<raw input>\"",
      "Do not add extra text.",
    ].join(" "),
    matchedOn: ["agent-optimize", "optimize prompt", "prompt optimize"],
  },
  clean: {
    prompt:
      "rename readme.md to readme.md and other files like this, I prefer lower case",
  },
  research: {
    job: "deep document/codebase analysis. Run: cd ~/repos/Hmbown/aleph && uv run python -m agents.hive_bridge research '<query>' <sources>",
    matchedOn: ["research", "analyze", "investigate", "deep dive"],
  },
  review: {
    job: "code review. Run: cd ~/repos/Hmbown/aleph && uv run python -m agents.hive_bridge review <files>",
    matchedOn: ["review", "code review", "pr review"],
  },
  logs: {
    job: "log analysis. Run: cd ~/repos/Hmbown/aleph && uv run python -m agents.hive_bridge logs '<query>' <log_files>",
    matchedOn: ["logs", "log analysis", "errors", "debug"],
  },
}

const normalizeAgentText = (value: string) => value.toLowerCase()

const trimHyphens = (value: string) => value.replace(/^-+|-+$/g, "")

const slugifyAgentName = (input: string) => {
  const normalized = input.toLowerCase()
  let out = ""
  let lastDash = false
  for (const ch of normalized) {
    const isAlphaNum = (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")
    if (isAlphaNum) {
      out += ch
      lastDash = false
      continue
    }
    if (ch === " " || ch === "-" || ch === "_") {
      if (!lastDash) {
        out += "-"
        lastDash = true
      }
    }
  }
  const trimmed = trimHyphens(out)
  if (!trimmed) return "agent"
  return trimmed.length > 48 ? trimmed.slice(0, 48) : trimmed
}

const generateProgramName = (prompt: string) => {
  const words: string[] = []
  let first = true
  for (const wordView of prompt.split(" ")) {
    const word = wordView.trim()
    if (!word || word.length >= 15) {
      continue
    }
    if (
      word === "the" ||
      word === "a" ||
      word === "an" ||
      word === "all" ||
      word === "in" ||
      word === "of" ||
      word === "to" ||
      word === "by"
    ) {
      continue
    }
    if (first) {
      words.push(word.toLowerCase())
      first = false
    } else {
      words.push(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    }
  }
  return words.length === 0 ? "command" : words.join("")
}

const findBestAgentMatch = (prompt: string) => {
  const normalized = normalizeAgentText(prompt)
  let best:
    | { name: string; spec: AgentSpec; score: number; matchedTerms: string[] }
    | null = null
  for (const [name, spec] of Object.entries(baseAgents)) {
    const matchedTerms: string[] = []
    let score = 0
    if (normalized.includes(name.toLowerCase())) {
      score += 2
      matchedTerms.push(name)
    }
    for (const term of spec.matchedOn ?? []) {
      const normalizedTerm = term.toLowerCase()
      if (!normalizedTerm) continue
      if (normalized.includes(normalizedTerm)) {
        score += 1
        matchedTerms.push(term)
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { name, spec, score, matchedTerms }
    }
  }
  return best
}

const buildAgentMakePreview = (prompt: string): AgentMakePreview => {
  const match = findBestAgentMatch(prompt)
  if (match) {
    return {
      name: match.name,
      spec: match.spec,
      json: JSON.stringify({ name: match.name, ...match.spec }, null, 2),
      source: "base",
      matchedTerms: match.matchedTerms,
    }
  }
  const suggestedName = generateProgramName(prompt)
  const name =
    suggestedName && suggestedName !== "command"
      ? suggestedName
      : slugifyAgentName(prompt)
  const spec: AgentSpec = { job: prompt }
  return {
    name,
    spec,
    json: JSON.stringify({ name, ...spec }, null, 2),
    source: "custom",
    matchedTerms: [],
  }
}

const grooveDbModel = reatomGrooveDatabase('gen-groove', grooveSchema)

const guestIsStreamingAtom = reatomBoolean(false, 'guestIsStreaming')
const guestStreamingContentAtom = atom('', 'guestStreamingContent')
const guestMessagesAtom = atom<GuestMessage[]>([], 'guestMessages')
const guestQueuedPromptsAtom = atom<QueuedPrompt[]>([], 'guestQueuedPrompts')
const guestPendingUserMessageAtom = atom<string | null>(null, 'guestPendingUserMessage')
const guestThreadIdAtom = atom<string | null>(null, 'guestThreadId')
const guestDesktopWorkspaceIdAtom = atom<string | null>(null, 'guestDesktopWorkspaceId')
const guestDesktopWorkspacePathAtom = atom<string | null>(null, 'guestDesktopWorkspacePath')
const guestDesktopRequestIdAtom = atom<string | null>(null, 'guestDesktopRequestId')
const guestPreviewBusyAtom = reatomBoolean(false, 'guestPreviewBusy')
const guestPreviewLoadingAtom = reatomBoolean(false, 'guestPreviewLoading')
const guestUiBaseUrlAtom = atom('http://localhost:6100', 'guestUiBaseUrl')
const guestMusicBaseUrlAtom = atom('https://example.com', 'guestMusicBaseUrl')
const guestComputerUrlAtom = atom('', 'guestComputerUrl')
const guestReasoningStreamAtom = atom('', 'guestReasoningStream')
const guestTraceStreamAtom = atom('', 'guestTraceStream')
const guestTraceAutoAtom = reatomBoolean(false, 'guestTraceAuto')
const guestPreviewHoldAtom = reatomBoolean(true, 'guestPreviewHold')
const guestUiInputLockAtom = reatomBoolean(true, 'guestUiInputLock')
const guestAgentStateAtom = atom<AgentState | null>(null, 'guestAgentState')
const guestAgentBusyAtom = reatomBoolean(false, 'guestAgentBusy')
const guestAgentActionsVisibleAtom = reatomBoolean(false, 'guestAgentActionsVisible')
const guestAgentDiffOpenAtom = reatomBoolean(false, 'guestAgentDiffOpen')
const guestAgentDiffAtom = atom<string | null>(null, 'guestAgentDiff')
const guestAgentReadyTickAtom = atom(0, 'guestAgentReadyTick')
const guestMobileMenuOpenAtom = reatomBoolean(false, 'guestMobileMenuOpen')
const guestSidebarCollapsedAtom = reatomBoolean(false, 'guestSidebarCollapsed')
const guestUiModeAtom = reatomBoolean(false, 'guestUiMode')
const guestMusicModeAtom = reatomBoolean(false, 'guestMusicMode')
const guestUiPageAtom = atom<string | null>(null, 'guestUiPage')
const guestEnvModeAtom = reatomBoolean(false, 'guestEnvMode')
const guestFlowModeAtom = reatomBoolean(false, 'guestFlowMode')
const guestAgentMakeModeAtom = reatomBoolean(false, 'guestAgentMakeMode')
const commandPaletteOpenAtom = reatomBoolean(false, 'commandPaletteOpen')
// Note: explainModeAtom is imported from @/features/explain
const guestAgentMakePreviewAtom = atom<AgentMakePreview | null>(null, 'guestAgentMakePreview')
const guestInputFocusedAtom = reatomBoolean(false, 'guestInputFocused')
const activeChatModeAtom = atom<'guest' | 'auth'>('guest', 'activeChatMode')
const guestMessagesEndRefAtom = atom<HTMLDivElement | null>(null, 'guestMessagesEndRef').extend(target => ({
  mutableRef: {
    set current(value: HTMLDivElement | null) {
      target.set(value)
    },
  },
}))
const guestQueuedCountAtom = computed(
  () => guestQueuedPromptsAtom().length,
  'guestQueuedCount',
)
const guestIsDesktopAtom = computed(() => {
  if (typeof window === 'undefined') return false
  return (
    typeof window.electron?.ai?.sendMessage === 'function' &&
    typeof window.electron?.ai?.onEvent === 'function'
  )
}, 'guestIsDesktop')

let desktopRequestId: string | null = null
let desktopWorkspaceIdRef: string | null = null
let desktopWorkspacePathRef: string | null = null
let streamingBuffer = ''
let lastAppendWasAssistant: boolean | null = null
let hasDesktopOutput = false
let pendingReady = false
let pendingReadyTimeout: number | null = null
let desktopFinalizeTimeout: number | null = null
let desktopResponseTimeout: number | null = null
let previewHoldTimeout: number | null = null
let queuedSubmitFrame: Frame | null = null
let queuedDrainTimeout: number | null = null
let desktopInFlight = false
let debugStreamEnabled = false
let debugStreamEl: HTMLPreElement | null = null
let guestRequestEpoch = 0
let guestAbortController: AbortController | null = null
let desktopIgnoreEvents = false
let reasoningStreamState: 'idle' | 'reasoning' | 'answer' = 'idle'

const cancelGuestRequest = () => {
  guestRequestEpoch += 1
  if (guestAbortController) {
    try {
      guestAbortController.abort()
    } catch {
      // ignore abort errors
    }
  }
  guestAbortController = null
}

const beginGuestRequest = () => {
  cancelGuestRequest()
  guestAbortController = new AbortController()
  return { epoch: guestRequestEpoch, signal: guestAbortController.signal }
}

const resetDesktopStreamState = () => {
  streamingBuffer = ''
  lastAppendWasAssistant = null
  hasDesktopOutput = false
  pendingReady = false
  if (pendingReadyTimeout && typeof window !== 'undefined') {
    window.clearTimeout(pendingReadyTimeout)
  }
  pendingReadyTimeout = null
  if (desktopFinalizeTimeout && typeof window !== 'undefined') {
    window.clearTimeout(desktopFinalizeTimeout)
  }
  desktopFinalizeTimeout = null
  if (desktopResponseTimeout && typeof window !== 'undefined') {
    window.clearTimeout(desktopResponseTimeout)
  }
  desktopResponseTimeout = null
  guestPreviewLoadingAtom.set(false)
  desktopRequestId = null
  guestDesktopRequestIdAtom.set(null)
  guestPreviewBusyAtom.set(false)
  desktopIgnoreEvents = true
  desktopInFlight = false
  resetReasoningStream()
}

const resetReasoningStream = () => {
  reasoningStreamState = 'idle'
  guestReasoningStreamAtom.set('')
}

const resetTraceStream = () => {
  guestTraceStreamAtom.set('')
}

const fetchTraceTail = async (limit = 200) => {
  if (typeof window === 'undefined') return ''
  if (!window.electron?.ai?.readTrace) return ''
  try {
    const lines = await window.electron.ai.readTrace(limit)
    return lines.join('\n')
  } catch (error) {
    console.warn('[trace] read failed', error)
    return ''
  }
}

const appendTraceLine = (line: string) => {
  if (!line) return
  guestReasoningStreamAtom.set((prev) => (prev ? `${prev}\n${line}` : line))
}

const emitTraceEvent = (payload: Record<string, unknown>) => {
  if (typeof window === 'undefined') return
  if (!window.electron?.ai?.traceEvent) return
  try {
    void window.electron.ai.traceEvent(payload)
  } catch {
    // ignore trace errors
  }
}

const isCapabilitiesPrompt = (input: string) => {
  const normalized = input.trim().toLowerCase()
  if (!normalized) return false
  if (normalized === 'help' || normalized === 'capabilities') return true
  if (
    normalized === 'tools' ||
    normalized === 'tools?' ||
    normalized === 'what tools' ||
    normalized === 'what tools?' ||
    normalized === 'what tools do you have' ||
    normalized === 'what tools do you have?'
  ) {
    return true
  }
  return (
    normalized === 'what can you do' ||
    normalized === 'what can you do?' ||
    normalized === 'what do you do' ||
    normalized === 'what do you do?' ||
    normalized.includes('what can you help') ||
    normalized.includes('what can you assist') ||
    normalized.includes('show me what you can do')
  )
}

const AI_SERVER_PROJECT = '/Users/nikiv/new/app/api/ts'
const AI_SERVER_DAEMON = 'ai-server'
const AI_SERVER_HEALTH_URL = 'http://127.0.0.1:7331/health'

type AiServerIntent = { action: 'status' | 'start' | 'stop' }

const matchAiServerIntent = (input: string): AiServerIntent | null => {
  const normalized = input.trim().toLowerCase()
  if (!normalized) return null
  if (
    normalized === 'is ai up' ||
    normalized === 'ai up' ||
    normalized === 'ai server status' ||
    normalized === 'ai status' ||
    normalized === 'status ai' ||
    normalized === 'ai server' ||
    normalized === 'ai server?' ||
    normalized === 'ai up?'
  ) {
    return { action: 'status' }
  }
  if (
    normalized === 'start ai server' ||
    normalized === 'start ai' ||
    normalized === 'ai start' ||
    normalized === 'ai server start'
  ) {
    return { action: 'start' }
  }
  if (
    normalized === 'stop ai server' ||
    normalized === 'stop ai' ||
    normalized === 'ai stop' ||
    normalized === 'ai server stop'
  ) {
    return { action: 'stop' }
  }
  return null
}

type BeadsIntent =
  | { action: 'help' }
  | { action: 'ready' }
  | { action: 'list' }
  | { action: 'show'; id: string }
  | { action: 'create'; title: string }
  | { action: 'start'; id: string }
  | { action: 'done'; id: string; reason: string }
  | { action: 'sync' }

const matchBeadsIntent = (input: string): BeadsIntent | null => {
  const trimmed = input.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  if (!(lower.startsWith('/beads') || lower.startsWith('beads '))) {
    return null
  }
  const rest = lower.startsWith('/beads')
    ? trimmed.slice(6).trim()
    : trimmed.slice(5).trim()
  if (!rest || rest === 'help' || rest === '?') {
    return { action: 'help' }
  }
  const [command, ...parts] = rest.split(/\s+/)
  const remainder = rest.slice(command.length).trim()
  switch (command) {
    case 'ready':
      return { action: 'ready' }
    case 'list':
      return { action: 'list' }
    case 'show': {
      const id = parts[0]
      if (!id) return { action: 'help' }
      return { action: 'show', id }
    }
    case 'create': {
      if (!remainder) return { action: 'help' }
      return { action: 'create', title: remainder }
    }
    case 'start': {
      const id = parts[0]
      if (!id) return { action: 'help' }
      return { action: 'start', id }
    }
    case 'done':
    case 'close': {
      const id = parts[0]
      if (!id) return { action: 'help' }
      const reason = parts.slice(1).join(' ').trim() || 'done'
      return { action: 'done', id, reason }
    }
    case 'sync':
      return { action: 'sync' }
    default:
      return { action: 'help' }
  }
}

const buildCapabilitiesMessage = () => {
  const payload = {
    title: 'What I can do',
    subtitle: 'Local-first assistant with tools, traces, and workspace context.',
    sections: [
      {
        title: 'Explain & Summarize',
        items: [
          { label: 'Explain files or folders', detail: 'explain /path/to/file.ts' },
          { label: 'Summarize recent changes', detail: 'point me at a repo and timeframe' },
          { label: 'Answer questions about the codebase', detail: 'use connected workspace context' },
        ],
      },
      {
        title: 'Build & Operate',
        items: [
          { label: 'Run local tools', detail: 'via desktop agent with logs' },
          { label: 'AI server controls', detail: 'is ai up, start ai server' },
          { label: 'UI + computer use modes', detail: 'UI, Computer, Explain, Agent Make' },
          { label: 'Flow + env helpers', detail: 'manage flows and env vars' },
        ],
      },
      {
        title: 'Tasks & Orchestration',
        items: [
          { label: 'Beads task management', detail: '/beads ready, create, start, done' },
          { label: 'Agent workflows', detail: 'draft and apply changes' },
          { label: 'Track runs + events', detail: 'persisted in Jazz/Groove' },
        ],
      },
      {
        title: 'Trace & Debug',
        items: [
          { label: 'Reasoning + tool traces', detail: 'visible in the right panel' },
          { label: 'JSONL trace logs', detail: '~/code/org/1f/jazz/assistant-traces' },
          { label: 'Copy trace output', detail: 'Debug trace → Copy' },
        ],
      },
    ],
    tools: [
      { name: 'explain_file', trigger: 'explain <path>', example: 'explain src/Kvs.ts' },
      { name: 'explain_text', trigger: 'explain <topic>', example: 'explain how sync works' },
      { name: 'ai_server', trigger: 'is ai up', example: 'start ai server' },
      { name: 'beads', trigger: '/beads …', example: '/beads ready' },
      { name: 'traces', trigger: 'Debug trace panel', example: 'Auto: on' },
    ],
  }
  return `@capabilities\n${JSON.stringify(payload)}`
}

const appendReasoningChunk = (chunk: string, forceRaw = false) => {
  if (!chunk) return
  const markers = [
    { type: 'start' as const, value: '**[Reasoning]**' },
    { type: 'end' as const, value: '**[Answer]**' },
    { type: 'start' as const, value: '<think>' },
    { type: 'end' as const, value: '</think>' },
    { type: 'start' as const, value: '<thinking>' },
    { type: 'end' as const, value: '</thinking>' },
    { type: 'start' as const, value: '<|channel|>analysis<|message|>' },
    { type: 'end' as const, value: '<|end|>' },
  ]
  let remaining = chunk
  let hadMarker = false
  while (remaining.length > 0) {
    let nextIndex = -1
    let nextMarker: { type: 'start' | 'end'; value: string } | null = null
    for (const marker of markers) {
      const index = remaining.indexOf(marker.value)
      if (index !== -1 && (nextIndex === -1 || index < nextIndex)) {
        nextIndex = index
        nextMarker = marker
      }
    }

    if (!nextMarker || nextIndex === -1) {
      if (reasoningStreamState === 'reasoning') {
        guestReasoningStreamAtom.set((prev) => `${prev}${remaining}`)
      } else if (forceRaw && remaining) {
        guestReasoningStreamAtom.set((prev) => `${prev}${remaining}`)
      }
      return
    }

    const before = remaining.slice(0, nextIndex)
    if (before && reasoningStreamState === 'reasoning') {
      guestReasoningStreamAtom.set((prev) => `${prev}${before}`)
    }

    hadMarker = true
    reasoningStreamState = nextMarker.type === 'start' ? 'reasoning' : 'answer'
    remaining = remaining.slice(nextIndex + nextMarker.value.length)
  }

  if (!hadMarker && forceRaw && chunk) {
    guestReasoningStreamAtom.set((prev) => `${prev}${chunk}`)
  }
}

const ensureQueuedDrain = () => {
  if (!queuedSubmitFrame) return
  if (queuedDrainTimeout && typeof window !== 'undefined') return
  if (typeof window === 'undefined') {
    drainQueuedPrompts(true)
    return
  }
  queuedDrainTimeout = window.setTimeout(() => {
    queuedDrainTimeout = null
    drainQueuedPrompts(true)
  }, 0)
}

const drainQueuedPrompts = (force = false) => {
  if (!queuedSubmitFrame) return
  if (!force && guestIsStreamingAtom()) return
  const queue = guestQueuedPromptsAtom()
  if (queue.length === 0) return
  const [next, ...rest] = queue
  guestQueuedPromptsAtom.set(rest)
  console.debug('[guest] queued submit (drain)', { remaining: rest.length })
  void handleGuestSubmit(queuedSubmitFrame, next.content, { skipUserMessage: true, force: true })
}

const runInGuestFrame = (fn: () => void) => {
  if (queuedSubmitFrame) {
    queuedSubmitFrame.run(fn)
    return
  }
  fn()
}

const focusChatInputSoon = () => {
  if (typeof window === 'undefined') return
  const focus = () => {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea')
    if (!textarea) return
    const length = textarea.value.length
    textarea.focus()
    textarea.setSelectionRange(length, length)
  }
  window.requestAnimationFrame(focus)
  window.setTimeout(focus, 220)
}

const DESKTOP_VISION_CLIENT_TIMEOUT_MS = 8000

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs)
  })
  try {
    return (await Promise.race([promise, timeout])) as T | null
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

const normalizeComputerUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  return `https://${trimmed}`
}

const buildUiModePrompt = (
  message: string,
  options: { page?: string | null; workspacePath?: string | null; screenDescription?: string | null },
) => {
  const pageLabel = options.page ? `/gen/${options.page}` : '(unknown)'
  const pageFile = options.page ? `pages/gen/${options.page}.mdx` : '(unknown)'
  const workspace = options.workspacePath ?? '(unknown)'
  const screen = options.screenDescription?.trim()
  const lines = [
    '[UI MODE]',
    `Workspace: ${workspace}`,
    `Page route: ${pageLabel}`,
    `Page file: ${pageFile}`,
    'Use /Users/nikiv/repos/vercel-labs/json-render if it helps.',
    'Make direct code edits to implement the UI request.',
  ]
  if (screen) {
    lines.push('', 'Screen summary:', screen)
  }
  lines.push('', message)
  return lines.join('\n')
}

const buildMusicModePrompt = (
  message: string,
  options: { workspacePath?: string | null; browserUrl?: string | null; screenDescription?: string | null },
) => {
  const workspace = options.workspacePath ?? '(unknown)'
  const browserUrl = options.browserUrl ?? '(unknown)'
  const screen = options.screenDescription?.trim()
  const lines = [
    '[COMPUTER USE]',
    `Workspace: ${workspace}`,
    `Browser URL: ${browserUrl}`,
    'You are assisting with browser-based tasks. Provide clear, step-by-step actions and confirm when navigation changes are needed.',
    'When you think, wrap reasoning in <think>...</think> so it can stream into the reasoning trace.',
  ]
  if (screen) {
    lines.push('', 'Screen summary:', screen)
  }
  lines.push('', message)
  return lines.join('\n')
}

const clearGuestChat = action(() => {
  console.log('[ChatPage] clearGuestChat action executing')
  guestIsStreamingAtom.set(false)
  guestStreamingContentAtom.set('')
  resetReasoningStream()
  guestPendingUserMessageAtom.set(null)
  guestMessagesAtom.set([])
  guestThreadIdAtom.set(null)
  cancelGuestRequest()
  resetDesktopStreamState()
  if (guestIsDesktopAtom()) {
    const workspaceId = guestDesktopWorkspaceIdAtom() ?? desktopWorkspaceIdRef
    if (workspaceId && window.electron?.ai?.clearSession) {
      window.electron.ai.clearSession(workspaceId).catch((error) => {
        console.warn('[ChatPage] failed to clear desktop session', error)
      })
    }
  }
  focusChatInputSoon()
  console.log('[ChatPage] clearGuestChat done, messages cleared')
}, 'clearGuestChat')

const clearTracePanel = async () => {
  resetTraceStream()
  if (typeof window === 'undefined') return
  if (window.electron?.ai?.clearTrace) {
    try {
      await window.electron.ai.clearTrace()
    } catch {
      // ignore
    }
  }
}

const clearAuthChat = action(() => {
  console.log('[ChatPage] clearAuthChat action executing')
  authMessagesAtom.set([])
  authStreamingContentAtom.set('')
  authIsStreamingAtom.set(false)
  authActiveThreadIdAtom.set(null)
  focusChatInputSoon()
  console.log('[ChatPage] clearAuthChat done, messages cleared')
}, 'clearAuthChat')

const handleNewChat = action(() => {
  if (activeChatModeAtom() === 'auth') {
    clearAuthChat()
  } else {
    clearGuestChat()
  }
}, 'handleNewChat')

const ensureGuestThreadId = (frame: Frame) => {
  const existing = frame.run(() => guestThreadIdAtom())
  if (existing) return existing
  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `guest-${Date.now()}`
  frame.run(() => {
    guestThreadIdAtom.set(generated)
  })
  return generated
}

const appendGuestStreamingToken = (frame: Frame, token: string) => {
  if (!token) return
  frame.run(() => {
    const next = `${guestStreamingContentAtom()}${token}`
    guestStreamingContentAtom.set(next)
  })
}

const appendDebugStreamToken = (token: string) => {
  if (!debugStreamEnabled || !debugStreamEl || !token) return
  debugStreamEl.textContent = `${debugStreamEl.textContent ?? ''}${token}`
}

const loadGuestStorage = action(() => {
  if (typeof window === 'undefined') return
  const stored = window.localStorage.getItem('gen_guest_chat')
  if (!stored) return
  try {
    const parsed = JSON.parse(stored) as { threadId?: string; messages?: GuestMessage[] }
    if (parsed.threadId) guestThreadIdAtom.set(parsed.threadId)
    if (parsed.messages) guestMessagesAtom.set(parsed.messages)
  } catch {
    // ignore corrupted storage
  }
}, 'loadGuestStorage')

effect(() => {
  loadGuestStorage()
}, 'guestStorageInit')

effect(() => {
  if (typeof window === 'undefined') return
  const payload = JSON.stringify({
    threadId: guestThreadIdAtom(),
    messages: guestMessagesAtom(),
  })
  window.localStorage.setItem('gen_guest_chat', payload)
}, 'guestStoragePersist')

effect(() => {
  desktopWorkspaceIdRef = guestDesktopWorkspaceIdAtom()
}, 'guestWorkspaceIdRef')

effect(() => {
  desktopWorkspacePathRef = guestDesktopWorkspacePathAtom()
}, 'guestWorkspacePathRef')

const guestMessagesListAtom = computed(() => {
  const msgs = guestMessagesAtom().map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }))
  const pendingUserMessage = guestPendingUserMessageAtom()
  if (
    pendingUserMessage &&
    !msgs.some((m) => m.role === 'user' && m.content === pendingUserMessage)
  ) {
    msgs.push({
      id: Date.now(),
      role: 'user',
      content: pendingUserMessage,
    })
  }
  return msgs
}, 'guestMessagesList')

const guestUserMessagesSentAtom = computed(() => {
  return guestMessagesAtom().filter((m) => m.role === 'user').length
}, 'guestUserMessagesSent')

const guestLimitReachedAtom = computed(() => {
  return guestIsDesktopAtom() ? false : guestUserMessagesSentAtom() >= FREE_REQUEST_LIMIT
}, 'guestLimitReached')

const persistAgentMessage = action(
  (role: 'user' | 'assistant', content: string, requestId: string | null, repoPath?: string | null) => {
    const grooveDb = grooveDbModel.dbAtom()
    if (!grooveDb || !requestId) return
    const trimmed = content.trim()
    if (!trimmed) return
    const resolvedPath = repoPath ?? desktopWorkspacePathRef
    if (!resolvedPath) return
    try {
      app.agentmessages.create(grooveDb, {
        repoPath: resolvedPath,
        requestId,
        role,
        content: trimmed,
        createdAt: Date.now(),
      })
    } catch (error) {
      console.warn('[groove] failed to persist message', error)
    }
  },
  'persistAgentMessage',
)

const fetchAgentState = action(async () => {
  if (!guestIsDesktopAtom()) {
    guestAgentStateAtom.set(null)
    return
  }
  const workspaceId = guestDesktopWorkspaceIdAtom()
  if (!workspaceId || !window.electron?.ai?.getAgentState) {
    guestAgentStateAtom.set(null)
    return
  }

  try {
    const state = await wrap(window.electron.ai.getAgentState(workspaceId))
    guestAgentStateAtom.set(state)
  } catch {
    guestAgentStateAtom.set(null)
  }
}, 'fetchAgentState')

effect(() => {
  fetchAgentState()
}, 'guestAgentStateEffect')


const guestAgentEnabledAtom = computed(() => guestAgentStateAtom()?.enabled ?? false, 'guestAgentEnabled')
const guestAgentRepoReadyAtom = computed(() => Boolean(guestAgentStateAtom()?.repoRoot), 'guestAgentRepoReady')

effect(() => {
  if (!guestAgentEnabledAtom()) {
    guestAgentActionsVisibleAtom.set(false)
    guestAgentDiffOpenAtom.set(false)
    guestAgentDiffAtom.set(null)
    return
  }
  if (guestAgentReadyTickAtom() && (guestAgentStateAtom()?.dirtyCount ?? 0) > 0) {
    guestAgentActionsVisibleAtom.set(true)
  } else {
    guestAgentActionsVisibleAtom.set(false)
  }
}, 'guestAgentActions')

const handleToggleAgentMode = action(async () => {
  if (guestAgentBusyAtom()) return
  const workspaceId = guestDesktopWorkspaceIdAtom()
  if (!workspaceId || !window.electron?.ai?.setAgentMode) {
    console.warn('Pick a folder before enabling agent mode.')
    return
  }
  const agentState = guestAgentStateAtom()
  if (!agentState) {
    console.warn('Checking repository status...')
    return
  }
  if (!guestAgentRepoReadyAtom()) {
    console.warn('Agent mode requires a git repository.')
    return
  }
  guestAgentBusyAtom.set(true)
  try {
    const next = await wrap(window.electron.ai.setAgentMode(workspaceId, !guestAgentEnabledAtom()))
    guestAgentStateAtom.set(next)
  } catch (error) {
    console.error(error)
  } finally {
    guestAgentBusyAtom.set(false)
  }
}, 'handleToggleAgentMode')

const handleToggleAgentMakeMode = action(() => {
  const next = !guestAgentMakeModeAtom()
  guestAgentMakeModeAtom.set(next)
  if (next) {
    guestUiModeAtom.set(false)
    guestMusicModeAtom.set(false)
    guestUiPageAtom.set(null)
    guestEnvModeAtom.set(false)
    guestFlowModeAtom.set(false)
  }
}, 'handleToggleAgentMakeMode')

const handleApplyAgent = action(async (commit: boolean) => {
  if (guestAgentBusyAtom()) return
  const workspaceId = guestDesktopWorkspaceIdAtom()
  if (!workspaceId || !window.electron?.ai?.applyAgentChanges) {
    console.warn('Pick a folder before applying agent changes.')
    return
  }
  const agentState = guestAgentStateAtom()
  if (!agentState) {
    console.warn('Checking repository status...')
    return
  }
  if (!guestAgentRepoReadyAtom()) {
    console.warn('Agent mode requires a git repository.')
    return
  }
  guestAgentBusyAtom.set(true)
  try {
    const result = await wrap(window.electron.ai.applyAgentChanges(workspaceId, { commit }))
    guestAgentStateAtom.set(result.state)
    guestAgentDiffOpenAtom.set(false)
    guestAgentDiffAtom.set(null)
  } catch (error) {
    console.error(error)
  } finally {
    guestAgentBusyAtom.set(false)
  }
}, 'handleApplyAgent')

const handleToggleDiff = action(async () => {
  if (!guestAgentEnabledAtom() || !window.electron?.ai?.getAgentDiff) {
    return
  }
  const nextOpen = !guestAgentDiffOpenAtom()
  guestAgentDiffOpenAtom.set(nextOpen)
  if (nextOpen && guestAgentDiffAtom() === null) {
    try {
      const result = await wrap(window.electron.ai.getAgentDiff(guestDesktopWorkspaceIdAtom() as string))
      guestAgentDiffAtom.set(result.diff ?? '')
    } catch {
      guestAgentDiffAtom.set('')
    }
  }
}, 'handleToggleDiff')

const formatDesktopEvent = (event: { type: string; content?: string }) => {
  const raw = event.content ?? ''
  if (event.type === 'assistant') {
    return raw ? { kind: 'assistant' as const, text: raw } : null
  }
  const content = raw.trim()
  if (!content) return null
  if (event.type === 'status' || event.type === 'tool') {
    return { kind: 'meta' as const, text: `• ${content}` }
  }
  if (event.type === 'error') {
    return { kind: 'meta' as const, text: `Error: ${content}` }
  }
  return { kind: 'meta' as const, text: content }
}

const handleDesktopEvent = (event: any) => {
  if (desktopIgnoreEvents) {
    return
  }
  if (desktopRequestId && event.requestId) {
    if (event.requestId !== desktopRequestId) {
      return
    }
  } else if (desktopWorkspaceIdRef && event.workspaceId !== desktopWorkspaceIdRef) {
    return
  }

  if (event.type === 'agent' && event.agentState) {
    guestAgentStateAtom.set(event.agentState)
    return
  }

  console.debug(
    '[guest] desktop event',
    JSON.stringify({
      type: event.type,
      requestId: event.requestId,
      workspaceId: event.workspaceId,
      hasContent: Boolean(event.content?.trim()),
    }),
  )

  if (event.type === 'ready') {
    console.debug('[guest] desktop ready', {
      hasDesktopOutput,
      pendingReady,
      bufferLength: streamingBuffer.length,
    })
    runInGuestFrame(() => {
      guestIsStreamingAtom.set(false)
      guestPreviewBusyAtom.set(false)
      guestPreviewLoadingAtom.set(false)
    })
    desktopInFlight = false
    console.debug(
      '[guest] ready state',
      JSON.stringify({
        isStreaming: guestIsStreamingAtom(),
        previewBusy: guestPreviewBusyAtom(),
        desktopRequestId: guestDesktopRequestIdAtom(),
        hasDesktopOutput,
        queued: guestQueuedPromptsAtom().length,
      }),
    )
    if (guestAgentEnabledAtom()) {
      guestAgentReadyTickAtom.set(Date.now())
      if ((guestAgentStateAtom()?.dirtyCount ?? 0) > 0) {
        guestAgentActionsVisibleAtom.set(true)
      }
    }
    pendingReady = false
    if (pendingReadyTimeout && typeof window !== 'undefined') {
      window.clearTimeout(pendingReadyTimeout)
      pendingReadyTimeout = null
    }
    finalizeDesktopStream()
    return
  }

  if (event.type === 'assistant') {
    appendReasoningChunk(event.content ?? '')
    if (guestMusicModeAtom()) {
      appendReasoningChunk(event.content ?? '', true)
    }
  }

  if (event.type === 'tool') {
    const content = event.content?.trim() ?? ''
    if (content) {
      appendTraceLine(`Tool: ${content}`)
      emitTraceEvent({
        type: 'tool',
        content,
        workspaceId: event.workspaceId,
        requestId: event.requestId,
        at: Date.now(),
      })
    }
  }

  const formatted = formatDesktopEvent(event)
  if (!formatted) return
  appendStreaming(formatted.text, { assistant: formatted.kind === 'assistant' })
}

const appendStreaming = (text: string, options: { assistant?: boolean }) => {
  if (!text) return
  if (pendingReadyTimeout) {
    window.clearTimeout(pendingReadyTimeout)
    pendingReadyTimeout = null
  }
  if (desktopFinalizeTimeout) {
    window.clearTimeout(desktopFinalizeTimeout)
    desktopFinalizeTimeout = null
  }
  hasDesktopOutput = true
  let joiner = ''
  if (streamingBuffer) {
    if (options.assistant) {
      if (lastAppendWasAssistant === false) {
        joiner = '\n'
      }
    } else {
      joiner = '\n'
    }
  }
  streamingBuffer = `${streamingBuffer}${joiner}${text}`
  guestStreamingContentAtom.set(streamingBuffer)
  lastAppendWasAssistant = !!options.assistant

  if (typeof window !== 'undefined' && options.assistant) {
    desktopFinalizeTimeout = window.setTimeout(() => {
      desktopFinalizeTimeout = null
      if (!pendingReady && hasDesktopOutput) {
        finalizeDesktopStream()
      }
    }, 2000)
  }
}

const refreshTracePanel = async () => {
  const content = await fetchTraceTail()
  if (content) {
    guestTraceStreamAtom.set(content)
  }
}

const copyTraceToClipboard = async () => {
  if (typeof navigator === 'undefined') return
  const content = guestTraceStreamAtom()
  if (!content.trim()) return
  try {
    await navigator.clipboard.writeText(content)
  } catch {
    // ignore clipboard errors
  }
}

const finalizeDesktopStream = () => {
  console.debug('[guest] finalize desktop stream', {
    hasDesktopOutput,
    pendingReady,
    queued: guestQueuedPromptsAtom().length,
    bufferLength: streamingBuffer.length,
  })
  if (desktopFinalizeTimeout && typeof window !== 'undefined') {
    window.clearTimeout(desktopFinalizeTimeout)
    desktopFinalizeTimeout = null
  }
  if (desktopResponseTimeout && typeof window !== 'undefined') {
    window.clearTimeout(desktopResponseTimeout)
    desktopResponseTimeout = null
  }
  const finalText = streamingBuffer.trim()
  if (finalText) {
    persistAgentMessage('assistant', finalText, desktopRequestId, desktopWorkspacePathRef)
    guestMessagesAtom.set((prev) => [
      ...prev,
      { id: Date.now(), role: 'assistant', content: finalText },
    ])
  }
  streamingBuffer = ''
  runInGuestFrame(() => {
    guestStreamingContentAtom.set('')
  })
  lastAppendWasAssistant = null
  runInGuestFrame(() => {
    guestIsStreamingAtom.set(false)
  })
  desktopRequestId = null
  runInGuestFrame(() => {
    guestDesktopRequestIdAtom.set(null)
    guestPreviewBusyAtom.set(false)
    guestPreviewLoadingAtom.set(false)
  })
  hasDesktopOutput = false
  desktopInFlight = false
  console.debug(
    '[guest] finalize complete',
    JSON.stringify({
      isStreaming: guestIsStreamingAtom(),
      previewBusy: guestPreviewBusyAtom(),
      desktopRequestId: guestDesktopRequestIdAtom(),
      hasDesktopOutput,
      queued: guestQueuedPromptsAtom().length,
    }),
  )
  if (guestQueuedPromptsAtom().length > 0) {
    console.debug('[guest] dispatch queued submit', {
      queued: guestQueuedPromptsAtom().length,
    })
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        guestIsStreamingAtom.set(false)
        desktopIgnoreEvents = false
        ensureQueuedDrain()
      }, 0)
    } else {
      guestIsStreamingAtom.set(false)
      desktopIgnoreEvents = false
      ensureQueuedDrain()
    }
  }
  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>('textarea')
      textarea?.focus()
    }, 0)
  }
}

const handleGuestSubmit = async (
  frame: Frame,
  userContent: string,
  options?: { skipUserMessage?: boolean; force?: boolean },
) => {
  const isStreaming = frame.run(() => guestIsStreamingAtom())
  const limitReached = frame.run(() => guestLimitReachedAtom())
  const isDesktop = frame.run(() => guestIsDesktopAtom())
  const agentEnabled = frame.run(() => guestAgentEnabledAtom())
  const uiMode = frame.run(() => guestUiModeAtom())
  const musicMode = frame.run(() => guestMusicModeAtom())
  const uiPage = frame.run(() => guestUiPageAtom())
  const computerUrl = frame.run(() => guestComputerUrlAtom())

  if (!userContent.trim() || limitReached) {
    return
  }

  const trimmedInput = userContent.trim()
  const explainMatch = trimmedInput.match(/^explain\b\s*(.*)$/i)
  if (explainMatch && !options?.force) {
    const explainTarget = explainMatch[1]?.trim() ?? ''
    if (!explainTarget) {
      frame.run(() => {
        guestMessagesAtom.set((prev) => [
          ...prev,
          { id: Date.now(), role: 'assistant', content: 'Usage: explain <path or topic>' },
        ])
      })
      focusChatInputSoon()
      return
    }
    await handleExplainSubmit(frame, explainTarget)
    return
  }

  const aiServerIntent = matchAiServerIntent(trimmedInput)
  if (aiServerIntent && !options?.force) {
    await handleAiServerIntent(frame, aiServerIntent, userContent)
    return
  }

  const beadsIntent = matchBeadsIntent(trimmedInput)
  if (beadsIntent && !options?.force) {
    await handleBeadsIntent(frame, beadsIntent, userContent)
    return
  }

  if (isCapabilitiesPrompt(trimmedInput) && !options?.force) {
    const assistantContent = buildCapabilitiesMessage()
    const existingMessages = frame.run(() => guestMessagesAtom())
    const newUserMessage = options?.skipUserMessage
      ? null
      : ({ id: Date.now(), role: 'user', content: userContent } as GuestMessage)
    const newAssistantMessage: GuestMessage = {
      id: Date.now() + 1,
      role: 'assistant',
      content: assistantContent,
    }
    frame.run(() => {
      guestMessagesAtom.set([
        ...existingMessages,
        ...(newUserMessage ? [newUserMessage] : []),
        newAssistantMessage,
      ])
      guestPendingUserMessageAtom.set(null)
      guestIsStreamingAtom.set(false)
      guestStreamingContentAtom.set('')
    })
    focusChatInputSoon()
    return
  }

  if (isStreaming && !options?.force) {
    if (uiMode && isDesktop) {
      const queuedId = Date.now()
      frame.run(() => {
        guestQueuedPromptsAtom.set((prev) => [...prev, { id: queuedId, content: userContent }])
        const existingMessages = guestMessagesAtom()
        guestMessagesAtom.set([
          ...existingMessages,
          { id: queuedId, role: 'user', content: userContent },
        ])
        guestPendingUserMessageAtom.set(null)
      })
      console.debug('[guest] queued prompt', { id: queuedId })
      ensureQueuedDrain()
    }
    focusChatInputSoon()
    return
  }

  if (isDesktop && agentEnabled) {
    guestAgentActionsVisibleAtom.set(false)
    guestAgentDiffOpenAtom.set(false)
    guestAgentDiffAtom.set(null)
  }

  frame.run(() => {
    if (!options?.skipUserMessage) {
      guestPendingUserMessageAtom.set(userContent)
    }
    guestIsStreamingAtom.set(true)
    guestStreamingContentAtom.set('')
  })
  resetReasoningStream()
  hasDesktopOutput = false
  pendingReady = false
  lastAppendWasAssistant = null
  desktopIgnoreEvents = false
  if (debugStreamEnabled && debugStreamEl) {
    debugStreamEl.textContent = ''
  }
  if (pendingReadyTimeout) {
    window.clearTimeout(pendingReadyTimeout)
    pendingReadyTimeout = null
  }
  if (desktopResponseTimeout) {
    window.clearTimeout(desktopResponseTimeout)
    desktopResponseTimeout = null
  }
  if (typeof window !== 'undefined') {
    desktopResponseTimeout = window.setTimeout(() => {
      desktopResponseTimeout = null
      if (guestIsStreamingAtom()) {
        console.warn('[guest] desktop response timeout')
        if (!hasDesktopOutput) {
          guestMessagesAtom.set((prev) => [
            ...prev,
            {
              id: Date.now(),
              role: 'assistant',
              content: 'No response from agent. Try again.',
            },
          ])
        }
        streamingBuffer = ''
        runInGuestFrame(() => {
          guestStreamingContentAtom.set('')
          guestIsStreamingAtom.set(false)
          guestDesktopRequestIdAtom.set(null)
          guestPreviewBusyAtom.set(false)
          guestPreviewLoadingAtom.set(false)
        })
        desktopRequestId = null
        hasDesktopOutput = false
        desktopInFlight = false
        if (guestQueuedPromptsAtom().length > 0) {
          drainQueuedPrompts()
        }
      }
    }, 45000)
  }

  let useDesktop = isDesktop && (agentEnabled || uiMode || musicMode)
  let workspaceId: string | undefined
  let workspacePath: string | null = null

  try {
    console.debug('[guest] submit', {
      hasDesktop: isDesktop,
      agentEnabled,
      length: userContent.length,
    })
    const existingMessages = frame.run(() => guestMessagesAtom())
    let newUserMsg: GuestMessage | null = null
    if (!options?.skipUserMessage) {
      newUserMsg = {
        id: Date.now(),
        role: 'user',
        content: userContent,
      }
      frame.run(() => {
        guestMessagesAtom.set([...existingMessages, newUserMsg])
        guestPendingUserMessageAtom.set(null)
      })
    } else {
      frame.run(() => {
        guestPendingUserMessageAtom.set(null)
      })
    }

    if (useDesktop) {
      const list = await window.electron?.ai?.listWorkspaces?.()
      const preferredId = desktopWorkspaceIdRef
      const preferredWorkspace =
        list?.find((workspace) => workspace.id === preferredId) ?? list?.[0]
      workspaceId = preferredWorkspace?.id
      workspacePath = preferredWorkspace?.path ?? null
      if (!workspaceId) {
        useDesktop = false
      }
    }

    if (useDesktop && workspaceId) {
      guestDesktopWorkspaceIdAtom.set(workspaceId)
      guestDesktopWorkspacePathAtom.set(workspacePath)
      desktopWorkspaceIdRef = workspaceId
      desktopWorkspacePathRef = workspacePath
      streamingBuffer = ''
      frame.run(() => {
        guestStreamingContentAtom.set('')
      })
      lastAppendWasAssistant = null
      let resolvedUiPage = uiPage
      if (uiMode && !resolvedUiPage && window.electron?.ai?.ensureUiModePage) {
        try {
          resolvedUiPage = await window.electron.ai.ensureUiModePage()
          if (resolvedUiPage) {
            frame.run(() => {
              guestUiPageAtom.set(resolvedUiPage)
            })
          }
        } catch {
          resolvedUiPage = uiPage
        }
      }
      let screenDescription: string | null = null
      if ((uiMode || musicMode) && isDesktop && window.electron?.ai?.describeScreen) {
        try {
          const result = await withTimeout(
            window.electron.ai.describeScreen(),
            DESKTOP_VISION_CLIENT_TIMEOUT_MS,
          )
          if (result?.ok && result.text) {
            screenDescription = result.text
          }
        } catch {
          screenDescription = null
        }
      }
      const outgoingMessage = uiMode
        ? buildUiModePrompt(userContent, { page: resolvedUiPage, workspacePath, screenDescription })
        : musicMode
          ? buildMusicModePrompt(userContent, { workspacePath, browserUrl: computerUrl, screenDescription })
          : userContent
      frame.run(() => {
        guestPreviewBusyAtom.set(true)
        guestPreviewLoadingAtom.set(true)
      })
      desktopInFlight = true
      const { requestId } =
        (await window.electron?.ai?.sendMessage?.(workspaceId, outgoingMessage)) ?? {}
      if (requestId) {
        desktopRequestId = requestId
        guestDesktopRequestIdAtom.set(requestId)
        persistAgentMessage('user', userContent, requestId, workspacePath)
        console.debug('[guest] desktop requestId', requestId)
      }
      focusChatInputSoon()
      return
    }

    {
      console.debug('[guest] using web route')
      const { epoch, signal } = beginGuestRequest()
      const apiMessages = (newUserMsg ? [...existingMessages, newUserMsg] : existingMessages).map((m) => ({
        role: m.role,
        content: m.content,
      }))
      const threadId = ensureGuestThreadId(frame)
      persistAgentMessage('user', userContent, threadId, GUEST_REPO_PATH)

      const res = await wrap(fetch('/api/chat/guest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          model: frame.run(() => selectedModelAtom()),
          threadId,
        }),
        signal,
      }))

      if (epoch !== guestRequestEpoch) {
        return
      }

      const streamFlag = res.headers.get('X-Stream')
      const contentType = res.headers.get('content-type') ?? ''
      console.debug('[guest] response', {
        status: res.status,
        streamFlag,
        contentType,
      })
      if (!res.ok) {
        let detail = ''
        try {
          const data = (await res.clone().json()) as { error?: string; detail?: string }
          detail = data.detail ?? data.error ?? ''
        } catch {
          try {
            detail = await res.text()
          } catch {
            detail = ''
          }
        }
        throw new Error(
          detail
            ? `AI request failed: ${res.status} - ${detail}`
            : `AI request failed: ${res.status}`,
        )
      }

      const responseThreadId = res.headers.get('X-Thread-Id')
      if (responseThreadId && !frame.run(() => guestThreadIdAtom())) {
        frame.run(() => {
          guestThreadIdAtom.set(responseThreadId)
        })
      }

      const isSse =
        streamFlag === 'sse' || contentType.includes('text/event-stream')

      if ((streamFlag === '0' && !isSse) || !res.body) {
        const text = await wrap(res.text())
        if (epoch !== guestRequestEpoch) {
          return
        }
        const newAssistantMsg: GuestMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: text,
        }
        persistAgentMessage('assistant', text, threadId, GUEST_REPO_PATH)
        frame.run(() => {
          guestMessagesAtom.set([...guestMessagesAtom(), newAssistantMsg])
          guestStreamingContentAtom.set('')
        })
        focusChatInputSoon()
        return
      }

      if (!isSse) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (epoch !== guestRequestEpoch) {
            return
          }
          const chunk = decoder.decode(value, { stream: true })
          accumulated += chunk
          frame.run(() => {
            guestStreamingContentAtom.set(accumulated)
          })
        }
        console.debug('[guest] stream complete', { length: accumulated.length })
        const newAssistantMsg: GuestMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: accumulated,
        }
        persistAgentMessage('assistant', accumulated, threadId, GUEST_REPO_PATH)
        frame.run(() => {
          guestMessagesAtom.set([...guestMessagesAtom(), newAssistantMsg])
          guestStreamingContentAtom.set('')
        })
        focusChatInputSoon()
        return
      }

      let sseEventCount = 0
      let sseTokenCount = 0
      const result = await streamSseText({
        response: res,
        timeoutMs: 30000,
        onEvent: (event, raw) => {
          if (epoch !== guestRequestEpoch) {
            return
          }
          sseEventCount += 1
          if (sseEventCount <= 3) {
            console.debug('[guest] sse raw', raw.slice(0, 200))
            console.debug('[guest] sse event', JSON.stringify(event).slice(0, 200))
          }
        },
        onToken: (token) => {
          if (epoch !== guestRequestEpoch) {
            return
          }
          sseTokenCount += 1
          appendGuestStreamingToken(frame, token)
          appendDebugStreamToken(token)
          if (sseTokenCount <= 3) {
            const total = frame.run(() => guestStreamingContentAtom().length)
            console.debug('[guest] sse token', {
              len: token.length,
              preview: token.slice(0, 40),
              total,
            })
          }
        },
      })

      const streamedContent = frame.run(() => guestStreamingContentAtom())
      const finalText =
        result.text.length > 0 ? result.text : streamedContent
      if (epoch !== guestRequestEpoch) {
        return
      }

      if (result.events > 0 && result.text.length === 0) {
        console.warn('[guest] sse produced no text', result)
      }
      console.debug('[guest] stream complete', {
        length: result.text.length,
        events: result.events,
      })
      const newAssistantMsg: GuestMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: finalText,
      }
      persistAgentMessage('assistant', finalText, threadId, GUEST_REPO_PATH)
      frame.run(() => {
        guestMessagesAtom.set([...guestMessagesAtom(), newAssistantMsg])
        guestStreamingContentAtom.set('')
      })
      focusChatInputSoon()
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }
    console.error('Chat error:', error)
    frame.run(() => {
      guestStreamingContentAtom.set('')
      guestPendingUserMessageAtom.set(null)
    })
    if (error instanceof Error) {
      frame.run(() => {
        guestMessagesAtom.set([
          ...guestMessagesAtom(),
          { id: Date.now(), role: 'assistant', content: error.message },
        ])
      })
    }
    if (useDesktop) {
      frame.run(() => {
        guestIsStreamingAtom.set(false)
      })
      desktopRequestId = null
      guestPreviewBusyAtom.set(false)
      desktopInFlight = false
    }
  } finally {
    if (!useDesktop) {
      frame.run(() => {
        guestIsStreamingAtom.set(false)
      })
    }
    focusChatInputSoon()
  }
}

effect(() => {
  if (typeof window === 'undefined') return
  if (!guestIsDesktopAtom()) return

  onEvent(window, 'keydown', (event: KeyboardEvent) => {
    if (!event.ctrlKey || event.metaKey || event.altKey) return
    const key = event.key.toLowerCase()
    if (key === 'e') {
      event.preventDefault()
      handleToggleAgentMode()
    } else if (key === 'f') {
      event.preventDefault()
      handleApplyAgent(false)
    } else if (key === 'g') {
      event.preventDefault()
      handleApplyAgent(true)
    } else if (key === 'j') {
      event.preventDefault()
      handleToggleAgentMakeMode()
    }
  })
}, 'guestAgentShortcuts')

effect(() => {
  guestMessagesListAtom()
  guestStreamingContentAtom()
  const ref = guestMessagesEndRefAtom()
  ref?.scrollIntoView({ behavior: 'smooth' })
}, 'guestScrollToEnd')

const handleAgentMakeSubmit = (frame: Frame, userContent: string) => {
  const trimmed = userContent.trim()
  if (!trimmed) {
    return
  }
  const preview = buildAgentMakePreview(trimmed)
  frame.run(() => {
    guestAgentMakePreviewAtom.set(preview)
  })
  focusChatInputSoon()
}

const handleEnvSubmit = async (frame: Frame, userContent: string) => {
  if (!userContent.trim()) {
    return
  }
  const isDesktop = frame.run(() => guestIsDesktopAtom())
  const userId = Date.now()
  const assistantId = userId + 1
  frame.run(() => {
    const existing = guestMessagesAtom()
    guestMessagesAtom.set([
      ...existing,
      { id: userId, role: 'user', content: userContent },
      { id: assistantId, role: 'assistant', content: 'Saving envs…' },
    ])
  })
  if (!isDesktop || !window.electron?.env?.saveFromPaste) {
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: 'Env mode is unavailable in this build.' }
            : message,
        ),
      )
    })
    focusChatInputSoon()
    return
  }
  try {
    const result = await window.electron.env.saveFromPaste(userContent)
    const stdout = result.stdout?.trim() ?? ''
    const stderr = result.stderr?.trim() ?? ''
    const normalizedStdout = stdout.toLowerCase()
    const noValues =
      normalizedStdout.includes('no env values found') ||
      normalizedStdout.includes('no env values found.')
    const ok = result.ok && !noValues
    const logChunks = []
    if (stdout) {
      logChunks.push(`STDOUT:\n${stdout}`)
    }
    if (stderr) {
      logChunks.push(`STDERR:\n${stderr}`)
    }
    let title = ok ? 'Env saved' : noValues ? 'No env values found' : 'Env save failed'
    let content = `### ${title}\n`
    if (!ok && result.error) {
      content += `\n**Reason:** ${result.error}\n`
    }
    if (result.keys?.length) {
      content += `\n**Keys**\n- ${result.keys.join('\n- ')}`
    }
    if (logChunks.length) {
      content += `\n\n\`\`\`text\n${logChunks.join('\n\n')}\n\`\`\``
    }
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId ? { ...message, content } : message,
        ),
      )
    })
  } catch (error) {
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: `Env save failed: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }
            : message,
        ),
      )
    })
  }
  focusChatInputSoon()
}

const handleFlowSubmit = async (frame: Frame, userContent: string) => {
  if (!userContent.trim()) {
    return
  }
  const isDesktop = frame.run(() => guestIsDesktopAtom())
  const userId = Date.now()
  const assistantId = userId + 1
  const trimmed = userContent.trim().toLowerCase()

  frame.run(() => {
    const existing = guestMessagesAtom()
    guestMessagesAtom.set([
      ...existing,
      { id: userId, role: 'user', content: userContent },
      { id: assistantId, role: 'assistant', content: 'Checking flow…' },
    ])
  })

  if (!isDesktop || !window.electron?.flow?.daemonStatus) {
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: 'Flow mode is unavailable in this build.' }
            : message,
        ),
      )
    })
    focusChatInputSoon()
    return
  }

  try {
    // Handle daemon commands
    if (trimmed === 'status' || trimmed === 'daemon status') {
      const result = await window.electron.flow.daemonStatus()
      let content = '### Daemon Status\n\n'
      if (result.daemons.length === 0) {
        content += 'No daemons found.'
      } else {
        for (const daemon of result.daemons) {
          const icon = daemon.status === 'running' ? '🟢' : '🔴'
          content += `${icon} **${daemon.name}**: ${daemon.status}`
          if (daemon.pid) {
            content += ` (PID ${daemon.pid})`
          }
          content += '\n'
        }
      }
      if (!result.ok && result.output) {
        content += `\n\`\`\`\n${result.output}\n\`\`\``
      }
      frame.run(() => {
        guestMessagesAtom.set((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content } : message,
          ),
        )
      })
    } else if (trimmed.startsWith('start ')) {
      const name = trimmed.replace('start ', '').trim()
      const result = await window.electron.flow.daemonStart(name)
      const content = result.ok
        ? `### Started ${name}\n\n${result.output || 'Daemon started successfully.'}`
        : `### Failed to start ${name}\n\n${result.output || 'Unknown error.'}`
      frame.run(() => {
        guestMessagesAtom.set((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content } : message,
          ),
        )
      })
    } else if (trimmed.startsWith('stop ')) {
      const name = trimmed.replace('stop ', '').trim()
      const result = await window.electron.flow.daemonStop(name)
      const content = result.ok
        ? `### Stopped ${name}\n\n${result.output || 'Daemon stopped successfully.'}`
        : `### Failed to stop ${name}\n\n${result.output || 'Unknown error.'}`
      frame.run(() => {
        guestMessagesAtom.set((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content } : message,
          ),
        )
      })
    } else if (trimmed === 'help' || trimmed === '?') {
      const content = `### Flow Mode Commands

- **status** - Check daemon status
- **start <name>** - Start a daemon (e.g., \`start lin\`)
- **stop <name>** - Stop a daemon (e.g., \`stop lin\`)
- **help** - Show this help

Press \`Ctrl+W\` to exit Flow mode.`
      frame.run(() => {
        guestMessagesAtom.set((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content } : message,
          ),
        )
      })
    } else {
      // Default: show help
      const content = `### Unknown command: ${userContent}

Try \`help\` or \`status\` to get started.`
      frame.run(() => {
        guestMessagesAtom.set((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content } : message,
          ),
        )
      })
    }
  } catch (error) {
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: `Flow command failed: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }
            : message,
        ),
      )
    })
  }
  focusChatInputSoon()
}

const handleAiServerIntent = async (
  frame: Frame,
  intent: AiServerIntent,
  userContent: string,
) => {
  const isDesktop = frame.run(() => guestIsDesktopAtom())
  const userId = Date.now()
  const assistantId = userId + 1
  const action = intent.action

  frame.run(() => {
    const existing = guestMessagesAtom()
    guestMessagesAtom.set([
      ...existing,
      { id: userId, role: 'user', content: userContent },
      { id: assistantId, role: 'assistant', content: 'Checking AI server…' },
    ])
  })

  if (
    !isDesktop ||
    !window.electron?.flow?.daemonStatus ||
    !window.electron?.flow?.daemonStart ||
    !window.electron?.flow?.daemonStop
  ) {
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  'AI server controls are only available in the desktop app.',
              }
            : message,
        ),
      )
    })
    focusChatInputSoon()
    return
  }

  const requestId = guestDesktopRequestIdAtom() ?? guestThreadIdAtom()
  const traceBase = {
    workspaceId: guestDesktopWorkspaceIdAtom(),
    requestId,
  }

  const renderStatus = async (prefix?: string) => {
    appendTraceLine(`Tool call: ai_server_status ${AI_SERVER_PROJECT}`)
    emitTraceEvent({
      type: 'tool_call',
      tool: 'ai_server_status',
      input: AI_SERVER_PROJECT,
      at: Date.now(),
      ...traceBase,
    })
    const statusFn = window.electron.flow.daemonStatusAt
      ? window.electron.flow.daemonStatusAt
      : window.electron.flow.daemonStatus
    const result = window.electron.flow.daemonStatusAt
      ? await statusFn(AI_SERVER_PROJECT)
      : await statusFn()
    const daemon = result.daemons.find((d) => d.name === AI_SERVER_DAEMON)
    const running = daemon?.status === 'running'
    let healthLine = 'Health: unknown'
    if (running && window.electron?.ai?.checkHealth) {
      const health = await window.electron.ai.checkHealth(AI_SERVER_HEALTH_URL)
      healthLine = health.ok
        ? `Health: ok (${health.status})`
        : `Health: failed (${health.status || 'error'})`
    }
    const icon = running ? '🟢' : '🔴'
    let content = `### AI server status\n\n${icon} **${AI_SERVER_DAEMON}**: ${daemon?.status ?? 'unknown'}\n${healthLine}\n\n**Project:** \`${AI_SERVER_PROJECT}\``
    if (prefix) {
      content = `${prefix}\n\n${content}`
    }
    if (!result.ok && result.output) {
      content += `\n\n\`\`\`\n${result.output}\n\`\`\``
    }
    appendTraceLine(
      `Tool result: ai_server_status ${running ? 'running' : 'stopped'}`,
    )
    emitTraceEvent({
      type: 'tool_result',
      tool: 'ai_server_status',
      ok: result.ok,
      running,
      at: Date.now(),
      ...traceBase,
    })
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId ? { ...message, content } : message,
        ),
      )
    })
  }

  try {
    if (action === 'start') {
      appendTraceLine(`Tool call: ai_server_start ${AI_SERVER_DAEMON}`)
      emitTraceEvent({
        type: 'tool_call',
        tool: 'ai_server_start',
        input: AI_SERVER_DAEMON,
        at: Date.now(),
        ...traceBase,
      })
      const result = await window.electron.flow.daemonStart(
        AI_SERVER_DAEMON,
        AI_SERVER_PROJECT,
      )
      appendTraceLine(
        `Tool result: ai_server_start ${result.ok ? 'ok' : 'failed'}`,
      )
      emitTraceEvent({
        type: 'tool_result',
        tool: 'ai_server_start',
        ok: result.ok,
        at: Date.now(),
        ...traceBase,
      })
      const prefix = result.ok
        ? `✅ Started **${AI_SERVER_DAEMON}**`
        : `⚠️ Failed to start **${AI_SERVER_DAEMON}**\n\n${result.output || 'Unknown error.'}`
      await renderStatus(prefix)
    } else if (action === 'stop') {
      appendTraceLine(`Tool call: ai_server_stop ${AI_SERVER_DAEMON}`)
      emitTraceEvent({
        type: 'tool_call',
        tool: 'ai_server_stop',
        input: AI_SERVER_DAEMON,
        at: Date.now(),
        ...traceBase,
      })
      const result = await window.electron.flow.daemonStop(
        AI_SERVER_DAEMON,
        AI_SERVER_PROJECT,
      )
      appendTraceLine(
        `Tool result: ai_server_stop ${result.ok ? 'ok' : 'failed'}`,
      )
      emitTraceEvent({
        type: 'tool_result',
        tool: 'ai_server_stop',
        ok: result.ok,
        at: Date.now(),
        ...traceBase,
      })
      const prefix = result.ok
        ? `🛑 Stopped **${AI_SERVER_DAEMON}**`
        : `⚠️ Failed to stop **${AI_SERVER_DAEMON}**\n\n${result.output || 'Unknown error.'}`
      await renderStatus(prefix)
    } else {
      await renderStatus()
    }
  } catch (error) {
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: `AI server command failed: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }
            : message,
        ),
      )
    })
  }
  focusChatInputSoon()
}

const handleBeadsIntent = async (
  frame: Frame,
  intent: BeadsIntent,
  userContent: string,
) => {
  const isDesktop = frame.run(() => guestIsDesktopAtom())
  const userId = Date.now()
  const assistantId = userId + 1

  frame.run(() => {
    const existing = guestMessagesAtom()
    guestMessagesAtom.set([
      ...existing,
      { id: userId, role: 'user', content: userContent },
      { id: assistantId, role: 'assistant', content: 'Running beads…' },
    ])
  })

  if (!isDesktop || !window.electron?.beads?.run) {
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  'Beads commands are only available in the desktop app.',
              }
            : message,
        ),
      )
    })
    focusChatInputSoon()
    return
  }

  const requestId = guestDesktopRequestIdAtom() ?? guestThreadIdAtom()
  const traceBase = {
    workspaceId: guestDesktopWorkspaceIdAtom(),
    requestId,
  }

  const formatHelp = () => `### Beads commands

- \`/beads ready\` — list ready issues
- \`/beads list\` — list issues
- \`/beads show <id>\` — show issue
- \`/beads create <title>\` — create issue
- \`/beads start <id>\` — mark in progress
- \`/beads done <id> [reason]\` — close issue
- \`/beads sync\` — sync JSONL status

Beads store: \`~/code/org/1f/jazz/.beads\``

  const toArgs = (intentValue: BeadsIntent): string[] => {
    switch (intentValue.action) {
      case 'ready':
        return ['--json', 'ready']
      case 'list':
        return ['--json', 'list']
      case 'show':
        return ['--json', 'show', intentValue.id]
      case 'create':
        return ['--json', 'create', intentValue.title]
      case 'start':
        return ['--json', 'update', intentValue.id, '--status', 'in_progress']
      case 'done':
        return ['--json', 'close', intentValue.id, '--reason', intentValue.reason]
      case 'sync':
        return ['sync', '--status']
      case 'help':
      default:
        return []
    }
  }

  if (intent.action === 'help') {
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: formatHelp() }
            : message,
        ),
      )
    })
    focusChatInputSoon()
    return
  }

  const args = toArgs(intent)
  appendTraceLine(`Tool call: beads ${args.join(' ')}`)
  emitTraceEvent({
    type: 'tool_call',
    tool: 'beads',
    input: args.join(' '),
    at: Date.now(),
    ...traceBase,
  })

  try {
    const result = await window.electron.beads.run(args)
    const output = [result.stdout.trim(), result.stderr.trim()]
      .filter(Boolean)
      .join('\n')
    const content = result.ok
      ? `### Beads result\n\n\`\`\`json\n${output || 'ok'}\n\`\`\``
      : `### Beads failed\n\n\`\`\`text\n${output || 'Unknown error.'}\n\`\`\``
    appendTraceLine(
      `Tool result: beads ${result.ok ? 'ok' : 'failed'} (${result.code})`,
    )
    emitTraceEvent({
      type: 'tool_result',
      tool: 'beads',
      ok: result.ok,
      code: result.code,
      at: Date.now(),
      ...traceBase,
    })
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId ? { ...message, content } : message,
        ),
      )
    })
  } catch (error) {
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: `Beads command failed: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }
            : message,
        ),
      )
    })
  }
  focusChatInputSoon()
}

const handleEnvPrint = async (frame: Frame) => {
  const isDesktop = frame.run(() => guestIsDesktopAtom())
  const userId = Date.now()
  const assistantId = userId + 1
  frame.run(() => {
    const existing = guestMessagesAtom()
    guestMessagesAtom.set([
      ...existing,
      { id: userId, role: 'user', content: 'Print env' },
      { id: assistantId, role: 'assistant', content: 'Loading env…' },
    ])
  })
  if (!isDesktop || !window.electron?.env?.listLocal) {
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: 'Env list is unavailable in this build.' }
            : message,
        ),
      )
    })
    focusChatInputSoon()
    return
  }
  try {
    const result = await window.electron.env.listLocal()
    if (!result.ok) {
      const content = `### Env list failed\n\n${result.error ?? 'Unable to read flow env store.'}`
      frame.run(() => {
        guestMessagesAtom.set((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content } : message,
          ),
        )
      })
      focusChatInputSoon()
      return
    }
    const grouped = new Map<string, { key: string; value: string }[]>()
    for (const entry of result.entries ?? []) {
      const list = grouped.get(entry.source) ?? []
      list.push({ key: entry.key, value: entry.value })
      grouped.set(entry.source, list)
    }
    if (grouped.size === 0) {
      const content = `### No env values found`
      frame.run(() => {
        guestMessagesAtom.set((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content } : message,
          ),
        )
      })
      focusChatInputSoon()
      return
    }
    const payload = JSON.stringify({
      entries: result.entries ?? [],
      title: 'Flow env (local)',
    })
    const content = `@env-table\n${payload}`
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId ? { ...message, content } : message,
        ),
      )
    })
  } catch (error) {
    const content = `### Env list failed\n\n${
      error instanceof Error ? error.message : String(error)
    }`
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId ? { ...message, content } : message,
        ),
      )
    })
  }
  focusChatInputSoon()
}

const handleExplainSubmit = async (frame: Frame, userContent: string) => {
  if (!userContent.trim()) {
    return
  }

  const trimmed = userContent.trim()
  const hasExplainPrefix = trimmed.match(/^explain\b/i)
  const normalizedInput = hasExplainPrefix
    ? trimmed.replace(/^explain\b/i, "").trim()
    : trimmed
  const userId = Date.now()
  const assistantId = userId + 1
  const explainTarget = normalizedInput || trimmed
  const isPath = explainTarget.startsWith('/') || explainTarget.startsWith('~')

  frame.run(() => {
    const existing = guestMessagesAtom()
    guestMessagesAtom.set([
      ...existing,
      { id: userId, role: 'user', content: userContent },
      { id: assistantId, role: 'assistant', content: isPath ? 'Reading file...' : 'Generating explanation...' },
    ])
  })

  const updateAssistantMessage = (content: string) => {
    frame.run(() => {
      guestMessagesAtom.set((prev) =>
        prev.map((message) =>
          message.id === assistantId ? { ...message, content } : message,
        ),
      )
    })
  }

  if (hasExplainPrefix && !normalizedInput) {
    updateAssistantMessage('Usage: explain <path or topic>')
    focusChatInputSoon()
    return
  }

  if (isPath) {
    appendTraceLine(`Tool call: explain_file ${explainTarget}`)
    emitTraceEvent({
      type: 'tool_call',
      tool: 'explain_file',
      input: explainTarget,
      at: Date.now(),
      workspaceId: guestDesktopWorkspaceIdAtom(),
      requestId: guestDesktopRequestIdAtom() ?? guestThreadIdAtom(),
    })
    // Handle file/folder path - read via Electron IPC and explain
    try {
      const electron = (window as { electron?: { explain?: { readPath: (p: string) => Promise<{ ok: boolean; content?: string; isDir?: boolean; files?: Array<{ name: string; path: string; isDir: boolean }>; error?: string }> } } }).electron
      if (!electron?.explain?.readPath) {
        updateAssistantMessage('File reading is only available in the desktop app.')
        appendTraceLine('Tool result: explain_file unavailable')
        emitTraceEvent({
          type: 'tool_result',
          tool: 'explain_file',
          ok: false,
          error: 'explain_file unavailable',
          at: Date.now(),
          workspaceId: guestDesktopWorkspaceIdAtom(),
          requestId: guestDesktopRequestIdAtom() ?? guestThreadIdAtom(),
        })
        focusChatInputSoon()
        return
      }

      const result = await electron.explain.readPath(explainTarget)
      if (!result.ok) {
        updateAssistantMessage(`Failed to read path: ${result.error}`)
        appendTraceLine(`Tool result: explain_file failed (${result.error ?? 'unknown'})`)
        emitTraceEvent({
          type: 'tool_result',
          tool: 'explain_file',
          ok: false,
          error: result.error ?? 'unknown',
          at: Date.now(),
          workspaceId: guestDesktopWorkspaceIdAtom(),
          requestId: guestDesktopRequestIdAtom() ?? guestThreadIdAtom(),
        })
        focusChatInputSoon()
        return
      }

      if (result.isDir) {
        // Directory - connect to context and explain at a high level
        const entries = result.files ?? []
        frame.run(() => {
          setExplainContext({
            kind: "dir",
            path: trimmed,
            entries: entries.map((entry) => ({
              name: entry.name,
              path: entry.path,
              isDir: entry.isDir,
            })),
            truncated: entries.length >= 50,
          })
        })
        updateAssistantMessage(`Connected folder \`${explainTarget}\` (${entries.length} entries). Generating explanation...`)
        appendTraceLine(`Tool result: explain_file directory (${result.files?.length ?? 0} entries)`)
        emitTraceEvent({
          type: 'tool_result',
          tool: 'explain_file',
          ok: true,
          kind: 'dir',
          count: result.files?.length ?? 0,
          at: Date.now(),
          workspaceId: guestDesktopWorkspaceIdAtom(),
          requestId: guestDesktopRequestIdAtom() ?? guestThreadIdAtom(),
        })
        try {
          await generateExplanation(`the folder at ${explainTarget}`)
          updateAssistantMessage(`Explanation generated for folder \`${explainTarget}\`. View it in the panel on the right.`)
        } catch (error) {
          updateAssistantMessage(`Failed to generate folder explanation: ${error instanceof Error ? error.message : String(error)}`)
        }
      } else {
        // File - generate explanation for its content
        updateAssistantMessage('Analyzing file and generating explanation...')

        // Build prompt with file content
        const fileContent = result.content ?? ''
        const fileName = explainTarget.split('/').pop() ?? 'file'
        const truncated = fileContent.includes('[Truncated - file too large]')
        frame.run(() => {
          setExplainContext({
            kind: "file",
            path: explainTarget,
            content: fileContent,
            truncated,
          })
        })
        const topic = `the file ${fileName}`

        try {
          await generateExplanation(topic)
          updateAssistantMessage(`Explanation generated for \`${fileName}\`. View it in the panel on the right.`)
          appendTraceLine(`Tool result: explain_file ok (${fileName})`)
          emitTraceEvent({
            type: 'tool_result',
            tool: 'explain_file',
            ok: true,
            file: fileName,
            at: Date.now(),
            workspaceId: guestDesktopWorkspaceIdAtom(),
            requestId: guestDesktopRequestIdAtom() ?? guestThreadIdAtom(),
          })
        } catch (error) {
          updateAssistantMessage(`Failed to generate explanation: ${error instanceof Error ? error.message : String(error)}`)
          appendTraceLine(`Tool result: explain_file failed (${error instanceof Error ? error.message : String(error)})`)
          emitTraceEvent({
            type: 'tool_result',
            tool: 'explain_file',
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            at: Date.now(),
            workspaceId: guestDesktopWorkspaceIdAtom(),
            requestId: guestDesktopRequestIdAtom() ?? guestThreadIdAtom(),
          })
        }
      }
    } catch (error) {
      updateAssistantMessage(`Error reading file: ${error instanceof Error ? error.message : String(error)}`)
      appendTraceLine(`Tool result: explain_file failed (${error instanceof Error ? error.message : String(error)})`)
      emitTraceEvent({
        type: 'tool_result',
        tool: 'explain_file',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        at: Date.now(),
        workspaceId: guestDesktopWorkspaceIdAtom(),
        requestId: guestDesktopRequestIdAtom() ?? guestThreadIdAtom(),
      })
    }
  } else {
    appendTraceLine(`Tool call: explain_text ${explainTarget}`)
    emitTraceEvent({
      type: 'tool_call',
      tool: 'explain_text',
      input: explainTarget,
      at: Date.now(),
      workspaceId: guestDesktopWorkspaceIdAtom(),
      requestId: guestDesktopRequestIdAtom() ?? guestThreadIdAtom(),
    })
    // Handle topic explanation - generate via AI
    try {
      await generateExplanation(explainTarget)
      updateAssistantMessage(`Explanation generated for "${explainTarget}". View it in the panel on the right.`)
      appendTraceLine('Tool result: explain_text ok')
      emitTraceEvent({
        type: 'tool_result',
        tool: 'explain_text',
        ok: true,
        at: Date.now(),
        workspaceId: guestDesktopWorkspaceIdAtom(),
        requestId: guestDesktopRequestIdAtom() ?? guestThreadIdAtom(),
      })
    } catch (error) {
      updateAssistantMessage(`Failed to generate explanation: ${error instanceof Error ? error.message : String(error)}`)
      appendTraceLine(`Tool result: explain_text failed (${error instanceof Error ? error.message : String(error)})`)
      emitTraceEvent({
        type: 'tool_result',
        tool: 'explain_text',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        at: Date.now(),
        workspaceId: guestDesktopWorkspaceIdAtom(),
        requestId: guestDesktopRequestIdAtom() ?? guestThreadIdAtom(),
      })
    }
  }

  focusChatInputSoon()
}

const GuestChat = reatomComponent(() => {
  const frame = useFrame()
  const isStreaming = guestIsStreamingAtom()
  const streamingContent = guestStreamingContentAtom()
  const messages = guestMessagesListAtom()
  const isDesktop = guestIsDesktopAtom()
  const limitReached = guestLimitReachedAtom()
  const userMessagesSent = guestUserMessagesSentAtom()
  const remainingRequests = isDesktop ? undefined : Math.max(0, FREE_REQUEST_LIMIT - userMessagesSent)
  const isSmallScreen = isSmallScreenAtom()
  const inputFocused = guestInputFocusedAtom()
  const isChatEmpty = messages.length === 0 && !isStreaming
  const showInlineGreeting = isChatEmpty && isSmallScreen && inputFocused && !limitReached
  const showHero = isChatEmpty && (!isSmallScreen || !inputFocused)

  const agentActionsVisible = guestAgentActionsVisibleAtom()
  const agentDiffOpen = guestAgentDiffOpenAtom()
  const agentDiff = guestAgentDiffAtom()
  const agentBusy = guestAgentBusyAtom()
  const agentEnabled = guestAgentEnabledAtom()
  const agentMakeMode = guestAgentMakeModeAtom()
  const agentMakePreview = guestAgentMakePreviewAtom()
  const uiMode = guestUiModeAtom()
  const musicMode = guestMusicModeAtom()
  const uiPage = guestUiPageAtom()
  const envMode = guestEnvModeAtom()
  const flowMode = guestFlowModeAtom()
  const explainMode = explainModeAtom()
  const queuedCount = guestQueuedCountAtom()
  const desktopRequestId = guestDesktopRequestIdAtom()
  const previewBusy = guestPreviewBusyAtom()
  const previewLoading = guestPreviewLoadingAtom()
  const uiBaseUrl = guestUiBaseUrlAtom()
  const musicBaseUrl = guestMusicBaseUrlAtom()
  const reasoningStream = guestReasoningStreamAtom()
  const traceStream = guestTraceStreamAtom()
  const traceAuto = guestTraceAutoAtom()
  const computerUrl = guestComputerUrlAtom()
  const previewHold = guestPreviewHoldAtom()
  const uiInputLock = guestUiInputLockAtom()
  const theme = appThemeAtom()
  const isLightTheme = theme === 'light'
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState("")
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const [computerUrlInput, setComputerUrlInput] = useState("")
  const webviewRef = useRef<HTMLWebViewElement | null>(null)

  const handleExplainModeToggle = () => {
    const next = !explainModeAtom()
    if (typeof window !== 'undefined' && window.electron?.explain?.setMode) {
      window.electron.explain
        .setMode(next)
        .catch(() => {
          frame.run(() => {
            explainModeAtom.set(next)
            if (next) {
              guestUiModeAtom.set(false)
              guestMusicModeAtom.set(false)
              guestUiPageAtom.set(null)
              guestEnvModeAtom.set(false)
              guestFlowModeAtom.set(false)
              guestAgentMakeModeAtom.set(false)
            }
          })
        })
      return
    }
    frame.run(() => {
      explainModeAtom.set(next)
      if (next) {
        guestUiModeAtom.set(false)
        guestMusicModeAtom.set(false)
        guestUiPageAtom.set(null)
        guestEnvModeAtom.set(false)
        guestFlowModeAtom.set(false)
        guestAgentMakeModeAtom.set(false)
      }
    })
  }

  grooveDbModel.dbAtom()

  debugStreamEnabled =
    typeof window !== 'undefined' &&
    (window.localStorage.getItem('gen_debug_stream') === '1' ||
      window.location.search.includes('debugStream=1'))

  const mobileMenuOpen = guestMobileMenuOpenAtom()
  const sidebarCollapsed = guestSidebarCollapsedAtom()
  const previewMode = explainMode ? 'explain' : agentMakeMode ? 'agent' : musicMode ? 'music' : uiMode ? 'ui' : null
  const showPreview = isDesktop && previewMode !== null
  const showUiPreview = previewMode === 'ui'

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!isDesktop) return
    const openHandler = () => {
      setFindOpen(true)
      window.setTimeout(() => {
        findInputRef.current?.focus()
        findInputRef.current?.select()
      }, 0)
    }
    window.addEventListener("app:find-open", openHandler)
    return () => {
      window.removeEventListener("app:find-open", openHandler)
    }
  }, [isDesktop])

  useEffect(() => {
    if (!findOpen) {
      setFindQuery("")
      return
    }
  }, [findOpen])

  const handleFindClose = () => {
    setFindOpen(false)
  }

  const handleResearchSubmit = () => {
    const query = findQuery.trim()
    if (!query) {
      return
    }
    setFindOpen(false)
    setFindQuery("")
    handleGuestSubmit(frame, `notes about ${query}`)
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!isDesktop) return
    window.electron?.app
      ?.getUiBaseUrl?.()
      .then((url) => {
        if (url) {
          frame.run(() => {
            guestUiBaseUrlAtom.set(url)
          })
        }
      })
      .catch(() => {})
  }, [isDesktop])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!isDesktop) return
    window.electron?.app
      ?.getMusicBaseUrl?.()
      .then((url) => {
        if (url) {
          frame.run(() => {
            guestMusicBaseUrlAtom.set(url)
            if (!guestComputerUrlAtom().trim()) {
              guestComputerUrlAtom.set(url)
            }
          })
        }
      })
      .catch(() => {})
  }, [frame, isDesktop])

  useEffect(() => {
    if (!computerUrl) return
    setComputerUrlInput(computerUrl)
  }, [computerUrl])

  const previewUrl =
    uiPage && uiBaseUrl ? `${uiBaseUrl.replace(/\/$/, "")}/gen/${uiPage}` : null
  const normalizedComputerUrl = normalizeComputerUrl(computerUrl || musicBaseUrl || "")
  const musicPreviewUrl = normalizedComputerUrl ? normalizedComputerUrl : null

  const handleComputerNavigate = () => {
    const next = normalizeComputerUrl(computerUrlInput)
    if (!next) {
      return
    }
    guestComputerUrlAtom.set(next)
  }

  const handleComputerReload = () => {
    if (webviewRef.current && typeof webviewRef.current.reload === "function") {
      webviewRef.current.reload()
      return
    }
    if (musicPreviewUrl) {
      guestComputerUrlAtom.set(musicPreviewUrl)
    }
  }

  const handleComputerBack = () => {
    if (webviewRef.current && typeof webviewRef.current.goBack === "function") {
      webviewRef.current.goBack()
    }
  }

  const handleComputerForward = () => {
    if (webviewRef.current && typeof webviewRef.current.goForward === "function") {
      webviewRef.current.goForward()
    }
  }

  useEffect(() => {
    if (!uiPage) {
      guestPreviewHoldAtom.set(true)
      return
    }
    guestPreviewHoldAtom.set(true)
    const timer = window.setTimeout(() => {
      guestPreviewHoldAtom.set(false)
    }, 600)
    return () => {
      window.clearTimeout(timer)
    }
  }, [uiPage])

  useEffect(() => {
    if (!isDesktop) return
    const webview = webviewRef.current
    if (!webview) return

    const handleNavigate = () => {
      const nextUrl = webview.getURL?.()
      if (nextUrl) {
        guestComputerUrlAtom.set(nextUrl)
      }
    }

    webview.addEventListener('did-navigate', handleNavigate)
    webview.addEventListener('did-navigate-in-page', handleNavigate)
    return () => {
      webview.removeEventListener('did-navigate', handleNavigate)
      webview.removeEventListener('did-navigate-in-page', handleNavigate)
    }
  }, [isDesktop, musicPreviewUrl])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isDesktop) return
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; path?: string; mode?: string; page?: string }>)
        .detail
      frame.run(() => {
        if (detail?.mode) {
          const nextUi = detail.mode === 'ui'
          const nextMusic = detail.mode === 'music'
          guestUiModeAtom.set(nextUi)
          guestMusicModeAtom.set(nextMusic)
          if (!nextMusic) {
            resetReasoningStream()
          }
          if (!nextUi) {
            guestUiPageAtom.set(null)
          } else if (!detail.page) {
            guestUiPageAtom.set(null)
          }
        }
        if (typeof detail?.page === 'string' && detail?.mode !== 'off') {
          guestUiPageAtom.set(detail.page)
        }
        if (detail?.id) {
          guestDesktopWorkspaceIdAtom.set(detail.id)
        }
        if (detail?.path) {
          guestDesktopWorkspacePathAtom.set(detail.path)
        }
      })

      if (detail?.id && !detail?.path && window.electron?.ai?.listWorkspaces) {
        window.electron.ai
          .listWorkspaces()
          .then((list) => {
            const selected = list?.find((workspace) => workspace.id === detail.id)
            const nextPath = selected?.path ?? null
            frame.run(() => {
              guestDesktopWorkspacePathAtom.set(nextPath)
            })
          })
          .catch(() => {})
      }
    }
    window.addEventListener('app:workspace-selected', handler)
    return () => {
      window.removeEventListener('app:workspace-selected', handler)
    }
  }, [frame, isDesktop])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isDesktop) return
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail
      frame.run(() => {
        guestEnvModeAtom.set(!!detail?.active)
      })
    }
    window.addEventListener('app:env-mode', handler)
    return () => {
      window.removeEventListener('app:env-mode', handler)
    }
  }, [frame, isDesktop])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isDesktop) return
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail
      frame.run(() => {
        const next = !!detail?.active
        guestAgentMakeModeAtom.set(next)
        if (next) {
          guestUiModeAtom.set(false)
          guestMusicModeAtom.set(false)
          guestUiPageAtom.set(null)
          guestEnvModeAtom.set(false)
          guestFlowModeAtom.set(false)
        }
      })
    }
    window.addEventListener('app:agent-mode', handler)
    return () => {
      window.removeEventListener('app:agent-mode', handler)
    }
  }, [frame, isDesktop])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isDesktop) return
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail
      frame.run(() => {
        guestFlowModeAtom.set(!!detail?.active)
      })
    }
    window.addEventListener('app:flow-mode', handler)
    return () => {
      window.removeEventListener('app:flow-mode', handler)
    }
  }, [frame, isDesktop])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isDesktop) return
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail
      frame.run(() => {
        const next = !!detail?.active
        explainModeAtom.set(next)
        if (next) {
          guestUiModeAtom.set(false)
          guestMusicModeAtom.set(false)
          guestUiPageAtom.set(null)
          guestEnvModeAtom.set(false)
          guestFlowModeAtom.set(false)
          guestAgentMakeModeAtom.set(false)
        }
      })
    }
    window.addEventListener('app:explain-mode', handler)
    return () => {
      window.removeEventListener('app:explain-mode', handler)
    }
  }, [frame, isDesktop])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.electron?.ai?.onEvent) return
    const dispose = window.electron.ai.onEvent(handleDesktopEvent)
    return () => {
      dispose?.()
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isDesktop) return
    if (!guestTraceAutoAtom()) return
    let active = true
    const tick = async () => {
      if (!active) return
      const content = await fetchTraceTail()
      if (content) {
        guestTraceStreamAtom.set(content)
      }
      if (active) {
        window.setTimeout(tick, 1200)
      }
    }
    tick()
    return () => {
      active = false
    }
  }, [isDesktop, guestTraceAutoAtom()])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.uiMode = uiMode ? 'true' : 'false'
    document.documentElement.dataset.musicMode = musicMode ? 'true' : 'false'
    document.documentElement.dataset.envMode = envMode ? 'true' : 'false'
    document.documentElement.dataset.flowMode = flowMode ? 'true' : 'false'
    document.documentElement.dataset.explainMode = explainMode ? 'true' : 'false'
    return () => {
      if (!uiMode) {
        document.documentElement.dataset.uiMode = 'false'
      }
      if (!musicMode) {
        document.documentElement.dataset.musicMode = 'false'
      }
      if (!envMode) {
        document.documentElement.dataset.envMode = 'false'
      }
      if (!flowMode) {
        document.documentElement.dataset.flowMode = 'false'
      }
      if (!explainMode) {
        document.documentElement.dataset.explainMode = 'false'
      }
    }
  }, [uiMode, musicMode, envMode, flowMode, explainMode])

  useEffect(() => {
    if (!uiMode) {
      guestUiInputLockAtom.set(true)
    }
  }, [uiMode])

  useEffect(() => {
    queuedSubmitFrame = frame
    return () => {
      if (queuedSubmitFrame === frame) {
        queuedSubmitFrame = null
      }
    }
  }, [frame])

  useEffect(() => {
    if (!isDesktop || !uiMode) return
    if (isStreaming) return
    if (queuedCount === 0) return
    drainQueuedPrompts()
  }, [frame, isDesktop, uiMode, isStreaming, queuedCount])

  const contextPanel = (
    <ContextPanel
      chats={[]}
      activeChatId={null}
      isAuthenticated={false}
      profile={null}
      layout="sidebar"
      showThreads={!isDesktop}
      onToggleSidebar={() => guestSidebarCollapsedAtom.set(!sidebarCollapsed)}
    />
  )

  const chatMessagesPadding = showPreview
    ? "px-6 py-6"
    : "max-w-3xl mx-auto py-6 sm:py-8 px-4 sm:px-6"
  const chatActionsPadding = showPreview ? "px-6 pb-2" : "max-w-4xl mx-auto px-4 pb-2"

  const chatContent = (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className={chatMessagesPadding}>
          {showHero && <EmptyChatState />}
          {!isChatEmpty && (
            <>
              <MessageList
                messages={messages}
                streamingContent={streamingContent}
                isStreaming={isStreaming}
                showStreaming={!uiMode}
              />
              <div ref={guestMessagesEndRefAtom.mutableRef} />
              {debugStreamEnabled && (
                <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-3 text-xs text-emerald-200/90">
                  <div className="mb-2 text-[10px] uppercase tracking-wider text-white/50">
                    Debug stream (non-reatom)
                  </div>
                  <pre
                    ref={(node) => {
                      debugStreamEl = node
                    }}
                    className="whitespace-pre-wrap text-[12px] leading-relaxed"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="shrink-0">
        {isDesktop && agentActionsVisible && (
          <div className={chatActionsPadding}>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleApplyAgent(false)}
                disabled={agentBusy}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${agentBusy ? 'border-white/10 bg-white/5 text-white/40' : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:border-emerald-300/60'}`}
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => handleApplyAgent(true)}
                disabled={agentBusy}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${agentBusy ? 'border-white/10 bg-white/5 text-white/40' : 'border-cyan-400/30 bg-cyan-500/15 text-cyan-100 hover:border-cyan-300/60'}`}
              >
                Apply + commit
              </button>
              <button
                type="button"
                onClick={() => handleToggleDiff()}
                disabled={agentBusy}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${agentBusy ? 'border-white/10 bg-white/5 text-white/40' : 'border-white/20 bg-white/10 text-white/80 hover:border-white/40'}`}
              >
                {agentDiffOpen ? 'Hide diff' : 'Show diff'}
              </button>
            </div>
            {agentDiffOpen && (
              <div className="mt-2 rounded-2xl border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-emerald-100/90 max-h-56 overflow-auto whitespace-pre-wrap">
                {agentDiff === null
                  ? 'Loading diff...'
                  : agentDiff === ''
                    ? 'No agent changes yet.'
                    : agentDiff}
              </div>
            )}
          </div>
        )}
        <ChatInput
          onSubmit={(content) =>
            agentMakeMode
              ? handleAgentMakeSubmit(frame, content)
              : flowMode
                ? handleFlowSubmit(frame, content)
                : envMode
                  ? handleEnvSubmit(frame, content)
                  : explainMode
                    ? handleExplainSubmit(frame, content)
                    : handleGuestSubmit(frame, content)
          }
          isLoading={isStreaming}
          selectedModel={selectedModelAtom()}
          onModelChange={(model) => selectedModelAtom.set(model)}
          remainingRequests={remainingRequests}
          limitReached={limitReached}
          showInlineGreeting={showInlineGreeting}
          onFocusChange={(focused) => {
            guestInputFocusedAtom.set(focused)
            if (focused) {
              guestUiInputLockAtom.set(true)
            }
          }}
          agentMode={isDesktop && agentEnabled}
          agentMakeMode={agentMakeMode}
          musicMode={musicMode}
          uiMode={uiMode}
          uiPage={uiPage}
          uiInputLock={uiInputLock}
          queuedCount={queuedCount}
          envMode={envMode}
          flowMode={flowMode}
          explainMode={explainMode}
          onExplainModeToggle={handleExplainModeToggle}
          agentButtons={
            flowMode
              ? [
                  {
                    id: 'flow-status',
                    label: 'Status',
                    onClick: () => handleFlowSubmit(frame, 'status'),
                  },
                ]
              : envMode
                ? [
                    {
                      id: 'print-env',
                      label: 'Print env',
                      onClick: () => handleEnvPrint(frame),
                    },
                  ]
                : []
          }
        />
      </div>
    </>
  )

  const showPreviewLoader = showUiPreview && previewLoading
  const showPreviewFrame = showUiPreview && !!previewUrl && !previewHold

  useEffect(() => {
    if (!showUiPreview) return
    console.debug(
      '[guest] preview loader state',
      JSON.stringify({
        previewLoading,
        previewBusy,
        isStreaming,
        desktopRequestId,
        hasDesktopOutput,
        pendingReady,
        streamingBufferLength: streamingBuffer.length,
        queuedCount,
      }),
    )
  }, [showUiPreview, previewLoading, previewBusy, isStreaming, desktopRequestId, queuedCount])

  return (
    <>
      {!isDesktop && (
        <header className="gen-mobile-header md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-[#07080f]/95 backdrop-blur-sm border-b border-white/5">
          <button
            onClick={() => guestMobileMenuOpenAtom.set(true)}
            className="p-2 -ml-2 text-white/70 hover:text-white hover:bg-white/10 rounded-2xl transition-colors"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleAppTheme()}
              className="gen-theme-toggle flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-white/75 transition hover:text-white hover:bg-white/10"
              aria-label={isLightTheme ? "Switch to dark theme" : "Switch to light theme"}
              title={isLightTheme ? "Switch to dark theme" : "Switch to light theme"}
            >
              {isLightTheme ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <Link
              to="/auth"
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-white text-black rounded-xl hover:bg-white/90 transition-colors"
            >
              <LogIn size={16} />
              <span>Sign in</span>
            </Link>
          </div>
        </header>
      )}

      {!isDesktop && mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => guestMobileMenuOpenAtom.set(false)}
          />
          <aside className="gen-mobile-drawer absolute top-0 left-0 h-full w-72 bg-[#0a0b10] border-r border-white/5 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <span className="text-white font-medium">Menu</span>
              <button
                onClick={() => guestMobileMenuOpenAtom.set(false)}
                className="p-2 -mr-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 p-4">{contextPanel}</div>
            <div className="p-4 border-t border-white/5">
              <Link
                to="/auth"
                onClick={() => guestMobileMenuOpenAtom.set(false)}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors"
              >
                <LogIn size={18} />
                <span>Sign in</span>
              </Link>
            </div>
          </aside>
        </div>
      )}

      {isDesktop && findOpen && (
        <div className="gen-overlay-card fixed top-6 right-24 z-50 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#171821]/95 px-4 py-2 text-white shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
          <Search size={16} className="text-white/60" />
          <input
            ref={findInputRef}
            value={findQuery}
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                handleFindClose()
              } else if (event.key === "Enter") {
                event.preventDefault()
                handleResearchSubmit()
              }
            }}
            placeholder="Search notes (research mode)"
            className="w-64 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
          />
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Research</span>
          <button
            type="button"
            onClick={handleFindClose}
            className="rounded-full p-1 text-white/60 hover:text-white"
            aria-label="Close search"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => toggleAppTheme()}
        className="gen-theme-toggle fixed top-6 right-6 z-50 hidden h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-[#171821]/90 text-white/75 shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition hover:text-white hover:bg-[#1c1e2a] md:flex"
        aria-label={isLightTheme ? "Switch to dark theme" : "Switch to light theme"}
        title={isLightTheme ? "Switch to dark theme" : "Switch to light theme"}
      >
        {isLightTheme ? <Moon size={16} /> : <Sun size={16} />}
      </button>

      <div
        className={
          isDesktop
            ? `gen-chat-shell safe-min-h-screen w-full md:grid bg-inherit ${sidebarCollapsed ? 'md:grid-cols-[0px_1fr]' : 'md:grid-cols-[320px_1fr]'}`
            : `gen-chat-shell safe-min-h-screen max-w-[1700px] mx-auto md:grid bg-inherit ${sidebarCollapsed ? 'md:grid-cols-[0px_1fr]' : 'md:grid-cols-[280px_1fr]'}`
        }
      >
        {isDesktop && (
          <aside
            className={`gen-chat-sidebar hidden md:flex border-r flex-col safe-h-screen border-none overflow-hidden ${sidebarCollapsed ? 'w-0 opacity-0' : 'w-full opacity-100'}`}
          >
            {contextPanel}
          </aside>
        )}
        {!isDesktop && (
          <aside
            className={`gen-chat-sidebar hidden md:flex border-r flex-col safe-h-screen border-none overflow-hidden ${sidebarCollapsed ? 'w-0 opacity-0' : 'w-full opacity-100'}`}
          >
            <ContextPanel
              chats={[]}
              activeChatId={null}
              isAuthenticated={false}
              profile={null}
              onToggleSidebar={() => guestSidebarCollapsedAtom.set(!sidebarCollapsed)}
            />
          </aside>
        )}
        <main
          className={
            showPreview
              ? "gen-chat-main flex safe-h-screen bg-[#07080f] relative"
              : "gen-chat-main flex flex-col safe-h-screen bg-[#07080f] pt-[calc(env(safe-area-inset-top)+3.5rem)] pb-[calc(env(safe-area-inset-bottom)+140px)] md:pt-0 md:pb-0 relative"
          }
        >
          {showPreview ? (
            <div className="flex flex-1 min-h-0">
              <section className="gen-chat-main relative flex w-full min-w-[360px] max-w-[520px] flex-col border-r border-white/5 bg-[#07080f]">
                {chatContent}
              </section>
              <section className="gen-preview-panel flex flex-1 min-w-0 flex-col bg-black text-white">
                {previewMode === 'ui' ? (
                  <div
                    className="relative flex-1 min-h-0"
                    onPointerDown={wrap(() => {
                      guestUiInputLockAtom.set(false)
                    })}
                  >
                    {showPreviewFrame ? (
                      <iframe
                        title="UI Preview"
                        src={previewUrl}
                        className="h-full w-full border-0 bg-black"
                      />
                    ) : null}
                    {showPreviewLoader && (
                      <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs text-white/70 shadow-lg backdrop-blur">
                        <span className="h-3 w-3 animate-spin rounded-full border border-white/60 border-t-transparent" />
                        <span>Generating</span>
                      </div>
                    )}
                  </div>
                ) : previewMode === 'music' ? (
                  <div className="flex flex-1 min-h-0 flex-col bg-[#05060b] text-white">
                    <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.25em] text-white/50">
                          Computer Use
                        </div>
                        <div className="text-lg font-semibold text-white">
                          Browser Control
                        </div>
                      </div>
                      <div className="text-xs text-white/60">
                        {musicPreviewUrl ? 'Ready' : 'Waiting'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 border-b border-white/10 bg-[#0b0d16] px-4 py-3">
                      <button
                        type="button"
                        onClick={handleComputerBack}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 transition hover:border-white/20 hover:text-white"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={handleComputerForward}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 transition hover:border-white/20 hover:text-white"
                      >
                        →
                      </button>
                      <button
                        type="button"
                        onClick={handleComputerReload}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 transition hover:border-white/20 hover:text-white"
                      >
                        Reload
                      </button>
                      <input
                        value={computerUrlInput}
                        onChange={(event) => setComputerUrlInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            handleComputerNavigate()
                          }
                        }}
                        placeholder="https://"
                        className="ml-2 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white/80 placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-white/20"
                      />
                      <button
                        type="button"
                        onClick={handleComputerNavigate}
                        className="rounded-lg border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/20"
                      >
                        Go
                      </button>
                    </div>
                      <div className="border-b border-white/10 bg-[#0b0d16] px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                            Reasoning trace
                          </div>
                          <button
                            type="button"
                            onClick={() => guestReasoningStreamAtom.set('')}
                            className="text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white/70"
                          >
                            Clear
                          </button>
                        </div>
                        <pre className="mt-2 max-h-[160px] whitespace-pre-wrap text-xs leading-relaxed text-emerald-200/90">
                          {reasoningStream || 'Waiting for reasoning...'}
                        </pre>
                      </div>
                      <div className="border-b border-white/10 bg-[#0b0d16] px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                            Debug trace
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => guestTraceAutoAtom.set(!traceAuto)}
                              className="text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white/70"
                            >
                              {traceAuto ? 'Auto: on' : 'Auto: off'}
                            </button>
                            <button
                              type="button"
                              onClick={() => refreshTracePanel()}
                              className="text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white/70"
                            >
                              Refresh
                            </button>
                            <button
                              type="button"
                              onClick={() => copyTraceToClipboard()}
                              className="text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white/70"
                            >
                              Copy
                            </button>
                            <button
                              type="button"
                              onClick={() => clearTracePanel()}
                              className="text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white/70"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <pre className="mt-2 max-h-[180px] whitespace-pre-wrap text-[11px] leading-relaxed text-sky-200/90">
                          {traceStream || 'No trace data yet.'}
                        </pre>
                      </div>
                    <div className="flex-1 min-h-0 bg-black">
                      {musicPreviewUrl ? (
                        isDesktop ? (
                          <webview
                            ref={webviewRef}
                            title="Computer Browser"
                            src={musicPreviewUrl}
                            className="h-full w-full"
                            partition="persist:gen-computer"
                            allowpopups="true"
                          />
                        ) : (
                          <iframe
                            title="Computer Browser"
                            src={musicPreviewUrl}
                            className="h-full w-full border-0 bg-black"
                          />
                        )
                      ) : (
                        <div className="flex h-full items-center justify-center px-6 text-sm text-white/60">
                          Enter a URL to start browsing.
                        </div>
                      )}
                    </div>
                  </div>
                ) : previewMode === 'explain' ? (
                  <ExplainViewer />
                ) : (
                  <div className="flex flex-1 min-h-0 flex-col bg-[#05060b] text-white">
                    <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.25em] text-white/50">
                          Agent Make
                        </div>
                        <div className="text-lg font-semibold text-white">
                          {agentMakePreview?.name ?? 'New agent'}
                        </div>
                      </div>
                      <div className="text-xs text-white/60">
                        {agentMakePreview
                          ? agentMakePreview.source === 'base'
                            ? 'Matched base agent'
                            : 'Custom agent'
                          : 'Draft'}
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto p-6">
                      {agentMakePreview ? (
                        <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/50 p-4 text-xs leading-relaxed text-white/80">
                          {agentMakePreview.json}
                        </pre>
                      ) : (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                          Write a prompt and press Enter to generate the agent JSON.
                        </div>
                      )}
                      {agentMakePreview?.matchedTerms.length ? (
                        <div className="mt-4 text-xs text-white/40">
                          Matched: {agentMakePreview.matchedTerms.join(', ')}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : (
            chatContent
          )}
        </main>
      </div>
    </>
  )
})

const authIsStreamingAtom = reatomBoolean(false, 'authIsStreaming')
const authStreamingContentAtom = atom('', 'authStreamingContent')
const authMessagesAtom = atom<Message[]>([], 'authMessages')
const authActiveThreadIdAtom = atom<string | null>(null, 'authActiveThreadId')
const authMobileMenuOpenAtom = reatomBoolean(false, 'authMobileMenuOpen')
const authSidebarCollapsedAtom = reatomBoolean(false, 'authSidebarCollapsed')
const authInputFocusedAtom = reatomBoolean(false, 'authInputFocused')
const authMessagesEndRefAtom = atom<HTMLDivElement | null>(null, 'authMessagesEndRef').extend(target => ({
  mutableRef: {
    set current(value: HTMLDivElement | null) {
      target.set(value)
    },
  },
}))

effect(() => {
  authMessagesAtom()
  authStreamingContentAtom()
  const ref = authMessagesEndRefAtom()
  ref?.scrollIntoView({ behavior: 'smooth' })
}, 'authScrollToEnd')

const AuthenticatedChatInner = reatomComponent(({
  profile,
  onSignOut,
}: {
  profile: { name?: string | null; email?: string | null; image?: string | null }
  onSignOut: () => void
}) => {
  const displayName = profile.email ?? profile.name ?? 'Signed in'
  const avatarInitial = (profile.email ?? profile.name ?? 'U').charAt(0).toUpperCase()

  const accountValue = useAccount(GenAccount, {
    resolve: {
      root: {
        chatThreads: {
          $each: { messages: true, contextItemIds: true, blockIds: true },
        },
      },
    },
  })

  const sortedThreads = accountValue?.$isLoaded && accountValue.root?.chatThreads
    ? [...accountValue.root.chatThreads]
        .filter((t): t is NonNullable<typeof t> & { $isLoaded: true } => t != null && t.$isLoaded)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    : []

  if (authActiveThreadIdAtom() === null && sortedThreads.length > 0) {
    authActiveThreadIdAtom.set(sortedThreads[0].$jazz.id)
  }

  const activeThreadId = authActiveThreadIdAtom()
  const activeThread = activeThreadId
    ? sortedThreads.find((t) => t.$jazz.id === activeThreadId) || null
    : null

  const threadMessages = activeThread?.messages
    ? [...activeThread.messages]
        .filter((m): m is NonNullable<typeof m> & { $isLoaded: true } => m != null && m.$isLoaded)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    : []

  const messages: Message[] = threadMessages.map((m, idx) => ({
    id: idx,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
  }))

  authMessagesAtom.set(messages)

  const isStreaming = authIsStreamingAtom()
  const streamingContent = authStreamingContentAtom()
  const isChatEmpty = messages.length === 0 && !isStreaming
  const isSmallScreen = isSmallScreenAtom()
  const inputFocused = authInputFocusedAtom()
  const showInlineGreeting = isChatEmpty && isSmallScreen && inputFocused
  const showHero = isChatEmpty && (!isSmallScreen || !inputFocused)
  const theme = appThemeAtom()
  const isLightTheme = theme === 'light'

  const chats = sortedThreads.map((thread) => ({
    id: thread.$jazz.id,
    title: thread.title,
    created_at: thread.createdAt ? new Date(thread.createdAt) : new Date(),
  }))

  const handleDeleteChat = (chatId: string) => {
    if (!accountValue?.$isLoaded || !accountValue.root?.chatThreads) return

    const index = accountValue.root.chatThreads.findIndex(
      (t: any) => t?.$jazz?.id === chatId
    )
    if (index !== -1) {
      accountValue.root.chatThreads.$jazz.splice(index, 1)
      if (activeThreadId === chatId) {
        const remaining = sortedThreads.filter((t) => t.$jazz.id !== chatId)
        authActiveThreadIdAtom.set(remaining.length > 0 ? remaining[0].$jazz.id : null)
      }
    }
  }

  const handleActivatePersonal = () => {
    if (!accountValue?.$isLoaded || !accountValue.root?.chatThreads) return

    const existing = sortedThreads.find(
      (thread) => thread.title?.toLowerCase() === 'personal',
    )
    if (existing) {
      authActiveThreadIdAtom.set(existing.$jazz.id)
      authMobileMenuOpenAtom.set(false)
      return
    }

    const group = Group.create()
    const messagesList = ChatMessageList.create([], { owner: group })
    const contextItemIds = ContextItemIdList.create([], { owner: group })
    const blockIds = BlockIdList.create([], { owner: group })
    const newThread = ChatThread.create(
      {
        title: 'Personal',
        messages: messagesList,
        createdAt: Date.now(),
        contextItemIds,
        blockIds,
      },
      { owner: group },
    )
    accountValue.root.chatThreads.$jazz.push(newThread)
    authActiveThreadIdAtom.set(newThread.$jazz.id)
    authMobileMenuOpenAtom.set(false)
  }

const handleSubmit = async (userContent: string) => {
  if (!userContent.trim() || isStreaming || !accountValue?.$isLoaded) return

  let thread = activeThread
  let threadOwner = thread?.$jazz.owner

  try {

    if (!thread || !threadOwner) {
        const group = Group.create()
        const messagesList = ChatMessageList.create([], { owner: group })
        const contextItemIds = ContextItemIdList.create([], { owner: group })
        const blockIds = BlockIdList.create([], { owner: group })
        const newThread = ChatThread.create(
          {
            title: userContent.slice(0, 40) || 'New chat',
            messages: messagesList,
            createdAt: Date.now(),
            contextItemIds,
            blockIds,
          },
          { owner: group },
        )
        accountValue.root.chatThreads.$jazz.push(newThread)
      authActiveThreadIdAtom.set(newThread.$jazz.id)
      thread = newThread
      threadOwner = group
    }

    if (isCapabilitiesPrompt(userContent)) {
      if (thread && thread.messages && threadOwner) {
        const userMessage = ChatMessage.create(
          {
            role: 'user',
            content: userContent,
            createdAt: Date.now(),
          },
          { owner: threadOwner },
        )
        thread.messages.$jazz.push(userMessage)
        const assistantMessage = ChatMessage.create(
          {
            role: 'assistant',
            content: buildCapabilitiesMessage(),
            createdAt: Date.now(),
          },
          { owner: threadOwner },
        )
        thread.messages.$jazz.push(assistantMessage)
      }
      authStreamingContentAtom.set('')
      return
    }

    authIsStreamingAtom.set(true)
    authStreamingContentAtom.set('')

    if (thread && thread.messages && threadOwner) {
      const userMessage = ChatMessage.create(
        {
          role: 'user',
          content: userContent,
            createdAt: Date.now(),
          },
          { owner: threadOwner },
        )
        thread.messages.$jazz.push(userMessage)
      }

      const apiMessages =
        thread?.messages
          ?.filter((m): m is NonNullable<typeof m> & { $isLoaded: true } => m != null && m.$isLoaded)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })) ?? []

      const res = await fetch('/api/chat/ai', {
        method: 'POST',
        headers: withJazzAuthHeaders({ 'content-type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          threadId: thread?.$jazz.id,
          messages: apiMessages,
          model: selectedModelAtom(),
        }),
      })

      if (!res.ok) {
        let detail = ''
        try {
          const data = (await res.clone().json()) as { error?: string; detail?: string }
          detail = data.detail ?? data.error ?? ''
        } catch {
          try {
            detail = await res.text()
          } catch {
            detail = ''
          }
        }
        throw new Error(
          detail
            ? `AI request failed: ${detail}`
            : `AI request failed: ${res.status}`,
        )
      }

      const reader = res.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        authStreamingContentAtom.set(accumulated)
      }

      if (accumulated && thread && thread.messages && threadOwner) {
        const assistantMessage = ChatMessage.create(
          {
            role: 'assistant',
            content: accumulated,
            createdAt: Date.now(),
          },
          { owner: threadOwner },
        )
        thread.messages.$jazz.push(assistantMessage)
      }
      authStreamingContentAtom.set('')
    } catch (error) {
      console.error('Chat error:', error)
      authStreamingContentAtom.set('')
      if (error instanceof Error && thread && thread.messages && threadOwner) {
        const assistantMessage = ChatMessage.create(
          {
            role: 'assistant',
            content: error.message,
            createdAt: Date.now(),
          },
          { owner: threadOwner },
        )
        thread.messages.$jazz.push(assistantMessage)
      }
    } finally {
      authIsStreamingAtom.set(false)
    }
  }

  return (
    <>
      <header className="gen-mobile-header md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-[#07080f]/95 backdrop-blur-sm border-b border-white/5">
        <button
          onClick={() => authMobileMenuOpenAtom.set(true)}
          className="p-2 -ml-2 text-white/70 hover:text-white hover:bg-white/10 rounded-2xl transition-colors"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleAppTheme()}
            className="gen-theme-toggle flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-white/75 transition hover:text-white hover:bg-white/10"
            aria-label={isLightTheme ? "Switch to dark theme" : "Switch to light theme"}
            title={isLightTheme ? "Switch to dark theme" : "Switch to light theme"}
          >
            {isLightTheme ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button
            onClick={() => {
              onSignOut()
              window.location.href = '/'
            }}
            className="flex items-center gap-2 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Sign out"
          >
            <div className="w-7 h-7 rounded-full bg-cyan-600 flex items-center justify-center">
              <span className="text-xs font-medium text-white">
                {avatarInitial}
              </span>
            </div>
          </button>
        </div>
      </header>

      <button
        type="button"
        onClick={() => toggleAppTheme()}
        className="gen-theme-toggle fixed top-6 right-6 z-50 hidden h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-[#171821]/90 text-white/75 shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition hover:text-white hover:bg-[#1c1e2a] md:flex"
        aria-label={isLightTheme ? "Switch to dark theme" : "Switch to light theme"}
        title={isLightTheme ? "Switch to dark theme" : "Switch to light theme"}
      >
        {isLightTheme ? <Moon size={16} /> : <Sun size={16} />}
      </button>

      {authMobileMenuOpenAtom() && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => authMobileMenuOpenAtom.set(false)}
          />
          <aside className="gen-mobile-drawer absolute top-0 left-0 h-full w-72 bg-[#0a0b10] border-r border-white/5 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <span className="text-white font-medium">Menu</span>
              <button
                onClick={() => authMobileMenuOpenAtom.set(false)}
                className="p-2 -mr-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ContextPanel
                chats={chats}
                activeChatId={activeThreadId}
                isAuthenticated={true}
                profile={profile}
                onDeleteChat={handleDeleteChat}
                onActivatePersonal={handleActivatePersonal}
              />
            </div>
            <div className="p-4 border-t border-white/5">
              <div className="flex items-center gap-3 mb-3 px-1">
                <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center shrink-0">
                  <span className="text-sm font-medium text-white">
                    {avatarInitial}
                  </span>
                </div>
                <span className="text-white/70 text-sm truncate">
                  {displayName}
                </span>
              </div>
              <button
                onClick={() => {
                  authMobileMenuOpenAtom.set(false)
                  onSignOut()
                  window.location.href = '/'
                }}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg transition-colors"
              >
                <LogOut size={18} />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      <div
        className={`gen-chat-shell safe-min-h-screen max-w-[1700px] mx-auto md:grid bg-inherit transition-all duration-300 ${authSidebarCollapsedAtom() ? 'md:grid-cols-[0px_1fr]' : 'md:grid-cols-[280px_1fr]'}`}
      >
        <aside
          className={`gen-chat-sidebar hidden md:flex border-r flex-col safe-h-screen border-none overflow-hidden transition-all duration-300 ${authSidebarCollapsedAtom() ? 'w-0 opacity-0' : 'w-full opacity-100'}`}
        >
          <ContextPanel
            chats={chats}
            activeChatId={activeThreadId}
            isAuthenticated={true}
            profile={profile}
            onToggleSidebar={() => authSidebarCollapsedAtom.set(!authSidebarCollapsedAtom())}
            onDeleteChat={handleDeleteChat}
            onActivatePersonal={handleActivatePersonal}
          />
        </aside>
        <main className="gen-chat-main flex flex-col safe-h-screen bg-[#07080f] pt-[calc(env(safe-area-inset-top)+3.5rem)] pb-[calc(env(safe-area-inset-bottom)+140px)] md:pt-0 md:pb-0 relative">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto py-6 sm:py-8 px-4 sm:px-6">
              {showHero && <EmptyChatState />}
              {!isChatEmpty && (
                <>
                  <MessageList
                    messages={messages}
                    streamingContent={streamingContent}
                    isStreaming={isStreaming}
                  />
                  <div ref={authMessagesEndRefAtom.mutableRef} />
                </>
              )}
            </div>
          </div>
          <div className="shrink-0">
            <div className="max-w-4xl mx-auto px-4 pb-2 flex justify-end">
              <ChatUsageDisplay />
            </div>
            <ChatInput
              onSubmit={handleSubmit}
              isLoading={isStreaming}
              selectedModel={selectedModelAtom()}
              onModelChange={(model) => selectedModelAtom.set(model)}
              showInlineGreeting={showInlineGreeting}
              onFocusChange={(focused) => authInputFocusedAtom.set(focused)}
            />
          </div>
        </main>
      </div>
    </>
  )
})

export const ChatPage = reatomComponent(() => {
  const frame = useFrame()
  const { isAuthenticated, profile, account, logOut } = useJazzAuth()
  const shortcuts = shortcutMapAtom()
  const isDesktop = guestIsDesktopAtom()
  activeChatModeAtom.set(isAuthenticated && !isDesktop ? 'auth' : 'guest')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (event: KeyboardEvent) => {
      if (matchesShortcut(event, shortcuts.newChat)) {
        event.preventDefault()
        frame.run(() => {
          handleNewChat()
        })
        return
      }
      if (matchesShortcut(event, shortcuts.toggleSidebar)) {
        event.preventDefault()
        frame.run(() => {
          if (activeChatModeAtom() === 'auth') {
            authSidebarCollapsedAtom.set(!authSidebarCollapsedAtom())
          } else {
            guestSidebarCollapsedAtom.set(!guestSidebarCollapsedAtom())
          }
        })
        return
      }
      if (matchesShortcut(event, shortcuts.commandPalette)) {
        event.preventDefault()
        frame.run(() => {
          commandPaletteOpenAtom.toggle()
        })
        return
      }
      if (matchesShortcut(event, shortcuts.explainMode)) {
        event.preventDefault()
        frame.run(() => {
          explainModeAtom.toggle()
        })
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [frame, shortcuts])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleNewChatEvent = () => {
      frame.run(() => {
        handleNewChat()
      })
    }
    const handleToggleSidebarEvent = () => {
      frame.run(() => {
        if (activeChatModeAtom() === 'auth') {
          authSidebarCollapsedAtom.set(!authSidebarCollapsedAtom())
        } else {
          guestSidebarCollapsedAtom.set(!guestSidebarCollapsedAtom())
        }
      })
    }
    const handleCommandPaletteEvent = () => {
      frame.run(() => {
        commandPaletteOpenAtom.toggle()
      })
    }
    window.addEventListener('app:new-chat', handleNewChatEvent)
    window.addEventListener('app:toggle-sidebar', handleToggleSidebarEvent)
    window.addEventListener('app:command-palette', handleCommandPaletteEvent)
    return () => {
      window.removeEventListener('app:new-chat', handleNewChatEvent)
      window.removeEventListener('app:toggle-sidebar', handleToggleSidebarEvent)
      window.removeEventListener('app:command-palette', handleCommandPaletteEvent)
    }
  }, [frame])

  if (isDesktop) {
    return <GuestChat />
  }

  if (isAuthenticated && !account?.$isLoaded) {
    return null
  }

  return isAuthenticated ? (
    <AuthenticatedChatInner profile={profile ?? {}} onSignOut={logOut} />
  ) : (
    <GuestChat />
  )
})
