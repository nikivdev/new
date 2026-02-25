import { createFileRoute } from "@tanstack/react-router"
import { getAuth } from "@/lib/auth"

const handleAuthRequest = async (request: Request) => {
  const requestId = crypto.randomUUID()

  try {
    const auth = getAuth()
    const response = await auth.handler(request)
    const headers = new Headers(response.headers)
    // Use existing request ID from fallback or set our own
    const finalRequestId = headers.get("X-App-Request-Id") ?? requestId
    if (!headers.has("X-App-Request-Id")) {
      headers.set("X-App-Request-Id", finalRequestId)
    }

    const fallbackCode = headers.get("X-App-Auth-Fallback")
    if (fallbackCode) {
      console.warn("[auth] fallback response", {
        requestId: finalRequestId,
        method: request.method,
        path: new URL(request.url).pathname,
        code: fallbackCode,
      })
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  } catch (error) {
    console.error("[auth] handler error", {
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
      error,
    })

    return new Response(
      JSON.stringify({ error: "Auth handler failed", requestId }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "X-App-Request-Id": requestId,
        },
      }
    )
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => handleAuthRequest(request),
      POST: async ({ request }) => handleAuthRequest(request),
    },
  },
})
