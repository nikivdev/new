import { createFileRoute } from "@tanstack/react-router"
import { withJazzServerAccount } from "@/lib/jazz/server-store"
import {
  ZergMessage,
  ZergMessageList,
  ZergCommitSummary,
  ZergCommitSummaryList,
  ZergRun,
  ZergRunEvent,
  ZergRunEventList,
  ZergRunList,
  ZergState,
  ZergWorkload,
  ZergWorkloadList,
} from "@/lib/jazz/schema"

type ZergSyncEvent = {
  type: string
  payload: any
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })

const getZergSyncToken = (): string | undefined => {
  try {
    const { getServerContext } = require("@tanstack/react-start/server") as {
      getServerContext: () => { cloudflare?: { env?: { ZERG_SYNC_TOKEN?: string } } } | null
    }
    const ctx = getServerContext()
    return ctx?.cloudflare?.env?.ZERG_SYNC_TOKEN
  } catch {
    return process.env.ZERG_SYNC_TOKEN
  }
}

const ensureZergState = (account: any) => {
  if (!account.root?.zerg) {
    account.root.$jazz.set(
      "zerg",
      ZergState.create({
        messages: ZergMessageList.create([]),
        workloads: ZergWorkloadList.create([]),
        runs: ZergRunList.create([]),
        commitSummaries: ZergCommitSummaryList.create([]),
        updatedAt: Date.now(),
      })
    )
  }
  if (!account.root?.zerg?.commitSummaries) {
    account.root.zerg.$jazz.set(
      "commitSummaries",
      ZergCommitSummaryList.create([])
    )
  }
  return account.root.zerg
}

const upsertById = <T extends { id: string }>(
  list: any,
  id: string,
  create: () => T,
  update: (item: any) => void
) => {
  const existing = list.find((item: any) => item?.id === id)
  if (existing) {
    update(existing)
    return existing
  }

  const next = create()
  list.$jazz.push(next)
  return next
}

export const Route = createFileRoute("/api/external/zerg")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        })
      },

      POST: async ({ request }) => {
        const expectedToken = getZergSyncToken()
        if (expectedToken) {
          const authHeader = request.headers.get("Authorization")
          const provided =
            authHeader?.startsWith("Bearer ")
              ? authHeader.slice(7)
              : request.headers.get("x-zerg-sync-token")

          if (!provided) {
            return json({ error: "Missing Authorization header" }, 401)
          }
          if (provided !== expectedToken) {
            return json({ error: "Invalid sync token" }, 401)
          }
        }

        let body: ZergSyncEvent
        try {
          body = await request.json()
        } catch {
          return json({ error: "Invalid JSON body" }, 400)
        }

        if (!body?.type || typeof body.type !== "string") {
          return json({ error: "type is required" }, 400)
        }

        try {
          const result = await withJazzServerAccount(async (account) => {
            const zerg = ensureZergState(account)
            const now = Date.now()

            switch (body.type) {
              case "message.created": {
                const payload = body.payload ?? {}
                if (!payload.id || !payload.clientId || !payload.body) {
                  throw new Error("Invalid message payload")
                }
                upsertById(
                  zerg.messages,
                  payload.id,
                  () =>
                    ZergMessage.create(
                      {
                        id: payload.id,
                        clientId: payload.clientId,
                        body: payload.body,
                        createdAt: payload.createdAt ?? now,
                      },
                      { owner: account }
                    ),
                  (item) => {
                    item.$jazz.set("clientId", payload.clientId)
                    item.$jazz.set("body", payload.body)
                    if (payload.createdAt) {
                      item.$jazz.set("createdAt", payload.createdAt)
                    }
                  }
                )
                break
              }
              case "workload.created": {
                const payload = body.payload ?? {}
                if (!payload.id || !payload.name) {
                  throw new Error("Invalid workload payload")
                }
                upsertById(
                  zerg.workloads,
                  payload.id,
                  () =>
                    ZergWorkload.create(
                      {
                        id: payload.id,
                        name: payload.name,
                        description: payload.description,
                        command: payload.command,
                        env: payload.env,
                        createdAt: payload.createdAt ?? now,
                      },
                      { owner: account }
                    ),
                  (item) => {
                    item.$jazz.set("name", payload.name)
                    item.$jazz.set("description", payload.description)
                    item.$jazz.set("command", payload.command)
                    item.$jazz.set("env", payload.env)
                    if (payload.createdAt) {
                      item.$jazz.set("createdAt", payload.createdAt)
                    }
                  }
                )
                break
              }
              case "run.created": {
                const payload = body.payload ?? {}
                if (!payload.id || !payload.workloadId) {
                  throw new Error("Invalid run payload")
                }
                upsertById(
                  zerg.runs,
                  payload.id,
                  () =>
                    ZergRun.create(
                      {
                        id: payload.id,
                        workloadId: payload.workloadId,
                        status: payload.status ?? "queued",
                        agentCount: payload.agentCount ?? 1,
                        traceId: payload.traceId ?? "",
                        input: payload.input,
                        createdAt: payload.createdAt ?? now,
                        updatedAt: payload.updatedAt ?? now,
                        events: ZergRunEventList.create([], { owner: account }),
                      },
                      { owner: account }
                    ),
                  (item) => {
                    item.$jazz.set("workloadId", payload.workloadId)
                    if (payload.status) item.$jazz.set("status", payload.status)
                    if (payload.agentCount !== undefined) {
                      item.$jazz.set("agentCount", payload.agentCount)
                    }
                    if (payload.traceId) item.$jazz.set("traceId", payload.traceId)
                    if (payload.input) item.$jazz.set("input", payload.input)
                    if (payload.createdAt) item.$jazz.set("createdAt", payload.createdAt)
                    if (payload.updatedAt) item.$jazz.set("updatedAt", payload.updatedAt)
                  }
                )
                break
              }
              case "run.event": {
                const payload = body.payload ?? {}
                const runPayload = payload.run ?? {}
                const eventPayload = payload.event ?? {}
                if (!runPayload.id || !runPayload.workloadId) {
                  throw new Error("Invalid run payload")
                }
                if (!eventPayload.id || !eventPayload.runId) {
                  throw new Error("Invalid event payload")
                }

                const run = upsertById(
                  zerg.runs,
                  runPayload.id,
                  () =>
                    ZergRun.create(
                      {
                        id: runPayload.id,
                        workloadId: runPayload.workloadId,
                        status: runPayload.status ?? "queued",
                        agentCount: runPayload.agentCount ?? 1,
                        traceId: runPayload.traceId ?? "",
                        input: runPayload.input,
                        createdAt: runPayload.createdAt ?? now,
                        updatedAt: runPayload.updatedAt ?? now,
                        events: ZergRunEventList.create([], { owner: account }),
                      },
                      { owner: account }
                    ),
                  (item) => {
                    item.$jazz.set("workloadId", runPayload.workloadId)
                    if (runPayload.status) item.$jazz.set("status", runPayload.status)
                    if (runPayload.agentCount !== undefined) {
                      item.$jazz.set("agentCount", runPayload.agentCount)
                    }
                    if (runPayload.traceId) item.$jazz.set("traceId", runPayload.traceId)
                    if (runPayload.input) item.$jazz.set("input", runPayload.input)
                    if (runPayload.createdAt) item.$jazz.set("createdAt", runPayload.createdAt)
                    if (runPayload.updatedAt) item.$jazz.set("updatedAt", runPayload.updatedAt)
                  }
                )

                if (!run.events) {
                  run.$jazz.set("events", ZergRunEventList.create([], { owner: account }))
                }

                upsertById(
                  run.events,
                  eventPayload.id,
                  () =>
                    ZergRunEvent.create(
                      {
                        id: eventPayload.id,
                        runId: eventPayload.runId,
                        index: eventPayload.index ?? 0,
                        agentId: eventPayload.agentId,
                        eventType: eventPayload.eventType ?? "status",
                        message: eventPayload.message,
                        metadata: eventPayload.metadata,
                        traceId: eventPayload.traceId,
                        spanId: eventPayload.spanId,
                        parentSpanId: eventPayload.parentSpanId,
                        timestamp: eventPayload.timestamp ?? now,
                      },
                      { owner: account }
                    ),
                  (item) => {
                    if (eventPayload.index !== undefined) {
                      item.$jazz.set("index", eventPayload.index)
                    }
                    if (eventPayload.agentId) item.$jazz.set("agentId", eventPayload.agentId)
                    if (eventPayload.eventType) item.$jazz.set("eventType", eventPayload.eventType)
                    if (eventPayload.message) item.$jazz.set("message", eventPayload.message)
                    if (eventPayload.metadata) item.$jazz.set("metadata", eventPayload.metadata)
                    if (eventPayload.traceId) item.$jazz.set("traceId", eventPayload.traceId)
                    if (eventPayload.spanId) item.$jazz.set("spanId", eventPayload.spanId)
                    if (eventPayload.parentSpanId) {
                      item.$jazz.set("parentSpanId", eventPayload.parentSpanId)
                    }
                    if (eventPayload.timestamp) {
                      item.$jazz.set("timestamp", eventPayload.timestamp)
                    }
                  }
                )

                if (eventPayload.eventType === "status" && eventPayload.message) {
                  run.$jazz.set("status", eventPayload.message)
                }
                if (runPayload.updatedAt) {
                  run.$jazz.set("updatedAt", runPayload.updatedAt)
                } else if (eventPayload.timestamp) {
                  run.$jazz.set("updatedAt", eventPayload.timestamp)
                }
                break
              }
              case "commit.summary": {
                const payload = body.payload ?? {}
                if (!payload.id || !payload.repo || !payload.summary) {
                  throw new Error("Invalid commit summary payload")
                }

                upsertById(
                  zerg.commitSummaries,
                  payload.id,
                  () =>
                    ZergCommitSummary.create(
                      {
                        id: payload.id,
                        repo: payload.repo,
                        title: payload.title,
                        author: payload.author,
                        authoredAt: payload.authoredAt,
                        summary: payload.summary,
                        window: payload.window,
                        runId: payload.runId,
                        createdAt: payload.createdAt ?? now,
                        updatedAt: payload.updatedAt ?? now,
                      },
                      { owner: account }
                    ),
                  (item) => {
                    item.$jazz.set("repo", payload.repo)
                    item.$jazz.set("summary", payload.summary)
                    if (payload.title) item.$jazz.set("title", payload.title)
                    if (payload.author) item.$jazz.set("author", payload.author)
                    if (payload.authoredAt) {
                      item.$jazz.set("authoredAt", payload.authoredAt)
                    }
                    if (payload.window) item.$jazz.set("window", payload.window)
                    if (payload.runId) item.$jazz.set("runId", payload.runId)
                    if (payload.createdAt) item.$jazz.set("createdAt", payload.createdAt)
                    if (payload.updatedAt) item.$jazz.set("updatedAt", payload.updatedAt)
                  }
                )
                break
              }
              default:
                throw new Error(`Unsupported event type: ${body.type}`)
            }

            zerg.$jazz.set("updatedAt", now)
            return { ok: true }
          })

          return json({ success: true, ...result })
        } catch (error) {
          console.error("[external/zerg] Error:", error)
          return json({ error: "Failed to sync zerg state" }, 500)
        }
      },
    },
  },
})
