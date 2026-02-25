declare namespace Cloudflare {
  interface Env {
    JAZZ_WORKER_ACCOUNT?: string
    JAZZ_WORKER_SECRET?: string
    JAZZ_SYNC_SERVER?: string
    JAZZ_API_KEY?: string
    ADMIN_JAZZ_ACCOUNT_ID?: string
    OPENROUTER_API_KEY?: string
    OPENROUTER_MODEL?: string
    AI_SERVER_URL?: string
    AI_SERVER_TOKEN?: string
    AI_SERVER_MODEL?: string
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    GOOGLE_API_KEY?: string
    HF_TOKEN?: string
    HUGGING_FACE_API_KEY?: string
    POLAR_ACCESS_TOKEN?: string
    POLAR_WEBHOOK_SECRET?: string
    POLAR_PRO_PRODUCT_ID?: string
    POLAR_REFILL_PRODUCT_ID?: string
    POLAR_API_URL?: string
    CONTEXT_API_KEY?: string
  }
}

interface ImportMetaEnv {
  readonly VITE_JAZZ_SYNC_SERVER?: string
  readonly VITE_JAZZ_API_KEY?: string

  readonly VITE_CLAWDBOT_DASHBOARD_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  electron?: {
    app?: {
      getPath?: (name: "home") => Promise<string>
      getUiBaseUrl?: () => Promise<string>
      getMusicBaseUrl?: () => Promise<string>
      getShortcuts?: () => Promise<{
        newChat?: string | null
        toggleSidebar?: string | null
        uiMode?: string | null
        musicMode?: string | null
        envMode?: string | null
        findInChat?: string | null
        openUiRoute?: string | null
        openUiInCursor?: string | null
      }>
      setShortcuts?: (value: {
        newChat?: string | null
        toggleSidebar?: string | null
        uiMode?: string | null
        musicMode?: string | null
        envMode?: string | null
        findInChat?: string | null
        openUiRoute?: string | null
        openUiInCursor?: string | null
      }) => Promise<{
        newChat?: string | null
        toggleSidebar?: string | null
        uiMode?: string | null
        musicMode?: string | null
        envMode?: string | null
        findInChat?: string | null
        openUiRoute?: string | null
        openUiInCursor?: string | null
      }>
      onOpenSettings?: (handler: () => void) => () => void
    }
    env?: {
      saveFromPaste?: (input: string) => Promise<{
        ok: boolean
        keys: string[]
        error?: string
        stdout?: string
        stderr?: string
      }>
      listLocal?: () => Promise<{
        ok: boolean
        entries: { key: string; value: string; source: string }[]
        error?: string
      }>
      deleteLocal?: (key: string, source: string) => Promise<{
        ok: boolean
        removed: boolean
        error?: string
      }>
      setMode?: (active: boolean) => Promise<boolean>
    }
    find?: {
      start?: (query: string) => Promise<boolean>
      next?: () => Promise<boolean>
      prev?: () => Promise<boolean>
      stop?: () => Promise<boolean>
    }
    ai?: {
      listWorkspaces?: () => Promise<
        Array<{
          id: string
          name: string
          path: string
          createdAt: number
          updatedAt: number
          lastUsedAt?: number
        }>
      >
      addWorkspace?: (path: string) => Promise<{
        id: string
        name: string
        path: string
        createdAt: number
        updatedAt: number
        lastUsedAt?: number
      }>
      ensureUiModePage?: () => Promise<string | null>
      openPalette?: () => Promise<void>
      onNewChat?: (handler: () => void) => () => void
      onToggleSidebar?: (handler: () => void) => () => void
      onCommandPalette?: (handler: () => void) => () => void
      sendMessage?: (
        workspaceId: string,
        text: string,
      ) => Promise<{ requestId: string }>
      describeScreen?: () => Promise<{
        ok: boolean
        text?: string
        error?: string
        model?: string
      }>
      onEvent?: (
        handler: (event: {
          workspaceId: string
          type: string
          content?: string
          requestId?: string
          agentState?: {
            enabled: boolean
            repoRoot: string | null
            worktreePath: string | null
            dirtyCount: number
          }
          at: number
        }) => void,
      ) => () => void
      getAgentState?: (
        workspaceId: string,
      ) => Promise<{
        enabled: boolean
        repoRoot: string | null
        worktreePath: string | null
        dirtyCount: number
      }>
      setAgentMode?: (
        workspaceId: string,
        enabled: boolean,
      ) => Promise<{
        enabled: boolean
        repoRoot: string | null
        worktreePath: string | null
        dirtyCount: number
      }>
      applyAgentChanges?: (
        workspaceId: string,
        options?: { commit?: boolean },
      ) => Promise<{
        state: {
          enabled: boolean
          repoRoot: string | null
          worktreePath: string | null
          dirtyCount: number
        }
        applied: boolean
        committed: boolean
        message: string
      }>
      getAgentDiff?: (
        workspaceId: string,
      ) => Promise<{ diff: string | null }>
      checkHealth?: (url: string) => Promise<{
        ok: boolean
        status: number
        body?: string
        error?: string
      }>
      traceEvent?: (payload: Record<string, unknown>) => Promise<void>
      readTrace?: (limit?: number) => Promise<string[]>
      clearTrace?: () => Promise<boolean>
    }
    flow?: {
      daemonStatus?: () => Promise<{
        ok: boolean
        output: string
        daemons: Array<{ name: string; status: "running" | "stopped"; pid?: number }>
      }>
      daemonStatusAt?: (cwd?: string) => Promise<{
        ok: boolean
        output: string
        daemons: Array<{ name: string; status: "running" | "stopped"; pid?: number }>
      }>
      daemonStart?: (name: string, cwd?: string) => Promise<{ ok: boolean; output: string }>
      daemonStop?: (name: string, cwd?: string) => Promise<{ ok: boolean; output: string }>
    }
    beads?: {
      run?: (
        args: string[],
      ) => Promise<{ ok: boolean; stdout: string; stderr: string; code: number }>
    }
  }
}

interface HTMLWebViewElement extends HTMLElement {
  src?: string
  reload?: () => void
  goBack?: () => void
  goForward?: () => void
  getURL?: () => string
}

declare namespace JSX {
  interface IntrinsicElements {
    webview: any
  }
}

declare module "*.sql?raw" {
  const content: string
  export default content
}
