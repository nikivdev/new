"use rise"

import { HttpApi, OpenApi } from "@effect/platform"
import { AuthApiGroup, AuthPublicApiGroup } from "./auth.js"
import { ChatApiGroup, GuestChatApiGroup } from "./chat.js"
import { CanvasApiGroup } from "./canvas.js"
import { BillingApiGroup } from "./billing.js"

export class RiseApi extends HttpApi.make("RiseApi")
  .add(AuthPublicApiGroup)
  .add(AuthApiGroup)
  .add(ChatApiGroup)
  .add(GuestChatApiGroup)
  .add(CanvasApiGroup)
  .add(BillingApiGroup)
  .annotateContext(
    OpenApi.annotations({
      title: "Rise API",
      version: "1.0.0",
      description: "Effect-based backend API.",
    }),
  ) {}
