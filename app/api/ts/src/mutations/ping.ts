"use rise"

import { Effect } from "effect"
import { Trace } from "../trace/Trace.js"

export const pingMutation = () =>
  Effect.gen(function* () {
    const trace = yield* Trace
    yield* trace.mutation("ping", { source: "api" }, Effect.void)
  })
