import { betterAuth } from "better-auth"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { emailOTP } from "better-auth/plugins"
import { Resend } from "resend"
import { jazzPlugin } from "jazz-tools/better-auth/auth/server"
import { JazzBetterAuthDatabaseAdapter } from "jazz-tools/better-auth/database-adapter"
import { disableWasmCryptoInDev } from "@/lib/jazz/crypto"

disableWasmCryptoInDev()

type AuthEnv = {
  BETTER_AUTH_SECRET: string
  APP_BASE_URL?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  JAZZ_WORKER_ACCOUNT?: string
  JAZZ_WORKER_SECRET?: string
  JAZZ_SYNC_SERVER?: string
  JAZZ_API_KEY?: string
}

type AuthFallbackCode = "AUTH_MISSING_SECRET" | "AUTH_JAZZ_UNAVAILABLE"
const DEFAULT_JAZZ_API_KEY = "starter@local"
const DEFAULT_JAZZ_SYNC_SERVER = "wss://cloud.jazz.tools"

const createFallbackAuth = (code: AuthFallbackCode): ReturnType<typeof betterAuth> => {
  const makeFallbackResponse = () => {
    const requestId = crypto.randomUUID()
    return new Response(
      JSON.stringify({ error: "Auth unavailable", code, requestId }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "X-App-Auth-Fallback": code,
          "X-App-Request-Id": requestId,
        },
      }
    )
  }

  const handler = async () => makeFallbackResponse()

  const api = {
    getSession: async () => null,
    signOut: async () => makeFallbackResponse(),
    signIn: async () => makeFallbackResponse(),
    revokeSession: async () => makeFallbackResponse(),
  } as ReturnType<typeof betterAuth>["api"]

  return {
    api,
    handler,
  } as ReturnType<typeof betterAuth>
}

const buildSyncServer = (env: AuthEnv) => {
  if (env.JAZZ_SYNC_SERVER) {
    return env.JAZZ_SYNC_SERVER
  }
  const apiKey = env.JAZZ_API_KEY ?? DEFAULT_JAZZ_API_KEY
  const normalized = DEFAULT_JAZZ_SYNC_SERVER.replace(/\/$/, "")
  return `${normalized}/?key=${apiKey}`
}

// Helper to get Cloudflare env from server context
const getCloudflareEnv = (): Partial<AuthEnv> | undefined => {
  try {
    const { getServerContext } = require("@tanstack/react-start/server") as {
      getServerContext: () => { cloudflare?: { env?: Partial<AuthEnv> } } | null
    }
    return getServerContext()?.cloudflare?.env
  } catch {
    return undefined
  }
}

// Get env from Cloudflare context or process.env
const getEnv = (): AuthEnv | null => {
  let BETTER_AUTH_SECRET: string | undefined
  let APP_BASE_URL: string | undefined
  let RESEND_API_KEY: string | undefined
  let RESEND_FROM_EMAIL: string | undefined
  let JAZZ_WORKER_ACCOUNT: string | undefined
  let JAZZ_WORKER_SECRET: string | undefined
  let JAZZ_SYNC_SERVER: string | undefined
  let JAZZ_API_KEY: string | undefined

  // Try Cloudflare Workers context first (production)
  const cfEnv = getCloudflareEnv()
  if (cfEnv) {
    BETTER_AUTH_SECRET = cfEnv.BETTER_AUTH_SECRET
    APP_BASE_URL = cfEnv.APP_BASE_URL
    RESEND_API_KEY = cfEnv.RESEND_API_KEY
    RESEND_FROM_EMAIL = cfEnv.RESEND_FROM_EMAIL
    JAZZ_WORKER_ACCOUNT = cfEnv.JAZZ_WORKER_ACCOUNT
    JAZZ_WORKER_SECRET = cfEnv.JAZZ_WORKER_SECRET
    JAZZ_SYNC_SERVER = cfEnv.JAZZ_SYNC_SERVER
    JAZZ_API_KEY = cfEnv.JAZZ_API_KEY
  }

  // Fall back to process.env (local dev)
  BETTER_AUTH_SECRET = BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET
  APP_BASE_URL = APP_BASE_URL ?? process.env.APP_BASE_URL
  RESEND_API_KEY = RESEND_API_KEY ?? process.env.RESEND_API_KEY
  RESEND_FROM_EMAIL = RESEND_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL
  JAZZ_WORKER_ACCOUNT =
    JAZZ_WORKER_ACCOUNT ?? process.env.JAZZ_WORKER_ACCOUNT
  JAZZ_WORKER_SECRET =
    JAZZ_WORKER_SECRET ?? process.env.JAZZ_WORKER_SECRET
  JAZZ_SYNC_SERVER = JAZZ_SYNC_SERVER ?? process.env.JAZZ_SYNC_SERVER
  JAZZ_API_KEY = JAZZ_API_KEY ?? process.env.JAZZ_API_KEY

  if (!BETTER_AUTH_SECRET) {
    return null
  }

  return {
    BETTER_AUTH_SECRET,
    APP_BASE_URL,
    RESEND_API_KEY,
    RESEND_FROM_EMAIL,
    JAZZ_WORKER_ACCOUNT,
    JAZZ_WORKER_SECRET,
    JAZZ_SYNC_SERVER,
    JAZZ_API_KEY,
  }
}

export const getAuth = () => {
  // Note: We create a fresh auth instance per request because Cloudflare Workers
  // doesn't allow sharing I/O objects (like DB connections) across requests
  const env = getEnv()
  if (!env) {
    console.warn("[auth] BETTER_AUTH_SECRET not configured; returning fallback auth")
    return createFallbackAuth("AUTH_MISSING_SECRET")
  }

  if (!env.JAZZ_WORKER_ACCOUNT || !env.JAZZ_WORKER_SECRET) {
    console.warn(
      "[auth] Jazz auth worker credentials missing; returning fallback auth"
    )
    return createFallbackAuth("AUTH_JAZZ_UNAVAILABLE")
  }

  // Detect production: if APP_BASE_URL is set and not localhost, we're in production
  const isProduction =
    env.APP_BASE_URL && !env.APP_BASE_URL.includes("localhost")
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null
  const fromEmail = env.RESEND_FROM_EMAIL ?? "auth@example.com"
  const trustedOrigins = [
    env.APP_BASE_URL ?? "http://localhost:5001",
    ...(!isProduction
      ? [
          "http://dev.localhost",
          "http://gen.localhost",
          "http://localhost:5001",
          "http://localhost:5000",
        ]
      : []),
  ].filter((value, index, all) => all.indexOf(value) === index)

  return betterAuth({
    database: JazzBetterAuthDatabaseAdapter({
      syncServer: buildSyncServer(env),
      accountID: env.JAZZ_WORKER_ACCOUNT,
      accountSecret: env.JAZZ_WORKER_SECRET,
    }),
    trustedOrigins,
    plugins: [
      tanstackStartCookies(),
      jazzPlugin(),
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          if (!isProduction || !resend) {
            // In dev mode or if Resend not configured, log OTP to terminal
            console.log(`[auth:otp] Dev mode - OTP for ${email}: ${otp}`)
            return
          }

          // Send email via Resend in production
          const { error } = await resend.emails.send({
            from: `Starter App <${fromEmail}>`,
            to: email,
            subject: "Your Starter App verification code",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px; background-color: #050505; color: #ffffff;">
                <h2 style="color: #ffffff; margin-bottom: 16px; font-weight: 600;">Your verification code</h2>
                <p style="color: #a1a1aa; margin-bottom: 24px;">Enter this code to sign in to Starter App:</p>
                <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 24px; text-align: center;">
                  <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #ffffff; font-family: monospace;">${otp}</span>
                </div>
                <p style="color: #71717a; font-size: 14px; margin-top: 24px;">This code expires in 5 minutes.</p>
                <p style="color: #52525b; font-size: 12px; margin-top: 16px;">If you didn't request this code, you can safely ignore this email.</p>
              </div>
            `,
          })

          if (error) {
            console.error(`[auth:otp] Resend error:`, error.message)
            throw new Error(`Failed to send verification email: ${error.message}`)
          }
        },
        otpLength: 6,
        expiresIn: 300, // 5 minutes
      }),
    ],
  })
}

// Lazy proxy that calls getAuth() on each access
export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
  get(_target, prop) {
    return getAuth()[prop as keyof ReturnType<typeof betterAuth>]
  },
})
