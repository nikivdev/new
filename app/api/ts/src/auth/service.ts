"use rise"

import { Effect } from "effect"
import { Env } from "../env.js"
import * as CurrentTenant from "@app/domain/http"

const JWT_HEADER = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))

const base64url = (data: Uint8Array): string => {
  let binary = ""
  for (const byte of data) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

const signHs256 = async (
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> => {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  const data = `${JWT_HEADER}.${body}`
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data))
  return `${data}.${base64url(new Uint8Array(sig))}`
}

const verifyHs256 = async (
  token: string,
  secret: string,
): Promise<Record<string, unknown>> => {
  const parts = token.split(".")
  if (parts.length !== 3) throw new Error("Invalid JWT format")
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  )
  const data = `${parts[0]}.${parts[1]}`
  const sigBytes = Uint8Array.from(
    atob(parts[2]!.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  )
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    enc.encode(data),
  )
  if (!valid) throw new Error("Invalid JWT signature")
  const payload = JSON.parse(
    atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")),
  )
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw new Error("JWT expired")
  }
  return payload
}

const getBearerToken = (
  headers: Record<string, string | undefined>,
): string | undefined => {
  const auth = headers.authorization ?? headers.Authorization
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim()
  }
  return undefined
}

export class AuthService extends Effect.Service<AuthService>()(
  "rise/AuthService",
  {
    accessors: true,
    dependencies: [Env.Default],
    effect: Effect.gen(function* () {
      const env = yield* Env

      const login = Effect.fn("AuthService.login")(
        (password: string): Effect.Effect<string, CurrentTenant.LoginError> =>
          Effect.gen(function* () {
            if (password !== env.ROOT_PASSWORD) {
              return yield* Effect.fail(
                new CurrentTenant.LoginError({
                  message: "Invalid password",
                }),
              )
            }

            const token = yield* Effect.tryPromise({
              try: () =>
                signHs256(
                  {
                    sub: "root",
                    iat: Math.floor(Date.now() / 1000),
                    exp: Math.floor(Date.now() / 1000) + 86400,
                  },
                  env.ROOT_PASSWORD,
                ),
              catch: () =>
                new CurrentTenant.LoginError({
                  message: "Token generation failed",
                }),
            })

            return token
          }),
      )

      const resolveTenant = Effect.fn("AuthService.resolveTenant")(
        (
          headers: Record<string, string | undefined>,
        ): Effect.Effect<
          CurrentTenant.TenantSchema,
          CurrentTenant.UnauthorizedError
        > =>
          Effect.gen(function* () {
            const token = getBearerToken(headers)
            if (!token) {
              return yield* Effect.fail(
                new CurrentTenant.UnauthorizedError({
                  message: "Missing bearer token",
                }),
              )
            }

            const payload = yield* Effect.tryPromise({
              try: () => verifyHs256(token, env.ROOT_PASSWORD),
              catch: (e) =>
                new CurrentTenant.UnauthorizedError({
                  message: `Invalid token: ${e instanceof Error ? e.message : String(e)}`,
                }),
            })

            return new CurrentTenant.TenantSchema({
              userId: (payload.sub as string) ?? "root",
              authMode: "self_hosted",
            })
          }),
      )

      return { login, resolveTenant } as const
    }),
  },
) {}
