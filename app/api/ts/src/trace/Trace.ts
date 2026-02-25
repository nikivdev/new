"use rise"

import { Config, ConfigProvider, Effect } from "effect"
import { appendFile, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { homedir } from "node:os"

export type TraceEvent = {
  type: string
  name?: string
  payload?: unknown
  ok?: boolean
  error?: string
  at?: number
  source?: string
}

const defaultTracePath = () =>
  join(homedir(), "code/org/1f/jazz/assistant-traces/linsa.jsonl")

export class Trace extends Effect.Service<Trace>()("linsa/Trace", {
  accessors: true,
  effect: Effect.gen(function* () {
    const provider = ConfigProvider.fromEnv()
    const config = yield* provider.load(
      Config.all({
        tracePath: Config.string("LINSA_TRACE_FILE").pipe(
          Config.withDefault(defaultTracePath()),
        ),
        traceEndpoint: Config.string("LINSA_TRACE_ENDPOINT").pipe(
          Config.withDefault("http://127.0.0.1:7331/v1/trace"),
        ),
        traceSource: Config.string("LINSA_TRACE_SOURCE").pipe(
          Config.withDefault("rise-api-ts"),
        ),
      }),
    )

    const write = (event: TraceEvent) =>
      Effect.gen(function* () {
        const payload = {
          ...event,
          source: event.source ?? config.traceSource,
          at: event.at ?? Date.now(),
        }
        const send = Effect.tryPromise({
          try: async () => {
            await fetch(config.traceEndpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            })
          },
          catch: () => undefined,
        }).pipe(Effect.catchAll(() => Effect.void))

        const persist = Effect.tryPromise({
          try: async () => {
            await mkdir(dirname(config.tracePath), { recursive: true })
            const line = JSON.stringify(payload)
            await appendFile(config.tracePath, `${line}\n`, "utf8")
          },
          catch: () => undefined,
        }).pipe(Effect.catchAll(() => Effect.void))

        yield* send
        yield* persist
      })

    const mutation = <A, E, R>(
      name: string,
      payload: unknown,
      effect: Effect.Effect<A, E, R>,
    ) =>
      Effect.gen(function* () {
        yield* write({ type: "mutation.start", name, payload })
        const result = yield* effect.pipe(
          Effect.tap(() => write({ type: "mutation.ok", name })),
          Effect.tapError((error) =>
            write({
              type: "mutation.error",
              name,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        )
        return result
      })

    return { write, mutation } as const
  }),
}) {}
