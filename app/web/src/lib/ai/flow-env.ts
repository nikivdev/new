const cache = new Map<string, string | null>()
const FALLBACK_FLOW_BIN = "/Users/nikiv/code/flow"
const FALLBACK_FLOW_BIN_ALT = "/Users/nikiv/bin/f"

const shouldDebug = () => {
  if (typeof process === "undefined") return false
  const flag = (process.env.DEBUG ?? "").toLowerCase()
  return (
    flag === "1" ||
    flag === "true" ||
    flag === "yes" ||
    process.env.FLOW_ENV_DEBUG === "1"
  )
}

const debugLog = (...args: unknown[]) => {
  if (!shouldDebug()) return
  console.debug("[flow-env]", ...args)
}

type NodeFsModule = typeof import("node:fs")
type NodePathModule = typeof import("node:path")
type NodeOsModule = typeof import("node:os")

type NodeDeps = {
  fs: NodeFsModule
  path: NodePathModule
  os: NodeOsModule
}

let nodeDepsPromise: Promise<NodeDeps | null> | null = null

const isCloudflareRuntime = () => {
  const scope = globalThis as { WebSocketPair?: unknown; navigator?: { userAgent?: string } }
  if (typeof scope.WebSocketPair !== "undefined") return true
  const userAgent = scope.navigator?.userAgent ?? ""
  return userAgent.includes("Cloudflare-Workers")
}

const isNodeRuntime = () =>
  typeof process !== "undefined" && Boolean(process.versions?.node)

const loadNodeDeps = async (): Promise<NodeDeps | null> => {
  if (!isNodeRuntime() || isCloudflareRuntime()) return null
  if (nodeDepsPromise) return nodeDepsPromise
  nodeDepsPromise = (async () => {
    try {
      const [fs, path, os] = await Promise.all([
        import("node:fs"),
        import("node:path"),
        import("node:os"),
      ])
      return { fs, path, os }
    } catch {
      return null
    }
  })()
  return nodeDepsPromise
}

const isExecutableFile = (candidate: string, fs: NodeFsModule) => {
  try {
    const stat = fs.statSync(candidate)
    return stat.isFile() || stat.isSymbolicLink()
  } catch {
    return false
  }
}

const resolveFlowBin = (fs: NodeFsModule) => {
  if (
    typeof process !== "undefined" &&
    process.env.FLOW_BIN &&
    isExecutableFile(process.env.FLOW_BIN, fs)
  ) {
    return process.env.FLOW_BIN
  }
  if (isExecutableFile(FALLBACK_FLOW_BIN, fs)) {
    return FALLBACK_FLOW_BIN
  }
  if (isExecutableFile(FALLBACK_FLOW_BIN_ALT, fs)) {
    return FALLBACK_FLOW_BIN_ALT
  }
  return "f"
}

const parseEnvValue = (contents: string, key: string) => {
  for (const line of contents.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const [name, value = ""] = trimmed.split("=", 2)
    if (name?.trim() === key) {
      let cleaned = value.trim()
      if (
        (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))
      ) {
        cleaned = cleaned.slice(1, -1)
      }
      return cleaned
    }
  }
  return null
}

const readLocalFlowEnv = async (key: string) => {
  const deps = await loadNodeDeps()
  if (!deps) return null
  const { fs, os, path } = deps

  const roots = new Set<string>()
  const home = os.homedir()
  if (home) {
    roots.add(path.join(home, ".config", "flow", "env-local"))
  }
  const xdg = typeof process === "undefined" ? undefined : process.env.XDG_CONFIG_HOME
  if (xdg) {
    roots.add(path.join(xdg, "flow", "env-local"))
  }

  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    debugLog("checking local env root", root)
    try {
      const folders = fs.readdirSync(root, { withFileTypes: true })
      for (const entry of folders) {
        if (!entry.isDirectory()) continue
        const candidate = path.join(root, entry.name, "production.env")
        if (!fs.existsSync(candidate)) continue
        debugLog("checking local env file", candidate)
        try {
          const contents = fs.readFileSync(candidate, "utf8")
          const value = parseEnvValue(contents, key)
          if (value) {
            debugLog("local env hit", { key, source: candidate })
            return value
          }
        } catch {
          // ignore per-file errors
        }
      }
    } catch {
      // ignore unreadable roots
    }
  }

  return null
}

type FlowEnvResult = { value: string | null; source: "local" | "flow" | "none" }

export async function getFlowPersonalEnvInfo(
  key: string,
): Promise<FlowEnvResult> {
  if (cache.has(key)) {
    const cached = cache.get(key) ?? null
    return {
      value: cached,
      source: cached ? "local" : "none",
    }
  }
  if (
    typeof process === "undefined" ||
    process.env.NODE_ENV === "production" ||
    isCloudflareRuntime()
  ) {
    cache.set(key, null)
    return { value: null, source: "none" }
  }
  const preferLocal = (process.env.FLOW_ENV_BACKEND ?? "").toLowerCase() === "local"
  if (preferLocal) {
    const localValue = await readLocalFlowEnv(key)
    if (localValue) {
      cache.set(key, localValue)
      debugLog("returning local env", { key, length: localValue.length })
      return { value: localValue, source: "local" }
    }
  }
  try {
    const { execFileSync } = await import("node:child_process")
    const deps = await loadNodeDeps()
    if (!deps) {
      cache.set(key, null)
      return { value: null, source: "none" }
    }
    const flowBin = resolveFlowBin(deps.fs)
    debugLog("executing flow env get", {
      key,
      flowBin,
      backend: process.env.FLOW_ENV_BACKEND ?? "local",
    })
    const value = execFileSync(
      flowBin,
      ["env", "get", "--personal", key, "-f", "value"],
      {
        env: {
          ...process.env,
          FLOW_ENV_BACKEND: process.env.FLOW_ENV_BACKEND ?? "local",
        },
        stdio: ["ignore", "pipe", "ignore"],
      },
    )
      .toString()
      .trim()
    let resolved = value.length ? value : null
    if (
      resolved &&
      ((resolved.startsWith('"') && resolved.endsWith('"')) ||
        (resolved.startsWith("'") && resolved.endsWith("'")))
    ) {
      resolved = resolved.slice(1, -1)
    }
    if (resolved) {
      cache.set(key, resolved)
      debugLog("flow env hit", { key, length: resolved.length })
      return { value: resolved, source: "flow" }
    }
    const localValue = await readLocalFlowEnv(key)
    cache.set(key, localValue)
    debugLog("flow env empty, local fallback", {
      key,
      found: Boolean(localValue),
    })
    return { value: localValue, source: localValue ? "local" : "none" }
  } catch (error) {
    debugLog("flow env get failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    })
    const localValue = await readLocalFlowEnv(key)
    cache.set(key, localValue)
    debugLog("flow error, local fallback", {
      key,
      found: Boolean(localValue),
    })
    return { value: localValue, source: localValue ? "local" : "none" }
  }
}

export async function getFlowPersonalEnv(key: string): Promise<string | null> {
  if (cache.has(key)) {
    return cache.get(key) ?? null
  }
  if (typeof process === "undefined" || process.env.NODE_ENV === "production") {
    cache.set(key, null)
    return null
  }
  const info = await getFlowPersonalEnvInfo(key)
  cache.set(key, info.value)
  return info.value
}
