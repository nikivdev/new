import { wrap } from "@/shared/reatom/core"
import { withJazzAuthHeaders } from "@/lib/jazz/headers"

/**
 * Typed fetch helper with Jazz auth headers and Reatom wrap.
 * Throws on non-ok responses with status and body.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : path
  const headers = withJazzAuthHeaders(init?.headers ?? {})

  const response = await wrap(fetch(url, { ...init, headers }))
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`HTTP ${response.status}: ${body}`)
  }
  return (await wrap(response.json())) as T
}

/**
 * POST JSON helper — combines apiFetch with JSON body serialization.
 */
export async function apiPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string> ?? {}) },
    body: JSON.stringify(body),
  })
}
