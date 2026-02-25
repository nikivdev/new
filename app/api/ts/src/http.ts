"use rise"

import { Layer } from "effect"
import { HttpApiBuilder } from "@effect/platform"
import { RiseApi } from "@app/domain/http"
import { HttpAuthPublicLive, HttpAuthLive } from "./auth/endpoints.js"
import { HttpChatLive, HttpGuestChatLive } from "./chat/endpoints.js"
import { HttpBillingLive } from "./billing/endpoints.js"
import { HttpCanvasLive } from "./canvas/endpoints.js"

export const HttpApiRoutes = HttpApiBuilder.api(RiseApi).pipe(
  Layer.provideMerge(HttpAuthPublicLive),
  Layer.provideMerge(HttpAuthLive),
  Layer.provideMerge(HttpChatLive),
  Layer.provideMerge(HttpGuestChatLive),
  Layer.provideMerge(HttpBillingLive),
  Layer.provideMerge(HttpCanvasLive),
)
