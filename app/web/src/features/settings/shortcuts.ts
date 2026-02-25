import { action, atom, withConnectHook, wrap } from "@/shared/reatom/core"

export type ShortcutId =
  | "newChat"
  | "toggleSidebar"
  | "uiMode"
  | "musicMode"
  | "envMode"
  | "findInChat"
  | "commandPalette"
  | "switchProjects"
  | "explainMode"

export type ShortcutMap = Record<ShortcutId, string | null>

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  newChat: "CommandOrControl+N",
  toggleSidebar: "Command+E",
  uiMode: "Control+;",
  musicMode: "Control+M",
  envMode: "Control+V",
  findInChat: "CommandOrControl+F",
  commandPalette: "Command+K",
  switchProjects: "Command+L",
  explainMode: "Command+J",
}

export const shortcutMapAtom = atom<ShortcutMap>(
  { ...DEFAULT_SHORTCUTS },
  "shortcutMap",
)

const normalizeShortcutMap = (value?: Partial<ShortcutMap> | null) => ({
  ...DEFAULT_SHORTCUTS,
  ...value,
})

const loadShortcuts = action(async () => {
  if (typeof window === "undefined") return
  const api = window.electron?.app
  if (!api?.getShortcuts) return
  try {
    const next = await wrap(api.getShortcuts())
    shortcutMapAtom.set(normalizeShortcutMap(next))
  } catch {
    // Ignore invalid settings.
  }
}, "loadShortcuts")

shortcutMapAtom.extend(
  withConnectHook(() => {
    if (typeof window === "undefined") return
    void loadShortcuts()
  }),
)

export const updateShortcuts = action(async (next: Partial<ShortcutMap>) => {
  const merged = normalizeShortcutMap({ ...shortcutMapAtom(), ...next })
  shortcutMapAtom.set(merged)
  const api = typeof window === "undefined" ? null : window.electron?.app
  if (api?.setShortcuts) {
    try {
      await wrap(api.setShortcuts(merged))
    } catch {
      // Ignore failures; UI still reflects local value.
    }
  }
}, "updateShortcuts")

const normalizeKey = (value: string) => {
  if (value === " ") return "space"
  return value.toLowerCase()
}

export const matchesShortcut = (
  event: KeyboardEvent,
  accelerator?: string | null,
) => {
  if (!accelerator) return false
  const parts = accelerator
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)

  let requiresMeta = false
  let requiresCtrl = false
  let requiresAlt = false
  let requiresShift = false
  let requiresMetaOrCtrl = false
  let keyPart: string | null = null

  for (const part of parts) {
    if (part === "command" || part === "cmd" || part === "meta") {
      requiresMeta = true
      continue
    }
    if (part === "control" || part === "ctrl") {
      requiresCtrl = true
      continue
    }
    if (part === "commandorcontrol" || part === "cmdorctrl") {
      requiresMetaOrCtrl = true
      continue
    }
    if (part === "alt" || part === "option") {
      requiresAlt = true
      continue
    }
    if (part === "shift") {
      requiresShift = true
      continue
    }
    keyPart = part
  }

  const hasMeta = event.metaKey
  const hasCtrl = event.ctrlKey
  const hasAlt = event.altKey
  const hasShift = event.shiftKey

  if (requiresMetaOrCtrl && !(hasMeta || hasCtrl)) return false
  if (requiresMeta && !hasMeta) return false
  if (requiresCtrl && !hasCtrl) return false
  if (requiresAlt && !hasAlt) return false
  if (requiresShift && !hasShift) return false

  if (!requiresMeta && !requiresMetaOrCtrl && hasMeta) return false
  if (!requiresCtrl && !requiresMetaOrCtrl && hasCtrl) return false
  if (!requiresAlt && hasAlt) return false
  if (!requiresShift && hasShift) return false

  if (!keyPart) return false
  return normalizeKey(event.key) === keyPart
}

export const formatShortcut = (value?: string | null) => {
  if (!value) return "Unassigned"
  return value
    .replace("CommandOrControl", "Cmd/Ctrl")
    .replace("Command", "Cmd")
    .replace("Control", "Ctrl")
    .replace("Alt", "Option")
}

export const buildShortcutFromEvent = (event: KeyboardEvent) => {
  if (
    event.key === "Shift" ||
    event.key === "Control" ||
    event.key === "Meta" ||
    event.key === "Alt"
  ) {
    return null
  }

  const parts: string[] = []
  if (event.metaKey && event.ctrlKey) {
    parts.push("CommandOrControl")
  } else if (event.metaKey) {
    parts.push("Command")
  } else if (event.ctrlKey) {
    parts.push("Control")
  }
  if (event.altKey) {
    parts.push("Alt")
  }
  if (event.shiftKey) {
    parts.push("Shift")
  }

  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  parts.push(key)
  return parts.join("+")
}
