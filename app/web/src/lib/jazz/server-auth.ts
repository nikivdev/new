import { getAuth } from "@/lib/auth"

const JSON_HEADERS = { "content-type": "application/json" }

export type JazzAuth = {
  accountId: string
  accountSecret: string
}

export const getJazzAccountId = (request: Request): string | null => {
  const header = request.headers.get("x-jazz-account-id")
  const accountId = typeof header === "string" ? header.trim() : ""
  return accountId || null
}

export const getJazzAuth = (request: Request): JazzAuth | null => {
  const accountId = getJazzAccountId(request)
  const secretHeader = request.headers.get("x-jazz-account-secret")
  const accountSecret = typeof secretHeader === "string" ? secretHeader.trim() : ""
  if (!accountId || !accountSecret) return null
  return { accountId, accountSecret }
}

export const requireJazzAccountId = (request: Request) => {
  const accountId = getJazzAccountId(request)
  if (!accountId) {
    return {
      accountId: null,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: JSON_HEADERS,
      }),
    }
  }

  return { accountId, response: null }
}

export const requireJazzAuth = async (request: Request) => {
  const headerAuth = getJazzAuth(request)
  if (headerAuth) {
    return { auth: headerAuth, response: null }
  }

  try {
    const auth = getAuth()
    const session = await auth.api.getSession({ headers: request.headers })
    const jazzAuth = session?.jazzAuth as
      | { accountID?: string; accountId?: string; accountSecret?: string; secret?: string }
      | undefined
    const accountId = jazzAuth?.accountID ?? jazzAuth?.accountId
    const accountSecret = jazzAuth?.accountSecret ?? jazzAuth?.secret
    if (accountId && accountSecret) {
      return { auth: { accountId, accountSecret }, response: null }
    }
  } catch {
    // Ignore session errors and fall back to unauthorized response.
  }

  return {
    auth: null,
    response: new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    }),
  }
}
