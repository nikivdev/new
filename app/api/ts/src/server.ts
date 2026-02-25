"use rise"

import { Config, Layer } from "effect"
import { HttpApiBuilder } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { createServer } from "node:http"
import { HttpApiRoutes } from "./http.js"
import { Env } from "./env.js"
import { AuthService } from "./auth/service.js"
import { AuthorizationLive } from "./auth/middleware.js"
import { Trace } from "./trace/Trace.js"
import { AiService } from "./ai/service.js"
import { BillingService } from "./billing/service.js"
import { BillingRepository } from "./billing/repository.js"
import { ChatService } from "./chat/service.js"
import { ChatRepository } from "./chat/repository.js"
import { CanvasService } from "./canvas/service.js"
import { CanvasRepository } from "./canvas/repository.js"
import { DatabaseLive } from "./database/live.js"

const EnvLive = Env.Default

const DbLayer = DatabaseLive.pipe(Layer.provide(EnvLive))

const RepositoriesLive = Layer.mergeAll(
  BillingRepository.Default,
  ChatRepository.Default,
  CanvasRepository.Default,
).pipe(Layer.provide(DbLayer))

const ServicesLive = Layer.mergeAll(
  AiService.Default,
  BillingService.Default,
  ChatService.Default,
  CanvasService.Default,
).pipe(Layer.provideMerge(RepositoriesLive), Layer.provide(EnvLive))

const MainLive = Layer.mergeAll(
  EnvLive,
  AuthService.Default,
  Trace.Default,
).pipe(Layer.provideMerge(ServicesLive))

const AuthLive = AuthorizationLive.pipe(
  Layer.provideMerge(AuthService.Default),
  Layer.provide(EnvLive),
)

const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(HttpApiRoutes),
  Layer.provide(MainLive),
  Layer.provide(AuthLive),
  Layer.provide(DbLayer),
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      port: Config.number("PORT").pipe(Config.withDefault(8787)),
    }),
  ),
  Layer.provide(EnvLive),
)

NodeRuntime.runMain(Layer.launch(ServerLive))
