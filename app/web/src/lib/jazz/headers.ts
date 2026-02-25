const AUTH_STORAGE_KEYS = ["jazz-logged-in-secret", "starter-jazz"] as const

type StoredAuth = {
  accountID?: string
  accountId?: string
  accountSecret?: string
  secret?: string
  provider?: string
}

const parseStoredAuth = (raw: string) => {
  const parsed = JSON.parse(raw) as StoredAuth
  const accountId = parsed.accountID ?? parsed.accountId
  const accountSecret = parsed.accountSecret ?? parsed.secret
  if (!accountId || !accountSecret) return null
  return { accountId, accountSecret }
}

export const getStoredJazzAuth = () => {
  if (typeof window === "undefined") return null
  for (const key of AUTH_STORAGE_KEYS) {
    const raw = window.localStorage.getItem(key)
    if (!raw) continue
    try {
      const auth = parseStoredAuth(raw)
      if (auth) return auth
    } catch {
      // Ignore malformed storage entries.
    }
  }
  return null
}

export const withJazzAuthHeaders = (headers: HeadersInit = {}) => {
  const auth = getStoredJazzAuth()
  if (!auth) return headers
  return {
    ...headers,
    "x-jazz-account-id": auth.accountId,
    "x-jazz-account-secret": auth.accountSecret,
  }
}
