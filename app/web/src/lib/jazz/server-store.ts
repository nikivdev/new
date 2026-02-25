import type { JazzAuth } from "./server-auth"
import { GenAccount, ServerAccount } from "./schema"
import { disableWasmCryptoInDev, isProdRuntime } from "./crypto"

type JazzServerEnv = {
  JAZZ_SYNC_SERVER?: string
  JAZZ_WORKER_ACCOUNT?: string
  JAZZ_WORKER_SECRET?: string
  JAZZ_API_KEY?: string
}

const DEFAULT_JAZZ_API_KEY = "starter@local"
const DEFAULT_JAZZ_SYNC_SERVER = "wss://cloud.jazz.tools"

let wasmInitPromise: Promise<void> | null = null

disableWasmCryptoInDev()

const getJazzServerEnv = (): JazzServerEnv => {
  let env: Record<string, string> = {}

  try {
    const { getServerContext } = require("@tanstack/react-start/server") as {
      getServerContext: () => { cloudflare?: { env?: Record<string, string> } } | null
    }
    const ctx = getServerContext()
    env = ctx?.cloudflare?.env ?? {}
  } catch {
    // Not in server context.
  }

  return {
    JAZZ_SYNC_SERVER: env.JAZZ_SYNC_SERVER ?? process.env.JAZZ_SYNC_SERVER,
    JAZZ_WORKER_ACCOUNT: env.JAZZ_WORKER_ACCOUNT ?? process.env.JAZZ_WORKER_ACCOUNT,
    JAZZ_WORKER_SECRET: env.JAZZ_WORKER_SECRET ?? process.env.JAZZ_WORKER_SECRET,
    JAZZ_API_KEY: env.JAZZ_API_KEY ?? process.env.JAZZ_API_KEY ?? DEFAULT_JAZZ_API_KEY,
  }
}

const buildSyncServer = (env: JazzServerEnv) => {
  if (env.JAZZ_SYNC_SERVER) return env.JAZZ_SYNC_SERVER
  const normalized = DEFAULT_JAZZ_SYNC_SERVER.replace(/\/$/, "")
  return `${normalized}/?key=${env.JAZZ_API_KEY ?? DEFAULT_JAZZ_API_KEY}`
}

const ensureWasmCrypto = async () => {
  if (!isProdRuntime()) {
    return Promise.resolve()
  }
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      try {
        const { WasmCrypto } = await import("cojson/crypto/WasmCrypto")
        await WasmCrypto.create()
      } catch (error) {
        console.warn("[jazz] wasm crypto init failed, falling back", error)
      }
    })()
  }
  return wasmInitPromise
}

export const withJazzUser = async <T>(
  auth: JazzAuth,
  fn: (account: any) => Promise<T>,
) => {
  await ensureWasmCrypto()
  const { startWorker } = await import("jazz-tools/worker")
  const env = getJazzServerEnv()

  const { worker, waitForConnection, shutdownWorker } = await startWorker({
    accountID: auth.accountId,
    accountSecret: auth.accountSecret,
    syncServer: buildSyncServer(env),
    AccountSchema: GenAccount,
    WebSocket: typeof WebSocket === "undefined" ? undefined : WebSocket,
    skipInboxLoad: true,
    asActiveAccount: false,
  })

  await waitForConnection()
  const account = await worker.$jazz.ensureLoaded({
    resolve: {
      profile: true,
      root: {
        chatThreads: { $each: { messages: true, contextItemIds: true, blockIds: true } },
        contextItems: true,
        blocks: { $each: { pages: true } },
        canvases: { $each: { images: true } },
      },
    },
  })

  try {
    return await fn(account)
  } finally {
    await shutdownWorker()
  }
}

export const withJazzServerAccount = async <T>(
  fn: (account: any) => Promise<T>,
) => {
  const env = getJazzServerEnv()
  if (!env.JAZZ_WORKER_ACCOUNT || !env.JAZZ_WORKER_SECRET) {
    throw new Error("Missing JAZZ_WORKER_ACCOUNT or JAZZ_WORKER_SECRET")
  }

  await ensureWasmCrypto()
  const { startWorker } = await import("jazz-tools/worker")

  const { worker, waitForConnection, shutdownWorker } = await startWorker({
    accountID: env.JAZZ_WORKER_ACCOUNT,
    accountSecret: env.JAZZ_WORKER_SECRET,
    syncServer: buildSyncServer(env),
    AccountSchema: ServerAccount,
    WebSocket: typeof WebSocket === "undefined" ? undefined : WebSocket,
    skipInboxLoad: true,
    asActiveAccount: false,
  })

  await waitForConnection()
  const account = await worker.$jazz.ensureLoaded({
    resolve: {
      root: {
        users: true,
        billingUsers: { $each: { usageRecords: true } },
        zerg: {
          messages: true,
          workloads: true,
          runs: { $each: { events: true } },
          commitSummaries: true,
        },
      },
    },
  })

  try {
    return await fn(account)
  } finally {
    await shutdownWorker()
  }
}
