import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        // Simple health check - just confirms the worker is running
        return new Response(JSON.stringify({ ok: true, timestamp: Date.now() }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-cache"
          },
        })
      },
    },
  },
})
