import { createFileRoute } from "@tanstack/react-router"
import { getFlowPersonalEnv, getFlowPersonalEnvInfo } from "@/lib/ai/flow-env"

export const Route = createFileRoute("/api/debug/env")({
  server: {
    handlers: {
      GET: async () => {
        let apiKey =
          process.env.AI_CEREBRAS_API_KEY ?? process.env.CEREBRAS_API_KEY
        let source: "env" | "flow" | "local" | "none" = apiKey ? "env" : "none"
        if (!apiKey) {
          const info = await getFlowPersonalEnvInfo("CEREBRAS_API_KEY")
          apiKey = info.value ?? undefined
          if (info.source === "flow" || info.source === "local") {
            source = info.source
          }
        }
        let model =
          process.env.CEREBRAS_MODEL ??
          process.env.AI_MODEL ??
          "zai-glm-4.7"
        if (!process.env.CEREBRAS_MODEL && !process.env.AI_MODEL) {
          const flowModel = await getFlowPersonalEnv("CEREBRAS_MODEL")
          if (flowModel) model = flowModel
        }
        const payload = {
          cerebras: {
            enabled: Boolean(apiKey),
            model,
            source,
            keyLen: apiKey?.length ?? 0,
          },
        }
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      },
    },
  },
})
